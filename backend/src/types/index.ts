import { Request } from "express";
import { Document, Types } from "mongoose";

// ─── Firebase Decoded Token ────────────────────────────────────────────
export interface FirebaseDecodedToken {
  uid: string;
  email?: string;
  phone_number?: string;
  picture?: string;
  name?: string;
  firebase?: {
    sign_in_provider?: string;
  };
  [key: string]: unknown;
}

// ─── User ──────────────────────────────────────────────────────────────
export type Gender = "male" | "female" | "other" | "";
export type AuthProvider = "email" | "phone" | "google";

export interface IUser extends Document {
  _id: Types.ObjectId;
  firebaseUid: string;
  name: string;
  email?: string;
  phone?: string;
  dob?: Date | null;
  gender: Gender;
  photoURL: string;
  provider: AuthProvider;
  profileComplete: boolean;
  roles: string[];
  activeOrganization?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserResponse {
  id: Types.ObjectId;
  firebaseUid: string;
  name: string;
  email: string | null;
  phone: string | null;
  dob: Date | null | undefined;
  gender: Gender;
  photoURL: string;
  provider: AuthProvider;
  profileComplete: boolean;
  roles: string[];
  activeOrganization: Types.ObjectId | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Organization (replaces Company) ───────────────────────────────────
export type FiscalYearMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  owner?: Types.ObjectId | null;
  members: Types.ObjectId[];
  name: string;
  industry: string;
  baseCurrency: string;
  fiscalYearStart: FiscalYearMonth; // 1 = Jan, 4 = Apr, etc.
  country: string;
  timezone: string;
  dateFormat: string; // e.g. "DD/MM/YYYY"
  numberFormat: string; // e.g. "1,234,567.89"
  language: string; // ISO 639-1 code e.g. "en"
  taxId?: string;
  logo?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  portalSettings?: {
    enabled: boolean;
    subdomain?: string;
  };
  defaultAccounts?: {
    bankAccount?: Types.ObjectId;
    cashAccount?: Types.ObjectId;
    receivableAccount?: Types.ObjectId;
    payableAccount?: Types.ObjectId;
    incomeAccount?: Types.ObjectId;
    expenseAccount?: Types.ObjectId;
    roundOffAccount?: Types.ObjectId;
    exchangeGainLossAccount?: Types.ObjectId;
    retainedEarningsAccount?: Types.ObjectId;
  };
  smtpSettings?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
  };
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Role & Permission (Zoho Books module-based) ───────────────────────
export type ZohoModule =
  | "dashboard"
  | "contacts"
  | "items"
  | "invoices"
  | "bills"
  | "estimates"
  | "purchase_orders"
  | "sales_orders"
  | "credit_notes"
  | "vendor_credits"
  | "expenses"
  | "timesheet"
  | "projects"
  | "banking"
  | "accounts"
  | "journals"
  | "reports"
  | "tax"
  | "settings"
  | "users"
  | "payroll"
  | "inventory"
  | "documents";

export interface IRolePermission {
  module: ZohoModule;
  read: boolean;
  write: boolean;
  create: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
}

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  isSystemRole: boolean;
  organizationId?: Types.ObjectId | null; // null = global system role
  permissions: IRolePermission[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Naming Series ─────────────────────────────────────────────────────
export interface INamingSeries extends Document {
  _id: Types.ObjectId;
  doctype: string;
  prefix: string;
  currentValue: number;
  organizationId: Types.ObjectId;
}

// ─── Express Request Extension ─────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  firebaseUser?: FirebaseDecodedToken;
  user?: IUser | null;
  organization?: IOrganization | null;
}

// ─── Pagination ────────────────────────────────────────────────────────
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// ─── API Response ──────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  code?: string;
}

// ─── Service Result ────────────────────────────────────────────────────
export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  PHASE 1 — MASTER DATA TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── 1.2 Chart of Accounts ────────────────────────────────────────────
export type AccountRootType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

/** Asset sub-types */
export type AssetAccountType =
  | "Other Asset" | "Other Current Asset" | "Cash" | "Bank"
  | "Fixed Asset" | "Accounts Receivable" | "Stock"
  | "Payment Clearing Account" | "Intangible Asset"
  | "Non Current Asset" | "Deferred Tax Asset";

/** Liability sub-types */
export type LiabilityAccountType =
  | "Other Current Liability" | "Credit Card" | "Non Current Liability"
  | "Other Liability" | "Accounts Payable" | "Overseas Tax Payable"
  | "Deferred Tax Liability";

/** Equity sub-types */
export type EquityAccountType = "Equity";

/** Income sub-types */
export type IncomeAccountType = "Income" | "Other Income";

/** Expense sub-types */
export type ExpenseAccountType = "Expense" | "Cost Of Goods Sold" | "Other Expense";

export type AccountType =
  | AssetAccountType
  | LiabilityAccountType
  | EquityAccountType
  | IncomeAccountType
  | ExpenseAccountType;

export interface IAccount extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  code?: string;
  parentId?: Types.ObjectId | null;
  rootType: AccountRootType;
  accountType: AccountType;
  isGroup: boolean;
  currency?: string;
  description?: string;
  isSystemAccount: boolean; // system accounts cannot be deleted
  balance: number; // denormalized, updated on GL posting
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.3 Contacts ─────────────────────────────────────────────────────
export type ContactType = "Customer" | "Vendor" | "Both";
export type TaxTreatment =
  | "Taxable"
  | "TaxExempt"
  | "ReverseCharge"
  | "SEZ"
  | "Overseas"
  | "Composition"
  | "UIN";

export interface IComment {
  _id: Types.ObjectId;
  text: string;
  userId?: Types.ObjectId | null;
  userName?: string;
  createdAt: Date;
}

export interface IContactPerson {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  name: string;        // kept for backward compat; derived from firstName + lastName
  email?: string;
  workPhone?: string;
  mobile?: string;
  phone?: string;      // kept for backward compat
  designation?: string;
  isPrimary: boolean;
}

export interface IBankDetail {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  branchName?: string;
  upiId?: string;
  isPrimary?: boolean;
}

export interface IContact extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  contactType: ContactType;
  // Primary contact fields
  salutation?: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  companyName?: string;
  email?: string;
  phone?: string;      // work phone
  mobile?: string;
  currency: string;
  language?: string;
  // Financial
  paymentTermsId?: Types.ObjectId | null;
  accountsPayableId?: Types.ObjectId | null;   // Accounts Payable account
  openingBalance?: number;
  taxTreatment: TaxTreatment;
  taxId?: string; // GSTIN / VAT / PAN
  gstin?: string;      // GSTIN (primary GST number)
  pan?: string;        // PAN number
  tdsCategory?: string;
  msmeRegistered?: boolean;
  // Extra / social details
  websiteUrl?: string;
  department?: string;
  designation?: string;
  twitterHandle?: string;
  skypeName?: string;
  facebookUrl?: string;
  // Attached documents
  documents?: { name: string; url: string; publicId: string; size?: number; mimeType?: string }[];
  // Address
  billingAddress?: {
    attention?: string;
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  shippingAddress?: {
    attention?: string;
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    phone?: string;
    fax?: string;
  };
  contactPersons: IContactPerson[];
  bankDetails: IBankDetail[];
  notes?: string;
  comments: IComment[];
  portalEnabled: boolean;
  reportingTags: Types.ObjectId[];
  // Customer-specific
  creditLimit?: number;
  salesPersonId?: Types.ObjectId | null;
  // Calculated
  outstandingPayable: number;
  outstandingReceivable: number;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.4 Items & Services ──────────────────────────────────────────────
export type ItemType = "Goods" | "Service";
export type TaxPreference = "Taxable" | "NonTaxable" | "Exempt";

export interface IItem extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  itemType: ItemType;
  name: string;
  sku?: string;
  unit?: Types.ObjectId | null; // ref: UOM
  itemGroupId?: Types.ObjectId | null; // ref: ItemGroup
  description?: string;
  sellingPrice: number;
  sellingDescription?: string;
  costPrice: number;
  purchaseDescription?: string;
  taxPreference: TaxPreference;
  taxId?: Types.ObjectId | null; // ref: Tax
  hsnSacCode?: string;
  salesAccountId?: Types.ObjectId | null;
  purchaseAccountId?: Types.ObjectId | null;
  inventoryTracked: boolean;
  stockOnHand: number;
  reorderPoint?: number;
  preferredVendorId?: Types.ObjectId | null;
  warehouseId?: Types.ObjectId | null;
  image?: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IItemGroup extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  parentId?: Types.ObjectId | null;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUnitOfMeasurement extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string; // e.g. "Kilogram"
  abbreviation: string; // e.g. "kg"
  isSystemUnit: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.5 Price Lists ──────────────────────────────────────────────────
export type PriceListType = "Sales" | "Purchase" | "Both";

export interface IPriceListItem {
  itemId: Types.ObjectId;
  customPrice: number;
  discount?: number;
}

export interface IPriceList extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  priceListType: PriceListType;
  currency: string;
  items: IPriceListItem[];
  effectiveFrom?: Date;
  effectiveTo?: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.6 Currency & Exchange Rates ────────────────────────────────────
export interface ICurrency extends Document {
  _id: Types.ObjectId;
  code: string; // ISO 4217: "INR", "USD"
  name: string; // "Indian Rupee"
  symbol: string; // "₹"
  decimalPlaces: number;
  isEnabled: boolean;
}

export interface IExchangeRate extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  fromCurrency: string;
  toCurrency: string;
  date: Date;
  rate: number;
  source: "Manual" | "Auto";
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.7 Tax ──────────────────────────────────────────────────────────
export type TaxType = "Tax" | "TaxGroup" | "CompoundTax";

export interface ITaxComponent {
  taxId: Types.ObjectId; // ref to a simple Tax
  rate: number;
}

export interface ITax extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  taxType: TaxType;
  rate: number; // percentage, 0 for groups
  taxAuthority?: string;
  components: ITaxComponent[]; // populated for TaxGroup
  isCompound: boolean;
  isSystemTax: boolean;
  description?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.8 Payment Terms ────────────────────────────────────────────────
export interface IPaymentTerms extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;          // "Net 30", "Due on Receipt"
  termType: "net_days" | "end_of_month" | "end_of_next_month";
  netDays: number;       // 0 = due on receipt; ignored for end_of_month types
  discountPercentage: number;
  discountDays: number;
  isDefault: boolean;
  isSystemTerm: boolean;
  isPermanent: boolean;  // true = cannot be deleted or renamed
  createdAt: Date;
  updatedAt: Date;
}

// ─── 1.9 Other Master Data ────────────────────────────────────────────
export interface IWarehouse extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  isPrimary: boolean;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISalesPerson extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  commissionRate: number; // percentage
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPaymentMode extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string; // "Cash", "Bank Transfer", "UPI", "Credit Card"
  accountId?: Types.ObjectId | null; // linked GL account
  isSystemMode: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpenseCategory extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  accountId?: Types.ObjectId | null; // linked GL expense account
  description?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReportingTag extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  description?: string;
  color?: string; // hex color for UI display
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════
//  PHASE 2 — TRANSACTION TYPES
// ═══════════════════════════════════════════════════════════════════════

// ─── 2.1 Quote (Estimate) ──────────────────────────────────────────────
export type QuoteStatus =
  | "Draft"
  | "Sent"
  | "Accepted"
  | "Rejected"
  | "Invoiced"
  | "Expired";
export type DiscountType = "percent" | "amount";
export type QuoteTaxType = "TDS" | "TCS" | "none";

export interface IQuoteItem {
  _id?: Types.ObjectId;
  itemId?: Types.ObjectId | null;
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxId?: Types.ObjectId | null;
  taxPercent: number;
  taxAmount: number;
  amount: number;
}

export interface IQuote extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  quoteNumber: string;
  referenceNumber?: string;
  customerId: Types.ObjectId;
  quoteDate: Date;
  expiryDate?: Date | null;
  salesPersonId?: Types.ObjectId | null;
  subject?: string;
  items: IQuoteItem[];
  subTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxType: QuoteTaxType;
  taxId?: Types.ObjectId | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  customerNotes: string;
  termsAndConditions: string;
  status: QuoteStatus;
  emailContacts: string[];
  attachments: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── 2.2 Invoice ───────────────────────────────────────────────────────
export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Overdue"
  | "Partially Paid"
  | "Paid"
  | "Void";

export type InvoiceTaxType = "TDS" | "TCS" | "none";

export interface IInvoiceItem {
  _id?: Types.ObjectId;
  itemId?: Types.ObjectId | null;
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxId?: Types.ObjectId | null;
  taxPercent: number;
  taxAmount: number;
  amount: number;
  accountId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
}

export interface IInvoiceJournalEntry {
  account: string;
  debit: number;
  credit: number;
}

export interface IInvoice extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  invoiceNumber: string;
  referenceNumber?: string;
  orderNumber?: string;
  customerId: Types.ObjectId;
  invoiceDate: Date;
  dueDate?: Date | null;
  paymentTermsId?: Types.ObjectId | null;
  salesPersonId?: Types.ObjectId | null;
  subject?: string;
  items: IInvoiceItem[];
  subTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxType: InvoiceTaxType;
  taxId?: Types.ObjectId | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  balanceDue: number;
  customerNotes: string;
  termsAndConditions: string;
  status: InvoiceStatus;
  emailContacts: string[];
  attachments: string[];
  paymentReceived: boolean;
  isRecurring: boolean;
  journalEntries?: IInvoiceJournalEntry[];
  pdfTemplateId?: Types.ObjectId | null;
  sentAt?: Date | null;
  paidAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
// ─── 2.3 Bills ───────────────────────────────────────────────────────
export type BillStatus =
  | "Draft"
  | "Open"
  | "Overdue"
  | "Partially Paid"
  | "Paid"
  | "Void";

export type BillTaxType = "TDS" | "TCS" | "none";

export interface IBillLineItem {
  _id?: Types.ObjectId;
  isHeader?: boolean;
  headerText?: string;
  itemId?: Types.ObjectId | null;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  amount: number;
  accountId?: Types.ObjectId | null; // Expense account
  customerId?: Types.ObjectId | null; // For billable expenses
}

export interface IBill extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  vendorId: Types.ObjectId;
  billNumber: string;
  referenceNumber?: string;
  orderNumber?: string;
  billDate: Date;
  dueDate?: Date | null;
  paymentTermsId?: Types.ObjectId | null;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  accountsPayableId?: Types.ObjectId | null; // Accounts Payable account (Liability)
  subject?: string;
  lineItems: IBillLineItem[];
  subTotal: number;
  discountLevel: "transaction" | "line_item";
  discountAccountId?: Types.ObjectId | null;
  discountPercent: number;
  discountAmount: number;
  taxType: BillTaxType;
  tdsId?: Types.ObjectId | null;
  tcsId?: Types.ObjectId | null;
  taxAmount: number;
  tcsAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  amountPaid: number;
  total: number;
  balanceDue: number;
  notes: string;
  termsAndConditions: string;
  status: BillStatus;
  attachments: string[];
  comments: {
    author: string;
    text: string;
    time: Date;
    isSystem: boolean;
  }[];
  recurringId?: Types.ObjectId | null;
  recurringRunDate?: Date | null;
  recurringRunSequence?: number | null;
  isDeleted: boolean;
  deletedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
