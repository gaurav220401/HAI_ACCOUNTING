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
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
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

  const onAddToBank = async () => {
    if (!selectedDocument) return;
    try {
      const res = await documentsApi.addToBank(selectedDocument._id);
      const count = res.data.journalsCreated || 0;
      toast.success(`${count} journal entries created`);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Add to bank failed");
    }
  };

  const onAddToBankById = async (documentId: string) => {
    try {
      const res = await documentsApi.addToBank(documentId);
      const count = res.data.journalsCreated || 0;
      toast.success(`${count} journal entries created`);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error("Add to bank failed");
    }
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
      const res = await documentsApi.getSignedUrl(doc._id, 60, true);
      const a = document.createElement("a");
      a.href = res.data.url;
      a.target = "_blank";
      // This forces the browser to attempt download; 
      // the backend Cloudinary signed URL 'fl_attachment' does the rest.
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download started");
    } catch (error) {
      console.error(error);
      toast.error("Download failed");
    }
  };

  const canRender = !authLoading && !orgLoading;

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <div className="grid min-h-screen grid-cols-[185px_minmax(0,1fr)]">
        <aside className="border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground">
          <Link
            href="/dashboard"
            className="mb-3 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </Link>

          <h1 className="px-2 pb-4 text-[30px] leading-[1.05] font-semibold tracking-tight text-sidebar-foreground">
            Documents
          </h1>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                resetSelection();
                setIsTrashView(false);
                setInbox("all");
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                !isTrashView && inbox === "all"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span>All Documents</span>
              <span className="text-xs">{docsCount.all}</span>
            </button>
          </div>

          <p className="px-2 pt-5 pb-1 text-[11px] tracking-wide text-sidebar-foreground/60 uppercase">Inboxes</p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                resetSelection();
                setIsTrashView(false);
                setInbox("files");
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                !isTrashView && inbox === "files"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span>Files</span>
              <span className="text-xs">{docsCount.files}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetSelection();
                setIsTrashView(false);
                setInbox("bank_statements");
              }}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                !isTrashView && inbox === "bank_statements"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span>Bank Statements</span>
              <span className="text-xs">{docsCount.bank}</span>
            </button>
          </div>

          {!isTrashView ? <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-[11px] tracking-wide text-sidebar-foreground/60 uppercase">Folders</p>
            <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
              <DialogTrigger asChild>
                <button type="button" className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Folder</DialogTitle>
                  <DialogDescription>
                    Folder hierarchy is flat and follows Zoho-style visibility controls.
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
                  <Button onClick={onCreateFolder}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div> : null}
          {!isTrashView ? <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={`mt-2 w-full rounded-md px-2 py-1 text-left text-xs ${
              selectedFolderId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            All folders
          </button> : null}
          {!isTrashView && (folders.length === 0 ? (
            <p className="px-2 pt-4 text-xs text-sidebar-foreground/60">There are no folders.</p>
          ) : (
            <div className="mt-2 space-y-1 px-2">
              {folders.slice(0, 8).map((folder) => (
                <button
                  key={folder._id}
                  type="button"
                  onClick={() => setSelectedFolderId(folder._id)}
                  className={`w-full truncate rounded-md px-2 py-1 text-left text-sm ${
                    selectedFolderId === folder._id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => {
              resetSelection();
              setIsTrashView(true);
              setSelectedDocument(null);
            }}
            className={`mt-6 rounded-md px-2 py-1 text-sm ${
              isTrashView
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            Trash
          </button>
        </aside>

        <main className="p-4 md:p-6">
          {!canRender ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading documents
            </div>
          ) : !activeOrganization ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Select an organization to manage documents.
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                "lg:grid-cols-[minmax(0,1fr)]"
              }`}
            >
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-2xl font-semibold text-slate-900">
                      {isTrashView
                        ? "Trash"
                        : inbox === "bank_statements"
                        ? "Bank Statements"
                        : inbox === "files"
                          ? "Files"
                          : "All Documents"}
                      {selectedFolderId
                        ? ` - ${folders.find((f) => f._id === selectedFolderId)?.name || "Folder"}`
                        : ""}
                    </h2>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Refresh
                      </Button>

                      {!isTrashView ? <Button asChild size="sm">
                        <label className="cursor-pointer">
                          <Upload className="h-4 w-4" />
                          Upload File
                          <input
                            type="file"
                            className="hidden"
                            multiple
                            onChange={(e) => onUploadFiles(e.target.files, "manual")}
                            disabled={uploading}
                          />
                        </label>
                      </Button> : null}
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-2 ${isTrashView ? "md:grid-cols-[minmax(0,1fr)]" : "md:grid-cols-[minmax(0,1fr)_180px_180px]"}`}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search in documents"
                        className="pl-8"
                      />
                    </div>

                    {!isTrashView ? <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Status: All</SelectItem>
                        <SelectItem value="PROCESSING">Processing</SelectItem>
                        <SelectItem value="PROCESSED">Processed</SelectItem>
                        <SelectItem value="UNREADABLE">Unreadable</SelectItem>
                        <SelectItem value="SCAN_IN_PROGRESS">Scan in progress</SelectItem>
                      </SelectContent>
                    </Select> : null}

                    {!isTrashView ? <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                      <SelectTrigger>
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
                    </Select> : null}
                  </div>
                </div>

                <div
                  className="rounded-lg border bg-background"
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
                      <div className="m-6 rounded-lg border border-dashed p-10 text-center">
                        <p className="text-lg font-semibold">Trash is empty</p>
                        <p className="text-sm text-muted-foreground">Deleted documents will appear here for restore.</p>
                      </div>
                    ) : inbox === "bank_statements" ? (
                      <div className="m-6 rounded-xl border p-8">
                        <div className="mx-auto max-w-3xl space-y-6 text-center">
                          <h3 className="text-2xl font-semibold tracking-tight">Auto-upload your bank statements from email</h3>
                          <div className="grid gap-3 text-sm md:grid-cols-2">
                            <div className="rounded-lg border bg-muted/20 p-4">
                              <Mail className="mx-auto mb-2 h-5 w-5 text-blue-600" />
                              <p className="font-medium">1. Set up auto-forwarding</p>
                              <p className="text-muted-foreground">Forward statement emails to your secure inbox.</p>
                            </div>
                            <div className="rounded-lg border bg-muted/20 p-4">
                              <Landmark className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
                              <p className="font-medium">2. Add Statements to Bank</p>
                              <p className="text-muted-foreground">We extract transactions, then you push entries to bank books.</p>
                            </div>
                          </div>

                          <div className="mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-lg border bg-muted/30 p-3">
                            <Input value={mailboxAddress} readOnly className="max-w-md bg-background" />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                if (!mailboxAddress) return;
                                await navigator.clipboard.writeText(mailboxAddress);
                                toast.success("Mailbox address copied");
                              }}
                            >
                              <Copy className="h-4 w-4" />
                              Copy
                            </Button>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Supported for auto-ingestion: PDF, CSV, XLS/XLSX, JPG/PNG statement attachments. Inline email images and normal letter emails are ignored.
                          </p>

                          <div className="mx-auto grid max-w-xl gap-2 text-left text-sm text-muted-foreground md:grid-cols-2">
                            <div className="rounded-md border p-3">
                              <p className="mb-1 font-medium text-foreground">Auto-Forward Statements</p>
                              <p>Use Gmail/Outlook rule to forward bank statement emails to the inbox above.</p>
                            </div>
                            <div className="rounded-md border p-3">
                              <p className="mb-1 font-medium text-foreground">Upload Manually</p>
                              <p>Upload statement PDF/image directly if email forwarding is not enabled.</p>
                            </div>
                          </div>

                          <Button asChild disabled={uploading}>
                            <label className="cursor-pointer">
                              <Image className="h-4 w-4" />
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
                        className={`m-6 rounded-lg border border-dashed p-10 text-center transition ${
                          dragOver ? "border-blue-500 bg-blue-50" : "border-muted-foreground/30"
                        }`}
                      >
                        <Upload className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-lg font-semibold">Drag and Drop Files Here</p>
                        <p className="text-sm text-muted-foreground">
                          Upload images, PDFs, docs, and sheets. Autoscan starts automatically.
                        </p>
                        <Button asChild className="mt-4" disabled={uploading}>
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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          {isTrashView ? <TableHead>Status</TableHead> : inbox === "files" ? <TableHead>Details</TableHead> : <TableHead>Status</TableHead>}
                          <TableHead>{isTrashView ? "Deleted On" : "Uploaded On"}</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>{isTrashView ? "Action" : inbox === "bank_statements" ? "Action" : "Associated To"}</TableHead>
                          {!isTrashView && inbox !== "bank_statements" ? <TableHead>Folder</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((doc) => (
                          <TableRow
                            key={doc._id}
                            className={!isTrashView && selectedDocument?._id === doc._id ? "bg-muted/40" : ""}
                            onClick={() => {
                              if (!isTrashView) {
                                setSelectedDocumentId(doc._id);
                                setSelectedDocument(doc);
                                setUserSelectedDocument(true);
                              }
                            }}
                          >
                            <TableCell>
                              <div className="font-medium">{doc.fileName}</div>
                              {!isTrashView && inbox === "bank_statements" && doc.emailSubject ? (
                                <div className="text-xs text-muted-foreground">Email Subject: {doc.emailSubject}</div>
                              ) : (
                                <div className="text-xs text-muted-foreground uppercase">{doc.extension || "file"}</div>
                              )}
                            </TableCell>
                            {!isTrashView && inbox === "files" ? (
                              <TableCell className="text-muted-foreground">
                                {formatMimeLabel(doc.mimeType, doc.extension)}
                              </TableCell>
                            ) : (
                              <TableCell>
                                <Badge variant="outline" className={statusColors[doc.processingStatus]}>
                                  {statusLabels[doc.processingStatus]}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell>{fmtDate(isTrashView ? (doc.deletedAt || doc.uploadedAt) : doc.uploadedAt)}</TableCell>
                            <TableCell>{doc.uploadedBy?.name || doc.uploadedBy?.email || "-"}</TableCell>
                            {isTrashView ? (
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRestoreDocumentById(doc._id);
                                    }}
                                  >
                                    Restore
                                  </Button>
                                </div>
                              </TableCell>
                            ) : inbox === "bank_statements" ? (
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDocumentId(doc._id);
                                      setSelectedDocument(doc);
                                      setUserSelectedDocument(true);
                                    }}
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
                                  >
                                    Add to Bank
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="px-2"
                                    title="Download"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownloadDocument(doc);
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            ) : (
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span>{doc.links?.[0]?.entityType || "-"}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    title="Download"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDownloadDocument(doc);
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                            {!isTrashView && inbox !== "bank_statements" ? <TableCell>{doc.folderId?.name || "-"}</TableCell> : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {!isTrashView && inbox === "bank_statements" ? <div className="rounded-lg border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Email Auto-Ingestion</h3>
                    <Button variant="outline" size="sm" onClick={onRegenerateMailbox}>
                      Regenerate
                    </Button>
                  </div>

                  <p className="mb-2 text-xs text-muted-foreground">
                    Realtime stream: {eventsConnected ? "Connected" : "Disconnected"}
                  </p>

                  <div className="mb-3 rounded-md border bg-muted/30 p-3 text-xs">
                    <p className="font-medium text-foreground">
                      Inbound Status: {inboundReady ? "Ready" : "Needs Setup"}
                    </p>
                    <p className="text-muted-foreground">
                      SMTP configured: {smtpConfigured ? "Yes" : "No"} | Polling enabled: {pollingEnabled ? "Yes" : "No"}
                      {inferredImapHost ? ` | IMAP host: ${inferredImapHost}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Input value={mailboxAddress} readOnly className="max-w-md" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!mailboxAddress) return;
                        await navigator.clipboard.writeText(mailboxAddress);
                        toast.success("Mailbox address copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>

                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {(forwardingInstructions.length ? forwardingInstructions : [
                      "Open Gmail or Outlook forwarding settings",
                      "Add this mailbox as forwarding destination",
                      "Create rule for bank and invoice emails",
                    ]).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div> : null}
              </div>

              {!isTrashView && (inbox === "files" || inbox === "bank_statements") && previewOpen && selectedDocument ? (
              <>
                <div className="fixed inset-0 z-40 bg-black/25" aria-hidden="true" />
                <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[460px] overflow-y-auto border-l bg-background shadow-2xl">
                  <div className="sticky top-0 z-10 border-b bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold">Preview</h2>
                        <p className="text-xs text-muted-foreground">Right-side document details and smart actions</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={closePreview}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 text-sm">
                    <div>
                      <p className="font-medium">{selectedDocument.fileName}</p>
                      <p className="text-xs text-muted-foreground">{formatMimeLabel(selectedDocument.mimeType, selectedDocument.extension)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">Size</p>
                        <p className="font-medium">{fmtSize(selectedDocument.sizeBytes)}</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">Uploaded</p>
                        <p className="font-medium">{fmtDate(selectedDocument.uploadedAt)}</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">Vendor</p>
                        <p className="font-medium">{selectedDocument.extraction?.vendorName || "-"}</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-medium">
                          {selectedDocument.extraction?.amount
                            ? `${selectedDocument.extraction.currency || "INR"} ${selectedDocument.extraction.amount}`
                            : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-md border p-2">
                      <p className="text-xs font-medium text-muted-foreground">Document Preview</p>
                      <div className="h-[320px] overflow-hidden rounded border bg-muted/20">
                        {previewLoading ? (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading preview...
                          </div>
                        ) : previewError ? (
                          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
                            {previewError}
                          </div>
                        ) : !previewUrl ? (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            No preview available
                          </div>
                        ) : (() => {
                          const kind = getPreviewKind(selectedDocument.mimeType, selectedDocument.extension);
                          if (kind === "image") {
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt={selectedDocument.fileName} className="h-full w-full object-contain" />
                            );
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
                              <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
                                <p>This is an archive file (ZIP/RAR/7Z). Inline preview is not available.</p>
                                <Button variant="link" className="h-auto p-0 text-xs" onClick={() => window.open(previewUrl, "_blank")}>Download archive</Button>
                              </div>
                            );
                          }
                          return (
                            <iframe title="File Preview" src={previewUrl} className="h-full w-full" />
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Move to folder</Label>
                      <Select
                        value={selectedDocument.folderId?._id || "none"}
                        onValueChange={onMoveToFolder}
                      >
                        <SelectTrigger>
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

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Add to</Label>
                      <Select value={addToTarget} onValueChange={(v) => setAddToTarget(v as AddToEntityType)}>
                        <SelectTrigger>
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

                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => onAddToEntity(false)}>
                          Prefill
                        </Button>
                        <Button className="flex-1" onClick={() => onAddToEntity(true)}>
                          Create
                        </Button>
                      </div>
                    </div>

                    {selectedDocument.documentType === "bank_statement" && (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">Bank Statement</p>
                          <Badge variant="outline">{selectedDocument.bankTransactions?.length || 0} txns</Badge>
                        </div>
                        <Button className="w-full" onClick={onAddToBank}>
                          <ArrowRight className="h-4 w-4" />
                          Add to Bank
                        </Button>
                      </div>
                    )}

                    <div className="space-y-2 border-t pt-2">
                      <Button
                        variant={pinPreview ? "default" : "outline"}
                        className="w-full"
                        onClick={() => setPinPreview((v) => !v)}
                      >
                        {pinPreview ? "Pinned Preview Enabled" : "Pin Preview"}
                      </Button>
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => setFullScreenPreview(true)}
                      >
                        Full Screen Preview
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
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
                        className="w-full"
                        onClick={() => selectedDocument && onDownloadDocument(selectedDocument)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download File
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => onReprocess()}>
                        <RefreshCw className="h-4 w-4" />
                        Reprocess
                      </Button>

                      {selectedDocument.extension?.toLowerCase() === "pdf" ? (
                        <div className="space-y-2 rounded-md border p-2">
                          <Label className="text-xs text-muted-foreground">PDF Password (if protected)</Label>
                          <Input
                            type="password"
                            placeholder="Enter PDF password"
                            value={pdfPasswordInput}
                            onChange={(e) => setPdfPasswordInput(e.target.value)}
                          />
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => onReprocess(pdfPasswordInput)}
                            disabled={!pdfPasswordInput.trim()}
                          >
                            Reprocess With Password
                          </Button>
                        </div>
                      ) : null}

                      <Button variant="destructive" className="w-full" onClick={onDeleteDocument}>
                        Delete
                      </Button>
                    </div>

                    {/* <div className="rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-medium">Advanced Autoscan</p>
                        <Button
                          variant={advancedMode ? "default" : "outline"}
                          size="sm"
                          onClick={() => setAdvancedMode((v) => !v)}
                        >
                          {advancedMode ? "Enabled" : "Configure"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Multi-language OCR, line-item extraction, and improved accuracy.
                      </p>
                      <Button variant="outline" size="sm" className="mt-2 w-full">
                        <Plus className="h-4 w-4" />
                        Buy Addon
                      </Button>
                    </div> */}

                    <div className="rounded-md border p-3 text-xs text-muted-foreground">
                      <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        Activity and Logs
                      </div>
                      {(selectedDocument.activityLogs || []).slice(0, 4).map((log) => (
                        <div key={`${log.eventType}-${log.createdAt}`} className="mb-1">
                          {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </>
              ) : null}
            </div>
          )}

          {/* Full Screen Preview Dialog */}
          {fullScreenPreview && selectedDocument && (
            <div className="fixed inset-0 z-50 bg-black/90">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b bg-background p-4">
                  <h2 className="text-lg font-semibold">{selectedDocument.fileName}</h2>
                  <Button variant="ghost" size="icon" onClick={() => setFullScreenPreview(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  {previewLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="ml-2">Loading preview...</span>
                    </div>
                  ) : previewError ? (
                    <div className="flex h-full items-center justify-center text-white">
                      <div className="text-center">
                        <p className="text-lg mb-2">Preview Error</p>
                        <p>{previewError}</p>
                      </div>
                    </div>
                  ) : !previewUrl ? (
                    <div className="flex h-full items-center justify-center text-white">
                      <p>No preview available</p>
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
                          <audio controls className="w-full max-w-2xl" src={previewUrl}>
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
                      return <iframe title="Full Screen Text Preview" src={previewUrl} className="h-full w-full" />;
                    }
                    if (kind === "office") {
                      const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(previewUrl)}`;
                      return <iframe title="Full Screen Office Preview" src={officeUrl} className="h-full w-full" />;
                    }
                    if (kind === "archive") {
                      return (
                        <div className="flex h-full items-center justify-center text-white">
                          <div className="text-center">
                            <p className="text-lg mb-4">This is an archive file (ZIP/RAR/7Z)</p>
                            <p className="mb-4 text-sm text-white/80">Preview is not available for archive files.</p>
                            <Button onClick={() => window.open(previewUrl, "_blank")}>
                              Download archive
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    return <iframe title="Full Screen File Preview" src={previewUrl} className="h-full w-full" />;
                  })()}
                </div>
              </div>
            </div>
          )}

          {uploading && (
            <div className="fixed bottom-4 right-4 rounded-md border bg-background px-3 py-2 text-sm shadow">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Uploading and scanning documents
            </div>
          )}

          {dbUser && (
            <p className="mt-4 text-xs text-muted-foreground">
              Upload source and processing errors are automatically tracked in document activity logs.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
