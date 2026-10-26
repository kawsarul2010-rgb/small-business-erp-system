using Sompriti.Erp.Application.Common;
using Sompriti.Erp.Domain.Enums;

namespace Sompriti.Erp.Application.Orders;

public sealed record OrderListQuery : PageQuery
{
    public PostingStatus? PostingStatus { get; init; }
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public Guid? PartyUuid { get; init; }
    public Guid? CompanyUuid { get; init; }
    public bool DueOnly { get; init; }
    /// <summary>true: previous dues only; false: leave them out; null: both.</summary>
    public bool? OpeningDue { get; init; }
}

public sealed record OrderListItemDto(
    Guid Uuid, TransactionType TransactionType, string OrderNumber, DateOnly OrderDate,
    Guid CompanyUuid, string CompanyName, Guid PartyUuid, string PartyName, string PartyCode,
    PaymentType PaymentType, PostingStatus PostingStatus, decimal TotalAmount, decimal TotalPaidAmount, decimal DueAmount,
    DateTimeOffset CreatedDate, string CreatedByUserName, Guid Revision,
    /// <summary>Previous due recorded when the business started using the app (no line items).</summary>
    bool IsOpeningDue = false);

public sealed record OrderPartyDto(Guid Uuid, string Name, string Code, string MobileNumber, string? Address, string? City);

public sealed record OrderCompanyDto(Guid Uuid, string CompanyName, string CompanyCode);

public sealed record OrderLineDto(
    Guid Uuid, int LineNumber, Guid ProductUuid, string ProductCode, string ProductName,
    QuantityType QuantityType, int? BoxQuantity, decimal? UnitQuantity, decimal? UnitPerBoxSnapshot, decimal TotalQuantity,
    decimal PerUnitPrice, decimal? PerBoxPrice, decimal TotalPrice,
    /// <summary>The unit TotalQuantity and PerUnitPrice are in - pieces, kilos or litres.</summary>
    Uom BaseUom);

public sealed record OrderPaymentDto(
    Guid Uuid, DateOnly PaymentDate, decimal PaymentAmount, PaymentMethod PaymentMethod, string? PaymentNote,
    DateTimeOffset CreatedDate, string CreatedByUserName);

public sealed record OrderDetailDto(
    Guid Uuid, TransactionType TransactionType, string OrderNumber, OrderCompanyDto Company, OrderPartyDto Party,
    PaymentType PaymentType, PostingStatus PostingStatus, DateOnly OrderDate, string? Notes,
    decimal TotalAmount, decimal TotalPaidAmount, decimal DueAmount,
    DateTimeOffset? FinalizedDate, string? FinalizedByUserName,
    DateTimeOffset? VoidedDate, string? VoidedByUserName, string? VoidReason,
    Guid Revision, DateTimeOffset CreatedDate, DateTimeOffset UpdatedDate, string CreatedByUserName, string UpdatedByUserName,
    IReadOnlyList<OrderLineDto> Lines, IReadOnlyList<OrderPaymentDto> Payments,
    /// <summary>The order asks for SMS. SmsBlockedReason, when set, says why none is sent anyway.</summary>
    bool SendSms, string? SmsBlockedReason,
    /// <summary>Previous due recorded when the business started using the app (no line items).</summary>
    bool IsOpeningDue = false);

public sealed record OrderLineRequest(
    Guid? Uuid, Guid? ProductUuid, QuantityType? QuantityType, int? BoxQuantity, decimal? UnitQuantity,
    decimal? TotalQuantity, decimal? PerUnitPrice, decimal? PerBoxPrice, decimal? TotalPrice);

public sealed record OrderSaveRequest(
    Guid? CompanyUuid, Guid? PartyUuid, PaymentType? PaymentType, DateOnly? OrderDate, string? Notes,
    IReadOnlyList<OrderLineRequest>? Lines, Guid? Revision,
    /// <summary>Left out on a new order: the business's default (Settings). Left out on an edit: unchanged.</summary>
    bool? SendSms = null);

public sealed record OrderSmsRequest(bool SendSms, Guid Revision);

public sealed record VoidOrderRequest(Guid Revision, string? VoidReason);

/// <summary>
/// Records a customer's or supplier's previous due ("আগের বাকি") - what was owed before the business
/// started using the app - without entering the old orders. DueDate defaults to today; CompanyUuid
/// to the first company.
/// </summary>
public sealed record OpeningDueRequest(Guid? PartyUuid, decimal? Amount, DateOnly? DueDate, string? Notes, Guid? CompanyUuid = null);

/// <summary>Corrects a previous due's amount, date or note.</summary>
public sealed record OpeningDueUpdateRequest(Guid Revision, decimal? Amount, DateOnly? DueDate, string? Notes);

public sealed record AddPaymentRequest(Guid Revision, DateOnly? PaymentDate, decimal? PaymentAmount, PaymentMethod? PaymentMethod, string? PaymentNote);

/// <summary>The selling or buying business as a POS receipt heads it.</summary>
public sealed record ReceiptBusinessDto(string Name, string? Address, string? Phone, string? Email, string? LicenseNumber);

/// <summary>Everything a POS (thermal) receipt prints: the order and the business it belongs to.</summary>
public sealed record OrderReceiptDto(OrderDetailDto Order, ReceiptBusinessDto Business);
