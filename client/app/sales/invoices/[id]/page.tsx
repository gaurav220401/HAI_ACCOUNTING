"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
  CreditCard as PaymentIcon
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
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import { paymentReceivedApi, type PaymentReceived } from "@/lib/api/payments-received";
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
  return (n || 0).toFixed(2);
}

function fmtDate(d: string) {
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

function customerEmail(c: Invoice["customerId"]) {
  if (typeof c === "string") return "";
  return c?.email || "";
}

function paymentTermsName(pt: Invoice["paymentTermsId"]) {
  if (!pt) return "Due on Receipt";
  if (typeof pt === "string") return "Due on Receipt";
  return pt.name || "Due on Receipt";
}

function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (num === 0) return "Zero";
  const rupees = Math.floor(num);
  if (rupees < 20) return `Indian Rupee ${ones[rupees]} Only`;
  if (rupees < 100) return `Indian Rupee ${tens[Math.floor(rupees / 10)]}${rupees % 10 ? "-" + ones[rupees % 10] : ""} Only`;
  if (rupees < 1000) return `Indian Rupee ${ones[Math.floor(rupees / 100)]} Hundred ${rupees % 100 ? numberToWords(rupees % 100).replace("Indian Rupee ", "").replace(" Only", "") : ""} Only`;
  return `Indian Rupee ${rupees.toLocaleString("en-IN")} Only`;
}

function getDueLabel(invoice: Invoice) {
  if (invoice.status === "Paid" || invoice.status === "Void") return null;
  if (!invoice.dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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

const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Credit Card", "Debit Card", "Cheque", "Online Payment"];

function RecordPaymentModal({ open, onClose, invoice, onRecorded }: RecordPaymentModalProps) {
  const balanceDue = invoice.balanceDue ?? invoice.total;
  const [amount, setAmount] = useState(balanceDue);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState("Bank Transfer");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleRecord() {
    if (amount <= 0) {
      toast.error("Payment amount must be greater than zero");
      return;
    }
    if (amount > balanceDue + 0.01) {
      toast.error(`Amount cannot exceed balance due (₹${balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })})`);
      return;
    }
    setSaving(true);
    try {
      await invoiceApi.recordPayment(invoice._id, {
        amount,
        paymentDate,
        paymentModeId: paymentMode,
        referenceNumber,
        notes,
      });
      toast.success("Payment recorded successfully");
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-center justify-between">
            <span className="text-sm text-amber-800 font-medium">Balance Due</span>
            <span className="text-lg font-bold text-amber-900">₹{balanceDue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Amount *</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-sm">₹</span>
                <Input type="number" step="0.01" className="rounded-l-none" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Payment Date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <select className="w-full h-9 rounded-md border bg-background px-3 text-sm" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                {PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Reference #</Label><Input placeholder="Txn ID / Cheque No." value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]" placeholder="Payment notes..." value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleRecord} disabled={saving} className="bg-blue-600 hover:bg-blue-700">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Record Payment</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Email Modal ───────────────────────────────────────────────────

function SendEmailModal({ open, onClose, invoice, onSent }: { open: boolean, onClose: () => void, invoice: Invoice, onSent: () => void }) {
  const name = customerName(invoice.customerId);
  const email = customerEmail(invoice.customerId);
  const { activeOrganization } = useOrganization();
  const [to, setTo] = useState(email);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Invoice - ${invoice.invoiceNumber} from HAI`);
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const toList = to.split(",").map((e) => e.trim()).filter(Boolean);
    if (toList.length === 0) { toast.error("Please enter at least one recipient email address"); return; }
    setSending(true);
    try {
      await invoiceApi.sendEmail(invoice._id, { to: toList, cc: cc.split(",").map(e => e.trim()).filter(Boolean), subject, body: "", attachInvoicePdf: attachPdf });
      onSent(); onClose(); toast.success("Invoice emailed successfully");
    } catch (e: any) { toast.error(e.message || "Failed to send email"); } finally { setSending(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Email To {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <span className="text-foreground font-medium">{activeOrganization?.name || "Your Organization"}</span>
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">Send To</Label>
            <Input type="email" placeholder="customer@example.com" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">Cc</Label>
            <Input type="email" placeholder="optional@example.com" value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
            <Label className="text-muted-foreground text-sm font-normal">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="border rounded-lg p-6 bg-gray-50 text-sm space-y-4">
             <p>Dear {name},</p>
             <p>Thank you for your business. Your invoice <b>#{invoice.invoiceNumber}</b> for <b>{fmt(invoice.total)}</b> is attached.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={attachPdf} onCheckedChange={(c) => setAttachPdf(c === true)} />Attach Invoice PDF</label>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSend} disabled={sending}>{sending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Send</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail Page ───────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [linkedSalesOrders, setLinkedSalesOrders] = useState<SalesOrder[]>([]);
  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && id) { fetchInvoice(); }
  }, [firebaseUser, loading, id]);

  async function fetchInvoice() {
    setFetching(true);
    try {
      const res = await invoiceApi.getById(id);
      setInvoice(res.data);
      salesOrderApi.list({ limit: 100 }).then(soRes => {
         setLinkedSalesOrders(soRes.data.filter(so => 
           (typeof so.invoiceId === "string" && so.invoiceId === id) || 
           (typeof so.invoiceId === "object" && (so.invoiceId as any)?._id === id)
         ));
      });
      paymentReceivedApi.list({ invoice_id: id }).then(pRes => setPayments(pRes.data));
    } catch { toast.error("Failed to fetch invoice"); } finally { setFetching(false); }
  }

  async function handleAction(action: "send" | "void" | "delete") {
    if (!invoice) return;
    if (action === "delete" && !confirm("Delete this invoice?")) return;
    if (action === "void" && !confirm("Void this invoice?")) return;
    setActionLoading(true);
    try {
      if (action === "send") await invoiceApi.send(invoice._id);
      else if (action === "void") await invoiceApi.voidInvoice(invoice._id);
      else if (action === "delete") { await invoiceApi.remove(invoice._id); router.push("/sales/invoices"); return; }
      fetchInvoice();
    } catch (e: any) { toast.error(e.message || "Action failed"); } finally { setActionLoading(false); }
  }

  async function handleDownloadPdf() {
    if (!invoice) return;
    setPdfLoading(true);
    try {
      const blob = await invoiceApi.downloadPdf(invoice._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `Invoice-${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Failed to download PDF"); } finally { setPdfLoading(false); }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice) return <div className="p-8 text-center">Invoice not found.</div>;

  const cName = customerName(invoice.customerId);
  const dueLabel = getDueLabel(invoice);
  const orgName = activeOrganization?.name || "HAI";
  const journalEntries = invoice.journalEntries || [
    { account: "Accounts Receivable", debit: invoice.total, credit: 0 },
    { account: "Sales", debit: 0, credit: invoice.total },
  ];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button className="hover:underline" onClick={() => router.push("/sales/invoices")}>Invoices</button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">{invoice.invoiceNumber}</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push(`/sales/invoices/${id}/edit`)}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowEmailModal(true)}>
                <Mail className="h-4 w-4 mr-1" /> Send Email
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={pdfLoading}>
                <Download className="h-4 w-4 mr-1" /> PDF
              </Button>
              {invoice.status !== "Paid" && invoice.status !== "Void" && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowRecordPayment(true)}>
                  <PaymentIcon className="h-4 w-4 mr-1" /> Record Payment
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">...</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {invoice.status !== "Void" && <DropdownMenuItem onClick={() => handleAction("void")}>Void</DropdownMenuItem>}
                  <DropdownMenuItem className="text-destructive" onClick={() => handleAction("delete")}>Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-6">
              {/* Main Content Area */}
              <Tabs defaultValue="invoice">
                <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-6">
                   <TabsTrigger value="invoice" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2">
                     <FileText className="h-4 w-4 mr-2" /> Invoice
                   </TabsTrigger>
                   <TabsTrigger value="payments" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2">
                     <PaymentIcon className="h-4 w-4 mr-2" /> Payments ({payments.length})
                   </TabsTrigger>
                   <TabsTrigger value="journal" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2">
                     <History className="h-4 w-4 mr-2" /> Journal
                   </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice" className="mt-6">
                  <div className="bg-white p-8 shadow-sm rounded-lg border">
                    <div className="flex justify-between mb-8">
                       <div>
                          <div className="font-bold text-lg">{orgName}</div>
                          <div className="text-sm text-muted-foreground">{activeOrganization?.address?.city}, {activeOrganization?.address?.state}</div>
                       </div>
                       <div className="text-right">
                          <div className="text-2xl font-serif">INVOICE</div>
                          <div className="text-sm text-muted-foreground mt-1">#{invoice.invoiceNumber}</div>
                       </div>
                    </div>
                    <Separator className="my-6" />
                    <div className="grid grid-cols-2 gap-8 mb-8">
                       <div>
                          <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bill To</div>
                          <div className="font-medium text-blue-600">{cName}</div>
                       </div>
                       <div className="text-right space-y-1">
                          <div className="text-sm"><span className="text-muted-foreground">Date:</span> {fmtDate(invoice.invoiceDate)}</div>
                          <div className="text-sm font-medium"><span className="text-muted-foreground">Due Date:</span> {invoice.dueDate ? fmtDate(invoice.dueDate) : "—"}</div>
                       </div>
                    </div>
                    
                    <Table className="border rounded-md overflow-hidden">
                       <TableHeader className="bg-slate-50">
                          <TableRow>
                             <TableHead>Item</TableHead>
                             <TableHead className="text-right">Qty</TableHead>
                             <TableHead className="text-right">Rate</TableHead>
                             <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                       </TableHeader>
                       <TableBody>
                          {invoice.items.map((item, idx) => (
                             <TableRow key={idx}>
                                <TableCell>
                                   <div className="font-medium">{item.name}</div>
                                   <div className="text-xs text-muted-foreground">{item.description}</div>
                                </TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">{fmt(item.rate)}</TableCell>
                                <TableCell className="text-right">{fmt(item.amount)}</TableCell>
                             </TableRow>
                          ))}
                       </TableBody>
                    </Table>

                    <div className="flex justify-end mt-8">
                       <div className="w-64 space-y-3">
                          <div className="flex justify-between text-sm">
                             <span className="text-muted-foreground">Sub Total</span>
                             <span>{fmt(invoice.subTotal)}</span>
                          </div>
                          {invoice.taxAmount > 0 && (
                            <div className="flex justify-between text-sm">
                               <span className="text-muted-foreground">Tax</span>
                               <span>{fmt(invoice.taxAmount)}</span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between font-bold text-lg">
                             <span>Total</span>
                             <span>{fmt(invoice.total)}</span>
                          </div>
                          <div className="flex justify-between text-sm bg-blue-50 p-2 rounded text-blue-800 font-medium">
                             <span>Balance Due</span>
                             <span>{fmt(invoice.balanceDue ?? invoice.total)}</span>
                          </div>
                       </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="payments" className="mt-6">
                   <div className="bg-white rounded-lg border shadow-sm p-4">
                      {payments.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">No payments recorded for this invoice.</div>
                      ) : (
                        <Table>
                           <TableHeader>
                              <TableRow>
                                 <TableHead>Date</TableHead>
                                 <TableHead>Payment #</TableHead>
                                 <TableHead>Mode</TableHead>
                                 <TableHead className="text-right">Amount</TableHead>
                              </TableRow>
                           </TableHeader>
                           <TableBody>
                              {payments.map(p => (
                                <TableRow key={p._id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/sales/payments-received/${p._id}`)}>
                                   <TableCell>{fmtDate(p.payment_date)}</TableCell>
                                   <TableCell className="font-medium text-blue-600">PR-{p.payment_number}</TableCell>
                                   <TableCell>{p.payment_mode}</TableCell>
                                   <TableCell className="text-right font-medium">{fmt(p.total_amount_received)}</TableCell>
                                </TableRow>
                              ))}
                           </TableBody>
                        </Table>
                      )}
                   </div>
                </TabsContent>

                <TabsContent value="journal" className="mt-6">
                   <div className="bg-white rounded-lg border shadow-sm p-4">
                      <Table>
                         <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
                         <TableBody>
                            {journalEntries.map((j, i) => (
                              <TableRow key={i}>
                                 <TableCell>{j.account}</TableCell>
                                 <TableCell className="text-right">{j.debit > 0 ? fmt(j.debit) : ""}</TableCell>
                                 <TableCell className="text-right">{j.credit > 0 ? fmt(j.credit) : ""}</TableCell>
                              </TableRow>
                            ))}
                         </TableBody>
                      </Table>
                   </div>
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-6">
               <div className="bg-white rounded-lg border shadow-sm p-4 space-y-4">
                  <h3 className="font-semibold text-sm">Status & Details</h3>
                  <div className="space-y-3">
                     <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <Badge className={statusColor[invoice.status]}>{invoice.status}</Badge>
                     </div>
                     {dueLabel && (
                       <div className="bg-red-50 text-red-600 text-[10px] font-bold p-1 rounded text-center">{dueLabel}</div>
                     )}
                     <Separator />
                     <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase">Associated Orders</div>
                        {linkedSalesOrders.length > 0 ? (
                          linkedSalesOrders.map(so => (
                            <div key={so._id} className="text-sm font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => router.push(`/sales/orders/${so._id}`)}>
                               {so.salesOrderNumber}
                            </div>
                          ))
                        ) : <div className="text-sm text-muted-foreground italic">None</div>}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
        
        {showEmailModal && <SendEmailModal open={showEmailModal} onClose={() => setShowEmailModal(false)} invoice={invoice} onSent={fetchInvoice} />}
        {showRecordPayment && <RecordPaymentModal open={showRecordPayment} onClose={() => setShowRecordPayment(false)} invoice={invoice} onRecorded={fetchInvoice} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
