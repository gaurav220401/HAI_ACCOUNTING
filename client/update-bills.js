const fs = require('fs');

const code = `"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2,
  ChevronDown, Pencil, Mail, Printer, CheckCircle,
  X, FileText, Download, ArrowUpDown, Upload, History, ChevronRight,
  PackageCheck, Copy, ShoppingBag, Paperclip, MessageSquare, Sparkles, CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { PageHeader } from "@/components/page-header";
import { billApi, type Bill, type BillStatus } from "@/lib/api/bills";
import { uploadApi } from "@/lib/api/upload";
import { cn } from "@/lib/utils";

async function uploadImage(file: File, folder: string = "general"): Promise<string> {
  try {
    const res = await uploadApi.upload(file, folder);
    return res.url;
  } catch (error) {
    console.error("Image upload failed:", error);
    throw error;
  }
}

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

// ── Detail Panel ─────────────────────────────────────────────────────────────
function BillDetailPanel({
  bill, onClose, onStatusChange, onDelete, onEdit, onSendEmail, onPrint, onDownloadPdf,
  orgName, orgAddress, orgPhone, orgEmail, orgCurrency, onRecordPayment
}: {
  bill: Bill;
  onClose: () => void;
  onStatusChange: (id: string, status: BillStatus) => void;
  onDelete: (o: Bill) => void;
  onEdit: (id: string) => void;
  onSendEmail: (id: string) => void;
  onPrint: (id: string) => void;
  onDownloadPdf: (id: string) => Promise<void>;
  onRecordPayment: (id: string) => void;
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

  // Comments 
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<any[]>([]);

  useEffect(() => {
    if (bill.comments) {
      setComments([...bill.comments].reverse().map((c, idx) => ({
        id: "c-" + idx,
        author: c.author,
        text: c.text,
        time: new Date(c.time).toLocaleString("en-IN", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", hour12: true,
        }),
        isSystem: c.isSystem,
      })));
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
    setUpdatingStatus(true);
    try {
      await billApi.update(bill._id, { status: "Void" });
      onStatusChange(bill._id, "Void");
      toast.success("Marked as Void");
    } catch { toast.error("Failed"); } finally { setUpdatingStatus(false); }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top action bar */}
      <div className="flex items-center px-2 py-0.5 border-b bg-white shrink-0 flex-wrap min-h-[48px]">
        <div className="flex items-center pr-2">
          <button type="button" onClick={() => onEdit(bill._id)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
            <Pencil className="h-3.5 w-3.5" /> Edit
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
          ) : (bill.status === "Open" || bill.status === "Overdue" || bill.status === "Partially Paid") ? (
             <button
              type="button"
              onClick={() => onRecordPayment(bill._id)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-bold uppercase tracking-wider text-blue-600 hover:bg-blue-50 transition-colors rounded"
            >
              Record Payment
            </button>
          ) : (
            <div className="px-3 py-1.5 text-xs text-green-600 font-bold uppercase tracking-wider bg-green-50 mx-1 rounded">
              {bill.status}
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
              <DropdownMenuItem className="text-xs py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(bill)}>
                <Trash2 className="h-3.5 w-3.5 mr-2.5" /> Delete
              </DropdownMenuItem>
              {bill.status !== "Void" && (
                <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleMarkAsVoid}>
                  <X className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Mark as Void
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right side icons */}
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

          {/* Attachments Sidebar */}
           {showAttachments && (
             <div className="absolute top-full right-11 mt-2 w-[340px] bg-white rounded-md shadow-xl border z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
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
                   const isImg = ["jpg", "jpeg", "png", "gif", "webp"].some((e) => a.url.toLowerCase().includes("." + e));
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
                     {uploading ? "Uploading..." : "Upload your Files"}
                   </Button>
                   <input ref={attachFileRef} type="file" multiple className="hidden"
                     onChange={async (e) => {
                       const files = Array.from(e.target.files || []);
                       if (!files.length) return;
                       setUploading(true);
                       try {
                         const results = await Promise.all(files.slice(0, 10 - attachments.length).map((f) => uploadApi.upload(f, "bills")));
                         setAttachments((prev) => [...prev, ...results.map((r) => ({ url: r.url, publicId: r.publicId, name: decodeURIComponent(r.url.split("/").pop() || "File") }))]);
                         toast.success("Files uploaded");
                       } catch { toast.error("Upload failed"); } finally { setUploading(false); e.target.value = ""; }
                     }}
                   />
                 </div>
               </div>
             </div>
           )}
        </div>

        {/* Comments Panel */}
        <Sheet open={showComments} onOpenChange={setShowComments}>
          <SheetContent side="right" className="p-0 sm:max-w-[400px] flex flex-col gap-0 border-l shadow-xl">
            <SheetHeader className="px-5 py-4 border-b">
              <SheetTitle className="text-base font-semibold">Comments & History</SheetTitle>
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
                          const newComment = {
                            id: Date.now().toString(),
                            author: orgEmail || "me",
                            text: txt,
                            time: new Date().toLocaleDateString("en-GB") + " " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
                            isSystem: false,
                          };
                          setComments((prev) => [newComment, ...prev]);
                          setCommentText("");
                          toast.success("Comment added (Locally)");
                        } catch { toast.error("Failed to add comment"); } finally { setUpdatingStatus(false); }
                      }}
                    >
                      Add Comment
                    </button>
                  </div>
                </div>

              {/* Comments List */}
              <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-thin">
                <div className="space-y-6 relative pb-10">
                   {comments.length === 0 && (
                     <div className="text-center py-10">
                       <MessageSquare className="h-8 w-8 text-border mx-auto mb-3" />
                       <p className="text-sm text-muted-foreground">No comments yet</p>
                     </div>
                   )}
                   {comments.map((c, idx) => (
                    <div key={idx} className="relative group">
                       <div className="flex flex-col gap-1 pb-4">
                         <div className="flex items-center gap-2">
                           <span className="font-bold text-sm text-gray-800">{c.author.split("@")[0]}</span>
                           <span className="text-[11px] text-muted-foreground font-medium">• {c.time}</span>
                         </div>
                         <div className={cn("text-[13px] leading-relaxed p-3.5 rounded-lg border relative shadow-sm whitespace-pre-wrap", 
                           c.isSystem ? "bg-gray-50/50 border-gray-100 text-gray-600 italic" : "bg-white border-gray-100 text-gray-800"
                         )}>
                           <div dangerouslySetInnerHTML={{ __html: c.text }} className="rich-text-content" />
                         </div>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

       {/* Whats next banner */}
       {bill.status === "Draft" && (
         <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
           <Sparkles className="h-4 w-4 text-primary shrink-0" />
           <span className="text-sm text-muted-foreground">
             <strong className="text-foreground">WHAT'S NEXT?</strong> Mark this bill as open.
           </span>
           <Button size="sm" variant="outline" className="shrink-0 ml-auto" onClick={handleMarkAsOpen} disabled={updatingStatus}>Mark as Open</Button>
         </div>
       )}
       {(bill.status === "Open" || bill.status === "Overdue" || bill.status === "Partially Paid") && (
         <div className="flex items-center gap-3 px-5 py-3 border-b bg-white shrink-0">
           <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
           <span className="text-sm text-muted-foreground">
             <strong className="text-foreground">WHAT'S NEXT?</strong> Record a payment for this bill.
           </span>
           <Button size="sm" className="ml-auto bg-blue-600 hover:bg-blue-700" onClick={() => onRecordPayment(bill._id)}>Record Payment</Button>
         </div>
       )}

      {/* PDF toggle + content */}
      <div className="flex flex-1 overflow-hidden relative">
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
              {/* Dummy PDF View */}
              <div className="w-[800px] bg-white shadow-lg p-10 min-h-[1000px] border relative">
                 <div className="flex justify-between items-start mb-8">
                     <div>
                        <h1 className="text-3xl font-light text-gray-800 uppercase tracking-widest">BILL</h1>
                     </div>
                     <div className="text-right">
                        <h2 className="text-xl font-bold text-gray-800">{orgName}</h2>
                        <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{orgAddress}</p>
                     </div>
                 </div>
                 
                 <div className="flex justify-between items-end border-t border-b py-4 my-8">
                    <div className="w-1/2">
                       <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Bill To</p>
                       <p className="text-base font-medium">{getName(bill.vendorId)}</p>
                    </div>
                    <div className="w-1/2 flex flex-col items-end gap-2 text-sm">
                       <div className="flex w-48 justify-between">
                          <span className="text-gray-500">Bill#</span>
                          <span className="font-medium text-gray-900">{bill.billNumber}</span>
                       </div>
                       <div className="flex w-48 justify-between">
                          <span className="text-gray-500">Date</span>
                          <span className="font-medium text-gray-900">{new Date(bill.billDate).toLocaleDateString("en-IN")}</span>
                       </div>
                       {bill.dueDate && (
                         <div className="flex w-48 justify-between">
                            <span className="text-gray-500">Due Date</span>
                            <span className="font-medium text-gray-900">{new Date(bill.dueDate).toLocaleDateString("en-IN")}</span>
                         </div>
                       )}
                    </div>
                 </div>

                 <table className="w-full text-sm text-left mt-8">
                    <thead>
                       <tr className="border-b-2 border-gray-800 text-gray-700">
                          <th className="py-2 font-bold w-12">#</th>
                          <th className="py-2 font-bold">Item & Description</th>
                          <th className="py-2 font-bold text-right">Qty</th>
                          <th className="py-2 font-bold text-right">Rate</th>
                          <th className="py-2 font-bold text-right">Amount</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                       {bill.lineItems?.filter(i => !i.isHeader).map((item, i) => (
                           <tr key={i}>
                               <td className="py-3 text-gray-500">{i + 1}</td>
                               <td className="py-3 font-medium text-gray-900">
                                   {item.name}
                                   {item.description && <div className="text-xs text-gray-500 font-normal mt-0.5">{item.description}</div>}
                               </td>
                               <td className="py-3 text-right text-gray-600">{item.quantity}</td>
                               <td className="py-3 text-right text-gray-600">{fmtCur(item.rate)}</td>
                               <td className="py-3 text-right font-medium text-gray-900">{fmtCur(item.amount)}</td>
                           </tr>
                       ))}
                    </tbody>
                 </table>

                 <div className="flex justify-end mt-8">
                    <div className="w-1/2">
                       <div className="flex justify-between py-2 text-sm text-gray-600">
                          <span>Sub Total</span>
                          <span className="font-medium">{fmtCur(bill.subTotal || 0)}</span>
                       </div>
                       {(bill.taxAmount || 0) > 0 && (
                          <div className="flex justify-between py-2 text-sm text-gray-600">
                             <span>Tax</span>
                             <span className="font-medium">{fmtCur(bill.taxAmount || 0)}</span>
                          </div>
                       )}
                       {(bill.discountAmount || 0) > 0 && (
                          <div className="flex justify-between py-2 text-sm text-gray-600">
                             <span>Discount</span>
                             <span className="font-medium text-red-500">-{fmtCur(bill.discountAmount || 0)}</span>
                          </div>
                       )}
                       <div className="flex justify-between py-3 text-lg font-bold border-t-2 border-gray-800 mt-2 bg-gray-50 px-2">
                          <span>Total</span>
                          <span>₹ {fmtCur(bill.total || 0)}</span>
                       </div>
                       <div className="flex justify-between py-2 text-sm text-gray-500 px-2 mt-1">
                          <span>Balance Due</span>
                          <span className="font-bold text-gray-900">₹ {fmtCur(bill.balanceDue === undefined ? (bill.total || 0) : bill.balanceDue)}</span>
                       </div>
                    </div>
                 </div>

                 {bill.notes && (
                    <div className="mt-12 text-sm text-gray-600">
                       <p className="font-bold text-gray-800 mb-1">Notes</p>
                       <p className="whitespace-pre-line">{bill.notes}</p>
                    </div>
                 )}
                 {bill.termsAndConditions && (
                    <div className="mt-6 text-sm text-gray-600">
                       <p className="font-bold text-gray-800 mb-1">Terms & Conditions</p>
                       <p className="whitespace-pre-line">{bill.termsAndConditions}</p>
                    </div>
                 )}
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 space-y-4">
              <div className="bg-white rounded border p-5 text-sm space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground">Bill#</span> <span className="font-medium ml-2">{bill.billNumber}</span></div>
                  <div><span className="text-muted-foreground">Date</span> <span className="ml-2">{new Date(bill.billDate).toLocaleDateString("en-IN")}</span></div>
                  <div><span className="text-muted-foreground">Vendor</span> <span className="ml-2">{getName(bill.vendorId)}</span></div>
                  <div><span className="text-muted-foreground">Status</span> <span className={cn("ml-2 font-medium", statusColor[bill.status])}>{bill.status}</span></div>
                </div>
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground pb-6">
            PDF Template : 'Standard Template' <button type="button" className="text-primary hover:underline ml-1">Change</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function BillsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [bills, setBills] = useState<Bill[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | BillStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      const res = await billApi.list({ 
        page: 1, 
        limit: 100,
      });
      setBills(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchBills();
  }, [firebaseUser, loading, activeOrganization?._id, fetchBills]);

  const filtered = bills.filter((b) => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [(b.billNumber||""), (b.referenceNumber || ""), getName(b.vendorId)].some((v) => v.toLowerCase().includes(s));
  });

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

  const selectedBill = bills.find((b) => b._id === selectedId);

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
                    {filterStatus ? filterStatus + " Bills" : "All Bills"} <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => { setFilterStatus(""); setShowFilterDD(false); }}>All Bills</DropdownMenuItem>
                  {["Draft", "Open", "Overdue", "Partially Paid", "Paid", "Void"].map(s => (
                    <DropdownMenuItem key={s} onClick={() => { setFilterStatus(s as BillStatus); setShowFilterDD(false); }}>{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            actions={(
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-8 gap-1 text-sm bg-blue-600 hover:bg-blue-700" onClick={() => router.push("/purchases/bills/new")}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] p-0 overflow-hidden">
                    <DropdownMenuSeparator className="m-0" />
                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Download className="h-4 w-4 text-blue-600" />
                      <span>Import Bills</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />

          <div className="flex flex-1 overflow-hidden">
            {/* List side */}
            <div className={cn("flex-1 flex flex-col bg-white border-r", selectedId && "hidden lg:flex w-[320px] shrink-0")}>
              <div className="p-4 border-b space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search Bills"
                    className="pl-9 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {fetching ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm">Fetching bills...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4 px-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-300" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">No bills found</h3>
                      <p className="text-sm text-gray-500 mt-1">Try changing your filters or create a new bill.</p>
                    </div>
                    <Button onClick={() => router.push("/purchases/bills/new")} className="bg-blue-600">Create New Bill</Button>
                  </div>
                ) : (
                  <div className="divide-y overflow-hidden">
                    {filtered.map((b) => (
                      <div
                        key={b._id}
                        className={cn(
                          "p-4 cursor-pointer hover:bg-blue-50/50 transition-colors relative group",
                          selectedId === b._id && "bg-blue-50 shadow-inner"
                        )}
                        onClick={() => setSelectedId(b._id)}
                      >
                        {selectedId === b._id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-primary truncate max-w-[140px]">{getName(b.vendorId)}</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">₹{fmtCur(b.total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <span>{b.billNumber}</span>
                            <span>•</span>
                            <span>{new Date(b.billDate).toLocaleDateString("en-IN")}</span>
                          </div>
                          <span className={cn("text-[11px] font-bold uppercase tracking-wider", statusColor[b.status])}>{b.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Detail side */}
            <div className={cn("flex-1 bg-white overflow-hidden flex flex-col", !selectedId && "hidden lg:flex items-center justify-center")}>
              {selectedBill ? (
                 <BillDetailPanel
                    bill={selectedBill}
                    onClose={() => setSelectedId(null)}
                    onStatusChange={(id, st) => setBills(prev => prev.map(p => p._id === id ? { ...p, status: st } : p))}
                    onDelete={(o) => { setToDelete(o); setSelectedId(null); }}
                    onEdit={(id) => router.push("/purchases/bills/" + id + "/edit")}
                    onSendEmail={(id) => toast.info("Emailing not implemented yet")}
                    onPrint={() => { window.print(); }}
                    onDownloadPdf={async () => { toast.info("PDF downloading not implemented"); }}
                    onRecordPayment={(id) => toast.info("Recording payment for bill " + id)}
                    orgName={activeOrganization?.name || "Organization"}
                    orgAddress={[
                      activeOrganization?.address?.street,
                      activeOrganization?.address?.city,
                      activeOrganization?.address?.state,
                      activeOrganization?.address?.zip,
                      activeOrganization?.address?.country
                    ].filter(Boolean).join(", ")}
                    orgPhone={(activeOrganization as any)?.phone || ""}
                    orgEmail={(activeOrganization as any)?.email || ""}
                    orgCurrency={activeOrganization?.baseCurrency || "INR"}
                 />
              ) : (
                <div className="text-center space-y-4 max-w-sm px-8">
                  <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                    <FileText className="h-12 w-12 text-blue-200" />
                  </div>
                  <h3 className="text-xl font-bold">Select a bill to view details</h3>
                  <p className="text-muted-foreground">Choose a bill from the left list to see its details, line items, and manage its lifecycle.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete bill {toDelete?.billNumber}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Delete Bill
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
`;

fs.writeFileSync("app/purchases/bills/page.tsx", code);
