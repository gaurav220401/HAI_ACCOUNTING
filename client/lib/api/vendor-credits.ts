import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

function makeIdempotencyKey(scope: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${scope}-${Date.now()}-${random}`;
}

export type VendorCreditStatus =
  | "DRAFT"
  | "OPEN"
  | "PARTIALLY_APPLIED"
  | "CLOSED"
  | "VOID";

export interface VendorCreditLineItem {
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

export interface VendorCredit {
  _id: string;
  organizationId: string;
  vendorId: any;
  vendorCreditNumber: string;
  vendorCreditDate: string;
  referenceBillId?: any;
  subject?: string;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  billType?: string;
  orderNumber?: string;
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
  lineItems: VendorCreditLineItem[];
  notes?: string;
  termsAndConditions?: string;
  status: VendorCreditStatus;
  attachments?: string[];
  comments?: {
    author: string;
    text: string;
    time: string;
    isSystem: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface VendorCreditApplication {
  _id: string;
  organizationId: string;
  vendorCreditId: string;
  billId: any;
  amount: number;
  appliedDate: string;
  notes?: string;
}

export interface CreateVendorCreditInput {
  vendorId: string;
  vendorCreditNumber?: string;
  vendorCreditDate: string;
  referenceBillId?: string | null;
  subject?: string;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  billType?: string;
  orderNumber?: string;
  discountLevel?: "transaction" | "line_item";
  discountPercent?: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  tdsAmount?: number;
  tcsAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  lineItems: Array<Omit<VendorCreditLineItem, "_id">>;
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status?: "DRAFT" | "OPEN";
}

export type UpdateVendorCreditInput = Partial<CreateVendorCreditInput>;

export const vendorCreditApi = {
  getNextNumber: () =>
    apiFetch<{ data: { vendorCreditNumber: string } }>("/vendor-credits/next-number"),

  list: (
    params?: ListParams & {
      status?: string;
      vendorId?: string;
      dateStart?: string;
      dateEnd?: string;
    },
  ) => apiFetch<PaginatedResponse<VendorCredit>>(`/vendor-credits${buildQuery(params || {})}`),

  getOne: (id: string) =>
    apiFetch<{ data: { credit: VendorCredit; applications: VendorCreditApplication[] } }>(
      `/vendor-credits/${id}`,
    ),

  downloadPdf: (id: string) => apiFetchBlob(`/vendor-credits/${id}/pdf`),

  create: (data: CreateVendorCreditInput) =>
    apiFetch<{ data: VendorCredit }>("/vendor-credits", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": makeIdempotencyKey("vendor-credits-create"),
      },
    }),

  update: (id: string, data: UpdateVendorCreditInput) =>
    apiFetch<{ data: VendorCredit }>(`/vendor-credits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`vendor-credits-update-${id}`),
      },
    }),

  clone: (id: string) =>
    apiFetch<{ data: VendorCredit }>(`/vendor-credits/${id}/clone`, {
      method: "POST",
    }),

  applyToBill: (id: string, billId: string, amount: number, notes?: string) =>
    apiFetch<{ data: { credit: VendorCredit; bill: any; amount: number } }>(
      `/vendor-credits/${id}/apply`,
      {
        method: "POST",
        body: JSON.stringify({ billId, amount, notes }),
        headers: {
          "Idempotency-Key": makeIdempotencyKey(`vendor-credits-apply-${id}`),
        },
      },
    ),

  refund: (id: string, amount: number) =>
    apiFetch<{ data: VendorCredit }>(`/vendor-credits/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount }),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`vendor-credits-refund-${id}`),
      },
    }),

  addComment: (id: string, text: string) =>
    apiFetch<{ data: { author: string; text: string; time: string; isSystem: boolean } }>(
      `/vendor-credits/${id}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    ),

  unapplyFromBill: (id: string, billId: string, amount?: number) =>
    apiFetch<{ data: { credit: VendorCredit; bill: any; amount: number } }>(
      `/vendor-credits/${id}/unapply`,
      {
        method: "POST",
        body: JSON.stringify({ billId, amount }),
        headers: {
          "Idempotency-Key": makeIdempotencyKey(`vendor-credits-unapply-${id}`),
        },
      },
    ),

  void: (id: string, reason?: string) =>
    apiFetch<{ data: VendorCredit }>(`/vendor-credits/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`vendor-credits-void-${id}`),
      },
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/vendor-credits/${id}`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": makeIdempotencyKey(`vendor-credits-remove-${id}`),
      },
    }),
};
