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

const statusColor: Record<InvoiceStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Viewed: "bg-indigo-50 text-indigo-700 border-indigo-300",
  Overdue: "bg-red-50 text-red-700 border-red-300",
  "Partially Paid": "bg-yellow-50 text-yellow-700 border-yellow-300",
  Paid: "bg-green-50 text-green-700 border-green-300",
  Void: "bg-gray-50 text-gray-400 border-gray-200",
};

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
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice)
    return <div className="p-8 text-center">Invoice not found.</div>;

  const cName = customerName(invoice.customerId);
  const dueLabel = getDueLabel(invoice);
  const orgName = activeOrganization?.name || "HAI";
  const lineTaxTotal = invoice.items.reduce((sum, item) => {
    const storedTax = Number(item.taxAmount || 0);
    if (storedTax > 0) return sum + storedTax;
    // Fallback: compute from taxPercent when taxAmount is 0/missing
    const taxPct = Number(item.taxPercent || 0);
    if (taxPct <= 0) return sum;
    const lineTotal =
      Number(item.quantity || 0) * Number(item.rate || 0);
    const lineDiscount =
      Number(item.discountAmount || 0) ||
      (lineTotal * Number(item.discountPercent || 0)) / 100;
    return sum + ((lineTotal - lineDiscount) * taxPct) / 100;
  }, 0);
  const lineTaxPercent =
    invoice.items.find((item) => Number(item.taxPercent || 0) > 0)
      ?.taxPercent || 0;
  const halfLineTaxPercent = Number(lineTaxPercent || 0) / 2;

  return (
    <SidebarProvider>
      <style>{printStyles}</style>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => router.push("/sales/invoices")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Invoices</span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">
                {invoice.invoiceNumber}
              </span>
              <Badge
                className={`ml-2 ${statusColor[invoice.status]}`}
                variant="outline"
              >
                {invoice.status}
              </Badge>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/sales/invoices/${id}/edit`)}
              >
                <Pencil className="h-4 w-4 mr-1.5" /> Edit
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
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
                    <Mail className="h-4 w-4 mr-2" /> Send Email
                  </DropdownMenuItem>
                  {invoice.status === "Draft" && (
                    <DropdownMenuItem onClick={() => handleAction("send")}>
                      <FileCheck className="h-4 w-4 mr-2" /> Mark as Sent
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success("Invoice link copied to clipboard");
                }}
              >
                <Share2 className="h-4 w-4 mr-1.5" /> Share
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Printer className="h-4 w-4 mr-1.5" /> PDF/Print{" "}
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={handleDownloadPdf}
                    disabled={pdfLoading}
                  >
                    <Download className="h-4 w-4 mr-2" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-2" /> Print Invoice
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {invoice.status !== "Paid" && invoice.status !== "Void" && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 shadow-sm"
                  onClick={() =>
                    router.push(`/sales/payments-received/new?invoiceId=${id}`)
                  }
                >
                  <PaymentIcon className="h-4 w-4 mr-1.5" /> Record Payment
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleAction("recurring")}>
                    <RotateCcw className="h-4 w-4 mr-2 text-blue-600" /> Make
                    Recurring
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/credit-notes/new?invoiceId=${id}`)
                    }
                  >
                    <FilePlus className="h-4 w-4 mr-2 text-orange-600" /> Create
                    Credit Note
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/sales/debit-notes/new?invoiceId=${id}`)
                    }
                  >
                    <FilePlus className="h-4 w-4 mr-2 text-indigo-600" /> Create
                    Debit Note
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {}}>
                    <Receipt className="h-4 w-4 mr-2" /> Add e-Way Bill Details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleAction("clone")}>
                    <Copy className="h-4 w-4 mr-2" /> Clone
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {}}>
                    <History className="h-4 w-4 mr-2" /> View Journal
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {invoice.status !== "Void" && (
                    <DropdownMenuItem
                      className="text-orange-600"
                      onClick={() => handleAction("void")}
                    >
                      <Ban className="h-4 w-4 mr-2" /> Void
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleAction("delete")}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push("/settings/preferences/invoices")
                    }
                  >
                    <Settings className="h-4 w-4 mr-2" /> Invoice Preferences
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
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 font-medium"
                  >
                    Invoice
                  </TabsTrigger>
                  <TabsTrigger
                    value="payments"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 font-medium"
                  >
                    Payments Received ({payments.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="journal"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 font-medium"
                  >
                    Journal
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice" className="mt-6">
                  {/* Zoho Books Style Invoice Template */}
                  <div
                    id="invoice-print-area"
                    className="bg-white p-12 shadow-xl rounded-sm border min-h-[1000px] font-sans text-slate-800"
                  >
                    <div className="flex justify-between items-start mb-12">
                      <div className="space-y-1">
                        <h1 className="font-bold text-xl uppercase tracking-tight">
                          {orgName}
                        </h1>
                        <p className="text-sm text-slate-500">
                          {activeOrganization?.address?.city || "City"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {activeOrganization?.address?.country || "India"}
                        </p>
                        {activeOrganization?.taxId && (
                          <p className="text-xs font-semibold mt-2">
                            GSTIN: {activeOrganization.taxId}
                          </p>
                        )}
                        <p className="text-sm text-slate-500">
                          {activeOrganization?.email || "contact@haldar.in"}
                        </p>
                      </div>
                      <div className="text-right">
                        <h2 className="text-4xl font-light text-slate-600 uppercase tracking-widest">
                          TAX INVOICE
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-[1.5fr_1fr] border border-slate-200">
                      <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
                        <div className="p-3 space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            #
                          </div>
                          <div className="text-sm font-semibold">
                            : {invoice.invoiceNumber}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                            Invoice Date
                          </div>
                          <div className="text-sm font-semibold">
                            : {fmtDate(invoice.invoiceDate)}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                            Terms
                          </div>
                          <div className="text-sm font-semibold">
                            : Due on Receipt
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                            Due Date
                          </div>
                          <div className="text-sm font-semibold">
                            : {fmtDate(invoice.dueDate || "")}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                            P.O.#
                          </div>
                          <div className="text-sm font-semibold">
                            : {invoice.orderNumber || "—"}
                          </div>
                        </div>
                        <div className="p-3 space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Place Of Supply
                          </div>
                          <div className="text-sm font-semibold">
                            :{" "}
                            {activeOrganization?.address?.state ||
                              "Chhattisgarh (22)"}
                          </div>
                        </div>
                      </div>
                      <div className="p-3 border-b border-slate-200 bg-slate-50/30">
                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">
                          Bill To
                        </div>
                        <div className="font-bold text-blue-600 text-base mb-1">
                          {cName}
                        </div>
                        <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {(
                            typeof invoice.customerId === "object" &&
                            (invoice.customerId as any)?.billingAddress
                          ) ?
                            `${(invoice.customerId as any).billingAddress.street || ""}\n${(invoice.customerId as any).billingAddress.city || ""}, ${(invoice.customerId as any).billingAddress.state || ""}`
                          : "Customer Address"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 border border-slate-200 rounded-sm overflow-hidden">
                      <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-200">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[40px] text-center border-r font-bold text-slate-700">
                              #
                            </TableHead>
                            <TableHead className="font-bold text-slate-700 border-r">
                              Item & Description
                            </TableHead>
                            <TableHead className="w-[100px] text-center font-bold text-slate-700 border-r">
                              HSN/SAC
                            </TableHead>
                            <TableHead className="w-[80px] text-right font-bold text-slate-700 border-r">
                              Qty
                            </TableHead>
                            <TableHead className="w-[100px] text-right font-bold text-slate-700 border-r">
                              Rate
                            </TableHead>
                            <TableHead className="w-[120px] p-0 border-r overflow-hidden">
                              <div className="text-center border-b py-1 text-[10px] font-bold text-slate-700">
                                CGST
                              </div>
                              <div className="flex divide-x h-full">
                                <div className="flex-1 text-center py-1 text-[9px] font-bold text-slate-600">
                                  %
                                </div>
                                <div className="flex-1 text-center py-1 text-[9px] font-bold text-slate-600">
                                  Amt
                                </div>
                              </div>
                            </TableHead>
                            <TableHead className="w-[120px] p-0 border-r overflow-hidden">
                              <div className="text-center border-b py-1 text-[10px] font-bold text-slate-700">
                                SGST
                              </div>
                              <div className="flex divide-x h-full">
                                <div className="flex-1 text-center py-1 text-[9px] font-bold text-slate-600">
                                  %
                                </div>
                                <div className="flex-1 text-center py-1 text-[9px] font-bold text-slate-600">
                                  Amt
                                </div>
                              </div>
                            </TableHead>
                            <TableHead className="w-[140px] text-right font-bold text-slate-700">
                              Amount (excl. tax)
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.items.map((item, idx) => {
                            const taxPercent = item.taxPercent || 0;
                            const lineTotal =
                              Number(item.quantity || 0) *
                              Number(item.rate || 0);
                            const lineDiscount =
                              Number(item.discountAmount || 0) ||
                              (lineTotal * Number(item.discountPercent || 0)) /
                                100;
                            const taxableAmount = Math.max(
                              0,
                              lineTotal - lineDiscount,
                            );
                            // Use stored taxAmount if available, otherwise compute from taxPercent
                            const taxAmount =
                              Number(item.taxAmount || 0) > 0
                                ? Number(item.taxAmount)
                                : (taxableAmount * taxPercent) / 100;
                            const halfTaxPercent = taxPercent / 2;
                            const halfTaxAmount = taxAmount / 2;

                            return (
                              <TableRow
                                key={idx}
                                className="border-b border-slate-200 last:border-b-0 hover:bg-transparent align-top"
                              >
                                <TableCell className="text-center border-r py-4">
                                  {idx + 1}
                                </TableCell>
                                <TableCell className="border-r py-4">
                                  <div className="font-bold text-sm">
                                    {item.name}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-1 italic">
                                    {item.description}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center border-r py-4 text-sm">
                                  {item.hsnSacCode || "—"}
                                </TableCell>
                                <TableCell className="text-right border-r py-4 text-sm">
                                  {fmtNum(item.quantity)}
                                  <div className="text-[10px] text-slate-400">
                                    Number
                                  </div>
                                </TableCell>
                                <TableCell className="text-right border-r py-4 text-sm">
                                  {fmtNum(item.rate)}
                                </TableCell>
                                <TableCell className="p-0 border-r align-middle">
                                  <div className="flex divide-x h-full">
                                    <div className="flex-1 text-center text-sm py-4">
                                      {taxPercent > 0 ?
                                        `${halfTaxPercent}%`
                                      : "0%"}
                                    </div>
                                    <div className="flex-1 text-center text-sm py-4">
                                      {taxPercent > 0 ?
                                        fmtNum(halfTaxAmount)
                                      : "0.00"}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="p-0 border-r align-middle">
                                  <div className="flex divide-x h-full">
                                    <div className="flex-1 text-center text-sm py-4">
                                      {taxPercent > 0 ?
                                        `${halfTaxPercent}%`
                                      : "0%"}
                                    </div>
                                    <div className="flex-1 text-center text-sm py-4">
                                      {taxPercent > 0 ?
                                        fmtNum(halfTaxAmount)
                                      : "0.00"}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right py-4 font-semibold text-sm">
                                  {fmtNum(taxableAmount)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-8 flex justify-between gap-12">
                      <div className="flex-1 space-y-6">
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Total In Words
                          </div>
                          <div className="text-sm font-bold italic text-slate-700">
                            {numberToWords(invoice.total)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">
                            Notes
                          </div>
                          <div className="text-sm text-slate-600">
                            {invoice.customerNotes ||
                              "Thanks for your business."}
                          </div>
                        </div>
                      </div>

                      <div className="w-[320px] border border-slate-200 bg-slate-50/20 p-4 space-y-3 rounded-sm">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Sub Total</span>
                          <span className="font-medium">
                            {fmtNum(invoice.subTotal)}
                          </span>
                        </div>

                        {/* Itemized Taxes */}
                        {lineTaxTotal > 0 && (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-500">
                                CGST
                                {halfLineTaxPercent > 0 ?
                                  ` (${halfLineTaxPercent}%)`
                                : ""}
                              </span>
                              <span className="font-medium">
                                {fmtNum(lineTaxTotal / 2)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-500">
                                SGST
                                {halfLineTaxPercent > 0 ?
                                  ` (${halfLineTaxPercent}%)`
                                : ""}
                              </span>
                              <span className="font-medium">
                                {fmtNum(lineTaxTotal / 2)}
                              </span>
                            </div>
                          </>
                        )}

                        <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                          <span>Total</span>
                          <span>₹{fmtNum(invoice.total)}</span>
                        </div>

                        {payments.length > 0 && (
                          <div className="flex justify-between text-sm text-red-600 font-medium">
                            <span>Payment Made</span>
                            <span>
                              (-){" "}
                              {fmtNum(
                                invoice.total - (invoice.balanceDue ?? 0),
                              )}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between text-lg font-extrabold text-slate-900 border-t-2 border-double pt-2 mt-2">
                          <span>Balance Due</span>
                          <span>
                            ₹{fmtNum(invoice.balanceDue ?? invoice.total)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-24 flex justify-end">
                      <div className="w-48 border-t border-slate-400 pt-2 text-center text-xs font-bold text-slate-600">
                        Authorized Signature
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-6">
                  <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    {payments.length === 0 ?
                      <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-2">
                        <Receipt className="h-12 w-12 text-slate-200" />
                        <p>No payments recorded for this invoice yet.</p>
                        <Button
                          variant="link"
                          size="sm"
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
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Payment #</TableHead>
                            <TableHead>Reference #</TableHead>
                            <TableHead>Mode</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((p) => (
                            <TableRow
                              key={p._id}
                              className="cursor-pointer hover:bg-slate-50"
                              onClick={() =>
                                router.push(`/sales/payments-received/${p._id}`)
                              }
                            >
                              <TableCell>{fmtDate(p.payment_date)}</TableCell>
                              <TableCell className="font-medium text-blue-600">
                                PR-{p.payment_number}
                              </TableCell>
                              <TableCell>{p.reference_number || "—"}</TableCell>
                              <TableCell>{p.payment_mode}</TableCell>
                              <TableCell className="text-right font-bold text-slate-900">
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
                  <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    {journalEntries.length === 0 ?
                      <div className="py-20 text-center text-muted-foreground">
                        No journal entries found.
                      </div>
                    : <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {journalEntries.map((j, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs text-slate-500">
                                {fmtDate(j.postingDate)}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">
                                  {j.accountId?.name || "Account"}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {j.accountId?.code || ""}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {j.debit > 0 ? fmt(j.debit) : ""}
                              </TableCell>
                              <TableCell className="text-right font-medium">
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
              <div className="bg-white rounded-lg border shadow-sm p-5 space-y-5 sticky top-6">
                <div>
                  <h3 className="font-bold text-sm mb-4 text-slate-900 uppercase tracking-wider">
                    Invoice Details
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Status</span>
                      <Badge
                        className={`${statusColor[invoice.status]} font-bold`}
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    {dueLabel && (
                      <div className="bg-red-50 text-red-700 text-[10px] font-extrabold p-2 rounded border border-red-100 flex items-center justify-center gap-1.5">
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
                            <span className="font-medium text-blue-600 group-hover:underline">
                              {so.salesOrderNumber}
                            </span>
                            <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-blue-400" />
                          </div>
                        ))
                      : <div className="text-sm text-slate-400 italic">
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
                        <FileCheck className="h-3 w-3" /> Created on{" "}
                        {fmtDate(invoice.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    className="w-full text-xs font-bold gap-2 text-slate-600"
                    onClick={() =>
                      router.push(`/sales/invoices/${id}/send-email`)
                    }
                  >
                    <Mail className="h-3.5 w-3.5" /> Email Customer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
