"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
  Loader2,
  Maximize2,
  FileUp,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DraggableText } from "@/components/ui/draggable-text";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  invoiceApi,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/api/invoices";

const STATUS_FILTERS: Array<InvoiceStatus | "All"> = [
  "All",
  "Draft",
  "Sent",
  "Overdue",
  "Partially Paid",
  "Paid",
  "Void",
];

function StatusPill({ status }: { status: InvoiceStatus }) {
  const configMap: Record<
    InvoiceStatus,
    { bg: string; text: string; border: string; dot: string }
  > = {
    Draft: {
      bg: "bg-slate-100",
      text: "text-slate-500",
      border: "border-slate-200",
      dot: "bg-slate-400",
    },
    Sent: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-100",
      dot: "bg-amber-500",
    },
    Viewed: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-100",
      dot: "bg-purple-500",
    },
    Overdue: {
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-100",
      dot: "bg-rose-500",
    },
    "Partially Paid": {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-100",
      dot: "bg-amber-500",
    },
    Paid: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-100",
      dot: "bg-emerald-500",
    },
    Void: {
      bg: "bg-slate-100",
      text: "text-slate-400",
      border: "border-slate-200",
      dot: "bg-slate-400",
    },
  };
  const config = configMap[status] || configMap.Draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100 animate-pulse border-t border-slate-100">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-6 py-4 gap-4"
        >
          <div className="h-3.5 w-20 bg-slate-100 rounded" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-32 bg-slate-100 rounded" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-20 bg-slate-100 rounded-full" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-4 w-4 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

function formatDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCustomerName(c: Invoice["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || c?.companyName || "-";
}

function getPaymentTerms(pt: Invoice["paymentTermsId"]) {
  if (!pt || typeof pt === "string") return "Due on Receipt";
  return pt.name || "Due on Receipt";
}

function getDueStatus(invoice: Invoice) {
  if (invoice.status === "Paid" || invoice.status === "Void") return null;
  if (!invoice.dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return `${Math.abs(diff)} day(s) overdue`;
  if (diff === 0) return "Due Today";
  return `Due in ${diff} day(s)`;
}

function getLineDiscount(invoice: Invoice) {
  return invoice.items.reduce(
    (sum, item) => sum + Number(item.discountAmount || 0),
    0,
  );
}

function getLineTax(invoice: Invoice) {
  return invoice.items.reduce(
    (sum, item) => sum + Number(item.taxAmount || 0),
    0,
  );
}

function invoicePdfFilename(invoice: Invoice) {
  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
  return `Invoice-${safeNumber}.pdf`;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "All">(
    "All",
  );
  const [showFilterDD, setShowFilterDD] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  type SortField =
    | "invoiceDate"
    | "invoiceNumber"
    | "orderNumber"
    | "customer"
    | "status"
    | "dueDate"
    | "total"
    | "balanceDue";
  type SortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<SortField>("invoiceDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) void fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, statusFilter]);

  const filtered = useMemo(() => {
    let list = invoices;

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter(
        (inv) => new Date(inv.invoiceDate || 0).getTime() >= fromTime,
      );
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter(
        (inv) => new Date(inv.invoiceDate || 0).getTime() <= toTime,
      );
    }

    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(query) ||
        inv.orderNumber?.toLowerCase().includes(query) ||
        inv.subject?.toLowerCase().includes(query) ||
        getCustomerName(inv.customerId).toLowerCase().includes(query),
    );
  }, [invoices, search, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalAmount = filtered.reduce(
      (acc, inv) => acc + Number(inv.total || 0),
      0,
    );
    const totalBalance = filtered.reduce(
      (acc, inv) => acc + Number(inv.balanceDue || 0),
      0,
    );
    const totalPaid = Math.max(0, totalAmount - totalBalance);
    return {
      count: filtered.length,
      totalAmount,
      totalBalance,
      totalPaid,
    };
  }, [filtered]);

  const sortedInvoices = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";

      switch (sortField) {
        case "invoiceDate":
          aVal = new Date(a.invoiceDate || 0).getTime();
          bVal = new Date(b.invoiceDate || 0).getTime();
          break;
        case "invoiceNumber":
          aVal = a.invoiceNumber || "";
          bVal = b.invoiceNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "orderNumber":
          aVal = a.orderNumber || "";
          bVal = b.orderNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "customer":
          aVal = getCustomerName(a.customerId).toLowerCase();
          bVal = getCustomerName(b.customerId).toLowerCase();
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case "dueDate":
          aVal = new Date(a.dueDate || 0).getTime();
          bVal = new Date(b.dueDate || 0).getTime();
          break;
        case "total":
          aVal = Number(a.total || 0);
          bVal = Number(b.total || 0);
          break;
        case "balanceDue":
          aVal = Number(a.balanceDue || 0);
          bVal = Number(b.balanceDue || 0);
          break;
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortField, sortOrder]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && !filtered.some((inv) => inv._id === selectedId)) {
      setSelectedId(filtered[0]._id);
    }
  }, [filtered, selectedId]);

  const selectedInvoice =
    filtered.find((inv) => inv._id === selectedId) || null;

  const previewData = previewInvoice ?? selectedInvoice;

  useEffect(() => {
    if (!selectedId) {
      setPreviewInvoice(null);
      return;
    }
    let active = true;
    setPreviewInvoice(null);
    setPreviewLoading(true);
    invoiceApi
      .getById(selectedId)
      .then((res) => {
        if (active) setPreviewInvoice(res.data);
      })
      .catch(() => {
        if (active) setPreviewInvoice(null);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function fetchInvoices() {
    setFetching(true);
    try {
      const res = await invoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      const next = res.data ?? [];
      setInvoices(next);
      setSelectedId((current) =>
        current && next.some((inv) => inv._id === current) ?
          current
        : (next[0]?._id ?? null),
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to load invoices");
    } finally {
      setFetching(false);
    }
  }

  async function markAsSent(invoice: Invoice) {
    setActionId(invoice._id);
    try {
      await invoiceApi.send(invoice._id);
      toast.success("Invoice marked as sent");
      await fetchInvoices();
    } catch (e: any) {
      toast.error(e.message || "Failed to mark invoice as sent");
    } finally {
      setActionId(null);
    }
  }

  async function voidInvoice(invoice: Invoice) {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    setActionId(invoice._id);
    try {
      await invoiceApi.voidInvoice(invoice._id);
      toast.success("Invoice voided");
      await fetchInvoices();
    } catch (e: any) {
      toast.error(e.message || "Failed to void invoice");
    } finally {
      setActionId(null);
    }
  }

  async function deleteInvoice(invoice: Invoice) {
    if (!confirm("Delete this invoice?")) return;
    setActionId(invoice._id);
    try {
      await invoiceApi.remove(invoice._id);
      toast.success("Invoice deleted");
      await fetchInvoices();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete invoice");
    } finally {
      setActionId(null);
    }
  }

  async function downloadPdf(invoice: Invoice) {
    setActionId(invoice._id);
    try {
      const blob = await invoiceApi.downloadPdf(invoice._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = invoicePdfFilename(invoice);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Failed to download invoice PDF");
    } finally {
      setActionId(null);
    }
  }

  async function printInvoice(invoice: Invoice) {
    setActionId(invoice._id);
    try {
      const blob = await invoiceApi.downloadPdf(invoice._id, true);
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        window.URL.revokeObjectURL(url);
        toast.error("Please allow pop-ups to print this invoice");
        return;
      }
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 600);
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e.message || "Failed to print invoice");
    } finally {
      setActionId(null);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">
                  Sales
                </span>
                <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-teal-700"
                    >
                      {statusFilter === "All" ?
                        "All Invoices"
                      : `${statusFilter} Invoices`}{" "}
                      <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {STATUS_FILTERS.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => {
                          setStatusFilter(s);
                          setShowFilterDD(false);
                        }}
                      >
                        {s === "All" ? "All Invoices" : s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
            actions={
              <div className="flex items-center gap-1.5">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search invoices..."
                    className="pl-8 h-8 text-sm border-slate-200 focus-visible:ring-teal-600"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {/* Compact Date Range Popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
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

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={fetchInvoices}
                  disabled={fetching}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                  />
                </Button>
                <Link href="/batch-import?section=sales&type=Invoices&back=/sales/invoices">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 h-8 text-xs border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                  >
                    <FileUp className="h-3.5 w-3.5" /> Batch Import
                  </Button>
                </Link>
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md"
                  onClick={() => router.push("/sales/invoices/new")}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
            }
          />

          <div className="flex flex-1 flex-col overflow-hidden p-6 gap-3">
            {/* Sleek Ultra-Compact KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Invoices</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Amount</span>
                <span className="text-sm font-bold text-teal-700 tabular-nums">{formatCurrency(summary.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Collected</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(summary.totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">Balance Due</span>
                <span className="text-sm font-bold text-rose-600 tabular-nums">{formatCurrency(summary.totalBalance)}</span>
              </div>
            </div>

            {fetching && invoices.length === 0 ?
              <TableSkeleton />
            : filtered.length === 0 ?
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
                <FileText className="h-16 w-16 opacity-30 text-teal-600" />
                <div className="text-center max-w-md space-y-2">
                  <h2 className="text-xl font-semibold text-slate-800">
                    Get paid faster.
                  </h2>
                  <p className="text-sm text-slate-500">
                    Create professional invoices and send them to your customers
                    to get paid on time.
                  </p>
                </div>

                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                  onClick={() => router.push("/sales/invoices/new")}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  CREATE NEW INVOICE
                </Button>
              </div>
            : <div className="flex-1 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
                {/* Left panel: List */}
                <div
                  className={
                    selectedInvoice ?
                      "w-[380px] shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/30"
                    : "min-w-0 flex-1 overflow-auto"
                  }
                >
                  {selectedInvoice ?
                    <div className="divide-y divide-slate-100">
                      {sortedInvoices.map((inv) => {
                        const dueStatus = getDueStatus(inv);
                        const active = selectedId === inv._id;
                        return (
                          <button
                            key={inv._id}
                            type="button"
                            className={`block w-full px-4 py-3 text-left transition-colors relative ${
                              active ?
                                "bg-teal-50/50 border-l-[3px] border-l-teal-600"
                              : "bg-white hover:bg-slate-50/70"
                            }`}
                            onClick={() => setSelectedId(inv._id)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 overflow-hidden">
                                <div className="text-sm font-bold text-teal-700 min-w-0 overflow-hidden">
                                  <DraggableText className="text-sm font-bold">{inv.invoiceNumber}</DraggableText>
                                </div>
                                <div className="mt-0.5 text-sm font-medium text-slate-700 min-w-0 overflow-hidden">
                                  <DraggableText className="text-sm font-medium text-slate-700">{getCustomerName(inv.customerId)}</DraggableText>
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {formatDate(inv.invoiceDate)}
                                  {inv.orderNumber ? ` - ${inv.orderNumber}` : ""}
                                </div>
                                {dueStatus && (
                                  <div
                                    className={`mt-1 text-xs ${
                                      dueStatus.includes("overdue") ?
                                        "font-medium text-rose-600"
                                      : "text-slate-500 font-medium"
                                    }`}
                                  >
                                    {dueStatus}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-sm font-bold text-slate-800 tabular-nums">
                                  {formatCurrency(inv.total)}
                                </div>
                                <div className="mt-1">
                                  <StatusPill status={inv.status} />
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  : <Table>
                      <TableHeader className="bg-slate-50 border-b border-slate-200">
                        <TableRow>
                          <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("invoiceDate")} className="group flex items-center gap-1 hover:text-teal-700">
                              Date
                              <span className={cn("text-[10px]", sortField === "invoiceDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "invoiceDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-36 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("invoiceNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                              Invoice Number
                              <span className={cn("text-[10px]", sortField === "invoiceNumber" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "invoiceNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("orderNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                              Order Number
                              <span className={cn("text-[10px]", sortField === "orderNumber" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "orderNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-48 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                              Customer
                              <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                              Status
                              <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                            <button onClick={() => toggleSort("dueDate")} className="group flex items-center gap-1 hover:text-teal-700">
                              Due Date
                              <span className={cn("text-[10px]", sortField === "dueDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "dueDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right font-medium">
                            <button onClick={() => toggleSort("total")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                              Amount
                              <span className={cn("text-[10px]", sortField === "total" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right font-medium">
                            <button onClick={() => toggleSort("balanceDue")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                              Balance Due
                              <span className={cn("text-[10px]", sortField === "balanceDue" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                                {sortField === "balanceDue" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                              </span>
                            </button>
                          </TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedInvoices.map((inv) => {
                          const dueStatus = getDueStatus(inv);
                          return (
                            <TableRow
                              key={inv._id}
                              className="cursor-pointer hover:bg-teal-50/10"
                              onClick={() => setSelectedId(inv._id)}
                            >
                              <TableCell className="text-sm px-4 py-2.5">
                                {formatDate(inv.invoiceDate)}
                              </TableCell>
                              <TableCell className="text-sm font-semibold text-teal-700 hover:underline px-4 py-2.5">
                                {inv.invoiceNumber}
                              </TableCell>
                              <TableCell className="text-sm text-slate-500 px-4 py-2.5">
                                {inv.orderNumber || "—"}
                              </TableCell>
                              <TableCell className="text-sm px-4 py-2.5">
                                {getCustomerName(inv.customerId)}
                              </TableCell>
                              <TableCell className="px-4 py-2.5">
                                <StatusPill status={inv.status} />
                              </TableCell>
                              <TableCell className="text-sm px-4 py-2.5">
                                <div>{formatDate(inv.dueDate)}</div>
                                {dueStatus && (
                                  <div
                                    className={`text-[10px] ${
                                      dueStatus.includes("overdue") ?
                                        "font-semibold text-rose-600"
                                      : "text-slate-500"
                                    }`}
                                  >
                                    {dueStatus}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium tabular-nums px-4 py-2.5">
                                {formatCurrency(inv.total)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium tabular-nums px-4 py-2.5">
                                {formatCurrency(inv.balanceDue)}
                              </TableCell>
                              <TableCell className="px-4 py-2.5">
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    asChild
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-slate-400 hover:text-slate-600"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() =>
                                        router.push(
                                          `/sales/invoices/${inv._id}/edit`,
                                        )
                                      }
                                    >
                                      Edit
                                    </DropdownMenuItem>
                                    {inv.status === "Draft" && (
                                      <DropdownMenuItem
                                        onClick={() => markAsSent(inv)}
                                      >
                                        Mark as Sent
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() =>
                                        router.push(
                                          `/sales/invoices/${inv._id}/send-email`,
                                        )
                                      }
                                    >
                                      Send Email
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => downloadPdf(inv)}
                                    >
                                      Download PDF
                                    </DropdownMenuItem>
                                    {inv.status !== "Paid" &&
                                      inv.status !== "Void" && (
                                        <DropdownMenuItem
                                          onClick={() =>
                                            router.push(
                                              `/sales/payments-received/new?invoiceId=${inv._id}`,
                                            )
                                          }
                                        >
                                          Record Payment
                                        </DropdownMenuItem>
                                      )}
                                    {inv.status !== "Void" && (
                                      <DropdownMenuItem
                                        onClick={() => voidInvoice(inv)}
                                      >
                                        Void
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      className="text-rose-600 hover:bg-rose-50"
                                      onClick={() => deleteInvoice(inv)}
                                    >
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  }
                </div>

                {/* Right panel: Details preview */}
                {selectedInvoice && (
                  <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
                    <div className="flex min-h-[48px] items-center gap-1 border-b border-slate-100 px-4 py-2 shrink-0 bg-slate-50/50">
                      {["Draft", "Sent"].includes(selectedInvoice.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={() =>
                            router.push(
                              `/sales/invoices/${selectedInvoice._id}/edit`,
                            )
                          }
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() =>
                          router.push(
                            `/sales/invoices/${selectedInvoice._id}/send-email`,
                          )
                        }
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Send Email
                      </Button>

                      {selectedInvoice.status === "Draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={() => markAsSent(selectedInvoice)}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Mark as Sent
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50">
                            <Printer className="h-3.5 w-3.5 mr-1" />
                            PDF/Print
                            <ChevronDown className="h-3 w-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            onClick={() => printInvoice(selectedInvoice)}
                          >
                            <Printer className="h-4 w-4 mr-2 text-slate-500" />
                            Print
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => downloadPdf(selectedInvoice)}
                          >
                            <Download className="h-4 w-4 mr-2 text-slate-500" />
                            Download PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {selectedInvoice.status !== "Paid" &&
                        selectedInvoice.status !== "Void" && (
                          <Button
                            size="sm"
                            className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                            onClick={() =>
                              router.push(
                                `/sales/payments-received/new?invoiceId=${selectedInvoice._id}`,
                              )
                            }
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                            Record Payment
                          </Button>
                        )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() =>
                          router.push(`/sales/invoices/${selectedInvoice._id}`)
                        }
                      >
                        <Maximize2 className="h-3.5 w-3.5 mr-1" />
                        Open Full Detail
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8 border-slate-200 text-slate-600 hover:bg-slate-50">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {selectedInvoice.status !== "Void" && (
                            <DropdownMenuItem
                              onClick={() => voidInvoice(selectedInvoice)}
                            >
                              Void Invoice
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteInvoice(selectedInvoice)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Invoice
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        onClick={() => setSelectedId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-6">
                      <div className="mx-auto max-w-4xl rounded-xl border border-slate-200/60 bg-white shadow-xs">
                        {previewData && (
                          <>
                            <div className="border-b border-slate-100 p-6">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                                    Tax Invoice
                                  </div>
                                  <div className="mt-1 flex items-center gap-2">
                                    <h1 className="text-xl font-bold text-slate-900">
                                      {previewData.invoiceNumber}
                                    </h1>
                                    {previewLoading && (
                                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                    )}
                                  </div>
                                  <div className="mt-1.5 text-sm font-medium text-slate-600">
                                    {getCustomerName(previewData.customerId)}
                                    {previewData.orderNumber ?
                                      ` - Order ${previewData.orderNumber}`
                                    : ""}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div>
                                    <StatusPill status={previewData.status} />
                                  </div>
                                  <div className="mt-3 text-xl font-bold text-slate-900 tabular-nums">
                                    {formatCurrency(previewData.total)}
                                  </div>
                                  <div className="text-xs font-medium text-slate-500">
                                    Balance Due:{" "}
                                    {formatCurrency(previewData.balanceDue)}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-6 grid gap-4 text-xs md:grid-cols-4 bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                                <div>
                                  <div className="text-slate-400 font-medium">
                                    Invoice Date
                                  </div>
                                  <div className="font-semibold text-slate-700 mt-0.5">
                                    {formatDate(previewData.invoiceDate)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400 font-medium">
                                    Due Date
                                  </div>
                                  <div className="font-semibold text-slate-700 mt-0.5">
                                    {formatDate(previewData.dueDate)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400 font-medium">
                                    Terms
                                  </div>
                                  <div className="font-semibold text-slate-700 mt-0.5">
                                    {getPaymentTerms(previewData.paymentTermsId)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400 font-medium">
                                    Salesperson
                                  </div>
                                  <div className="font-semibold text-slate-700 mt-0.5">
                                    {(
                                      typeof previewData.salesPersonId ===
                                      "object"
                                    ) ?
                                      previewData.salesPersonId?.name || "—"
                                    : "—"}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="p-6">
                              <div className="rounded-lg border border-slate-200 overflow-hidden">
                                <Table>
                                  <TableHeader className="bg-slate-50">
                                    <TableRow>
                                      <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Item & Description</TableHead>
                                      <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                        Qty
                                      </TableHead>
                                      <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                        Rate
                                      </TableHead>
                                      <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                        Tax
                                      </TableHead>
                                      <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                        Amount
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {previewData.items.map((item, index) => (
                                      <TableRow key={item._id || index} className="hover:bg-slate-50/50">
                                        <TableCell>
                                          <div className="font-semibold text-slate-800 text-sm">
                                            {item.name}
                                          </div>
                                          {item.description && (
                                            <div className="text-xs text-slate-400 mt-0.5">
                                              {item.description}
                                            </div>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-slate-600 tabular-nums">
                                          {Number(item.quantity || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm text-slate-600 tabular-nums">
                                          {Number(item.rate || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-slate-500 tabular-nums">
                                          {Number(item.taxPercent || 0) > 0 ?
                                            `${Number(item.taxPercent || 0).toFixed(2)}%`
                                          : "—"}
                                        </TableCell>
                                        <TableCell className="text-right font-bold text-slate-800 text-sm tabular-nums">
                                          {Number(item.amount || 0).toFixed(2)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>

                              <div className="mt-6 flex justify-end">
                                <div className="w-80 space-y-2.5 text-xs text-slate-600">
                                  <div className="flex justify-between">
                                    <span>Sub Total</span>
                                    <span className="font-semibold tabular-nums text-slate-800">
                                      {Number(previewData.subTotal || 0).toFixed(
                                        2,
                                      )}
                                    </span>
                                  </div>
                                  {getLineDiscount(previewData) > 0 && (
                                    <div className="flex justify-between text-slate-500">
                                      <span>Line Item Discount</span>
                                      <span className="font-semibold tabular-nums text-rose-600">
                                        -{" "}
                                        {getLineDiscount(previewData).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {getLineTax(previewData) > 0 && (
                                    <div className="flex justify-between text-slate-500">
                                      <span>Line Item Tax</span>
                                      <span className="font-semibold tabular-nums text-slate-800">
                                        + {getLineTax(previewData).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {Number(previewData.discountAmount || 0) >
                                    0 && (
                                    <div className="flex justify-between text-slate-500">
                                      <span>Discount</span>
                                      <span className="font-semibold tabular-nums text-rose-600">
                                        -{" "}
                                        {Number(
                                          previewData.discountAmount || 0,
                                        ).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {Number(previewData.taxAmount || 0) > 0 && (
                                    <div className="flex justify-between text-slate-500">
                                      <span>{previewData.taxType}</span>
                                      <span className="font-semibold tabular-nums text-slate-800">
                                        {previewData.taxType === "TDS" ?
                                          "- "
                                        : "+ "}
                                        {Number(
                                          previewData.taxAmount || 0,
                                        ).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  {Number(previewData.adjustmentAmount || 0) !==
                                    0 && (
                                    <div className="flex justify-between text-slate-500">
                                      <span>
                                        {previewData.adjustmentLabel ||
                                          "Adjustment"}
                                      </span>
                                      <span className="font-semibold tabular-nums text-slate-800">
                                        {(
                                          Number(previewData.adjustmentAmount) > 0
                                        ) ?
                                          "+ "
                                        : ""}
                                        {Number(
                                          previewData.adjustmentAmount || 0,
                                        ).toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                  <div className="border-t border-slate-100 pt-2.5">
                                    <div className="flex justify-between text-sm font-bold text-slate-800">
                                      <span>Total</span>
                                      <span className="text-teal-700">
                                        {formatCurrency(previewData.total)}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex justify-between font-semibold text-slate-700">
                                      <span>Balance Due</span>
                                      <span className="text-slate-800">
                                        {formatCurrency(previewData.balanceDue)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {(previewData.customerNotes ||
                                previewData.termsAndConditions) && (
                                <div className="mt-8 grid gap-6 text-xs md:grid-cols-2 border-t border-slate-100 pt-6">
                                  {previewData.customerNotes && (
                                    <div>
                                      <div className="font-semibold text-slate-800">Notes</div>
                                      <p className="mt-1 whitespace-pre-wrap text-slate-500">
                                        {previewData.customerNotes}
                                      </p>
                                    </div>
                                  )}
                                  {previewData.termsAndConditions && (
                                    <div>
                                      <div className="font-semibold text-slate-800">
                                        Terms & Conditions
                                      </div>
                                      <p className="mt-1 whitespace-pre-wrap text-slate-500">
                                        {previewData.termsAndConditions}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            }
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
