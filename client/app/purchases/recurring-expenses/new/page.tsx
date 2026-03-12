"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { accountApi, type Account } from "@/lib/api/accounts";
import { contactApi, type Contact } from "@/lib/api/contacts";
import {
  recurringExpenseApi,
  type RecurringExpense,
  type CreateRecurringExpenseInput,
  type RecurringFrequency,
} from "@/lib/api/recurring-expenses";

// ─── Types & constants ────────────────────────────────────────────────────────

interface FreqOption { label: string; frequency: RecurringFrequency; repeatEvery: number }
const FREQ_OPTIONS: FreqOption[] = [
  { label: "Day",     frequency: "Daily",   repeatEvery: 1 },
  { label: "Week",    frequency: "Weekly",  repeatEvery: 1 },
  { label: "2 Weeks", frequency: "Weekly",  repeatEvery: 2 },
  { label: "Month",   frequency: "Monthly", repeatEvery: 1 },
  { label: "2 Months",frequency: "Monthly", repeatEvery: 2 },
  { label: "3 Months",frequency: "Monthly", repeatEvery: 3 },
  { label: "6 Months",frequency: "Monthly", repeatEvery: 6 },
  { label: "Year",    frequency: "Yearly",  repeatEvery: 1 },
];

function freqKey(o: FreqOption) { return `${o.frequency}_${o.repeatEvery}`; }
function findFreqOption(freq: RecurringFrequency, repeatEvery: number) {
  return FREQ_OPTIONS.find((o) => o.frequency === freq && o.repeatEvery === repeatEvery) ?? FREQ_OPTIONS[1];
}

function computeFirstRunDate(startDate: string, freq: FreqOption): string {
  if (!startDate) return "";
  const d = new Date(startDate);
  switch (freq.frequency) {
    case "Daily":   d.setDate(d.getDate() + freq.repeatEvery);   break;
    case "Weekly":  d.setDate(d.getDate() + freq.repeatEvery * 7); break;
    case "Monthly": d.setMonth(d.getMonth() + freq.repeatEvery); break;
    case "Yearly":  d.setFullYear(d.getFullYear() + freq.repeatEvery); break;
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {grouped.map(([type, accs]) => (
          <SelectGroup key={type}>
            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2">
              {type}
            </SelectLabel>
            {accs.map((a) => (
              <SelectItem key={a._id} value={a._id} className="text-sm">{a.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactCombobox({
  contacts, value, onChange, placeholder = "Select",
}: {
  contacts: Contact[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
        <span className={selected ? "text-foreground text-sm" : "text-muted-foreground text-sm"}>
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
            {filtered.map((c) => (
              <button
                key={c._id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
                onClick={() => { onChange(c._id); setOpen(false); setSearch(""); }}
              >
                {c.displayName || c.companyName}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No results found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormData {
  profileName: string;
  freqKey: string;
  startDate: string;
  neverExpires: boolean;
  endsOn: string;
  expenseAccountId: string;
  currency: string;
  amount: string;
  paidThroughAccountId: string;
  vendorId: string;
  notes: string;
  customerId: string;
  isBillable: boolean;
  projectId: string;
}

const DEFAULT: FormData = {
  profileName: "",
  freqKey: "Weekly_1",
  startDate: new Date().toISOString().slice(0, 10),
  neverExpires: true,
  endsOn: "",
  expenseAccountId: "",
  currency: "INR",
  amount: "",
  paidThroughAccountId: "",
  vendorId: "",
  notes: "",
  customerId: "",
  isBillable: false,
  projectId: "",
};

function extractId(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) return (field as any)._id ?? "";
  return String(field);
}

// ─── Recurring Expense Form Page ─────────────────────────────────────────────

interface RecurringExpenseFormPageProps {
  mode: "new" | "edit";
  existingId?: string;
}

function RecurringExpenseFormPage({ mode, existingId }: RecurringExpenseFormPageProps) {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [form, setForm] = useState<FormData>(DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(mode === "edit");

  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);

  const selectedFreq = FREQ_OPTIONS.find((o) => freqKey(o) === form.freqKey) ?? FREQ_OPTIONS[1];
  const firstRunDate = computeFirstRunDate(form.startDate, selectedFreq);

  const set = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Load reference data
  useEffect(() => {
    if (authLoading || !firebaseUser) return;
    Promise.all([
      accountApi.list({ rootType: "Expense" }),
      accountApi.list({ rootType: "Asset" }),
      contactApi.list({ type: "Vendor", limit: 500 } as any),
      contactApi.list({ type: "Customer", limit: 500 } as any),
    ]).then(([expRes, assetRes, vendorRes, custRes]) => {
      setExpenseAccounts((expRes as any).data ?? []);
      setBankAccounts(((assetRes as any).data ?? []).filter((a: Account) =>
        ["Cash", "Bank", "Other Current Asset", "Payment Clearing Account"].includes(a.accountType)
      ));
      setVendors((vendorRes as any).data ?? []);
      setCustomers((custRes as any).data ?? []);
    }).catch(() => {});
  }, [authLoading, firebaseUser]);

  // Load existing record for edit mode
  useEffect(() => {
    if (mode !== "edit" || !existingId || authLoading || !firebaseUser) return;
    recurringExpenseApi.getById(existingId)
      .then((res) => {
        const rec = res.data;
        const fo = findFreqOption(rec.frequency, rec.repeatEvery);
        setForm({
          profileName: rec.profileName,
          freqKey: freqKey(fo),
          startDate: rec.startDate ? rec.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          neverExpires: rec.neverExpires,
          endsOn: rec.endsOn ? rec.endsOn.slice(0, 10) : "",
          expenseAccountId: extractId(rec.expenseAccountId),
          currency: rec.currency,
          amount: String(rec.amount),
          paidThroughAccountId: extractId(rec.paidThroughAccountId),
          vendorId: extractId(rec.vendorId),
          notes: rec.notes ?? "",
          customerId: extractId(rec.customerId),
          isBillable: rec.isBillable,
          projectId: rec.projectId ?? "",
        });
      })
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoadingData(false));
  }, [mode, existingId, authLoading, firebaseUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.profileName.trim()) { toast.error("Profile name is required"); return; }
    if (!form.startDate) { toast.error("Start date is required"); return; }
    if (!form.amount || isNaN(+form.amount) || +form.amount <= 0) { toast.error("Valid amount is required"); return; }

    const payload: CreateRecurringExpenseInput = {
      profileName: form.profileName.trim(),
      frequency: selectedFreq.frequency,
      repeatEvery: selectedFreq.repeatEvery,
      startDate: form.startDate,
      neverExpires: form.neverExpires,
      endsOn: !form.neverExpires && form.endsOn ? form.endsOn : null,
      expenseAccountId: form.expenseAccountId || null,
      amount: +form.amount,
      currency: form.currency,
      paidThroughAccountId: form.paidThroughAccountId || null,
      vendorId: form.vendorId || null,
      customerId: form.customerId || null,
      isBillable: form.isBillable,
      projectId: form.projectId || null,
      notes: form.notes,
    };

    setSubmitting(true);
    try {
      if (mode === "edit" && existingId) {
        await recurringExpenseApi.update(existingId, payload);
        toast.success("Recurring expense updated");
      } else {
        await recurringExpenseApi.create(payload);
        toast.success("Recurring expense created");
      }
      router.push("/purchases/recurring-expenses");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingData) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Tab-style header bar */}
      <div className="border-b bg-background shrink-0">
        <div className="flex gap-0 px-6">
          <div className="text-sm px-4 py-3 border-b-2 border-primary text-primary font-medium">
            {mode === "edit" ? "Edit Recurring Expense" : "New Recurring Expense"}
          </div>
        </div>
      </div>

      <div className="flex gap-0 min-h-full">
        <div className="flex-1 p-8 max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Profile Name */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">
                Profile Name <span className="text-destructive">*</span>
              </Label>
              <Input
                className="h-9"
                value={form.profileName}
                onChange={(e) => set("profileName", e.target.value)}
                maxLength={100}
                placeholder="e.g. Monthly Office Rent"
              />
            </div>

            {/* Repeat Every */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">
                Repeat Every <span className="text-destructive">*</span>
              </Label>
              <Select value={form.freqKey} onValueChange={(v) => set("freqKey", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQ_OPTIONS.map((o) => (
                    <SelectItem key={freqKey(o)} value={freqKey(o)} className="text-sm">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4">
              <Label className="text-sm text-right pt-2">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <div>
                <Input
                  type="date"
                  className="h-9"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
                {firstRunDate && (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    The first expense will be created on <strong>{firstRunDate}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Ends On */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4">
              <Label className="text-sm text-right pt-2">Ends On</Label>
              <div className="space-y-2">
                <Input
                  type="date"
                  className="h-9"
                  value={form.endsOn}
                  disabled={form.neverExpires}
                  onChange={(e) => set("endsOn", e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="neverExpires"
                    checked={form.neverExpires}
                    onCheckedChange={(v) => {
                      set("neverExpires", Boolean(v));
                      if (v) set("endsOn", "");
                    }}
                  />
                  <label htmlFor="neverExpires" className="text-sm cursor-pointer select-none">
                    Never Expires
                  </label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Expense Account */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">
                Expense Account <span className="text-destructive">*</span>
              </Label>
              <AccountSelect
                accounts={expenseAccounts}
                value={form.expenseAccountId}
                onChange={(v) => set("expenseAccountId", v)}
                placeholder="Select an account"
              />
            </div>

            {/* Amount */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">
                Amount <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                  <SelectTrigger className="h-9 w-24 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["INR", "USD", "EUR", "GBP"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-9 flex-1"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
            </div>

            {/* Paid Through */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">Paid Through</Label>
              <AccountSelect
                accounts={bankAccounts}
                value={form.paidThroughAccountId}
                onChange={(v) => set("paidThroughAccountId", v)}
                placeholder="Select an account"
              />
            </div>

            {/* Vendor */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">Vendor</Label>
              <ContactCombobox
                contacts={vendors}
                value={form.vendorId}
                onChange={(v) => set("vendorId", v)}
                placeholder="Select a vendor"
              />
            </div>

            {/* Notes */}
            <div className="grid grid-cols-[180px_1fr] items-start gap-4">
              <Label className="text-sm text-right pt-2">Notes</Label>
              <Textarea
                className="resize-none text-sm"
                rows={3}
                maxLength={500}
                placeholder="Max. 500 characters"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>

            <Separator />

            {/* Customer Name */}
            <div className="grid grid-cols-[180px_1fr] items-center gap-4">
              <Label className="text-sm text-right">Customer Name</Label>
              <ContactCombobox
                contacts={customers}
                value={form.customerId}
                onChange={(v) => {
                  set("customerId", v);
                  if (!v) {
                    set("isBillable", false);
                    set("projectId", "");
                  }
                }}
                placeholder="Select a customer"
              />
            </div>

            {/* Billable — shown only when customer selected */}
            {form.customerId && (
              <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                <div />
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={form.isBillable}
                    onCheckedChange={(v) => set("isBillable", v === true)}
                  />
                  <span className="text-sm">Billable to Customer</span>
                </label>
              </div>
            )}

            {/* Projects — shown only when customer selected */}
            {form.customerId && (
              <div className="grid grid-cols-[180px_1fr] items-center gap-4">
                <Label className="text-sm text-right">Projects</Label>
                <div className="h-9 border rounded-md flex items-center justify-between px-3 text-sm text-muted-foreground bg-muted/5 cursor-not-allowed select-none">
                  <span className="text-xs">No projects configured yet</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </div>
              </div>
            )}

            {/* Actions */}
            <Separator />
            <div className="flex gap-3 pt-2">
              <Button type="submit" size="sm" disabled={submitting} className="px-6">
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {mode === "edit" ? "Update" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.back()}
                disabled={submitting}
                className="px-6"
              >
                Cancel
              </Button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}

// ─── New page ─────────────────────────────────────────────────────────────────

export default function NewRecurringExpensePage() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !firebaseUser) router.push("/login");
  }, [authLoading, firebaseUser, router]);

  if (authLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <a href="/purchases/recurring-expenses" className="hover:underline">Recurring Expenses</a>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
          }
        />
        <RecurringExpenseFormPage mode="new" />
      </SidebarInset>
    </SidebarProvider>
  );
}
