import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type ContactType = "Customer" | "Vendor" | "Both";
export type TaxTreatment =
  | "Registered" | "Unregistered" | "Consumer" | "Overseas"
  | "SpecialEconomicZone" | "DeemedExport";

export interface Address {
  attention?: string;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  fax?: string;
}

export interface ContactPerson {
  salutation?: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email?: string;
  workPhone?: string;
  mobile?: string;
  designation?: string;
  isPrimary?: boolean;
}

export interface BankDetail {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  branchName?: string;
  upiId?: string;
  isPrimary?: boolean;
}

export interface Contact {
  _id: string;
  orgId: string;
  contactType: ContactType;
  // Primary contact
  salutation?: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  language?: string;
  // Financial
  taxTreatment?: TaxTreatment;
  placeOfSupply?: string;
  paymentTermsId?: string;
  accountsPayableId?: string;
  openingBalance?: number;
  tdsCategory?: string;
  msmeRegistered?: boolean;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  contactPersons?: ContactPerson[];
  bankDetails?: BankDetail[];
  salesPersonId?: string;
  currency?: string;
  reportingTags?: string[];
  notes?: string;
  portalEnabled?: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  contactType: ContactType;
  // Primary contact
  salutation?: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  language?: string;
  // Financial
  taxTreatment?: TaxTreatment;
  placeOfSupply?: string;
  paymentTermsId?: string;
  accountsPayableId?: string;
  openingBalance?: number;
  tdsCategory?: string;
  msmeRegistered?: boolean;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  contactPersons?: ContactPerson[];
  bankDetails?: BankDetail[];
  salesPersonId?: string;
  currency?: string;
  reportingTags?: string[];
  notes?: string;
  portalEnabled?: boolean;
}

export type UpdateContactInput = Partial<CreateContactInput>;

export interface ContactListParams extends ListParams {
  type?: ContactType | "All";
  search?: string;
}

// ─── API ────────────────────────────────────────────────────────────────

export const contactApi = {
  list: (params?: ContactListParams) =>
    apiFetch<PaginatedResponse<Contact>>(`/contacts${buildQuery(params || {})}`),

  getById: (id: string) =>
    apiFetch<{ data: Contact }>(`/contacts/${id}`),

  create: (data: CreateContactInput) =>
    apiFetch<{ data: Contact }>("/contacts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateContactInput) =>
    apiFetch<{ data: Contact }>(`/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/contacts/${id}`, { method: "DELETE" }),
};
