export { apiFetch, ApiError, buildQuery } from "./client";
export type { PaginatedResponse, ListParams } from "./client";

export { authApi } from "./auth";
export type { UserProfile, AuthResponse } from "./auth";

export { organizationApi } from "./organizations";
export type {
  Organization,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "./organizations";

export { accountApi } from "./accounts";
export type {
  Account,
  AccountRootType,
  AccountType,
  CreateAccountInput,
  UpdateAccountInput,
} from "./accounts";

export { contactApi } from "./contacts";
export type {
  Contact,
  ContactType,
  TaxTreatment,
  ContactPerson,
  BankDetail,
  Address,
  CreateContactInput,
  UpdateContactInput,
  ContactListParams,
} from "./contacts";

export { itemApi } from "./items";
export type {
  Item,
  ItemType,
  ItemGroup,
  UnitOfMeasurement,
  CreateItemInput,
  UpdateItemInput,
} from "./items";

export { currencyApi } from "./currencies";
export type { Currency, ExchangeRate } from "./currencies";

export { settingsApi } from "./settings";
export type {
  Tax,
  TaxType,
  PaymentTerms,
  Warehouse,
  SalesPerson,
  PaymentMode,
  ExpenseCategory,
  ReportingTag,
  PriceList,
} from "./settings";

export { invoiceApi } from "./invoices";
export type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  InvoiceListParams,
  SendInvoiceEmailInput,
  JournalEntry,
  DiscountType,
  InvoiceTaxType,
} from "./invoices";
