"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus, Search, Loader2, X, ChevronDown, GripVertical, Pencil,
  Settings2, Upload, HelpCircle, Trash2, MoreHorizontal, Info, CircleDot, ExternalLink,
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
import { purchaseOrderApi, type PurchaseOrder, type CreatePurchaseOrderInput, type DiscountLevel } from "@/lib/api/purchase-orders";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax, type CreateTcsTaxInput, TCS_SECTIONS } from "@/lib/api/tcs-taxes";
import { uploadApi, type UploadResult } from "@/lib/api/upload";
import { cn } from "@/lib/utils";
import { formatMoney, multiplyMoney, percentMoney, roundMoney, subtractMoney, sumMoney } from "@/lib/money";

const SHIPMENT_OPTIONS = [
  "Road", "Air", "Sea", "Rail", "Courier", "Hand Delivery", "Other",
];

const ITEM_TRANSACTION_TYPES = [
  "Quotes", "Sales Orders", "Invoices", "Delivery Challans", "Credit Notes",
  "Recurring Invoices", "Purchase Orders", "Bills", "Vendor Credits",
] as const;

const DEFAULT_TCS_TAXES: TcsTax[] = [
  { _id: 'default-tcs-1', organizationId: '', taxName: 'TCS on Sales', rate: 1, sectionCode: '194O', sectionDescription: 'TCS on Sale', isHigherRate: false, isActive: true, createdAt: '', updatedAt: '' },
  { _id: 'default-tcs-2', organizationId: '', taxName: 'TCS on Sale of Goods (Reduced)', rate: 0.5, sectionCode: '194O', sectionDescription: 'TCS on Sale', isHigherRate: false, isActive: true, createdAt: '', updatedAt: '' },
  { _id: 'default-tcs-3', organizationId: '', taxName: 'TCS on Sale of Services', rate: 1, sectionCode: '194O', sectionDescription: 'TCS on Sale', isHigherRate: false, isActive: true, createdAt: '', updatedAt: '' },
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

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) => formatMoney(v);
const fmtQty = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);

function itemUnitLabel(item?: Item | null): string {
  if (!item?.unit) return "";
  if (typeof item.unit === "string") return item.unit;
  return (item.unit as any)?.abbreviation || "";
}

function getNameStr(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

// ─── Line Item type ──────────────────────────────────────────────────────────
interface LineRow {
  id: string;
  isHeader: boolean;
  headerText: string;
  itemId: string;
  itemName: string;
  accountId: string;
  accountName: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  amount: number;
}

function newRow(): LineRow {
  return {
    id: Math.random().toString(36).slice(2),
    isHeader: false, headerText: "", itemId: "", itemName: "",
    accountId: "", accountName: "", description: "", unit: "",
    quantity: 1, rate: 0, discountPercent: 0, discountAmount: 0, amount: 0,
  };
}

function newHeader(): LineRow {
  return { ...newRow(), isHeader: true, headerText: "Add New Header" };
}

function calcRow(row: LineRow, discountLevel: DiscountLevel): LineRow {
  if (row.isHeader) return { ...row, amount: 0 };
  const lineTotal = multiplyMoney(row.quantity, row.rate);
  if (discountLevel === "line_item") {
    const discAmt = row.discountPercent > 0 ? percentMoney(lineTotal, row.discountPercent) : roundMoney(row.discountAmount);
    return { ...row, discountAmount: discAmt, amount: Math.max(0, subtractMoney(lineTotal, discAmt)) };
  }
  return { ...row, discountPercent: 0, discountAmount: 0, amount: lineTotal };
}

// ─── Manage TDS Dialog ───────────────────────────────────────────────────────
function ManageTDSDialog({ open, onClose, tdsTaxes, onCreated }: {
  open: boolean; onClose: () => void; tdsTaxes: TdsTax[]; onCreated: (t: TdsTax) => void;
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
  const [payableSearch, setPayableSearch] = useState("");

  useEffect(() => {
    if (open) accountApi.list({ excludeGroups: true }).then((r) => setAccounts(r.data ?? [])).catch(() => {});
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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Manage TDS</DialogTitle></DialogHeader>
        {!showNew ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">TDS taxes</h3>
              <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> New TDS Tax</Button>
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
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No TDS taxes yet.</td></tr>
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
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select a Tax Type." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {TDS_SECTIONS.map((s) => <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
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

// ─── Manage TCS Dialog ───────────────────────────────────────────────────────
function ManageTCSDialog({ open, onClose, tcsTaxes, onCreated }: {
  open: boolean; onClose: () => void; tcsTaxes: TcsTax[]; onCreated: (t: TcsTax) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateTcsTaxInput>({
    taxName: "", rate: 0, sectionCode: "", sectionDescription: "",
    tcsPayableAccountId: null, tcsReceivableAccountId: null,
    isHigherRate: false, applicableStartDate: null, applicableEndDate: null,
  });

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
    } catch { toast.error("Failed to create TCS tax"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Manage TCS</DialogTitle></DialogHeader>
        {!showNew ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">TCS taxes</h3>
              <Button size="sm" className="gap-1" onClick={() => setShowNew(true)}><Plus className="h-3.5 w-3.5" /> New TCS Tax</Button>
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
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No TCS taxes yet.</td></tr>
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
              <Label className="text-xs font-medium text-red-500">Section *</Label>
              <Select value={form.sectionCode} onValueChange={(v) => setForm((f) => ({ ...f, sectionCode: v }))}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select a Tax Type." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {TCS_SECTIONS.map((s) => <SelectItem key={s.code} value={s.code} className="text-xs">{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
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

// ─── Bulk Add Dialog ─────────────────────────────────────────────────────────
function BulkAddItemsDialog({ open, onClose, items, onAdd }: {
  open: boolean; onClose: () => void; items: Item[]; onAdd: (selected: Item[]) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  const selectedItems = items.filter((i) => selected.has(i._id));
  const totalQty = selectedItems.reduce((s, i) => s + (quantities[i._id] || 1), 0);

  function toggleItem(item: Item) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item._id)) next.delete(item._id);
      else { next.add(item._id); setQuantities((p) => ({ ...p, [item._id]: 1 })); }
      return next;
    });
  }

  function handleAdd() {
    const withQty = selectedItems.map((i) => ({ ...i, _bulkQty: quantities[i._id] || 1 }));
    onAdd(withQty as any);
    setSelected(new Set()); setQuantities({}); setQ("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden h-[500px]">
        <div className="flex h-full">
          <div className="w-1/2 border-r flex flex-col">
            <div className="p-3 border-b">
              <Input className="h-8 text-sm" placeholder="Search items..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.map((item) => (
                <button key={item._id} type="button"
                  className={cn("w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b flex items-center gap-2", selected.has(item._id) && "bg-primary/5")}
                  onClick={() => toggleItem(item)}>
                  {selected.has(item._id) && <div className="h-4 w-4 rounded bg-primary flex items-center justify-center shrink-0"><svg viewBox="0 0 12 10" fill="none" className="h-3 w-3"><path d="M1 5l3 3 7-7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex flex-col p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Selected <span className="ml-1 bg-muted rounded-full px-2 py-0.5 text-sm">{selected.size}</span></h3>
              <span className="text-sm text-muted-foreground">Total Qty: {totalQty}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {selectedItems.map((item) => (
                <div key={item._id} className="flex items-center gap-2 border rounded p-2">
                  <div className="flex-1 text-sm font-medium">{item.name}</div>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, (p[item._id] || 1) - 1) }))}>−</Button>
                  <Input className="h-7 w-14 text-center text-sm" type="number" min={1} value={quantities[item._id] || 1} onChange={(e) => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, Number(e.target.value)) }))} />
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQuantities((p) => ({ ...p, [item._id]: (p[item._id] || 1) + 1 }))}>+</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleItem(item)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button size="sm" onClick={handleAdd} disabled={selected.size === 0}>Add Items</Button>
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item selector popup ─────────────────────────────────────────────────────
function ItemSelectorPopup({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = items.filter((i) => {
    const unit = itemUnitLabel(i).toLowerCase();
    return i.name.toLowerCase().includes(query)
      || (i.sku || "").toLowerCase().includes(query)
      || unit.includes(query);
  });
  return (
    <div className="w-full overflow-hidden">
      <div className="p-2 border-b">
        <Input className="h-7 text-xs" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No items found</p>
        ) : filtered.map((item) => (
          <button key={item._id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-start justify-between gap-3"
            onClick={() => onSelect(item)}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{item.name}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {item.sku ? `SKU: ${item.sku} | ` : ""}
                {item.inventoryTracked
                  ? `Stock: ${fmtQty(item.stockOnHand)}${itemUnitLabel(item) ? ` ${itemUnitLabel(item)}` : ""}`
                  : "Non-tracked item"}
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">₹{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.costPrice || 0)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Account dropdown ────────────────────────────────────────────────────────
function AccountDropdown({ value, onChange, accounts }: {
  value: string; onChange: (id: string, name: string) => void; accounts: Account[];
}) {
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
                <button key={a._id} type="button"
                  className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", value === a._id && "bg-primary/10 text-primary font-medium")}
                  onClick={() => { onChange(a._id, a.name); setOpen(false); setQ(""); }}>
                  {a.name}
                </button>
              ))}
            </div>
          ))}
          {Object.keys(grouped).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No accounts found</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Edit Page ───────────────────────────────────────────────────────────────
export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [orderLoading, setOrderLoading] = useState(true);

  // Form fields
  const [vendorId, setVendorId] = useState("");
  const [deliveryAddrType, setDeliveryAddrType] = useState<"Organization" | "Customer">("Organization");
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrIdx, setSelectedAddrIdx] = useState(0);
  const [showAddrDropdown, setShowAddrDropdown] = useState(false);
  const [showNewAddrDialog, setShowNewAddrDialog] = useState(false);
  const [newAddrForm, setNewAddrForm] = useState({ attention: "", street1: "", street2: "", city: "", state: "", zip: "", country: "India", phone: "" });
  const [customerDeliveryId, setCustomerDeliveryId] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [poDate, setPoDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [shipmentPreference, setShipmentPreference] = useState("");
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>("transaction");
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountType, setDiscountType] = useState<"%" | "₹">("%");
  const [showDiscountTypeDD, setShowDiscountTypeDD] = useState(false);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [tdsId, setTdsId] = useState("");
  const [taxAmount, setTaxAmount] = useState(0);
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [attachments, setAttachments] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [tcsId, setTcsId] = useState("");
  const [showTCSDD, setShowTCSDD] = useState(false);
  const [tdsSearch, setTdsSearch] = useState("");
  const [tcsSearch, setTcsSearch] = useState("");

  // UI state
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showManageTDS, setShowManageTDS] = useState(false);
  const [showManageTCS, setShowManageTCS] = useState(false);
  const [showTaxDD, setShowTaxDD] = useState(false);
  const [itemSelectorRow, setItemSelectorRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showReportingTagsDialog, setShowReportingTagsDialog] = useState(false);

  // Item details side panel
  const [itemPanelItemId, setItemPanelItemId] = useState<string | null>(null);
  const [itemPanelTab, setItemPanelTab] = useState<"details" | "transactions">("details");
  const [itemPanelTxType, setItemPanelTxType] = useState("Purchase Orders");
  const [itemPanelTxStatus, setItemPanelTxStatus] = useState("All");
  const [showTxTypeDD, setShowTxTypeDD] = useState(false);
  const [showTxStatusDD, setShowTxStatusDD] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Load reference data + existing order
  const loadData = useCallback(async () => {
    if (!firebaseUser || loading || !activeOrganization?._id || !orderId) return;
    setOrderLoading(true);
    try {
      const [vRes, cRes, iRes, aRes, ptRes, tdsRes, tcsRes, orderRes] = await Promise.all([
        contactApi.list({ type: "Vendor", page: 1, limit: 200 }),
        contactApi.list({ type: "Customer", page: 1, limit: 200 }),
        itemApi.list({ page: 1, limit: 200 }),
        accountApi.list({ excludeGroups: true }),
        settingsApi.paymentTerms.list(),
        tdsTaxApi.list(),
        tcsTaxApi.list(),
        purchaseOrderApi.getOne(orderId),
      ]);
      setVendors(vRes.data ?? []);
      setCustomers(cRes.data ?? []);
      setItems(iRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setPaymentTermsList(ptRes.data ?? []);
      const tdsData = tdsRes.data ?? [];
      setTdsTaxes(tdsData.length > 0 ? tdsData : DEFAULT_TDS_TAXES);
      const tcsData = tcsRes.data ?? [];
      setTcsTaxes(tcsData.length > 0 ? tcsData : DEFAULT_TCS_TAXES);

      // Populate form from existing order
      const o = orderRes.data;
      const vendorIdStr = typeof o.vendorId === "object" && o.vendorId ? o.vendorId._id : o.vendorId || "";
      setVendorId(vendorIdStr);
      setDeliveryAddrType(o.deliveryAddressType);
      setPoNumber(o.purchaseOrderNumber);
      setReferenceNumber(o.referenceNumber || "");
      setPoDate(o.purchaseOrderDate.slice(0, 10));
      setDeliveryDate(o.deliveryDate ? o.deliveryDate.slice(0, 10) : "");
      const ptId = typeof o.paymentTermsId === "object" && o.paymentTermsId ? o.paymentTermsId._id : o.paymentTermsId || "";
      setPaymentTermsId(ptId);
      setShipmentPreference(o.shipmentPreference || "");
      setDiscountLevel(o.discountLevel);
      setDiscountPercent(o.discountPercent);
      setTaxType(o.taxType);
      const tdsIdStr = typeof o.tdsId === "object" && o.tdsId ? o.tdsId._id : o.tdsId || "";
      const tcsIdStr = typeof o.tcsId === "object" && o.tcsId ? o.tcsId._id : o.tcsId || "";
      setTdsId(tdsIdStr);
      setTcsId(tcsIdStr);
      setTaxAmount(o.taxAmount);
      setAdjustmentLabel(o.adjustmentLabel || "Adjustment");
      setAdjustmentAmount(o.adjustmentAmount);
      setNotes(o.notes || "");
      setTerms(o.termsAndConditions || "");
      setAttachments((o.attachments || []).map((url) => ({
        url,
        publicId: "",
        name: decodeURIComponent(url.split("/").pop() || "File"),
        originalName: decodeURIComponent(url.split("/").pop() || "File"),
      })));

      // Convert line items
      const convertedRows: LineRow[] = o.lineItems.map((li) => {
        const itemIdStr = typeof li.itemId === "object" && li.itemId ? (li.itemId as any)._id : li.itemId || "";
        const itemName = typeof li.itemId === "object" && li.itemId ? (li.itemId as any).name : li.name || "";
        const accountIdStr = typeof li.accountId === "object" && li.accountId ? (li.accountId as any)._id : li.accountId || "";
        const accountNameStr = typeof li.accountId === "object" && li.accountId ? (li.accountId as any).name : "";
        return {
          id: Math.random().toString(36).slice(2),
          isHeader: li.isHeader || false,
          headerText: li.headerText || "",
          itemId: itemIdStr,
          itemName,
          accountId: accountIdStr,
          accountName: accountNameStr,
          description: li.description || "",
          unit: "",
          quantity: li.quantity,
          rate: li.rate,
          discountPercent: li.discountPercent || 0,
          discountAmount: li.discountAmount || 0,
          amount: li.amount,
        };
      });
      setRows(convertedRows.length > 0 ? convertedRows : [newRow()]);
    } catch (err) {
      toast.error("Failed to load purchase order");
      router.push("/purchases/orders");
    } finally {
      setOrderLoading(false);
    }
  }, [firebaseUser, loading, activeOrganization?._id, orderId, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Initialize org addresses
  useEffect(() => {
    if (!activeOrganization) return;
    const org = activeOrganization as any;
    const addr = org.billingAddress || {};
    setSavedAddresses([{
      label: org.name || "Organization",
      city: addr.city || "",
      state: addr.state || "",
      country: addr.country || "",
      street: addr.street || "",
      phone: org.phone || "",
    }]);
  }, [activeOrganization]);

  // Computed totals
  const subTotal = sumMoney(rows.filter((r) => !r.isHeader).map((r) => r.amount));
  const discountAmt = discountLevel === "transaction"
    ? discountType === "%" ? percentMoney(subTotal, discountPercent) : roundMoney(discountPercent)
    : sumMoney(rows.filter((r) => !r.isHeader).map((r) => r.discountAmount));
  const selectedTds = tdsTaxes.find((t) => t._id === tdsId);
  const selectedTcs = tcsTaxes.find((t) => t._id === tcsId);
  const baseBeforeTax = sumMoney([subTotal, -discountAmt, adjustmentAmount]);
  const computedTax = taxType === "TDS"
    ? (selectedTds ? percentMoney(Math.max(0, subtractMoney(subTotal, discountAmt)), selectedTds.rate) : 0)
    : taxType === "TCS"
      ? (selectedTcs ? percentMoney(baseBeforeTax, selectedTcs.rate) : 0)
      : roundMoney(taxAmount);
  const totalQuantity = rows.filter((r) => !r.isHeader).reduce((s, r) => s + r.quantity, 0);
  const panelItem = items.find((i) => i._id === itemPanelItemId) ?? null;
  const panelUnit = !panelItem?.unit ? "" : typeof panelItem.unit === "string" ? panelItem.unit : (panelItem.unit as any)?.abbreviation || "";
  const panelSalesAccount = accounts.find((a) => a._id === (panelItem?.salesAccountId || ""));
  const panelPurchaseAccount = accounts.find((a) => a._id === (panelItem?.purchaseAccountId || ""));
  const total = taxType === "TDS"
    ? sumMoney([subTotal, -discountAmt, -computedTax, adjustmentAmount])
    : taxType === "TCS"
      ? sumMoney([subTotal, -discountAmt, adjustmentAmount, computedTax])
      : sumMoney([subTotal, -discountAmt, adjustmentAmount]);

  const filteredVendors = vendors.filter((v) =>
    (v.displayName || v.companyName || "").toLowerCase().includes("") || true
  );

  function updateRow(id: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => r.id !== id ? r : calcRow({ ...r, ...patch }, discountLevel)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function insertRowNear(targetId: string, direction: "above" | "below") {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === targetId);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(direction === "below" ? idx + 1 : idx, 0, newRow());
      return copy;
    });
  }

  function insertHeaderNear(targetId: string) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === targetId);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx + 1, 0, newHeader(), newRow());
      return copy;
    });
  }

  function cloneRow(targetId: string) {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === targetId);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx + 1, 0, { ...prev[idx], id: Math.random().toString(36).slice(2) });
      return copy;
    });
  }

  function moveRow(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === dragId);
      const to = prev.findIndex((r) => r.id === targetId);
      if (from === -1 || to === -1) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }

  function handleBulkAdd(selected: any[]) {
    const newRows: LineRow[] = selected.map((item) => {
      const r = newRow();
      return calcRow({ ...r, itemId: item._id, itemName: item.name, quantity: item._bulkQty || 1, rate: item.costPrice || 0 }, discountLevel);
    });
    setRows((prev) => [...prev, ...newRows]);
    setShowBulkAdd(false);
  }

  function handleSelectItem(rowId: string, item: Item) {
    const unitStr = !item.unit ? "" : typeof item.unit === "string" ? item.unit : (item.unit as any)?.abbreviation || "";
    updateRow(rowId, {
      itemId: item._id,
      itemName: item.name,
      accountId: item.purchaseAccountId || "",
      accountName: accounts.find(a => a._id === item.purchaseAccountId)?.name || "",
      quantity: 1,
      rate: item.costPrice || 0,
      unit: unitStr
    });
    setItemSelectorRow(null);
  }

  async function handleSave(status: "Draft" | "Open") {
    if (!poDate) { toast.error("Purchase order date is required"); return; }
    setSaving(true);
    try {
      const payload: Partial<CreatePurchaseOrderInput> = {
        vendorId: vendorId || null,
        deliveryAddressType: deliveryAddrType,
        purchaseOrderNumber: poNumber,
        referenceNumber,
        purchaseOrderDate: poDate,
        deliveryDate: deliveryDate || null,
        paymentTermsId: paymentTermsId || null,
        shipmentPreference,
        discountLevel,
        discountAccountId: discountAccountId || null,
        lineItems: rows.map((r) => ({
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
        })),
        discountPercent,
        taxType,
        tdsId: (tdsId && !tdsId.startsWith("default-")) ? tdsId : null,
        tcsId: (tcsId && !tcsId.startsWith("default-")) ? tcsId : null,
        taxAmount: taxType === "TDS" ? computedTax : 0,
        tcsAmount: taxType === "TCS" ? computedTax : 0,
        adjustmentLabel,
        adjustmentAmount,
        notes,
        termsAndConditions: terms,
        attachments: attachments.map((a) => a.url),
        status,
      };
      await purchaseOrderApi.update(orderId, payload);
      toast.success("Purchase order updated");
      if (status === "Open") {
        router.push(`/purchases/orders/${orderId}/send-email`);
      } else {
        router.push("/purchases/orders");
      }
    } catch { toast.error("Failed to update purchase order"); } finally { setSaving(false); }
  }

  const orgAddress = activeOrganization as any;
  const currentAddr = savedAddresses[selectedAddrIdx] || {
    label: orgAddress?.name || "Organization",
    city: orgAddress?.billingAddress?.city || "",
    state: orgAddress?.billingAddress?.state || "",
    country: orgAddress?.billingAddress?.country || "",
    street: orgAddress?.billingAddress?.street || "",
    phone: orgAddress?.phone || "",
  };

  if (orderLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">Purchases</span>
              <span className="text-sm font-semibold text-slate-700">
                Edit Purchase Order {poNumber && <span className="text-slate-500 font-normal">#{poNumber}</span>}
              </span>
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="px-8 py-6 max-w-5xl mx-auto space-y-6">
            {/* ── Vendor Name ─────────────────────────────────────── */}
            <div className="grid grid-cols-[140px_1fr] items-start gap-4 py-4 border-b">
              <Label className="text-sm font-medium text-red-500 pt-2">Vendor Name *</Label>
              <div className="relative flex gap-2 max-w-xl">
                <div className="relative flex-1">
                  <select
                    className="w-full h-9 px-3 pr-8 text-sm border rounded-md bg-white appearance-none focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
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
                <Button size="icon" type="button" className="h-9 w-9 bg-teal-600 hover:bg-teal-700 text-white rounded-md">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ── Delivery Address ─────────────────────────────────── */}
            <div className="grid grid-cols-[140px_1fr] items-start gap-4 py-4 border-b">
              <Label className="text-sm font-medium text-red-500 pt-2">Delivery Address *</Label>
              <div className="space-y-3">
                <div className="flex items-center gap-6">
                  {(["Organization", "Customer"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="deliveryAddrType" value={t} checked={deliveryAddrType === t} onChange={() => setDeliveryAddrType(t)} className="accent-teal-600" />
                      <span className="text-sm">{t}</span>
                    </label>
                  ))}
                </div>

                {deliveryAddrType === "Organization" && (
                  <div className="text-sm">
                    <div className="flex items-center gap-1.5 font-medium mb-1">
                      <span>{currentAddr.label}</span>
                      <button type="button" className="text-teal-700 hover:text-teal-800"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="text-muted-foreground space-y-0.5 text-sm">
                      {currentAddr.city && <p>{currentAddr.city}</p>}
                      {currentAddr.country && <p>{currentAddr.country} ,</p>}
                      {currentAddr.phone && <p>{currentAddr.phone}</p>}
                    </div>
                    <DropdownMenu open={showAddrDropdown} onOpenChange={setShowAddrDropdown}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="text-sm text-teal-700 hover:underline mt-2">Change destination to deliver</button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-72 p-0 overflow-hidden">
                        <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                          <Input className="h-7 text-xs" placeholder="Search" autoFocus />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {savedAddresses.map((addr, idx) => (
                            <button key={idx} type="button"
                              className={cn("w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b last:border-0", selectedAddrIdx === idx && "bg-teal-50")}
                              onClick={() => { setSelectedAddrIdx(idx); setShowAddrDropdown(false); }}>
                              <div className="font-medium">{addr.label}</div>
                              {addr.city && <div className="text-xs text-muted-foreground">{addr.city}</div>}
                            </button>
                          ))}
                        </div>
                        <div className="p-2 border-t">
                          <button type="button" className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium"
                            onClick={() => { setShowAddrDropdown(false); setShowNewAddrDialog(true); }}>
                            <Plus className="h-4 w-4" /> New Address
                          </button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                {deliveryAddrType === "Customer" && (
                  <div className="flex gap-2 max-w-xl">
                    <div className="relative flex-1">
                      <select className="w-full h-9 px-3 pr-8 text-sm border rounded-md bg-white appearance-none focus:outline-none focus:ring-1 focus:ring-teal-500" value={customerDeliveryId} onChange={(e) => setCustomerDeliveryId(e.target.value)}>
                        <option value="">Select Customer</option>
                        {customers.map((c) => <option key={c._id} value={c._id}>{c.displayName || c.companyName}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <Button size="icon" type="button" className="h-9 w-9 bg-teal-600 hover:bg-teal-700 text-white rounded-md"><Search className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── PO #, Reference, Date ────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 py-4 border-b">
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium text-red-500">Purchase Order# *</Label>
                <Input className="h-9 text-sm flex-1" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium">Reference#</Label>
                <Input className="h-9 text-sm flex-1" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" className="h-9 text-sm flex-1" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium">Delivery Date</Label>
                <Input type="date" className="h-9 text-sm flex-1" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium">Payment Terms</Label>
                <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
                  <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Due on Receipt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    {paymentTermsList.map((pt) => <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                <Label className="text-sm font-medium">Shipment Preference</Label>
                <Select value={shipmentPreference} onValueChange={setShipmentPreference}>
                  <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="Choose shipment preference…" /></SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Discount level toggle ────────────────────────────── */}
            <div className="flex items-center gap-2 pt-2">
              {(["transaction", "line_item"] as const).map((lvl) => (
                <button key={lvl} type="button"
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    discountLevel === lvl ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/30 text-muted-foreground hover:bg-muted/40")}
                  onClick={() => setDiscountLevel(lvl)}>
                  <span className={cn("h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center", discountLevel === lvl ? "border-primary-foreground" : "border-muted-foreground")}>
                    {discountLevel === lvl && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </span>
                  {lvl === "transaction" ? "At Transaction Level" : "At Line Item Level"}
                </button>
              ))}
            </div>

            {/* ── Item Table ─────────────────────────────────────────── */}
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
                      <th className="text-right px-3 py-2.5 font-medium w-24">Rate <span className="border border-muted-foreground rounded px-0.5 text-[10px] ml-0.5">⊞</span></th>
                      {discountLevel === "line_item" && <th className="text-right px-3 py-2.5 font-medium w-28">Discount</th>}
                      <th className="text-right px-3 py-2.5 font-medium w-28">Amount</th>
                      <th className="w-12 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr className="hover:bg-muted/20 group" draggable
                          onDragStart={() => setDraggingRowId(row.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => { if (draggingRowId) moveRow(draggingRowId, row.id); setDraggingRowId(null); }}
                          onDragEnd={() => setDraggingRowId(null)}>
                          <td className="px-2 py-2 text-muted-foreground cursor-grab active:cursor-grabbing"><GripVertical className="h-4 w-4" /></td>
                          {row.isHeader ? (
                            <td colSpan={discountLevel === "line_item" ? 6 : 5} className="px-3 py-2">
                              <div className="text-[22px] leading-tight font-semibold text-muted-foreground/95">{row.headerText || "Add New Header"}</div>
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2 align-top">
                                <DropdownMenu open={itemSelectorRow === row.id} onOpenChange={(open) => setItemSelectorRow(open ? row.id : null)}>
                                  <DropdownMenuTrigger asChild>
                                    <button type="button" className={cn("text-sm text-left w-full font-medium", row.itemName ? "text-primary" : "text-muted-foreground")}>
                                      {row.itemName || "Type or click to select an item."}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                                    <ItemSelectorPopup items={items} onSelect={(item) => { handleSelectItem(row.id, item); setItemSelectorRow(null); }} />
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Textarea className="mt-1 text-xs text-muted-foreground resize-none border-0 shadow-none p-0 focus-visible:ring-0 min-h-0 h-auto bg-transparent"
                                  rows={1} placeholder="Add a description" value={row.description}
                                  onChange={(e) => updateRow(row.id, { description: e.target.value })} />
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
                                <AccountDropdown value={row.accountId} onChange={(id, name) => updateRow(row.id, { accountId: id, accountName: name })}
                                  accounts={accounts.filter((a) => a.rootType === "Expense")} />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Input type="number" className="h-8 text-sm text-right w-full" value={row.quantity} min={0}
                                  onChange={(e) => updateRow(row.id, { quantity: Math.max(0, Number(e.target.value)) })} />
                                {row.unit && <div className="text-xs text-muted-foreground text-right mt-0.5">{row.unit}</div>}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Input type="number" className="h-8 text-sm text-right w-full" value={row.rate} min={0}
                                  onChange={(e) => updateRow(row.id, { rate: Math.max(0, Number(e.target.value)) })} />
                              </td>
                              {discountLevel === "line_item" && (
                                <td className="px-3 py-2 align-top">
                                  <div className="flex items-center gap-1">
                                    <Input type="number" className="h-8 text-sm text-right w-14" value={row.discountPercent} min={0} max={100}
                                      onChange={(e) => updateRow(row.id, { discountPercent: Math.min(100, Number(e.target.value)), discountAmount: 0 })} />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                </td>
                              )}
                              <td className="px-3 py-2 align-top text-right">
                                <div className="font-medium">{fmt(row.amount)}</div>
                                {row.itemId && (
                                  <button type="button" className="text-[11px] text-primary hover:underline mt-0.5 block ml-auto"
                                    onClick={() => { setItemPanelItemId(row.itemId); setItemPanelTab("transactions"); }}>
                                    Recent Transactions
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[200]">
                                  <DropdownMenuItem onClick={() => cloneRow(row.id)}>Clone</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => insertRowNear(row.id, "below")}>Insert New Row</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setShowBulkAdd(true)}>Insert Items in Bulk</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => insertHeaderNear(row.id)}>Insert New Header</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(row.id)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {!row.isHeader && (
                          <tr key={`${row.id}-meta`} className="bg-muted/10">
                            <td className="px-2 py-2 text-muted-foreground"><GripVertical className="h-3.5 w-3.5" /></td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              <button type="button" className="flex items-center gap-1 hover:text-foreground">
                                <span>🗂</span> Select a project <ChevronDown className="h-3 w-3" />
                              </button>
                            </td>
                            <td colSpan={discountLevel === "line_item" ? 5 : 4} className="px-3 py-2 text-xs">
                              <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => setShowReportingTagsDialog(true)}>
                                <span>🏷</span> Reporting Tags <ChevronDown className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add row / bulk add */}
              <div className="px-4 py-3 border-t flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8 text-primary border-primary">
                      <Plus className="h-3.5 w-3.5" /> Add New Row <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onClick={() => setRows((prev) => [...prev, newRow()])}>Add New Row</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRows((prev) => [...prev, newHeader(), newRow()])}>Add New Header</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="gap-1 text-xs h-8 text-primary border-primary" onClick={() => setShowBulkAdd(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Items in Bulk
                </Button>
              </div>
            </div>

            {/* ── Summary ────────────────────────────────────────────── */}
            <div className="flex bg-muted/5 rounded-b-lg">
              <div className="flex-1 p-4"></div>
              <div className="w-[450px] bg-muted/10 p-6 rounded-br-lg space-y-4 shadow-[inset_1px_0_0_0_rgba(0,0,0,0.05)]">
                <div className="flex justify-between text-sm font-semibold">
                  <div>
                    Sub Total
                  </div>
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
                        onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value)))}
                      />
                      <DropdownMenu open={showDiscountTypeDD} onOpenChange={setShowDiscountTypeDD}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-8 px-2 border-l text-sm bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center min-w-[36px]"
                          >
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
                  {/* TDS Selector */}
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
                  {/* TCS Selector */}
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
                            <div className="border-t p-2 flex items-center gap-1">
                              <Settings2 className="h-3.5 w-3.5 text-primary" />
                              <button type="button" className="text-xs text-primary hover:underline" onClick={() => { setShowTCSDD?.(false); setShowManageTCS(true); }}>Manage TCS</button>
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
                      className="h-8 text-sm placeholder:text-muted-foreground pr-6"
                      value={adjustmentLabel}
                      onChange={(e) => setAdjustmentLabel(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-32 relative">
                    <Input
                      type="number"
                      className="h-8 text-sm text-right pr-8"
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

            {/* ── Notes + Terms ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Notes</Label>
                <Textarea className="text-sm resize-none" rows={4} placeholder="Will be displayed on purchase order" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Terms &amp; Conditions</Label>
                <Textarea className="text-sm resize-none" rows={4} placeholder="Enter the terms and conditions" value={terms} onChange={(e) => setTerms(e.target.value)} />
              </div>
            </div>

            {/* ── Attach files ──────────────────────────────────────── */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Attach File(s) to Purchase Order</Label>
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
                      const results = await Promise.all(
                        toUpload.map((f) => uploadApi.upload(f, "purchase-orders"))
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
                        key={idx}
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
                              if (a.publicId) {
                                await uploadApi.remove(a.publicId);
                              }
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
              <p className="text-xs text-muted-foreground mt-1.5">
                You can upload a maximum of 10 files, 10MB each
              </p>
            </div>

            {/* ── Bottom buttons ─────────────────────────────────────── */}
            <div className="border-t pt-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md font-semibold" onClick={() => handleSave("Draft")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save as Draft
                </Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" onClick={() => handleSave("Open")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save and Send
                </Button>
                <Button variant="ghost" size="sm" className="text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md font-semibold" onClick={() => router.back()}>Cancel</Button>
              </div>
              <span className="text-xs text-muted-foreground">PDF Template: &apos;Standard Template&apos;</span>
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <BulkAddItemsDialog open={showBulkAdd} onClose={() => setShowBulkAdd(false)} items={items} onAdd={handleBulkAdd} />
        <ManageTDSDialog open={showManageTDS} onClose={() => setShowManageTDS(false)} tdsTaxes={tdsTaxes} onCreated={(t) => setTdsTaxes((prev) => [...prev, t])} />
        <ManageTCSDialog
          open={showManageTCS}
          onClose={() => setShowManageTCS(false)}
          tcsTaxes={tcsTaxes}
          onCreated={(tax) => {
            setTcsTaxes((prev) => [...prev, tax]);
          }}
        />

        <Dialog open={showNewAddrDialog} onOpenChange={(o) => { if (!o) setShowNewAddrDialog(false); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New address</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-1">
              {["City", "State/Province", "ZIP/Postal Code"].map((label) => {
                const key = label === "City" ? "city" : label === "State/Province" ? "state" : "zip";
                return (
                  <div key={label}>
                    <Label className="text-xs font-medium">{label}</Label>
                    <Input className="mt-1 h-9 text-sm" value={(newAddrForm as any)[key]} onChange={(e) => setNewAddrForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                );
              })}
              <div>
                <Label className="text-xs font-medium">Country/Region</Label>
                <Select value={newAddrForm.country} onValueChange={(v) => setNewAddrForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["India", "United States", "United Kingdom", "Canada", "Australia", "Germany", "Singapore", "UAE"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Phone</Label>
                <Input className="mt-1 h-9 text-sm" value={newAddrForm.phone} onChange={(e) => setNewAddrForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowNewAddrDialog(false)}>Cancel</Button>
              <Button size="sm" onClick={() => {
                const label = newAddrForm.city || "New Address";
                setSavedAddresses((prev) => {
                  const next = [...prev, { label, city: newAddrForm.city, state: newAddrForm.state, country: newAddrForm.country, street: newAddrForm.street1, phone: newAddrForm.phone }];
                  setSelectedAddrIdx(next.length - 1);
                  return next;
                });
                setShowNewAddrDialog(false);
                setNewAddrForm({ attention: "", street1: "", street2: "", city: "", state: "", zip: "", country: "India", phone: "" });
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showReportingTagsDialog} onOpenChange={(o) => { if (!o) setShowReportingTagsDialog(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Reporting Tags</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">No active reporting tags found. Create them from Settings.</p>
            <DialogFooter><Button variant="outline" size="sm" onClick={() => setShowReportingTagsDialog(false)}>OK</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Item Details Side Panel ─────────────────────────────── */}
        {panelItem && (
          <div className="fixed right-0 inset-y-0 z-[300] w-[300px] bg-white border-l shadow-2xl flex flex-col">
            <button type="button" className="absolute top-3 right-3 text-red-500 hover:text-red-600 z-10" onClick={() => setItemPanelItemId(null)}>
              <X className="h-5 w-5" />
            </button>
            <div className="px-4 pt-4 pb-3 border-b">
              <h3 className="text-sm font-semibold text-muted-foreground">Item Details</h3>
            </div>
            <div className="px-4 py-3 border-b flex items-start gap-3">
              <div className="h-14 w-14 rounded border bg-muted/30 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-muted-foreground/40" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground mb-0.5">
                  {panelItem.itemGroupId ? (typeof panelItem.itemGroupId === "object" ? (panelItem.itemGroupId as any).name : "Items") : "Sales and Purchase Items"}
                </p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm truncate">{panelItem.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{panelUnit}</p>
              </div>
            </div>
            <div className="flex border-b">
              {(["details", "transactions"] as const).map((tab) => (
                <button key={tab} type="button"
                  className={cn("flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    itemPanelTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
                  onClick={() => setItemPanelTab(tab)}>
                  {tab === "details" ? "Item Details" : "Transactions"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {itemPanelTab === "details" ? (
                <div className="p-4 space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Sales Information</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Price</span><span>₹{fmt(panelItem.sellingPrice)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Account</span><span>{panelSalesAccount?.name || "—"}</span></div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Purchase Information</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Price</span><span>₹{fmt(panelItem.costPrice)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">Account</span><span>{panelPurchaseAccount?.name || "—"}</span></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <DropdownMenu open={showTxTypeDD} onOpenChange={setShowTxTypeDD}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex items-center gap-1 text-sm font-semibold hover:text-primary">
                          {itemPanelTxType} <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="z-[320] w-52">
                        {ITEM_TRANSACTION_TYPES.map((t) => (
                          <DropdownMenuItem key={t} onClick={() => { setItemPanelTxType(t); setShowTxTypeDD(false); }}>{t}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu open={showTxStatusDD} onOpenChange={setShowTxStatusDD}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          Status: {itemPanelTxStatus} <ChevronDown className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[320]">
                        {["All", "Open", "Draft", "Closed"].map((s) => (
                          <DropdownMenuItem key={s} onClick={() => { setItemPanelTxStatus(s); setShowTxStatusDD(false); }}>{s}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Separator className="mb-4" />
                  <p className="text-sm text-muted-foreground text-center py-8">No {itemPanelTxType} recorded yet.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}
