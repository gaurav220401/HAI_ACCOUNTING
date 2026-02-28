import { apiFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export interface Currency {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
}

export interface ExchangeRate {
  _id: string;
  orgId: string;
  from: string;
  to: string;
  rate: number;
  date: string;
  source?: string;
  createdAt: string;
}

// ─── API ────────────────────────────────────────────────────────────────

export const currencyApi = {
  list: () =>
    apiFetch<{ data: Currency[] }>("/currencies"),

  seedCurrencies: () =>
    apiFetch<{ message: string; count: number }>("/currencies/seed", {
      method: "POST",
    }),

  // Exchange Rates
  listRates: (params?: { from?: string; to?: string; page?: number; limit?: number }) => {
    const qs = params
      ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      : "";
    return apiFetch<{ data: ExchangeRate[] }>(`/currencies/rates${qs}`);
  },

  latestRate: (from: string, to: string) =>
    apiFetch<{ data: ExchangeRate }>(`/currencies/rates/latest?from=${from}&to=${to}`),

  createRate: (data: { from: string; to: string; rate: number; date: string; source?: string }) =>
    apiFetch<{ data: ExchangeRate }>("/currencies/rates", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteRate: (id: string) =>
    apiFetch<{ success: boolean }>(`/currencies/rates/${id}`, { method: "DELETE" }),
};
