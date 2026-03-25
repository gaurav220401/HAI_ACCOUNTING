import { apiFetch, buildQuery } from "./client";

export interface AdjustmentLine {
  account: string;
  accountId?: string | null;
  balanceForeign: number;
  balanceBase: number;
  revaluedBalance: number;
  gainOrLoss: number;
}

export interface CurrencyAdjustment {
  _id: string;
  adjustmentNumber: string;
  date: string;
  currency: string;
  exchangeRate: number;
  notes: string;
  status: "Open" | "Reconciled";
  lines: AdjustmentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface ListParams {
  status?: "All" | "Open" | "Reconciled";
  page?: number;
  limit?: number;
}

export async function listCurrencyAdjustments(params: ListParams = {}) {
  const qs = buildQuery({ ...params });
  return apiFetch<{ success: boolean; data: CurrencyAdjustment[]; pagination: any }>(
    `/currency-adjustments${qs}`
  );
}

export async function getCurrencyAdjustment(id: string) {
  return apiFetch<{ success: boolean; data: CurrencyAdjustment }>(
    `/currency-adjustments/${id}`
  );
}

export async function createCurrencyAdjustment(payload: {
  date: string;
  currency: string;
  exchangeRate: number;
  notes: string;
  lines?: AdjustmentLine[];
}) {
  return apiFetch<{ success: boolean; data: CurrencyAdjustment }>("/currency-adjustments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCurrencyAdjustment(
  id: string,
  payload: Partial<CurrencyAdjustment>
) {
  return apiFetch<{ success: boolean; data: CurrencyAdjustment }>(
    `/currency-adjustments/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export async function deleteCurrencyAdjustment(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/currency-adjustments/${id}`, {
    method: "DELETE",
  });
}
