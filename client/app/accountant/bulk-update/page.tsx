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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Search,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  History,
  ArrowRight,
  Filter,
  BookOpen,
  Clock,
  CheckCircle2,
  SlidersHorizontal,  FileUp} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  bulkUpdateApi,
  type BulkUpdateModuleType,
  type BulkTransaction,
  type BulkUpdateJob,
} from "@/lib/api/bulk-update";
import { accountApi, type Account } from "@/lib/api/accounts";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_TYPES: { label: string; value: BulkUpdateModuleType }[] = [
  { label: "Invoices", value: "Invoices" },
  { label: "Quotes", value: "Quotes" },
  { label: "Sales Orders", value: "Sales Orders" },
  { label: "Expenses", value: "Expenses" },
  { label: "Delivery Challans", value: "Delivery Challans" },
];

const STATUS_OPTIONS: Record<BulkUpdateModuleType, string[]> = {
  Invoices: ["All", "Draft", "Sent", "Viewed", "Overdue", "Partially Paid", "Paid", "Void"],
  Quotes: ["All", "Draft", "Sent", "Accepted", "Declined", "Expired"],
  "Sales Orders": ["All", "Draft", "Confirmed", "Delivered", "Cancelled"],
  Expenses: ["All", "Draft", "Submitted", "Approved", "Rejected", "Reimbursed"],
  "Delivery Challans": ["All", "Draft", "Open", "Delivered"],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtAmount(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── View: Landing ────────────────────────────────────────────────────────────

function LandingView({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center bg-white">
      {/* Illustration */}
      <div className="relative w-24 h-24 mb-6">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-400 flex items-center justify-center shadow-lg">
          <BookOpen className="h-12 w-12 text-white" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center border-2 border-background">
          <SlidersHorizontal className="h-4 w-4 text-white" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-foreground mb-1">
        Bulk Update Accounts in Transactions
      </h2>
      <p className="text-sm text-slate-500 max-w-lg mb-6 leading-relaxed">
        Filter transactions{" "}
        <span className="text-teal-700 font-semibold">
          (Invoices, Credit Notes, Purchase Orders, Expenses, Bills, Vendor
          Credits)
        </span>{" "}
        and{" "}
        <span className="text-teal-700 font-semibold">bulk-update</span> its
        accounts with a new account
      </p>

      {/* Warning box */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 max-w-lg mb-8 text-left">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 leading-relaxed">
          Bulk-updating accounts in transactions will cause significant changes to
          the financial data of your business. We recommend that you do this with
          the assistance of an accountant.
        </p>
      </div>

      <Button
        onClick={onStart}
        className="gap-2 px-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
      >
        <Filter className="h-4 w-4" />
        Filter and Bulk Update
      </Button>
    </div>
  );
}

// ─── View: Filter & Search ────────────────────────────────────────────────────

function FilterView({
  accounts,
  onSearch,
  searching,
}: {
  accounts: Account[];
  onSearch: (params: {
    moduleType: BulkUpdateModuleType;
    accountId: string;
    dateFrom: string;
    dateTo: string;
    status: string;
    search: string;
  }) => void;
  searching: boolean;
}) {
  const [moduleType, setModuleType] = useState<BulkUpdateModuleType>("Invoices");
  const [accountId, setAccountId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");

  const statuses = STATUS_OPTIONS[moduleType];

  const handleSearch = () => {
    onSearch({ moduleType, accountId, dateFrom, dateTo, status, search });
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <div className="px-6 py-5 max-w-2xl">
        <h3 className="text-base font-semibold text-foreground mb-1">
          Filter Transactions
        </h3>
        <p className="text-xs text-muted-foreground mb-6">
          Use the filters below to find which transactions need to have their
          account updated.
        </p>

        <div className="space-y-4">
          {/* Module Type */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <label className="text-sm font-medium text-foreground text-right">
              Transaction Type <span className="text-destructive">*</span>
            </label>
            <Select
              value={moduleType}
              onValueChange={(v) => {
                setModuleType(v as BulkUpdateModuleType);
                setStatus("All");
              }}
            >
              <SelectTrigger className="h-9 w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULE_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <label className="text-sm font-medium text-foreground text-right">
              Account
            </label>
            <Select
              value={accountId || "__all__"}
              onValueChange={(v) => setAccountId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full max-w-xs focus:ring-teal-600/20 focus:border-teal-500">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Accounts</SelectItem>
                {accounts.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-500">
                    No accounts found.{" "}
                    <a href="/accountant/chart-of-accounts" className="text-teal-700 hover:text-teal-800 underline underline-offset-2 font-semibold">
                      Set up Chart of Accounts
                    </a>
                  </div>
                ) : (
                  accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <label className="text-sm font-medium text-foreground text-right">
              Date Range
            </label>
            <div className="flex items-center gap-2 max-w-xs">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-600/20 focus-visible:border-teal-500"
              />
              <span className="text-muted-foreground text-xs shrink-0">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-600/20 focus-visible:border-teal-500"
              />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <label className="text-sm font-medium text-foreground text-right">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <label className="text-sm font-medium text-foreground text-right">
              Search
            </label>
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-8 h-9 text-sm focus-visible:ring-teal-600/20 focus-visible:border-teal-500"
                placeholder="Reference, number…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={handleSearch}
            disabled={searching}
            className="gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            size="sm"
          >
            {searching ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
          <p className="text-xs text-muted-foreground">
            Maximum 50 transactions can be updated at once.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── View: Results & Select ───────────────────────────────────────────────────

function ResultsView({
  transactions,
  selected,
  onToggle,
  onToggleAll,
  onUpdate,
  onBack,
}: {
  transactions: BulkTransaction[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onUpdate: () => void;
  onBack: () => void;
}) {
  const allChecked =
    transactions.length > 0 && transactions.every((t) => selected.has(t._id));
  const someChecked = transactions.some((t) => selected.has(t._id));

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b bg-background shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-teal-700 hover:text-teal-800 hover:underline underline-offset-2 flex items-center gap-1 font-semibold"
          >
            ← Back to Filters
          </button>
          <span className="text-muted-foreground text-xs">|</span>
          <span className="text-sm font-medium text-foreground">
            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} found
          </span>
          {selected.size > 0 && (
            <span className="text-xs text-teal-700 font-semibold">
              · {selected.size} selected
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={onUpdate}
          disabled={selected.size === 0}
          className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
        >
          Update Selected
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Search className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm">No transactions match your filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b bg-slate-50 border-slate-200">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="accent-teal-600"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = !allChecked && someChecked;
                    }}
                    onChange={onToggleAll}
                  />
                </th>
                {[
                  { key: "number", label: "Number" },
                  { key: "date", label: "Date" },
                  { key: "contact", label: "Contact" },
                  { key: "status", label: "Status" },
                  { key: "accountNames", label: "Current Account" },
                  { key: "total", label: "Amount", right: true },
                ].map(({ key, label, right }) => (
                  <th
                    key={key}
                    className={cn(
                      "text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap",
                      right ? "text-right" : "text-left"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {transactions.map((t) => (
                <tr
                  key={t._id}
                  className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30 transition-colors cursor-pointer group"
                  onClick={() => onToggle(t._id)}
                >
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="accent-teal-600"
                      checked={selected.has(t._id)}
                      onChange={() => onToggle(t._id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-teal-700 font-semibold hover:text-teal-800 hover:underline">
                    {t.number}
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {fmtDate(t.date)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {t.contact}
                  </td>
                  <td className="px-4 py-2">
                    {t.status === "Paid" || t.status === "Completed" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <span className="h-1 w-1 rounded-full bg-emerald-500" />
                        {t.status}
                      </span>
                    ) : t.status === "Overdue" || t.status === "Rejected" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                        <span className="h-1 w-1 rounded-full bg-rose-500" />
                        {t.status}
                      </span>
                    ) : t.status === "Draft" ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                        <span className="h-1 w-1 rounded-full bg-slate-400" />
                        Draft
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        <span className="h-1 w-1 rounded-full bg-amber-500" />
                        {t.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-500 max-w-[180px] truncate">
                    {t.accountNames || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                    {fmtAmount(t.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Replace Account Dialog ───────────────────────────────────────────────────

function ReplaceDialog({
  open,
  selectedCount,
  accounts,
  onClose,
  onConfirm,
}: {
  open: boolean;
  selectedCount: number;
  accounts: Account[];
  onClose: () => void;
  onConfirm: (accountId: string, accountName: string) => void;
}) {
  const [newAccountId, setNewAccountId] = useState("");

  useEffect(() => {
    if (!open) setNewAccountId("");
  }, [open]);

  const selectedAccount = accounts.find((a) => a._id === newAccountId);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[440px] p-0 gap-0 overflow-hidden border shadow-lg [&>button]:hidden">
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-background">
          <DialogTitle className="text-[15px] font-semibold text-foreground">
            Replace Account
          </DialogTitle>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 bg-background">
          <DialogDescription className="text-sm text-muted-foreground">
            Select a new account to replace the existing accounts in{" "}
            <strong>{selectedCount}</strong> selected transaction
            {selectedCount !== 1 ? "s" : ""}.{" "}
            <span className="text-destructive font-medium">
              This action cannot be undone.
            </span>
          </DialogDescription>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              Only a maximum of 50 transactions can be updated at a time.
              Transactions that have been filed cannot be updated.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              New Account <span className="text-destructive">*</span>
            </label>
            <Select value={newAccountId} onValueChange={setNewAccountId}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select new account…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-500">
                    No accounts found.{" "}
                    <a href="/accountant/chart-of-accounts" className="text-teal-700 hover:text-teal-800 underline underline-offset-2 font-semibold">
                      Set up Chart of Accounts first
                    </a>
                  </div>
                ) : (
                  accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}{" "}
                      <span className="text-muted-foreground text-xs">({a.accountType})</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t" />

        <div className="flex items-center gap-2.5 bg-background px-5 py-3.5">
          <Button
            size="sm"
            className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            disabled={!newAccountId}
            onClick={() =>
              onConfirm(newAccountId, selectedAccount?.name || "")
            }
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Replace
          </Button>
          <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── View: History ────────────────────────────────────────────────────────────

function HistoryView({ jobs }: { jobs: BulkUpdateJob[] }) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
        <History className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm">No bulk updates have been performed yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {[
              "Date",
              "Module",
              "Old Account",
              "New Account",
              "Transactions Updated",
              "Status",
            ].map((h) => (
              <th
                key={h}
                className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {jobs.map((job) => (
            <tr key={job.id} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30 transition-colors">
              <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                {fmtDate(job.performedAt)}
              </td>
              <td className="px-4 py-2 text-slate-700 font-semibold">{job.moduleType}</td>
              <td className="px-4 py-2 text-slate-500">
                {job.oldAccountName}
              </td>
              <td className="px-4 py-2 text-teal-700 font-semibold">
                {job.newAccountName}
              </td>
              <td className="px-4 py-2 tabular-nums text-slate-600 text-center font-medium">
                {job.updatedCount}
              </td>
              <td className="px-4 py-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                    job.status === "Completed"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                      : "bg-rose-50 text-rose-600 border border-rose-100"
                  )}
                >
                  {job.status === "Completed" ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-emerald-500" />
                      Completed
                    </>
                  ) : (
                    <>
                      <span className="h-1 w-1 rounded-full bg-rose-500" />
                      Failed
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageView = "landing" | "filter" | "results" | "history";

export default function BulkUpdatePage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  // View state
  const [view, setView] = useState<PageView>("landing");
  const [activeTab, setActiveTab] = useState<"update" | "history">("update");

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<BulkTransaction[]>([]);
  const [history, setHistory] = useState<BulkUpdateJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter params (carried from filter to results)
  const [lastFilter, setLastFilter] = useState<{ accountId: string; accountName: string; moduleType: BulkUpdateModuleType }>({
    accountId: "",
    accountName: "",
    moduleType: "Invoices",
  });

  // Loading states
  const [searching, setSearching] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  // Auth guards
  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Load accounts + history
  const loadAccounts = useCallback(async () => {
    try {
      const res = await accountApi.list({ excludeGroups: true });
      setAccounts(res.data);
    } catch {
      // ignore
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await bulkUpdateApi.history();
      setHistory(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading) {
      loadAccounts();
      loadHistory();
    }
  }, [firebaseUser, loading, loadAccounts, loadHistory]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSearch(params: {
    moduleType: BulkUpdateModuleType;
    accountId: string;
    dateFrom: string;
    dateTo: string;
    status: string;
    search: string;
  }) {
    setSearching(true);
    setSelected(new Set());
    try {
      const res = await bulkUpdateApi.search({
        moduleType: params.moduleType,
        accountId: params.accountId || undefined,
        dateFrom: params.dateFrom || undefined,
        dateTo: params.dateTo || undefined,
        status: params.status !== "All" ? params.status : undefined,
        search: params.search || undefined,
      });
      setTransactions(res.data);
      const acct = accounts.find((a) => a._id === params.accountId);
      setLastFilter({
        accountId: params.accountId,
        accountName: acct?.name || "Any",
        moduleType: params.moduleType,
      });
      setView("results");
    } catch (e: any) {
      toast.error(e?.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (transactions.every((t) => selected.has(t._id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t._id)));
    }
  }

  async function handleReplace(newAccountId: string, newAccountName: string) {
    setExecuting(true);
    setReplaceOpen(false);
    try {
      // Determine module from current transactions (we'll track it via last filter state)
      const res = await bulkUpdateApi.execute({
        moduleType: lastFilter.moduleType,
        transactionIds: Array.from(selected),
        oldAccountId: lastFilter.accountId || undefined,
        oldAccountName: lastFilter.accountName,
        newAccountId,
        newAccountName,
      });
      toast.success(
        `${res.data.updatedCount} transaction${res.data.updatedCount !== 1 ? "s" : ""} updated successfully.`
      );
      setHistory((prev) => [res.data, ...prev]);
      // Remove updated transactions from list
      setTransactions((prev) =>
        prev.filter((t) => !selected.has(t._id))
      );
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Bulk update failed");
    } finally {
      setExecuting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh bg-white">
        {/* ── Header ── */}
        <PageHeader
          breadcrumb={
            <span className="flex flex-col text-left">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant</span>
              <span className="text-sm font-semibold text-slate-700 mt-0.5">Bulk Update</span>
            </span>
          }
          actions={
            <Link href="/batch-import?section=accountant&type=Invoices&back=/accountant/bulk-update">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md">
                <FileUp className="h-3.5 w-3.5" /> Batch Import
              </Button>
            </Link>
          }
        />

        {/* ── Tabs ── */}
        <div className="flex items-center gap-0 border-b px-5 pt-0 bg-background shrink-0">
          {(["update", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === "update" && view === "history") {
                  setView("landing");
                }
                if (tab === "history") {
                  setView("history");
                  loadHistory();
                }
              }}
              className={cn(
                "text-sm pb-2 mr-6 border-b-2 -mb-px transition-colors capitalize flex items-center gap-1.5 pt-2",
                activeTab === tab
                  ? "border-teal-600 text-teal-700 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {tab === "update" ? (
                <>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filter & Bulk Update
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5" />
                  Bulk Update History
                </>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* History tab */}
          {view === "history" && (
            <HistoryView jobs={history} />
          )}

          {/* Landing */}
          {view === "landing" && activeTab === "update" && (
            <LandingView
              onStart={() => setView("filter")}
            />
          )}

          {/* Filter */}
          {view === "filter" && activeTab === "update" && (
            <FilterView
              accounts={accounts}
              onSearch={handleSearch}
              searching={searching}
            />
          )}

          {/* Results */}
          {view === "results" && activeTab === "update" && (
            <ResultsView
              transactions={transactions}
              selected={selected}
              onToggle={toggleOne}
              onToggleAll={toggleAll}
              onUpdate={() => setReplaceOpen(true)}
              onBack={() => setView("filter")}
            />
          )}
        </div>

        {/* ── Replace dialog ── */}
        <ReplaceDialog
          open={replaceOpen}
          selectedCount={selected.size}
          accounts={accounts}
          onClose={() => setReplaceOpen(false)}
          onConfirm={handleReplace}
        />

        {/* ── Updating overlay ── */}
        {executing && (
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              <p className="text-sm font-medium">Updating transactions…</p>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
