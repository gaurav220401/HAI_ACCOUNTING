import { apiFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type AccountRootType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";
export type AccountType =
  | "Bank" | "Cash" | "AccountReceivable" | "AccountPayable"
  | "Tax" | "FixedAsset" | "WIPAsset" | "StockAsset"
  | "ExpenseAccount" | "DirectExpense" | "IndirectExpense"
  | "IncomeAccount" | "DirectIncome" | "IndirectIncome"
  | "Equity" | "RoundingAdjustment";

export interface Account {
  _id: string;
  orgId: string;
  name: string;
  code?: string;
  rootType: AccountRootType;
  accountType?: AccountType;
  parentId?: string | Account;
  description?: string;
  isBankAccount: boolean;
  isGroup: boolean;
  isSystem: boolean;
  isActive: boolean;
  openingBalance: number;
  currency?: string;
  createdAt: string;
  updatedAt: string;
  children?: Account[];
}

export interface CreateAccountInput {
  name: string;
  code?: string;
  rootType: AccountRootType;
  accountType?: AccountType;
  parentId?: string;
  description?: string;
  isBankAccount?: boolean;
  isGroup?: boolean;
  openingBalance?: number;
  currency?: string;
}

export type UpdateAccountInput = Partial<CreateAccountInput>;

// ─── API ────────────────────────────────────────────────────────────────

export const accountApi = {
  list: (orgId: string) =>
    apiFetch<{ data: Account[] }>(`/accounts?orgId=${orgId}`),

  create: (data: CreateAccountInput) =>
    apiFetch<{ data: Account }>("/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateAccountInput) =>
    apiFetch<{ data: Account }>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/accounts/${id}`, { method: "DELETE" }),

  seedTemplate: (orgId: string) =>
    apiFetch<{ data: Account[]; message: string }>("/accounts/seed-template", {
      method: "POST",
      body: JSON.stringify({ orgId }),
    }),
};
