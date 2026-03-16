"use client";

import { useEffect, useState, useCallback, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, X, ChevronDown, GripVertical, Pencil,
  Settings2, Upload, HelpCircle, Trash2, MoreHorizontal, Info, CircleDot, ExternalLink,
  ShoppingBag as ShoppingBagIcon
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import { billApi, type CreateBillInput, type DiscountLevel, type BillSourcePurchaseOrder } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax, type CreateTcsTaxInput, TCS_SECTIONS } from "@/lib/api/tcs-taxes";
import { cn } from "@/lib/utils";
import { uploadApi, type UploadResult } from "@/lib/api/upload";
import { Html5QrcodeScanner } from "html5-qrcode";

// --- Helpers ----------------------------------------------------------------
const TODAY = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

const DEFAULT_TCS_TAXES: TcsTax[] = [
  { _id: "default-tcs-1", organizationId: "", taxName: "TCS on Sales", rate: 1, sectionCode: "194O", sectionDescription: "TCS on Sale", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-tcs-2", organizationId: "", taxName: "TCS on Sale of Goods (Reduced)", rate: 0.5, sectionCode: "194O", sectionDescription: "TCS on Sale", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-tcs-3", organizationId: "", taxName: "TCS on Sale of Services", rate: 1, sectionCode: "194O", sectionDescription: "TCS on Sale", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
];

const DEFAULT_TDS_TAXES: TdsTax[] = [
  { _id: "default-1", organizationId: "", taxName: "Commission or Brokerage", rate: 2, sectionCode: "194H", sectionDescription: "Commission or Brokerage", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-2", organizationId: "", taxName: "Commission or Brokerage (Reduced)", rate: 3.75, sectionCode: "194H", sectionDescription: "Commission or Brokerage", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-3", organizationId: "", taxName: "Dividend", rate: 10, sectionCode: "194", sectionDescription: "Dividend", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-4", organizationId: "", taxName: "Dividend (Reduced)", rate: 7.5, sectionCode: "194", sectionDescription: "Dividend", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-5", organizationId: "", taxName: "Other Interest than securities", rate: 10, sectionCode: "194A", sectionDescription: "Other Interest than securities", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-6", organizationId: "", taxName: "Other Interest than securities (Reduced)", rate: 7.5, sectionCode: "194A", sectionDescription: "Other Interest than securities", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-7", organizationId: "", taxName: "Payment of contractors for Others", rate: 2, sectionCode: "194C", sectionDescription: "Payment of contractors for Others", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-8", organizationId: "", taxName: "Payment of contractors for Others (Reduced)", rate: 1.5, sectionCode: "194C", sectionDescription: "Payment of contractors for Others", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-9", organizationId: "", taxName: "Payment of contractors HUF/Indiv", rate: 1, sectionCode: "194C", sectionDescription: "Payment of contractors HUF/Indiv", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-10", organizationId: "", taxName: "Payment of contractors HUF/Indiv (Reduced)", rate: 0.75, sectionCode: "194C", sectionDescription: "Payment of contractors HUF/Indiv", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-11", organizationId: "", taxName: "Professional Fees", rate: 10, sectionCode: "194J", sectionDescription: "Professional Fees", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-12", organizationId: "", taxName: "Professional Fees (Reduced)", rate: 7.5, sectionCode: "194J", sectionDescription: "Professional Fees", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-13", organizationId: "", taxName: "Rent on land or furniture etc", rate: 10, sectionCode: "194I(A)", sectionDescription: "Rent on land or furniture etc", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-14", organizationId: "", taxName: "Rent on land or furniture etc (Reduced)", rate: 7.5, sectionCode: "194I(A)", sectionDescription: "Rent on land or furniture etc", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
  { _id: "default-15", organizationId: "", taxName: "Technical Fees (2%)", rate: 2, sectionCode: "194J(A)", sectionDescription: "Technical services", isHigherRate: false, isActive: true, createdAt: "", updatedAt: "" },
];

// --- Line Item type ----------------------------------------------------------
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
  unit?: string;
  customerId?: string;
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
  quantity: 1,
  rate: 0,
  discountPercent: 0,
  discountAmount: 0,
  amount: 0,
  unit: "",
  customerId: "",
});

const newHeader = (): LineRow => ({
  ...newRow(),
  isHeader: true,
  headerText: "New Header",
});

function calcRow(row: LineRow, discountLevel: DiscountLevel): LineRow {
  if (row.isHeader) return { ...row, amount: 0 };
  const base = row.quantity * row.rate;
  let discAmt = row.discountAmount;
  if (discountLevel === "line_item" && row.discountPercent > 0) {
    discAmt = (base * row.discountPercent) / 100;
  }
  return { ...row, discountAmount: discAmt, amount: base - discAmt };
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
      setForm({
        taxName: "",
        rate: 0,
        sectionCode: "",
        sectionDescription: "",
        tdsPayableAccountId: null,
        tdsReceivableAccountId: null,
        isHigherRate: false,
        applicableStartDate: null,
        applicableEndDate: null,
      });
    } catch {
      toast.error("Failed to create TDS tax");
    } finally {
      setSaving(false);
    }
  }

  const payableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(payableSearch.toLowerCase()));
  const receivableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(receivableSearch.toLowerCase()));
  const selectedPayable = accounts.find((a) => a._id === form.tdsPayableAccountId);
  const selectedReceivable = accounts.find((a) => a._id === form.tdsReceivableAccountId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">Manage TDS</DialogTitle>
        </DialogHeader>

        {!showNew ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">TDS taxes</h3>
              <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5" /> New TDS Tax
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Tax Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Rate (%)</th>
                    <th className="px-4 py-2.5 text-left font-medium">Section</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tdsTaxes.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No TDS taxes yet. Click "+ New TDS Tax" to add one.</td></tr>
                  ) : tdsTaxes.map((t) => (
                    <tr key={t._id}>
                      <td className="px-4 py-2.5">{t.taxName}</td>
                      <td className="px-4 py-2.5">{t.rate}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Section {t.sectionCode}</td>
                      <td className="px-4 py-2.5 font-medium text-green-600">{t.isActive ? "Active" : "Inactive"}</td>
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
                <SelectContent className="max-h-72 bg-white">
                  {TDS_SECTIONS.map((s) => (
                    <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 rounded bg-blue-50 p-3 text-xs text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>By default, TDS will be tracked under <strong>TDS Payable</strong> and <strong>TDS Receivable</strong> accounts. Click Edit to choose an account of your choice.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium">TDS Payable Account</Label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm hover:bg-muted/30"
                    onClick={() => setShowPayableDD((v) => !v)}
                  >
                    <span className={selectedPayable ? "" : "text-muted-foreground"}>
                      {selectedPayable ? selectedPayable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showPayableDD && (
                    <div className="absolute top-full z-[180] mt-1 w-full rounded-md border bg-white shadow-lg">
                      <div className="border-b p-2">
                        <Input className="h-7 text-xs" placeholder="Search" value={payableSearch} onChange={(e) => setPayableSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {payableAccounts.map((a) => (
                          <button key={a._id} type="button" className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50", form.tdsPayableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => { setForm((f) => ({ ...f, tdsPayableAccountId: a._id })); setShowPayableDD(false); setPayableSearch(""); }}>
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
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm hover:bg-muted/30"
                    onClick={() => setShowReceivableDD((v) => !v)}
                  >
                    <span className={selectedReceivable ? "" : "text-muted-foreground"}>
                      {selectedReceivable ? selectedReceivable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showReceivableDD && (
                    <div className="absolute top-full z-[180] mt-1 w-full rounded-md border bg-white shadow-lg">
                      <div className="border-b p-2">
                        <Input className="h-7 text-xs" placeholder="Search" value={receivableSearch} onChange={(e) => setReceivableSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {receivableAccounts.map((a) => (
                          <button key={a._id} type="button" className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50", form.tdsReceivableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => { setForm((f) => ({ ...f, tdsReceivableAccountId: a._id })); setShowReceivableDD(false); setReceivableSearch(""); }}>
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
              <label htmlFor="isHigherRate" className="cursor-pointer text-sm">This is a Higher TDS Rate</label>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Applicable Period <HelpCircle className="inline h-4 w-4 text-muted-foreground" /></h4>
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
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save
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
      accountApi.list({ excludeGroups: true }).then((r) => setAccounts(r.data ?? [])).catch(() => { });
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
      setForm({
        taxName: "", rate: 0, sectionCode: "", sectionDescription: "",
        tcsPayableAccountId: null, tcsReceivableAccountId: null,
        isHigherRate: false, applicableStartDate: null, applicableEndDate: null,
      });
    } catch {
      toast.error("Failed to create TCS tax");
    } finally {
      setSaving(false);
    }
  }

  const payableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(payableSearch.toLowerCase()));
  const receivableAccounts = accounts.filter((a) => a.name.toLowerCase().includes(receivableSearch.toLowerCase()));
  const selectedPayable = accounts.find((a) => a._id === form.tcsPayableAccountId);
  const selectedReceivable = accounts.find((a) => a._id === form.tcsReceivableAccountId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">Manage TCS</DialogTitle>
        </DialogHeader>

        {!showNew ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">TCS taxes</h3>
              <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}>
                <Plus className="h-3.5 w-3.5" /> New TCS Tax
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Tax Name</th>
                    <th className="px-4 py-2.5 text-left font-medium">Rate (%)</th>
                    <th className="px-4 py-2.5 text-left font-medium">Section</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tcsTaxes.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No TCS taxes yet. Click "+ New TCS Tax" to add one.</td></tr>
                  ) : tcsTaxes.map((t) => (
                    <tr key={t._id}>
                      <td className="px-4 py-2.5">{t.taxName}</td>
                      <td className="px-4 py-2.5">{t.rate}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Section {t.sectionCode}</td>
                      <td className="px-4 py-2.5 font-medium text-green-600">{t.isActive ? "Active" : "Inactive"}</td>
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
              <Label className="text-xs font-medium text-red-500">Section *</Label>
              <Select value={form.sectionCode} onValueChange={(v) => setForm((f) => ({ ...f, sectionCode: v }))}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Select a Tax Type." />
                </SelectTrigger>
                <SelectContent className="max-h-72 bg-white">
                  {TCS_SECTIONS.map((s) => (
                    <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 rounded bg-blue-50 p-3 text-xs text-blue-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>By default, TCS will be tracked under <strong>TCS Payable</strong> and <strong>TCS Receivable</strong> accounts. Click Edit to choose an account of your choice.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium">TCS Payable Account</Label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm hover:bg-muted/30"
                    onClick={() => setShowPayableDD((v) => !v)}
                  >
                    <span className={selectedPayable ? "" : "text-muted-foreground"}>
                      {selectedPayable ? selectedPayable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showPayableDD && (
                    <div className="absolute top-full z-[180] mt-1 w-full rounded-md border bg-white shadow-lg">
                      <div className="border-b p-2">
                        <Input className="h-7 text-xs" placeholder="Search" value={payableSearch} onChange={(e) => setPayableSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {payableAccounts.map((a) => (
                          <button key={a._id} type="button" className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50", form.tcsPayableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => { setForm((f) => ({ ...f, tcsPayableAccountId: a._id })); setShowPayableDD(false); setPayableSearch(""); }}>
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
                  <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left text-sm hover:bg-muted/30"
                    onClick={() => setShowReceivableDD((v) => !v)}
                  >
                    <span className={selectedReceivable ? "" : "text-muted-foreground"}>
                      {selectedReceivable ? selectedReceivable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showReceivableDD && (
                    <div className="absolute top-full z-[180] mt-1 w-full rounded-md border bg-white shadow-lg">
                      <div className="border-b p-2">
                        <Input className="h-7 text-xs" placeholder="Search" value={receivableSearch} onChange={(e) => setReceivableSearch(e.target.value)} autoFocus />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {receivableAccounts.map((a) => (
                          <button key={a._id} type="button" className={cn("w-full px-3 py-2 text-left text-sm hover:bg-muted/50", form.tcsReceivableAccountId === a._id && "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => { setForm((f) => ({ ...f, tcsReceivableAccountId: a._id })); setShowReceivableDD(false); setReceivableSearch(""); }}>
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
              <label htmlFor="isHigherRateTcs" className="cursor-pointer text-sm">This is a Higher TCS Rate</label>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Applicable Period <HelpCircle className="inline h-4 w-4 text-muted-foreground" /></h4>
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
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Bulk Add Items Dialog ------------------------------------------------
function BulkAddItemsDialog({
  open, onClose, items, onAdd,
}: {
  open: boolean;
  onClose: () => void;
  items: Item[];
  onAdd: (selected: Item[]) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) || (i.sku || "").toLowerCase().includes(q.toLowerCase()));
  const selectedItems = items.filter((i) => selected.has(i._id));
  const totalQty = selectedItems.reduce((s, i) => s + (quantities[i._id] || 1), 0);

  function toggleItem(item: Item) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item._id)) next.delete(item._id);
      else next.add(item._id);
      return next;
    });
    if (!quantities[item._id]) setQuantities((prev) => ({ ...prev, [item._id]: 1 }));
  }

  function handleAdd() {
    onAdd(selectedItems.map((i) => ({ ...i, _bulkQty: quantities[i._id] || 1 } as any)));
    setSelected(new Set()); setQuantities({}); setQ("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] p-0 overflow-hidden text-black bg-white">
        <div className="flex h-full flex-col md:flex-row bg-white">
          <div className="w-full md:w-[420px] border-b md:border-b-0 md:border-r flex flex-col min-h-[240px] md:min-h-0">
            <div className="p-4 border-b">
              <Input
                className="h-9 text-sm text-black"
                placeholder="Type to search or scan the barcode of the item"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map((item) => (
                <button
                  key={item._id}
                  type="button"
                  className={cn("w-full text-left px-4 py-3 border-b hover:bg-muted/40 flex items-center justify-between", selected.has(item._id) && "bg-blue-50")}
                  onClick={() => toggleItem(item)}
                >
                  <div>
                    <p className="text-sm font-medium text-primary">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Purchase Rate: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.costPrice || 0)}
                    </p>
                  </div>
                  {selected.has(item._id) && (
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <svg viewBox="0 0 12 10" fill="none" className="h-3 w-3"><path d="M1 5l3 3 7-7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No items found</p>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-black">Selected Items <span className="ml-2 bg-muted rounded-full px-2 py-0.5 text-sm">{selected.size}</span></h3>
              <span className="text-sm text-muted-foreground">Total Quantity: {totalQty}</span>
            </div>
            {selectedItems.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                Click the item names from the left pane to select them
              </div>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto">
                {selectedItems.map((item) => (
                  <div key={item._id} className="flex items-center gap-3 border rounded p-2.5">
                    <div className="flex-1 text-sm font-medium text-black">{item.name}</div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7 text-base text-black" onClick={() => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, (p[item._id] || 1) - 1) }))}>-</Button>
                      <Input className="h-7 w-14 text-center text-sm text-black" type="number" min={1} value={quantities[item._id] || 1} onChange={(e) => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, Number(e.target.value)) }))} />
                      <Button variant="outline" size="icon" className="h-7 w-7 text-base text-black" onClick={() => setQuantities((p) => ({ ...p, [item._id]: (p[item._id] || 1) + 1 }))}>+</Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => toggleItem(item)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button size="sm" onClick={handleAdd} disabled={selected.size === 0}>Add Items</Button>
              <Button variant="outline" size="sm" className="text-black" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemSelectorPopup({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void; }) {
  const [q, setQ] = useState("");
  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="w-full overflow-hidden bg-white text-black border shadow-lg rounded-md">
      <div className="p-2 border-b"><Input className="h-7 text-xs text-black" placeholder="Search items..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (<p className="text-xs text-muted-foreground text-center py-4">No items found</p>) : filtered.map((item) => (
          <button key={item._id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 flex justify-between" onClick={() => onSelect(item)}>
            <span className="text-sm">{item.name}</span>
            <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.costPrice || 0)}</span>
          </button>
        ))}
      </div>
      <div className="p-2 border-t"><button type="button" className="text-xs text-primary hover:underline">+ Add New Item</button></div>
    </div>
  );
}

function AccountDropdown({ value, onChange, accounts }: { value: string; onChange: (id: string, name: string) => void; accounts: Account[]; }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = accounts.find((a) => a._id === value);
  const grouped = accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).reduce<Record<string, Account[]>>((acc, a) => {
    const g = a.accountType || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(a);
    return acc;
  }, {});
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-sm text-left hover:text-primary min-w-[120px]">
          <span className={selected ? "text-blue-600 font-medium truncate" : "text-muted-foreground truncate"}>{selected ? selected.name : "Select account"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-64 p-0 overflow-hidden bg-white border border-gray-200">
        <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}><Input className="h-7 text-xs text-black" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        <div className="max-h-64 overflow-y-auto">
          {Object.entries(grouped).map(([group, accs]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">{group}</div>
              {accs.map((a) => (
                <button key={a._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", value === a._id && "bg-primary/10 text-primary font-medium")} onClick={() => { onChange(a._id, a.name); setOpen(false); setQ(""); }}>{a.name}</button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No accounts found</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function NewBillPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [billDate, setBillDate] = useState(TODAY());
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [accountsPayableId, setAccountsPayableId] = useState("");
  const [subject, setSubject] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>("transaction");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [discountType, setDiscountType] = useState<"%" | "₹">("%");
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [tdsSearch, setTdsSearch] = useState("");
  const [tcsSearch, setTcsSearch] = useState("");
  const [showTaxDD, setShowTaxDD] = useState(false);
  const [showTCSDD, setShowTCSDD] = useState(false);
  const [showDiscountTypeDD, setShowDiscountTypeDD] = useState(false);
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [attachments, setAttachments] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showVendorDD, setShowVendorDD] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [openPurchaseOrders, setOpenPurchaseOrders] = useState<BillSourcePurchaseOrder[]>([]);
  const [includedPoIds, setIncludedPoIds] = useState<string[]>([]);
  const [loadingOpenPOs, setLoadingOpenPOs] = useState(false);
  const [showPoScanner, setShowPoScanner] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showManageTDS, setShowManageTDS] = useState(false);
  const [showManageTCS, setShowManageTCS] = useState(false);
  const [showReportingTagsDialog, setShowReportingTagsDialog] = useState(false);
  const [itemSelectorRow, setItemSelectorRow] = useState<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);

  const handleBulkAdd = useCallback((selectedItems: any[]) => {
    const newRows = selectedItems.map((item) => ({
      ...newRow(),
      itemId: item._id,
      itemName: item.name,
      accountId: item.purchaseAccountId || "",
      accountName: accounts.find(a => a._id === item.purchaseAccountId)?.name || "",
      quantity: item._bulkQty || 1,
      rate: item.costPrice || 0,
      unit: typeof item.unit === "object" ? (item.unit as any)?.abbreviation : item.unit,
      amount: (item._bulkQty || 1) * (item.costPrice || 0),
    }));

    setRows((prev) => {
      const filtered = prev.filter((r) => r.itemId || r.headerText);
      return [...filtered, ...newRows];
    });
    setShowBulkAdd(false);
  }, [accounts]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (showPoScanner) {
      const timer = setTimeout(() => {
        const element = document.getElementById("qr-reader");
        if (element) {
          scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 }, false);
          scanner.render((decodedText) => {
            const po = openPurchaseOrders.find(p => p.purchaseOrderNumber === decodedText);
            if (po && !includedPoIds.includes(po._id)) { 
              includePurchaseOrder(po._id); 
              toast.success("PO Included"); 
            }
            else if (po) toast.error("PO already included");
            else toast.error("PO not found");
            setShowPoScanner(false);
          }, console.log);
        }
      }, 100);
      return () => {
        clearTimeout(timer);
        if (scanner) scanner.clear().catch(console.error);
      };
    }
  }, [showPoScanner, openPurchaseOrders, includedPoIds]);

  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => { if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup"); }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const loadData = useCallback(async () => {
    if (!firebaseUser || loading || !activeOrganization?._id) return;
    setFetching(true);
    try {
      const [vRes, cRes, iRes, aRes, ptRes, tdsRes, tcsRes, numRes] = await Promise.all([
        contactApi.list({ type: "Vendor", page: 1, limit: 1000 }),
        contactApi.list({ type: "Customer", page: 1, limit: 1000 }),
        itemApi.list({ page: 1, limit: 1000 }),
        accountApi.list({ excludeGroups: true }),
        settingsApi.paymentTerms.list(),
        tdsTaxApi.list(),
        tcsTaxApi.list(),
        billApi.getNextNumber(),
      ]);
      setVendors(vRes.data ?? []);
      setCustomers(cRes.data ?? []);
      setItems(iRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setPaymentTermsList(ptRes.data ?? []);
      const taxData = tdsRes.data ?? [];
      const nextTaxes = taxData.length > 0 ? taxData : DEFAULT_TDS_TAXES;
      setTdsTaxes(nextTaxes);
      const tcsData = tcsRes.data ?? [];
      setTcsTaxes(tcsData.length > 0 ? tcsData : DEFAULT_TCS_TAXES);
      setBillNumber(numRes.data.billNumber || "");
      const apAccount = aRes.data?.find(a => a.accountType === "Accounts Payable" && a.name === "Accounts Payable");
      if (apAccount) setAccountsPayableId(apAccount._id);
    } catch { toast.error("Load failed"); } finally { setFetching(false); }
  }, [firebaseUser, loading, activeOrganization?._id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!vendorId) { setOpenPurchaseOrders([]); return; }
    (async () => {
      setLoadingOpenPOs(true);
      try { const res = await billApi.getOpenPurchaseOrders(vendorId); setOpenPurchaseOrders(res.data || []); }
      catch { setOpenPurchaseOrders([]); }
      finally { setLoadingOpenPOs(false); }
    })();
  }, [vendorId]);

  const subTotal = rows.filter(r => !r.isHeader).reduce((s, r) => s + r.amount, 0);
  const discountAmt = useMemo(() => {
     if (discountLevel !== "transaction") return 0;
     return discountType === "%" ? (subTotal * discountPercent) / 100 : discountPercent;
  }, [subTotal, discountPercent, discountType, discountLevel]);

  const selectedTds = tdsTaxes.find(t => t._id === tdsId);
  const selectedTcs = tcsTaxes.find(t => t._id === tcsId);
  const computedTax = useMemo(() => {
    if (taxType === "none") return 0;
    const taxObj = taxType === "TDS" ? selectedTds : selectedTcs;
    if (!taxObj) return 0;
    const taxBase = taxType === "TCS"
      ? (subTotal - discountAmt + adjustmentAmount)
      : (subTotal - discountAmt);
    return (taxBase * taxObj.rate) / 100;
  }, [taxType, subTotal, discountAmt, adjustmentAmount, selectedTds, selectedTcs]);

  const total = taxType === "TDS"
    ? (subTotal - discountAmt - computedTax + adjustmentAmount)
    : taxType === "TCS"
      ? (subTotal - discountAmt + adjustmentAmount + computedTax)
      : (subTotal - discountAmt + adjustmentAmount);

  function updateRow(id: string, patch: Partial<LineRow>) {
    setRows(prev => prev.map(r => r.id === id ? calcRow({ ...r, ...patch }, discountLevel) : r));
  }
  function removeRow(id: string) { setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : [newRow()]); }
  function cloneRow(id: string) { setRows(prev => { const idx = prev.findIndex(r => r.id === id); const copy = [...prev]; copy.splice(idx + 1, 0, { ...prev[idx], id: Math.random().toString(36).slice(2) }); return copy; }); }
  function moveRow(fromId: string, toId: string) { setRows(prev => { const from = prev.findIndex(r => r.id === fromId), to = prev.findIndex(r => r.id === toId); const cp = [...prev], [m] = cp.splice(from, 1); cp.splice(to, 0, m); return cp; }); }
  function insertRowNear(targetId: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === targetId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx + 1, 0, newRow());
      return next;
    });
  }
  function insertHeaderNear(targetId: string) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === targetId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx + 1, 0, newHeader(), newRow());
      return next;
    });
  }

  function includePurchaseOrder(poId: string) {
    const po = openPurchaseOrders.find(p => p._id === poId);
    if (!po || includedPoIds.includes(poId)) return;
    const poRows = (po.lineItems || []).map(li => calcRow({
      ...newRow(),
      isHeader: !!li.isHeader,
      headerText: li.headerText || "",
      itemId: typeof li.itemId === "object" ? li.itemId?._id || "" : (li.itemId || ""),
      itemName: li.name || "",
      accountId: typeof li.accountId === "object" ? li.accountId?._id || "" : (li.accountId || ""),
      accountName: accounts.find(a => a._id === (typeof li.accountId === "object" ? li.accountId?._id : li.accountId))?.name || "",
      description: li.description || "",
      quantity: Number(li.quantity) || 1,
      rate: Number(li.rate) || 0,
      discountPercent: Number(li.discountPercent) || 0,
      discountAmount: Number(li.discountAmount) || 0,
      amount: Number(li.amount) || 0,
    }, discountLevel));
    setRows(prev => (prev.length === 1 && !prev[0].itemId && prev[0].rate === 0) ? poRows : [...prev, ...poRows]);
    setIncludedPoIds(prev => [...prev, poId]);
    setOrderNumber(prev => {
      const orderNumbers = new Set(prev.split(",").map(v => v.trim()).filter(Boolean));
      orderNumbers.add(po.purchaseOrderNumber);
      return Array.from(orderNumbers).join(", ");
    });
    toast.success("Included " + po.purchaseOrderNumber);
  }

  function handleSelectItem(rowId: string, item: Item) {
    updateRow(rowId, {
      itemId: item._id,
      itemName: item.name,
      accountId: item.purchaseAccountId || "",
      accountName: accounts.find(a => a._id === item.purchaseAccountId)?.name || "",
      quantity: 1,
      rate: item.costPrice || 0,
      unit: typeof item.unit === "object" ? (item.unit as any)?.abbreviation : item.unit,
    });
    setItemSelectorRow(null);
  }

  async function handleSave(status: "Draft" | "Open") {
    if (!vendorId || !billNumber || !billDate) { toast.error("Missing required fields"); return; }
    setSaving(true);
    try {
      await billApi.create({
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
        lineItems: rows.map(r => ({
          isHeader: r.isHeader,
          headerText: r.headerText,
          itemId: r.itemId || null,
          name: r.itemName || r.headerText,
          accountId: r.accountId || null,
          description: r.description,
          quantity: r.quantity,
          rate: r.rate,
          discountPercent: r.discountPercent,
          discountAmount: r.discountAmount,
          amount: r.amount,
          customerId: r.customerId || null,
        })),
        discountPercent,
        taxType,
        tdsId: taxType === "TDS" && !tdsId.startsWith("default-") ? tdsId : null,
        tcsId: taxType === "TCS" && !tcsId.startsWith("default-") ? tcsId : null,
        taxAmount: taxType === "TDS" ? computedTax : 0,
        tcsAmount: taxType === "TCS" ? computedTax : 0,
        adjustmentLabel,
        adjustmentAmount,
        notes,
        termsAndConditions: terms,
        attachments: attachments.map(a => a.url), status, purchaseOrderIds: includedPoIds
      });
      toast.success("Bill " + status); router.push("/purchases/bills");
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  }

  if (loading || orgLoading || fetching) return <div className="h-screen flex items-center justify-center bg-white text-black"><Loader2 className="animate-spin" /></div>;
  const selectedVendor = vendors.find(v => v._id === vendorId);
  const filteredVendors = vendors.filter((v) => {
    const search = vendorSearch.toLowerCase();
    return getName(v).toLowerCase().includes(search) || (v.email || "").toLowerCase().includes(search);
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col min-h-screen bg-white text-black">
          <PageHeader breadcrumb={<span className="font-semibold text-lg">New Bill</span>} actions={<Button variant="ghost" size="icon" onClick={() => router.back()}><X className="h-5 w-5" /></Button>} />
          <div className="flex-1 overflow-y-auto bg-white pt-2">
            <div className="max-w-7xl mx-auto px-8 pb-12 space-y-6">
              {/* Scan Banner */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-5 flex items-start gap-4">
                <div className="h-10 w-10 text-blue-600 bg-blue-100/50 rounded-full flex items-center justify-center shrink-0"><Upload className="h-5 w-5" /></div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-1">Scan your image/pdf and Auto-populate</h3>
                  <p className="text-sm text-blue-800/80 mb-3">Upload an invoice or purchase order document to automatically fill out the form fields below.</p>
                  <Button variant="outline" size="sm" className="bg-white hover:bg-blue-50 border-blue-200 text-blue-700 h-8" onClick={() => scanInputRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {uploading ? "Extracting Data..." : "Upload & Scan Document"}
                  </Button>
                  <input ref={scanInputRef} type="file" multiple className="hidden" onChange={async e => {
                    const files = Array.from(e.target.files || []); if (!files.length) return;
                    setUploading(true); try { const rs = await Promise.all(files.map(f => uploadApi.upload(f, "bills"))); setAttachments(p => [...p, ...rs]); toast.success("Uploaded"); }
                    catch { toast.error("Failed"); } finally { setUploading(false); }
                  }} />
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-[160px_1fr] items-start gap-4 py-4 border-b">
                <Label className="text-sm font-medium text-red-500 pt-2">Vendor Name*</Label>
                <div className="space-y-4">
                  <div className="flex gap-2 max-w-xl">
                    <DropdownMenu open={showVendorDD} onOpenChange={setShowVendorDD}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="h-9 flex-1 rounded-md border bg-white px-3 text-left text-sm flex items-center justify-between">
                          <span className={selectedVendor ? "text-black" : "text-muted-foreground"}>
                            {selectedVendor ? getName(selectedVendor) : "Select a vendor"}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[420px] p-0 bg-white">
                        <div className="p-3 border-b flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <Input
                            className="h-8 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                            placeholder="Search vendors..."
                            value={vendorSearch}
                            onChange={(e) => setVendorSearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {filteredVendors.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">No vendors found</div>
                          ) : filteredVendors.map((v) => (
                            <DropdownMenuItem
                              key={v._id}
                              className="flex flex-col items-start gap-0.5 px-4 py-3"
                              onClick={() => {
                                setVendorId(v._id);
                                setShowVendorDD(false);
                              }}
                            >
                              <span className="font-medium text-black">{getName(v)}</span>
                              <span className="text-xs text-muted-foreground">{v.email || "No email provided"}</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="bg-green-50 text-green-700 px-3 flex items-center rounded h-9 font-medium text-xs">INR</div>
                  </div>
                  {selectedVendor && (
                    <div className="bg-gray-50/50 p-4 rounded-md border border-dashed border-gray-200 max-w-xl text-black">
                      <p className="font-bold text-blue-800 uppercase tracking-wider text-[11px] mb-2">Billing Address</p>
                      <div className="text-sm space-y-0.5 italic text-gray-600">
                        <p>{selectedVendor.billingAddress?.street || "No street"}</p>
                        <p>{selectedVendor.billingAddress?.city}, {selectedVendor.billingAddress?.state} {selectedVendor.billingAddress?.zip}</p>
                        {selectedVendor.billingAddress?.country && <p>{selectedVendor.billingAddress.country}</p>}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bill/PO Details */}
              <div className="grid grid-cols-2 gap-x-12 gap-y-4 py-4 border-b">
                <div className="flex items-center gap-3"><Label className="text-sm font-medium text-red-500 w-36 shrink-0">Bill#*</Label><Input className="h-9 text-sm text-black flex-1" value={billNumber} onChange={e => setBillNumber(e.target.value)} /></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium w-36 shrink-0">Reference#</Label><Input className="h-9 text-sm text-black flex-1" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} /></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium w-36 shrink-0">Order Number</Label><Input className="h-9 text-sm text-black flex-1" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} /></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium text-red-500 w-36 shrink-0">Bill Date*</Label><Input type="date" className="h-9 text-sm text-black flex-1" value={billDate} onChange={e => setBillDate(e.target.value)} /></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium w-36 shrink-0">Due Date</Label><Input type="date" className="h-9 text-sm text-black flex-1" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium w-36 shrink-0">Payment Terms</Label><Select value={paymentTermsId} onValueChange={setPaymentTermsId}><SelectTrigger className="h-9 text-sm flex-1 bg-white text-black"><SelectValue placeholder="Due on Receipt" /></SelectTrigger><SelectContent className="bg-white">{paymentTermsList.map(pt => <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex items-center gap-3"><Label className="text-sm font-medium w-36 shrink-0">Accounts Payable</Label><Select value={accountsPayableId} onValueChange={setAccountsPayableId}><SelectTrigger className="h-9 text-sm flex-1 bg-white text-black"><SelectValue placeholder="Accounts Payable" /></SelectTrigger><SelectContent className="bg-white">{accounts.filter(a => a.accountType==="Accounts Payable").map(a => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
              </div>

              {/* Subject */}
              <div className="py-4 flex items-start gap-4"><Label className="text-sm font-medium w-36 pt-2 shrink-0">Subject <Info className="h-3.5 w-3.5 inline text-gray-400" /></Label><Textarea className="flex-1 min-h-[60px] text-sm text-black border-gray-200" placeholder="Enter a subject within 250 characters" value={subject} onChange={e => setSubject(e.target.value)} /></div>

              {/* Discount level toggle */}
              <div className="flex items-center gap-2 pb-4 border-b">
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
                    onChange={(id) => setDiscountAccountId(id)}
                    accounts={accounts.filter((a) => a.rootType === "Expense" || a.name.toLowerCase().includes("discount"))}
                  />
                )}
              </div>

              {/* Item Table View */}
              <div className="border rounded-lg overflow-visible shadow-sm bg-white">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50">
                  <h3 className="font-bold text-sm text-gray-700">Item Table</h3>
                  <div className="relative">
                    <button className="text-xs text-primary font-bold flex items-center gap-1 hover:underline" onClick={() => setShowBulkActions(!showBulkActions)}>
                      <CircleDot className="h-3.5 w-3.5" /> Bulk Actions
                    </button>
                    {showBulkActions && (
                      <div className="absolute right-0 top-full z-[200] mt-2 w-56 rounded-md border bg-white shadow-lg">
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40">Bulk Update Line Items</button>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40">Hide All Additional Information</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-white border-b sticky top-0"><tr className="text-[11px] uppercase tracking-wider text-gray-500 font-bold"><th className="w-8 px-2 py-3" /><th className="text-left px-3 py-3 min-w-[300px]">Item Details</th><th className="text-left px-3 py-3 w-44">Account</th><th className="text-right px-3 py-3 w-24">Quantity</th><th className="text-right px-3 py-3 w-32">Rate <span className="border rounded px-1 ml-1 font-normal bg-gray-50">EN</span></th><th className="text-left px-3 py-3 w-44">Customer Details</th>{discountLevel === "line_item" && <th className="text-right px-3 py-3 w-28">Discount</th>}<th className="text-right px-3 py-3 w-32 font-bold">Amount</th><th className="w-12 px-2 py-3" /></tr></thead>
                    <tbody className="divide-y">
                      {rows.map((row) => (
                        <Fragment key={row.id}>
                          <tr
                            className="hover:bg-gray-50/50 group"
                            draggable
                            onDragStart={() => setDraggingRowId(row.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (draggingRowId) moveRow(draggingRowId, row.id);
                              setDraggingRowId(null);
                            }}
                            onDragEnd={() => setDraggingRowId(null)}
                          >
                            <td className="px-2 py-3 text-muted-foreground cursor-grab align-top"><GripVertical className="h-4 w-4 mt-1" /></td>
                            <td className="px-3 py-3 align-top">
                              {row.isHeader ? (
                                <Input className="h-8 border-none text-lg font-bold p-0 focus-visible:ring-0 bg-transparent text-gray-800" value={row.headerText} onChange={e => updateRow(row.id, { headerText: e.target.value })} />
                              ) : (
                                <div className="space-y-1">
                                  <DropdownMenu open={itemSelectorRow === row.id} onOpenChange={o => setItemSelectorRow(o ? row.id : null)}>
                                    <DropdownMenuTrigger asChild>
                                      <button className={cn("text-sm text-left w-full font-bold", row.itemName ? "text-blue-600" : "text-gray-400")}>
                                        {row.itemName || "Type or click to select an item."}
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="p-0 border-none bg-transparent shadow-none w-80">
                                      <ItemSelectorPopup items={items} onSelect={it => handleSelectItem(row.id, it)} />
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <Textarea className="text-xs text-gray-500 italic p-0 border-none shadow-none focus-visible:ring-0 min-h-0 bg-transparent h-auto" placeholder="Add description..." rows={1} value={row.description} onChange={e => updateRow(row.id, { description: e.target.value })} />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">
                              {!row.isHeader && (
                                <AccountDropdown
                                  value={row.accountId}
                                  accounts={accounts.filter((a) => a.rootType === "Expense")}
                                  onChange={(id, nm) => updateRow(row.id, { accountId: id, accountName: nm })}
                                />
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">
                              {!row.isHeader && (
                                <>
                                  <Input type="number" min={0} className="h-8 text-right font-bold text-black" value={row.quantity} onChange={e => updateRow(row.id, { quantity: Math.max(0, Number(e.target.value)) })} />
                                  {row.unit && <div className="mt-0.5 text-right text-xs text-muted-foreground">{row.unit}</div>}
                                </>
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">{!row.isHeader && <Input type="number" min={0} className="h-8 text-right font-bold text-black" value={row.rate} onChange={e => updateRow(row.id, { rate: Math.max(0, Number(e.target.value)) })} />}</td>
                            <td className="px-3 py-3 align-top">{!row.isHeader && <Select value={row.customerId} onValueChange={v => updateRow(row.id, { customerId: v })}><SelectTrigger className="h-8 bg-white border-gray-200 text-xs text-gray-400"><SelectValue placeholder="Select Customer" /></SelectTrigger><SelectContent className="bg-white">{customers.map(c => <SelectItem key={c._id} value={c._id}>{getName(c)}</SelectItem>)}</SelectContent></Select>}</td>
                            {discountLevel === "line_item" && (
                              <td className="px-3 py-3 align-top">
                                {!row.isHeader && (
                                  <div className="flex items-center gap-1">
                                    <Input type="number" className="h-8 text-sm text-right w-14 text-black font-bold" value={row.discountPercent} min={0} max={100} onChange={(e) => updateRow(row.id, { discountPercent: Math.min(100, Number(e.target.value)), discountAmount: 0 })} />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-3 text-right font-bold text-gray-800 align-top">{!row.isHeader && fmt(row.amount)}</td>
                            <td className="px-2 py-3 align-top">
                              <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="bg-white">
                                    <DropdownMenuItem onClick={() => cloneRow(row.id)}>Clone</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => insertRowNear(row.id)}>Insert New Row</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowBulkAdd(true)}>Insert Items in Bulk</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => insertHeaderNear(row.id)}>Insert New Header</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => removeRow(row.id)}>Remove</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeRow(row.id)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {!row.isHeader && (
                            <tr className="bg-gray-50/30 text-[10px]">
                              <td colSpan={2} className="px-3 py-1.5">
                                <button type="button" className="flex items-center gap-1 text-gray-400 font-bold uppercase tracking-tight hover:text-blue-600" onClick={() => setShowReportingTagsDialog(true)}>
                                  <span>Reporting Tags</span>
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </td>
                              <td colSpan={discountLevel === "line_item" ? 7 : 6} />
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 border-t flex items-center gap-3">
                  <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 font-bold text-blue-600 border-blue-200"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Row <ChevronDown className="h-3 w-3 ml-1.5" /></Button></DropdownMenuTrigger><DropdownMenuContent className="bg-white"><DropdownMenuItem onClick={() => setRows([...rows, newRow()])}>Add Row</DropdownMenuItem><DropdownMenuItem onClick={() => setRows([...rows, newHeader(), newRow()])}>Add Header</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  <Button variant="outline" size="sm" className="h-8 font-bold text-green-600 border-green-200" onClick={() => setShowBulkAdd(true)}><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Items in Bulk</Button>
                </div>
              </div>

              {/* ── Summary ────────────────────────────────────────────── */}
              <div className="flex bg-muted/5 rounded-b-lg mt-0">
                <div className="flex-1 p-4"></div>
                <div className="w-[450px] bg-muted/10 p-6 rounded-br-lg space-y-4 shadow-[inset_1px_0_0_0_rgba(0,0,0,0.05)] text-black">
                   <div className="flex justify-between text-sm font-semibold">
                     <div>Sub Total</div>
                     <span>{fmt(subTotal)}</span>
                   </div>

                   {/* Transaction Discount */}
                   {discountLevel === "transaction" && (
                     <div className="flex items-center justify-between gap-3">
                       <span className="text-sm text-muted-foreground w-24">Discount</span>
                       <div className="flex items-center gap-0 w-32 border rounded-md bg-white overflow-hidden">
                         <Input
                           type="number"
                           className="h-8 border-0 text-right text-sm rounded-none shadow-none focus-visible:ring-0 text-black font-bold"
                           min={0}
                           value={discountPercent}
                           onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value)))}
                         />
                         <DropdownMenu open={showDiscountTypeDD} onOpenChange={setShowDiscountTypeDD}>
                           <DropdownMenuTrigger asChild>
                             <button type="button" className="h-8 px-2 border-l text-sm bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center min-w-[36px] text-black">
                               {discountType}
                             </button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="z-[220] w-14 p-1 min-w-0 bg-white">
                              <button type="button" className={cn("w-full text-center py-1.5 rounded-sm text-sm font-medium transition-colors", discountType === "%" ? "bg-primary text-white" : "hover:bg-muted text-black")} onClick={() => { setDiscountType("%"); setShowDiscountTypeDD(false); }}>%</button>
                              <button type="button" className={cn("w-full text-center py-1.5 rounded-sm text-sm font-medium transition-colors mt-0.5", discountType === "₹" ? "bg-primary text-white" : "hover:bg-muted text-black")} onClick={() => { setDiscountType("₹"); setShowDiscountTypeDD(false); }}>₹</button>
                            </DropdownMenuContent>
                          </DropdownMenu>
                       </div>
                       <span className="text-sm flex-1 text-right">{fmt(discountAmt)}</span>
                     </div>
                   )}

                   {/* TDS / TCS */}
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
                       <div className="w-32 flex items-center gap-2">
                         <div className="flex-1">
                           <DropdownMenu open={showTaxDD} onOpenChange={(o) => { setShowTaxDD(o); if (!o) setTdsSearch(""); }}>
                             <DropdownMenuTrigger asChild>
                               <button type="button" className="flex items-center justify-between w-full text-sm border bg-white rounded-md px-2.5 h-8 hover:bg-muted/30 text-black transition-colors">
                               <span className="truncate">{selectedTds ? `${selectedTds.taxName} [${selectedTds.rate}%]` : "Select a Tax"}</span>
                                 <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                               </button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden bg-white">
                               <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                                 <Input className="h-7 text-xs text-black" placeholder="Search" value={tdsSearch} onChange={(e) => setTdsSearch(e.target.value)} autoFocus />
                               </div>
                               <div className="max-h-56 overflow-y-auto">
                                 <button type="button" className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 italic" onClick={() => { setTdsId(""); setShowTaxDD(false); setTdsSearch(""); }}>None</button>
                                 {tdsTaxes.filter((t) => t.taxName.toLowerCase().includes(tdsSearch.toLowerCase())).map((t) => (
                                   <button key={t._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50 text-black", tdsId === t._id && "bg-primary/10 font-medium")}
                                     onClick={() => { setTdsId(t._id); setShowTaxDD(false); setTdsSearch(""); }}>
                                     {t.taxName} [{t.rate}%]
                                   </button>
                                 ))}
                               </div>
                               <div className="border-t p-2 flex items-center gap-1">
                                 <Settings2 className="h-3.5 w-3.5 text-primary" />
                                 <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setShowTaxDD(false); setShowManageTDS(true); }}>Manage TDS</button>
                               </div>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </div>
                         <TooltipProvider delayDuration={0}>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                             </TooltipTrigger>
                             <TooltipContent className="bg-slate-900 border-none text-white max-w-[250px] p-3 text-sm rounded shadow-lg font-medium leading-relaxed">
                               TDS is calculated on the Total amount before tax, exclusive of discounts and adjustments.
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       </div>
                     )}
                     {taxType === "TCS" && (
                       <div className="w-32 flex items-center gap-2">
                         <div className="flex-1">
                           <DropdownMenu open={showTCSDD} onOpenChange={(o) => { setShowTCSDD(o); if (!o) setTcsSearch(""); }}>
                             <DropdownMenuTrigger asChild>
                               <button type="button" className="flex items-center justify-between w-full text-sm border bg-white rounded-md px-2.5 h-8 hover:bg-muted/30 text-black transition-colors">
                               <span className="truncate">{selectedTcs ? `${selectedTcs.taxName} [${selectedTcs.rate}%]` : "Select a Tax"}</span>
                                 <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                               </button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden bg-white">
                               <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                                 <Input className="h-7 text-xs text-black" placeholder="Search" value={tcsSearch} onChange={(e) => setTcsSearch(e.target.value)} autoFocus />
                               </div>
                               <div className="max-h-56 overflow-y-auto text-black">
                                 {tcsTaxes.filter((t) => t.taxName.toLowerCase().includes(tcsSearch.toLowerCase())).length === 0 ? (
                                   <p className="text-xs text-muted-foreground text-center py-5 uppercase tracking-wide font-medium">No Results Found</p>
                                 ) : tcsTaxes.filter((t) => t.taxName.toLowerCase().includes(tcsSearch.toLowerCase())).map((t) => (
                                   <button key={t._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", tcsId === t._id && "bg-primary/10 font-medium text-black")}
                                     onClick={() => { setTcsId(t._id); setShowTCSDD(false); setTcsSearch(""); }}>
                                     {t.taxName} [{t.rate}%]
                                   </button>
                                 ))}
                               </div>
                               <div className="border-t p-2 flex items-center gap-1">
                                 <Settings2 className="h-3.5 w-3.5 text-primary" />
                                 <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setShowTCSDD(false); setShowManageTCS(true); }}>Manage TCS</button>
                               </div>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         </div>
                         <TooltipProvider delayDuration={0}>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                             </TooltipTrigger>
                             <TooltipContent className="bg-slate-900 border-none text-white max-w-[250px] p-3 text-sm rounded shadow-lg font-medium leading-relaxed">
                               TCS is calculated on the Total amount which is inclusive of taxes, discounts and adjustments.
                             </TooltipContent>
                           </Tooltip>
                         </TooltipProvider>
                       </div>
                     )}
                     <span className="flex-1 text-right text-sm text-muted-foreground">
                       {taxType === "TCS" ? `+ ${fmt(computedTax)}` : `- ${fmt(taxType !== "none" ? computedTax : 0)}`}
                     </span>
                   </div>

                   {/* Adjustment */}
                   <div className="flex items-center gap-3 justify-between">
                     <div className="flex items-center gap-2 w-24 relative">
                       <Input
                         className="h-8 text-sm placeholder:text-muted-foreground pr-6 text-black font-bold border-dashed bg-transparent"
                         value={adjustmentLabel}
                         onChange={(e) => setAdjustmentLabel(e.target.value)}
                       />
                     </div>
                     <div className="flex items-center gap-2 w-32 relative">
                       <Input
                         type="number"
                         className="h-8 text-sm text-right pr-8 text-black font-bold"
                         value={adjustmentAmount}
                         onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                       />
                       <TooltipProvider delayDuration={0}>
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <HelpCircle className="h-4 w-4 text-muted-foreground absolute right-2 top-2 cursor-help" />
                           </TooltipTrigger>
                           <TooltipContent className="bg-slate-900 border-none text-white max-w-[250px] p-3 text-sm rounded shadow-lg font-medium leading-relaxed">
                             Add any other +ve or -ve charges that need to be applied to adjust the total amount of the transaction Eg. +10 or -10.
                           </TooltipContent>
                         </Tooltip>
                       </TooltipProvider>
                     </div>
                     <span className="flex-1 text-right text-sm">{fmt(adjustmentAmount)}</span>
                   </div>
                   <p className="text-[11px] text-muted-foreground leading-4">
                     Add any other +ve or -ve charges that need to be applied to adjust the total amount of the transaction Eg. +10 or -10.
                   </p>

                   <Separator className="bg-muted/30" />
                   <div className="flex justify-between text-lg font-bold">
                     <span>Total</span>
                     <span>{fmt(total)}</span>
                   </div>
                </div>
              </div>

              {/* ── Notes + Terms side by side ─────────────────────────── */}
              <div className="grid grid-cols-2 gap-6 mt-8">
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

              {/* ── Attach files ──────────────────────────────────────── */}
              <div className="mt-6">
                <Label className="text-sm font-medium mb-2 block">Attach File(s) to Bill</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-sm text-black"
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
                        const results = await Promise.all(
                          toUpload.map((f) => uploadApi.upload(f, "bills"))
                        );
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
                  <span className="text-[10px] text-gray-400 italic">You can upload a maximum of 10 files, 10MB each</span>
                </div>
                {/* Uploaded file chips */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {attachments.map((a, idx) => {
                      const fileName = a.url.split("/").pop() || `File ${idx + 1}`;
                      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].some((ext) =>
                        a.url.toLowerCase().includes(`.${ext}`)
                      );
                      return (
                        <div
                          key={a.publicId}
                          className="flex items-center gap-2 bg-muted/30 border rounded-md px-3 py-1.5 text-xs group"
                        >
                          {isImage ? (
                            <img src={a.url} alt={fileName} className="h-6 w-6 object-cover rounded" />
                          ) : (
                            <span className="text-red-500 text-sm">📄</span>
                          )}
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline max-w-[160px] truncate"
                          >
                            {decodeURIComponent(fileName)}
                          </a>
                          <button
                            type="button"
                            className="ml-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={async () => {
                              try {
                                await uploadApi.remove(a.publicId);
                                setAttachments((prev) => prev.filter((_, i) => i !== idx));
                              } catch {
                                toast.error("Failed to remove file");
                              }
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {vendorId && (
                <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-lg flex items-center justify-between mt-6">
                  <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                    <ShoppingBagIcon className="h-4 w-4" /> Include Open Purchase Orders <span className="text-[11px] font-medium text-amber-600 ml-2">({openPurchaseOrders.length} available)</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="bg-white h-8 text-xs font-bold" onClick={() => setShowPoScanner(true)}>Scan PO</Button>
                    <Select onValueChange={includePurchaseOrder} value="">
                      <SelectTrigger className="h-8 w-48 bg-white text-xs border-amber-200"><SelectValue placeholder="Select Open PO" /></SelectTrigger>
                      <SelectContent className="bg-white">{openPurchaseOrders.map(p => <SelectItem key={p._id} value={p._id}>{p.purchaseOrderNumber}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Footer Navigation */}
          <div className="sticky bottom-0 bg-white border-t px-8 py-4 flex items-center justify-between shadow-2xl z-50">
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 font-bold px-4 border-gray-200 text-black shadow-sm" onClick={() => handleSave("Draft")} disabled={saving}>Save as Draft</Button>
              <Button className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 shadow-md" onClick={() => handleSave("Open")} disabled={saving}>{saving && <Loader2 className="animate-spin mr-2 h-4 w-4" />} Save as Open</Button>
              <Button variant="ghost" className="h-9 font-bold text-gray-500" onClick={() => router.back()}>Cancel</Button>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold text-gray-400">
              <span className="cursor-pointer hover:text-blue-600 underline decoration-dotted">Template: 'Standard'</span>
              <Separator orientation="vertical" className="h-4 bg-gray-200" />
              <button className="flex items-center gap-1.5 text-blue-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Make Recurring</button>
            </div>
          </div>
        </div>
        <Dialog open={showPoScanner} onOpenChange={setShowPoScanner}><DialogContent className="max-w-md bg-white border-none shadow-2xl"><DialogHeader><DialogTitle className="text-black">Scan PO Code</DialogTitle></DialogHeader><div id="qr-reader" className="w-full"></div><DialogFooter><Button variant="outline" className="text-black" onClick={() => setShowPoScanner(false)}>Close</Button></DialogFooter></DialogContent></Dialog>
        <BulkAddItemsDialog open={showBulkAdd} items={items} onAdd={handleBulkAdd} onClose={() => setShowBulkAdd(false)} />
        <ManageTDSDialog
          open={showManageTDS}
          onClose={() => setShowManageTDS(false)}
          tdsTaxes={tdsTaxes}
          onCreated={(tax) => {
            setTdsTaxes((prev) => [...prev, tax]);
            setTcsTaxes((prev) => [...prev, tax]);
          }}
        />
        <ManageTCSDialog
          open={showManageTCS}
          onClose={() => setShowManageTCS(false)}
          tcsTaxes={tcsTaxes}
          onCreated={(tax) => {
            setTcsTaxes((prev) => [...prev, tax]);
          }}
        />
        <Dialog open={showReportingTagsDialog} onOpenChange={(o) => { if (!o) setShowReportingTagsDialog(false); }}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle>Reporting Tags</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground leading-relaxed">
              There are no active reporting tags, or no tags have been created for association at the item level. Kindly create or edit reporting tags from Settings.
            </p>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowReportingTagsDialog(false)}>OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
