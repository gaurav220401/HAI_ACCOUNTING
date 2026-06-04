import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Overdue"
  | "Partially Paid"
  | "Paid"
  | "Void";

export type DiscountType = "percent" | "amount";
export type InvoiceTaxType = "TDS" | "TCS" | "none";

export interface InvoiceItem {
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
  accountId?: string | { _id: string; name?: string } | null;
  projectId?: string | null;
}

export interface JournalEntry {
  account: string;
  debit: number;
  credit: number;
}

export interface Invoice {
  _id: string;
  organizationId: string;
  invoiceNumber: string;
  referenceNumber?: string;
  orderNumber?: string;
  customerId:
    | string
    | {
        _id: string;
        displayName: string;
        companyName?: string;
        email?: string;
      };
  invoiceDate: string;
  dueDate?: string | null;
  paymentTermsId?:
    | string
    | { _id: string; name: string; netDays?: number }
    | null;
  salesPersonId?: string | { _id: string; name: string } | null;
  subject?: string;
  items: InvoiceItem[];
  subTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxType: InvoiceTaxType;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  balanceDue: number;
  customerNotes: string;
  termsAndConditions: string;
  status: InvoiceStatus;
  emailContacts: string[];
  attachments: string[];
  paymentReceived: boolean;
  isRecurring: boolean;
  journalEntries?: JournalEntry[];
  pdfTemplateId?: string;
  templateConfig?: Record<string, unknown>;
  sentAt?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceInput {
  invoiceNumber?: string;
  referenceNumber?: string;
  orderNumber?: string;
  customerId: string;
  invoiceDate: string;
  dueDate?: string | null;
  paymentTermsId?: string | null;
  salesPersonId?: string | null;
  subject?: string;
  items: Omit<InvoiceItem, "_id" | "amount" | "taxAmount" | "discountAmount">[];
  discountType?: DiscountType;
  discountValue?: number;
  taxType?: InvoiceTaxType;
  taxId?: string | null;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  templateConfig?: Record<string, unknown>;
  status?: "Draft" | "Sent";
  emailContacts?: string[];
  attachments?: string[];
  paymentReceived?: boolean;
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

export interface InvoiceListParams extends ListParams {
  status?: InvoiceStatus | "All";
  customerId?: string;
}

export interface SendInvoiceEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachInvoicePdf?: boolean;
  attachCustomerStatement?: boolean;
}

// ─── API ────────────────────────────────────────────────────────────────

export const invoiceApi = {
  list: (params?: InvoiceListParams) =>
    apiFetch<PaginatedResponse<Invoice>>(
      `/invoices${buildQuery(params || {})}`,
    ),

  getById: (id: string) => apiFetch<{ data: Invoice }>(`/invoices/${id}`),

  downloadPdf: (id: string, preview = false) =>
    apiFetchBlob(`/invoices/${id}/pdf${preview ? "?preview=true" : ""}`),

  create: (data: CreateInvoiceInput) =>
    apiFetch<{ data: Invoice }>("/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateInvoiceInput) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/invoices/${id}`, { method: "DELETE" }),

  getNextNumber: () =>
    apiFetch<{ data: { invoiceNumber: string } }>("/invoices/next-number"),

  // Status transitions
  send: (id: string) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/send`, { method: "POST" }),

  sendEmail: (id: string, data: SendInvoiceEmailInput) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/send-email`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Send email with optional file attachments via multipart/form-data. */
  sendEmailWithFiles: (
    id: string,
    data: SendInvoiceEmailInput,
    files: File[],
  ) => {
    const form = new FormData();
    form.append("to", JSON.stringify(data.to));
    if (data.cc?.length) form.append("cc", JSON.stringify(data.cc));
    if (data.bcc?.length) form.append("bcc", JSON.stringify(data.bcc));
    form.append("subject", data.subject);
    form.append("body", data.body ?? "");
    form.append("attachInvoicePdf", data.attachInvoicePdf ? "true" : "false");
    files.forEach((file) => form.append("files", file));
    return apiFetch<{ data: Invoice }>(`/invoices/${id}/send-email`, {
      method: "POST",
      body: form,
    });
  },

  markAsSent: (id: string) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/mark-sent`, {
      method: "POST",
    }),

  recordPayment: (
    id: string,
    data: {
      amount: number;
      paymentDate: string;
      paymentModeId?: string;
      referenceNumber?: string;
      notes?: string;
    },
  ) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/record-payment`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  voidInvoice: (id: string) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/void`, { method: "POST" }),

  clone: (id: string) =>
    apiFetch<{ data: Invoice }>(`/invoices/${id}/clone`, { method: "POST" }),

  convertToRecurring: (id: string) =>
    apiFetch<{ data: any }>(`/invoices/${id}/recurring`, { method: "POST" }),

  getJournalEntries: (id: string) =>
    apiFetch<{ data: any[] }>(`/invoices/${id}/journal-entries`),
};
