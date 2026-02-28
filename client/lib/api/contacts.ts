import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────

export type ContactType = "Customer" | "Vendor" | "Both";
export type TaxTreatment =
  | "Registered" | "Unregistered" | "Consumer" | "Overseas"
  | "SpecialEconomicZone" | "DeemedExport";

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface ContactPerson {
  name: string;
  email?: string;
  phone?: string;
  designation?: string;
  isPrimary?: boolean;
}

export interface Contact {
  _id: string;
  orgId: string;
  contactType: ContactType;
  displayName: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  taxTreatment?: TaxTreatment;
  placeOfSupply?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  contactPersons?: ContactPerson[];
  openingBalance?: number;
  paymentTermsId?: string;
  salesPersonId?: string;
  currency?: string;
  reportingTags?: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactInput {
  contactType: ContactType;
  displayName: string;
  companyName?: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  taxTreatment?: TaxTreatment;
  placeOfSupply?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  contactPersons?: ContactPerson[];
  openingBalance?: number;
  paymentTermsId?: string;
  salesPersonId?: string;
  currency?: string;
  reportingTags?: string[];
  notes?: string;
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
