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
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  invoiceApi,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/api/invoices";
import { payUApi, type PayUConfig } from "@/lib/api/payu";
import { toast } from "sonner";

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
  return n.toFixed(2);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateLong(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(c: Invoice["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function customerEmail(c: Invoice["customerId"]) {
  if (typeof c === "string") return "";
  return c?.email || "";
}

function salesPersonName(sp: Invoice["salesPersonId"]) {
  if (!sp) return "—";
  if (typeof sp === "string") return sp;
  return sp.name || "—";
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
  if (num === 0) return "Zero";
  const rupees = Math.floor(num);
  if (rupees < 20) return `Indian Rupee ${ones[rupees]} Only`;
  if (rupees < 100)
    return `Indian Rupee ${tens[Math.floor(rupees / 10)]}${rupees % 10 ? "-" + ones[rupees % 10] : ""} Only`;
  if (rupees < 1000)
    return `Indian Rupee ${ones[Math.floor(rupees / 100)]} Hundred ${
      rupees % 100 ?
        numberToWords(rupees % 100)
          .replace("Indian Rupee ", "")
          .replace(" Only", "")
      : ""
    } Only`;
  return `Indian Rupee ${rupees.toLocaleString("en-IN")} Only`;
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

// ─── Record Payment Modal ───────────────────────────────────────────────

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onRecorded: () => void;
}

function RecordPaymentModal({
  open,
  onClose,
  invoice,
  onRecorded,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState(invoice.balanceDue || invoice.total);
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleRecord() {
    setSaving(true);
    try {
      await invoiceApi.recordPayment(invoice._id, {
        amount,
        paymentDate,
        notes,
      });
      onRecorded();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Payment Amount</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-sm">
                &#8377;
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="rounded-l-none"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleRecord} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Record Payment
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Email Modal (for Detail Page) ─────────────────────────────────

interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  onSent: () => void;
}

function SendEmailModal({
  open,
  onClose,
  invoice,
  onSent,
}: SendEmailModalProps) {
  const name = customerName(invoice.customerId);
  const email = customerEmail(invoice.customerId);
  const { activeOrganization } = useOrganization();

  const [to, setTo] = useState(email);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    `Invoice - ${invoice.invoiceNumber} from HAI`,
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);

  const formattedTotal = fmt(invoice.total);
  const formattedDate = fmtDate(invoice.invoiceDate);

  async function handleSend() {
    const toList = to
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const ccList = cc
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (toList.length === 0) {
      toast.error("Please enter at least one recipient email address");
      return;
    }

    setSending(true);
    try {
      await invoiceApi.sendEmail(invoice._id, {
        to: toList,
        cc: ccList,
        subject,
        body: "",
        attachInvoicePdf: attachPdf,
      });
      onSent();
      onClose();
      toast.success("Invoice emailed successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email To {name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <span className="text-foreground font-medium">
              {activeOrganization?.name || "Your Organization"}{" "}
              <span className="text-xs text-muted-foreground">
                (via SMTP settings)
              </span>
            </span>
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">
              Send To
            </Label>
            <div className="space-y-1">
              <Input
                type="email"
                placeholder="customer@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 text-sm"
              />
              {!to && (
                <p className="text-xs text-red-500">
                  No email on record for this customer. Enter the recipient
                  email above.
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">
              Cc
            </Label>
            <Input
              type="email"
              placeholder="optional@example.com"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">
              Subject
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Email preview */}
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
              <span className="text-xs text-muted-foreground font-bold">B</span>
              <span className="text-xs text-muted-foreground italic">I</span>
              <span className="text-xs text-muted-foreground underline">U</span>
              <span className="text-xs text-muted-foreground line-through">
                S
              </span>
              <Separator orientation="vertical" className="h-3 mx-1" />
              <span className="text-xs text-muted-foreground">16px</span>
              <span className="text-xs text-muted-foreground ml-2">Arial</span>
            </div>
            <div className="p-6 space-y-4 bg-gray-50">
              <div className="bg-blue-600 text-white text-center py-4 rounded">
                <h2 className="text-lg font-semibold">
                  Invoice #{invoice.invoiceNumber}
                </h2>
              </div>
              <p className="text-sm">Dear {name},</p>
              <p className="text-sm">
                Thank you for your business. Your invoice can be viewed, printed
                and downloaded as PDF from the link below. You can also choose
                to pay it online.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center space-y-3">
                <div className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  Invoice Amount
                </div>
                <div className="text-2xl font-bold text-red-600">
                  {formattedTotal}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-2 text-xs text-left max-w-xs mx-auto">
                  <span className="text-muted-foreground">Invoice No</span>
                  <span className="font-semibold text-right">
                    {invoice.invoiceNumber}
                  </span>
                  <span className="text-muted-foreground">Invoice Date</span>
                  <span className="font-semibold text-right">
                    {formattedDate}
                  </span>
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-semibold text-right">
                    {invoice.dueDate ? fmtDate(invoice.dueDate) : formattedDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={false} />
            Attach Customer Statement
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={attachPdf}
              onCheckedChange={(c) => setAttachPdf(c === true)}
            />
            Attach Invoice PDF
            {attachPdf && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-red-500">&#x25A0;</span>
                {invoice.invoiceNumber}
              </span>
            )}
          </label>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSend} disabled={sending}>
            {sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Send
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [payUConfig, setPayUConfig] = useState<PayUConfig | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

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
      fetchPayUConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, id]);

  async function fetchInvoice() {
    setFetching(true);
    try {
      const res = await invoiceApi.getById(id);
      setInvoice(res.data);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function fetchPayUConfig() {
    try {
      const res = await payUApi.getConfig();
      setPayUConfig(res.data);
    } catch {
      // PayU not configured
    }
  }

  async function handleAction(action: "send" | "void" | "delete") {
    if (!invoice) return;
    if (action === "delete" && !confirm("Delete this invoice?")) return;
    if (
      action === "void" &&
      !confirm("Void this invoice? This cannot be undone.")
    )
      return;
    setActionLoading(true);
    try {
      if (action === "send") {
        await invoiceApi.send(invoice._id);
      } else if (action === "void") {
        await invoiceApi.voidInvoice(invoice._id);
      } else if (action === "delete") {
        await invoiceApi.remove(invoice._id);
        router.push("/sales/invoices");
        return;
      }
      fetchInvoice();
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePayUPayment() {
    if (!invoice) return;
    
    // Get customer details
    const custName = customerName(invoice.customerId);
    const custEmail = customerEmail(invoice.customerId);
    
    // Simple prompt for customer phone (in production, you'd have a proper modal)
    const customerPhone = prompt("Enter customer phone number:", "9999999999");
    if (!customerPhone) return;

    setPaymentLoading(true);
    try {
      const res = await payUApi.initiatePayment({
        invoiceId: invoice._id,
        customerPhone,
      });
      
      // Redirect to PayU checkout
      window.location.href = res.data.checkoutUrl;
    } catch (e: any) {
      toast.error(e.message || "Payment initiation failed");
    } finally {
      setPaymentLoading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center">
            <p>Invoice not found.</p>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const cName = customerName(invoice.customerId);
  const cEmail = customerEmail(invoice.customerId);
  const dueLabel = getDueLabel(invoice);
  const orgName = activeOrganization?.name || "HAI";

  // Generate journal entries
  const journalEntries = invoice.journalEntries || [
    { account: "Accounts Receivable", debit: invoice.total, credit: 0 },
    { account: "Sales", debit: 0, credit: invoice.total },
  ];
  const totalDebit = journalEntries.reduce((s, j) => s + j.debit, 0);
  const totalCredit = journalEntries.reduce((s, j) => s + j.credit, 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/invoices")}
              >
                Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                {invoice.invoiceNumber}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/invoices")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col max-w-5xl">
          {/* ═══ Invoice List sidebar + Detail Panel ═══ */}
          <div className="flex">
            {/* Main Content */}
            <div className="flex-1 p-6 space-y-6">
              {/* Header with actions */}
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold">{invoice.invoiceNumber}</h1>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-muted-foreground">
                      {cName}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {fmt(invoice.total)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">
                      {invoice.invoiceNumber} &bull;{" "}
                      {fmtDateLong(invoice.invoiceDate)}
                    </span>
                  </div>
                  {dueLabel && (
                    <div className="flex items-center gap-1 mt-1">
                      <span
                        className={`text-xs font-semibold ${
                          dueLabel.includes("OVERDUE") ? "text-red-600" : (
                            "text-orange-600"
                          )
                        }`}
                      >
                        {dueLabel}
                      </span>
                      <Mail className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              {/* What's Next banner */}
              {invoice.status === "Sent" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                  <span className="text-blue-600">&#10024;</span>
                  <div className="flex-1 text-sm">
                    <span className="font-semibold">WHAT&apos;S NEXT?</span>{" "}
                    Invoice has been sent. Record payment for it as soon as you
                    receive payment.{" "}
                    <button className="text-blue-600 hover:underline">
                      Learn More
                    </button>
                  </div>
                  <Button size="sm" onClick={() => setShowPaymentModal(true)}>
                    Record Payment
                  </Button>
                </div>
              )}

              {/* PayU Payment Section */}
              {invoice.status !== "Paid" && invoice.status !== "Void" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">Pay Online</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Get paid instantly with secure online payment
                      </p>
                    </div>
                    {payUConfig && payUConfig.isActive ? (
                      <Button 
                        size="sm" 
                        onClick={handlePayUPayment}
                        disabled={paymentLoading}
                        className="bg-orange-500 hover:bg-orange-600"
                      >
                        {paymentLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4 mr-1" />
                            Pay with PayU
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        <Settings className="h-4 w-4 mr-1" />
                        PayU Not Configured
                      </Button>
                    )}
                  </div>
                  
                  {!payUConfig && (
                    <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2">
                      PayU payment gateway is not configured. Contact your administrator to set up PayU integration.
                    </div>
                  )}
                </div>
              )}

              {/* Payment gateway tip */}
              <div className="text-sm text-muted-foreground">
                Want to accept other payment methods?{" "}
                <button className="text-blue-600 hover:underline">
                  configure payment gateways
                </button>{" "}
                or{" "}
                <button className="text-blue-600 hover:underline">
                  display a UPI QR code
                </button>
                .
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {["Draft", "Sent"].includes(invoice.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      router.push(`/sales/invoices/${invoice._id}/edit`)
                    }
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Send
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setShowEmailModal(true)}>
                      Send Email
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAction("send")}>
                      Mark as Sent
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button size="sm" variant="outline">
                  <Share2 className="h-3.5 w-3.5 mr-1" />
                  Share
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Bell className="h-3.5 w-3.5 mr-1" />
                      Reminders
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Send Reminder</DropdownMenuItem>
                    <DropdownMenuItem>Set Up Auto Reminders</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Printer className="h-3.5 w-3.5 mr-1" />
                      PDF/Print
                      <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Printer className="h-4 w-4 mr-2" />
                      Print
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {invoice.status !== "Paid" && invoice.status !== "Void" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm">
                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                        Record Payment
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => setShowPaymentModal(true)}
                      >
                        Record Payment
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost">
                      ...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {invoice.status !== "Void" && (
                      <DropdownMenuItem onClick={() => handleAction("void")}>
                        Void Invoice
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleAction("delete")}
                    >
                      Delete Invoice
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* ═══ Tax Invoice Preview ═══ */}
              <div className="border rounded-lg overflow-hidden relative">
                {/* Sent stamp */}
                {invoice.status !== "Draft" && (
                  <div className="absolute top-4 left-4 z-10">
                    <div
                      className="bg-blue-500 text-white text-xs font-bold px-3 py-1 transform -rotate-12 shadow-lg"
                      style={{
                        clipPath:
                          "polygon(0 0, 100% 0, 95% 50%, 100% 100%, 0 100%, 5% 50%)",
                      }}
                    >
                      Sent
                    </div>
                  </div>
                )}

                {/* Customize button */}
                <div className="absolute top-3 right-3 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Settings className="h-3.5 w-3.5 mr-1" />
                        Customize
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>Change Template</DropdownMenuItem>
                      <DropdownMenuItem>Edit Template</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="bg-white p-8 space-y-6">
                  {/* Company Header */}
                  <div className="flex justify-between items-start">
                    <div className="text-sm">
                      <div className="font-bold text-lg">{orgName}</div>
                      <div className="text-muted-foreground">
                        {activeOrganization?.country || "India"}
                      </div>
                      <div className="text-muted-foreground">{cEmail}</div>
                    </div>
                    <div className="text-2xl font-bold tracking-wide text-right">
                      TAX INVOICE
                    </div>
                  </div>

                  {/* Invoice Meta */}
                  <div className="grid grid-cols-2 gap-4 border rounded p-4 text-sm">
                    <div className="space-y-1">
                      <div className="flex gap-20">
                        <span className="text-muted-foreground">#</span>
                        <span className="font-medium">
                          : {invoice.invoiceNumber}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <span className="text-muted-foreground">
                          Invoice Date
                        </span>
                        <span className="font-medium">
                          : {fmtDate(invoice.invoiceDate)}
                        </span>
                      </div>
                      <div className="flex gap-12">
                        <span className="text-muted-foreground">Terms</span>
                        <span className="font-medium">: Due on Receipt</span>
                      </div>
                      <div className="flex gap-6">
                        <span className="text-muted-foreground">Due Date</span>
                        <span className="font-medium">
                          :{" "}
                          {invoice.dueDate ?
                            fmtDate(invoice.dueDate)
                          : fmtDate(invoice.invoiceDate)}
                        </span>
                      </div>
                    </div>
                    <div />
                  </div>

                  {/* Bill To */}
                  <div className="text-sm">
                    <div className="font-bold bg-muted/50 px-2 py-1">
                      Bill To
                    </div>
                    <div className="px-2 py-1 text-blue-600 font-medium">
                      {cName}
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10 font-bold text-foreground">
                            #
                          </TableHead>
                          <TableHead className="font-bold text-foreground">
                            Item &amp; Description
                          </TableHead>
                          <TableHead className="text-right font-bold text-foreground w-16">
                            Qty
                          </TableHead>
                          <TableHead className="text-right font-bold text-foreground w-20">
                            Rate
                          </TableHead>
                          <TableHead className="text-right font-bold text-foreground w-24">
                            Amount
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoice.items.map((item, idx) => (
                          <TableRow key={item._id || idx}>
                            <TableCell className="text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div>{item.name}</div>
                              {item.description && (
                                <div className="text-xs text-muted-foreground">
                                  {item.description}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtNum(item.quantity)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtNum(item.rate)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtNum(item.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="w-72 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Sub Total</span>
                        <span className="tabular-nums">
                          {fmtNum(invoice.subTotal)}
                        </span>
                      </div>
                      {invoice.discountAmount > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Discount</span>
                          <span className="tabular-nums">
                            - {fmtNum(invoice.discountAmount)}
                          </span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold">
                        <span>Total</span>
                        <span className="tabular-nums">
                          &#8377;{fmtNum(invoice.total)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Balance Due</span>
                        <span className="tabular-nums">
                          &#8377;{fmtNum(invoice.balanceDue ?? invoice.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Total in Words */}
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      Total In Words
                    </span>
                    <div className="italic font-medium">
                      {numberToWords(invoice.total)}
                    </div>
                  </div>

                  {/* Notes */}
                  {invoice.customerNotes && (
                    <div className="text-sm">
                      <span className="text-muted-foreground italic">
                        Notes
                      </span>
                      <div className="italic">{invoice.customerNotes}</div>
                    </div>
                  )}

                  {/* Authorized Signature */}
                  <div className="text-right text-sm text-muted-foreground pt-8">
                    <Separator className="ml-auto w-48 mb-2" />
                    Authorized Signature
                  </div>
                </div>
              </div>

              {/* ═══ More Information ═══ */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">More Information</h3>

                <div className="text-sm text-right">
                  PDF Template : &apos;Spreadsheet Template&apos;{" "}
                  <button className="text-blue-600 hover:underline">
                    Change
                  </button>
                </div>

                <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Email Recipients
                  </span>
                  <span>
                    {invoice.emailContacts?.join(", ") || cEmail || "—"}
                  </span>
                </div>
              </div>

              <Separator />

              {/* ═══ Journal Tab ═══ */}
              <Tabs defaultValue="journal">
                <TabsList>
                  <TabsTrigger value="journal">Journal</TabsTrigger>
                </TabsList>
                <TabsContent value="journal" className="space-y-4 pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Amount is displayed in your base currency
                    <Badge
                      variant="outline"
                      className="bg-blue-600 text-white border-blue-600 text-xs"
                    >
                      INR
                    </Badge>
                  </div>

                  <h4 className="text-sm font-semibold">Invoice</h4>

                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ACCOUNT</TableHead>
                          <TableHead className="text-right">DEBIT</TableHead>
                          <TableHead className="text-right">CREDIT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {journalEntries.map((entry, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">
                              {entry.account}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtNum(entry.debit)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-green-600">
                              {fmtNum(entry.credit)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total row */}
                        <TableRow className="font-bold">
                          <TableCell />
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(totalDebit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtNum(totalCredit)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Modals */}
      {invoice && showEmailModal && (
        <SendEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          invoice={invoice}
          onSent={fetchInvoice}
        />
      )}

      {invoice && showPaymentModal && (
        <RecordPaymentModal
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          invoice={invoice}
          onRecorded={fetchInvoice}
        />
      )}
    </SidebarProvider>
  );
}
