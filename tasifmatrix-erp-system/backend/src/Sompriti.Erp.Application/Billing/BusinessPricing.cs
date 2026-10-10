using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Billing;

/// <summary>
/// One package as one business sees it: the price for its size, and the special price agreed with
/// it (if any), which wins. Offered when either exists.
/// </summary>
public sealed record PlanOffer(Guid PlanUuid, string Name, string? Description, int DurationMonths, int SortOrder, bool IsActive,
    decimal? SizePrice, decimal? SpecialPrice)
{
    public decimal? Price => SpecialPrice ?? SizePrice;
}

/// <summary>A package's prices for one business on the super admin's screens.</summary>
public sealed record BusinessPlanPriceDto(Guid PlanUuid, string PlanName, int DurationMonths, bool IsActive, decimal? SizePrice, decimal? SpecialPrice);

/// <summary>Where a business stands against its size's volume limit (see SizeRules).</summary>
public sealed record BusinessSizeCheckDto(int OrdersPerMonth, int? SizeLimit, bool OverLimit, bool Alert,
    Guid? SuggestedSizeUuid, string? SuggestedSizeName, DateTimeOffset? SnoozedUntil);

public static class BusinessPricing
{
    /// <summary>Every package with this business's size price and special price, in display order.</summary>
    public static async Task<List<PlanOffer>> OffersAsync(IAppDbContext db, Guid tenantUuid, Guid? sizeUuid, bool activeOnly, CancellationToken ct)
    {
        var plans = await db.SubscriptionPlans.AsNoTracking().Where(p => !activeOnly || p.IsActive)
            .OrderBy(p => p.SortOrder).ThenBy(p => p.DurationMonths).ToListAsync(ct);
        var sizePrices = sizeUuid is { } sid
            ? await db.SubscriptionPlanPrices.AsNoTracking().Where(x => x.SizeUuid == sid).ToDictionaryAsync(x => x.PlanUuid, x => x.Price, ct)
            : [];
        var special = await db.BusinessPlanPrices.IgnoreQueryFilters().AsNoTracking().Where(x => x.TenantUuid == tenantUuid)
            .ToDictionaryAsync(x => x.PlanUuid, x => x.Price, ct);
        return plans.Select(p => new PlanOffer(p.Uuid, p.PlanName, p.Description, p.DurationMonths, p.SortOrder, p.IsActive,
            sizePrices.TryGetValue(p.Uuid, out var sp) ? sp : null,
            special.TryGetValue(p.Uuid, out var xp) ? xp : null)).ToList();
    }

    /// <summary>
    /// The size check for many businesses at once: orders in the last 90 days (not voided), as a
    /// monthly average, against each business's size limit. Alert: above the limit, still billed,
    /// not closed, and not snoozed by the super admin.
    /// </summary>
    public static async Task<Dictionary<Guid, BusinessSizeCheckDto>> SizeChecksAsync(IAppDbContext db, IReadOnlyCollection<Tenant> tenants,
        DateTimeOffset now, CancellationToken ct)
    {
        var ids = tenants.Select(t => t.Uuid).ToList();
        var from = BusinessClock.Today(now).AddDays(-SizeRules.WindowDays);
        var sales = await db.SalesOrders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => ids.Contains(o.TenantUuid) && o.Status == RecordStatus.Active && o.PostingStatus != PostingStatus.Void && o.OrderDate >= from)
            .GroupBy(o => o.TenantUuid).Select(g => new { Tenant = g.Key, Count = g.Count() }).ToListAsync(ct);
        var purchases = await db.PurchaseOrders.IgnoreQueryFilters().AsNoTracking()
            .Where(o => ids.Contains(o.TenantUuid) && o.Status == RecordStatus.Active && o.PostingStatus != PostingStatus.Void && o.OrderDate >= from)
            .GroupBy(o => o.TenantUuid).Select(g => new { Tenant = g.Key, Count = g.Count() }).ToListAsync(ct);
        var sizes = (await db.BusinessSizes.AsNoTracking().ToListAsync(ct))
            .Select(z => new SizeLimit(z.Uuid, z.SizeName, z.SortOrder, z.IsActive, z.MaxOrdersPerMonth)).ToList();

        return tenants.ToDictionary(t => t.Uuid, t =>
        {
            var count = (sales.FirstOrDefault(x => x.Tenant == t.Uuid)?.Count ?? 0) + (purchases.FirstOrDefault(x => x.Tenant == t.Uuid)?.Count ?? 0);
            var perMonth = SizeRules.OrdersPerMonth(count, t.CreatedDate, now);
            var fit = SizeRules.Evaluate(perMonth, t.BusinessSizeUuid, sizes);
            var limit = sizes.FirstOrDefault(z => z.Uuid == t.BusinessSizeUuid)?.MaxOrdersPerMonth;
            var snoozed = t.SizeReviewSnoozedUntil is { } until && until > now ? until : (DateTimeOffset?)null;
            var alert = fit.Outgrown && snoozed is null && !t.BillingExempt && t.Status != TenantStatus.Closed;
            return new BusinessSizeCheckDto(perMonth, limit, fit.Outgrown, alert, fit.Suggested?.Uuid, fit.Suggested?.Name, snoozed);
        });
    }
}
