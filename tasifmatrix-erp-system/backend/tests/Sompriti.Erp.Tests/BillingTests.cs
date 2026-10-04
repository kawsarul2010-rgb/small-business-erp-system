using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using Sompriti.Erp.Application.Billing;
using Sompriti.Erp.Infrastructure.Billing;

namespace Sompriti.Erp.Tests;

public class SecretProtectorTests
{
    private static AesSecretProtector Make(string key) =>
        new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:SigningKey"] = key }).Build());

    [Fact]
    public void Round_trips_and_never_stores_plain_text()
    {
        var p = Make("a-very-long-signing-key-for-tests-only-123456");
        var stored = p.Protect("my-bkash-secret");
        Assert.StartsWith("v1:", stored);
        Assert.DoesNotContain("my-bkash-secret", stored);
        Assert.NotEqual(stored, p.Protect("my-bkash-secret")); // fresh nonce every time
        Assert.Equal("my-bkash-secret", p.Unprotect(stored));
    }

    [Fact]
    public void Another_key_or_garbage_reads_as_not_set()
    {
        var stored = Make("key-one-key-one-key-one-key-one").Protect("secret");
        Assert.Null(Make("key-two-key-two-key-two-key-two").Unprotect(stored));
        Assert.Null(Make("x").Unprotect("v1:not-base64!"));
        Assert.Null(Make("x").Unprotect(null));
    }
}

public class BkashGatewayTests
{
    /// <summary>Plays bKash: answers by path and records what was sent.</summary>
    private sealed class FakeBkash : HttpMessageHandler
    {
        public readonly List<(string Path, Dictionary<string, string> Headers, string Body)> Calls = [];
        public string ExecuteReply = """{"statusCode":"0000","statusMessage":"Successful","paymentID":"PAY1","trxID":"TRX9","transactionStatus":"Completed","customerMsisdn":"01770618575"}""";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath;
            var headers = request.Headers.ToDictionary(h => h.Key.ToLowerInvariant(), h => string.Join(",", h.Value));
            Calls.Add((path, headers, request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct)));
            var reply = path switch
            {
                _ when path.EndsWith("/token/grant") => """{"statusCode":"0000","statusMessage":"Successful","id_token":"TOKEN-1","token_type":"Bearer","expires_in":3600,"refresh_token":"R"}""",
                _ when path.EndsWith("/checkout/create") => """{"statusCode":"0000","statusMessage":"Successful","paymentID":"PAY1","bkashURL":"https://sandbox.payment.bkash.com/?paymentId=PAY1","transactionStatus":"Initiated"}""",
                _ when path.EndsWith("/checkout/execute") => ExecuteReply,
                _ => """{"statusCode":"0000","paymentID":"PAY1","transactionStatus":"Initiated"}""",
            };
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(reply, Encoding.UTF8, "application/json") };
        }
    }

    private static BkashCredentials Creds(string user) => new(true, "APPKEY", "APPSECRET", user, "PASS");

    [Fact]
    public async Task Creates_a_payment_with_the_token_and_app_key()
    {
        var fake = new FakeBkash();
        var gateway = new BkashGateway(new HttpClient(fake));
        var created = await gateway.CreateAsync(Creds("create-user"), 500m, "TM261004-ABC", "rahim-store", "https://x.test/cb", CancellationToken.None);

        Assert.Equal("PAY1", created.PaymentId);
        Assert.StartsWith("https://sandbox.payment.bkash.com", created.RedirectUrl);

        var grant = fake.Calls[0];
        Assert.Equal("/v1.2.0-beta/tokenized/checkout/token/grant", grant.Path);
        Assert.Equal("create-user", grant.Headers["username"]);
        Assert.Contains("\"app_secret\":\"APPSECRET\"", grant.Body);

        var create = fake.Calls[1];
        Assert.Equal("TOKEN-1", create.Headers["authorization"]);
        Assert.Equal("APPKEY", create.Headers["x-app-key"]);
        Assert.Contains("\"amount\":\"500.00\"", create.Body);
        Assert.Contains("\"mode\":\"0011\"", create.Body);
        Assert.Contains("\"merchantInvoiceNumber\":\"TM261004-ABC\"", create.Body);
        Assert.Contains("\"callbackURL\":\"https://x.test/cb\"", create.Body);
    }

    [Fact]
    public async Task Execute_reports_completed_with_the_transaction_id_and_reuses_the_token()
    {
        var fake = new FakeBkash();
        var gateway = new BkashGateway(new HttpClient(fake));
        var creds = Creds("execute-user");
        var result = await gateway.ExecuteAsync(creds, "PAY1", CancellationToken.None);
        await gateway.QueryAsync(creds, "PAY1", CancellationToken.None);

        Assert.True(result.Completed);
        Assert.Equal("TRX9", result.TrxId);
        Assert.Equal("01770618575", result.PayerAccount);
        Assert.Equal(1, fake.Calls.Count(c => c.Path.EndsWith("/token/grant")));
    }

    [Fact]
    public async Task An_error_reply_is_not_completed_and_carries_the_message()
    {
        var fake = new FakeBkash { ExecuteReply = """{"statusCode":"2023","statusMessage":"Insufficient Balance"}""" };
        var result = await new BkashGateway(new HttpClient(fake)).ExecuteAsync(Creds("error-user"), "PAY1", CancellationToken.None);
        Assert.False(result.Completed);
        Assert.Equal("Insufficient Balance (code 2023)", result.Message);
    }
}

public class InvoiceNumberTests
{
    [Fact]
    public void Invoice_numbers_carry_the_date_and_differ()
    {
        var now = new DateTimeOffset(2026, 10, 4, 20, 0, 0, TimeSpan.Zero); // 5 Oct in Dhaka
        var a = BillingMapping.NewInvoiceNumber(now);
        Assert.StartsWith("TM261005-", a);
        Assert.Equal(15, a.Length);
        Assert.NotEqual(a, BillingMapping.NewInvoiceNumber(now));
    }
}
