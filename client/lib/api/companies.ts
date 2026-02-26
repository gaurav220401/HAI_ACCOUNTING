import {
  apiFetch,
  buildQuery,
  type ListParams,
  type PaginatedResponse,
} from "./client";

// ─── Company API ────────────────────────────────────────────────────────

export interface Company {
  _id: string;
  name: string;
  abbr: string;
  defaultCurrency: string;
  country: string;
  chartOfAccounts: string;
  domain: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  defaultAccounts: Record<string, string | null>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  name: string;
  abbr: string;
  defaultCurrency?: string;
  country?: string;
  chartOfAccounts?: string;
  domain?: string;
  fiscalYearStart: string;
  fiscalYearEnd: string;
}

export interface UpdateCompanyInput extends Partial<CreateCompanyInput> {}

export const companyApi = {
  list: (params?: ListParams) =>
    apiFetch<PaginatedResponse<Company>>(
      `/companies${buildQuery(params || {})}`,
    ),

  getById: (id: string) => apiFetch<{ data: Company }>(`/companies/${id}`),

  create: (data: CreateCompanyInput) =>
    apiFetch<{ data: Company }>("/companies", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: UpdateCompanyInput) =>
    apiFetch<{ data: Company }>(`/companies/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/companies/${id}`, {
      method: "DELETE",
    }),

  setActive: (id: string) =>
    apiFetch<{ data: { activeCompany: string } }>(
      `/companies/${id}/set-active`,
      { method: "PUT" },
    ),
};
