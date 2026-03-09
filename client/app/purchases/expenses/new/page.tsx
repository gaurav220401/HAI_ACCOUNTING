"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, X, ChevronDown, Search, MoreVertical, Tag, ArrowLeft, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { accountApi, type Account } from "@/lib/api/accounts";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { expenseApi, type CreateExpenseInput } from "@/lib/api/expenses";
import { cn } from "@/lib/utils";

// ─── Tab type ───────────────────────────────────────────────────────────────
type ActiveTab = "expense" | "mileage" | "bulk";

// ─── Account groups for Expense Account dropdown ────────────────────────────
const EXPENSE_ACCOUNT_ROOT_TYPES = "Expense,Liability,Asset";

// ─── Line Item (itemized expense row) ───────────────────────────────────────
interface LineItem {
  id: string;
  expenseAccountId: string;
  notes: string;
  amount: string;
  showReportingTags: boolean;
}

// ─── Itemized expense table ──────────────────────────────────────────────────
interface ItemizedTableProps {
  lineItems: LineItem[];
  accounts: Account[];
  currency: string;
  onCurrencyChange: (v: string) => void;
  onChange: (items: LineItem[]) => void;
  onBack: () => void;
}

function newLineItem(): LineItem {
  return { id: Math.random().toString(36).slice(2), expenseAccountId: "", notes: "", amount: "", showReportingTags: false };
}

function ItemizedTable({ lineItems, accounts, currency, onCurrencyChange, onChange, onBack }: ItemizedTableProps) {
  function updateRow(id: string, field: keyof LineItem, value: unknown) {
    onChange(lineItems.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }
  function cloneRow(id: string) {
    const idx = lineItems.findIndex((r) => r.id === id);
    const cloned = { ...lineItems[idx], id: Math.random().toString(36).slice(2) };
    const next = [...lineItems];
    next.splice(idx + 1, 0, cloned);
    onChange(next);
  }
  function insertAfter(id: string) {
    const idx = lineItems.findIndex((r) => r.id === id);
    const next = [...lineItems];
    next.splice(idx + 1, 0, newLineItem());
    onChange(next);
  }
  function removeRow(id: string) {
    const next = lineItems.filter((r) => r.id !== id);
    onChange(next.length ? next : [newLineItem()]);
  }
  const total = lineItems.reduce((s, r) => s + (+r.amount || 0), 0);

  return (
    <div className="space-y-0">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-primary hover:underline mb-3"
      >
        <ArrowLeft className="h-3 w-3" /> Back to single expense view
      </button>

      {/* Currency row */}
      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm w-28 text-right shrink-0">Currency</Label>
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              { code: "INR", label: "INR – Indian Rupee" },
              { code: "USD", label: "USD – US Dollar" },
              { code: "EUR", label: "EUR – Euro" },
              { code: "GBP", label: "GBP – British Pound" },
            ].map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_140px_36px] bg-muted/40 border-b">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Expense Account</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Notes</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600 text-right">Amount</div>
          <div className="px-3 py-2" />
        </div>

        {lineItems.map((row) => (
          <div key={row.id} className="border-b last:border-b-0">
            {/* Main row */}
            <div className="grid grid-cols-[1fr_1fr_140px_36px] items-start">
              <div className="px-2 py-2 border-r">
                <select
                  className="w-full h-8 text-xs px-2 border rounded-md bg-background focus:ring-1 focus:ring-primary/30 focus:outline-none"
                  value={row.expenseAccountId}
                  onChange={(e) => updateRow(row.id, "expenseAccountId", e.target.value)}
                >
                  <option value="">Select an account</option>
                  {accounts.map((a) => (
                    <option key={a._id} value={a._id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div className="px-2 py-2 border-r">
                <Textarea
                  className="text-xs resize-none min-h-[60px] focus:ring-1 focus:ring-primary/30"
                  placeholder="Max. 500 characters"
                  maxLength={500}
                  value={row.notes}
                  onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                />
              </div>
              <div className="px-2 py-2 border-r">
                <Input
                  className="h-8 text-xs text-right"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                />
              </div>
              <div className="flex items-start justify-center pt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="text-xs" onClick={() => cloneRow(row.id)}>Clone</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => insertAfter(row.id)}>Insert New Row</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      onClick={() => updateRow(row.id, "showReportingTags", !row.showReportingTags)}
                    >
                      {row.showReportingTags ? "Hide" : "Show"} Additional Information
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs text-destructive focus:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Collapsible Reporting Tags */}
            <div
              className={cn(
                "border-t bg-muted/20 px-3 py-2 flex items-center gap-2 cursor-pointer select-none transition-colors hover:bg-muted/30",
              )}
              onClick={() => updateRow(row.id, "showReportingTags", !row.showReportingTags)}
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Reporting Tags</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform ml-1",
                  row.showReportingTags && "rotate-180",
                )}
              />
              {row.showReportingTags && (
                <div className="ml-4 text-xs text-muted-foreground italic" onClick={(e) => e.stopPropagation()}>
                  No reporting tags configured
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Row + Total */}
      <div className="flex items-center justify-between pt-3">
        <button
          type="button"
          onClick={() => onChange([...lineItems, newLineItem()])}
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
        >
          <Plus className="h-3.5 w-3.5 p-0.5 rounded-full bg-primary text-primary-foreground" />
          Add New Row
        </button>
        <div className="flex items-center gap-8 pr-14">
          <span className="text-sm font-semibold">Expense Total ({currency === "INR" ? "₹" : currency})</span>
          <span className="text-sm font-semibold">{total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Account grouped select ─────────────────────────────────────────────────

/** Group accounts by accountType label for display */
function groupAccounts(accounts: Account[]) {
  const groups: Record<string, Account[]> = {};
  for (const acc of accounts) {
    const key = acc.accountType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(acc);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

interface AccountSelectProps {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function AccountSelect({ accounts, value, onChange, placeholder = "Select an account" }: AccountSelectProps) {
  const grouped = groupAccounts(accounts);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {grouped.map(([type, accs]) => (
          <SelectGroup key={type}>
            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2">
              {type}
            </SelectLabel>
            {accs.map((a) => (
              <SelectItem key={a._id} value={a._id} className="text-xs">
                {a.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Contact combobox (Vendor / Customer Name) ────────────────────────────

interface ContactComboboxProps {
  contacts: Contact[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Label shown for the "create new" footer action */
  newLabel?: string;
  /** Called when the create-new footer button is clicked */
  onNew?: () => void;
}

function ContactCombobox({ contacts, value, onChange, placeholder = "Select", newLabel, onNew }: ContactComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.displayName || "").toLowerCase().includes(q) ||
      (c.companyName || "").toLowerCase().includes(q)
    );
  });

  const selected = contacts.find((c) => c._id === value);

  return (
    <div className="relative">
      <button
        type="button"
        className="w-full h-9 border rounded-md text-sm px-3 flex items-center justify-between bg-background hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground text-sm"}>
          {selected ? (selected.displayName || selected.companyName) : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
          <div className="p-2 border-b">
            <div className="flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="text-xs outline-none bg-transparent w-full"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No results found</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
                  onClick={() => { onChange(c._id); setOpen(false); setSearch(""); }}
                >
                  {c.displayName || c.companyName}
                </button>
              ))
            )}
          </div>
          {newLabel && onNew && (
            <div className="border-t">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs text-primary font-medium flex items-center gap-1.5 hover:bg-muted/40"
                onClick={() => { onNew(); setOpen(false); }}
              >
                <Plus className="h-3 w-3" /> {newLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mileage types ───────────────────────────────────────────────────────────

interface MileageRate {
  startDate: string;
  rate: string;
}

interface MileagePrefs {
  associateEmployees: boolean;
  defaultCategoryId: string;
  defaultUnit: "Km" | "Mile";
  rates: MileageRate[];
}

const DEFAULT_PREFS: MileagePrefs = {
  associateEmployees: false,
  defaultCategoryId: "",
  defaultUnit: "Km",
  rates: [{ startDate: "", rate: "" }],
};

// ─── Mileage Preferences Dialog ──────────────────────────────────────────────

interface MileagePreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  prefs: MileagePrefs;
  onSave: (p: MileagePrefs) => void;
  expenseAccounts: Account[];
}

function MileagePreferencesDialog({ open, onClose, prefs, onSave, expenseAccounts }: MileagePreferencesDialogProps) {
  const [local, setLocal] = useState<MileagePrefs>({ ...prefs, rates: prefs.rates.map((r) => ({ ...r })) });

  // Sync when prefs change externally (re-open)
  useEffect(() => {
    setLocal({ ...prefs, rates: prefs.rates.map((r) => ({ ...r })) });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateRate(idx: number, field: keyof MileageRate, value: string) {
    setLocal((prev) => {
      const rates = prev.rates.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
      return { ...prev, rates };
    });
  }

  function addRate() {
    setLocal((prev) => ({ ...prev, rates: [...prev.rates, { startDate: "", rate: "" }] }));
  }

  function removeRate(idx: number) {
    setLocal((prev) => ({ ...prev, rates: prev.rates.filter((_, i) => i !== idx) }));
  }

  function handleSave() {
    onSave(local);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Mileage Preferences
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Associate employees */}
          <div className="flex items-center gap-3">
            <Checkbox
              id="associate-employees"
              checked={local.associateEmployees}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, associateEmployees: !!v }))}
            />
            <Label htmlFor="associate-employees" className="font-normal cursor-pointer">
              Associate employees when recording mileage
            </Label>
          </div>

          <Separator />

          {/* Default Mileage Category */}
          <div className="grid grid-cols-[180px_1fr] gap-3 items-center">
            <Label className="text-sm text-right">Default Mileage Category</Label>
            <Select
              value={local.defaultCategoryId}
              onValueChange={(v) => setLocal((p) => ({ ...p, defaultCategoryId: v }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a._id} value={a._id} className="text-sm">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default Unit */}
          <div className="grid grid-cols-[180px_1fr] gap-3 items-center">
            <Label className="text-sm text-right">Default Unit</Label>
            <div className="flex gap-6">
              {(["Km", "Mile"] as const).map((u) => (
                <label key={u} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="accent-primary"
                    checked={local.defaultUnit === u}
                    onChange={() => setLocal((p) => ({ ...p, defaultUnit: u }))}
                  />
                  <span className="text-sm">{u === "Km" ? "Kilometer (Km)" : "Mile"}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Mileage Rates table */}
          <div>
            <Label className="text-sm font-medium block mb-2">Mileage Rates</Label>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium text-xs text-muted-foreground">Start Date</th>
                    <th className="text-left p-2 font-medium text-xs text-muted-foreground">Rate (INR / unit)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {local.rates.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1.5">
                        <Input
                          type="date"
                          className="h-7 text-xs"
                          value={r.startDate}
                          onChange={(e) => updateRate(idx, "startDate", e.target.value)}
                        />
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-7 text-xs"
                          placeholder="0.00"
                          value={r.rate}
                          onChange={(e) => updateRate(idx, "rate", e.target.value)}
                        />
                      </td>
                      <td className="p-1 text-center">
                        {local.rates.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRate(idx)}
                            className="text-destructive hover:text-destructive/70 p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addRate}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Rate
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewExpensePage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [activeTab, setActiveTab] = useState<ActiveTab>("expense");
  const [saving, setSaving] = useState(false);

  // Mileage preferences state (mandatory before first record-mileage)
  const [milPrefs, setMilPrefs] = useState<MileagePrefs>(DEFAULT_PREFS);
  const [milPrefsSet, setMilPrefsSet] = useState(false); // true once saved at least once
  const [milPrefsOpen, setMilPrefsOpen] = useState(false);

  function handleSaveMilPrefs(p: MileagePrefs) {
    setMilPrefs(p);
    setMilPrefsSet(true);
    // Apply default unit to mileage form
    setMilForm((prev) => ({ ...prev, mileageUnit: p.defaultUnit }));
  }

  /** Get the active mileage rate (per unit) for a given date */
  function getActiveRate(date: string): number {
    if (!milPrefs.rates.length) return 0;
    const d = date || new Date().toISOString().slice(0, 10);
    // rates without a date are default (fallback)
    const withDate = milPrefs.rates
      .filter((r) => r.startDate && r.startDate <= d && +r.rate > 0)
      .sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    if (withDate.length) return +withDate[0].rate;
    const fallback = milPrefs.rates.find((r) => !r.startDate && +r.rate > 0);
    return fallback ? +fallback.rate : 0;
  }

  // Dropdown data
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [paidThroughAccounts, setPaidThroughAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);

  // ── Record Expense form state ──
  const today = new Date().toISOString().slice(0, 10);
  const [isItemized, setIsItemized] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [expForm, setExpForm] = useState({
    date: today,
    expenseAccountId: "",
    currency: "INR",
    amount: "",
    paidThroughAccountId: "",
    vendorId: "",
    invoiceNumber: "",
    notes: "",
    customerId: "",
    isBillable: false,
  });

  // ── Record Mileage form state ──
  const [milForm, setMilForm] = useState({
    date: today,
    employeeId: "",
    mileageCalcMethod: "DistanceTravelled" as "DistanceTravelled" | "OdometerReading",
    distance: "",
    mileageUnit: "Km" as "Km" | "Mile",
    paidThroughAccountId: "",
    vendorId: "",
    invoiceNumber: "",
    notes: "",
    customerId: "",
  });

  /** Computed mileage amount — placed after milForm declaration */
  const mileageAmount = milForm.distance && +milForm.distance > 0
    ? +(+milForm.distance * getActiveRate(milForm.date)).toFixed(2)
    : 0;

  // ── Bulk rows state ──
  const emptyBulkRow = () => ({
    date: today,
    expenseAccountId: "",
    currency: "INR",
    amount: "",
    paidThroughAccountId: "",
    vendorId: "",
    customerId: "",
    isBillable: false,
  });
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 10 }, emptyBulkRow));

  // ── Auth guards ──
  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const loadData = useCallback(async () => {
    try {
      const [expAcc, paidAcc, custs, vends] = await Promise.all([
        accountApi.list({ rootType: EXPENSE_ACCOUNT_ROOT_TYPES, excludeGroups: false }),
        accountApi.list({ rootType: "Asset,Liability,Equity" }),
        contactApi.list({ type: "Customer", page: 1, limit: 200 }),
        contactApi.list({ type: "Vendor", page: 1, limit: 200 }),
      ]);
      setExpenseAccounts(expAcc.data ?? []);
      // Filter paid-through to typical account types
      setPaidThroughAccounts(
        (paidAcc.data ?? []).filter((a) =>
          ["Cash", "Bank", "Other Current Asset", "Fixed Asset", "Other Current Liability", "Equity"].includes(a.accountType),
        ),
      );
      setCustomers(custs.data ?? []);
      setVendors(vends.data ?? []);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) loadData();
  }, [firebaseUser, loading, activeOrganization?._id, loadData]);

  function setExp(field: string, value: unknown) {
    setExpForm((prev) => ({ ...prev, [field]: value }));
  }
  function setMil(field: string, value: unknown) {
    setMilForm((prev) => ({ ...prev, [field]: value }));
  }
  function setBulkRow(idx: number, field: string, value: unknown) {
    setBulkRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  // ── Save Regular Expense ──
  async function handleSaveExpense(andNew = false) {
    if (!expForm.date) { toast.error("Date is required"); return; }
    if (isItemized) {
      const filled = lineItems.filter((r) => r.amount && +r.amount > 0);
      if (!filled.length) { toast.error("Add at least one line item with an amount"); return; }
    } else if (!expForm.amount || +expForm.amount <= 0) {
      toast.error("Amount is required"); return;
    }
    setSaving(true);
    try {
      const payload: CreateExpenseInput = isItemized
        ? {
            expenseType: "Regular",
            date: expForm.date,
            amount: lineItems.reduce((s, r) => s + (+r.amount || 0), 0),
            currency: expForm.currency,
            isItemized: true,
            lineItems: lineItems
              .filter((r) => r.amount && +r.amount > 0)
              .map((r) => ({ expenseAccountId: r.expenseAccountId || null, notes: r.notes, amount: +r.amount })),
            paidThroughAccountId: expForm.paidThroughAccountId || null,
            vendorId: expForm.vendorId || null,
            invoiceNumber: expForm.invoiceNumber,
            notes: expForm.notes,
            customerId: expForm.customerId || null,
            isBillable: expForm.isBillable,
            status: "Draft",
          }
        : {
            expenseType: "Regular",
            date: expForm.date,
            amount: +expForm.amount,
            currency: expForm.currency,
            expenseAccountId: expForm.expenseAccountId || null,
            paidThroughAccountId: expForm.paidThroughAccountId || null,
            vendorId: expForm.vendorId || null,
            invoiceNumber: expForm.invoiceNumber,
            notes: expForm.notes,
            customerId: expForm.customerId || null,
            isBillable: expForm.isBillable,
            status: "Draft",
          };
      await expenseApi.create(payload);
      toast.success("Expense recorded");
      if (andNew) {
        setExpForm({ date: today, expenseAccountId: "", currency: "INR", amount: "", paidThroughAccountId: "", vendorId: "", invoiceNumber: "", notes: "", customerId: "", isBillable: false });
        setIsItemized(false);
        setLineItems([newLineItem()]);
      } else {
        router.push("/purchases/expenses");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  // ── Save Mileage Expense ──
  async function handleSaveMileage(andNew = false) {
    if (!milPrefsSet) { toast.error("Please set your mileage preferences first"); setMilPrefsOpen(true); return; }
    if (!milForm.date) { toast.error("Date is required"); return; }
    if (!milForm.distance || +milForm.distance <= 0) { toast.error("Distance is required"); return; }
    if (mileageAmount <= 0) { toast.error("No mileage rate set for the selected date — check Mileage Preferences"); return; }
    setSaving(true);
    try {
      const payload: CreateExpenseInput = {
        expenseType: "Mileage",
        date: milForm.date,
        amount: mileageAmount,
        mileageCalcMethod: milForm.mileageCalcMethod,
        distance: +milForm.distance,
        mileageUnit: milForm.mileageUnit,
        mileageRate: getActiveRate(milForm.date),
        expenseAccountId: milPrefs.defaultCategoryId || null,
        paidThroughAccountId: milForm.paidThroughAccountId || null,
        vendorId: milForm.vendorId || null,
        invoiceNumber: milForm.invoiceNumber,
        notes: milForm.notes,
        customerId: milForm.customerId || null,
        status: "Draft",
      };
      await expenseApi.create(payload);
      toast.success("Mileage expense recorded");
      if (andNew) {
        setMilForm({ date: today, employeeId: "", mileageCalcMethod: "DistanceTravelled", distance: "", mileageUnit: milPrefs.defaultUnit, paidThroughAccountId: "", vendorId: "", invoiceNumber: "", notes: "", customerId: "" });
      } else {
        router.push("/purchases/expenses");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save mileage expense");
    } finally {
      setSaving(false);
    }
  }

  // ── Save Bulk Expenses ──
  async function handleSaveBulk() {
    const filled = bulkRows.filter((r) => r.date && r.amount && +r.amount > 0);
    if (filled.length === 0) { toast.error("Please fill at least one row"); return; }
    setSaving(true);
    try {
      const expenses: CreateExpenseInput[] = filled.map((r) => ({
        expenseType: "Regular",
        date: r.date,
        amount: +r.amount,
        currency: r.currency,
        expenseAccountId: r.expenseAccountId || null,
        paidThroughAccountId: r.paidThroughAccountId || null,
        vendorId: r.vendorId || null,
        customerId: r.customerId || null,
        isBillable: r.isBillable,
        status: "Draft",
      }));
      await expenseApi.bulkCreate(expenses);
      toast.success(`${filled.length} expenses recorded`);
      router.push("/purchases/expenses");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save expenses");
    } finally {
      setSaving(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: "expense", label: "Record Expense" },
    { id: "mileage", label: "Record Mileage" },
    { id: "bulk", label: "Bulk Add Expenses" },
  ];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader breadcrumb={
          <span className="text-sm text-muted-foreground">
            Purchases <span className="mx-1">/</span>
            <a href="/purchases/expenses" className="hover:text-foreground transition-colors">Expenses</a>
            <span className="mx-1">/</span>
            <span className="font-medium text-foreground">New</span>
          </span>
        } />

        {/* Tab bar */}
        <div className="border-b bg-background shrink-0">
          <div className="flex gap-0 px-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === "mileage" && !milPrefsSet) {
                    setMilPrefsOpen(true);
                    // Still switch to the tab so they can see the form after saving prefs
                    setActiveTab(t.id);
                  } else {
                    setActiveTab(t.id);
                  }
                }}
                className={cn(
                  "text-sm px-4 py-3 border-b-2 transition-colors",
                  activeTab === t.id
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">

          {/* ─── Record Expense ─────────────────────────────────── */}
          {activeTab === "expense" && (
            <div className="flex gap-0 min-h-full">
              {/* Left: form */}
              <div className="flex-1 p-8 max-w-2xl">
                <div className="space-y-5">

                  {/* Date */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">
                      Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      className="h-9"
                      value={expForm.date}
                      onChange={(e) => setExp("date", e.target.value)}
                    />
                  </div>

                  {/* Expense Account / Itemized toggle */}
                  {!isItemized ? (
                    <>
                      <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                        <Label className="text-sm text-right pt-2">
                          Expense Account <span className="text-destructive">*</span>
                        </Label>
                        <div>
                          <AccountSelect
                            accounts={expenseAccounts}
                            value={expForm.expenseAccountId}
                            onChange={(v) => setExp("expenseAccountId", v)}
                          />
                          <button
                            type="button"
                            className="text-xs text-primary mt-1.5 flex items-center gap-1 hover:underline"
                            onClick={() => setIsItemized(true)}
                          >
                            <Plus className="h-3 w-3" /> Itemize
                          </button>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                        <Label className="text-sm text-right">
                          Amount <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex gap-2">
                          <Select value={expForm.currency} onValueChange={(v) => setExp("currency", v)}>
                            <SelectTrigger className="h-9 w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["INR", "USD", "EUR", "GBP"].map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="h-9 flex-1"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={expForm.amount}
                            onChange={(e) => setExp("amount", e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Itemized table inlined here, spanning the full left area */
                    <div className="col-span-full -mx-8 px-8 py-4 bg-muted/10 border-y">
                      <ItemizedTable
                        lineItems={lineItems}
                        accounts={expenseAccounts}
                        currency={expForm.currency}
                        onCurrencyChange={(v) => setExp("currency", v)}
                        onChange={setLineItems}
                        onBack={() => setIsItemized(false)}
                      />
                    </div>
                  )}

                  {/* Paid Through */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">
                      Paid Through <span className="text-destructive">*</span>
                    </Label>
                    <AccountSelect
                      accounts={paidThroughAccounts}
                      value={expForm.paidThroughAccountId}
                      onChange={(v) => setExp("paidThroughAccountId", v)}
                      placeholder="Select an account"
                    />
                  </div>

                  {/* Vendor */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Vendor</Label>
                    <ContactCombobox
                      contacts={vendors}
                      value={expForm.vendorId}
                      onChange={(v) => setExp("vendorId", v)}
                      placeholder="Select a vendor"
                      newLabel="+ New Vendor"
                      onNew={() => router.push("/purchases/vendors/new")}
                    />
                  </div>

                  {/* Invoice# */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Invoice #</Label>
                    <Input
                      className="h-9"
                      value={expForm.invoiceNumber}
                      onChange={(e) => setExp("invoiceNumber", e.target.value)}
                    />
                  </div>

                  {/* Notes */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                    <Label className="text-sm text-right pt-2">Notes</Label>
                    <Textarea
                      className="resize-none text-sm"
                      rows={3}
                      placeholder="Max. 500 characters"
                      maxLength={500}
                      value={expForm.notes}
                      onChange={(e) => setExp("notes", e.target.value)}
                    />
                  </div>

                  <Separator />

                  {/* Customer Name */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Customer Name</Label>
                    <ContactCombobox
                      contacts={customers}
                      value={expForm.customerId}
                      onChange={(v) => setExp("customerId", v)}
                      placeholder="Select a customer"
                      newLabel="+ New Customer"
                      onNew={() => router.push("/sales/customers/new")}
                    />
                  </div>

                  {/* Billable */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <div />
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={expForm.isBillable}
                        onCheckedChange={(v) => setExp("isBillable", v === true)}
                      />
                      <span className="text-sm">Billable to Customer</span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button size="sm" onClick={() => handleSaveExpense(false)} disabled={saving}>
                      {saving ? "Saving…" : "Save (Alt+S)"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleSaveExpense(true)} disabled={saving}>
                      Save and New (Alt+N)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push("/purchases/expenses")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right: receipt upload */}
              <div className="w-72 border-l bg-muted/10 p-6 flex flex-col items-center justify-center gap-3 shrink-0">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-8 w-8 text-primary/60" />
                </div>
                <p className="text-sm font-medium text-center">Drag or Drop your Receipts</p>
                <p className="text-xs text-muted-foreground text-center">Maximum file size allowed is 10MB</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="h-3.5 w-3.5" /> Upload your Files
                </Button>
              </div>
            </div>
          )}

          {/* ─── Record Mileage ──────────────────────────────────── */}
          {activeTab === "mileage" && (
            <div className="flex gap-0 min-h-full">
              <div className="flex-1 p-8 max-w-2xl">

                {/* Preferences not set — warning banner */}
                {!milPrefsSet && (
                  <div className="mb-6 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-orange-800">Mileage preferences required</p>
                      <p className="text-xs text-orange-600 mt-0.5">
                        Set your mileage rate and default unit before recording.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-100 gap-1.5 shrink-0 ml-4"
                      onClick={() => setMilPrefsOpen(true)}
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Set Preferences
                    </Button>
                  </div>
                )}

                <div className="space-y-5">

                  {/* Preferences summary bar (when already set) */}
                  {milPrefsSet && (
                    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                      <div className="flex items-center gap-5 text-xs text-muted-foreground">
                        <span>Unit: <strong className="text-foreground">{milPrefs.defaultUnit}</strong></span>
                        <span>
                          Active rate:{" "}
                          <strong className="text-foreground">
                            INR {getActiveRate(milForm.date).toFixed(2)}/{milPrefs.defaultUnit}
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => setMilPrefsOpen(true)}
                      >
                        <Settings2 className="h-3 w-3" /> Mileage Preferences
                      </button>
                    </div>
                  )}

                  {/* Date */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Date <span className="text-destructive">*</span></Label>
                    <Input type="date" className="h-9" value={milForm.date} onChange={(e) => setMil("date", e.target.value)} />
                  </div>

                  {/* Employee — only shown when associateEmployees pref enabled */}
                  {milPrefs.associateEmployees && (
                    <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                      <Label className="text-sm text-right">Employee</Label>
                      <Select value={milForm.employeeId} onValueChange={(v) => setMil("employeeId", v)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Calculate mileage using */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">
                      Calculate mileage using <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex gap-6">
                      {(["DistanceTravelled", "OdometerReading"] as const).map((m) => (
                        <label key={m} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            className="accent-primary"
                            checked={milForm.mileageCalcMethod === m}
                            onChange={() => setMil("mileageCalcMethod", m)}
                          />
                          <span className="text-sm">
                            {m === "DistanceTravelled" ? "Distance travelled" : "Odometer reading"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Distance */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Distance <span className="text-destructive">*</span></Label>
                    <div className="flex gap-2">
                      <Input
                        className="h-9 flex-1"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="0"
                        value={milForm.distance}
                        onChange={(e) => setMil("distance", e.target.value)}
                      />
                      <Select value={milForm.mileageUnit} onValueChange={(v) => setMil("mileageUnit", v)}>
                        <SelectTrigger className="h-9 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Km">Kilometer(s)</SelectItem>
                          <SelectItem value="Mile">Mile(s)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Amount (auto-calculated, read-only) */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Amount <span className="text-destructive">*</span></Label>
                    <div className={cn(
                      "h-9 border rounded-md px-3 flex items-center gap-2 text-sm",
                      mileageAmount > 0 ? "bg-background" : "bg-muted/30 text-muted-foreground",
                    )}>
                      <span className="text-muted-foreground text-xs">INR</span>
                      <span className="flex-1 font-medium">
                        {mileageAmount > 0 ? mileageAmount.toFixed(2) : "0.00"}
                      </span>
                      {milForm.distance && +milForm.distance > 0 && milPrefsSet && (
                        <span className="text-[10px] text-muted-foreground">
                          {milForm.distance} {milForm.mileageUnit} × {getActiveRate(milForm.date).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Paid Through */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Paid Through <span className="text-destructive">*</span></Label>
                    <AccountSelect
                      accounts={paidThroughAccounts}
                      value={milForm.paidThroughAccountId}
                      onChange={(v) => setMil("paidThroughAccountId", v)}
                    />
                  </div>

                  {/* Vendor */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Vendor</Label>
                    <ContactCombobox
                      contacts={vendors}
                      value={milForm.vendorId}
                      onChange={(v) => setMil("vendorId", v)}
                      placeholder="Select a vendor"
                      newLabel="+ New Vendor"
                      onNew={() => router.push("/purchases/vendors/new")}
                    />
                  </div>

                  {/* Invoice# */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Invoice #</Label>
                    <Input className="h-9" value={milForm.invoiceNumber} onChange={(e) => setMil("invoiceNumber", e.target.value)} />
                  </div>

                  {/* Notes */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                    <Label className="text-sm text-right pt-2">Notes</Label>
                    <Textarea
                      className="resize-none text-sm" rows={3}
                      placeholder="Max. 500 characters" maxLength={500}
                      value={milForm.notes} onChange={(e) => setMil("notes", e.target.value)}
                    />
                  </div>

                  <Separator />

                  {/* Customer Name */}
                  <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                    <Label className="text-sm text-right">Customer Name</Label>
                    <ContactCombobox
                      contacts={customers}
                      value={milForm.customerId}
                      onChange={(v) => setMil("customerId", v)}
                      placeholder="Select a customer"
                      newLabel="+ New Customer"
                      onNew={() => router.push("/sales/customers/new")}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button size="sm" onClick={() => handleSaveMileage(false)} disabled={saving}>
                      {saving ? "Saving…" : "Save (Alt+S)"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleSaveMileage(true)} disabled={saving}>
                      Save and New (Alt+N)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => router.push("/purchases/expenses")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right: receipt upload */}
              <div className="w-72 border-l bg-muted/10 p-6 flex flex-col items-center justify-center gap-3 shrink-0">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-8 w-8 text-primary/60" />
                </div>
                <p className="text-sm font-medium text-center">Drag or Drop your Receipts</p>
                <p className="text-xs text-muted-foreground text-center">Maximum file size allowed is 10MB</p>
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="h-3.5 w-3.5" /> Upload your Files
                </Button>
              </div>
            </div>
          )}

          {/* Mileage Preferences Dialog (mandatory first-time + re-editable) */}
          <MileagePreferencesDialog
            open={milPrefsOpen}
            onClose={() => setMilPrefsOpen(false)}
            prefs={milPrefs}
            onSave={handleSaveMilPrefs}
            expenseAccounts={expenseAccounts}
          />

          {/* ─── Bulk Add Expenses ───────────────────────────────── */}
          {activeTab === "bulk" && (
            <div className="p-4 overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/40">
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px] w-28">
                      Date <span className="text-destructive">*</span>
                    </th>
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">
                      Expense Account <span className="text-destructive">*</span>
                    </th>
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px] w-36">
                      Amount <span className="text-destructive">*</span>
                    </th>
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">
                      Paid Through <span className="text-destructive">*</span>
                    </th>
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">Vendor</th>
                    <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">Customer Name</th>
                    <th className="border px-2 py-2 text-center font-semibold uppercase tracking-wide text-[10px] w-16">Billable</th>
                    <th className="border px-2 py-2 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="border px-1 py-1">
                        <input
                          type="date"
                          className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          value={row.date}
                          onChange={(e) => setBulkRow(idx, "date", e.target.value)}
                        />
                      </td>
                      <td className="border px-1 py-1">
                        <select
                          className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          value={row.expenseAccountId}
                          onChange={(e) => setBulkRow(idx, "expenseAccountId", e.target.value)}
                        >
                          <option value="">Select an account</option>
                          {expenseAccounts.map((a) => (
                            <option key={a._id} value={a._id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-1 py-1">
                        <div className="flex gap-1 items-center">
                          <span className="text-muted-foreground">INR</span>
                          <input
                            type="number"
                            className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(e) => setBulkRow(idx, "amount", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="border px-1 py-1">
                        <select
                          className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          value={row.paidThroughAccountId}
                          onChange={(e) => setBulkRow(idx, "paidThroughAccountId", e.target.value)}
                        >
                          <option value="">Select an account</option>
                          {paidThroughAccounts.map((a) => (
                            <option key={a._id} value={a._id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-1 py-1">
                        <select
                          className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          value={row.vendorId}
                          onChange={(e) => setBulkRow(idx, "vendorId", e.target.value)}
                        >
                          <option value="">—</option>
                          {vendors.map((v) => (
                            <option key={v._id} value={v._id}>{v.displayName || v.companyName}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-1 py-1">
                        <select
                          className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          value={row.customerId}
                          onChange={(e) => setBulkRow(idx, "customerId", e.target.value)}
                        >
                          <option value="">—</option>
                          {customers.map((c) => (
                            <option key={c._id} value={c._id}>{c.displayName || c.companyName}</option>
                          ))}
                        </select>
                      </td>
                      <td className="border px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={row.isBillable}
                          onChange={(e) => setBulkRow(idx, "isBillable", e.target.checked)}
                        />
                      </td>
                      <td className="border px-1 py-1 text-center">
                        <button
                          onClick={() => setBulkRows((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                className="mt-3 text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                onClick={() => setBulkRows((prev) => [...prev, ...Array.from({ length: 5 }, emptyBulkRow)])}
              >
                <Plus className="h-3 w-3" /> Add More Expenses
              </button>

              <div className="flex gap-3 mt-6">
                <Button size="sm" onClick={handleSaveBulk} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push("/purchases/expenses")}>Cancel</Button>
              </div>
            </div>
          )}
        </div>


      </SidebarInset>
    </SidebarProvider>
  );
}
