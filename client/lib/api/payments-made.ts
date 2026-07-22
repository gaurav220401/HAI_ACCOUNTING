import { apiFetch, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

function makeIdempotencyKey(scope: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}-${Date.now()}-${random}`;
}

export type PaymentMadeStatus = "DRAFT" | "PAID" | "VOID";

export interface PaymentMadeVendor {
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

export interface PaymentMade {
  _id: string;
  payment_id: string;
  payment_number: string;
  vendor_id: string | PaymentMadeVendor;
  payment_date: string;
  payment_mode: string;
  paid_through_account?: string | null;
  deposit_to_account?: string | null;
  reference_number?: string;
  notes?: string;
  status: PaymentMadeStatus;
  payment_type?: "bill-payment" | "vendor-advance" | "vendor-payable";
  total_amount_paid: number;
  amount_used_for_bills: number;
  amount_refunded: number;
  amount_in_excess: number;
  createdAt: string;
  updatedAt: string;
  audit_log?: Array<{
    action: string;
    details?: string;
    amount?: number;
    bill_id?: string;
    at: string;
    by?: string;
  }>;
}

export interface PaymentBillMap {
  _id: string;
  payment_id: string;
  bill_id:
    | string
    | {
        _id: string;
        billNumber?: string;
        billDate?: string;
        total?: number;
        amountPaid?: number;
        balanceDue?: number;
        status?: string;
      };
  applied_amount: number;
  applied_date: string;
}

export interface PaymentMadeListParams extends ListParams {
  vendor_id?: string;
  status?: string;
}

export interface CreatePaymentMadeInput {
  vendor_id: string;
  payment_number?: string;
  payment_id?: string;
  payment_date: string;
  payment_mode: string;
  paid_through_account?: string | null;
  deposit_to_account?: string | null;
  reference_number?: string;
  notes?: string;
  status: "DRAFT" | "PAID";
  payment_type?: "bill-payment" | "vendor-advance" | "vendor-payable";
  total_amount_paid: number;
  bill_applications?: Array<{
    bill_id: string;
    applied_amount: number;
  }>;
}

export interface UpdatePaymentMadeInput {
  payment_date?: string;
  payment_mode?: string;
  paid_through_account?: string | null;
  deposit_to_account?: string | null;
  reference_number?: string;
  notes?: string;
}

export const paymentMadeApi = {
  getNextNumber: () =>
    apiFetch<{ success: boolean; data: { payment_number: string } }>("/payments-made/next-number"),

  list: (params?: PaymentMadeListParams) => {
    const qs = buildQuery({ ...params });
    return apiFetch<PaginatedResponse<PaymentMade>>(`/payments-made${qs}`);
  },

  getOne: (id: string) =>
    apiFetch<{ success: boolean; data: { payment: PaymentMade; bill_applications: PaymentBillMap[] } }>(
      `/payments-made/${id}`,
    ),

  create: (payload: CreatePaymentMadeInput) =>
    apiFetch<{ success: boolean; data: PaymentMade }>("/payments-made", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey("payments-made-create"),
      },
    }),

  update: (id: string, payload: UpdatePaymentMadeInput) =>
    apiFetch<{ success: boolean; data: PaymentMade }>(`/payments-made/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey(`payments-made-update-${id}`),
      },
    }),

  void: (id: string, reason: string) =>
    apiFetch<{ success: boolean; data: PaymentMade }>(`/payments-made/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": makeIdempotencyKey(`payments-made-void-${id}`),
      },
    }),
};
