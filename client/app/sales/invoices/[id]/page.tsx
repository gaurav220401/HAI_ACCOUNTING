"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  Pencil,
  Trash2,
  Loader2,
  Printer,
  Share2,
  Bell,
  ChevronDown,
  CreditCard,
  X,
  Download,
  Mail,
  Plus,
  Settings,
  History,
  FileText,
  Copy,
  RotateCcw,
  FilePlus,
  MoreHorizontal,
  ExternalLink,
  Receipt,
  FileCheck,
  Ban,
  CreditCard as PaymentIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  invoiceApi,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/api/invoices";
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import {
  paymentReceivedApi,
  type PaymentReceived,
} from "@/lib/api/payments-received";
import { toast } from "sonner";
import { InvoiceTemplateRenderer } from "@/components/invoice-template-renderer";
import { DEFAULT_CONFIG } from "@/app/sales/invoices/[id]/edit-template/config";
import { DraggableText } from "@/components/ui/draggable-text";


// ─── STYLES ──────────────────────────────────────────────────────────
const printStyles = `
@media print {
  body * {
    visibility: hidden;
  }
  #invoice-print-area, #invoice-print-area * {
    visibility: visible;
  }
  #invoice-print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm !important;
    margin: 0 !important;
    background: white !important;
    border: none !important;
    box-shadow: none !important;
  }
  .no-print {
    display: none !important;
  }
  @page {
    size: A4;
    margin: 0;
  }
}
`;

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

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtNum(n: number) {
  return (n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function customerName(c: Invoice["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function numberToWords(num: number): string {
  if (num === 0) return "Zero";

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
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function convertSmall(n: number): string {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  }

  function convert(n: number): string {
    if (n < 100) return convertSmall(n);
    if (n < 1000)
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + convert(n % 100) : "")
      );
    if (n < 100000)
      return (
        convert(Math.floor(n / 1000)) +
        " Thousand" +
        (n % 1000 ? " " + convert(n % 1000) : "")
      );
    if (n < 10000000)
      return (
        convert(Math.floor(n / 100000)) +
        " Lakh" +
        (n % 100000 ? " " + convert(n % 100000) : "")
      );
    return (
      convert(Math.floor(n / 10000000)) +
      " Crore" +
      (n % 10000000 ? " " + convert(n % 10000000) : "")
    );
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = "Indian Rupee " + convert(rupees);
  if (paise > 0) {
    result += " and " + convert(paise) + " Paise";
  }
  return result + " Only";
}

function getDueLabel(invoice: Invoice) {
  if (invoice.status === "Paid" || invoice.status === "Void") return null;
  if (!invoice.dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return `${Math.abs(diff)} DAY(S) OVERDUE`;
  if (diff === 0) return "DUE TODAY";
  return `DUE IN ${diff} DAY(S)`;
}

// ─── Main Detail Page ───────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [linkedSalesOrders, setLinkedSalesOrders] = useState<SalesOrder[]>([]);
  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // States for applying customer advances (excess payments)
  const [unusedPayments, setUnusedPayments] = useState<PaymentReceived[]>([]);
  const [applyCreditsOpen, setApplyCreditsOpen] = useState(false);
  const [selectedCreditPaymentId, setSelectedCreditPaymentId] = useState("");
  const [creditAmountToApply, setCreditAmountToApply] = useState(0);
  const [applyingCredits, setApplyingCredits] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && id) {
      fetchInvoice();
    }
  }, [firebaseUser, loading, id]);

  async function fetchInvoice() {
    setFetching(true);
    try {
      const res = await invoiceApi.getById(id);
      setInvoice(res.data);

      // Parallel fetch extra data
      const custId = typeof res.data.customerId === "object" ? res.data.customerId._id : res.data.customerId;
      Promise.all([
        salesOrderApi.list({ limit: 100 }).then((soRes) => {
          setLinkedSalesOrders(
            soRes.data.filter(
              (so) =>
                (typeof so.invoiceId === "string" && so.invoiceId === id) ||
                (typeof so.invoiceId === "object" &&
                  (so.invoiceId as any)?._id === id),
            ),
          );
        }),
        paymentReceivedApi
          .list({ invoice_id: id })
          .then((pRes) => setPayments(pRes.data)),
        paymentReceivedApi
          .list({ customer_id: custId, status: "PAID", limit: 300 })
          .then((pRes) => {
            const unused = pRes.data.filter(
              (p) =>
                p.amount_in_excess > 0 &&
                p.receipt_type !== "previous-payment",
            );
            setUnusedPayments(unused);
          }),
        invoiceApi
          .getJournalEntries(id)
          .then((jRes) => setJournalEntries(jRes.data)),
      ]);
    } catch {
      toast.error("Failed to fetch invoice");
    } finally {
      setFetching(false);
    }
  }

  async function handleApplyCredits() {
    if (!invoice || !selectedCreditPaymentId || creditAmountToApply <= 0) return;
    if (creditAmountToApply > (invoice.balanceDue || 0)) {
      toast.error("Applied amount cannot exceed invoice balance due");
      return;
    }
    const payment = unusedPayments.find((p) => p._id === selectedCreditPaymentId);
    if (payment && creditAmountToApply > payment.amount_in_excess) {
      toast.error("Applied amount cannot exceed available unused credits");
      return;
    }

    setApplyingCredits(true);
    try {
      await paymentReceivedApi.apply(selectedCreditPaymentId, {
        invoice_id: id,
        applied_amount: creditAmountToApply,
      });
      toast.success("Advance credits applied successfully");
      setApplyCreditsOpen(false);
      await fetchInvoice();
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply credits");
    } finally {
      setApplyingCredits(false);
    }
  }

  async function handleAction(
    action: "send" | "void" | "delete" | "clone" | "recurring",
  ) {
    if (!invoice) return;

    if (
      action === "delete" &&
      !confirm(
        "Are you sure you want to delete this invoice? This action cannot be undone.",
      )
    )
      return;
    if (
      action === "void" &&
      !confirm(
        "Are you sure you want to void this invoice? This will reverse all ledger entries.",
      )
    )
      return;

    setActionLoading(true);
    try {
      if (action === "send") {
        await invoiceApi.send(invoice._id);
        toast.success("Invoice marked as sent");
      } else if (action === "void") {
        await invoiceApi.voidInvoice(invoice._id);
        toast.success("Invoice voided successfully");
      } else if (action === "delete") {
        await invoiceApi.remove(invoice._id);
        toast.success("Invoice deleted");
        router.push("/sales/invoices");
        return;
      } else if (action === "clone") {
        const res = await invoiceApi.clone(invoice._id);
        toast.success("Invoice cloned successfully");
        router.push(`/sales/invoices/${res.data._id}`);
        return;
      } else if (action === "recurring") {
        const res = await invoiceApi.convertToRecurring(invoice._id);
        toast.success("Recurring profile created");
        router.push(`/sales/recurring-invoices/${res.data._id}`);
        return;
      }
      fetchInvoice();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!invoice) return;
    setPdfLoading(true);
    try {
      const blob = await invoiceApi.downloadPdf(invoice._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (!invoice)
    return <div className="p-8 text-center bg-white text-slate-500">Invoice not found.</div>;

  const dueLabel = getDueLabel(invoice);

  return (
    <SidebarProvider>
      <style>{printStyles}</style>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-md"
                onClick={() => router.push("/sales/invoices")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1.5 text-xs max-w-xs overflow-hidden">
                <span className="font-semibold text-teal-700 shrink-0">Invoices</span>
                <span className="text-slate-400 shrink-0">/</span>
                <DraggableText className="font-semibold text-slate-700 max-w-[150px]">
                  {invoice.invoiceNumber}
                </DraggableText>
              </div>
              <div className="ml-2">
                <StatusPill status={invoice.status} />
              </div>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md"
                onClick={() => router.push(`/sales/invoices/${id}/edit`)}
              >
                <Pencil className="h-4 w-4 mr-1.5" /> Edit
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md"
                onClick={() => router.push(`/sales/invoices/${id}/edit-template`)}
              >
                <Settings className="h-4 w-4 mr-1.5" /> Customize
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md">
                    <Send className="h-4 w-4 mr-1.5" /> Send{" "}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/invoices/${id}/send-email`)
                    }
                  >
                    <Mail className="h-4 w-4 mr-2 text-slate-500" /> Send Email
                  </DropdownMenuItem>
                  {invoice.status === "Draft" && (
                    <DropdownMenuItem onClick={() => handleAction("send")}>
                      <FileCheck className="h-4 w-4 mr-2 text-slate-500" /> Mark as Sent
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Invoice link copied to clipboard");
                }}
              >
                <Share2 className="h-4 w-4 mr-1.5" /> Share
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md">
                    <Printer className="h-4 w-4 mr-1.5" /> PDF/Print{" "}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleDownloadPdf}
                    disabled={pdfLoading}
                  >
                    <Download className="h-4 w-4 mr-2 text-slate-500" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2 text-slate-500" /> Print Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {invoice.status !== "Paid" && invoice.status !== "Void" && (
                <Button
                  size="sm"
                  className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-xs"
                  onClick={() =>
                    router.push(`/sales/payments-received/new?invoiceId=${id}`)
                  }
                >
                  <PaymentIcon className="h-4 w-4 mr-1.5" /> Record Payment
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-slate-200 text-slate-500 hover:bg-slate-100 rounded-md">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleAction("recurring")}>
                    <RotateCcw className="h-4 w-4 mr-2 text-teal-600" /> Make Recurring
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/credit-notes/new?invoiceId=${id}`)
                    }
                  >
                    <FilePlus className="h-4 w-4 mr-2 text-rose-600" /> Create Credit Note
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/debit-notes/new?invoiceId=${id}`)
                    }
                  >
                    <FilePlus className="h-4 w-4 mr-2 text-amber-600" /> Create Debit Note
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {}}>
                    <Receipt className="h-4 w-4 mr-2 text-slate-500" /> Add e-Way Bill Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleAction("clone")}>
                    <Copy className="h-4 w-4 mr-2 text-slate-500" /> Clone
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {}}>
                    <History className="h-4 w-4 mr-2 text-slate-500" /> View Journal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {invoice.status !== "Void" && (
                    <DropdownMenuItem
                      className="text-amber-600"
                      onClick={() => handleAction("void")}
                    >
                      <Ban className="h-4 w-4 mr-2" /> Void
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-rose-600 hover:bg-rose-50"
                    onClick={() => handleAction("delete")}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/invoices/${id}/edit-template`)
                    }
                  >
                    <Settings className="h-4 w-4 mr-2 text-slate-500" /> Customize Template
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      router.push("/settings/preferences/invoices")
                    }
                  >
                    <Settings className="h-4 w-4 mr-2 text-slate-500" /> Invoice Preferences
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            <div className="space-y-6">
              <Tabs defaultValue="invoice">
                <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-8">
                  <TabsTrigger
                    value="invoice"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:bg-transparent px-1 py-2 font-bold text-sm text-slate-500"
                  >
                    Invoice
                  </TabsTrigger>
                  <TabsTrigger
                    value="payments"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:bg-transparent px-1 py-2 font-bold text-sm text-slate-500"
                  >
                    Payments Received ({payments.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="journal"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:bg-transparent px-1 py-2 font-bold text-sm text-slate-500"
                  >
                    Journal
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice" className="mt-6 flex justify-center">
                  <div className="shadow-lg rounded-xl overflow-hidden border border-slate-200">
                    <InvoiceTemplateRenderer
                      invoice={invoice}
                      config={{ ...DEFAULT_CONFIG, ...(invoice.templateConfig || {}) }}
                      activeOrganization={activeOrganization}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-6">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    {payments.length === 0 ?
                      <div className="py-20 text-center text-slate-500 flex flex-col items-center gap-2">
                        <Receipt className="h-12 w-12 text-slate-200" />
                        <p className="text-sm font-medium">No payments recorded for this invoice yet.</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="text-teal-700 hover:text-teal-800 font-semibold"
                          onClick={() =>
                            router.push(
                              `/sales/payments-received/new?invoiceId=${id}`,
                            )
                          }
                        >
                          Record Payment Now
                        </Button>
                      </div>
                    : <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-200">
                          <TableRow>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Payment #</TableHead>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Reference #</TableHead>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Mode</TableHead>
                            <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((p) => (
                            <TableRow
                              key={p._id}
                              className="cursor-pointer hover:bg-slate-50/50"
                              onClick={() =>
                                router.push(`/sales/payments-received/${p._id}`)
                              }
                            >
                              <TableCell className="text-sm text-slate-600">{fmtDate(p.payment_date)}</TableCell>
                              <TableCell className="text-sm font-semibold text-teal-700 hover:underline">
                                PR-{p.payment_number}
                              </TableCell>
                              <TableCell className="text-sm text-slate-500">{p.reference_number || "—"}</TableCell>
                              <TableCell className="text-sm text-slate-600">{p.payment_mode}</TableCell>
                              <TableCell className="text-right font-bold text-slate-800 text-sm">
                                {fmt(p.total_amount_received)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    }
                  </div>
                </TabsContent>

                <TabsContent value="journal" className="mt-6">
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    {journalEntries.length === 0 ?
                      <div className="py-20 text-center text-slate-500 text-sm font-medium">
                        No journal entries found.
                      </div>
                    : <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-200">
                          <TableRow>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                            <TableHead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Account</TableHead>
                            <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Debit</TableHead>
                            <TableHead className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {journalEntries.map((j, i) => (
                            <TableRow key={i} className="hover:bg-slate-50/50">
                              <TableCell className="text-xs text-slate-500">
                                {fmtDate(j.postingDate)}
                              </TableCell>
                              <TableCell>
                                <div className="font-semibold text-slate-800 text-sm">
                                  {j.accountId?.name || "Account"}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {j.accountId?.code || ""}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-slate-700 text-sm">
                                {j.debit > 0 ? fmt(j.debit) : ""}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-slate-700 text-sm">
                                {j.credit > 0 ? fmt(j.credit) : ""}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    }
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5 sticky top-6">
                <div>
                  <h3 className="font-bold text-xs mb-4 text-slate-900 uppercase tracking-wider">
                    Invoice Details
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500 font-medium">Status</span>
                      <StatusPill status={invoice.status} />
                    </div>
                    {dueLabel && (
                      <div className="bg-rose-50 text-rose-700 text-[10px] font-bold p-2 rounded border border-rose-100 flex items-center justify-center gap-1.5">
                        <Bell className="h-3 w-3" /> {dueLabel}
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Associated Orders
                      </div>
                      {linkedSalesOrders.length > 0 ?
                        linkedSalesOrders.map((so) => (
                          <div
                            key={so._id}
                            className="flex items-center justify-between text-sm group cursor-pointer"
                            onClick={() =>
                              router.push(`/sales/orders/${so._id}`)
                            }
                          >
                            <span className="font-semibold text-teal-700 group-hover:underline">
                              {so.salesOrderNumber}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-teal-600 transition-colors" />
                          </div>
                        ))
                      : <div className="text-xs text-slate-400 italic">
                          No sales orders linked.
                        </div>
                      }
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Total Amount
                      </div>
                      <div className="text-2xl font-black text-slate-900">
                        {fmt(invoice.total)}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <FileCheck className="h-3.5 w-3.5" /> Created on{" "}
                        {fmtDate(invoice.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full text-xs font-bold gap-2 text-slate-600 border-slate-200 hover:bg-slate-50 rounded-md"
                    onClick={() =>
                      router.push(`/sales/invoices/${id}/send-email`)
                    }
                  >
                    <Mail className="h-3.5 w-3.5" /> Email Customer
                  </Button>
                </div>

                {invoice.status !== "Paid" && invoice.status !== "Void" && unusedPayments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                      <PaymentIcon className="h-4 w-4 text-amber-600" />
                      Unused Credits: {fmt(unusedPayments.reduce((sum, p) => sum + p.amount_in_excess, 0))}
                    </div>
                    <Button
                      className="w-full text-xs font-bold bg-amber-650 hover:bg-amber-700 text-white rounded-md h-8 shadow-xs"
                      onClick={() => {
                        setApplyCreditsOpen(true);
                        setSelectedCreditPaymentId(unusedPayments[0]._id);
                        setCreditAmountToApply(Math.min(unusedPayments[0].amount_in_excess, invoice.balanceDue || 0));
                      }}
                    >
                      Apply Credits
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Dialog open={applyCreditsOpen} onOpenChange={setApplyCreditsOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Apply Credits to Invoice</DialogTitle>
            </DialogHeader>
            {invoice && (
              <div className="space-y-6">
                <div className="rounded-md bg-muted/40 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice Number:</span>
                    <span className="font-semibold text-slate-800">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice Balance Due:</span>
                    <span className="font-semibold text-slate-850">{fmt(invoice.balanceDue || 0)}</span>
                  </div>
                </div>

                {unusedPayments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No unused advance credits found for this customer.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Select Advance Payment (Credits)*</Label>
                      <Select
                        value={selectedCreditPaymentId}
                        onValueChange={(val) => {
                          setSelectedCreditPaymentId(val);
                          const target = unusedPayments.find((p) => p._id === val);
                          if (target) {
                            setCreditAmountToApply(Math.min(target.amount_in_excess, invoice.balanceDue || 0));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Payment Receipt" />
                        </SelectTrigger>
                        <SelectContent>
                          {unusedPayments.map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              PR-{p.payment_number} (Excess: {fmt(p.amount_in_excess)})
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
                          max={Math.min(unusedPayments.find((p) => p._id === selectedCreditPaymentId)?.amount_in_excess || 0, invoice.balanceDue || 0)}
                          step="0.01"
                          className="rounded-l-none"
                          value={creditAmountToApply || ""}
                          onChange={(e) => setCreditAmountToApply(Number(e.target.value || 0))}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        This amount will be deducted from the customer's advance and credited to the invoice balance due.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {unusedPayments.length > 0 && (
                    <Button
                      className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                      onClick={() => void handleApplyCredits()}
                      disabled={applyingCredits || creditAmountToApply <= 0}
                    >
                      {applyingCredits ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Apply Credits
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setApplyCreditsOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
