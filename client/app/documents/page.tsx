"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Copy,
  Download,
  FileText,
  Landmark,
  Mail,
  FolderPlus,
  Image,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  documentsApi,
  type DocumentFolder,
  type DocumentInbox,
  type DocumentItem,
  type DocumentProcessingStatus,
  type DocumentStats,
} from "@/lib/api/documents";
import { auth } from "@/lib/firebase";

const statusColors: Record<DocumentProcessingStatus, string> = {
  PROCESSING: "bg-amber-100 text-amber-700 border-amber-300",
  PROCESSED: "bg-emerald-100 text-emerald-700 border-emerald-300",
  UNREADABLE: "bg-red-100 text-red-700 border-red-300",
  SCAN_IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-300",
};

const statusLabels: Record<DocumentProcessingStatus, string> = {
  PROCESSING: "Processing",
  PROCESSED: "Processed",
  UNREADABLE: "Simple Failed",
  SCAN_IN_PROGRESS: "Scan In Progress",
};

type AddToEntityType =
  | "expense"
  | "bill"
  | "purchase_order"
  | "sales_invoice"
  | "vendor"
  | "customer"
  | "account";

function fmtDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatMimeLabel(mimeType?: string, extension?: string) {
  const ext = (extension || "").toLowerCase();
  const normalizedMime = (mimeType || "").trim().toLowerCase();
  const knownByMime: Record<string, string> = {
    "application/pdf": "PDF Document",
    "application/msword": "Word Document (.doc)",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word Document (.docx)",
    "application/vnd.ms-excel": "Excel Spreadsheet (.xls)",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel Spreadsheet (.xlsx)",
    "image/png": "PNG Image",
    "image/jpeg": "JPEG Image",
    "image/jpg": "JPG Image",
  };

  if (normalizedMime && knownByMime[normalizedMime]) return knownByMime[normalizedMime];
  if (ext === "docx") return "Word Document (.docx)";
  if (ext === "doc") return "Word Document (.doc)";
  if (ext === "xlsx") return "Excel Spreadsheet (.xlsx)";
  if (ext === "xls") return "Excel Spreadsheet (.xls)";
  if (ext === "pdf") return "PDF Document";
  if (ext) return `${ext.toUpperCase()} File`;
  return mimeType || "File";
}

function getPreviewKind(
  mimeType?: string,
  extension?: string,
): "image" | "pdf" | "audio" | "video" | "office" | "text" | "archive" | "other" {
  const mime = (mimeType || "").toLowerCase();
  const ext = (extension || "").toLowerCase();

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"].includes(ext)) {
    return "image";
  }
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("audio/") || ["mp3", "wav", "aac", "m4a", "ogg", "flac"].includes(ext)) return "audio";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (
    mime.startsWith("text/") ||
    ["txt", "csv", "json", "xml", "log", "md", "html", "htm"].includes(ext)
  ) {
    return "text";
  }
  if (
    mime.includes("zip") ||
    mime.includes("rar") ||
    mime.includes("7z") ||
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)
  ) {
    return "archive";
  }
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "office";
  return "other";
}

export default function DocumentsPage() {
  const router = useRouter();
  const { loading: authLoading, dbUser } = useAuth();
  const { loading: orgLoading, activeOrganization } = useOrganization();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docStats, setDocStats] = useState<DocumentStats>({ all: 0, files: 0, bank: 0 });
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fullScreenPreview, setFullScreenPreview] = useState(false);
  const [pinPreview, setPinPreview] = useState(false);
  const [userSelectedDocument, setUserSelectedDocument] = useState(false);
  const closePreview = () => {
    setPreviewOpen(false);
    setFullScreenPreview(false);
    setUserSelectedDocument(false);
    setPinPreview(false);
    setSelectedDocumentId(null);
    setSelectedDocument(null);
  };
  const resetSelection = () => {
    setSelectedDocument(null);
    setSelectedDocumentId(null);
    setUserSelectedDocument(false);
    setPreviewOpen(false);
    setFullScreenPreview(false);
    setPinPreview(false);
  };

  const [inbox, setInbox] = useState<DocumentInbox>("all");
  const [isTrashView, setIsTrashView] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [mailboxAddress, setMailboxAddress] = useState("");
  const [forwardingInstructions, setForwardingInstructions] = useState<string[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [inboundReady, setInboundReady] = useState(false);
  const [inferredImapHost, setInferredImapHost] = useState("");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [pdfPasswordInput, setPdfPasswordInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderVisibility, setNewFolderVisibility] = useState<"all_users" | "custom">("all_users");

  const [addToTarget, setAddToTarget] = useState<AddToEntityType>("expense");
  const [eventsConnected, setEventsConnected] = useState(false);

  const uniqueExtensions = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      if (doc.extension) set.add(doc.extension.toLowerCase());
    }
    return Array.from(set).sort();
  }, [documents]);

  const docsCount = useMemo(() => docStats, [docStats]);

  const loadData = useCallback(async () => {
    if (!activeOrganization?._id) return;
    setLoading(true);

    try {
      // Add small delays between requests to avoid rate limiting.
      const docRes = isTrashView
        ? await documentsApi.listTrash({
            q: search || undefined,
            limit: 100,
          })
        : await documentsApi.list({
            inbox,
            folderId: selectedFolderId || undefined,
            status: statusFilter === "all" ? undefined : (statusFilter as DocumentProcessingStatus),
            fileType: fileTypeFilter === "all" ? undefined : fileTypeFilter,
            q: search || undefined,
            limit: 100,
          });

      const folderRes = await new Promise<{ data: DocumentFolder[] }>((resolve) => {
        setTimeout(() => {
          documentsApi.listFolders().then(resolve).catch(() => resolve({ data: [] }));
        }, 100);
      });

      const mailboxRes = !isTrashView && inbox === "bank_statements"
        ? await new Promise<{ data: {
            mailboxAddress: string;
            forwardingInstructions: string[];
            smtpConfigured: boolean;
            pollingEnabled: boolean;
            inboundReady: boolean;
            inferredImapHost?: string;
          } }>((resolve) => {
            setTimeout(() => {
              documentsApi
                .getMailbox()
                .then(resolve)
                .catch(() =>
                  resolve({
                    data: {
                      mailboxAddress: "",
                      forwardingInstructions: [],
                      smtpConfigured: false,
                      pollingEnabled: false,
                      inboundReady: false,
                      inferredImapHost: "",
                    },
                  }),
                );
            }, 200);
          })
        : null;

      const statsRes = !isTrashView ? await documentsApi.getStats().catch(() => null) : null;

      const loadedDocs = docRes.data || [];
      setDocuments(loadedDocs);
      if (statsRes?.data) {
        setDocStats(statsRes.data);
      }
      setFolders(folderRes.data || []);
      if (mailboxRes) {
        setMailboxAddress(mailboxRes.data.mailboxAddress);
        setForwardingInstructions(mailboxRes.data.forwardingInstructions || []);
        setSmtpConfigured(Boolean(mailboxRes.data.smtpConfigured));
        setPollingEnabled(Boolean(mailboxRes.data.pollingEnabled));
        setInboundReady(Boolean(mailboxRes.data.inboundReady));
        setInferredImapHost(mailboxRes.data.inferredImapHost || "");
      }

      setSelectedDocument((prev) => {
        if (!selectedDocumentId) return null;

        // Lock to the selected document id even when list order changes.
        const stillExists = loadedDocs.find((d) => d._id === selectedDocumentId);
        if (stillExists) return stillExists;

        // In pin mode, keep showing last loaded preview until user changes it.
        if (pinPreview) return prev;

        return null;
      });

      if (loadedDocs.length === 0) {
        setPreviewOpen(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [
    activeOrganization?._id,
    fileTypeFilter,
    inbox,
    isTrashView,
    pinPreview,
    search,
    selectedDocumentId,
    selectedFolderId,
    statusFilter,
    userSelectedDocument,
  ]);

  useEffect(() => {
    if (!activeOrganization?._id) return;
    const timer = setTimeout(() => {
      loadData();
    }, 220);
    return () => clearTimeout(timer);
  }, [activeOrganization?._id, loadData]);

  useEffect(() => {
    let source: EventSource | null = null;
    let disposed = false;

    const start = async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token || disposed) return;
      source = new EventSource(documentsApi.getEventsUrl(token));

      source.addEventListener("ready", () => {
        if (!disposed) setEventsConnected(true);
      });

      source.addEventListener("documents:update", async () => {
        if (!disposed) {
          await loadData();
        }
      });

      source.onerror = () => {
        if (!disposed) setEventsConnected(false);
      };
    };

    start().catch(() => undefined);

    return () => {
      disposed = true;
      setEventsConnected(false);
      source?.close();
    };
  }, [loadData]);

  useEffect(() => {
    if (selectedDocument && !isTrashView && (userSelectedDocument || pinPreview)) {
      setPreviewOpen(true);
    } else if (!selectedDocument || isTrashView) {
      setPreviewOpen(false);
    }
  }, [pinPreview, selectedDocument, isTrashView, userSelectedDocument]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (previewOpen && !selectedDocument) {
      console.warn("[documents-preview-check] Preview is open without selected document");
    }
    if (previewOpen && isTrashView) {
      console.warn("[documents-preview-check] Preview opened while trash view is active");
    }
    if (previewOpen && !(inbox === "files" || inbox === "bank_statements")) {
      console.warn("[documents-preview-check] Preview opened outside supported inboxes");
    }
  }, [inbox, isTrashView, previewOpen, selectedDocument]);

  useEffect(() => {
    let cancelled = false;

    const loadPreviewUrl = async () => {
      if (!selectedDocument || isTrashView || !previewOpen) {
        setPreviewUrl("");
        setPreviewError("");
        return;
      }

      setPreviewLoading(true);
      setPreviewError("");
      try {
        const res = await documentsApi.getSignedUrl(selectedDocument._id, 600);
        if (!cancelled) setPreviewUrl(res.data.url);
      } catch (error) {
        if (!cancelled) {
          setPreviewUrl("");
          setPreviewError("Preview could not be loaded. Use Secure Preview URL as fallback.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    loadPreviewUrl().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isTrashView, previewOpen, selectedDocument?._id]);

  const onUploadFiles = async (files: FileList | File[] | null, source: "manual" | "drag_drop") => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        list.map((file) =>
          documentsApi.upload(file, {
            source,
            inboxType: inbox === "bank_statements" ? "bank_statements" : "files",
            processingMode: advancedMode ? "advanced" : "standard",
          }),
        ),
      );

      if (selectedFolderId) {
        await Promise.all(
          uploaded.map((result) =>
            documentsApi.moveToFolder(result.data._id, selectedFolderId).catch(() => undefined),
          ),
        );
      }

      toast.success(`${list.length} file(s) uploaded`);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("File upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDeleteDocument = async () => {
    if (!selectedDocument) return;
    try {
      await documentsApi.remove(selectedDocument._id);
      toast.success("Document deleted");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Delete failed");
    }
  };

  const onRestoreDocumentById = async (documentId: string) => {
    try {
      await documentsApi.restore(documentId);
      toast.success("Document restored");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Restore failed");
    }
  };

  const onCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error("Folder name is required");
      return;
    }
    try {
      await documentsApi.createFolder({
        name: newFolderName.trim(),
        visibilityType: newFolderVisibility,
        permissions: [],
      });
      toast.success("Folder created");
      setNewFolderName("");
      setNewFolderVisibility("all_users");
      setFolderDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Could not create folder");
    }
  };

  const onMoveToFolder = async (folderId: string) => {
    if (!selectedDocument) return;
    try {
      await documentsApi.moveToFolder(selectedDocument._id, folderId === "none" ? null : folderId);
      toast.success(folderId === "none" ? "Removed from folder" : "Moved to folder");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Failed to move document");
    }
  };

  const onAddToEntity = async (create = false) => {
    if (!selectedDocument) return;
    try {
      const res = await documentsApi.addTo(selectedDocument._id, {
        entityType: addToTarget,
        create,
      });
      if (res.data.created) {
        toast.success(`Created ${String(res.data.created.type || addToTarget)}`);
      } else {
        toast.success(create ? (res.data.message || "Action completed") : "Prefill generated");
      }
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Add to action failed");
    }
  };

  // Posting a statement requires choosing which bank account it belongs to and
  // categorising each line, so both entry points hand off to the Banking review
  // screen rather than posting blindly.
  const onAddToBank = () => {
    if (!selectedDocument) return;
    router.push(`/banking?document=${selectedDocument._id}`);
  };

  const onAddToBankById = (documentId: string) => {
    router.push(`/banking?document=${documentId}`);
  };

  const onReprocess = async (pdfPassword?: string) => {
    if (!selectedDocument) return;
    try {
      await documentsApi.reprocess(selectedDocument._id, pdfPassword ? { pdfPassword } : undefined);
      toast.success("Reprocess queued");
      setPdfPasswordInput("");
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Could not queue reprocess");
    }
  };

  const onRegenerateMailbox = async () => {
    try {
      const res = await documentsApi.regenerateMailbox();
      setMailboxAddress(res.data.mailboxAddress);
      toast.success("Ingestion mailbox regenerated");
    } catch (error) {
      console.error(error);
      toast.error("Could not regenerate mailbox");
    }
  };

  const onDownloadDocument = async (doc: DocumentItem) => {
    try {
      toast.info("Preparing download…");
      const res = await documentsApi.getSignedUrl(doc._id, 120, true);
      const downloadUrl = res.data.url;

      // Fetch the file as a blob so it downloads even when the URL is the Cloudinary Admin API endpoint.
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        throw new Error(`Cloudinary returned ${fileRes.status}`);
      }
      const blob = await fileRes.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = doc.fileName || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Download started");
    } catch (error) {
      console.error(error);
      toast.error("Download failed");
    }
  };

  const getStatusBadge = (status: DocumentProcessingStatus) => {
    const s = status.toLowerCase();
    if (s === "processed") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Processed
        </span>
      );
    }
    if (s === "processing" || s === "scan_in_progress") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          {s === "processing" ? "Processing" : "Scanning"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Failed
      </span>
    );
  };

  const canRender = !authLoading && !orgLoading;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white">
        <PageHeader
          breadcrumb={
            <span className="flex flex-col text-left">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Documents</span>
              <span className="text-sm font-semibold text-slate-700 mt-0.5">Documents Manager</span>
            </span>
          }
        />

        <div className="flex h-[calc(100vh-61px)]">
          <div className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/50 overflow-y-auto p-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-1">Overview</span>
                <nav className="mt-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      resetSelection();
                      setIsTrashView(false);
                      setInbox("all");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                      !isTrashView && inbox === "all"
                        ? "bg-teal-50 text-teal-700 font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <span>All Documents</span>
                    <span className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                      !isTrashView && inbox === "all" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                    )}>{docsCount.all}</span>
                  </button>
                </nav>
              </div>

              <div>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-1">Inboxes</span>
                <nav className="mt-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      resetSelection();
                      setIsTrashView(false);
                      setInbox("files");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                      !isTrashView && inbox === "files"
                        ? "bg-teal-50 text-teal-700 font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <span>Files</span>
                    <span className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                      !isTrashView && inbox === "files" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                    )}>{docsCount.files}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetSelection();
                      setIsTrashView(false);
                      setInbox("bank_statements");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                      !isTrashView && inbox === "bank_statements"
                        ? "bg-teal-50 text-teal-700 font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    )}
                  >
                    <span>Bank Statements</span>
                    <span className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                      !isTrashView && inbox === "bank_statements" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                    )}>{docsCount.bank}</span>
                  </button>
                </nav>
              </div>

              {!isTrashView && (
                <div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Folders</span>
                    <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
                      <DialogTrigger asChild>
                        <button type="button" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded p-1 transition">
                          <FolderPlus className="h-3.5 w-3.5" />
                        </button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Folder</DialogTitle>
                          <DialogDescription>
                            Folder hierarchy is flat and follows visibility controls.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="folder-name">Folder Name</Label>
                            <Input
                              id="folder-name"
                              value={newFolderName}
                              onChange={(e) => setNewFolderName(e.target.value)}
                              placeholder="e.g. Vendor Bills"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Folder Permissions</Label>
                            <RadioGroup
                              value={newFolderVisibility}
                              onValueChange={(v) => setNewFolderVisibility(v as "all_users" | "custom")}
                            >
                              <label className="flex items-center gap-2 text-sm">
                                <RadioGroupItem value="all_users" />
                                All users with permission to access documents
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <RadioGroupItem value="custom" />
                                Custom access
                              </label>
                            </RadioGroup>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={onCreateFolder} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">Create</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <nav className="mt-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(null)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                        selectedFolderId === null
                          ? "bg-teal-50 text-teal-700 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                      )}
                    >
                      All folders
                    </button>
                    {folders.length === 0 ? (
                      <p className="px-3 pt-2 text-[10px] text-slate-400">No folders available.</p>
                    ) : (
                      folders.slice(0, 12).map((folder) => (
                        <button
                          key={folder._id}
                          type="button"
                          onClick={() => setSelectedFolderId(folder._id)}
                          className={cn(
                            "w-full truncate rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                            selectedFolderId === folder._id
                              ? "bg-teal-50 text-teal-700 font-semibold"
                              : "text-slate-650 hover:bg-slate-100/70 hover:text-slate-900"
                          )}
                        >
                          {folder.name}
                        </button>
                      ))
                    )}
                  </nav>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  resetSelection();
                  setIsTrashView(true);
                  setSelectedDocument(null);
                }}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors my-[2px]",
                  isTrashView
                    ? "bg-rose-50 text-rose-700 font-semibold"
                    : "text-slate-600 hover:text-rose-50/50 hover:text-rose-700"
                )}
              >
                <span>Trash Archive</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-6">
            {!canRender ? (
              <div className="flex h-64 items-center justify-center text-xs text-slate-400">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-teal-605" />
                Loading documents...
              </div>
            ) : !activeOrganization ? (
              <div className="rounded-xl border border-slate-150 bg-slate-50/40 p-4 text-xs font-medium text-slate-500">
                Select an organization to manage documents.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-base font-semibold text-slate-800">
                      {isTrashView
                        ? "Trash Archive"
                        : inbox === "bank_statements"
                        ? "Bank Statements Inbox"
                        : inbox === "files"
                          ? "Files"
                          : "All Documents"}
                      {selectedFolderId
                        ? ` • ${folders.find((f) => f._id === selectedFolderId)?.name || "Folder"}`
                        : ""}
                    </h2>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="border-slate-200 text-slate-655 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-3 h-8 gap-1.5">
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                      </Button>

                      {!isTrashView && (
                        <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm h-8 px-3 text-xs gap-1.5">
                          <label className="cursor-pointer">
                            <Upload className="h-3.5 w-3.5" />
                            Upload File
                            <input
                              type="file"
                              className="hidden"
                              multiple
                              onChange={(e) => onUploadFiles(e.target.files, "manual")}
                              disabled={uploading}
                            />
                          </label>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className={cn("grid gap-2 text-xs", isTrashView ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3")}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search in documents..."
                        className="pl-8 h-9 text-xs border-slate-200"
                      />
                    </div>

                    {!isTrashView && (
                      <>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="h-9 text-xs border-slate-200">
                            <SelectValue placeholder="Filter Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Status: All</SelectItem>
                            <SelectItem value="PROCESSING">Processing</SelectItem>
                            <SelectItem value="PROCESSED">Processed</SelectItem>
                            <SelectItem value="UNREADABLE">Unreadable</SelectItem>
                            <SelectItem value="SCAN_IN_PROGRESS">Scan in progress</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                          <SelectTrigger className="h-9 text-xs border-slate-200">
                            <SelectValue placeholder="File Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">File Type: All</SelectItem>
                            {uniqueExtensions.map((ext) => (
                              <SelectItem key={ext} value={ext}>
                                {ext.toUpperCase()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className={cn("border border-slate-250 bg-white rounded-xl shadow-sm overflow-hidden", dragOver && "border-teal-500 bg-teal-50/10")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    onUploadFiles(e.dataTransfer.files, "drag_drop");
                  }}
                >
                  {documents.length === 0 ? (
                    isTrashView ? (
                      <div className="m-6 rounded-xl border border-dashed border-slate-200 p-10 text-center bg-slate-50/10">
                        <p className="text-sm font-semibold text-slate-800">Trash archive is empty</p>
                        <p className="text-xs text-slate-400 mt-1">Deleted documents will appear here for restore.</p>
                      </div>
                    ) : inbox === "bank_statements" ? (
                      <div className="m-6 rounded-xl border border-slate-200 p-6 bg-white">
                        <div className="mx-auto max-w-3xl space-y-6 text-center">
                          <h3 className="text-base font-semibold tracking-tight text-slate-800">Auto-upload your bank statements from email</h3>
                          <div className="grid gap-3 text-xs md:grid-cols-2">
                            <div className="rounded-xl border border-slate-150 bg-slate-50/50 p-4 text-left">
                              <Mail className="mb-2 h-4 w-4 text-teal-600" />
                              <p className="font-semibold text-slate-800">1. Set up auto-forwarding</p>
                              <p className="text-slate-400 mt-0.5">Forward statement emails to your secure mailbox address.</p>
                            </div>
                            <div className="rounded-xl border border-slate-150 bg-slate-50/50 p-4 text-left">
                              <Landmark className="mb-2 h-4 w-4 text-emerald-600" />
                              <p className="font-semibold text-slate-800">2. Add Statements to Bank</p>
                              <p className="text-slate-400 mt-0.5">We extract transactions, then you push entries directly into bank books.</p>
                            </div>
                          </div>

                          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl border border-teal-150 bg-teal-50/30 p-3">
                            <Input value={mailboxAddress} readOnly className="max-w-md bg-white border-teal-200 h-8 text-xs text-teal-800 font-mono" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!mailboxAddress) return;
                                await navigator.clipboard.writeText(mailboxAddress);
                                toast.success("Mailbox address copied");
                              }}
                              className="border-teal-200 text-teal-700 bg-white hover:bg-teal-50/85 rounded-md font-semibold text-xs py-1 px-3 h-8 gap-1.5"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </Button>
                          </div>

                          <p className="text-[11px] text-slate-400">
                            Supported for auto-ingestion: PDF, CSV, XLS/XLSX, JPG/PNG statement attachments. Inline email images and normal text letters are automatically ignored.
                          </p>

                          <div className="mx-auto grid max-w-xl gap-3 text-left text-xs text-slate-500 md:grid-cols-2">
                            <div className="rounded-lg border border-slate-100 p-3 bg-slate-50/30">
                              <p className="mb-1 font-semibold text-slate-700">Auto-Forward Statements</p>
                              <p className="text-[11px] leading-relaxed">Use Gmail/Outlook rule filters to forward bank statement emails to the mailbox address above.</p>
                            </div>
                            <div className="rounded-lg border border-slate-100 p-3 bg-slate-50/30">
                              <p className="mb-1 font-semibold text-slate-700">Upload Manually</p>
                              <p className="text-[11px] leading-relaxed">Upload statement PDF or image files directly here if email forwarding setup is not active.</p>
                            </div>
                          </div>

                          <Button asChild disabled={uploading} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm text-xs h-8 px-4 mt-2">
                            <label className="cursor-pointer">
                              <Image className="h-4 w-4 mr-1.5" />
                              Upload Statement File
                              <input
                                type="file"
                                className="hidden"
                                multiple
                                onChange={(e) => onUploadFiles(e.target.files, "manual")}
                              />
                            </label>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "m-6 rounded-xl border border-dashed p-10 text-center transition bg-slate-50/10",
                          dragOver ? "border-teal-500 bg-teal-50/30" : "border-slate-200"
                        )}
                      >
                        <Upload className="mx-auto mb-3 h-7 w-7 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-800">Drag and Drop Files Here</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Upload images, PDFs, docs, and sheets. Autoscan starts automatically.
                        </p>
                        <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm mt-4 text-xs h-8 px-3.5" disabled={uploading}>
                          <label className="cursor-pointer">
                            Choose files to upload
                            <input
                              type="file"
                              className="hidden"
                              multiple
                              onChange={(e) => onUploadFiles(e.target.files, "manual")}
                            />
                          </label>
                        </Button>
                      </div>
                    )
                  ) : (
                    <Table className="w-full text-xs">
                      <TableHeader className="bg-slate-50 border-b border-slate-200">
                        <TableRow>
                          <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">File Name</TableHead>
                          {isTrashView ? <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead> : inbox === "files" ? <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Details</TableHead> : <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>}
                          <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{isTrashView ? "Deleted On" : "Uploaded On"}</TableHead>
                          <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Uploaded By</TableHead>
                          <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{isTrashView ? "Action" : inbox === "bank_statements" ? "Action" : "Associated To"}</TableHead>
                          {!isTrashView && inbox !== "bank_statements" ? <TableHead className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Folder</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100">
                        {documents.map((doc) => {
                          const isSelectedRow = !isTrashView && selectedDocument?._id === doc._id;
                          return (
                            <TableRow
                              key={doc._id}
                              className={cn(
                                "border-b border-slate-100 hover:bg-teal-50/20 cursor-pointer transition-colors",
                                isSelectedRow && "bg-teal-50/50 hover:bg-teal-50/60"
                              )}
                              onClick={() => {
                                if (!isTrashView) {
                                  setSelectedDocumentId(doc._id);
                                  setSelectedDocument(doc);
                                  setUserSelectedDocument(true);
                                }
                              }}
                            >
                              <TableCell className="px-6 py-3.5">
                                <div className="font-semibold text-slate-800">{doc.fileName}</div>
                                {!isTrashView && inbox === "bank_statements" && doc.emailSubject ? (
                                  <div className="text-[10px] text-slate-400 mt-0.5">Subject: {doc.emailSubject}</div>
                                ) : (
                                  <div className="text-[10px] text-slate-400 uppercase mt-0.5 font-mono">{doc.extension || "file"}</div>
                                )}
                              </TableCell>
                              {!isTrashView && inbox === "files" ? (
                                <TableCell className="px-6 py-3.5 text-slate-500">
                                  {formatMimeLabel(doc.mimeType, doc.extension)}
                                </TableCell>
                              ) : (
                                <TableCell className="px-6 py-3.5">
                                  {getStatusBadge(doc.processingStatus)}
                                </TableCell>
                              )}
                              <TableCell className="px-6 py-3.5 text-slate-600">{fmtDate(isTrashView ? (doc.deletedAt || doc.uploadedAt) : doc.uploadedAt)}</TableCell>
                              <TableCell className="px-6 py-3.5 text-slate-500">{doc.uploadedBy?.name || doc.uploadedBy?.email || "-"}</TableCell>
                              {isTrashView ? (
                                <TableCell className="px-6 py-3.5">
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRestoreDocumentById(doc._id);
                                      }}
                                      className="border-slate-200 text-slate-650 hover:bg-slate-50 rounded-md font-semibold text-[10px] py-1 px-2.5 h-7"
                                    >
                                      Restore
                                    </Button>
                                  </div>
                                </TableCell>
                              ) : inbox === "bank_statements" ? (
                                <TableCell className="px-6 py-3.5">
                                  <div className="flex gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDocumentId(doc._id);
                                        setSelectedDocument(doc);
                                        setUserSelectedDocument(true);
                                      }}
                                      className="border-slate-200 text-slate-650 hover:bg-slate-50 rounded-md font-semibold text-[10px] py-1 px-2.5 h-7"
                                    >
                                      Preview
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onAddToBankById(doc._id);
                                      }}
                                      className="border-slate-200 text-slate-655 hover:bg-slate-50 rounded-md font-semibold text-[10px] py-1 px-2.5 h-7"
                                    >
                                      Add to Bank
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="Download"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDownloadDocument(doc);
                                      }}
                                      className="border-slate-200 text-slate-400 hover:text-slate-650 rounded-md p-1 h-7 w-7 flex items-center justify-center"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              ) : (
                                <TableCell className="px-6 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-teal-700">{doc.links?.[0]?.entityType || "-"}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="Download"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDownloadDocument(doc);
                                      }}
                                      className="text-slate-400 hover:text-slate-650 rounded-md p-1 h-7 w-7 flex items-center justify-center"
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                              {!isTrashView && inbox !== "bank_statements" ? (
                                <TableCell className="px-6 py-3.5 text-slate-500 font-medium">{doc.folderId?.name || "-"}</TableCell>
                              ) : null}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {!isTrashView && inbox === "bank_statements" && (
                  <div className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b pb-2 mb-2">
                      <h3 className="text-sm font-semibold text-slate-800">Email Auto-Ingestion</h3>
                      <Button variant="outline" size="sm" onClick={onRegenerateMailbox} className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-medium text-xs py-1 px-2.5 h-7">
                        Regenerate
                      </Button>
                    </div>

                    <p className="text-xs text-slate-450 leading-relaxed">
                      Realtime stream connection status: <span className={cn("font-semibold", eventsConnected ? "text-emerald-600" : "text-amber-600")}>{eventsConnected ? "Connected" : "Disconnected"}</span>
                    </p>

                    <div className="rounded-lg border border-teal-150 bg-teal-50/40 p-4 text-xs font-medium text-teal-800">
                      <p className="font-semibold text-teal-900">
                        Inbound Status: {inboundReady ? "Ready" : "Needs Setup"}
                      </p>
                      <p className="text-[11px] text-teal-700/80 mt-0.5">
                        SMTP configured: {smtpConfigured ? "Yes" : "No"} | Polling enabled: {pollingEnabled ? "Yes" : "No"}
                        {inferredImapHost ? ` | IMAP host: ${inferredImapHost}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Input value={mailboxAddress} readOnly className="max-w-md h-9 text-xs border-slate-200 bg-slate-50/30" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!mailboxAddress) return;
                          await navigator.clipboard.writeText(mailboxAddress);
                          toast.success("Mailbox address copied");
                        }}
                        className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-3 h-9 gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        Copy
                      </Button>
                    </div>

                    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs text-slate-500 leading-relaxed">
                      {(forwardingInstructions.length ? forwardingInstructions : [
                        "Open Gmail or Outlook forwarding settings",
                        "Add this mailbox as forwarding destination",
                        "Create rule for bank and invoice emails",
                      ]).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {!isTrashView && (inbox === "files" || inbox === "bank_statements") && previewOpen && selectedDocument ? (
              <>
                <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px]" aria-hidden="true" onClick={closePreview} />
                <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[460px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl flex flex-col">
                  <div className="sticky top-0 z-10 border-b border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-800">Document Preview</h2>
                        <p className="text-[11px] text-slate-450 mt-0.5">Metadata info and transaction matching</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={closePreview} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md h-8 w-8">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 p-5 text-xs flex-1">
                    <div>
                      <p className="font-semibold text-sm text-slate-850">{selectedDocument.fileName}</p>
                      <p className="text-[10px] text-slate-400 uppercase mt-0.5 font-mono">{formatMimeLabel(selectedDocument.mimeType, selectedDocument.extension)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-xs text-slate-650">
                      <div className="border border-slate-150 bg-slate-50/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Size</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{fmtSize(selectedDocument.sizeBytes)}</p>
                      </div>
                      <div className="border border-slate-150 bg-slate-50/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Uploaded</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{fmtDate(selectedDocument.uploadedAt)}</p>
                      </div>
                      <div className="border border-slate-150 bg-slate-50/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Vendor</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{selectedDocument.extraction?.vendorName || "-"}</p>
                      </div>
                      <div className="border border-slate-150 bg-slate-50/50 p-2.5 rounded-lg">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Amount</p>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {selectedDocument.extraction?.amount
                            ? `${selectedDocument.extraction.currency || "INR"} ${selectedDocument.extraction.amount}`
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 border border-slate-150 bg-slate-50/30 p-3 rounded-lg">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Document Preview</p>
                      <div className="h-[280px] overflow-hidden rounded-md border border-slate-200 bg-white">
                        {previewLoading ? (
                          <div className="flex h-full items-center justify-center text-xs text-slate-450">
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin text-teal-605" />
                            Loading preview...
                          </div>
                        ) : previewError ? (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-450">
                            {previewError}
                          </div>
                        ) : !previewUrl ? (
                          <div className="flex h-full items-center justify-center text-xs text-slate-450">
                            No preview available
                          </div>
                        ) : (() => {
                          const kind = getPreviewKind(selectedDocument.mimeType, selectedDocument.extension);
                          if (kind === "image") {
                            return <img src={previewUrl} alt={selectedDocument.fileName} className="h-full w-full object-contain" />;
                          }
                          if (kind === "pdf") {
                            return <embed src={previewUrl} type="application/pdf" className="h-full w-full" />;
                          }
                          if (kind === "audio") {
                            return (
                              <div className="flex h-full items-center justify-center p-3">
                                <audio controls className="w-full" src={previewUrl}>
                                  <track kind="captions" />
                                </audio>
                              </div>
                            );
                          }
                          if (kind === "video") {
                            return (
                              <div className="flex h-full items-center justify-center bg-black">
                                <video controls className="h-full w-full" src={previewUrl}>
                                  <track kind="captions" />
                                </video>
                              </div>
                            );
                          }
                          if (kind === "text") {
                            return <iframe title="Text Preview" src={previewUrl} className="h-full w-full" />;
                          }
                          if (kind === "office") {
                            const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`;
                            return <iframe title="Office Preview" src={officeUrl} className="h-full w-full" />;
                          }
                          if (kind === "archive") {
                            return (
                              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-slate-400">
                                <p>Archive preview is not supported.</p>
                                <Button variant="link" className="h-auto p-0 text-xs text-teal-700 font-semibold" onClick={() => window.open(previewUrl, "_blank")}>Download archive</Button>
                              </div>
                            );
                          }
                          return (
                            <iframe title="File Preview" src={previewUrl} className="h-full w-full" />
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Move to folder</Label>
                      <Select
                        value={selectedDocument.folderId?._id || "none"}
                        onValueChange={onMoveToFolder}
                      >
                        <SelectTrigger className="h-9 text-xs border-slate-200">
                          <SelectValue placeholder="Select folder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Folder</SelectItem>
                          {folders.map((folder) => (
                            <SelectItem key={folder._id} value={folder._id}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-500">Add to</Label>
                      <Select value={addToTarget} onValueChange={(v) => setAddToTarget(v as AddToEntityType)}>
                        <SelectTrigger className="h-9 text-xs border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="bill">Bill</SelectItem>
                          <SelectItem value="purchase_order">Purchase Order</SelectItem>
                          <SelectItem value="sales_invoice">Invoice</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="account">Account</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex gap-2 pt-1">
                        <Button variant="outline" className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-3 h-9 flex-1" onClick={() => onAddToEntity(false)}>
                          Prefill
                        </Button>
                        <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm h-9 flex-1 text-xs" onClick={() => onAddToEntity(true)}>
                          Create
                        </Button>
                      </div>
                    </div>

                    {selectedDocument.documentType === "bank_statement" && (
                      <div className="space-y-3 border border-teal-150 bg-teal-50/20 p-4 rounded-lg">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-800">Bank Statement</p>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-100">{selectedDocument.bankTransactions?.length || 0} txns</span>
                        </div>
                        <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm h-9 text-xs gap-1.5" onClick={onAddToBank}>
                          <ArrowRight className="h-4 w-4" />
                          Add to Bank
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <Button
                        variant={pinPreview ? "default" : "outline"}
                        className={cn(
                          "h-9 w-full gap-1.5 text-left justify-start text-xs rounded-md",
                          pinPreview 
                            ? "bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-sm"
                            : "border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold"
                        )}
                        onClick={() => setPinPreview((v) => !v)}
                      >
                        {pinPreview ? "Pinned Preview Enabled" : "Pin Preview"}
                      </Button>
                      <Button
                        variant="default"
                        className="bg-teal-650 hover:bg-teal-750 text-white font-semibold rounded-md shadow-sm h-9 w-full gap-1.5 text-left justify-start text-xs"
                        onClick={() => setFullScreenPreview(true)}
                      >
                        Full Screen Preview
                      </Button>
                      <Button
                        variant="outline"
                        className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs py-1 px-3 h-9 w-full gap-1.5 text-left justify-start"
                        onClick={async () => {
                          if (!selectedDocument) return;
                          try {
                            const res = await documentsApi.getSignedUrl(selectedDocument._id, 300);
                            window.open(res.data.url, "_blank", "noopener,noreferrer");
                          } catch (error) {
                            console.error(error);
                            toast.error("Could not generate secure preview link");
                          }
                        }}
                      >
                        Secure Preview URL
                      </Button>
                      <Button
                        variant="outline"
                        className="border-slate-200 text-slate-655 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs py-1 px-3 h-9 w-full gap-1.5 text-left justify-start"
                        onClick={() => selectedDocument && onDownloadDocument(selectedDocument)}
                      >
                        <Download className="h-4 w-4 mr-0.5" />
                        Download File
                      </Button>
                      <Button variant="outline" className="border-slate-200 text-slate-655 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs py-1 px-3 h-9 w-full gap-1.5 text-left justify-start" onClick={() => onReprocess()}>
                        <RefreshCw className="h-4 w-4 mr-0.5" />
                        Reprocess Document
                      </Button>

                      {selectedDocument.extension?.toLowerCase() === "pdf" && (
                        <div className="space-y-2 rounded-lg border border-slate-150 bg-slate-50/30 p-2.5">
                          <Label className="text-[11px] font-semibold text-slate-500">PDF Password (if protected)</Label>
                          <Input
                            type="password"
                            placeholder="Enter PDF password"
                            value={pdfPasswordInput}
                            onChange={(e) => setPdfPasswordInput(e.target.value)}
                            className="h-8 text-xs border-slate-200 bg-white"
                          />
                          <Button
                            variant="outline"
                            className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 font-semibold text-xs py-1 px-3 h-8 w-full gap-1.5 text-left justify-start"
                            onClick={() => onReprocess(pdfPasswordInput)}
                            disabled={!pdfPasswordInput.trim()}
                          >
                            Reprocess With Password
                          </Button>
                        </div>
                      )}

                      <Button variant="destructive" className="bg-rose-50 text-rose-600 hover:bg-rose-100/80 border border-rose-100 rounded-md font-semibold text-xs py-1 px-3 h-9 w-full text-left justify-start" onClick={onDeleteDocument}>
                        Delete Document
                      </Button>
                    </div>

                    <div className="border border-slate-150 bg-slate-50/30 p-3 rounded-lg text-[11px] text-slate-500">
                      <div className="mb-2 flex items-center gap-1 font-semibold text-slate-800">
                        <FileText className="h-3.5 w-3.5 text-slate-600" />
                        Activity and Logs
                      </div>
                      {(selectedDocument.activityLogs || []).slice(0, 4).map((log) => (
                        <div key={`${log.eventType}-${log.createdAt}`} className="mb-1 leading-relaxed border-b border-slate-100/50 pb-1 last:border-0 last:pb-0">
                          {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </>
            ) : null}
          </div>

          {fullScreenPreview && selectedDocument && (
            <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4 text-white">
                  <h2 className="text-sm font-semibold">{selectedDocument.fileName}</h2>
                  <Button variant="ghost" size="icon" onClick={() => setFullScreenPreview(false)} className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-md h-8 w-8">
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {previewLoading ? (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-550" />
                      <span className="ml-2 text-xs">Loading preview...</span>
                    </div>
                  ) : previewError ? (
                    <div className="flex h-full items-center justify-center text-white p-4">
                      <div className="text-center">
                        <p className="text-sm font-semibold mb-2">Preview Error</p>
                        <p className="text-xs text-slate-400">{previewError}</p>
                      </div>
                    </div>
                  ) : !previewUrl ? (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <p className="text-xs">No preview available</p>
                    </div>
                  ) : (() => {
                    const kind = getPreviewKind(selectedDocument.mimeType, selectedDocument.extension);
                    if (kind === "image") {
                      return (
                        <div className="flex h-full items-center justify-center p-4">
                          <img src={previewUrl} alt={selectedDocument.fileName} className="max-h-full max-w-full object-contain" />
                        </div>
                      );
                    }
                    if (kind === "pdf") {
                      return <embed src={previewUrl} type="application/pdf" className="h-full w-full" />;
                    }
                    if (kind === "audio") {
                      return (
                        <div className="flex h-full items-center justify-center p-6">
                          <audio controls className="w-full max-w-2xl bg-slate-800 rounded-lg p-2" src={previewUrl}>
                            <track kind="captions" />
                          </audio>
                        </div>
                      );
                    }
                    if (kind === "video") {
                      return (
                        <div className="flex h-full items-center justify-center bg-black">
                          <video controls className="max-h-full max-w-full" src={previewUrl}>
                            <track kind="captions" />
                          </video>
                        </div>
                      );
                    }
                    if (kind === "text") {
                      return <iframe title="Full Screen Text Preview" src={previewUrl} className="h-full w-full bg-white" />;
                    }
                    if (kind === "office") {
                      const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`;
                      return <iframe title="Full Screen Office Preview" src={officeUrl} className="h-full w-full bg-white" />;
                    }
                    if (kind === "archive") {
                      return (
                        <div className="flex h-full items-center justify-center text-white">
                          <div className="text-center">
                            <p className="text-sm font-semibold mb-2">This is an archive file (ZIP/RAR/7Z)</p>
                            <p className="mb-4 text-xs text-slate-400">Preview is not available for archive files.</p>
                            <Button onClick={() => window.open(previewUrl, "_blank")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">
                              Download archive
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    return <iframe title="Full Screen File Preview" src={previewUrl} className="h-full w-full bg-white" />;
                  })()}
                </div>
              </div>
            </div>
          )}

          {uploading && (
            <div className="fixed bottom-4 right-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-xl flex items-center gap-2 font-medium text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
              <span>Uploading and scanning documents...</span>
            </div>
          )}

          {dbUser && (
            <p className="hidden">
              Upload source and processing errors are automatically tracked in document activity logs.
            </p>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
