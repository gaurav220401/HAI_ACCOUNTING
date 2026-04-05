import { apiFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export interface Currency {
  _id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isEnabled?: boolean;
}

export interface ExchangeRate {
  _id: string;
  organizationId: string;
  from: string;
  to: string;
  rate: number;
  date: string;
  source?: string;
  createdAt: string;
}

type RawExchangeRate = {
  _id: string;
  orgId?: string;
  organizationId?: string;
  from?: string;
  to?: string;
  fromCurrency?: string;
  toCurrency?: string;
  rate: number;
  date: string;
  source?: string;
  createdAt: string;
};

function normalizeExchangeRate(raw: RawExchangeRate): ExchangeRate {
  return {
    _id: raw._id,
    organizationId: raw.organizationId || raw.orgId || "",
    from: raw.from || raw.fromCurrency || "",
    to: raw.to || raw.toCurrency || "",
    rate: raw.rate,
    date: raw.date,
    source: raw.source,
    createdAt: raw.createdAt,
  };
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
  listRates: async (params?: { from?: string; to?: string; page?: number; limit?: number }) => {
    const qs = params
      ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      : "";
    const response = await apiFetch<{ data: RawExchangeRate[] }>(`/currencies/rates${qs}`);
    return { data: (response.data || []).map(normalizeExchangeRate) };
  },

  latestRate: async (from: string, to: string) => {
    const response = await apiFetch<{ data: RawExchangeRate | null }>(`/currencies/rates/latest?from=${from}&to=${to}`);
    return { data: response.data ? normalizeExchangeRate(response.data) : null };
  },

  createRate: async (data: { from: string; to: string; rate: number; date: string; source?: string }) => {
    const source = data.source
      ? data.source.charAt(0).toUpperCase() + data.source.slice(1).toLowerCase()
      : "Manual";
    const response = await apiFetch<{ data: RawExchangeRate }>("/currencies/rates", {
      method: "POST",
      body: JSON.stringify({
        fromCurrency: data.from,
        toCurrency: data.to,
        rate: data.rate,
        date: data.date,
        source,
      }),
    });
    return { data: normalizeExchangeRate(response.data) };
  },

  deleteRate: (id: string) =>
    apiFetch<{ success: boolean }>(`/currencies/rates/${id}`, { method: "DELETE" }),
};
