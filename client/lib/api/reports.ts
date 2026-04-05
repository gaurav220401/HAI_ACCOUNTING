import { apiFetch, buildQuery } from "./client";

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
  totals: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
  };
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
  totals: {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
  };
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
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    equationDifference: number;
  };
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

export const reportApi = {
  trialBalance: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: TrialBalanceResponse }>(
      `/reports/trial-balance${buildQuery(params || {})}`,
    ),

  profitLoss: (params: { from: string; to: string }) =>
    apiFetch<{ success: boolean; data: ProfitLossResponse }>(
      `/reports/profit-loss${buildQuery(params)}`,
    ),

  balanceSheet: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: BalanceSheetResponse }>(
      `/reports/balance-sheet${buildQuery(params || {})}`,
    ),

  controlReconciliation: (params?: { asOf?: string }) =>
    apiFetch<{ success: boolean; data: ControlReconciliationResponse }>(
      `/reports/control-reconciliation${buildQuery(params || {})}`,
    ),
};
