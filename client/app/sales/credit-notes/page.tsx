"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  creditNoteApi,
  type CreditNote,
  type CreditNoteApplication,
  type CreditNoteStatus,
} from "@/lib/api/credit-notes";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";

const STATUS_FILTERS: Array<CreditNoteStatus | "All"> = [
  "All",
  "DRAFT",
  "OPEN",
  "PARTIALLY_APPLIED",
  "CLOSED",
  "VOID",
];

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
  OPEN: "bg-teal-50 text-teal-700 border-teal-300",
  APPLIED: "bg-indigo-50 text-indigo-700 border-indigo-300",
  PARTIALLY_APPLIED: "bg-yellow-50 text-yellow-700 border-yellow-300",
  CLOSED: "bg-green-50 text-green-700 border-green-300",
  VOID: "bg-gray-50 text-gray-400 border-gray-200",
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(n || 0);
}

function refId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value);
}

function displayName(value: unknown): string {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const data = value as {
      displayName?: string;
      companyName?: string;
      name?: string;
      invoiceNumber?: string;
    };
    return (
      data.displayName ||
      data.companyName ||
      data.name ||
      data.invoiceNumber ||
      "-"
    );
  }
  return String(value);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default function CreditNotesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CreditNoteStatus | "All">(
    "All",
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<CreditNote | null>(null);
  const [applications, setApplications] = useState<CreditNoteApplication[]>([]);
  const [candidateInvoices, setCandidateInvoices] = useState<Invoice[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState(0);
  const [applyNotes, setApplyNotes] = useState("");

  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);

  const [showUnapplyDialog, setShowUnapplyDialog] = useState(false);
  const [unapplyInvoiceId, setUnapplyInvoiceId] = useState("");
  const [unapplyAmount, setUnapplyAmount] = useState(0);
  const [unapplyCap, setUnapplyCap] = useState(0);

  const [commentText, setCommentText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  async function loadCredits() {
    setFetching(true);
    try {
      const res = await creditNoteApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "creditNoteDate",
        sortOrder: "desc",
      });
      setCredits(res.data || []);
    } catch {
      toast.error("Failed to load credit notes");
    } finally {
      setFetching(false);
    }
  }

  async function loadCreditDetail(id: string) {
    setLoadingDetail(true);
    try {
      const res = await creditNoteApi.getOne(id);
      setSelectedCredit(res.data.credit);
      setApplications(res.data.applications || []);

      const customerId = refId(res.data.credit.customerId);
      if (!customerId) {
        setCandidateInvoices([]);
        return;
      }

      const invoiceRes = await invoiceApi.list({
        customerId,
        status: "All",
        page: 1,
        limit: 200,
      });

      const eligible = (invoiceRes.data || []).filter(
        (invoice) =>
          invoice.status !== "Draft" &&
          invoice.status !== "Void" &&
          Number(invoice.balanceDue || 0) > 0,
      );

      setCandidateInvoices(eligible);
    } catch {
      toast.error("Failed to load credit note details");
      setSelectedId(null);
      setSelectedCredit(null);
      setApplications([]);
      setCandidateInvoices([]);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    if (firebaseUser && !loading) {
      void loadCredits();
    }
  }, [firebaseUser, loading, statusFilter]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCredit(null);
      setApplications([]);
      setCandidateInvoices([]);
      return;
    }
    void loadCreditDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;

    async function loadPdfPreview() {
      if (!selectedId) {
        setPdfUrl("");
        return;
      }
      setPdfLoading(true);
      try {
        const blob = await creditNoteApi.downloadPdf(selectedId, true);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch {
        if (active) setPdfUrl("");
      } finally {
        if (active) setPdfLoading(false);
      }
    }

    void loadPdfPreview();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedId, selectedCredit?.updatedAt]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredCredits = useMemo(() => {
    let list = credits;

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter(
        (credit) => new Date(credit.creditNoteDate || 0).getTime() >= fromTime,
      );
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter(
        (credit) => new Date(credit.creditNoteDate || 0).getTime() <= toTime,
      );
    }

    const q = search.trim().toLowerCase();
    if (!q) return list;

    return list.filter((credit) => {
      const number = (credit.creditNoteNumber || "").toLowerCase();
      const reference = (credit.referenceNumber || "").toLowerCase();
      const subject = (credit.subject || "").toLowerCase();
      const customer = displayName(credit.customerId).toLowerCase();
      return (
        number.includes(q) ||
        reference.includes(q) ||
        subject.includes(q) ||
        customer.includes(q)
      );
    });
  }, [credits, search, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalAmount = filteredCredits.reduce(
      (acc, c) => acc + Number(c.total || 0),
      0,
    );
    const totalApplied = filteredCredits.reduce(
      (acc, c) => acc + Number(c.appliedAmount || 0),
      0,
    );
    const totalBalance = filteredCredits.reduce(
      (acc, c) => acc + Number(c.balanceAmount || 0),
      0,
    );
    return {
      count: filteredCredits.length,
      totalAmount,
      totalApplied,
      totalBalance,
    };
  }, [filteredCredits]);

  async function downloadPdf(id: string, creditNumber?: string) {
    try {
      const blob = await creditNoteApi.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Credit-Note-${creditNumber || id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  async function executeAction(work: () => Promise<void>) {
    setActionBusy(true);
    try {
      await work();
      await loadCredits();
      if (selectedId) {
        await loadCreditDetail(selectedId);
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function handleClone(credit: CreditNote) {
    await executeAction(async () => {
      await creditNoteApi.clone(credit._id);
      toast.success("Credit note cloned");
    });
  }

  async function handleVoid(credit: CreditNote) {
    if (!window.confirm("Void this credit note?")) return;
    const reason = window.prompt("Reason for void (optional):") || "";

    await executeAction(async () => {
      await creditNoteApi.void(credit._id, reason || undefined);
      toast.success("Credit note voided");
    });
  }

  async function handleDelete(credit: CreditNote) {
    if (!window.confirm("Delete this credit note? This cannot be undone.")) return;
    await executeAction(async () => {
      await creditNoteApi.remove(credit._id);
      toast.success("Credit note deleted");
      if (selectedId === credit._id) {
        setSelectedId(null);
      }
    });
  }

  async function submitApply() {
    if (!selectedCredit) return;
    if (!applyInvoiceId) {
      toast.error("Please select an invoice");
      return;
    }
    if (applyAmount <= 0) {
      toast.error("Apply amount must be greater than zero");
      return;
    }

    await executeAction(async () => {
      await creditNoteApi.applyToInvoice(
        selectedCredit._id,
        applyInvoiceId,
        applyAmount,
        applyNotes || undefined,
      );
      toast.success("Credit applied successfully");
      setShowApplyDialog(false);
      setApplyInvoiceId("");
      setApplyAmount(0);
      setApplyNotes("");
    });
  }

  function openUnapplyDialog(application: CreditNoteApplication) {
    const invoiceId = refId(application.invoiceId);
    const max = Number(application.amount || 0);
    setUnapplyInvoiceId(invoiceId);
    setUnapplyCap(max);
    setUnapplyAmount(max);
    setShowUnapplyDialog(true);
  }

  async function submitUnapply() {
    if (!selectedCredit) return;
    if (!unapplyInvoiceId) {
      toast.error("No invoice selected for unapply");
      return;
    }
    if (unapplyAmount <= 0) {
      toast.error("Unapply amount must be greater than zero");
      return;
    }

    await executeAction(async () => {
      await creditNoteApi.unapplyFromInvoice(
        selectedCredit._id,
        unapplyInvoiceId,
        unapplyAmount,
      );
      toast.success("Credit unapplied successfully");
      setShowUnapplyDialog(false);
      setUnapplyInvoiceId("");
      setUnapplyCap(0);
      setUnapplyAmount(0);
    });
  }

  async function submitRefund() {
    if (!selectedCredit) return;
    if (refundAmount <= 0) {
      toast.error("Refund amount must be greater than zero");
      return;
    }

    await executeAction(async () => {
      await creditNoteApi.refund(selectedCredit._id, refundAmount);
      toast.success("Refund recorded");
      setShowRefundDialog(false);
      setRefundAmount(0);
    });
  }

  async function submitComment() {
    if (!selectedCredit) return;
    if (!commentText.trim()) {
      toast.error("Comment cannot be empty");
      return;
    }

    await executeAction(async () => {
      await creditNoteApi.addComment(selectedCredit._id, commentText.trim());
      setCommentText("");
      toast.success("Comment added");
    });
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  type CreditSortField = "date" | "number" | "reference" | "customer" | "status" | "total" | "applied" | "balance";
  type CreditSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<CreditSortField>("date");
  const [sortOrder, setSortOrder] = useState<CreditSortOrder>("desc");

  function toggleSort(field: CreditSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedCredits = useMemo(() => {
    const list = [...filteredCredits];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "date":
          aVal = new Date(a.creditNoteDate || 0).getTime();
          bVal = new Date(b.creditNoteDate || 0).getTime();
          break;
        case "number":
          aVal = a.creditNoteNumber || "";
          bVal = b.creditNoteNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "reference":
          aVal = (a.referenceNumber || "").toLowerCase();
          bVal = (b.referenceNumber || "").toLowerCase();
          break;
        case "customer":
          aVal = displayName(a.customerId).toLowerCase();
          bVal = displayName(b.customerId).toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "total":
          aVal = Number(a.total || 0);
          bVal = Number(b.total || 0);
          break;
        case "applied":
          aVal = Number(a.appliedAmount || 0);
          bVal = Number(b.appliedAmount || 0);
          break;
        case "balance":
          aVal = Number(a.balanceAmount || 0);
          bVal = Number(b.balanceAmount || 0);
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredCredits, sortField, sortOrder]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Credit Notes</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search credit notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Compact Date Range Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
                      (fromDate || toDate) && "border-teal-500 bg-teal-50/60 text-teal-700 font-semibold"
                    )}
                  >
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    {fromDate || toDate ? (
                      <span>
                        {fromDate || "Start"} - {toDate || "End"}
                      </span>
                    ) : (
                      <span>Date Range</span>
                    )}
                    <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-4 space-y-3 bg-white border border-slate-200 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">Filter by Date Range</span>
                    {(fromDate || toDate) && (
                      <button
                        onClick={() => {
                          setFromDate("");
                          setToDate("");
                        }}
                        className="text-xs text-rose-600 hover:underline font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">From Date</label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="h-8 text-xs bg-slate-50 border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">To Date</label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="h-8 text-xs bg-slate-50 border-slate-200"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as CreditNoteStatus | "All")
                }
              >
                <SelectTrigger className="w-36 h-9 text-xs bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "All" ? "All Statuses" : statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadCredits()}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/credit-notes/new")}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                <Plus className="mr-1 h-4 w-4" />
                New Credit Note
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {/* Sleek Ultra-Compact KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Notes</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Credit Value</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{fmtCurrency(summary.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Applied</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmtCurrency(summary.totalApplied)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide">Remaining</span>
              <span className="text-sm font-bold text-amber-600 tabular-nums">{fmtCurrency(summary.totalBalance)}</span>
            </div>
          </div>

          {filteredCredits.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-20 gap-3 text-muted-foreground">
              <FileText className="h-12 w-12 opacity-20" />
              <p className="text-sm font-medium">No credit notes found</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                        Date
                        <span className={cn("text-[10px]", sortField === "date" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("number")} className="group flex items-center gap-1 hover:text-teal-700">
                        Credit Note Number
                        <span className={cn("text-[10px]", sortField === "number" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "number" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("reference")} className="group flex items-center gap-1 hover:text-teal-700">
                        Reference Number
                        <span className={cn("text-[10px]", sortField === "reference" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "reference" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                        Customer
                        <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                        Status
                        <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("total")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Total
                        <span className={cn("text-[10px]", sortField === "total" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("applied")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Applied
                        <span className={cn("text-[10px]", sortField === "applied" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "applied" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("balance")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Balance
                        <span className={cn("text-[10px]", sortField === "balance" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "balance" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCredits.map((credit) => (
                    <TableRow
                      key={credit._id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setSelectedId(credit._id)}
                    >
                      <TableCell>{fmtDate(credit.creditNoteDate)}</TableCell>
                      <TableCell className="text-teal-600 hover:text-teal-700 font-medium">
                        {credit.creditNoteNumber}
                      </TableCell>
                      <TableCell>{credit.referenceNumber || "-"}</TableCell>
                      <TableCell>{displayName(credit.customerId)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColor[credit.status] || ""}
                        >
                          {statusLabel(credit.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(credit.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(credit.appliedAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(credit.balanceAmount)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedId(credit._id)}>
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/sales/credit-notes/${credit._id}/edit`)
                              }
                              disabled={credit.status === "VOID"}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => downloadPdf(credit._id, credit.creditNoteNumber)}
                            >
                              Download PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handleClone(credit)}>
                              Clone
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleVoid(credit)}
                              disabled={credit.status === "VOID" || Number(credit.appliedAmount) > 0}
                            >
                              Void
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleDelete(credit)}
                              disabled={! ["DRAFT", "OPEN"].includes(credit.status)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Sheet
            open={Boolean(selectedId)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedId(null);
                setShowApplyDialog(false);
                setShowRefundDialog(false);
                setShowUnapplyDialog(false);
              }
            }}
          >
            <SheetContent side="right" className="w-[96vw] sm:max-w-[96vw] p-0">
              {loadingDetail || !selectedCredit ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="h-full grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px]">
                  <div className="overflow-y-auto p-6 space-y-5">
                    <SheetHeader className="p-0 text-left">
                      <SheetTitle className="flex items-center gap-2">
                        {selectedCredit.creditNoteNumber}
                        <Badge
                          variant="outline"
                          className={statusColor[selectedCredit.status] || ""}
                        >
                          {statusLabel(selectedCredit.status)}
                        </Badge>
                      </SheetTitle>
                    </SheetHeader>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(`/sales/credit-notes/${selectedCredit._id}/edit`)
                        }
                        disabled={selectedCredit.status === "VOID"}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadPdf(selectedCredit._id, selectedCredit.creditNoteNumber)
                        }
                      >
                        Download PDF
                      </Button>
                      <Button
                        size="sm"
                        className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                        onClick={() => setShowApplyDialog(true)}
                        disabled={
                          ["VOID", "CLOSED"].includes(selectedCredit.status) ||
                          Number(selectedCredit.balanceAmount || 0) <= 0
                        }
                      >
                        Apply Credit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRefundAmount(Number(selectedCredit.balanceAmount || 0));
                          setShowRefundDialog(true);
                        }}
                        disabled={
                          selectedCredit.status === "VOID" ||
                          Number(selectedCredit.balanceAmount || 0) <= 0
                        }
                      >
                        Record Refund
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="font-semibold text-lg">{fmtCurrency(selectedCredit.total)}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Applied</p>
                        <p className="font-semibold text-lg">
                          {fmtCurrency(selectedCredit.appliedAmount)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Refunded</p>
                        <p className="font-semibold text-lg">
                          {fmtCurrency(selectedCredit.refundedAmount)}
                        </p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className="font-semibold text-lg">
                          {fmtCurrency(selectedCredit.balanceAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md border p-4 space-y-2 text-sm">
                      <div className="grid md:grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">Customer: </span>
                          <span className="font-medium">{displayName(selectedCredit.customerId)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date: </span>
                          <span>{fmtDate(selectedCredit.creditNoteDate)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reference Number: </span>
                          <span>{selectedCredit.referenceNumber || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reference Invoice: </span>
                          <span>{displayName(selectedCredit.referenceInvoiceId)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Reason: </span>
                          <span>{selectedCredit.reason || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sales Person: </span>
                          <span>{displayName(selectedCredit.salesPersonId)}</span>
                        </div>
                      </div>
                      {selectedCredit.subject && (
                        <div>
                          <span className="text-muted-foreground">Subject: </span>
                          <span>{selectedCredit.subject}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border overflow-hidden">
                      <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Applied Invoices</h3>
                        <span className="text-xs text-muted-foreground">
                          {applications.length} application{applications.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {applications.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">
                          No invoice applications yet.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {applications.map((application) => (
                            <div
                              key={application._id}
                              className="p-3 text-sm flex flex-wrap items-center justify-between gap-2"
                            >
                              <div>
                                <p className="font-medium">{displayName(application.invoiceId)}</p>
                                <p className="text-xs text-muted-foreground">
                                  Applied on {fmtDate(application.appliedDate)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold">
                                  {fmtCurrency(application.amount)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openUnapplyDialog(application)}
                                  disabled={selectedCredit.status === "VOID"}
                                >
                                  Unapply
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-4 space-y-3">
                      <h3 className="text-sm font-semibold">Comments</h3>

                      <div className="max-h-48 overflow-auto space-y-2 pr-1">
                        {(selectedCredit.comments || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground">No comments yet.</p>
                        ) : (
                          (selectedCredit.comments || []).map((comment, index) => (
                            <div key={`${comment.time}-${index}`} className="rounded-md border p-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{comment.author || "User"}</span>
                                <span>{fmtDate(comment.time)}</span>
                              </div>
                              <p className="text-sm mt-1 whitespace-pre-wrap">{comment.text}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add a comment..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                        />
                        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void submitComment()} disabled={actionBusy}>
                          Add Comment
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-l bg-muted/20 p-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">PDF Preview</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadPdf(selectedCredit._id, selectedCredit.creditNoteNumber)
                        }
                      >
                        Download
                      </Button>
                    </div>
                    <div className="h-[calc(100vh-8rem)] rounded-md border bg-white overflow-hidden">
                      {pdfLoading ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading preview...
                        </div>
                      ) : pdfUrl ? (
                        <iframe title="Credit Note PDF Preview" src={pdfUrl} className="w-full h-full" />
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                          Preview unavailable.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply Credit Note</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <Label>Invoice</Label>
                  <Select
                    value={applyInvoiceId || "none"}
                    onValueChange={(v) => {
                      const nextInvoiceId = v === "none" ? "" : v;
                      setApplyInvoiceId(nextInvoiceId);

                      if (!selectedCredit || !nextInvoiceId) {
                        setApplyAmount(0);
                        return;
                      }

                      const invoice = candidateInvoices.find(
                        (entry) => entry._id === nextInvoiceId,
                      );
                      const available = Math.min(
                        Number(invoice?.balanceDue || 0),
                        Number(selectedCredit.balanceAmount || 0),
                      );
                      setApplyAmount(Number(available.toFixed(2)));
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select invoice</SelectItem>
                      {candidateInvoices.map((invoice) => (
                        <SelectItem key={invoice._id} value={invoice._id}>
                          {invoice.invoiceNumber} (Balance {fmtCurrency(invoice.balanceDue)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Amount</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={applyAmount}
                    onChange={(e) => setApplyAmount(Number(e.target.value || 0))}
                  />
                </div>

                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    className="mt-1"
                    value={applyNotes}
                    onChange={(e) => setApplyNotes(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
                  Cancel
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void submitApply()} disabled={actionBusy}>
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showUnapplyDialog} onOpenChange={setShowUnapplyDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Unapply Credit</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Maximum available to unapply: {fmtCurrency(unapplyCap)}
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={unapplyAmount}
                    onChange={(e) => setUnapplyAmount(Number(e.target.value || 0))}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUnapplyDialog(false)}>
                  Cancel
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void submitUnapply()} disabled={actionBusy}>
                  Unapply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Refund</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <Label>Refund Amount</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Number(e.target.value || 0))}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRefundDialog(false)}>
                  Cancel
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void submitRefund()} disabled={actionBusy}>
                  Record Refund
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
