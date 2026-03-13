"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, X, ChevronDown, GripVertical, Pencil,
  Settings2, Upload, HelpCircle, Trash2, MoreHorizontal, Info, CircleDot, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
import { purchaseOrderApi, type CreatePurchaseOrderInput, type DiscountLevel } from "@/lib/api/purchase-orders";
import { tdsTaxApi, type TdsTax, type CreateTdsTaxInput, TDS_SECTIONS } from "@/lib/api/tds-taxes";
import { cn } from "@/lib/utils";

// ─── Shipment preference options ─────────────────────────────────────────────
const SHIPMENT_OPTIONS = [
  "Road", "Air", "Sea", "Rail", "Courier", "Hand Delivery", "Other",
];

// ─── Expense account options (for item account dropdown) ─────────────────────
const EXPENSE_ACCOUNTS = [
  "Advertising And Marketing", "Automobile Expense", "Bad Debt",
  "Bank Fees and Charges", "Consultant Expense", "Contract Assets",
  "Credit Card Charges", "Depreciation And Amortisation", "Depreciation Expense",
  "Fuel/Mileage Expenses", "IT and Internet Expenses", "Janitorial Expense",
  "Lodging", "Meals and Entertainment", "Merchandise", "Office Supplies",
  "Other Expenses", "Postage", "Printing and Stationery", "Purchase Discounts",
  "Raw Materials And Consumables", "Rent Expense", "Repairs and Maintenance",
  "Salaries and Employee Wages", "Telephone Expense", "Transportation Expense",
  "Travel Expense", "Uncategorized", "Cost Of Goods Sold", "Cost of Goods Sold",
  "Job Costing", "Labor", "Materials", "Subcontractor",
];

const PO_PREFIX_PLACEHOLDER_GROUPS = [
  "Fiscal Year Start",
  "Fiscal Year End",
  "Transaction Year",
  "Transaction Date",
  "Transaction Month",
] as const;

const PO_PREFIX_PLACEHOLDER_FORMATS: Record<string, string[]> = {
  "Fiscal Year Start": ["YY", "YYYY"],
  "Fiscal Year End": ["YY", "YYYY"],
  "Transaction Year": ["YY", "YYYY"],
  "Transaction Date": ["DDMMYY", "DDMMYYYY"],
  "Transaction Month": ["MM", "MMM"],
};

const ITEM_TRANSACTION_TYPES = [
  "Quotes", "Sales Orders", "Invoices", "Delivery Challans", "Credit Notes",
  "Recurring Invoices", "Purchase Orders", "Bills", "Vendor Credits",
] as const;

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

// ─── Helpers ────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function getName(v: any): string {
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
  };
}

function newHeader(): LineRow {
  return { ...newRow(), isHeader: true, headerText: "Add New Header" };
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

// ─── Manage TDS Dialog ───────────────────────────────────────────────────────
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
          <DialogTitle className="flex items-center justify-between">
            Manage TDS
          </DialogTitle>
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
                  <button
                    type="button"
                    className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30"
                    onClick={() => setShowPayableDD((v) => !v)}
                  >
                    <span className={selectedPayable ? "" : "text-muted-foreground"}>
                      {selectedPayable ? selectedPayable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showPayableDD && (
                    <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Search"
                          value={payableSearch}
                          onChange={(e) => setPayableSearch(e.target.value)}
                          autoFocus
                        />
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
                  <button
                    type="button"
                    className="w-full h-9 text-sm border rounded-md px-3 text-left flex items-center justify-between hover:bg-muted/30"
                    onClick={() => setShowReceivableDD((v) => !v)}
                  >
                    <span className={selectedReceivable ? "" : "text-muted-foreground"}>
                      {selectedReceivable ? selectedReceivable.name : "Select an account"}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {showReceivableDD && (
                    <div className="absolute z-[180] top-full mt-1 w-full bg-background border rounded-md shadow-lg">
                      <div className="p-2 border-b">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Search"
                          value={receivableSearch}
                          onChange={(e) => setReceivableSearch(e.target.value)}
                          autoFocus
                        />
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
              <Checkbox
                id="isHigherRate"
                checked={form.isHigherRate}
                onCheckedChange={(c) => setForm((f) => ({ ...f, isHigherRate: !!c }))}
              />
              <label htmlFor="isHigherRate" className="text-sm cursor-pointer">This is a Higher TDS Rate</label>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-3">Applicable Period <HelpCircle className="inline h-4 w-4 text-muted-foreground" /></h4>
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

// ─── Add Items in Bulk Dialog ────────────────────────────────────────────────
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
      <DialogContent className="w-[95vw] max-w-5xl h-[85vh] p-0 overflow-hidden">
        <div className="flex h-full flex-col md:flex-row">
          {/* Left panel */}
          <div className="w-full md:w-[420px] border-b md:border-b-0 md:border-r flex flex-col min-h-[240px] md:min-h-0">
            <div className="p-4 border-b">
              <Input
                className="h-9 text-sm"
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
          {/* Right panel */}
          <div className="flex-1 flex flex-col p-4 md:p-6 min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Selected Items <span className="ml-2 bg-muted rounded-full px-2 py-0.5 text-sm">{selected.size}</span></h3>
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
                    <div className="flex-1 text-sm font-medium">{item.name}</div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, (p[item._id] || 1) - 1) }))}>−</Button>
                      <Input className="h-7 w-14 text-center text-sm" type="number" min={1} value={quantities[item._id] || 1} onChange={(e) => setQuantities((p) => ({ ...p, [item._id]: Math.max(1, Number(e.target.value)) }))} />
                      <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setQuantities((p) => ({ ...p, [item._id]: (p[item._id] || 1) + 1 }))}>+</Button>
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
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item selector popup ─────────────────────────────────────────────────────
function ItemSelectorPopup({
  items, onSelect,
}: {
  items: Item[];
  onSelect: (item: Item) => void;
}) {
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
          <button key={item._id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 flex justify-between"
            onClick={() => onSelect(item)}>
            <span className="text-sm">{item.name}</span>
            <span className="text-xs text-muted-foreground">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.costPrice || 0)}</span>
          </button>
        ))}
      </div>
      <div className="p-2 border-t">
        <button type="button" className="text-xs text-primary hover:underline">+ Add New Item</button>
      </div>
    </div>
  );
}

// ─── Account selector dropdown ───────────────────────────────────────────────
function AccountDropdown({
  value, onChange, accounts,
}: {
  value: string;
  onChange: (id: string, name: string) => void;
  accounts: Account[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = accounts.find((a) => a._id === value);

  // Group by accountType
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
          <Input
            className="h-7 text-xs"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
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
          {Object.keys(grouped).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No accounts found</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Form ───────────────────────────────────────────────────────────────
export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  // Form fields
  const [vendorId, setVendorId] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [showVendorDD, setShowVendorDD] = useState(false);
  const [deliveryAddrType, setDeliveryAddrType] = useState<"Organization" | "Customer">("Organization");
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrIdx, setSelectedAddrIdx] = useState(0);
  const [showAddrDropdown, setShowAddrDropdown] = useState(false);
  const [showNewAddrDialog, setShowNewAddrDialog] = useState(false);
  const [newAddrForm, setNewAddrForm] = useState({ attention: "", street1: "", street2: "", city: "", state: "", zip: "", country: "India", phone: "" });
  const [customerDeliveryId, setCustomerDeliveryId] = useState("");
  const [poNumber, setPoNumber] = useState("PO-00001");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [poDate, setPoDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [shipmentPreference, setShipmentPreference] = useState("");
  const [discountLevel, setDiscountLevel] = useState<DiscountLevel>("transaction");
  const [discountAccountId, setDiscountAccountId] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow()]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [tdsId, setTdsId] = useState("");
  const [taxAmount, setTaxAmount] = useState(0);
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  // Data
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);

  // UI state
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showManageTDS, setShowManageTDS] = useState(false);
  const [showTaxDD, setShowTaxDD] = useState(false);
  const [itemSelectorRow, setItemSelectorRow] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showReportingTagsDialog, setShowReportingTagsDialog] = useState(false);
  const [showPOConfig, setShowPOConfig] = useState(false);
  const [poConfigMode, setPoConfigMode] = useState<"auto" | "manual">("auto");
  const [poPrefix, setPoPrefix] = useState("PO-");
  const [poNextNumber, setPoNextNumber] = useState("00001");
  const [poRestartYearly, setPoRestartYearly] = useState(false);
  const [showPrefixPlaceholders, setShowPrefixPlaceholders] = useState(false);
  const [poPrefixGroup, setPoPrefixGroup] = useState<(typeof PO_PREFIX_PLACEHOLDER_GROUPS)[number]>("Fiscal Year Start");

  // Discount type toggle
  const [discountType, setDiscountType] = useState<"%" | "₹">("%");
  const [showDiscountTypeDD, setShowDiscountTypeDD] = useState(false);

  // Item details side panel
  const [itemPanelItemId, setItemPanelItemId] = useState<string | null>(null);
  const [itemPanelTab, setItemPanelTab] = useState<"details" | "transactions">("details");
  const [itemPanelTxType, setItemPanelTxType] = useState("Purchase Orders");
  const [itemPanelTxStatus, setItemPanelTxStatus] = useState("All");
  const [showTxTypeDD, setShowTxTypeDD] = useState(false);
  const [showTxStatusDD, setShowTxStatusDD] = useState(false);

  // TCS
  const [tcsTaxes, setTcsTaxes] = useState<TdsTax[]>([]);
  const [tcsId, setTcsId] = useState("");
  const [showTCSDD, setShowTCSDD] = useState(false);
  const [tdsSearch, setTdsSearch] = useState("");
  const [tcsSearch, setTcsSearch] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const loadData = useCallback(async () => {
    if (!firebaseUser || loading || !activeOrganization?._id) return;
    try {
      const [vRes, cRes, iRes, aRes, ptRes, tdsRes, numRes] = await Promise.all([
        contactApi.list({ type: "Vendor", page: 1, limit: 200 }),
        contactApi.list({ type: "Customer", page: 1, limit: 200 }),
        itemApi.list({ page: 1, limit: 200 }),
        accountApi.list({ excludeGroups: true }),
        settingsApi.paymentTerms.list(),
        tdsTaxApi.list(),
        purchaseOrderApi.getNextNumber(),
      ]);
      setVendors(vRes.data ?? []);
      setCustomers(cRes.data ?? []);
      setItems(iRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setPaymentTermsList(ptRes.data ?? []);
      const tdsData = tdsRes.data ?? [];
      setTdsTaxes(tdsData.length > 0 ? tdsData : DEFAULT_TDS_TAXES);
      setPoNumber(numRes.data.purchaseOrderNumber ?? "PO-00001");
    } catch { /* noop */ }
  }, [firebaseUser, loading, activeOrganization?._id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Initialize saved addresses from org billing address
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
      street2: addr.street2 || "",
      phone: org.phone || "",
    }]);
  }, [activeOrganization]);

  // Computed totals
  const subTotal = rows.filter((r) => !r.isHeader).reduce((s, r) => s + r.amount, 0);
  const discountAmt = discountLevel === "transaction"
    ? discountType === "%" ? (subTotal * discountPercent) / 100 : discountPercent
    : rows.filter((r) => !r.isHeader).reduce((s, r) => s + r.discountAmount, 0);
  const selectedTds = tdsTaxes.find((t) => t._id === tdsId);
  const selectedTcs = tcsTaxes.find((t) => t._id === tcsId);
  const computedTax = taxType === "TDS"
    ? (selectedTds ? ((subTotal - discountAmt) * selectedTds.rate) / 100 : 0)
    : taxType === "TCS"
      ? (selectedTcs ? ((subTotal - discountAmt) * selectedTcs.rate) / 100 : 0)
      : taxAmount;
  const totalQuantity = rows.filter((r) => !r.isHeader).reduce((s, r) => s + r.quantity, 0);
  const panelItem = items.find((i) => i._id === itemPanelItemId) ?? null;
  const panelUnit = !panelItem?.unit ? "" : typeof panelItem.unit === "string" ? panelItem.unit : (panelItem.unit as any)?.abbreviation || "";
  const panelSalesAccount = accounts.find((a) => a._id === (panelItem?.salesAccountId || ""));
  const panelPurchaseAccount = accounts.find((a) => a._id === (panelItem?.purchaseAccountId || ""));
  const total = subTotal - discountAmt - (taxType === "none" ? 0 : computedTax) + adjustmentAmount;

  // Vendor filter
  const filteredVendors = vendors.filter((v) => {
    const s = vendorSearch.toLowerCase();
    return (v.displayName || v.companyName || "").toLowerCase().includes(s) || (v.email || "").toLowerCase().includes(s);
  });

  function updateRow(id: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      return calcRow({ ...r, ...patch }, discountLevel);
    }));
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
      const source = prev[idx];
      const cloned = { ...source, id: Math.random().toString(36).slice(2) };
      copy.splice(idx + 1, 0, cloned);
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
      quantity: 1,
      rate: item.costPrice || 0,
      unit: unitStr,
    });
    setItemSelectorRow(null);
  }

  async function handleSave(status: "Draft" | "Open") {
    if (!poDate) { toast.error("Purchase order date is required"); return; }
    setSaving(true);
    try {
      const payload: CreatePurchaseOrderInput = {
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
        taxAmount: taxType !== "none" ? computedTax : 0,
        adjustmentLabel,
        adjustmentAmount,
        notes,
        termsAndConditions: terms,
        status,
      };
      await purchaseOrderApi.create(payload);
      toast.success(`Purchase order ${status === "Draft" ? "saved as draft" : "saved"}`);
      router.push("/purchases/orders");
    } catch { toast.error("Failed to save purchase order"); } finally { setSaving(false); }
  }

  const selectedVendor = vendors.find((v) => v._id === vendorId);
  const orgAddress = activeOrganization as any;
  const currentAddr = savedAddresses[selectedAddrIdx] || {
    label: orgAddress?.name || "Organization",
    city: orgAddress?.billingAddress?.city || "",
    state: orgAddress?.billingAddress?.state || "",
    country: orgAddress?.billingAddress?.country || "",
    street: orgAddress?.billingAddress?.street || "",
    phone: orgAddress?.phone || "",
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="min-h-screen bg-white">
          {/* Page title */}
          <div className="px-8 pt-6 pb-2 border-b">
            <div className="flex items-center gap-2 text-2xl font-semibold">
              <ShoppingBagIcon className="h-6 w-6" />
              New Purchase Order
            </div>
          </div>

          <div className="px-8 py-6 max-w-5xl space-y-6">
            {/* ── Vendor Name ─────────────────────────────────────── */}
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

            {/* ── Delivery Address ─────────────────────────────────── */}
            <div className="grid grid-cols-[160px_1fr] items-start gap-4 py-4 border-b">
              <Label className="text-sm font-medium text-red-500 pt-2">Delivery Address *</Label>
              <div className="space-y-3">
                {/* Radios */}
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryAddrType" value="Organization" checked={deliveryAddrType === "Organization"} onChange={() => setDeliveryAddrType("Organization")} className="accent-primary" />
                    <span className="text-sm">Organization</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryAddrType" value="Customer" checked={deliveryAddrType === "Customer"} onChange={() => setDeliveryAddrType("Customer")} className="accent-primary" />
                    <span className="text-sm">Customer</span>
                  </label>
                </div>

                {/* Organization mode */}
                {deliveryAddrType === "Organization" && (
                  <div className="text-sm">
                    {/* Org name + pencil */}
                    <div className="flex items-center gap-1.5 font-medium mb-1">
                      <span>{currentAddr.label}</span>
                      <button type="button" className="text-primary/70 hover:text-primary" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Address lines */}
                    <div className="text-muted-foreground space-y-0.5 text-sm">
                      {currentAddr.city && <p>{currentAddr.city}</p>}
                      {currentAddr.country && <p>{currentAddr.country} ,</p>}
                    </div>
                    {/* Change destination dropdown */}
                    <div className="mt-2">
                      <DropdownMenu open={showAddrDropdown} onOpenChange={setShowAddrDropdown}>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="text-sm text-primary hover:underline">
                            Change destination to deliver
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-72 p-0 overflow-hidden">
                          <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                            <Input className="h-7 text-xs" placeholder="Search" autoFocus />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {savedAddresses.map((addr, idx) => (
                              <button
                                key={idx}
                                type="button"
                                className={cn(
                                  "w-full text-left px-3 py-2.5 text-sm hover:bg-muted/50 border-b last:border-0",
                                  selectedAddrIdx === idx && "bg-blue-50",
                                )}
                                onClick={() => { setSelectedAddrIdx(idx); setShowAddrDropdown(false); }}
                              >
                                <div className="font-medium">{addr.label}</div>
                                {addr.city && <div className="text-xs text-muted-foreground">{addr.city}</div>}
                                {addr.country && <div className="text-xs text-muted-foreground">{addr.country} ,</div>}
                              </button>
                            ))}
                          </div>
                          <div className="p-2 border-t">
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium"
                              onClick={() => { setShowAddrDropdown(false); setShowNewAddrDialog(true); }}
                            >
                              <Plus className="h-4 w-4" /> New Address
                            </button>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}

                {/* Customer mode */}
                {deliveryAddrType === "Customer" && (
                  <div className="space-y-3">
                    <div className="flex gap-2 max-w-sm">
                      <div className="relative flex-1">
                        <select
                          className="w-full h-9 px-3 pr-8 text-sm border rounded-md bg-white appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
                          value={customerDeliveryId}
                          onChange={(e) => setCustomerDeliveryId(e.target.value)}
                        >
                          <option value="">Select Customer</option>
                          {customers.map((c) => (
                            <option key={c._id} value={c._id}>{c.displayName || c.companyName}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      </div>
                      <Button size="icon" className="h-9 w-9 bg-primary">
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
                      Stock on Hand will not be affected only in case of dropshipments. Selecting the Customer option in the
                      Deliver To field of a normal purchase order will have an effect on your stock level
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── PO #, Reference, Date ────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-12 gap-y-4 py-4 border-b">
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium text-red-500 w-36 shrink-0">Purchase Order# *</Label>
                <div className="flex gap-1 flex-1">
                  <Input className="h-9 text-sm flex-1" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                  <div className="relative group/po">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setShowPOConfig(true)}
                    >
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <div className="absolute hidden group-hover/po:block z-[180] bottom-full mb-2 right-0 w-56 bg-gray-800 text-white text-xs rounded px-2.5 py-2 leading-relaxed">
                      Click here to enable or disable auto-generation of Purchase Order numbers.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium w-24 shrink-0">Reference#</Label>
                <Input className="h-9 text-sm flex-1" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium w-36 shrink-0">Date</Label>
                <Input type="date" className="h-9 text-sm flex-1" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium w-24 shrink-0">Delivery Date</Label>
                <Input type="date" className="h-9 text-sm flex-1" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} placeholder="dd/MM/yyyy" />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium w-36 shrink-0">Payment Terms</Label>
                <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Due on Receipt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    {paymentTermsList.map((pt) => (
                      <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-sm font-medium w-36 shrink-0">Shipment Preference</Label>
                <Select value={shipmentPreference} onValueChange={setShipmentPreference}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue placeholder="Choose the shipment preference or type to add…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Discount level toggle ────────────────────────────── */}
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
                  onChange={(id) => setDiscountAccountId(id)}
                  accounts={accounts.filter((a) => a.rootType === "Expense" || a.name.toLowerCase().includes("discount"))}
                />
              )}
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
                      <th className="text-right px-3 py-2.5 font-medium w-24">
                        Rate <span className="border border-muted-foreground rounded px-0.5 text-[10px] ml-0.5">⊞</span>
                      </th>
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
                        key={row.id}
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
                            <td className="px-3 py-2 align-top">
                              <Input
                                type="number"
                                className="h-8 text-sm text-right w-full"
                                value={row.quantity}
                                min={0}
                                onChange={(e) => updateRow(row.id, { quantity: Math.max(0, Number(e.target.value)) })}
                              />
                              {row.unit && <div className="text-xs text-muted-foreground text-right mt-0.5">{row.unit}</div>}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Input
                                type="number"
                                className="h-8 text-sm text-right w-full"
                                value={row.rate}
                                min={0}
                                onChange={(e) => updateRow(row.id, { rate: Math.max(0, Number(e.target.value)) })}
                              />
                            </td>
                            {discountLevel === "line_item" && (
                              <td className="px-3 py-2 align-top">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    className="h-8 text-sm text-right w-14"
                                    value={row.discountPercent}
                                    min={0}
                                    max={100}
                                    onChange={(e) => updateRow(row.id, { discountPercent: Math.min(100, Number(e.target.value)), discountAmount: 0 })}
                                  />
                                  <span className="text-xs text-muted-foreground">%</span>
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-2 align-top text-right">
                              <div className="font-medium">{fmt(row.amount)}</div>
                              {row.itemId && (
                                <button
                                  type="button"
                                  className="text-[11px] text-primary hover:underline mt-0.5 block ml-auto"
                                  onClick={() => { setItemPanelItemId(row.itemId); setItemPanelTab("transactions"); }}
                                >
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
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="z-[200]">
                                <DropdownMenuItem>
                                  Hide Additional Information
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => cloneRow(row.id)}>
                                  Clone
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => insertRowNear(row.id, "below")}>
                                  Insert New Row
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowBulkAdd(true)}>
                                  Insert Items in Bulk
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => insertHeaderNear(row.id)}>
                                  Insert New Header
                                </DropdownMenuItem>
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
                          <td className="px-2 py-2 text-muted-foreground">
                            <GripVertical className="h-3.5 w-3.5" />
                          </td>
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
                    <DropdownMenuItem onClick={() => setRows((prev) => [...prev, newRow()])}>
                      Add New Row
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRows((prev) => [...prev, newHeader(), newRow()])}>
                      Add New Header
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="gap-1 text-xs h-8 text-primary border-primary" onClick={() => setShowBulkAdd(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Items in Bulk
                </Button>
              </div>
            </div>

            {/* ── Summary ────────────────────────────────────────────── */}
            <div className="flex justify-end">
              <div className="w-96 space-y-3">
                <div className="flex justify-between text-sm font-medium">
                  <div>
                    <div>Sub Total</div>
                    <div className="text-xs text-muted-foreground font-normal mt-0.5">Total Quantity : {totalQuantity}</div>
                  </div>
                  <span>{fmt(subTotal)}</span>
                </div>
                {discountLevel === "transaction" && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-primary">Discount</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-7 w-16 text-right text-sm"
                        min={0}
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value)))}
                      />
                      <DropdownMenu open={showDiscountTypeDD} onOpenChange={setShowDiscountTypeDD}>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-7 px-2 border rounded text-sm flex items-center gap-0.5 hover:bg-muted/30 min-w-[38px] justify-center"
                          >
                            {discountType}<ChevronDown className="h-3 w-3" />
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
                    <span className="text-sm">{fmt(discountAmt)}</span>
                  </div>
                )}
                {/* TDS / TCS */}
                <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="taxType" value="TDS" checked={taxType === "TDS"} onChange={() => { setTaxType("TDS"); setTcsId(""); }} className="accent-primary" />
                      TDS
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input type="radio" name="taxType" value="TCS" checked={taxType === "TCS"} onChange={() => { setTaxType("TCS"); setTdsId(""); }} className="accent-primary" />
                      TCS
                    </label>
                    {/* TDS Selector */}
                    {taxType === "TDS" && (
                      <DropdownMenu open={showTaxDD} onOpenChange={(o) => { setShowTaxDD(o); if (!o) setTdsSearch(""); }}>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-sm border rounded-md px-2.5 py-1 hover:bg-muted/30">
                            {selectedTds ? `${selectedTds.taxName} [${selectedTds.rate}%]` : "Select a Tax"}
                            <ChevronDown className="h-3 w-3" />
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
                    )}
                    {/* TCS Selector */}
                    {taxType === "TCS" && (
                      <DropdownMenu open={showTCSDD} onOpenChange={(o) => { setShowTCSDD(o); if (!o) setTcsSearch(""); }}>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-sm border rounded-md px-2.5 py-1 hover:bg-muted/30">
                            {selectedTcs ? `${selectedTcs.taxName} [${selectedTcs.rate}%]` : "Select a Tax"}
                            <ChevronDown className="h-3 w-3" />
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
                            <button type="button" className="text-xs text-primary hover:underline">Manage TCS</button>
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <span className="text-sm text-red-500">- {fmt(taxType !== "none" ? computedTax : 0)}</span>
                </div>
                {/* Adjustment */}
                <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-7 w-28 text-sm"
                      value={adjustmentLabel}
                      onChange={(e) => setAdjustmentLabel(e.target.value)}
                    />
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="h-7 w-24 text-sm text-right"
                      value={adjustmentAmount}
                      onChange={(e) => setAdjustmentAmount(Number(e.target.value))}
                    />
                  </div>
                  <span className="text-sm">{fmt(adjustmentAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{fmt(total)}</span>
                </div>
              </div>
            </div>

            {/* ── Notes + Terms side by side ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Notes</Label>
                <Textarea
                  className="text-sm resize-none"
                  rows={4}
                  placeholder="Will be displayed on purchase order"
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
            <div>
              <Label className="text-sm font-medium mb-2 block">Attach File(s) to Purchase Order</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2 text-sm">
                  <Upload className="h-4 w-4" /> Upload File <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">You can upload a maximum of 10 files, 10MB each</p>
            </div>

            {/* ── Additional Fields info ─────────────────────────────── */}
            <div className="text-xs text-muted-foreground">
              <strong>Additional Fields:</strong> Start adding custom fields for your purchase orders by going to{" "}
              <span className="text-primary cursor-pointer hover:underline">Settings</span> ➜{" "}
              <span className="text-primary cursor-pointer hover:underline">Purchases</span> ➜{" "}
              <span className="text-primary cursor-pointer hover:underline">Purchase Orders</span>.
            </div>

            {/* ── Bottom buttons ─────────────────────────────────────── */}
            <div className="border-t pt-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleSave("Draft")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save as Draft
                </Button>
                <Button size="sm" onClick={() => handleSave("Open")} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save and Send
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.back()}>Cancel</Button>
              </div>
              <span className="text-xs text-muted-foreground">PDF Template: &apos;Standard Template&apos;</span>
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <BulkAddItemsDialog
          open={showBulkAdd}
          onClose={() => setShowBulkAdd(false)}
          items={items}
          onAdd={handleBulkAdd}
        />
        <ManageTDSDialog
          open={showManageTDS}
          onClose={() => setShowManageTDS(false)}
          tdsTaxes={tdsTaxes}
          onCreated={(t) => setTdsTaxes((prev) => [...prev, t])}
        />

        {/* ── New Address Dialog ─────────────────────────────── */}
        <Dialog open={showNewAddrDialog} onOpenChange={(o) => { if (!o) setShowNewAddrDialog(false); }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New address</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-1">
              <div>
                <Label className="text-xs font-medium">Attention</Label>
                <Input className="mt-1 h-9 text-sm" value={newAddrForm.attention} onChange={(e) => setNewAddrForm((f) => ({ ...f, attention: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">Street 1</Label>
                <Textarea className="mt-1 text-sm resize-none" rows={2} value={newAddrForm.street1} onChange={(e) => setNewAddrForm((f) => ({ ...f, street1: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">Street 2</Label>
                <Textarea className="mt-1 text-sm resize-none" rows={2} value={newAddrForm.street2} onChange={(e) => setNewAddrForm((f) => ({ ...f, street2: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">City</Label>
                <Input className="mt-1 h-9 text-sm" value={newAddrForm.city} onChange={(e) => setNewAddrForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">State/Province</Label>
                <Input className="mt-1 h-9 text-sm" value={newAddrForm.state} onChange={(e) => setNewAddrForm((f) => ({ ...f, state: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">ZIP/Postal Code</Label>
                <Input className="mt-1 h-9 text-sm" value={newAddrForm.zip} onChange={(e) => setNewAddrForm((f) => ({ ...f, zip: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-medium">Country/Region</Label>
                <Select value={newAddrForm.country} onValueChange={(v) => setNewAddrForm((f) => ({ ...f, country: v }))}>
                  <SelectTrigger className="mt-1 h-9 text-sm">
                    <SelectValue placeholder="Select or type to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {["India", "United States", "United Kingdom", "Canada", "Australia", "Germany", "France", "Singapore", "UAE", "Japan", "China", "Other"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Phone</Label>
                <div className="flex gap-1 mt-1">
                  <Select defaultValue="+91">
                    <SelectTrigger className="h-9 text-sm w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["+91", "+1", "+44", "+61", "+971", "+65", "+81"].map((code) => (
                        <SelectItem key={code} value={code}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="h-9 text-sm flex-1" value={newAddrForm.phone} onChange={(e) => setNewAddrForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowNewAddrDialog(false)}>Cancel</Button>
              <Button size="sm" onClick={() => {
                const label = newAddrForm.attention || newAddrForm.city || "New Address";
                setSavedAddresses((prev) => {
                  const next = [...prev, {
                    label,
                    city: newAddrForm.city,
                    state: newAddrForm.state,
                    country: newAddrForm.country,
                    street: newAddrForm.street1,
                    street2: newAddrForm.street2,
                    phone: newAddrForm.phone,
                  }];
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

        {/* ── Configure PO# Preferences Dialog ──────────────── */}
        <Dialog open={showPOConfig} onOpenChange={(o) => { if (!o) { setShowPOConfig(false); setShowPrefixPlaceholders(false); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Configure Purchase Order# Preferences</DialogTitle>
            </DialogHeader>
            {/* Info banner */}
            <div className="bg-muted/40 rounded-lg p-3 flex items-start gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground flex-1 leading-relaxed">
                Configure multiple transaction number series to auto-generate transaction numbers with unique prefixes according to your business needs.
              </p>
              <button type="button" className="text-primary text-xs hover:underline shrink-0 font-medium">Configure →</button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {poConfigMode === "auto"
                ? "Your purchase order numbers are set on auto-generate mode to save your time. Are you sure about changing this setting?"
                : "You have selected manual purchase order numbering. Do you want us to auto-generate it for you?"}
            </p>
            <div className="space-y-4">
              {/* Auto-generate option */}
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="poConfigMode" value="auto"
                    checked={poConfigMode === "auto"}
                    onChange={() => setPoConfigMode("auto")}
                    className="accent-primary mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">Continue auto-generating purchase order numbers</span>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {poConfigMode === "auto" && (
                      <div className="mt-3 space-y-3 ml-1">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs font-medium mb-1.5 block">Prefix</Label>
                            <div className="flex gap-1">
                              <Input
                                className="h-8 text-sm flex-1"
                                value={poPrefix}
                                onChange={(e) => setPoPrefix(e.target.value)}
                              />
                              <div className="relative">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setShowPrefixPlaceholders((v) => !v)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                                {showPrefixPlaceholders && (
                                  <div className="absolute z-[180] top-full mt-1 right-0 w-[360px] bg-background border rounded-md shadow-lg overflow-hidden">
                                    <div className="grid grid-cols-[1fr_96px]">
                                      <div className="border-r">
                                        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 uppercase tracking-wide">Placeholder</div>
                                        {PO_PREFIX_PLACEHOLDER_GROUPS.map((ph) => (
                                          <button
                                            key={ph}
                                            type="button"
                                            className={cn(
                                              "w-full text-left px-3 py-2 text-sm hover:bg-primary hover:text-primary-foreground",
                                              poPrefixGroup === ph && "bg-primary text-primary-foreground"
                                            )}
                                            onClick={() => setPoPrefixGroup(ph)}
                                          >
                                            {ph}
                                          </button>
                                        ))}
                                      </div>
                                      <div>
                                        {PO_PREFIX_PLACEHOLDER_FORMATS[poPrefixGroup].map((fmtOpt) => (
                                          <button
                                            key={fmtOpt}
                                            type="button"
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-primary hover:text-primary-foreground"
                                            onClick={() => {
                                              const token = `{${poPrefixGroup.replace(/ /g, "")}_${fmtOpt}}`;
                                              setPoPrefix((p) => p + token);
                                              setShowPrefixPlaceholders(false);
                                            }}
                                          >
                                            {fmtOpt}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs font-medium mb-1.5 block">Next Number</Label>
                            <Input
                              className="h-8 text-sm"
                              value={poNextNumber}
                              onChange={(e) => setPoNextNumber(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="restartYearly"
                            checked={poRestartYearly}
                            onCheckedChange={(c) => setPoRestartYearly(!!c)}
                          />
                          <label htmlFor="restartYearly" className="text-sm cursor-pointer">
                            Restart numbering for purchase orders at the start of each fiscal year.
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              {/* Manual option */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="poConfigMode" value="manual"
                  checked={poConfigMode === "manual"}
                  onChange={() => setPoConfigMode("manual")}
                  className="accent-primary"
                />
                <span className="text-sm">Enter purchase order numbers manually</span>
              </label>
            </div>
            <DialogFooter className="mt-5">
              <Button variant="outline" size="sm" onClick={() => { setShowPOConfig(false); setShowPrefixPlaceholders(false); }}>Cancel</Button>
              <Button size="sm" onClick={() => {
                if (poConfigMode === "auto") {
                  setPoNumber(`${poPrefix}${poNextNumber}`);
                }
                setShowPOConfig(false);
                setShowPrefixPlaceholders(false);
              }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Item Details Side Panel ─────────────────────────────── */}
        {panelItem && (
          <div className="fixed right-0 inset-y-0 z-[300] w-[300px] bg-white border-l shadow-2xl flex flex-col">
            {/* Close button */}
            <button
              type="button"
              className="absolute top-3 right-3 text-red-500 hover:text-red-600 z-10"
              onClick={() => setItemPanelItemId(null)}
            >
              <X className="h-5 w-5" />
            </button>
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b">
              <h3 className="text-sm font-semibold text-muted-foreground">Item Details</h3>
            </div>
            {/* Item info row */}
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
                  {panelItem.itemGroupId
                    ? (typeof panelItem.itemGroupId === "object" ? (panelItem.itemGroupId as any).name : "Sales and Purchase Items")
                    : "Sales and Purchase Items"}
                </p>
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm truncate">{panelItem.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{panelUnit}</p>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex border-b">
              {(["details", "transactions"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={cn(
                    "flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    itemPanelTab === tab
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setItemPanelTab(tab)}
                >
                  {tab === "details" ? "Item Details" : "Transactions"}
                </button>
              ))}
            </div>
            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {itemPanelTab === "details" ? (
                <div className="p-4 space-y-5">
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Sales Information</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price</span>
                        <span>₹{fmt(panelItem.sellingPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Account</span>
                        <span className="text-right">{panelSalesAccount?.name || "—"}</span>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Purchase Information</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Price</span>
                        <span>₹{fmt(panelItem.costPrice)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Account</span>
                        <span className="text-right">{panelPurchaseAccount?.name || "—"}</span>
                      </div>
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
                          <DropdownMenuItem key={t} onClick={() => { setItemPanelTxType(t); setShowTxTypeDD(false); }}>
                            {t}
                          </DropdownMenuItem>
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
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No {itemPanelTxType} recorded yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

// Simple shopping bag icon inline (avoids import conflicts)
function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M6 2 3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  );
}
