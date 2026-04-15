"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2, RefreshCw,
  ShoppingBag, ChevronDown, Pencil, Mail, Printer, CheckCircle,
  Copy, X, Paperclip, MessageSquare, ChevronRight, Sparkles,
  FileText, PackageCheck, Upload, History, ArrowUpDown, Download,
  Settings, Columns
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
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
import { contactApi } from "@/lib/api/contacts";
import { itemApi } from "@/lib/api/items";
import { accountApi } from "@/lib/api/accounts";
import { uploadApi } from "@/lib/api/upload";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiFetch, apiFetchBlob } from "@/lib/api/client";

const fmtCur = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColor: Record<PurchaseOrderStatus, string> = {
  Draft:  "text-gray-500",
  Open:   "text-blue-600",
  Billed: "text-green-600",
  Closed: "text-slate-500",
  Canceled: "text-red-600",
};

const statusBadge: Record<PurchaseOrderStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Open: "bg-blue-50 text-blue-700 border-blue-200",
  Billed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-zinc-100 text-zinc-700 border-zinc-200",
  Canceled: "bg-rose-50 text-rose-700 border-rose-200",
};

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

async function uploadImage(file: File, folder: string = "general"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const data = await apiFetch<{ data: { url: string } }>(`/upload?folder=${encodeURIComponent(folder)}`, {
    method: "POST",
    body: formData,
  });
  return data.data.url;
}

// â”€â”€ Send Email Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ─── Send Email View ──────────────────────────────────────────────────────────
function SendEmailView({
  show, onClose, order, orgName, orgEmail,
}: {
  show: boolean;
  onClose: () => void;
  order: PurchaseOrder | null;
  orgName: string;
  orgEmail: string;
}) {
  const router = useRouter();
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailBody, setEmailBody] = useState("");
  const [customAttachments, setCustomAttachments] = useState<{ filename: string; path: string; publicId?: string }[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const vendorName = order ? getName(order.vendorId) : "";
  const vendorEmail = (order?.vendorId as any)?.email || "";
  const subject = order
    ? `Purchase Order from ${orgName} (Purchase Order #: ${order.purchaseOrderNumber})`
    : "";
  const dateStr = order
    ? new Date(order.purchaseOrderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
  const amountStr = order ? `₹${fmtCur(order.total)}(in INR)` : "";

  useEffect(() => {
    if (order && show) {
      setEmailBody(`
        <p>Dear ${vendorName},</p>
        <p>The purchase order (${order.purchaseOrderNumber}) is attached with this email.</p>
        <p>An overview of the purchase order is available below:</p>
        <p style="color:#666">----------------------------------------------------------------------------------------</p>
        <p><strong style="font-size: 20px;">Purchase Order # : ${order.purchaseOrderNumber}</strong></p>
        <br/>
        <p style="color:#666">----------------------------------------------------------------------------------------</p>
        <table style="font-size: 13px; border-collapse: collapse;">
          <tr>
            <td style="padding-right: 20px; font-weight: 500;">Order Date</td>
            <td>: ${dateStr}</td>
          </tr>
          <tr>
            <td style="padding-right: 20px; font-weight: 500;">Amount</td>
            <td>: ${amountStr}</td>
          </tr>
        </table>
        <p style="color:#666">----------------------------------------------------------------------------------------</p>
        <p>Please go through it and confirm the order. We look forward to working with you again</p>
        <br/><br/>
        <p>Regards,<br/><strong>${orgEmail.split("@")[0]}</strong><br/>${orgName}</p>
      `);
      setCustomAttachments([]);
    }
  }, [order, show, vendorName, dateStr, amountStr, orgEmail, orgName]);

  const handleImageUpload = (file: File) => uploadImage(file, "emails");

  const handleFileAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await apiFetch<{ data: { url: string; publicId: string } }>("/upload?folder=attachments&resourceType=auto", {
        method: "POST",
        body: formData,
      });
      
      setCustomAttachments(prev => [...prev, { 
        filename: file.name, 
        path: data.data.url,
        publicId: data.data.publicId 
      }]);
      toast.success(`${file.name} uploaded`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || `Failed to upload ${file.name}`, { id: toastId });
    }
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setCustomAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handlePreviewPdf = async () => {
    if (!order) return;
    const toastId = toast.loading("Generating preview...");
    try {
      const blob = await apiFetchBlob(`/purchase-orders/${order._id}/pdf?preview=true`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.dismiss(toastId);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate preview", { id: toastId });
    }
  };

  async function handleSend() {
    if (!vendorEmail) {
      toast.error("Vendor email is missing");
      return;
    }
    setSending(true);
    try {
      const data = await apiFetch<{ success: boolean; message: string }>(`/purchase-orders/${order?._id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [vendorEmail],
          subject,
          body: emailBody,
          attachPurchaseOrderPdf: attachPdf,
          attachments: customAttachments
        })
      });
      if (data.success) {
        toast.success("Email sent successfully");
        onClose();
      } else {
        toast.error(data.message || "Failed to send email");
      }
    } catch {
      toast.error("An error occurred while sending email");
    } finally {
      setSending(false);
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-medium">Email To {vendorName}.</h2>
          <button 
            onClick={() => router.push(`/settings/email`)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            title="Configure Email Settings"
          >
            <Settings className="h-3.5 w-3.5" /> Email Settings
          </button>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <div className="max-w-[1000px] mx-auto my-6 bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="divide-y">
            {/* From */}
            <div className="flex items-center gap-4 px-6 py-3">
              <span className="text-sm text-gray-400 w-20 shrink-0">From <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[9px] ml-0.5">?</span></span>
              <span className="text-sm text-gray-700">{orgEmail} &lt;{orgEmail}&gt;</span>
            </div>
            {/* Send To */}
            <div className="flex items-center gap-4 px-6 py-3">
              <span className="text-sm text-gray-400 w-20 shrink-0">Send To</span>
              <div className="flex items-center flex-wrap gap-1.5 flex-1">
                <span className="flex items-center gap-1.5 bg-gray-100/80 rounded px-2 py-1 text-xs border border-gray-200">
                  <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">{vendorName.slice(0, 1)}</span>
                  <span className="text-gray-700 font-medium">{vendorName} &lt;{vendorEmail}&gt;</span>
                  <button type="button" className="ml-1 text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                </span>
                <div className="ml-auto flex gap-3">
                  <span className="text-xs text-blue-600 cursor-pointer hover:underline font-medium">Cc</span>
                  <span className="text-xs text-blue-600 cursor-pointer hover:underline font-medium">Bcc</span>
                </div>
              </div>
            </div>
            {/* Subject */}
            <div className="flex items-center gap-4 px-6 py-3">
              <span className="text-sm text-gray-400 w-20 shrink-0">Subject</span>
              <span className="text-sm text-gray-700 font-medium">{subject}</span>
            </div>

            {/* Top Attachments Bar */}
            <div className="px-6 py-2.5 bg-gray-50/50 flex flex-col gap-2 border-t">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="attachPdf" 
                    checked={attachPdf} 
                    onCheckedChange={(c) => setAttachPdf(!!c)} 
                    className="h-4 w-4 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" 
                  />
                  <Label htmlFor="attachPdf" className="text-xs text-gray-600 cursor-pointer font-medium flex items-center gap-1.5">
                    Attach PO PDF
                    {attachPdf && order && (
                      <span 
                        onClick={(e) => { e.preventDefault(); handlePreviewPdf(); }}
                        className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-bold hover:bg-red-100 transition-colors"
                      >
                        {order.purchaseOrderNumber}.pdf
                      </span>
                    )}
                  </Label>
                </div>
                <div className="w-px h-3 bg-gray-200" />
                <button 
                  type="button" 
                  onClick={() => attachmentInputRef.current?.click()}
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1.5 font-medium"
                >
                  <Paperclip className="h-3.5 w-3.5" /> Attach Files
                </button>
              </div>

              {customAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {customAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-2.5 pr-1 py-1 shadow-sm">
                      <Paperclip className="h-3 w-3 text-blue-500" />
                      <span className="text-[11px] text-gray-600 font-medium max-w-[120px] truncate">{a.filename}</span>
                      <button 
                        type="button" 
                        onClick={() => removeAttachment(i)}
                        className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Rich Editor */}
            <div className="p-0 border-t relative">
              <RichTextEditor
                value={emailBody}
                onChange={setEmailBody}
                onImageUpload={handleImageUpload}
                placeholder="Write your email here..."
                minHeight="450px"
                className="border-none rounded-none"
                toolbarClassName="bg-gray-50/50 border-b sticky top-0 z-10"
                editorClassName="px-8 py-8 min-h-[500px]"
              />
            </div>

            {/* Hidden Input */}
            <input
              type="file"
              ref={attachmentInputRef}
              className="hidden"
              onChange={handleFileAttachment}
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-6 py-4 border-t bg-white flex gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-50">
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-9 text-[13px] font-semibold" 
          onClick={handleSend} 
          disabled={sending}
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Send
        </Button>
        <Button 
          variant="outline" 
          className="px-8 h-9 text-[13px] font-medium border-gray-200 text-gray-600 hover:bg-gray-50" 
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Advanced Search Dialog ──────────────────────────────────────────────────
function AdvancedSearchDialog({
  open, onClose, onSearch, vendors, customers, items, accounts,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (filters: any) => void;
  vendors: any[];
  customers: any[];
  items: any[];
  accounts: any[];
}) {
  const [filters, setFilters] = useState({
    poNumber: "",
    referenceNumber: "",
    dateRange: { start: "", end: "" },
    deliveryDate: { start: "", end: "" },
    createdBetween: { start: "", end: "" },
    status: "All",
    itemNameId: "",
    itemDescription: "",
    amountMin: "",
    amountMax: "",
    vendorId: "",
    accountId: "",
    projectName: "",
    deliverToCustomerId: "",
    tcsId: "",
    taxExemptions: "",
    addressType: "Billing and Shipping",
    attention: "",
    addressLine: "",
  });

  const handleSearch = () => {
    onSearch(filters);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[1000px] p-0 overflow-hidden bg-white border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
               <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500">Search</span>
                  <Select defaultValue="Purchase Orders">
                     <SelectTrigger className="w-[200px] h-9 bg-white border-gray-300">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="Purchase Orders">Purchase Orders</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
               <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500">Filter</span>
                  <Select defaultValue="All">
                     <SelectTrigger className="w-[200px] h-9 bg-white border-gray-300">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="All">All Purchase Orders</SelectItem>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="Billed">Billed</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
               <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="p-8 grid grid-cols-2 gap-x-12 gap-y-6 overflow-y-auto max-h-[70vh]">
           {/* Left Column */}
           <div className="space-y-6">
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Purchase Order#</Label>
                 <Input 
                   value={filters.poNumber}
                   onChange={(e) => setFilters(f => ({ ...f, poNumber: e.target.value }))}
                   className="flex-1 h-9 border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-400" 
                 />
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Date Range</Label>
                 <div className="flex-1 flex items-center gap-2">
                    <Input 
                      placeholder="dd/MM/yyyy" 
                      className="h-9 border-gray-300" 
                      value={filters.dateRange.start}
                      onChange={(e) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, start: e.target.value } }))}
                    />
                    <span className="text-gray-400">-</span>
                    <Input 
                      placeholder="dd/MM/yyyy" 
                      className="h-9 border-gray-300"
                      value={filters.dateRange.end}
                      onChange={(e) => setFilters(f => ({ ...f, dateRange: { ...f.dateRange, end: e.target.value } }))}
                    />
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Created Between</Label>
                 <div className="flex-1 flex items-center gap-2">
                    <Input 
                      placeholder="dd/MM/yyyy" 
                      className="h-9 border-gray-300"
                      value={filters.createdBetween.start}
                      onChange={(e) => setFilters(f => ({ ...f, createdBetween: { ...f.createdBetween, start: e.target.value } }))}
                    />
                    <span className="text-gray-400">-</span>
                    <Input 
                      placeholder="dd/MM/yyyy" 
                      className="h-9 border-gray-300"
                      value={filters.createdBetween.end}
                      onChange={(e) => setFilters(f => ({ ...f, createdBetween: { ...f.createdBetween, end: e.target.value } }))}
                    />
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Item Name</Label>
                 <Select value={filters.itemNameId} onValueChange={(v) => setFilters(f => ({ ...f, itemNameId: v }))}>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select an item" />
                    </SelectTrigger>
                    <SelectContent>
                       {items.map(i => <SelectItem key={i._id} value={i._id}>{i.name}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Total Range</Label>
                 <div className="flex-1 flex items-center gap-2">
                    <Input 
                      className="h-9 border-gray-300" 
                      placeholder="Min"
                      value={filters.amountMin}
                      onChange={(e) => setFilters(f => ({ ...f, amountMin: e.target.value }))}
                    />
                    <span className="text-gray-400">-</span>
                    <Input 
                      className="h-9 border-gray-300"
                      placeholder="Max"
                      value={filters.amountMax}
                      onChange={(e) => setFilters(f => ({ ...f, amountMax: e.target.value }))}
                    />
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Account</Label>
                 <Select value={filters.accountId} onValueChange={(v) => setFilters(f => ({ ...f, accountId: v }))}>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select an account" />
                    </SelectTrigger>
                    <SelectContent>
                       {accounts.map(a => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Deliver To Customer</Label>
                 <Select value={filters.deliverToCustomerId} onValueChange={(v) => setFilters(f => ({ ...f, deliverToCustomerId: v }))}>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                       {customers.map(v => <SelectItem key={v._id} value={v._id}>{getName(v)}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Tax Exemptions</Label>
                 <Select>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select a Tax Exemption" />
                    </SelectTrigger>
                 </Select>
              </div>
           </div>

           {/* Right Column */}
           <div className="space-y-6">
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Reference#</Label>
                 <Input className="flex-1 h-9 border-gray-300" />
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Expected Delivery Date</Label>
                 <div className="flex-1 flex items-center gap-2">
                    <Input placeholder="dd/MM/yyyy" className="h-9 border-gray-300" />
                    <span className="text-gray-400">-</span>
                    <Input placeholder="dd/MM/yyyy" className="h-9 border-gray-300" />
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Status</Label>
                 <Select>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                       <SelectItem value="Draft">Draft</SelectItem>
                       <SelectItem value="Open">Open</SelectItem>
                       <SelectItem value="Billed">Billed</SelectItem>
                       <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Item Description</Label>
                 <Input className="flex-1 h-9 border-gray-300" />
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Vendor</Label>
                 <Select>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                       {vendors.map(v => <SelectItem key={v._id} value={v._id}>{getName(v)}</SelectItem>)}
                    </SelectContent>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">Project Name</Label>
                 <Select>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                 </Select>
              </div>
              <div className="flex items-center gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600">TCS</Label>
                 <Select>
                    <SelectTrigger className="flex-1 h-9 border-gray-300">
                       <SelectValue placeholder="Select a Tax" />
                    </SelectTrigger>
                 </Select>
              </div>
              <div className="flex items-start gap-4">
                 <Label className="w-40 text-sm font-normal text-gray-600 mt-1.5">Address</Label>
                 <div className="flex-1 space-y-4">
                    <RadioGroup defaultValue="Billing and Shipping" className="flex flex-wrap gap-4">
                       <div className="flex items-center gap-2">
                          <RadioGroupItem value="Billing and Shipping" id="bs" className="border-blue-500 text-blue-500" />
                          <Label htmlFor="bs" className="text-sm font-normal cursor-pointer">Billing and Shipping</Label>
                       </div>
                       <div className="flex items-center gap-2">
                          <RadioGroupItem value="Billing" id="b" className="border-blue-500 text-blue-500" />
                          <Label htmlFor="b" className="text-sm font-normal cursor-pointer">Billing</Label>
                       </div>
                       <div className="flex items-center gap-2">
                          <RadioGroupItem value="Shipping" id="s" className="border-blue-500 text-blue-500" />
                          <Label htmlFor="s" className="text-sm font-normal cursor-pointer">Shipping</Label>
                       </div>
                    </RadioGroup>
                    <div className="flex border rounded-md overflow-hidden border-gray-300">
                       <Select defaultValue="Attention">
                          <SelectTrigger className="w-[120px] h-9 border-none bg-gray-50 text-xs rounded-none focus:ring-0">
                             <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="Attention">Attention</SelectItem>
                          </SelectContent>
                       </Select>
                       <Input className="flex-1 h-9 border-none focus-visible:ring-0 rounded-none border-l border-gray-200" />
                    </div>
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors">
                       <Plus className="h-3.5 w-3.5" /> Address Line
                    </button>
                 </div>
              </div>
           </div>
        </div>

        <div className="p-6 border-t flex justify-center gap-3 bg-gray-50/50">
           <Button className="px-10 h-10 bg-blue-500 hover:bg-blue-600 shadow-sm text-sm font-medium" onClick={handleSearch}>Search</Button>
           <Button variant="outline" className="px-10 h-10 border-gray-300 text-sm font-medium" onClick={onClose}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PDF View ──────────────────────────────────────────────────────────────────
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
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [loadingPdfPreview, setLoadingPdfPreview] = useState(false);
  const pdfBlobUrlRef = useRef<string | null>(null);

  // Comments & History
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const nonHeaderItems = order.lineItems.filter((li) => !li.isHeader);

  const statusNoticeByState: Record<PurchaseOrderStatus, { label: string; message: string; tone: string }> = {
    Draft: {
      label: "Draft",
      message: "Send this purchase order to your vendor or mark it as issued when the details are finalized.",
      tone: "bg-amber-50 border-amber-200 text-amber-900",
    },
    Open: {
      label: "Issued",
      message: "This purchase order is active. Convert it to a bill once goods or services are received.",
      tone: "bg-blue-50 border-blue-200 text-blue-900",
    },
    Billed: {
      label: "Billed",
      message: "This purchase order has already been converted to a bill and is now linked to payables.",
      tone: "bg-emerald-50 border-emerald-200 text-emerald-900",
    },
    Closed: {
      label: "Closed",
      message: "This purchase order is completed and marked as received.",
      tone: "bg-zinc-100 border-zinc-200 text-zinc-800",
    },
    Canceled: {
      label: "Canceled",
      message: "This purchase order has been canceled. You can clone it to create a fresh one.",
      tone: "bg-rose-50 border-rose-200 text-rose-900",
    },
  };

  useEffect(() => {
    if (order.comments) {
      setComments([...order.comments].reverse().map((c, idx) => ({
        id: `c-${idx}`,
        author: c.author,
        text: c.text,
        time: new Date(c.time).toLocaleString("en-IN", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        }),
        isSystem: c.isSystem,
      })));
    }
  }, [order.comments]);

  useEffect(() => {
    if (!showPdf) {
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
      setPdfPreviewUrl(null);
      setLoadingPdfPreview(false);
      return;
    }

    let cancelled = false;

    const fetchPdfPreview = async () => {
      setLoadingPdfPreview(true);
      try {
        const blob = await apiFetchBlob(`/purchase-orders/${order._id}/pdf?preview=true`);
        const objectUrl = window.URL.createObjectURL(blob);

        if (cancelled) {
          window.URL.revokeObjectURL(objectUrl);
          return;
        }

        if (pdfBlobUrlRef.current) {
          window.URL.revokeObjectURL(pdfBlobUrlRef.current);
        }
        pdfBlobUrlRef.current = objectUrl;
        setPdfPreviewUrl(objectUrl);
      } catch {
        if (!cancelled) {
          setPdfPreviewUrl(null);
          toast.error("Failed to load PDF preview");
        }
      } finally {
        if (!cancelled) {
          setLoadingPdfPreview(false);
        }
      }
    };

    void fetchPdfPreview();

    return () => {
      cancelled = true;
    };
  }, [order._id, showPdf]);

  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        window.URL.revokeObjectURL(pdfBlobUrlRef.current);
        pdfBlobUrlRef.current = null;
      }
    };
  }, []);

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
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.convertToBill(order._id);
      onStatusChange(order._id, "Billed");
      toast.success("Purchase order converted to bill");
    } catch { toast.error("Failed to convert to bill"); } finally { setUpdatingStatus(false); }
  }

  async function handleClone() {
    setUpdatingStatus(true);
    try {
       await purchaseOrderApi.clone(order._id);
       toast.success("Purchase order cloned successfully");
       window.location.reload();
    } catch { toast.error("Failed to clone purchase order"); } finally { setUpdatingStatus(false); }
  }

  async function handleMarkReceived() {
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.update(order._id, { status: "Closed" });
      onStatusChange(order._id, "Closed");
      toast.success("Marked as Received");
    } catch { toast.error("Failed"); } finally { setUpdatingStatus(false); }
  }

  async function handleMarkCanceled() {
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.update(order._id, { status: "Canceled" });
      onStatusChange(order._id, "Canceled");
      toast.success("Purchase order canceled");
    } catch { toast.error("Failed to cancel"); } finally { setUpdatingStatus(false); }
  }

  async function handleSaveDeliveryDate(date: string, notes: string) {
    setUpdatingStatus(true);
    try {
      await purchaseOrderApi.update(order._id, { deliveryDate: date });
      const dateStr = new Date(date).toLocaleDateString("en-GB");
      const commentTxt = `Order expected on "${dateStr}".\n${notes}`.trim();
      await purchaseOrderApi.addComment(order._id, commentTxt);
      
      onStatusChange(order._id, order.status); // Trigger refresh
      toast.success("Delivery date updated");
      setShowDeliveryDialog(false);
    } catch { toast.error("Failed to update delivery date"); } finally { setUpdatingStatus(false); }
  }

  const isOpen = order.status === "Open";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top action bar */}
      {/* Top action bar - EXACT design matching */}
      <div className="flex items-center px-2 py-0.5 border-b bg-white shrink-0 flex-wrap min-h-[48px]">
        <div className="flex items-center pr-2">
          <button type="button" onClick={() => onEdit(order._id)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
        
        <div className="w-px h-6 bg-gray-200" />
        
        <div className="flex items-center px-2">
          <button type="button" onClick={() => onSendEmail(order._id)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
            <Mail className="h-3.5 w-3.5" /> Send Email
          </button>
        </div>
        
        <div className="w-px h-6 bg-gray-200" />
        
        <div className="flex items-center px-2">
          {/* PDF/Print dropdown */}
          <DropdownMenu open={showPrintMenu} onOpenChange={setShowPrintMenu}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
                <Printer className="h-3.5 w-3.5" /> PDF/Print <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 shadow-xl border-gray-200 mt-1">
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={() => onPrint(order._id)}>
                <Printer className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Print
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={() => onDownloadPdf(order._id)}>
                <FileText className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="w-px h-6 bg-gray-200" />
        
        <div className="flex items-center px-2">
          {/* Status Specific Action Buttons */}
          {order.status === "Draft" ? (
            <button
              type="button"
              disabled={updatingStatus}
              onClick={handleMarkAsIssued}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium hover:bg-muted/30 rounded"
            >
              <CheckCircle className={cn("h-3.5 w-3.5", updatingStatus ? "animate-spin" : "")} />
              Mark as Issued
            </button>
          ) : order.status === "Open" ? (
            <button
              type="button"
              onClick={handleConvertToBill}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium hover:bg-muted/30 rounded"
            >
              <PackageCheck className="h-3.5 w-3.5" /> Convert to Bill
            </button>
          ) : (
            <div className={cn("px-3 py-1.5 text-xs font-bold uppercase tracking-wider border mx-1 rounded", statusBadge[order.status])}>
              {order.status}
            </div>
          )}
        </div>
        
        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center px-2">
          {/* More actions */}
          <DropdownMenu open={showMoreMenu} onOpenChange={setShowMoreMenu}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-600 hover:text-foreground transition-colors">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 shadow-xl border-gray-200 mt-1">
              {order.status === "Draft" ? (
                <>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer focus:bg-blue-50 focus:text-blue-600 font-medium" onClick={handleMarkAsIssued}>
                    <CheckCircle className="h-3.5 w-3.5 mr-2.5" /> Mark as Issued
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleConvertToBill}>
                    <PackageCheck className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Convert to Bill
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleClone}>
                    <Copy className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Clone
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem 
                    className="text-xs py-2.5 cursor-pointer text-blue-600 font-semibold bg-blue-50/50 hover:bg-blue-50 focus:bg-blue-50 focus:text-blue-600"
                    onClick={() => setShowDeliveryDialog(true)}
                  >
                    Expected Delivery Date
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer">
                    Cancel Items
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleMarkCanceled}>
                    Mark as Canceled
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleClone}>
                    <Copy className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Clone
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(order)}>
                <Trash2 className="h-3.5 w-3.5 mr-2.5" /> Delete
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleMarkReceived}>
                <ShoppingBag className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Mark as Received
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
                          await purchaseOrderApi.addComment(order._id, txt);
                          const newComment = {
                            id: Date.now().toString(),
                            author: orgEmail || "me",
                            text: txt,
                            time: new Date().toLocaleDateString("en-GB") + " " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
                            isSystem: false,
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

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-thin">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">
                    ALL COMMENTS
                  </h4>
                  <span className="bg-primary/10 text-primary rounded-full text-[11px] px-2.5 py-0.5 font-bold">
                    {comments.length}
                  </span>
                </div>
                
                <div className="space-y-6 relative pb-10">
                  {/* Vertical Timeline Line */}
                  <div className="absolute left-[13px] top-2 bottom-4 w-px bg-border/60" />
                  
                  {comments.map((c, idx) => {
                    const isCreation = c.text.toLowerCase().includes("created") || c.text.toLowerCase().includes("cloned");
                    const isStatus = c.text.toLowerCase().includes("status changed") || c.text.toLowerCase().includes("marked as");
                    const isDelivery = c.text.toLowerCase().includes("order expected on");
                    
                    let Icon = MessageSquare;
                    let iconBg = "bg-blue-50 text-blue-600 border-blue-200";
                    if (c.isSystem) {
                      if (isCreation) { Icon = FileText; iconBg = "bg-amber-50 text-amber-600 border-amber-200"; }
                      else if (isStatus) { Icon = CheckCircle; iconBg = "bg-green-50 text-green-600 border-green-200"; }
                      else { Icon = History; iconBg = "bg-amber-50 text-amber-600 border-amber-200"; }
                    } else if (isDelivery) {
                      Icon = PackageCheck;
                      iconBg = "bg-blue-50 text-blue-600 border-blue-200";
                    }

                    return (
                      <div key={c.id} className="relative pl-10 group">
                        {/* Timeline Dot/Avatar Icon */}
                        <div className="absolute left-0 top-0.5 z-10">
                          <div className={cn("h-7 w-7 rounded flex items-center justify-center border transition-transform group-hover:scale-110 shadow-sm", iconBg)}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-1 pb-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800">
                              {c.author.split("@")[0]}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-medium">
                              • {c.time}
                            </span>
                          </div>
                          
                          <div className={cn("text-[13px] leading-relaxed p-3.5 rounded-lg border relative group/msg shadow-sm whitespace-pre-wrap", 
                            c.isSystem 
                              ? "bg-gray-50/50 border-gray-100 text-gray-600 italic" 
                              : "bg-white border-gray-100 text-gray-800"
                          )}>
                            <div dangerouslySetInnerHTML={{ __html: c.text }} className="rich-text-content" />
                            {!c.isSystem && (
                              <button 
                                className="absolute right-3 top-3 opacity-0 group-hover/msg:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                onClick={() => {
                                  // In a real app, this would call a delete API
                                  setComments(prev => prev.filter(p => p.id !== c.id));
                                  toast.success("Comment removed locally");
                                }}
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

      <div className={cn("flex items-center gap-3 px-5 py-3 border-b shrink-0", statusNoticeByState[order.status].tone)}>
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="text-sm">
          <strong className="mr-1 uppercase tracking-tight">{statusNoticeByState[order.status].label}:</strong>
          {statusNoticeByState[order.status].message}
        </span>
        {order.status === "Draft" && (
          <>
            <Button size="sm" className="ml-auto shrink-0" onClick={() => onSendEmail(order._id)}>Send Purchase Order</Button>
            <Button size="sm" variant="outline" className="shrink-0" onClick={handleMarkAsIssued} disabled={updatingStatus}>Mark as Issued</Button>
          </>
        )}
        {order.status === "Open" && (
          <Button size="sm" className="ml-auto shrink-0 bg-blue-500 hover:bg-blue-600" onClick={handleConvertToBill}>Convert to Bill</Button>
        )}
      </div>

      <ExpectedDeliveryDialog 
        open={showDeliveryDialog} 
        onClose={() => setShowDeliveryDialog(false)} 
        onSave={handleSaveDeliveryDate}
        initialDate={order.deliveryDate || ""}
      />

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
            <div className="px-4 pb-8 flex justify-center w-full">
              <div className="w-full max-w-[900px] rounded-md border bg-white overflow-hidden shadow-sm">
                {loadingPdfPreview ? (
                  <div className="h-[1100px] flex items-center justify-center text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading PDF preview...
                  </div>
                ) : pdfPreviewUrl ? (
                  <div>
                    <div className="flex items-center justify-end gap-2 px-3 py-2 border-b bg-muted/20">
                      <a href={pdfPreviewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open full preview</a>
                    </div>
                    <embed
                      src={pdfPreviewUrl}
                      type="application/pdf"
                      className="w-full h-[1100px]"
                    />
                  </div>
                ) : (
                  <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
                    Unable to load PDF preview.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 space-y-4">
              <div className="bg-white rounded border p-5 text-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-lg font-semibold">Purchase Order {order.purchaseOrderNumber}</div>
                    <div className="text-xs text-muted-foreground">Vendor: {getName(order.vendorId) || "-"}</div>
                  </div>
                  <div className={cn("px-2.5 py-1 rounded border text-xs font-semibold uppercase", statusBadge[order.status])}>
                    {order.status}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div className="rounded border p-2.5"><div className="text-muted-foreground">PO Date</div><div className="font-medium mt-1">{new Date(order.purchaseOrderDate).toLocaleDateString("en-IN")}</div></div>
                  <div className="rounded border p-2.5"><div className="text-muted-foreground">Delivery Date</div><div className="font-medium mt-1">{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "-"}</div></div>
                  <div className="rounded border p-2.5"><div className="text-muted-foreground">Reference</div><div className="font-medium mt-1">{order.referenceNumber || "-"}</div></div>
                  <div className="rounded border p-2.5"><div className="text-muted-foreground">Total</div><div className="font-semibold mt-1">{orgCurrency === "INR" ? "₹" : orgCurrency}{fmtCur(order.total)}</div></div>
                </div>

                <div className="border rounded overflow-hidden">
                  <div className="grid text-[11px] uppercase tracking-wide text-muted-foreground font-medium bg-muted/20" style={{ gridTemplateColumns: "1fr 100px 120px 120px" }}>
                    <div className="px-3 py-2">Item</div>
                    <div className="px-3 py-2 text-right">Qty</div>
                    <div className="px-3 py-2 text-right">Rate</div>
                    <div className="px-3 py-2 text-right">Amount</div>
                  </div>
                  {nonHeaderItems.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">No line items added.</div>
                  ) : nonHeaderItems.map((li, idx) => (
                    <div key={`${li._id || idx}`} className="grid border-t text-sm" style={{ gridTemplateColumns: "1fr 100px 120px 120px" }}>
                      <div className="px-3 py-2.5">
                        <div className="font-medium">{li.name}</div>
                        {li.description && <div className="text-xs text-muted-foreground mt-0.5">{li.description}</div>}
                      </div>
                      <div className="px-3 py-2.5 text-right">{li.quantity}</div>
                      <div className="px-3 py-2.5 text-right">{fmtCur(li.rate)}</div>
                      <div className="px-3 py-2.5 text-right font-medium">{fmtCur(li.amount)}</div>
                    </div>
                  ))}
                </div>

                <div className="ml-auto w-full max-w-[320px] text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span>{fmtCur(order.subTotal)}</span></div>
                  {order.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{fmtCur(order.discountAmount)}</span></div>}
                  {order.taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{order.taxType}</span><span>-{fmtCur(order.taxAmount)}</span></div>}
                  {order.adjustmentAmount !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">{order.adjustmentLabel || "Adjustment"}</span><span>{fmtCur(order.adjustmentAmount)}</span></div>}
                  <div className="flex justify-between border-t pt-2 font-semibold text-base"><span>Total</span><span>{orgCurrency === "INR" ? "₹" : orgCurrency}{fmtCur(order.total)}</span></div>
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
  const [showPOConfig, setShowPOConfig] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchSearchData = useCallback(async () => {
    try {
      const [iRes, aRes, vRes, cRes] = await Promise.all([
        itemApi.list({ page: 1, limit: 1000 }),
        accountApi.list({ excludeGroups: true }),
        contactApi.list({ type: "Vendor", page: 1, limit: 1000 }),
        contactApi.list({ type: "Customer", page: 1, limit: 1000 }),
      ]);
      setItems(iRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setVendorsList(vRes.data ?? []);
      setCustomersList(cRes.data ?? []);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (activeOrganization?._id) fetchSearchData();
  }, [activeOrganization?._id, fetchSearchData]);

  const fetchOrders = useCallback(async (filters?: any) => {
    setFetching(true);
    try {
      const res = await purchaseOrderApi.list({ 
        page: 1, 
        limit: 100,
        status: filters?.status !== "All" ? filters?.status : undefined,
        poNumber: filters?.poNumber,
        referenceNumber: filters?.referenceNumber,
        dateStart: filters?.dateRange?.start,
        dateEnd: filters?.dateRange?.end,
        deliveryStart: filters?.deliveryDate?.start,
        deliveryEnd: filters?.deliveryDate?.end,
        itemNameId: filters?.itemNameId,
        accountId: filters?.accountId,
        amountMin: filters?.amountMin ? Number(filters.amountMin) : undefined,
        amountMax: filters?.amountMax ? Number(filters.amountMax) : undefined,
      });
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
    purchaseOrderApi.getOne(id)
      .then((res) => {
        setOrders((prev) => prev.map((o) => (o._id === id ? res.data : o)));
      })
      .catch(() => {
        // no-op: optimistic status update is already applied
      });
  }

  function handleSendEmail(id: string) {
    router.push(`/purchases/orders/${id}/send-email`);
  }

  async function handlePrint(id: string) {
    const toastId = toast.loading("Preparing print preview...");
    try {
      const blob = await apiFetchBlob(`/purchase-orders/${id}/pdf?preview=true`);
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");

      if (!printWindow) {
        window.URL.revokeObjectURL(url);
        toast.error("Please allow pop-ups to print this purchase order.", { id: toastId });
        return;
      }

      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // no-op: browser PDF viewers may not allow auto-print.
        }
      }, 800);

      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 60_000);

      toast.success("Print preview opened.", { id: toastId });
    } catch {
      toast.error("Failed to open print preview", { id: toastId });
    }
  }

  async function handleDownloadPdf(id: string) {
    try {
      const blob = await purchaseOrderApi.downloadPdf(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `PurchaseOrder-${selectedOrder?.purchaseOrderNumber || id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    }
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
                <Button size="sm" className="h-8 gap-1 text-sm bg-blue-600 hover:bg-blue-700" onClick={() => router.push("/purchases/orders/new")}>
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
                        {["Date", "Purchase Order#", "Vendor Name", "Amount", "Delivery Date", "Last Modified Time"].map((s) => (
                          <DropdownMenuItem key={s} className="px-3 py-2 text-[13px] hover:bg-gray-100">{s}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator className="m-0" />

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Download className="h-4 w-4 text-blue-600" />
                      <span>Import Purchase Orders</span>
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

                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50" onClick={fetchOrders}>
                      <RefreshCw className="h-4 w-4 text-blue-600" />
                      <span>Refresh List</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                  <div className="px-2 py-2 flex items-center justify-end">
                    <button onClick={() => setShowAdvancedSearch(true)} className="p-1 hover:bg-muted rounded transition-colors" title="Advanced Search">
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
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

        <AdvancedSearchDialog
          open={showAdvancedSearch}
          onClose={() => setShowAdvancedSearch(false)}
          onSearch={(f) => {
            fetchOrders(f);
            setShowAdvancedSearch(false);
          }}
          vendors={vendorsList}
          customers={customersList}
          items={items}
          accounts={accounts}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
function ExpectedDeliveryDialog({ open, onClose, onSave, initialDate }: { open: boolean, onClose: () => void, onSave: (date: string, notes: string) => void, initialDate: string }) {
  const [date, setDate] = useState(initialDate ? initialDate.split("T")[0] : new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-lg font-medium text-gray-800">Expected Delivery Date</DialogTitle>
        </DialogHeader>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label className="text-sm text-gray-500 font-normal">Delivery Date</Label>
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
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 h-9" 
            onClick={() => onSave(date, notes)}
          >
            Save
          </Button>
          <Button 
            variant="outline" 
            className="border-gray-200 text-gray-600 px-6 h-9" 
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
