using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Sompriti.Erp.Api.Infrastructure;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.Reports;
using Sompriti.Erp.Application.Sms;
using Sompriti.Erp.Application.Stock;

namespace Sompriti.Erp.Api.Controllers;

[ApiController]
[Route("api/v1/stock")]
[Authorize] // roles are set per action
public sealed class StockController(StockService service) : ControllerBase
{
    [HttpGet("balances"), Authorize(Roles = Roles.AdminOrManager)]
    public Task<PagedResult<StockBalanceDto>> Balances([FromQuery] PageQuery q, [FromQuery] Guid? productUuid,
        [FromQuery] bool lowStockOnly, CancellationToken ct) => service.BalancesAsync(q, productUuid, lowStockOnly, ct);

    /// <summary>MANAGER sees sales movements only (filtered in the service).</summary>
    [HttpGet("ledger"), Authorize(Roles = Roles.AdminOrManager)]
    public Task<PagedResult<StockLedgerDto>> Ledger([FromQuery] StockLedgerQuery q, CancellationToken ct) => service.LedgerAsync(q, ct);

    [HttpGet("adjustments"), Authorize(Roles = Roles.Admin)]
    public Task<PagedResult<StockAdjustmentDto>> Adjustments([FromQuery] PageQuery q, [FromQuery] Guid? productUuid, CancellationToken ct) =>
        service.AdjustmentsAsync(q, productUuid, ct);

    [HttpPost("adjustments"), Authorize(Roles = Roles.Admin)]
    public Task<StockAdjustmentDto> CreateAdjustment(StockAdjustmentRequest r, CancellationToken ct) => service.CreateAdjustmentAsync(r, ct);
}

[ApiController]
[Route("api/v1/reports")]
[Authorize] // role and linked-entity scoping is enforced in ReportService
public sealed class ReportsController(ReportService service, IReportPdfRenderer renderer, PdfMailer mailer) : ControllerBase
{
    [HttpGet("customers")]
    public Task<PartyReport> Customers([FromQuery] ReportQuery q, CancellationToken ct) => service.CustomerReportAsync(q, ct);

    [HttpGet("suppliers"), Authorize(Roles = "ADMIN,USER")]
    public Task<PartyReport> Suppliers([FromQuery] ReportQuery q, CancellationToken ct) => service.SupplierReportAsync(q, ct);

    [HttpGet("companies"), Authorize(Roles = Roles.AdminOrManager)]
    public Task<IReadOnlyList<CompanyReportRow>> Companies([FromQuery] ReportQuery q, CancellationToken ct) => service.CompanyReportAsync(q, ct);

    // ---------------------------------------------------------------- printable versions
    // Each returns every row matching the filters, not just the page on screen. Role checks
    // mirror the data endpoint above, and ReportService scopes rows for linked users.

    [HttpGet("customers/pdf")]
    public Task<IActionResult> CustomersPdf([FromQuery] ReportQuery q, [FromQuery] bool download, CancellationToken ct) =>
        Pdf(service.PartyReportDocumentAsync(customers: true, q, ct), download);

    [HttpGet("suppliers/pdf"), Authorize(Roles = "ADMIN,USER")]
    public Task<IActionResult> SuppliersPdf([FromQuery] ReportQuery q, [FromQuery] bool download, CancellationToken ct) =>
        Pdf(service.PartyReportDocumentAsync(customers: false, q, ct), download);

    [HttpGet("companies/pdf"), Authorize(Roles = Roles.AdminOrManager)]
    public Task<IActionResult> CompaniesPdf([FromQuery] ReportQuery q, [FromQuery] bool download, CancellationToken ct) =>
        Pdf(service.CompanyReportDocumentAsync(q, ct), download);

    [HttpGet("due/sales/pdf")]
    public Task<IActionResult> SalesDuePdf([FromQuery] ReportQuery q, [FromQuery] bool download, CancellationToken ct) =>
        Pdf(service.DueReportDocumentAsync(Domain.Enums.TransactionType.Sales, q, ct), download);

    [HttpGet("due/purchase/pdf"), Authorize(Roles = "ADMIN,USER")]
    public Task<IActionResult> PurchaseDuePdf([FromQuery] ReportQuery q, [FromQuery] bool download, CancellationToken ct) =>
        Pdf(service.DueReportDocumentAsync(Domain.Enums.TransactionType.Purchase, q, ct), download);

    // ---------------------------------------------------------------- email the printable version
    // Sharing a report from a desktop browser: the browser cannot attach a file to an email, so
    // the server renders the same document and sends it. Filters and roles are exactly as above.

    [HttpPost("customers/pdf/email")]
    public Task<IActionResult> EmailCustomersPdf([FromQuery] ReportQuery q, EmailPdfRequest r, CancellationToken ct) =>
        EmailPdf(service.PartyReportDocumentAsync(customers: true, q, ct), r, ct);

    [HttpPost("suppliers/pdf/email"), Authorize(Roles = "ADMIN,USER")]
    public Task<IActionResult> EmailSuppliersPdf([FromQuery] ReportQuery q, EmailPdfRequest r, CancellationToken ct) =>
        EmailPdf(service.PartyReportDocumentAsync(customers: false, q, ct), r, ct);

    [HttpPost("companies/pdf/email"), Authorize(Roles = Roles.AdminOrManager)]
    public Task<IActionResult> EmailCompaniesPdf([FromQuery] ReportQuery q, EmailPdfRequest r, CancellationToken ct) =>
        EmailPdf(service.CompanyReportDocumentAsync(q, ct), r, ct);

    [HttpPost("due/sales/pdf/email")]
    public Task<IActionResult> EmailSalesDuePdf([FromQuery] ReportQuery q, EmailPdfRequest r, CancellationToken ct) =>
        EmailPdf(service.DueReportDocumentAsync(Domain.Enums.TransactionType.Sales, q, ct), r, ct);

    [HttpPost("due/purchase/pdf/email"), Authorize(Roles = "ADMIN,USER")]
    public Task<IActionResult> EmailPurchaseDuePdf([FromQuery] ReportQuery q, EmailPdfRequest r, CancellationToken ct) =>
        EmailPdf(service.DueReportDocumentAsync(Domain.Enums.TransactionType.Purchase, q, ct), r, ct);

    private async Task<IActionResult> Pdf(Task<ReportDocument> build, bool download)
    {
        var doc = await build;
        return this.PdfFile(renderer.Render(doc), doc.FileName, download);
    }

    private async Task<IActionResult> EmailPdf(Task<ReportDocument> build, EmailPdfRequest r, CancellationToken ct)
    {
        var doc = await build;
        // The date range belongs in the subject: "Customer report" alone says nothing about which months.
        var period = doc.Filters.FirstOrDefault(f => f.Label == "Period").Value;
        var description = string.IsNullOrWhiteSpace(period) ? doc.Title : $"{doc.Title} for {period}";
        await mailer.SendAsync(r, description, doc.FileName, renderer.Render(doc), ct);
        return NoContent();
    }
}

[ApiController]
[Route("api/v1/dashboard")]
[Authorize]
public sealed class DashboardController(ReportService service) : ControllerBase
{
    [HttpGet]
    public Task<DashboardDto> Get([FromQuery] Guid? companyUuid, CancellationToken ct) => service.DashboardAsync(companyUuid, ct);
}

[ApiController]
[Route("api/v1/sms")]
[Authorize(Roles = Roles.Admin)]
public sealed class SmsController(SmsService service) : ControllerBase
{
    [HttpGet]
    public Task<PagedResult<SmsLogDto>> List([FromQuery] SmsLogQuery q, CancellationToken ct) => service.ListAsync(q, ct);

    [HttpPost("{id:guid}/retry")]
    public async Task<IActionResult> Retry(Guid id, CancellationToken ct)
    {
        await service.RetryAsync(id, ct);
        return NoContent();
    }
}
