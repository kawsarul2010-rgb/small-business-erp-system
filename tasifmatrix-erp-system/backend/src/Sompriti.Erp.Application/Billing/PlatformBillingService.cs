using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Billing;

// ---------------------------------------------------------------------------------------- DTOs

/// <summary>The billing configuration as the super admin sees it. Secrets are never sent back, only whether they are set.</summary>
public sealed record BillingSettingsDto(bool BillingEnabled, int TrialDays, int GraceDays, int ReminderDays, string? SupportPhone,
    string? SupportEmail, bool BkashEnabled, bool BkashSandbox, string? BkashAppKey, bool HasBkashAppSecret, string? BkashUsername,
    bool HasBkashPassword, bool BkashReady, DateTimeOffset UpdatedDate, string UpdatedByUserName);

/// <summary>Secrets: null or empty keeps the saved value; ClearBkashSecrets removes both.</summary>
public sealed record BillingSettingsRequest(bool? BillingEnabled, int? TrialDays, int? GraceDays, int? ReminderDays, string? SupportPhone,
    string? SupportEmail, bool? BkashEnabled, bool? BkashSandbox, string? BkashAppKey, string? BkashAppSecret, string? BkashUsername,
    string? BkashPassword, bool ClearBkashSecrets = false);

/// <summary>BusinessesStarted: businesses whose free trial began because billing was just switched on.</summary>
public sealed record BillingSettingsSavedDto(BillingSettingsDto Settings, int BusinessesStarted);

/// <summary>MaxOrdersPerMonth: the most orders a month (3-month average) for this size; null: no limit.</summary>
public sealed record SizeDto(Guid Uuid, string Name, string? Description, int SortOrder, bool IsActive, int Businesses, Guid Revision,
    int? MaxOrdersPerMonth = null);

/// <summary>MaxOrdersPerMonth null: no limit (use it for the largest size).</summary>
public sealed record SizeRequest(string? Name, string? Description, int? SortOrder, bool? IsActive, Guid? Revision, int? MaxOrdersPerMonth = null);

public sealed record PlanDto(Guid Uuid, string Name, string? Description, int DurationMonths, int SortOrder, bool IsActive,
    IReadOnlyList<PlanPriceDto> Prices, Guid Revision);

/// <summary>Prices: one per size the package is offered to; a size left out is not offered it.</summary>
public sealed record PlanRequest(string? Name, string? Description, int? DurationMonths, int? SortOrder, bool? IsActive,
    IReadOnlyList<PlanPriceRequest>? Prices, Guid? Revision);

public sealed record PlanPriceRequest(Guid SizeUuid, decimal? Price);

public sealed record PaymentListQuery : PageQuery
{
    public BillingPaymentStatus? Status { get; init; }
    public Guid? BusinessUuid { get; init; }
}

/// <summary>EndsAt: the new paid-until date (null keeps it). OnTrial: whether that date is a free trial.</summary>
public sealed record BusinessSubscriptionRequest(Guid? SizeUuid, bool? BillingExempt, DateTimeOffset? EndsAt, bool? OnTrial);

/// <summary>A payment taken outside the app (cash, bank). Either a package, or a number of months.</summary>
public sealed record ManualPaymentRequest(Guid? PlanUuid, int? Months, decimal? Amount, string? Note);

/// <summary>
/// A business's subscription on the platform screens. SizeCheck: its volume against its size's
/// limit. Prices: every package's size price and special price (detail page only).
/// </summary>
public sealed record BusinessSubscriptionDto(SubscriptionStatusDto Status, Guid? SizeUuid, string? SizeName, Guid? PlanUuid,
    string? PlanName, bool BillingExempt, BusinessSizeCheckDto? SizeCheck = null, IReadOnlyList<BusinessPlanPriceDto>? Prices = null);

/// <summary>A business above its size's limit, for the alert on the super admin's Businesses page.</summary>
public sealed record SizeAlertDto(Guid BusinessUuid, string BusinessName, string BusinessCode, Guid? SizeUuid, string? SizeName,
    int? SizeLimit, int OrdersPerMonth, Guid? SuggestedSizeUuid, string? SuggestedSizeName);

/// <summary>Price null (or the plan left out) removes the special price: the business pays its size's price again.</summary>
public sealed record SpecialPriceRequest(Guid PlanUuid, decimal? Price);
public sealed record SpecialPricesRequest(IReadOnlyList<SpecialPriceRequest>? Prices);

/// <summary>Keep the current size although the business is above its limit: no alert for Days (default 30).</summary>
public sealed record KeepSizeRequest(int? Days);

// ---------------------------------------------------------------------------------------- service

/// <summary>
/// The super admin's billing: the switches, the bKash account, the packages and sizes, every
/// business's payments, and each business's subscription. Platform requests already run as the
/// database owner, so the normal context is used, opting out of the business filter where needed.
/// </summary>
public sealed class PlatformBillingService(IAppDbContext db, ICurrentUser currentUser, ISecretProtector protector, IBkashGateway bkash,
    BillingSettingsCache settingsCache, SubscriptionLedger ledger, BillingService billing, TimeProvider clock)
{
    private void EnsureSuperAdmin()
    {
        if (!currentUser.IsSuperAdmin()) throw DomainException.Forbidden();
    }

    // ------------------------------------------------------------------ settings

    public async Task<BillingSettingsDto> SettingsAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        return ToDto(await LoadSettingsAsync(ct));
    }

    public async Task<BillingSettingsSavedDto> SaveSettingsAsync(BillingSettingsRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var s = await LoadSettingsAsync(ct);
        var wasEnabled = s.BillingEnabled;
        Apply(s, r);

        var v = new Validator()
            .When(s.TrialDays is < 0 or > 365, "trialDays", "Free trial must be 0 to 365 days.")
            .When(s.GraceDays is < 0 or > 60, "graceDays", "Extra days after expiry must be 0 to 60.")
            .When(s.ReminderDays is < 0 or > 60, "reminderDays", "Reminder must be 0 to 60 days before.")
            .MaxLength("supportPhone", s.SupportPhone, "Support phone", 30)
            .MaxLength("supportEmail", s.SupportEmail, "Support email", 200)
            .When(s.SupportEmail is not null && !Validator.IsEmail(s.SupportEmail), "supportEmail", "Support email is not valid.")
            .MaxLength("bkashAppKey", s.BkashAppKey, "App key", 200)
            .MaxLength("bkashUsername", s.BkashUsername, "Username", 200);
        if (s.BkashEnabled)
        {
            v.When(string.IsNullOrWhiteSpace(s.BkashAppKey), "bkashAppKey", "App key is required to switch bKash on.")
             .When(string.IsNullOrWhiteSpace(s.BkashUsername), "bkashUsername", "Username is required to switch bKash on.")
             .When(protector.Unprotect(s.BkashAppSecret) is null, "bkashAppSecret", "App secret is required to switch bKash on.")
             .When(protector.Unprotect(s.BkashPassword) is null, "bkashPassword", "Password is required to switch bKash on.");
        }
        v.ThrowIfInvalid();

        s.UpdatedDate = clock.GetUtcNow();
        s.UpdatedByUserName = currentUser.UserName;

        // Switching billing on starts the free trial of every business that has never had one,
        // so nobody is frozen the moment billing begins.
        var started = 0;
        if (s.BillingEnabled && !wasEnabled)
        {
            var now = clock.GetUtcNow();
            var waiting = await db.Tenants.Where(t => t.SubscriptionEndsAt == null && !t.BillingExempt).ToListAsync(ct);
            foreach (var t in waiting)
            {
                t.SubscriptionEndsAt = now.AddDays(s.TrialDays);
                t.OnTrial = s.TrialDays > 0;
            }
            started = waiting.Count;
        }
        await db.SaveChangesAsync(ct);
        settingsCache.Invalidate();
        return new BillingSettingsSavedDto(ToDto(s), started);
    }

    /// <summary>Asks bKash for a token with the given (or saved) account, without saving anything.</summary>
    public async Task TestBkashAsync(BillingSettingsRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var s = await db.BillingSettings.AsNoTracking().FirstAsync(x => x.Id == BillingSettings.SingletonId, ct);
        Apply(s, r with { BkashEnabled = true });
        var credentials = BillingMapping.Bkash(s, protector)
            ?? throw DomainException.Validation("bkashAppKey", "Fill in the app key, app secret, username and password first.");
        try
        {
            await bkash.TestAsync(credentials, ct);
        }
        catch (BkashException e)
        {
            throw DomainException.Rule(ErrorCodes.BusinessRule, $"bKash refused the account: {e.Message}");
        }
    }

    private async Task<BillingSettings> LoadSettingsAsync(CancellationToken ct)
    {
        var s = await db.BillingSettings.FirstOrDefaultAsync(x => x.Id == BillingSettings.SingletonId, ct);
        if (s is not null) return s;
        s = new BillingSettings { UpdatedDate = clock.GetUtcNow(), UpdatedByUserName = AppUser.SystemUserName };
        db.BillingSettings.Add(s);
        return s;
    }

    private void Apply(BillingSettings s, BillingSettingsRequest r)
    {
        if (r.BillingEnabled is { } be) s.BillingEnabled = be;
        if (r.TrialDays is { } td) s.TrialDays = td;
        if (r.GraceDays is { } gd) s.GraceDays = gd;
        if (r.ReminderDays is { } rd) s.ReminderDays = rd;
        s.SupportPhone = Validator.Clean(r.SupportPhone);
        s.SupportEmail = Validator.Clean(r.SupportEmail);
        if (r.BkashEnabled is { } ke) s.BkashEnabled = ke;
        if (r.BkashSandbox is { } sb) s.BkashSandbox = sb;
        s.BkashAppKey = Validator.Clean(r.BkashAppKey);
        s.BkashUsername = Validator.Clean(r.BkashUsername);
        if (r.ClearBkashSecrets)
        {
            s.BkashAppSecret = null;
            s.BkashPassword = null;
        }
        if (!string.IsNullOrWhiteSpace(r.BkashAppSecret)) s.BkashAppSecret = protector.Protect(r.BkashAppSecret.Trim());
        if (!string.IsNullOrWhiteSpace(r.BkashPassword)) s.BkashPassword = protector.Protect(r.BkashPassword);
    }

    private BillingSettingsDto ToDto(BillingSettings s) => new(s.BillingEnabled, s.TrialDays, s.GraceDays, s.ReminderDays, s.SupportPhone,
        s.SupportEmail, s.BkashEnabled, s.BkashSandbox, s.BkashAppKey, protector.Unprotect(s.BkashAppSecret) is not null, s.BkashUsername,
        protector.Unprotect(s.BkashPassword) is not null, BillingMapping.Bkash(s, protector) is not null,
        s.UpdatedDate, s.UpdatedByUserName);

    // ------------------------------------------------------------------ sizes

    public async Task<IReadOnlyList<SizeDto>> SizesAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var counts = await db.Tenants.Where(t => t.BusinessSizeUuid != null).GroupBy(t => t.BusinessSizeUuid!.Value)
            .Select(g => new { Size = g.Key, Count = g.Count() }).ToListAsync(ct);
        var sizes = await db.BusinessSizes.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.SizeName).ToListAsync(ct);
        return sizes.Select(x => new SizeDto(x.Uuid, x.SizeName, x.Description, x.SortOrder, x.IsActive,
            counts.FirstOrDefault(c => c.Size == x.Uuid)?.Count ?? 0, x.Revision, x.MaxOrdersPerMonth)).ToList();
    }

    public async Task<SizeDto> SaveSizeAsync(Guid? id, SizeRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        new Validator().Required("name", r.Name, "Size name", 60).MaxLength("description", r.Description, "Description", 300)
            .When(r.MaxOrdersPerMonth is < 0 or > 10_000_000, "maxOrdersPerMonth", "Enter 0 or more orders a month, or leave it empty for no limit.")
            .ThrowIfInvalid();
        var name = r.Name!.Trim();
        if (await db.BusinessSizes.AnyAsync(x => x.SizeName.ToLower() == name.ToLower() && x.Uuid != id, ct))
            throw DomainException.Validation("name", "Another size already has this name.");
        BusinessSize size;
        if (id is { } existing)
        {
            size = (await db.BusinessSizes.FirstOrDefaultAsync(x => x.Uuid == existing, ct)).OrNotFound("Size");
            RevisionGuard.Check(db, size, r.Revision ?? Guid.Empty);
        }
        else
        {
            size = new BusinessSize { Uuid = Guid.NewGuid(), SortOrder = await db.BusinessSizes.CountAsync(ct) + 1 };
            db.BusinessSizes.Add(size);
        }
        size.SizeName = name;
        size.Description = Validator.Clean(r.Description);
        if (r.SortOrder is { } so) size.SortOrder = so;
        if (r.IsActive is { } active) size.IsActive = active;
        size.MaxOrdersPerMonth = r.MaxOrdersPerMonth;
        await db.SaveChangesAsync(ct);
        return (await SizesAsync(ct)).First(x => x.Uuid == size.Uuid);
    }

    // ------------------------------------------------------------------ packages

    public async Task<IReadOnlyList<PlanDto>> PlansAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var plans = await db.SubscriptionPlans.AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.DurationMonths).ToListAsync(ct);
        var prices = await db.SubscriptionPlanPrices.AsNoTracking().ToListAsync(ct);
        return plans.Select(p => new PlanDto(p.Uuid, p.PlanName, p.Description, p.DurationMonths, p.SortOrder, p.IsActive,
            prices.Where(x => x.PlanUuid == p.Uuid).Select(x => new PlanPriceDto(x.SizeUuid, x.Price)).ToList(), p.Revision)).ToList();
    }

    public async Task<PlanDto> SavePlanAsync(Guid? id, PlanRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var v = new Validator().Required("name", r.Name, "Package name", 60).MaxLength("description", r.Description, "Description", 300)
            .When(r.DurationMonths is not (>= 1 and <= 60), "durationMonths", "Length must be 1 to 60 months.");
        var prices = (r.Prices ?? []).Where(x => x.Price is not null).ToList();
        for (var i = 0; i < prices.Count; i++)
            v.When(prices[i].Price is < 0 or > 10_000_000, $"prices[{i}].price", "Price must be 0 or more.");
        v.When(prices.Select(x => x.SizeUuid).Distinct().Count() != prices.Count, "prices", "A size is listed twice.");
        v.ThrowIfInvalid();
        var sizeIds = prices.Select(x => x.SizeUuid).ToList();
        if (await db.BusinessSizes.CountAsync(x => sizeIds.Contains(x.Uuid), ct) != sizeIds.Count)
            throw DomainException.Validation("prices", "A size in the price list does not exist.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        SubscriptionPlan plan;
        if (id is { } existing)
        {
            plan = (await db.SubscriptionPlans.FirstOrDefaultAsync(x => x.Uuid == existing, ct)).OrNotFound("Package");
            RevisionGuard.Check(db, plan, r.Revision ?? Guid.Empty);
            db.SubscriptionPlanPrices.RemoveRange(await db.SubscriptionPlanPrices.Where(x => x.PlanUuid == existing).ToListAsync(ct));
        }
        else
        {
            plan = new SubscriptionPlan { Uuid = Guid.NewGuid(), SortOrder = await db.SubscriptionPlans.CountAsync(ct) + 1 };
            db.SubscriptionPlans.Add(plan);
        }
        plan.PlanName = r.Name!.Trim();
        plan.Description = Validator.Clean(r.Description);
        plan.DurationMonths = r.DurationMonths!.Value;
        if (r.SortOrder is { } so) plan.SortOrder = so;
        if (r.IsActive is { } active) plan.IsActive = active;
        await db.SaveChangesAsync(ct); // the package first: prices reference it

        foreach (var p in prices)
            db.SubscriptionPlanPrices.Add(new SubscriptionPlanPrice { PlanUuid = plan.Uuid, SizeUuid = p.SizeUuid, Price = Money.Round(p.Price!.Value) });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return (await PlansAsync(ct)).First(x => x.Uuid == plan.Uuid);
    }

    // ------------------------------------------------------------------ payments

    public async Task<PagedResult<BillingPaymentDto>> PaymentsAsync(PaymentListQuery q, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var query = from p in db.BillingPayments.IgnoreQueryFilters().AsNoTracking()
                    join t in db.Tenants.AsNoTracking() on p.TenantUuid equals t.Uuid
                    select new { p, t.TenantName, t.TenantCode };
        if (q.Status is { } st) query = query.Where(x => x.p.Status == st);
        if (q.BusinessUuid is { } bid) query = query.Where(x => x.p.TenantUuid == bid);
        if (q.Term is { } term)
        {
            var like = term.ToLower();
            query = query.Where(x => x.p.InvoiceNumber.ToLower().Contains(like) || (x.p.TrxId != null && x.p.TrxId.ToLower().Contains(like))
                                     || x.TenantName.ToLower().Contains(like) || x.TenantCode.Contains(like));
        }
        var page = await query.OrderByDescending(x => x.p.CreatedDate).ToPagedAsync(q, x => x, ct);
        return new PagedResult<BillingPaymentDto>(page.Items.Select(x => BillingMapping.ToDto(x.p, x.TenantName)).ToList(),
            page.Page, page.PageSize, page.TotalCount);
    }

    public async Task<BillingPaymentDto> VerifyPaymentAsync(Guid id, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var payment = (await db.BillingPayments.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Uuid == id, ct)).OrNotFound("Payment");
        var result = await billing.ConfirmWithBkashAsync(db, payment, execute: false, ct);
        var name = await db.Tenants.Where(t => t.Uuid == result.TenantUuid).Select(t => t.TenantName).FirstOrDefaultAsync(ct);
        return BillingMapping.ToDto(result, name);
    }

    // ------------------------------------------------------------------ one business

    public async Task<BusinessSubscriptionDto> SubscriptionOfAsync(Guid businessId, CancellationToken ct)
    {
        var t = (await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == businessId, ct)).OrNotFound("Business");
        return (await BuildAsync(db, settingsCache, [t], clock.GetUtcNow(), withPrices: true, ct))[t.Uuid];
    }

    /// <summary>
    /// Subscriptions of many businesses for the platform screens: state, size, package, the size
    /// check and (withPrices, for one business) every package's size and special price.
    /// </summary>
    public static async Task<Dictionary<Guid, BusinessSubscriptionDto>> BuildAsync(IAppDbContext db, BillingSettingsCache cache,
        IReadOnlyCollection<Tenant> tenants, DateTimeOffset now, bool withPrices, CancellationToken ct)
    {
        var settings = await cache.GetAsync(db, ct);
        var sizes = await db.BusinessSizes.AsNoTracking().ToDictionaryAsync(x => x.Uuid, x => x.SizeName, ct);
        var plans = await db.SubscriptionPlans.AsNoTracking().ToDictionaryAsync(x => x.Uuid, x => x.PlanName, ct);
        var checks = await BusinessPricing.SizeChecksAsync(db, tenants, now, ct);
        var result = new Dictionary<Guid, BusinessSubscriptionDto>();
        foreach (var t in tenants)
        {
            var size = t.BusinessSizeUuid is { } s ? sizes.GetValueOrDefault(s) : null;
            var plan = t.SubscriptionPlanUuid is { } p ? plans.GetValueOrDefault(p) : null;
            var prices = withPrices
                ? (await BusinessPricing.OffersAsync(db, t.Uuid, t.BusinessSizeUuid, activeOnly: false, ct))
                    .Select(o => new BusinessPlanPriceDto(o.PlanUuid, o.Name, o.DurationMonths, o.IsActive, o.SizePrice, o.SpecialPrice)).ToList()
                : null;
            result[t.Uuid] = new BusinessSubscriptionDto(BillingMapping.Status(t, settings, now, plan, size), t.BusinessSizeUuid, size,
                t.SubscriptionPlanUuid, plan, t.BillingExempt, checks[t.Uuid], prices);
        }
        return result;
    }

    /// <summary>Businesses above their size's limit and not snoozed, biggest gap first.</summary>
    public async Task<IReadOnlyList<SizeAlertDto>> SizeAlertsAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var tenants = await db.Tenants.AsNoTracking()
            .Where(t => t.Status != TenantStatus.Closed && !t.BillingExempt && t.BusinessSizeUuid != null).ToListAsync(ct);
        var checks = await BusinessPricing.SizeChecksAsync(db, tenants, clock.GetUtcNow(), ct);
        var sizes = await db.BusinessSizes.AsNoTracking().ToDictionaryAsync(x => x.Uuid, x => x.SizeName, ct);
        return tenants.Where(t => checks[t.Uuid].Alert)
            .Select(t => (t, c: checks[t.Uuid]))
            .OrderByDescending(x => x.c.OrdersPerMonth - (x.c.SizeLimit ?? 0))
            .Select(x => new SizeAlertDto(x.t.Uuid, x.t.TenantName, x.t.TenantCode, x.t.BusinessSizeUuid,
                x.t.BusinessSizeUuid is { } s ? sizes.GetValueOrDefault(s) : null, x.c.SizeLimit, x.c.OrdersPerMonth,
                x.c.SuggestedSizeUuid, x.c.SuggestedSizeName))
            .ToList();
    }

    /// <summary>"Keep this size": the business stays on its size and is not flagged again for a while.</summary>
    public async Task<BusinessSubscriptionDto> KeepSizeAsync(Guid businessId, KeepSizeRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var days = r.Days ?? 30;
        new Validator().When(days is < 1 or > 365, "days", "Choose 1 to 365 days.").ThrowIfInvalid();
        var t = (await db.Tenants.FirstOrDefaultAsync(x => x.Uuid == businessId, ct)).OrNotFound("Business");
        Platform.PlatformService.EnsureNotClosed(t);
        t.SizeReviewSnoozedUntil = clock.GetUtcNow().AddDays(days);
        await db.SaveChangesAsync(ct);
        return await SubscriptionOfAsync(businessId, ct);
    }

    /// <summary>Replaces the business's special prices. A package without one is charged at its size's price.</summary>
    public async Task<BusinessSubscriptionDto> SaveSpecialPricesAsync(Guid businessId, SpecialPricesRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var t = (await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == businessId, ct)).OrNotFound("Business");
        Platform.PlatformService.EnsureNotClosed(t);
        var wanted = (r.Prices ?? []).Where(x => x.Price is not null).ToList();
        var v = new Validator();
        v.When(wanted.Any(x => x.Price < 0), "prices", "A price cannot be negative.");
        v.When(wanted.Select(x => x.PlanUuid).Distinct().Count() != wanted.Count, "prices", "A package is listed twice.");
        v.ThrowIfInvalid();
        var planIds = wanted.Select(x => x.PlanUuid).ToList();
        if (await db.SubscriptionPlans.CountAsync(p => planIds.Contains(p.Uuid), ct) != planIds.Count)
            throw DomainException.Validation("prices", "One of the packages does not exist.");

        var existing = await db.BusinessPlanPrices.IgnoreQueryFilters().Where(x => x.TenantUuid == businessId).ToListAsync(ct);
        db.BusinessPlanPrices.RemoveRange(existing.Where(e => !planIds.Contains(e.PlanUuid)));
        var now = clock.GetUtcNow();
        foreach (var w in wanted)
        {
            var price = Money.Round(w.Price!.Value);
            var row = existing.FirstOrDefault(e => e.PlanUuid == w.PlanUuid);
            if (row is null)
            {
                row = new BusinessPlanPrice { TenantUuid = businessId, PlanUuid = w.PlanUuid };
                db.BusinessPlanPrices.Add(row);
            }
            else if (row.Price == price) continue;
            row.Price = price;
            row.UpdatedDate = now;
            row.UpdatedByUserUuid = currentUser.UserUuid;
            row.UpdatedByUserName = currentUser.UserName;
        }
        await db.SaveChangesAsync(ct);
        return await SubscriptionOfAsync(businessId, ct);
    }

    /// <summary>The super admin's direct changes: size, exemption, or the paid-until date itself.</summary>
    public async Task<BusinessSubscriptionDto> UpdateSubscriptionAsync(Guid businessId, BusinessSubscriptionRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var t = (await db.Tenants.FirstOrDefaultAsync(x => x.Uuid == businessId, ct)).OrNotFound("Business");
        Platform.PlatformService.EnsureNotClosed(t);
        if (r.SizeUuid is { } sid)
        {
            if (!await db.BusinessSizes.AnyAsync(x => x.Uuid == sid, ct)) throw DomainException.Validation("sizeUuid", "This size does not exist.");
            if (t.BusinessSizeUuid != sid) t.SizeReviewSnoozedUntil = null; // a new size starts with a clean check
            t.BusinessSizeUuid = sid;
        }
        if (r.BillingExempt is { } exempt) t.BillingExempt = exempt;
        if (r.EndsAt is { } ends)
        {
            t.SubscriptionEndsAt = ends;
            t.OnTrial = r.OnTrial ?? false;
        }
        else if (r.OnTrial is { } trial) t.OnTrial = trial;
        await db.SaveChangesAsync(ct);
        return await SubscriptionOfAsync(businessId, ct);
    }

    /// <summary>Records money received outside the app and extends the subscription like a bKash payment.</summary>
    public async Task<BillingPaymentDto> RecordManualPaymentAsync(Guid businessId, ManualPaymentRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var t = (await db.Tenants.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == businessId, ct)).OrNotFound("Business");
        Platform.PlatformService.EnsureNotClosed(t);
        var plan = r.PlanUuid is { } pid ? await db.SubscriptionPlans.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == pid, ct) : null;
        var months = plan?.DurationMonths ?? r.Months;
        new Validator()
            .When(r.PlanUuid is not null && plan is null, "planUuid", "This package does not exist.")
            .When(months is not (>= 1 and <= 60), "months", "Choose a package or 1 to 60 months.")
            .When(r.Amount is null or < 0, "amount", "Enter the amount received (0 or more).")
            .MaxLength("note", r.Note, "Note", 300)
            .ThrowIfInvalid();
        var sizeName = t.BusinessSizeUuid is { } sid ? await db.BusinessSizes.Where(x => x.Uuid == sid).Select(x => x.SizeName).FirstOrDefaultAsync(ct) : null;

        var now = clock.GetUtcNow();
        var payment = new BillingPayment
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = t.Uuid,
            PlanUuid = plan?.Uuid,
            PlanName = plan?.PlanName ?? (months == 1 ? "1 month" : $"{months} months"),
            SizeName = sizeName,
            DurationMonths = months!.Value,
            Amount = Money.Round(r.Amount!.Value),
            Provider = BillingProvider.Manual,
            Status = BillingPaymentStatus.Initiated,
            InvoiceNumber = BillingMapping.NewInvoiceNumber(now),
            Note = Validator.Clean(r.Note),
            CreatedDate = now,
            CreatedByUserUuid = currentUser.UserUuid,
            CreatedByUserName = currentUser.UserName,
        };
        db.BillingPayments.Add(payment);
        await db.SaveChangesAsync(ct);
        var done = await ledger.CompleteAsync(db, payment.Uuid, null, null, "Recorded by the super admin.", ct);
        return BillingMapping.ToDto(done, t.TenantName);
    }
}
