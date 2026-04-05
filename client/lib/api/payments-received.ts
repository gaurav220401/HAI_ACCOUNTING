import { apiFetch, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

function makeIdempotencyKey(scope: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}-${Date.now()}-${random}`;
}

export type PaymentReceivedStatus = "DRAFT" | "PAID" | "VOID";

export interface PaymentReceivedCustomer {
  _id: string;
  displayName?: string;
  companyName?: string;
  email?: string;
  billingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface PaymentReceived {
  _id: string;
  payment_id: string;
  payment_number: string;
  customer_id: string | PaymentReceivedCustomer;
  payment_date: string;
  payment_mode: string;
  deposited_to_account?: string | null;
  reference_number?: string;
  notes?: string;
  status: PaymentReceivedStatus;
  total_amount_received: number;
  amount_used_for_invoices: number;
  amount_refunded: number;
  amount_in_excess: number;
  createdAt: string;
  updatedAt: string;
  audit_log?: Array<{
    action: string;
    details?: string;
    amount?: number;
    invoice_id?: string;
    at: string;
    by?: string;
  }>;
}

export interface PaymentInvoiceMap {
  _id: string;
  payment_id: string;
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

export interface PaymentReceivedListParams extends ListParams {
  customer_id?: string;
  status?: string;
}

export interface CreatePaymentReceivedInput {
  customer_id: string;
  payment_number?: string;
  payment_id?: string;
  payment_date: string;
  payment_mode: string;
  deposited_to_account?: string | null;
  reference_number?: string;
  notes?: string;
  status: "DRAFT" | "PAID";
  total_amount_received: number;
  invoice_applications?: Array<{
    invoice_id: string;
    applied_amount: number;
  }>;
}

export interface UpdatePaymentReceivedInput {
  payment_date?: string;
  payment_mode?: string;
  deposited_to_account?: string | null;
  reference_number?: string;
  notes?: string;
}

export const paymentReceivedApi = {
  getNextNumber: () =>
    apiFetch<{ success: boolean; data: { payment_number: string } }>("/payments-received/next-number"),

  list: (params?: PaymentReceivedListParams) => {
    const qs = buildQuery({ ...params });
    return apiFetch<PaginatedResponse<PaymentReceived>>(`/payments-received${qs}`);
  },

  getOne: (id: string) =>
    apiFetch<{
      success: boolean;
      data: { payment: PaymentReceived; invoice_applications: PaymentInvoiceMap[] };
    }>(`/payments-received/${id}`),

  create: (payload: CreatePaymentReceivedInput) =>
    apiFetch<{ success: boolean; data: PaymentReceived }>("/payments-received", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey("payments-received-create"),
      },
    }),

  update: (id: string, payload: UpdatePaymentReceivedInput) =>
    apiFetch<{ success: boolean; data: PaymentReceived }>(`/payments-received/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey(`payments-received-update-${id}`),
      },
    }),

  apply: (id: string, payload: { invoice_id: string; applied_amount: number }) =>
    apiFetch<{ success: boolean; data: { payment: PaymentReceived; applied_amount: number } }>(
      `/payments-received/${id}/apply`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": makeIdempotencyKey(`payments-received-apply-${id}`),
        },
      },
    ),

  unapply: (id: string, payload: { invoice_id: string; applied_amount?: number }) =>
    apiFetch<{ success: boolean; data: { payment: PaymentReceived; unapplied_amount: number } }>(
      `/payments-received/${id}/unapply`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": makeIdempotencyKey(`payments-received-unapply-${id}`),
        },
      },
    ),

  refund: (id: string, amount: number) =>
    apiFetch<{ success: boolean; data: PaymentReceived }>(`/payments-received/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount }),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey(`payments-received-refund-${id}`),
      },
    }),

  void: (id: string, reason: string) =>
    apiFetch<{ success: boolean; data: PaymentReceived }>(`/payments-received/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey(`payments-received-void-${id}`),
      },
    }),
};
