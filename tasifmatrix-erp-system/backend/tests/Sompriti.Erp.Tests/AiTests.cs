using System.Text.Json;
using Sompriti.Erp.Application.Ai;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Tests;

/// <summary>
/// The help assistant's retrieval, checked offline against its own eval questions (no API key, no
/// cost): for most questions the right guide section must be among the four pieces the model is
/// given first. The live eval - the model's actual answers - runs from the super admin's AI page.
/// </summary>
public class GuideSearchTests
{
    private static readonly Lazy<GuideIndex> Index = new(() => GuideIndex.FromJson(File.ReadAllText(FindGuide())));

    private static string FindGuide()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, "frontend", "public", "guide-index.json");
            if (File.Exists(path)) return path;
        }
        throw new FileNotFoundException("frontend/public/guide-index.json not found. Run: cd frontend && node tools/export-guide.mjs");
    }

    private static IEnumerable<(string Q, string Lang, string[] Expect)> EvalQuestions()
    {
        using var stream = typeof(GuideIndex).Assembly.GetManifestResourceStream("Sompriti.Erp.Application.Ai.help-evals.json")!;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.GetProperty("items").EnumerateArray()
            .Select(i => (i.GetProperty("q").GetString()!, i.GetProperty("lang").GetString()!,
                i.GetProperty("expect").EnumerateArray().Select(e => e.GetString()!).ToArray()))
            .Where(i => !i.Item3.Contains("none"))
            .ToList();
    }

    [Fact]
    public void Finds_the_right_section_for_most_eval_questions()
    {
        var questions = EvalQuestions().ToList();
        var found = questions.Count(q => Index.Value.Search(q.Q, q.Lang, Role.Admin).Any(h => q.Expect.Contains(h.Chunk.SectionId)));
        Assert.True(found >= questions.Count * 0.85, $"Right section in the top 4 for {found} of {questions.Count} questions.");
    }

    [Theory]
    [InlineData("আগের বাকি কীভাবে যোগ করব?", "bn")]
    [InlineData("customer er ager baki kivabe add korbo", "bn")]
    [InlineData("How do I add a previous due?", "en")]
    public void Bangla_banglish_and_english_reach_the_same_answer(string question, string lang)
    {
        var hits = Index.Value.Search(question, lang, Role.Admin);
        Assert.Contains(hits, h => h.Chunk.SectionId is "parties" or "faq");
    }

    [Fact]
    public void Answers_in_the_askers_language()
    {
        var hit = Index.Value.Search("previous due customer", "bn", Role.Admin)[0];
        Assert.Equal("bn", hit.Chunk.Lang);
    }

    [Fact]
    public void Gives_the_computer_steps_on_a_computer()
    {
        var mobile = Index.Value.Search("add customer", "en", Role.Admin, 4, "mobile");
        var desktop = Index.Value.Search("add customer", "en", Role.Admin, 4, "desktop");
        Assert.True(mobile.All(h => h.Chunk.Device is "mobile" or "any"));
        Assert.True(desktop.All(h => h.Chunk.Device is "desktop" or "any"));
    }

    [Fact]
    public void Leaves_out_payment_instructions_and_sections_of_other_roles()
    {
        // Buying SMS and the subscription are web-only (Google Play): never in the assistant.
        Assert.DoesNotContain(Index.Value.Search("buy sms bkash package subscription", "en", Role.Admin),
            h => h.Chunk.SectionId is "sms-buy" or "billing");
        // A customer's login does not get the admin's team section.
        Assert.False(Index.Value.IsVisible("team", Role.User));
        Assert.True(Index.Value.IsVisible("portal", Role.User));
    }
}

public class HelpAnswerTests
{
    [Fact]
    public void Splits_the_sources_line_off_the_answer()
    {
        var (answer, ids) = HelpAssistantService.SplitSources("1. Open Customers.\n2. Tap ⋮ → Add previous due.\nSOURCES: parties, faq");
        Assert.Equal("1. Open Customers.\n2. Tap ⋮ → Add previous due.", answer);
        Assert.Equal(new[] { "parties", "faq" }, ids.ToArray());
    }

    [Fact]
    public void No_sources_when_the_guide_was_not_used()
    {
        var (answer, ids) = HelpAssistantService.SplitSources("I can only help with using the app.\nSOURCES: none");
        Assert.Equal("I can only help with using the app.", answer);
        Assert.Empty(ids);
    }

    [Fact]
    public void Prices_a_haiku_question()
    {
        // 5,000 tokens read and 300 written on Haiku 5.5: 5000 x 0.10 + 300 x 0.50 per million.
        Assert.Equal(0.00065m, AiPricing.Cost("claude-haiku-5-5", 5000, 300, 0, 0));
        Assert.Null(AiPricing.Cost("some-future-model", 5000, 300, 0, 0));
        Assert.True(AiRules.IsModelId("claude-sonnet-5-5"));
        Assert.False(AiRules.IsModelId("Claude Sonnet 5.5"));
    }
}

/// <summary>"Ask your business": who may press which button, checked without a model or a database.</summary>
public class BusinessToolTests
{
    [Fact]
    public void A_manager_is_never_offered_suppliers_purchases_or_profit()
    {
        var names = BusinessToolCatalog.Definitions(Role.Manager).Select(t => (string?)t!["name"]).ToList();
        Assert.Contains(names, n => n == "find_customer");
        Assert.Contains(names, n => n == "sales_summary");
        Assert.DoesNotContain(names, n => n is "find_supplier" or "get_supplier_balance" or "supplier_dues" or "purchase_summary" or "profit_summary");
        Assert.Equal(BusinessToolCatalog.All.Count, BusinessToolCatalog.Definitions(Role.Admin).Count);
    }

    [Fact]
    public async Task A_tool_not_offered_does_not_run_even_if_asked_for()
    {
        var box = new FixtureToolbox(new System.Text.Json.Nodes.JsonObject { ["profit_summary"] = new System.Text.Json.Nodes.JsonObject { ["net_profit"] = "Tk 1.00" } });
        var output = await box.RunAsync("profit_summary", new System.Text.Json.Nodes.JsonObject(), Role.Manager, CancellationToken.None);
        Assert.True(output.IsError);
        Assert.DoesNotContain(new[] { output.Text }, t => t.Contains("Tk 1.00"));
    }

    [Fact]
    public void Every_eval_question_names_real_tools()
    {
        using var stream = typeof(BusinessToolCatalog).Assembly.GetManifestResourceStream("Sompriti.Erp.Application.Ai.business-evals.json")!;
        var file = System.Text.Json.Nodes.JsonNode.Parse(stream)!;
        var known = BusinessToolCatalog.All.Select(t => t.Name).ToHashSet();
        foreach (var (name, _) in file["fixtures"]!.AsObject()) Assert.True(known.Contains(name), $"Fixture for unknown tool {name}");
        foreach (var item in file["items"]!.AsArray())
            foreach (var key in new[] { "expectTools", "mustNotCall" })
                foreach (var tool in item![key]?.AsArray() ?? [])
                    Assert.True(known.Contains((string)tool!), $"Eval names unknown tool {tool}");
    }
}
