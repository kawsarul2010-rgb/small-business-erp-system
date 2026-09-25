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

    /// <summary>Only BOX needs a pcs-per-box conversion; every other unit is its own base unit.</summary>
    public static bool RequiresPcsPerBox(Uom uom) => uom == Uom.Box;

    /// <summary>
    /// The ways a line for this product may be entered. A BOX product can also be sold loose
    /// by the piece; everything else is ordered in its own unit.
    /// </summary>
    public static QuantityType[] EntryTypesFor(Uom uom) => uom switch
    {
        Uom.Box => [QuantityType.Box, QuantityType.Pcs],
        Uom.Kg => [QuantityType.Kg],
        Uom.Litre => [QuantityType.Litre],
        _ => [QuantityType.Pcs],
    };

    public static bool IsValidFor(Uom uom, QuantityType type) => Array.IndexOf(EntryTypesFor(uom), type) >= 0;

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

    /// <summary>The unit stock is counted in: pieces for PCS and BOX products, kg or litres otherwise.</summary>
    public static string StockLabel(Uom uom) => uom switch
    {
        Uom.Kg => "kg",
        Uom.Litre => "litre",
        _ => "pcs",
    };
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
    decimal? PcsQuantity,
    decimal? TotalQuantityPcs,
    decimal? PerPcsPrice,
    decimal? PerBoxPrice,
    decimal? TotalPrice);

/// <summary>Validated and normalized line values.</summary>
public sealed record LineValues(
    QuantityType QuantityType,
    int? BoxQuantity,
    decimal? PcsQuantity,
    int? PcsPerBoxSnapshot,
    decimal TotalQuantityPcs,
    decimal PerPcsPrice,
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
    public static LineValues Normalize(LineInput input, Product product, decimal defaultPerPcsPrice, string fieldPrefix, Validator v)
    {
        int? pcsPerBox = null;
        int? box = null;
        decimal? pcs = null;
        decimal total;

        // A line must be entered in a unit the product is actually measured in: a product sold
        // by weight cannot be ordered by the piece, and only a BOX product can be ordered in boxes.
        if (!Units.IsValidFor(product.Uom, input.QuantityType))
            v.Add($"{fieldPrefix}.quantityType",
                $"Product {product.ProductCode} is measured in {EnumText.ToText(product.Uom)}, so "
                + $"{EnumText.ToText(input.QuantityType)} cannot be used.");

        if (input.QuantityType == QuantityType.Box)
        {
            if (product.PcsPerBox is not > 0)
                v.Add($"{fieldPrefix}.quantityType", $"Product {product.ProductCode} has no pcs per box, so BOX cannot be used.");
            pcsPerBox = product.PcsPerBox;
            box = input.BoxQuantity;
            if (box is not > 0) v.Add($"{fieldPrefix}.boxQuantity", "Box quantity must be greater than 0.");
            total = input.TotalQuantityPcs ?? (box ?? 0) * (pcsPerBox ?? 0);
        }
        else
        {
            pcs = input.PcsQuantity is { } q ? Qty.Round(q) : null;
            if (pcs is not > 0)
                v.Add($"{fieldPrefix}.pcsQuantity", $"{char.ToUpperInvariant(Units.ShortLabel(input.QuantityType)[0])}{Units.ShortLabel(input.QuantityType)[1..]} quantity must be greater than 0.");
            total = input.TotalQuantityPcs ?? pcs ?? 0;
        }

        // Counted units stay whole; only measured ones may carry a fraction.
        total = Qty.Round(total);
        if (!Units.AllowsFractions(input.QuantityType) && total != decimal.Truncate(total))
            v.Add($"{fieldPrefix}.totalQuantityPcs",
                $"{EnumText.ToText(input.QuantityType)} quantities must be whole numbers.");

        if (total <= 0) v.Add($"{fieldPrefix}.totalQuantityPcs", "Total quantity must be greater than 0.");

        decimal perPcs;
        decimal? perBox = null;
        if (input.PerPcsPrice is { } p) perPcs = p;
        else if (input.QuantityType == QuantityType.Box && input.PerBoxPrice is { } pb && pcsPerBox is > 0) perPcs = pb / pcsPerBox.Value;
        else perPcs = defaultPerPcsPrice;
        perPcs = Money.Round(perPcs);

        if (input.QuantityType == QuantityType.Box)
            perBox = Money.Round(input.PerBoxPrice ?? perPcs * (pcsPerBox ?? 0));

        var totalPrice = Money.Round(input.TotalPrice ?? total * perPcs);

        if (perPcs < 0) v.Add($"{fieldPrefix}.perPcsPrice", "Per pcs price cannot be negative.");
        if (perBox < 0) v.Add($"{fieldPrefix}.perBoxPrice", "Per box price cannot be negative.");
        if (totalPrice < 0) v.Add($"{fieldPrefix}.totalPrice", "Total price cannot be negative.");

        return new LineValues(input.QuantityType, box, pcs, pcsPerBox, total, perPcs, perBox, totalPrice);
    }

    public static void Apply(OrderLine line, LineValues values)
    {
        line.QuantityType = values.QuantityType;
        line.BoxQuantity = values.BoxQuantity;
        line.PcsQuantity = values.PcsQuantity;
        line.PcsPerBoxSnapshot = values.PcsPerBoxSnapshot;
        line.TotalQuantityPcs = values.TotalQuantityPcs;
        line.PerPcsPrice = values.PerPcsPrice;
        line.PerBoxPrice = values.PerBoxPrice;
        line.TotalPrice = values.TotalPrice;
    }

    /// <summary>Sum of quantities per product (a product may appear on several lines).</summary>
    public static Dictionary<Guid, decimal> QuantityByProduct(IEnumerable<OrderLine> lines) =>
        lines.Where(l => l.IsActive)
             .GroupBy(l => l.ProductUuid)
             .ToDictionary(g => g.Key, g => g.Sum(l => l.TotalQuantityPcs));
}

public static class SmsTemplates
{
    public static string Payment(TransactionType type, string companyName, string orderNumber, decimal amount, decimal due)
    {
        var amountText = amount.ToString("#,##0.##", CultureInfo.InvariantCulture);
        var dueText = due.ToString("#,##0.##", CultureInfo.InvariantCulture);
        var company = companyName.Length > 30 ? companyName[..30] : companyName;
        return type == TransactionType.Sales
            ? $"{company}: Payment of Tk {amountText} received for Sales #{orderNumber}. Due: Tk {dueText}. Thank you."
            : $"{company}: Payment of Tk {amountText} made for Purchase #{orderNumber}. Due: Tk {dueText}. Thank you.";
    }
}
