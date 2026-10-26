using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
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
    IReadOnlyList<DailyTotal> SalesLast30Days);

public sealed record LowStockItem(Guid ProductUuid, string ProductCode, string ProductName, decimal CurrentStock, decimal Threshold);
public sealed record LinkedSummary(Guid PartyUuid, string PartyName, int OrderCount, decimal TotalAmount, decimal TotalPaid, decimal Due);
public sealed record DailyTotal(DateOnly Date, decimal Total);

public sealed class ReportService(IAppDbContext db, ICurrentUser user, TimeProvider clock,
    SalesOrderService salesOrders, PurchaseOrderService purchaseOrders, IBusinessProfile business)
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
            return new ReportRow(cells);
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
        return new ReportDocument(
            Title: perParty ? $"{partyWord} orders" : sales ? "Sales orders" : "Purchase orders",
            BusinessName: await business.NameAsync(ct),
            Filters: filters,
            Columns: columns,
            Rows: rows,
            Totals: totals,
            FileName: FileName(prefix, q.FromDate, q.ToDate));
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

        return new DashboardDto(user.Role, todaySales, monthSales, monthPurchases, customerDue, supplierDue,
            draftSales, draftPurchases, lowStock, latestSalesList, latestPurch, null, null, series);
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
