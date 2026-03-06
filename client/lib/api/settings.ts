import { apiFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type TaxType = "Tax" | "TaxGroup" | "CompoundTax";

export interface Tax {
  _id: string;
  orgId: string;
  name: string;
  taxType: TaxType;
  rate?: number;
  components?: Array<{ taxId: string; name: string; rate: number }>;
  accountId?: string;
  isSystem?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface PaymentTerms {
  _id: string;
  orgId: string;
  name: string;
  termType: "net_days" | "end_of_month" | "end_of_next_month";
  netDays: number;
  discountPercentage: number;
  discountDays: number;
  isDefault: boolean;
  isSystemTerm: boolean;
  isPermanent: boolean;  // cannot be deleted or renamed
  isActive: boolean;
  createdAt: string;
}

export interface Warehouse {
  _id: string;
  orgId: string;
  name: string;
  address?: string;
  isPrimary?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface SalesPerson {
  _id: string;
  orgId: string;
  name: string;
  email?: string;
  phone?: string;
  commissionRate?: number;
  isActive: boolean;
  createdAt: string;
}

export interface PaymentMode {
  _id: string;
  orgId: string;
  name: string;
  accountId?: string;
  isSystemMode?: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ExpenseCategory {
  _id: string;
  orgId: string;
  name: string;
  accountId?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ReportingTag {
  _id: string;
  orgId: string;
  name: string;
  color?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PriceList {
  _id: string;
  orgId: string;
  name: string;
  type: "Sales" | "Purchase";
  currency?: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Generic factory ─────────────────────────────────────────────────────

function makeCrud<T, C = Partial<T>>(path: string) {
  return {
    list: () => apiFetch<{ data: T[] }>(path),
    getById: (id: string) => apiFetch<{ data: T }>(`${path}/${id}`),
    create: (data: C) =>
      apiFetch<{ data: T }>(path, { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<C>) =>
      apiFetch<{ data: T }>(`${path}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) =>
      apiFetch<{ success: boolean }>(`${path}/${id}`, { method: "DELETE" }),
  };
}

// ─── API ────────────────────────────────────────────────────────────────

export const settingsApi = {
  taxes: {
    ...makeCrud<Tax>("/settings/taxes"),
    seed: () => apiFetch<{ message: string }>("/settings/taxes/seed", { method: "POST" }),
  },

  paymentTerms: {
    ...makeCrud<PaymentTerms>("/settings/payment-terms"),
    seed: () => apiFetch<{ message: string }>("/settings/payment-terms/seed", { method: "POST" }),
    setDefault: (id: string) =>
      apiFetch<{ data: PaymentTerms }>(`/settings/payment-terms/${id}/set-default`, { method: "POST" }),
    unsetDefault: () =>
      apiFetch<{ success: boolean }>("/settings/payment-terms/unset-default", { method: "POST" }),
  },

  warehouses: makeCrud<Warehouse>("/settings/warehouses"),

  salesPersons: makeCrud<SalesPerson>("/settings/sales-persons"),

  paymentModes: {
    ...makeCrud<PaymentMode>("/settings/payment-modes"),
    seed: () => apiFetch<{ message: string }>("/settings/payment-modes/seed", { method: "POST" }),
  },

  expenseCategories: {
    ...makeCrud<ExpenseCategory>("/settings/expense-categories"),
    seed: () => apiFetch<{ message: string }>("/settings/expense-categories/seed", { method: "POST" }),
  },

  reportingTags: makeCrud<ReportingTag>("/settings/reporting-tags"),

  priceLists: makeCrud<PriceList>("/settings/price-lists"),
};
