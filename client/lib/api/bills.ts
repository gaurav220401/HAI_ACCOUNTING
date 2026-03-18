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
  sourceOfSupply?: string;
  destinationOfSupply?: string;
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
  tcsAmount?: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  amountPaid?: number;
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
  payment_applications?: {
    _id: string;
    amount: number;
    applied_date: string;
    payment: {
      _id: string;
      payment_number: string;
      payment_date: string;
      payment_mode?: string;
      status?: string;
    } | null;
  }[];
  vendor_credit_applications?: {
    _id: string;
    amount: number;
    applied_date: string;
    vendor_credit: {
      _id: string;
      vendorCreditNumber: string;
      vendorCreditDate: string;
      status?: string;
    } | null;
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
  sourceOfSupply?: string;
  destinationOfSupply?: string;
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
  tcsAmount?: number;
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

  void: (id: string, reason?: string) =>
    apiFetch<{ data: Bill }>(`/bills/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      headers: { "Content-Type": "application/json" },
    }),

  recordPayment: (id: string, data: any) =>
    apiFetch<{ data: any }>(`/bills/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  clone: (id: string) =>
    apiFetch<{ data: Bill }>(`/bills/${id}/clone`, {
      method: "POST",
    }),

  addComment: (id: string, text: string, isSystem = false) =>
    apiFetch<{ data: any }>(`/bills/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text, isSystem }),
      headers: { "Content-Type": "application/json" },
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/bills/${id}`, { method: "DELETE" }),
};
