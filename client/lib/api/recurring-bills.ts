import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";
import type { Bill, BillLineItem } from "./bills";

export type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type RecurringStatus = "Active" | "Stopped" | "Expired";

export interface RecurringBill {
  _id: string;
  organizationId: string;
  profileName: string;
  vendorId: any;
  frequency: RecurringFrequency;
  repeatEvery: number;
  startDate: string;
  neverExpires: boolean;
  endsOn?: string | null;
  paymentTermsId?: any;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  subject?: string;
  orderNumber?: string;
  isReverseCharge: boolean;
  discountLevel: "transaction" | "line_item";
  discountAccountId?: any;
  discountPercent: number;
  discountAmount: number;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: any;
  tcsId?: any;
  taxAmount: number;
  tcsAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  subTotal: number;
  total: number;
  lineItems: BillLineItem[];
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status: RecurringStatus;
  lastBillDate?: string | null;
  nextBillDate?: string | null;
  generatedBillIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringBillInput {
  profileName: string;
  vendorId: string;
  frequency: RecurringFrequency;
  repeatEvery?: number;
  startDate: string;
  neverExpires?: boolean;
  endsOn?: string | null;
  paymentTermsId?: string | null;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  subject?: string;
  orderNumber?: string;
  isReverseCharge?: boolean;
  discountLevel?: "transaction" | "line_item";
  discountAccountId?: string | null;
  discountPercent?: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: string | null;
  tcsId?: string | null;
  taxAmount?: number;
  tcsAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  lineItems?: Omit<BillLineItem, "_id">[];
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
}

export type UpdateRecurringBillInput = Partial<CreateRecurringBillInput>;

export interface RecurringBillListParams extends ListParams {
  status?: RecurringStatus;
  search?: string;
  vendorId?: string;
}

export const recurringBillApi = {
  list: (params?: RecurringBillListParams) =>
    apiFetch<PaginatedResponse<RecurringBill>>(`/recurring-bills${buildQuery(params || {})}`),

  getById: (id: string) =>
    apiFetch<{ data: RecurringBill }>(`/recurring-bills/${id}`),

  getBills: (id: string) =>
    apiFetch<{ data: Bill[] }>(`/recurring-bills/${id}/bills`),

  create: (data: CreateRecurringBillInput) =>
    apiFetch<{ data: RecurringBill }>("/recurring-bills", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateRecurringBillInput) =>
    apiFetch<{ data: RecurringBill }>(`/recurring-bills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  stop: (id: string) =>
    apiFetch<{ data: RecurringBill }>(`/recurring-bills/${id}/stop`, { method: "POST" }),

  resume: (id: string) =>
    apiFetch<{ data: RecurringBill }>(`/recurring-bills/${id}/resume`, { method: "POST" }),

  createBillNow: (id: string) =>
    apiFetch<{ data: Bill }>(`/recurring-bills/${id}/create-bill`, { method: "POST" }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/recurring-bills/${id}`, { method: "DELETE" }),
};
