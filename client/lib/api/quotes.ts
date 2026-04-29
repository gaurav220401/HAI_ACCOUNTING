import { apiFetch, apiFetchBlob, buildQuery } from "./client";
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
  placeOfSupply?: string;
  emailContacts: string[];
  attachments: string[];
  activityLog?: {
    timestamp: string;
    userId: { _id: string; displayName: string; email: string } | null;
    action: "created" | "updated" | "deleted" | "restored";
    changes: Record<string, { before: any; after: any }>;
  }[];
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
  placeOfSupply?: string;
}

export type UpdateQuoteInput = Partial<CreateQuoteInput>;

export interface QuoteListParams extends ListParams {
  status?: QuoteStatus | "All";
  customerId?: string;
}

export interface SendQuoteEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachQuotePdf?: boolean;
}

// ─── API ────────────────────────────────────────────────────────────────

export const quoteApi = {
  list: (params?: QuoteListParams) =>
    apiFetch<PaginatedResponse<Quote>>(`/quotes${buildQuery(params || {})}`),

  getById: (id: string) => apiFetch<{ data: Quote }>(`/quotes/${id}`),

  downloadPdf: (id: string, preview = false) =>
    apiFetchBlob(`/quotes/${id}/pdf${preview ? "?preview=true" : ""}`),

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

  /** Send email with optional file attachments via multipart/form-data. */
  sendEmailWithFiles: (id: string, data: SendQuoteEmailInput, files: File[]) => {
    const form = new FormData();
    form.append("to", JSON.stringify(data.to));
    if (data.cc?.length) form.append("cc", JSON.stringify(data.cc));
    if (data.bcc?.length) form.append("bcc", JSON.stringify(data.bcc));
    form.append("subject", data.subject);
    form.append("body", data.body ?? "");
    form.append("attachQuotePdf", data.attachQuotePdf ? "true" : "false");
    files.forEach((file) => form.append("files", file));
    return apiFetch<{ data: Quote }>(`/quotes/${id}/send-email`, {
      method: "POST",
      body: form,
    });
  },

  // Status transitions
  send: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/send`, { method: "POST" }),

  accept: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/accept`, { method: "POST" }),

  reject: (id: string) =>
    apiFetch<{ data: Quote }>(`/quotes/${id}/reject`, { method: "POST" }),

  convertToInvoice: (id: string) =>
    apiFetch<{ data: any }>(`/quotes/${id}/convert-to-invoice`, {
      method: "POST",
    }),
};
