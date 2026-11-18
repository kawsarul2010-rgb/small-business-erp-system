using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Application.Ai;

/// <summary>What a business's screens need to know: may this user ask the assistant, and how much is left today.</summary>
/// <param name="Business">Whether this person may also ask about the business's own figures (admins and managers).</param>
public sealed record AiStatusDto(bool Available, int DailyLimit, int UsedToday, bool Business = false);

public sealed record AiRatingRequest(short Rating);

/// <summary>The platform's AI settings, read on every question; cached briefly so a change shows within seconds.</summary>
public sealed class AiSettingsCache(IMemoryCache cache)
{
    private const string Key = "ai-settings";

    public async Task<AiSettings> GetAsync(IAppDbContext db, CancellationToken ct)
    {
        if (cache.TryGetValue(Key, out AiSettings? cached) && cached is not null) return cached;
        var s = await db.AiSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == AiSettings.SingletonId, ct) ?? new AiSettings();
        cache.Set(Key, s, TimeSpan.FromSeconds(30));
        return s;
    }

    public void Invalidate() => cache.Remove(Key);
}

/// <summary>
/// The gate every AI feature goes through: AI must be on for the platform and for the business,
/// the server must have an API key, and the business must be under its daily limit. Every
/// question - answered or failed - is logged with its tokens and cost, never its text.
/// </summary>
public sealed class AiAccess(IAppDbContext db, ICurrentUser user, AiSettingsCache settings, IAiModelClient client, TimeProvider clock)
{
    public async Task<AiStatusDto> StatusAsync(CancellationToken ct)
    {
        var s = await settings.GetAsync(db, ct);
        if (!await IsOnAsync(s, ct)) return new AiStatusDto(false, 0, 0);
        return new AiStatusDto(true, s.DailyLimitPerBusiness, await UsedTodayAsync(ct), user.Role is Role.Admin or Role.Manager);
    }

    /// <summary>The settings to answer with, or a clear refusal: AI off, not set up, or today's questions used up.</summary>
    public async Task<AiSettings> EnsureCanAskAsync(CancellationToken ct)
    {
        var s = await settings.GetAsync(db, ct);
        if (!await IsOnAsync(s, ct))
            throw DomainException.Rule(ErrorCodes.AiUnavailable, "The assistant is not available for your business.");
        if (await UsedTodayAsync(ct) >= s.DailyLimitPerBusiness)
            throw DomainException.Rule(ErrorCodes.AiLimitReached,
                $"Your business has used today's {s.DailyLimitPerBusiness} questions. The assistant is available again tomorrow.");
        return s;
    }

    /// <summary>Logs one question. Returns its id, which the answer carries so it can be rated.</summary>
    public async Task<Guid> RecordAsync(AiFeature feature, string model, AiTokens tokens, int latencyMs, int modelCalls,
        bool success, string? errorCode, CancellationToken ct)
    {
        var usage = new AiUsage
        {
            Uuid = Guid.NewGuid(),
            UserUuid = user.UserUuid,
            Feature = feature,
            Model = model,
            InputTokens = tokens.Input,
            OutputTokens = tokens.Output,
            CacheWriteTokens = tokens.CacheWrite,
            CacheReadTokens = tokens.CacheRead,
            CostUsd = AiPricing.Cost(model, tokens.Input, tokens.Output, tokens.CacheWrite, tokens.CacheRead),
            LatencyMs = latencyMs,
            ModelCalls = modelCalls,
            Success = success,
            ErrorCode = errorCode,
            CreatedDate = clock.GetUtcNow(),
        };
        db.AiUsages.Add(usage);
        await db.SaveChangesAsync(ct);
        return usage.Uuid;
    }

    /// <summary>Thumbs up (1) or down (-1) on an answer the same person got.</summary>
    public async Task RateAsync(Guid usageId, AiRatingRequest r, CancellationToken ct)
    {
        if (r.Rating is not (1 or -1)) throw DomainException.Validation("rating", "Rating must be 1 or -1.");
        var usage = await db.AiUsages.FirstOrDefaultAsync(u => u.Uuid == usageId && u.UserUuid == user.UserUuid, ct);
        usage.OrNotFound("Answer").Rating = r.Rating;
        await db.SaveChangesAsync(ct);
    }

    private async Task<bool> IsOnAsync(AiSettings s, CancellationToken ct)
    {
        if (!s.AiEnabled || !client.IsConfigured || user.TenantUuid is not { } tenant) return false;
        return await db.Tenants.AsNoTracking().Where(t => t.Uuid == tenant).Select(t => t.AiEnabled).FirstOrDefaultAsync(ct);
    }

    private async Task<int> UsedTodayAsync(CancellationToken ct)
    {
        var since = BusinessClock.StartOfDayUtc(BusinessClock.Today(clock.GetUtcNow()));
        // Failed questions (the provider was down, say) do not use up the day's allowance.
        return await db.AiUsages.CountAsync(u => u.CreatedDate >= since && u.Success, ct);
    }
}
