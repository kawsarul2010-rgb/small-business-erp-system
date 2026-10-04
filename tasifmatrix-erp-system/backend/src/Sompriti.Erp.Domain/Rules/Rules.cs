using System.Globalization;
using System.Text.RegularExpressions;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Domain.Rules;

public static class Money
{
    /// <summary>Round to 2 decimals, half away from zero (SRS 7.2.1).</summary>
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    public static string Format(decimal value) =>
        "Tk " + value.ToString("#,##0.00", CultureInfo.InvariantCulture);

    public static string FormatPlain(decimal value) => value.ToString("#,##0.00", CultureInfo.InvariantCulture);
}

/// <summary>
/// Quantity rules. PCS and BOX are counted in whole units; KG and LITRE are measured and
/// carry up to three decimal places, which covers grams and millilitres.
/// </summary>
public static class Qty
{
    public const int Decimals = 3;

    /// <summary>Round to 3 decimals, half away from zero.</summary>
    public static decimal Round(decimal value) => Math.Round(value, Decimals, MidpointRounding.AwayFromZero);

    /// <summary>"12" for a whole quantity, "2.5" for a measured one - never "2.500".</summary>
    public static string Format(decimal value) =>
        Round(value).ToString("0.###", CultureInfo.InvariantCulture);

    /// <summary>"2.5 kg", "12 pcs" - the quantity with the unit it was measured in.</summary>
    public static string Format(decimal value, QuantityType unit) => $"{Format(value)} {Units.ShortLabel(unit)}";
}

/// <summary>What each unit of measure means for pricing, stock and data entry.</summary>
public static class Units
{
    /// <summary>KG and LITRE are measured, so fractions are meaningful. PCS and BOX are counted.</summary>
    public static bool AllowsFractions(Uom uom) => uom is Uom.Kg or Uom.Litre;

    public static bool AllowsFractions(QuantityType type) => type is QuantityType.Kg or QuantityType.Litre;

    /// <summary>A BOX product must say what its box holds and how much of it.</summary>
    public static bool RequiresSecondaryUom(Uom uom) => uom == Uom.Box;

    /// <summary>
    /// The unit this product's stock is counted in. A BOX product counts in whatever its box
    /// holds - pieces, kilos or litres; every other product counts in its own unit.
    /// </summary>
    public static Uom BaseUnit(Product product) =>
        product.Uom == Uom.Box ? product.SecondaryUom ?? Uom.Pcs : product.Uom;

    public static Uom BaseUnit(Uom uom, Uom? secondary) => uom == Uom.Box ? secondary ?? Uom.Pcs : uom;

    /// <summary>The base unit as a line's quantity type.</summary>
    public static QuantityType AsQuantityType(Uom uom) => uom switch
    {
        Uom.Box => QuantityType.Box,
        Uom.Kg => QuantityType.Kg,
        Uom.Litre => QuantityType.Litre,
        _ => QuantityType.Pcs,
    };

    /// <summary>
    /// The ways a line for this product may be entered: by the box when it has a box size,
    /// and always in its base unit - so a 25 kg sack can be ordered as 2 boxes or as 12.5 kg.
    /// </summary>
    public static QuantityType[] EntryTypesFor(Product product)
    {
        var baseType = AsQuantityType(BaseUnit(product));
        return product.UnitPerBox is > 0 ? [QuantityType.Box, baseType] : [baseType];
    }

    public static bool IsValidFor(Product product, QuantityType type) =>
        Array.IndexOf(EntryTypesFor(product), type) >= 0;

    public static string ShortLabel(QuantityType type) => type switch
    {
        QuantityType.Box => "box",
        QuantityType.Kg => "kg",
        QuantityType.Litre => "litre",
        _ => "pcs",
    };

    public static string ShortLabel(Uom uom) => uom switch
    {
        Uom.Box => "box",
        Uom.Kg => "kg",
        Uom.Litre => "litre",
        _ => "pcs",
    };

    /// <summary>
    /// The unit as printed after a number on a document: "20 KG", "10 L", "12 PCS".
    /// Uppercase and short, because it sits inside a narrow table column - "LITRE" does not fit.
    /// </summary>
    public static string PrintLabel(Uom uom) => uom switch
    {
        Uom.Box => "BOX",
        Uom.Kg => "KG",
        Uom.Litre => "L",
        _ => "PCS",
    };

    public static string PrintLabel(QuantityType type) => type switch
    {
        QuantityType.Box => "BOX",
        QuantityType.Kg => "KG",
        QuantityType.Litre => "L",
        _ => "PCS",
    };

    /// <summary>The unit stock is counted in, as a label: "pcs", "kg" or "litre".</summary>
    public static string StockLabel(Product product) => ShortLabel(BaseUnit(product));

    public static string StockLabel(Uom uom, Uom? secondary) => ShortLabel(BaseUnit(uom, secondary));
}

/// <summary>Bangladesh mobile number rules (SRS 11.3).</summary>
public static partial class BdMobile
{
    [GeneratedRegex(@"^8801[3-9]\d{8}$")]
    private static partial Regex NormalizedPattern();

    /// <summary>Returns the normalized form 8801XXXXXXXXX, or null when invalid.</summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var digits = new string(input.Where(c => !char.IsWhiteSpace(c) && c != '-' && c != '(' && c != ')').ToArray());
        if (digits.StartsWith('+')) digits = digits[1..];
        if (!digits.All(char.IsDigit)) return null;
        if (digits.StartsWith("01") && digits.Length == 11) digits = "88" + digits;
        return NormalizedPattern().IsMatch(digits) ? digits : null;
    }

    public static bool IsValid(string? input) => Normalize(input) is not null;

    /// <summary>Display form 01XXXXXXXXX.</summary>
    public static string ToDisplay(string? normalized) =>
        normalized is { Length: 13 } && normalized.StartsWith("88") ? normalized[2..] : normalized ?? "";
}

public static class PasswordPolicy
{
    public const string Description = "Password must be at least 8 characters and contain at least one letter and one number.";

    public static bool IsValid(string? password) =>
        password is { Length: >= 8 } && password.Any(char.IsLetter) && password.Any(char.IsDigit);

    // No 0/O, 1/l/I: a temporary password is read aloud or typed from a screenshot.
    private const string Letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
    private const string Digits = "23456789";

    /// <summary>
    /// A random one-time password handed to a new or locked-out business admin. It meets the
    /// policy, and the account is flagged to change it at first sign-in.
    /// </summary>
    public static string GenerateTemporary(int length = 12)
    {
        if (length < 8) throw new ArgumentOutOfRangeException(nameof(length));
        var all = Letters + Digits;
        var chars = new char[length];
        chars[0] = Letters[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Letters.Length)];
        chars[1] = Digits[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Digits.Length)];
        for (var i = 2; i < length; i++)
            chars[i] = all[System.Security.Cryptography.RandomNumberGenerator.GetInt32(all.Length)];
        // Shuffle so the guaranteed letter and digit are not always first.
        for (var i = length - 1; i > 0; i--)
        {
            var j = System.Security.Cryptography.RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }
        return new string(chars);
    }
}

/// <summary>The short code that identifies a business, e.g. "sompriti" or "rahim-store".</summary>
public static partial class TenantCodes
{
    public const string Description = "3 to 30 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.";

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")]
    private static partial Regex Pattern();

    /// <summary>Trims and lowercases. People type "Sompriti " and mean "sompriti".</summary>
    public static string? Normalize(string? input) => string.IsNullOrWhiteSpace(input) ? null : input.Trim().ToLowerInvariant();

    /// <summary>Same rule as the database CHECK constraint ck_tenant_code.</summary>
    public static bool IsValid(string? normalized) => normalized is not null && Pattern().IsMatch(normalized);

    /// <summary>Suggests a code from a business name: "Rahim Store & Co." -> "rahim-store-co".</summary>
    public static string Suggest(string? name)
    {
        var sb = new System.Text.StringBuilder();
        foreach (var c in (name ?? "").Trim().ToLowerInvariant())
        {
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9') sb.Append(c);
            else if (sb.Length > 0 && sb[^1] != '-') sb.Append('-');
        }
        var code = sb.ToString().Trim('-');
        if (code.Length > 30) code = code[..30].TrimEnd('-');
        return code;
    }

    /// <summary>
    /// The code of a business's own company, made from the business code: "rahim-store" -> "RAHIM-STORE".
    /// Company codes are at most 20 characters.
    /// </summary>
    public static string CompanyCode(string tenantCode)
    {
        var code = tenantCode.Trim().ToUpperInvariant();
        if (code.Length > 20) code = code[..20];
        code = code.Trim('-');
        return code.Length == 0 ? "MAIN" : code;
    }
}

/// <summary>
/// Which business a new row belongs to. Kept separate from the database context so the rule
/// can be tested on its own: a row inherits the signed-in business, keeps a business that was
/// set explicitly only when it matches, and can never be created without one.
/// </summary>
public static class TenantStamp
{
    /// <param name="rowTenant">What the row carries (Guid.Empty when the code left it unset).</param>
    /// <param name="signedInTenant">The business of the current request, or null outside one
    /// (sign-in, the super admin's platform screens, background jobs).</param>
    public static Guid ForNewRow(Guid rowTenant, Guid? signedInTenant, string entityName)
    {
        if (signedInTenant is { } current)
        {
            if (rowTenant == Guid.Empty || rowTenant == current) return current;
            throw new InvalidOperationException($"A {entityName} for another business cannot be created from this business.");
        }
        if (rowTenant == Guid.Empty)
            throw new InvalidOperationException($"A {entityName} must belong to a business, and none is signed in.");
        return rowTenant;
    }
}

public static class PostingRules
{
    public static bool CanTransition(PostingStatus from, PostingStatus to) => (from, to) switch
    {
        (PostingStatus.Draft, PostingStatus.Final) => true,
        (PostingStatus.Draft, PostingStatus.Void) => true,
        (PostingStatus.Final, PostingStatus.Void) => true,
        _ => false
    };

    public static void EnsureTransition(PostingStatus from, PostingStatus to)
    {
        if (!CanTransition(from, to))
            throw new DomainException(ErrorKind.Conflict, ErrorCodes.InvalidStatusTransition,
                $"An order cannot be changed from {EnumText.ToText(from)} to {EnumText.ToText(to)}.");
    }

    public static void EnsureDraft(OrderHeader order)
    {
        if (order.PostingStatus != PostingStatus.Draft)
            throw new DomainException(ErrorKind.Conflict, ErrorCodes.InvalidStatusTransition,
                $"Only DRAFT orders can be changed. This order is {EnumText.ToText(order.PostingStatus)}.");
    }

    /// <summary>Stock direction for finalizing an order: +1 purchase, -1 sales.</summary>
    public static int FinalizeSign(TransactionType type) => type == TransactionType.Purchase ? 1 : -1;

    public static MovementType FinalizeMovement(TransactionType type) =>
        type == TransactionType.Purchase ? MovementType.PurchaseFinal : MovementType.SalesFinal;

    public static MovementType VoidMovement(TransactionType type) =>
        type == TransactionType.Purchase ? MovementType.PurchaseVoid : MovementType.SalesVoid;
}

/// <summary>Input for one order line as submitted by the client.</summary>
public sealed record LineInput(
    Guid? Uuid,
    Guid ProductUuid,
    QuantityType QuantityType,
    int? BoxQuantity,
    decimal? UnitQuantity,
    decimal? TotalQuantity,
    decimal? PerUnitPrice,
    decimal? PerBoxPrice,
    decimal? TotalPrice);

/// <summary>Validated and normalized line values.</summary>
public sealed record LineValues(
    QuantityType QuantityType,
    int? BoxQuantity,
    decimal? UnitQuantity,
    decimal? UnitPerBoxSnapshot,
    decimal TotalQuantity,
    decimal PerUnitPrice,
    decimal? PerBoxPrice,
    decimal TotalPrice);

/// <summary>Line item calculations (SRS 7.2.1). Prices on products are per PCS.</summary>
public static class LineCalculator
{
    /// <summary>
    /// Validates a submitted line and fills missing values with defaults:
    /// total quantity from pcs/box quantity, prices from the product default price,
    /// total price from quantity x per pcs price. User-entered values are preserved.
    /// </summary>
    public static LineValues Normalize(LineInput input, Product product, decimal defaultPerUnitPrice, string fieldPrefix, Validator v)
    {
        var baseUnit = Units.BaseUnit(product);
        var baseLabel = Units.ShortLabel(baseUnit);
        decimal? unitPerBox = null;
        int? box = null;
        decimal? units = null;
        decimal total;

        // A line must be entered either by the box or in the product's base unit: a product
        // stocked in kilos cannot be ordered by the piece.
        if (!Units.IsValidFor(product, input.QuantityType))
            v.Add($"{fieldPrefix}.quantityType",
                $"Product {product.ProductCode} is stocked in {EnumText.ToText(baseUnit)}, so "
                + $"{EnumText.ToText(input.QuantityType)} cannot be used.");

        if (input.QuantityType == QuantityType.Box)
        {
            if (product.UnitPerBox is not > 0)
                v.Add($"{fieldPrefix}.quantityType", $"Product {product.ProductCode} has no box size, so BOX cannot be used.");
            unitPerBox = product.UnitPerBox;
            box = input.BoxQuantity;
            if (box is not > 0) v.Add($"{fieldPrefix}.boxQuantity", "Box quantity must be greater than 0.");
            // A box of 25 kg ordered twice is 50 kg; a carton of 12 pcs ordered twice is 24 pcs.
            total = input.TotalQuantity ?? (box ?? 0) * (unitPerBox ?? 0);
        }
        else
        {
            units = input.UnitQuantity is { } q ? Qty.Round(q) : null;
            if (units is not > 0)
                v.Add($"{fieldPrefix}.unitQuantity",
                    $"{char.ToUpperInvariant(baseLabel[0])}{baseLabel[1..]} quantity must be greater than 0.");
            total = input.TotalQuantity ?? units ?? 0;
        }

        // The total is always in the base unit, so whether it may carry a fraction
        // depends on that unit, not on how the line was entered.
        total = Qty.Round(total);
        if (!Units.AllowsFractions(baseUnit) && total != decimal.Truncate(total))
            v.Add($"{fieldPrefix}.totalQuantity",
                $"{EnumText.ToText(baseUnit)} quantities must be whole numbers.");

        if (total <= 0) v.Add($"{fieldPrefix}.totalQuantity", "Total quantity must be greater than 0.");

        // Prices are per base unit; the per-box price is derived from the box size.
        decimal perUnit;
        decimal? perBox = null;
        if (input.PerUnitPrice is { } p) perUnit = p;
        else if (input.QuantityType == QuantityType.Box && input.PerBoxPrice is { } pb && unitPerBox is > 0) perUnit = pb / unitPerBox.Value;
        else perUnit = defaultPerUnitPrice;
        perUnit = Money.Round(perUnit);

        if (input.QuantityType == QuantityType.Box)
            perBox = Money.Round(input.PerBoxPrice ?? perUnit * (unitPerBox ?? 0));

        var totalPrice = Money.Round(input.TotalPrice ?? total * perUnit);

        if (perUnit < 0) v.Add($"{fieldPrefix}.perUnitPrice", $"Per {baseLabel} price cannot be negative.");
        if (perBox < 0) v.Add($"{fieldPrefix}.perBoxPrice", "Per box price cannot be negative.");
        if (totalPrice < 0) v.Add($"{fieldPrefix}.totalPrice", "Total price cannot be negative.");

        return new LineValues(input.QuantityType, box, units, unitPerBox, total, perUnit, perBox, totalPrice);
    }

    public static void Apply(OrderLine line, LineValues values)
    {
        line.QuantityType = values.QuantityType;
        line.BoxQuantity = values.BoxQuantity;
        line.UnitQuantity = values.UnitQuantity;
        line.UnitPerBoxSnapshot = values.UnitPerBoxSnapshot;
        line.TotalQuantity = values.TotalQuantity;
        line.PerUnitPrice = values.PerUnitPrice;
        line.PerBoxPrice = values.PerBoxPrice;
        line.TotalPrice = values.TotalPrice;
    }

    /// <summary>Sum of quantities per product (a product may appear on several lines).</summary>
    public static Dictionary<Guid, decimal> QuantityByProduct(IEnumerable<OrderLine> lines) =>
        lines.Where(l => l.IsActive)
             .GroupBy(l => l.ProductUuid)
             .ToDictionary(g => g.Key, g => g.Sum(l => l.TotalQuantity));
}

/// <summary>A customer's or supplier's running account with the business: all its FINAL orders of one kind.</summary>
public sealed record AccountTotals(decimal Total, decimal Paid)
{
    public decimal Due => Total - Paid;
}

/// <summary>
/// The two SMS a customer or supplier receives: when an order is finalized and when a payment is added.
/// Both carry the running account (total, paid, due) so the person always sees where they stand.
/// Kept in plain English so a message fits one 160-character SMS part in the usual case.
/// </summary>
public static class SmsTemplates
{
    public static string OrderFinalized(TransactionType type, string companyName, string orderNumber, decimal orderTotal, AccountTotals account)
    {
        var what = type == TransactionType.Sales
            ? $"Invoice #{orderNumber} of Tk {Amount(orderTotal)} confirmed."
            : $"Purchase #{orderNumber} of Tk {Amount(orderTotal)} recorded.";
        return Compose(companyName, what, account);
    }

    public static string Payment(TransactionType type, string companyName, string orderNumber, decimal amount, AccountTotals account)
    {
        var what = type == TransactionType.Sales
            ? $"Received Tk {Amount(amount)} for Invoice #{orderNumber}."
            : $"Paid Tk {Amount(amount)} for Purchase #{orderNumber}.";
        return Compose(companyName, what, account);
    }

    private static string Compose(string companyName, string what, AccountTotals account)
    {
        var company = companyName.Length > 30 ? companyName[..30] : companyName;
        var text = $"{company}: {what} Your account: total Tk {Amount(account.Total)}, paid Tk {Amount(account.Paid)}, due Tk {Amount(account.Due)}.";
        // The courtesy line only when it does not make the message cost an extra SMS part.
        var polite = text + " Thank you.";
        return SmsParts.Count(polite) <= SmsParts.Count(text) ? polite : text;
    }

    private static string Amount(decimal value) => value.ToString("#,##0.##", CultureInfo.InvariantCulture);
}


/// <summary>
/// How many SMS parts an operator charges for a message - the unit SMS is billed in.
/// Plain text (the GSM 7-bit alphabet) fits 160 characters in one part, or 153 per part when longer.
/// Any other character - Bangla, for instance - makes the whole message Unicode: 70 in one part,
/// or 67 per part when longer.
/// </summary>
public static class SmsParts
{
    public const int Max = 20;

    private const string Gsm =
        "@\u00a3$\u00a5\u00e8\u00e9\u00f9\u00ec\u00f2\u00c7\n\u00d8\u00f8\r\u00c5\u00e5\u0394_\u03a6\u0393\u039b\u03a9\u03a0\u03a8\u03a3\u0398\u039e\u00c6\u00e6\u00df\u00c9" +
        " !\"#\u00a4%&'()*+,-./0123456789:;<=>?\u00a1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00c4\u00d6\u00d1\u00dc\u00a7" +
        "\u00bfabcdefghijklmnopqrstuvwxyz\u00e4\u00f6\u00f1\u00fc\u00e0";

    /// <summary>Characters that take two places in plain text (an escape and the character).</summary>
    private const string GsmExtended = "^{}\\[~]|\u20ac\f";

    public static int Count(string? message)
    {
        if (string.IsNullOrEmpty(message)) return 1;
        var septets = 0;
        foreach (var c in message)
        {
            if (Gsm.Contains(c)) septets += 1;
            else if (GsmExtended.Contains(c)) septets += 2;
            else return Parts(message.Length, single: 70, multi: 67); // UTF-16 units, as UCS-2 counts them
        }
        return Parts(septets, single: 160, multi: 153);
    }

    private static int Parts(int length, int single, int multi) =>
        Math.Min(Max, length <= single ? 1 : (length + multi - 1) / multi);
}

/// <summary>
/// Who gets an SMS: only when the order asks for it, the customer or supplier accepts SMS and the
/// business has SMS on. Any one switch off and nothing is queued.
/// </summary>
public static class SmsRules
{
    public static bool ShouldSend(bool orderSendSms, bool partySmsEnabled, bool businessSmsEnabled) =>
        orderSendSms && partySmsEnabled && businessSmsEnabled;

    /// <summary>Why an order's SMS would not go out even when switched on; null when it would.</summary>
    public static string? BlockedReason(bool businessSmsEnabled, bool partySmsEnabled, TransactionType type) =>
        !businessSmsEnabled ? "SMS is turned off in the business settings."
        : !partySmsEnabled ? (type == TransactionType.Sales ? "SMS is turned off for this customer." : "SMS is turned off for this supplier.")
        : null;
}

/// <summary>A business's subscription as of now, worked out from its paid-until date.</summary>
public sealed record SubscriptionSnapshot(SubscriptionState State, DateTimeOffset? EndsAt, DateTimeOffset? GraceEndsAt, int? DaysLeft)
{
    /// <summary>Only paying is possible.</summary>
    public bool Frozen => State == SubscriptionState.Expired;
}

/// <summary>Subscription arithmetic: the state on a given day, and the new paid-until date after a payment.</summary>
public static class SubscriptionRules
{
    public static SubscriptionSnapshot Evaluate(bool billingEnabled, bool exempt, DateTimeOffset? endsAt, bool onTrial,
        int graceDays, DateTimeOffset now)
    {
        if (!billingEnabled || exempt) return new SubscriptionSnapshot(SubscriptionState.NotBilled, endsAt, null, null);
        // Billing on but never applied to this business (should not happen once switched on): treat as due now.
        var ends = endsAt ?? now;
        var graceEnds = ends.AddDays(Math.Max(0, graceDays));
        if (now < ends)
            return new SubscriptionSnapshot(onTrial ? SubscriptionState.Trial : SubscriptionState.Active, ends, graceEnds, DaysUntil(now, ends));
        if (now < graceEnds)
            return new SubscriptionSnapshot(SubscriptionState.GracePeriod, ends, graceEnds, DaysUntil(now, graceEnds));
        return new SubscriptionSnapshot(SubscriptionState.Expired, ends, graceEnds, 0);
    }

    /// <summary>
    /// The period a payment buys. Paying early adds to the time already paid for; paying late
    /// (in the grace period or after) starts from the day of payment.
    /// </summary>
    public static (DateTimeOffset Start, DateTimeOffset End) Extend(DateTimeOffset? endsAt, DateTimeOffset now, int months)
    {
        // A paid package also starts after an unfinished free trial: the trial days are not lost.
        var start = endsAt is { } e && e > now ? e : now;
        return (start, start.AddMonths(months));
    }

    /// <summary>Whole days left, counting a part day as a day (ends tomorrow morning = 1 day).</summary>
    public static int DaysUntil(DateTimeOffset now, DateTimeOffset until) =>
        until <= now ? 0 : (int)Math.Ceiling((until - now).TotalDays);
}
