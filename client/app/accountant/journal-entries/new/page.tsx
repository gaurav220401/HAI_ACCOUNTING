"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GripVertical,
  X,
  Plus,
  MoreHorizontal,
  Settings,
  Upload,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { accountApi, type Account } from "@/lib/api/accounts";
import { journalApi } from "@/lib/api/journals";

const toInputDate = (d: Date) => d.toISOString().split("T")[0];

// ─── Types ───────────────────────────────────────────────────────────────────

type JournalRow = {
  id: string;
  accountId: string;
  description: string;
  contactId: string;
  debits: number | "";
  credits: number | "";
};

type NumberingMode = "auto" | "manual";
type ReportingMethod = "accrual_and_cash" | "accrual_only" | "cash_only";

const DEFAULT_NUMBER_PREFIX = "JRN-";
const DEFAULT_NEXT_NUMBER = 1;

function formatJournalNumber(prefix: string, nextNumber: number): string {
  const safeNext = Math.max(1, Math.trunc(nextNumber || DEFAULT_NEXT_NUMBER));
  return `${prefix}${String(safeNext).padStart(4, "0")}`;
}

// ─── Row helpers ─────────────────────────────────────────────────────────────

let rowKey = 1;
function makeRow(): JournalRow {
  return {
    id: String(rowKey++),
    accountId: "",
    description: "",
    contactId: "",
    debits: "",
    credits: "",
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function NewJournalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <NewJournalPageInner />
    </Suspense>
  );
}

function NewJournalPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialVendorId = searchParams.get("vendorId");
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ── Form state ──────────────────────────────────────────────────────────
  const [date, setDate] = useState(toInputDate(new Date()));
  const [journalNumber, setJournalNumber] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reportingMethod, setReportingMethod] =
    useState<ReportingMethod>("accrual_and_cash");
  const [currency, setCurrency] = useState("INR");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [numberingMode, setNumberingMode] = useState<NumberingMode>("auto");
  const [numberPrefix, setNumberPrefix] = useState(DEFAULT_NUMBER_PREFIX);
  const [nextNumber, setNextNumber] = useState(String(DEFAULT_NEXT_NUMBER));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingNumberPrefs, setLoadingNumberPrefs] = useState(true);
  const [savingNumberPrefs, setSavingNumberPrefs] = useState(false);
  const [rows, setRows] = useState<JournalRow[]>(() => {
    const r1 = makeRow();
    if (initialVendorId) r1.contactId = initialVendorId;
    return [r1, makeRow()];
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || orgLoading || !firebaseUser) return;

    const loadData = async () => {
      try {
        const [accountsRes, numberingRes] = await Promise.all([
          accountApi.list({ excludeGroups: true }),
          journalApi.getNumberingPreferences(),
        ]);

        setAccounts((accountsRes.data || []).filter((acc) => acc.isActive));

        const prefs = numberingRes.data;
        setNumberingMode(prefs.mode);
        setNumberPrefix(prefs.prefix || DEFAULT_NUMBER_PREFIX);
        setNextNumber(
          String(Math.max(1, Number(prefs.nextNumber || DEFAULT_NEXT_NUMBER))),
        );
        setJournalNumber(
          prefs.previewJournalNumber ||
            formatJournalNumber(prefs.prefix, prefs.nextNumber),
        );
      } catch {
        toast.error("Failed to load journal numbering preferences");
        setJournalNumber(
          formatJournalNumber(DEFAULT_NUMBER_PREFIX, DEFAULT_NEXT_NUMBER),
        );
      } finally {
        setLoadingNumberPrefs(false);
      }
    };

    void loadData();
  }, [loading, orgLoading, firebaseUser]);

  const applyJournalNumberSettings = async () => {
    const trimmedPrefix = numberPrefix.trim();
    const parsedNext = Math.max(
      1,
      Math.trunc(Number(nextNumber || DEFAULT_NEXT_NUMBER)),
    );

    if (!trimmedPrefix) {
      toast.error("Prefix is required");
      return;
    }
    if (!Number.isFinite(parsedNext) || parsedNext < 1) {
      toast.error("Next Number must be 1 or greater");
      return;
    }

    setSavingNumberPrefs(true);
    try {
      const res = await journalApi.updateNumberingPreferences({
        mode: numberingMode,
        prefix: trimmedPrefix,
        nextNumber: parsedNext,
      });

      const prefs = res.data;
      setNumberingMode(prefs.mode);
      setNumberPrefix(prefs.prefix);
      setNextNumber(String(prefs.nextNumber));
      if (prefs.mode === "auto") {
        setJournalNumber(prefs.previewJournalNumber);
      }
      setSettingsOpen(false);
      toast.success("Journal number preferences saved");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to save preferences";
      toast.error(message);
    } finally {
      setSavingNumberPrefs(false);
    }
  };

  // Sync vendorId if it changes after mount (though usually its just on load)
  useEffect(() => {
    if (initialVendorId) {
      setRows((prev) => {
        const newRows = [...prev];
        if (newRows[0])
          newRows[0] = { ...newRows[0], contactId: initialVendorId };
        return newRows;
      });
    }
  }, [initialVendorId]);

  // ── Row actions ─────────────────────────────────────────────────────────
  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows((prev) =>
      prev.length > 2 ?
        prev.filter((r) => r.id !== id)
      : prev.map((r) =>
          r.id === id ?
            {
              ...r,
              accountId: "",
              description: "",
              contactId: "",
              debits: "",
              credits: "",
            }
          : r,
        ),
    );

  const updateRow = (
    id: string,
    field: keyof JournalRow,
    value: JournalRow[keyof JournalRow],
  ) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );

  // ── Totals ──────────────────────────────────────────────────────────────
  const totalDebits = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.debits) || 0), 0),
    [rows],
  );
  const totalCredits = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0),
    [rows],
  );
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference === 0;

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (publish: boolean) => {
    if (!notes.trim()) {
      toast.error("Notes are required");
      return;
    }
    if (!isBalanced) {
      toast.error("Debits and Credits must be equal before saving");
      return;
    }

    const finalJournalNumber = journalNumber.trim();
    if (numberingMode === "manual" && !finalJournalNumber) {
      toast.error("Journal# is required");
      return;
    }

    const hasValidLine = rows.some(
      (r) =>
        r.accountId &&
        ((Number(r.debits) > 0 && Number(r.credits) === 0) ||
          (Number(r.credits) > 0 && Number(r.debits) === 0)),
    );
    if (!hasValidLine) {
      toast.error(
        "Add at least one valid journal line with account and debit or credit",
      );
      return;
    }

    setSaving(true);
    try {
      const payloadLines = rows
        .filter(
          (r) => r.accountId && (Number(r.debits) > 0 || Number(r.credits) > 0),
        )
        .map((r) => ({
          accountId: r.accountId,
          debit: Number(r.debits) || 0,
          credit: Number(r.credits) || 0,
          narration: r.description || undefined,
        }));

      if (payloadLines.length < 2) {
        toast.error("Journal requires at least two line items");
        return;
      }

      const maybeVendorId = (initialVendorId || "").trim();
      const vendorId =
        /^[a-fA-F0-9]{24}$/.test(maybeVendorId) ? maybeVendorId : undefined;

      await journalApi.create({
        date,
        ...(numberingMode === "manual" ?
          { journalNumber: finalJournalNumber }
        : {}),
        vendorId,
        description: notes,
        referenceNumber: reference,
        lineItems: payloadLines,
        notes,
        status: publish ? "Posted" : "Draft",
      });

      toast.success(`Journal ${publish ? "published" : "saved as draft"}!`);
      router.push("/accountant/journal-entries");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to save journal";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-hidden">
        {/* ── Header ── */}
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Accountant <span className="mx-1">/</span>
              <span
                className="hover:text-foreground cursor-pointer"
                onClick={() => router.push("/accountant/journal-entries")}
              >
                Journal Entries
              </span>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
          }
        />

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-auto bg-muted/5 px-8 py-6">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* ── Main fields ─────────────────────────────────────────── */}
            <div className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
              {/* Date */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-red-500 text-sm font-medium text-right">
                  Date *
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              {/* Journal # */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-red-500 text-sm font-medium text-right">
                  Journal# *
                </Label>
                <div className="relative max-w-xs">
                  <Input
                    value={journalNumber}
                    onChange={(e) => setJournalNumber(e.target.value)}
                    readOnly={numberingMode === "auto"}
                    placeholder={formatJournalNumber(numberPrefix, Number(nextNumber))}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    aria-label="Configure journal number preferences"
                    onClick={() => setSettingsOpen(true)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  >
                    <Settings className="h-4 w-4 cursor-pointer text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Reference */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">
                  Reference#
                </Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              {/* Notes */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-start">
                <Label className="text-red-500 text-sm font-medium text-right pt-2">
                  Notes *
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Max. 500 characters"
                  maxLength={500}
                  className="min-h-22.5 max-w-md resize-y"
                />
              </div>

              {/* Reporting Method */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">
                  Reporting Method
                </Label>
                <RadioGroup
                  value={reportingMethod}
                  onValueChange={(value) =>
                    setReportingMethod(value as ReportingMethod)
                  }
                  className="flex flex-wrap items-center gap-5"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="accrual_and_cash"
                      id="reporting-accrual-and-cash"
                    />
                    <Label
                      htmlFor="reporting-accrual-and-cash"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Accrual and Cash
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="accrual_only"
                      id="reporting-accrual-only"
                    />
                    <Label
                      htmlFor="reporting-accrual-only"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Accrual Only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      value="cash_only"
                      id="reporting-cash-only"
                    />
                    <Label
                      htmlFor="reporting-cash-only"
                      className="text-sm font-normal cursor-pointer"
                    >
                      Cash Only
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Currency */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">
                  Currency
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">Indian Rupee (INR)</SelectItem>
                    <SelectItem value="USD">US Dollar (USD)</SelectItem>
                    <SelectItem value="EUR">Euro (EUR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Journal lines table ──────────────────────────────────── */}
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground w-72">
                      Account
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground w-48">
                      Contact ({currency})
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right w-32">
                      Debits
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right w-32">
                      Credits
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="group hover:bg-muted/10">
                      <TableCell className="px-2 py-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
                      </TableCell>

                      {/* Account */}
                      <TableCell className="p-1 border-r">
                        <Select
                          value={row.accountId}
                          onValueChange={(val) =>
                            updateRow(row.id, "accountId", val)
                          }
                        >
                          <SelectTrigger className="border-0 shadow-none focus:ring-0 h-8 text-sm text-muted-foreground">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account._id} value={account._id}>
                                {account.code ? `[${account.code}] ` : ""}
                                {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Description */}
                      <TableCell className="p-1 border-r">
                        <Input
                          value={row.description}
                          onChange={(e) =>
                            updateRow(row.id, "description", e.target.value)
                          }
                          placeholder="Description"
                          className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
                        />
                      </TableCell>

                      {/* Contact */}
                      <TableCell className="p-1 border-r">
                        <Select
                          value={row.contactId}
                          onValueChange={(val) =>
                            updateRow(row.id, "contactId", val)
                          }
                        >
                          <SelectTrigger className="border-0 shadow-none focus:ring-0 h-8 text-sm text-muted-foreground">
                            <SelectValue placeholder="Select Contact" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="c1">John Doe</SelectItem>
                            <SelectItem value="c2">Acme Corp</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Debits */}
                      <TableCell className="p-1 border-r">
                        <Input
                          type="number"
                          value={row.debits}
                          onChange={(e) =>
                            updateRow(
                              row.id,
                              "debits",
                              e.target.value === "" ?
                                ""
                              : parseFloat(e.target.value),
                            )
                          }
                          placeholder="0.00"
                          className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm text-right"
                        />
                      </TableCell>

                      {/* Credits */}
                      <TableCell className="p-1 border-r">
                        <Input
                          type="number"
                          value={row.credits}
                          onChange={(e) =>
                            updateRow(
                              row.id,
                              "credits",
                              e.target.value === "" ?
                                ""
                              : parseFloat(e.target.value),
                            )
                          }
                          placeholder="0.00"
                          className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm text-right"
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="p-1 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground cursor-pointer" />
                          <X
                            strokeWidth={2.5}
                            className="h-4 w-4 text-destructive cursor-pointer hover:text-red-600"
                            onClick={() => removeRow(row.id)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Footer: Add Row + Totals */}
              <div className="flex justify-between items-start px-4 py-3 border-t bg-muted/5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addRow}
                  className="text-primary hover:text-primary gap-1.5 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add New Row
                </Button>

                {/* Totals panel */}
                <div className="text-sm w-80 space-y-2 border rounded-md p-4 bg-white shadow-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Sub Total</span>
                    <div className="flex gap-6">
                      <span className="w-20 text-right tabular-nums">
                        {totalDebits.toFixed(2)}
                      </span>
                      <span className="w-20 text-right tabular-nums">
                        {totalCredits.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total (Rs.)</span>
                    <div className="flex gap-6">
                      <span className="w-20 text-right tabular-nums">
                        {totalDebits.toFixed(2)}
                      </span>
                      <span className="w-20 text-right tabular-nums">
                        {totalCredits.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        isBalanced ?
                          "text-muted-foreground"
                        : "text-destructive font-medium"
                      }
                    >
                      Difference
                    </span>
                    <span
                      className={`w-20 text-right tabular-nums ${isBalanced ? "text-muted-foreground" : "text-destructive font-semibold"}`}
                    >
                      {difference.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Attachments ─────────────────────────────────────────── */}
            <div className="bg-white border rounded-lg shadow-sm p-6">
              <p className="text-sm font-medium mb-3">Attachments</p>
              <div className="flex gap-0">
                <Button
                  variant="outline"
                  className="rounded-r-none gap-2 text-sm"
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  Upload File
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-l-none border-l-0 px-2"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                You can upload a maximum of 5 files, 10MB each
              </p>
            </div>
          </div>
        </div>

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Configure Journal Number Preferences</DialogTitle>
              <DialogDescription>
                Choose whether to auto-generate journal numbers or enter this
                journal number manually.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="journal-number-mode"
                  checked={numberingMode === "auto"}
                  onChange={() => setNumberingMode("auto")}
                />
                Auto-generate journal numbers
              </label>

              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1.5">
                  <Label htmlFor="journal-number-prefix">Prefix</Label>
                  <Input
                    id="journal-number-prefix"
                    value={numberPrefix}
                    onChange={(e) => setNumberPrefix(e.target.value)}
                    disabled={numberingMode !== "auto"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="journal-number-next">Next Number</Label>
                  <Input
                    id="journal-number-next"
                    type="number"
                    min={1}
                    value={nextNumber}
                    onChange={(e) => setNextNumber(e.target.value)}
                    disabled={numberingMode !== "auto"}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="journal-number-mode"
                  checked={numberingMode === "manual"}
                  onChange={() => setNumberingMode("manual")}
                />
                Add journal number manually for this journal
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void applyJournalNumberSettings()}
                disabled={savingNumberPrefs}
              >
                {savingNumberPrefs ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Sticky footer ── */}
        <div className="border-t bg-background px-8 py-4 flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => handleSubmit(true)}
            disabled={saving || loadingNumberPrefs || savingNumberPrefs}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save and Publish
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={saving || loadingNumberPrefs || savingNumberPrefs}
          >
            Save as Draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push("/accountant/journal-entries")}
          >
            Cancel
          </Button>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
