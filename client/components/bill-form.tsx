"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
   Plus, Search, Loader2, X, ChevronDown, GripVertical, Settings2, Upload, 
   Trash2, Info, CircleDot, ExternalLink, ShoppingBag as ShoppingBagIcon 
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms, type Tax, type TaxType } from "@/lib/api/settings";
import { billApi, type Bill, type CreateBillInput, type UpdateBillInput, type BillStatus, type DiscountLevel, type BillSourcePurchaseOrder } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax, type CreateTcsTaxInput, TCS_SECTIONS } from "@/lib/api/tcs-taxes";
import { cn } from "@/lib/utils";
import { uploadApi } from "@/lib/api/upload";

// --- Helpers ---
const TODAY = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtQty = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

function itemUnitLabel(item?: Item | null): string {
   if (!item?.unit) return "";
   if (typeof item.unit === "string") return item.unit;
   return (item.unit as any)?.abbreviation || "";
}

const NEW_VENDOR_OPTION = "__new_vendor__";
const NEW_LINE_TAX_OPTION = "__new_line_tax__";

const LINE_TAX_PRESETS: Array<{ name: string; description: string; rate: number }> = [
   {
      name: "Non-Taxable",
      description: "Supplies on which you do not charge GST or include in GST returns.",
      rate: 0,
   },
   {
      name: "Out of Scope",
      description: "Supplies on which you do not charge GST or include in GST returns.",
      rate: 0,
   },
   {
      name: "Non-GST Supply",
      description: "Supplies outside GST such as petroleum products and liquor.",
      rate: 0,
   },
];

const GST_GROUP_NAMES = ["GST0", "GST5", "GST12", "GST18", "GST28", "GST40"];

// --- Types ---
export interface LineRow {
  id: string;
  isHeader: boolean;
  headerText: string;
  itemId: string;
  itemName: string;
  accountId: string;
  accountName: string;
  description: string;
   customerId: string;
   customerName: string;
   taxId: string;
   taxName: string;
   taxRate: number;
   unit?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  amount: number;
}

const newRow = (): LineRow => ({
  id: Math.random().toString(36).slice(2),
  isHeader: false,
  headerText: "",
  itemId: "",
  itemName: "",
  accountId: "",
  accountName: "",
  description: "",
   customerId: "",
   customerName: "",
   taxId: "",
   taxName: "",
   taxRate: 0,
   unit: "",
  quantity: 1,
  rate: 0,
  discountPercent: 0,
  discountAmount: 0,
  amount: 0,
});

const newHeader = (): LineRow => ({ ...newRow(), isHeader: true, headerText: "Add New Header" });

function calcRow(row: LineRow, discountLevel: DiscountLevel): LineRow {
   if (row.isHeader) return { ...row, amount: 0 };
   const lineTotal = row.quantity * row.rate;
   if (discountLevel === "line_item") {
      const discAmt = row.discountPercent > 0 ? (lineTotal * row.discountPercent) / 100 : row.discountAmount;
      return { ...row, discountAmount: discAmt, amount: lineTotal - discAmt };
   }
   return { ...row, discountPercent: 0, discountAmount: 0, amount: lineTotal };
}

function ManageTDSDialog({
   open, onClose, tdsTaxes, onCreated,
}: {
   open: boolean;
   onClose: () => void;
   tdsTaxes: TdsTax[];
   onCreated: (t: TdsTax) => void;
}) {
   const [showNew, setShowNew] = useState(false);
   const [saving, setSaving] = useState(false);
   const [form, setForm] = useState<CreateTdsTaxInput>({
      taxName: "", rate: 0, sectionCode: "", sectionDescription: "",
      tdsPayableAccountId: null, tdsReceivableAccountId: null,
      isHigherRate: false, applicableStartDate: null, applicableEndDate: null,
   });
   const [accounts, setAccounts] = useState<Account[]>([]);
   const [showPayableDD, setShowPayableDD] = useState(false);
   const [showReceivableDD, setShowReceivableDD] = useState(false);
   const [payableSearch, setPayableSearch] = useState("");
   const [receivableSearch, setReceivableSearch] = useState("");

   useEffect(() => {
      if (open) {
         accountApi.list({ excludeGroups: true }).then((r) => setAccounts(r.data ?? [])).catch(() => {});
      }
   }, [open]);

   async function handleSave() {
      if (!form.taxName.trim()) { toast.error("Tax name is required"); return; }
      if (!form.sectionCode) { toast.error("Section is required"); return; }
      setSaving(true);
      try {
         const res = await tdsTaxApi.create(form);
         toast.success("TDS tax created");
         onCreated(res.data);
         setShowNew(false);
         setForm({ taxName: "", rate: 0, sectionCode: "", sectionDescription: "", tdsPayableAccountId: null, tdsReceivableAccountId: null, isHigherRate: false, applicableStartDate: null, applicableEndDate: null });
      } catch { toast.error("Failed to create TDS tax"); } finally { setSaving(false); }
   }

   const payableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(payableSearch.toLowerCase()));
   const receivableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(receivableSearch.toLowerCase()));
   const selectedPayable = accounts.find((a) => a._id === form.tdsPayableAccountId);
   const selectedReceivable = accounts.find((a) => a._id === form.tdsReceivableAccountId);

   return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle className="flex items-center justify-between">Manage TDS</DialogTitle>
            </DialogHeader>

            {!showNew ? (
               <>
                  <div className="flex items-center justify-between mb-4">
                     <h3 className="text-base font-semibold">TDS taxes</h3>
                     <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}>
                        <Plus className="h-3.5 w-3.5" /> New TDS Tax
                     </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                     <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                           <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                              <th className="text-left px-4 py-2.5 font-medium">Tax Name</th>
                              <th className="text-left px-4 py-2.5 font-medium">Rate (%)</th>
                              <th className="text-left px-4 py-2.5 font-medium">Section</th>
                              <th className="text-left px-4 py-2.5 font-medium">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y">
                           {tdsTaxes.length === 0 ? (
                              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No TDS taxes yet. Click "+ New TDS Tax" to add one.</td></tr>
                           ) : tdsTaxes.map((t) => (
                              <tr key={t._id}>
                                 <td className="px-4 py-2.5">{t.taxName}</td>
                                 <td className="px-4 py-2.5">{t.rate}</td>
                                 <td className="px-4 py-2.5 text-muted-foreground">Section {t.sectionCode}</td>
                                 <td className="px-4 py-2.5 text-green-600 font-medium">{t.isActive ? "Active" : "Inactive"}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </>
            ) : (
               <div className="space-y-5">
                  <h3 className="text-base font-semibold">New TDS</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label className="text-xs font-medium text-red-500">Tax Name *</Label>
                        <Input className="mt-1 h-9 text-sm" value={form.taxName} onChange={(e) => setForm((f) => ({ ...f, taxName: e.target.value }))} />
                     </div>
                     <div>
                        <Label className="text-xs font-medium text-red-500">Rate (%) *</Label>
                        <Input className="mt-1 h-9 text-sm" type="number" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))} />
                     </div>
                  </div>
                  <div>
                     <Label className="text-xs font-medium text-red-500">Section *</Label>
                     <Select value={form.sectionCode} onValueChange={(v) => setForm((f) => ({ ...f, sectionCode: v }))}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                           <SelectValue placeholder="Select a Tax Type." />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                           {TDS_SECTIONS.map((s) => (
                              <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="bg-blue-50 rounded p-3 text-xs text-blue-700 flex gap-2">
                     <Info className="h-4 w-4 shrink-0 mt-0.5" />
                     <span>By default, TDS will be tracked under <strong>TDS Payable</strong> and <strong>TDS Receivable</strong> accounts. Click Edit to choose an account of your choice.</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label className="text-xs font-medium">TDS Payable Account</Label>
                        <div className="relative mt-1">
                           <button type="button" className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30" onClick={() => setShowPayableDD((v) => !v)}>
                              <span className={selectedPayable ? "" : "text-muted-foreground"}>{selectedPayable ? selectedPayable.name : "Select an account"}</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           </button>
                           {showPayableDD && (
                              <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                                 <div className="p-2 border-b">
                                    <Input className="h-7 text-xs" placeholder="Search" value={payableSearch} onChange={(e) => setPayableSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-48 overflow-y-auto">
                                    {payableAccounts.map((a) => (
                                       <button key={a._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.tdsPayableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")}
                                          onClick={() => { setForm((f) => ({ ...f, tdsPayableAccountId: a._id })); setShowPayableDD(false); setPayableSearch(""); }}>
                                          <div className="text-xs text-muted-foreground">{a.accountType}</div>
                                          {a.name}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                     <div>
                        <Label className="text-xs font-medium">TDS Receivable Account</Label>
                        <div className="relative mt-1">
                           <button type="button" className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30" onClick={() => setShowReceivableDD((v) => !v)}>
                              <span className={selectedReceivable ? "" : "text-muted-foreground"}>{selectedReceivable ? selectedReceivable.name : "Select an account"}</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           </button>
                           {showReceivableDD && (
                              <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                                 <div className="p-2 border-b">
                                    <Input className="h-7 text-xs" placeholder="Search" value={receivableSearch} onChange={(e) => setReceivableSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-48 overflow-y-auto">
                                    {receivableAccounts.map((a) => (
                                       <button key={a._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.tdsReceivableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")}
                                          onClick={() => { setForm((f) => ({ ...f, tdsReceivableAccountId: a._id })); setShowReceivableDD(false); setReceivableSearch(""); }}>
                                          <div className="text-xs text-muted-foreground">{a.accountType}</div>
                                          {a.name}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <Checkbox id="isHigherRate" checked={form.isHigherRate} onCheckedChange={(c) => setForm((f) => ({ ...f, isHigherRate: !!c }))} />
                     <label htmlFor="isHigherRate" className="text-sm cursor-pointer">This is a Higher TDS Rate</label>
                  </div>
                  <div>
                     <h4 className="text-sm font-semibold mb-3">Applicable Period</h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label className="text-xs text-muted-foreground">Start Date</Label>
                           <Input type="date" className="mt-1 h-9 text-sm" value={form.applicableStartDate || ""} onChange={(e) => setForm((f) => ({ ...f, applicableStartDate: e.target.value || null }))} />
                        </div>
                        <div>
                           <Label className="text-xs text-muted-foreground">End Date</Label>
                           <Input type="date" className="mt-1 h-9 text-sm" value={form.applicableEndDate || ""} onChange={(e) => setForm((f) => ({ ...f, applicableEndDate: e.target.value || null }))} />
                        </div>
                     </div>
                  </div>
                  <DialogFooter>
                     <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
                     <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save
                     </Button>
                  </DialogFooter>
               </div>
            )}
         </DialogContent>
      </Dialog>
   );
}

function ManageTCSDialog({
   open, onClose, tcsTaxes, onCreated,
}: {
   open: boolean;
   onClose: () => void;
   tcsTaxes: TcsTax[];
   onCreated: (t: TcsTax) => void;
}) {
   const [showNew, setShowNew] = useState(false);
   const [saving, setSaving] = useState(false);
   const [form, setForm] = useState<CreateTcsTaxInput>({
      taxName: "", rate: 0, sectionCode: "", sectionDescription: "",
      tcsPayableAccountId: null, tcsReceivableAccountId: null,
      isHigherRate: false, applicableStartDate: null, applicableEndDate: null,
   });
   const [accounts, setAccounts] = useState<Account[]>([]);
   const [showPayableDD, setShowPayableDD] = useState(false);
   const [showReceivableDD, setShowReceivableDD] = useState(false);
   const [payableSearch, setPayableSearch] = useState("");
   const [receivableSearch, setReceivableSearch] = useState("");

   useEffect(() => {
      if (open) {
         accountApi.list({ excludeGroups: true }).then((r) => setAccounts(r.data ?? [])).catch(() => {});
      }
   }, [open]);

   async function handleSave() {
      if (!form.taxName.trim()) { toast.error("Tax name is required"); return; }
      if (!form.sectionCode) { toast.error("Section is required"); return; }
      setSaving(true);
      try {
         const res = await tcsTaxApi.create(form);
         toast.success("TCS tax created");
         onCreated(res.data);
         setShowNew(false);
         setForm({ taxName: "", rate: 0, sectionCode: "", sectionDescription: "", tcsPayableAccountId: null, tcsReceivableAccountId: null, isHigherRate: false, applicableStartDate: null, applicableEndDate: null });
      } catch { toast.error("Failed to create TCS tax"); } finally { setSaving(false); }
   }

   const payableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(payableSearch.toLowerCase()));
   const receivableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(receivableSearch.toLowerCase()));
   const selectedPayable = accounts.find((a) => a._id === form.tcsPayableAccountId);
   const selectedReceivable = accounts.find((a) => a._id === form.tcsReceivableAccountId);

   return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle className="flex items-center justify-between">Manage TCS</DialogTitle>
            </DialogHeader>

            {!showNew ? (
               <>
                  <div className="flex items-center justify-between mb-4">
                     <h3 className="text-base font-semibold">TCS taxes</h3>
                     <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}>
                        <Plus className="h-3.5 w-3.5" /> New TCS Tax
                     </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                     <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                           <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                              <th className="text-left px-4 py-2.5 font-medium">Tax Name</th>
                              <th className="text-left px-4 py-2.5 font-medium">Rate (%)</th>
                              <th className="text-left px-4 py-2.5 font-medium">Section</th>
                              <th className="text-left px-4 py-2.5 font-medium">Status</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y">
                           {tcsTaxes.length === 0 ? (
                              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No TCS taxes yet. Click "+ New TCS Tax" to add one.</td></tr>
                           ) : tcsTaxes.map((t) => (
                              <tr key={t._id}>
                                 <td className="px-4 py-2.5">{t.taxName}</td>
                                 <td className="px-4 py-2.5">{t.rate}</td>
                                 <td className="px-4 py-2.5 text-muted-foreground">Section {t.sectionCode}</td>
                                 <td className="px-4 py-2.5 text-green-600 font-medium">{t.isActive ? "Active" : "Inactive"}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </>
            ) : (
               <div className="space-y-5">
                  <h3 className="text-base font-semibold">New TCS</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label className="text-xs font-medium text-red-500">Tax Name *</Label>
                        <Input className="mt-1 h-9 text-sm" value={form.taxName} onChange={(e) => setForm((f) => ({ ...f, taxName: e.target.value }))} />
                     </div>
                     <div>
                        <Label className="text-xs font-medium text-red-500">Rate (%) *</Label>
                        <Input className="mt-1 h-9 text-sm" type="number" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))} />
                     </div>
                  </div>
                  <div>
                     <Label className="text-xs font-medium text-red-500">Nature of Collection *</Label>
                     <Select value={form.sectionCode} onValueChange={(v) => setForm((f) => ({ ...f, sectionCode: v }))}>
                        <SelectTrigger className="mt-1 h-9 text-sm">
                           <SelectValue placeholder="Select a Tax Type." />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                           {TCS_SECTIONS.map((s) => (
                              <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label className="text-xs font-medium">TCS Payable Account</Label>
                        <div className="relative mt-1">
                           <button type="button" className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30" onClick={() => setShowPayableDD((v) => !v)}>
                              <span className={selectedPayable ? "" : "text-muted-foreground"}>{selectedPayable ? selectedPayable.name : "Select an account"}</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           </button>
                           {showPayableDD && (
                              <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                                 <div className="p-2 border-b">
                                    <Input className="h-7 text-xs" placeholder="Search" value={payableSearch} onChange={(e) => setPayableSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-48 overflow-y-auto">
                                    {payableAccounts.map((a) => (
                                       <button key={a._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.tcsPayableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")}
                                          onClick={() => { setForm((f) => ({ ...f, tcsPayableAccountId: a._id })); setShowPayableDD(false); setPayableSearch(""); }}>
                                          <div className="text-xs text-muted-foreground">{a.accountType}</div>
                                          {a.name}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                     <div>
                        <Label className="text-xs font-medium">TCS Receivable Account</Label>
                        <div className="relative mt-1">
                           <button type="button" className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30" onClick={() => setShowReceivableDD((v) => !v)}>
                              <span className={selectedReceivable ? "" : "text-muted-foreground"}>{selectedReceivable ? selectedReceivable.name : "Select an account"}</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           </button>
                           {showReceivableDD && (
                              <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                                 <div className="p-2 border-b">
                                    <Input className="h-7 text-xs" placeholder="Search" value={receivableSearch} onChange={(e) => setReceivableSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-48 overflow-y-auto">
                                    {receivableAccounts.map((a) => (
                                       <button key={a._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.tcsReceivableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")}
                                          onClick={() => { setForm((f) => ({ ...f, tcsReceivableAccountId: a._id })); setShowReceivableDD(false); setReceivableSearch(""); }}>
                                          <div className="text-xs text-muted-foreground">{a.accountType}</div>
                                          {a.name}
                                       </button>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <Checkbox id="isHigherRateTcs" checked={form.isHigherRate} onCheckedChange={(c) => setForm((f) => ({ ...f, isHigherRate: !!c }))} />
                     <label htmlFor="isHigherRateTcs" className="text-sm cursor-pointer">This is a Higher TCS Rate</label>
                  </div>
                  <div>
                     <h4 className="text-sm font-semibold mb-3">Applicable Period</h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <Label className="text-xs text-muted-foreground">Start Date</Label>
                           <Input type="date" className="mt-1 h-9 text-sm" value={form.applicableStartDate || ""} onChange={(e) => setForm((f) => ({ ...f, applicableStartDate: e.target.value || null }))} />
                        </div>
                        <div>
                           <Label className="text-xs text-muted-foreground">End Date</Label>
                           <Input type="date" className="mt-1 h-9 text-sm" value={form.applicableEndDate || ""} onChange={(e) => setForm((f) => ({ ...f, applicableEndDate: e.target.value || null }))} />
                        </div>
                     </div>
                  </div>
                  <DialogFooter>
                     <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
                     <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save
                     </Button>
                  </DialogFooter>
               </div>
            )}
         </DialogContent>
      </Dialog>
   );
}

function ItemSelectorPopup({
   items,
   onSelect,
   onCreateItem,
}: {
   items: Item[];
   onSelect: (item: Item) => void;
   onCreateItem?: (name: string) => void | Promise<void>;
}) {
   const [q, setQ] = useState("");
   const query = q.trim().toLowerCase();
   const filtered = items.filter((i) => {
      const unit = itemUnitLabel(i).toLowerCase();
      return i.name.toLowerCase().includes(query)
         || (i.sku || "").toLowerCase().includes(query)
         || unit.includes(query);
   });
   const normalizedQuery = q.trim().toLowerCase();
   const exactExists = normalizedQuery.length > 0
      && items.some((i) => i.name.trim().toLowerCase() === normalizedQuery);
   const canCreate = Boolean(onCreateItem) && !exactExists;

   return (
      <div className="w-full overflow-hidden">
         <div className="p-2 border-b">
            <Input className="h-7 text-xs" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
         </div>
         <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
               <p className="text-xs text-muted-foreground text-center py-4">No items found</p>
            ) : filtered.map((item) => (
               <button
                  key={item._id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-start justify-between gap-3"
                  onClick={() => onSelect(item)}
               >
                  <div className="min-w-0">
                     <div className="text-sm font-medium truncate">{item.name}</div>
                     <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.sku ? `SKU: ${item.sku} | ` : ""}
                        {item.inventoryTracked
                           ? `Stock: ${fmtQty(item.stockOnHand)}${itemUnitLabel(item) ? ` ${itemUnitLabel(item)}` : ""}`
                           : "Non-tracked item"}
                     </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{fmt(item.costPrice || 0)}</span>
               </button>
            ))}
         </div>
         <div className="p-2 border-t text-center">
            <button
               type="button"
               className="text-xs font-semibold text-primary hover:underline disabled:opacity-60 disabled:no-underline"
               disabled={!canCreate}
               onClick={() => {
                  if (!onCreateItem) return;
                  void onCreateItem(q.trim());
               }}
            >
               {exactExists
                  ? "Item already exists"
                  : q.trim()
                     ? `+ Create \"${q.trim()}\"`
                     : "+ Create New Item"}
            </button>
         </div>
      </div>
   );
}

function AccountDropdown({
   value,
   onChange,
   accounts,
}: {
   value: string;
   onChange: (id: string, name: string) => void;
   accounts: Account[];
}) {
   const [open, setOpen] = useState(false);
   const [q, setQ] = useState("");
   const selected = accounts.find((a) => a._id === value);

   const grouped = accounts
      .filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
      .reduce<Record<string, Account[]>>((acc, a) => {
         const g = a.accountType || "Other";
         if (!acc[g]) acc[g] = [];
         acc[g].push(a);
         return acc;
      }, {});

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 text-sm text-left hover:text-primary">
               <span className={selected ? "" : "text-muted-foreground"}>{selected ? selected.name : "Select an account"}</span>
               <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-64 p-0 overflow-hidden">
            <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
               <Input className="h-7 text-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div className="max-h-64 overflow-y-auto">
               {Object.entries(grouped).map(([group, accs]) => (
                  <div key={group}>
                     <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">{group}</div>
                     {accs.map((a) => (
                        <button
                           key={a._id}
                           type="button"
                           className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", value === a._id && "bg-primary/10 text-primary font-medium")}
                           onClick={() => { onChange(a._id, a.name); setOpen(false); setQ(""); }}
                        >
                           {a.name}
                        </button>
                     ))}
                  </div>
               ))}
               {Object.keys(grouped).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No accounts found</p>
               )}
            </div>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

function VendorSearchDialog({
   open,
   onClose,
   vendors,
   onSelect,
   onCreateNew,
}: {
   open: boolean;
   onClose: () => void;
   vendors: Contact[];
   onSelect: (vendor: Contact) => void;
   onCreateNew: (qName: string) => void;
}) {
   const [q, setQ] = useState("");

   useEffect(() => {
      if (open) setQ("");
   }, [open]);

   const filtered = vendors.filter((v) => {
      const name = v.displayName || v.companyName || "";
      const email = v.email || "";
      const query = q.trim().toLowerCase();
      if (!query) return true;
      return name.toLowerCase().includes(query) || email.toLowerCase().includes(query);
   });

   return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
         <DialogContent className="max-w-lg">
            <DialogHeader>
               <DialogTitle>Select Vendor</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
               <Input
                  className="h-9"
                  placeholder="Search vendor by name or email"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
               />

               <div className="border rounded-md max-h-72 overflow-y-auto">
                  {filtered.length === 0 ? (
                     <p className="text-xs text-muted-foreground text-center py-6">No vendors found</p>
                  ) : (
                     filtered.map((v) => (
                        <button
                           key={v._id}
                           type="button"
                           className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/40 border-b last:border-b-0"
                           onClick={() => {
                              onSelect(v);
                              onClose();
                           }}
                        >
                           <div className="font-medium">{v.displayName || v.companyName}</div>
                           {v.email && <div className="text-xs text-muted-foreground">{v.email}</div>}
                        </button>
                     ))
                  )}
               </div>
            </div>

            <DialogFooter>
               <Button type="button" variant="outline" onClick={onClose}>Close</Button>
               <Button
                  type="button"
                  className="gap-1"
                  onClick={() => {
                     onClose();
                     onCreateNew(q.trim());
                  }}
               >
                  <Plus className="h-3.5 w-3.5" />
                  New Vendor
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function QuickCreateVendorDialog({
   open,
   onClose,
   onCreated,
}: {
   open: boolean;
   onClose: () => void;
   onCreated: (vendor: Contact) => void;
}) {
   const [saving, setSaving] = useState(false);
   const [displayName, setDisplayName] = useState("");
   const [companyName, setCompanyName] = useState("");
   const [email, setEmail] = useState("");
   const [phone, setPhone] = useState("");

   useEffect(() => {
      if (!open) return;
      setDisplayName("");
      setCompanyName("");
      setEmail("");
      setPhone("");
      setSaving(false);
   }, [open]);

   async function handleCreateVendor() {
      const name = displayName.trim();
      if (!name) {
         toast.error("Vendor name is required");
         return;
      }

      setSaving(true);
      try {
         const res = await contactApi.create({
            contactType: "Vendor",
            displayName: name,
            companyName: companyName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
         });
         onCreated(res.data);
         toast.success("Vendor created");
         onClose();
      } catch {
         toast.error("Failed to create vendor");
      } finally {
         setSaving(false);
      }
   }

   return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
         <DialogContent className="max-w-md">
            <DialogHeader>
               <DialogTitle>New Vendor</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
               <div>
                  <Label className="text-xs font-medium text-red-500">Vendor Name *</Label>
                  <Input className="mt-1 h-9" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
               </div>
               <div>
                  <Label className="text-xs font-medium">Company Name</Label>
                  <Input className="mt-1 h-9" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                     <Label className="text-xs font-medium">Email</Label>
                     <Input className="mt-1 h-9" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                     <Label className="text-xs font-medium">Phone</Label>
                     <Input className="mt-1 h-9" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
               </div>
            </div>

            <DialogFooter>
               <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
               <Button type="button" onClick={handleCreateVendor} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save Vendor
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function QuickCreateTaxDialog({
   open,
   onClose,
   onCreated,
}: {
   open: boolean;
   onClose: () => void;
   onCreated: (tax: Tax) => void;
}) {
   const [saving, setSaving] = useState(false);
   const [name, setName] = useState("");
   const [rate, setRate] = useState(0);
   const [taxType, setTaxType] = useState<TaxType>("Tax");

   useEffect(() => {
      if (!open) return;
      setName("");
      setRate(0);
      setTaxType("Tax");
      setSaving(false);
   }, [open]);

   async function handleCreateTax() {
      const taxName = name.trim();
      if (!taxName) {
         toast.error("Tax name is required");
         return;
      }
      if (rate < 0) {
         toast.error("Tax rate cannot be negative");
         return;
      }

      setSaving(true);
      try {
         const res = await settingsApi.taxes.create({
            name: taxName,
            rate,
            taxType,
            taxAuthority: "GST",
            isActive: true,
         });
         toast.success("Tax created");
         onCreated(res.data);
         onClose();
      } catch {
         toast.error("Failed to create tax");
      } finally {
         setSaving(false);
      }
   }

   return (
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
         <DialogContent className="max-w-md">
            <DialogHeader>
               <DialogTitle>New Tax</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
               <div>
                  <Label className="text-xs font-medium text-red-500">Tax Name *</Label>
                  <Input className="mt-1 h-9" value={name} onChange={(e) => setName(e.target.value)} />
               </div>
               <div>
                  <Label className="text-xs font-medium text-red-500">Rate (%) *</Label>
                  <Input
                     className="mt-1 h-9"
                     type="number"
                     min={0}
                     step="0.01"
                     value={rate}
                     onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
                  />
               </div>
               <div>
                  <Label className="text-xs font-medium">Tax Type</Label>
                  <Select value={taxType} onValueChange={(value) => setTaxType(value as TaxType)}>
                     <SelectTrigger className="mt-1 h-9">
                        <SelectValue placeholder="Select a Tax Type" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="Tax">Tax</SelectItem>
                        <SelectItem value="TaxGroup">Tax Group</SelectItem>
                        <SelectItem value="CompoundTax">Compound Tax</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
            </div>

            <DialogFooter>
               <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
               <Button type="button" onClick={handleCreateTax} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

interface BillFormProps {
  initialData?: Bill;
  onSuccess: (bill: Bill) => void;
  onCancel: () => void;
  mode: "create" | "edit";
}

export function BillForm(props: BillFormProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground text-sm">Loading form...</div>}>
      <BillFormInner {...props} />
    </Suspense>
  );
}

export function BillFormInner({ initialData, onSuccess, onCancel, mode }: BillFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const defaultVendorId = searchParams.get("vendorId") || searchParams.get("newVendorId");
  const defaultPurchaseOrderId = searchParams.get("purchaseOrderId");
  const shouldAutoImportFromPurchaseOrder = searchParams.get("autoImport") === "1";
  const [saving, setSaving] = useState(false);
  const [loadingClone, setLoadingClone] = useState(false);
  
  // Basic Fields
  const [vendorId, setVendorId] = useState(initialData?.vendorId?._id || initialData?.vendorId || "");

  useEffect(() => {
     if (!initialData && defaultVendorId) {
        setVendorId(defaultVendorId);
     }
     if (cloneId) {
        setLoadingClone(true);
     }
  }, [initialData, defaultVendorId, cloneId]);
  const [billNumber, setBillNumber] = useState(initialData?.billNumber || "");
   const [referenceNumber, setReferenceNumber] = useState(initialData?.referenceNumber || "");
  const [orderNumber, setOrderNumber] = useState(initialData?.orderNumber || "");
  const [billDate, setBillDate] = useState(initialData?.billDate ? initialData.billDate.split("T")[0] : TODAY());
  const [dueDate, setDueDate] = useState(initialData?.dueDate ? initialData.dueDate.split("T")[0] : "");
  const [paymentTermsId, setPaymentTermsId] = useState(initialData?.paymentTermsId?._id || initialData?.paymentTermsId || "");
   const [accountsPayableId, setAccountsPayableId] = useState(
      initialData?.accountsPayableId?._id || initialData?.accountsPayableId || "",
   );
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>(initialData?.discountLevel || "transaction");
   const [discountAccountId, setDiscountAccountId] = useState(initialData?.discountAccountId?._id || initialData?.discountAccountId || "");
   const [discountType, setDiscountType] = useState<"%" | "₹">("%");
  
  // Table Rows
  const [rows, setRows] = useState<LineRow[]>([]);

  // Totals & Taxes
  const [discountPercent, setDiscountPercent] = useState(0);
   const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">(initialData?.taxType || "TDS");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
   const [notes, setNotes] = useState(initialData?.notes || "");
   const [terms, setTerms] = useState(initialData?.termsAndConditions || "");
   const [attachments, setAttachments] = useState<any[]>([]);
   const [uploading, setUploading] = useState(false);
   const fileInputRef = useRef<HTMLInputElement>(null);

   const [itemSelectorRow, setItemSelectorRow] = useState<string | null>(null);
   const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
   const [showBulkActions, setShowBulkActions] = useState(false);
   const [showDiscountTypeDD, setShowDiscountTypeDD] = useState(false);
   const [showTaxDD, setShowTaxDD] = useState(false);
   const [showTCSDD, setShowTCSDD] = useState(false);
   const [tdsSearch, setTdsSearch] = useState("");
   const [tcsSearch, setTcsSearch] = useState("");
   const [showManageTDS, setShowManageTDS] = useState(false);
   const [showManageTCS, setShowManageTCS] = useState(false);
   const [showVendorSearch, setShowVendorSearch] = useState(false);
   const [showCreateVendor, setShowCreateVendor] = useState(false);
   const [showCreateLineTax, setShowCreateLineTax] = useState(false);
   const [pendingTaxRowId, setPendingTaxRowId] = useState<string | null>(null);

    const [pendingItemSelection, setPendingItemSelection] = useState<{ rowId: string; itemId: string; rows: LineRow[] } | null>(null);

    const saveDraftToLocalStorage = (pendingRowId?: string) => {
       const draft = {
          vendorId,
          billNumber,
          referenceNumber,
          orderNumber,
          billDate,
          dueDate,
          paymentTermsId,
          accountsPayableId,
          subject,
          discountLevel,
          discountAccountId,
          discountType,
          discountPercent,
          rows,
          taxType,
          tdsId,
          tcsId,
          adjustmentLabel,
          adjustmentAmount,
          notes,
          terms,
          attachments,
          pendingRowId,
       };
       localStorage.setItem("draft_bill_form", JSON.stringify(draft));
    };

    useEffect(() => {
       const saved = localStorage.getItem("draft_bill_form");
       if (saved) {
          try {
             const draft = JSON.parse(saved);
             if (draft.vendorId) setVendorId(draft.vendorId);
             if (draft.billNumber) setBillNumber(draft.billNumber);
             if (draft.referenceNumber) setReferenceNumber(draft.referenceNumber);
             if (draft.orderNumber) setOrderNumber(draft.orderNumber);
             if (draft.billDate) setBillDate(draft.billDate);
             if (draft.dueDate) setDueDate(draft.dueDate);
             if (draft.paymentTermsId) setPaymentTermsId(draft.paymentTermsId);
             if (draft.accountsPayableId) setAccountsPayableId(draft.accountsPayableId);
             if (draft.subject) setSubject(draft.subject);
             if (draft.discountLevel) setDiscountLevel(draft.discountLevel);
             if (draft.discountAccountId) setDiscountAccountId(draft.discountAccountId);
             if (draft.discountType) setDiscountType(draft.discountType);
             if (draft.discountPercent !== undefined) setDiscountPercent(draft.discountPercent);
             if (draft.rows) setRows(draft.rows);
             if (draft.taxType) setTaxType(draft.taxType);
             if (draft.tdsId) setTdsId(draft.tdsId);
             if (draft.tcsId) setTcsId(draft.tcsId);
             if (draft.adjustmentLabel) setAdjustmentLabel(draft.adjustmentLabel);
             if (draft.adjustmentAmount !== undefined) setAdjustmentAmount(draft.adjustmentAmount);
             if (draft.notes) setNotes(draft.notes);
             if (draft.terms) setTerms(draft.terms);
             if (draft.attachments) setAttachments(draft.attachments);

             const urlParams = new URLSearchParams(window.location.search);
             const newVendorId = urlParams.get("newVendorId");
             const createdItemId = urlParams.get("createdItemId");

             if (newVendorId) {
                setVendorId(newVendorId);
             }

             if (createdItemId && draft.pendingRowId && draft.rows) {
                setPendingItemSelection({
                   rowId: draft.pendingRowId,
                   itemId: createdItemId,
                   rows: draft.rows,
                });
             }
          } catch (e) {
             console.error("Error restoring draft bill form", e);
          } finally {
             localStorage.removeItem("draft_bill_form");
             const cleanUrl = window.location.pathname + (defaultPurchaseOrderId ? `?purchaseOrderId=${defaultPurchaseOrderId}` : "");
             window.history.replaceState({}, document.title, cleanUrl);
          }
       }
    }, [defaultPurchaseOrderId]);

  // Initialize from initialData or newRow
  useEffect(() => {
    if (initialData) {
         setReferenceNumber(initialData.referenceNumber || "");
         setAccountsPayableId(initialData.accountsPayableId?._id || initialData.accountsPayableId || "");
      setDiscountPercent(initialData.discountPercent || 0);
         setDiscountAccountId(initialData.discountAccountId?._id || initialData.discountAccountId || "");
      setTaxType(initialData.taxType || "none");
      setTdsId(initialData.tdsId?._id || initialData.tdsId || "");
      setTcsId(initialData.tcsId?._id || initialData.tcsId || "");
      setAdjustmentLabel(initialData.adjustmentLabel || "Adjustment");
      setAdjustmentAmount(initialData.adjustmentAmount || 0);
         setNotes(initialData.notes || "");
         setTerms(initialData.termsAndConditions || "");
         setAttachments((initialData.attachments || []).map((url) => ({ url, publicId: "" })));
      setRows(initialData.lineItems?.map(li => ({
          id: (li as any)._id || Math.random().toString(36).slice(2),
          isHeader: !!li.isHeader,
          headerText: li.headerText || "",
          itemId: typeof li.itemId === 'object' ? (li.itemId as any)?._id : (li.itemId || ""),
          itemName: typeof li.itemId === 'object' ? (li.itemId as any)?.name : (li.name || ""),
          accountId: typeof li.accountId === 'object' ? (li.accountId as any)?._id : (li.accountId || ""),
          accountName: typeof li.accountId === 'object' ? (li.accountId as any)?.name : "",
          description: li.description || "",
          customerId: typeof li.customerId === 'object' ? (li.customerId as any)?._id : (li.customerId || ""),
          customerName: typeof li.customerId === 'object'
             ? ((li.customerId as any)?.displayName || (li.customerId as any)?.companyName || "")
             : "",
          taxId: typeof li.taxId === 'object' ? (li.taxId as any)?._id : (li.taxId || ""),
          taxName: typeof li.taxId === 'object' ? ((li.taxId as any)?.name || li.taxName || "") : (li.taxName || ""),
          taxRate: typeof li.taxId === 'object'
             ? Number((li.taxId as any)?.rate ?? li.taxRate ?? 0)
             : Number(li.taxRate || 0),
          quantity: li.quantity || 1,
          rate: li.rate || 0,
          discountPercent: li.discountPercent || 0,
          discountAmount: li.discountAmount || 0,
          amount: li.amount || 0,
       })) || [newRow()]);
    } else {
      setRows([newRow()]);
    }
  }, [initialData]);

  // Lists
  const [vendors, setVendors] = useState<Contact[]>([]);
   const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
   const [lineTaxes, setLineTaxes] = useState<Tax[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
   const [openPurchaseOrders, setOpenPurchaseOrders] = useState<BillSourcePurchaseOrder[]>([]);
   const [loadingOpenPurchaseOrders, setLoadingOpenPurchaseOrders] = useState(false);
   const [linkedPurchaseOrderId, setLinkedPurchaseOrderId] = useState("");

  useEffect(() => {
     const loadData = async () => {
        try {
           const [vRes, cRes, iRes, ptRes, accRes, gstTaxRes, tdsRes, tcsRes] = await Promise.all([
              contactApi.list({ type: "Vendor", limit: 1000 }),
              contactApi.list({ type: "Customer", limit: 1000 }),
              itemApi.list({ limit: 1000 }),
              settingsApi.paymentTerms.list(),
              accountApi.list({ excludeGroups: true }),
              settingsApi.taxes.list(),
              tdsTaxApi.list(),
              tcsTaxApi.list(),
           ]);
                setVendors(vRes.data || []);
                setCustomers(cRes.data || []);
                setItems(iRes.data || []);
                setPaymentTerms(ptRes.data || []);
                setAccounts(accRes.data || []);

                let nextLineTaxes = gstTaxRes.data || [];
                if (nextLineTaxes.length === 0) {
                   await settingsApi.taxes.seed();
                   const seeded = await settingsApi.taxes.list();
                   nextLineTaxes = seeded.data || [];
                }
                setLineTaxes(nextLineTaxes.filter((t) => t.isActive));

                let nextTds = tdsRes.data || [];
                let nextTcs = tcsRes.data || [];
                if (nextTds.length === 0) {
                   await tdsTaxApi.seed();
                   const seeded = await tdsTaxApi.list();
                   nextTds = seeded.data || [];
                }
                if (nextTcs.length === 0) {
                   await tcsTaxApi.seed();
                   const seeded = await tcsTaxApi.list();
                   nextTcs = seeded.data || [];
                }
                setTdsTaxes(nextTds);
                setTcsTaxes(nextTcs);

           if (cloneId) {
             const { data: bill } = await billApi.getOne(cloneId);
             setVendorId(bill.vendorId?._id || bill.vendorId || "");
             setOrderNumber(bill.orderNumber || "");
            setReferenceNumber(bill.referenceNumber || "");
             setSubject(bill.subject || "");
             setDiscountLevel(bill.discountLevel || "transaction");
             setDiscountPercent(bill.discountPercent || 0);
            setDiscountAccountId(bill.discountAccountId?._id || bill.discountAccountId || "");
               setAccountsPayableId(bill.accountsPayableId?._id || bill.accountsPayableId || "");
             setTaxType(bill.taxType || "none");
             setTdsId(bill.tdsId?._id || bill.tdsId || "");
             setTcsId(bill.tcsId?._id || bill.tcsId || "");
             setPaymentTermsId(bill.paymentTermsId?._id || bill.paymentTermsId || "");
             setAdjustmentLabel(bill.adjustmentLabel || "Adjustment");
             setAdjustmentAmount(bill.adjustmentAmount || 0);
            setNotes(bill.notes || "");
            setTerms(bill.termsAndConditions || "");
            setAttachments((bill.attachments || []).map((url: string) => ({ url, publicId: "" })));
             setRows(bill.lineItems?.map((li: any) => ({
                id: Math.random().toString(36).slice(2),
                isHeader: !!li.isHeader,
                headerText: li.headerText || "",
                itemId: typeof li.itemId === 'object' ? li.itemId?._id : (li.itemId || ""),
                itemName: typeof li.itemId === 'object' ? li.itemId?.name : (li.name || ""),
                accountId: typeof li.accountId === 'object' ? li.accountId?._id : (li.accountId || ""),
                accountName: typeof li.accountId === 'object' ? li.accountId?.name : "",
                description: li.description || "",
                customerId: typeof li.customerId === 'object' ? li.customerId?._id : (li.customerId || ""),
                customerName: typeof li.customerId === 'object' ? (li.customerId?.displayName || li.customerId?.companyName || "") : "",
                taxId: typeof li.taxId === 'object' ? li.taxId?._id : (li.taxId || ""),
                taxName: typeof li.taxId === 'object' ? (li.taxId?.name || li.taxName || "") : (li.taxName || ""),
                taxRate: typeof li.taxId === 'object' ? Number(li.taxId?.rate ?? li.taxRate ?? 0) : Number(li.taxRate || 0),
                quantity: li.quantity || 1,
                rate: li.rate || 0,
                discountPercent: li.discountPercent || 0,
                discountAmount: li.discountAmount || 0,
                amount: li.amount || 0,
             })) || [newRow()]);
             setLoadingClone(false);
           }

           if (mode === "create") {
              const numRes = await billApi.getNextNumber();
              setBillNumber(numRes.data.billNumber);
           }
        } catch (err) { toast.error("Failed to load form data"); setLoadingClone(false); }
     };
     loadData();
  }, [mode, cloneId]);

  // Calculations
  const subTotal = rows.filter((r) => !r.isHeader).reduce((acc, r) => acc + r.amount, 0);
  const discountAmt = discountLevel === "transaction"
    ? (discountType === "%" ? (subTotal * discountPercent) / 100 : discountPercent)
    : rows.filter((r) => !r.isHeader).reduce((acc, r) => acc + (r.discountAmount || 0), 0);

         const selectedTds = tdsTaxes.find((t) => t._id === tdsId);
         const selectedTcs = tcsTaxes.find((t) => t._id === tcsId);
  const tdsAmount = taxType === "TDS" && selectedTds ? ((subTotal - discountAmt) * selectedTds.rate) / 100 : 0;
  const tcsAmount = taxType === "TCS" && selectedTcs ? ((subTotal - discountAmt + adjustmentAmount) * selectedTcs.rate) / 100 : 0;
  const lineTaxesSum = rows.filter((r) => !r.isHeader).reduce((acc, r) => acc + (r.amount * (r.taxRate || 0)) / 100, 0);
  const total = subTotal - discountAmt + lineTaxesSum - tdsAmount + tcsAmount + adjustmentAmount;

   const gstGroupTaxes = useMemo(
      () => lineTaxes
         .filter((tax) => tax.taxType === "TaxGroup" || GST_GROUP_NAMES.includes(tax.name))
         .sort((a, b) => {
            const aPreferred = GST_GROUP_NAMES.indexOf(a.name);
            const bPreferred = GST_GROUP_NAMES.indexOf(b.name);
            if (aPreferred >= 0 && bPreferred >= 0) return aPreferred - bPreferred;
            if (aPreferred >= 0) return -1;
            if (bPreferred >= 0) return 1;
            return a.name.localeCompare(b.name);
         }),
      [lineTaxes],
   );

   const otherLineTaxes = useMemo(
      () => lineTaxes
         .filter((tax) => !gstGroupTaxes.some((g) => g._id === tax._id))
         .sort((a, b) => a.name.localeCompare(b.name)),
      [lineTaxes, gstGroupTaxes],
   );

   const linkedPurchaseOrder = useMemo(() => {
      if (linkedPurchaseOrderId) {
         return openPurchaseOrders.find((po) => po._id === linkedPurchaseOrderId) || null;
      }
      if (orderNumber) {
         return openPurchaseOrders.find((po) => po.purchaseOrderNumber === orderNumber) || null;
      }
      return null;
   }, [linkedPurchaseOrderId, openPurchaseOrders, orderNumber]);

   function lineTaxSelectValue(row: LineRow): string {
      if (row.taxId) return `tax:${row.taxId}`;
      if (row.taxName) {
         const preset = LINE_TAX_PRESETS.find((p) => p.name === row.taxName);
         if (preset) return `preset:${preset.name}`;
      }
      return "";
   }

   function updateRow(id: string, patch: Partial<LineRow>) {
      setRows((prev) => prev.map((r) => (r.id === id ? calcRow({ ...r, ...patch }, discountLevel) : r)));
   }

   function removeRow(id: string) {
      setRows((prev) => prev.filter((r) => r.id !== id));
   }

   function moveRow(fromId: string, toId: string) {
      if (fromId === toId) return;
      setRows((prev) => {
         const fromIdx = prev.findIndex((r) => r.id === fromId);
         const toIdx = prev.findIndex((r) => r.id === toId);
         if (fromIdx < 0 || toIdx < 0) return prev;
         const next = [...prev];
         const [moved] = next.splice(fromIdx, 1);
         next.splice(toIdx, 0, moved);
         return next;
      });
   }

   function handleSelectItem(rowId: string, item: Item, currentRows?: LineRow[]) {
      const activeRows = currentRows || rows;
      const row = activeRows.find((entry) => entry.id === rowId);
      const purchaseAccountId = typeof item.purchaseAccountId === "object"
         ? (item.purchaseAccountId as any)?._id || ""
         : item.purchaseAccountId || "";
      const purchaseAccountName = purchaseAccountId
         ? accounts.find((account) => account._id === purchaseAccountId)?.name || ""
         : "";

      updateRow(rowId, {
         itemId: item._id,
         itemName: item.name,
         accountId: purchaseAccountId || row?.accountId || "",
         accountName: purchaseAccountName || row?.accountName || "",
         description: row?.description || item.purchaseDescription || "",
         rate: item.costPrice || 0,
         quantity: row?.quantity && row.quantity > 0 ? row.quantity : 1,
         unit: itemUnitLabel(item),
      });
   }

   useEffect(() => {
      if (pendingItemSelection && items.length > 0) {
         const selectedItem = items.find((i) => i._id === pendingItemSelection.itemId);
         if (selectedItem) {
            handleSelectItem(pendingItemSelection.rowId, selectedItem, pendingItemSelection.rows);
            setPendingItemSelection(null);
         }
      }
   }, [items, pendingItemSelection]);

   function handleLinkPurchaseOrder(poId: string) {
      setLinkedPurchaseOrderId(poId);
      const po = openPurchaseOrders.find((entry) => entry._id === poId);
      if (!po) return;
      setOrderNumber(po.purchaseOrderNumber);
      if (!referenceNumber.trim()) {
         setReferenceNumber(po.purchaseOrderNumber);
      }
   }

   function handleImportLinkedPurchaseOrder() {
      if (!linkedPurchaseOrder) {
         toast.error("Select an open purchase order to import");
         return;
      }

      const importedRows: LineRow[] = (linkedPurchaseOrder.lineItems || []).map((line: any) => {
         if (line?.isHeader) {
            return {
               ...newHeader(),
               headerText: line.headerText || "Add New Header",
            };
         }

         const itemId = typeof line?.itemId === "object" ? line.itemId?._id || "" : line?.itemId || "";
         const itemName = typeof line?.itemId === "object"
            ? line.itemId?.name || line.name || ""
            : line?.name || "";
         const accountId = typeof line?.accountId === "object" ? line.accountId?._id || "" : line?.accountId || "";
         const accountName = typeof line?.accountId === "object"
            ? line.accountId?.name || ""
            : (accountId ? accounts.find((account) => account._id === accountId)?.name || "" : "");
         const selectedItem = itemId ? items.find((entry) => entry._id === itemId) : null;

         return calcRow(
            {
               ...newRow(),
               itemId,
               itemName,
               accountId,
               accountName,
               description: line?.description || "",
               quantity: Number(line?.quantity || 1),
               rate: Number(line?.rate || 0),
               discountPercent: Number(line?.discountPercent || 0),
               discountAmount: Number(line?.discountAmount || 0),
               amount: Number(line?.amount || 0),
               unit: itemUnitLabel(selectedItem),
            },
            discountLevel,
         );
      });

      const dataLineCount = importedRows.filter((row) => !row.isHeader).length;
      if (importedRows.length > 0) {
         setRows(importedRows);
      }
      setOrderNumber(linkedPurchaseOrder.purchaseOrderNumber);
      if (!referenceNumber.trim()) {
         setReferenceNumber(linkedPurchaseOrder.purchaseOrderNumber);
      }
      toast.success(`Imported ${dataLineCount} item(s) from ${linkedPurchaseOrder.purchaseOrderNumber}`);
   }

   function handleVendorCreated(vendor: Contact) {
      setVendors((prev) => {
         const next = [...prev.filter((v) => v._id !== vendor._id), vendor];
         next.sort((a, b) => {
            const aName = (a.displayName || a.companyName || "").toLowerCase();
            const bName = (b.displayName || b.companyName || "").toLowerCase();
            return aName.localeCompare(bName);
         });
         return next;
      });
      setVendorId(vendor._id);
      setAccountsPayableId(vendor.accountsPayableId || "");
   }

   useEffect(() => {
      if (!accounts.length || accountsPayableId) return;
      const defaultPayable = accounts.find((account) => account.accountType === "Accounts Payable");
      if (defaultPayable) {
         setAccountsPayableId(defaultPayable._id);
      }
   }, [accounts, accountsPayableId]);

   useEffect(() => {
      if (!vendorId) return;
      const selectedVendor = vendors.find((vendor) => vendor._id === vendorId);
      const vendorPayable = selectedVendor?.accountsPayableId || "";
      if (vendorPayable) {
         setAccountsPayableId(vendorPayable);
      }
   }, [vendorId, vendors]);

   useEffect(() => {
      let cancelled = false;

      if (!vendorId) {
         setOpenPurchaseOrders([]);
         setLinkedPurchaseOrderId("");
         setLoadingOpenPurchaseOrders(false);
         return;
      }

      setLoadingOpenPurchaseOrders(true);
      billApi
         .getOpenPurchaseOrders(vendorId)
         .then((res) => {
            if (cancelled) return;
            setOpenPurchaseOrders(res.data || []);
         })
         .catch(() => {
            if (cancelled) return;
            setOpenPurchaseOrders([]);
         })
         .finally(() => {
            if (cancelled) return;
            setLoadingOpenPurchaseOrders(false);
         });

      return () => {
         cancelled = true;
      };
   }, [vendorId]);

   useEffect(() => {
      if (!orderNumber) {
         if (linkedPurchaseOrderId) setLinkedPurchaseOrderId("");
         return;
      }

      const match = openPurchaseOrders.find((po) => po.purchaseOrderNumber === orderNumber);
      if (match && match._id !== linkedPurchaseOrderId) {
         setLinkedPurchaseOrderId(match._id);
      }
      if (!match && linkedPurchaseOrderId) {
         setLinkedPurchaseOrderId("");
      }
   }, [orderNumber, openPurchaseOrders, linkedPurchaseOrderId]);

   useEffect(() => {
      if (mode !== "create") return;
      if (!defaultPurchaseOrderId) return;
      if (openPurchaseOrders.length === 0) return;

      const matchedPo = openPurchaseOrders.find((po) => po._id === defaultPurchaseOrderId);
      if (!matchedPo) return;

      setLinkedPurchaseOrderId(matchedPo._id);
      setOrderNumber(matchedPo.purchaseOrderNumber);
      if (!referenceNumber.trim()) {
         setReferenceNumber(matchedPo.purchaseOrderNumber);
      }
   }, [mode, defaultPurchaseOrderId, openPurchaseOrders, referenceNumber]);

   useEffect(() => {
      if (mode !== "create") return;
      if (!defaultPurchaseOrderId || !shouldAutoImportFromPurchaseOrder) return;
      if (!linkedPurchaseOrder || linkedPurchaseOrder._id !== defaultPurchaseOrderId) return;

      const hasOnlyBlankRow = rows.length === 1 && !rows[0].isHeader && !rows[0].itemName && !rows[0].accountId && Number(rows[0].quantity) === 1 && Number(rows[0].rate) === 0;
      if (!hasOnlyBlankRow) return;

      const importedRows: LineRow[] = (linkedPurchaseOrder.lineItems || []).map((line: any) => {
         if (line?.isHeader) {
            return {
               ...newHeader(),
               headerText: line.headerText || "Add New Header",
            };
         }

         const itemId = typeof line?.itemId === "object" ? line.itemId?._id || "" : line?.itemId || "";
         const itemName = typeof line?.itemId === "object"
            ? line.itemId?.name || line.name || ""
            : line?.name || "";
         const accountId = typeof line?.accountId === "object" ? line.accountId?._id || "" : line?.accountId || "";
         const accountName = typeof line?.accountId === "object"
            ? line.accountId?.name || ""
            : (accountId ? accounts.find((account) => account._id === accountId)?.name || "" : "");
         const selectedItem = itemId ? items.find((entry) => entry._id === itemId) : null;

         return calcRow(
            {
               ...newRow(),
               itemId,
               itemName,
               accountId,
               accountName,
               description: line?.description || "",
               quantity: Number(line?.quantity || 1),
               rate: Number(line?.rate || 0),
               discountPercent: Number(line?.discountPercent || 0),
               discountAmount: Number(line?.discountAmount || 0),
               amount: Number(line?.amount || 0),
               unit: itemUnitLabel(selectedItem),
            },
            discountLevel,
         );
      });

      if (importedRows.length > 0) {
         setRows(importedRows);
      }
   }, [
      mode,
      defaultPurchaseOrderId,
      shouldAutoImportFromPurchaseOrder,
      linkedPurchaseOrder,
      rows,
      accounts,
      items,
      discountLevel,
   ]);

   async function handleCreateItemForRow(rowId: string, providedName?: string) {
      const row = rows.find((r) => r.id === rowId);
      const itemName = (providedName || row?.itemName || "").trim();
      if (!itemName) {
         toast.error("Item name is required");
         return;
      }

      const existing = items.find((i) => i.name.trim().toLowerCase() === itemName.toLowerCase());
      if (existing) {
         handleSelectItem(rowId, existing);
         return;
      }

      try {
         const payload: Record<string, unknown> = {
            name: itemName,
            itemType: "Service",
            costPrice: Number(row?.rate || 0),
            purchaseDescription: row?.description || undefined,
         };
         if (row?.accountId) payload.purchaseAccountId = row.accountId;

         const res = await itemApi.create(payload as any);
         const created = res.data;

         setItems((prev) => {
            const next = [...prev.filter((i) => i._id !== created._id), created];
            next.sort((a, b) => a.name.localeCompare(b.name));
            return next;
         });

         const createdPurchaseAccountId =
            typeof created.purchaseAccountId === "object"
               ? (created.purchaseAccountId as any)?._id || ""
               : created.purchaseAccountId || "";
         const resolvedAccountId = row?.accountId || createdPurchaseAccountId;
         const resolvedAccountName = resolvedAccountId
            ? accounts.find((a) => a._id === resolvedAccountId)?.name || row?.accountName || ""
            : row?.accountName || "";

         updateRow(rowId, {
            itemId: created._id,
            itemName: created.name,
            rate: created.costPrice || Number(row?.rate || 0),
            accountId: resolvedAccountId,
            accountName: resolvedAccountName,
         });

         toast.success("Item created");
      } catch {
         toast.error("Failed to create item");
      }
   }

   function handleLineTaxSelection(rowId: string, value: string) {
      if (!value) {
         updateRow(rowId, { taxId: "", taxName: "", taxRate: 0 });
         return;
      }

      if (value === NEW_LINE_TAX_OPTION) {
         setPendingTaxRowId(rowId);
         setShowCreateLineTax(true);
         return;
      }

      if (value.startsWith("preset:")) {
         const presetName = value.slice("preset:".length);
         const preset = LINE_TAX_PRESETS.find((entry) => entry.name === presetName);
         if (!preset) return;
         updateRow(rowId, {
            taxId: "",
            taxName: preset.name,
            taxRate: preset.rate,
         });
         return;
      }

      if (value.startsWith("tax:")) {
         const taxId = value.slice("tax:".length);
         const tax = lineTaxes.find((entry) => entry._id === taxId);
         if (!tax) return;
         updateRow(rowId, {
            taxId: tax._id,
            taxName: tax.name,
            taxRate: Number(tax.rate || 0),
         });
      }
   }

   function handleLineTaxCreated(tax: Tax) {
      setLineTaxes((prev) => {
         const next = [...prev.filter((entry) => entry._id !== tax._id), tax];
         next.sort((a, b) => a.name.localeCompare(b.name));
         return next;
      });

      if (pendingTaxRowId) {
         updateRow(pendingTaxRowId, {
            taxId: tax._id,
            taxName: tax.name,
            taxRate: Number(tax.rate || 0),
         });
      }
      setPendingTaxRowId(null);
   }

  async function handleSubmit(status: BillStatus = "Draft") {
     if (!vendorId) return toast.error("Please select a vendor");

     const dataRows = rows.filter((r) => !r.isHeader);
     if (dataRows.length === 0) {
        return toast.error("Add at least one line item");
     }

     for (let i = 0; i < dataRows.length; i += 1) {
        const line = dataRows[i];
        const lineNo = i + 1;
        if (!line.itemName.trim()) {
           return toast.error(`Line ${lineNo}: item name is required`);
        }
        if (!line.accountId) {
           return toast.error(`Line ${lineNo}: account is required`);
        }
        if (Number(line.quantity) <= 0) {
           return toast.error(`Line ${lineNo}: quantity must be greater than 0`);
        }
     }

     setSaving(true);
     try {
        const payload: CreateBillInput = {
           vendorId,
           billNumber,
           referenceNumber,
           orderNumber,
           billDate,
           dueDate: dueDate || null,
           paymentTermsId: paymentTermsId || null,
           accountsPayableId: accountsPayableId || null,
           subject,
           discountLevel,
           discountAccountId: discountAccountId || null,
           discountPercent,
           taxType,
           tdsId: taxType === "TDS" ? (tdsId || null) : null,
           tcsId: taxType === "TCS" ? (tcsId || null) : null,
           taxAmount: tdsAmount,
           tcsAmount: tcsAmount,
           adjustmentLabel,
           adjustmentAmount,
           notes,
           termsAndConditions: terms,
           attachments: attachments.map((a) => a.url),
           lineItems: rows.map(r => ({
              isHeader: r.isHeader,
              headerText: r.headerText,
              itemId: r.itemId || null,
              name: r.itemName.trim(),
              accountId: r.accountId || null,
              customerId: r.customerId || null,
              taxId: r.taxId || null,
              taxName: r.taxName || "",
              taxRate: Number(r.taxRate || 0),
              description: r.description.trim(),
              quantity: r.quantity,
              rate: r.rate,
              discountPercent: r.discountPercent,
              discountAmount: r.discountAmount,
              amount: r.amount,
           })),
           status,
           purchaseOrderIds: linkedPurchaseOrderId ? [linkedPurchaseOrderId] : undefined,
        };
        
        let res;
        if (mode === "edit" && initialData) {
           res = await billApi.update(initialData._id, payload as UpdateBillInput);
           toast.success("Bill updated successfully");
        } else {
           res = await billApi.create(payload);
           toast.success("Bill created successfully");
        }
        onSuccess(res.data);
     } catch (err) { toast.error("Failed to save bill"); } finally { setSaving(false); }
  }

   return (
      <div className="flex flex-col gap-6 px-4 py-6 w-full">

         {/* Vendor */}
         <div className="grid grid-cols-[160px_1fr] items-start gap-4 py-4 border-b">
            <Label className="text-sm font-medium text-red-500 pt-2">Vendor Name *</Label>
            <div className="relative flex gap-2 max-w-md">
               <div className="relative flex-1">
                  <select
                     className="w-full h-9 px-3 pr-8 text-sm border rounded-md bg-white appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
                     value={vendorId}
                     onChange={(e) => {
                        const next = e.target.value;
                        if (next === NEW_VENDOR_OPTION) {
                           saveDraftToLocalStorage();
                           router.push(`/purchases/vendors/new?redirect=${encodeURIComponent(window.location.pathname)}`);
                           return;
                        }
                        const selectedVendor = vendors.find((v) => v._id === next);
                        setVendorId(next);
                        setAccountsPayableId(selectedVendor?.accountsPayableId || "");
                     }}
                  >
                     <option value="">Select a Vendor</option>
                     <option value={NEW_VENDOR_OPTION}>+ Create New Vendor</option>
                     {vendors.map((v) => (
                        <option key={v._id} value={v._id}>{v.displayName || v.companyName}</option>
                     ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
               </div>
               <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 bg-primary"
                  onClick={() => setShowVendorSearch(true)}
               >
                  <Search className="h-4 w-4" />
               </Button>
            </div>
         </div>

         {/* Bill details */}
         <div className="grid grid-cols-2 gap-x-12 gap-y-4 py-4 border-b">
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium text-red-500 w-36 shrink-0">Bill# *</Label>
               <Input className="h-9 text-sm flex-1" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-24 shrink-0">Reference#</Label>
               <Input className="h-9 text-sm flex-1" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </div>
            <div className="flex items-start gap-3">
               <Label className="text-sm font-medium w-36 shrink-0 pt-2">Order Number</Label>
               <div className="flex-1 space-y-2">
                  <Input className="h-9 text-sm" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                     <Select value={linkedPurchaseOrderId} onValueChange={handleLinkPurchaseOrder}>
                        <SelectTrigger className="h-8 text-xs min-w-[220px]">
                           <SelectValue placeholder={loadingOpenPurchaseOrders ? "Loading open purchase orders..." : "Link open purchase order"} />
                        </SelectTrigger>
                        <SelectContent>
                           {openPurchaseOrders.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-muted-foreground">No open purchase orders for this vendor</div>
                           ) : (
                              openPurchaseOrders.map((po) => (
                                 <SelectItem key={po._id} value={po._id}>
                                    {po.purchaseOrderNumber} | {po.purchaseOrderDate?.slice(0, 10)} | {fmt(po.total || 0)}
                                 </SelectItem>
                              ))
                           )}
                        </SelectContent>
                     </Select>
                     <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!linkedPurchaseOrder || loadingOpenPurchaseOrders}
                        onClick={handleImportLinkedPurchaseOrder}
                     >
                        Import PO Items
                     </Button>
                  </div>
                  {linkedPurchaseOrder && (
                     <p className="text-[11px] text-muted-foreground">
                        Linked: {linkedPurchaseOrder.purchaseOrderNumber}
                     </p>
                  )}
               </div>
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-24 shrink-0">Bill Date</Label>
               <Input type="date" className="h-9 text-sm flex-1" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-36 shrink-0">Due Date</Label>
               <Input type="date" className="h-9 text-sm flex-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-36 shrink-0">Payment Terms</Label>
               <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                     <SelectValue placeholder="Due on Receipt" />
                  </SelectTrigger>
                  <SelectContent>
                     {paymentTerms.map((pt) => (
                        <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-36 shrink-0">Accounts Payable</Label>
               <Select
                  value={accountsPayableId || "__auto__"}
                  onValueChange={(value) => setAccountsPayableId(value === "__auto__" ? "" : value)}
               >
                  <SelectTrigger className="h-9 text-sm flex-1">
                     <SelectValue placeholder="Auto from Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="__auto__">Auto from Vendor</SelectItem>
                     {accounts
                        .filter((account) => account.accountType === "Accounts Payable")
                        .map((account) => (
                           <SelectItem key={account._id} value={account._id}>{account.name}</SelectItem>
                        ))}
                  </SelectContent>
               </Select>
            </div>
         </div>

         <div className="flex items-center gap-2 pt-2">
            {(["transaction", "line_item"] as const).map((lvl) => (
               <button
                  key={lvl}
                  type="button"
                  className={cn(
                     "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                     discountLevel === lvl ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 text-muted-foreground hover:bg-muted/40",
                  )}
                  onClick={() => setDiscountLevel(lvl)}
               >
                  <span className={cn("h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center", discountLevel === lvl ? "border-primary-foreground" : "border-muted-foreground")}>
                     {discountLevel === lvl && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </span>
                  {lvl === "transaction" ? "At Transaction Level" : "At Line Item Level"}
               </button>
            ))}
            {discountLevel === "line_item" && (
               <AccountDropdown
                  value={discountAccountId}
                  onChange={(id, name) => setDiscountAccountId(id)}
                  accounts={accounts.filter((a) => a.rootType === "Expense" || a.name.toLowerCase().includes("discount"))}
               />
            )}
         </div>

         {/* Item Table */}
         <div className="border rounded-lg overflow-visible">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white">
               <h3 className="font-semibold text-sm">Item Table</h3>
               <div className="relative">
                  <button type="button" className="text-xs text-primary flex items-center gap-1" onClick={() => setShowBulkActions((v) => !v)}>
                     <CircleDot className="h-3.5 w-3.5" /> Bulk Actions
                  </button>
                  {showBulkActions && (
                     <div className="absolute z-[200] top-full right-0 mt-1 w-52 bg-background border rounded-md shadow-lg overflow-hidden">
                        <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-primary hover:text-primary-foreground">Bulk Update Line Items</button>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-primary hover:text-primary-foreground">Hide All Additional Information</button>
                     </div>
                  )}
               </div>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-sm min-w-[1180px]">
                  <thead className="bg-muted/30 border-b">
                     <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-6 px-2 py-2.5" />
                        <th className="text-left px-3 py-2.5 font-medium">Item Details</th>
                        <th className="text-left px-3 py-2.5 font-medium w-44">Account</th>
                        <th className="text-right px-3 py-2.5 font-medium w-24">Quantity</th>
                        <th className="text-right px-3 py-2.5 font-medium w-24">Rate</th>
                        <th className="text-left px-3 py-2.5 font-medium w-44">Tax</th>
                        <th className="text-left px-3 py-2.5 font-medium w-44">Customer Details</th>
                        {discountLevel === "line_item" && (
                           <th className="text-right px-3 py-2.5 font-medium w-28">Discount</th>
                        )}
                        <th className="text-right px-3 py-2.5 font-medium w-36">Amount</th>
                        <th className="w-12 px-2 py-2.5" />
                     </tr>
                  </thead>
                  <tbody className="divide-y">
                     {rows.map((row) => (
                        <Fragment key={row.id}>
                           <tr
                              className="hover:bg-muted/20 group"
                              draggable
                              onDragStart={() => setDraggingRowId(row.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                 if (draggingRowId) moveRow(draggingRowId, row.id);
                                 setDraggingRowId(null);
                              }}
                              onDragEnd={() => setDraggingRowId(null)}
                           >
                              <td className="px-2 py-2 text-muted-foreground cursor-grab active:cursor-grabbing">
                                 <GripVertical className="h-4 w-4" />
                              </td>
                              {row.isHeader ? (
                                 <td colSpan={discountLevel === "line_item" ? 8 : 7} className="px-3 py-2">
                                    <div className="text-[22px] leading-tight font-semibold text-muted-foreground/95">{row.headerText || "Add New Header"}</div>
                                 </td>
                              ) : (
                                 <>
                                    <td className="px-3 py-2 align-top">
                                       <div className="flex items-center gap-2">
                                          <Input
                                             className="h-8 text-xs"
                                             value={row.itemName}
                                             placeholder="Type item name or pick from list"
                                             onChange={(e) => updateRow(row.id, { itemName: e.target.value, itemId: "", unit: "" })}
                                          />
                                          <DropdownMenu
                                             open={itemSelectorRow === row.id}
                                             onOpenChange={(open) => setItemSelectorRow(open ? row.id : null)}
                                          >
                                             <DropdownMenuTrigger asChild>
                                                <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0">
                                                   <Search className="h-3.5 w-3.5" />
                                                </Button>
                                             </DropdownMenuTrigger>
                                             <DropdownMenuContent align="end" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                                                <ItemSelectorPopup
                                                   items={items}
                                                   onSelect={(item) => {
                                                      handleSelectItem(row.id, item);
                                                      setItemSelectorRow(null);
                                                   }}
                                                   onCreateItem={async (name) => {
                                                      setItemSelectorRow(null);
                                                      saveDraftToLocalStorage(row.id);
                                                      const path = `/items/new?returnUrl=${encodeURIComponent(window.location.pathname)}`;
                                                      const url = name ? `${path}&name=${encodeURIComponent(name)}` : path;
                                                      router.push(url);
                                                   }}
                                                />
                                             </DropdownMenuContent>
                                          </DropdownMenu>
                                       </div>
                                       <Textarea
                                          className="mt-1 text-xs text-muted-foreground resize-none border-0 shadow-none p-0 focus-visible:ring-0 min-h-0 h-auto bg-transparent"
                                          rows={1}
                                          placeholder="Add a description to your item"
                                          value={row.description}
                                          onChange={(e) => updateRow(row.id, { description: e.target.value })}
                                       />
                                       {row.itemId && (() => {
                                          const selectedItem = items.find((entry) => entry._id === row.itemId);
                                          if (!selectedItem) return null;
                                          return (
                                             <p className="mt-1 text-[11px] text-muted-foreground">
                                                {selectedItem.inventoryTracked
                                                   ? `Stock on Hand: ${fmtQty(selectedItem.stockOnHand)}${itemUnitLabel(selectedItem) ? ` ${itemUnitLabel(selectedItem)}` : ""}`
                                                   : "Non-tracked item"}
                                             </p>
                                          );
                                       })()}
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                       <AccountDropdown
                                          value={row.accountId}
                                          onChange={(id, name) => updateRow(row.id, { accountId: id, accountName: name })}
                                          accounts={accounts}
                                       />
                                    </td>
                                    <td className="px-3 py-2 align-top text-right">
                                       <Input
                                          type="number"
                                          className="h-8 text-xs text-right"
                                          value={row.quantity}
                                          min={0}
                                          onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                                       />
                                       {row.unit && <div className="mt-0.5 text-[11px] text-muted-foreground">{row.unit}</div>}
                                    </td>
                                    <td className="px-3 py-2 align-top text-right">
                                       <Input
                                          type="number"
                                          className="h-8 text-xs text-right"
                                          value={row.rate}
                                          min={0}
                                          step="0.01"
                                          onChange={(e) => updateRow(row.id, { rate: Number(e.target.value) || 0 })}
                                       />
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                       <select
                                          className="w-full h-8 px-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                          value={lineTaxSelectValue(row)}
                                          onChange={(e) => handleLineTaxSelection(row.id, e.target.value)}
                                       >
                                          <option value="">Select a Tax</option>
                                          <optgroup label="Non Taxable">
                                             {LINE_TAX_PRESETS.map((preset) => (
                                                <option key={preset.name} value={`preset:${preset.name}`}>
                                                   {preset.name}
                                                </option>
                                             ))}
                                          </optgroup>
                                          {gstGroupTaxes.length > 0 && (
                                             <optgroup label="Tax Group">
                                                {gstGroupTaxes.map((tax) => (
                                                   <option key={tax._id} value={`tax:${tax._id}`}>
                                                      {tax.name} [{Number(tax.rate || 0)}%]
                                                   </option>
                                                ))}
                                             </optgroup>
                                          )}
                                          {otherLineTaxes.length > 0 && (
                                             <optgroup label="Other Taxes">
                                                {otherLineTaxes.map((tax) => (
                                                   <option key={tax._id} value={`tax:${tax._id}`}>
                                                      {tax.name} [{Number(tax.rate || 0)}%]
                                                   </option>
                                                ))}
                                             </optgroup>
                                          )}
                                          <option value={NEW_LINE_TAX_OPTION}>+ New Tax</option>
                                       </select>
                                       {row.taxName && (
                                          <>
                                             <p className="mt-1 text-[11px] text-muted-foreground truncate" title={row.taxName}>
                                                {row.taxRate ? `${row.taxName} [${row.taxRate}%]` : row.taxName}
                                             </p>
                                             {LINE_TAX_PRESETS.find((preset) => preset.name === row.taxName)?.description && (
                                                <p className="text-[10px] text-muted-foreground leading-tight">
                                                   {LINE_TAX_PRESETS.find((preset) => preset.name === row.taxName)?.description}
                                                </p>
                                             )}
                                          </>
                                       )}
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                       <select
                                          className="w-full h-8 px-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                                          value={row.customerId || ""}
                                          onChange={(e) => {
                                             const nextId = e.target.value;
                                             const selectedCustomer = customers.find((customer) => customer._id === nextId);
                                             updateRow(row.id, {
                                                customerId: nextId,
                                                customerName: selectedCustomer
                                                   ? (selectedCustomer.displayName || selectedCustomer.companyName || "")
                                                   : "",
                                             });
                                          }}
                                       >
                                          <option value="">Select Customer</option>
                                          {customers.map((customer) => (
                                             <option key={customer._id} value={customer._id}>
                                                {customer.displayName || customer.companyName}
                                             </option>
                                          ))}
                                       </select>
                                    </td>
                                    {discountLevel === "line_item" && (
                                       <td className="px-3 py-2 align-top text-right">
                                          <Input
                                             type="number"
                                             className="h-8 text-xs text-right"
                                             value={row.discountPercent}
                                             onChange={(e) => updateRow(row.id, { discountPercent: Number(e.target.value) || 0 })}
                                          />
                                       </td>
                                    )}
                                    <td className="px-3 py-2 align-top text-right font-medium tabular-nums whitespace-nowrap">
                                       {fmt(row.amount)}
                                    </td>
                                 </>
                              )}
                              <td className="px-2 py-2 text-right">
                                 {!row.isHeader && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.id)}>
                                       <Trash2 className="h-4 w-4" />
                                    </Button>
                                 )}
                              </td>
                           </tr>
                        </Fragment>
                     ))}
                  </tbody>
               </table>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t bg-muted/20">
               <Button variant="outline" size="sm" className="gap-2" onClick={() => setRows((prev) => [...prev, newRow()])}>
                  <Plus className="h-4 w-4" /> Add New Row
               </Button>
               <Button variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, newHeader()])}>Add Header</Button>
            </div>
         </div>

         {/* Totals */}
         <div className="grid grid-cols-[1fr_450px] gap-6">
            <div />
            <div className="bg-muted/10 border rounded-lg p-4 space-y-3">
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span>{fmt(subTotal)}</span>
               </div>
               {discountLevel === "transaction" && (
                  <div className="flex items-center justify-between gap-3">
                     <span className="text-sm text-muted-foreground w-24">Discount</span>
                     <div className="flex items-center gap-0 w-32 border rounded-md bg-white overflow-hidden">
                        <Input
                           type="number"
                           className="h-8 border-0 text-right text-sm rounded-none shadow-none focus-visible:ring-0"
                           min={0}
                           value={discountPercent}
                           onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value))) }
                        />
                        <DropdownMenu open={showDiscountTypeDD} onOpenChange={setShowDiscountTypeDD}>
                           <DropdownMenuTrigger asChild>
                              <button type="button" className="h-8 px-2 border-l text-sm bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center min-w-[36px]">
                                 {discountType}
                              </button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="z-[220] w-14 p-1 min-w-0">
                              <button
                                 type="button"
                                 className={cn("w-full text-center py-1.5 rounded-sm text-sm font-medium transition-colors", discountType === "%" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                 onClick={() => { setDiscountType("%"); setShowDiscountTypeDD(false); }}
                              >%</button>
                              <button
                                 type="button"
                                 className={cn("w-full text-center py-1.5 rounded-sm text-sm font-medium transition-colors mt-0.5", discountType === "₹" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                                 onClick={() => { setDiscountType("₹"); setShowDiscountTypeDD(false); }}
                              >₹</button>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                     <span className="text-sm flex-1 text-right">{fmt(discountAmt)}</span>
                  </div>
               )}
               {lineTaxesSum > 0 && (
                  <div className="flex justify-between text-sm">
                     <span className="text-muted-foreground">Tax</span>
                     <span>+ {fmt(lineTaxesSum)}</span>
                  </div>
               )}

               <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3">
                     <label className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-primary">
                        <input type="radio" name="taxType" value="TDS" checked={taxType === "TDS"} onChange={() => { setTaxType("TDS"); setTcsId(""); }} className="accent-primary" />
                        TDS
                     </label>
                     <label className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground">
                        <input type="radio" name="taxType" value="TCS" checked={taxType === "TCS"} onChange={() => { setTaxType("TCS"); setTdsId(""); }} className="accent-primary" />
                        TCS
                     </label>
                  </div>
                  {taxType === "TDS" && (
                     <div className="w-56 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                           <DropdownMenu open={showTaxDD} onOpenChange={(o) => { setShowTaxDD(o); if (!o) setTdsSearch(""); }}>
                              <DropdownMenuTrigger asChild>
                                 <button type="button" className="flex items-center justify-between w-full min-w-0 text-sm border bg-white rounded-md px-2.5 h-8 hover:bg-muted/30 text-muted-foreground transition-colors">
                                    <span className="truncate text-left flex-1 mr-2">{selectedTds ? `${selectedTds.taxName} [${selectedTds.rate}%]` : "Select a Tax"}</span>
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                 </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                                 <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                                    <Input className="h-7 text-xs" placeholder="Search" value={tdsSearch} onChange={(e) => setTdsSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-56 overflow-y-auto">
                                    <button type="button" className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 italic" onClick={() => { setTdsId(""); setShowTaxDD(false); setTdsSearch(""); }}>None</button>
                                    {tdsTaxes.filter((t) => t.taxName.toLowerCase().includes(tdsSearch.toLowerCase())).map((t) => (
                                       <button key={t._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", tdsId === t._id && "bg-primary/10 font-medium")}
                                          onClick={() => { setTdsId(t._id); setShowTaxDD(false); setTdsSearch(""); }}>
                                          {t.taxName} [{t.rate}%]
                                       </button>
                                    ))}
                                 </div>
                                 <div className="border-t p-2">
                                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setShowTaxDD(false); setShowManageTDS(true); }}>Manage TDS</button>
                                 </div>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </div>
                     </div>
                  )}
                  {taxType === "TCS" && (
                     <div className="w-56 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                           <DropdownMenu open={showTCSDD} onOpenChange={(o) => { setShowTCSDD(o); if (!o) setTcsSearch(""); }}>
                              <DropdownMenuTrigger asChild>
                                 <button type="button" className="flex items-center justify-between w-full min-w-0 text-sm border bg-white rounded-md px-2.5 h-8 hover:bg-muted/30 text-muted-foreground transition-colors">
                                    <span className="truncate text-left flex-1 mr-2">{selectedTcs ? `${selectedTcs.taxName} [${selectedTcs.rate}%]` : "Select a Tax"}</span>
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                 </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                                 <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                                    <Input className="h-7 text-xs" placeholder="Search" value={tcsSearch} onChange={(e) => setTcsSearch(e.target.value)} autoFocus />
                                 </div>
                                 <div className="max-h-56 overflow-y-auto">
                                    {tcsTaxes.filter((t) => t.taxName.toLowerCase().includes(tcsSearch.toLowerCase())).length === 0 ? (
                                       <p className="text-xs text-muted-foreground text-center py-5 uppercase tracking-wide font-medium">No Results Found</p>
                                    ) : tcsTaxes.filter((t) => t.taxName.toLowerCase().includes(tcsSearch.toLowerCase())).map((t) => (
                                       <button key={t._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", tcsId === t._id && "bg-primary/10 font-medium")}
                                          onClick={() => { setTcsId(t._id); setShowTCSDD(false); setTcsSearch(""); }}>
                                          {t.taxName} [{t.rate}%]
                                       </button>
                                    ))}
                                 </div>
                                 <div className="border-t p-2">
                                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setShowTCSDD(false); setShowManageTCS(true); }}>Manage TCS</button>
                                 </div>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </div>
                     </div>
                  )}
                  <span className="flex-1 text-right text-sm text-muted-foreground">
                     {taxType === "TCS" ? `+ ${fmt(tcsAmount)}` : `- ${fmt(taxType !== "none" ? tdsAmount : 0)}`}
                  </span>
               </div>

               <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-2 w-24 relative">
                     <Input
                        className="h-8 text-sm placeholder:text-muted-foreground pr-6"
                        value={adjustmentLabel}
                        onChange={(e) => setAdjustmentLabel(e.target.value)}
                     />
                  </div>
                  <div className="flex items-center gap-2 w-32 relative">
                     <Input
                        type="number"
                        className="h-8 text-sm text-right pr-2"
                        value={adjustmentAmount}
                        onChange={(e) => setAdjustmentAmount(Number(e.target.value) || 0)}
                     />
                  </div>
                  <span className="flex-1 text-right text-sm">{fmt(adjustmentAmount)}</span>
               </div>

               <Separator />
               <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{fmt(total)}</span>
               </div>
            </div>
         </div>

         {/* Notes & Terms */}
         <div className="grid grid-cols-2 gap-6">
            <div>
               <Label className="text-sm font-medium mb-1.5 block">Notes</Label>
               <Textarea
                  className="text-sm resize-none"
                  rows={4}
                  placeholder="Will be displayed on bill"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
               />
            </div>
            <div>
               <Label className="text-sm font-medium mb-1.5 block">Terms &amp; Conditions</Label>
               <Textarea
                  className="text-sm resize-none"
                  rows={4}
                  placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
               />
            </div>
         </div>

         {/* Attach files */}
         <div>
            <Label className="text-sm font-medium mb-2 block">Attach File(s) to Bill</Label>
            <div className="flex items-center gap-2 flex-wrap">
               <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-sm"
                  disabled={uploading || attachments.length >= 10}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
               >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Upload File"}
               </Button>
               <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="*/*"
                  className="hidden"
                  onChange={async (e) => {
                     const files = Array.from(e.target.files || []);
                     if (!files.length) return;
                     const remaining = 10 - attachments.length;
                     const toUpload = files.slice(0, remaining);
                     setUploading(true);
                     try {
                        const results = await Promise.all(toUpload.map((f) => uploadApi.upload(f, "bills")));
                        setAttachments((prev) => [...prev, ...results]);
                        toast.success(`${results.length} file${results.length > 1 ? "s" : ""} uploaded`);
                     } catch {
                        toast.error("File upload failed");
                     } finally {
                        setUploading(false);
                        e.target.value = "";
                     }
                  }}
               />
            </div>
            {attachments.length > 0 && (
               <div className="flex flex-wrap gap-2 mt-3">
                  {attachments.map((a, idx) => {
                     const fileName = a.url.split("/").pop() || `File ${idx + 1}`;
                     const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].some((ext) =>
                        a.url.toLowerCase().includes(`.${ext}`)
                     );
                     return (
                        <div key={a.publicId || a.url} className="flex items-center gap-2 bg-muted/30 border rounded-md px-3 py-1.5 text-xs group">
                           {isImage ? (
                              <img src={a.url} alt={fileName} className="h-6 w-6 object-cover rounded" />
                           ) : (
                              <span className="text-red-500 text-sm">📄</span>
                           )}
                           <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline max-w-[160px] truncate">
                              {decodeURIComponent(fileName)}
                           </a>
                           <button
                              type="button"
                              className="ml-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={async () => {
                                 try {
                                    if (a.publicId) await uploadApi.remove(a.publicId);
                                    setAttachments((prev) => prev.filter((_, i) => i !== idx));
                                 } catch {
                                    toast.error("Failed to remove file");
                                 }
                              }}
                           >
                              <X className="h-3 w-3" />
                           </button>
                        </div>
                     );
                  })}
               </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5">You can upload a maximum of 10 files, 10MB each</p>
         </div>

         {/* Bottom buttons */}
         <div className="border-t pt-4 mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <Button variant="outline" size="sm" onClick={() => handleSubmit("Draft")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save as Draft
               </Button>
               <Button size="sm" onClick={() => handleSubmit("Open")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save as Open
               </Button>
               <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            </div>
            <span className="text-xs text-muted-foreground">PDF Template: &apos;Standard Template&apos;</span>
         </div>
            <VendorSearchDialog
               open={showVendorSearch}
               onClose={() => setShowVendorSearch(false)}
               vendors={vendors}
               onSelect={(vendor) => setVendorId(vendor._id)}
               onCreateNew={(searchName) => {
                  saveDraftToLocalStorage();
                  router.push(`/purchases/vendors/new?redirect=${encodeURIComponent(window.location.pathname)}` + (searchName ? `&name=${encodeURIComponent(searchName)}` : ""));
               }}
            />
            <QuickCreateVendorDialog
               open={showCreateVendor}
               onClose={() => setShowCreateVendor(false)}
               onCreated={handleVendorCreated}
            />
            <QuickCreateTaxDialog
               open={showCreateLineTax}
               onClose={() => {
                  setShowCreateLineTax(false);
                  setPendingTaxRowId(null);
               }}
               onCreated={(tax) => {
                  handleLineTaxCreated(tax);
                  setShowCreateLineTax(false);
               }}
            />
            <ManageTDSDialog
               open={showManageTDS}
               onClose={() => setShowManageTDS(false)}
               tdsTaxes={tdsTaxes}
               onCreated={(t) => setTdsTaxes((prev) => [...prev, t])}
            />
            <ManageTCSDialog
               open={showManageTCS}
               onClose={() => setShowManageTCS(false)}
               tcsTaxes={tcsTaxes}
               onCreated={(t) => setTcsTaxes((prev) => [...prev, t])}
            />
      </div>
   );
}
