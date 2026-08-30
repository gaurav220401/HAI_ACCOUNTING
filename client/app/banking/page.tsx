"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  FileUp,
  Info,
  Keyboard,
  Landmark,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { documentsApi, type DocumentItem } from "@/lib/api/documents";
import { accountApi, type Account } from "@/lib/api/accounts";

/** Suspense account name — mirrors BANK_SUSPENSE_ACCOUNT_NAME on the backend. */
const SUSPENSE_LABEL = "Uncategorised (review later)";

const POLL_INTERVAL_MS = 3000;

type RowSelection = {
  selected: boolean;
  accountId: string | null;
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value || 0));
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * useSearchParams requires a Suspense boundary in the App Router, so the page
 * body lives in its own component (see the default export at the bottom).
 */
function BankingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [categoryAccounts, setCategoryAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState<string>("");

  const [statements, setStatements] = useState<DocumentItem[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentItem | null>(null);
  const [rows, setRows] = useState<Record<string, RowSelection>>({});

  // Rendering every row of a large statement (a real bank export can run to
  // 1,000+ transactions) is what was hanging the page — a Checkbox plus a
  // Radix Select per row is expensive at that count. Pagination here is
  // purely a rendering concern: selection state above and the post action
  // below always operate on the full pending set regardless of which page
  // is visible, exactly like the API/data layer already does.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Text/status filters over the pending set — purely client-side, since the
  // whole statement is already loaded. Reset to page 1 on any change so you
  // never land on a now-empty page.
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "auto" | "review">("all");

  // Bulk-assign: pick one account, apply it to every currently-selected row
  // at once — the fix for "categorize 40 rows one dropdown at a time."
  const [bulkAccountId, setBulkAccountId] = useState<string>("");

  // Keyboard nav over the visible page: j/k (or arrows) move focus, Space
  // toggles, Enter opens that row's category picker. Ignored while typing
  // into the search box or an open Select — see the keydown handler below.
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const rowSelectTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [confirmPostOpen, setConfirmPostOpen] = useState(false);

  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const preselectedDocId = searchParams.get("document");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ─── Data loading ─────────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    try {
      const [banks, categories] = await Promise.all([
        accountApi.list({ accountType: "Bank,Credit Card", excludeGroups: true }),
        accountApi.list({ rootType: "Expense,Income", excludeGroups: true }),
      ]);
      setBankAccounts(banks.data || []);
      setCategoryAccounts(categories.data || []);
      if (!bankAccountId && (banks.data || []).length === 1) {
        setBankAccountId(banks.data[0]._id);
      }
    } catch (error) {
      console.error(error);
      toast.error("Could not load your accounts");
    }
  }, [bankAccountId]);

  const loadStatements = useCallback(async () => {
    try {
      const res = await documentsApi.list({ inbox: "bank_statements", limit: 50 });
      const items = res.data || [];
      setStatements(items);
      return items;
    } catch (error) {
      console.error(error);
      toast.error("Could not load statements");
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      await loadAccounts();
      const items = await loadStatements();
      if (cancelled) return;

      const preselected = preselectedDocId
        ? items.find((doc) => doc._id === preselectedDocId)
        : null;
      if (preselected) setActiveDoc(preselected);

      setLoadingData(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while anything is still being read by the extractor.
  useEffect(() => {
    const anyProcessing = statements.some(
      (doc) =>
        doc.processingStatus === "PROCESSING" ||
        doc.processingStatus === "SCAN_IN_PROGRESS",
    );

    if (!anyProcessing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const items = await loadStatements();
      setActiveDoc((current) => {
        if (!current) return current;
        return items.find((doc) => doc._id === current._id) || current;
      });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [statements, loadStatements]);

  // Reset row state whenever a different statement is opened. Rows start
  // pre-filled from any suggestion the backend attached — a recognised
  // counterparty ("rule"/"pattern") pre-selects its category, but a
  // "contact_hint" is deliberately excluded: it names who this probably is,
  // it does not make a categorization decision, so the dropdown stays on
  // Uncategorised until the user actually picks something (see the badge
  // rendered per-row below for how each source is shown).
  useEffect(() => {
    if (!activeDoc) {
      setRows({});
      return;
    }
    const next: Record<string, RowSelection> = {};
    for (const txn of activeDoc.bankTransactions || []) {
      if (!txn._id || txn.addedToBank) continue;
      const suggestion = txn.suggestion;
      const prefillAccountId =
        suggestion && suggestion.source !== "contact_hint" && suggestion.accountId
          ? suggestion.accountId
          : null;
      next[txn._id] = { selected: true, accountId: prefillAccountId };
    }
    setRows(next);
    setPage(1);
    setSearchQuery("");
    setStatusFilter("all");
    setFocusedRowIndex(-1);
  }, [activeDoc]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const onUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await documentsApi.upload(file, {
        source: "manual",
        inboxType: "bank_statements",
        processingMode: "advanced",
      });
      toast.success("Statement uploaded — reading transactions…");
      const items = await loadStatements();
      const created = items.find((doc) => doc._id === res.data._id) || res.data;
      setActiveDoc(created);
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onReprocess = async () => {
    if (!activeDoc) return;
    try {
      await documentsApi.reprocess(activeDoc._id);
      toast.success("Re-reading statement…");
      await loadStatements();
    } catch (error) {
      console.error(error);
      toast.error("Could not re-read this statement");
    }
  };

  const onPost = async () => {
    if (!activeDoc) return;
    if (!bankAccountId) {
      toast.error("Choose which bank account this statement belongs to");
      return;
    }

    const lines = Object.entries(rows)
      .filter(([, row]) => row.selected)
      .map(([transactionId, row]) => ({ transactionId, accountId: row.accountId }));

    if (lines.length === 0) {
      toast.error("Select at least one transaction to post");
      return;
    }

    setConfirmPostOpen(false);
    setPosting(true);
    try {
      const res = await documentsApi.addToBank(activeDoc._id, {
        bankAccountId,
        lines,
      });

      const { journalsCreated, skipped } = res.data;
      const duplicates = (skipped || []).filter((s) => s.reason === "duplicate").length;
      const locked = (skipped || []).filter((s) => s.reason === "locked_period");

      if (journalsCreated > 0) {
        toast.success(
          `${journalsCreated} transaction${journalsCreated === 1 ? "" : "s"} posted to your books`,
        );
      }
      if (duplicates > 0) {
        toast.info(
          `${duplicates} transaction${duplicates === 1 ? " was" : "s were"} already imported and skipped`,
        );
      }
      if (locked.length > 0) {
        toast.error(locked[0].message);
      }
      if (journalsCreated === 0 && duplicates === 0 && locked.length === 0) {
        toast.info("Nothing was posted");
      }

      const items = await loadStatements();
      setActiveDoc(items.find((doc) => doc._id === activeDoc._id) || null);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Could not post these transactions";
      toast.error(message);
    } finally {
      setPosting(false);
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────

  const pendingTxns = useMemo(
    () => (activeDoc?.bankTransactions || []).filter((t) => !t.addedToBank && t._id),
    [activeDoc],
  );

  // Search + status filter, applied before pagination — at 1,000+ rows this
  // is the difference between "scroll and squint" and actually finding the
  // one transaction you're looking for.
  const filteredTxns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pendingTxns.filter((txn) => {
      if (q && !(txn.description || "").toLowerCase().includes(q)) return false;
      if (statusFilter === "all") return true;
      const row = rows[txn._id as string];
      const isAuto =
        txn.suggestion?.source === "rule" || txn.suggestion?.source === "pattern";
      if (statusFilter === "auto") return isAuto;
      // "review" = anything not auto-filled, i.e. still headed for Suspense
      // unless a human picks a category.
      return !isAuto && !row?.accountId;
    });
  }, [pendingTxns, searchQuery, statusFilter, rows]);

  const totalPages = Math.max(1, Math.ceil(filteredTxns.length / pageSize));

  // Posting removes rows from pendingTxns, which can strand the current page
  // past the new end — pull back onto the last real page rather than showing
  // a blank table.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // Filtering can also strand the page — reset to 1 whenever the filtered
  // set's shape changes underneath the current page.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const pagedTxns = useMemo(
    () => filteredTxns.slice((page - 1) * pageSize, page * pageSize),
    [filteredTxns, page, pageSize],
  );

  useEffect(() => {
    setFocusedRowIndex(-1);
  }, [page, pagedTxns.length]);

  const postedTxns = useMemo(
    () => (activeDoc?.bankTransactions || []).filter((t) => t.addedToBank),
    [activeDoc],
  );

  const selectedCount = useMemo(
    () => Object.values(rows).filter((r) => r.selected).length,
    [rows],
  );

  const uncategorisedCount = useMemo(
    () => Object.values(rows).filter((r) => r.selected && !r.accountId).length,
    [rows],
  );

  // "Select all" reflects (and only ever touches) the currently filtered
  // view — selecting everything while a filter narrows the table shouldn't
  // silently reach out and select rows you can't currently see.
  const allFilteredSelected =
    filteredTxns.length > 0 && filteredTxns.every((t) => rows[t._id as string]?.selected);

  // What "Post N to books" is actually about to do, across every selected
  // row regardless of filter/page — this is the confirm dialog's summary.
  const postSummary = useMemo(() => {
    let autoCount = 0;
    let suspenseCount = 0;
    let moneyIn = 0;
    let moneyOut = 0;
    for (const txn of pendingTxns) {
      const row = rows[txn._id as string];
      if (!row?.selected) continue;
      if (row.accountId) autoCount += 1;
      else suspenseCount += 1;
      if (Number(txn.credit || 0) > 0) moneyIn += Number(txn.credit || 0);
      else moneyOut += Number(txn.debit || 0);
    }
    return { autoCount, suspenseCount, moneyIn, moneyOut };
  }, [pendingTxns, rows]);

  /**
   * The backend logs a "validate" entry recording how many rows reconcile
   * against the statement's own running balance. Surfacing it here is what
   * lets you tell a faithful import from a bad one at a glance.
   */
  const validationNote = useMemo(() => {
    const entry = (activeDoc?.processingLogs || [])
      .filter((log) => log.stage === "validate")
      .slice(-1)[0];
    if (!entry) return null;
    return {
      status: entry.status === "ok" ? "ok" : "warn",
      message:
        entry.status === "ok"
          ? `${entry.message} These rows reconcile against the statement's own balance column.`
          : `${entry.message} Check these rows against your statement before posting.`,
    };
  }, [activeDoc]);

  const toggleAll = (checked: boolean) => {
    setRows((prev) => {
      const next = { ...prev };
      for (const txn of filteredTxns) {
        const id = txn._id as string;
        next[id] = { ...next[id], selected: checked };
      }
      return next;
    });
  };

  const applyBulkAccount = () => {
    if (!bulkAccountId || selectedCount === 0) return;
    const targetAccount = categoryAccounts.find((a) => a._id === bulkAccountId);
    setRows((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].selected) next[key] = { ...next[key], accountId: bulkAccountId };
      }
      return next;
    });
    toast.success(
      `${selectedCount} transaction${selectedCount === 1 ? "" : "s"} set to ${
        targetAccount?.name || "that account"
      }`,
    );
  };

  // Keyboard nav over the current page: j/↓ and k/↑ move a focus highlight,
  // Space toggles that row, Enter opens its category picker. Skipped whenever
  // focus is already inside an input/select/button, so typing in the search
  // box (or using a Select the normal way) is never hijacked.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.getAttribute("role") === "combobox" ||
          active.closest('[data-slot="select-content"]'));
      if (isTyping) return;
      if (pagedTxns.length === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.min(pagedTxns.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedRowIndex((i) => Math.max(0, i === -1 ? 0 : i - 1));
      } else if (e.key === " " && focusedRowIndex >= 0) {
        e.preventDefault();
        const txn = pagedTxns[focusedRowIndex];
        const id = txn._id as string;
        setRows((prev) => ({
          ...prev,
          [id]: { ...prev[id], selected: !prev[id]?.selected },
        }));
      } else if (e.key === "Enter" && focusedRowIndex >= 0) {
        e.preventDefault();
        const txn = pagedTxns[focusedRowIndex];
        rowSelectTriggerRefs.current[txn._id as string]?.click();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pagedTxns, focusedRowIndex]);

  const isProcessing =
    activeDoc?.processingStatus === "PROCESSING" ||
    activeDoc?.processingStatus === "SCAN_IN_PROGRESS";

  if (loading || orgLoading || !firebaseUser || (firebaseUser && needsOrgSetup)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Banking</span>}
          actions={
            <div className="flex items-center gap-2">
              <Link href="/banking/rules">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 text-xs"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Categorization rules
                </Button>
              </Link>
              <Link href="/batch-import?section=banking&type=Bank Statements&back=/banking">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 h-8 text-xs"
                >
                  <FileUp className="h-3.5 w-3.5" /> Batch Import
                </Button>
              </Link>
            </div>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* ─── Upload ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5 text-muted-foreground" />
                Import a bank statement
              </CardTitle>
              <CardDescription>
                Upload your statement as <strong>CSV, Excel, or PDF</strong> — all three are read
                directly and exactly, straight from the file's own text, with no AI involved.
                A scanned image falls back to AI extraction and should be checked more carefully.
                Either way you confirm every transaction before it reaches your books.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-end">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Which account is this statement for?
                  </label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((account) => (
                        <SelectItem key={account._id} value={account._id}>
                          {account.name}
                          {account.accountNumber ? ` — ${account.accountNumber}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.csv,.xls,.xlsx,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUpload(file);
                    }}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? "Uploading…" : "Upload statement"}
                  </Button>
                </div>
              </div>

              {bankAccounts.length === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    You don&apos;t have a bank account set up yet. Add one under{" "}
                    <Link
                      href="/accountant/chart-of-accounts"
                      className="underline underline-offset-2 font-medium"
                    >
                      Chart of Accounts
                    </Link>{" "}
                    (account type &ldquo;Bank&rdquo;) before importing.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Statement list ─────────────────────────────────────── */}
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Your statements</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {statements.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      No statements imported yet.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {statements.map((doc) => {
                        const pending = (doc.bankTransactions || []).filter(
                          (t) => !t.addedToBank,
                        ).length;
                        const isActive = activeDoc?._id === doc._id;
                        return (
                          <li key={doc._id}>
                            <button
                              type="button"
                              onClick={() => setActiveDoc(doc)}
                              className={cn(
                                "w-full px-6 py-3 text-left transition-colors hover:bg-muted/50",
                                isActive && "bg-muted",
                              )}
                            >
                              <p className="truncate text-sm font-medium">
                                {doc.fileName}
                              </p>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(doc.uploadedAt)}
                                </span>
                                {doc.processingStatus === "PROCESSING" ||
                                doc.processingStatus === "SCAN_IN_PROGRESS" ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Reading…
                                  </Badge>
                                ) : doc.processingStatus === "UNREADABLE" ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    Unreadable
                                  </Badge>
                                ) : pending > 0 ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    {pending} to review
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Done
                                  </Badge>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* ─── Review table ─────────────────────────────────────── */}
              <Card>
                {!activeDoc ? (
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    Select a statement to review its transactions.
                  </CardContent>
                ) : (
                  <>
                    <CardHeader className="pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">{activeDoc.fileName}</CardTitle>
                          <CardDescription>
                            {isProcessing
                              ? "Reading transactions from this statement…"
                              : `${pendingTxns.length} to review · ${postedTxns.length} already posted`}
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onReprocess}
                          disabled={isProcessing}
                          className="gap-1.5 h-8 text-xs"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> Re-read
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {isProcessing && (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Extracting transactions…
                        </div>
                      )}

                      {!isProcessing && activeDoc.processingStatus === "UNREADABLE" && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          <span>
                            {activeDoc.errorMessage ||
                              "Couldn't read this file. If it's a password-protected PDF, remove the password and upload again."}
                          </span>
                        </div>
                      )}

                      {/* Extraction quality — the balance-chain check tells you
                          whether the rows below actually reconcile. */}
                      {!isProcessing && validationNote && (
                        <div
                          className={cn(
                            "flex items-start gap-2 rounded-md border p-3 text-xs",
                            validationNote.status === "ok"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
                          )}
                        >
                          {validationNote.status === "ok" ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{validationNote.message}</span>
                        </div>
                      )}

                      {!isProcessing && pendingTxns.length > 0 && (
                        <>
                          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              Set a category for each line. Anything you leave blank posts to{" "}
                              <strong className="font-medium text-foreground">
                                {SUSPENSE_LABEL}
                              </strong>{" "}
                              so your accountant can sort it later. If a line is a customer
                              payment or a vendor bill you already recorded, leave it
                              uncategorised rather than treating it as new income or expense.
                              Lines badged{" "}
                              <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <Sparkles className="h-2.5 w-2.5" /> Auto
                              </span>{" "}
                              were pre-filled from how you (or a teammate) categorized this exact
                              counterparty before — check them before posting, just like any other
                              row.
                            </span>
                          </div>

                          {/* ─── Search / filter / keyboard-shortcut hint ──── */}
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative min-w-[200px] flex-1">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search description…"
                                className="h-8 pl-8 text-xs"
                              />
                            </div>
                            <Select
                              value={statusFilter}
                              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                            >
                              <SelectTrigger className="h-8 w-44 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All transactions</SelectItem>
                                <SelectItem value="auto">Auto-categorized</SelectItem>
                                <SelectItem value="review">Needs review</SelectItem>
                              </SelectContent>
                            </Select>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground"
                                  >
                                    <Keyboard className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-[220px] text-xs">
                                  <span className="font-mono">j</span>/<span className="font-mono">k</span> move
                                  · <span className="font-mono">space</span> select ·{" "}
                                  <span className="font-mono">enter</span> set category
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {(searchQuery || statusFilter !== "all") && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {filteredTxns.length} of {pendingTxns.length}
                              </span>
                            )}
                          </div>

                          {/* ─── Bulk-assign — apply one category to every selected row ── */}
                          {selectedCount > 0 && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2.5 text-xs">
                              <Wand2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-muted-foreground">
                                Apply a category to all{" "}
                                <span className="font-medium text-foreground">{selectedCount}</span>{" "}
                                selected:
                              </span>
                              <div className="w-48">
                                <Select value={bulkAccountId} onValueChange={setBulkAccountId}>
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="Choose account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categoryAccounts.map((account) => (
                                      <SelectItem key={account._id} value={account._id}>
                                        {account.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                disabled={!bulkAccountId}
                                onClick={applyBulkAccount}
                              >
                                Apply
                              </Button>
                            </div>
                          )}

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10">
                                    <Checkbox
                                      checked={allFilteredSelected}
                                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                                      aria-label="Select all"
                                    />
                                  </TableHead>
                                  <TableHead className="w-28">Date</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="w-32 text-right">Amount</TableHead>
                                  <TableHead className="w-64">Category</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {pagedTxns.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                                      No transactions match &ldquo;{searchQuery}&rdquo;. Try a different search or
                                      switch the filter back to All transactions.
                                    </TableCell>
                                  </TableRow>
                                )}
                                {pagedTxns.map((txn, index) => {
                                  const id = txn._id as string;
                                  const row = rows[id];
                                  const isMoneyIn = Number(txn.credit || 0) > 0;
                                  const amount = isMoneyIn ? txn.credit : txn.debit;
                                  const isFocused = index === focusedRowIndex;

                                  return (
                                    <TableRow
                                      key={id}
                                      className={cn(
                                        !row?.selected && "opacity-50",
                                        isFocused && "bg-muted/70 outline outline-1 -outline-offset-1 outline-primary/40",
                                      )}
                                    >
                                      <TableCell>
                                        <Checkbox
                                          checked={row?.selected ?? false}
                                          onCheckedChange={(v) =>
                                            setRows((prev) => ({
                                              ...prev,
                                              [id]: {
                                                ...prev[id],
                                                selected: Boolean(v),
                                              },
                                            }))
                                          }
                                          aria-label={`Select transaction: ${txn.description || "untitled"}`}
                                        />
                                      </TableCell>
                                      <TableCell className="text-xs whitespace-nowrap">
                                        {formatDate(txn.txnDate)}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        <span className="line-clamp-2">
                                          {txn.description || "—"}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <span
                                          className={cn(
                                            "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
                                            isMoneyIn
                                              ? "text-emerald-600 dark:text-emerald-400"
                                              : "text-foreground",
                                          )}
                                        >
                                          {isMoneyIn ? (
                                            <ArrowDownLeft className="h-3 w-3" />
                                          ) : (
                                            <ArrowUpRight className="h-3 w-3" />
                                          )}
                                          {formatAmount(amount)}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1.5">
                                          <div className="min-w-0 flex-1">
                                            <Select
                                              value={row?.accountId ?? "__suspense__"}
                                              onValueChange={(value) =>
                                                setRows((prev) => ({
                                                  ...prev,
                                                  [id]: {
                                                    ...prev[id],
                                                    accountId:
                                                      value === "__suspense__" ? null : value,
                                                  },
                                                }))
                                              }
                                            >
                                              <SelectTrigger
                                                ref={(el) => {
                                                  rowSelectTriggerRefs.current[id] = el;
                                                }}
                                                className="h-8 text-xs"
                                                aria-label={`Category for ${txn.description || "this transaction"}`}
                                              >
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="__suspense__">
                                                  {SUSPENSE_LABEL}
                                                </SelectItem>
                                                {categoryAccounts.map((account) => (
                                                  <SelectItem key={account._id} value={account._id}>
                                                    {account.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>

                                          {/* Smart categorization badge — always visible, never
                                              a silent black box. "rule"/"pattern" are confident
                                              and already pre-filled the Select above;
                                              "contact_hint" is a lower-confidence pointer at an
                                              identity, shown but deliberately not pre-selected. */}
                                          {txn.suggestion?.source === "rule" && (
                                            <Badge
                                              variant="secondary"
                                              title="Auto-filled: you've categorized this counterparty this way before"
                                              className="shrink-0 gap-1 whitespace-nowrap bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            >
                                              <Sparkles className="h-2.5 w-2.5" /> Auto
                                            </Badge>
                                          )}
                                          {txn.suggestion?.source === "pattern" && (
                                            <Badge
                                              variant="secondary"
                                              title="Auto-filled: recognised as a bank charge narration"
                                              className="shrink-0 gap-1 whitespace-nowrap bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                                            >
                                              <Sparkles className="h-2.5 w-2.5" /> Auto
                                            </Badge>
                                          )}
                                          {txn.suggestion?.source === "contact_hint" && (
                                            <Badge
                                              variant="outline"
                                              title={`Looks like ${
                                                txn.suggestion.contactName || "a saved contact"
                                              } based on their saved bank details — not auto-filled, pick a category to confirm`}
                                              className="shrink-0 gap-1 whitespace-nowrap text-[10px] text-muted-foreground"
                                            >
                                              <Lightbulb className="h-2.5 w-2.5" />
                                              <span className="max-w-[7rem] truncate">
                                                {txn.suggestion.contactName || "Known contact"}
                                              </span>
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>

                          {filteredTxns.length > pageSize && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                              <p>
                                Showing{" "}
                                <span className="font-medium text-foreground">
                                  {(page - 1) * pageSize + 1}–
                                  {Math.min(page * pageSize, filteredTxns.length)}
                                </span>{" "}
                                of{" "}
                                <span className="font-medium text-foreground">
                                  {filteredTxns.length}
                                </span>{" "}
                                {filteredTxns.length === pendingTxns.length ? "pending" : "matching"}
                              </p>
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5">
                                  Rows
                                  <select
                                    aria-label="Rows per page"
                                    className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                                    value={pageSize}
                                    onChange={(e) => {
                                      setPageSize(Number(e.target.value));
                                      setPage(1);
                                    }}
                                  >
                                    {[50, 100, 200, 500].map((n) => (
                                      <option key={n} value={n}>
                                        {n}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={page <= 1}
                                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                  Previous
                                </Button>
                                <span className="tabular-nums">
                                  Page {page} of {totalPages}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={page >= totalPages}
                                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <p className="text-xs text-muted-foreground">
                              {selectedCount} selected
                              {uncategorisedCount > 0 && (
                                <>
                                  {" · "}
                                  <span className="text-amber-600 dark:text-amber-400">
                                    {uncategorisedCount} will go to {SUSPENSE_LABEL}
                                  </span>
                                </>
                              )}
                            </p>
                            <Button
                              onClick={() => setConfirmPostOpen(true)}
                              disabled={posting || selectedCount === 0 || !bankAccountId}
                              className="gap-1.5"
                            >
                              {posting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              {posting ? "Posting…" : `Post ${selectedCount} to books`}
                            </Button>
                          </div>
                        </>
                      )}

                      {!isProcessing &&
                        pendingTxns.length === 0 &&
                        activeDoc.processingStatus === "PROCESSED" && (
                          <div className="flex flex-col items-center gap-2 py-12 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <p className="text-sm font-medium">
                              Everything on this statement is posted
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {postedTxns.length} transaction
                              {postedTxns.length === 1 ? "" : "s"} are in your books.{" "}
                              <Link
                                href="/accountant/journal-entries"
                                className="underline underline-offset-2"
                              >
                                View journal entries
                              </Link>
                            </p>
                          </div>
                        )}
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          )}
        </div>
      </SidebarInset>

      <Dialog open={confirmPostOpen} onOpenChange={setConfirmPostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post {selectedCount} transaction{selectedCount === 1 ? "" : "s"} to your books?</DialogTitle>
            <DialogDescription>
              This creates real journal entries — you can still fix a category afterwards, but the
              entries themselves aren&apos;t undone by leaving this page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Categorized</span>
              <span className="font-medium tabular-nums">{postSummary.autoCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Going to {SUSPENSE_LABEL}</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  postSummary.suspenseCount > 0 && "text-amber-600 dark:text-amber-400",
                )}
              >
                {postSummary.suspenseCount}
              </span>
            </div>
            <div className="my-1 border-t" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Money in</span>
              <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatAmount(postSummary.moneyIn)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Money out</span>
              <span className="font-medium tabular-nums">-{formatAmount(postSummary.moneyOut)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPostOpen(false)} disabled={posting}>
              Cancel
            </Button>
            <Button onClick={onPost} disabled={posting} className="gap-1.5">
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {posting ? "Posting…" : "Confirm & post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export default function BankingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <BankingPageContent />
    </Suspense>
  );
}
