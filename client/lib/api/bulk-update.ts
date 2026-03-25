import { apiFetch } from "./client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BulkUpdateModuleType =
  | "Invoices"
  | "Quotes"
  | "Sales Orders"
  | "Expenses"
  | "Delivery Challans";

export interface BulkTransaction {
  _id: string;
  number: string;
  date: string;
  status: string;
  total: number;
  contact: string;
  accountNames: string;
}

export interface BulkUpdateSearchParams {
  moduleType: BulkUpdateModuleType;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  search?: string;
}

export interface BulkUpdateJob {
  id: string;
  organizationId: string;
  moduleType: string;
  oldAccountId: string;
  oldAccountName: string;
  newAccountId: string;
  newAccountName: string;
  transactionIds: string[];
  updatedCount: number;
  status: "Completed" | "Failed";
  performedAt: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const bulkUpdateApi = {
  search: (params: BulkUpdateSearchParams) => {
    const qs = new URLSearchParams();
    qs.set("moduleType", params.moduleType);
    if (params.accountId) qs.set("accountId", params.accountId);
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    return apiFetch<{ data: BulkTransaction[]; total: number }>(
      `/bulk-update/search?${qs.toString()}`
    );
  },

  execute: (payload: {
    moduleType: BulkUpdateModuleType;
    transactionIds: string[];
    oldAccountId?: string;
    oldAccountName?: string;
    newAccountId: string;
    newAccountName: string;
  }) =>
    apiFetch<{ data: BulkUpdateJob }>("/bulk-update/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  history: () =>
    apiFetch<{ data: BulkUpdateJob[] }>("/bulk-update/history"),
};
