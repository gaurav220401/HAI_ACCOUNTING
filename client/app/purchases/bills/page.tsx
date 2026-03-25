"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2, RefreshCw,
  ChevronDown, Pencil, Printer, CheckCircle,
  Copy, X, Paperclip, MessageSquare, Sparkles,
  FileText, Upload, History, ArrowUpDown, Download,
  Settings, Columns, ChevronRight, CreditCard, PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { billApi, type Bill, type BillStatus } from "@/lib/api/bills";
import { uploadApi } from "@/lib/api/upload";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCur = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColor: Record<BillStatus, string> = {
  Draft: "text-gray-500",
  Open: "text-blue-600",
  Overdue: "text-red-600",
  "Partially Paid": "text-orange-600",
  Paid: "text-green-600",
  Void: "text-slate-500",
};

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function linkifySystemComment(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .replace(
      /Vendor credit\s+(VCR-\d+)/gi,
      '<a href="/purchases/vendor-credits" class="text-blue-600 underline underline-offset-2">Vendor credit $1</a>',
    )
    .replace(
      /Payment\s+(\d+)/gi,
      '<a href="/purchases/payments-made" class="text-blue-600 underline underline-offset-2">Payment $1</a>',
    )
    .replace(
      /bill\s+(BILL-\d+)/gi,
      '<a href="/purchases/bills" class="text-blue-600 underline underline-offset-2">bill $1</a>',
    );
}

async function uploadImage(file: File, folder: string = "general"): Promise<string> {
  try {
    const res = await uploadApi.upload(file, folder);
    return res.url;
  } catch (error) {
    console.error("Image upload failed:", error);
    throw error;
  }
}

// ── Journal builder ─────────────────────────────────────────────────────────
interface JournalLine { account: string; debit: number; credit: number }

function buildJournal(b: Bill): JournalLine[] {
  const vendor = getName(b.vendorId) || "Vendor";
  const lines: JournalLine[] = [];

  // Debit side (Expenses/Items)
  (b.lineItems || []).forEach((li) => {
    if (li.isHeader) return;
    const accName = typeof li.accountId === "object" && li.accountId
      ? (li.accountId as any).name : "Expense Account";
    lines.push({ account: accName, debit: li.amount, credit: 0 });
  });

  // Credit side (Accounts Payable)
  lines.push({ account: `Accounts Payable - ${vendor}`, debit: 0, credit: b.total });

  return lines;
}

// ── Void Dialog ───────────────────────────────────────────────────────────────
function VoidDialog({
  open, onClose, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-medium text-gray-800">Void Transaction</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed italic border-l-4 border-amber-400 pl-4 py-1 bg-amber-50/50">
            Voiding a transaction will reverse all its accounting entries. This action cannot be undone.
          </p>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Reason for voiding*</Label>
            <textarea
              className="w-full h-24 border border-gray-200 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder="e.g. Duplicate entry, incorrect details, order cancelled"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t">
          <Button variant="outline" className="border-gray-200 text-gray-600 px-6 h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white px-6 h-9 font-semibold"
            onClick={() => onConfirm(reason)}
            disabled={!reason.trim()}
          >
            Void Transaction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Expected Payment Date Dialog ──────────────────────────────────────────────
function ExpectedPaymentDialog({
  open, onClose, onSave, initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (date: string, notes: string) => void;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate ? initialDate.split("T")[0] : new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-medium text-gray-800">Expected Payment Date</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm text-gray-500 font-normal">Payment Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border-gray-200 focus:ring-blue-500 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-red-500">Notes*</Label>
            <textarea
              className="w-full h-24 border border-gray-200 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              placeholder=""
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex gap-3">
          <Button className="bg-blue-600 hover:bg-blue-700 text-white px-6 h-9" onClick={() => onSave(date, notes)}>
            Save
          </Button>
          <Button variant="outline" className="border-gray-200 text-gray-600 px-6 h-9" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Record Payment Dialog ───────────────────────────────────────────────────
function RecordPaymentDialog({
  open, onClose, onSave, bill,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  bill: Bill;
}) {
  const [amount, setAmount] = useState(bill.balanceDue || 0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState("Cash");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-medium text-gray-800">Record Payment</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Amount Paid*</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border-gray-200 focus:ring-blue-500 rounded-md"
            />
            <p className="text-[11px] text-muted-foreground italic">Balance Due: ₹{fmtCur(bill.balanceDue || 0)}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Payment Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full border-gray-200 focus:ring-blue-500 rounded-md"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger>
                <SelectValue placeholder="Select Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Check">Bank Check</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t">
          <Button variant="outline" className="border-gray-200 text-gray-600 px-6 h-9" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 h-9 font-semibold"
            onClick={() => onSave({ amount, paymentDate, paymentMode })}
            disabled={amount <= 0 || amount > bill.balanceDue}
          >
            Record Payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bill PDF View ─────────────────────────────────────────────────────────────
function BillPdfView({ bill, orgName, orgAddress, orgPhone, orgEmail }: {
  bill: Bill;
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
}) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const lineItems = (bill.lineItems || []).filter((li) => !li.isHeader);
  const vendorName = getName(bill.vendorId);
  const paymentMadeApplied = (bill.payment_applications || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const vendorCreditApplied = (bill.vendor_credit_applications || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalApplied = Number(bill.amountPaid || paymentMadeApplied + vendorCreditApplied || 0);

  const appliedRows: Array<{
    key: string;
    date: string;
    type: string;
    reference: string;
    amount: number;
  }> = [
    ...(bill.payment_applications || []).map((row) => ({
      key: `pm-${row._id}`,
      date: row.payment?.payment_date || row.applied_date,
      type: "Payment Made",
      reference: row.payment?.payment_number || "-",
      amount: Number(row.amount || 0),
    })),
    ...(bill.vendor_credit_applications || []).map((row) => ({
      key: `vc-${row._id}`,
      date: row.vendor_credit?.vendorCreditDate || row.applied_date,
      type: "Vendor Credit",
      reference: row.vendor_credit?.vendorCreditNumber || "-",
      amount: Number(row.amount || 0),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div
      className="bg-white shadow-xl rounded border mx-auto"
      style={{ width: "680px", minHeight: "880px", fontFamily: "serif", fontSize: "13px", position: "relative" }}
    >
      {/* Status ribbon */}
      {bill.status === "Draft" && (
        <div style={{ position: "absolute", top: 24, left: -18, zIndex: 10, transform: "rotate(-45deg)" }}>
          <div className="bg-gray-600/80 text-white text-xs font-bold px-8 py-1 shadow">Draft</div>
        </div>
      )}
      {bill.status === "Void" && (
        <div style={{ position: "absolute", top: 24, left: -18, zIndex: 10, transform: "rotate(-45deg)" }}>
          <div className="bg-red-600/80 text-white text-xs font-bold px-8 py-1 shadow">Void</div>
        </div>
      )}
      {bill.status === "Paid" && (
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-30deg)",
          zIndex: 5,
          opacity: 0.15,
          pointerEvents: "none",
        }}>
          <div className="border-[12px] border-green-700 text-green-700 text-8xl font-black px-12 py-6 rounded-2xl uppercase tracking-[0.2em]">
            PAID
          </div>
        </div>
      )}

      <div className="p-10 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <div className="font-bold text-base mb-1">{orgName}</div>
            <div className="text-xs text-gray-600 leading-relaxed">
              {orgAddress && <div>{orgAddress}</div>}
              <div>India</div>
              {orgPhone && <div>{orgPhone}</div>}
              {orgEmail && <div className="text-blue-600">{orgEmail}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold tracking-wide text-gray-800 uppercase">Bill</div>
            <div className="text-sm text-gray-600 mt-1"># {bill.billNumber}</div>
          </div>
        </div>

        {/* Vendor + Dates */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Vendor Address</div>
            <div className="text-blue-600 text-sm font-medium">{vendorName}</div>
          </div>
          <div className="space-y-1 text-sm text-right">
            <div className="flex justify-end gap-8">
              <span className="text-gray-500">Date</span>
              <span className="font-medium">{fmtDate(bill.billDate)}</span>
            </div>
            {bill.dueDate && (
              <div className="flex justify-end gap-8">
                <span className="text-gray-500">Due Date</span>
                <span className="font-medium">{fmtDate(bill.dueDate)}</span>
              </div>
            )}
            {bill.referenceNumber && (
              <div className="flex justify-end gap-8">
                <span className="text-gray-500">Reference#</span>
                <span className="font-medium">{bill.referenceNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "#3a3a3a", color: "white" }}>
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium w-8">#</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Item &amp; Description</th>
              <th className="text-right px-3 py-2 text-xs font-medium w-20">Qty</th>
              <th className="text-right px-3 py-2 text-xs font-medium w-24">Rate</th>
              <th className="text-right px-3 py-2 text-xs font-medium w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => {
              const itemName = typeof li.itemId === "object" && li.itemId ? (li.itemId as any).name : li.name;
              return (
                <tr key={idx} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <td className="px-3 py-2.5 text-xs align-top">{idx + 1}</td>
                  <td className="px-3 py-2.5 text-xs align-top">
                    <div className="font-medium text-gray-800">{itemName}</div>
                    {li.description && <div className="text-gray-500 mt-0.5">{li.description}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right align-top">{li.quantity?.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs text-right align-top">{li.rate?.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs text-right align-top">{li.amount?.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-56 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sub Total</span>
              <span>{(bill.subTotal || 0).toFixed(2)}</span>
            </div>
            {(bill.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span>-{(bill.discountAmount || 0).toFixed(2)}</span>
              </div>
            )}
            {(bill.taxAmount || 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{bill.taxType?.toUpperCase() || "TAX"}</span>
                <span>{(bill.taxAmount || 0).toFixed(2)}</span>
              </div>
            )}
            {(bill.adjustmentAmount || 0) !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{bill.adjustmentLabel || "Adjustment"}</span>
                <span>{(bill.adjustmentAmount || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-1.5 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>₹{(bill.total || 0).toFixed(2)}</span>
            </div>
            {paymentMadeApplied > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Payments Made</span>
                <span className="text-red-600">(-) {(paymentMadeApplied || 0).toFixed(2)}</span>
              </div>
            )}
            {vendorCreditApplied > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Vendor Credits</span>
                <span className="text-red-600">(-) {(vendorCreditApplied || 0).toFixed(2)}</span>
              </div>
            )}
            {totalApplied > 0 && paymentMadeApplied === 0 && vendorCreditApplied === 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Payments Applied</span>
                <span className="text-red-600">(-) {(totalApplied || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-600">
              <span>Balance Due</span>
              <span className="font-bold text-gray-900">₹{(bill.balanceDue !== undefined ? bill.balanceDue : bill.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {appliedRows.length > 0 && (
          <div className="mt-7">
            <div className="font-medium mb-2 text-xs text-gray-700 uppercase tracking-wide">Applied Transactions</div>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold">Date</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold">Type</th>
                  <th className="text-left px-3 py-2 text-[11px] font-semibold">Reference</th>
                  <th className="text-right px-3 py-2 text-[11px] font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {appliedRows.map((row) => (
                  <tr key={row.key} style={{ borderBottom: "1px solid #ececec" }}>
                    <td className="px-3 py-2 text-xs">{row.date ? fmtDate(row.date) : "-"}</td>
                    <td className="px-3 py-2 text-xs">{row.type}</td>
                    <td className="px-3 py-2 text-xs">{row.reference}</td>
                    <td className="px-3 py-2 text-xs text-right">₹{row.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes / T&C */}
        {bill.notes && (
          <div className="mt-8 text-xs text-gray-600">
            <div className="font-medium mb-1">Notes</div>
            <div>{bill.notes}</div>
          </div>
        )}
        {bill.termsAndConditions && (
          <div className="mt-6 text-xs text-gray-600">
            <div className="font-medium mb-1">Terms &amp; Conditions</div>
            <div>{bill.termsAndConditions}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bill Detail Panel ─────────────────────────────────────────────────────────
function BillDetailPanel({
  bill, onClose, onStatusChange, onDelete, onEdit, onPrint, onDownloadPdf,
  orgName, orgAddress, orgPhone, orgEmail, orgCurrency, onRecordPayment,
}: {
  bill: Bill;
  onClose: () => void;
  onStatusChange: (id: string, status: BillStatus) => void;
  onDelete: (o: Bill) => void;
  onEdit: (id: string) => void;
  onPrint: (id: string) => void;
  onDownloadPdf: (id: string) => Promise<void>;
  onRecordPayment: (id: string) => void;
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
  orgCurrency: string;
}) {
  const journalRef = useRef<HTMLDivElement>(null);
  const [showPdf, setShowPdf] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showExpectedPaymentDialog, setShowExpectedPaymentDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showRecordPaymentDialog, setShowRecordPaymentDialog] = useState(false);

  // Journal data
  const journalLines = buildJournal(bill);
  const totalD = journalLines.reduce((acc, l) => acc + l.debit, 0);
  const totalC = journalLines.reduce((acc, l) => acc + l.credit, 0);

  // Comments
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<any[]>([]);

  useEffect(() => {
    if (bill.comments) {
      setComments(
        [...bill.comments].reverse().map((c, idx) => ({
          id: `c-${idx}`,
          author: c.author,
          text: c.text,
          time: new Date(c.time).toLocaleString("en-IN", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true,
          }),
          isSystem: c.isSystem,
        }))
      );
    } else {
      setComments([]);
    }
  }, [bill.comments]);

  // Attachments
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState(
    (bill.attachments || []).map((url) => ({
      url,
      publicId: "",
      name: decodeURIComponent(url.split("/").pop() || "File"),
    }))
  );
  const [uploading, setUploading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);

  async function handleMarkAsOpen() {
    setUpdatingStatus(true);
    try {
      await billApi.update(bill._id, { status: "Open" });
      onStatusChange(bill._id, "Open");
      toast.success("Marked as Open");
    } catch { toast.error("Failed to update status"); } finally { setUpdatingStatus(false); }
  }

  async function handleMarkAsVoid() {
    setShowMoreMenu(false);
    setShowVoidDialog(true);
  }

  async function handleConfirmVoid(reason: string) {
    setUpdatingStatus(true);
    try {
      await billApi.void(bill._id, reason);
      onStatusChange(bill._id, "Void");
      toast.success("Bill voided");
      setShowVoidDialog(false);
    } catch { toast.error("Failed to void bill"); } finally { setUpdatingStatus(false); }
  }

  function goToPaymentsMade() {
    onRecordPayment(bill._id);
  }

  async function handleConfirmRecordPayment(data: any) {
    void data;
    setShowRecordPaymentDialog(false);
    goToPaymentsMade();
  }

  async function handleClone() {
    setUpdatingStatus(true);
    try {
      await billApi.clone(bill._id);
      toast.success("Bill cloned successfully");
      window.location.reload();
    } catch { toast.error("Failed to clone"); } finally { setUpdatingStatus(false); }
  }

  async function handleSaveExpectedPaymentDate(date: string, notes: string) {
    setUpdatingStatus(true);
    try {
      await billApi.update(bill._id, { dueDate: date });
      const dateStr = new Date(date).toLocaleDateString("en-GB");
      const commentTxt = `Payment expected on "${dateStr}".\n${notes}`.trim();
      await billApi.addComment(bill._id, commentTxt, true);
      toast.success(`Payment expected on ${dateStr}`);
      setShowExpectedPaymentDialog(false);
    } catch { toast.error("Failed to update"); } finally { setUpdatingStatus(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top action bar */}
      <div className="flex items-center px-2 py-0.5 border-b bg-white shrink-0 flex-wrap min-h-[48px]">
        <div className="flex items-center pr-2">
          <button
            type="button"
            onClick={() => onEdit(bill._id)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center px-2">
          <DropdownMenu open={showPrintMenu} onOpenChange={setShowPrintMenu}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
                <Printer className="h-3.5 w-3.5" /> PDF/Print <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 shadow-xl border-gray-200 mt-1">
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={() => onPrint(bill._id)}>
                <Printer className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={() => onDownloadPdf(bill._id)}>
                <FileText className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center px-2">
          {bill.status === "Draft" ? (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={handleMarkAsOpen}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium hover:bg-muted/30 rounded"
            >
              <CheckCircle className={cn("h-3.5 w-3.5", updatingStatus ? "animate-spin" : "")} />
              Mark as Open
            </button>
          ) : bill.status === "Open" || bill.status === "Overdue" || bill.status === "Partially Paid" ? (
            <button
              type="button"
              onClick={goToPaymentsMade}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-50 transition-colors rounded"
            >
              <CreditCard className="h-3.5 w-3.5" /> Record Payment
            </button>
          ) : (
            <div className={cn("px-3 py-1.5 text-xs font-bold uppercase tracking-wider mx-1 rounded",
              bill.status === "Paid" ? "text-green-600 bg-green-50" : "text-slate-500 bg-slate-50"
            )}>
              {bill.status}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center px-2">
          <DropdownMenu open={showMoreMenu} onOpenChange={setShowMoreMenu}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-600 hover:text-foreground transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 shadow-xl border-gray-200 mt-1">
              {bill.status !== "Void" && (
                <DropdownMenuItem
                  className="text-xs py-2.5 cursor-pointer text-blue-600 font-semibold bg-blue-50/50 hover:bg-blue-50 focus:bg-blue-50 focus:text-blue-600"
                  onClick={handleMarkAsVoid}
                >
                  <X className="h-3.5 w-3.5 mr-2.5" /> Void
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-xs py-2.5 cursor-pointer"
                onClick={() => { setShowMoreMenu(false); setShowExpectedPaymentDialog(true); }}
              >
                <CreditCard className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Expected Payment Date
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleClone}>
                <Copy className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Clone
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs py-2.5 cursor-pointer"
                onClick={() => {
                  setShowMoreMenu(false);
                  journalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <History className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> View Journal
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs py-2.5 cursor-pointer"
                onClick={() => {
                  window.location.href = `/purchases/vendor-credits/new?billId=${bill._id}`;
                }}
              >
                <PackageCheck className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Create Vendor Credits
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs py-2.5 cursor-pointer text-destructive focus:text-destructive"
                onClick={() => { setShowMoreMenu(false); onDelete(bill); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right icons */}
        <div className="ml-auto flex items-center relative gap-1">
          <button
            type="button"
            className={cn("p-2 transition-colors relative hover:text-foreground rounded", showAttachments ? "text-primary bg-muted/30" : "text-muted-foreground")}
            title="Attachments"
            onClick={() => { setShowAttachments((v) => !v); setShowComments(false); }}
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <button
            type="button"
            className={cn("p-2 transition-colors relative hover:text-foreground rounded", showComments ? "text-primary bg-muted/30" : "text-muted-foreground")}
            title="Comments & History"
            onClick={() => { setShowComments((v) => !v); setShowAttachments(false); }}
          >
            <MessageSquare className="h-4 w-4" />
            {comments.length > 0 && (
              <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold">
                {comments.length}
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-border mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-2 transition-colors text-muted-foreground hover:text-foreground rounded"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Attachments Popover */}
          {showAttachments && (
            <div className="absolute top-full right-11 mt-2 w-[340px] bg-white rounded-md shadow-xl border z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
              <div className="absolute -top-2 right-4 w-4 h-4 bg-white border-l border-t transform rotate-45 z-[-1]" />
              <div className="px-4 py-3 border-b flex items-center justify-between bg-white z-10 relative">
                <h3 className="text-sm font-semibold">Attachments</h3>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowAttachments(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[300px] bg-white relative z-10">
                {attachments.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center border-b border-dashed">No Files Attached</p>
                )}
                {attachments.map((a, idx) => {
                  const isImg = ["jpg", "jpeg", "png", "gif", "webp"].some((e) => a.url.toLowerCase().includes(`.${e}`));
                  return (
                    <div key={idx} className="flex items-center gap-2 border rounded-md px-3 py-2 text-xs group">
                      {isImg
                        ? <img src={a.url} className="h-8 w-8 object-cover rounded shrink-0" alt={a.name} />
                        : <span className="text-red-500 text-base shrink-0">📄</span>
                      }
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1">
                        {a.name}
                      </a>
                      {a.publicId && (
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={async () => {
                            try {
                              await uploadApi.remove(a.publicId);
                              setAttachments((prev) => prev.filter((_, i) => i !== idx));
                            } catch { toast.error("Failed to remove file"); }
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="pt-2">
                  <Button
                    variant="outline" size="sm"
                    className="gap-2 text-primary border-primary/20 text-xs w-full py-4 bg-blue-50/30 hover:bg-blue-50/50 border-dashed"
                    disabled={uploading || attachments.length >= 10}
                    onClick={() => attachFileRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading..." : "Upload your Files"} <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <input
                    ref={attachFileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setUploading(true);
                      try {
                        const results = await Promise.all(
                          files.slice(0, 10 - attachments.length).map((f) => uploadApi.upload(f, "bills"))
                        );
                        setAttachments((prev) => [
                          ...prev,
                          ...results.map((r) => ({ url: r.url, publicId: r.publicId, name: decodeURIComponent(r.url.split("/").pop() || "File") })),
                        ]);
                        toast.success("Files uploaded");
                      } catch { toast.error("Upload failed"); } finally { setUploading(false); e.target.value = ""; }
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">You can upload a maximum of 10 files, 10MB each</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comments & History Sheet */}
        <Sheet open={showComments} onOpenChange={setShowComments}>
          <SheetContent side="right" className="p-0 sm:max-w-[400px] flex flex-col gap-0 border-l shadow-xl">
            <SheetHeader className="px-5 py-4 border-b">
              <SheetTitle className="text-base font-semibold">Comments &amp; History</SheetTitle>
            </SheetHeader>
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <RichTextEditor
                  value={commentText}
                  onChange={setCommentText}
                  onImageUpload={(file) => uploadImage(file, "comments")}
                  placeholder="Type your comment here..."
                  minHeight="100px"
                  className="border-none"
                  toolbarClassName="bg-gray-50/80 border-b"
                />
                <div className="px-3 py-2.5 bg-gray-50/50 flex justify-start border-t">
                  <button
                    disabled={!commentText.replace(/<[^>]*>/g, "").trim() || updatingStatus}
                    className="h-8 px-5 py-0 text-xs font-semibold border border-primary/20 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                    onClick={async () => {
                      const txt = commentText.trim();
                      if (!txt || !txt.replace(/<[^>]*>/g, "").trim()) return;
                      setUpdatingStatus(true);
                      try {
                        const res = await billApi.addComment(bill._id, txt);
                        const added = res.data;
                        const newComment = {
                          id: Date.now().toString(),
                          author: added.author || orgEmail || "me",
                          text: added.text || txt,
                          time: new Date(added.time || Date.now()).toLocaleString("en-IN", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit", hour12: true,
                          }),
                          isSystem: !!added.isSystem,
                        };
                        setComments((prev) => [newComment, ...prev]);
                        setCommentText("");
                        toast.success("Comment added");
                      } catch { toast.error("Failed to add comment"); } finally { setUpdatingStatus(false); }
                    }}
                  >
                    Add Comment
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-thin">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">ALL COMMENTS</h4>
                  <span className="bg-primary/10 text-primary rounded-full text-[11px] px-2.5 py-0.5 font-bold">{comments.length}</span>
                </div>

                <div className="space-y-6 relative pb-10">
                  <div className="absolute left-[13px] top-2 bottom-4 w-px bg-border/60" />
                  {comments.map((c, idx) => {
                    const isCreation = c.text.toLowerCase().includes("created") || c.text.toLowerCase().includes("cloned");
                    const isStatus = c.text.toLowerCase().includes("status changed") || c.text.toLowerCase().includes("marked as");

                    let Icon = MessageSquare;
                    let iconBg = "bg-blue-50 text-blue-600 border-blue-200";
                    if (c.isSystem) {
                      if (isCreation) { Icon = FileText; iconBg = "bg-amber-50 text-amber-600 border-amber-200"; }
                      else if (isStatus) { Icon = CheckCircle; iconBg = "bg-green-50 text-green-600 border-green-200"; }
                      else { Icon = History; iconBg = "bg-amber-50 text-amber-600 border-amber-200"; }
                    }

                    return (
                      <div key={c.id} className="relative pl-10 group">
                        <div className="absolute left-0 top-0.5 z-10">
                          <div className={cn("h-7 w-7 rounded flex items-center justify-center border transition-transform group-hover:scale-110 shadow-sm", iconBg)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 pb-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800">{c.author.split("@")[0]}</span>
                            <span className="text-[11px] text-muted-foreground font-medium">• {c.time}</span>
                          </div>
                          <div className={cn("text-[13px] leading-relaxed p-3.5 rounded-lg border relative group/msg shadow-sm whitespace-pre-wrap",
                            c.isSystem ? "bg-gray-50/50 border-gray-100 text-gray-600 italic" : "bg-white border-gray-100 text-gray-800"
                          )}>
                            <div
                              dangerouslySetInnerHTML={{ __html: c.isSystem ? linkifySystemComment(c.text) : c.text }}
                              className="rich-text-content"
                            />
                            {!c.isSystem && (
                              <button
                                className="absolute right-3 top-3 opacity-0 group-hover/msg:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                onClick={() => { setComments((prev) => prev.filter((p) => p.id !== c.id)); toast.success("Comment removed"); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {comments.length === 0 && (
                    <div className="text-center py-10">
                      <MessageSquare className="h-8 w-8 text-border mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">No comments yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* What's next banners */}
      {bill.status === "Draft" && (
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">WHAT&apos;S NEXT?</strong> Mark this bill as open to start tracking payments.
          </span>
          <Button size="sm" variant="outline" className="shrink-0 ml-auto" onClick={handleMarkAsOpen} disabled={updatingStatus}>
            Mark as Open
          </Button>
        </div>
      )}
      {(bill.status === "Open" || bill.status === "Overdue" || bill.status === "Partially Paid") && (
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
          <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">WHAT&apos;S NEXT?</strong> Record a payment for this bill.
          </span>
          <Button size="sm" className="ml-auto shrink-0 bg-blue-600 hover:bg-blue-700" onClick={goToPaymentsMade}>
            Record Payment
          </Button>
        </div>
      )}

      {/* Expected Payment Dialog */}
      <ExpectedPaymentDialog
        open={showExpectedPaymentDialog}
        onClose={() => setShowExpectedPaymentDialog(false)}
        onSave={handleSaveExpectedPaymentDate}
        initialDate={bill.dueDate || ""}
      />

      {/* Void Dialog */}
      <VoidDialog
        open={showVoidDialog}
        onClose={() => setShowVoidDialog(false)}
        onConfirm={handleConfirmVoid}
      />

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        open={showRecordPaymentDialog}
        onClose={() => setShowRecordPaymentDialog(false)}
        onSave={handleConfirmRecordPayment}
        bill={bill}
      />

      {/* PDF toggle + content */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2">
              <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                bill.status === "Paid" ? "bg-green-100 text-green-700" :
                  bill.status === "Void" ? "bg-slate-100 text-slate-600" :
                    "bg-blue-100 text-blue-700"
              )}>
                {bill.status}
              </div>
              <span className="text-xs text-muted-foreground italic truncate max-w-[200px]" title={bill.notes}>
                {bill.notes}
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground mr-2">Show PDF View</span>
              <button
                type="button"
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  showPdf ? "bg-primary" : "bg-muted-foreground/30"
                )}
                onClick={() => setShowPdf((v) => !v)}
              >
                <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", showPdf ? "translate-x-6" : "translate-x-1")} />
              </button>
            </div>
          </div>

          <div className="px-6 pb-8">
            {showPdf ? (
              <div className="flex justify-center w-full" id="bill-pdf-view">
                <BillPdfView bill={bill} orgName={orgName} orgAddress={orgAddress} orgPhone={orgPhone} orgEmail={orgEmail} />
              </div>
            ) : (
              <div className="max-w-[700px] mx-auto space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-gray-50/50 border-b px-6 py-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">Bill Details</h3>
                    <div className="text-xs text-gray-500">#{bill.billNumber}</div>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-2 gap-y-6 gap-x-12 mt-1">
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Vendor</Label>
                        <div className="text-sm font-semibold text-blue-600 hover:underline cursor-pointer flex items-center gap-1.5">
                          {getName(bill.vendorId)}
                          <ChevronRight className="h-3 w-3" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Bill Date</Label>
                        <div className="text-sm font-medium">{new Date(bill.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Total Amount</Label>
                        <div className="text-xl font-black text-gray-900">₹{fmtCur(bill.total || 0)}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Balance Due</Label>
                        <div className="text-xl font-black text-red-600">₹{fmtCur(bill.balanceDue ?? bill.total ?? 0)}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Due Date</Label>
                        <div className="text-sm font-medium">{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "No due date set"}</div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">Status</Label>
                        <div className={cn("text-xs font-bold uppercase flex items-center gap-1.5", statusColor[bill.status])}>
                          <div className={cn("w-2 h-2 rounded-full", bill.status === "Paid" ? "bg-green-600" : bill.status === "Void" ? "bg-gray-400" : "bg-blue-600")} />
                          {bill.status}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {(bill.lineItems || []).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-gray-50/50 border-b px-6 py-3">
                      <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Line Items</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/30 border-b text-[10px] text-gray-400 uppercase font-black tracking-tighter">
                          <th className="text-left px-6 py-2.5">Item</th>
                          <th className="text-right px-6 py-2.5">Qty</th>
                          <th className="text-right px-6 py-2.5">Rate</th>
                          <th className="text-right px-6 py-2.5">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bill.lineItems || []).map((li, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-3.5">
                              <div className="font-semibold text-gray-800">{typeof li.itemId === "object" && li.itemId ? (li.itemId as any).name : li.name}</div>
                              {li.description && <div className="text-xs text-gray-400 mt-0.5 leading-tight">{li.description}</div>}
                            </td>
                            <td className="px-6 py-3.5 text-right font-medium tabular-nums">{li.quantity.toFixed(2)}</td>
                            <td className="px-6 py-3.5 text-right font-medium tabular-nums">₹{fmtCur(li.rate)}</td>
                            <td className="px-6 py-3.5 text-right font-bold tabular-nums">₹{fmtCur(li.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div ref={journalRef} className="max-w-[900px] mx-auto mt-10">
              <div className="text-sm font-semibold text-gray-800 border-b pb-2">Journal</div>
              <div className="text-[11px] text-muted-foreground mt-2">
                Amount is displayed in your base currency{" "}
                <span className="ml-1 inline-flex items-center rounded-sm bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {orgCurrency}
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold text-gray-800">Bill</div>
              <div className="mt-2 overflow-x-auto bg-white rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[11px] text-gray-500">
                      <th className="text-left px-4 py-2.5 font-semibold">ACCOUNT</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-32">DEBIT</th>
                      <th className="text-right px-4 py-2.5 font-semibold w-32">CREDIT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalLines.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-2.5 text-gray-800">{l.account}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{l.debit > 0 ? fmtCur(l.debit) : "0.00"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{l.credit > 0 ? fmtCur(l.credit) : "0.00"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="px-4 py-2.5 text-right text-gray-800">&nbsp;</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCur(totalD)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCur(totalC)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground pb-6 mt-4">
            PDF Template : &apos;Standard Template&apos; <button type="button" className="text-primary hover:underline ml-1">Change</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function BillsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [bills, setBills] = useState<Bill[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchingSelected, setFetchingSelected] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | BillStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBillDetails, setSelectedBillDetails] = useState<Bill | null>(null);
  const [toDelete, setToDelete] = useState<Bill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilterDD, setShowFilterDD] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchBills = useCallback(async () => {
    setFetching(true);
    try {
      const res = await billApi.list({ page: 1, limit: 100 });
      setBills(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchBills();
  }, [firebaseUser, loading, activeOrganization?._id, fetchBills]);

  useEffect(() => {
    const paramId = searchParams.get("billId");
    if (paramId) setSelectedId(paramId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId || !firebaseUser || !activeOrganization?._id) {
      setSelectedBillDetails(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setFetchingSelected(true);
      try {
        const res = await billApi.getOne(selectedId);
        if (cancelled) return;
        setSelectedBillDetails(res.data || null);
      } catch {
        if (cancelled) return;
        setSelectedBillDetails(null);
      } finally {
        if (!cancelled) setFetchingSelected(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, firebaseUser, activeOrganization?._id]);

  const filtered = bills.filter((b) => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [(b.billNumber || ""), (b.referenceNumber || ""), getName(b.vendorId)].some((v) => v.toLowerCase().includes(s));
  });

  const selectedBillFromList = bills.find((b) => b._id === selectedId) ?? null;
  const selectedBill = selectedBillDetails && selectedBillDetails._id === selectedId
    ? selectedBillDetails
    : selectedBillFromList;

  const org = activeOrganization as any;
  const orgName = org?.name || "";
  const orgAddress = org?.address?.city || org?.billingAddress?.city || "";
  const orgPhone = org?.phone || "";
  const orgEmail = (firebaseUser as any)?.email || "";
  const orgCurrency = org?.baseCurrency || "INR";

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await billApi.remove(toDelete._id);
      toast.success("Bill deleted");
      setBills((prev) => prev.filter((b) => b._id !== toDelete._id));
      if (selectedId === toDelete._id) setSelectedId(null);
    } catch { toast.error("Failed to delete"); } finally { setDeleting(false); setToDelete(null); }
  }

  function handleStatusChange(id: string, status: BillStatus) {
    setBills((prev) => prev.map((b) => b._id === id ? { ...b, status } : b));
  }

  function handlePrint(id: string) {
    const printContents = document.getElementById("bill-pdf-view")?.innerHTML;
    if (!printContents) { toast.error("Please show the PDF View before printing."); return; }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bill - ${selectedBill?.billNumber || id}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page { size: A4; margin: 0; }
              body { margin: 0; padding: 40px; box-sizing: border-box; background: white !important; }
              #print-root { width: 100%; max-width: 800px; margin: 0 auto; }
              table { width: 100%; border-collapse: collapse; }
              @media print { body { padding: 40px; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
            </style>
          </head>
          <body>
            <div id="print-root">${printContents}</div>
            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 800); };</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  async function handleDownloadPdf(id: string) {
    toast.info("PDF download coming soon");
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={(
              <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-base font-semibold hover:text-primary">
                    {filterStatus ? `${filterStatus} Bills` : "All Bills"} <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => { setFilterStatus(""); setShowFilterDD(false); }}>All Bills</DropdownMenuItem>
                  {(["Draft", "Open", "Overdue", "Partially Paid", "Paid", "Void"] as BillStatus[]).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => { setFilterStatus(s); setShowFilterDD(false); }}>{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            actions={(
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-8 gap-1 text-sm bg-blue-600 hover:bg-blue-700"
                  onClick={() => router.push("/purchases/bills/new")}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] p-0 overflow-hidden">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-blue-600 hover:text-white group">
                        <ArrowUpDown className="h-4 w-4 text-blue-600 group-hover:text-white" />
                        <span className="flex-1">Sort by</span>
                        <ChevronRight className="h-4 w-4" />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-[180px] p-0">
                        <DropdownMenuItem className="px-3 py-2 text-[13px] bg-blue-600 text-white flex justify-between">
                          Created Time <ChevronDown className="h-4 w-4 rotate-180" />
                        </DropdownMenuItem>
                        {["Date", "Bill#", "Vendor Name", "Amount", "Due Date", "Last Modified Time"].map((s) => (
                          <DropdownMenuItem key={s} className="px-3 py-2 text-[13px] hover:bg-gray-100">{s}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator className="m-0" />

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Download className="h-4 w-4 text-blue-600" />
                      <span>Import Bills</span>
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                        <Upload className="h-4 w-4 text-blue-600" />
                        <span className="flex-1">Export</span>
                        <ChevronRight className="h-4 w-4" />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-[180px]">
                        <DropdownMenuItem className="px-3 py-2 text-[13px]">Export as CSV</DropdownMenuItem>
                        <DropdownMenuItem className="px-3 py-2 text-[13px]">Export as PDF</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator className="m-0" />

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Settings className="h-4 w-4 text-blue-600" />
                      <span>Preferences</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Columns className="h-4 w-4 text-blue-600" />
                      <span>Manage Custom Fields</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="m-0" />

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50" onClick={fetchBills}>
                      <RefreshCw className="h-4 w-4 text-blue-600" />
                      <span>Refresh List</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left list panel */}
            <div className={cn(
              "flex flex-col border-r bg-white overflow-hidden transition-all duration-200",
              selectedBill ? "w-[320px] shrink-0" : "flex-1"
            )}>
              {/* List header / search */}
              <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                {!selectedBill && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1">
                    <input type="checkbox" className="rounded border" />
                    <span className="ml-1 font-medium uppercase tracking-wide">DATE</span>
                    <span className="ml-auto font-medium uppercase tracking-wide">BILL#</span>
                  </div>
                )}
                {!selectedBill && (
                  <div className="flex items-center gap-1 ml-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="h-7 pl-7 text-xs w-40" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                  </div>
                )}
                {selectedBill && (
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-7 pl-7 text-xs w-full" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Full-width table header (only when no detail panel open) */}
              {!selectedBill && (
                <div
                  className="grid text-[11px] uppercase tracking-wide text-muted-foreground font-medium border-b bg-muted/10 shrink-0"
                  style={{ gridTemplateColumns: "36px 90px 150px 130px 1fr 120px 100px 110px 36px" }}
                >
                  <div className="px-3 py-2 flex items-center"><input type="checkbox" className="rounded border" /></div>
                  <div className="px-2 py-2">Date</div>
                  <div className="px-2 py-2">Bill#</div>
                  <div className="px-2 py-2">Reference#</div>
                  <div className="px-2 py-2">Vendor Name</div>
                  <div className="px-2 py-2">Status</div>
                  <div className="px-2 py-2 text-right">Amount</div>
                  <div className="px-2 py-2 text-right">Balance Due</div>
                  <div className="px-2 py-2" />
                </div>
              )}

              {/* List content */}
              <div className="flex-1 overflow-y-auto">
                {fetching ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 && !search && !filterStatus ? (
                  <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                    <h2 className="text-xl font-semibold mb-2">Start Managing Your Bills!</h2>
                    <p className="text-muted-foreground text-sm mb-6">Record bills from vendors and track payments easily.</p>
                    <Button className="px-6 py-2 text-sm font-semibold uppercase tracking-wide bg-blue-600 hover:bg-blue-700" onClick={() => router.push("/purchases/bills/new")}>
                      Create New Bill
                    </Button>
                    <div className="mt-10 w-full max-w-2xl">
                      <p className="text-sm font-medium text-muted-foreground mb-5">Life cycle of a Bill</p>
                      <div className="flex items-center justify-center flex-wrap gap-0">
                        {[
                          { icon: "🧾", label: "CREATE BILL" },
                          { label: "MARK AS OPEN", dash: true },
                          { icon: "💳", label: "RECORD PAYMENT" },
                          { label: "MARK AS PAID", dash: true },
                          { icon: "✅", label: "BILL CLOSED" },
                        ].map((step, i) =>
                          step.dash ? (
                            <div key={i} className="flex items-center">
                              <div className="w-6 border-t border-dashed border-gray-400" />
                              <div className="bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-500 max-w-[80px] text-center leading-tight">{step.label}</div>
                              <div className="w-6 border-t border-dashed border-gray-400" />
                            </div>
                          ) : (
                            <div key={i} className="flex flex-col items-center bg-white border border-gray-300 rounded-md px-3 py-2.5 text-xs font-medium text-gray-600 min-w-[100px]">
                              <span className="text-lg mb-1">{step.icon}</span>
                              <span className="text-center leading-tight">{step.label}</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm">No bills match your filter.</p>
                  </div>
                ) : selectedBill ? (
                  /* Compact list when detail panel is open */
                  <div className="divide-y">
                    {filtered.map((b) => (
                      <button
                        key={b._id}
                        type="button"
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors",
                          selectedId === b._id && "bg-blue-50 border-l-2 border-l-primary"
                        )}
                        onClick={() => setSelectedId(b._id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-foreground truncate">{getName(b.vendorId) || "—"}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {b.billNumber} • {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            </div>
                            <div className={cn("text-xs font-medium mt-0.5 uppercase tracking-wide", statusColor[b.status])}>{b.status}</div>
                          </div>
                          <div className="text-sm font-semibold shrink-0">₹{fmtCur(b.total)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Full-width table rows */
                  <div>
                    {filtered.map((b) => (
                      <div
                        key={b._id}
                        className="grid items-center border-b hover:bg-muted/20 cursor-pointer transition-colors text-sm group"
                        style={{ gridTemplateColumns: "36px 90px 150px 130px 1fr 120px 100px 110px 36px" }}
                        onClick={() => setSelectedId(b._id)}
                      >
                        <div className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded border" />
                        </div>
                        <div className="px-2 py-2.5 text-muted-foreground text-xs">
                          {new Date(b.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </div>
                        <div className="px-2 py-2.5 text-primary font-medium">{b.billNumber}</div>
                        <div className="px-2 py-2.5 text-muted-foreground">{b.referenceNumber || ""}</div>
                        <div className="px-2 py-2.5">{getName(b.vendorId)}</div>
                        <div className={cn("px-2 py-2.5 text-xs font-medium uppercase tracking-wide", statusColor[b.status])}>{b.status}</div>
                        <div className="px-2 py-2.5 text-right font-medium">₹{fmtCur(b.total)}</div>
                        <div className="px-2 py-2.5 text-right text-muted-foreground">₹{fmtCur(b.balanceDue ?? b.total ?? 0)}</div>
                        <div className="px-2 py-2.5 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/purchases/bills/${b._id}/edit`)}>Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setToDelete(b)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right detail panel */}
            {selectedBill && (
              <div className="flex-1 overflow-hidden">
                {fetchingSelected && !selectedBillDetails ? (
                  <div className="h-full flex items-center justify-center bg-white">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <BillDetailPanel
                    bill={selectedBill}
                    onClose={() => setSelectedId(null)}
                    onStatusChange={handleStatusChange}
                    onDelete={(o) => { setToDelete(o); setSelectedId(null); }}
                    onEdit={(id) => router.push(`/purchases/bills/${id}/edit`)}
                    onPrint={handlePrint}
                    onDownloadPdf={handleDownloadPdf}
                    onRecordPayment={(id) => router.push(`/purchases/payments-made/new?billId=${id}`)}
                    orgName={orgName}
                    orgAddress={orgAddress}
                    orgPhone={orgPhone}
                    orgEmail={orgEmail}
                    orgCurrency={orgCurrency}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation */}
        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
              <AlertDialogDescription>
                {toDelete?.billNumber} will be permanently deleted. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function BillsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading bills...</div>}>
      <BillsPageContent />
    </Suspense>
  );
}
