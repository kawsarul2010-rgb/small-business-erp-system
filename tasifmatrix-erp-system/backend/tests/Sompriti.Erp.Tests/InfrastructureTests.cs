using System.Text;
using Microsoft.Extensions.Options;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Application.MasterData;
using Sompriti.Erp.Application.Orders;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Infrastructure;
using Sompriti.Erp.Infrastructure.Notifications;
using Sompriti.Erp.Infrastructure.Pdf;
using Sompriti.Erp.Infrastructure.Persistence;
using Sompriti.Erp.Infrastructure.Security;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Tests;

internal sealed class FakeClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;
    public override DateTimeOffset GetUtcNow() => Now;
}

internal sealed class FakeUser : ICurrentUser
{
    public bool IsAuthenticated => true;
    public Guid UserUuid { get; } = Guid.NewGuid();
    public string UserName => "Test Admin";
    public Role Role => Role.Admin;
    public Guid? SupplierUuid => null;
    public Guid? CustomerUuid => null;
    public Guid? TenantUuid { get; init; } = Guid.NewGuid();
}

internal sealed class SilentLogger<T> : Microsoft.Extensions.Logging.ILogger<T>
{
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => false;
    public void Log<TState>(Microsoft.Extensions.Logging.LogLevel logLevel, Microsoft.Extensions.Logging.EventId eventId,
        TState state, Exception? exception, Func<TState, Exception?, string> formatter) { }
}

public class JwtTests
{
    private static JwtTokenService Create(FakeClock clock, string key = "unit-test-signing-key-0123456789abcdef") =>
        new(Options.Create(new JwtOptions { SigningKey = key, AccessTokenMinutes = 15 }), clock);

    [Fact]
    public void Created_token_validates_and_carries_user()
    {
        var clock = new FakeClock(DateTimeOffset.UtcNow);
        var svc = Create(clock);
        var user = new AppUser { Uuid = Guid.NewGuid(), UserName = "Rahim", Role = Role.Manager };
        var (token, exp) = svc.CreateAccessToken(user);
        var claims = svc.Validate(token);
        Assert.NotNull(claims);
        Assert.Equal(user.Uuid, claims!.UserUuid);
        Assert.Equal("Rahim", claims.UserName);
        Assert.True(exp > clock.Now);
    }

    [Fact]
    public void Expired_token_is_rejected()
    {
        var clock = new FakeClock(DateTimeOffset.UtcNow);
        var svc = Create(clock);
        var (token, _) = svc.CreateAccessToken(new AppUser { Uuid = Guid.NewGuid(), UserName = "x" });
        clock.Now = clock.Now.AddMinutes(16);
        Assert.Null(svc.Validate(token));
    }

    [Fact]
    public void Tampered_or_foreign_tokens_are_rejected()
    {
        var clock = new FakeClock(DateTimeOffset.UtcNow);
        var svc = Create(clock);
        var (token, _) = svc.CreateAccessToken(new AppUser { Uuid = Guid.NewGuid(), UserName = "x" });
        var parts = token.Split('.');
        var tampered = parts[0] + "." + parts[1].Replace('A', 'B') + "." + parts[2];
        if (tampered != token) Assert.Null(svc.Validate(tampered));
        Assert.Null(Create(clock, "another-signing-key-0123456789abcdefgh").Validate(token));
        Assert.Null(svc.Validate("not.a.token"));
        Assert.Null(svc.Validate(""));
    }

    [Fact]
    public void Short_signing_key_is_refused() =>
        Assert.Throws<InvalidOperationException>(() => Create(new FakeClock(DateTimeOffset.UtcNow), "short"));
}

public class PasswordHasherTests
{
    [Fact]
    public void Hash_verifies_only_the_right_password()
    {
        var hasher = new IdentityPasswordHasher();
        var hash = hasher.Hash("Secret123");
        Assert.NotEqual("Secret123", hash);
        Assert.True(hasher.Verify(hash, "Secret123"));
        Assert.False(hasher.Verify(hash, "secret123"));
        Assert.False(hasher.Verify("garbage", "Secret123"));
    }
}

public class ConnectionStringTests
{
    [Fact]
    public void Converts_railway_database_url()
    {
        var cs = ConnectionStrings.FromUrl("postgresql://postgres:p%40ss@containers.railway.app:6543/railway");
        Assert.Contains("Host=containers.railway.app", cs);
        Assert.Contains("Port=6543", cs);
        Assert.Contains("Database=railway", cs);
        Assert.Contains("Username=postgres", cs);
        Assert.Contains("Password=p@ss", cs);
        // Managed PostgreSQL uses a self-signed certificate.
        Assert.Contains("Trust Server Certificate=true", cs);
    }

    [Fact]
    public void Plain_connection_does_not_trust_certificates()
    {
        var cs = ConnectionStrings.FromUrl("postgresql://postgres:pw@localhost:5432/erp?sslmode=Disable");
        Assert.Contains("SSL Mode=Disable", cs);
        Assert.DoesNotContain("Trust Server Certificate", cs);
    }

    [Fact]
    public void Snake_case_column_names() =>
        Assert.Equal("created_by_user_uuid", AppDbContext.ToSnakeCase("CreatedByUserUuid"));
}

public class ReportPdfTests
{
    private static ReportDocument Sample(int rows) => new(
        Title: "Customer report",
        BusinessName: "Sompriti Enterprise",
        Filters: new[] { ("Period", "01 Jan 2026 to 31 Dec 2026"), ("Company", "All companies"), ("Filter", "With due only") },
        Columns: new[]
        {
            new ReportColumn("Code", 60),
            new ReportColumn("Customer name"),
            new ReportColumn("Mobile", 90),
            new ReportColumn("Orders", 50, RightAligned: true),
            new ReportColumn("Total", 80, RightAligned: true),
            new ReportColumn("Paid", 80, RightAligned: true),
            new ReportColumn("Due", 80, RightAligned: true),
        },
        Rows: Enumerable.Range(1, rows).Select(i => new ReportRow(new[]
        {
            $"1000{i:00}",
            $"Customer number {i} with a reasonably long trading name",
            "01751055901",
            (i % 7 + 1).ToString(),
            Money.FormatPlain(i * 1250.50m),
            Money.FormatPlain(i * 900m),
            Money.FormatPlain(i * 350.50m),
        })).ToList(),
        Totals: new[] { "TOTAL", "", "", "28", "50,020.00", "36,000.00", "14,020.00" },
        FileName: "customer-report-2026-01-01_2026-12-31.pdf");

    [Fact]
    public void Report_pdf_is_a_valid_document_and_paginates()
    {
        var renderer = new ReportPdfRenderer(new FakeUser(), TimeProvider.System);
        var bytes = renderer.Render(Sample(60));
        var text = System.Text.Encoding.Latin1.GetString(bytes);

        Assert.StartsWith("%PDF-1.4", text);
        Assert.True(text.TrimEnd().EndsWith("%%EOF"), "the document should be terminated");
        // 60 rows will not fit on one page.
        Assert.True(text.Contains("/Count 2") || text.Contains("/Count 3"), "expected the rows to spill onto more pages");
        Assert.Contains("Page 1 of", text);

        var path = Path.Combine(Path.GetTempPath(), "report-sample.pdf");
        File.WriteAllBytes(path, bytes);
    }

    [Fact]
    public void An_empty_report_still_renders_its_filters()
    {
        var renderer = new ReportPdfRenderer(new FakeUser(), TimeProvider.System);
        var bytes = renderer.Render(Sample(0));
        var text = System.Text.Encoding.Latin1.GetString(bytes);
        Assert.StartsWith("%PDF-1.4", text);
        Assert.True(bytes.Length > 800, $"suspiciously small: {bytes.Length} bytes");
        File.WriteAllBytes(Path.Combine(Path.GetTempPath(), "report-empty.pdf"), bytes);
    }
}

/// <summary>
/// Sharing a PDF by email. A browser cannot attach a file, so the server does it; these tests
/// cover the two things that silently break that: a wrong provider payload and a "sent"
/// message that was only written to a log.
/// </summary>
public class EmailAttachmentTests
{
    private sealed class CapturingHandler : HttpMessageHandler
    {
        public string Body { get; private set; } = "";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent("{}") };
        }
    }

    private static EmailAttachment Pdf() => new("customer-report.pdf", "application/pdf", "%PDF-1.4 tiny"u8.ToArray());

    [Fact]
    public async Task Brevo_sends_the_file_base64_encoded()
    {
        var handler = new CapturingHandler();
        var sender = new BrevoEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { Provider = "Brevo", ApiKey = "key", FromAddress = "erp@example.com" }));
        Assert.True(sender.Enabled);

        await sender.SendAsync("to@example.com", "Karim", "Report", "<p>hi</p>", new[] { Pdf() });

        Assert.Contains("\"name\":\"customer-report.pdf\"", handler.Body);
        Assert.Contains(Convert.ToBase64String(Pdf().Content), handler.Body);
    }

    [Fact]
    public async Task Resend_sends_the_file_and_omits_the_key_when_there_is_none()
    {
        var handler = new CapturingHandler();
        var sender = new ResendEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { Provider = "Resend", ApiKey = "key", FromAddress = "erp@example.com" }));

        await sender.SendAsync("to@example.com", "Karim", "Report", "<p>hi</p>", new[] { Pdf() });
        Assert.Contains("\"filename\":\"customer-report.pdf\"", handler.Body);

        // Brevo and Resend both reject an explicit null here, so it has to be absent, not null.
        var plain = new CapturingHandler();
        await new ResendEmailSender(new HttpClient(plain), Options.Create(new EmailOptions { ApiKey = "key" }))
            .SendAsync("to@example.com", "Karim", "Report", "<p>hi</p>");
        Assert.DoesNotContain("attachments", plain.Body);
    }

    [Fact]
    public void An_unconfigured_provider_reports_itself_as_disabled()
    {
        Assert.False(new LogEmailSender(new SilentLogger<LogEmailSender>()).Enabled);
        // A provider is only usable once it has a key.
        Assert.False(new BrevoEmailSender(new HttpClient(), Options.Create(new EmailOptions { Provider = "Brevo" })).Enabled);
    }
}

public class PdfMailerTests
{
    private sealed class SpyEmail(bool enabled) : IEmailSender
    {
        public bool Enabled => enabled;
        public string? To { get; private set; }
        public string? Subject { get; private set; }
        public string? Body { get; private set; }
        public IReadOnlyList<EmailAttachment>? Attachments { get; private set; }

        public Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
            IReadOnlyList<EmailAttachment>? attachments = null, CancellationToken ct = default)
        {
            (To, Subject, Body, Attachments) = (toEmail, subject, htmlBody, attachments);
            return Task.CompletedTask;
        }
    }

    private sealed class FixedBusiness(string name) : IBusinessProfile
    {
        public Task<string> NameAsync(CancellationToken ct) => Task.FromResult(name);
        public Task<string> NameOfAsync(Guid? tenantUuid, CancellationToken ct) => Task.FromResult(name);
        public string ProductName => "Tasif Matrix ERP";
    }

    // The business's own name heads the email, not the software's.
    private static PdfMailer Create(SpyEmail email) => new(email, new FixedBusiness("Sompriti Enterprise"), new FakeUser());

    private static readonly byte[] Bytes = "%PDF-1.4"u8.ToArray();

    [Fact]
    public async Task Attaches_the_pdf_and_titles_the_mail()
    {
        var email = new SpyEmail(enabled: true);
        await Create(email).SendAsync(new EmailPdfRequest("karim@example.com", null, null, "Please check the highlighted row."),
            "Customer report for 01 Jan 2026 to 31 Dec 2026", "customer-report.pdf", Bytes, default);

        Assert.Equal("karim@example.com", email.To);
        Assert.Equal("Sompriti Enterprise: Customer report for 01 Jan 2026 to 31 Dec 2026", email.Subject);
        Assert.Contains("Please check the highlighted row.", email.Body);
        Assert.Contains("Test Admin", email.Body); // who sent it
        var file = Assert.Single(email.Attachments!);
        Assert.Equal("customer-report.pdf", file.FileName);
        Assert.Equal("application/pdf", file.ContentType);
        Assert.Equal(Bytes, file.Content);
    }

    [Fact]
    public async Task A_supplied_subject_wins_and_the_message_is_escaped()
    {
        var email = new SpyEmail(enabled: true);
        await Create(email).SendAsync(new EmailPdfRequest("karim@example.com", "Karim", "  Your invoice  ", "<script>x</script>"),
            "Sales invoice 100042", "sales-invoice-100042.pdf", Bytes, default);

        Assert.Equal("Your invoice", email.Subject);
        Assert.DoesNotContain("<script>", email.Body);
        Assert.Contains("&lt;script&gt;", email.Body);
    }

    [Fact]
    public async Task A_bad_recipient_is_rejected_before_anything_is_sent()
    {
        var email = new SpyEmail(enabled: true);
        var mailer = Create(email);
        foreach (var bad in new string?[] { null, "", "   ", "karim", "karim@example", "a@b.c d" })
        {
            var ex = await Assert.ThrowsAsync<DomainException>(() =>
                mailer.SendAsync(new EmailPdfRequest(bad, null, null, null), "Sales invoice 1", "x.pdf", Bytes, default));
            Assert.Equal(ErrorKind.Validation, ex.Kind);
            Assert.True(ex.Errors.ContainsKey("to"), $"'{bad}' should be reported against the recipient field");
        }
        Assert.Null(email.To);
    }

    [Fact]
    public async Task Refuses_rather_than_claiming_to_have_sent_when_no_provider_is_configured()
    {
        var email = new SpyEmail(enabled: false);
        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            Create(email).SendAsync(new EmailPdfRequest("karim@example.com", null, null, null),
                "Sales invoice 100042", "sales-invoice-100042.pdf", Bytes, default));

        Assert.Contains("Email:Provider", ex.Message);
        Assert.Contains("download", ex.Message); // tells the user what they can do instead
        Assert.Null(email.To);
    }
}

public class PdfTests
{
    internal static OrderDetailDto SampleOrder(int lineCount, PostingStatus status)
    {
        var lines = Enumerable.Range(1, lineCount).Select(i => new OrderLineDto(Guid.NewGuid(), i, Guid.NewGuid(), $"P-{i:000}",
            $"Product number {i} with a fairly long descriptive name (500ml)", i % 2 == 0 ? QuantityType.Box : QuantityType.Pcs,
            i % 2 == 0 ? 3 : null, i % 2 == 0 ? null : 7, i % 2 == 0 ? 12 : null, i % 2 == 0 ? 36 : 7,
            12.5m, i % 2 == 0 ? 150m : null, i % 2 == 0 ? 450m : 87.5m, Uom.Pcs)).ToList();
        var total = lines.Sum(l => l.TotalPrice);
        var payments = new List<OrderPaymentDto>
        {
            new(Guid.NewGuid(), new DateOnly(2026, 9, 10), 1000m, PaymentMethod.MobileBanking, "bKash (ref 8XK2)", DateTimeOffset.UtcNow, "Admin"),
            new(Guid.NewGuid(), new DateOnly(2026, 9, 12), 500m, PaymentMethod.Cash, null, DateTimeOffset.UtcNow, "Manager"),
        };
        return new OrderDetailDto(Guid.NewGuid(), TransactionType.Sales, "100042",
            new OrderCompanyDto(Guid.NewGuid(), "Sompriti Enterprise", "SE"),
            new OrderPartyDto(Guid.NewGuid(), "Karim Traders", "100007", "01712345678", "House 12, Road 5, Dhanmondi", "Dhaka"),
            PaymentType.Installment, status, new DateOnly(2026, 9, 9), "Deliver before Friday. Handle with care.",
            total, 1500m, total - 1500m, null, null, null, null, status == PostingStatus.Void ? "Customer cancelled" : null,
            Guid.NewGuid(), DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "Admin", "Admin", lines, payments, false, null);
    }

    internal static CompanyDto SampleCompany() => new(Guid.NewGuid(), "Sompriti Enterprise", "SE", "12/A Motijheel C/A", "Dhaka", "Dhaka",
        "1000", "01811111111", "info@sompriti.com", "TRAD/DSCC/12345", Guid.NewGuid(), DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "a", "a");

    [Fact]
    public void Renders_a_valid_single_page_pdf()
    {
        var renderer = new OrderPdfRenderer(new FakeUser(), new FakeClock(DateTimeOffset.UtcNow));
        var bytes = renderer.Render(SampleOrder(5, PostingStatus.Final), SampleCompany());
        var text = Encoding.Latin1.GetString(bytes);
        Assert.StartsWith("%PDF-1.4", text);
        Assert.Contains("%%EOF", text);
        Assert.Contains("/Count 1", text);
        Assert.Contains("SALES INVOICE", text);
        Assert.DoesNotContain("DRAFT", text);
    }

    /// <summary>
    /// A bare "20" in the quantity column is ambiguous once products can be measured in kilos or
    /// litres, so every line prints its unit - and for a box, the unit the box holds.
    /// </summary>
    [Fact]
    public void Quantities_are_printed_with_their_unit()
    {
        var order = SampleOrder(1, PostingStatus.Final) with
        {
            TotalAmount = 8892.50m,
            TotalPaidAmount = 1500m,
            DueAmount = 7392.50m,
            Lines = new[]
            {
                // One box of 20 litres: entered by the box, measured in litres.
                new OrderLineDto(Guid.NewGuid(), 1, Guid.NewGuid(), "20c", "Tamim oil",
                    QuantityType.Box, 1, null, 20m, 20m, 195m, 3900m, 3900m, Uom.Litre),
                // Loose oil, sold by the litre.
                new OrderLineDto(Guid.NewGuid(), 2, Guid.NewGuid(), "10c", "No-1 oil",
                    QuantityType.Litre, null, 10m, null, 10m, 195m, null, 1950m, Uom.Litre),
                // A sack of rice, measured in kilos, with a fraction.
                new OrderLineDto(Guid.NewGuid(), 3, Guid.NewGuid(), "RICE", "Miniket rice",
                    QuantityType.Kg, null, 12.5m, null, 12.5m, 85m, null, 1062.5m, Uom.Kg),
                // Pieces stay pieces.
                new OrderLineDto(Guid.NewGuid(), 4, Guid.NewGuid(), "SOAP", "Lux soap",
                    QuantityType.Box, 3, null, 12m, 36m, 55m, 660m, 1980m, Uom.Pcs),
            },
        };

        var renderer = new OrderPdfRenderer(new FakeUser(), new FakeClock(DateTimeOffset.UtcNow));
        var bytes = renderer.Render(order, SampleCompany());
        var text = Encoding.Latin1.GetString(bytes);
        File.WriteAllBytes(Path.Combine(Path.GetTempPath(), "order-units.pdf"), bytes);

        Assert.Contains("(20 L) Tj", text);
        Assert.Contains("(10 L) Tj", text);
        Assert.Contains("(12.5 KG) Tj", text);
        Assert.Contains("(36 PCS) Tj", text);
        // Box counts carry their unit too, which is what replaced the old "Type" column.
        Assert.Contains("(1 BOX) Tj", text);
        Assert.Contains("(3 BOX) Tj", text);
        Assert.DoesNotContain("(Type) Tj", text);
    }

    [Fact]
    public void Long_orders_span_multiple_pages_with_watermark()
    {
        var renderer = new OrderPdfRenderer(new FakeUser(), new FakeClock(DateTimeOffset.UtcNow));
        var bytes = renderer.Render(SampleOrder(80, PostingStatus.Draft), SampleCompany());
        var text = Encoding.Latin1.GetString(bytes);
        Assert.Contains("/Count 3", text);
        Assert.Contains("(DRAFT) Tj", text);
        Assert.Contains("Page 3 of 3", text);
    }
}
