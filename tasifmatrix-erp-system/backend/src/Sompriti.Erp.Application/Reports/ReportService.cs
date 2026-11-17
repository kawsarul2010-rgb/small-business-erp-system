using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.Expenses;
using Sompriti.Erp.Application.Orders;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Reports;

public sealed record ReportQuery : PageQuery
{
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public Guid? CompanyUuid { get; init; }
    public bool DueOnly { get; init; }
}

public sealed record ProfitLossExpense(Guid CategoryUuid, string CategoryName, decimal Amount);

/// <summary>
/// Profit and loss for a period, the standard way (accrual, weighted average cost):
///   Sales                - finalized sales orders dated in the period (paid or not)
///   Cost of goods sold   - what the units sold cost, at the average cost when each sale was finalized
///   Gross profit         = Sales - Cost of goods sold
///   Operating expenses   - expenses dated in the period, by category (voided ones left out)
///   Stock loss           - stock written off by adjustments (damage, loss, corrections), at cost
///   Net profit           = Gross profit - Operating expenses - Stock loss
/// Purchases are not subtracted: stock bought is still on the shelf until it is sold, and then
/// its cost arrives as cost of goods sold. They are shown for information.
/// </summary>
public sealed record ProfitLossDto(
    DateOnly? FromDate, DateOnly? ToDate,
    int SalesOrderCount, decimal Sales, decimal CostOfGoodsSold, decimal GrossProfit, decimal? GrossMarginPercent,
    IReadOnlyList<ProfitLossExpense> Expenses, decimal TotalExpenses, decimal StockLoss,
    decimal NetProfit, decimal? NetMarginPercent, decimal Purchases);

/// <summary>The stock balance screen's filters, for its printed version.</summary>
public sealed record StockReportQuery : PageQuery
{
    public bool LowStockOnly { get; init; }
}

public sealed record PartyReportRow(Guid PartyUuid, string PartyName, string PartyCode, string MobileNumber,
    int OrderCount, decimal TotalAmount, decimal TotalPaid, decimal Due);

public sealed record ReportTotals(int OrderCount, decimal TotalAmount, decimal TotalPaid, decimal Due);

public sealed record PartyReport(PagedResult<PartyReportRow> Rows, ReportTotals Totals);

public sealed record CompanyReportRow(Guid CompanyUuid, string CompanyName, string CompanyCode,
    int SalesCount, decimal SalesTotal, decimal SalesPaid, decimal SalesDue,
    int? PurchaseCount, decimal? PurchaseTotal, decimal? PurchasePaid, decimal? PurchaseDue);

public sealed record DashboardDto(
    Role Role,
    decimal? TodaySales, decimal? MonthSales, decimal? MonthPurchases,
    decimal? CustomerDue, decimal? SupplierDue,
    int? DraftSalesOrders, int? DraftPurchaseOrders,
    IReadOnlyList<LowStockItem> LowStock,
    IReadOnlyList<OrderListItemDto> LatestSales,
    IReadOnlyList<OrderListItemDto> LatestPurchases,
    LinkedSummary? AsBuyer, LinkedSummary? AsSupplier,
    IReadOnlyList<DailyTotal> SalesLast30Days,
    /// <summary>Admin only, and only when the dashboard shows the whole business.</summary>
    decimal? MonthExpenses = null,
    decimal? MonthNetProfit = null);

public sealed record LowStockItem(Guid ProductUuid, string ProductCode, string ProductName, decimal CurrentStock, decimal Threshold);
public sealed record LinkedSummary(Guid PartyUuid, string PartyName, int OrderCount, decimal TotalAmount, decimal TotalPaid, decimal Due);
public sealed record DailyTotal(DateOnly Date, decimal Total);

public sealed class ReportService(IAppDbContext db, ICurrentUser user, TimeProvider clock,
    SalesOrderService salesOrders, PurchaseOrderService purchaseOrders, IBusinessProfile business, ExpenseService expenses)
{
    // ------------------------------------------------------------------ party reports

    public Task<PartyReport> CustomerReportAsync(ReportQuery q, CancellationToken ct)
    {
        Guid? scope = null;
        if (user.Role == Role.User)
        {
            if (user.CustomerUuid is null) return Task.FromResult(Empty(q));
            scope = user.CustomerUuid;
        }
        return PartyReportAsync<SalesOrder, Customer>(q, scope, ct);
    }

    public Task<PartyReport> SupplierReportAsync(ReportQuery q, CancellationToken ct)
    {
        if (user.Role == Role.Manager) throw DomainException.Forbidden();
        Guid? scope = null;
        if (user.Role == Role.User)
        {
            if (user.SupplierUuid is null) return Task.FromResult(Empty(q));
            scope = user.SupplierUuid;
        }
        return PartyReportAsync<PurchaseOrder, Supplier>(q, scope, ct);
    }

    private static PartyReport Empty(PageQuery q) =>
        new(new PagedResult<PartyReportRow>([], q.SafePage, q.SafePageSize, 0), new ReportTotals(0, 0, 0, 0));

    private IQueryable<TOrder> FinalOrders<TOrder>(ReportQuery q) where TOrder : OrderHeader
    {
        var orders = db.Set<TOrder>().AsNoTracking()
            .Where(o => o.Status == RecordStatus.Active && o.PostingStatus == PostingStatus.Final);
        if (q.FromDate is { } f) orders = orders.Where(o => o.OrderDate >= f);
        if (q.ToDate is { } t) orders = orders.Where(o => o.OrderDate <= t);
        if (q.CompanyUuid is { } c) orders = orders.Where(o => o.CompanyUuid == c);
        return orders;
    }

    private async Task<PartyReport> PartyReportAsync<TOrder, TParty>(ReportQuery q, Guid? scope, CancellationToken ct)
        where TOrder : OrderHeader where TParty : PartyEntity
    {
        var orders = FinalOrders<TOrder>(q);
        var parties = db.Set<TParty>().AsNoTracking().AsQueryable();
        if (scope is { } s) parties = parties.Where(p => p.Uuid == s);
        if (q.Term is { } term)
        {
            var t = term.ToLower();
            parties = parties.Where(p => p.Name.ToLower().Contains(t) || p.Code!.Contains(t));
        }

        // Project to an anonymous type first: EF can filter/sort anonymous members but not record constructor arguments.
        var rows = from p in parties
                   where p.Status == RecordStatus.Active || orders.Any(o => o.PartyUuid == p.Uuid)
                   select new
                   {
                       p.Uuid,
                       p.Name,
                       Code = p.Code!,
                       p.MobileNumber,
                       // A previous due is not an order: it counts towards the money, not the order count.
                       Count = orders.Count(o => o.PartyUuid == p.Uuid && !o.IsOpeningDue),
                       Total = orders.Where(o => o.PartyUuid == p.Uuid).Sum(o => (decimal?)o.TotalAmount) ?? 0,
                       Paid = orders.Where(o => o.PartyUuid == p.Uuid).Sum(o => (decimal?)o.TotalPaidAmount) ?? 0,
                   };

        if (q.DueOnly) rows = rows.Where(r => r.Total - r.Paid > 0);

        var desc = q.Sort?.StartsWith('-') ?? true;
        rows = q.Sort?.TrimStart('-') switch
        {
            "partyName" => desc ? rows.OrderByDescending(r => r.Name) : rows.OrderBy(r => r.Name),
            "totalAmount" => desc ? rows.OrderByDescending(r => r.Total) : rows.OrderBy(r => r.Total),
            "totalPaid" => desc ? rows.OrderByDescending(r => r.Paid) : rows.OrderBy(r => r.Paid),
            _ => desc ? rows.OrderByDescending(r => r.Total - r.Paid).ThenBy(r => r.Name) : rows.OrderBy(r => r.Total - r.Paid).ThenBy(r => r.Name)
        };

        var page = await rows.ToPagedAsync(q, r => new PartyReportRow(r.Uuid, r.Name, r.Code, r.MobileNumber, r.Count, r.Total, r.Paid, r.Total - r.Paid), ct);
        page = page with { Items = page.Items.Select(r => r with { MobileNumber = Domain.Rules.BdMobile.ToDisplay(r.MobileNumber) }).ToList() };

        var scoped = scope is { } sc ? orders.Where(o => o.PartyUuid == sc) : orders;
        var totalsRow = await scoped.GroupBy(_ => 1)
            .Select(g => new ReportTotals(g.Count(o => !o.IsOpeningDue), g.Sum(o => o.TotalAmount), g.Sum(o => o.TotalPaidAmount), g.Sum(o => o.TotalAmount - o.TotalPaidAmount)))
            .FirstOrDefaultAsync(ct);
        return new PartyReport(page, totalsRow ?? new ReportTotals(0, 0, 0, 0));
    }

    // ------------------------------------------------------------------ company report

    public async Task<IReadOnlyList<CompanyReportRow>> CompanyReportAsync(ReportQuery q, CancellationToken ct)
    {
        if (user.Role == Role.User) throw DomainException.Forbidden();
        var includePurchases = user.Role == Role.Admin;
        var sales = FinalOrders<SalesOrder>(q);
        var purchases = FinalOrders<PurchaseOrder>(q);

        var companies = await db.Companies.AsNoTracking()
            .Where(c => c.Status == RecordStatus.Active || sales.Any(o => o.CompanyUuid == c.Uuid) || purchases.Any(o => o.CompanyUuid == c.Uuid))
            .OrderBy(c => c.CompanyName)
            .Select(c => new
            {
                c.Uuid, c.CompanyName, c.CompanyCode,
                SalesCount = sales.Count(o => o.CompanyUuid == c.Uuid && !o.IsOpeningDue),
                SalesTotal = sales.Where(o => o.CompanyUuid == c.Uuid).Sum(o => (decimal?)o.TotalAmount) ?? 0,
                SalesPaid = sales.Where(o => o.CompanyUuid == c.Uuid).Sum(o => (decimal?)o.TotalPaidAmount) ?? 0,
                PurchaseCount = purchases.Count(o => o.CompanyUuid == c.Uuid && !o.IsOpeningDue),
                PurchaseTotal = purchases.Where(o => o.CompanyUuid == c.Uuid).Sum(o => (decimal?)o.TotalAmount) ?? 0,
                PurchasePaid = purchases.Where(o => o.CompanyUuid == c.Uuid).Sum(o => (decimal?)o.TotalPaidAmount) ?? 0,
            }).ToListAsync(ct);

        return companies.Select(c => new CompanyReportRow(c.Uuid, c.CompanyName, c.CompanyCode,
            c.SalesCount, c.SalesTotal, c.SalesPaid, c.SalesTotal - c.SalesPaid,
            includePurchases ? c.PurchaseCount : null, includePurchases ? c.PurchaseTotal : null,
            includePurchases ? c.PurchasePaid : null, includePurchases ? c.PurchaseTotal - c.PurchasePaid : null)).ToList();
    }

    // ------------------------------------------------------------------ printable reports

    /// <summary>Customer or supplier report as a printable document, every matching row.</summary>
    public async Task<ReportDocument> PartyReportDocumentAsync(bool customers, ReportQuery q, CancellationToken ct)
    {
        // A printed report covers the whole selection, not whichever page happened to be open.
        var all = q with { Page = 1, AllRows = true };
        var report = customers ? await CustomerReportAsync(all, ct) : await SupplierReportAsync(all, ct);
        var party = customers ? "Customer" : "Supplier";

        var rows = report.Rows.Items.Select(r => new ReportRow(new[]
        {
            r.PartyCode,
            r.PartyName,
            BdMobile.ToDisplay(r.MobileNumber),
            r.OrderCount.ToString(Invariant),
            Money.FormatPlain(r.TotalAmount),
            Money.FormatPlain(r.TotalPaid),
            Money.FormatPlain(r.Due),
        })).ToList();

        return new ReportDocument(
            Title: $"{party} report",
            BusinessName: await business.NameAsync(ct),
            Filters: await FiltersAsync(q, extra: q.DueOnly ? "With due only" : null, ct),
            Columns: new[]
            {
                new ReportColumn("Code", 54),
                new ReportColumn($"{party} name"),
                new ReportColumn("Mobile", 74),
                new ReportColumn("Orders", 42, RightAligned: true),
                new ReportColumn("Total", 72, RightAligned: true),
                new ReportColumn("Paid", 72, RightAligned: true),
                new ReportColumn("Due", 72, RightAligned: true),
            },
            Rows: rows,
            Totals: new[]
            {
                "TOTAL", "", "",
                report.Totals.OrderCount.ToString(Invariant),
                Money.FormatPlain(report.Totals.TotalAmount),
                Money.FormatPlain(report.Totals.TotalPaid),
                Money.FormatPlain(report.Totals.Due),
            },
            FileName: FileName(customers ? "customer-report" : "supplier-report", q.FromDate, q.ToDate));
    }

    /// <summary>Company report as a printable document. Purchases are admin-only, as on screen.</summary>
    public async Task<ReportDocument> CompanyReportDocumentAsync(ReportQuery q, CancellationToken ct)
    {
        var rows = await CompanyReportAsync(q, ct);
        var withPurchases = rows.Count > 0 && rows[0].PurchaseCount is not null;

        // A business has one company, named in the header already: then the page is that company's
        // figures alone - no code or name column, and no total row repeating the one row.
        if (rows.Count == 1 && await SingleCompanyNameAsync(ct) is not null)
            return SingleCompanyDocument(rows[0], withPurchases, await business.NameAsync(ct), await FiltersAsync(q, extra: null, ct),
                FileName("company-report", q.FromDate, q.ToDate));

        var columns = new List<ReportColumn>
        {
            new("Code", 60),
            new("Company"),
            new("Sales", 46, RightAligned: true),
            new("Sales total", 78, RightAligned: true),
            new("Sales due", 78, RightAligned: true),
        };
        if (withPurchases)
        {
            columns.Add(new ReportColumn("Purchases", 58, RightAligned: true));
            columns.Add(new ReportColumn("Purchase total", 82, RightAligned: true));
            columns.Add(new ReportColumn("Purchase due", 78, RightAligned: true));
        }

        var body = rows.Select(r =>
        {
            var cells = new List<string>
            {
                r.CompanyCode, r.CompanyName,
                r.SalesCount.ToString(Invariant), Money.FormatPlain(r.SalesTotal), Money.FormatPlain(r.SalesDue),
            };
            if (withPurchases)
            {
                cells.Add((r.PurchaseCount ?? 0).ToString(Invariant));
                cells.Add(Money.FormatPlain(r.PurchaseTotal ?? 0));
                cells.Add(Money.FormatPlain(r.PurchaseDue ?? 0));
            }
            return new ReportRow(cells);
        }).ToList();

        var totals = new List<string>
        {
            "TOTAL", "",
            rows.Sum(r => r.SalesCount).ToString(Invariant),
            Money.FormatPlain(rows.Sum(r => r.SalesTotal)),
            Money.FormatPlain(rows.Sum(r => r.SalesDue)),
        };
        if (withPurchases)
        {
            totals.Add(rows.Sum(r => r.PurchaseCount ?? 0).ToString(Invariant));
            totals.Add(Money.FormatPlain(rows.Sum(r => r.PurchaseTotal ?? 0)));
            totals.Add(Money.FormatPlain(rows.Sum(r => r.PurchaseDue ?? 0)));
        }

        return new ReportDocument("Company report", await business.NameAsync(ct),
            await FiltersAsync(q, extra: null, ct), columns, body, totals,
            FileName("company-report", q.FromDate, q.ToDate));
    }

    private static ReportDocument SingleCompanyDocument(CompanyReportRow r, bool withPurchases, string businessName,
        IReadOnlyList<(string, string)> filters, string fileName)
    {
        var columns = new List<ReportColumn>
        {
            new("Sales", 56, RightAligned: true),
            new("Sales total", 0, RightAligned: true),
            new("Sales paid", 0, RightAligned: true),
            new("Sales due", 0, RightAligned: true),
        };
        var cells = new List<string>
        {
            r.SalesCount.ToString(Invariant), Money.FormatPlain(r.SalesTotal), Money.FormatPlain(r.SalesPaid), Money.FormatPlain(r.SalesDue),
        };
        if (withPurchases)
        {
            columns.AddRange(new ReportColumn[]
            {
                new("Purchases", 64, RightAligned: true),
                new("Purchase total", 0, RightAligned: true),
                new("Purchase paid", 0, RightAligned: true),
                new("Purchase due", 0, RightAligned: true),
            });
            cells.AddRange(new[]
            {
                (r.PurchaseCount ?? 0).ToString(Invariant), Money.FormatPlain(r.PurchaseTotal ?? 0),
                Money.FormatPlain(r.PurchasePaid ?? 0), Money.FormatPlain(r.PurchaseDue ?? 0),
            });
        }
        return new ReportDocument("Company report", businessName, filters, columns, [new ReportRow(cells)], [], fileName);
    }

    /// <summary>Finalized orders still carrying a due, oldest first.</summary>
    public async Task<ReportDocument> DueReportDocumentAsync(TransactionType type, ReportQuery q, CancellationToken ct)
    {
        var sales = type == TransactionType.Sales;
        var listQuery = new OrderListQuery
        {
            AllRows = true,
            PostingStatus = Domain.Enums.PostingStatus.Final,
            DueOnly = true,
            Sort = "orderDate",
            FromDate = q.FromDate,
            ToDate = q.ToDate,
            CompanyUuid = q.CompanyUuid,
        };
        var paged = sales
            ? await salesOrders.ListAsync(listQuery, ct)
            : await purchaseOrders.ListAsync(listQuery, ct);

        var today = BusinessClock.Today(clock.GetUtcNow());
        // With one company (the usual case) a company column would repeat the same name on every row.
        var showCompany = await SingleCompanyNameAsync(ct) is null;
        var rows = paged.Items.Select(o => new ReportRow(new[]
        {
            o.OrderNumber,
            o.OrderDate.ToString("dd MMM yyyy", Invariant),
            Math.Max(0, today.DayNumber - o.OrderDate.DayNumber).ToString(Invariant),
            PartyCell(o),
            showCompany ? o.CompanyName : null,
            Money.FormatPlain(o.TotalAmount),
            Money.FormatPlain(o.TotalPaidAmount),
            Money.FormatPlain(o.DueAmount),
        }.OfType<string>().ToArray())).ToList();

        return new ReportDocument(
            Title: sales ? "Customer due report" : "Supplier due report",
            BusinessName: await business.NameAsync(ct),
            Filters: await FiltersAsync(q, extra: "Finalized orders with an outstanding balance", ct),
            Columns: new[]
            {
                new ReportColumn("Order no.", 62),
                new ReportColumn("Date", 68),
                new ReportColumn("Days", 34, RightAligned: true),
                new ReportColumn(sales ? "Customer" : "Supplier"),
                showCompany ? new ReportColumn("Company", 92) : null,
                new ReportColumn("Total", 70, RightAligned: true),
                new ReportColumn("Paid", 70, RightAligned: true),
                new ReportColumn("Due", 70, RightAligned: true),
            }.OfType<ReportColumn>().ToArray(),
            Rows: rows,
            Totals: new[]
            {
                "TOTAL", "", "", "", showCompany ? "" : null,
                Money.FormatPlain(paged.Items.Sum(o => o.TotalAmount)),
                Money.FormatPlain(paged.Items.Sum(o => o.TotalPaidAmount)),
                Money.FormatPlain(paged.Items.Sum(o => o.DueAmount)),
            }.OfType<string>().ToArray(),
            FileName: FileName(sales ? "customer-due-report" : "supplier-due-report", q.FromDate, q.ToDate));
    }

    /// <summary>
    /// The sales or purchase order list as printed: every order matching the screen's filters.
    /// With one customer or supplier selected it doubles as that party's statement - their
    /// details head the page and the party column is dropped. Totals count finalized orders
    /// only, as drafts and voided orders owe nothing.
    /// </summary>
    public async Task<ReportDocument> OrderListDocumentAsync(TransactionType type, OrderListQuery q, CancellationToken ct)
    {
        var sales = type == TransactionType.Sales;
        if (!sales && user.Role == Role.Manager) throw DomainException.Forbidden();

        // A linked customer or supplier only ever prints their own orders.
        var partyUuid = user.Role == Role.User ? (sales ? user.CustomerUuid : user.SupplierUuid) : q.PartyUuid;
        var all = q with { AllRows = true, PartyUuid = partyUuid, DueOnly = false };
        var orders = (sales ? await salesOrders.ListAsync(all, ct) : await purchaseOrders.ListAsync(all, ct)).Items;

        var partyWord = sales ? "Customer" : "Supplier";
        var filters = new List<(string, string)>();
        string? partyCode = null;
        if (partyUuid is { } pid)
        {
            var parties = sales ? (IQueryable<PartyEntity>)db.Customers : db.Suppliers;
            var party = await parties.AsNoTracking().Where(p => p.Uuid == pid)
                .Select(p => new { p.Name, p.Code, p.MobileNumber, p.Address, p.City }).FirstOrDefaultAsync(ct);
            if (party is not null)
            {
                partyCode = party.Code;
                filters.Add((partyWord, string.IsNullOrEmpty(party.Code) ? party.Name : $"{party.Name} ({party.Code})"));
                filters.Add(("Mobile", BdMobile.ToDisplay(party.MobileNumber)));
                var address = string.Join(", ", new[] { party.Address, party.City }.Where(v => !string.IsNullOrWhiteSpace(v)));
                if (address.Length > 0) filters.Add(("Address", address));
            }
        }
        filters.AddRange(await FiltersAsync(new ReportQuery { FromDate = q.FromDate, ToDate = q.ToDate, CompanyUuid = q.CompanyUuid }, null, ct));
        filters.Add(("Status", q.PostingStatus switch
        {
            PostingStatus.Draft => "Draft only",
            PostingStatus.Final => "Final only",
            PostingStatus.Void => "Void only",
            _ => "All statuses",
        }));
        if (q.Term is { } term) filters.Add(("Search", term));
        filters.Add(("Totals", "Finalized orders only"));

        // One party: room for the payment type. All parties: the narrowest columns, so names fit.
        // The company column only when the business has more than one (it has one, normally).
        var perParty = partyUuid is not null;
        var showCompany = await SingleCompanyNameAsync(ct) is null;
        float money = perParty ? 66 : 62;
        var columns = new List<ReportColumn> { new("Order no.", perParty ? 56 : 50), new("Date", perParty ? 62 : 58) };
        if (!perParty) columns.Add(new ReportColumn(partyWord));
        if (showCompany) columns.Add(perParty ? new ReportColumn("Company") : new ReportColumn("Company", 78));
        if (perParty) columns.Add(showCompany ? new ReportColumn("Payment", 60) : new ReportColumn("Payment"));
        columns.AddRange(new[]
        {
            new ReportColumn("Status", 40),
            new ReportColumn("Total", money, RightAligned: true),
            new ReportColumn("Paid", money, RightAligned: true),
            new ReportColumn("Due", money, RightAligned: true),
        });

        // With line items: each order's products under it, as on the order itself.
        var lines = q.WithLines
            ? sales ? await LinesByOrderAsync<SalesOrderLineItem>(orders, ct) : await LinesByOrderAsync<PurchaseOrderLineItem>(orders, ct)
            : null;
        if (lines is not null) filters.Add(("Line items", "Shown under each order"));

        var rows = orders.Select(o =>
        {
            var final = o.PostingStatus == PostingStatus.Final;
            var cells = new List<string> { o.OrderNumber, o.OrderDate.ToString("dd MMM yyyy", Invariant) };
            if (!perParty) cells.Add(PartyCell(o));
            if (showCompany) cells.Add(o.CompanyName);
            if (perParty) cells.Add(o.IsOpeningDue ? "Previous due" : o.PaymentType.ToString());
            cells.Add(o.PostingStatus.ToString());
            cells.Add(Money.FormatPlain(o.TotalAmount));
            cells.Add(Money.FormatPlain(o.TotalPaidAmount));
            cells.Add(final ? Money.FormatPlain(o.DueAmount) : "-");
            return new ReportRow(cells, lines?.GetValueOrDefault(o.Uuid));
        }).ToList();

        var finals = orders.Where(o => o.PostingStatus == PostingStatus.Final).ToList();
        var orderCount = finals.Count(o => !o.IsOpeningDue); // a previous due is money owed, not an order
        var totals = new List<string> { "TOTAL", orderCount == 1 ? "1 order" : $"{orderCount} orders" };
        totals.AddRange(Enumerable.Repeat("", columns.Count - 5));
        totals.Add(Money.FormatPlain(finals.Sum(o => o.TotalAmount)));
        totals.Add(Money.FormatPlain(finals.Sum(o => o.TotalPaidAmount)));
        totals.Add(Money.FormatPlain(finals.Sum(o => o.DueAmount)));

        var prefix = perParty
            ? $"{(sales ? "customer" : "supplier")}-{partyCode ?? "orders"}-orders"
            : sales ? "sales-orders" : "purchase-orders";
        if (lines is not null) prefix += "-with-items";
        return new ReportDocument(
            Title: perParty ? $"{partyWord} orders" : sales ? "Sales orders" : "Purchase orders",
            BusinessName: await business.NameAsync(ct),
            Filters: filters,
            Columns: columns,
            Rows: rows,
            Totals: totals,
            FileName: FileName(prefix, q.FromDate, q.ToDate),
            DetailColumns: lines is null ? null : LineColumns);
    }

    /// <summary>The line items' columns in a printed order list with line items.</summary>
    private static readonly ReportColumn[] LineColumns =
    [
        new("#", 18),
        new("Product"),
        new("Quantity", 130, RightAligned: true),
        new("Rate", 92, RightAligned: true),
        new("Amount", 72, RightAligned: true),
    ];

    /// <summary>
    /// The line items of the listed orders, as printable cells keyed by order. Only orders already
    /// in the list are asked for, so a user still sees only what the list let them see.
    /// </summary>
    private async Task<Dictionary<Guid, IReadOnlyList<IReadOnlyList<string>>>> LinesByOrderAsync<TLine>(
        IReadOnlyList<OrderListItemDto> orders, CancellationToken ct) where TLine : OrderLine
    {
        var result = new Dictionary<Guid, IReadOnlyList<IReadOnlyList<string>>>();
        // A previous due has no lines; asking in chunks keeps each query's id list small.
        var ids = orders.Where(o => !o.IsOpeningDue).Select(o => o.Uuid).ToList();
        foreach (var chunk in ids.Chunk(500))
        {
            var rows = await (from l in db.Set<TLine>().AsNoTracking()
                              join p in db.Products.AsNoTracking() on l.ProductUuid equals p.Uuid
                              where chunk.Contains(l.OrderUuid) && l.Status == RecordStatus.Active
                              orderby l.OrderUuid, l.LineNumber
                              select new
                              {
                                  l.OrderUuid, l.LineNumber, p.ProductName, p.ProductCode, l.QuantityType, l.BoxQuantity,
                                  l.TotalQuantity, l.PerUnitPrice, l.PerBoxPrice, l.TotalPrice, p.Uom, p.SecondaryUom,
                              }).ToListAsync(ct);
            foreach (var g in rows.GroupBy(r => r.OrderUuid))
            {
                result[g.Key] = g.Select(r =>
                {
                    var unit = Units.PrintLabel(Units.BaseUnit(r.Uom, r.SecondaryUom));
                    var total = $"{Qty.Format(r.TotalQuantity)} {unit}";
                    var byBox = r.QuantityType == QuantityType.Box && r.BoxQuantity is not null;
                    // By the box: "5 BOX = 40 PKT" at the box price; otherwise "40 PKT" at the unit price.
                    var quantity = byBox ? $"{r.BoxQuantity!.Value.ToString("#,##0", Invariant)} BOX = {total}" : total;
                    var rate = byBox && r.PerBoxPrice is { } pb
                        ? $"{Money.FormatPlain(pb)} / BOX"
                        : $"{Money.FormatPlain(r.PerUnitPrice)} / {unit}";
                    return (IReadOnlyList<string>)new[]
                    {
                        r.LineNumber.ToString(Invariant),
                        $"{r.ProductName} ({r.ProductCode})",
                        quantity,
                        rate,
                        Money.FormatPlain(r.TotalPrice),
                    };
                }).ToList();
            }
        }
        return result;
    }

    // ------------------------------------------------------------------ printable report helpers

    private static readonly System.Globalization.CultureInfo Invariant = System.Globalization.CultureInfo.InvariantCulture;

    /// <summary>The filter lines printed under the title, so a paper copy explains itself.</summary>
    private async Task<IReadOnlyList<(string, string)>> FiltersAsync(ReportQuery q, string? extra, CancellationToken ct)
    {
        var lines = new List<(string, string)> { ("Period", Period(q.FromDate, q.ToDate)) };

        if (q.CompanyUuid is { } id)
        {
            var name = await db.Companies.AsNoTracking().Where(c => c.Uuid == id)
                .Select(c => c.CompanyName).FirstOrDefaultAsync(ct);
            lines.Add(("Company", name ?? "-"));
        }
        else
        {
            // A business has one company, so "All companies" would only puzzle the reader: name it.
            lines.Add(("Company", await SingleCompanyNameAsync(ct) ?? "All companies"));
        }

        if (extra is not null) lines.Add(("Filter", extra));
        return lines;
    }

    /// <summary>The business's company name when it has exactly one (the usual case), else null.</summary>
    private async Task<string?> SingleCompanyNameAsync(CancellationToken ct)
    {
        var names = await db.Companies.AsNoTracking().Select(c => c.CompanyName).Take(2).ToListAsync(ct);
        return names.Count == 1 ? names[0] : null;
    }

    private static string Period(DateOnly? from, DateOnly? to) => (from, to) switch
    {
        (null, null) => "All dates",
        ({ } f, null) => $"{Day(f)} onwards",
        (null, { } t) => $"Up to {Day(t)}",
        ({ } f, { } t) => $"{Day(f)} to {Day(t)}",
    };

    /// <summary>The party's name; a previous due says so, as it has no order behind it.</summary>
    private static string PartyCell(OrderListItemDto o) => o.IsOpeningDue ? $"{o.PartyName} (previous due)" : o.PartyName;

    // ------------------------------------------------------------------ profit and loss

    /// <summary>Profit and loss for the period (see <see cref="ProfitLossDto"/>). Admin only: it shows costs.</summary>
    public async Task<ProfitLossDto> ProfitLossAsync(ReportQuery q, CancellationToken ct)
    {
        if (user.Role != Role.Admin) throw DomainException.Forbidden();
        var fromDate = q.FromDate;
        var toDate = q.ToDate;

        // Previous dues are money owed from before the app, not sales made: they never count.
        var sales = db.SalesOrders.AsNoTracking().Where(o => o.Status == RecordStatus.Active
            && o.PostingStatus == PostingStatus.Final && !o.IsOpeningDue
            && (fromDate == null || o.OrderDate >= fromDate) && (toDate == null || o.OrderDate <= toDate));
        var salesTotal = await sales.SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
        var salesCount = await sales.CountAsync(ct);

        // Each line was costed when its sale was finalized. A line with no recorded cost (none
        // should be left after migration 0017) falls back to the product's purchase price.
        var cogs = await (from l in db.SalesOrderLines.AsNoTracking()
                          join o in sales on l.OrderUuid equals o.Uuid
                          join p in db.Products.AsNoTracking() on l.ProductUuid equals p.Uuid
                          where l.Status == RecordStatus.Active
                          select (decimal?)(l.TotalQuantity * (l.UnitCost ?? p.ProductPurchasePrice))).SumAsync(ct) ?? 0;

        var expenseLines = await (from e in db.Expenses.AsNoTracking()
                                  join c in db.ExpenseCategories.AsNoTracking() on e.CategoryUuid equals c.Uuid
                                  where e.VoidedDate == null
                                        && (fromDate == null || e.ExpenseDate >= fromDate) && (toDate == null || e.ExpenseDate <= toDate)
                                  group e by new { c.Uuid, c.CategoryName } into g
                                  select new ProfitLossExpense(g.Key.Uuid, g.Key.CategoryName, g.Sum(e => e.Amount)))
                                 .ToListAsync(ct);
        expenseLines = expenseLines.OrderByDescending(e => e.Amount).ThenBy(e => e.CategoryName).ToList();

        // Stock written off (damage, loss, a recount finding less) is a cost; a recount finding
        // more takes it back. Opening stock is stock the business already had, not a gain.
        var adjustments = await db.StockAdjustments.AsNoTracking()
            .Where(a => a.Status == RecordStatus.Active && a.Reason != AdjustmentReason.OpeningStock
                        && (fromDate == null || a.AdjustmentDate >= fromDate) && (toDate == null || a.AdjustmentDate <= toDate))
            .Select(a => new { a.AdjustmentType, a.Quantity, Cost = a.UnitCost ?? 0 })
            .ToListAsync(ct);
        var stockLoss = adjustments.Sum(a => (a.AdjustmentType == AdjustmentType.Decrease ? 1 : -1) * Costing.Value(a.Quantity, a.Cost));

        var purchases = await db.PurchaseOrders.AsNoTracking()
            .Where(o => o.Status == RecordStatus.Active && o.PostingStatus == PostingStatus.Final && !o.IsOpeningDue
                        && (fromDate == null || o.OrderDate >= fromDate) && (toDate == null || o.OrderDate <= toDate))
            .SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;

        var cost = Money.Round(cogs);
        var gross = salesTotal - cost;
        var totalExpenses = expenseLines.Sum(e => e.Amount);
        var net = gross - totalExpenses - stockLoss;
        return new ProfitLossDto(fromDate, toDate, salesCount, salesTotal, cost, gross, Percent(gross, salesTotal),
            expenseLines, totalExpenses, stockLoss, net, Percent(net, salesTotal), purchases);
    }

    private static decimal? Percent(decimal part, decimal whole) =>
        whole == 0 ? null : Math.Round(part * 100 / whole, 1, MidpointRounding.AwayFromZero);

    public async Task<ReportDocument> ProfitLossDocumentAsync(ReportQuery q, CancellationToken ct)
    {
        var pl = await ProfitLossAsync(q, ct);
        string Amount(decimal v) => v < 0 ? "-" + Money.FormatPlain(-v) : Money.FormatPlain(v);

        var rows = new List<ReportRow>
        {
            new([pl.SalesOrderCount == 1 ? "Sales (1 order)" : $"Sales ({pl.SalesOrderCount.ToString(Invariant)} orders)", Amount(pl.Sales)]),
            new(["Less: cost of goods sold", Amount(pl.CostOfGoodsSold)]),
            new(["Gross profit", Amount(pl.GrossProfit)]),
            new(["Less: operating expenses", Amount(pl.TotalExpenses)],
                pl.Expenses.Select(e => (IReadOnlyList<string>)[e.CategoryName, Amount(e.Amount)]).ToList()),
        };
        if (pl.StockLoss != 0) rows.Add(new(["Less: stock lost or damaged", Amount(pl.StockLoss)]));

        var filters = new List<(string, string)> { ("Period", Period(q.FromDate, q.ToDate)) };
        if (pl.GrossMarginPercent is { } gm) filters.Add(("Gross margin", $"{gm.ToString("0.#", Invariant)}% of sales"));
        if (pl.NetMarginPercent is { } nm) filters.Add(("Net margin", $"{nm.ToString("0.#", Invariant)}% of sales"));
        filters.Add(("Purchases", $"{Money.Format(pl.Purchases)} bought in the period - a cost only when sold"));

        return new ReportDocument(
            Title: "Profit and loss",
            BusinessName: await business.NameAsync(ct),
            Filters: filters,
            Columns: [new ReportColumn("Particulars"), new ReportColumn("Amount (Tk)", 120, RightAligned: true)],
            Rows: rows,
            Totals: [pl.NetProfit < 0 ? "NET LOSS" : "NET PROFIT", Amount(pl.NetProfit)],
            FileName: FileName("profit-and-loss", q.FromDate, q.ToDate),
            DetailColumns: [new ReportColumn("Expense"), new ReportColumn("Amount", 120, RightAligned: true)]);
    }

    // ------------------------------------------------------------------ expense list

    /// <summary>The expense book as printed: every expense matching the screen's filters, voided ones left out.</summary>
    public async Task<ReportDocument> ExpenseListDocumentAsync(ExpenseQuery q, CancellationToken ct)
    {
        var all = q with { Page = 1, AllRows = true, IncludeVoid = false };
        var items = (await expenses.Filtered(all).ToListAsync(ct)).Select(ExpenseService.ToDto).ToList();

        var rows = items.Select(e => new ReportRow(
        [
            e.ExpenseNumber,
            Day(e.ExpenseDate),
            e.CategoryName,
            string.Join(" - ", new[] { e.PaidTo, e.Note }.Where(x => !string.IsNullOrWhiteSpace(x))),
            Label(e.PaymentMethod),
            Money.FormatPlain(e.Amount),
        ])).ToList();

        var filters = new List<(string, string)> { ("Period", Period(q.FromDate, q.ToDate)) };
        if (q.CategoryUuid is { } cid)
            filters.Add(("Category", await db.ExpenseCategories.AsNoTracking().Where(c => c.Uuid == cid)
                .Select(c => c.CategoryName).FirstOrDefaultAsync(ct) ?? "-"));
        if (q.Term is { } term) filters.Add(("Search", term));
        if (user.Role == Role.Manager) filters.Add(("Recorded by", user.UserName));

        var total = items.Sum(e => e.Amount);
        return new ReportDocument(
            Title: "Expense report",
            BusinessName: await business.NameAsync(ct),
            Filters: filters,
            Columns:
            [
                new ReportColumn("No.", 50), new ReportColumn("Date", 62), new ReportColumn("Category", 94),
                new ReportColumn("Paid to / note"), new ReportColumn("Method", 74), new ReportColumn("Amount", 78, RightAligned: true),
            ],
            Rows: rows,
            Totals: ["TOTAL", "", "", items.Count == 1 ? "1 expense" : $"{items.Count.ToString(Invariant)} expenses", "", Money.FormatPlain(total)],
            FileName: FileName("expense-report", q.FromDate, q.ToDate));
    }

    private static string Label(PaymentMethod m) => m switch
    {
        PaymentMethod.Cash => "Cash",
        PaymentMethod.Bank => "Bank",
        PaymentMethod.MobileBanking => "Mobile banking",
        PaymentMethod.Cheque => "Cheque",
        _ => "Other",
    };

    // ------------------------------------------------------------------ stock balance report

    /// <summary>
    /// Every active product with its stock on hand and what that stock is worth, at purchase and
    /// at sales price - the shop's stock valuation. Same filters and order as the stock balance
    /// screen. Purchase prices are admin-only, as on the products screen, so a manager's copy
    /// shows sales value alone.
    /// </summary>
    public async Task<ReportDocument> StockBalanceDocumentAsync(StockReportQuery q, CancellationToken ct)
    {
        if (user.Role == Role.User) throw DomainException.Forbidden();
        var withPurchase = user.Role == Role.Admin;

        var query = from s in db.StockBalances.AsNoTracking()
                    join p in db.Products.AsNoTracking() on s.ProductUuid equals p.Uuid
                    where p.Status == RecordStatus.Active
                    select new { s, p };
        if (q.Term is { } t)
        {
            var term = t.ToLower();
            query = query.Where(x => x.p.ProductName.ToLower().Contains(term) || x.p.ProductCode.ToLower().Contains(term));
        }
        if (q.LowStockOnly) query = query.Where(x => x.p.LowStockThreshold != null && x.s.CurrentStockBalance <= x.p.LowStockThreshold);

        var desc = q.Sort?.StartsWith('-') == true;
        query = q.Sort?.TrimStart('-') switch
        {
            "currentStockBalance" => desc ? query.OrderByDescending(x => x.s.CurrentStockBalance) : query.OrderBy(x => x.s.CurrentStockBalance),
            "productCode" => desc ? query.OrderByDescending(x => x.p.ProductCode) : query.OrderBy(x => x.p.ProductCode),
            _ => desc ? query.OrderByDescending(x => x.p.ProductName) : query.OrderBy(x => x.p.ProductName),
        };

        var items = await query.Select(x => new
        {
            x.p.ProductCode, x.p.ProductName, x.p.Uom, x.p.SecondaryUom,
            Stock = x.s.CurrentStockBalance,
            Buy = x.p.ProductPurchasePrice, Sell = x.p.ProductSalesPrice,
        }).ToListAsync(ct);

        // Prices are per base unit (pcs, kg, litre...), the unit stock is counted in. Stock below
        // zero (sold before it was received) is worth nothing rather than a negative amount.
        decimal totalBuy = 0, totalSell = 0;
        var rows = new List<ReportRow>(items.Count);
        foreach (var i in items)
        {
            var onHand = Math.Max(i.Stock, 0);
            var buyValue = Money.Round(onHand * i.Buy);
            var sellValue = Money.Round(onHand * i.Sell);
            totalBuy += buyValue;
            totalSell += sellValue;

            var cells = new List<string>
            {
                i.ProductCode,
                i.ProductName,
                $"{Qty.Format(i.Stock)} {Units.PrintLabel(Units.BaseUnit(i.Uom, i.SecondaryUom))}",
            };
            if (withPurchase) cells.AddRange([Money.FormatPlain(i.Buy), Money.FormatPlain(buyValue)]);
            cells.AddRange([Money.FormatPlain(i.Sell), Money.FormatPlain(sellValue)]);
            rows.Add(new ReportRow(cells));
        }

        var columns = new List<ReportColumn>
        {
            new("Code", 50),
            new("Product"),
            new("Stock", 62, RightAligned: true),
        };
        if (withPurchase) columns.AddRange([new("Buy price", 58, true), new("Buy value", 78, true)]);
        columns.AddRange([new("Sell price", 58, true), new("Sell value", 78, true)]);

        var totals = new List<string> { "TOTAL", items.Count == 1 ? "1 product" : $"{items.Count.ToString(Invariant)} products", "" };
        if (withPurchase) totals.AddRange(["", Money.FormatPlain(totalBuy)]);
        totals.AddRange(["", Money.FormatPlain(totalSell)]);

        var now = clock.GetUtcNow().ToOffset(BusinessClock.Offset);
        var filters = new List<(string, string)> { ("As of", now.ToString("dd MMM yyyy, h:mm tt", Invariant)) };
        if (await SingleCompanyNameAsync(ct) is { } company) filters.Add(("Company", company));
        if (q.Term is { } search) filters.Add(("Search", search));
        if (q.LowStockOnly) filters.Add(("Filter", "Low stock only"));
        if (withPurchase && items.Count > 0) filters.Add(("Expected profit", Money.Format(totalSell - totalBuy)));

        return new ReportDocument(
            Title: "Stock balance report",
            BusinessName: await business.NameAsync(ct),
            Filters: filters,
            Columns: columns,
            Rows: rows,
            Totals: totals,
            FileName: $"stock-balance-{now:yyyy-MM-dd}.pdf");
    }

    private static string Day(DateOnly d) => d.ToString("dd MMM yyyy", Invariant);

    private static string FileName(string prefix, DateOnly? from, DateOnly? to)
    {
        var span = (from, to) switch
        {
            (null, null) => "all",
            ({ } f, null) => $"from-{f:yyyy-MM-dd}",
            (null, { } t) => $"to-{t:yyyy-MM-dd}",
            ({ } f, { } t) => $"{f:yyyy-MM-dd}_{t:yyyy-MM-dd}",
        };
        return $"{prefix}-{span}.pdf";
    }

    // ------------------------------------------------------------------ dashboard

    public async Task<DashboardDto> DashboardAsync(Guid? companyUuid, CancellationToken ct)
    {
        var today = BusinessClock.Today(clock.GetUtcNow());
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var empty = new ReportQuery { CompanyUuid = companyUuid };

        if (user.Role == Role.User)
        {
            LinkedSummary? buyer = null, supplier = null;
            var latestSales = new List<OrderListItemDto>();
            var latestPurchases = new List<OrderListItemDto>();
            if (user.CustomerUuid is { } cid)
            {
                buyer = await LinkedAsync<SalesOrder, Customer>(cid, empty, ct);
                latestSales = (await salesOrders.ListAsync(new OrderListQuery { PageSize = 10, OpeningDue = false }, ct)).Items.ToList();
            }
            if (user.SupplierUuid is { } sid)
            {
                supplier = await LinkedAsync<PurchaseOrder, Supplier>(sid, empty, ct);
                latestPurchases = (await purchaseOrders.ListAsync(new OrderListQuery { PageSize = 10, OpeningDue = false }, ct)).Items.ToList();
            }
            return new DashboardDto(user.Role, null, null, null, null, null, null, null, [], latestSales, latestPurchases, buyer, supplier, []);
        }

        var isAdmin = user.Role == Role.Admin;
        var finalSales = FinalOrders<SalesOrder>(empty);
        var finalPurchases = FinalOrders<PurchaseOrder>(empty);
        // Previous dues are owed money, not sales or purchases made: they count in the dues only.
        var realSales = finalSales.Where(o => !o.IsOpeningDue);
        var realPurchases = finalPurchases.Where(o => !o.IsOpeningDue);

        var todaySales = await realSales.Where(o => o.OrderDate == today).SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
        var monthSales = await realSales.Where(o => o.OrderDate >= monthStart).SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
        var customerDue = await finalSales.SumAsync(o => (decimal?)(o.TotalAmount - o.TotalPaidAmount), ct) ?? 0;

        var draftSales = await db.SalesOrders.CountAsync(o => o.Status == RecordStatus.Active && o.PostingStatus == PostingStatus.Draft
                                                             && (companyUuid == null || o.CompanyUuid == companyUuid), ct);

        decimal? monthPurchases = null, supplierDue = null;
        int? draftPurchases = null;
        var latestPurch = new List<OrderListItemDto>();
        if (isAdmin)
        {
            monthPurchases = await realPurchases.Where(o => o.OrderDate >= monthStart).SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
            supplierDue = await finalPurchases.SumAsync(o => (decimal?)(o.TotalAmount - o.TotalPaidAmount), ct) ?? 0;
            draftPurchases = await db.PurchaseOrders.CountAsync(o => o.Status == RecordStatus.Active && o.PostingStatus == PostingStatus.Draft
                                                                   && (companyUuid == null || o.CompanyUuid == companyUuid), ct);
            latestPurch = (await purchaseOrders.ListAsync(new OrderListQuery { PageSize = 10, CompanyUuid = companyUuid, OpeningDue = false }, ct)).Items.ToList();
        }

        var latestSalesList = (await salesOrders.ListAsync(new OrderListQuery { PageSize = 10, CompanyUuid = companyUuid, OpeningDue = false }, ct)).Items.ToList();

        var lowStock = await (from p in db.Products.AsNoTracking()
                              join s in db.StockBalances.AsNoTracking() on p.Uuid equals s.ProductUuid
                              where p.Status == RecordStatus.Active && p.LowStockThreshold != null && s.CurrentStockBalance <= p.LowStockThreshold
                              orderby s.CurrentStockBalance
                              select new LowStockItem(p.Uuid, p.ProductCode, p.ProductName, s.CurrentStockBalance, p.LowStockThreshold!.Value))
                             .Take(20).ToListAsync(ct);

        var from30 = today.AddDays(-29);
        var daily = await realSales.Where(o => o.OrderDate >= from30)
            .GroupBy(o => o.OrderDate)
            .Select(g => new { Date = g.Key, Total = g.Sum(o => o.TotalAmount) })
            .ToListAsync(ct);
        var series = Enumerable.Range(0, 30).Select(i => from30.AddDays(i))
            .Select(d => new DailyTotal(d, daily.FirstOrDefault(x => x.Date == d)?.Total ?? 0)).ToList();

        // Profit is the whole business's: expenses belong to no one company.
        decimal? monthExpenses = null, monthProfit = null;
        if (isAdmin && companyUuid is null)
        {
            var pl = await ProfitLossAsync(new ReportQuery { FromDate = monthStart }, ct);
            monthExpenses = pl.TotalExpenses;
            monthProfit = pl.NetProfit;
        }

        return new DashboardDto(user.Role, todaySales, monthSales, monthPurchases, customerDue, supplierDue,
            draftSales, draftPurchases, lowStock, latestSalesList, latestPurch, null, null, series, monthExpenses, monthProfit);
    }

    private async Task<LinkedSummary?> LinkedAsync<TOrder, TParty>(Guid partyUuid, ReportQuery q, CancellationToken ct)
        where TOrder : OrderHeader where TParty : PartyEntity
    {
        var name = await db.Set<TParty>().AsNoTracking().Where(p => p.Uuid == partyUuid).Select(p => p.Name).FirstOrDefaultAsync(ct);
        if (name is null) return null;
        var orders = FinalOrders<TOrder>(q).Where(o => o.PartyUuid == partyUuid);
        var count = await orders.CountAsync(o => !o.IsOpeningDue, ct);
        var total = await orders.SumAsync(o => (decimal?)o.TotalAmount, ct) ?? 0;
        var paid = await orders.SumAsync(o => (decimal?)o.TotalPaidAmount, ct) ?? 0;
        return new LinkedSummary(partyUuid, name, count, total, paid, total - paid);
    }
}
