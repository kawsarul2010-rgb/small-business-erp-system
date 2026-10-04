using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Billing;

/// <summary>A package the business can buy now, priced for its size. PerMonth helps compare.</summary>
public sealed record PlanOptionDto(Guid Uuid, string Name, string? Description, int DurationMonths, decimal Price, decimal PerMonth);

/// <summary>
/// The Billing page. CanPayOnline: bKash is set up. Admins pay; other roles only see the state.
/// </summary>
public sealed record BillingOverviewDto(SubscriptionStatusDto Status, Guid? SizeUuid, string? SizeName, IReadOnlyList<PlanOptionDto> Plans,
    bool BillingEnabled, bool CanPayOnline, bool CanPay, string? SupportPhone, string? SupportEmail, int GraceDays, string BusinessCode,
    IReadOnlyList<SizeOptionDto> Sizes);

public sealed record CheckoutRequest(Guid? PlanUuid);

public sealed record ChooseSizeRequest(Guid? SizeUuid);

public sealed record CheckoutResultDto(string RedirectUrl, string InvoiceNumber);

/// <summary>Where the bKash callback sends the browser afterwards.</summary>
public sealed record CallbackOutcome(string Status, string? InvoiceNumber);

/// <summary>
/// A business's own billing: its subscription, the packages it can buy, paying with bKash, its
/// payment history. Works on the owner connection (ISystemDbFactory) because the gateway settings
/// and the subscription itself are not writable - or, for the settings, readable - by businesses;
/// every query is narrowed to the signed-in business explicitly.
/// </summary>
public sealed class BillingService(ICurrentUser currentUser, ISystemDbFactory systemDb, ISecretProtector protector,
    IBkashGateway bkash, SubscriptionLedger ledger, BillingSettingsCache settingsCache, IOptions<AppOptions> app,
    TimeProvider clock, ILogger<BillingService> logger)
{
    public async Task<SubscriptionStatusDto> StatusAsync(CancellationToken ct) => (await OverviewAsync(ct)).Status;

    public async Task<BillingOverviewDto> OverviewAsync(CancellationToken ct)
    {
        var tenantId = currentUser.RequireTenant();
        var sys = systemDb.Create();
        var s = await settingsCache.GetAsync(sys, ct);
        var t = await sys.Tenants.AsNoTracking().FirstAsync(x => x.Uuid == tenantId, ct);
        var size = t.BusinessSizeUuid is { } sid ? await sys.BusinessSizes.AsNoTracking().FirstOrDefaultAsync(x => x.Uuid == sid, ct) : null;
        var planName = t.SubscriptionPlanUuid is { } pid
            ? await sys.SubscriptionPlans.AsNoTracking().Where(x => x.Uuid == pid).Select(x => x.PlanName).FirstOrDefaultAsync(ct) : null;

        var options = new List<PlanOptionDto>();
        if (size is not null)
        {
            options = await (from p in sys.SubscriptionPlans.AsNoTracking()
                             join pr in sys.SubscriptionPlanPrices.AsNoTracking() on p.Uuid equals pr.PlanUuid
                             where p.IsActive && pr.SizeUuid == size.Uuid
                             orderby p.SortOrder, p.DurationMonths
                             select new PlanOptionDto(p.Uuid, p.PlanName, p.Description, p.DurationMonths, pr.Price,
                                 Math.Round(pr.Price / p.DurationMonths, 2))).ToListAsync(ct);
        }

        var status = BillingMapping.Status(t, s, clock.GetUtcNow(), planName, size?.SizeName);
        var online = BillingMapping.Bkash(s, protector) is not null;
        // A business that has no size yet (it existed before sizes) chooses one itself, once.
        var sizes = size is null
            ? await sys.BusinessSizes.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.SortOrder)
                .Select(x => new SizeOptionDto(x.Uuid, x.SizeName, x.Description)).ToListAsync(ct)
            : [];
        return new BillingOverviewDto(status, size?.Uuid, size?.SizeName, options, s.BillingEnabled, online,
            currentUser.Role == Role.Admin, s.SupportPhone, s.SupportEmail, s.GraceDays, t.TenantCode, sizes);
    }

    /// <summary>Sets the business size when it has none; afterwards only the super admin changes it.</summary>
    public async Task<BillingOverviewDto> ChooseSizeAsync(ChooseSizeRequest r, CancellationToken ct)
    {
        if (currentUser.Role != Role.Admin) throw DomainException.Forbidden("Only an admin can choose the business size.");
        var tenantId = currentUser.RequireTenant();
        var sys = systemDb.Create();
        if (r.SizeUuid is not { } sizeId || !await sys.BusinessSizes.AnyAsync(x => x.Uuid == sizeId && x.IsActive, ct))
            throw DomainException.Validation("sizeUuid", "Choose your business size.");
        var t = await sys.Tenants.FirstAsync(x => x.Uuid == tenantId, ct);
        if (t.BusinessSizeUuid is not null)
            throw DomainException.Rule(ErrorCodes.BusinessRule, "Your business size is already set. Please contact support to change it.");
        sys.SetAuditUser(currentUser.UserUuid, currentUser.UserName);
        t.BusinessSizeUuid = sizeId;
        await sys.SaveChangesAsync(ct);
        return await OverviewAsync(ct);
    }

    public async Task<PagedResult<BillingPaymentDto>> PaymentsAsync(PageQuery q, CancellationToken ct)
    {
        var tenantId = currentUser.RequireTenant();
        var sys = systemDb.Create();
        var page = await sys.BillingPayments.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.TenantUuid == tenantId)
            .OrderByDescending(p => p.CreatedDate)
            .ToPagedAsync(q, p => p, ct);
        return new PagedResult<BillingPaymentDto>(page.Items.Select(p => BillingMapping.ToDto(p)).ToList(), page.Page, page.PageSize, page.TotalCount);
    }

    /// <summary>Starts a bKash payment for a package; the browser then goes to bKash's page.</summary>
    public async Task<CheckoutResultDto> CheckoutAsync(CheckoutRequest r, CancellationToken ct)
    {
        if (currentUser.Role != Role.Admin) throw DomainException.Forbidden("Only an admin can pay for the subscription.");
        var tenantId = currentUser.RequireTenant();
        if (r.PlanUuid is null) throw DomainException.Validation("planUuid", "Choose a package.");

        var sys = systemDb.Create();
        var s = await settingsCache.GetAsync(sys, ct);
        if (!s.BillingEnabled) throw DomainException.Rule(ErrorCodes.BusinessRule, "Billing is not switched on.");
        var credentials = BillingMapping.Bkash(s, protector)
            ?? throw DomainException.Rule(ErrorCodes.BusinessRule, "Online payment is not available yet. Please contact support.");

        var t = await sys.Tenants.AsNoTracking().FirstAsync(x => x.Uuid == tenantId, ct);
        if (t.BusinessSizeUuid is null)
            throw DomainException.Rule(ErrorCodes.BusinessRule, "Your business size is not set yet. Please contact support.");
        var offer = await (from p in sys.SubscriptionPlans.AsNoTracking()
                           join pr in sys.SubscriptionPlanPrices.AsNoTracking() on p.Uuid equals pr.PlanUuid
                           join z in sys.BusinessSizes.AsNoTracking() on pr.SizeUuid equals z.Uuid
                           where p.Uuid == r.PlanUuid && p.IsActive && pr.SizeUuid == t.BusinessSizeUuid
                           select new { p.Uuid, p.PlanName, p.DurationMonths, pr.Price, z.SizeName }).FirstOrDefaultAsync(ct)
            ?? throw DomainException.Validation("planUuid", "This package is not available for your business.");
        if (offer.Price <= 0) throw DomainException.Rule(ErrorCodes.BusinessRule, "This package is free; there is nothing to pay.");

        var now = clock.GetUtcNow();
        var payment = new BillingPayment
        {
            Uuid = Guid.NewGuid(),
            TenantUuid = tenantId,
            PlanUuid = offer.Uuid,
            PlanName = offer.PlanName,
            SizeName = offer.SizeName,
            DurationMonths = offer.DurationMonths,
            Amount = offer.Price,
            Provider = BillingProvider.Bkash,
            Status = BillingPaymentStatus.Initiated,
            InvoiceNumber = BillingMapping.NewInvoiceNumber(now),
            CreatedDate = now,
            CreatedByUserUuid = currentUser.UserUuid,
            CreatedByUserName = currentUser.UserName,
        };
        sys.SetAuditUser(currentUser.UserUuid, currentUser.UserName);
        sys.BillingPayments.Add(payment);
        await sys.SaveChangesAsync(ct);

        try
        {
            var callback = app.Value.PublicBaseUrl.TrimEnd('/') + "/api/v1/billing/bkash/callback";
            var created = await bkash.CreateAsync(credentials, payment.Amount, payment.InvoiceNumber, t.TenantCode, callback, ct);
            payment.ProviderPaymentId = created.PaymentId;
            await sys.SaveChangesAsync(ct);
            return new CheckoutResultDto(created.RedirectUrl, payment.InvoiceNumber);
        }
        catch (BkashException e)
        {
            logger.LogWarning("bKash create payment failed for {Invoice}: {Message}", payment.InvoiceNumber, e.Message);
            await ledger.FailAsync(sys, payment.Uuid, BillingPaymentStatus.Failed, e.Message, ct);
            throw DomainException.Rule(ErrorCodes.BusinessRule, "bKash could not start the payment. Please try again in a few minutes.");
        }
    }

    /// <summary>
    /// bKash sends the payer's browser here when they finish, fail or cancel. Nothing is trusted
    /// from the request: a "success" is only recorded after bKash itself confirms the payment.
    /// </summary>
    public async Task<CallbackOutcome> HandleCallbackAsync(string? paymentId, string? status, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(paymentId)) return new CallbackOutcome("failed", null);
        var sys = systemDb.Create();
        var payment = await sys.BillingPayments.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.ProviderPaymentId == paymentId, ct);
        if (payment is null) return new CallbackOutcome("failed", null);
        if (payment.Status == BillingPaymentStatus.Completed) return new CallbackOutcome("success", payment.InvoiceNumber);

        switch (status?.Trim().ToLowerInvariant())
        {
            case "success":
                var done = await ConfirmWithBkashAsync(sys, payment, execute: true, ct);
                return new CallbackOutcome(done.Status == BillingPaymentStatus.Completed ? "success" : "failed", payment.InvoiceNumber);
            case "cancel":
                await ledger.FailAsync(sys, payment.Uuid, BillingPaymentStatus.Cancelled, "Cancelled on the bKash page.", ct);
                return new CallbackOutcome("cancelled", payment.InvoiceNumber);
            default:
                await ledger.FailAsync(sys, payment.Uuid, BillingPaymentStatus.Failed, "The payment failed on the bKash page.", ct);
                return new CallbackOutcome("failed", payment.InvoiceNumber);
        }
    }

    /// <summary>"Check again": asks bKash about a payment still waiting (e.g. the browser closed before returning).</summary>
    public async Task<BillingPaymentDto> VerifyAsync(Guid id, CancellationToken ct)
    {
        var tenantId = currentUser.RequireTenant();
        var sys = systemDb.Create();
        var payment = await sys.BillingPayments.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Uuid == id && p.TenantUuid == tenantId, ct)
                      ?? throw DomainException.NotFound("Payment");
        return BillingMapping.ToDto(await ConfirmWithBkashAsync(sys, payment, execute: false, ct));
    }

    /// <summary>
    /// Executes (first time) or queries a bKash payment and records the result. Also used by the
    /// super admin's "check again".
    /// </summary>
    internal async Task<BillingPayment> ConfirmWithBkashAsync(IAppDbContext sys, BillingPayment payment, bool execute, CancellationToken ct)
    {
        if (payment.Status != BillingPaymentStatus.Initiated || payment.Provider != BillingProvider.Bkash || payment.ProviderPaymentId is null)
            return payment;
        var s = await settingsCache.GetAsync(sys, ct);
        var credentials = BillingMapping.Bkash(s, protector)
            ?? throw DomainException.Rule(ErrorCodes.BusinessRule, "bKash is not set up, so the payment cannot be checked.");

        BkashPaymentResult? result = null;
        try
        {
            if (execute) result = await bkash.ExecuteAsync(credentials, payment.ProviderPaymentId, ct);
        }
        catch (BkashException e)
        {
            // An execute that failed or timed out may still have gone through: ask bKash below.
            logger.LogWarning("bKash execute failed for {Invoice}: {Message}", payment.InvoiceNumber, e.Message);
        }
        try
        {
            if (result is not { Completed: true }) result = await bkash.QueryAsync(credentials, payment.ProviderPaymentId, ct);
        }
        catch (BkashException e)
        {
            logger.LogWarning("bKash query failed for {Invoice}: {Message}", payment.InvoiceNumber, e.Message);
            return payment; // unknown for now: stays "waiting" and can be checked again
        }

        if (result.Completed)
        {
            var completed = await ledger.CompleteAsync(sys, payment.Uuid, result.TrxId, result.PayerAccount, result.Message, ct);
            logger.LogInformation("Subscription payment {Invoice} completed (bKash {TrxId})", completed.InvoiceNumber, completed.TrxId);
            return completed;
        }
        var final = result.TransactionStatus?.ToLowerInvariant() switch
        {
            "cancelled" => BillingPaymentStatus.Cancelled,
            "failed" or "expired" or "declined" => BillingPaymentStatus.Failed,
            _ => (BillingPaymentStatus?)null, // "Initiated": the payer has not finished yet
        };
        return final is { } st ? await ledger.FailAsync(sys, payment.Uuid, st, result.Message, ct) : payment;
    }
}
