import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type PurchaseOrderStatus = "Draft" | "Open" | "Billed" | "Closed" | "Canceled";
export type DiscountLevel = "transaction" | "line_item";

export interface PurchaseOrderLineItem {
  _id?: string;
  isHeader?: boolean;
  headerText?: string;
  itemId?: string | { _id: string; name: string; sku?: string; costPrice: number } | null;
  name: string;
  accountId?: string | { _id: string; name: string; accountType: string } | null;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  amount: number;
}

export interface PurchaseOrder {
  _id: string;
  organizationId: string;
  vendorId: any;
  deliveryAddressType: "Organization" | "Customer";
  deliveryCustomerId?: any;
  purchaseOrderNumber: string;
  referenceNumber?: string;
  purchaseOrderDate: string;
  deliveryDate?: string | null;
  paymentTermsId?: any;
  shipmentPreference?: string;
  discountLevel: DiscountLevel;
  discountAccountId?: any;
  lineItems: PurchaseOrderLineItem[];
  subTotal: number;
  discountPercent: number;
  discountAmount: number;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: any;
  tcsId?: any;
  taxAmount: number;
  tcsAmount?: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  comments?: {
    author: string;
    text: string;
    time: string;
    isSystem: boolean;
  }[];
  status: PurchaseOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderInput {
  vendorId?: string | null;
  deliveryAddressType?: "Organization" | "Customer";
  deliveryCustomerId?: string | null;
  purchaseOrderNumber?: string;
  referenceNumber?: string;
  purchaseOrderDate: string;
  deliveryDate?: string | null;
  paymentTermsId?: string | null;
  shipmentPreference?: string;
  discountLevel?: DiscountLevel;
  discountAccountId?: string | null;
  lineItems?: Omit<PurchaseOrderLineItem, "_id">[];
  discountPercent?: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  taxAmount?: number;
  tcsAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status?: PurchaseOrderStatus;
}

export type UpdatePurchaseOrderInput = Partial<CreatePurchaseOrderInput>;

export interface SendPurchaseOrderEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  attachPurchaseOrderPdf?: boolean;
  attachments?: {
    filename: string;
    path: string;
  }[];
}

export const purchaseOrderApi = {
  getNextNumber: () =>
    apiFetch<{ data: { purchaseOrderNumber: string } }>("/purchase-orders/next-number"),

  list: (params?: ListParams & { 
    status?: string; 
    vendorId?: string;
    poNumber?: string;
    referenceNumber?: string;
    dateStart?: string;
    dateEnd?: string;
    deliveryStart?: string;
    deliveryEnd?: string;
    amountMin?: number;
    amountMax?: number;
    itemNameId?: string;
    accountId?: string;
  }) => {
    const qs = buildQuery({ ...params });
    return apiFetch<PaginatedResponse<PurchaseOrder>>(`/purchase-orders${qs}`);
  },

  getOne: (id: string) =>
    apiFetch<{ data: PurchaseOrder }>(`/purchase-orders/${id}`),

  create: (data: CreatePurchaseOrderInput) =>
    apiFetch<{ data: PurchaseOrder }>("/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  update: (id: string, data: UpdatePurchaseOrderInput) =>
    apiFetch<{ data: PurchaseOrder }>(`/purchase-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  sendEmail: (id: string, data: SendPurchaseOrderEmailInput) =>
    apiFetch<{ success: boolean; message: string }>(`/purchase-orders/${id}/send-email`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  downloadPdf: (id: string) =>
    apiFetchBlob(`/purchase-orders/${id}/pdf`),

  clone: (id: string) =>
    apiFetch<{ data: PurchaseOrder }>(`/purchase-orders/${id}/clone`, { method: "POST" }),

  convertToBill: (id: string) =>
    apiFetch<{ data: PurchaseOrder }>(`/purchase-orders/${id}/convert-to-bill`, { method: "POST" }),

  addComment: (id: string, text: string) =>
    apiFetch<{ data: any }>(`/purchase-orders/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
      headers: { "Content-Type": "application/json" },
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/purchase-orders/${id}`, { method: "DELETE" }),
};
