using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.Reports;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Ai;

/// <summary>A button under an answer: "Karim's orders", "Due report"... Label is English; the app translates it.</summary>
public sealed record AssistantLinkDto(string Label, string Route, IReadOnlyDictionary<string, string>? Query = null,
    IReadOnlyDictionary<string, string>? Params = null);

/// <summary>What a tool returned: text for the model (JSON), and possibly a link for the person.</summary>
public sealed record ToolOutput(string Text, AssistantLinkDto? Link = null, bool IsError = false);

/// <summary>
/// The buttons the "Ask your business" model may press. Each one is read-only and runs as the person
/// asking: inside their business (query filter and row-level security) and within their role.
/// The real one reads the database; the evals use one that returns fixed test data.
/// </summary>
public interface IBusinessToolbox
{
    /// <summary>The tool definitions this role is offered - a manager is never offered suppliers, purchases or profit.</summary>
    JsonArray Definitions(Role role);

    Task<ToolOutput> RunAsync(string name, JsonObject input, Role role, CancellationToken ct);
}

/// <summary>The tool catalogue: names, what they do, their inputs and who may use them.</summary>
public static class BusinessToolCatalog
{
    public sealed record Spec(string Name, string Description, JsonObject Schema, Role[] Roles);

    private static readonly Role[] Staff = [Role.Admin, Role.Manager];
    private static readonly Role[] AdminOnly = [Role.Admin];

    private static JsonObject Obj(params (string Name, JsonObject Schema, bool Required)[] props)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var (name, schema, req) in props)
        {
            properties[name] = schema;
            if (req) required.Add(name);
        }
        return new JsonObject { ["type"] = "object", ["properties"] = properties, ["required"] = required };
    }

    private static JsonObject Str(string description) => new() { ["type"] = "string", ["description"] = description };
    private static JsonObject Int(string description) => new() { ["type"] = "integer", ["description"] = description };
    private static JsonObject Enum(string description, params string[] values) =>
        new() { ["type"] = "string", ["description"] = description, ["enum"] = new JsonArray(values.Select(v => (JsonNode)v).ToArray()) };

    private static JsonObject Date(string which) =>
        Str($"{which} date, YYYY-MM-DD. Leave out for the start of this month (from) or today (to).");

    public static IReadOnlyList<Spec> All { get; } =
    [
        new("find_customer",
            "Find customers by part of their name, their code (e.g. 100012) or mobile number. Returns up to 8 matches with their " +
            "code and current due. Names are usually saved in English letters: for a name written in Bangla script, search the " +
            "English spelling (করিম -> Karim). If several match, ask the user which one before answering about one.",
            Obj(("query", Str("Name, code or mobile number."), true)), Staff),
        new("find_supplier",
            "Find suppliers by part of their name, their code or mobile number. Same as find_customer, for suppliers.",
            Obj(("query", Str("Name, code or mobile number."), true)), AdminOnly),
        new("get_customer_balance",
            "A customer's whole account: number of orders, total ordered, total paid and total due (all finalized orders and " +
            "previous dues, any date - the same Total Due as on their invoice), last order date and the oldest unpaid order.",
            Obj(("code", Str("The customer's code from find_customer."), true)), Staff),
        new("get_supplier_balance",
            "A supplier's whole account: what the business has bought, paid and still owes them.",
            Obj(("code", Str("The supplier's code from find_supplier."), true)), AdminOnly),
        new("sales_summary",
            "Sales in a period (finalized sales orders by order date): number of orders, total, paid and due on those orders, " +
            "and the money collected in the period (payments by payment date, for any order).",
            Obj(("from_date", Date("Start"), false), ("to_date", Date("End"), false)), Staff),
        new("purchase_summary",
            "Purchases in a period (finalized purchase orders by order date): number of orders, total, paid and due, and money " +
            "paid to suppliers in the period.",
            Obj(("from_date", Date("Start"), false), ("to_date", Date("End"), false)), AdminOnly),
        new("top_products",
            "Best-selling products in a period, by quantity sold or by sales amount.",
            Obj(("from_date", Date("Start"), false), ("to_date", Date("End"), false),
                ("sort_by", Enum("Rank by quantity or by amount (Tk).", "quantity", "amount"), false),
                ("limit", Int("How many, 1 to 15. Default 5."), false)), Staff),
        new("stock_of",
            "Current stock of products matching a name or code: quantity with its unit, the low stock alert level and the sales price.",
            Obj(("query", Str("Product name or code (English letters; e.g. চিনি -> sugar)."), true)), Staff),
        new("low_stock",
            "Products at or below their low stock alert level, lowest first.",
            Obj(("limit", Int("How many, 1 to 30. Default 10."), false)), Staff),
        new("customer_dues",
            "Customers who owe money, largest due first, with how many days their oldest unpaid order has been due.",
            Obj(("min_days", Int("Only customers whose oldest unpaid order is at least this many days old. Default 0."), false),
                ("limit", Int("How many, 1 to 30. Default 10."), false)), Staff),
        new("supplier_dues",
            "Suppliers the business owes money to, largest first.",
            Obj(("limit", Int("How many, 1 to 30. Default 10."), false)), AdminOnly),
        new("profit_summary",
            "Profit and loss for a period: sales, cost of goods sold (at average purchase cost), gross profit, expenses by " +
            "category, stock lost or damaged, and net profit.",
            Obj(("from_date", Date("Start"), false), ("to_date", Date("End"), false)), AdminOnly),
    ];

    public static Spec? Find(string name) => All.FirstOrDefault(s => s.Name == name);

    public static bool Allowed(string name, Role role) => Find(name)?.Roles.Contains(role) == true;

    public static JsonArray Definitions(Role role) => new(All.Where(s => s.Roles.Contains(role))
        .Select(s => (JsonNode)new JsonObject
        {
            ["name"] = s.Name,
            ["description"] = s.Description,
            ["input_schema"] = s.Schema.DeepClone(),
        }).ToArray());
}

/// <summary>The real tools: read-only queries over the signed-in business's data.</summary>
public sealed class BusinessTools(IAppDbContext db, ReportService reports, TimeProvider clock) : IBusinessToolbox
{
    private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;
    private static readonly JsonSerializerOptions Json = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public JsonArray Definitions(Role role) => BusinessToolCatalog.Definitions(role);

    public async Task<ToolOutput> RunAsync(string name, JsonObject input, Role role, CancellationToken ct)
    {
        // Checked again here, whatever the model asked: a tool not offered to this role does not run.
        if (!BusinessToolCatalog.Allowed(name, role))
            return Error($"The tool {name} is not available to this user's role.");
        try
        {
            return name switch
            {
                "find_customer" => await FindAsync(db.Customers, db.SalesOrders, Text(input, "query"), ct),
                "find_supplier" => await FindAsync(db.Suppliers, db.PurchaseOrders, Text(input, "query"), ct),
                "get_customer_balance" => await BalanceAsync(db.Customers, db.SalesOrders, Text(input, "code"), true, ct),
                "get_supplier_balance" => await BalanceAsync(db.Suppliers, db.PurchaseOrders, Text(input, "code"), false, ct),
                "sales_summary" => await SummaryAsync(db.SalesOrders, db.SalesOrderPayments, input, true, ct),
                "purchase_summary" => await SummaryAsync(db.PurchaseOrders, db.PurchaseOrderPayments, input, false, ct),
                "top_products" => await TopProductsAsync(input, ct),
                "stock_of" => await StockOfAsync(Text(input, "query"), ct),
                "low_stock" => await LowStockAsync(Limit(input, 10, 30), ct),
                "customer_dues" => await DuesAsync(db.Customers, db.SalesOrders, Limit(input, 10, 30), Number(input, "min_days") ?? 0, true, ct),
                "supplier_dues" => await DuesAsync(db.Suppliers, db.PurchaseOrders, Limit(input, 10, 30), 0, false, ct),
                "profit_summary" => await ProfitAsync(input, ct),
                _ => Error($"Unknown tool {name}."),
            };
        }
        catch (FormatException ex)
        {
            return Error(ex.Message);
        }
    }

    // ------------------------------------------------------------------ parties

    private async Task<ToolOutput> FindAsync<TParty, TOrder>(DbSet<TParty> parties, DbSet<TOrder> orders, string query, CancellationToken ct)
        where TParty : PartyEntity where TOrder : OrderHeader
    {
        var term = query.Trim().ToLower();
        if (term.Length == 0) return Error("Give part of a name, a code or a mobile number.");
        var digits = new string(term.Where(char.IsAsciiDigit).ToArray());
        var mobileTail = digits.Length >= 6 ? digits[^Math.Min(digits.Length, 10)..] : null;

        var found = await parties.AsNoTracking()
            .Where(p => p.Status == RecordStatus.Active
                        && (p.Name.ToLower().Contains(term) || p.Code == term || (mobileTail != null && p.MobileNumber.Contains(mobileTail))))
            .OrderBy(p => p.Name).Take(8)
            .Select(p => new { p.Uuid, p.Code, p.Name, p.MobileNumber, p.City })
            .ToListAsync(ct);
        var ids = found.Select(p => p.Uuid).ToList();
        var dues = await Final(orders).Where(o => ids.Contains(o.PartyUuid))
            .GroupBy(o => o.PartyUuid)
            .Select(g => new { Party = g.Key, Due = g.Sum(o => o.TotalAmount - o.TotalPaidAmount) })
            .ToDictionaryAsync(x => x.Party, x => x.Due, ct);

        var result = new JsonObject
        {
            ["matches"] = new JsonArray(found.Select(p => (JsonNode)new JsonObject
            {
                ["code"] = p.Code,
                ["name"] = p.Name,
                ["mobile"] = BdMobile.ToDisplay(p.MobileNumber),
                ["city"] = p.City,
                ["due"] = Money.Format(dues.GetValueOrDefault(p.Uuid)),
            }).ToArray()),
        };
        if (found.Count == 0) result["note"] = "No match. Try another spelling, part of the name, or the code.";
        return Ok(result);
    }

    private async Task<ToolOutput> BalanceAsync<TParty, TOrder>(DbSet<TParty> parties, DbSet<TOrder> orders, string code, bool customer,
        CancellationToken ct) where TParty : PartyEntity where TOrder : OrderHeader
    {
        var party = await parties.AsNoTracking().FirstOrDefaultAsync(p => p.Code == code.Trim() && p.Status == RecordStatus.Active, ct);
        if (party is null) return Error($"No {(customer ? "customer" : "supplier")} has the code {code}. Use find_{(customer ? "customer" : "supplier")} first.");

        var list = await Final(orders).Where(o => o.PartyUuid == party.Uuid)
            .Select(o => new { o.OrderDate, o.TotalAmount, o.TotalPaidAmount, o.IsOpeningDue })
            .ToListAsync(ct);
        var total = list.Sum(o => o.TotalAmount);
        var paid = list.Sum(o => o.TotalPaidAmount);
        var unpaid = list.Where(o => o.TotalAmount > o.TotalPaidAmount).OrderBy(o => o.OrderDate).FirstOrDefault();
        var today = Today;

        var result = new JsonObject
        {
            ["code"] = party.Code,
            ["name"] = party.Name,
            ["orders"] = list.Count(o => !o.IsOpeningDue),
            ["total_ordered"] = Money.Format(total),
            ["total_paid"] = Money.Format(paid),
            ["total_due"] = Money.Format(total - paid),
            ["includes_previous_due"] = list.Any(o => o.IsOpeningDue),
            ["last_order_date"] = list.Where(o => !o.IsOpeningDue).Select(o => (DateOnly?)o.OrderDate).Max()?.ToString("yyyy-MM-dd", Invariant),
            ["oldest_unpaid_order_date"] = unpaid?.OrderDate.ToString("yyyy-MM-dd", Invariant),
            ["oldest_unpaid_days"] = unpaid is null ? null : today.DayNumber - unpaid.OrderDate.DayNumber,
        };
        var link = new AssistantLinkDto("Orders of {name}", customer ? "/sales-orders" : "/purchase-orders",
            new Dictionary<string, string>
            {
                ["partyUuid"] = party.Uuid.ToString(),
                ["partyLabel"] = $"{party.Name} ({party.Code})",
                ["status"] = "FINAL",
            },
            new Dictionary<string, string> { ["name"] = party.Name });
        return Ok(result, link);
    }

    private async Task<ToolOutput> DuesAsync<TParty, TOrder>(DbSet<TParty> parties, DbSet<TOrder> orders, int limit, int minDays, bool customer,
        CancellationToken ct) where TParty : PartyEntity where TOrder : OrderHeader
    {
        var today = Today;
        var rows = await Final(orders).Where(o => o.TotalAmount > o.TotalPaidAmount)
            .GroupBy(o => o.PartyUuid)
            .Select(g => new { Party = g.Key, Due = g.Sum(o => o.TotalAmount - o.TotalPaidAmount), Oldest = g.Min(o => o.OrderDate) })
            .ToListAsync(ct);
        var top = rows.Where(r => today.DayNumber - r.Oldest.DayNumber >= minDays).OrderByDescending(r => r.Due).Take(limit).ToList();
        var ids = top.Select(r => r.Party).ToList();
        var names = await parties.AsNoTracking().Where(p => ids.Contains(p.Uuid))
            .ToDictionaryAsync(p => p.Uuid, p => new { p.Name, p.Code }, ct);

        var result = new JsonObject
        {
            ["total_due_all"] = Money.Format(rows.Sum(r => r.Due)),
            [customer ? "customers_with_due" : "suppliers_with_due"] = rows.Count,
            ["largest"] = new JsonArray(top.Select(r => (JsonNode)new JsonObject
            {
                ["code"] = names.GetValueOrDefault(r.Party)?.Code,
                ["name"] = names.GetValueOrDefault(r.Party)?.Name,
                ["due"] = Money.Format(r.Due),
                ["oldest_unpaid_days"] = today.DayNumber - r.Oldest.DayNumber,
            }).ToArray()),
        };
        return Ok(result, new AssistantLinkDto("Due report", "/reports/dues"));
    }

    // ------------------------------------------------------------------ sales and purchases

    private async Task<ToolOutput> SummaryAsync<TOrder, TPayment>(DbSet<TOrder> orders, DbSet<TPayment> payments, JsonObject input, bool sales,
        CancellationToken ct) where TOrder : OrderHeader where TPayment : OrderPayment
    {
        var (fromDate, toDate) = Period(input);
        var inPeriod = Final(orders).Where(o => !o.IsOpeningDue && o.OrderDate >= fromDate && o.OrderDate <= toDate);
        var totals = await inPeriod.GroupBy(_ => 1)
            .Select(g => new { Count = g.Count(), Total = g.Sum(o => o.TotalAmount), Paid = g.Sum(o => o.TotalPaidAmount) })
            .FirstOrDefaultAsync(ct);
        // Money received (or paid) in the period, for orders of any date - previous dues included.
        var moved = await (from p in payments.AsNoTracking()
                           join o in Final(orders) on p.OrderUuid equals o.Uuid
                           where p.Status == RecordStatus.Active && p.PaymentDate >= fromDate && p.PaymentDate <= toDate
                           select (decimal?)p.PaymentAmount).SumAsync(ct) ?? 0;

        var result = new JsonObject
        {
            ["from"] = fromDate.ToString("yyyy-MM-dd", Invariant),
            ["to"] = toDate.ToString("yyyy-MM-dd", Invariant),
            ["orders"] = totals?.Count ?? 0,
            ["total"] = Money.Format(totals?.Total ?? 0),
            ["paid_on_these_orders"] = Money.Format(totals?.Paid ?? 0),
            ["due_on_these_orders"] = Money.Format((totals?.Total ?? 0) - (totals?.Paid ?? 0)),
            [sales ? "collected_in_period" : "paid_to_suppliers_in_period"] = Money.Format(moved),
        };
        return Ok(result, new AssistantLinkDto(sales ? "Sales orders" : "Purchase orders", sales ? "/sales-orders" : "/purchase-orders",
            new Dictionary<string, string> { ["status"] = "FINAL" }));
    }

    private async Task<ToolOutput> TopProductsAsync(JsonObject input, CancellationToken ct)
    {
        var (fromDate, toDate) = Period(input);
        var byAmount = Text(input, "sort_by", "quantity") == "amount";
        var limit = Limit(input, 5, 15);

        var rows = await (from l in db.SalesOrderLines.AsNoTracking()
                          join o in Final(db.SalesOrders) on l.OrderUuid equals o.Uuid
                          where l.Status == RecordStatus.Active && !o.IsOpeningDue && o.OrderDate >= fromDate && o.OrderDate <= toDate
                          group l by l.ProductUuid into g
                          select new { Product = g.Key, Quantity = g.Sum(l => l.TotalQuantity), Amount = g.Sum(l => l.TotalPrice) })
                         .ToListAsync(ct);
        var top = (byAmount ? rows.OrderByDescending(r => r.Amount) : rows.OrderByDescending(r => r.Quantity)).Take(limit).ToList();
        var ids = top.Select(r => r.Product).ToList();
        var products = await db.Products.AsNoTracking().Where(p => ids.Contains(p.Uuid))
            .ToDictionaryAsync(p => p.Uuid, ct);

        var result = new JsonObject
        {
            ["from"] = fromDate.ToString("yyyy-MM-dd", Invariant),
            ["to"] = toDate.ToString("yyyy-MM-dd", Invariant),
            ["ranked_by"] = byAmount ? "amount" : "quantity",
            ["products"] = new JsonArray(top.Select(r =>
            {
                var p = products.GetValueOrDefault(r.Product);
                return (JsonNode)new JsonObject
                {
                    ["code"] = p?.ProductCode,
                    ["name"] = p?.ProductName,
                    ["quantity_sold"] = p is null ? Qty.Format(r.Quantity) : $"{Qty.Format(r.Quantity)} {Units.ShortLabel(Units.BaseUnit(p))}",
                    ["sales_amount"] = Money.Format(r.Amount),
                };
            }).ToArray()),
        };
        return Ok(result);
    }

    // ------------------------------------------------------------------ stock

    private async Task<ToolOutput> StockOfAsync(string query, CancellationToken ct)
    {
        var term = query.Trim().ToLower();
        if (term.Length == 0) return Error("Give part of a product name or its code.");
        var rows = await (from p in db.Products.AsNoTracking()
                          join s in db.StockBalances.AsNoTracking() on p.Uuid equals s.ProductUuid
                          where p.Status == RecordStatus.Active && (p.ProductName.ToLower().Contains(term) || p.ProductCode.ToLower() == term)
                          orderby p.ProductName
                          select new { p, s.CurrentStockBalance })
                         .Take(8).ToListAsync(ct);

        var result = new JsonObject
        {
            ["products"] = new JsonArray(rows.Select(r => (JsonNode)new JsonObject
            {
                ["code"] = r.p.ProductCode,
                ["name"] = r.p.ProductName,
                ["stock"] = $"{Qty.Format(r.CurrentStockBalance)} {Units.ShortLabel(Units.BaseUnit(r.p))}",
                ["boxes"] = r.p.UnitPerBox is > 0 ? Qty.Format(Math.Floor(r.CurrentStockBalance / r.p.UnitPerBox.Value)) : null,
                ["low_stock_alert_at"] = r.p.LowStockThreshold is { } t ? Qty.Format(t) : null,
                ["is_low"] = r.p.LowStockThreshold is { } th && r.CurrentStockBalance <= th,
                ["sales_price"] = $"{Money.Format(r.p.ProductSalesPrice)} per {Units.ShortLabel(Units.BaseUnit(r.p))}",
            }).ToArray()),
        };
        if (rows.Count == 0) result["note"] = "No product matches. Try another spelling or part of the name.";
        var link = rows.Count == 1
            ? new AssistantLinkDto("Stock movements of {name}", "/stock/ledger", new Dictionary<string, string>
            {
                ["productUuid"] = rows[0].p.Uuid.ToString(),
                ["productLabel"] = $"{rows[0].p.ProductName} ({rows[0].p.ProductCode})",
            }, new Dictionary<string, string> { ["name"] = rows[0].p.ProductName })
            : new AssistantLinkDto("Stock balance", "/stock");
        return Ok(result, link);
    }

    private async Task<ToolOutput> LowStockAsync(int limit, CancellationToken ct)
    {
        var rows = await (from p in db.Products.AsNoTracking()
                          join s in db.StockBalances.AsNoTracking() on p.Uuid equals s.ProductUuid
                          where p.Status == RecordStatus.Active && p.LowStockThreshold != null && s.CurrentStockBalance <= p.LowStockThreshold
                          orderby s.CurrentStockBalance
                          select new { p, s.CurrentStockBalance })
                         .Take(limit).ToListAsync(ct);
        var result = new JsonObject
        {
            ["count"] = rows.Count,
            ["products"] = new JsonArray(rows.Select(r => (JsonNode)new JsonObject
            {
                ["code"] = r.p.ProductCode,
                ["name"] = r.p.ProductName,
                ["stock"] = $"{Qty.Format(r.CurrentStockBalance)} {Units.ShortLabel(Units.BaseUnit(r.p))}",
                ["alert_at"] = Qty.Format(r.p.LowStockThreshold!.Value),
            }).ToArray()),
        };
        return Ok(result, new AssistantLinkDto("Stock balance", "/stock"));
    }

    // ------------------------------------------------------------------ profit

    private async Task<ToolOutput> ProfitAsync(JsonObject input, CancellationToken ct)
    {
        var (fromDate, toDate) = Period(input);
        var pl = await reports.ProfitLossAsync(new ReportQuery { FromDate = fromDate, ToDate = toDate }, ct);
        var result = new JsonObject
        {
            ["from"] = fromDate.ToString("yyyy-MM-dd", Invariant),
            ["to"] = toDate.ToString("yyyy-MM-dd", Invariant),
            ["sales"] = Money.Format(pl.Sales),
            ["sales_orders"] = pl.SalesOrderCount,
            ["cost_of_goods_sold"] = Money.Format(pl.CostOfGoodsSold),
            ["gross_profit"] = Money.Format(pl.GrossProfit),
            ["gross_margin_percent"] = pl.GrossMarginPercent,
            ["expenses_total"] = Money.Format(pl.TotalExpenses),
            ["expenses_by_category"] = new JsonArray(pl.Expenses.Select(e => (JsonNode)new JsonObject
            {
                ["category"] = e.CategoryName,
                ["amount"] = Money.Format(e.Amount),
            }).ToArray()),
            ["stock_lost_or_damaged"] = Money.Format(pl.StockLoss),
            ["net_profit"] = Money.Format(pl.NetProfit),
            ["purchases_in_period_for_information"] = Money.Format(pl.Purchases),
        };
        return Ok(result, new AssistantLinkDto("Profit and loss", "/reports/profit-loss"));
    }

    // ------------------------------------------------------------------ helpers

    private DateOnly Today => BusinessClock.Today(clock.GetUtcNow());

    private static IQueryable<TOrder> Final<TOrder>(DbSet<TOrder> orders) where TOrder : OrderHeader =>
        orders.AsNoTracking().Where(o => o.Status == RecordStatus.Active && o.PostingStatus == PostingStatus.Final);

    private (DateOnly From, DateOnly To) Period(JsonObject input)
    {
        var today = Today;
        var from = DateArg(input, "from_date") ?? new DateOnly(today.Year, today.Month, 1);
        var to = DateArg(input, "to_date") ?? today;
        if (to < from) (from, to) = (to, from);
        return (from, to);
    }

    private static DateOnly? DateArg(JsonObject input, string name)
    {
        var text = Text(input, name);
        if (text.Length == 0) return null;
        return DateOnly.TryParseExact(text, "yyyy-MM-dd", Invariant, DateTimeStyles.None, out var d)
            ? d : throw new FormatException($"{name} must be a date written YYYY-MM-DD.");
    }

    private static string Text(JsonObject input, string name, string fallback = "") =>
        input[name] is JsonValue v && v.TryGetValue<string>(out var s) ? s : fallback;

    private static int? Number(JsonObject input, string name) =>
        input[name] is JsonValue v && v.TryGetValue<int>(out var i) ? i
        : input[name] is JsonValue v2 && v2.TryGetValue<string>(out var s) && int.TryParse(s, out var j) ? j : null;

    private static int Limit(JsonObject input, int fallback, int max) => Math.Clamp(Number(input, "limit") ?? fallback, 1, max);

    private static ToolOutput Ok(JsonObject result, AssistantLinkDto? link = null) => new(result.ToJsonString(Json), link);

    private static ToolOutput Error(string message) => new(new JsonObject { ["error"] = message }.ToJsonString(Json), null, true);
}
