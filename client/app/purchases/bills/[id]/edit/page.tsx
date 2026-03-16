"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Loader2, X, ChevronDown, Trash2, Upload, HelpCircle, FileText, Info, Plus, Search
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import { billApi, type UpdateBillInput, type DiscountLevel, type Bill } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { cn } from "@/lib/utils";
import { uploadApi, type UploadResult } from "@/lib/api/upload";

// ─── Constants ─────────────────────────────────────────────────────────────
const TODAY = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

interface LineRow {
  id: string;
  isHeader: boolean;
  headerText: string;
  itemId: string;
  itemName: string;
  accountId: string;
  accountName: string;
  description: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  amount: number;
  customerId?: string;
}

function newRow(): LineRow {
  return {
    id: Math.random().toString(36).slice(2),
    isHeader: false,
    headerText: "",
    itemId: "",
    itemName: "",
    accountId: "",
    accountName: "",
    description: "",
    quantity: 1,
    rate: 0,
    discountPercent: 0,
    discountAmount: 0,
    amount: 0,
    customerId: "",
  };
}

function calcRow(row: LineRow, discountLevel: DiscountLevel): LineRow {
  if (row.isHeader) return { ...row, amount: 0 };
  const lineTotal = row.quantity * row.rate;
  if (discountLevel === "line_item") {
    const discAmt = row.discountPercent > 0 ? (lineTotal * row.discountPercent) / 100 : row.discountAmount;
    return { ...row, discountAmount: discAmt, amount: lineTotal - discAmt };
  }
  return { ...row, discountPercent: 0, discountAmount: 0, amount: lineTotal };
}

function AccountDropdown({
  value, onChange, accounts, placeholder = "Select an account"
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  accounts: Account[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = accounts.find((a) => a._id === value);
  const filtered = accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-sm text-left hover:text-primary w-full group">
          <span className={cn("truncate flex-1 font-medium", selected ? "text-gray-900" : "text-muted-foreground")}>{selected ? selected.name : placeholder}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-0">
        <div className="p-2 border-b">
           <Input className="h-8 text-xs" placeholder="Search accounts..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.map(a => (
            <DropdownMenuItem key={a._id} onClick={() => { onChange(a._id, a.name); setOpen(false); }} className="text-[13px] py-2">
              <div className="flex flex-col">
                <span className="font-medium">{a.name}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{a.accountType}</span>
              </div>
            </DropdownMenuItem>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No accounts found</div>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function EditBillPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  // State
  const [bill, setBill] = useState<Bill | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [accountsPayableId, setAccountsPayableId] = useState("");
  const [subject, setSubject] = useState("");
  const [rows, setRows] = useState<LineRow[]>([]);
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>("transaction");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("none");
  const [tdsId, setTdsId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [attachments, setAttachments] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDD, setShowVendorDD] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  const loadData = useCallback(async () => {
    if (!activeOrganization?._id || !id) return;
    setFetching(true);
    try {
      const [vRes, cRes, iRes, aRes, ptRes, tdsRes, bRes] = await Promise.all([
        contactApi.list({ type: "Vendor", page: 1, limit: 1000 }),
        contactApi.list({ type: "Customer", page: 1, limit: 1000 }),
        itemApi.list({ page: 1, limit: 1000 }),
        accountApi.list({ excludeGroups: true }),
        settingsApi.paymentTerms.list(),
        tdsTaxApi.list(),
        billApi.getOne(id),
      ]);
      setVendors(vRes.data ?? []);
      setCustomers(cRes.data ?? []);
      setItems(iRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setPaymentTermsList(ptRes.data ?? []);
      setTdsTaxes(tdsRes.data ?? []);
      
      const b = bRes.data;
      setBill(b);
      setVendorId(typeof b.vendorId === "object" ? b.vendorId._id : b.vendorId);
      setBillNumber(b.billNumber);
      setOrderNumber(b.orderNumber || "");
      setBillDate(b.billDate.slice(0, 10));
      setDueDate(b.dueDate ? b.dueDate.slice(0, 10) : "");
      setPaymentTermsId(typeof b.paymentTermsId === "object" ? b.paymentTermsId._id : b.paymentTermsId || "");
      setAccountsPayableId(typeof b.accountsPayableId === "object" ? b.accountsPayableId._id : b.accountsPayableId || "");
      setSubject(b.subject || "");
      setDiscountLevel(b.discountLevel);
      setDiscountPercent(b.discountPercent);
      setTaxType(b.taxType);
      setTdsId(typeof b.tdsId === "object" ? b.tdsId._id : b.tdsId || "");
      setAdjustmentLabel(b.adjustmentLabel);
      setAdjustmentAmount(b.adjustmentAmount);
      setNotes(b.notes || "");
      setTerms(b.termsAndConditions || "");
      setAttachments((b.attachments || []).map(url => ({ url, originalName: url.split("/").pop() || "File", publicId: "", size: 0 })));
      setRows(b.lineItems.map(li => ({
        id: li._id || Math.random().toString(36).slice(2),
        isHeader: li.isHeader || false,
        headerText: li.headerText || "",
        itemId: typeof li.itemId === "object" ? li.itemId?._id || "" : li.itemId || "",
        itemName: li.name,
        accountId: typeof li.accountId === "object" ? li.accountId?._id || "" : li.accountId || "",
        accountName: "",
        description: li.description || "",
        quantity: li.quantity,
        rate: li.rate,
        discountPercent: li.discountPercent || 0,
        discountAmount: li.discountAmount || 0,
        amount: li.amount,
        customerId: li.customerId || "",
      })));

    } catch { toast.error("Failed to load bill data"); } finally { setFetching(false); }
  }, [activeOrganization?._id, id]);

  useEffect(() => { loadData(); }, [loadData]);

  const subTotal = rows.filter(r => !r.isHeader).reduce((s, r) => s + r.amount, 0);
  const discAmt = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : rows.reduce((s, r) => s + r.discountAmount, 0);
  const selectedTds = tdsTaxes.find(t => t._id === tdsId);
  const taxAmt = taxType === "TDS" && selectedTds ? ((subTotal - discAmt) * selectedTds.rate) / 100 : 0;
  const total = subTotal - discAmt - taxAmt + adjustmentAmount;

  const selectedVendor = vendors.find(v => v._id === vendorId);
  const filteredVendors = vendors.filter(v => getName(v).toLowerCase().includes(vendorSearch.toLowerCase()));

  const handleSave = async () => {
    if (!vendorId) { toast.error("Please select a vendor"); return; }
    setSaving(true);
    try {
      const data: UpdateBillInput = {
        vendorId,
        billNumber,
        orderNumber,
        billDate,
        dueDate: dueDate || null,
        paymentTermsId: paymentTermsId || null,
        accountsPayableId: accountsPayableId || null,
        subject,
        discountLevel,
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
          amount: r.amount,
        })),
        discountPercent,
        taxType,
        tdsId: tdsId || null,
        notes,
        termsAndConditions: terms,
        attachments: attachments.map(a => a.url),
      };
      await billApi.update(id, data);
      toast.success("Bill updated successfully");
      router.push("/purchases/bills");
    } catch { toast.error("Failed to update bill"); } finally { setSaving(false); }
  };

  function updateRow(rid: string, patch: Partial<LineRow>) {
    setRows(prev => prev.map(r => r.id === rid ? calcRow({ ...r, ...patch }, discountLevel) : r));
  }

  if (fetching) return <div className="h-screen flex items-center justify-center gap-2"><Loader2 className="h-6 w-6 animate-spin text-primary" /> Loading...</div>;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden bg-[#f8f9fa]">
          <PageHeader
            breadcrumb={<span className="font-semibold text-lg">Edit Bill - {billNumber}</span>}
            actions={(
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => router.back()} disabled={saving}>Cancel</Button>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={saving}>
                   {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save Changes
                </Button>
              </div>
            )}
          />

          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-5xl mx-auto space-y-8 bg-white p-10 rounded-xl shadow-sm border border-gray-100">
               {/* Same form structure as NewBillPage */}
               <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 items-start">
                  <div className="space-y-1"><Label className="text-[13px] font-bold text-red-500 uppercase tracking-tight">Vendor Name *</Label></div>
                  <div className="relative">
                     <DropdownMenu open={showVendorDD} onOpenChange={setShowVendorDD}>
                        <DropdownMenuTrigger asChild>
                           <button className="w-full h-10 border rounded-md px-4 text-left flex items-center justify-between hover:border-blue-400 transition-all bg-gray-50/30">
                              <span className={selectedVendor ? "font-medium text-gray-900" : "text-muted-foreground"}>{selectedVendor ? getName(selectedVendor) : "Select or add a vendor"}</span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[400px] p-0 shadow-2xl" align="start">
                           <div className="p-3 border-b flex items-center gap-2 bg-gray-50/50">
                              <Search className="h-4 w-4 text-muted-foreground" />
                              <Input className="h-9 border-none focus-visible:ring-0 bg-transparent" placeholder="Search vendors..." value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} autoFocus />
                           </div>
                           <div className="max-h-80 overflow-y-auto py-1">
                              {filteredVendors.map(v => (
                                 <DropdownMenuItem key={v._id} className="p-4 cursor-pointer hover:bg-blue-50 focus:bg-blue-50 group border-b last:border-0" onClick={() => { setVendorId(v._id); setShowVendorDD(false); }}>
                                    <div className="flex flex-col gap-0.5">
                                       <span className="font-bold text-[14px] text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{getName(v)}</span>
                                       <span className="text-[12px] text-muted-foreground">{v.email || "No email provided"}</span>
                                    </div>
                                 </DropdownMenuItem>
                              ))}
                           </div>
                        </DropdownMenuContent>
                     </DropdownMenu>
                     {selectedVendor && (
                        <div className="mt-4 p-4 rounded-lg bg-blue-50/50 border border-blue-100 italic font-medium text-sm text-gray-600">
                           <p className="font-bold text-blue-800 not-italic uppercase tracking-wider text-xs mb-1.5">Billing Address</p>
                           {selectedVendor.billingAddress ? (
                              <><p>{selectedVendor.billingAddress.street}</p><p>{selectedVendor.billingAddress.city}, {selectedVendor.billingAddress.state} {selectedVendor.billingAddress.zip}</p><p>{selectedVendor.billingAddress.country}</p></>
                           ) : <p>No billing address provided</p>}
                        </div>
                     )}
                  </div>
               </div>

               <Separator className="bg-gray-100" />

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                     <div className="flex items-center gap-4">
                        <Label className="w-32 text-[13px] font-bold text-red-500 uppercase tracking-tight">Bill# *</Label>
                        <Input className="flex-1 h-9 bg-gray-50/30 focus:bg-white transition-all border-blue-100 focus:border-blue-400 font-medium" value={billNumber} onChange={e => setBillNumber(e.target.value)} />
                     </div>
                     <div className="flex items-center gap-4">
                        <Label className="w-32 text-[13px] font-bold text-gray-500 uppercase tracking-tight">Order Number</Label>
                        <Input className="flex-1 h-9 bg-gray-50/30 font-medium" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
                     </div>
                  </div>
                  <div className="space-y-6">
                     <div className="flex items-center gap-4">
                        <Label className="w-32 text-[13px] font-bold text-red-500 uppercase tracking-tight">Bill Date *</Label>
                        <Input type="date" className="flex-1 h-9 bg-gray-50/30 font-medium" value={billDate} onChange={e => setBillDate(e.target.value)} />
                     </div>
                     <div className="flex items-center gap-4">
                        <Label className="w-32 text-[13px] font-bold text-gray-500 uppercase tracking-tight">Due Date</Label>
                        <Input type="date" className="flex-1 h-9 bg-gray-50/30 font-medium" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                     </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="flex items-center gap-4">
                     <Label className="w-32 text-[13px] font-bold text-gray-500 uppercase tracking-tight">Payment Terms</Label>
                     <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
                        <SelectTrigger className="flex-1 h-9 bg-gray-50/30 font-medium"><SelectValue placeholder="Due on Receipt" /></SelectTrigger>
                        <SelectContent>{paymentTermsList.map(pt => <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>)}</SelectContent>
                     </Select>
                  </div>
                  <div className="flex items-center gap-4">
                     <Label className="w-32 text-[13px] font-bold text-gray-500 uppercase tracking-tight">Accounts Payable</Label>
                     <AccountDropdown accounts={accounts.filter(a => a.accountType === "Accounts Payable")} value={accountsPayableId} onChange={(id) => setAccountsPayableId(id)} />
                  </div>
               </div>

               <div className="space-y-2">
                  <Label className="text-[13px] font-bold text-gray-500 uppercase tracking-tight">Subject</Label>
                  <Textarea className="min-h-[60px] resize-none bg-gray-50/30 font-medium" maxLength={250} value={subject} onChange={e => setSubject(e.target.value)} />
               </div>

               <div className="pt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                     <thead className="bg-gray-900 text-white">
                        <tr className="uppercase text-[11px] tracking-widest font-bold">
                           <th className="px-4 py-3 text-left w-12">#</th>
                           <th className="px-4 py-3 text-left">Item Details</th>
                           <th className="px-4 py-3 text-left">Account</th>
                           <th className="px-4 py-3 text-right w-24">Quantity</th>
                           <th className="px-4 py-3 text-right w-32">Rate</th>
                           <th className="px-4 py-3 text-left">Customer Details</th>
                           <th className="px-4 py-3 text-right w-32">Amount</th>
                           <th className="px-4 py-3 w-10"></th>
                        </tr>
                     </thead>
                     <tbody className="divide-y border-x border-b">
                        {rows.map((row, idx) => (
                           <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-4 py-4 text-xs font-bold text-muted-foreground">{idx + 1}</td>
                              <td className="px-4 py-4 min-w-[200px]">
                                 <Select value={row.itemId} onValueChange={(vid) => {
                                    const item = items.find(i => i._id === vid);
                                    if (item) updateRow(row.id, { itemId: vid, itemName: item.name, rate: item.costPrice || 0, accountId: item.purchaseAccountId || "" });
                                 }}>
                                    <SelectTrigger className="h-8 border-none bg-transparent hover:bg-gray-100 p-1 font-medium focus:ring-0"><SelectValue placeholder="Select or type to add" /></SelectTrigger>
                                    <SelectContent>{items.map(i => <SelectItem key={i._id} value={i._id}>{i.name}</SelectItem>)}</SelectContent>
                                 </Select>
                                 <Input className="h-7 mt-1 text-xs border-transparent focus:border-blue-200 focus-visible:ring-0 bg-transparent px-1" placeholder="Add description..." value={row.description} onChange={e => updateRow(row.id, { description: e.target.value })} />
                              </td>
                              <td className="px-4 py-4 min-w-[180px]"><AccountDropdown accounts={accounts.filter(a => a.rootType === "Expense")} value={row.accountId} onChange={(id) => updateRow(row.id, { accountId: id })} /></td>
                              <td className="px-4 py-4"><Input type="number" className="h-8 text-right font-medium border-transparent focus:border-blue-200 focus-visible:ring-0 bg-transparent" value={row.quantity} onChange={e => updateRow(row.id, { quantity: Number(e.target.value) })} /></td>
                              <td className="px-4 py-4"><Input type="number" className="h-8 text-right font-medium border-transparent focus:border-blue-200 focus-visible:ring-0 bg-transparent" value={row.rate} onChange={e => updateRow(row.id, { rate: Number(e.target.value) })} /></td>
                              <td className="px-4 py-4 min-w-[180px]">
                                 <Select value={row.customerId} onValueChange={cid => updateRow(row.id, { customerId: cid })}>
                                    <SelectTrigger className="h-8 border-none bg-transparent hover:bg-gray-100 p-1 font-medium focus:ring-0"><SelectValue placeholder="Billable Customer" /></SelectTrigger>
                                    <SelectContent>{customers.map(c => <SelectItem key={c._id} value={c._id}>{getName(c)}</SelectItem>)}</SelectContent>
                                 </Select>
                              </td>
                              <td className="px-4 py-4 text-right font-bold text-gray-900">{fmt(row.amount)}</td>
                              <td className="px-4 py-4">
                                 <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors" onClick={() => setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== row.id) : prev)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                 </Button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  <div className="flex items-center gap-3 mt-4">
                     <Button variant="outline" size="sm" className="h-8 text-xs font-bold uppercase tracking-wider text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setRows(prev => [...prev, newRow()])}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Row</Button>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-10">
                  <div className="space-y-6">
                     <div className="space-y-2">
                        <Label className="text-[13px] font-bold text-gray-500 uppercase tracking-tight">Customer Notes</Label>
                        <Textarea className="min-h-[100px] bg-gray-50/30 italic" value={notes} onChange={e => setNotes(e.target.value)} />
                     </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-8 space-y-5 border shadow-sm">
                     <div className="flex items-center justify-between text-sm"><span className="font-bold text-gray-500 uppercase tracking-tight">Sub Total</span><span className="font-bold text-lg">{fmt(subTotal)}</span></div>
                     <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-4"><span className="text-sm font-bold text-gray-500 uppercase tracking-tight">Discount</span>
                           <div className="flex items-center gap-2"><Input type="number" className="w-16 h-8 text-right text-sm font-bold bg-white" value={discountPercent} onChange={e => setDiscountPercent(Number(e.target.value))} /><span className="text-sm font-bold">%</span></div>
                        </div>
                        <span className="font-bold text-sm text-red-500">-{fmt(discAmt)}</span>
                     </div>
                     <div className="flex items-center gap-2 pt-2"><div className="flex-1 flex items-center gap-2"><Input className="h-8 text-sm font-bold text-gray-500 uppercase tracking-tight bg-transparent border-none p-0 focus-visible:ring-0" value={adjustmentLabel} onChange={e => setAdjustmentLabel(e.target.value)} /><HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /></div>
                        <div className="flex items-center gap-2"><Input type="number" className="w-20 h-8 text-right text-sm font-bold bg-white" value={adjustmentAmount} onChange={e => setAdjustmentAmount(Number(e.target.value))} /></div>
                     </div>
                     <Separator className="bg-gray-200" /><div className="flex items-center justify-between text-blue-600"><span className="text-lg font-black uppercase tracking-widest">Total (₹)</span><span className="text-3xl font-black">{fmt(total)}</span></div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
