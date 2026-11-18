using System.Text.Json.Nodes;

namespace Sompriti.Erp.Application.Ai;

/// <summary>
/// The language model behind the AI features, seen from the application: send a conversation,
/// get the reply. The Claude implementation lives in Infrastructure (AnthropicClient); another
/// provider would be another implementation of this interface.
/// </summary>
public interface IAiModelClient
{
    /// <summary>False when the server has no API key: AI features then report they are not set up.</summary>
    bool IsConfigured { get; }

    Task<AiReply> SendAsync(AiRequest request, CancellationToken ct);

    /// <summary>The models this API key can use, newest first.</summary>
    Task<IReadOnlyList<AiModelInfo>> ListModelsAsync(CancellationToken ct);
}

/// <param name="Messages">
/// The conversation in the provider's format: [{ role, content }]. An assistant turn that called a
/// tool must be sent back exactly as it came (thinking blocks included), so turns are kept as JSON.
/// </param>
/// <param name="Tools">Tool definitions ({ name, description, input_schema }), or null.</param>
/// <param name="ToolChoice">"auto" (the model decides), "none" (answer now, no more tool calls), or null.</param>
public sealed record AiRequest(
    string Model,
    string System,
    JsonArray Messages,
    JsonArray? Tools,
    string Effort,
    int MaxTokens,
    string? ToolChoice = null);

/// <param name="Content">The reply's content blocks as sent by the provider (text, tool_use, thinking...).</param>
/// <param name="StopReason">"end_turn", "tool_use", "max_tokens"...</param>
public sealed record AiReply(JsonArray Content, string StopReason, AiTokens Tokens, int LatencyMs)
{
    /// <summary>The reply's text blocks, joined.</summary>
    public string Text => string.Join("\n", Content
        .Where(b => (string?)b?["type"] == "text")
        .Select(b => (string?)b?["text"] ?? "")).Trim();

    /// <summary>The tools the model asked to run, in order.</summary>
    public IReadOnlyList<(string Id, string Name, JsonObject Input)> ToolCalls => Content
        .Where(b => (string?)b?["type"] == "tool_use")
        .Select(b => ((string?)b!["id"] ?? "", (string?)b["name"] ?? "", b["input"] as JsonObject ?? new JsonObject()))
        .ToList();
}

public sealed record AiTokens(int Input, int Output, int CacheWrite, int CacheRead)
{
    public static readonly AiTokens Zero = new(0, 0, 0, 0);
    public AiTokens Add(AiTokens o) => new(Input + o.Input, Output + o.Output, CacheWrite + o.CacheWrite, CacheRead + o.CacheRead);
}

public sealed record AiModelInfo(string Id, string DisplayName, DateTimeOffset? CreatedAt);

/// <summary>The provider refused or failed: bad key, no credit, overloaded, rate limited...</summary>
public sealed class AiProviderException(int status, string type, string message) : Exception(message)
{
    public int Status { get; } = status;
    /// <summary>The provider's error type, e.g. "authentication_error", "overloaded_error".</summary>
    public string Type { get; } = type;
}
