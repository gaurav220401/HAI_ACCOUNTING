"use client";

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
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const statusColor: Record<InvoiceStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Viewed: "bg-indigo-50 text-indigo-700 border-indigo-300",
  Overdue: "bg-red-50 text-red-700 border-red-300",
  "Partially Paid": "bg-yellow-50 text-yellow-700 border-yellow-300",
  Paid: "bg-green-50 text-green-700 border-green-300",
  Void: "bg-gray-50 text-gray-400 border-gray-200",
};

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
    const query = search.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(query) ||
        inv.orderNumber?.toLowerCase().includes(query) ||
        inv.subject?.toLowerCase().includes(query) ||
        getCustomerName(inv.customerId).toLowerCase().includes(query),
    );
  }, [invoices, search]);

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
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Invoices</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchInvoices}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/invoices/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    {statusFilter === "All" ?
                      "All Invoices"
                    : `${statusFilter} Invoices`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "All" ? "All Invoices" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {filtered.length} invoice{filtered.length !== 1 && "s"}
              </span>
            </div>
          </div>

          {filtered.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20 text-muted-foreground">
              <FileText className="h-16 w-16 opacity-30" />
              <div className="max-w-md space-y-2 text-center">
                <h2 className="text-xl font-semibold text-foreground">
                  Get paid faster.
                </h2>
                <p className="text-sm">
                  Create professional invoices and send them to your customers
                  to get paid on time.
                </p>
              </div>

              <Button onClick={() => router.push("/sales/invoices/new")}>
                <Plus className="h-4 w-4 mr-1" />
                CREATE NEW INVOICE
              </Button>
            </div>
          : <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-white">
              <div
                className={
                  selectedInvoice ?
                    "w-[380px] shrink-0 overflow-y-auto border-r bg-gray-50/60"
                  : "min-w-0 flex-1 overflow-auto"
                }
              >
                {selectedInvoice ?
                  <div className="divide-y">
                    {filtered.map((inv) => {
                      const dueStatus = getDueStatus(inv);
                      const active = selectedId === inv._id;
                      return (
                        <button
                          key={inv._id}
                          type="button"
                          className={`block w-full px-4 py-3 text-left transition-colors ${
                            active ? "bg-blue-50" : "bg-white hover:bg-muted/50"
                          }`}
                          onClick={() => setSelectedId(inv._id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-blue-700">
                                {inv.invoiceNumber}
                              </div>
                              <div className="mt-0.5 truncate text-sm text-foreground">
                                {getCustomerName(inv.customerId)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatDate(inv.invoiceDate)}
                                {inv.orderNumber ? ` - ${inv.orderNumber}` : ""}
                              </div>
                              {dueStatus && (
                                <div
                                  className={`mt-1 text-xs ${
                                    dueStatus.includes("overdue") ?
                                      "font-medium text-red-600"
                                    : "text-muted-foreground"
                                  }`}
                                >
                                  {dueStatus}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-semibold tabular-nums">
                                {formatCurrency(inv.total)}
                              </div>
                              <Badge
                                variant="outline"
                                className={`mt-1 ${statusColor[inv.status]}`}
                              >
                                {inv.status}
                              </Badge>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                : <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Invoice#</TableHead>
                        <TableHead>Order#</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">
                          Balance Due
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => {
                        const dueStatus = getDueStatus(inv);
                        return (
                          <TableRow
                            key={inv._id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setSelectedId(inv._id)}
                          >
                            <TableCell className="text-sm">
                              {formatDate(inv.invoiceDate)}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-blue-600">
                              {inv.invoiceNumber}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {inv.orderNumber || "-"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {getCustomerName(inv.customerId)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={statusColor[inv.status]}
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{formatDate(inv.dueDate)}</div>
                              {dueStatus && (
                                <div
                                  className={`text-xs ${
                                    dueStatus.includes("overdue") ?
                                      "font-medium text-red-600"
                                    : "text-muted-foreground"
                                  }`}
                                >
                                  {dueStatus}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatCurrency(inv.total)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {formatCurrency(inv.balanceDue)}
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  asChild
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
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
                                    className="text-destructive"
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

              {selectedInvoice && (
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex min-h-[48px] items-center gap-1 border-b px-3">
                    {["Draft", "Sent"].includes(selectedInvoice.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
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
                      variant="ghost"
                      size="sm"
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
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsSent(selectedInvoice)}
                      >
                        <FileText className="h-3.5 w-3.5 mr-1" />
                        Mark as Sent
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Printer className="h-3.5 w-3.5 mr-1" />
                          PDF/Print
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => printInvoice(selectedInvoice)}
                        >
                          <Printer className="h-4 w-4 mr-2" />
                          Print
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => downloadPdf(selectedInvoice)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {selectedInvoice.status !== "Paid" &&
                      selectedInvoice.status !== "Void" && (
                        <Button
                          size="sm"
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
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        router.push(`/sales/invoices/${selectedInvoice._id}`)
                      }
                    >
                      <Maximize2 className="h-3.5 w-3.5 mr-1" />
                      Open Full Detail
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
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
                          className="text-destructive"
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
                      className="ml-auto h-8 w-8"
                      onClick={() => setSelectedId(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-5">
                    <div className="mx-auto max-w-4xl rounded-lg border bg-white shadow-sm">
                      {previewData && (
                        <>
                          <div className="border-b p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Tax Invoice
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <h1 className="text-2xl font-bold">
                                    {previewData.invoiceNumber}
                                  </h1>
                                  {previewLoading && (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  )}
                                </div>
                                <div className="mt-2 text-sm text-muted-foreground">
                                  {getCustomerName(previewData.customerId)}
                                  {previewData.orderNumber ?
                                    ` - Order ${previewData.orderNumber}`
                                  : ""}
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge
                                  variant="outline"
                                  className={statusColor[previewData.status]}
                                >
                                  {previewData.status}
                                </Badge>
                                <div className="mt-3 text-2xl font-bold tabular-nums">
                                  {formatCurrency(previewData.total)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Balance{" "}
                                  {formatCurrency(previewData.balanceDue)}
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 grid gap-4 text-sm md:grid-cols-4">
                              <div>
                                <div className="text-muted-foreground">
                                  Invoice Date
                                </div>
                                <div className="font-medium">
                                  {formatDate(previewData.invoiceDate)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">
                                  Due Date
                                </div>
                                <div className="font-medium">
                                  {formatDate(previewData.dueDate)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">
                                  Terms
                                </div>
                                <div className="font-medium">
                                  {getPaymentTerms(previewData.paymentTermsId)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground">
                                  Salesperson
                                </div>
                                <div className="font-medium">
                                  {(
                                    typeof previewData.salesPersonId ===
                                    "object"
                                  ) ?
                                    previewData.salesPersonId?.name || "-"
                                  : "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="p-6">
                            <div className="rounded-lg border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Item & Description</TableHead>
                                    <TableHead className="text-right">
                                      Qty
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Rate
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Tax
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Amount
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {previewData.items.map((item, index) => (
                                    <TableRow key={item._id || index}>
                                      <TableCell>
                                        <div className="font-medium">
                                          {item.name}
                                        </div>
                                        {item.description && (
                                          <div className="text-xs text-muted-foreground">
                                            {item.description}
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {Number(item.quantity || 0).toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {Number(item.rate || 0).toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right text-xs tabular-nums">
                                        {Number(item.taxPercent || 0) > 0 ?
                                          `${Number(item.taxPercent || 0).toFixed(2)}%`
                                        : "-"}
                                      </TableCell>
                                      <TableCell className="text-right font-medium tabular-nums">
                                        {Number(item.amount || 0).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>

                            <div className="mt-6 flex justify-end">
                              <div className="w-80 space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span>Sub Total</span>
                                  <span className="tabular-nums">
                                    {Number(previewData.subTotal || 0).toFixed(
                                      2,
                                    )}
                                  </span>
                                </div>
                                {getLineDiscount(previewData) > 0 && (
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Line Item Discount</span>
                                    <span className="tabular-nums">
                                      -{" "}
                                      {getLineDiscount(previewData).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {getLineTax(previewData) > 0 && (
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Line Item Tax</span>
                                    <span className="tabular-nums">
                                      + {getLineTax(previewData).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {Number(previewData.discountAmount || 0) >
                                  0 && (
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Discount</span>
                                    <span className="tabular-nums">
                                      -{" "}
                                      {Number(
                                        previewData.discountAmount || 0,
                                      ).toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                {Number(previewData.taxAmount || 0) > 0 && (
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>{previewData.taxType}</span>
                                    <span className="tabular-nums">
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
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>
                                      {previewData.adjustmentLabel ||
                                        "Adjustment"}
                                    </span>
                                    <span className="tabular-nums">
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
                                <div className="border-t pt-2">
                                  <div className="flex justify-between text-base font-bold">
                                    <span>Total</span>
                                    <span>
                                      {formatCurrency(previewData.total)}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex justify-between font-semibold">
                                    <span>Balance Due</span>
                                    <span>
                                      {formatCurrency(previewData.balanceDue)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {(previewData.customerNotes ||
                              previewData.termsAndConditions) && (
                              <div className="mt-8 grid gap-4 text-sm md:grid-cols-2">
                                {previewData.customerNotes && (
                                  <div>
                                    <div className="font-semibold">Notes</div>
                                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                      {previewData.customerNotes}
                                    </p>
                                  </div>
                                )}
                                {previewData.termsAndConditions && (
                                  <div>
                                    <div className="font-semibold">
                                      Terms & Conditions
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
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
      </SidebarInset>
    </SidebarProvider>
  );
}
