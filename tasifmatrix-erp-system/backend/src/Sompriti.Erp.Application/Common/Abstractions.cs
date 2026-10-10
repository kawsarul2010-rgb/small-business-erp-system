using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Common;

/// <summary>The authenticated user for the current request. Role and links are loaded from the database on every request.</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid UserUuid { get; }
    string UserName { get; }
    Role Role { get; }
    Guid? SupplierUuid { get; }
    Guid? CustomerUuid { get; }

    /// <summary>
    /// The business this request acts for. Null when signed out, for the super admin, and in
    /// background jobs - in all of which business data is invisible unless a query opts out
    /// of the business filter explicitly.
    /// </summary>
    Guid? TenantUuid { get; }
}

public static class CurrentUserExtensions
{
    /// <summary>The signed-in business; throws when there is none, rather than running unscoped.</summary>
    public static Guid RequireTenant(this ICurrentUser user) =>
        user.TenantUuid ?? throw DomainException.Forbidden("This action needs a business account.");

    public static bool IsSuperAdmin(this ICurrentUser user) => user.IsAuthenticated && user.Role == Role.SuperAdmin;
}

public interface IAppDbContext
{
    DbSet<Tenant> Tenants { get; }
    DbSet<AppUser> Users { get; }
    DbSet<Company> Companies { get; }
    DbSet<Customer> Customers { get; }
    DbSet<Supplier> Suppliers { get; }
    DbSet<Product> Products { get; }
    DbSet<StockBalance> StockBalances { get; }
    DbSet<StockLedger> StockLedgers { get; }
    DbSet<StockAdjustment> StockAdjustments { get; }
    DbSet<PurchaseOrder> PurchaseOrders { get; }
    DbSet<PurchaseOrderLineItem> PurchaseOrderLines { get; }
    DbSet<PurchaseOrderPayment> PurchaseOrderPayments { get; }
    DbSet<SalesOrder> SalesOrders { get; }
    DbSet<SalesOrderLineItem> SalesOrderLines { get; }
    DbSet<SalesOrderPayment> SalesOrderPayments { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<PasswordResetToken> PasswordResetTokens { get; }
    DbSet<SmsOutbox> SmsOutbox { get; }
    DbSet<BusinessSetting> BusinessSettings { get; }
    DbSet<BusinessSize> BusinessSizes { get; }
    DbSet<SubscriptionPlan> SubscriptionPlans { get; }
    DbSet<SubscriptionPlanPrice> SubscriptionPlanPrices { get; }
    DbSet<BillingSettings> BillingSettings { get; }
    DbSet<BillingPayment> BillingPayments { get; }
    DbSet<SuperAdminPost> SuperAdminPosts { get; }
    DbSet<AppRelease> AppReleases { get; }
    DbSet<BusinessPlanPrice> BusinessPlanPrices { get; }

    DbSet<TEntity> Set<TEntity>() where TEntity : class;
    DatabaseFacade Database { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Tells the context which revision the client last saw, so the UPDATE is guarded by
    /// "WHERE revision = submitted" (optimistic concurrency).
    /// </summary>
    void SetOriginalRevision(AuditedEntity entity, Guid revision);

    /// <summary>Audit user to use when no authenticated user exists (e.g. self-registration, login).</summary>
    void SetAuditUser(Guid userUuid, string userName);
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string hash, string password);
}

public interface ITokenService
{
    (string Token, DateTimeOffset ExpiresAt) CreateAccessToken(AppUser user);
}

/// <summary>A file sent with an email. The content is the raw bytes; providers want it base64-encoded.</summary>
public sealed record EmailAttachment(string FileName, string ContentType, byte[] Content);

public interface IEmailSender
{
    /// <summary>
    /// False when no provider is configured (Email:Provider=Log): messages are written to the log
    /// and never delivered. Callers that promise the user an email should check this first.
    /// </summary>
    bool Enabled { get; }

    Task SendAsync(string toEmail, string toName, string subject, string htmlBody,
        IReadOnlyList<EmailAttachment>? attachments = null, CancellationToken ct = default);
}

public interface ISmsSender
{
    /// <summary>Sends one SMS. Returns the provider message id on success; throws on failure.</summary>
    Task<string?> SendAsync(string normalizedNumber, string message, CancellationToken ct = default);
    bool Enabled { get; }
}

public interface IOrderPdfRenderer
{
    byte[] Render(Orders.OrderDetailDto order, MasterData.CompanyDto company);
}

/// <summary>One column of a printed report. A width of 0 shares out the leftover space.</summary>
public sealed record ReportColumn(string Title, float Width = 0, bool RightAligned = false);

public sealed record ReportRow(IReadOnlyList<string> Cells);

/// <summary>
/// A report ready to print: what it is, which filters produced it, and the table itself.
/// The filters are part of the document so a printed copy can be checked months later.
/// </summary>
public sealed record ReportDocument(
    string Title,
    string BusinessName,
    IReadOnlyList<(string Label, string Value)> Filters,
    IReadOnlyList<ReportColumn> Columns,
    IReadOnlyList<ReportRow> Rows,
    IReadOnlyList<string> Totals,
    string FileName);

public interface IReportPdfRenderer
{
    byte[] Render(ReportDocument document);
}

public sealed class AppOptions
{
    public const string Section = "App";
    /// <summary>Public URL of the app, used in password reset links. Example: https://erp.example.com</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:4200";

    /// <summary>
    /// The product's own name, used where no business applies: the super admin's emails and the
    /// "contact support" line. Each business's documents carry that business's name instead.
    /// </summary>
    public string ProductName { get; set; } = "Tasif Matrix ERP";

    /// <summary>
    /// Whether anyone may register a new business from the sign-up page (they become its admin).
    /// Set App__AllowBusinessSignup=false to allow only the super admin to create businesses.
    /// </summary>
    public bool AllowBusinessSignup { get; set; } = true;
}
