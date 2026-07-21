"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Edit,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  paymentReceivedApi,
  type PaymentInvoiceMap,
  type PaymentReceived,
  type PaymentReceivedStatus,
} from "@/lib/api/payments-received";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<PaymentReceivedStatus | "All"> = ["All", "DRAFT", "PAID", "VOID"];

type PaymentDetail = {
  payment: PaymentReceived;
  invoice_applications: PaymentInvoiceMap[];
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function customerName(customer: PaymentReceived["customer_id"]): string {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function numberToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const rupees = Math.floor(Math.max(0, num || 0));
  if (rupees === 0) return "Indian Rupee Zero Only";
  if (rupees < 20) return `Indian Rupee ${ones[rupees]} Only`;
  if (rupees < 100) {
    return `Indian Rupee ${tens[Math.floor(rupees / 10)]}${rupees % 10 ? ` ${ones[rupees % 10]}` : ""} Only`;
  }
  return `Indian Rupee ${rupees.toLocaleString("en-IN")} Only`;
}

function invoiceIdFromApplication(app: PaymentInvoiceMap): string {
  return typeof app.invoice_id === "string" ? app.invoice_id : app.invoice_id._id;
}

function invoiceNumberFromApplication(app: PaymentInvoiceMap): string {
  return typeof app.invoice_id === "string" ? app.invoice_id : app.invoice_id.invoiceNumber || app.invoice_id._id;
}

function invoiceDateFromApplication(app: PaymentInvoiceMap): string | null {
  return typeof app.invoice_id === "string" ? app.applied_date : app.invoice_id.invoiceDate || app.applied_date;
}

function invoiceTotalFromApplication(app: PaymentInvoiceMap): number {
  return typeof app.invoice_id === "string" ? app.applied_amount : Number(app.invoice_id.total || 0);
}

function invoiceBalanceFromApplication(app: PaymentInvoiceMap): number {
  return typeof app.invoice_id === "string" ? 0 : Number(app.invoice_id.balanceDue || 0);
}

function invoiceNumbersForPayment(payment: PaymentReceived): string {
  const fromList = payment.invoice_numbers || [];
  const fromApplications = (payment.invoice_applications || [])
    .map((app) => invoiceNumberFromApplication(app))
    .filter(Boolean);
  const values = Array.from(new Set([...fromList, ...fromApplications]));
  return values.length > 0 ? values.join(", ") : "-";
}

function statusClass(status: PaymentReceivedStatus) {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  if (status === "VOID") return "bg-slate-100 text-slate-500 border border-slate-200";
  return "bg-amber-50 text-amber-700 border border-amber-100";
}

export default function PaymentsReceivedPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentReceivedStatus | "All">("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<PaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundTarget, setRefundTarget] = useState<PaymentReceived | null>(null);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refunding, setRefunding] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentReceived | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentReceived | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<PaymentReceived[]>([]);
  const [deleting, setDeleting] = useState(false);

  // States for applying excess payment (customer advance) to invoices
  const [applyInvoiceOpen, setApplyInvoiceOpen] = useState(false);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState(0);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) void fetchPayments();
  }, [firebaseUser, loading, statusFilter]);

  useEffect(() => {
    if (!activeId || viewMode !== "detail") {
      setActiveDetail(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setActiveDetail(null);

    (async () => {
      try {
        const res = await paymentReceivedApi.getOne(activeId);
        if (!cancelled) setActiveDetail(res.data);
      } catch {
        if (!cancelled) toast.error("Failed to load receipt details");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, viewMode]);

  async function fetchPayments() {
    setFetching(true);
    try {
      const res = await paymentReceivedApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "payment_date",
        sortOrder: "desc",
      });
      const data = res.data || [];
      setPayments(data);
      setSelectedIds((current) => new Set([...current].filter((id) => data.some((row) => row._id === id))));
      if (activeId && !data.some((row) => row._id === activeId)) {
        setActiveId(null);
        setViewMode("list");
      }
    } catch {
      toast.error("Failed to load payments received");
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((row) => {
      return (
        row.payment_number.toLowerCase().includes(q) ||
        (row.reference_number || "").toLowerCase().includes(q) ||
        customerName(row.customer_id).toLowerCase().includes(q) ||
        row.payment_mode.toLowerCase().includes(q) ||
        invoiceNumbersForPayment(row).toLowerCase().includes(q)
      );
    });
  }, [payments, search]);

  const activeListItem = useMemo(() => payments.find((p) => p._id === activeId), [payments, activeId]);
  const selectedDetail = activeDetail?.payment._id === activeId ? activeDetail : null;
  const active = selectedDetail?.payment || activeListItem;
  const invoiceApplications = selectedDetail?.invoice_applications || active?.invoice_applications || [];
  const selectedPayments = payments.filter((payment) => selectedIds.has(payment._id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((row) => selectedIds.has(row._id));
  const orgName = activeOrganization?.name || "Your Organization";
  const orgAddressLine = [
    activeOrganization?.address?.street,
    activeOrganization?.address?.city,
    activeOrganization?.address?.state,
  ].filter(Boolean).join(", ");

  function openDetail(payment: PaymentReceived) {
    setActiveId(payment._id);
    setViewMode("detail");
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const row of filtered) {
        if (checked) next.add(row._id);
        else next.delete(row._id);
      }
      return next;
    });
  }

  function openRefund(payment: PaymentReceived) {
    const maxRefund = Math.max(0, Number(payment.total_amount_received || 0) - Number(payment.amount_refunded || 0));
    setRefundTarget(payment);
    setRefundAmount(maxRefund);
  }

  async function handleRefund() {
    if (!refundTarget) return;
    if (refundAmount <= 0) {
      toast.error("Refund amount must be greater than zero");
      return;
    }

    setRefunding(true);
    try {
      await paymentReceivedApi.refund(refundTarget._id, refundAmount);
      toast.success("Refund recorded");
      setRefundTarget(null);
      setActiveDetail(null);
      await fetchPayments();
    } catch (e: any) {
      toast.error(e?.message || "Failed to record refund");
    } finally {
      setRefunding(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget) return;
    try {
      await paymentReceivedApi.void(voidTarget._id, "Voided from Payments Received screen");
      toast.success("Receipt voided");
      setVoidTarget(null);
      setActiveDetail(null);
      await fetchPayments();
    } catch (e: any) {
      toast.error(e?.message || "Failed to void receipt");
    }
  }

  async function handleDelete(targets: PaymentReceived[]) {
    if (targets.length === 0) return;
    setDeleting(true);
    try {
      await Promise.all(targets.map((payment) => paymentReceivedApi.remove(payment._id)));
      toast.success(targets.length === 1 ? "Receipt deleted" : `${targets.length} receipts deleted`);
      setDeleteTarget(null);
      setBulkDeleteTargets([]);
      setSelectedIds(new Set());
      setActiveDetail(null);
      await fetchPayments();
      if (targets.some((payment) => payment._id === activeId)) {
        setActiveId(null);
        setViewMode("list");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete receipt");
    } finally {
      setDeleting(false);
    }
  }

  function handlePrintReceipt() {
    window.print();
  }

  async function openApplyDialog() {
    if (!active) return;
    const custId = typeof active.customer_id === "string" ? active.customer_id : active.customer_id?._id;
    if (!custId) {
      toast.error("Customer ID is missing from receipt");
      return;
    }

    setApplyInvoiceOpen(true);
    setOpenInvoices([]);
    setApplyInvoiceId("");
    setApplyAmount(0);

    try {
      const res = await invoiceApi.list({ page: 1, limit: 200, status: "All" });
      const filteredInvoices = (res.data || []).filter((inv: any) => {
        const cId = typeof inv.customerId === "string" ? inv.customerId : inv.customerId?._id;
        return cId === custId && !["Paid", "Void"].includes(inv.status);
      });
      setOpenInvoices(filteredInvoices);
      if (filteredInvoices.length > 0) {
        setApplyInvoiceId(filteredInvoices[0]._id);
        setApplyAmount(Math.min(active.amount_in_excess, filteredInvoices[0].balanceDue || 0));
      } else {
        toast.info("No open invoices found for this customer to allocate credits");
      }
    } catch (e: any) {
      toast.error("Failed to load customer open invoices");
    }
  }

  async function handleApply() {
    if (!active || !applyInvoiceId || applyAmount <= 0) return;
    if (applyAmount > active.amount_in_excess) {
      toast.error("Applied amount cannot exceed unused payment amount");
      return;
    }
    const targetInvoice = openInvoices.find((inv) => inv._id === applyInvoiceId);
    if (targetInvoice && applyAmount > (targetInvoice.balanceDue || 0)) {
      toast.error("Applied amount cannot exceed invoice balance due");
      return;
    }

    setApplying(true);
    try {
      await paymentReceivedApi.apply(active._id, {
        invoice_id: applyInvoiceId,
        applied_amount: applyAmount,
      });
      toast.success("Payment applied to invoice successfully");
      setApplyInvoiceOpen(false);
      setActiveDetail(null);
      await fetchPayments();
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply payment to invoice");
    } finally {
      setApplying(false);
    }
  }

  async function handleUnapply(app: PaymentInvoiceMap) {
    if (!active) return;
    const invId = invoiceIdFromApplication(app);
    if (!invId) {
      toast.error("Invoice ID is missing from application");
      return;
    }

    try {
      await paymentReceivedApi.unapply(active._id, {
        invoice_id: invId,
        applied_amount: app.applied_amount,
      });
      toast.success("Payment unapplied successfully");
      setActiveDetail(null);
      await fetchPayments();
    } catch (e: any) {
      toast.error(e?.message || "Failed to unapply payment");
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
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
              <span className="font-medium text-foreground">Payments Received</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Payments Received"
                  className="h-8 bg-white pl-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchPayments()} disabled={fetching}>
                <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              </Button>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/sales/payments-received/new")}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </>
          }
        />

        {viewMode === "list" ? (
          <div className="flex flex-1 flex-col bg-white">
            <div className="flex h-16 items-center justify-between border-b px-5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="px-2 text-base font-semibold">
                    {statusFilter === "All" ? "All Received Payments" : statusFilter}
                    <ChevronDown className="ml-1 h-4 w-4 text-teal-600" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((status) => (
                    <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>
                      {status === "All" ? "All Received Payments" : status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-2">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/sales/payments-received/new")}>
                  <Plus className="mr-1 h-4 w-4" />
                  New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="px-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void fetchPayments()}>Refresh List</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.print()}>Print List</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <div className="flex h-12 items-center gap-3 border-b bg-muted/30 px-5">
                <Button variant="outline" size="sm" onClick={() => toast.info("Bulk update is not available for posted receipts")}>
                  Bulk Update
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedPayments.length === 1) setDeleteTarget(selectedPayments[0]);
                    else setBulkDeleteTargets(selectedPayments);
                  }}
                  disabled={deleting}
                >
                  Delete
                </Button>
                <span className="mx-1 h-5 border-l" />
                <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-700">{selectedIds.size}</span>
                <span className="text-sm">Selected</span>
              </div>
            ) : null}

            <div className="overflow-auto">
              <table className="min-w-[1120px] w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="w-12 px-4 py-3 text-left">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(value) => toggleAllVisible(value === true)}
                        aria-label="Select all payments"
                      />
                    </th>
                    <th className="px-3 py-3 text-left font-medium">Date</th>
                    <th className="px-3 py-3 text-left font-medium">Payment Voucher Number</th>
                    <th className="px-3 py-3 text-left font-medium">Reference Number</th>
                    <th className="px-3 py-3 text-left font-medium">Customer Name</th>
                    <th className="px-3 py-3 text-left font-medium">Invoice Number</th>
                    <th className="px-3 py-3 text-left font-medium">Mode</th>
                    <th className="px-3 py-3 text-right font-medium">Amount</th>
                    <th className="px-3 py-3 text-right font-medium">Unused Amount</th>
                    <th className="w-12 px-3 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-16 text-center text-muted-foreground">
                        No payment receipts found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((payment) => (
                      <tr
                        key={payment._id}
                        className="border-b hover:bg-teal-50/20"
                        onDoubleClick={() => openDetail(payment)}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedIds.has(payment._id)}
                            onCheckedChange={(value) => toggleSelected(payment._id, value === true)}
                            aria-label={`Select payment ${payment.payment_number}`}
                          />
                        </td>
                        <td className="px-3 py-3">{fmtDate(payment.payment_date)}</td>
                        <td className="px-3 py-3">
                          <button className="font-medium text-teal-700 hover:text-teal-800 hover:underline" onClick={() => openDetail(payment)}>
                            {payment.payment_number}
                          </button>
                        </td>
                        <td className="px-3 py-3">{payment.reference_number || "-"}</td>
                        <td className="px-3 py-3">{customerName(payment.customer_id)}</td>
                        <td className="px-3 py-3 text-teal-700 font-medium">{invoiceNumbersForPayment(payment)}</td>
                        <td className="px-3 py-3">{payment.payment_mode}</td>
                        <td className="px-3 py-3 text-right font-medium">{fmtCurrency(payment.total_amount_received)}</td>
                        <td className="px-3 py-3 text-right">{fmtCurrency(payment.amount_in_excess)}</td>
                        <td className="px-3 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetail(payment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {payment.status !== "VOID" ? (
                                <DropdownMenuItem onClick={() => router.push(`/sales/payments-received/${payment._id}/edit`)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              ) : null}
                              {payment.status === "PAID" && Number(payment.total_amount_received || 0) > Number(payment.amount_refunded || 0) ? (
                                <DropdownMenuItem onClick={() => openRefund(payment)}>
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Refund
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuSeparator />
                              {payment.status !== "VOID" ? (
                                <DropdownMenuItem onClick={() => setVoidTarget(payment)}>
                                  Void
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(payment)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto bg-gray-50/50">
            {active ? (
              <div>
                <div className="flex h-14 items-center justify-between border-b bg-white px-5">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setViewMode("list")}>
                      Back
                    </Button>
                    <h1 className="text-xl font-semibold">{active.payment_number}</h1>
                    <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", statusClass(active.status))}>
                      {active.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {active.status !== "VOID" ? (
                      <Button size="sm" variant="outline" onClick={() => router.push(`/sales/payments-received/${active._id}/edit`)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    ) : null}
                    {active.status === "PAID" && active.amount_in_excess > 0 ? (
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-xs" onClick={openApplyDialog}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Apply to Invoice
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Mail className="mr-2 h-4 w-4" />
                          Send
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast.info("Receipt email sending is not configured yet")}>
                          Send Receipt Email
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" variant="outline" onClick={handlePrintReceipt}>
                      <Printer className="mr-2 h-4 w-4" />
                      PDF/Print
                    </Button>
                    {active.status === "PAID" && Number(active.total_amount_received || 0) > Number(active.amount_refunded || 0) ? (
                      <Button size="sm" variant="outline" onClick={() => openRefund(active)}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Refund
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="px-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {invoiceApplications[0] ? (
                          <DropdownMenuItem onClick={() => router.push(`/sales/invoices/${invoiceIdFromApplication(invoiceApplications[0])}`)}>
                            View Invoice
                          </DropdownMenuItem>
                        ) : null}
                        {active.status !== "VOID" ? (
                          <DropdownMenuItem onClick={() => setVoidTarget(active)}>Void</DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(active)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mx-auto max-w-5xl p-8">
                  <div className="relative overflow-hidden rounded border bg-white shadow-sm statement-print-area">
                    {active.status === "PAID" ? (
                      <div className="absolute left-0 top-0">
                        <div className="-translate-x-10 translate-y-4 -rotate-45 bg-[#22c55e] py-1.5 text-center text-xs font-bold text-white w-32">
                          Paid
                        </div>
                      </div>
                    ) : null}

                    <div className="p-10 pt-16">
                      <div className="mb-10 text-gray-800">
                        <h2 className="mb-1 text-base font-bold">{orgName}</h2>
                        <div className="text-sm leading-6">
                          {orgAddressLine || activeOrganization?.country || "India"}
                          <br />
                          {activeOrganization?.taxId ? `GSTIN ${activeOrganization.taxId}` : ""}
                          {activeOrganization?.taxId ? <br /> : null}
                          {activeOrganization?.email || ""}
                        </div>
                      </div>

                      <h2 className="mb-12 text-center font-serif text-lg tracking-widest">PAYMENT RECEIPT</h2>

                      <div className="mb-12 flex flex-col gap-8 text-sm text-gray-800 md:flex-row">
                        <div className="flex-1 space-y-4">
                          <div className="grid grid-cols-[180px_1fr] border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Payment Date</span>
                            <span className="font-medium">{fmtDate(active.payment_date)}</span>
                          </div>
                          <div className="grid grid-cols-[180px_1fr] border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Reference Number</span>
                            <span className="font-medium">{active.reference_number || "-"}</span>
                          </div>
                          <div className="grid grid-cols-[180px_1fr] border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Payment Mode</span>
                            <span className="font-medium">{active.payment_mode || "-"}</span>
                          </div>
                          <div className="grid grid-cols-[180px_1fr] pt-2">
                            <span className="text-gray-500">Amount Received In Words</span>
                            <span className="font-medium italic">{numberToWords(active.total_amount_received)}</span>
                          </div>
                        </div>

                        <div className="w-full md:w-64">
                          <div className="rounded bg-[#6B9F5D] p-6 text-center text-white">
                            <div className="mb-2 text-sm opacity-90">Amount Received</div>
                            <div className="text-2xl font-semibold">{fmtCurrency(active.total_amount_received)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mb-10">
                        <div className="mb-2 text-xs text-gray-500">Received From</div>
                        <div className="font-bold text-teal-700">{customerName(active.customer_id)}</div>
                      </div>

                      <div className="mb-10 grid gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Used for Invoices</div>
                          <div className="mt-1 font-semibold">{fmtCurrency(active.amount_used_for_invoices)}</div>
                        </div>
                        <div className="rounded border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Amount in Excess</div>
                          <div className="mt-1 font-semibold">{fmtCurrency(active.amount_in_excess)}</div>
                        </div>
                        <div className="rounded border bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">Refunded</div>
                          <div className="mt-1 font-semibold">{fmtCurrency(active.amount_refunded)}</div>
                        </div>
                      </div>

                      {detailLoading ? (
                        <div className="mb-16 flex items-center justify-center rounded border border-dashed py-8 text-sm text-gray-500">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading invoice applications...
                        </div>
                      ) : invoiceApplications.length > 0 ? (
                        <div className="mb-16">
                          <div className="mb-4 text-sm font-semibold text-gray-800">Payment for</div>
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-left text-sm">
                              <thead>
                                <tr className="border-y text-gray-500">
                                  <th className="w-[34%] px-4 py-2 font-normal">Invoice Number</th>
                                  <th className="px-4 py-2 text-center font-normal">Invoice Date</th>
                                  <th className="px-4 py-2 text-right font-normal">Invoice Amount</th>
                                  <th className="px-4 py-2 text-right font-normal">Balance Due</th>
                                  <th className="px-4 py-2 text-right font-normal">Payment Amount</th>
                                  <th className="px-4 py-2 text-right font-normal no-print">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {invoiceApplications.map((app) => (
                                  <tr key={app._id} className="border-b">
                                    <td
                                      className="cursor-pointer px-4 py-3 font-medium text-teal-700 hover:text-teal-800 hover:underline"
                                      onClick={() => router.push(`/sales/invoices/${invoiceIdFromApplication(app)}`)}
                                    >
                                      {invoiceNumberFromApplication(app)}
                                    </td>
                                    <td className="px-4 py-3 text-center">{fmtDate(invoiceDateFromApplication(app))}</td>
                                    <td className="px-4 py-3 text-right">{fmtCurrency(invoiceTotalFromApplication(app))}</td>
                                    <td className="px-4 py-3 text-right">{fmtCurrency(invoiceBalanceFromApplication(app))}</td>
                                    <td className="px-4 py-3 text-right font-medium text-gray-800">{fmtCurrency(app.applied_amount)}</td>
                                    <td className="px-4 py-3 text-right no-print">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold"
                                        onClick={() => void handleUnapply(app)}
                                      >
                                        Unapply
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-16 rounded border border-dashed bg-gray-50 px-4 py-6 text-sm text-gray-500">
                          No invoice allocation is linked to this receipt. The amount is available as customer advance.
                        </div>
                      )}

                      <div className="pb-4 pr-4 pt-12 text-right">
                        <div className="ml-auto mb-2 w-48 border-t border-gray-400" />
                        <span className="text-xs text-gray-500">Authorized Signature</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="mb-3 h-5 w-5 animate-spin" />
                Loading receipt...
              </div>
            )}
          </main>
        )}

        <Dialog open={Boolean(refundTarget)} onOpenChange={(open) => !open && setRefundTarget(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Refund</DialogTitle>
            </DialogHeader>
            {refundTarget ? (
              <div className="space-y-6">
                <div className="rounded-md bg-muted/40 p-4">
                  <div className="text-sm text-muted-foreground">Customer Name</div>
                  <div className="font-semibold">{customerName(refundTarget.customer_id)}</div>
                </div>
                <div className="space-y-2">
                  <Label>Total Refund Amount</Label>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm">INR</span>
                    <Input
                      type="number"
                      min={0}
                      max={Math.max(0, Number(refundTarget.total_amount_received || 0) - Number(refundTarget.amount_refunded || 0))}
                      step="0.01"
                      className="rounded-l-none"
                      value={refundAmount || ""}
                      onChange={(e) => setRefundAmount(Number(e.target.value || 0))}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Refunding an applied receipt will reopen the linked invoice for the refunded amount.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void handleRefund()} disabled={refunding}>
                    {refunding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={applyInvoiceOpen} onOpenChange={setApplyInvoiceOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Apply Credit to Invoice</DialogTitle>
            </DialogHeader>
            {active ? (
              <div className="space-y-6">
                <div className="rounded-md bg-muted/40 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Customer Name:</span>
                    <span className="font-semibold">{customerName(active.customer_id)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unused Credits (Excess Amount):</span>
                    <span className="font-semibold text-teal-700">{fmtCurrency(active.amount_in_excess)}</span>
                  </div>
                </div>

                {openInvoices.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No open or unpaid invoices found for this customer.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Select Invoice*</Label>
                      <Select
                        value={applyInvoiceId}
                        onValueChange={(val) => {
                          setApplyInvoiceId(val);
                          const target = openInvoices.find((inv) => inv._id === val);
                          if (target) {
                            setApplyAmount(Math.min(active.amount_in_excess, target.balanceDue || 0));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Invoice" />
                        </SelectTrigger>
                        <SelectContent>
                          {openInvoices.map((inv) => (
                            <SelectItem key={inv._id} value={inv._id}>
                              {inv.invoiceNumber} (Date: {fmtDate(inv.invoiceDate)} | Balance Due: {fmtCurrency(inv.balanceDue)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Amount to Apply*</Label>
                      <div className="flex">
                        <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm">INR</span>
                        <Input
                          type="number"
                          min={0}
                          max={Math.min(active.amount_in_excess, openInvoices.find((inv) => inv._id === applyInvoiceId)?.balanceDue || 0)}
                          step="0.01"
                          className="rounded-l-none"
                          value={applyAmount || ""}
                          onChange={(e) => setApplyAmount(Number(e.target.value || 0))}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This amount will be deducted from the customer's advance and credited to the invoice balance due.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {openInvoices.length > 0 && (
                    <Button
                      className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                      onClick={() => void handleApply()}
                      disabled={applying || applyAmount <= 0}
                    >
                      {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Apply Credit
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setApplyInvoiceOpen(false)}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void Receipt</AlertDialogTitle>
              <AlertDialogDescription>
                This will reverse ledger effect and invoice allocations for receipt {voidTarget?.payment_number}. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void handleVoid()}>Void</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(deleteTarget) || bulkDeleteTargets.length > 0}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
              setBulkDeleteTargets([]);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Receipt{bulkDeleteTargets.length > 1 ? "s" : ""}</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete {bulkDeleteTargets.length > 1 ? `${bulkDeleteTargets.length} receipts` : `receipt ${deleteTarget?.payment_number}`}, reverse allocations, and update linked invoices.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                onClick={() => void handleDelete(bulkDeleteTargets.length > 0 ? bulkDeleteTargets : deleteTarget ? [deleteTarget] : [])}
                disabled={deleting}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
