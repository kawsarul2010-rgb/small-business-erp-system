using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Infrastructure.Persistence;

namespace Sompriti.Erp.Infrastructure.Billing;

/// <summary>
/// AES-GCM encryption for the payment gateway's secrets. The key comes from Billing:EncryptionKey,
/// or - when that is not set - from Jwt:SigningKey. Changing the key makes the stored secrets
/// unreadable; they then show as "not set" and must be entered again.
/// </summary>
public sealed class AesSecretProtector : ISecretProtector
{
    private const string Prefix = "v1:";
    private readonly byte[] _key;

    public AesSecretProtector(IConfiguration config)
    {
        var material = config["Billing:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(material)) material = config["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(material)) material = "tasifmatrix-development-only-key";
        _key = SHA256.HashData(Encoding.UTF8.GetBytes("billing-secrets:" + material));
    }

    public string Protect(string plainText)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plain = Encoding.UTF8.GetBytes(plainText);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(_key, 16)) aes.Encrypt(nonce, plain, cipher, tag);
        return Prefix + Convert.ToBase64String([.. nonce, .. cipher, .. tag]);
    }

    public string? Unprotect(string? protectedText)
    {
        if (string.IsNullOrEmpty(protectedText) || !protectedText.StartsWith(Prefix, StringComparison.Ordinal)) return null;
        try
        {
            var all = Convert.FromBase64String(protectedText[Prefix.Length..]);
            if (all.Length < 28) return null;
            var nonce = all[..12];
            var tag = all[^16..];
            var cipher = all[12..^16];
            var plain = new byte[cipher.Length];
            using var aes = new AesGcm(_key, 16);
            aes.Decrypt(nonce, cipher, tag, plain);
            var text = Encoding.UTF8.GetString(plain);
            return text.Length == 0 ? null : text;
        }
        catch (Exception e) when (e is CryptographicException or FormatException)
        {
            return null;
        }
    }
}

/// <summary>Creates owner-connection contexts (no business) and disposes them with the request.</summary>
public sealed class SystemDbFactory(DbContextOptions<AppDbContext> options, TimeProvider clock) : ISystemDbFactory, IAsyncDisposable
{
    private readonly List<AppDbContext> _created = [];

    public IAppDbContext Create()
    {
        var context = new AppDbContext(options, SystemUser.Instance, clock);
        _created.Add(context);
        return context;
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var c in _created) await c.DisposeAsync();
        _created.Clear();
    }

    /// <summary>No one signed in: the connection stays the database owner.</summary>
    private sealed class SystemUser : ICurrentUser
    {
        public static readonly SystemUser Instance = new();
        public bool IsAuthenticated => false;
        public Guid UserUuid => Guid.Empty;
        public string UserName => "";
        public Role Role => Role.User;
        public Guid? SupplierUuid => null;
        public Guid? CustomerUuid => null;
        public Guid? TenantUuid => null;
    }
}

/// <summary>
/// bKash Tokenized Checkout (API v1.2.0-beta). Flow: grant token -> create payment (the payer
/// goes to bkashURL) -> bKash returns the payer to our callback -> execute -> (query if unsure).
/// Tokens last an hour and are reused for 50 minutes.
/// </summary>
public sealed class BkashGateway(HttpClient http) : IBkashGateway
{
    public const string SandboxBaseUrl = "https://tokenized.sandbox.bka.sh/v1.2.0-beta";
    public const string LiveBaseUrl = "https://tokenized.pay.bka.sh/v1.2.0-beta";

    private static readonly ConcurrentDictionary<string, (string Token, DateTimeOffset Until)> Tokens = new();

    public async Task TestAsync(BkashCredentials c, CancellationToken ct)
    {
        Tokens.TryRemove(CacheKey(c), out _);
        await TokenAsync(c, ct);
    }

    public async Task<BkashCreateResult> CreateAsync(BkashCredentials c, decimal amount, string invoiceNumber, string payerReference,
        string callbackUrl, CancellationToken ct)
    {
        var json = await PostAsync(c, "/tokenized/checkout/create", new
        {
            mode = "0011",
            payerReference,
            callbackURL = callbackUrl,
            amount = amount.ToString("0.00", CultureInfo.InvariantCulture),
            currency = "BDT",
            intent = "sale",
            merchantInvoiceNumber = invoiceNumber,
        }, ct);
        var paymentId = Str(json, "paymentID");
        var url = Str(json, "bkashURL");
        if (!Succeeded(json) || paymentId is null || url is null) throw new BkashException(Message(json));
        return new BkashCreateResult(paymentId, url);
    }

    public async Task<BkashPaymentResult> ExecuteAsync(BkashCredentials c, string paymentId, CancellationToken ct) =>
        Result(await PostAsync(c, "/tokenized/checkout/execute", new { paymentID = paymentId }, ct));

    public async Task<BkashPaymentResult> QueryAsync(BkashCredentials c, string paymentId, CancellationToken ct) =>
        Result(await PostAsync(c, "/tokenized/checkout/payment/status", new { paymentID = paymentId }, ct));

    // ------------------------------------------------------------------ plumbing

    private static BkashPaymentResult Result(JsonElement json)
    {
        var status = Str(json, "transactionStatus");
        var completed = Succeeded(json) && string.Equals(status, "Completed", StringComparison.OrdinalIgnoreCase);
        return new BkashPaymentResult(completed, status, Str(json, "trxID"), Str(json, "customerMsisdn") ?? Str(json, "payerAccount"),
            completed ? null : Message(json));
    }

    private async Task<JsonElement> PostAsync(BkashCredentials c, string path, object body, CancellationToken ct)
    {
        var token = await TokenAsync(c, ct);
        using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl(c) + path) { Content = JsonContent.Create(body) };
        request.Headers.TryAddWithoutValidation("Authorization", token);
        request.Headers.TryAddWithoutValidation("X-App-Key", c.AppKey);
        request.Headers.Accept.ParseAdd("application/json");
        return await SendAsync(request, ct);
    }

    private async Task<string> TokenAsync(BkashCredentials c, CancellationToken ct)
    {
        var key = CacheKey(c);
        if (Tokens.TryGetValue(key, out var cached) && cached.Until > DateTimeOffset.UtcNow) return cached.Token;

        using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl(c) + "/tokenized/checkout/token/grant")
        {
            Content = JsonContent.Create(new { app_key = c.AppKey, app_secret = c.AppSecret }),
        };
        request.Headers.TryAddWithoutValidation("username", c.Username);
        request.Headers.TryAddWithoutValidation("password", c.Password);
        request.Headers.Accept.ParseAdd("application/json");
        var json = await SendAsync(request, ct);
        var token = Str(json, "id_token");
        if (string.IsNullOrEmpty(token)) throw new BkashException(Message(json));

        var seconds = json.TryGetProperty("expires_in", out var e) && e.TryGetInt32(out var s) ? s : 3600;
        Tokens[key] = (token, DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, seconds - 600)));
        return token;
    }

    private async Task<JsonElement> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
        {
            throw new BkashException("bKash could not be reached: " + e.Message);
        }
        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(ct);
            try
            {
                using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
                var root = doc.RootElement.Clone();
                if (!response.IsSuccessStatusCode && root.ValueKind == JsonValueKind.Object && Str(root, "statusCode") is null)
                    throw new BkashException($"HTTP {(int)response.StatusCode}: {Message(root)}");
                return root;
            }
            catch (JsonException)
            {
                throw new BkashException($"HTTP {(int)response.StatusCode}: unexpected reply from bKash.");
            }
        }
    }

    private static string BaseUrl(BkashCredentials c) => c.Sandbox ? SandboxBaseUrl : LiveBaseUrl;

    private static string CacheKey(BkashCredentials c) => $"{(c.Sandbox ? "s" : "l")}|{c.AppKey}|{c.Username}";

    /// <summary>bKash reports success as statusCode "0000"; some replies carry only the payment fields.</summary>
    private static bool Succeeded(JsonElement json) => Str(json, "statusCode") is null or "0000";

    private static string? Str(JsonElement json, string name) =>
        json.ValueKind == JsonValueKind.Object && json.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string Message(JsonElement json)
    {
        var text = Str(json, "statusMessage") ?? Str(json, "errorMessage") ?? Str(json, "message") ?? Str(json, "msg") ?? "Unknown error from bKash.";
        var code = Str(json, "statusCode") ?? Str(json, "errorCode");
        return code is null or "0000" ? text : $"{text} (code {code})";
    }
}
