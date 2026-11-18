using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Sompriti.Erp.Application.Ai;

namespace Sompriti.Erp.Infrastructure.Ai;

/// <summary>
/// Claude through Anthropic's Messages API, over plain HTTP (no SDK).
/// </summary>
/// <remarks>
/// Settings (environment variables on Railway):
///   ANTHROPIC_API_KEY     the API key from the Claude Console - never in code, git or the database
///   Ai__ApiVersion        optional; the anthropic-version header (default below)
///   Ai__BaseUrl           optional; default https://api.anthropic.com/
/// The model, effort and limits are not here: the super admin chooses them on the AI page.
/// Retries a rate limit (429), an overload (529) and server errors twice, waiting a little longer each time.
/// </remarks>
public sealed class AnthropicClient : IAiModelClient
{
    public const string DefaultApiVersion = "2026-10-21";

    private static readonly System.Text.Json.JsonSerializerOptions Json =
        new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly HttpClient _http;
    private readonly ILogger<AnthropicClient> _logger;
    private readonly string? _apiKey;
    private readonly string _apiVersion;

    public AnthropicClient(HttpClient http, IConfiguration config, ILogger<AnthropicClient> logger)
    {
        _http = http;
        _logger = logger;
        _apiKey = config["ANTHROPIC_API_KEY"] is { Length: > 0 } k ? k.Trim() : config["Ai:ApiKey"]?.Trim();
        _apiVersion = config["Ai:ApiVersion"] is { Length: > 0 } v ? v.Trim() : DefaultApiVersion;
        _http.BaseAddress ??= new Uri(config["Ai:BaseUrl"] is { Length: > 0 } b ? b : "https://api.anthropic.com/");
    }

    public bool IsConfigured => !string.IsNullOrEmpty(_apiKey);

    public async Task<AiReply> SendAsync(AiRequest request, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = request.Model,
            ["max_tokens"] = request.MaxTokens,
            // The rules come first and are the same on every call: cached, they cost a tenth on a repeat.
            ["system"] = new JsonArray(new JsonObject
            {
                ["type"] = "text",
                ["text"] = request.System,
                ["cache_control"] = new JsonObject { ["type"] = "ephemeral" },
            }),
            ["messages"] = request.Messages.DeepClone(),
            ["output_config"] = new JsonObject { ["effort"] = request.Effort },
        };
        if (request.Tools is { Count: > 0 } tools)
        {
            body["tools"] = tools.DeepClone();
            if (request.ToolChoice is { } choice) body["tool_choice"] = new JsonObject { ["type"] = choice };
        }

        var watch = Stopwatch.StartNew();
        var json = await PostAsync("v1/messages", body, ct);
        watch.Stop();

        var usage = json["usage"];
        var tokens = new AiTokens(
            Int(usage?["input_tokens"]), Int(usage?["output_tokens"]),
            Int(usage?["cache_creation_input_tokens"]), Int(usage?["cache_read_input_tokens"]));
        return new AiReply(json["content"] as JsonArray ?? [], (string?)json["stop_reason"] ?? "", tokens, (int)watch.ElapsedMilliseconds);
    }

    public async Task<IReadOnlyList<AiModelInfo>> ListModelsAsync(CancellationToken ct)
    {
        var models = new List<AiModelInfo>();
        string? after = null;
        for (var page = 0; page < 5; page++)
        {
            var path = "v1/models?limit=100" + (after is null ? "" : "&after_id=" + Uri.EscapeDataString(after));
            var json = await SendWithRetryAsync(() => new HttpRequestMessage(HttpMethod.Get, path), ct);
            foreach (var m in json["data"] as JsonArray ?? [])
            {
                var id = (string?)m?["id"];
                if (id is null) continue;
                DateTimeOffset? created = DateTimeOffset.TryParse((string?)m?["created_at"], CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal, out var c) ? c : null;
                models.Add(new AiModelInfo(id, (string?)m?["display_name"] ?? id, created));
            }
            if ((bool?)json["has_more"] != true) break;
            after = (string?)json["last_id"];
            if (after is null) break;
        }
        return models.OrderByDescending(m => m.CreatedAt).ToList();
    }

    // ------------------------------------------------------------------ http

    private Task<JsonNode> PostAsync(string path, JsonObject body, CancellationToken ct)
    {
        // Bangla stays readable (and the request shorter) instead of every letter as \uXXXX.
        var text = body.ToJsonString(Json);
        return SendWithRetryAsync(() => new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(text, Encoding.UTF8, "application/json"),
        }, ct);
    }

    private async Task<JsonNode> SendWithRetryAsync(Func<HttpRequestMessage> build, CancellationToken ct)
    {
        if (!IsConfigured) throw new AiProviderException(401, "not_configured", "No API key is set (ANTHROPIC_API_KEY).");

        for (var attempt = 0; ; attempt++)
        {
            using var request = build();
            request.Headers.Add("x-api-key", _apiKey);
            request.Headers.Add("anthropic-version", _apiVersion);

            using var response = await _http.SendAsync(request, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            if (response.IsSuccessStatusCode) return JsonNode.Parse(text) ?? new JsonObject();

            var status = (int)response.StatusCode;
            JsonNode? error = null;
            try { error = JsonNode.Parse(text)?["error"]; } catch { /* not JSON */ }
            var type = (string?)error?["type"] ?? response.StatusCode.ToString();
            var message = (string?)error?["message"] ?? text[..Math.Min(text.Length, 300)];

            var retryable = status is 429 or 500 or 502 or 503 or 504 or 529;
            if (!retryable || attempt >= 2)
                throw new AiProviderException(status, type, message);

            var wait = RetryAfter(response) ?? TimeSpan.FromMilliseconds(800 * Math.Pow(2, attempt));
            if (wait > TimeSpan.FromSeconds(8)) throw new AiProviderException(status, type, message);
            _logger.LogWarning("Claude API {Status} {Type}; retrying in {Wait} ms", status, type, (int)wait.TotalMilliseconds);
            await Task.Delay(wait, ct);
        }
    }

    private static TimeSpan? RetryAfter(HttpResponseMessage response) =>
        response.Headers.RetryAfter?.Delta
        ?? (response.Headers.TryGetValues("retry-after", out var v) && double.TryParse(v.FirstOrDefault(), NumberStyles.Float,
            CultureInfo.InvariantCulture, out var seconds) ? TimeSpan.FromSeconds(seconds) : null);

    private static int Int(JsonNode? n) => n is null ? 0 : (int)(long)n;
}
