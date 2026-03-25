import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "Draft"
  | "Sent"
  | "Accepted"
  | "Rejected"
  | "Invoiced"
  | "Expired";

export type DiscountType = "percent" | "amount";
export type QuoteTaxType = "TDS" | "TCS" | "none";

export interface QuoteItem {
  _id?: string;
  itemId?: string | { _id: string; name: string; sku?: string } | null;
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  taxPercent: number;
  taxAmount: number;
  amount: number;
}

export interface Quote {
  _id: string;
  organizationId: string;
  quoteNumber: string;
  referenceNumber?: string;
  customerId:
    | string
    | {
        _id: string;
        displayName: string;
        companyName?: string;
        email?: string;
      };
  quoteDate: string;
  expiryDate?: string | null;
  salesPersonId?: string | { _id: string; name: string } | null;
  subject?: string;
  items: QuoteItem[];
  subTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxType: QuoteTaxType;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  customerNotes: string;
  termsAndConditions: string;
  status: QuoteStatus;
  emailContacts: string[];
  attachments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteInput {
  quoteNumber?: string;
  referenceNumber?: string;
  customerId: string;
  quoteDate: string;
  expiryDate?: string | null;
  salesPersonId?: string | null;
  subject?: string;
  items: Omit<QuoteItem, "_id" | "amount" | "taxAmount" | "discountAmount">[];
  discountType?: DiscountType;
  discountValue?: number;
  taxType?: QuoteTaxType;
  taxId?: string | null;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  status?: "Draft" | "Sent";
  emailContacts?: string[];
  attachments?: string[];
}

export type UpdateQuoteInput = Partial<CreateQuoteInput>;

export interface QuoteListParams extends ListParams {
  status?: QuoteStatus | "All";
}

// ─── API ────────────────────────────────────────────────────────────────

export const quoteApi = {
  list: (params?: QuoteListParams) =>
    apiFetch<PaginatedResponse<Quote>>(`/quotes${buildQuery(params || {})}`),

  getById: (id: string) => apiFetch<{ data: Quote }>(`/quotes/${id}`),

  create: (data: CreateQuoteInput) =>
    apiFetch<{ data: Quote }>("/quotes", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateQuoteInput) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/quotes/${id}`, { method: "DELETE" }),

  getNextNumber: () =>
    apiFetch<{ data: { quoteNumber: string } }>("/quotes/next-number"),

  // Status transitions
  send: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/send`, { method: "POST" }),

  accept: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/accept`, { method: "POST" }),

  reject: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/reject`, { method: "POST" }),
};
