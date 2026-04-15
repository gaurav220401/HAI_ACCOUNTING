import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type PurchaseReceiveStatus = "Draft" | "Received";

export interface PurchaseReceiveLineItem {
  purchaseOrderLineItemId?: string | null;
  itemId?: string | null;
  name: string;
  description?: string;
  quantityToReceive: number;
  quantityReceived: number;
  rate: number;
  unit?: string;
}

export interface PurchaseReceive {
  _id: string;
  organizationId: string;
  vendorId: any;
  purchaseOrderId: any;
  purchaseOrderNumber: string;
  purchaseReceiveNumber: string;
  receivedDate: string;
  notes?: string;
  lineItems: PurchaseReceiveLineItem[];
  totalQuantityReceived: number;
  status: PurchaseReceiveStatus;
  linkedBillIds?: any[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseReceiveInput {
  purchaseOrderId: string;
  purchaseReceiveNumber?: string;
  receivedDate: string;
  notes?: string;
  lineItems: PurchaseReceiveLineItem[];
  status?: PurchaseReceiveStatus;
}

export interface PurchaseReceiveFromPoLine {
  purchaseOrderLineItemId?: string | null;
  itemId?: string | null;
  name: string;
  description?: string;
  quantityOrdered: number;
  quantityAlreadyReceived: number;
  quantityToReceive: number;
  rate: number;
  unit?: string;
  isHeader?: boolean;
  headerText?: string;
}

export const purchaseReceiveApi = {
  getNextNumber: () =>
    apiFetch<{ data: { purchaseReceiveNumber: string } }>("/purchase-receives/next-number"),

  list: (params?: ListParams & { purchaseOrderId?: string; status?: string }) => {
    const qs = buildQuery({ ...params });
    return apiFetch<PaginatedResponse<PurchaseReceive>>(`/purchase-receives${qs}`);
  },

  getOne: (id: string) =>
    apiFetch<{ data: PurchaseReceive }>(`/purchase-receives/${id}`),

  getFromPurchaseOrder: (purchaseOrderId: string) =>
    apiFetch<{ data: { purchaseOrder: any; linkedBills: any[]; lineItems: PurchaseReceiveFromPoLine[] } }>(
      `/purchase-receives/from-purchase-order?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`,
    ),

  create: (data: CreatePurchaseReceiveInput) =>
    apiFetch<{ data: PurchaseReceive }>("/purchase-receives", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),
};
