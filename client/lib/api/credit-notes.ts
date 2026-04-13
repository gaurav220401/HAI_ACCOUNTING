import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

function makeIdempotencyKey(scope: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}-${Date.now()}-${random}`;
}

export type CreditNoteStatus =
  | "DRAFT"
  | "OPEN"
  | "APPLIED"
  | "PARTIALLY_APPLIED"
  | "CLOSED"
  | "VOID";

export interface CreditNoteLineItem {
  _id?: string;
  isHeader?: boolean;
  headerText?: string;
  itemId?: string | { _id: string; name: string; sku?: string } | null;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent?: number;
  amount: number;
  accountId?: string | { _id: string; name: string; accountType: string } | null;
}

export interface CreditNoteComment {
  author: string;
  text: string;
  time: string;
  isSystem: boolean;
}

export interface CreditNote {
  _id: string;
  organizationId: string;
  customerId: any;
  creditNoteNumber: string;
  referenceNumber?: string;
  reason?: string;
  creditNoteDate: string;
  referenceInvoiceId?: any;
  accountsReceivableId?: any;
  salesPersonId?: any;
  subject?: string;
  lineItems: CreditNoteLineItem[];
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  discountAmount: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: any;
  tcsId?: any;
  tdsAmount?: number;
  tcsAmount?: number;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  subTotal: number;
  total: number;
  appliedAmount: number;
  refundedAmount?: number;
  balanceAmount: number;
  customerNotes?: string;
  termsAndConditions?: string;
  status: CreditNoteStatus;
  attachments?: string[];
  comments?: CreditNoteComment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreditNoteApplication {
  _id: string;
  organizationId: string;
  creditNoteId: string;
  invoiceId: any;
  amount: number;
  appliedDate: string;
  notes?: string;
}

export interface CreateCreditNoteInput {
  customerId: string;
  creditNoteNumber?: string;
  referenceNumber?: string;
  reason?: string;
  creditNoteDate: string;
  referenceInvoiceId?: string | null;
  accountsReceivableId?: string | null;
  salesPersonId?: string | null;
  subject?: string;
  lineItems: Array<Omit<CreditNoteLineItem, "_id">>;
  discountLevel?: "transaction" | "line_item";
  discountPercent?: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  tdsAmount?: number;
  tcsAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status?: "DRAFT" | "OPEN";
}

export type UpdateCreditNoteInput = Partial<CreateCreditNoteInput>;

export interface CreditNoteListParams extends ListParams {
  status?: CreditNoteStatus | "All";
  customerId?: string;
  dateStart?: string;
  dateEnd?: string;
}

export const creditNoteApi = {
  getNextNumber: () =>
    apiFetch<{ data: { creditNoteNumber: string } }>("/credit-notes/next-number"),

  list: (params?: CreditNoteListParams) =>
    apiFetch<PaginatedResponse<CreditNote>>(`/credit-notes${buildQuery(params || {})}`),

  getOne: (id: string) =>
    apiFetch<{ data: { credit: CreditNote; applications: CreditNoteApplication[] } }>(
      `/credit-notes/${id}`,
    ),

  downloadPdf: (id: string, preview = false) =>
    apiFetchBlob(`/credit-notes/${id}/pdf${preview ? "?preview=true" : ""}`),

  create: (data: CreateCreditNoteInput) =>
    apiFetch<{ data: CreditNote }>("/credit-notes", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": makeIdempotencyKey("credit-notes-create"),
      },
    }),

  update: (id: string, data: UpdateCreditNoteInput) =>
    apiFetch<{ data: CreditNote }>(`/credit-notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`credit-notes-update-${id}`),
      },
    }),

  clone: (id: string) =>
    apiFetch<{ data: CreditNote }>(`/credit-notes/${id}/clone`, {
      method: "POST",
    }),

  applyToInvoice: (id: string, invoiceId: string, amount: number, notes?: string) =>
    apiFetch<{ data: { credit: CreditNote; invoice: any; amount: number } }>(
      `/credit-notes/${id}/apply`,
      {
        method: "POST",
        body: JSON.stringify({ invoiceId, amount, notes }),
        headers: {
          "Idempotency-Key": makeIdempotencyKey(`credit-notes-apply-${id}`),
        },
      },
    ),

  unapplyFromInvoice: (id: string, invoiceId: string, amount?: number) =>
    apiFetch<{ data: { credit: CreditNote; invoice: any; amount: number } }>(
      `/credit-notes/${id}/unapply`,
      {
        method: "POST",
        body: JSON.stringify({ invoiceId, amount }),
        headers: {
          "Idempotency-Key": makeIdempotencyKey(`credit-notes-unapply-${id}`),
        },
      },
    ),

  refund: (id: string, amount: number) =>
    apiFetch<{ data: CreditNote }>(`/credit-notes/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount }),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`credit-notes-refund-${id}`),
      },
    }),

  addComment: (id: string, text: string) =>
    apiFetch<{ data: CreditNoteComment }>(`/credit-notes/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  void: (id: string, reason?: string) =>
    apiFetch<{ data: CreditNote }>(`/credit-notes/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`credit-notes-void-${id}`),
      },
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean; message?: string }>(`/credit-notes/${id}`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`credit-notes-remove-${id}`),
      },
    }),
};
