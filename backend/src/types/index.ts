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
  name: string;
  industry: string;
  baseCurrency: string;
  fiscalYearStart: FiscalYearMonth; // 1 = Jan, 4 = Apr, etc.
  country: string;
  timezone: string;
  dateFormat: string;            // e.g. "DD/MM/YYYY"
  numberFormat: string;          // e.g. "1,234,567.89"
  language: string;              // ISO 639-1 code e.g. "en"
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
