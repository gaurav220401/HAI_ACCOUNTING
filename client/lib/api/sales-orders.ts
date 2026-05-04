import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";
import type { CreatePurchaseOrderInput } from "./purchase-orders";

export type SalesOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "INVOICED"
  | "PARTIALLY_INVOICED"
  | "CLOSED"
  | "OVERDUE"
  | "VOID";

export type SalesOrderInvoiceStatus = "Not Invoiced" | "Invoiced";
export type SalesOrderShipmentStatus = "Pending" | "Shipped" | "Delivered";

export interface SalesOrderLineItemInput {
  itemId: string;
  name?: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxId?: string | null;
  taxPercent?: number;
  taxAmount?: number;
  amount: number;
}

export interface SalesOrderLineItem {
  _id?: string;
  itemId?: string | { _id: string; name: string; sku?: string; hsnSacCode?: string } | null;
  name?: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxId?: string | { _id: string; name: string; rate?: number } | null;
  taxPercent?: number;
  taxAmount?: number;
  qtyInvoiced?: number;
  qtyShipped?: number;
  qtyToBeInvoiced?: number;
  qtyToBeShipped?: number;
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
  invoiceStatus: SalesOrderInvoiceStatus;
  shipmentStatus: SalesOrderShipmentStatus;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: string | { _id: string; taxName: string; rate: number } | null;
  tcsId?: string | { _id: string; taxName: string; rate: number } | null;
  taxAmount?: number;
  tcsAmount?: number;
  invoiceId?: string | { _id: string; invoiceNumber?: string } | null;
  linkedDocuments?: {
    invoices: Array<{
      _id: string;
      invoiceNumber: string;
      status: string;
      total: number;
      balanceDue: number;
      invoiceDate: string;
    }>;
    packages: Array<{
      _id: string;
      packageSlipNumber: string;
      date: string;
      status: string;
    }>;
    deliveryChallans: Array<{
      _id: string;
      challanNumber: string;
      challanDate: string;
      status: string;
    }>;
    moveOrders: Array<{
      _id: string;
      orderNumber: string;
      date: string;
      status: string;
    }>;
  };
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
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  taxAmount?: number;
  tcsAmount?: number;
}

export type UpdateSalesOrderInput = Partial<CreateSalesOrderInput>;

export interface SalesOrderConvertToInvoiceResponse {
  _id?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

export interface SalesOrderConvertToPurchaseOrderResponse {
  _id?: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
}

export interface SalesOrderPurchaseOrderDraftResponse extends CreatePurchaseOrderInput {
  vendor?: any;
  sourceSalesOrderId?: string;
  sourceSalesOrderNumber?: string;
}

export interface SalesOrderListParams extends ListParams {
  status?: SalesOrderStatus;
  customerId?: string;
}

export interface SendSalesOrderEmailInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachPdf?: boolean;
}

export const salesOrderApi = {
  list: (params?: SalesOrderListParams) =>
    apiFetch<PaginatedResponse<SalesOrder>>(
      `/sales-orders${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}`),

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

  instantInvoice: (id: string) =>
    apiFetch<{ data: SalesOrderConvertToInvoiceResponse }>(
      `/sales-orders/${id}/instant-invoice`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    ),

  purchaseOrderDraft: (id: string) =>
    apiFetch<{ data: SalesOrderPurchaseOrderDraftResponse }>(
      `/sales-orders/${id}/purchase-order-draft`,
    ),

  convertToPurchaseOrder: (
    id: string,
    options?: { vendorId?: string; copyDescriptions?: boolean },
  ) =>
    apiFetch<{ data: SalesOrderConvertToPurchaseOrderResponse }>(
      `/sales-orders/${id}/convert-to-purchase-order`,
      {
        method: "POST",
        body: JSON.stringify(options || {}),
      },
    ),

  sendEmail: (id: string, data: SendSalesOrderEmailInput) =>
    apiFetch<{ success: boolean; message: string }>(
      `/sales-orders/${id}/send-email`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  downloadPdf: (id: string) => apiFetchBlob(`/sales-orders/${id}/pdf`),

  updateShipment: (id: string, shipmentStatus: SalesOrderShipmentStatus) =>
    apiFetch<{ data: SalesOrder }>(
      `/sales-orders/${id}/update-shipment`,
      {
        method: "POST",
        body: JSON.stringify({ shipmentStatus }),
      },
    ),

  markShipmentFulfilled: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}/mark-shipment-fulfilled`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  dropship: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}/dropship`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  cancelItems: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}/cancel-items`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  voidOrder: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}/void`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  clone: (id: string) =>
    apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}/clone`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
