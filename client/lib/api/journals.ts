import { apiFetch, apiFetchBlob, buildQuery } from "./client";
import type { ListParams, PaginatedResponse } from "./client";

export type JournalStatus = "Draft" | "Posted" | "Voided";

export interface JournalLine {
  accountId: string | { _id: string; name: string; accountType?: string };
  debit: number;
  credit: number;
  narration?: string;
}

export interface Journal {
  _id: string;
  organizationId: string;
  journalNumber: string;
  date: string;
  vendorId?:
    | string
    | { _id: string; displayName?: string; companyName?: string }
    | null;
  description?: string;
  referenceNumber?: string;
  lineItems: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: JournalStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalListParams extends ListParams {
  vendorId?: string;
  status?: JournalStatus;
  search?: string;
  dateStart?: string;
  dateEnd?: string;
}

export interface CreateJournalInput {
  date: string;
  journalNumber?: string;
  vendorId?: string | null;
  description?: string;
  referenceNumber?: string;
  lineItems: Array<{
    accountId: string;
    debit: number;
    credit: number;
    narration?: string;
  }>;
  notes?: string;
  status?: JournalStatus;
}

export type UpdateJournalInput = Partial<CreateJournalInput>;

export type JournalNumberingMode = "auto" | "manual";

export interface JournalNumberingPreferences {
  mode: JournalNumberingMode;
  prefix: string;
  nextNumber: number;
  previewJournalNumber: string;
}

export interface UpdateJournalNumberingPreferencesInput {
  mode?: JournalNumberingMode;
  prefix?: string;
  nextNumber?: number;
}

export const journalApi = {
  list: (params?: JournalListParams) =>
    apiFetch<PaginatedResponse<Journal>>(
      `/journals${buildQuery(params || {})}`,
    ),

  getNumberingPreferences: () =>
    apiFetch<{ data: JournalNumberingPreferences }>(
      "/journals/numbering-preferences",
    ),

  updateNumberingPreferences: (data: UpdateJournalNumberingPreferencesInput) =>
    apiFetch<{ data: JournalNumberingPreferences }>(
      "/journals/numbering-preferences",
      {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      },
    ),

  getOne: (id: string) => apiFetch<{ data: Journal }>(`/journals/${id}`),

  create: (data: CreateJournalInput) =>
    apiFetch<{ data: Journal }>("/journals", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  update: (id: string, data: UpdateJournalInput) =>
    apiFetch<{ data: Journal }>(`/journals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    }),

  post: (id: string) =>
    apiFetch<{ data: Journal }>(`/journals/${id}/post`, { method: "POST" }),

  void: (id: string) =>
    apiFetch<{ data: Journal }>(`/journals/${id}/void`, { method: "POST" }),

  remove: (id: string) =>
    apiFetch<{ success: boolean; message: string }>(`/journals/${id}`, {
      method: "DELETE",
    }),

  downloadSampleTemplate: (format?: "csv" | "excel") =>
    apiFetchBlob(`/journals/import/template/sample${format ? `?format=${format}` : ""}`),

  downloadBlankTemplate: (format?: "csv" | "excel") =>
    apiFetchBlob(`/journals/import/template/blank${format ? `?format=${format}` : ""}`),

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
    }>("/journals/import/preview", {
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
    }>("/journals/import", {
      method: "POST",
      body: formData,
    }),
};
