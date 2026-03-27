"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Copy,
  FileText,
  FolderPlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Upload,
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

export default function DocumentsPage() {
  const { loading: authLoading, dbUser } = useAuth();
  const { loading: orgLoading, activeOrganization } = useOrganization();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);

  const [inbox, setInbox] = useState<DocumentInbox>("all");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fileTypeFilter, setFileTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [mailboxAddress, setMailboxAddress] = useState("");
  const [forwardingInstructions, setForwardingInstructions] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);

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

  const docsCount = useMemo(() => {
    return {
      all: documents.length,
      files: documents.filter((d) => d.documentType !== "bank_statement").length,
      bank: documents.filter((d) => d.documentType === "bank_statement").length,
    };
  }, [documents]);

  const loadData = useCallback(async () => {
    if (!activeOrganization?._id) return;
    setLoading(true);

    try {
      // Add small delays between parallel requests to avoid rate limiting
      const [docRes, folderRes, mailboxRes] = await Promise.all([
        documentsApi.list({
          inbox,
          folderId: selectedFolderId || undefined,
          status: statusFilter === "all" ? undefined : (statusFilter as DocumentProcessingStatus),
          fileType: fileTypeFilter === "all" ? undefined : fileTypeFilter,
          q: search || undefined,
          limit: 100,
        }),
        new Promise(resolve => setTimeout(resolve, 100)).then(() => documentsApi.listFolders()),
        new Promise(resolve => setTimeout(resolve, 200)).then(() => documentsApi.getMailbox()),
      ]);

      const loadedDocs = docRes.data || [];
      setDocuments(loadedDocs);
      setFolders(folderRes.data || []);
      setMailboxAddress(mailboxRes.data.mailboxAddress);
      setForwardingInstructions(mailboxRes.data.forwardingInstructions || []);

      setSelectedDocument((prev) => {
        if (!prev) return loadedDocs[0] || null;
        const stillExists = loadedDocs.find((d) => d._id === prev._id);
        return stillExists || loadedDocs[0] || null;
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [activeOrganization?._id, fileTypeFilter, inbox, search, selectedFolderId, statusFilter]);

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

  const onReprocess = async () => {
    if (!selectedDocument) return;
    try {
      await documentsApi.reprocess(selectedDocument._id);
      toast.success("Reprocess queued");
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
              onClick={() => setInbox("all")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                inbox === "all"
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
              onClick={() => setInbox("files")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                inbox === "files"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span>Files</span>
              <span className="text-xs">{docsCount.files}</span>
            </button>
            <button
              type="button"
              onClick={() => setInbox("bank_statements")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                inbox === "bank_statements"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <span>Bank Statements</span>
              <span className="text-xs">{docsCount.bank}</span>
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between px-2">
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
          </div>
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={`mt-2 w-full rounded-md px-2 py-1 text-left text-xs ${
              selectedFolderId === null
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            All folders
          </button>
          {folders.length === 0 ? (
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
          )}

          <button
            type="button"
            className="mt-6 rounded-md px-2 py-1 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-4">
                <div className="rounded-lg border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h2 className="text-2xl font-semibold text-slate-900">
                      {inbox === "bank_statements"
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

                      <Button asChild size="sm">
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
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search in documents"
                        className="pl-8"
                      />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                    </Select>

                    <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
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
                    </Select>
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
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Uploaded On</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>Associated To</TableHead>
                          <TableHead>Folder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documents.map((doc) => (
                          <TableRow
                            key={doc._id}
                            className={selectedDocument?._id === doc._id ? "bg-muted/40" : ""}
                            onClick={() => setSelectedDocument(doc)}
                          >
                            <TableCell>
                              <div className="font-medium">{doc.fileName}</div>
                              <div className="text-xs text-muted-foreground uppercase">{doc.extension || "file"}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusColors[doc.processingStatus]}>
                                {statusLabels[doc.processingStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell>{fmtDate(doc.uploadedAt)}</TableCell>
                            <TableCell>{doc.uploadedBy?.name || doc.uploadedBy?.email || "-"}</TableCell>
                            <TableCell>{doc.links?.[0]?.entityType || "-"}</TableCell>
                            <TableCell>{doc.folderId?.name || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div className="rounded-lg border bg-background p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Email Auto-Ingestion</h3>
                    <Button variant="outline" size="sm" onClick={onRegenerateMailbox}>
                      Regenerate
                    </Button>
                  </div>

                  <p className="mb-2 text-xs text-muted-foreground">
                    Realtime stream: {eventsConnected ? "Connected" : "Disconnected"}
                  </p>

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
                </div>
              </div>

              <aside className="h-fit rounded-lg border bg-background">
                <div className="border-b p-4">
                  <h2 className="text-sm font-semibold">Preview</h2>
                  <p className="text-xs text-muted-foreground">Right-side document details and smart actions</p>
                </div>

                {!selectedDocument ? (
                  <div className="p-4 text-sm text-muted-foreground">Select a document to view details.</div>
                ) : (
                  <div className="space-y-4 p-4 text-sm">
                    <div>
                      <p className="font-medium">{selectedDocument.fileName}</p>
                      <p className="text-xs text-muted-foreground">{selectedDocument.mimeType}</p>
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
                      <Button variant="outline" className="w-full" onClick={onReprocess}>
                        <RefreshCw className="h-4 w-4" />
                        Reprocess
                      </Button>
                      <Button variant="destructive" className="w-full" onClick={onDeleteDocument}>
                        Delete
                      </Button>
                    </div>

                    <div className="rounded-md border p-3">
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
                    </div>

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
                )}
              </aside>
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
