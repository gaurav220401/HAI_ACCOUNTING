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
  accountType?: string;
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

export interface DashboardSummaryResponse {
  asOf: string;
  periods: {
    cashFlow: { from: string; to: string };
    incomeExpense: { from: string; to: string };
  };
  receivables: {
    total: number;
    current: number;
    overdue: number;
    buckets: Record<string, number>;
  };
  payables: {
    total: number;
    current: number;
    overdue: number;
    buckets: Record<string, number>;
  };
  cashFlow: {
    startBalance: number;
    incomingTotal: number;
    outgoingTotal: number;
    closingBalance: number;
    months: Array<{
      key: string;
      month: string;
      incoming: number;
      outgoing: number;
      closing: number;
    }>;
  };
  incomeExpense: {
    basis: "accrual" | "cash";
    totalIncome: number;
    totalExpense: number;
    netAmount: number;
    months: Array<{
      key: string;
      month: string;
      income: number;
      expense: number;
    }>;
  };
  topExpenses: {
    totalAmount: number;
    rows: Array<{
      accountId: string;
      categoryName: string;
      totalAmount: number;
    }>;
  };
  bankCreditCards: {
    totalBalance: number;
    rows: Array<{
      accountId: string;
      name: string;
      accountType: string;
      balance: number;
    }>;
  };
  accountWatchlist: {
    basis: "accrual" | "cash";
    rows: Array<{
      key: string;
      label: string;
      value: number;
    }>;
  };
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

  apAgingSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/ap-aging-summary${buildQuery(params || {})}`),


  // Receivables
  customerBalanceSummary: () =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>("/reports/customer-balance-summary"),

  invoiceDetails: (params?: { from?: string; to?: string; status?: string; customerId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/invoice-details${buildQuery(params || {})}`),

  receivableSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/receivable-summary${buildQuery(params || {})}`),

  customerBalanceDetails: (params?: { from?: string; to?: string; customerId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/customer-balance-details${buildQuery(params || {})}`),

  arAgingSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/ar-aging-summary${buildQuery(params || {})}`),

  arAgingDetails: (params?: { asOf?: string; customerId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/ar-aging-details${buildQuery(params || {})}`),

  // Purchases & Expenses
  expenseDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/expense-details${buildQuery(params || {})}`),

  expensesByCategory: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/expenses-by-category${buildQuery(params || {})}`),

  purchasesByItem: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/purchases-by-item${buildQuery(params || {})}`),

  // Inventory

  purchasesByVendor: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/purchases-by-vendor${buildQuery(params || {})}`),



  inventorySummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-summary${buildQuery(params || {})}`),

  committedStockDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/committed-stock-details${buildQuery(params || {})}`),

  inventoryAgingSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-aging-summary${buildQuery(params || {})}`),

  stockSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/stock-summary${buildQuery(params || {})}`),

  inventoryAdjustmentSummary: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-adjustment-summary${buildQuery(params || {})}`),

  inventoryAdjustmentDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-adjustment-details${buildQuery(params || {})}`),

  packingHistory: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/packing-history${buildQuery(params || {})}`),

  shipmentDetails: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/shipment-details${buildQuery(params || {})}`),

  inventoryTurnoverByQuantity: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-turnover-by-quantity${buildQuery(params || {})}`),

  // Inventory Valuation
  inventoryValuationSummary: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-valuation-summary${buildQuery(params || {})}`),

  fifoCostLotTracking: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/fifo-cost-lot-tracking${buildQuery(params || {})}`),

  abcClassification: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/abc-classification${buildQuery(params || {})}`),

  inventoryTurnoverByAmount: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/inventory-turnover-by-amount${buildQuery(params || {})}`),

  // Sales
  salesByCustomer: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/sales-by-customer${buildQuery(params || {})}`),

  salesByItem: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/sales-by-item${buildQuery(params || {})}`),

  salesByItemDetails: (params?: { from?: string; to?: string; itemId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/sales-by-item-details${buildQuery(params || {})}`),

  purchasesByItemDetails: (params?: { from?: string; to?: string; itemId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/purchases-by-item-details${buildQuery(params || {})}`),

  itemTransactionHistory: (params?: { from?: string; to?: string; itemId?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/item-transaction-history${buildQuery(params || {})}`),

  // GST Reports
  hsnWiseSummary: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/hsn-wise-summary${buildQuery(params || {})}`),

  // Payments Received
  paymentsReceivedSummary: (params?: { from?: string; to?: string }) =>
    apiFetch<{ success: boolean; data: GenericReportResponse }>(`/reports/payments-received${buildQuery(params || {})}`),

  // Dashboard
  dashboardSummary: (params?: {
    asOf?: string;
    cashFrom?: string;
    cashTo?: string;
    incomeFrom?: string;
    incomeTo?: string;
    incomeBasis?: "accrual" | "cash";
    watchlistBasis?: "accrual" | "cash";
    topExpensesLimit?: number;
  }) =>
    apiFetch<{ success: boolean; data: DashboardSummaryResponse }>(`/reports/dashboard-summary${buildQuery(params || {})}`),
};
