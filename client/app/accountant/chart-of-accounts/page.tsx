"use client";
import Link from "next/link";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Settings2, ChevronDown, TreePine, RefreshCw, MoreHorizontal,
  Lock, X, Search, GripVertical, SlidersHorizontal, WrapText, ChevronsUpDown,  FileUp, Upload, Download} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { AccountDetailsPanel, type AccountAmountView } from "@/components/account-details-panel";
import { AccountTransactionsReportDialog } from "@/components/account-transactions-report-dialog";
import { PageHeader } from "@/components/page-header";
import { AccountDialog } from "@/components/account-dialog";
import { ExportDialog } from "@/components/export-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { accountApi, type Account, type UpdateAccountInput } from "@/lib/api/accounts";
import { documentsApi } from "@/lib/api/documents";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewFilter = "Active" | "Inactive" | "All";
type ColumnId = "name" | "code" | "accountType" | "documents" | "parentAccount";

interface ColumnConfig {
  id: ColumnId;
  label: string;
  locked: boolean;   // locked columns can't be hidden (Account Name, Code, Type)
  visible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "name",          label: "Account Name",        locked: true,  visible: true },
  { id: "code",          label: "Account Code",        locked: true,  visible: true },
  { id: "accountType",   label: "Account Type",        locked: true,  visible: true },
  { id: "documents",     label: "Documents",           locked: false, visible: true },
  { id: "parentAccount", label: "Parent Account Name", locked: false, visible: true },
];

function parentName(account: Account, map: Map<string, Account>) {
  if (!account.parentId) return "—";
  const p = map.get(account.parentId as string);
  return p ? p.name : "—";
}

// ─── Customize Columns Dialog ─────────────────────────────────────────────────

function CustomizeColumnsDialog({
  open,
  onOpenChange,
  columns,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columns: ColumnConfig[];
  onSave: (cols: ColumnConfig[]) => void;
}) {
  const [draft, setDraft] = useState<ColumnConfig[]>(() => columns.map((c) => ({ ...c })));
  const [search, setSearch] = useState("");
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(columns.map((c) => ({ ...c })));
      setSearch("");
    }
    onOpenChange(nextOpen);
  }

  const filtered = draft.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase()),
  );

  const visibleCount = draft.filter((c) => c.visible).length;

  function toggleColumn(id: ColumnId) {
    setDraft((prev) =>
      prev.map((c) => (c.id === id && !c.locked ? { ...c, visible: !c.visible } : c)),
    );
  }

  function handleDragStart(idx: number) {
    dragItem.current = idx;
  }

  function handleDragEnter(idx: number) {
    dragOverItem.current = idx;
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...draft];
    const [dragged] = items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, dragged);
    setDraft(items);
    dragItem.current = null;
    dragOverItem.current = null;
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4" />
              Customize Columns
            </DialogTitle>
            <span className="text-sm text-primary font-medium">
              {visibleCount} of {draft.length} Selected
            </span>
          </div>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Column list */}
        <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
          {filtered.map((col) => {
            const realIdx = draft.findIndex((c) => c.id === col.id);
            return (
              <div
                key={col.id}
                draggable
                onDragStart={() => handleDragStart(realIdx)}
                onDragEnter={() => handleDragEnter(realIdx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 cursor-grab active:cursor-grabbing select-none"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                {col.locked ? (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                )}
                <span className="text-sm font-medium">{col.label}</span>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => onSave(draft)}>Save</Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Action Toolbar ──────────────────────────────────────────────────────

function BulkActionToolbar({
  count,
  onMarkActive,
  onMarkInactive,
  onDelete,
  onClear,
}: {
  count: number;
  onMarkActive: () => void;
  onMarkInactive: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-background border-b">
      <Button variant="outline" size="sm" onClick={onMarkActive} className="text-xs font-medium">
        Mark as Active
      </Button>
      <Button variant="outline" size="sm" onClick={onMarkInactive} className="text-xs font-medium">
        Mark as Inactive
      </Button>
      <Button variant="outline" size="sm" onClick={onDelete} className="text-xs font-medium">
        Delete
      </Button>
      <span className="text-muted-foreground text-xs">|</span>
      <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded bg-primary text-primary-foreground text-xs font-bold px-1.5">
        {count}
      </span>
      <span className="text-sm text-muted-foreground">Selected</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Esc
          <X className="h-4 w-4 text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDelete({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4 border">
        <h2 className="text-base font-semibold">Delete Account{message.includes("selected") ? "s" : ""}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Account Row ───────────────────────────────────────────────────────────────

function AccountRow({
  account,
  accountMap,
  columns,
  selected,
  isDetailsActive,
  wrapText,
  onSelect,
  onOpenDetails,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  account: Account;
  accountMap: Map<string, Account>;
  columns: ColumnConfig[];
  selected: boolean;
  isDetailsActive: boolean;
  wrapText: boolean;
  onSelect: (id: string) => void;
  onOpenDetails: (a: Account) => void;
  onEdit: (a: Account) => void;
  onDelete: (a: Account) => void;
  onToggleActive: (a: Account) => void;
}) {
  const visibleCols = columns.filter((c) => c.visible);
  const canDelete = !account.isSystemAccount;
  const cellClass = wrapText
    ? "px-3 py-2.5 text-sm"
    : "px-3 py-2.5 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]";

  return (
    <tr
      className={`group border-b last:border-0 hover:bg-muted/40 transition-colors ${selected ? "bg-primary/5" : ""} ${isDetailsActive ? "bg-emerald-50/70" : ""}`}
    >
      {/* Lock or Checkbox */}
      <td className="w-9 px-3 py-2.5 text-center">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(account._id)}
        />
      </td>

      {/* Dynamic visible columns */}
      {visibleCols.map((col) => {
        switch (col.id) {
          case "name":
            return (
              <td key={col.id} className={cellClass}>
                <span
                  className="text-sm text-primary cursor-pointer hover:underline font-medium"
                  onClick={() => onOpenDetails(account)}
                >
                  {account.name}
                </span>
                {account.isSystemAccount && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 align-middle">
                    <Lock className="h-3 w-3" />
                    Predefined
                  </span>
                )}
                {!account.isActive && (
                  <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>
                )}
              </td>
            );
          case "code":
            return (
              <td key={col.id} className={`${cellClass} text-muted-foreground`}>
                {account.code || "—"}
              </td>
            );
          case "accountType":
            return (
              <td key={col.id} className={`${cellClass} text-foreground`}>
                {account.accountType}
              </td>
            );
          case "documents":
            return (
              <td key={col.id} className={`${cellClass} text-muted-foreground`}>—</td>
            );
          case "parentAccount":
            return (
              <td key={col.id} className={`${cellClass} text-muted-foreground`}>
                {parentName(account, accountMap)}
              </td>
            );
          default:
            return null;
        }
      })}

      {/* Gear icon */}
      <td className="w-12 px-2 py-2.5 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted text-muted-foreground">
              <Settings2 className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(account)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(account)}>
              {account.isActive ? "Mark as Inactive" : "Mark as Active"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!canDelete}
              className="text-destructive focus:text-destructive disabled:text-muted-foreground disabled:opacity-70"
              onClick={() => canDelete && onDelete(account)}
            >
              {canDelete ? "Delete" : "Delete (Locked)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, needsOrgSetup, loading: orgLoading } = useOrganization();
  const isMobile = useIsMobile();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fetching, setFetching] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("Active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Column customization
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Wrap text toggle
  const [wrapText, setWrapText] = useState(false);

  // Bulk delete confirmation
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Account details panel
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsData, setDetailsData] = useState<Awaited<ReturnType<typeof accountApi.getDetails>>["data"] | null>(null);
  const [detailsPage, setDetailsPage] = useState(1);
  const [amountView, setAmountView] = useState<AccountAmountView>("BCY");
  const [detailReportOpen, setDetailReportOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Auth guards ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ─── Data fetching ───────────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setFetching(true);
    try {
      const res = await accountApi.list();
      setAccounts(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }, []);

  const fetchAccountDetails = useCallback(async (accountId: string, page = 1) => {
    setDetailsLoading(true);
    setDetailsError(null);
    try {
      const res = await accountApi.getDetails(accountId, { page, limit: 12 });
      setDetailsData(res.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load account details";
      setDetailsError(message);
      setDetailsData(null);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeOrganization?._id) {
      void fetchAccounts();
    }
  }, [activeOrganization?._id, fetchAccounts]);

  // ─── Single actions ──────────────────────────────────────────────────

  async function handleToggleActive(account: Account) {
    try {
      const payload: UpdateAccountInput = { isActive: !account.isActive };
      await accountApi.update(account._id, payload);
      await fetchAccounts();
    } catch { /* noop */ }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await accountApi.remove(deleteTarget._id);
    } catch { /* noop */ } finally {
      setDeleteTarget(null);
      await fetchAccounts();
    }
  }

  // ─── Bulk actions ────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkMarkActive() {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => accountApi.update(id, { isActive: true })),
      );
    } catch { /* noop */ } finally {
      clearSelection();
      await fetchAccounts();
    }
  }

  async function bulkMarkInactive() {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => accountApi.update(id, { isActive: false })),
      );
    } catch { /* noop */ } finally {
      clearSelection();
      await fetchAccounts();
    }
  }

  async function bulkDelete() {
    const deletableIds = Array.from(selectedIds).filter((id) => !accountMap.get(id)?.isSystemAccount);
    if (deletableIds.length === 0) {
      clearSelection();
      setBulkDeleteOpen(false);
      return;
    }

    try {
      await Promise.all(deletableIds.map((id) => accountApi.remove(id)));
    } catch { /* noop */ } finally {
      clearSelection();
      setBulkDeleteOpen(false);
      await fetchAccounts();
    }
  }

  // ─── Keyboard shortcut — Esc clears selection ────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedIds.size > 0) {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds.size]);

  // ─── Helpers ─────────────────────────────────────────────────────────

  function openCreate() { setEditTarget(null); setDialogOpen(true); }
  function openEdit(account: Account) { setEditTarget(account); setDialogOpen(true); }
  function openDetails(account: Account) {
    setDetailsPage(1);
    setAmountView("BCY");
    setSelectedAccountId(account._id);
    if (isMobile) setMobileDetailsOpen(true);
  }

  function closeDetailsPanel() {
    setSelectedAccountId(null);
    setDetailsData(null);
    setDetailsError(null);
    setDetailReportOpen(false);
    setMobileDetailsOpen(false);
  }

  function openDetailedReport() {
    if (!selectedAccountId) {
      toast.error("Select an account first");
      return;
    }
    setMobileDetailsOpen(false);
    setDetailReportOpen(true);
  }

  function handleColumnSave(cols: ColumnConfig[]) {
    setColumns(cols);
    setCustomizeOpen(false);
  }

  async function refreshSelectedDetails() {
    if (!selectedAccountId) return;
    await fetchAccountDetails(selectedAccountId, detailsPage);
  }

  function triggerAttachmentPicker() {
    if (!selectedAccountId) {
      toast.error("Select an account first");
      return;
    }
    attachmentInputRef.current?.click();
  }

  async function handleAttachmentSelection(files: FileList | null) {
    const file = files?.[0];
    if (!file || !selectedAccountId) return;

    setUploadingAttachment(true);
    try {
      const uploaded = await documentsApi.upload(file, {
        source: "manual",
        inboxType: "files",
      });

      await documentsApi.link(uploaded.data._id, {
        entityType: "account",
        entityId: selectedAccountId,
        linkSource: "manual",
      });

      toast.success("File linked to account");
      await fetchAccountDetails(selectedAccountId, detailsPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to upload and link file";
      toast.error(message);
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a._id, a])), [accounts]);

  const displayed = useMemo(() => {
    return accounts.filter((a) => {
      // Filter by status
      if (viewFilter === "Active" && a.isActive === false) return false;
      if (viewFilter === "Inactive" && a.isActive !== false) return false;
      
      // Filter by search term
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          a.name.toLowerCase().includes(s) ||
          (a.code && a.code.toLowerCase().includes(s)) ||
          a.accountType.toLowerCase().includes(s)
        );
      }
      
      return true;
    });
  }, [accounts, viewFilter, searchTerm]);

  const panelOpen = Boolean(selectedAccountId);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  const handleExportCSV = () => {
    if (displayed.length === 0) {
      toast.error("No accounts to export");
      return;
    }
    const headers = [
      "Account Name",
      "Account Code",
      "Account Type",
      "Parent Account Name",
      "Description",
      "Opening Balance",
      "Bank Account Number",
      "Bank IFSC",
      "Bank Currency",
      "Create Item As Fixed Asset",
      "Fixed Asset Type"
    ];
    
    const csvContent = [
      headers.join(","),
      ...displayed.map(a => {
        const pAcc = a.parentId ? accountMap.get(a.parentId)?.name : "";
        return [
          `"${a.name || ""}"`,
          `"${a.code || ""}"`,
          `"${a.accountType || ""}"`,
          `"${pAcc || ""}"`,
          `"${a.description || ""}"`,
          `"${a.openingBalance || 0}"`,
          `"${a.accountNumber || ""}"`,
          `"${a.ifsc || ""}"`,
          `"${a.currency || ""}"`,
          `"${a.createItemAsFixedAsset || false}"`,
          `"${a.fixedAssetTypeId || ""}"`
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "chart_of_accounts.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Chart of accounts exported successfully");
  };

  useEffect(() => {
    if (displayed.length === 0) {
      setSelectedAccountId(null);
      setDetailsData(null);
      setDetailsError(null);
      setDetailReportOpen(false);
      return;
    }

    if (selectedAccountId && !displayed.some((a) => a._id === selectedAccountId)) {
      setSelectedAccountId(null);
      setDetailsData(null);
      setDetailsError(null);
      setDetailReportOpen(false);
    }
  }, [displayed, selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) return;
    void fetchAccountDetails(selectedAccountId, detailsPage);
  }, [selectedAccountId, detailsPage, fetchAccountDetails]);

  // ─── Loading ─────────────────────────────────────────────────────────

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden flex flex-col">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Accountant <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Chart of Accounts</span>
            </span>
          }
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                    {viewFilter} Accounts
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-white">
                  {(["Active", "Inactive", "All"] as ViewFilter[]).map((f) => (
                    <DropdownMenuItem
                      key={f}
                      className={viewFilter === f ? "font-semibold" : ""}
                      onClick={() => setViewFilter(f)}
                    >
                      {f} Accounts
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={fetching} className="h-8 text-xs gap-1.5 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-white">
                  <DropdownMenuItem
                    onClick={() => router.push("/batch-import?section=accountant&type=Journal Entries&back=/accountant/chart-of-accounts")}
                    className="cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <FileUp className="h-4 w-4 text-slate-500" />
                      Batch Import
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <Upload className="h-4 w-4 text-slate-500" />
                        Import
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-52 bg-white">
                        <DropdownMenuItem
                          onClick={() => router.push("/accountant/chart-of-accounts/import")}
                          className="cursor-pointer"
                        >
                          <span className="text-xs">Import Chart of Accounts</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <Download className="h-4 w-4 text-slate-500" />
                        Export
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-52 bg-white">
                        <DropdownMenuItem onClick={() => setExportDialogOpen(true)} className="cursor-pointer">
                          <span className="text-xs">Export Accounts</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {accounts.length === 0 ? (
            /* ── Empty state ─────────────────────────────────────── */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <TreePine className="h-12 w-12 opacity-30" />
              <div className="text-center">
                <p className="font-medium text-foreground">No accounts yet</p>
                <p className="text-sm">Create your first account to get started.</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Account
                </Button>
              </div>
            </div>
          ) : (
            /* ── Table layout ────────────────────────────────────── */
            <div className="flex flex-1 min-h-0 overflow-hidden">
              <div
                className={`flex flex-col min-h-0 overflow-hidden transition-all duration-200 ${panelOpen ? "flex-1 lg:w-[350px] lg:flex-none lg:shrink-0 lg:border-r" : "flex-1"}`}
              >

              {/* Bulk selection toolbar — replaces sub-header when items selected */}
              {/* Top Bar: Either Bulk Actions or the Standard Header */}
              {!panelOpen && selectedIds.size > 0 ? (
                <BulkActionToolbar
                  count={selectedIds.size}
                  onMarkActive={bulkMarkActive}
                  onMarkInactive={bulkMarkInactive}
                  onDelete={() => setBulkDeleteOpen(true)}
                  onClear={clearSelection}
                />
              ) : null}

              {/* Main Content: Split View or Full Table */}
              {panelOpen ? (
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden bg-background">
                  {/* Side-panel Header with Filter Dropdown */}
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1.5 font-bold text-sm uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                          {viewFilter} Accounts
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        {(["Active", "Inactive", "All"] as ViewFilter[]).map((f) => (
                          <DropdownMenuItem
                            key={f}
                            className={`text-xs ${viewFilter === f ? "font-semibold bg-muted" : ""}`}
                            onClick={() => setViewFilter(f)}
                          >
                            {f} Accounts
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary" onClick={openCreate}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Fixed Search Bar */}
                  <div className="p-3 border-b bg-slate-50/50">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Filter accounts..."
                        className="pl-8 h-9 text-xs bg-background border-slate-200 focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Scrollable Account List */}
                  <div className="flex-1 overflow-y-auto divide-y scrollbar-thin scrollbar-thumb-slate-200">
                    {displayed.length === 0 ? (
                      <div className="px-4 py-10 text-sm text-muted-foreground text-center">No accounts found.</div>
                    ) : (
                      displayed.map((account) => (
                        <button
                          key={account._id}
                          className={`w-full border-l-4 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${selectedAccountId === account._id ? "border-l-primary bg-primary/5" : "border-l-transparent"}`}
                          onClick={() => openDetails(account)}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className={`text-sm font-semibold truncate ${selectedAccountId === account._id ? "text-primary" : "text-foreground"}`}>
                              {account.name}
                            </p>
                            {account.code && <span className="text-[10px] bg-muted px-1 rounded text-muted-foreground shrink-0">{account.code}</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground uppercase tracking-tight">{account.accountType}</p>
                        </button>
                      ))
                    )}
                  </div>
                  {/* Side-panel Footer */}
                  <div className="px-4 py-2 border-t bg-slate-50/50">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Total: {displayed.length} Accounts
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-auto scrollbar-thin">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                      <tr className="border-b">
                        {/* Column-header dropdown trigger */}
                        <th className="w-9 px-3 py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-0.5 rounded hover:bg-muted text-muted-foreground transition-colors">
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-52">
                              <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                                <SlidersHorizontal className="h-4 w-4 mr-2 text-primary" />
                                Customize Columns
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setWrapText((w) => !w)}>
                                <WrapText className="h-4 w-4 mr-2" />
                                {wrapText ? "No Wrap" : "Wrap Text"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </th>

                        {visibleColumns.map((col) => (
                          <th
                            key={col.id}
                            className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              {col.id === "accountType" && (
                                <ChevronsUpDown className="h-3 w-3 text-muted-foreground/60" />
                              )}
                            </span>
                          </th>
                        ))}

                        {/* Search icon in header */}
                        <th className="w-12 px-2 py-2.5 text-right">
                          <button className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors">
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.length === 0 ? (
                        <tr>
                          <td colSpan={visibleColumns.length + 2} className="px-6 py-16 text-center text-muted-foreground text-sm">
                            No {viewFilter.toLowerCase()} accounts found.
                          </td>
                        </tr>
                      ) : (
                        displayed.map((account) => (
                          <AccountRow
                            key={account._id}
                            account={account}
                            accountMap={accountMap}
                            columns={columns}
                            selected={selectedIds.has(account._id)}
                            isDetailsActive={selectedAccountId === account._id}
                            wrapText={wrapText}
                            onSelect={toggleSelect}
                            onOpenDetails={openDetails}
                            onEdit={openEdit}
                            onDelete={setDeleteTarget}
                            onToggleActive={handleToggleActive}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer count */}
              <div className="px-6 py-2.5 border-t text-xs text-muted-foreground">
                {displayed.length} account{displayed.length !== 1 ? "s" : ""}
              </div>

              </div>

              {panelOpen && (
                <div className="hidden min-h-0 flex-1 lg:block h-full border-l">
                  <AccountDetailsPanel
                    details={detailsData}
                    loading={detailsLoading}
                    error={detailsError}
                    baseCurrency={activeOrganization?.baseCurrency || "INR"}
                    amountView={amountView}
                    onAmountViewChange={setAmountView}
                    onRefresh={() => void refreshSelectedDetails()}
                    onUploadClick={triggerAttachmentPicker}
                    onOpenMoreDetails={openDetailedReport}
                    uploading={uploadingAttachment}
                    onEdit={() => {
                      if (detailsData?.account) openEdit(detailsData.account);
                    }}
                    onDelete={() => {
                      if (detailsData?.account) setDeleteTarget(detailsData.account);
                    }}
                    canDelete={!detailsData?.account?.isSystemAccount}
                    onClose={closeDetailsPanel}
                  />
                </div>
              )}

              <Sheet open={mobileDetailsOpen} onOpenChange={setMobileDetailsOpen}>
                <SheetContent side="right" className="w-full p-0 sm:max-w-[720px]">
                  <AccountDetailsPanel
                    details={detailsData}
                    loading={detailsLoading}
                    error={detailsError}
                    baseCurrency={activeOrganization?.baseCurrency || "INR"}
                    amountView={amountView}
                    onAmountViewChange={setAmountView}
                    onRefresh={() => void refreshSelectedDetails()}
                    onUploadClick={triggerAttachmentPicker}
                    onOpenMoreDetails={openDetailedReport}
                    uploading={uploadingAttachment}
                    onEdit={() => {
                      if (detailsData?.account) openEdit(detailsData.account);
                    }}
                    onDelete={() => {
                      if (detailsData?.account) setDeleteTarget(detailsData.account);
                    }}
                    canDelete={!detailsData?.account?.isSystemAccount}
                    onClose={() => setMobileDetailsOpen(false)}
                    compact
                  />
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>

        <input
          ref={attachmentInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            void handleAttachmentSelection(e.target.files);
          }}
        />
      </SidebarInset>

      <AccountTransactionsReportDialog
        open={detailReportOpen}
        onOpenChange={setDetailReportOpen}
        accountId={selectedAccountId}
        accountName={detailsData?.account?.name || "Account"}
        organizationName={activeOrganization?.name || "Organization"}
        baseCurrency={activeOrganization?.baseCurrency || "INR"}
      />

      {/* Account Dialog (Create / Edit) */}
      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchAccounts}
        editAccount={editTarget}
        allAccounts={accounts}
      />

      {/* Customize Columns Dialog */}
      <CustomizeColumnsDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        columns={columns}
        onSave={handleColumnSave}
      />

      {/* Single delete confirmation */}
      {deleteTarget && (
        <ConfirmDelete
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Bulk delete confirmation */}
      {bulkDeleteOpen && (
        <ConfirmDelete
          message={`Are you sure you want to delete ${Array.from(selectedIds).filter((id) => !accountMap.get(id)?.isSystemAccount).length} selected accounts? Predefined locked accounts will be skipped.`}
          onConfirm={bulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {/* Export Dialog */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        initialModule="accounts"
      />
    </SidebarProvider>
  );
}
