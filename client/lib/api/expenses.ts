import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ExpenseType = "Regular" | "Mileage";
export type ExpenseStatus = "Draft" | "Submitted" | "Approved" | "Rejected" | "Reimbursed";
export type MileageCalcMethod = "DistanceTravelled" | "OdometerReading";

export interface ExpenseLineItem {
  expenseAccountId?: string | null;
  amount: number;
  description?: string;
  taxId?: string | null;
  isBillable?: boolean;
  customerId?: string | null;
  projectId?: string | null;
  reportingTagIds?: string[];
}

export interface Expense {
  _id: string;
  expenseNumber: string;   // e.g. EXP-0001
  organizationId: string;
  expenseType: ExpenseType;
  expenseAccountId?: string | { _id: string; name: string } | null;
  isItemized: boolean;
  lineItems?: ExpenseLineItem[];
  amount: number;
  currency: string;
  mileageCalcMethod?: MileageCalcMethod;
  distance?: number;
  mileageUnit?: "Km" | "Mile";
  mileageRate?: number;
  date: string;
  paidThroughAccountId?: string | { _id: string; name: string } | null;
  vendorId?: string | { _id: string; displayName: string; companyName?: string } | null;
  customerId?: string | { _id: string; displayName: string; companyName?: string } | null;
  invoiceNumber?: string;
  notes?: string;
  isBillable: boolean;
  taxId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  receiptUrls?: string[];
  status: ExpenseStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  expenseType?: ExpenseType;
  date: string;
  amount: number;
  currency?: string;
  expenseAccountId?: string | null;
  isItemized?: boolean;
  lineItems?: ExpenseLineItem[];
  paidThroughAccountId?: string | null;
  vendorId?: string | null;
  customerId?: string | null;
  invoiceNumber?: string;
  notes?: string;
  isBillable?: boolean;
  taxId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  receiptUrls?: string[];
  status?: ExpenseStatus;
  // Mileage fields
  mileageCalcMethod?: MileageCalcMethod;
  distance?: number;
  mileageUnit?: "Km" | "Mile";
  mileageRate?: number;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ExpenseListParams extends ListParams {
  type?: ExpenseType;
  status?: ExpenseStatus;
  search?: string;
  vendorId?: string;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const expenseApi = {
  list: (params?: ExpenseListParams) =>
    apiFetch<PaginatedResponse<Expense>>(`/expenses${buildQuery(params || {})}`),

  /** Accepts both expenseNumber (EXP-0001) and MongoDB _id */
  getById: (idOrNumber: string) =>
    apiFetch<{ data: Expense }>(`/expenses/${idOrNumber}`),

  create: (data: CreateExpenseInput) =>
    apiFetch<{ data: Expense }>("/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  bulkCreate: (expenses: CreateExpenseInput[]) =>
    apiFetch<{ data: Expense[] }>("/expenses/bulk", {
      method: "POST",
      body: JSON.stringify({ expenses }),
    }),

  update: (id: string, data: UpdateExpenseInput) =>
    apiFetch<{ data: Expense }>(`/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/expenses/${id}`, { method: "DELETE" }),
};
