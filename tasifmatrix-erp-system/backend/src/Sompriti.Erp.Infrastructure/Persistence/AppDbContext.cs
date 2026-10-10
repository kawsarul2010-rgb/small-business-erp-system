using System.Reflection;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Common;
using Sompriti.Erp.Domain.Entities;
using Sompriti.Erp.Domain.Enums;
using Sompriti.Erp.Domain.Rules;

namespace Sompriti.Erp.Infrastructure.Persistence;

/// <summary>
/// EF Core context. The schema itself is created by the SQL scripts in Persistence/Migrations
/// (see DatabaseInitializer); this class only maps entities to that schema.
///
/// Business separation, the application's half of it:
///  - every business-owned entity (ITenantOwned, plus AppUser) carries a query filter on the
///    signed-in business, so a query can only see another business's rows by calling
///    IgnoreQueryFilters() - which is rare, deliberate and easy to search for;
///  - new rows are stamped with the signed-in business, and an existing row can never be moved
///    to another one;
///  - TenantConnectionInterceptor switches each connection to the row-level-security role, so
///    PostgreSQL enforces the same thing underneath.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser currentUser, TimeProvider clock)
    : DbContext(options), IAppDbContext
{
    private Guid? _auditUserUuid;
    private string? _auditUserName;

    /// <summary>
    /// The business the query filters compare with. Outside a business (signed out, super admin,
    /// background jobs) it is Guid.Empty, which matches no row: the safe default is "see nothing".
    /// EF evaluates this property each time a query runs, on the context running it.
    /// </summary>
    internal Guid CurrentTenantFilter => currentUser.IsAuthenticated && currentUser.TenantUuid is { } t ? t : Guid.Empty;

    /// <summary>Business for the connection's row-level security, or null to stay the owner (see the interceptor).</summary>
    internal Guid? ConnectionTenant => currentUser.IsAuthenticated ? currentUser.TenantUuid : null;

    public DbSet<Tenant> Tenants => Set<Tenant>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockBalance> StockBalances => Set<StockBalance>();
    public DbSet<StockLedger> StockLedgers => Set<StockLedger>();
    public DbSet<StockAdjustment> StockAdjustments => Set<StockAdjustment>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLineItem> PurchaseOrderLines => Set<PurchaseOrderLineItem>();
    public DbSet<PurchaseOrderPayment> PurchaseOrderPayments => Set<PurchaseOrderPayment>();
    public DbSet<SalesOrder> SalesOrders => Set<SalesOrder>();
    public DbSet<SalesOrderLineItem> SalesOrderLines => Set<SalesOrderLineItem>();
    public DbSet<SalesOrderPayment> SalesOrderPayments => Set<SalesOrderPayment>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<SmsOutbox> SmsOutbox => Set<SmsOutbox>();
    public DbSet<BusinessSetting> BusinessSettings => Set<BusinessSetting>();
    public DbSet<BusinessSize> BusinessSizes => Set<BusinessSize>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<SubscriptionPlanPrice> SubscriptionPlanPrices => Set<SubscriptionPlanPrice>();
    public DbSet<BillingSettings> BillingSettings => Set<BillingSettings>();
    public DbSet<BillingPayment> BillingPayments => Set<BillingPayment>();
    public DbSet<SuperAdminPost> SuperAdminPosts => Set<SuperAdminPost>();
    public DbSet<AppRelease> AppReleases => Set<AppRelease>();
    public DbSet<BusinessPlanPrice> BusinessPlanPrices => Set<BusinessPlanPrice>();

    public void SetOriginalRevision(AuditedEntity entity, Guid revision) =>
        Entry(entity).Property(nameof(AuditedEntity.Revision)).OriginalValue = revision;

    public void SetAuditUser(Guid userUuid, string userName)
    {
        _auditUserUuid = userUuid;
        _auditUserName = userName;
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampTenant();
        StampAudit();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        StampTenant();
        StampAudit();
        return base.SaveChanges();
    }

    /// <summary>
    /// New rows take the signed-in business (see TenantStamp for the exact rule); existing rows
    /// keep theirs. Runs before anything reaches the database.
    /// </summary>
    private void StampTenant()
    {
        var signedIn = currentUser.IsAuthenticated ? currentUser.TenantUuid : null;

        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
        {
            if (entry.State == EntityState.Added)
                entry.Entity.TenantUuid = TenantStamp.ForNewRow(entry.Entity.TenantUuid, signedIn, entry.Entity.GetType().Name);
            else if (entry.State == EntityState.Modified && entry.Property(nameof(ITenantOwned.TenantUuid)).IsModified)
                throw new InvalidOperationException($"A {entry.Entity.GetType().Name} cannot be moved to another business.");
        }

        foreach (var entry in ChangeTracker.Entries<AppUser>())
        {
            var user = entry.Entity;
            if (entry.State == EntityState.Added)
            {
                // A super admin has no business; everyone else gets the signed-in one unless the
                // platform set it explicitly when creating a business's admin.
                if (user.Role == Role.SuperAdmin)
                {
                    if (signedIn is not null || user.TenantUuid is not null)
                        throw new InvalidOperationException("A super admin cannot be created inside a business.");
                }
                else
                {
                    user.TenantUuid = TenantStamp.ForNewRow(user.TenantUuid ?? Guid.Empty, signedIn, nameof(AppUser));
                }
            }
            else if (entry.State == EntityState.Modified && entry.Property(nameof(AppUser.TenantUuid)).IsModified)
            {
                throw new InvalidOperationException("A user cannot be moved to another business.");
            }
        }
    }

    private void StampAudit()
    {
        var now = clock.GetUtcNow();
        var (userUuid, userName) = currentUser.IsAuthenticated
            ? (currentUser.UserUuid, currentUser.UserName)
            : (_auditUserUuid ?? AppUser.SystemUserUuid, _auditUserName ?? AppUser.SystemUserName);

        foreach (var entry in ChangeTracker.Entries<AuditedEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.Revision = Guid.NewGuid();
                    entry.Entity.CreatedDate = now;
                    entry.Entity.UpdatedDate = now;
                    entry.Entity.CreatedByUserUuid = userUuid;
                    entry.Entity.UpdatedByUserUuid = userUuid;
                    entry.Entity.CreatedByUserName = userName;
                    entry.Entity.UpdatedByUserName = userName;
                    break;
                case EntityState.Modified:
                    // The original revision stays as the concurrency token; the stored revision is regenerated.
                    entry.Entity.Revision = Guid.NewGuid();
                    entry.Entity.UpdatedDate = now;
                    entry.Entity.UpdatedByUserUuid = userUuid;
                    entry.Entity.UpdatedByUserName = userName;
                    break;
            }
        }
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Tenant>(e => { e.ToTable("tenant"); Audited(e); });
        b.Entity<AppUser>(e =>
        {
            e.ToTable("app_user"); Audited(e);
            // A business sees its own users only; the super admin (no business) sees none this way.
            e.HasQueryFilter(u => u.TenantUuid == CurrentTenantFilter);
        });
        b.Entity<Company>(e => { e.ToTable("company"); Audited(e); });
        b.Entity<BusinessSetting>(e => { e.ToTable("business_setting"); Audited(e); });
        b.Entity<BusinessSize>(e => { e.ToTable("business_size"); Audited(e); });
        b.Entity<SubscriptionPlan>(e => { e.ToTable("subscription_plan"); Audited(e); });
        b.Entity<SubscriptionPlanPrice>(e => { e.ToTable("subscription_plan_price"); e.HasKey(x => new { x.PlanUuid, x.SizeUuid }); });
        b.Entity<BillingSettings>(e => { e.ToTable("billing_settings"); e.HasKey(x => x.Id); e.Property(x => x.Id).ValueGeneratedNever(); });
        b.Entity<BillingPayment>(e => { e.ToTable("billing_payment"); e.HasKey(x => x.Uuid); });
        b.Entity<SuperAdminPost>(e => { e.ToTable("super_admin_post"); Audited(e); });
        b.Entity<AppRelease>(e => { e.ToTable("app_release"); Audited(e); });
        b.Entity<BusinessPlanPrice>(e => { e.ToTable("business_plan_price"); e.HasKey(x => new { x.TenantUuid, x.PlanUuid }); });

        b.Entity<Customer>(e =>
        {
            e.ToTable("customer"); Audited(e);
            e.Property(x => x.Name).HasColumnName("customer_name");
            e.Property(x => x.Code).HasColumnName("customer_code").ValueGeneratedOnAdd(); // numbered per business by trigger
        });
        b.Entity<Supplier>(e =>
        {
            e.ToTable("supplier"); Audited(e);
            e.Property(x => x.Name).HasColumnName("supplier_name");
            e.Property(x => x.Code).HasColumnName("supplier_code").ValueGeneratedOnAdd(); // numbered per business by trigger
        });

        b.Entity<Product>(e => { e.ToTable("product"); Audited(e); });
        b.Entity<StockBalance>(e => { e.ToTable("stock_balance"); Audited(e); });
        b.Entity<StockLedger>(e => { e.ToTable("stock_ledger"); e.HasKey(x => x.Uuid); });
        b.Entity<StockAdjustment>(e =>
        {
            e.ToTable("stock_adjustment"); Audited(e);
            e.Property(x => x.AdjustmentNumber).ValueGeneratedOnAdd(); // numbered per business by trigger
        });

        Order<PurchaseOrder>(b, "purchase_order", "purchase_order_number", "supplier_uuid");
        Line<PurchaseOrderLineItem>(b, "purchase_order_line_item", "purchase_order_uuid");
        Payment<PurchaseOrderPayment>(b, "purchase_order_payment", "purchase_order_uuid");
        Order<SalesOrder>(b, "sales_order", "sales_order_number", "customer_uuid");
        Line<SalesOrderLineItem>(b, "sales_order_line_item", "sales_order_uuid");
        Payment<SalesOrderPayment>(b, "sales_order_payment", "sales_order_uuid");

        b.Entity<RefreshToken>(e => { e.ToTable("refresh_token"); e.HasKey(x => x.Uuid); });
        b.Entity<PasswordResetToken>(e => { e.ToTable("password_reset_token"); e.HasKey(x => x.Uuid); });
        b.Entity<SmsOutbox>(e => { e.ToTable("sms_outbox"); e.HasKey(x => x.Uuid); });

        // Every business-owned entity gets the business filter. Found by type rather than listed,
        // so a new entity cannot be forgotten: implementing ITenantOwned is enough.
        foreach (var clr in b.Model.GetEntityTypes().Select(t => t.ClrType).Where(typeof(ITenantOwned).IsAssignableFrom).ToList())
            ApplyTenantFilterMethod.MakeGenericMethod(clr).Invoke(this, [b]);

        // Conventions: snake_case columns unless already set, enums stored as UPPER_SNAKE text.
        foreach (var entity in b.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                if (property.GetColumnName() == property.Name)
                    property.SetColumnName(ToSnakeCase(property.Name));

                var type = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (type.IsEnum)
                {
                    var converterType = typeof(EnumTextConverter<>).MakeGenericType(type);
                    property.SetValueConverter((ValueConverter)Activator.CreateInstance(converterType)!);
                }
            }
        }
    }

    private static readonly MethodInfo ApplyTenantFilterMethod =
        typeof(AppDbContext).GetMethod(nameof(ApplyTenantFilter), BindingFlags.NonPublic | BindingFlags.Instance)!;

    // The lambda refers to this context; EF re-points it at whichever context runs the query.
    private void ApplyTenantFilter<T>(ModelBuilder b) where T : class, ITenantOwned =>
        b.Entity<T>().HasQueryFilter(e => e.TenantUuid == CurrentTenantFilter);

    private static void Audited<T>(EntityTypeBuilder<T> e) where T : AuditedEntity
    {
        e.HasKey(x => x.Uuid);
        e.Property(x => x.Revision).IsConcurrencyToken();
        if (typeof(SoftDeletableEntity).IsAssignableFrom(typeof(T)))
            e.Ignore(nameof(SoftDeletableEntity.IsActive));
    }

    private static void Order<T>(ModelBuilder b, string table, string numberColumn, string partyColumn) where T : OrderHeader
    {
        b.Entity<T>(e =>
        {
            e.ToTable(table); Audited(e);
            // Left empty on insert; a database trigger numbers it within the business and
            // EF reads the number back (RETURNING).
            e.Property(x => x.OrderNumber).HasColumnName(numberColumn).ValueGeneratedOnAdd();
            e.Property(x => x.PartyUuid).HasColumnName(partyColumn);
            e.Ignore(x => x.DueAmount);
        });
    }

    private static void Line<T>(ModelBuilder b, string table, string orderColumn) where T : OrderLine
    {
        b.Entity<T>(e =>
        {
            e.ToTable(table); Audited(e);
            e.Property(x => x.OrderUuid).HasColumnName(orderColumn);
        });
    }

    private static void Payment<T>(ModelBuilder b, string table, string orderColumn) where T : OrderPayment
    {
        b.Entity<T>(e =>
        {
            e.ToTable(table); Audited(e);
            e.Property(x => x.OrderUuid).HasColumnName(orderColumn);
        });
    }

    public static string ToSnakeCase(string name)
    {
        var sb = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c) && i > 0) sb.Append('_');
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}

/// <summary>Stores enums as UPPER_SNAKE_CASE text, e.g. PaymentMethod.MobileBanking -> "MOBILE_BANKING".</summary>
public sealed class EnumTextConverter<TEnum>() : ValueConverter<TEnum, string>(
    v => EnumText.ToText(v.ToString()),
    v => EnumText.Parse<TEnum>(v)) where TEnum : struct, Enum;
