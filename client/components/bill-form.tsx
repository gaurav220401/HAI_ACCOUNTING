"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import { billApi, type Bill, type CreateBillInput, type UpdateBillInput, type BillStatus, type DiscountLevel, type BillSourcePurchaseOrder } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax, type CreateTcsTaxInput, TCS_SECTIONS } from "@/lib/api/tcs-taxes";
import { cn } from "@/lib/utils";
import { uploadApi } from "@/lib/api/upload";

// --- Helpers ---
const TODAY = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}


const SUPPLY_STATES = [
   { code: "AN", name: "Andaman and Nicobar Islands" },
   { code: "AP", name: "Andhra Pradesh" },
   { code: "AR", name: "Arunachal Pradesh" },
   { code: "AS", name: "Assam" },
   { code: "BR", name: "Bihar" },
   { code: "CG", name: "Chhattisgarh" },
   { code: "GA", name: "Goa" },
   { code: "GJ", name: "Gujarat" },
   { code: "HR", name: "Haryana" },
   { code: "HP", name: "Himachal Pradesh" },
   { code: "JH", name: "Jharkhand" },
   { code: "KA", name: "Karnataka" },
   { code: "KL", name: "Kerala" },
   { code: "MP", name: "Madhya Pradesh" },
   { code: "MH", name: "Maharashtra" },
   { code: "MN", name: "Manipur" },
   { code: "ML", name: "Meghalaya" },
   { code: "MZ", name: "Mizoram" },
   { code: "NL", name: "Nagaland" },
   { code: "OD", name: "Odisha" },
   { code: "PB", name: "Punjab" },
   { code: "RJ", name: "Rajasthan" },
   { code: "SK", name: "Sikkim" },
   { code: "TN", name: "Tamil Nadu" },
   { code: "TS", name: "Telangana" },
   { code: "TR", name: "Tripura" },
   { code: "UP", name: "Uttar Pradesh" },
   { code: "UK", name: "Uttarakhand" },
   { code: "WB", name: "West Bengal" },
   { code: "CH", name: "Chandigarh" },
   { code: "DN", name: "Dadra and Nagar Haveli and Daman and Diu" },
   { code: "DL", name: "Delhi" },
   { code: "JK", name: "Jammu and Kashmir" },
   { code: "LA", name: "Ladakh" },
   { code: "LD", name: "Lakshadweep" },
   { code: "PY", name: "Puducherry" },
   { code: "OT", name: "Other Territory" },
];
const SUPPLY_OPTIONS = SUPPLY_STATES.map((s) => ({
   value: `[${s.code}] - ${s.name}`,
   label: `[${s.code}] - ${s.name}`,
}));

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

function ItemSelectorPopup({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void }) {
   const [q, setQ] = useState("");
   const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

   return (
      <div className="w-full overflow-hidden">
         <div className="p-2 border-b">
            <Input className="h-7 text-xs" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
         </div>
         <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
               <p className="text-xs text-muted-foreground text-center py-4">No items found</p>
            ) : filtered.map((item) => (
               <button
                  key={item._id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 flex justify-between"
                  onClick={() => onSelect(item)}
               >
                  <span className="text-sm">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{fmt(item.costPrice || 0)}</span>
               </button>
            ))}
         </div>
         <div className="p-2 border-t">
            <button type="button" className="text-xs text-primary hover:underline">+ Add New Item</button>
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

interface BillFormProps {
  initialData?: Bill;
  onSuccess: (bill: Bill) => void;
  onCancel: () => void;
  mode: "create" | "edit";
}

export function BillForm({ initialData, onSuccess, onCancel, mode }: BillFormProps) {
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const [saving, setSaving] = useState(false);
  const [loadingClone, setLoadingClone] = useState(!!cloneId);
  
  // Basic Fields
  const [vendorId, setVendorId] = useState(initialData?.vendorId?._id || initialData?.vendorId || "");
  const [billNumber, setBillNumber] = useState(initialData?.billNumber || "");
   const [referenceNumber, setReferenceNumber] = useState(initialData?.referenceNumber || "");
  const [orderNumber, setOrderNumber] = useState(initialData?.orderNumber || "");
  const [billDate, setBillDate] = useState(initialData?.billDate ? initialData.billDate.split("T")[0] : TODAY());
  const [dueDate, setDueDate] = useState(initialData?.dueDate ? initialData.dueDate.split("T")[0] : "");
  const [paymentTermsId, setPaymentTermsId] = useState(initialData?.paymentTermsId?._id || initialData?.paymentTermsId || "");
   const [sourceOfSupply, setSourceOfSupply] = useState(initialData?.sourceOfSupply || "");
   const [destinationOfSupply, setDestinationOfSupply] = useState(initialData?.destinationOfSupply || "");
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

  // Initialize from initialData or newRow
  useEffect(() => {
    if (initialData) {
         setReferenceNumber(initialData.referenceNumber || "");
      setDiscountPercent(initialData.discountPercent || 0);
         setDiscountAccountId(initialData.discountAccountId?._id || initialData.discountAccountId || "");
      setSourceOfSupply(initialData.sourceOfSupply || "");
      setDestinationOfSupply(initialData.destinationOfSupply || "");
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
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);

  useEffect(() => {
     const loadData = async () => {
        try {
           const [vRes, iRes, ptRes, accRes, tdsRes, tcsRes] = await Promise.all([
              contactApi.list({ type: "Vendor" }),
              itemApi.list(),
              settingsApi.paymentTerms.list(),
              accountApi.list(),
              tdsTaxApi.list(),
              tcsTaxApi.list(),
           ]);
                setVendors(vRes.data || []);
                setItems(iRes.data || []);
                setPaymentTerms(ptRes.data || []);
                setAccounts(accRes.data || []);

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
             setSourceOfSupply(bill.sourceOfSupply || "");
             setDestinationOfSupply(bill.destinationOfSupply || "");
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
  const total = subTotal - discountAmt - tdsAmount + tcsAmount + adjustmentAmount;

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

   function handleSelectItem(rowId: string, item: Item) {
      updateRow(rowId, {
         itemId: item._id,
         itemName: item.name,
         rate: item.costPrice || 0,
         quantity: 1,
      });
   }

  async function handleSubmit(status: BillStatus = "Draft") {
     if (!vendorId) return toast.error("Please select a vendor");
     setSaving(true);
     try {
        const payload: CreateBillInput = {
           vendorId,
           billNumber,
           referenceNumber,
           orderNumber,
           billDate,
           dueDate,
           paymentTermsId,
           sourceOfSupply,
           destinationOfSupply,
           subject,
           discountLevel,
           discountAccountId: discountAccountId || null,
           discountPercent,
           taxType,
           tdsId,
           tcsId,
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
              name: r.itemName,
              accountId: r.accountId || null,
              description: r.description,
              quantity: r.quantity,
              rate: r.rate,
              discountPercent: r.discountPercent,
              discountAmount: r.discountAmount,
              amount: r.amount,
           })),
           status
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
                     onChange={(e) => setVendorId(e.target.value)}
                  >
                     <option value="">Select a Vendor</option>
                     {vendors.map((v) => (
                        <option key={v._id} value={v._id}>{v.displayName || v.companyName}</option>
                     ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
               </div>
               <Button size="icon" className="h-9 w-9 bg-primary">
                  <Search className="h-4 w-4" />
               </Button>
            </div>
         </div>

         <div className="grid grid-cols-2 gap-x-12 gap-y-4 py-4 border-b">
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium text-red-500 w-36 shrink-0">Source Of Supply *</Label>
               <Select value={sourceOfSupply} onValueChange={setSourceOfSupply}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                     <SelectValue placeholder="Select Source" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                     {SUPPLY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium text-red-500 w-36 shrink-0">Destination Of Supply *</Label>
               <Select value={destinationOfSupply} onValueChange={setDestinationOfSupply}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                     <SelectValue placeholder="Select Destination" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                     {SUPPLY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                     ))}
                  </SelectContent>
               </Select>
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
            <div className="flex items-center gap-3">
               <Label className="text-sm font-medium w-36 shrink-0">Order Number</Label>
               <Input className="h-9 text-sm flex-1" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
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
               <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                     <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-6 px-2 py-2.5" />
                        <th className="text-left px-3 py-2.5 font-medium">Item Details</th>
                        <th className="text-left px-3 py-2.5 font-medium w-44">Account</th>
                        <th className="text-right px-3 py-2.5 font-medium w-24">Quantity</th>
                        <th className="text-right px-3 py-2.5 font-medium w-24">Rate</th>
                        {discountLevel === "line_item" && (
                           <th className="text-right px-3 py-2.5 font-medium w-28">Discount</th>
                        )}
                        <th className="text-right px-3 py-2.5 font-medium w-28">Amount</th>
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
                                 <td colSpan={discountLevel === "line_item" ? 6 : 5} className="px-3 py-2">
                                    <div className="text-[22px] leading-tight font-semibold text-muted-foreground/95">{row.headerText || "Add New Header"}</div>
                                 </td>
                              ) : (
                                 <>
                                    <td className="px-3 py-2 align-top">
                                       <DropdownMenu
                                          open={itemSelectorRow === row.id}
                                          onOpenChange={(open) => setItemSelectorRow(open ? row.id : null)}
                                       >
                                          <DropdownMenuTrigger asChild>
                                             <button
                                                type="button"
                                                className={cn("text-sm text-left w-full font-medium", row.itemName ? "text-primary" : "text-muted-foreground")}
                                             >
                                                {row.itemName || "Type or click to select an item."}
                                             </button>
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-72 p-0 overflow-hidden">
                                             <ItemSelectorPopup
                                                items={items}
                                                onSelect={(item) => {
                                                   handleSelectItem(row.id, item);
                                                   setItemSelectorRow(null);
                                                }}
                                             />
                                          </DropdownMenuContent>
                                       </DropdownMenu>
                                       <Textarea
                                          className="mt-1 text-xs text-muted-foreground resize-none border-0 shadow-none p-0 focus-visible:ring-0 min-h-0 h-auto bg-transparent"
                                          rows={1}
                                          placeholder="Add a description to your item"
                                          value={row.description}
                                          onChange={(e) => updateRow(row.id, { description: e.target.value })}
                                       />
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                       <AccountDropdown
                                          value={row.accountId}
                                          onChange={(id, name) => updateRow(row.id, { accountId: id, accountName: name })}
                                          accounts={accounts.filter((a) => a.rootType === "Expense")}
                                       />
                                    </td>
                                    <td className="px-3 py-2 align-top text-right">
                                       <Input
                                          type="number"
                                          className="h-8 text-right"
                                          value={row.quantity}
                                          onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                                       />
                                    </td>
                                    <td className="px-3 py-2 align-top text-right">
                                       <Input
                                          type="number"
                                          className="h-8 text-right"
                                          value={row.rate}
                                          onChange={(e) => updateRow(row.id, { rate: Number(e.target.value) || 0 })}
                                       />
                                    </td>
                                    {discountLevel === "line_item" && (
                                       <td className="px-3 py-2 align-top text-right">
                                          <Input
                                             type="number"
                                             className="h-8 text-right"
                                             value={row.discountPercent}
                                             onChange={(e) => updateRow(row.id, { discountPercent: Number(e.target.value) || 0 })}
                                          />
                                       </td>
                                    )}
                                    <td className="px-3 py-2 align-top text-right font-medium">{fmt(row.amount)}</td>
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
