import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

export type SalesOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "INVOICED"
  | "PARTIALLY_INVOICED"
  | "CLOSED"
  | "OVERDUE";

export interface SalesOrderLineItemInput {
  itemId: string;
  description?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxId?: string | null;
  amount: number;
}

export interface SalesOrderLineItem {
  _id?: string;
  itemId?: string | { _id: string; name: string; sku?: string } | null;
  description?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  amount: number;
}

export interface SalesOrder {
  _id: string;
  organizationId: string;
  customerId:
    | string
    | {
        _id: string;
        displayName: string;
        companyName?: string;
        email?: string;
      };
  salesOrderNumber: string;
  reference?: string;
  orderDate: string;
  expectedShipmentDate?: string | null;
  paymentTermsId?:
    | string
    | { _id: string; name: string; netDays?: number }
    | null;
  deliveryMethod?: string;
  salesPersonId?: string | { _id: string; name: string } | null;
  lineItems: SalesOrderLineItem[];
  subTotal: number;
  shippingCharges: number;
  adjustment: number;
  total: number;
  notes?: string;
  terms?: string;
  status: SalesOrderStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesOrderInput {
  customerId: string;
  salesOrderNumber: string;
  reference?: string;
  orderDate: string;
  expectedShipmentDate?: string;
  paymentTermsId?: string;
  deliveryMethod?: string;
  salesPersonId?: string;
  lineItems: SalesOrderLineItemInput[];
  shippingCharges?: number;
  adjustment?: number;
  notes?: string;
  terms?: string;
  status?: SalesOrderStatus;
}

export type UpdateSalesOrderInput = Partial<CreateSalesOrderInput>;

export interface SalesOrderConvertToInvoiceResponse {
  _id?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

export interface SalesOrderListParams extends ListParams {
  status?: SalesOrderStatus;
}

export const salesOrderApi = {
  list: (params?: SalesOrderListParams) =>
    apiFetch<PaginatedResponse<SalesOrder>>(`/sales-orders${buildQuery(params || {})}`),

  getById: (id: string) => apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}`),

  create: (data: CreateSalesOrderInput) =>
    apiFetch<{ data: SalesOrder }>("/sales-orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateSalesOrderInput) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/sales-orders/${id}`, { method: "DELETE" }),

  convertToInvoice: (id: string, dueDate?: string) =>
    apiFetch<{ data: SalesOrderConvertToInvoiceResponse }>(
      `/sales-orders/${id}/convert-to-invoice`,
      {
      method: "POST",
      body: JSON.stringify(dueDate ? { dueDate } : {}),
      },
    ),
};
