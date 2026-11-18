using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Sompriti.Erp.Application.Ai;
using Sompriti.Erp.Application.MasterData;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Tests;

/// <summary>
/// Memo scan (feature 3), offline: reading the model's form, matching products and suppliers,
/// converting units and checking the sums. How well a model reads real photos is measured live
/// (the AI page shows the share of lines saved unchanged).
/// </summary>
public class MemoScanTests
{
    private static readonly ProductDropdownItem Soap = P("P-1", "Lux Soap 100g", Uom.Box, Uom.Pcs, 12, 40);
    private static readonly ProductDropdownItem Atta = P("P-2", "Fresh Atta 2 KG", Uom.Packet, null, null, 110);
    private static readonly ProductDropdownItem Sugar = P("P-3", "Sugar", Uom.Kg, null, null, 125);
    private static readonly ProductDropdownItem Oil = P("P-4", "Rupchanda Soybean Oil 5L", Uom.Box, Uom.Litre, 5, 180);
    private static readonly ProductDropdownItem Eggs = P("P-5", "Egg", Uom.Pcs, null, null, 12);
    private static readonly ProductDropdownItem[] Products = [Soap, Atta, Sugar, Oil, Eggs];

    private static readonly MemoSupplier[] Suppliers =
    [
        new(Guid.NewGuid(), "S-1", "Rahim Traders", "01711-223344"),
        new(Guid.NewGuid(), "S-2", "Karim Enterprise", "01899000111"),
    ];

    private static readonly DateOnly Today = new(2026, 11, 18);

    private static ProductDropdownItem P(string code, string name, Uom uom, Uom? secondary, decimal? perBox, decimal price) =>
        new(Guid.NewGuid(), code, name, $"{name} ({code})", uom, secondary, perBox, price * 1.2m, price, 0);

    private static MemoLineRead Row(string text, decimal? qty, string? unit, decimal? price, decimal? total, string? code = null, bool unclear = false) =>
        new(text, qty, unit, price, total, code, unclear);

    private static MemoLineDto Line(MemoLineRead row) => MemoDraftBuilder.BuildLine(row, Products);

    private static string[] Flags(MemoLineDto l) => l.Flags.Select(f => f.Code).ToArray();

    // ------------------------------------------------------------------ reading the form

    [Fact]
    public void Reads_numbers_and_dates_as_written_in_Bangladesh()
    {
        Assert.Equal(1250m, MemoRead.Number(JsonValue.Create("১,২৫০")));
        Assert.Equal(1250m, MemoRead.Number(JsonValue.Create("Tk 1,250/-")));
        Assert.Equal(12.5m, MemoRead.Number(JsonValue.Create(12.5)));
        Assert.Null(MemoRead.Number(JsonValue.Create("--")));
        Assert.Equal(new DateOnly(2026, 11, 5), MemoRead.Date(JsonValue.Create("05/11/26")));
        Assert.Equal(new DateOnly(2026, 11, 5), MemoRead.Date(JsonValue.Create("২০২৬-১১-০৫")));
        Assert.Null(MemoRead.Date(JsonValue.Create("31/02/2026")));
    }

    [Fact]
    public void A_form_without_lines_or_descriptions_is_sent_back()
    {
        var problems = new List<string>();
        Assert.Null(MemoRead.Parse(new JsonObject { ["is_memo"] = true }, problems));
        Assert.True(problems.Count == 1);

        problems.Clear();
        var input = JsonNode.Parse("""{"is_memo":true,"lines":[{"description":"","quantity":1}]}""")!.AsObject();
        Assert.Null(MemoRead.Parse(input, problems));
        Assert.True(problems[0].Contains("description"));
    }

    [Theory]
    [InlineData("ctn", QuantityType.Box)]
    [InlineData("Carton", QuantityType.Box)]
    [InlineData("বস্তা", QuantityType.Box)]
    [InlineData("কেজি", QuantityType.Kg)]
    [InlineData("pcs.", QuantityType.Pcs)]
    [InlineData("টি", QuantityType.Pcs)]
    [InlineData("ltr", QuantityType.Litre)]
    [InlineData("ডজন", QuantityType.Dozen)]
    public void Knows_the_units_written_on_memos(string written, QuantityType expected)
    {
        Assert.Equal(expected, MemoUnits.Parse(written)!.Value.Type);
    }

    [Fact]
    public void Grams_become_kilos()
    {
        var gm = MemoUnits.Parse("gm")!.Value;
        Assert.Equal(QuantityType.Kg, gm.Type);
        Assert.Equal(0.001m, gm.Factor);
        Assert.Null(MemoUnits.Parse("xyz"));
    }

    // ------------------------------------------------------------------ products and units

    [Fact]
    public void Cartons_of_a_boxed_product_go_in_by_the_box()
    {
        var l = Line(Row("Lux Soap 100g", 2, "ctn", 480, 960));
        Assert.Equal(Soap.Uuid, l.Product!.Uuid);
        Assert.Equal("NAME", l.Match);
        Assert.Equal(QuantityType.Box, l.QuantityType);
        Assert.Equal(2, l.BoxQuantity);
        Assert.Equal(24m, l.TotalQuantity);
        Assert.Equal(480m, l.PerBoxPrice);
        Assert.Equal(40m, l.PerUnitPrice);
        Assert.Equal(960m, l.TotalPrice);
        Assert.Empty(l.Flags);
    }

    [Fact]
    public void Pieces_of_a_boxed_product_go_in_as_pieces()
    {
        var l = Line(Row("Lux Soap 100g", 30, "pcs", 40, 1200));
        Assert.Equal(QuantityType.Pcs, l.QuantityType);
        Assert.Equal(30m, l.UnitQuantity);
        Assert.Equal(1200m, l.TotalPrice);
        Assert.Empty(l.Flags);
    }

    [Fact]
    public void No_unit_on_the_memo_means_the_products_own_unit()
    {
        var l = Line(Row("Rupchanda Soybean Oil 5L", 3, null, 900, 2700));
        Assert.Equal(QuantityType.Box, l.QuantityType);
        Assert.Equal(3, l.BoxQuantity);
        Assert.Equal(15m, l.TotalQuantity);
        Assert.Equal(180m, l.PerUnitPrice);
        Assert.Empty(l.Flags);
    }

    [Fact]
    public void Dozens_of_a_product_counted_in_pieces_are_multiplied_out()
    {
        var l = Line(Row("Egg", 5, "dozen", 144, 720));
        Assert.Equal(QuantityType.Pcs, l.QuantityType);
        Assert.Equal(60m, l.UnitQuantity);
        Assert.Equal(12m, l.PerUnitPrice);
        Assert.Equal(720m, l.TotalPrice);
        Assert.Empty(l.Flags);
    }

    [Fact]
    public void Kilo_product_in_grams_is_converted()
    {
        var l = Line(Row("Sugar", 500, "gm", 0.125m, 62.5m));
        Assert.Equal(QuantityType.Kg, l.QuantityType);
        Assert.Equal(0.5m, l.UnitQuantity);
        Assert.Equal(125m, l.PerUnitPrice);
        Assert.Equal(62.5m, l.TotalPrice);
    }

    [Fact]
    public void A_sack_of_a_product_without_a_sack_size_is_flagged()
    {
        var l = Line(Row("Sugar", 2, "বস্তা", 6250, 12500));
        Assert.Equal(QuantityType.Kg, l.QuantityType);
        Assert.True(Flags(l).Contains("UNIT"));
    }

    [Fact]
    public void The_models_product_choice_matches_a_Bangla_name()
    {
        var l = Line(Row("চিনি", 50, "কেজি", 125, 6250, code: "P-3"));
        Assert.Equal(Sugar.Uuid, l.Product!.Uuid);
        Assert.Equal("AI", l.Match);
        Assert.Empty(l.Flags);
    }

    [Fact]
    public void A_product_code_the_shop_does_not_have_is_ignored()
    {
        var l = Line(Row("চিনি", 50, "কেজি", 125, 6250, code: "P-99"));
        Assert.Null(l.Product);
        Assert.Equal("NONE", l.Match);
        Assert.Equal(new[] { "NO_PRODUCT" }, Flags(l));
        // The memo's numbers stay, for when the person picks the product.
        Assert.Equal(50m, l.MemoQuantity);
        Assert.Equal(QuantityType.Kg, l.MemoUnitType);
    }

    [Fact]
    public void A_code_printed_on_the_memo_wins()
    {
        var l = Line(Row("P-2 atta", 10, null, 110, 1100));
        Assert.Equal(Atta.Uuid, l.Product!.Uuid);
        Assert.Equal("CODE", l.Match);
    }

    [Fact]
    public void Similar_names_are_suggested_and_marked()
    {
        Assert.Equal("NAME", Line(Row("fresh atta-2kg", 10, null, 110, 1100)).Match);
        var near = Line(Row("Frsh Ata 2kg", 10, null, 110, 1100));
        Assert.Equal(Atta.Uuid, near.Product!.Uuid);
        Assert.Equal("CHECK", near.Match);
        Assert.True(Flags(near).Contains("CHECK_PRODUCT"));
        Assert.Null(Line(Row("Wheel detergent", 1, null, 50, 50)).Product);
    }

    // ------------------------------------------------------------------ checks

    [Fact]
    public void Quantity_times_rate_not_matching_the_amount_is_flagged()
    {
        var l = Line(Row("Fresh Atta 2 KG", 3, null, 110, 440));
        Assert.Equal(new[] { "MATHS" }, Flags(l));
        Assert.Equal(330m, l.TotalPrice);
        Assert.Equal(440m, l.Flags[0].Amount);
    }

    [Fact]
    public void Rounding_on_the_memo_is_not_a_mistake()
    {
        Assert.Empty(Line(Row("Fresh Atta 2 KG", 3, null, 110.33m, 331)).Flags);
    }

    [Fact]
    public void A_rate_far_from_the_usual_price_is_flagged()
    {
        var l = Line(Row("Fresh Atta 2 KG", 10, null, 220, 2200));
        Assert.Equal(new[] { "PRICE" }, Flags(l));
        Assert.Equal(110m, l.Flags[0].Amount);
    }

    [Fact]
    public void A_missing_number_is_worked_out_from_the_other_two()
    {
        var l = Line(Row("Fresh Atta 2 KG", null, null, 110, 1100));
        Assert.Equal(10m, l.UnitQuantity);
        Assert.Empty(l.Flags);

        var noPrice = Line(Row("Fresh Atta 2 KG", 10, null, null, 1100));
        Assert.Equal(110m, noPrice.PerUnitPrice);
    }

    [Fact]
    public void Nothing_to_go_on_uses_the_usual_price_and_says_so()
    {
        var l = Line(Row("Fresh Atta 2 KG", 4, null, null, null, unclear: true));
        Assert.Equal(110m, l.PerUnitPrice);
        Assert.True(Flags(l).SequenceEqual(new[] { "UNCLEAR", "NO_PRICE" }));
    }

    // ------------------------------------------------------------------ the whole memo

    private static MemoRead Memo(string? name, string? phone, DateOnly? date, decimal? total, params MemoLineRead[] lines) =>
        new(true, name, phone, null, "1234", date, total, lines);

    [Fact]
    public void The_supplier_is_found_by_phone_even_with_another_name()
    {
        var draft = MemoDraftBuilder.Build(Memo("M/S Rahim Store", "+8801711223344", Today, null), Products, Suppliers, Today);
        Assert.Equal("S-1", draft.Supplier!.Code);
        Assert.False(draft.Supplier.Check);
        Assert.Empty(draft.Warnings);
    }

    [Fact]
    public void A_supplier_not_in_the_list_is_reported_by_name()
    {
        var draft = MemoDraftBuilder.Build(Memo("Hasan Brothers", null, Today, null), Products, Suppliers, Today);
        Assert.Null(draft.Supplier);
        Assert.Contains(draft.Warnings, w => w.Code == "NO_SUPPLIER" && w.Text == "Hasan Brothers");
    }

    [Fact]
    public void A_gap_between_the_rows_and_the_memo_total_is_reported()
    {
        var ok = MemoDraftBuilder.Build(Memo("Rahim Traders", null, Today, 2060,
            Row("Lux Soap 100g", 2, "ctn", 480, 960), Row("Fresh Atta 2 KG", 10, null, 110, 1100)), Products, Suppliers, Today);
        Assert.Empty(ok.Warnings);
        Assert.Equal(2060m, ok.DraftTotal);
        Assert.Equal(Today, ok.OrderDate);

        var gap = MemoDraftBuilder.Build(Memo("Rahim Traders", null, Today, 2500,
            Row("Lux Soap 100g", 2, "ctn", 480, 960), Row("Fresh Atta 2 KG", 10, null, 110, 1100)), Products, Suppliers, Today);
        Assert.Contains(gap.Warnings, w => w.Code == "TOTAL" && w.Amount == 2500m);
    }

    [Fact]
    public void A_date_in_the_future_is_not_used()
    {
        var draft = MemoDraftBuilder.Build(Memo("Rahim Traders", null, Today.AddDays(30), null), Products, Suppliers, Today);
        Assert.Null(draft.OrderDate);
        Assert.Contains(draft.Warnings, w => w.Code == "DATE");
    }

    // ------------------------------------------------------------------ the photo and the model

    [Fact]
    public void Only_real_photos_are_accepted()
    {
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4 };
        var (bytes, type) = MemoScanService.DecodeImage("data:image/jpeg;base64," + Convert.ToBase64String(jpeg));
        Assert.Equal("image/jpeg", type);
        Assert.Equal(jpeg.Length, bytes.Length);

        var threw = false;
        try { MemoScanService.DecodeImage(Convert.ToBase64String("%PDF-1.7 not a photo"u8.ToArray())); }
        catch (DomainException) { threw = true; }
        Assert.True(threw);
    }

    [Fact]
    public async Task A_reply_in_text_is_asked_again_for_the_form()
    {
        var model = new ScriptedModel(
            Reply(new JsonObject { ["type"] = "text", ["text"] = "This memo is from Rahim Traders." }),
            Reply(new JsonObject
            {
                ["type"] = "tool_use", ["id"] = "t1", ["name"] = "record_memo",
                ["input"] = JsonNode.Parse("""
                    {"is_memo":true,"supplier_name":"Rahim Traders","supplier_phone":null,"supplier_code":"S-1","memo_number":"88",
                     "memo_date":"2026-11-17","memo_total":960,
                     "lines":[{"description":"Lux soap","quantity":2,"unit":"ctn","unit_price":480,"line_total":960,"product_code":"P-1","unclear":false}]}
                    """),
            }));
        var service = new MemoScanService(null!, null!, null!, model, TimeProvider.System, NullLogger<MemoScanService>.Instance);

        var result = await service.ReadAsync([0xFF, 0xD8, 0xFF], "image/jpeg", "catalog", "claude-haiku-5-5", "low", 4096, default);

        Assert.Equal(2, result.ModelCalls);
        Assert.Equal("88", result.Read!.MemoNumber);
        Assert.Equal("P-1", result.Read.Lines[0].ProductCode);
        // The photo went first, then the shop's lists; the second call carried the model's reply and the nudge.
        var first = model.Requests[0].Messages[0]!["content"]!.AsArray();
        Assert.Equal("image", (string?)first[0]!["type"]);
        Assert.Equal(3, model.Requests[1].Messages.Count);
    }

    [Fact]
    public async Task A_broken_form_is_returned_with_what_is_wrong()
    {
        var model = new ScriptedModel(
            Reply(new JsonObject { ["type"] = "tool_use", ["id"] = "t1", ["name"] = "record_memo", ["input"] = new JsonObject { ["is_memo"] = true } }),
            Reply(new JsonObject { ["type"] = "tool_use", ["id"] = "t2", ["name"] = "record_memo", ["input"] = new JsonObject { ["is_memo"] = false, ["lines"] = new JsonArray() } }));
        var service = new MemoScanService(null!, null!, null!, model, TimeProvider.System, NullLogger<MemoScanService>.Instance);

        var result = await service.ReadAsync([0xFF, 0xD8, 0xFF], "image/jpeg", "catalog", "claude-haiku-5-5", "low", 4096, default);

        Assert.False(result.Read!.IsMemo);
        var toolResult = model.Requests[1].Messages[2]!["content"]![0]!;
        Assert.Equal("tool_result", (string?)toolResult["type"]);
        Assert.Equal("t1", (string?)toolResult["tool_use_id"]);
        Assert.True((bool)toolResult["is_error"]!);
    }

    private static AiReply Reply(JsonObject block) =>
        new(new JsonArray(block), (string?)block["type"] == "tool_use" ? "tool_use" : "end_turn", new AiTokens(1500, 200, 0, 0), 900);

    private sealed class ScriptedModel(params AiReply[] replies) : IAiModelClient
    {
        private int _next;
        public List<AiRequest> Requests { get; } = [];
        public bool IsConfigured => true;

        public Task<AiReply> SendAsync(AiRequest request, CancellationToken ct)
        {
            // A copy: the service keeps adding to the same conversation.
            Requests.Add(request with { Messages = request.Messages.DeepClone().AsArray() });
            return Task.FromResult(replies[_next++]);
        }

        public Task<IReadOnlyList<AiModelInfo>> ListModelsAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<AiModelInfo>>([]);
    }
}
