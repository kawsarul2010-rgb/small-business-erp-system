// Types mirroring the API DTOs (see backend Application layer). Enums are UPPER_SNAKE_CASE strings.

/** SUPER_ADMIN is the platform owner: it manages businesses and belongs to none. */
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'USER';
/** CLOSED: the business's last admin deleted it; its records are gone and it cannot be reopened. */
export type BusinessStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type RecordStatus = 'ACTIVE' | 'DELETED';
export type Uom = 'PCS' | 'BOX' | 'KG' | 'LITRE';
export type QuantityType = 'PCS' | 'BOX' | 'KG' | 'LITRE';
export type PaymentType = 'CASH' | 'DUE' | 'INSTALLMENT';
export type PostingStatus = 'DRAFT' | 'FINAL' | 'VOID';
export type TransactionType = 'PURCHASE' | 'SALES';
export type PaymentMethod = 'CASH' | 'BANK' | 'MOBILE_BANKING' | 'CHEQUE' | 'OTHER';
export type AdjustmentType = 'INCREASE' | 'DECREASE';
export type AdjustmentReason = 'OPENING_STOCK' | 'DAMAGE' | 'LOSS' | 'CORRECTION' | 'OTHER';
export type MovementType = 'PURCHASE_FINAL' | 'PURCHASE_VOID' | 'SALES_FINAL' | 'SALES_VOID' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
export type SmsStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export type OrderKind = 'purchase' | 'sales';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface DropdownItem {
  uuid: string;
  code: string;
  name: string;
  label: string;
}

export interface ProblemDetails {
  status?: number;
  title?: string;
  detail?: string;
  code?: string;
  errors?: Record<string, string[]>;
  details?: unknown;
}

// ---------------------------------------------------------------- auth
export interface CurrentUser {
  uuid: string;
  userName: string;
  email: string;
  phoneNumber: string;
  role: Role;
  supplierUuid: string | null;
  supplierName: string | null;
  customerUuid: string | null;
  customerName: string | null;
  mustChangePassword: boolean;
  /** The business this user works in; null for the super admin. */
  businessUuid: string | null;
  businessName: string | null;
  businessCode: string | null;
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: CurrentUser;
}

// ---------------------------------------------------------------- master data
interface Audited {
  revision: string;
  createdDate: string;
  updatedDate: string;
  createdByUserName: string;
  updatedByUserName: string;
}

export interface Company extends Audited {
  uuid: string;
  companyName: string;
  companyCode: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phoneNumber: string | null;
  email: string | null;
  licenseNumber: string | null;
}

export interface Party extends Audited {
  uuid: string;
  name: string;
  code: string;
  mobileNumber: string;
  nid: string | null;
  tin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** False: never sent an SMS, whatever an order says. */
  smsEnabled: boolean;
}

export interface Product extends Audited {
  uuid: string;
  productName: string;
  productCode: string;
  productSalesPrice: number;
  productPurchasePrice: number;
  uom: Uom;
  /** What a box holds, for a BOX product. */
  secondaryUom: Uom | null;
  /** How much of the base unit one box holds. */
  unitPerBox: number | null;
  lowStockThreshold: number | null;
  currentStock: number;
}

export interface ProductDropdownItem extends DropdownItem {
  uom: Uom;
  secondaryUom: Uom | null;
  unitPerBox: number | null;
  salesPrice: number;
  purchasePrice: number;
  currentStock: number;
}

// ---------------------------------------------------------------- stock
export interface StockBalance {
  productUuid: string;
  productCode: string;
  productName: string;
  uom: Uom;
  secondaryUom: Uom | null;
  unitPerBox: number | null;
  currentStockBalance: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
  updatedDate: string;
}

export interface StockLedgerEntry {
  uuid: string;
  productUuid: string;
  productCode: string;
  productName: string;
  movementType: MovementType;
  quantityChange: number;
  balanceAfter: number;
  referenceType: 'PURCHASE_ORDER' | 'SALES_ORDER' | 'STOCK_ADJUSTMENT';
  referenceUuid: string;
  referenceNumber: string;
  createdDate: string;
  createdByUserName: string;
}

export interface StockAdjustment {
  uuid: string;
  adjustmentNumber: string;
  productUuid: string;
  productCode: string;
  productName: string;
  adjustmentType: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  note: string | null;
  adjustmentDate: string;
  createdDate: string;
  createdByUserName: string;
}

export interface StockShortage {
  productUuid: string;
  productCode: string;
  productName: string;
  available: number;
  required: number;
}

// ---------------------------------------------------------------- orders
export interface OrderListItem {
  uuid: string;
  transactionType: TransactionType;
  orderNumber: string;
  orderDate: string;
  companyUuid: string;
  companyName: string;
  partyUuid: string;
  partyName: string;
  partyCode: string;
  paymentType: PaymentType;
  postingStatus: PostingStatus;
  totalAmount: number;
  totalPaidAmount: number;
  dueAmount: number;
  createdDate: string;
  createdByUserName: string;
  revision: string;
}

export interface OrderLine {
  uuid: string;
  lineNumber: number;
  productUuid: string;
  productCode: string;
  productName: string;
  quantityType: QuantityType;
  boxQuantity: number | null;
  unitQuantity: number | null;
  unitPerBoxSnapshot: number | null;
  totalQuantity: number;
  /** The unit totalQuantity and perUnitPrice are in - pieces, kilos or litres. */
  baseUom: Uom;
  perUnitPrice: number;
  perBoxPrice: number | null;
  totalPrice: number;
}

export interface OrderPayment {
  uuid: string;
  paymentDate: string;
  paymentAmount: number;
  paymentMethod: PaymentMethod;
  paymentNote: string | null;
  createdDate: string;
  createdByUserName: string;
}

export interface OrderDetail extends Audited {
  uuid: string;
  transactionType: TransactionType;
  orderNumber: string;
  company: { uuid: string; companyName: string; companyCode: string };
  party: { uuid: string; name: string; code: string; mobileNumber: string; address: string | null; city: string | null };
  paymentType: PaymentType;
  postingStatus: PostingStatus;
  orderDate: string;
  notes: string | null;
  totalAmount: number;
  totalPaidAmount: number;
  dueAmount: number;
  finalizedDate: string | null;
  finalizedByUserName: string | null;
  voidedDate: string | null;
  voidedByUserName: string | null;
  voidReason: string | null;
  lines: OrderLine[];
  payments: OrderPayment[];
  /** The order asks for SMS on finalize and on each payment. */
  sendSms: boolean;
  /** Set when no SMS goes out even with sendSms on (business or party switched SMS off). */
  smsBlockedReason: string | null;
}

export interface OrderLineRequest {
  uuid: string | null;
  productUuid: string | null;
  quantityType: QuantityType | null;
  boxQuantity: number | null;
  unitQuantity: number | null;
  totalQuantity: number | null;
  perUnitPrice: number | null;
  perBoxPrice: number | null;
  totalPrice: number | null;
}

export interface OrderSaveRequest {
  companyUuid: string | null;
  partyUuid: string | null;
  paymentType: PaymentType | null;
  orderDate: string | null;
  notes: string | null;
  lines: OrderLineRequest[];
  revision: string | null;
  sendSms: boolean;
}

/** The business's own settings (ADMIN changes, MANAGER reads). */
export interface BusinessSettings {
  smsEnabled: boolean;
  smsOnNewOrders: boolean;
  smsSentThisMonth: number;
  smsPartsThisMonth: number;
  revision: string | null;
  updatedDate: string | null;
  updatedByUserName: string | null;
}

// ---------------------------------------------------------------- reports
export interface PartyReportRow {
  partyUuid: string;
  partyName: string;
  partyCode: string;
  mobileNumber: string;
  orderCount: number;
  totalAmount: number;
  totalPaid: number;
  due: number;
}

export interface PartyReport {
  rows: Paged<PartyReportRow>;
  totals: { orderCount: number; totalAmount: number; totalPaid: number; due: number };
}

export interface CompanyReportRow {
  companyUuid: string;
  companyName: string;
  companyCode: string;
  salesCount: number;
  salesTotal: number;
  salesPaid: number;
  salesDue: number;
  purchaseCount: number | null;
  purchaseTotal: number | null;
  purchasePaid: number | null;
  purchaseDue: number | null;
}

export interface LinkedSummary {
  partyUuid: string;
  partyName: string;
  orderCount: number;
  totalAmount: number;
  totalPaid: number;
  due: number;
}

export interface Dashboard {
  role: Role;
  todaySales: number | null;
  monthSales: number | null;
  monthPurchases: number | null;
  customerDue: number | null;
  supplierDue: number | null;
  draftSalesOrders: number | null;
  draftPurchaseOrders: number | null;
  lowStock: { productUuid: string; productCode: string; productName: string; currentStock: number; threshold: number }[];
  latestSales: OrderListItem[];
  latestPurchases: OrderListItem[];
  asBuyer: LinkedSummary | null;
  asSupplier: LinkedSummary | null;
  salesLast30Days: { date: string; total: number }[];
}

// ---------------------------------------------------------------- users / sms
export interface AppUser {
  uuid: string;
  userName: string;
  email: string;
  phoneNumber: string;
  role: Role;
  supplierUuid: string | null;
  supplierName: string | null;
  supplierCode: string | null;
  customerUuid: string | null;
  customerName: string | null;
  customerCode: string | null;
  status: RecordStatus;
  lastLoginDate: string | null;
  isLocked: boolean;
  revision: string;
  createdDate: string;
  createdByUserName: string;
}

export interface SmsLog {
  uuid: string;
  recipientNumber: string;
  message: string;
  referenceType: string;
  referenceUuid: string;
  status: SmsStatus;
  attemptCount: number;
  nextAttemptDate: string | null;
  lastError: string | null;
  createdDate: string;
  sentDate: string | null;
}

// ---------------------------------------------------------------- platform (super admin)
/** Counts only: the super admin never sees a business's customers, prices, sales or payments. */
export interface BusinessUsage {
  activeUsers: number;
  companies: number;
  salesOrders: number;
  purchaseOrders: number;
  ordersThisMonth: number;
  lastOrderDate: string | null;
  lastSignInDate: string | null;
  /** Sent SMS (and the operator's SMS parts) this month and last month, Bangladesh time. */
  smsThisMonth: number;
  smsPartsThisMonth: number;
  smsLastMonth: number;
  smsPartsLastMonth: number;
}

export interface BusinessListItem {
  uuid: string;
  code: string;
  name: string;
  status: BusinessStatus;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  usage: BusinessUsage;
  createdDate: string;
  revision: string;
  /** Taka charged per SMS part; null when not charged. */
  smsPrice: number | null;
  subscription: BusinessSubscription | null;
}

export interface BusinessAdmin {
  uuid: string;
  userName: string;
  email: string;
  phoneNumber: string;
  lastLoginDate: string | null;
  isLocked: boolean;
  mustChangePassword: boolean;
}

export interface BusinessDetail {
  uuid: string;
  code: string;
  name: string;
  status: BusinessStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  suspendedDate: string | null;
  suspendReason: string | null;
  /** When its last admin closed it. */
  closedDate?: string | null;
  usage: BusinessUsage;
  admins: BusinessAdmin[];
  revision: string;
  createdDate: string;
  createdByUserName: string;
  updatedDate: string;
  updatedByUserName: string;
  smsPrice: number | null;
  /** The business's own SMS switch in its Settings. */
  smsEnabledByBusiness: boolean;
  subscription: BusinessSubscription | null;
}

/** One month of a business's sent SMS; month is "yyyy-MM". amount is null when the business has no SMS price. */
export interface SmsMonth {
  month: string;
  messages: number;
  parts: number;
  amount: number | null;
}

export interface BusinessSmsUsage {
  smsPrice: number | null;
  months: SmsMonth[];
}

/** A temporary password, shown once. */
export interface IssuedCredentials {
  userUuid: string;
  userName: string;
  email: string;
  temporaryPassword: string;
}

export interface CreatedBusiness {
  business: BusinessDetail;
  admin: IssuedCredentials;
}

export interface PlatformSummary {
  businesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  activeUsers: number;
  ordersThisMonth: number;
  smsThisMonth: number;
  smsPartsThisMonth: number;
  /** SMS parts this month times each business's SMS price. */
  smsAmountThisMonth: number;
}

// ---------------------------------------------------------------- subscriptions & billing
export type SubscriptionState = 'NOT_BILLED' | 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED';
export type BillingPaymentStatus = 'INITIATED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type BillingProvider = 'BKASH' | 'MANUAL';

/** A business's subscription now. showReminder: the banner should be visible. frozen: only paying works. */
export interface SubscriptionStatus {
  state: SubscriptionState;
  endsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  onTrial: boolean;
  planName: string | null;
  sizeName: string | null;
  showReminder: boolean;
  frozen: boolean;
}

export interface SizeOption {
  uuid: string;
  name: string;
  description: string | null;
}

/** A package the business can buy, priced for its size. */
export interface PlanOption {
  uuid: string;
  name: string;
  description: string | null;
  durationMonths: number;
  price: number;
  perMonth: number;
}

export interface BillingOverview {
  status: SubscriptionStatus;
  sizeUuid: string | null;
  sizeName: string | null;
  plans: PlanOption[];
  billingEnabled: boolean;
  canPayOnline: boolean;
  /** The signed-in person may pay (admins). */
  canPay: boolean;
  supportPhone: string | null;
  supportEmail: string | null;
  graceDays: number;
  businessCode: string;
  /** Sizes to choose from - only when the business has none yet. */
  sizes: SizeOption[];
}

export interface BillingPayment {
  uuid: string;
  businessUuid: string;
  businessName: string | null;
  invoiceNumber: string;
  planName: string;
  sizeName: string | null;
  durationMonths: number;
  amount: number;
  provider: BillingProvider;
  status: BillingPaymentStatus;
  trxId: string | null;
  payerAccount: string | null;
  statusMessage: string | null;
  note: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdDate: string;
  completedDate: string | null;
  createdByUserName: string;
}

export interface PlanPrice {
  sizeUuid: string;
  price: number;
}

/** A package as shown on the sign-up page: its price per size. */
export interface PlanOffer {
  uuid: string;
  name: string;
  description: string | null;
  durationMonths: number;
  prices: PlanPrice[];
}

export interface SignupOptions {
  businessSignup: boolean;
  billingEnabled: boolean;
  trialDays: number;
  sizes: SizeOption[] | null;
  plans: PlanOffer[] | null;
}

// ---- super admin
export interface BillingSettings {
  billingEnabled: boolean;
  trialDays: number;
  graceDays: number;
  reminderDays: number;
  supportPhone: string | null;
  supportEmail: string | null;
  bkashEnabled: boolean;
  bkashSandbox: boolean;
  bkashAppKey: string | null;
  hasBkashAppSecret: boolean;
  bkashUsername: string | null;
  hasBkashPassword: boolean;
  bkashReady: boolean;
  updatedDate: string;
  updatedByUserName: string;
}

export interface SizeAdmin {
  uuid: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  businesses: number;
  revision: string;
}

export interface PlanAdmin {
  uuid: string;
  name: string;
  description: string | null;
  durationMonths: number;
  sortOrder: number;
  isActive: boolean;
  prices: PlanPrice[];
  revision: string;
}

export interface BusinessSubscription {
  status: SubscriptionStatus;
  sizeUuid: string | null;
  sizeName: string | null;
  planUuid: string | null;
  planName: string | null;
  billingExempt: boolean;
}

// ---------------------------------------------------------------- posts from the super admin
/** Where a post appears: ALL (website and Android app), WEB (website only), APP (Android app only). */
export type PostChannel = 'ALL' | 'WEB' | 'APP';

/** A post as a business reads it. */
export interface PostItem {
  uuid: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedDate: string;
  /** Published after the person last opened the Announcements page. */
  unread: boolean;
}

export interface PostBusiness {
  uuid: string;
  name: string;
  code: string;
}

/** A post as the super admin manages it. */
export interface PlatformPost {
  uuid: string;
  title: string;
  body: string;
  showOn: PostChannel;
  allBusinesses: boolean;
  businesses: PostBusiness[];
  adminsOnly: boolean;
  isPinned: boolean;
  isPublished: boolean;
  publishedDate: string | null;
  updatedDate: string;
  updatedByUserName: string;
  revision: string;
}

// ---------------------------------------------------------------- Android app versions
/** MINOR: the app offers the update. MAJOR: the app cannot be used until it is updated. */
export type AppUpdateType = 'MINOR' | 'MAJOR';
export type AppUpdateAdvice = 'UP_TO_DATE' | 'OPTIONAL' | 'REQUIRED';

export interface AppRelease {
  uuid: string;
  versionName: string;
  updateType: AppUpdateType;
  releaseNotes: string | null;
  isPublished: boolean;
  createdDate: string;
  updatedDate: string;
  updatedByUserName: string;
  revision: string;
}

/** What the installed app learns on start-up. notes: every newer version, newest first. */
export interface AppVersionCheck {
  advice: AppUpdateAdvice;
  latestVersion: string | null;
  notes: { version: string; updateType: AppUpdateType; releaseNotes: string | null }[];
}
