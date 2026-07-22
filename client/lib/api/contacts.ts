import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ContactType = "Customer" | "Vendor" | "Both";
export type TaxTreatment =
  | "Registered Business - Regular"
  | "Registered Business - Composition"
  | "Unregistered Business"
  | "Consumer"
  | "Overseas"
  | "Special Economic Zone"
  | "Deemed Export"
  | "Tax Deductor"
  | "SEZ Developer"
  | "Input Service Distributor"
  // legacy values retained for backward compatibility
  | "Taxable"
  | "TaxExempt"
  | "ReverseCharge"
  | "SEZ"
  | "Composition"
  | "UIN";

export type ContactTaxPreference = "Taxable" | "Tax Exempt";

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
  taxPreference?: ContactTaxPreference;
  exemptionReason?: string;
  placeOfSupply?: string;
  businessLegalName?: string;
  businessTradeName?: string;
  paymentTermsId?: string;
  accountsReceivableId?: string;
  accountsPayableId?: string;
  openingBalance?: number;
  outstandingReceivable?: number;
  outstandingPayable?: number;
  unusedCredits?: number;
  tdsCategory?: string;
  msmeRegistered?: boolean;
  currency?: string;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  linkedContactId?: string;
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
  statementTemplate?: Record<string, unknown>;
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
  taxPreference?: ContactTaxPreference;
  exemptionReason?: string;
  placeOfSupply?: string;
  businessLegalName?: string;
  businessTradeName?: string;
  paymentTermsId?: string;
  accountsReceivableId?: string;
  accountsPayableId?: string;
  openingBalance?: number;
  tdsCategory?: string;
  msmeRegistered?: boolean;
  currency?: string;
  // Address
  billingAddress?: Address;
  shippingAddress?: Address;
  // Relations
  linkedContactId?: string;
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

export type UpdateContactInput = Partial<CreateContactInput> & { isActive?: boolean; statementTemplate?: Record<string, unknown> };

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

  mergeCustomers: (sourceCustomerId: string, targetCustomerId: string) =>
    apiFetch<{ success: boolean; data: { sourceVendorId: string; targetVendorId: string } }>(`/contacts/${sourceCustomerId}/merge`, {
      method: "POST",
      body: JSON.stringify({ targetVendorId: targetCustomerId }),
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

  downloadSampleTemplate: (format?: "csv" | "excel", type?: "customer" | "vendor") => {
    const params: Record<string, string> = {};
    if (format) params.format = format;
    if (type) params.type = type;
    return apiFetchBlob(`/contacts/import/template/sample${buildQuery(params)}`);
  },

  downloadBlankTemplate: (format?: "csv" | "excel", type?: "customer" | "vendor") => {
    const params: Record<string, string> = {};
    if (format) params.format = format;
    if (type) params.type = type;
    return apiFetchBlob(`/contacts/import/template/blank${buildQuery(params)}`);
  },

  previewImport: (formData: FormData) =>
    apiFetch<{
      data: {
        totalRows: number;
        readyCount: number;
        overwriteCount: number;
        skipCount: number;
        invalidCount: number;
        previewItems: any[];
      };
    }>("/contacts/import/preview", {
      method: "POST",
      body: formData,
    }),

  executeImport: (formData: FormData) =>
    apiFetch<{
      data: {
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; error: string }>;
      };
    }>("/contacts/import", {
      method: "POST",
      body: formData,
    }),

  exportProtected: (data: {
    fileName: string;
    fileFormat: string;
    password?: string;
    headers: string[];
    rows: any[][];
  }) =>
    apiFetchBlob("/contacts/export-protected", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }),
};
