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
  Landmark,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
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

  const totalPages = Math.max(1, Math.ceil(pendingTxns.length / pageSize));

  // Posting removes rows from pendingTxns, which can strand the current page
  // past the new end — pull back onto the last real page rather than showing
  // a blank table.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pagedTxns = useMemo(
    () => pendingTxns.slice((page - 1) * pageSize, page * pageSize),
    [pendingTxns, page, pageSize],
  );

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

  const allSelected = pendingTxns.length > 0 && selectedCount === pendingTxns.length;

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
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], selected: checked };
      }
      return next;
    });
  };

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
            <Link href="/batch-import?section=banking&type=Bank Statements&back=/banking">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                <FileUp className="h-3.5 w-3.5" /> Batch Import
              </Button>
            </Link>
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

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10">
                                    <Checkbox
                                      checked={allSelected}
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
                                {pagedTxns.map((txn) => {
                                  const id = txn._id as string;
                                  const row = rows[id];
                                  const isMoneyIn = Number(txn.credit || 0) > 0;
                                  const amount = isMoneyIn ? txn.credit : txn.debit;

                                  return (
                                    <TableRow key={id} className={cn(!row?.selected && "opacity-50")}>
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
                                          aria-label="Select transaction"
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
                                              <SelectTrigger className="h-8 text-xs">
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

                          {pendingTxns.length > pageSize && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
                              <p>
                                Showing{" "}
                                <span className="font-medium text-foreground">
                                  {(page - 1) * pageSize + 1}–
                                  {Math.min(page * pageSize, pendingTxns.length)}
                                </span>{" "}
                                of{" "}
                                <span className="font-medium text-foreground">
                                  {pendingTxns.length}
                                </span>{" "}
                                pending
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
                              onClick={onPost}
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
