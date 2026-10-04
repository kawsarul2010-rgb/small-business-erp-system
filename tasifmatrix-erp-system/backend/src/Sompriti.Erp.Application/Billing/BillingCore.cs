using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Billing;

// ---------------------------------------------------------------------------------------- ports

/// <summary>Encrypts the payment gateway's secrets before they are stored.</summary>
public interface ISecretProtector
{
    string Protect(string plainText);
    /// <summary>Null when empty or when it cannot be decrypted (e.g. the key changed).</summary>
    string? Unprotect(string? protectedText);
}

/// <summary>
/// A database context that runs as the database owner, outside any business: for billing work that
/// must read the gateway settings or update a business's subscription during a business user's
/// request. Queries on it must narrow by business themselves (IgnoreQueryFilters + a where).
/// Created contexts are disposed with the request.
/// </summary>
public interface ISystemDbFactory
{
    IAppDbContext Create();
}

public sealed record BkashCredentials(bool Sandbox, string AppKey, string AppSecret, string Username, string Password);

public sealed record BkashCreateResult(string PaymentId, string RedirectUrl);

/// <summary>Completed is true only for a finished, successful payment.</summary>
public sealed record BkashPaymentResult(bool Completed, string? TransactionStatus, string? TrxId, string? PayerAccount, string? Message);

/// <summary>bKash Tokenized Checkout. Errors are thrown as <see cref="BkashException"/>.</summary>
public interface IBkashGateway
{
    /// <summary>Checks the credentials by asking bKash for a token.</summary>
    Task TestAsync(BkashCredentials credentials, CancellationToken ct);
    Task<BkashCreateResult> CreateAsync(BkashCredentials credentials, decimal amount, string invoiceNumber, string payerReference,
        string callbackUrl, CancellationToken ct);
    Task<BkashPaymentResult> ExecuteAsync(BkashCredentials credentials, string paymentId, CancellationToken ct);
    Task<BkashPaymentResult> QueryAsync(BkashCredentials credentials, string paymentId, CancellationToken ct);
}

public sealed class BkashException(string message) : Exception(message);

// ---------------------------------------------------------------------------------------- DTOs

/// <summary>
/// A business's subscription as the app shows it. ShowReminder: the banner should be shown now
/// (trial or plan ending within the reminder days, grace period, or frozen).
/// </summary>
public sealed record SubscriptionStatusDto(SubscriptionState State, DateTimeOffset? EndsAt, DateTimeOffset? GraceEndsAt, int? DaysLeft,
    bool OnTrial, string? PlanName, string? SizeName, bool ShowReminder, bool Frozen);

public sealed record BillingPaymentDto(Guid Uuid, Guid BusinessUuid, string? BusinessName, string InvoiceNumber, string PlanName,
    string? SizeName, int DurationMonths, decimal Amount, BillingProvider Provider, BillingPaymentStatus Status, string? TrxId,
    string? PayerAccount, string? StatusMessage, string? Note, DateTimeOffset? PeriodStart, DateTimeOffset? PeriodEnd,
    DateTimeOffset CreatedDate, DateTimeOffset? CompletedDate, string CreatedByUserName);

public sealed record SizeOptionDto(Guid Uuid, string Name, string? Description);

public sealed record PlanPriceDto(Guid SizeUuid, decimal Price);

/// <summary>A package as offered on the sign-up page: its price for each size it is offered to.</summary>
public sealed record PlanOfferDto(Guid Uuid, string Name, string? Description, int DurationMonths, IReadOnlyList<PlanPriceDto> Prices);

// ---------------------------------------------------------------------------------------- shared logic

/// <summary>Billing settings, read at most every 30 seconds (every signed-in request needs them).</summary>
public sealed class BillingSettingsCache(IMemoryCache cache)
{
    private const string Key = "billing-settings";

    public async Task<BillingSettings> GetAsync(IAppDbContext ownerDb, CancellationToken ct)
    {
        if (cache.TryGetValue(Key, out BillingSettings? cached) && cached is not null) return cached;
        var s = await ownerDb.BillingSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == BillingSettings.SingletonId, ct)
                ?? new BillingSettings();
        cache.Set(Key, s, TimeSpan.FromSeconds(30));
        return s;
    }

    public void Invalidate() => cache.Remove(Key);
}

public static class BillingMapping
{
    public static SubscriptionStatusDto Status(Tenant t, BillingSettings s, DateTimeOffset now, string? planName, string? sizeName)
    {
        var snap = SubscriptionRules.Evaluate(s.BillingEnabled, t.BillingExempt, t.SubscriptionEndsAt, t.OnTrial, s.GraceDays, now);
        var remind = snap.State switch
        {
            SubscriptionState.Trial or SubscriptionState.Active => snap.DaysLeft <= s.ReminderDays,
            SubscriptionState.GracePeriod or SubscriptionState.Expired => true,
            _ => false,
        };
        return new SubscriptionStatusDto(snap.State, snap.EndsAt, snap.GraceEndsAt, snap.DaysLeft, t.OnTrial && snap.State == SubscriptionState.Trial,
            planName, sizeName, remind, snap.Frozen);
    }

    public static BillingPaymentDto ToDto(BillingPayment p, string? businessName = null) => new(p.Uuid, p.TenantUuid, businessName,
        p.InvoiceNumber, p.PlanName, p.SizeName, p.DurationMonths, p.Amount, p.Provider, p.Status, p.TrxId, p.PayerAccount,
        p.StatusMessage, p.Note, p.PeriodStart, p.PeriodEnd, p.CreatedDate, p.CompletedDate, p.CreatedByUserName);

    /// <summary>The gateway credentials, decrypted; null when bKash is off or not fully set up.</summary>
    public static BkashCredentials? Bkash(BillingSettings s, ISecretProtector protector)
    {
        if (!s.BkashEnabled) return null;
        var secret = protector.Unprotect(s.BkashAppSecret);
        var password = protector.Unprotect(s.BkashPassword);
        if (string.IsNullOrWhiteSpace(s.BkashAppKey) || string.IsNullOrWhiteSpace(s.BkashUsername)
            || string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(password)) return null;
        return new BkashCredentials(s.BkashSandbox, s.BkashAppKey.Trim(), secret, s.BkashUsername.Trim(), password);
    }

    /// <summary>"TM261004-K3F9QX": short, unique, readable on a bKash statement.</summary>
    public static string NewInvoiceNumber(DateTimeOffset now)
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(6);
        var suffix = new string(bytes.Select(b => alphabet[b % alphabet.Length]).ToArray());
        return $"TM{now.ToOffset(BusinessClock.Offset):yyMMdd}-{suffix}";
    }
}

/// <summary>
/// Marks a payment as paid and extends the business's subscription - once, however many times
/// bKash calls back or someone presses "check again". Runs as the database owner.
/// </summary>
public sealed class SubscriptionLedger(TimeProvider clock)
{
    public async Task<BillingPayment> CompleteAsync(IAppDbContext sys, Guid paymentUuid, string? trxId, string? payer, string? message,
        CancellationToken ct)
    {
        await using var tx = await sys.Database.BeginTransactionAsync(ct);
        var payment = (await sys.BillingPayments.FromSqlRaw("SELECT * FROM billing_payment WHERE uuid = {0} FOR UPDATE", paymentUuid)
            .IgnoreQueryFilters().ToListAsync(ct)).FirstOrDefault() ?? throw DomainException.NotFound("Payment");
        if (payment.Status == BillingPaymentStatus.Completed)
        {
            await tx.CommitAsync(ct);
            return payment;
        }

        var tenant = (await sys.Tenants.FromSqlRaw("SELECT * FROM tenant WHERE uuid = {0} FOR UPDATE", payment.TenantUuid)
            .ToListAsync(ct)).First();
        var now = clock.GetUtcNow();
        var (start, end) = SubscriptionRules.Extend(tenant.SubscriptionEndsAt, now, payment.DurationMonths);

        payment.Status = BillingPaymentStatus.Completed;
        payment.TrxId = trxId ?? payment.TrxId;
        payment.PayerAccount = payer ?? payment.PayerAccount;
        payment.StatusMessage = message;
        payment.CompletedDate = now;
        payment.PeriodStart = start;
        payment.PeriodEnd = end;

        tenant.SubscriptionEndsAt = end;
        tenant.OnTrial = false;
        if (payment.PlanUuid is { } plan) tenant.SubscriptionPlanUuid = plan;

        await sys.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return payment;
    }

    public async Task<BillingPayment> FailAsync(IAppDbContext sys, Guid paymentUuid, BillingPaymentStatus status, string? message, CancellationToken ct)
    {
        var payment = await sys.BillingPayments.IgnoreQueryFilters().FirstOrDefaultAsync(p => p.Uuid == paymentUuid, ct)
                      ?? throw DomainException.NotFound("Payment");
        if (payment.Status != BillingPaymentStatus.Initiated) return payment;
        payment.Status = status;
        payment.StatusMessage = message is { Length: > 300 } ? message[..300] : message;
        payment.CompletedDate = clock.GetUtcNow();
        await sys.SaveChangesAsync(ct);
        return payment;
    }
}
