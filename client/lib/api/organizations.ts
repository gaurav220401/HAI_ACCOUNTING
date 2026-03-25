import {
  apiFetch,
  buildQuery,
  type ListParams,
} from "./client";

// ─── Organization API ───────────────────────────────────────────────────

export interface Organization {
  _id: string;
  owner?: string;          // userId of the creator / owner
  members?: string[];      // userIds of all members
  name: string;
  industry: string;
  baseCurrency: string;
  fiscalYearStart: number; // 1-12
  country: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  language: string;
  taxId?: string;
  logo?: string;
  email?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  portalSettings?: {
    enabled: boolean;
    subdomain?: string;
  };
  defaultAccounts?: Record<string, string | null>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationInput {
  name: string;
  industry?: string;
  baseCurrency?: string;
  fiscalYearStart?: number;
  country?: string;
  timezone?: string;
  dateFormat?: string;
  numberFormat?: string;
  language?: string;
  taxId?: string;
  logo?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

export interface UpdateOrganizationInput
  extends Partial<CreateOrganizationInput> {}

export const organizationApi = {
  list: (params?: ListParams) =>
    apiFetch<{ success: boolean; data: Organization[] }>(
      `/organizations${buildQuery(params || {})}`,
    ),

  getById: (id: string) =>
    apiFetch<{ data: Organization }>(`/organizations/${id}`),

  create: (data: CreateOrganizationInput) =>
    apiFetch<{ data: Organization }>("/organizations", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateOrganizationInput) =>
    apiFetch<{ data: Organization }>(`/organizations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/organizations/${id}`, {
      method: "DELETE",
    }),

  setActive: (id: string) =>
    apiFetch<{ data: { organizationId: string; organizationName: string } }>(
      `/organizations/${id}/set-active`,
      { method: "PUT" },
    ),

  /** Invite a user (by email) to join this organization */
  addMember: (id: string, email: string) =>
    apiFetch<{ success: boolean; message: string }>(`/organizations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** Remove a member from an organization (owner only) */
  removeMember: (id: string, userId: string) =>
    apiFetch<{ success: boolean; message: string }>(
      `/organizations/${id}/members/${userId}`,
      { method: "DELETE" },
    ),
};
