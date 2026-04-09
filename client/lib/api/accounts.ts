import { apiFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type AccountRootType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export type AssetAccountType =
  | "Other Asset" | "Other Current Asset" | "Cash" | "Bank"
  | "Fixed Asset" | "Accounts Receivable" | "Stock"
  | "Payment Clearing Account" | "Intangible Asset"
  | "Non Current Asset" | "Deferred Tax Asset";

export type LiabilityAccountType =
  | "Other Current Liability" | "Credit Card" | "Non Current Liability"
  | "Other Liability" | "Accounts Payable" | "Overseas Tax Payable"
  | "Deferred Tax Liability";

export type EquityAccountType = "Equity";
export type IncomeAccountType = "Income" | "Other Income";
export type ExpenseAccountType = "Expense" | "Cost Of Goods Sold" | "Other Expense";

export type AccountType =
  | AssetAccountType | LiabilityAccountType | EquityAccountType
  | IncomeAccountType | ExpenseAccountType;

/** Accounts grouped by accountType — returned by /for-item */
export type GroupedAccounts = Record<string, Account[]>;

export interface Account {
  _id: string;
  organizationId: string;
  name: string;
  code?: string;
  accountNumber?: string;
  ifsc?: string;
  rootType: AccountRootType;
  accountType: AccountType;
  parentId?: string | null;
  description?: string;
  isGroup: boolean;
  isSystemAccount: boolean;
  isActive: boolean;
  openingBalance: number;
  balance: number;
  currency?: string;
  createdAt: string;
  updatedAt: string;
  children?: Account[];
}

export interface OpeningBalanceAccountRow {
  accountId: string;
  name: string;
  rootType: AccountRootType;
  accountType: AccountType;
  availableAmount: number;
  availableSide: "Debit" | "Credit" | null;
  debit: number;
  credit: number;
}

export interface OpeningBalanceGroup {
  rootType: AccountRootType;
  accounts: OpeningBalanceAccountRow[];
}

export interface OpeningBalanceSummary {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  differenceSide: "Debit" | "Credit" | null;
}

export interface OpeningBalanceData {
  migrationDate: string | null;
  isConfigured: boolean;
  groups: OpeningBalanceGroup[];
  totals: OpeningBalanceSummary;
}

export interface SaveOpeningBalanceInput {
  migrationDate?: string;
  entries: Array<{
    accountId: string;
    debit?: number;
    credit?: number;
  }>;
}

export interface CreateAccountInput {
  name: string;
  code?: string;
  accountNumber?: string;
  ifsc?: string;
  rootType: AccountRootType;
  accountType: AccountType;
  parentId?: string;
  description?: string;
  isGroup?: boolean;
  currency?: string;
}

export type UpdateAccountInput = Partial<CreateAccountInput> & { isActive?: boolean; accountType?: AccountType; rootType?: AccountRootType };

// ─── API ────────────────────────────────────────────────────────────────

export const accountApi = {
  /** Flat list, supports ?rootType=Income,Expense&excludeGroups=true */
  list: (params?: { rootType?: string; accountType?: string; excludeGroups?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.rootType) qs.set("rootType", params.rootType);
    if (params?.accountType) qs.set("accountType", params.accountType);
    if (params?.excludeGroups) qs.set("excludeGroups", "true");
    const q = qs.toString();
    return apiFetch<{ data: Account[] }>(`/accounts${q ? `?${q}` : ""}`);
  },

  /**
   * Returns accounts grouped by accountType for item form dropdowns.
   * section = "sales" → Income accounts
   * section = "purchase" → Expense accounts
   */
  listForItem: (section: "sales" | "purchase") =>
    apiFetch<{ data: GroupedAccounts }>(`/accounts/for-item?section=${section}`),

  getOpeningBalances: () =>
    apiFetch<{ data: OpeningBalanceData }>("/accounts/opening-balances"),

  saveOpeningBalances: (data: SaveOpeningBalanceInput) =>
    apiFetch<{
      data: {
        totals: OpeningBalanceSummary;
        adjustment: {
          amount: number;
          side: "Debit" | "Credit" | null;
          accountId: string | null;
        };
        finalTotals: { totalDebit: number; totalCredit: number };
        migrationDate: string | null;
      };
    }>("/accounts/opening-balances", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

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

  seedTemplate: () =>
    apiFetch<{ message: string }>("/accounts/seed-template", {
      method: "POST",
    }),
};
