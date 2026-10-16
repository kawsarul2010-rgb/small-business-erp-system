using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Billing;

/// <summary>One pack of SMS on the Billing page. Left: what can still be sent from it (0 once expired).</summary>
public sealed record SmsPackDto(Guid Uuid, SmsCreditSource Source, int Quantity, int Used, int Left, DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedDate, bool Expired, string? Note);

/// <summary>
/// A business's SMS balance. Required: SMS must be bought before they are sent (the super admin's
/// switch). Exempt: this business is never charged ("Never billed"). NextExpiry / NextExpiryCount:
/// when the pack used next runs out and how many SMS it still has. UnitPrice: what this business
/// pays per SMS (its special price, else the standard price). CanBuy: SMS can be bought online now.
/// </summary>
public sealed record SmsBalanceDto(bool Required, bool Exempt, int Available, DateTimeOffset? NextExpiry, int NextExpiryCount,
    decimal UnitPrice, decimal StandardPrice, bool SpecialPrice, int MinPurchase, int ValidityMonths, bool CanBuy,
    IReadOnlyList<SmsPackDto> Packs);

/// <summary>
/// Prepaid SMS. Settings and the business's "never billed" flag are read on the owner connection
/// (a business cannot read the billing settings); packs are read and used on whichever context the
/// caller works in, inside the caller's transaction, so an SMS and the balance it uses are saved
/// together or not at all.
/// </summary>
public sealed class SmsCreditService(ISystemDbFactory systemDb, BillingSettingsCache settingsCache, ISecretProtector protector, TimeProvider clock)
{
    public const string NoBalanceMessage = "No SMS left. Buy SMS on the Billing page to keep sending.";
    public const string NotEnoughToRetry = "Not enough SMS left to send this message. Buy SMS on the Billing page.";

    /// <summary>Whether this business's SMS come out of its balance: prepaid SMS is on and it is not "never billed".</summary>
    public async Task<bool> ChargesAsync(Guid tenantId, CancellationToken ct)
    {
        var sys = systemDb.Create();
        var s = await settingsCache.GetAsync(sys, ct);
        if (!s.SmsCreditRequired) return false;
        var exempt = await sys.Tenants.AsNoTracking().Where(t => t.Uuid == tenantId).Select(t => t.BillingExempt).FirstOrDefaultAsync(ct);
        return !exempt;
    }

    /// <summary>The reason an order's SMS will not go out for lack of balance, or null.</summary>
    public async Task<string?> ShortageReasonAsync(IAppDbContext db, Guid tenantId, CancellationToken ct)
    {
        if (!await ChargesAsync(tenantId, ct)) return null;
        var now = clock.GetUtcNow();
        var left = await db.SmsCredits.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantUuid == tenantId && c.ExpiresAt > now)
            .SumAsync(c => c.Quantity - c.UsedQuantity, ct);
        return left > 0 ? null : NoBalanceMessage;
    }

    /// <summary>The balance and every pack (newest first), read on <paramref name="db"/>.</summary>
    public async Task<SmsBalanceDto> BalanceAsync(IAppDbContext db, Guid tenantId, CancellationToken ct)
    {
        var sys = systemDb.Create();
        var s = await settingsCache.GetAsync(sys, ct);
        var t = await sys.Tenants.AsNoTracking().Where(x => x.Uuid == tenantId)
            .Select(x => new { x.BillingExempt, x.SmsPrice }).FirstAsync(ct);
        var now = clock.GetUtcNow();
        var packs = await db.SmsCredits.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantUuid == tenantId)
            .OrderByDescending(c => c.CreatedDate)
            .ToListAsync(ct);

        var lots = packs.Select(ToLot).ToList();
        var next = lots.Where(l => l.IsLive(now) && l.Left > 0).OrderBy(l => l.ExpiresAt).FirstOrDefault();
        var price = t.SmsPrice ?? s.SmsUnitPrice;
        var canBuy = s.SmsCreditRequired && !t.BillingExempt && BillingMapping.Bkash(s, protector) is not null;
        return new SmsBalanceDto(s.SmsCreditRequired, t.BillingExempt, SmsCredits.Available(lots, now), next?.ExpiresAt, next?.Left ?? 0,
            price, s.SmsUnitPrice, t.SmsPrice is not null, s.SmsMinPurchase, s.SmsValidityMonths, canBuy,
            packs.Select(p => new SmsPackDto(p.Uuid, p.Source, p.Quantity, p.UsedQuantity,
                p.ExpiresAt > now ? Math.Max(0, p.Quantity - p.UsedQuantity) : 0, p.ExpiresAt, p.CreatedDate, p.ExpiresAt <= now, p.Note)).ToList());
    }

    /// <summary>
    /// Takes <paramref name="parts"/> SMS from the business's packs, soonest expiry first, locking
    /// them for the caller's transaction. False when the balance is short: then nothing is taken.
    /// </summary>
    public static async Task<bool> TryChargeAsync(IAppDbContext db, Guid tenantId, int parts, DateTimeOffset now, CancellationToken ct)
    {
        var packs = await db.SmsCredits
            .FromSqlRaw("SELECT * FROM sms_credit WHERE tenant_uuid = {0} AND expires_at > {1} AND used_quantity < quantity " +
                        "ORDER BY expires_at FOR UPDATE", tenantId, now)
            .IgnoreQueryFilters()
            .ToListAsync(ct);
        var plan = SmsCredits.Allocate(packs.Select(ToLot), parts, now);
        if (plan is null) return false;
        foreach (var (uuid, take) in plan) packs.First(p => p.Uuid == uuid).UsedQuantity += take;
        return true;
    }

    /// <summary>Gives back the SMS of a message that could not be delivered (see <see cref="SmsCredits.Refund"/>).</summary>
    public static async Task RefundAsync(IAppDbContext db, Guid tenantId, int parts, DateTimeOffset now, CancellationToken ct)
    {
        if (parts <= 0) return;
        var packs = await db.SmsCredits
            .FromSqlRaw("SELECT * FROM sms_credit WHERE tenant_uuid = {0} AND expires_at > {1} AND used_quantity > 0 FOR UPDATE", tenantId, now)
            .IgnoreQueryFilters()
            .ToListAsync(ct);
        foreach (var (uuid, give) in SmsCredits.Refund(packs.Select(ToLot), parts, now))
            packs.First(p => p.Uuid == uuid).UsedQuantity -= give;
    }

    /// <summary>The free SMS a new business gets, or null when the super admin gives none.</summary>
    public static SmsCredit? FreePack(BillingSettings s, Guid tenantId, DateTimeOffset now) => s.SmsFreeOnSignup <= 0 ? null : new SmsCredit
    {
        Uuid = Guid.NewGuid(),
        TenantUuid = tenantId,
        Source = SmsCreditSource.Free,
        Quantity = s.SmsFreeOnSignup,
        Note = "Welcome SMS",
        ExpiresAt = SmsCredits.ExpiresAt(now, s.SmsValidityMonths),
        CreatedDate = now,
        CreatedByUserName = AppUser.SystemUserName,
    };

    public static SmsLot ToLot(SmsCredit c) => new(c.Uuid, c.Quantity, c.UsedQuantity, c.ExpiresAt);
}
