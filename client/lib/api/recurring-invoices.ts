import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";
import type {
  DiscountType,
  InvoiceItem,
  InvoiceStatus,
  InvoiceTaxType,
} from "./invoices";
import type { PaymentTerms, SalesPerson, Tax } from "./settings";

export type RecurringInvoiceFrequency =
  | "weekly"
  | "every_10_days"
  | "every_15_days"
  | "monthly";

export type RecurringInvoiceStatus =
  | "active"
  | "paused"
  | "stopped"
  | "completed";

export type RecurringInvoiceDeliveryMode = "draft" | "send";

export interface RecurringInvoiceActivity {
  type:
    | "created"
    | "updated"
    | "paused"
    | "resumed"
    | "stopped"
    | "completed"
    | "invoice_generated"
    | "auto_send_failed";
  message: string;
  invoiceId?: string | null;
  createdAt: string;
}

export interface RecurringInvoiceGeneratedInvoice {
  _id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  total: number;
  balanceDue: number;
  status: InvoiceStatus;
  sentAt?: string;
  paidAt?: string;
  createdAt: string;
}

export interface RecurringInvoice {
  _id: string;
  organizationId: string;
  profileName: string;
  referenceNumber?: string;
  orderNumber?: string;
  customerId:
    | string
    | {
        _id: string;
        displayName: string;
        companyName?: string;
        email?: string;
        phone?: string;
        billingAddress?: {
          street?: string;
          city?: string;
          state?: string;
          country?: string;
        };
      };
  startDate: string;
  endDate?: string | null;
  neverExpires: boolean;
  frequency: RecurringInvoiceFrequency;
  nextRunDate: string;
  lastRunDate?: string | null;
  paymentTermsId?: string | PaymentTerms | null;
  salesPersonId?: string | SalesPerson | null;
  subject?: string;
  items: InvoiceItem[];
  subTotal: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxType: InvoiceTaxType;
  taxId?: string | Tax | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  customerNotes: string;
  termsAndConditions: string;
  emailContacts: string[];
  deliveryMode: RecurringInvoiceDeliveryMode;
  status: RecurringInvoiceStatus;
  generatedInvoiceCount: number;
  lastGeneratedInvoiceId?: string | RecurringInvoiceGeneratedInvoice | null;
  recentActivities: RecurringInvoiceActivity[];
  generatedInvoices?: RecurringInvoiceGeneratedInvoice[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringInvoiceInput {
  profileName: string;
  referenceNumber?: string;
  orderNumber?: string;
  customerId: string;
  startDate: string;
  endDate?: string | null;
  neverExpires?: boolean;
  frequency: RecurringInvoiceFrequency;
  paymentTermsId?: string | null;
  salesPersonId?: string | null;
  subject?: string;
  items: Omit<InvoiceItem, "_id" | "amount" | "taxAmount" | "discountAmount">[];
  discountType?: DiscountType;
  discountValue?: number;
  taxType?: InvoiceTaxType;
  taxId?: string | null;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  emailContacts?: string[];
  deliveryMode?: RecurringInvoiceDeliveryMode;
  status?: RecurringInvoiceStatus;
}

export type UpdateRecurringInvoiceInput = Partial<CreateRecurringInvoiceInput>;

export interface RecurringInvoiceListParams extends ListParams {
  status?: RecurringInvoiceStatus | "All";
}

export const recurringInvoiceApi = {
  list: (params?: RecurringInvoiceListParams) =>
    apiFetch<PaginatedResponse<RecurringInvoice>>(
      `/recurring-invoices${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: RecurringInvoice }>(`/recurring-invoices/${id}`),

  create: (data: CreateRecurringInvoiceInput) =>
    apiFetch<{ data: RecurringInvoice }>("/recurring-invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateRecurringInvoiceInput) =>
    apiFetch<{ data: RecurringInvoice }>(`/recurring-invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/recurring-invoices/${id}`, {
      method: "DELETE",
    }),

  pause: (id: string) =>
    apiFetch<{ data: RecurringInvoice }>(`/recurring-invoices/${id}/pause`, {
      method: "POST",
    }),

  resume: (id: string) =>
    apiFetch<{ data: RecurringInvoice }>(`/recurring-invoices/${id}/resume`, {
      method: "POST",
    }),

  stop: (id: string) =>
    apiFetch<{ data: RecurringInvoice }>(`/recurring-invoices/${id}/stop`, {
      method: "POST",
    }),

  runNow: (id: string) =>
    apiFetch<{
      data: {
        profile: RecurringInvoice;
        invoice: RecurringInvoiceGeneratedInvoice;
      };
      message: string;
    }>(`/recurring-invoices/${id}/run-now`, {
      method: "POST",
    }),
};