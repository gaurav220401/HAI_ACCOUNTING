"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2, RefreshCw,
  ShoppingBag, ChevronDown, Pencil, Mail, Printer, CheckCircle,
  Copy, X, Paperclip, MessageSquare, ChevronRight, Sparkles,
  FileText, PackageCheck, Upload
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { purchaseOrderApi, type PurchaseOrder, type PurchaseOrderStatus } from "@/lib/api/purchase-orders";
import { uploadApi } from "@/lib/api/upload";
import { cn } from "@/lib/utils";

const fmtCur = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColor: Record<PurchaseOrderStatus, string> = {
  Draft:  "text-gray-500",
  Open:   "text-blue-600",
  Billed: "text-green-600",
  Closed: "text-slate-500",
};

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

// â”€â”€ Send Email Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SendEmailDialog({
  open, onClose, order, orgName, orgEmail,
}: {
  open: boolean;
  onClose: () => void;
  order: PurchaseOrder | null;
  orgName: string;
  orgEmail: string;
}) {
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const vendorName = order ? getName(order.vendorId) : "";
  const vendorEmail = (order?.vendorId as any)?.email || "";
  const subject = order
    ? `Purchase Order from ${orgName} (Purchase Order #: ${order.purchaseOrderNumber})`
    : "";
  const dateStr = order
    ? new Date(order.purchaseOrderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const amountStr = order ? `₹${fmtCur(order.total)}(in INR)` : "";

  async function handleSend() {
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success("Email sent successfully");
    setSending(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold">Email To {vendorName}.</h2>
        </div>
        <div className="divide-y">
          {/* From */}
          <div className="flex items-center gap-4 px-6 py-2.5">
            <span className="text-sm text-muted-foreground w-16 shrink-0">From <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[9px] text-muted-foreground ml-0.5">?</span></span>
            <span className="text-sm">{orgEmail}</span>
          </div>
          {/* Send To */}
          <div className="flex items-center gap-4 px-6 py-2.5">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Send To</span>
            <div className="flex items-center flex-wrap gap-1.5 flex-1">
              <span className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">{vendorName.slice(0, 1)}</span>
                {vendorName} {vendorEmail && <span className="text-muted-foreground">&lt;{vendorEmail}&gt;</span>}
                <button type="button" className="ml-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
              <span className="text-xs text-primary cursor-pointer ml-auto">Cc &nbsp; Bcc</span>
            </div>
          </div>
          {/* Subject */}
          <div className="flex items-center gap-4 px-6 py-2.5">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Subject</span>
            <span className="text-sm text-primary">{subject}</span>
          </div>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 text-xs text-muted-foreground border-b">
            {["B","I","U","S"].map((t) => (
              <button key={t} type="button"
                className={cn("font-medium hover:text-foreground w-5 text-center", t === "B" && "font-bold", t === "I" && "italic", t === "U" && "underline", t === "S" && "line-through")}
                onClick={(e) => {
                  e.preventDefault();
                  const cmd = t === "B" ? "bold" : t === "I" ? "italic" : t === "U" ? "underline" : "strikeThrough";
                  document.execCommand(cmd, false, undefined);
                }}
              >
                {t}
              </button>
            ))}
            <Separator orientation="vertical" className="h-4 mx-1" />
            <span>16px</span>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <span>Arial</span>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <button type="button" className="hover:text-foreground">≡</button>
            <button type="button" className="hover:text-foreground">≡</button>
            <Separator orientation="vertical" className="h-4 mx-1" />
            <button type="button" className="hover:text-foreground">⊞</button>
            <button type="button" className="hover:text-foreground">🔗</button>
            <div className="ml-auto flex gap-1">
              <button type="button" className="hover:text-foreground">▲</button>
              <button type="button" className="hover:text-foreground">▼</button>
            </div>
          </div>
          {/* Body */}
          <div className="px-6 py-4 min-h-[280px] text-sm leading-relaxed font-serif select-text focus:outline-none" contentEditable suppressContentEditableWarning>
            <p className="mb-3">&nbsp;</p>
            <p className="mb-2">Dear {vendorName},</p>
            <p className="mb-2">The purchase order ({order?.purchaseOrderNumber}) is attached with this email.</p>
            <p className="mb-4">An overview of the purchase order is available below:</p>
            <p className="mb-4 text-muted-foreground">{"â”€".repeat(80)}</p>
            <p className="text-2xl font-bold mb-4">Purchase Order # : {order?.purchaseOrderNumber}</p>
            <div className="mb-1 text-muted-foreground">{"â”€".repeat(80)}</div>
            <table className="text-sm mb-1">
              <tbody>
                <tr>
                  <td className="font-semibold pr-4 py-0.5">Order Date</td>
                  <td className="py-0.5">: {dateStr}</td>
                </tr>
                <tr>
                  <td className="font-semibold pr-4 py-0.5">Amount</td>
                  <td className="py-0.5">: {amountStr}</td>
                </tr>
              </tbody>
            </table>
            <p className="mb-4 text-muted-foreground">{"â”€".repeat(80)}</p>
            <p className="mb-4">Please go through it and confirm the order. We look forward to working with you again</p>
            <p className="mb-1">Regards,</p>
            <p className="mb-0">{orgEmail.split("@")[0]}</p>
            <p>{orgName}</p>
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center gap-4 bg-muted/20">
          <Checkbox id="attachPdf" checked={attachPdf} onCheckedChange={(c) => setAttachPdf(!!c)} />
          <Label htmlFor="attachPdf" className="text-sm cursor-pointer">Attach Purchase Order PDF</Label>
          {attachPdf && order && (
            <div className="flex items-center gap-2 bg-white border rounded px-3 py-1 ml-4">
              <span className="text-red-500 text-xs">▶</span>
              <span className="text-sm text-muted-foreground">{order.purchaseOrderNumber}</span>
            </div>
          )}
        </div>
        <div className="px-6 pb-3 border-t bg-muted/20">
          <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1 pt-2">
            <Paperclip className="h-3.5 w-3.5" /> Attachments
          </button>
        </div>
        <div className="px-6 py-3 border-t flex gap-2">
          <Button size="sm" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Send
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// â”€â”€ PDF View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function POPdfView({ order, orgName, orgAddress, orgPhone, orgEmail }: {
  order: PurchaseOrder;
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
}) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const lineItems = order.lineItems.filter((li) => !li.isHeader);
  const vendorName = getName(order.vendorId);

  return (
    <div className="bg-white shadow-xl rounded border mx-auto" style={{ width: "680px", minHeight: "880px", fontFamily: "serif", fontSize: "13px", position: "relative" }}>
      {/* Draft watermark ribbon */}
      {order.status === "Draft" && (
        <div style={{ position: "absolute", top: 24, left: -18, zIndex: 10, transform: "rotate(-45deg)" }}>
          <div className="bg-gray-600/80 text-white text-xs font-bold px-8 py-1 shadow">Draft</div>
        </div>
      )}
      <div className="p-10 overflow-hidden">
        <div className="flex justify-between items-start mb-8">
          {/* Org info */}
          <div>
            <div className="font-bold text-base mb-1">{orgName}</div>
            <div className="text-xs text-gray-600 leading-relaxed">
              {orgAddress && <div>{orgAddress}</div>}
              <div>India</div>
              {orgPhone && <div>{orgPhone}</div>}
              {orgEmail && <div className="text-blue-600">{orgEmail}</div>}
            </div>
          </div>
          {/* Title */}
          <div className="text-right">
            <div className="text-3xl font-bold tracking-wide text-gray-800 uppercase">Purchase Order</div>
            <div className="text-sm text-gray-600 mt-1"># {order.purchaseOrderNumber}</div>
          </div>
        </div>

        {/* Addresses + Date */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Vendor Address</div>
            <div className="text-blue-600 text-sm font-medium">{vendorName}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Deliver To</div>
            <div className="text-xs text-gray-700 leading-relaxed">
              <div>{orgName}</div>
              {orgAddress && <div>{orgAddress}</div>}
              <div>India</div>
              {orgPhone && <div>{orgPhone}</div>}
              {orgEmail && <div className="text-blue-600">{orgEmail}</div>}
            </div>
          </div>
        </div>
        <div className="flex justify-end mb-6">
          <span className="text-sm text-gray-600">Date : &nbsp;{fmtDate(order.purchaseOrderDate)}</span>
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
                  <td className="px-3 py-2.5 text-xs text-right align-top">
                    <div>{li.quantity.toFixed(2)}</div>
                    {(li as any).unit && <div className="text-gray-500">{(li as any).unit}</div>}
                    {/* try to get unit from itemId object */}
                    {typeof li.itemId === "object" && li.itemId && (li.itemId as any).unit && !((li as any).unit) && (
                      <div className="text-gray-500">{typeof (li.itemId as any).unit === "object" ? (li.itemId as any).unit.abbreviation : (li.itemId as any).unit}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-right align-top">{li.rate.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-xs text-right align-top">{li.amount.toFixed(2)}</td>
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
              <span>{order.subTotal.toFixed(2)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Discount</span>
                <span>-{order.discountAmount.toFixed(2)}</span>
              </div>
            )}
            {order.taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{order.taxType.toUpperCase()} Tax</span>
                <span>-{order.taxAmount.toFixed(2)}</span>
              </div>
            )}
            {order.adjustmentAmount !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{order.adjustmentLabel || "Adjustment"}</span>
                <span>{order.adjustmentAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-1.5 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>₹{order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="mt-8 text-xs text-gray-600">
            <div className="font-medium mb-1">Notes</div>
            <div>{order.notes}</div>
          </div>
        )}

        {/* Authorized signature */}
        <div className="mt-12 text-xs text-gray-600">
          Authorized Signature ____________________________
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Detail Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function OrderDetailPanel({
  order, onClose, onStatusChange, onDelete, onEdit, onSendEmail, onPrint, onDownloadPdf, orgName, orgAddress, orgPhone, orgEmail, orgCurrency,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onStatusChange: (id: string, status: PurchaseOrderStatus) => void;
  onDelete: (o: PurchaseOrder) => void;
  onEdit: (id: string) => void;
  onSendEmail: (id: string) => void;
  onPrint: (id: string) => void;
  onDownloadPdf: (id: string) => Promise<void>;
  orgName: string;
  orgAddress: string;
  orgPhone: string;
  orgEmail: string;
  orgCurrency: string;
}) {
  const [showPdf, setShowPdf] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Comments & History
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState([
    {
      id: "system-1",
      author: orgEmail || "user",
      text: `Purchase Order created for \u20b9${fmtCur(order.total)}`,
      time: new Date(order.createdAt).toLocaleString("en-IN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      }),
      isSystem: true,
    },
  ]);

  // Attachments
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<{ url: string; publicId: string; name: string }[]>(
    (order.attachments || []).map((url) => ({
      url,
      publicId: "",
      name: decodeURIComponent(url.split("/").pop() || "File"),
    }))
  );
  const [uploading, setUploading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);

  async function handleMarkAsIssued() {
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.update(order._id, { status: "Open" });
      onStatusChange(order._id, "Open");
      toast.success("Marked as Issued");
    } catch { toast.error("Failed to update status"); } finally { setUpdatingStatus(false); }
  }

  async function handleConvertToBill() {
    toast.info("Convert to Bill coming soon");
  }

  async function handleClone() {
    toast.info("Clone coming soon");
  }

  async function handleMarkReceived() {
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.update(order._id, { status: "Closed" });
      onStatusChange(order._id, "Closed");
      toast.success("Marked as Received");
    } catch { toast.error("Failed"); } finally { setUpdatingStatus(false); }
  }

  const isOpen = order.status === "Open";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top action bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-white shrink-0 flex-wrap">
        <button type="button" onClick={() => onEdit(order._id)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded hover:bg-muted/30 transition-colors">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button type="button" onClick={() => onSendEmail(order._id)} className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded hover:bg-muted/30 transition-colors">
          <Mail className="h-3.5 w-3.5" /> Send Email
        </button>
        {/* PDF/Print dropdown */}
        <DropdownMenu open={showPrintMenu} onOpenChange={setShowPrintMenu}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded hover:bg-muted/30 transition-colors">
              <Printer className="h-3.5 w-3.5" /> PDF/Print <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => onPrint(order._id)}>
              <Printer className="h-3.5 w-3.5 mr-2" /> Print
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownloadPdf(order._id)}>
              <FileText className="h-3.5 w-3.5 mr-2" /> Download PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Mark as Issued */}
        {order.status === "Draft" && (
          <button
            type="button"
            disabled={updatingStatus}
            onClick={handleMarkAsIssued}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded hover:bg-muted/30 transition-colors"
          >
            {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Mark as Issued
          </button>
        )}
        {/* More actions */}
        <DropdownMenu open={showMoreMenu} onOpenChange={setShowMoreMenu}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm px-2.5 py-1.5 border rounded hover:bg-muted/30">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {order.status === "Draft" && (
              <DropdownMenuItem className="font-medium bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground" onClick={handleMarkAsIssued}>
                Mark as Issued
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleConvertToBill}>Convert to Bill</DropdownMenuItem>
            <DropdownMenuItem onClick={handleClone}>Clone</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(order)}>
              Delete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleMarkReceived}>Mark as Received</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Right side icons - EXACT design matching */}
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
          
          <button type="button" onClick={onClose} className="p-2 transition-colors text-muted-foreground hover:text-foreground rounded" title="Close">
            <X className="h-5 w-5" />
          </button>

          {/* ── Attachments Popover panel ─────────────────────────────── */}
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
                      <a href={a.url} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline truncate flex-1">
                        {a.name}
                      </a>
                      {a.publicId && (
                        <button type="button"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={async () => {
                            try {
                              await uploadApi.remove(a.publicId);
                              setAttachments((prev) => prev.filter((_, i) => i !== idx));
                            } catch { toast.error("Failed to remove file"); }
                          }}>
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
                    {uploading ? "Uploading…" : "Upload your Files"} <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <input ref={attachFileRef} type="file" multiple className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setUploading(true);
                      try {
                        const results = await Promise.all(files.slice(0, 10 - attachments.length).map((f) => uploadApi.upload(f, "purchase-orders")));
                        setAttachments((prev) => [...prev, ...results.map((r) => ({ url: r.url, publicId: r.publicId, name: decodeURIComponent(r.url.split("/").pop() || "File") }))]);
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

        {/* ── Comments & History Sheet Panel ────────────────────────── */}
        <Sheet open={showComments} onOpenChange={setShowComments}>
          <SheetContent side="right" className="p-0 sm:max-w-[400px] flex flex-col gap-0 border-l shadow-xl">
            <SheetHeader className="px-5 py-4 border-b">
              <SheetTitle className="text-base font-semibold">Comments & History</SheetTitle>
            </SheetHeader>
            
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Comment Input */}
              <div className="px-5 py-5 border-b bg-gray-50/50">
                <div className="border rounded-md overflow-hidden bg-white shadow-sm transition-focus-within focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary">
                  <div className="flex items-center gap-1 px-2.5 py-1.5 border-b bg-muted/5">
                    {["B", "I", "U"].map((t) => (
                      <button key={t} type="button" className={cn("text-xs w-7 h-7 flex items-center justify-center rounded hover:bg-muted text-gray-600 transition-colors",
                        t === "B" && "font-bold",
                        t === "I" && "italic font-serif",
                        t === "U" && "underline"
                      )}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="w-full text-sm px-4 py-3 resize-none outline-none min-h-[80px]"
                    placeholder="Type your comment here..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                  />
                  <div className="px-3 py-2.5 border-t flex justify-end">
                    <Button
                      size="sm"
                      className="h-8 px-4"
                      disabled={!commentText.trim()}
                      onClick={() => {
                        if (!commentText.trim()) return;
                        setComments((prev) => [
                          {
                            id: Date.now().toString(),
                            author: orgEmail || "user",
                            text: commentText.trim(),
                            time: new Date().toLocaleString("en-IN", {
                              day: "2-digit", month: "2-digit", year: "numeric",
                              hour: "2-digit", minute: "2-digit", hour12: true,
                            }),
                            isSystem: false,
                          },
                          ...prev,
                        ]);
                        setCommentText("");
                      }}
                    >
                      Add Comment
                    </Button>
                  </div>
                </div>
              </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    ALL COMMENTS
                  </h4>
                  <span className="bg-primary/10 text-primary rounded-full text-[11px] px-2.5 py-0.5 font-bold">
                    {comments.length}
                  </span>
                </div>
                
                <div className="space-y-6 relative">
                  {/* Vertical Timeline Line */}
                  <div className="absolute left-[13px] top-2 bottom-4 w-px bg-border/60" />
                  
                  {comments.map((c) => (
                    <div key={c.id} className="relative pl-10 group">
                      {/* Timeline Dot/Avatar */}
                      <div className="absolute left-0 top-0.5">
                        <div className={cn("h-7 w-7 rounded flex items-center justify-center text-[10px] font-bold border transition-transform group-hover:scale-110",
                          c.isSystem 
                            ? "bg-amber-50 text-amber-600 border-amber-200" 
                            : "bg-blue-50 text-blue-600 border-blue-200"
                        )}>
                          {c.isSystem ? "📝" : c.author.slice(0, 1).toUpperCase()}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-xs text-foreground">
                            {c.author.split("@")[0]}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {c.time}
                          </span>
                        </div>
                        <div className={cn("text-xs leading-relaxed p-3 rounded-lg border", 
                          c.isSystem 
                            ? "bg-amber-50/30 border-amber-100/50 text-foreground/80" 
                            : "bg-gray-50/50 border-gray-100 text-foreground"
                        )}>
                          {c.text}
                        </div>
                      </div>
                    </div>
                  ))}
                  
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

      {/* What's next banner */}
      {order.status === "Draft" && (
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">WHAT&apos;S NEXT?</strong> Send this purchase order to your vendor or mark it as issued.
          </span>
          <Button size="sm" className="ml-auto shrink-0" onClick={() => onSendEmail(order._id)}>Send Purchase Order</Button>
          <Button size="sm" variant="outline" className="shrink-0" onClick={handleMarkAsIssued} disabled={updatingStatus}>Mark as Issued</Button>
        </div>
      )}
      {order.status === "Open" && (
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
          <PackageCheck className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm text-muted-foreground">
            <strong className="text-foreground">WHAT&apos;S NEXT?</strong> Receive goods or convert to a bill.
          </span>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={handleConvertToBill}>Convert to Bill</Button>
        </div>
      )}

      {/* PDF toggle + content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="flex items-center justify-end px-6 py-3">
            <span className="text-sm text-muted-foreground mr-2">Show PDF View</span>
            <button
              type="button"
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                showPdf ? "bg-primary" : "bg-muted-foreground/30",
              )}
              onClick={() => setShowPdf((v) => !v)}
            >
              <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", showPdf ? "translate-x-6" : "translate-x-1")} />
            </button>
          </div>

          {showPdf ? (
            <div className="px-4 pb-8 flex justify-center w-full" id="po-pdf-view">
              <POPdfView order={order} orgName={orgName} orgAddress={orgAddress} orgPhone={orgPhone} orgEmail={orgEmail} />
            </div>
          ) : (
            <div className="px-6 py-4 space-y-4">
              {/* Simple text view */}
              <div className="bg-white rounded border p-5 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground">PO#</span> <span className="font-medium ml-2">{order.purchaseOrderNumber}</span></div>
                  <div><span className="text-muted-foreground">Date</span> <span className="ml-2">{new Date(order.purchaseOrderDate).toLocaleDateString("en-IN")}</span></div>
                  <div><span className="text-muted-foreground">Vendor</span> <span className="ml-2">{getName(order.vendorId)}</span></div>
                  <div><span className="text-muted-foreground">Status</span> <span className={cn("ml-2 font-medium", statusColor[order.status])}>{order.status}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* PDF Template footer */}
          <div className="text-center text-xs text-muted-foreground pb-6">
            PDF Template : &apos;Standard Template&apos; <button type="button" className="text-primary hover:underline ml-1">Change</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | PurchaseOrderStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilterDD, setShowFilterDD] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchOrders = useCallback(async () => {
    setFetching(true);
    try {
      const res = await purchaseOrderApi.list({ page: 1, limit: 100 });
      setOrders(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchOrders();
  }, [firebaseUser, loading, activeOrganization?._id, fetchOrders]);

  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [o.purchaseOrderNumber, o.referenceNumber || "", getName(o.vendorId)].some((v) => v.toLowerCase().includes(s));
  });

  const selectedOrder = orders.find((o) => o._id === selectedId) ?? null;

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
      await purchaseOrderApi.remove(toDelete._id);
      toast.success("Purchase order deleted");
      setOrders((prev) => prev.filter((o) => o._id !== toDelete._id));
      if (selectedId === toDelete._id) setSelectedId(null);
    } catch { toast.error("Failed to delete"); } finally { setDeleting(false); setToDelete(null); }
  }

  function handleStatusChange(id: string, status: PurchaseOrderStatus) {
    setOrders((prev) => prev.map((o) => o._id === id ? { ...o, status } : o));
  }

  function handleSendEmail(_id: string) {
    setShowSendEmail(true);
  }

  function handlePrint(id: string) {
    const printContents = document.getElementById("po-pdf-view")?.innerHTML;
    if (!printContents) {
      toast.error("Please show the PDF View before printing.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Print PO - ${selectedOrder?.purchaseOrderNumber || id}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { margin: 0; padding: 20px; box-sizing: border-box; font-family: sans-serif; background: transparent !important; }
              table { width: 100%; border-collapse: collapse; }
              th, td { text-align: left; }
              @media print {
                body { padding: 0; }
                .shadow-xl { box-shadow: none !important; }
              }
            </style>
          </head>
          <body>
            ${printContents}
            <script>
              setTimeout(() => {
                window.print();
                window.close();
              }, 1000);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  async function handleDownloadPdf(id: string) {
    // Matches the exact visual view by calling the same print logic
    handlePrint(id);
  }

  const hasOrders = orders.length > 0;

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
                    {filterStatus ? `${filterStatus} Purchase Orders` : "All Purchase Orders"} <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => { setFilterStatus(""); setShowFilterDD(false); }}>All Purchase Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setFilterStatus("Draft"); setShowFilterDD(false); }}>Draft</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setFilterStatus("Open"); setShowFilterDD(false); }}>Open</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setFilterStatus("Billed"); setShowFilterDD(false); }}>Billed</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setFilterStatus("Closed"); setShowFilterDD(false); }}>Closed</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            actions={(
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-8 gap-1 text-sm" onClick={() => router.push("/purchases/orders/new")}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            )}
          />

          {/* Body: list + optional detail panel */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left list panel */}
            <div className={cn(
              "flex flex-col border-r bg-white overflow-hidden transition-all duration-200",
              selectedOrder ? "w-[320px] shrink-0" : "flex-1",
            )}>
              {/* List header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
                <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", selectedOrder ? "hidden" : "flex flex-1")}>
                  <input type="checkbox" className="rounded border" />
                  <span className="ml-1 font-medium uppercase tracking-wide">DATE</span>
                  <span className="ml-auto font-medium uppercase tracking-wide">PURCHASE ORDER#</span>
                </div>
                {!selectedOrder && (
                  <div className="flex items-center gap-1 ml-auto">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input className="h-7 pl-7 text-xs w-40" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                  </div>
                )}
                {selectedOrder && (
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-7 pl-7 text-xs w-full" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Full-width table header (only when no detail panel) */}
              {!selectedOrder && (
                <div className="grid text-[11px] uppercase tracking-wide text-muted-foreground font-medium border-b bg-muted/10 shrink-0"
                  style={{ gridTemplateColumns: "36px 90px 150px 120px 1fr 110px 100px 110px 100px 36px" }}>
                  <div className="px-3 py-2 flex items-center"><input type="checkbox" className="rounded border" /></div>
                  <div className="px-2 py-2">Date</div>
                  <div className="px-2 py-2">Purchase Order#</div>
                  <div className="px-2 py-2">Reference#</div>
                  <div className="px-2 py-2">Vendor Name</div>
                  <div className="px-2 py-2">Status</div>
                  <div className="px-2 py-2">Billed Status</div>
                  <div className="px-2 py-2 text-right">Amount</div>
                  <div className="px-2 py-2">Delivery Date</div>
                  <div className="px-2 py-2 flex items-center justify-end"><Search className="h-3.5 w-3.5" /></div>
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
                    <h2 className="text-xl font-semibold mb-2">Start Managing Your Purchase Activities!</h2>
                    <p className="text-muted-foreground text-sm mb-6">Create, customize, and send professional Purchase Orders to your vendors.</p>
                    <Button className="px-6 py-2 text-sm font-semibold uppercase tracking-wide" onClick={() => router.push("/purchases/orders/new")}>
                      Create New Purchase Order
                    </Button>
                    <div className="mt-10 w-full max-w-2xl">
                      <p className="text-sm font-medium text-muted-foreground mb-5">Life cycle of a Purchase Order</p>
                      <div className="flex items-center justify-center flex-wrap gap-0">
                        {[
                        { icon: "🛒", label: "RAISE PURCHASE ORDER" },
                          { label: "CONVERT TO OPEN", dash: true },
                          { icon: "📦", label: "RECEIVE GOODS" },
                          { label: "CONVERT TO BILL", dash: true },
                          { icon: "🧾", label: "RECORD PAYMENT" },
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
                    <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm">No purchase orders match your filter.</p>
                  </div>
                ) : selectedOrder ? (
                  /* Compact list when detail panel open */
                  <div className="divide-y">
                    {filtered.map((o) => (
                      <button
                        key={o._id}
                        type="button"
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors",
                          selectedId === o._id && "bg-blue-50 border-l-2 border-l-primary",
                        )}
                        onClick={() => setSelectedId(o._id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm text-foreground truncate">{getName(o.vendorId) || "—"}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {o.purchaseOrderNumber} • {new Date(o.purchaseOrderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            </div>
                            <div className={cn("text-xs font-medium mt-0.5 uppercase tracking-wide", statusColor[o.status])}>{o.status}</div>
                          </div>
                          <div className="text-sm font-semibold shrink-0">₹{fmtCur(o.total)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* Full-width table */
                  <div>
                    {filtered.map((o) => (
                      <div
                        key={o._id}
                        className="grid items-center border-b hover:bg-muted/20 cursor-pointer transition-colors text-sm group"
                        style={{ gridTemplateColumns: "36px 90px 150px 120px 1fr 110px 100px 110px 100px 36px" }}
                        onClick={() => setSelectedId(o._id)}
                      >
                        <div className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="rounded border" />
                        </div>
                        <div className="px-2 py-2.5 text-muted-foreground text-xs">
                          {new Date(o.purchaseOrderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </div>
                        <div className="px-2 py-2.5 text-primary font-medium">{o.purchaseOrderNumber}</div>
                        <div className="px-2 py-2.5 text-muted-foreground">{o.referenceNumber || ""}</div>
                        <div className="px-2 py-2.5">{getName(o.vendorId)}</div>
                        <div className={cn("px-2 py-2.5 text-xs font-medium uppercase tracking-wide", statusColor[o.status])}>{o.status}</div>
                        <div className="px-2 py-2.5 text-muted-foreground text-xs"></div>
                        <div className="px-2 py-2.5 text-right font-medium">₹{fmtCur(o.total)}</div>
                        <div className="px-2 py-2.5 text-muted-foreground text-xs">{o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString("en-IN") : ""}</div>
                        <div className="px-2 py-2.5 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/purchases/orders/${o._id}/edit`)}>Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(o)}>
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
            {selectedOrder && (
              <div className="flex-1 overflow-hidden">
                <OrderDetailPanel
                  order={selectedOrder}
                  onClose={() => setSelectedId(null)}
                  onStatusChange={handleStatusChange}
                  onDelete={(o) => { setToDelete(o); setSelectedId(null); }}
                  onEdit={(id) => router.push(`/purchases/orders/${id}/edit`)}
                  onSendEmail={handleSendEmail}
                  onPrint={handlePrint}
                  onDownloadPdf={handleDownloadPdf}
                  orgName={orgName}
                  orgAddress={orgAddress}
                  orgPhone={orgPhone}
                  orgEmail={orgEmail}
                  orgCurrency={orgCurrency}
                />
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
              <AlertDialogDescription>
                {toDelete?.purchaseOrderNumber} will be permanently deleted. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <SendEmailDialog
          open={showSendEmail}
          onClose={() => setShowSendEmail(false)}
          order={selectedOrder}
          orgName={orgName}
          orgEmail={orgEmail}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
