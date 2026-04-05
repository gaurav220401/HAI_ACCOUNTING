"use client";

/**
 * Shared Expense Form
 * Used for both creating (mode="create") and editing (mode="edit") expenses.
 * In edit mode the form is pre-filled with existing expense data and the
 * submit button says "Update". All 3 tabs visible in both modes.
 */

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Upload, X, ChevronDown, Search, MoreVertical, Tag, ArrowLeft, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
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
import { expenseApi, type CreateExpenseInput, type Expense } from "@/lib/api/expenses";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ActiveTab = "expense" | "mileage" | "bulk";

interface LineItem {
  id: string;
  expenseAccountId: string;
  notes: string;
  amount: string;
  showReportingTags: boolean;
}

interface MileageRate { startDate: string; rate: string }

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function newLineItem(): LineItem {
  return { id: Math.random().toString(36).slice(2), expenseAccountId: "", notes: "", amount: "", showReportingTags: false };
}

function extractId(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) return (field as any)._id ?? "";
  return String(field);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function groupAccounts(accounts: Account[]) {
  const groups: Record<string, Account[]> = {};
  for (const a of accounts) {
    if (!groups[a.accountType]) groups[a.accountType] = [];
    groups[a.accountType].push(a);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function AccountSelect({
  accounts, value, onChange, placeholder = "Select an account",
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const grouped = groupAccounts(accounts);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {grouped.map(([type, accs]) => (
          <SelectGroup key={type}>
            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2">
              {type}
            </SelectLabel>
            {accs.map((a) => (
              <SelectItem key={a._id} value={a._id} className="text-xs">{a.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactCombobox({
  contacts, value, onChange, placeholder = "Select", newLabel, onNew,
}: {
  contacts: Contact[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  newLabel?: string;
  onNew?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (c.displayName || "").toLowerCase().includes(q) || (c.companyName || "").toLowerCase().includes(q);
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
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
            >
              — None —
            </button>
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

// ─── Itemized table ──────────────────────────────────────────────────────────

function ItemizedTable({
  lineItems, accounts, currency, onCurrencyChange, onChange, onBack,
}: {
  lineItems: LineItem[];
  accounts: Account[];
  currency: string;
  onCurrencyChange: (v: string) => void;
  onChange: (items: LineItem[]) => void;
  onBack: () => void;
}) {
  function updateRow(id: string, field: keyof LineItem, value: unknown) {
    onChange(lineItems.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }
  function cloneRow(id: string) {
    const idx = lineItems.findIndex((r) => r.id === id);
    const cloned = { ...lineItems[idx], id: Math.random().toString(36).slice(2) };
    const next = [...lineItems]; next.splice(idx + 1, 0, cloned);
    onChange(next);
  }
  function insertAfter(id: string) {
    const idx = lineItems.findIndex((r) => r.id === id);
    const next = [...lineItems]; next.splice(idx + 1, 0, newLineItem());
    onChange(next);
  }
  function removeRow(id: string) {
    const next = lineItems.filter((r) => r.id !== id);
    onChange(next.length ? next : [newLineItem()]);
  }
  const total = lineItems.reduce((s, r) => s + (+r.amount || 0), 0);

  return (
    <div className="space-y-0">
      <button type="button" onClick={onBack}
        className="flex items-center gap-1 text-xs text-primary hover:underline mb-3">
        <ArrowLeft className="h-3 w-3" /> Back to single expense view
      </button>

      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm w-28 text-right shrink-0">Currency</Label>
        <Select value={currency} onValueChange={onCurrencyChange}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[{ code: "INR", label: "INR – Indian Rupee" }, { code: "USD", label: "USD – US Dollar" },
              { code: "EUR", label: "EUR – Euro" }, { code: "GBP", label: "GBP – British Pound" }].map((c) => (
              <SelectItem key={c.code} value={c.code} className="text-xs">{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_140px_36px] bg-muted/40 border-b">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Expense Account</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600">Notes</div>
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-orange-600 text-right">Amount</div>
          <div className="px-3 py-2" />
        </div>

        {lineItems.map((row) => (
          <div key={row.id} className="border-b last:border-b-0">
            <div className="grid grid-cols-[1fr_1fr_140px_36px] items-start">
              <div className="px-2 py-2 border-r">
                <select
                  className="w-full h-8 text-xs px-2 border rounded-md bg-background focus:ring-1 focus:ring-primary/30 focus:outline-none"
                  value={row.expenseAccountId}
                  onChange={(e) => updateRow(row.id, "expenseAccountId", e.target.value)}
                >
                  <option value="">Select an account</option>
                  {accounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
              </div>
              <div className="px-2 py-2 border-r">
                <Textarea className="text-xs resize-none min-h-[60px]" placeholder="Max. 500 characters"
                  maxLength={500} value={row.notes} onChange={(e) => updateRow(row.id, "notes", e.target.value)} />
              </div>
              <div className="px-2 py-2 border-r">
                <Input className="h-8 text-xs text-right" type="number" min="0" step="0.01"
                  placeholder="0.00" value={row.amount} onChange={(e) => updateRow(row.id, "amount", e.target.value)} />
              </div>
              <div className="flex items-start justify-center pt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="text-xs" onClick={() => cloneRow(row.id)}>Clone</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => insertAfter(row.id)}>Insert New Row</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs"
                      onClick={() => updateRow(row.id, "showReportingTags", !row.showReportingTags)}>
                      {row.showReportingTags ? "Hide" : "Show"} Additional Information
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs text-destructive focus:text-destructive"
                      onClick={() => removeRow(row.id)}>Remove</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div
              className="border-t bg-muted/20 px-3 py-2 flex items-center gap-2 cursor-pointer select-none hover:bg-muted/30"
              onClick={() => updateRow(row.id, "showReportingTags", !row.showReportingTags)}
            >
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Reporting Tags</span>
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground ml-1 transition-transform", row.showReportingTags && "rotate-180")} />
              {row.showReportingTags && (
                <div className="ml-4 text-xs text-muted-foreground italic" onClick={(e) => e.stopPropagation()}>
                  No reporting tags configured
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3">
        <button type="button" onClick={() => onChange([...lineItems, newLineItem()])}
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
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

// ─── Mileage Preferences Dialog ──────────────────────────────────────────────

function MileagePreferencesDialog({ open, onClose, prefs, onSave, expenseAccounts }: {
  open: boolean;
  onClose: () => void;
  prefs: MileagePrefs;
  onSave: (p: MileagePrefs) => void;
  expenseAccounts: Account[];
}) {
  const [local, setLocal] = useState<MileagePrefs>({ ...prefs, rates: prefs.rates.map((r) => ({ ...r })) });

  useEffect(() => {
    setLocal({ ...prefs, rates: prefs.rates.map((r) => ({ ...r })) });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateRate(idx: number, field: keyof MileageRate, value: string) {
    setLocal((prev) => ({ ...prev, rates: prev.rates.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  }
  function addRate() {
    setLocal((prev) => ({ ...prev, rates: [...prev.rates, { startDate: "", rate: "" }] }));
  }
  function removeRate(idx: number) {
    setLocal((prev) => ({ ...prev, rates: prev.rates.filter((_, i) => i !== idx) }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary text-lg font-semibold">Set your mileage preferences</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="flex items-center gap-3">
            <Checkbox id="assoc-emp" checked={local.associateEmployees}
              onCheckedChange={(v) => setLocal((p) => ({ ...p, associateEmployees: !!v }))} />
            <Label htmlFor="assoc-emp" className="font-normal cursor-pointer text-sm">Associate employees to expenses</Label>
          </div>
          <Separator />
          <p className="text-sm font-semibold">Mileage Preference</p>

          <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
            <Label className="text-sm">Default Mileage Category</Label>
            <Select value={local.defaultCategoryId} onValueChange={(v) => setLocal((p) => ({ ...p, defaultCategoryId: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {expenseAccounts.map((a) => (
                  <SelectItem key={a._id} value={a._id} className="text-sm">{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
            <Label className="text-sm">Default Unit</Label>
            <div className="flex gap-6">
              {(["Km", "Mile"] as const).map((u) => (
                <label key={u} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" className="accent-primary" checked={local.defaultUnit === u}
                    onChange={() => setLocal((p) => ({ ...p, defaultUnit: u }))} />
                  <span className="text-sm">{u}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-foreground mb-1">Mileage Rates</p>
            <p className="text-xs text-muted-foreground mb-3">
              Any mileage expense recorded on or after the start date will have the corresponding mileage rate.
              You can create a default rate (without a date) which applies before the initial start date.
            </p>
            <table className="w-full text-sm border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start Date</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mileage Rate</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {local.rates.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1.5">
                      <Input type="date" className="h-8 text-sm" value={r.startDate}
                        onChange={(e) => updateRate(idx, "startDate", e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center border rounded-md overflow-hidden h-8">
                        <span className="px-2 text-xs text-muted-foreground bg-muted/40 border-r h-full flex items-center">INR</span>
                        <input type="number" min="0" step="0.01" placeholder="0.00"
                          className="flex-1 h-full px-2 text-sm outline-none bg-background"
                          value={r.rate} onChange={(e) => updateRate(idx, "rate", e.target.value)} />
                      </div>
                    </td>
                    <td className="px-1 text-center">
                      {local.rates.length > 1 && (
                        <button type="button" onClick={() => removeRate(idx)}
                          className="text-destructive hover:text-destructive/70 p-0.5">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addRate}
              className="mt-3 flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs">+</span>
              Add Mileage Rate
            </button>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(local); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main shared form ─────────────────────────────────────────────────────────

export interface ExpenseFormProps {
  mode: "create" | "edit";
  /** Required in edit mode — the EXP-XXXX identifier */
  expenseNumber?: string;
}

export function ExpenseForm({ mode, expenseNumber }: ExpenseFormProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground text-sm">Loading form...</div>}>
      <ExpenseFormInner mode={mode} expenseNumber={expenseNumber} />
    </Suspense>
  );
}

function ExpenseFormInner({ mode, expenseNumber }: ExpenseFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialVendorId = searchParams.get("vendorId") || "";
  const isEdit = mode === "edit";

  const [activeTab, setActiveTab] = useState<ActiveTab>("expense");
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Mileage preferences
  const [milPrefs, setMilPrefs] = useState<MileagePrefs>(DEFAULT_PREFS);
  const [milPrefsSet, setMilPrefsSet] = useState(false);
  const [milPrefsOpen, setMilPrefsOpen] = useState(false);

  function handleSaveMilPrefs(p: MileagePrefs) {
    setMilPrefs(p);
    setMilPrefsSet(true);
    setMilForm((prev) => ({ ...prev, mileageUnit: p.defaultUnit }));
  }

  function getActiveRate(date: string): number {
    if (!milPrefs.rates.length) return 0;
    const d = date || new Date().toISOString().slice(0, 10);
    // Rates whose startDate is on or before d (most recent first)
    const withDate = milPrefs.rates
      .filter((r) => r.startDate && r.startDate <= d && +r.rate > 0)
      .sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    if (withDate.length) return +withDate[0].rate;
    // Fallback: a rate with no startDate
    const noDate = milPrefs.rates.find((r) => !r.startDate && +r.rate > 0);
    if (noDate) return +noDate.rate;
    // Last resort: use the earliest dated rate (useful when date is before all start dates)
    const anyRate = milPrefs.rates
      .filter((r) => +r.rate > 0)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    return anyRate.length ? +anyRate[0].rate : 0;
  }

  // Dropdown data
  const [expenseAccounts, setExpenseAccounts]         = useState<Account[]>([]);
  const [paidThroughAccounts, setPaidThroughAccounts] = useState<Account[]>([]);
  const [customers, setCustomers]                     = useState<Contact[]>([]);
  const [vendors, setVendors]                         = useState<Contact[]>([]);

  // Record Expense form
  const today = new Date().toISOString().slice(0, 10);
  const [isItemized, setIsItemized] = useState(false);
  const [lineItems, setLineItems]   = useState<LineItem[]>([newLineItem()]);
  const [expForm, setExpForm] = useState({
    date: today, expenseAccountId: "", currency: "INR", amount: "",
    paidThroughAccountId: "", vendorId: initialVendorId, invoiceNumber: "", notes: "",
    customerId: "", isBillable: false, projectId: "",
  });

  // Record Mileage form
  const [milForm, setMilForm] = useState({
    date: today, employeeId: "",
    mileageCalcMethod: "DistanceTravelled" as "DistanceTravelled" | "OdometerReading",
    distance: "", mileageUnit: "Km" as "Km" | "Mile",
    paidThroughAccountId: "", vendorId: initialVendorId, invoiceNumber: "", notes: "",
    customerId: "", isBillable: false, projectId: "",
  });

  const mileageAmount = milForm.distance && +milForm.distance > 0
    ? +(+milForm.distance * getActiveRate(milForm.date)).toFixed(2)
    : 0;

  // Bulk rows
  const emptyBulkRow = () => ({
    date: today, expenseAccountId: "", currency: "INR", amount: "",
    paidThroughAccountId: "", vendorId: initialVendorId, customerId: "", isBillable: false,
  });
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 10 }, emptyBulkRow));

  function setExp(field: string, value: unknown) { setExpForm((p) => ({ ...p, [field]: value })); }
  function setMil(field: string, value: unknown) { setMilForm((p) => ({ ...p, [field]: value })); }
  function setBulkRow(idx: number, field: string, value: unknown) {
    setBulkRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  // Load accounts + contacts (and the existing expense in edit mode)
  const loadAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const fetches: Promise<any>[] = [
        accountApi.list({ rootType: "Expense,Liability,Asset", excludeGroups: false }),
        accountApi.list({ rootType: "Asset,Liability,Equity" }),
        contactApi.list({ type: "Customer", page: 1, limit: 200 }),
        contactApi.list({ type: "Vendor",   page: 1, limit: 200 }),
      ];
      if (isEdit && expenseNumber) fetches.push(expenseApi.getById(expenseNumber));

      const results = await Promise.all(fetches);
      const [expAcc, paidAcc, custs, vends] = results;

      setExpenseAccounts(expAcc.data ?? []);
      setPaidThroughAccounts(
        (paidAcc.data ?? []).filter((a: Account) =>
          ["Cash", "Bank", "Other Current Asset", "Fixed Asset", "Other Current Liability", "Equity"].includes(a.accountType),
        ),
      );
      setCustomers(custs.data ?? []);
      setVendors(vends.data ?? []);

      // Pre-fill in edit mode
      if (isEdit && results[4]) {
        const e: Expense = results[4].data;

        if (e.expenseType === "Mileage") {
          setActiveTab("mileage");
          setMilForm({
            date: e.date?.slice(0, 10) ?? today,
            employeeId: "",
            mileageCalcMethod: e.mileageCalcMethod ?? "DistanceTravelled",
            distance: e.distance != null ? String(e.distance) : "",
            mileageUnit: e.mileageUnit ?? "Km",
            paidThroughAccountId: extractId(e.paidThroughAccountId),
            vendorId:   extractId(e.vendorId),
            invoiceNumber: e.invoiceNumber ?? "",
            notes: e.notes ?? "",
            customerId: extractId(e.customerId),
            isBillable: e.isBillable ?? false,
            projectId: extractId(e.projectId),
          });
          // Always restore prefs from saved mileageRate so amount computes correctly
          const savedRate = e.mileageRate && +e.mileageRate > 0 ? String(e.mileageRate) : "1";
          setMilPrefs((prev) => ({ ...prev, rates: [{ startDate: "", rate: savedRate }] }));
          setMilPrefsSet(true); // always true in edit — data already exists
        } else {
          setActiveTab("expense");
          if (e.isItemized && e.lineItems?.length) {
            setIsItemized(true);
            setLineItems(
              e.lineItems.map((li) => ({
                id: Math.random().toString(36).slice(2),
                expenseAccountId: extractId(li.expenseAccountId),
                notes: (li as any).notes ?? (li as any).description ?? "",
                amount: String(li.amount),
                showReportingTags: false,
              })),
            );
          }
          setExpForm({
            date: e.date?.slice(0, 10) ?? today,
            expenseAccountId: extractId(e.expenseAccountId),
            currency: e.currency ?? "INR",
            amount: String(e.amount ?? ""),
            paidThroughAccountId: extractId(e.paidThroughAccountId),
            vendorId:   extractId(e.vendorId),
            invoiceNumber: e.invoiceNumber ?? "",
            notes: e.notes ?? "",
            customerId: extractId(e.customerId),
            isBillable: e.isBillable ?? false,
            projectId: extractId(e.projectId),
          });
        }
      }
    } catch {
      if (isEdit) {
        toast.error("Failed to load expense");
        router.push("/purchases/expenses");
      }
    } finally {
      setLoadingData(false);
    }
  }, [isEdit, expenseNumber, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function handleSaveExpense(andNew = false) {
    if (!expForm.date) { toast.error("Date is required"); return; }

    if (isItemized) {
      const positiveLines = lineItems.filter((r) => r.amount && +r.amount > 0);
      if (!positiveLines.length) {
        toast.error("Add at least one line item with an amount"); return;
      }
      const missingAccount = positiveLines.some((r) => !r.expenseAccountId);
      if (missingAccount) {
        toast.error("Each line item must have an expense account selected"); return;
      }
    } else {
      if (!expForm.expenseAccountId) {
        toast.error("Expense account is required"); return;
      }
      if (!expForm.amount || +expForm.amount <= 0) {
        toast.error("Amount is required"); return;
      }
    }

    setSaving(true);
    try {
      const itemizedLines = lineItems
        .filter((r) => r.amount && +r.amount > 0)
        .map((r) => ({ expenseAccountId: r.expenseAccountId || null, notes: r.notes, amount: +r.amount }));

      const lineTotal = itemizedLines.reduce((s, r) => s + r.amount, 0);

      const payload: CreateExpenseInput = isItemized
        ? {
            expenseType: "Regular", date: expForm.date,
            amount: lineTotal,
            currency: expForm.currency, isItemized: true,
            lineItems: itemizedLines,
            paidThroughAccountId: expForm.paidThroughAccountId || null,
            vendorId: expForm.vendorId || null, invoiceNumber: expForm.invoiceNumber,
            notes: expForm.notes, customerId: expForm.customerId || null,
            isBillable: expForm.isBillable, projectId: expForm.projectId || null,
            status: "Draft",
          }
        : {
            expenseType: "Regular", date: expForm.date,
            amount: +expForm.amount, currency: expForm.currency,
            expenseAccountId: expForm.expenseAccountId || null,
            paidThroughAccountId: expForm.paidThroughAccountId || null,
            vendorId: expForm.vendorId || null, invoiceNumber: expForm.invoiceNumber,
            notes: expForm.notes, customerId: expForm.customerId || null,
            isBillable: expForm.isBillable, projectId: expForm.projectId || null,
            status: "Draft",
          };

      if (isEdit && expenseNumber) {
        await expenseApi.update(expenseNumber, payload);
        toast.success("Expense updated");
        router.push("/purchases/expenses");
      } else {
        await expenseApi.create(payload);
        toast.success("Expense recorded");
        if (andNew) {
          setExpForm({ date: today, expenseAccountId: "", currency: "INR", amount: "",
            paidThroughAccountId: "", vendorId: "", invoiceNumber: "", notes: "",
            customerId: "", isBillable: false, projectId: "" });
          setIsItemized(false);
          setLineItems([newLineItem()]);
        } else {
          router.push("/purchases/expenses");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMileage(andNew = false) {
    if (!milPrefsSet) { toast.error("Please set your mileage preferences first"); setMilPrefsOpen(true); return; }
    if (!milForm.date) { toast.error("Date is required"); return; }
    if (!milForm.distance || +milForm.distance <= 0) { toast.error("Distance is required"); return; }
    const rate = getActiveRate(milForm.date);
    if (!rate || rate <= 0) { toast.error("No mileage rate set for this date"); return; }
    if (!milPrefs.defaultCategoryId) { toast.error("Mileage category is required in preferences"); return; }
    setSaving(true);
    try {
      const payload: CreateExpenseInput = {
        expenseType: "Mileage", date: milForm.date,
        amount: +(+milForm.distance * rate).toFixed(2),
        mileageCalcMethod: milForm.mileageCalcMethod,
        distance: +milForm.distance, mileageUnit: milForm.mileageUnit,
        mileageRate: rate,
        expenseAccountId: milPrefs.defaultCategoryId || null,
        paidThroughAccountId: milForm.paidThroughAccountId || null,
        vendorId: milForm.vendorId || null, invoiceNumber: milForm.invoiceNumber,
        notes: milForm.notes, customerId: milForm.customerId || null,
        isBillable: milForm.isBillable, projectId: milForm.projectId || null,
        status: "Draft",
      };

      if (isEdit && expenseNumber) {
        await expenseApi.update(expenseNumber, payload);
        toast.success("Mileage expense updated");
        router.push("/purchases/expenses");
      } else {
        await expenseApi.create(payload);
        toast.success("Mileage expense recorded");
        if (andNew) {
          setMilForm({ date: today, employeeId: "", mileageCalcMethod: "DistanceTravelled",
            distance: "", mileageUnit: milPrefs.defaultUnit, paidThroughAccountId: "",
            vendorId: "", invoiceNumber: "", notes: "", customerId: "", isBillable: false, projectId: "" });
        } else {
          router.push("/purchases/expenses");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to save mileage expense");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBulk() {
    const filled = bulkRows.filter((r) => r.date && r.amount && +r.amount > 0);
    if (!filled.length) { toast.error("Please fill at least one row"); return; }
    setSaving(true);
    try {
      await expenseApi.bulkCreate(filled.map((r) => ({
        expenseType: "Regular" as const, date: r.date, amount: +r.amount, currency: r.currency,
        expenseAccountId: r.expenseAccountId || null, paidThroughAccountId: r.paidThroughAccountId || null,
        vendorId: r.vendorId || null, customerId: r.customerId || null,
        isBillable: r.isBillable, status: "Draft" as const,
      })));
      toast.success(`${filled.length} expenses recorded`);
      router.push("/purchases/expenses");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save expenses");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const saveLabel = isEdit ? "Update" : "Save (Alt+S)";
  const andNewLabel = "Save and New (Alt+N)";

  // In create mode: all 3 tabs. In edit mode: only the tab matching the expense type.
  const TAB_LABELS: Record<ActiveTab, string> = {
    expense: "Record Expense",
    mileage: "Record Mileage",
    bulk:    "Bulk Add Expenses",
  };
  const allTabs: { id: ActiveTab; label: string }[] = isEdit
    ? [{ id: activeTab, label: TAB_LABELS[activeTab] }]
    : [
        { id: "expense", label: "Record Expense" },
        { id: "mileage", label: "Record Mileage" },
        { id: "bulk",    label: "Bulk Add Expenses" },
      ];

  return (
    <>
      {/* Tab bar */}
      <div className="border-b bg-background shrink-0">
        <div className="flex gap-0 px-6">
          {allTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === "mileage" && !milPrefsSet && !isEdit) {
                  setMilPrefsOpen(true);
                }
                setActiveTab(t.id);
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

        {/* ── Record Expense ──────────────────────────────────── */}
        {activeTab === "expense" && (
          <div className="flex gap-0 min-h-full">
            <div className="flex-1 p-8 max-w-2xl">
              <div className="space-y-5">

                {/* Date */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Date <span className="text-destructive">*</span></Label>
                  <Input type="date" className="h-9" value={expForm.date}
                    onChange={(e) => setExp("date", e.target.value)} />
                </div>

                {/* Expense Account / Itemize */}
                {!isItemized ? (
                  <>
                    <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                      <Label className="text-sm text-right pt-2">
                        Expense Account <span className="text-destructive">*</span>
                      </Label>
                      <div>
                        <AccountSelect accounts={expenseAccounts} value={expForm.expenseAccountId}
                          onChange={(v) => setExp("expenseAccountId", v)} />
                        <button type="button" className="text-xs text-primary mt-1.5 flex items-center gap-1 hover:underline"
                          onClick={() => setIsItemized(true)}>
                          <Plus className="h-3 w-3" /> Itemize
                        </button>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                      <Label className="text-sm text-right">Amount <span className="text-destructive">*</span></Label>
                      <div className="flex gap-2">
                        <Select value={expForm.currency} onValueChange={(v) => setExp("currency", v)}>
                          <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["INR", "USD", "EUR", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="h-9 flex-1" type="number" min="0" step="0.01" placeholder="0.00"
                          value={expForm.amount} onChange={(e) => setExp("amount", e.target.value)} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-full -mx-8 px-8 py-4 bg-muted/10 border-y">
                    <ItemizedTable
                      lineItems={lineItems} accounts={expenseAccounts}
                      currency={expForm.currency} onCurrencyChange={(v) => setExp("currency", v)}
                      onChange={setLineItems} onBack={() => setIsItemized(false)}
                    />
                  </div>
                )}

                {/* Paid Through */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Paid Through <span className="text-destructive">*</span></Label>
                  <AccountSelect accounts={paidThroughAccounts} value={expForm.paidThroughAccountId}
                    onChange={(v) => setExp("paidThroughAccountId", v)} placeholder="Select an account" />
                </div>

                {/* Vendor */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Vendor</Label>
                  <ContactCombobox contacts={vendors} value={expForm.vendorId}
                    onChange={(v) => setExp("vendorId", v)} placeholder="Select a vendor"
                    newLabel="+ New Vendor" onNew={() => router.push("/purchases/vendors/new")} />
                </div>

                {/* Invoice # */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Invoice #</Label>
                  <Input className="h-9" value={expForm.invoiceNumber}
                    onChange={(e) => setExp("invoiceNumber", e.target.value)} />
                </div>

                {/* Notes */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                  <Label className="text-sm text-right pt-2">Notes</Label>
                  <Textarea className="resize-none text-sm" rows={3} placeholder="Max. 500 characters"
                    maxLength={500} value={expForm.notes} onChange={(e) => setExp("notes", e.target.value)} />
                </div>

                <Separator />

                {/* Customer */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Customer Name</Label>
                  <ContactCombobox contacts={customers} value={expForm.customerId}
                    onChange={(v) => setExp("customerId", v)} placeholder="Select a customer"
                    newLabel="+ New Customer" onNew={() => router.push("/sales/customers/new")} />
                </div>

                {/* Billable */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <div />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={expForm.isBillable}
                      onCheckedChange={(v) => setExp("isBillable", v === true)} />
                    <span className="text-sm">Billable to Customer</span>
                  </label>
                </div>

                {/* Projects */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Projects</Label>
                  <div className="h-9 border rounded-md flex items-center justify-between px-3 text-sm text-muted-foreground bg-muted/5 cursor-not-allowed select-none">
                    <span className="text-xs">No projects configured yet</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button size="sm" onClick={() => handleSaveExpense(false)} disabled={saving}>
                    {saving ? "Saving…" : saveLabel}
                  </Button>
                  {!isEdit && (
                    <Button size="sm" variant="outline" onClick={() => handleSaveExpense(true)} disabled={saving}>
                      {andNewLabel}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => router.push("/purchases/expenses")}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>

            {/* Receipt upload sidebar */}
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

        {/* ── Record Mileage ───────────────────────────────────── */}
        {activeTab === "mileage" && (
          <div className="flex gap-0 min-h-full">
            <div className="flex-1 p-8 max-w-2xl">

              {/* Mileage summary bar */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2 mb-2">
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span>Unit: <strong className="text-foreground">{milPrefs.defaultUnit}</strong></span>
                  <span>
                    Active rate:{" "}
                    <strong className="text-foreground">
                      INR {getActiveRate(milForm.date).toFixed(2)}/{milPrefs.defaultUnit}
                    </strong>
                  </span>
                </div>
                <button type="button" className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  onClick={() => setMilPrefsOpen(true)}>
                  <Settings2 className="h-3 w-3" /> Mileage Preferences
                </button>
              </div>

              <div className="space-y-5">

                {/* Date */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Date <span className="text-destructive">*</span></Label>
                  <Input type="date" className="h-9" value={milForm.date}
                    onChange={(e) => setMil("date", e.target.value)} />
                </div>

                {/* Employee */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Employee</Label>
                  <Select value={milForm.employeeId} onValueChange={(v) => setMil("employeeId", v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">— None —</SelectItem></SelectContent>
                  </Select>
                </div>

                {/* Calculation method */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">
                    Calculate mileage using <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-6">
                    {(["DistanceTravelled", "OdometerReading"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" className="accent-primary"
                          checked={milForm.mileageCalcMethod === m}
                          onChange={() => setMil("mileageCalcMethod", m)} />
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
                    <Input className="h-9 flex-1" type="number" min="0" step="0.1" placeholder="0"
                      value={milForm.distance} onChange={(e) => setMil("distance", e.target.value)} />
                    <Select value={milForm.mileageUnit} onValueChange={(v) => setMil("mileageUnit", v)}>
                      <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Km">Kilometer(s)</SelectItem>
                        <SelectItem value="Mile">Mile(s)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Amount (read-only computed) */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Amount <span className="text-destructive">*</span></Label>
                  <div className="h-9 border rounded-md overflow-hidden flex items-center text-sm bg-muted/10">
                    <span className="px-3 h-full flex items-center text-muted-foreground border-r bg-muted/30 text-xs shrink-0">INR</span>
                    <span className="flex-1 px-3 font-medium">{mileageAmount.toFixed(2)}</span>
                    {+milForm.distance > 0 && getActiveRate(milForm.date) > 0 && (
                      <span className="pr-3 text-[10px] text-muted-foreground shrink-0">
                        {milForm.distance} × {getActiveRate(milForm.date).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Paid Through */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Paid Through <span className="text-destructive">*</span></Label>
                  <AccountSelect accounts={paidThroughAccounts} value={milForm.paidThroughAccountId}
                    onChange={(v) => setMil("paidThroughAccountId", v)} />
                </div>

                {/* Vendor */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Vendor</Label>
                  <ContactCombobox contacts={vendors} value={milForm.vendorId}
                    onChange={(v) => setMil("vendorId", v)} placeholder="Select a vendor"
                    newLabel="+ New Vendor" onNew={() => router.push("/purchases/vendors/new")} />
                </div>

                {/* Invoice # */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Invoice #</Label>
                  <Input className="h-9" value={milForm.invoiceNumber}
                    onChange={(e) => setMil("invoiceNumber", e.target.value)} />
                </div>

                {/* Notes */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
                  <Label className="text-sm text-right pt-2">Notes</Label>
                  <Textarea className="resize-none text-sm" rows={3} placeholder="Max. 500 characters"
                    maxLength={500} value={milForm.notes} onChange={(e) => setMil("notes", e.target.value)} />
                </div>

                <Separator />

                {/* Customer */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Customer Name</Label>
                  <ContactCombobox contacts={customers} value={milForm.customerId}
                    onChange={(v) => setMil("customerId", v)} placeholder="Select a customer"
                    newLabel="+ New Customer" onNew={() => router.push("/sales/customers/new")} />
                </div>

                {/* Billable */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <div />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={milForm.isBillable}
                      onCheckedChange={(v) => setMil("isBillable", v === true)} />
                    <span className="text-sm">Billable to Customer</span>
                  </label>
                </div>

                {/* Projects */}
                <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                  <Label className="text-sm text-right">Projects</Label>
                  <div className="h-9 border rounded-md flex items-center justify-between px-3 text-sm text-muted-foreground bg-muted/5 cursor-not-allowed select-none">
                    <span className="text-xs">No projects configured yet</span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button size="sm" onClick={() => handleSaveMileage(false)} disabled={saving}>
                    {saving ? "Saving…" : saveLabel}
                  </Button>
                  {!isEdit && (
                    <Button size="sm" variant="outline" onClick={() => handleSaveMileage(true)} disabled={saving}>
                      {andNewLabel}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => router.push("/purchases/expenses")}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>

            {/* Receipt upload sidebar */}
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

        {/* Mileage Preferences Dialog */}
        <MileagePreferencesDialog
          open={milPrefsOpen}
          onClose={() => setMilPrefsOpen(false)}
          prefs={milPrefs}
          onSave={handleSaveMilPrefs}
          expenseAccounts={expenseAccounts}
        />

        {/* ── Bulk Add Expenses (create only) ─────────────────── */}
        {activeTab === "bulk" && (
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/40">
                  {["Date *", "Expense Account *", "Amount *", "Paid Through *", "Vendor", "Customer Name", "Billable"].map((h) => (
                    <th key={h} className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">{h}</th>
                  ))}
                  <th className="border px-2 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">Convert to Invoice</th>
                  <th className="border px-2 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/10">
                    <td className="border px-1 py-1">
                      <input type="date" className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                        value={row.date} onChange={(e) => setBulkRow(idx, "date", e.target.value)} />
                    </td>
                    <td className="border px-1 py-1">
                      <select className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                        value={row.expenseAccountId} onChange={(e) => setBulkRow(idx, "expenseAccountId", e.target.value)}>
                        <option value="">Select an account</option>
                        {expenseAccounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="border px-1 py-1">
                      <div className="flex gap-1 items-center">
                        <span className="text-muted-foreground">INR</span>
                        <input type="number" className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                          placeholder="0.00" value={row.amount} onChange={(e) => setBulkRow(idx, "amount", e.target.value)} />
                      </div>
                    </td>
                    <td className="border px-1 py-1">
                      <select className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                        value={row.paidThroughAccountId} onChange={(e) => setBulkRow(idx, "paidThroughAccountId", e.target.value)}>
                        <option value="">Select an account</option>
                        {paidThroughAccounts.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td className="border px-1 py-1">
                      <select className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                        value={row.vendorId} onChange={(e) => setBulkRow(idx, "vendorId", e.target.value)}>
                        <option value="">—</option>
                        {vendors.map((v) => <option key={v._id} value={v._id}>{v.displayName || v.companyName}</option>)}
                      </select>
                    </td>
                    <td className="border px-1 py-1">
                      <select className="w-full h-7 text-xs px-1 border-0 bg-transparent outline-none focus:bg-muted/20 rounded"
                        value={row.customerId} onChange={(e) => setBulkRow(idx, "customerId", e.target.value)}>
                        <option value="">—</option>
                        {customers.map((c) => <option key={c._id} value={c._id}>{c.displayName || c.companyName}</option>)}
                      </select>
                    </td>
                    <td className="border px-1 py-1 text-center">
                      <input type="checkbox" className="accent-primary" checked={row.isBillable}
                        onChange={(e) => setBulkRow(idx, "isBillable", e.target.checked)} />
                    </td>
                    <td className="border px-1 py-1 text-center">
                      {row.isBillable ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary border border-primary/30 bg-primary/5 rounded px-1.5 py-0.5">
                          → Invoice
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="border px-1 py-1 text-center">
                      <button onClick={() => setBulkRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-3 text-xs text-primary font-medium flex items-center gap-1 hover:underline"
              onClick={() => setBulkRows((prev) => [...prev, ...Array.from({ length: 5 }, emptyBulkRow)])}>
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
    </>
  );
}
