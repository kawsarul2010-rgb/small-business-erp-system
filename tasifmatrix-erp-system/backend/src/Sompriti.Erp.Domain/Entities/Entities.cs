using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Domain.Entities;

/// <summary>Base for all tables with the standard audit columns (see SRS 6.0).</summary>
public abstract class AuditedEntity
{
    public Guid Uuid { get; set; }
    public Guid Revision { get; set; }
    public DateTimeOffset CreatedDate { get; set; }
    public DateTimeOffset UpdatedDate { get; set; }
    public Guid CreatedByUserUuid { get; set; }
    public Guid UpdatedByUserUuid { get; set; }
    public string CreatedByUserName { get; set; } = "";
    public string UpdatedByUserName { get; set; } = "";
}

public abstract class SoftDeletableEntity : AuditedEntity
{
    public RecordStatus Status { get; set; } = RecordStatus.Active;
    public bool IsActive => Status == RecordStatus.Active;
}

/// <summary>
/// A row that belongs to one business. The database context fills TenantUuid on insert from
/// the signed-in business, filters every query by it, and refuses to move a row to another
/// business; PostgreSQL row-level security enforces the same underneath.
/// </summary>
public interface ITenantOwned
{
    Guid TenantUuid { get; set; }
}

/// <summary>A business using the system (a tenant). Managed only by the super admin.</summary>
public class Tenant : AuditedEntity
{
    /// <summary>Short, lowercase, unique. People enter it when they register, e.g. "sompriti".</summary>
    public string TenantCode { get; set; } = "";
    public string TenantName { get; set; } = "";
    public TenantStatus Status { get; set; } = TenantStatus.Active;
    public string? ContactName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset? SuspendedDate { get; set; }
    public string? SuspendReason { get; set; }
    /// <summary>What the platform owner charges this business per SMS part, in taka. Null: not charged.</summary>
    public decimal? SmsPrice { get; set; }
}

/// <summary>A business's own settings, changed by its admins. Missing row: the defaults below.</summary>
public class BusinessSetting : AuditedEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    /// <summary>False: the business sends no SMS at all.</summary>
    public bool SmsEnabled { get; set; } = true;
    /// <summary>Whether a new order starts with "Send SMS" switched on.</summary>
    public bool SmsOnNewOrders { get; set; }
}

public class AppUser : SoftDeletableEntity
{
    /// <summary>The user's business. Null only for a super admin, who belongs to none.</summary>
    public Guid? TenantUuid { get; set; }
    public string UserName { get; set; } = "";
    public string Email { get; set; } = "";
    public string PhoneNumber { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public Role Role { get; set; } = Role.User;
    public Guid? SupplierUuid { get; set; }
    public Guid? CustomerUuid { get; set; }
    public DateTimeOffset? LastLoginDate { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTimeOffset? LockoutEndDate { get; set; }
    public bool MustChangePassword { get; set; }

    /// <summary>Reserved user used for seed data and background jobs.</summary>
    public static readonly Guid SystemUserUuid = new("00000000-0000-0000-0000-000000000001");
    public const string SystemUserName = "SYSTEM";
}

public class Company : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public string CompanyName { get; set; } = "";
    public string CompanyCode { get; set; } = "";
    public string? AddressLine { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? LicenseNumber { get; set; }
}

/// <summary>Shared shape of Customer and Supplier.</summary>
public abstract class PartyEntity : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public string Name { get; set; } = "";
    /// <summary>Numbered per business by the database on insert.</summary>
    public string? Code { get; set; }
    public string MobileNumber { get; set; } = "";
    public string? Nid { get; set; }
    public string? Tin { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? PostalCode { get; set; }
    /// <summary>False: this customer or supplier never gets an SMS, whatever the order says.</summary>
    public bool SmsEnabled { get; set; } = true;
}

public class Customer : PartyEntity { }

public class Supplier : PartyEntity { }

public class Product : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public string ProductName { get; set; } = "";
    public string ProductCode { get; set; } = "";
    /// <summary>Per PCS.</summary>
    public decimal ProductSalesPrice { get; set; }
    /// <summary>Per PCS.</summary>
    public decimal ProductPurchasePrice { get; set; }
    public Uom Uom { get; set; } = Uom.Pcs;
    /// <summary>What a box of this product holds. Only set when Uom is BOX.</summary>
    public Uom? SecondaryUom { get; set; }

    /// <summary>How much of the base unit one box holds. Required for a BOX product.</summary>
    public decimal? UnitPerBox { get; set; }
    public decimal? LowStockThreshold { get; set; }
}

public class StockBalance : AuditedEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public Guid ProductUuid { get; set; }
    public decimal CurrentStockBalance { get; set; }
}

public class StockLedger : ITenantOwned
{
    public Guid Uuid { get; set; }
    public Guid TenantUuid { get; set; }
    public Guid ProductUuid { get; set; }
    public MovementType MovementType { get; set; }
    public decimal QuantityChange { get; set; }
    public decimal BalanceAfter { get; set; }
    public ReferenceType ReferenceType { get; set; }
    public Guid ReferenceUuid { get; set; }
    public string ReferenceNumber { get; set; } = "";
    public DateTimeOffset CreatedDate { get; set; }
    public Guid CreatedByUserUuid { get; set; }
    public string CreatedByUserName { get; set; } = "";
}

public class StockAdjustment : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public string? AdjustmentNumber { get; set; }
    public Guid ProductUuid { get; set; }
    public AdjustmentType AdjustmentType { get; set; }
    public decimal Quantity { get; set; }
    public AdjustmentReason Reason { get; set; }
    public string? Note { get; set; }
    public DateOnly AdjustmentDate { get; set; }
}

/// <summary>Shared header of purchase and sales orders. PartyUuid maps to supplier_uuid / customer_uuid.</summary>
public abstract class OrderHeader : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public TransactionType TransactionType { get; set; }
    /// <summary>Numbered per business by the database on insert.</summary>
    public string? OrderNumber { get; set; }
    public Guid CompanyUuid { get; set; }
    public Guid PartyUuid { get; set; }
    public PaymentType PaymentType { get; set; }
    public PostingStatus PostingStatus { get; set; } = PostingStatus.Draft;
    public DateOnly OrderDate { get; set; }
    public string? Notes { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal TotalPaidAmount { get; set; }
    public DateTimeOffset? FinalizedDate { get; set; }
    public Guid? FinalizedByUserUuid { get; set; }
    public string? FinalizedByUserName { get; set; }
    public DateTimeOffset? VoidedDate { get; set; }
    public Guid? VoidedByUserUuid { get; set; }
    public string? VoidedByUserName { get; set; }
    public string? VoidReason { get; set; }
    /// <summary>
    /// Send the customer or supplier an SMS when this order is finalized and when a payment is
    /// added. Also needs SMS on for the business and for the party.
    /// </summary>
    public bool SendSms { get; set; }

    public decimal DueAmount => TotalAmount - TotalPaidAmount;
}

/// <summary>Shared line of purchase and sales orders. OrderUuid maps to purchase_order_uuid / sales_order_uuid.</summary>
public abstract class OrderLine : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public Guid OrderUuid { get; set; }
    public int LineNumber { get; set; }
    public Guid ProductUuid { get; set; }
    public QuantityType QuantityType { get; set; }
    public int? BoxQuantity { get; set; }
    public decimal? UnitQuantity { get; set; }
    public decimal? UnitPerBoxSnapshot { get; set; }
    public decimal TotalQuantity { get; set; }
    public decimal PerUnitPrice { get; set; }
    public decimal? PerBoxPrice { get; set; }
    public decimal TotalPrice { get; set; }
}

public abstract class OrderPayment : SoftDeletableEntity, ITenantOwned
{
    public Guid TenantUuid { get; set; }
    public Guid OrderUuid { get; set; }
    public DateOnly PaymentDate { get; set; }
    public decimal PaymentAmount { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Cash;
    public string? PaymentNote { get; set; }
}

public class PurchaseOrder : OrderHeader
{
    public PurchaseOrder() { TransactionType = TransactionType.Purchase; }
}

public class PurchaseOrderLineItem : OrderLine { }

public class PurchaseOrderPayment : OrderPayment { }

public class SalesOrder : OrderHeader
{
    public SalesOrder() { TransactionType = TransactionType.Sales; }
}

public class SalesOrderLineItem : OrderLine { }

public class SalesOrderPayment : OrderPayment { }

public class RefreshToken
{
    public Guid Uuid { get; set; }
    public Guid UserUuid { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresDate { get; set; }
    public DateTimeOffset CreatedDate { get; set; }
    public DateTimeOffset? RevokedDate { get; set; }
}

public class PasswordResetToken
{
    public Guid Uuid { get; set; }
    public Guid UserUuid { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresDate { get; set; }
    public DateTimeOffset CreatedDate { get; set; }
    public DateTimeOffset? UsedDate { get; set; }
}

public class SmsOutbox : ITenantOwned
{
    public Guid Uuid { get; set; }
    public Guid TenantUuid { get; set; }
    public string RecipientNumber { get; set; } = "";
    public string Message { get; set; } = "";
    /// <summary>SMS parts the operator charges for this message, worked out when it is queued.</summary>
    public short SmsParts { get; set; } = 1;
    public string ReferenceType { get; set; } = "";
    public Guid ReferenceUuid { get; set; }
    public SmsStatus Status { get; set; } = SmsStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTimeOffset? NextAttemptDate { get; set; }
    public string? LastError { get; set; }
    public string? ProviderMessageId { get; set; }
    public DateTimeOffset CreatedDate { get; set; }
    public DateTimeOffset? SentDate { get; set; }
}
