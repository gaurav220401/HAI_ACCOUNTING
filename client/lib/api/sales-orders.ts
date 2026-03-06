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

export interface SalesOrder {
  _id: string;
  organizationId: string;
  customerId: any;
  salesOrderNumber: string;
  reference?: string;
  orderDate: string;
  expectedShipmentDate?: string | null;
  paymentTermsId?: any;
  deliveryMethod?: string;
  salesPersonId?: any;
  lineItems: Array<any>;
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
    apiFetch<{ data: any }>(`/sales-orders/${id}/convert-to-invoice`, {
      method: "POST",
      body: JSON.stringify(dueDate ? { dueDate } : {}),
    }),
};
