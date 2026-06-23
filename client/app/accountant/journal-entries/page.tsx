"use client";
import Link from "next/link";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  RefreshCw,
  Edit,
  Printer,
  MoreHorizontal,
  X,
  RefreshCcw,
  ChevronDown,
  History,
  Download,  FileUp, Upload} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { journalApi, type Journal as ApiJournal } from "@/lib/api/journals";

// ─── Types ──────────────────────────────────────────────────────────────────

type JournalStatus = "Published" | "Draft" | "Voided";

type JournalLine = {
  account: string;
  contact: string;
  debit: number;
  credit: number;
};

type Journal = {
  id: string;
  journalNumber: string;
  date: string;
  displayDate: string;
  reference: string;
  status: JournalStatus;
  notes: string;
  amount: number;
  currency: string;
  lines: JournalLine[];
};

function mapJournal(apiJournal: ApiJournal): Journal {
  const vendorName =
    apiJournal.vendorId && typeof apiJournal.vendorId !== "string" ?
      apiJournal.vendorId.displayName || apiJournal.vendorId.companyName || ""
    : "";

  const lines: JournalLine[] = (apiJournal.lineItems || []).map((line) => {
    const accountName =
      typeof line.accountId === "string" ?
        line.accountId
      : line.accountId?.name || String(line.accountId?._id || "");

    return {
      account: accountName,
      contact: vendorName,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    };
  });

  const mappedStatus: JournalStatus =
    apiJournal.status === "Posted" ? "Published" : apiJournal.status;

  return {
    id: apiJournal._id,
    journalNumber: apiJournal.journalNumber,
    date: apiJournal.date,
    displayDate: new Date(apiJournal.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    reference: apiJournal.referenceNumber || "",
    status: mappedStatus,
    notes: apiJournal.notes || apiJournal.description || "",
    amount: Number(apiJournal.totalDebit || 0),
    currency: "INR",
    lines,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtCurrency(n: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

// ─── Journal Detail Panel ────────────────────────────────────────────────────

function JournalDetailPanel({
  journal,
  onClose,
  onEdit,
  onDelete,
}: {
  journal: Journal;
  onClose: () => void;
  onEdit: (j: Journal) => void;
  onDelete: (j: Journal) => void;
}) {
  const totalDebits = journal.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredits = journal.lines.reduce((s, l) => s + l.credit, 0);

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Journal ${journal.journalNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size:13px; color:#111; padding:40px; }
    .header { display:flex; justify-content:flex-end; margin-bottom:32px; }
    .title { font-size:36px; font-weight:300; color:#aaa; letter-spacing:2px; text-align:right; }
    .num { font-size:13px; color:#999; text-align:right; margin-top:4px; }
    .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; margin:24px 0; }
    .meta-row { display:flex; justify-content:space-between; font-size:13px; border-bottom:1px solid #f0f0f0; padding:6px 0; }
    .meta-label { color:#888; }
    .meta-val { font-weight:500; }
    table { width:100%; border-collapse:collapse; margin-top:24px; }
    thead tr { background:#374151; color:#fff; }
    th { padding:10px 12px; text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; }
    th.right { text-align:right; }
    tbody tr { border-bottom:1px solid #f3f4f6; }
    tbody tr:hover { background:#fafafa; }
    td { padding:10px 12px; font-size:13px; }
    td.right { text-align:right; tabular-nums; }
    tfoot td { padding:10px 12px; font-size:13px; border-top:2px solid #e5e7eb; }
    .total-label { text-align:right; color:#555; }
    .total-val { text-align:right; font-weight:700; }
    .grand-total { font-size:15px; }
    .ribbon { position:fixed; top:18px; left:-24px; background:#22c55e; color:#fff; font-size:11px; font-weight:700; padding:4px 32px; transform:rotate(-45deg); letter-spacing:.08em; }
    @media print { body { padding:24px; } .ribbon { display:none; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">JOURNAL</div>
      <div class="num">#${journal.journalNumber}</div>
    </div>
  </div>

  <div class="meta">
    <div>
      <div class="meta-row"><span class="meta-label">Notes</span><span class="meta-val">${journal.notes}</span></div>
    </div>
    <div>
      <div class="meta-row"><span class="meta-label">Date:</span><span class="meta-val">${journal.displayDate}</span></div>
      <div class="meta-row"><span class="meta-label">Amount:</span><span class="meta-val">${fmtCurrency(journal.amount, journal.currency)}</span></div>
      <div class="meta-row"><span class="meta-label">Reference Number:</span><span class="meta-val">${journal.reference}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Account</th>
        <th>Contact</th>
        <th class="right">Debits</th>
        <th class="right">Credits</th>
      </tr>
    </thead>
    <tbody>
      ${journal.lines
        .map(
          (l) => `
      <tr>
        <td>${l.account}</td>
        <td>${l.contact || ""}</td>
        <td class="right">${l.debit ? l.debit.toFixed(2) : ""}</td>
        <td class="right">${l.credit ? l.credit.toFixed(2) : ""}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" class="total-label">Sub Total</td>
        <td class="right">${totalDebits.toFixed(2)}</td>
        <td class="right">${totalCredits.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="2" class="total-label grand-total"><strong>Total</strong></td>
        <td class="right grand-total total-val">${fmtCurrency(totalDebits, journal.currency)}</td>
        <td class="right grand-total total-val">${fmtCurrency(totalCredits, journal.currency)}</td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Action bar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        {/* Left actions */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8"
            onClick={() => onEdit(journal)}
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
                <Printer className="h-3.5 w-3.5" />
                PDF/Print
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handlePrint} className="gap-2 text-sm">
                <Printer className="h-3.5 w-3.5" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint} className="gap-2 text-sm">
                <Download className="h-3.5 w-3.5" /> Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
            <RefreshCcw className="h-3.5 w-3.5" />
            Make Recurring
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem className="gap-2 text-sm">
                <Edit className="h-3.5 w-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-sm text-destructive focus:text-destructive"
                onClick={() => onDelete(journal)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right: Comments & close */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8 text-muted-foreground"
          >
            <History className="h-3.5 w-3.5" />
            Comments &amp; History
          </Button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-0.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Journal document preview ── */}
      <div className="flex-1 overflow-auto bg-muted/10 p-6">
        <div className="bg-white shadow-md rounded-lg max-w-3xl mx-auto relative overflow-hidden">
          {/* Status ribbon */}
          <div
            className="absolute left-0 top-0 w-20 h-20 overflow-hidden pointer-events-none"
            style={{ zIndex: 10 }}
          >
            <div
              className={cn(
                "absolute text-white text-[9px] font-bold uppercase tracking-widest px-5 py-1 shadow-md",
                "-left-7 top-4",
                "-rotate-45",
                journal.status === "Published" ?
                  "bg-emerald-500"
                : "bg-amber-500",
              )}
              style={{ width: "100px" }}
            >
              {journal.status}
            </div>
          </div>

          {/* Document content */}
          <div className="px-10 py-10">
            {/* Header: JOURNAL title right-aligned */}
            <div className="flex justify-end mb-8">
              <div className="text-right">
                <p
                  className="text-5xl font-light tracking-widest"
                  style={{ color: "#c5c5c5" }}
                >
                  JOURNAL
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  #{journal.journalNumber}
                </p>
              </div>
            </div>

            {/* Meta info: notes left, date/amount/ref right */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm font-medium text-primary">
                  {journal.notes}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{journal.displayDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">
                    {fmtCurrency(journal.amount, journal.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Reference Number:
                  </span>
                  <span className="font-medium">{journal.reference}</span>
                </div>
              </div>
            </div>

            {/* Lines table */}
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#374151] text-white">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-tl">
                    Account
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
                    Debits
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-tr">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {journal.lines.map((line, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm text-primary font-medium">
                      {line.account}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {line.contact}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {line.debit > 0 ? line.debit.toFixed(2) : ""}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {line.credit > 0 ? line.credit.toFixed(2) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td
                    colSpan={2}
                    className="px-4 py-2.5 text-sm text-right text-muted-foreground"
                  >
                    Sub Total
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums font-medium">
                    {totalDebits.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-right tabular-nums font-medium">
                    {totalCredits.toFixed(2)}
                  </td>
                </tr>
                <tr className="border-t-2 border-gray-300">
                  <td
                    colSpan={2}
                    className="px-4 py-3 text-sm text-right font-bold"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {fmtCurrency(totalDebits, journal.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {fmtCurrency(totalCredits, journal.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type StatusFilter = "All Journals" | "Draft" | "Published" | "Voided";

export default function JournalEntriesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("All Journals");
  const [selected, setSelected] = useState<Journal | null>(null);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loadingJournals, setLoadingJournals] = useState(true);

  const handleExportCSV = () => {
    if (journals.length === 0) {
      toast.error("No journals to export");
      return;
    }
    const headers = [
      "Journal Number",
      "Date",
      "Reference Number",
      "Notes",
      "Total Debit",
      "Total Credit",
      "Status"
    ];

    const rows = journals.map(j => [
      j.journalNumber,
      j.date,
      j.reference || "",
      j.notes || "",
      j.amount,
      j.amount,
      j.status
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(val => {
          const str = String(val ?? "").replace(/"/g, '""');
          return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `journals_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Journals exported successfully to CSV");
  };

  const refreshJournals = useCallback(async () => {
    setLoadingJournals(true);
    try {
      const res = await journalApi.list({ limit: 200 });
      const mapped = (res.data || []).map(mapJournal);
      setJournals(mapped);
      setSelected((prev) => {
        if (!prev) return null;
        return mapped.find((j) => j.id === prev.id) || null;
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load journals";
      toast.error(message);
    } finally {
      setLoadingJournals(false);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await journalApi.remove(id);
        if (selected?.id === id) setSelected(null);
        await refreshJournals();
        toast.success("Journal deleted");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to delete journal";
        toast.error(message);
      }
    },
    [refreshJournals, selected?.id],
  );

  useEffect(() => {
    // Load on mount
    void refreshJournals();
    // Also refresh whenever we navigate back to this tab
    const handleFocus = () => {
      void refreshJournals();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshJournals]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const panelOpen = !!selected;

  const filtered = journals.filter((j) => {
    const matchSearch =
      !search ||
      j.journalNumber.includes(search) ||
      (j.reference || "").toLowerCase().includes(search.toLowerCase()) ||
      (j.notes || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "All Journals" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        {/* ── Header ── */}
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Accountant <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                Journal Entries
              </span>
            </span>
          }
          actions={
            !panelOpen ?
              <>
                <div className="relative w-52">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search journals…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2"
                  onClick={() => void refreshJournals()}
                  disabled={loadingJournals}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => router.push("/accountant/journal-entries/new")}
                >
                  <Plus className="h-4 w-4" /> New Journal
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white">
                    <DropdownMenuItem onClick={() => router.push("/batch-import?section=accountant&type=Journal Entries&back=/accountant/journal-entries")} className="cursor-pointer">
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
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={() => router.push("/accountant/journal-entries/import")} className="cursor-pointer">
                            <span className="text-xs">Import Journals</span>
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
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                            <span className="text-xs">Export Journals</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            : null
          }
        />

        <div className="flex flex-1 overflow-hidden">
          {/* ── LEFT: list ── */}
          <div
            className={cn(
              "flex flex-col border-r transition-all duration-200 overflow-hidden",
              panelOpen ? "w-75 shrink-0" : "flex-1",
            )}
          >
            {/* List header / tabs */}
            <div
              className={cn(
                "flex items-center shrink-0 border-b",
                panelOpen ? "px-3 py-2 justify-between" : "px-4 pt-1",
              )}
            >
              {panelOpen ?
                <>
                  <span className="text-sm font-semibold">Journals</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        router.push("/accountant/journal-entries/new")
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              : <div className="flex items-center gap-0">
                  {(
                    [
                      "All Journals",
                      "Draft",
                      "Published",
                      "Voided",
                    ] as StatusFilter[]
                  ).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(tab)}
                      className={cn(
                        "text-sm pb-2 mr-5 border-b-2 -mb-px transition-colors",
                        statusFilter === tab ?
                          "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              }
            </div>

            {/* Search when narrow */}
            {panelOpen && (
              <div className="px-2 py-1.5 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-7 h-7 text-xs"
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Content */}
            {panelOpen ?
              /* Narrow rows when detail open */
              <div className="flex-1 overflow-y-auto divide-y">
                {filtered.map((j) => {
                  const isSel = selected?.id === j.id;
                  return (
                    <div
                      key={j.id}
                      onClick={() => setSelected(j)}
                      className={cn(
                        "flex items-start gap-2 px-3 py-3 cursor-pointer hover:bg-muted/20 transition-colors",
                        isSel && "bg-blue-50 border-l-2 border-l-primary",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2 items-start">
                          <p
                            className={cn(
                              "text-xs font-medium truncate",
                              isSel ? "text-primary" : "",
                            )}
                          >
                            {j.displayDate}
                          </p>
                          <p className="text-xs font-semibold tabular-nums shrink-0">
                            {fmtCurrency(j.amount, j.currency)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span className="text-primary font-medium">
                            {j.journalNumber}
                          </span>
                          <span>·</span>
                          <span
                            className={
                              j.status === "Published" ?
                                "text-emerald-600 font-semibold"
                              : j.status === "Draft" ?
                                "text-amber-500 font-semibold"
                              : "text-slate-500 font-semibold"
                            }
                          >
                            {j.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            : /* Full table when no detail open */
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" className="accent-primary" />
                      </th>
                      {[
                        "Date",
                        "Journal#",
                        "Reference Number",
                        "Status",
                        "Notes",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Amount
                      </th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loadingJournals ?
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-16 text-muted-foreground text-sm"
                        >
                          Loading journals...
                        </td>
                      </tr>
                    : filtered.length === 0 ?
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-16 text-muted-foreground text-sm"
                        >
                          No journal entries found.
                        </td>
                      </tr>
                    : filtered.map((j) => (
                        <tr
                          key={j.id}
                          onClick={() => setSelected(j)}
                          className="hover:bg-muted/20 cursor-pointer group"
                        >
                          <td
                            className="px-4 py-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input type="checkbox" className="accent-primary" />
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                            {j.displayDate}
                          </td>
                          <td className="px-3 py-2.5 text-primary font-medium">
                            {j.journalNumber}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {j.reference}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "text-[11px] font-semibold tracking-wide uppercase",
                                j.status === "Published" ? "text-emerald-600"
                                : j.status === "Draft" ? "text-amber-500"
                                : "text-slate-500",
                              )}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td className="max-w-50 truncate px-3 py-2.5 text-sm text-muted-foreground">
                            {j.notes}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                            {fmtCurrency(j.amount, j.currency)}
                          </td>
                          <td
                            className="px-2 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  className="gap-2 text-sm"
                                  onClick={() =>
                                    router.push(
                                      `/accountant/journal-entries/${j.id}/edit`,
                                    )
                                  }
                                >
                                  <Edit className="h-3.5 w-3.5" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-sm text-destructive focus:text-destructive"
                                  onClick={() => void handleDelete(j.id)}
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          {/* ── RIGHT: detail panel ── */}
          {panelOpen && selected && (
            <div className="flex-1 overflow-hidden">
              <JournalDetailPanel
                journal={selected}
                onClose={() => setSelected(null)}
                onEdit={(j) =>
                  router.push(`/accountant/journal-entries/${j.id}/edit`)
                }
                onDelete={(j) => void handleDelete(j.id)}
              />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
