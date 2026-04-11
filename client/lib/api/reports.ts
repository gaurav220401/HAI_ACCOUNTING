import { apiFetch, buildQuery } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  rootType: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceResponse {
  asOf: string;
  rows: TrialBalanceRow[];
  totals: { totalDebit: number; totalCredit: number; difference: number };
}

export interface ProfitLossLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface ProfitLossResponse {
  from: string;
  to: string;
  income: ProfitLossLine[];
  expenses: ProfitLossLine[];
  totals: { totalIncome: number; totalExpense: number; netProfit: number };
}

export interface BalanceSheetLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface BalanceSheetResponse {
  asOf: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totals: { totalAssets: number; totalLiabilities: number; totalEquity: number; equationDifference: number };
}

export interface ControlReconciliationResponse {
  asOf: string;
  receivables: {
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    controlAccounts: Array<{ _id: string; name: string; code?: string }>;
  };
  payables: {
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    controlAccounts: Array<{ _id: string; name: string; code?: string }>;
  };
}

export interface GenericReportRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface GenericReportResponse {
  from?: string;
  to?: string;
  asOf?: string;
  rows?: GenericReportRow[];
  buckets?: Record<string, { rows: GenericReportRow[]; total: number }>;
  totals?: Record<string, number>;
  grandTotal?: number;
  count?: number;
}

// ─── Date helpers ───────────────────────────────────────────────────────

export function dateRangeFromPreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "today":
      return { from: fmt(now), to: fmt(now) };
    case "this-week": {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: fmt(start), to: fmt(now) };
    }
    case "this-month":
      return { from: fmt(new Date(y, m, 1)), to: fmt(now) };
    case "this-quarter": {
      const qm = Math.floor(m / 3) * 3;
      return { from: fmt(new Date(y, qm, 1)), to: fmt(now) };
    }
    case "this-year":
      return { from: fmt(new Date(y, 0, 1)), to: fmt(now) };
    case "this-financial-year": {
      const fy = m >= 3 ? y : y - 1;
      return { from: fmt(new Date(fy, 3, 1)), to: fmt(new Date(fy + 1, 2, 31)) };
    }
    case "last-month":
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    case "last-quarter": {
      const lqm = Math.floor(m / 3) * 3 - 3;
      return { from: fmt(new Date(y, lqm, 1)), to: fmt(new Date(y, lqm + 3, 0)) };
    }
    case "last-year":
      return { from: fmt(new Date(y - 1, 0, 1)), to: fmt(new Date(y - 1, 11, 31)) };
    default:
      return { from: fmt(new Date(y, m, 1)), to: fmt(now) };
  }
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── API ────────────────────────────────────────────────────────────────

export const reportApi = {
  // Financial Statements
  trialBalance: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: TrialBalanceResponse }>(`/reports/trial-balance${buildQuery(params || {})}`),

  profitLoss: (params: { from: string; to: string }) =>
    apiFetch<{ success: boolean; data: ProfitLossResponse }>(`/reports/profit-loss${buildQuery(params)}`),

  balanceSheet: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: BalanceSheetResponse }>(`/reports/balance-sheet${buildQuery(params || {})}`),

  controlReconciliation: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: ControlReconciliationResponse }>(`/reports/control-reconciliation${buildQuery(params || {})}`),

  // Activity
  accountTransactions: (params?: { from?: string; to?: string; accountId?: string; voucherType?: string; basis?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/account-transactions${buildQuery(params || {})}`),

  // Payables
  vendorBalanceSummary: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/vendor-balance-summary${buildQuery(params || {})}`),

  billDetails: (params?: { from?: string; to?: string; status?: string; vendorId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/bill-details${buildQuery(params || {})}`),

  paymentsMade: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/payments-made${buildQuery(params || {})}`),

  vendorCreditDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/vendor-credit-details${buildQuery(params || {})}`),

  purchaseOrderDetails: (params?: { from?: string; to?: string; status?: string; vendorId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/purchase-order-details${buildQuery(params || {})}`),

  payableSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/payable-summary${buildQuery(params || {})}`),

  // Receivables
  customerBalanceSummary: () =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>("/reports/customer-balance-summary"),

  invoiceDetails: (params?: { from?: string; to?: string; status?: string; customerId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/invoice-details${buildQuery(params || {})}`),

  receivableSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/receivable-summary${buildQuery(params || {})}`),

  // Purchases & Expenses
  expenseDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/expense-details${buildQuery(params || {})}`),

  expensesByCategory: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/expenses-by-category${buildQuery(params || {})}`),

  purchasesByItem: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/purchases-by-item${buildQuery(params || {})}`),

  // Sales
  salesByCustomer: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/sales-by-customer${buildQuery(params || {})}`),

  salesByItem: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/sales-by-item${buildQuery(params || {})}`),

  // Payments Received
  paymentsReceived: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/payments-received${buildQuery(params || {})}`),
};
