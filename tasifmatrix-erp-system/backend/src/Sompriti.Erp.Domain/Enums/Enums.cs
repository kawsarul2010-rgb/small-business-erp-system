namespace Sompriti.Erp.Domain.Enums;

// Enum members are PascalCase in C#. They are stored in the database and sent in JSON
// as UPPER_SNAKE_CASE (e.g. MobileBanking <-> "MOBILE_BANKING"). See EnumText.

public enum RecordStatus { Active, Deleted }

// SuperAdmin is the platform owner: it belongs to no business and sees none of their data.
// Appended last so the existing members keep their numeric values.
public enum Role { Admin, Manager, User, SuperAdmin }

/// <summary>A suspended business cannot sign in; its data is kept untouched.</summary>
public enum TenantStatus { Active, Suspended }

public enum Uom { Pcs, Box, Kg, Litre }

public enum QuantityType { Pcs, Box, Kg, Litre }

public enum PaymentType { Cash, Due, Installment }

public enum PostingStatus { Draft, Final, Void }

public enum TransactionType { Purchase, Sales }

public enum PaymentMethod { Cash, Bank, MobileBanking, Cheque, Other }

public enum AdjustmentType { Increase, Decrease }

public enum AdjustmentReason { OpeningStock, Damage, Loss, Correction, Other }

public enum MovementType { PurchaseFinal, PurchaseVoid, SalesFinal, SalesVoid, AdjustmentIn, AdjustmentOut }

public enum ReferenceType { PurchaseOrder, SalesOrder, StockAdjustment }

public enum SmsStatus { Pending, Sent, Failed, Skipped }
