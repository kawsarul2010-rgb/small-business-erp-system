using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Ai;

public sealed record AiSettingsDto(bool AiEnabled, string HelpModel, string BusinessModel, string Effort, int DailyLimitPerBusiness,
    int MaxOutputTokens, bool KeyConfigured, DateTimeOffset UpdatedDate, string UpdatedByUserName);

public sealed record AiSettingsRequest(bool? AiEnabled, string? HelpModel, string? BusinessModel, string? Effort,
    int? DailyLimitPerBusiness, int? MaxOutputTokens);

public sealed record AiModelDto(string Id, string DisplayName, decimal? InputPricePerMillion, decimal? OutputPricePerMillion);

public sealed record AiTestRequest(string? Model);

public sealed record AiTestResultDto(string Model, string Reply, int LatencyMs, int InputTokens, int OutputTokens, decimal? CostUsd);

/// <summary>One business on the AI page: its switch, and this month's questions, cost and thumbs.</summary>
public sealed record AiBusinessDto(Guid Uuid, string TenantCode, string TenantName, bool AiEnabled,
    int Questions, int Failed, decimal CostUsd, int ThumbsUp, int ThumbsDown, DateTimeOffset? LastUsed);

public sealed record AiBusinessRequest(bool AiEnabled);

public sealed record HelpEvalItemDto(string Question, string Lang, IReadOnlyList<string> Expected, bool Passed, string Answer,
    IReadOnlyList<string> Sources, IReadOnlyList<string> Searches, int LatencyMs, decimal? CostUsd, string? Error);

public sealed record HelpEvalRunDto(string Model, int Passed, int Total, decimal ScorePercent, decimal CostUsd, int AverageLatencyMs,
    IReadOnlyList<HelpEvalItemDto> Items);

/// <summary>
/// The super admin's AI page: the master switch, which model each feature uses, effort, the daily
/// limit, AI on/off per business, what each business used this month, and the help assistant's
/// eval run. Business data is never shown here - only counts and costs.
/// </summary>
public sealed class PlatformAiService(IAppDbContext db, ICurrentUser currentUser, IAiModelClient client, AiSettingsCache cache,
    HelpAssistantService help, BusinessAssistantService business, TimeProvider clock)
{
    // ------------------------------------------------------------------ settings

    public async Task<AiSettingsDto> SettingsAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        return ToDto(await LoadAsync(ct));
    }

    public async Task<AiSettingsDto> SaveSettingsAsync(AiSettingsRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var v = new Validator();
        v.When(!AiRules.IsModelId(r.HelpModel), "helpModel", "Enter a model id, for example claude-haiku-5-5.");
        v.When(!AiRules.IsModelId(r.BusinessModel), "businessModel", "Enter a model id, for example claude-haiku-5-5.");
        v.When(r.Effort is null || !AiRules.Efforts.Contains(r.Effort), "effort", "Choose low, medium or high.");
        v.When(r.DailyLimitPerBusiness is not (>= 1 and <= 10_000), "dailyLimitPerBusiness", "Daily limit must be 1 to 10000.");
        v.When(r.MaxOutputTokens is not (>= 256 and <= 16_000), "maxOutputTokens", "Longest answer must be 256 to 16000 tokens.");
        v.ThrowIfInvalid();

        var s = await LoadAsync(ct);
        s.AiEnabled = r.AiEnabled ?? false;
        s.HelpModel = r.HelpModel!.Trim();
        s.BusinessModel = r.BusinessModel!.Trim();
        s.Effort = r.Effort!;
        s.DailyLimitPerBusiness = r.DailyLimitPerBusiness!.Value;
        s.MaxOutputTokens = r.MaxOutputTokens!.Value;
        s.UpdatedDate = clock.GetUtcNow();
        s.UpdatedByUserName = currentUser.UserName;
        await db.SaveChangesAsync(ct);
        cache.Invalidate();
        return ToDto(s);
    }

    /// <summary>The models the API key can use, with the price where the app knows it.</summary>
    public async Task<IReadOnlyList<AiModelDto>> ModelsAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        EnsureKey();
        try
        {
            var models = await client.ListModelsAsync(ct);
            return models.Select(m => new AiModelDto(m.Id, m.DisplayName, AiPricing.For(m.Id)?.Input, AiPricing.For(m.Id)?.Output)).ToList();
        }
        catch (AiProviderException ex)
        {
            throw ProviderProblem(ex);
        }
    }

    /// <summary>A one-line call to check the key, the model and the connection.</summary>
    public async Task<AiTestResultDto> TestAsync(AiTestRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        EnsureKey();
        var s = await LoadAsync(ct);
        var model = AiRules.IsModelId(r.Model) ? r.Model!.Trim() : s.HelpModel;
        try
        {
            var reply = await client.SendAsync(new AiRequest(model,
                "You check that the connection works. Reply with one short friendly sentence in English and the same in Bangla.",
                [new JsonObject { ["role"] = "user", ["content"] = "Hello from the Tasif Matrix AI settings page." }],
                null, "low", 300), ct);
            return new AiTestResultDto(model, reply.Text, reply.LatencyMs, reply.Tokens.Input, reply.Tokens.Output,
                AiPricing.Cost(model, reply.Tokens.Input, reply.Tokens.Output, reply.Tokens.CacheWrite, reply.Tokens.CacheRead));
        }
        catch (AiProviderException ex)
        {
            throw ProviderProblem(ex);
        }
    }

    // ------------------------------------------------------------------ businesses

    public async Task<IReadOnlyList<AiBusinessDto>> BusinessesAsync(CancellationToken ct)
    {
        EnsureSuperAdmin();
        var today = BusinessClock.Today(clock.GetUtcNow());
        var monthStart = BusinessClock.StartOfDayUtc(new DateOnly(today.Year, today.Month, 1));

        var tenants = await db.Tenants.AsNoTracking()
            .Where(t => t.Status != TenantStatus.Closed)
            .OrderBy(t => t.TenantName)
            .Select(t => new { t.Uuid, t.TenantCode, t.TenantName, t.AiEnabled })
            .ToListAsync(ct);

        // The platform screens read across businesses on purpose: counts and costs only.
        var usage = await db.AiUsages.IgnoreQueryFilters().AsNoTracking()
            .Where(u => u.CreatedDate >= monthStart)
            .GroupBy(u => u.TenantUuid)
            .Select(g => new
            {
                Tenant = g.Key,
                Questions = g.Count(u => u.Success),
                Failed = g.Count(u => !u.Success),
                Cost = g.Sum(u => u.CostUsd ?? 0),
                Up = g.Count(u => u.Rating == 1),
                Down = g.Count(u => u.Rating == -1),
                Last = g.Max(u => u.CreatedDate),
            })
            .ToListAsync(ct);
        var byTenant = usage.ToDictionary(u => u.Tenant);

        return tenants.Select(t =>
        {
            var u = byTenant.GetValueOrDefault(t.Uuid);
            return new AiBusinessDto(t.Uuid, t.TenantCode, t.TenantName, t.AiEnabled, u?.Questions ?? 0, u?.Failed ?? 0,
                u?.Cost ?? 0, u?.Up ?? 0, u?.Down ?? 0, u?.Last);
        })
        .OrderByDescending(b => b.AiEnabled).ThenByDescending(b => b.Questions).ThenBy(b => b.TenantName)
        .ToList();
    }

    public async Task SetBusinessAsync(Guid id, AiBusinessRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        var tenant = (await db.Tenants.FirstOrDefaultAsync(t => t.Uuid == id && t.Status != TenantStatus.Closed, ct)).OrNotFound("Business");
        tenant.AiEnabled = r.AiEnabled;
        await db.SaveChangesAsync(ct);
    }

    // ------------------------------------------------------------------ evals

    private sealed record EvalItem(string Q, string Lang, string[] Expect, string? Role);
    private sealed record EvalFile(EvalItem[] Items);

    /// <summary>
    /// Runs the help assistant's exam paper (help-evals.json) against the chosen model: each answer
    /// passes when it cites one of the expected guide sections - or, for an out-of-scope question,
    /// cites none. Run it after changing the model or the prompt; nothing is logged against a business.
    /// </summary>
    public async Task<HelpEvalRunDto> RunHelpEvalsAsync(AiTestRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        EnsureKey();
        var s = await LoadAsync(ct);
        var model = AiRules.IsModelId(r.Model) ? r.Model!.Trim() : s.HelpModel;

        await using var stream = typeof(PlatformAiService).Assembly.GetManifestResourceStream("Sompriti.Erp.Application.Ai.help-evals.json")
                                 ?? throw new InvalidOperationException("help-evals.json is missing from the build.");
        var file = await JsonSerializer.DeserializeAsync<EvalFile>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web), ct)
                   ?? throw new InvalidOperationException("help-evals.json could not be read.");

        // Three at a time: quick, and gentle on the provider's rate limit.
        var gate = new SemaphoreSlim(3);
        var tasks = file.Items.Take(60).Select(async item =>
        {
            await gate.WaitAsync(ct);
            try { return await RunOneAsync(item, model, s, ct); }
            finally { gate.Release(); }
        }).ToList();
        var items = await Task.WhenAll(tasks);

        var passed = items.Count(i => i.Passed);
        return new HelpEvalRunDto(model, passed, items.Length,
            items.Length == 0 ? 0 : Math.Round(passed * 100m / items.Length, 1),
            items.Sum(i => i.CostUsd ?? 0),
            items.Length == 0 ? 0 : (int)items.Average(i => i.LatencyMs),
            items);
    }

    private async Task<HelpEvalItemDto> RunOneAsync(EvalItem item, string model, AiSettings s, CancellationToken ct)
    {
        var role = item.Role?.ToUpperInvariant() switch { "MANAGER" => Role.Manager, "USER" => Role.User, _ => Role.Admin };
        try
        {
            var result = await help.AnswerAsync(item.Q, item.Lang, role, [], model, s.Effort, s.MaxOutputTokens, ct);
            var cited = result.Sources.Select(x => x.SectionId).ToList();
            var outOfScope = item.Expect.Contains("none");
            var passed = outOfScope ? cited.Count == 0 : cited.Intersect(item.Expect).Any();
            return new HelpEvalItemDto(item.Q, item.Lang, item.Expect, passed, result.Answer, cited, result.Searches, result.LatencyMs,
                AiPricing.Cost(model, result.Tokens.Input, result.Tokens.Output, result.Tokens.CacheWrite, result.Tokens.CacheRead), null);
        }
        catch (AiProviderException ex)
        {
            return new HelpEvalItemDto(item.Q, item.Lang, item.Expect, false, "", [], [], 0, null, $"{ex.Status} {ex.Type}");
        }
    }

    /// <summary>
    /// Runs the "Ask your business" exam paper (business-evals.json): fixed tool results instead of a
    /// business's data, so it checks the model's choices - the tools it calls, the numbers it repeats,
    /// what a manager is refused, and that names in the data cannot instruct it.
    /// </summary>
    public async Task<HelpEvalRunDto> RunBusinessEvalsAsync(AiTestRequest r, CancellationToken ct)
    {
        EnsureSuperAdmin();
        EnsureKey();
        var s = await LoadAsync(ct);
        var model = AiRules.IsModelId(r.Model) ? r.Model!.Trim() : s.BusinessModel;

        await using var stream = typeof(PlatformAiService).Assembly.GetManifestResourceStream("Sompriti.Erp.Application.Ai.business-evals.json")
                                 ?? throw new InvalidOperationException("business-evals.json is missing from the build.");
        var file = (await JsonNode.ParseAsync(stream, cancellationToken: ct))!.AsObject();
        var shared = file["fixtures"]!.AsObject();
        var today = BusinessClock.Today(clock.GetUtcNow());

        var gate = new SemaphoreSlim(3);
        var tasks = file["items"]!.AsArray().Take(60).Select(async node =>
        {
            await gate.WaitAsync(ct);
            try { return await RunBusinessOneAsync(node!.AsObject(), shared, model, s, today, ct); }
            finally { gate.Release(); }
        }).ToList();
        var items = await Task.WhenAll(tasks);

        var passed = items.Count(i => i.Passed);
        return new HelpEvalRunDto(model, passed, items.Length,
            items.Length == 0 ? 0 : Math.Round(passed * 100m / items.Length, 1),
            items.Sum(i => i.CostUsd ?? 0),
            items.Length == 0 ? 0 : (int)items.Average(i => i.LatencyMs),
            items);
    }

    private async Task<HelpEvalItemDto> RunBusinessOneAsync(JsonObject item, JsonObject shared, string model, AiSettings s, DateOnly today,
        CancellationToken ct)
    {
        var q = (string?)item["q"] ?? "";
        var lang = (string?)item["lang"] ?? "en";
        var role = ((string?)item["role"])?.ToUpperInvariant() == "MANAGER" ? Role.Manager : Role.Admin;
        static List<string> List(JsonNode? n) => n?.AsArray().Select(x => (string?)x ?? "").Where(x => x != "").ToList() ?? [];
        var expectTools = List(item["expectTools"]);
        var mustContain = List(item["mustContain"]);
        var mustNotContain = List(item["mustNotContain"]);
        var mustNotCall = List(item["mustNotCall"]);

        // The item's own fixtures replace the shared ones of the same tool.
        var fixtures = shared.DeepClone().AsObject();
        if (item["fixtures"] is JsonObject own)
            foreach (var (name, value) in own) fixtures[name] = value?.DeepClone();

        var expected = expectTools.Select(t => "calls " + t)
            .Concat(mustContain.Select(c => "says " + c))
            .Concat(mustNotCall.Select(t => "never calls " + t))
            .Concat(mustNotContain.Select(c => "never says " + c))
            .Prepend(role == Role.Manager ? "as MANAGER" : "as ADMIN")
            .ToList();
        try
        {
            var result = await business.AnswerAsync(q, lang, role, [], model, s.Effort, s.MaxOutputTokens, new FixtureToolbox(fixtures), today, ct);
            var called = result.Calls.Select(c => c.Name).ToList();
            var text = Plain(result.Answer);
            var passed = expectTools.All(called.Contains)
                         && !mustNotCall.Any(called.Contains)
                         && mustContain.All(c => c.Split('|').Any(alt => text.Contains(Plain(alt))))
                         && !mustNotContain.Any(c => text.Contains(Plain(c)));
            return new HelpEvalItemDto(q, lang, expected, passed, result.Answer, called,
                result.Calls.Select(c => $"{c.Name} {c.Input}").ToList(), result.LatencyMs,
                AiPricing.Cost(model, result.Tokens.Input, result.Tokens.Output, result.Tokens.CacheWrite, result.Tokens.CacheRead), null);
        }
        catch (AiProviderException ex)
        {
            return new HelpEvalItemDto(q, lang, expected, false, "", [], [], 0, null, $"{ex.Status} {ex.Type}");
        }
    }

    /// <summary>Lower case, thousands separators removed: "Tk 48,350.00" and "48350" match.</summary>
    private static string Plain(string text) => text.Replace(",", "").ToLowerInvariant();

    // ------------------------------------------------------------------ helpers

    private async Task<AiSettings> LoadAsync(CancellationToken ct)
    {
        var s = await db.AiSettings.FirstOrDefaultAsync(x => x.Id == AiSettings.SingletonId, ct);
        if (s is not null) return s;
        s = new AiSettings { UpdatedDate = clock.GetUtcNow(), UpdatedByUserName = AppUser.SystemUserName };
        db.AiSettings.Add(s);
        return s;
    }

    private AiSettingsDto ToDto(AiSettings s) => new(s.AiEnabled, s.HelpModel, s.BusinessModel, s.Effort, s.DailyLimitPerBusiness,
        s.MaxOutputTokens, client.IsConfigured, s.UpdatedDate, s.UpdatedByUserName);

    private void EnsureSuperAdmin()
    {
        if (!currentUser.IsSuperAdmin()) throw DomainException.Forbidden();
    }

    private void EnsureKey()
    {
        if (!client.IsConfigured)
            throw DomainException.Rule(ErrorCodes.AiUnavailable,
                "The server has no API key. Add ANTHROPIC_API_KEY in Railway (Variables) and redeploy.");
    }

    private static DomainException ProviderProblem(AiProviderException ex) => DomainException.Rule(ErrorCodes.AiProviderError,
        ex.Status switch
        {
            401 => "The API key was refused. Check ANTHROPIC_API_KEY in Railway.",
            402 => "The AI account has a billing problem. Check your credit in the Claude Console.",
            403 => "This API key may not use that model.",
            404 => "That model was not found. Choose one from the list.",
            429 => "Too many requests, or the account's spending limit was reached. Try again later.",
            _ => $"The AI provider returned an error ({ex.Status} {ex.Type}): {ex.Message}",
        });
}
