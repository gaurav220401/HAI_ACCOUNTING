import { apiFetch, apiFetchBlob } from "./client";

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") qs.set(key, String(val));
  }
  const q = qs.toString();
  return q ? `?${q}` : "";
}

// ─── Types ──────────────────────────────────────────────────────────────

export type AccountRootType = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export type AssetAccountType =
  | "Other Asset" | "Other Current Asset" | "Cash" | "Bank"
  | "Fixed Asset" | "Accounts Receivable" | "Stock"
  | "Payment Clearing Account" | "Intangible Asset"
  | "Non Current Asset" | "Deferred Tax Asset" | "Contra Asset";

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
  createItemAsFixedAsset?: boolean;
  fixedAssetTypeId?: string | null;
  createdAt: string;
  updatedAt: string;
  children?: Account[];
}

export interface AccountDetailsTransaction {
  id: string;
  postingDate: string;
  voucherType: string;
  voucherId: string;
  voucherNo: string;
  description: string;
  contactType: "Customer" | "Vendor" | "None" | string;
  contactName: string | null;
  currency: string;
  exchangeRate: number;
  debitBCY: number;
  creditBCY: number;
  amountBCY: number;
  debitFCY: number;
  creditFCY: number;
  amountFCY: number;
  isReversal: boolean;
  createdAt: string;
}

export interface AccountDetailsAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  url: string;
  uploadedAt: string | null;
  processingStatus: string;
}

export interface AccountDetailsData {
  account: Account;
  summary: {
    openingBalanceBCY: number;
    totalDebitBCY: number;
    totalCreditBCY: number;
    movementBCY: number;
    closingBalanceBCY: number;
    closingBalanceSide: "Debit" | "Credit" | "Zero";
    transactionCount: number;
    currencies: string[];
    firstPostingDate: string | null;
    lastPostingDate: string | null;
  };
  vouchersByType: Record<string, number>;
  linkage: {
    glEntries: number;
    bills: number;
    invoices: number;
    expenses: number;
    purchaseOrders: number;
    recurringBills: number;
    recurringInvoices: number;
    recurringExpenses: number;
    vendorCredits: number;
    journals: number;
    paymentMade: number;
    paymentReceived: number;
    contacts: number;
    items: number;
    paymentModes: number;
    expenseCategories: number;
    currencyAdjustments: number;
    tdsTaxes: number;
    tcsTaxes: number;
    documents: number;
  };
  attachments: AccountDetailsAttachment[];
  transactions: AccountDetailsTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  filters: {
    from: string | null;
    to: string | null;
  };
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
  createItemAsFixedAsset?: boolean;
  fixedAssetTypeId?: string;
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

  getDetails: (id: string, params?: { page?: number; limit?: number; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const q = qs.toString();
    return apiFetch<{ data: AccountDetailsData }>(`/accounts/${id}/details${q ? `?${q}` : ""}`);
  },

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

  downloadSampleTemplate: (format?: "csv" | "excel") => {
    const params: Record<string, string> = {};
    if (format) params.format = format;
    return apiFetchBlob(`/accounts/import/template/sample${buildQuery(params)}`);
  },

  downloadBlankTemplate: (format?: "csv" | "excel") => {
    const params: Record<string, string> = {};
    if (format) params.format = format;
    return apiFetchBlob(`/accounts/import/template/blank${buildQuery(params)}`);
  },

  previewImport: (formData: FormData) =>
    apiFetch<{
      data: {
        totalRows: number;
        readyCount: number;
        overwriteCount: number;
        skipCount: number;
        invalidCount: number;
        previewItems: any[];
      };
    }>("/accounts/import/preview", {
      method: "POST",
      body: formData,
    }),

  executeImport: (formData: FormData) =>
    apiFetch<{
      data: {
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; error: string }>;
      };
    }>("/accounts/import", {
      method: "POST",
      body: formData,
    }),
};
