import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";
import type { Expense } from "./expenses";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type RecurringStatus = "Active" | "Stopped";

export interface RecurringExpense {
  _id: string;
  organizationId: string;
  profileName: string;
  frequency: RecurringFrequency;
  repeatEvery: number;
  startDate: string;
  neverExpires: boolean;
  endsOn?: string | null;
  expenseAccountId?: string | { _id: string; name: string } | null;
  amount: number;
  currency: string;
  paidThroughAccountId?: string | { _id: string; name: string } | null;
  vendorId?: string | { _id: string; displayName: string; companyName?: string } | null;
  customerId?: string | { _id: string; displayName: string; companyName?: string } | null;
  isBillable: boolean;
  projectId?: string | null;
  notes?: string;
  status: RecurringStatus;
  lastExpenseDate?: string | null;
  nextExpenseDate?: string | null;
  generatedExpenseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringExpenseInput {
  profileName: string;
  frequency: RecurringFrequency;
  repeatEvery?: number;
  startDate: string;
  neverExpires?: boolean;
  endsOn?: string | null;
  expenseAccountId?: string | null;
  amount: number;
  currency?: string;
  paidThroughAccountId?: string | null;
  vendorId?: string | null;
  customerId?: string | null;
  isBillable?: boolean;
  projectId?: string | null;
  notes?: string;
}

export type UpdateRecurringExpenseInput = Partial<CreateRecurringExpenseInput>;

export interface RecurringExpenseListParams extends ListParams {
  status?: RecurringStatus;
  search?: string;
  vendorId?: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const recurringExpenseApi = {
  list: (params?: RecurringExpenseListParams) =>
    apiFetch<PaginatedResponse<RecurringExpense>>(`/recurring-expenses${buildQuery(params || {})}`),

  getById: (id: string) =>
    apiFetch<{ data: RecurringExpense }>(`/recurring-expenses/${id}`),

  getExpenses: (id: string) =>
    apiFetch<{ data: Expense[] }>(`/recurring-expenses/${id}/expenses`),

  create: (data: CreateRecurringExpenseInput) =>
    apiFetch<{ data: RecurringExpense }>("/recurring-expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateRecurringExpenseInput) =>
    apiFetch<{ data: RecurringExpense }>(`/recurring-expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  stop: (id: string) =>
    apiFetch<{ data: RecurringExpense }>(`/recurring-expenses/${id}/stop`, { method: "POST" }),

  resume: (id: string) =>
    apiFetch<{ data: RecurringExpense }>(`/recurring-expenses/${id}/resume`, { method: "POST" }),

  createExpenseNow: (id: string) =>
    apiFetch<{ data: Expense }>(`/recurring-expenses/${id}/create-expense`, { method: "POST" }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/recurring-expenses/${id}`, { method: "DELETE" }),
};
