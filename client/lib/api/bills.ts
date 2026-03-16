import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type BillStatus = "Draft" | "Open" | "Overdue" | "Partially Paid" | "Paid" | "Void";
export type DiscountLevel = "transaction" | "line_item";

export interface BillLineItem {
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
  customerId?: string | null;
}

export interface Bill {
  _id: string;
  organizationId: string;
  vendorId: any;
  billNumber: string;
  referenceNumber?: string;
  orderNumber?: string;
  billDate: string;
  dueDate?: string | null;
  paymentTermsId?: any;
  accountsPayableId?: any;
  subject?: string;
  discountLevel: DiscountLevel;
  discountAccountId?: any;
  lineItems: BillLineItem[];
  subTotal: number;
  discountPercent: number;
  discountAmount: number;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: any;
  tcsId?: any;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  balanceDue: number;
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  comments?: {
    author: string;
    text: string;
    time: string;
    isSystem: boolean;
  }[];
  status: BillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillInput {
  vendorId: string;
  billNumber?: string;
  referenceNumber?: string;
  orderNumber?: string;
  billDate: string;
  dueDate?: string | null;
  paymentTermsId?: string | null;
  accountsPayableId?: string | null;
  subject?: string;
  discountLevel?: DiscountLevel;
  discountAccountId?: string | null;
  lineItems?: Omit<BillLineItem, "_id">[];
  discountPercent?: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status?: BillStatus;
  purchaseOrderIds?: string[];
}

export type UpdateBillInput = Partial<CreateBillInput>;

export interface BillSourcePurchaseOrderLineItem {
  _id?: string;
  isHeader?: boolean;
  headerText?: string;
  itemId?: string | { _id: string; name?: string; costPrice?: number; purchaseAccountId?: string } | null;
  name: string;
  accountId?: string | { _id: string; name: string; accountType: string } | null;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  amount: number;
}

export interface BillSourcePurchaseOrder {
  _id: string;
  purchaseOrderNumber: string;
  purchaseOrderDate: string;
  total: number;
  lineItems: BillSourcePurchaseOrderLineItem[];
}

export const billApi = {
  getNextNumber: () =>
    apiFetch<{ data: { billNumber: string } }>("/bills/next-number"),

  list: (params?: ListParams & { 
    status?: string; 
    vendorId?: string;
    billNumber?: string;
    referenceNumber?: string;
    dateStart?: string;
    dateEnd?: string;
    dueStart?: string;
    dueEnd?: string;
    amountMin?: number;
    amountMax?: number;
    itemNameId?: string;
    accountId?: string;
  }) => {
    const qs = buildQuery({ ...params });
    return apiFetch<PaginatedResponse<Bill>>(`/bills${qs}`);
  },

  getOne: (id: string) =>
    apiFetch<{ data: Bill }>(`/bills/${id}`),

  getOpenPurchaseOrders: (vendorId: string) =>
    apiFetch<{ data: BillSourcePurchaseOrder[] }>(`/bills/open-purchase-orders?vendorId=${encodeURIComponent(vendorId)}`),

  create: (data: CreateBillInput) =>
    apiFetch<{ data: Bill }>("/bills", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  update: (id: string, data: UpdateBillInput) =>
    apiFetch<{ data: Bill }>(`/bills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/bills/${id}`, { method: "DELETE" }),
};
