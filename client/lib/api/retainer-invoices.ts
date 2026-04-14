import { apiFetch, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

export type RetainerInvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Partially Applied"
  | "Applied"
  | "Partially Refunded"
  | "Refunded"
  | "Void";

export interface RetainerInvoiceApplication {
  invoice_id:
    | string
    | {
        _id: string;
        invoiceNumber?: string;
        invoiceDate?: string;
        total?: number;
        balanceDue?: number;
        status?: string;
      };
  applied_amount: number;
  applied_date: string;
}

export interface RetainerInvoice {
  _id: string;
  organization_id: string;
  retainer_id: string;
  retainer_number: string;
  customer_id:
    | string
    | {
        _id: string;
        displayName?: string;
        companyName?: string;
        email?: string;
      };
  retainer_date: string;
  due_date?: string | null;
  reference_number?: string;
  description?: string;
  payment_mode?: string;
  deposited_to_account?: string | null;
  notes?: string;

  total_amount: number;
  amount_received: number;
  amount_applied: number;
  amount_refunded: number;
  amount_unapplied: number;
  balance_due: number;

  status: RetainerInvoiceStatus;
  sent_at?: string | null;
  applications: RetainerInvoiceApplication[];

  createdAt: string;
  updatedAt: string;
}

export interface RetainerInvoiceListParams extends ListParams {
  customer_id?: string;
  customerId?: string;
  status?: RetainerInvoiceStatus | "All";
}

export interface CreateRetainerInvoiceInput {
  customer_id: string;
  total_amount: number;
  retainer_number?: string;
  retainer_id?: string;
  retainer_date: string;
  due_date?: string | null;
  reference_number?: string;
  description?: string;
  payment_mode?: string;
  deposited_to_account?: string | null;
  notes?: string;
  status?: "Draft" | "Sent";
}

export type UpdateRetainerInvoiceInput = Partial<CreateRetainerInvoiceInput>;

export const retainerInvoiceApi = {
  getNextNumber: () =>
    apiFetch<{ success: boolean; data: { retainer_number: string } }>(
      "/retainer-invoices/next-number",
    ),

  list: (params?: RetainerInvoiceListParams) => {
    const queryParams = { ...(params || {}) };
    if (queryParams.customerId && !queryParams.customer_id) {
      queryParams.customer_id = queryParams.customerId;
    }
    delete queryParams.customerId;

    return apiFetch<PaginatedResponse<RetainerInvoice>>(
      `/retainer-invoices${buildQuery(queryParams)}`,
    );
  },

  getOne: (id: string) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(`/retainer-invoices/${id}`),

  create: (payload: CreateRetainerInvoiceInput) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>("/retainer-invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: UpdateRetainerInvoiceInput) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(`/retainer-invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/retainer-invoices/${id}`, {
      method: "DELETE",
    }),

  send: (id: string) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(`/retainer-invoices/${id}/send`, {
      method: "POST",
    }),

  recordPayment: (
    id: string,
    payload: {
      amount: number;
      payment_date?: string;
      payment_mode?: string;
      deposited_to_account?: string | null;
    },
  ) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(
      `/retainer-invoices/${id}/record-payment`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  apply: (
    id: string,
    payload: {
      invoice_id: string;
      applied_amount: number;
    },
  ) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(
      `/retainer-invoices/${id}/apply`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  unapply: (
    id: string,
    payload: {
      invoice_id: string;
      applied_amount?: number;
    },
  ) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(
      `/retainer-invoices/${id}/unapply`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  refund: (
    id: string,
    payload: {
      amount: number;
      refund_date?: string;
      deposited_to_account?: string | null;
    },
  ) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(
      `/retainer-invoices/${id}/refund`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),

  void: (id: string, reason?: string) =>
    apiFetch<{ success: boolean; data: RetainerInvoice }>(`/retainer-invoices/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "Void from retainer module" }),
    }),
};
