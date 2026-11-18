using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Sompriti.Erp.Application.MasterData;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Ai;

// ======================================================================= what the model read

/// <summary>One item row of the memo, as written on it.</summary>
public sealed record MemoLineRead(string Description, decimal? Quantity, string? Unit, decimal? UnitPrice, decimal? LineTotal,
    string? ProductCode, bool Unclear);

/// <summary>The memo as the model read it: copied, not interpreted. Matching and checks happen in <see cref="MemoDraftBuilder"/>.</summary>
public sealed record MemoRead(bool IsMemo, string? SupplierName, string? SupplierPhone, string? SupplierCode, string? MemoNumber,
    DateOnly? MemoDate, decimal? MemoTotal, IReadOnlyList<MemoLineRead> Lines)
{
    /// <summary>
    /// Reads the record_memo tool's input. Lenient where it costs nothing (a number sent as "1,250"
    /// or "১২৫০", a date as 05/11/2026), strict where it matters: a missing line list or a row
    /// without a description is a problem the model is told about and asked to fix.
    /// </summary>
    public static MemoRead? Parse(JsonObject input, List<string> problems)
    {
        if (input["lines"] is not JsonArray rows)
        {
            problems.Add("\"lines\" must be an array (empty when the photo is not a memo).");
            return null;
        }

        var lines = new List<MemoLineRead>();
        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i] is not JsonObject row) { problems.Add($"lines[{i}] must be an object."); continue; }
            var description = Text(row["description"]);
            if (description is null) { problems.Add($"lines[{i}].description is missing."); continue; }
            lines.Add(new MemoLineRead(description, Number(row["quantity"]), Text(row["unit"]), Number(row["unit_price"]),
                Number(row["line_total"]), Text(row["product_code"]), row["unclear"] is JsonValue u && u.TryGetValue(out bool b) && b));
        }
        if (problems.Count > 0) return null;

        var isMemo = input["is_memo"] is not JsonValue m || !m.TryGetValue(out bool memo) || memo;
        return new MemoRead(isMemo, Text(input["supplier_name"]), Text(input["supplier_phone"]), Text(input["supplier_code"]),
            Text(input["memo_number"]), Date(input["memo_date"]), Number(input["memo_total"]), lines);
    }

    private static string? Text(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        var s = v.TryGetValue(out string? str) ? str : v.ToJsonString();
        s = s?.Trim();
        return string.IsNullOrEmpty(s) || s == "null" ? null : s.Length > 200 ? s[..200] : s;
    }

    /// <summary>A number from 1250, "1,250", "১২৫০", "Tk 1,250/-". Null when there is none.</summary>
    public static decimal? Number(JsonNode? n)
    {
        if (n is not JsonValue v) return null;
        if (v.TryGetValue(out decimal d)) return d;
        if (v.TryGetValue(out double dbl) && double.IsFinite(dbl)) return (decimal)dbl;
        if (!v.TryGetValue(out string? s) || s is null) return null;
        s = MemoText.AsciiDigits(s).Replace(",", "");
        var match = Regex.Match(s, @"-?\d+(\.\d+)?");
        return match.Success && decimal.TryParse(match.Value, NumberStyles.Number, CultureInfo.InvariantCulture, out var x) ? x : null;
    }

    /// <summary>"2026-11-05", or a day-first date as written in Bangladesh: 05/11/2026, 5-11-26.</summary>
    public static DateOnly? Date(JsonNode? n)
    {
        if (n is not JsonValue v || !v.TryGetValue(out string? s) || string.IsNullOrWhiteSpace(s)) return null;
        s = MemoText.AsciiDigits(s.Trim());
        if (DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var iso)) return iso;
        var m = Regex.Match(s, @"^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2}|\d{4})$");
        if (!m.Success) return null;
        int day = int.Parse(m.Groups[1].Value), month = int.Parse(m.Groups[2].Value), year = int.Parse(m.Groups[3].Value);
        if (year < 100) year += 2000;
        return month is >= 1 and <= 12 && day >= 1 && day <= DateTime.DaysInMonth(year, month) ? new DateOnly(year, month, day) : null;
    }
}

// ======================================================================= text helpers

public static class MemoText
{
    /// <summary>Bangla (and Arabic-Indic) digits as 0-9: "১২৫০" -> "1250".</summary>
    public static string AsciiDigits(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s)
        {
            if (c is >= '০' and <= '৯') sb.Append((char)('0' + (c - '০')));
            else if (c is >= '٠' and <= '٩') sb.Append((char)('0' + (c - '٠')));
            else sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>
    /// Lower case, Bangla digits as 0-9, punctuation as spaces, and a number split from its unit
    /// ("2kg" -> "2 kg") - so "Fresh Atta-2KG" and "fresh atta 2 kg" compare equal.
    /// </summary>
    public static string Normalize(string s)
    {
        s = AsciiDigits(s.Normalize(NormalizationForm.FormC)).ToLowerInvariant();
        var sb = new StringBuilder(s.Length + 8);
        char prev = ' ';
        foreach (var c in s)
        {
            var ch = char.IsLetterOrDigit(c) || char.GetUnicodeCategory(c) is UnicodeCategory.NonSpacingMark or UnicodeCategory.SpacingCombiningMark
                ? c : ' ';
            if ((char.IsDigit(ch) && char.IsLetter(prev)) || (char.IsLetter(ch) && char.IsDigit(prev)))
                sb.Append(' ');
            if (ch == ' ' && prev == ' ') continue;
            sb.Append(ch);
            prev = ch;
        }
        return sb.ToString().Trim();
    }

    /// <summary>
    /// How alike two names are, 0 to 1: the better of word overlap and letter-triplet overlap, so
    /// both "Atta 2kg Fresh" (same words, other order) and "Frsh Atta" (a letter missing) score high.
    /// </summary>
    public static double Similarity(string a, string b)
    {
        var x = Normalize(a);
        var y = Normalize(b);
        if (x.Length == 0 || y.Length == 0) return 0;
        if (x == y) return 1;

        var wx = x.Split(' ').ToHashSet();
        var wy = y.Split(' ').ToHashSet();
        var words = 2.0 * wx.Intersect(wy).Count() / (wx.Count + wy.Count);

        var tx = Trigrams(x);
        var ty = Trigrams(y);
        var common = tx.Keys.Sum(k => Math.Min(tx[k], ty.GetValueOrDefault(k)));
        var grams = 2.0 * common / (tx.Values.Sum() + ty.Values.Sum());
        return Math.Max(words, grams);
    }

    private static Dictionary<string, int> Trigrams(string s)
    {
        var padded = "  " + s + " ";
        var d = new Dictionary<string, int>();
        for (var i = 0; i + 3 <= padded.Length; i++)
        {
            var g = padded.Substring(i, 3);
            d[g] = d.GetValueOrDefault(g) + 1;
        }
        return d;
    }

    /// <summary>The last ten digits of a phone number, so 01712-345678 and +8801712345678 match.</summary>
    public static string? PhoneKey(string? phone)
    {
        if (phone is null) return null;
        var digits = new string(AsciiDigits(phone).Where(char.IsDigit).ToArray());
        return digits.Length >= 10 ? digits[^10..] : null;
    }
}

// ======================================================================= units on a memo

public static class MemoUnits
{
    private static readonly (QuantityType Type, decimal Factor, string[] Words)[] Known =
    [
        (QuantityType.Box, 1, ["box", "boxes", "bx", "ctn", "ctns", "carton", "cartons", "case", "cases", "bag", "bags", "sack", "sacks",
            "bosta", "বস্তা", "কার্টন", "কাটুন", "বক্স", "বাক্স", "ব্যাগ"]),
        (QuantityType.Pcs, 1, ["pcs", "pc", "pce", "piece", "pieces", "nos", "no", "nr", "unit", "units", "পিস", "পিচ", "টি", "টা", "খানা"]),
        (QuantityType.Kg, 1, ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "কেজি", "কে জি"]),
        (QuantityType.Kg, 0.001m, ["g", "gm", "gms", "gram", "grams", "গ্রাম"]),
        (QuantityType.Litre, 1, ["l", "lt", "ltr", "ltrs", "litre", "litres", "liter", "liters", "লিটার"]),
        (QuantityType.Litre, 0.001m, ["ml", "mls", "মিলি"]),
        (QuantityType.Dozen, 1, ["dozen", "dz", "doz", "ডজন"]),
        (QuantityType.Packet, 1, ["packet", "packets", "pkt", "pkts", "pack", "packs", "প্যাকেট"]),
        (QuantityType.Tin, 1, ["tin", "tins", "টিন"]),
        (QuantityType.Jar, 1, ["jar", "jars", "জার", "বয়াম"]),
        (QuantityType.Drum, 1, ["drum", "drums", "ড্রাম"]),
    ];

    /// <summary>
    /// The unit written on the memo as one of ours, with what one of it is in that unit
    /// (500 gm -> 0.5 kg). Null when nothing is written or the word is not known.
    /// </summary>
    public static (QuantityType Type, decimal Factor)? Parse(string? unit)
    {
        if (unit is null) return null;
        var u = MemoText.Normalize(unit).Replace(".", "");
        if (u.Length == 0) return null;
        foreach (var (type, factor, words) in Known)
            if (words.Contains(u)) return (type, factor);
        // "12 pcs" or "ctn of 12": the first word that is a unit decides.
        foreach (var word in u.Split(' '))
            foreach (var (type, factor, words) in Known)
                if (words.Contains(word)) return (type, factor);
        return null;
    }
}

// ======================================================================= the draft

/// <summary>A note on the draft or one of its lines, by code; the screen words it in the person's language.</summary>
/// <remarks>
/// Line codes: NO_PRODUCT, CHECK_PRODUCT, UNCLEAR, MATHS (Amount = the memo's line total), UNIT (Text = the memo's unit),
/// PRICE (Amount = the product's usual price), NO_PRICE, NO_QTY.
/// Memo codes: NOT_A_MEMO, NO_SUPPLIER (Text = name on the memo), CHECK_SUPPLIER, TOTAL (Amount = the memo's total),
/// DATE (Text = the memo's date), DUPLICATE (Text = the earlier order's number), TOO_MANY_LINES (Amount = lines on the memo).
/// </remarks>
public sealed record MemoNoteDto(string Code, decimal? Amount = null, string? Text = null);

public sealed record MemoSupplierDto(Guid Uuid, string Code, string Name, string Label, bool Check);

/// <summary>One draft line: what the memo says, the product it was matched to, and the order line it becomes.</summary>
public sealed record MemoLineDto(
    string Text, decimal? MemoQuantity, string? MemoUnit, decimal? MemoUnitPrice, decimal? MemoLineTotal,
    QuantityType? MemoUnitType, decimal MemoUnitFactor,
    ProductDropdownItem? Product, string Match,
    QuantityType? QuantityType, int? BoxQuantity, decimal? UnitQuantity, decimal? TotalQuantity,
    decimal? PerUnitPrice, decimal? PerBoxPrice, decimal? TotalPrice,
    IReadOnlyList<MemoNoteDto> Flags);

public sealed record MemoDraft(MemoSupplierDto? Supplier, string? SupplierText, DateOnly? OrderDate, IReadOnlyList<MemoLineDto> Lines,
    decimal DraftTotal, List<MemoNoteDto> Warnings);

/// <summary>A supplier as the matcher needs it.</summary>
public sealed record MemoSupplier(Guid Uuid, string Code, string Name, string Mobile);

/// <summary>
/// Turns what the model read into a draft purchase order: finds the supplier and each product
/// among the business's own, converts the memo's units to the product's (2 ctn of a 12-pcs
/// carton is 2 boxes; 500 gm is 0.5 kg), and checks the sums. Nothing here is saved: the person
/// sees the draft in the order editor, fixes what is flagged, and saves it the usual way.
/// </summary>
public static class MemoDraftBuilder
{
    /// <summary>A name this alike is the product without asking.</summary>
    public const double SureMatch = 0.8;
    /// <summary>A name this alike is suggested, marked "check".</summary>
    public const double MaybeMatch = 0.55;

    public static MemoDraft Build(MemoRead read, IReadOnlyList<ProductDropdownItem> products, IReadOnlyList<MemoSupplier> suppliers,
        DateOnly today)
    {
        var warnings = new List<MemoNoteDto>();
        if (!read.IsMemo) warnings.Add(new MemoNoteDto("NOT_A_MEMO"));

        // ---- supplier
        var (supplier, check) = FindSupplier(read, suppliers);
        if (supplier is null && read.SupplierName is not null) warnings.Add(new MemoNoteDto("NO_SUPPLIER", Text: read.SupplierName));
        else if (check) warnings.Add(new MemoNoteDto("CHECK_SUPPLIER", Text: read.SupplierName));
        var supplierDto = supplier is null ? null
            : new MemoSupplierDto(supplier.Uuid, supplier.Code, supplier.Name, $"{supplier.Name} ({supplier.Code})", check);

        // ---- date: a memo dated in the future or long ago was probably misread
        DateOnly? date = null;
        if (read.MemoDate is { } d)
        {
            if (d <= today && d >= today.AddDays(-120)) date = d;
            else warnings.Add(new MemoNoteDto("DATE", Text: d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));
        }

        // ---- lines
        var rows = read.Lines;
        if (rows.Count > AiRules.MaxMemoLines)
        {
            warnings.Add(new MemoNoteDto("TOO_MANY_LINES", rows.Count));
            rows = rows.Take(AiRules.MaxMemoLines).ToList();
        }
        var byCode = products.GroupBy(p => p.Code, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var lines = rows.Select(r => BuildLine(r, products, byCode)).ToList();
        var draftTotal = Money.Round(lines.Sum(l => l.TotalPrice ?? 0));

        // ---- the memo's own total: a gap means a line was missed or misread, or a discount
        if (read.MemoTotal is { } memoTotal && memoTotal > 0 && lines.Count > 0)
        {
            var linesOnMemo = lines.Sum(l => l.MemoLineTotal ?? l.TotalPrice ?? 0);
            if (!Close(linesOnMemo, memoTotal) && !Close(draftTotal, memoTotal)) warnings.Add(new MemoNoteDto("TOTAL", memoTotal));
        }

        return new MemoDraft(supplierDto, read.SupplierName, date, lines, draftTotal, warnings);
    }

    /// <summary>By phone first (what a memo header nearly always has), then the code the model chose, then the name.</summary>
    public static (MemoSupplier? Supplier, bool Check) FindSupplier(MemoRead read, IReadOnlyList<MemoSupplier> suppliers)
    {
        if (MemoText.PhoneKey(read.SupplierPhone) is { } phone
            && suppliers.FirstOrDefault(s => MemoText.PhoneKey(s.Mobile) == phone) is { } byPhone)
            return (byPhone, false);

        if (read.SupplierCode is { } code && suppliers.FirstOrDefault(s => s.Code.Equals(code, StringComparison.OrdinalIgnoreCase)) is { } byCode)
            return (byCode, false);

        if (read.SupplierName is not { } name) return (null, false);
        var best = suppliers.Select(s => (s, score: MemoText.Similarity(name, s.Name))).OrderByDescending(x => x.score).FirstOrDefault();
        if (best.s is null || best.score < MaybeMatch) return (null, false);
        return (best.s, best.score < SureMatch);
    }

    public static MemoLineDto BuildLine(MemoLineRead r, IReadOnlyList<ProductDropdownItem> products,
        IReadOnlyDictionary<string, ProductDropdownItem>? byCode = null)
    {
        byCode ??= products.GroupBy(p => p.Code, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var flags = new List<MemoNoteDto>();
        if (r.Unclear) flags.Add(new MemoNoteDto("UNCLEAR"));

        // ---- the product
        var (product, match) = FindProduct(r, products, byCode);
        if (product is null) flags.Add(new MemoNoteDto("NO_PRODUCT"));
        else if (match == "CHECK") flags.Add(new MemoNoteDto("CHECK_PRODUCT"));

        // ---- the memo's numbers: fill the one missing from the other two
        var qty = r.Quantity is > 0 ? r.Quantity : null;
        var price = r.UnitPrice is >= 0 ? r.UnitPrice : null;
        var lineTotal = r.LineTotal is >= 0 ? r.LineTotal : null;
        if (qty is null && price is > 0 && lineTotal is > 0) qty = Qty.Round(lineTotal.Value / price.Value);
        if (price is null && qty is > 0 && lineTotal is { } lt) price = Money.Round(lt / qty.Value);

        var unit = MemoUnits.Parse(r.Unit);
        if (r.Unit is not null && unit is null) flags.Add(new MemoNoteDto("UNIT", Text: r.Unit));

        if (product is null)
            return new MemoLineDto(r.Description, r.Quantity, r.Unit, r.UnitPrice, r.LineTotal, unit?.Type, unit?.Factor ?? 1,
                null, "NONE", null, null, null, null, null, null, null, flags);

        if (qty is null) { qty = 1; flags.Add(new MemoNoteDto("NO_QTY")); }
        var usual = product.PurchasePrice;
        if (price is null) flags.Add(new MemoNoteDto("NO_PRICE"));

        // ---- the memo's unit as one of the product's: by the box, or in its base unit
        var perBox = product.UnitPerBox is > 0 ? product.UnitPerBox.Value : 0;
        var baseType = Units.AsQuantityType(Units.BaseUnit(product.Uom, product.SecondaryUom));
        QuantityType type;
        decimal amount;           // in the line's own unit: boxes, or the base unit
        decimal? unitPrice;       // per that unit
        var wanted = unit?.Type ?? (product.Uom == Uom.Box && perBox > 0 ? QuantityType.Box : baseType);
        var factor = unit?.Factor ?? 1;

        if (wanted == QuantityType.Box && perBox > 0 && qty.Value == decimal.Truncate(qty.Value))
        {
            type = QuantityType.Box; amount = qty.Value; unitPrice = price;
        }
        else if (wanted == QuantityType.Box && perBox > 0)
        {
            // 2.5 cartons: entered as pieces, which is the same amount
            type = baseType; amount = qty.Value * perBox; unitPrice = price / perBox;
        }
        else if (wanted == baseType)
        {
            type = baseType; amount = qty.Value * factor; unitPrice = price / factor;
        }
        else if (wanted == QuantityType.Dozen && baseType == QuantityType.Pcs)
        {
            type = baseType; amount = qty.Value * 12; unitPrice = price / 12;
        }
        else if (wanted == QuantityType.Pcs && baseType == QuantityType.Dozen && qty.Value % 12 == 0)
        {
            type = baseType; amount = qty.Value / 12; unitPrice = price * 12;
        }
        else
        {
            // A unit the product is not sold in (a sack of a product with no sack size): the
            // number goes in as written, and the person decides.
            type = baseType; amount = qty.Value; unitPrice = price;
            if (unit is not null) flags.Add(new MemoNoteDto("UNIT", Text: r.Unit));
        }

        if (type != QuantityType.Box && !Units.AllowsFractions(type) && amount != decimal.Truncate(amount)
            && flags.All(f => f.Code != "UNIT"))
            flags.Add(new MemoNoteDto("UNIT", Text: r.Unit));

        int? boxQty = null; decimal? unitQty = null; decimal totalQty; decimal perUnit; decimal? perBoxPrice = null; decimal total;
        if (type == QuantityType.Box)
        {
            boxQty = (int)amount;
            totalQty = Qty.Round(amount * perBox);
            perBoxPrice = Money.Round(unitPrice ?? usual * perBox);
            perUnit = Money.Round(perBoxPrice.Value / perBox);
            total = Money.Round(boxQty.Value * perBoxPrice.Value);
        }
        else
        {
            unitQty = Qty.Round(amount);
            totalQty = unitQty.Value;
            perUnit = Money.Round(unitPrice ?? usual);
            total = Money.Round(totalQty * perUnit);
        }

        // ---- checks: the memo's sum, and the price against what this product usually costs
        if (lineTotal is { } memoLineTotal && !Close(total, memoLineTotal)) flags.Add(new MemoNoteDto("MATHS", memoLineTotal));
        if (price is not null && usual > 0 && (perUnit < usual * 0.75m || perUnit > usual * 1.33m))
            flags.Add(new MemoNoteDto("PRICE", usual));

        return new MemoLineDto(r.Description, r.Quantity, r.Unit, r.UnitPrice, r.LineTotal, unit?.Type, factor,
            product, match, type, boxQty, unitQty, totalQty, perUnit, perBoxPrice, total, flags);
    }

    /// <summary>
    /// The product code printed on the memo, or the one the model chose from the catalog (it can
    /// match "চিনি ৫০ কেজি" to "Sugar 50kg sack", which spelling alone cannot), or the closest name.
    /// Match: CODE, AI, NAME (sure), CHECK (suggested), NONE.
    /// </summary>
    public static (ProductDropdownItem? Product, string Match) FindProduct(MemoLineRead r, IReadOnlyList<ProductDropdownItem> products,
        IReadOnlyDictionary<string, ProductDropdownItem> byCode)
    {
        foreach (var word in r.Description.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            if (word.Length >= 3 && byCode.TryGetValue(word.Trim('(', ')', ',', '.', ':'), out var printed)) return (printed, "CODE");

        if (r.ProductCode is { } code && byCode.TryGetValue(code.Trim(), out var chosen)) return (chosen, "AI");

        var ranked = products.Select(p => (p, score: MemoText.Similarity(r.Description, p.Name)))
            .OrderByDescending(x => x.score).Take(2).ToList();
        if (ranked.Count == 0 || ranked[0].score < MaybeMatch) return (null, "NONE");
        var clear = ranked.Count == 1 || ranked[0].score - ranked[1].score >= 0.05;
        return (ranked[0].p, ranked[0].score >= SureMatch && clear ? "NAME" : "CHECK");
    }

    /// <summary>Equal within Tk 1 or half a percent: rounding on the memo is not a mistake.</summary>
    public static bool Close(decimal a, decimal b) => Math.Abs(a - b) <= Math.Max(1m, Math.Abs(b) * 0.005m);
}
