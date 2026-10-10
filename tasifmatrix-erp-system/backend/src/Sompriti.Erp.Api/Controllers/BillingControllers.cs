using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Application.Common;

namespace Sompriti.Erp.Api.Controllers;

/// <summary>
/// A business's own subscription: everyone in the business sees it; only an admin pays.
/// Reachable even when the subscription has run out (see SubscriptionGateMiddleware).
/// </summary>
[ApiController]
[Route("api/v1/billing")]
[Authorize] // roles are set per action
public sealed class BillingController(BillingService service) : ControllerBase
{
    [HttpGet, Authorize(Roles = "ADMIN,MANAGER,USER")]
    public Task<BillingOverviewDto> Overview(CancellationToken ct) => service.OverviewAsync(ct);

    [HttpGet("status"), Authorize(Roles = "ADMIN,MANAGER,USER")]
    public Task<SubscriptionStatusDto> Status(CancellationToken ct) => service.StatusAsync(ct);

    [HttpPost("size"), Authorize(Roles = Roles.Admin)]
    public Task<BillingOverviewDto> ChooseSize(ChooseSizeRequest r, CancellationToken ct) => service.ChooseSizeAsync(r, ct);

    [HttpGet("payments"), Authorize(Roles = Roles.Admin)]
    public Task<PagedResult<BillingPaymentDto>> Payments([FromQuery] PageQuery q, CancellationToken ct) => service.PaymentsAsync(q, ct);

    /// <summary>Starts a bKash payment; the app then opens RedirectUrl (bKash's payment page).</summary>
    [HttpPost("checkout"), Authorize(Roles = Roles.Admin)]
    public Task<CheckoutResultDto> Checkout(CheckoutRequest r, CancellationToken ct) => service.CheckoutAsync(r, ct);

    [HttpPost("payments/{id:guid}/verify"), Authorize(Roles = Roles.Admin)]
    public Task<BillingPaymentDto> Verify(Guid id, CancellationToken ct) => service.VerifyAsync(id, ct);

    /// <summary>
    /// bKash returns the payer's browser here (?paymentID=...&amp;status=success|failure|cancel).
    /// The result is confirmed with bKash, then the browser goes to the app's result page.
    /// </summary>
    [HttpGet("bkash/callback"), AllowAnonymous]
    public async Task<IActionResult> BkashCallback([FromQuery] string? paymentID, [FromQuery] string? status, CancellationToken ct)
    {
        var outcome = await service.HandleCallbackAsync(paymentID, status, ct);
        var query = $"status={Uri.EscapeDataString(outcome.Status)}";
        if (outcome.InvoiceNumber is { } invoice) query += $"&invoice={Uri.EscapeDataString(invoice)}";
        return Redirect("/payment-result?" + query);
    }
}

/// <summary>The super admin's billing: switches, bKash account, packages, sizes, payments.</summary>
[ApiController]
[Route("api/v1/platform/billing")]
[Authorize(Roles = Roles.SuperAdmin)]
public sealed class PlatformBillingController(PlatformBillingService service) : ControllerBase
{
    [HttpGet("settings")]
    public Task<BillingSettingsDto> Settings(CancellationToken ct) => service.SettingsAsync(ct);

    [HttpPut("settings")]
    public Task<BillingSettingsSavedDto> SaveSettings(BillingSettingsRequest r, CancellationToken ct) => service.SaveSettingsAsync(r, ct);

    /// <summary>Checks a bKash account (the form's values, falling back to the saved secrets) without saving.</summary>
    [HttpPost("settings/test-bkash")]
    public async Task<IActionResult> TestBkash(BillingSettingsRequest r, CancellationToken ct)
    {
        await service.TestBkashAsync(r, ct);
        return Ok(new { message = "bKash accepted the account." });
    }

    [HttpGet("sizes")]
    public Task<IReadOnlyList<SizeDto>> Sizes(CancellationToken ct) => service.SizesAsync(ct);

    [HttpPost("sizes")]
    public Task<SizeDto> CreateSize(SizeRequest r, CancellationToken ct) => service.SaveSizeAsync(null, r, ct);

    [HttpPut("sizes/{id:guid}")]
    public Task<SizeDto> UpdateSize(Guid id, SizeRequest r, CancellationToken ct) => service.SaveSizeAsync(id, r, ct);

    [HttpGet("plans")]
    public Task<IReadOnlyList<PlanDto>> Plans(CancellationToken ct) => service.PlansAsync(ct);

    [HttpPost("plans")]
    public Task<PlanDto> CreatePlan(PlanRequest r, CancellationToken ct) => service.SavePlanAsync(null, r, ct);

    [HttpPut("plans/{id:guid}")]
    public Task<PlanDto> UpdatePlan(Guid id, PlanRequest r, CancellationToken ct) => service.SavePlanAsync(id, r, ct);

    [HttpGet("payments")]
    public Task<PagedResult<BillingPaymentDto>> Payments([FromQuery] PaymentListQuery q, CancellationToken ct) => service.PaymentsAsync(q, ct);

    [HttpPost("payments/{id:guid}/verify")]
    public Task<BillingPaymentDto> Verify(Guid id, CancellationToken ct) => service.VerifyPaymentAsync(id, ct);

    [HttpGet("businesses/{id:guid}")]
    public Task<BusinessSubscriptionDto> Subscription(Guid id, CancellationToken ct) => service.SubscriptionOfAsync(id, ct);

    [HttpPut("businesses/{id:guid}")]
    public Task<BusinessSubscriptionDto> UpdateSubscription(Guid id, BusinessSubscriptionRequest r, CancellationToken ct) =>
        service.UpdateSubscriptionAsync(id, r, ct);

    [HttpPost("businesses/{id:guid}/payments")]
    public Task<BillingPaymentDto> RecordPayment(Guid id, ManualPaymentRequest r, CancellationToken ct) =>
        service.RecordManualPaymentAsync(id, r, ct);

    /// <summary>Businesses above their size's monthly order limit (for the alert on the Businesses page).</summary>
    [HttpGet("size-alerts")]
    public Task<IReadOnlyList<SizeAlertDto>> SizeAlerts(CancellationToken ct) => service.SizeAlertsAsync(ct);

    /// <summary>Keep the business on its size: no size alert for it for a number of days.</summary>
    [HttpPost("businesses/{id:guid}/keep-size")]
    public Task<BusinessSubscriptionDto> KeepSize(Guid id, KeepSizeRequest r, CancellationToken ct) => service.KeepSizeAsync(id, r, ct);

    /// <summary>Special package prices for one business (replaces them all).</summary>
    [HttpPut("businesses/{id:guid}/prices")]
    public Task<BusinessSubscriptionDto> SpecialPrices(Guid id, SpecialPricesRequest r, CancellationToken ct) =>
        service.SaveSpecialPricesAsync(id, r, ct);
}
