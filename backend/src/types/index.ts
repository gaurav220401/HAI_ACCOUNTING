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
  activeCompany?: Types.ObjectId | null;
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
  activeCompany: Types.ObjectId | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Company ────────────────────────────────────────────────────────────
export interface ICompany extends Document {
  _id: Types.ObjectId;
  name: string;
  abbr: string;
  defaultCurrency: string;
  country: string;
  chartOfAccounts: string;
  domain: string;
  fiscalYearStart: Date;
  fiscalYearEnd: Date;
  defaultAccounts: {
    defaultBankAccount?: Types.ObjectId;
    defaultCashAccount?: Types.ObjectId;
    defaultReceivableAccount?: Types.ObjectId;
    defaultPayableAccount?: Types.ObjectId;
    defaultIncomeAccount?: Types.ObjectId;
    defaultExpenseAccount?: Types.ObjectId;
    roundOffAccount?: Types.ObjectId;
    writeOffAccount?: Types.ObjectId;
    exchangeGainLossAccount?: Types.ObjectId;
    costOfGoodsSoldAccount?: Types.ObjectId;
    stockReceivedNotBilledAccount?: Types.ObjectId;
    stockInHandAccount?: Types.ObjectId;
    retainedEarningsAccount?: Types.ObjectId;
    depreciationExpenseAccount?: Types.ObjectId;
    accumulatedDepreciationAccount?: Types.ObjectId;
  };
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Role & Permission ─────────────────────────────────────────────────
export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  isSystemRole: boolean;
  permissions: IRolePermission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IRolePermission {
  doctype: string;
  read: boolean;
  write: boolean;
  create: boolean;
  delete: boolean;
  submit: boolean;
  cancel: boolean;
  amend: boolean;
}

// ─── Document Status (for transactional documents) ─────────────────────
export enum DocStatus {
  Draft = 0,
  Submitted = 1,
  Cancelled = 2,
}

// ─── Naming Series ─────────────────────────────────────────────────────
export interface INamingSeries extends Document {
  _id: Types.ObjectId;
  doctype: string;
  prefix: string;
  currentValue: number;
  company: Types.ObjectId;
}

// ─── Express Request Extension ─────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  firebaseUser?: FirebaseDecodedToken;
  user?: IUser | null;
  company?: ICompany | null;
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
