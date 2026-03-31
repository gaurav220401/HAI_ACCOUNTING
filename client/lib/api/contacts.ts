import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ContactType = "Customer" | "Vendor" | "Both";
export type TaxTreatment =
  | "Taxable" | "TaxExempt" | "ReverseCharge" | "SEZ"
  | "Overseas" | "Composition" | "UIN";

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
  department?: string;
  skypeName?: string;
  photoUrl?: string;
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

export interface ContactDocument {
  name: string;
  url: string;
  publicId: string;
  size?: number;
  mimeType?: string;
}

export interface ContactComment {
  _id: string;
  text: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface ActivityEvent {
  type: "contact_created" | "expense_added" | string;
  timestamp: string;
  description: string;
  amount?: number;
  currency?: string;
  ref?: string;
  userName?: string;
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
  currency?: string;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  contactPersons?: ContactPerson[];
  bankDetails?: BankDetail[];
  salesPersonId?: string;
  reportingTags?: string[];
  notes?: string;
  comments?: ContactComment[];
  portalEnabled?: boolean;
  // Extra / social
  websiteUrl?: string;
  department?: string;
  designation?: string;
  twitterHandle?: string;
  skypeName?: string;
  facebookUrl?: string;
  // Documents
  documents?: ContactDocument[];
  isActive: boolean;
  legalComplianceLocked?: boolean;
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
  language?: string;
  // Financial
  taxTreatment?: TaxTreatment;
  placeOfSupply?: string;
  paymentTermsId?: string;
  accountsPayableId?: string;
  openingBalance?: number;
  tdsCategory?: string;
  msmeRegistered?: boolean;
  currency?: string;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  contactPersons?: ContactPerson[];
  bankDetails?: BankDetail[];
  salesPersonId?: string;
  reportingTags?: string[];
  notes?: string;
  portalEnabled?: boolean;
  legalComplianceLocked?: boolean;
  // Extra / social
  websiteUrl?: string;
  department?: string;
  designation?: string;
  twitterHandle?: string;
  skypeName?: string;
  facebookUrl?: string;
  // Documents
  documents?: ContactDocument[];
  isActive?: boolean;
}

export type UpdateContactInput = Partial<CreateContactInput> & { isActive?: boolean };

export interface ContactListParams extends ListParams {
  type?: ContactType | "All";
  search?: string;
  includeInactive?: boolean;
}
// ─── GSTIN Lookup ────────────────────────────────────────────────────────

export interface GstinAddress {
  attention?: string;
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface GstinLookupResult {
  gstin: string;
  companyName: string;
  legalName: string;
  taxpayerType: string;
  gstinStatus: string;
  registrationDate: string;
  cancellationDate: string;
  pan: string;
  stateCode: string;
  state: string;
  addressType: string;
  addressString: string;
  address: GstinAddress;
  additionalAddresses: (GstinAddress & { type?: string; addressString?: string })[];
  naturalBusinessActivities: string[];
  companyType: string;
  eInvoiceApplicable: string;
}

export interface GstinLookupResponse {
  success: boolean;
  source: "gst-portal" | "local-parse";
  data: GstinLookupResult;
}

export interface GstinCaptchaResponse {
  success: boolean;
  data: {
    captchaImage: string;
    captchaCookie: string;
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

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

  clone: (id: string) =>
    apiFetch<{ data: Contact }>(`/contacts/${id}/clone`, { method: "POST" }),

  mergeVendors: (sourceVendorId: string, targetVendorId: string) =>
    apiFetch<{ success: boolean; data: { sourceVendorId: string; targetVendorId: string } }>(`/contacts/${sourceVendorId}/merge`, {
      method: "POST",
      body: JSON.stringify({ targetVendorId }),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/contacts/${id}`, { method: "DELETE" }),

  addComment: (id: string, text: string) =>
    apiFetch<{ data: ContactComment[] }>(`/contacts/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getActivity: (id: string) =>
    apiFetch<{ success: boolean; data: ActivityEvent[] }>(`/contacts/${id}/activity`),

  /** Fetch a fresh CAPTCHA image + cookie from the GST portal */
  getGstinCaptcha: () =>
    apiFetch<GstinCaptchaResponse>("/gstin/captcha"),

  /**
   * Lookup GSTIN details from the real GST portal.
   * captcha + captchaCookie come from getGstinCaptcha().
   */
  lookupGstin: (gstin: string, captcha: string, captchaCookie: string) =>
    apiFetch<GstinLookupResponse>("/gstin/lookup", {
      method: "POST",
      body: JSON.stringify({ gstin: gstin.toUpperCase(), captcha, captchaCookie }),
    }),
};
