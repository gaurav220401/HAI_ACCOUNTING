import { apiFetch, buildQuery } from "./client";
import type { PaginatedResponse, ListParams } from "./client";

const API_BASE =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
    : "/api";

export type DocumentProcessingStatus =
  | "PROCESSING"
  | "PROCESSED"
  | "UNREADABLE"
  | "SCAN_IN_PROGRESS";

export type DocumentInbox = "all" | "files" | "bank_statements";
export type ProcessingMode = "standard" | "advanced";

export interface DocumentFolderPermission {
  principalType: "user" | "role";
  principalId: string;
  accessLevel: "read" | "write";
}

export interface DocumentFolder {
  _id: string;
  name: string;
  visibilityType: "all_users" | "custom";
  permissions: DocumentFolderPermission[];
}

export interface DocumentBankTransaction {
  _id?: string;
  txnDate?: string;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  confidence: number;
  addedToBank: boolean;
}

export interface DocumentItem {
  _id: string;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  source: "manual" | "drag_drop" | "email" | "api";
  processingStatus: DocumentProcessingStatus;
  processingMode: ProcessingMode;
  documentType: "generic" | "invoice" | "receipt" | "bank_statement" | "other";
  uploadedAt: string;
  deletedAt?: string;
  url: string;
  folderId?: { _id: string; name: string } | null;
  uploadedBy?: { _id: string; name?: string; email?: string } | null;
  extraction?: {
    vendorName?: string;
    amount?: number;
    currency?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    confidenceScore?: number;
  };
  bankTransactions: DocumentBankTransaction[];
  links: Array<{ entityType: string; entityId: string }>;
  activityLogs: Array<{ eventType: string; message: string; createdAt: string }>;
  processingLogs: Array<{ stage: string; status: string; message: string; createdAt: string }>;
  emailSender?: string;
  emailSubject?: string;
}

export interface DocumentListParams extends ListParams {
  inbox?: DocumentInbox;
  status?: DocumentProcessingStatus;
  fileType?: string;
  fromDate?: string;
  toDate?: string;
  folderId?: string;
  q?: string;
}

export interface DocumentMailboxInfo {
  mailboxAddress: string;
  isActive: boolean;
  smtpConfigured: boolean;
  pollingEnabled: boolean;
  inferredImapHost?: string;
  inboundReady: boolean;
  forwardingInstructions: string[];
}

export interface DocumentStats {
  all: number;
  files: number;
  bank: number;
}

export const documentsApi = {
  list: (params?: DocumentListParams) =>
    apiFetch<PaginatedResponse<DocumentItem>>(`/documents${buildQuery(params || {})}`),

  getStats: () => apiFetch<{ data: DocumentStats }>("/documents/stats"),

  listTrash: (params?: Pick<DocumentListParams, "q" | "page" | "limit">) =>
    apiFetch<PaginatedResponse<DocumentItem>>(`/documents/trash${buildQuery(params || {})}`),

  getById: (id: string) => apiFetch<{ data: DocumentItem }>(`/documents/${id}`),

  getSignedUrl: (id: string, ttl = 300) =>
    apiFetch<{ data: { url: string; ttl: number } }>(`/documents/${id}/signed-url?ttl=${ttl}`),

  upload: (file: File, opts?: { source?: string; inboxType?: string; processingMode?: ProcessingMode }) => {
    const formData = new FormData();
    formData.append("file", file);
    if (opts?.source) formData.append("source", opts.source);
    if (opts?.inboxType) formData.append("inboxType", opts.inboxType);
    if (opts?.processingMode) formData.append("processingMode", opts.processingMode);
    return apiFetch<{ data: DocumentItem }>("/documents/upload", {
      method: "POST",
      body: formData,
    });
  },

  remove: (id: string) => apiFetch<{ success: boolean; message: string }>(`/documents/${id}`, { method: "DELETE" }),

  restore: (id: string) =>
    apiFetch<{ data: DocumentItem }>(`/documents/${id}/restore`, {
      method: "POST",
    }),

  listFolders: () => apiFetch<{ data: DocumentFolder[] }>("/documents/folders"),

  createFolder: (payload: {
    name: string;
    visibilityType: "all_users" | "custom";
    permissions?: DocumentFolderPermission[];
  }) =>
    apiFetch<{ data: DocumentFolder }>("/documents/folders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  moveToFolder: (documentId: string, folderId: string | null) =>
    apiFetch<{ data: DocumentItem }>(`/documents/${documentId}/move-folder`, {
      method: "PATCH",
      body: JSON.stringify({ folderId }),
    }),

  getMailbox: () =>
    apiFetch<{ data: DocumentMailboxInfo }>("/documents/mailbox"),

  regenerateMailbox: () =>
    apiFetch<{ data: { mailboxAddress: string; isActive: boolean } }>(
      "/documents/mailbox/regenerate",
      { method: "POST" },
    ),

  reprocess: (documentId: string, payload?: { pdfPassword?: string }) =>
    apiFetch<{ data: DocumentItem }>(`/documents/${documentId}/reprocess`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    }),

  getLinkSuggestions: (documentId: string) =>
    apiFetch<{
      data: {
        vendors: Array<{ _id: string; displayName: string }>;
        customers: Array<{ _id: string; displayName: string }>;
        quickActions: string[];
      };
    }>(`/documents/${documentId}/link-suggestions`),

  link: (documentId: string, payload: { entityType: string; entityId: string; linkSource?: string }) =>
    apiFetch<{ data: DocumentItem }>(`/documents/${documentId}/link`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addTo: (documentId: string, payload: { entityType: string; create?: boolean }) =>
    apiFetch<{
      data: {
        prefill: Record<string, unknown>;
        created: Record<string, unknown> | null;
        message?: string;
      };
    }>(`/documents/${documentId}/add-to`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  addToBank: (documentId: string, transactionIds?: string[]) =>
    apiFetch<{ data: { journalsCreated: number; message?: string } }>(
      `/documents/${documentId}/add-to-bank`,
      {
        method: "POST",
        body: JSON.stringify({ transactionIds }),
      },
    ),

  getEventsUrl: (token: string) => `${API_BASE}/documents/events?token=${encodeURIComponent(token)}`,
};
