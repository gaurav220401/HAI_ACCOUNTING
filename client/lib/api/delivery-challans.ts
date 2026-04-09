import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type DeliveryChallanStatus = "Draft" | "Open" | "Delivered" | "Returned";

export type ChallanType =
  | "Supply of Liquid Gas"
  | "Job Work"
  | "Supply on Approval"
  | "Others";

export interface DeliveryChallanItem {
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

export interface DeliveryChallan {
  _id: string;
  organizationId: string;
  challanNumber: string;
  referenceNumber?: string;
  customerId:
    | string
    | {
        _id: string;
        displayName: string;
        companyName?: string;
        email?: string;
      };
  challanDate: string;
  challanType: ChallanType;
  items: DeliveryChallanItem[];
  subTotal: number;
  discountType: "percent" | "amount";
  discountValue: number;
  discountAmount: number;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  customerNotes: string;
  termsAndConditions: string;
  status: DeliveryChallanStatus;
  invoiceStatus: "NOT INVOICED" | "INVOICED";
  invoiceId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeliveryChallanInput {
  challanNumber?: string;
  referenceNumber?: string;
  customerId: string;
  challanDate: string;
  challanType: ChallanType;
  items: Omit<
    DeliveryChallanItem,
    "_id" | "amount" | "taxAmount" | "discountAmount"
  >[];
  discountType?: "percent" | "amount";
  discountValue?: number;
  taxId?: string | null;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  status?: "Draft" | "Open";
}

export type UpdateDeliveryChallanInput = Partial<CreateDeliveryChallanInput>;

export interface DeliveryChallanListParams extends ListParams {
  status?: DeliveryChallanStatus | "All";
  customerId?: string;
}

// ─── API ────────────────────────────────────────────────────────────────

export const deliveryChallanApi = {
  list: (params?: DeliveryChallanListParams) =>
    apiFetch<PaginatedResponse<DeliveryChallan>>(
      `/delivery-challans${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: DeliveryChallan }>(`/delivery-challans/${id}`),

  create: (data: CreateDeliveryChallanInput) =>
    apiFetch<{ data: DeliveryChallan }>("/delivery-challans", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateDeliveryChallanInput) =>
    apiFetch<{ data: DeliveryChallan }>(`/delivery-challans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/delivery-challans/${id}`, {
      method: "DELETE",
    }),

  getNextNumber: () =>
    apiFetch<{ data: { challanNumber: string } }>(
      "/delivery-challans/next-number",
    ),

  convertToOpen: (id: string) =>
    apiFetch<{ data: DeliveryChallan }>(
      `/delivery-challans/${id}/convert-to-open`,
      { method: "POST" },
    ),

  markAsDelivered: (id: string) =>
    apiFetch<{ data: DeliveryChallan }>(
      `/delivery-challans/${id}/mark-delivered`,
      { method: "POST" },
    ),

  markAsReturned: (id: string) =>
    apiFetch<{ data: DeliveryChallan }>(
      `/delivery-challans/${id}/mark-returned`,
      { method: "POST" },
    ),
};
