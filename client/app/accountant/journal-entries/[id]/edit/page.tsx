"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
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
  Info,
  Upload,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "hai_journals";
const toInputDate = (d: Date) => d.toISOString().split("T")[0];

// ─── Types ────────────────────────────────────────────────────────────────────

type JournalRow = {
  id: string;
  accountId: string;
  description: string;
  contactId: string;
  debits: number | "";
  credits: number | "";
};

type StoredJournal = {
  id: string;
  journalNumber: string;
  date: string;
  displayDate: string;
  reference: string;
  status: "Published" | "Draft";
  notes: string;
  amount: number;
  currency: string;
  lines: { account: string; contact: string; debit: number; credit: number }[];
};

// ─── Row helpers ──────────────────────────────────────────────────────────────

let rowKey = 100;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditJournalPage() {
  const router = useRouter();
  const params = useParams();
  const journalId = params?.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [notFound, setNotFound] = useState(false);

  // ── Form state ─────────────────────────────────────────────────────────
  const [date, setDate] = useState(toInputDate(new Date()));
  const [journalNumber, setJournalNumber] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [isCashBased, setIsCashBased] = useState(false);
  const [currency, setCurrency] = useState("INR");
  const [rows, setRows] = useState<JournalRow[]>([makeRow(), makeRow()]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ── Load journal from localStorage ─────────────────────────────────────
  useEffect(() => {
    if (!journalId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const all: StoredJournal[] = raw ? JSON.parse(raw) : [];
      const found = all.find((j) => j.id === journalId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setDate(found.date);
      setJournalNumber(found.journalNumber);
      setReference(found.reference ?? "");
      setNotes(found.notes ?? "");
      setCurrency(found.currency ?? "INR");
      setRows(
        found.lines && found.lines.length > 0
          ? found.lines.map((l, i) => ({
              id: String(rowKey + i),
              accountId: l.account ?? "",
              description: "",
              contactId: l.contact ?? "",
              debits: l.debit || "",
              credits: l.credit || "",
            }))
          : [makeRow(), makeRow()]
      );
      setReady(true);
    } catch {
      setNotFound(true);
    }
  }, [journalId]);

  // ── Row actions ────────────────────────────────────────────────────────
  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const removeRow = (id: string) =>
    setRows((prev) =>
      prev.length > 2
        ? prev.filter((r) => r.id !== id)
        : prev.map((r) =>
            r.id === id
              ? { ...r, accountId: "", description: "", contactId: "", debits: "", credits: "" }
              : r
          )
    );

  const updateRow = (
    id: string,
    field: keyof JournalRow,
    value: JournalRow[keyof JournalRow]
  ) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );

  // ── Totals ─────────────────────────────────────────────────────────────
  const totalDebits = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.debits) || 0), 0),
    [rows]
  );
  const totalCredits = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0),
    [rows]
  );
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference === 0;

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (publish: boolean) => {
    if (!notes.trim()) {
      toast.error("Notes are required");
      return;
    }
    if (!isBalanced) {
      toast.error("Debits and Credits must be equal before saving");
      return;
    }
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 400));

      const displayDate = new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const updated: StoredJournal = {
        id: journalId,
        journalNumber,
        date,
        displayDate,
        reference,
        status: publish ? "Published" : "Draft",
        notes,
        amount: totalDebits,
        currency,
        lines: rows.map((r) => ({
          account: r.accountId,
          contact: r.contactId,
          debit: Number(r.debits) || 0,
          credit: Number(r.credits) || 0,
        })),
      };

      // Update the entry in localStorage
      const raw = localStorage.getItem(STORAGE_KEY);
      const all: StoredJournal[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex((j) => j.id === journalId);
      if (idx !== -1) {
        all[idx] = updated;
      } else {
        all.unshift(updated);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

      toast.success(`Journal ${publish ? "published" : "saved as draft"}!`);
      router.push("/accountant/journal-entries");
    } catch {
      toast.error("Failed to save journal");
    } finally {
      setSaving(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────
  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col h-svh overflow-hidden">
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
                <span className="font-medium text-foreground">Edit</span>
              </span>
            }
          />
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <p className="text-lg font-medium">Journal not found</p>
              <p className="text-sm">The journal entry you&apos;re trying to edit doesn&apos;t exist.</p>
              <Button onClick={() => router.push("/accountant/journal-entries")}>
                Back to Journal Entries
              </Button>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
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
              <span className="font-medium text-foreground">Edit #{journalNumber}</span>
            </span>
          }
        />

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-auto bg-muted/5 px-8 py-6">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* ── Main fields ── */}
            <div className="bg-white border rounded-lg shadow-sm p-6 space-y-5">

              {/* Date */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-red-500 text-sm font-medium text-right">Date *</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              {/* Journal # */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-red-500 text-sm font-medium text-right">Journal# *</Label>
                <div className="relative max-w-xs">
                  <Input
                    value={journalNumber}
                    onChange={(e) => setJournalNumber(e.target.value)}
                    className="pr-9"
                  />
                  <Settings className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer" />
                </div>
              </div>

              {/* Reference */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">Reference#</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="max-w-xs"
                />
              </div>

              {/* Notes */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-start">
                <Label className="text-red-500 text-sm font-medium text-right pt-2">Notes *</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Max. 500 characters"
                  maxLength={500}
                  className="min-h-[90px] resize-y max-w-md"
                />
              </div>

              {/* Journal Type */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">Journal Type</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cash-based"
                    checked={isCashBased}
                    onCheckedChange={(c) => setIsCashBased(!!c)}
                  />
                  <Label htmlFor="cash-based" className="text-sm font-normal cursor-pointer flex items-center gap-1">
                    Cash based journal
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </Label>
                </div>
              </div>

              {/* Currency */}
              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">Currency</Label>
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

            {/* ── Journal lines table ── */}
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground w-72">Account</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Description</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground w-48">Contact ({currency})</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right w-32">Debits</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground text-right w-32">Credits</TableHead>
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
                          onValueChange={(val) => updateRow(row.id, "accountId", val)}
                        >
                          <SelectTrigger className="border-0 shadow-none focus:ring-0 h-8 text-sm text-muted-foreground">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash Account</SelectItem>
                            <SelectItem value="bank">Bank Account</SelectItem>
                            <SelectItem value="sales">Sales Account</SelectItem>
                            <SelectItem value="expense">Expense Account</SelectItem>
                            <SelectItem value="Depreciation Expense">Depreciation Expense</SelectItem>
                            <SelectItem value="Furniture and Equipment">Furniture and Equipment</SelectItem>
                            <SelectItem value="Accrued Expenses">Accrued Expenses</SelectItem>
                            <SelectItem value="Accounts Payable">Accounts Payable</SelectItem>
                            <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Description */}
                      <TableCell className="p-1 border-r">
                        <Input
                          value={row.description}
                          onChange={(e) => updateRow(row.id, "description", e.target.value)}
                          placeholder="Description"
                          className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
                        />
                      </TableCell>

                      {/* Contact */}
                      <TableCell className="p-1 border-r">
                        <Select
                          value={row.contactId}
                          onValueChange={(val) => updateRow(row.id, "contactId", val)}
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
                              e.target.value === "" ? "" : parseFloat(e.target.value)
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
                              e.target.value === "" ? "" : parseFloat(e.target.value)
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
                      <span className="w-20 text-right tabular-nums">{totalDebits.toFixed(2)}</span>
                      <span className="w-20 text-right tabular-nums">{totalCredits.toFixed(2)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total (Rs.)</span>
                    <div className="flex gap-6">
                      <span className="w-20 text-right tabular-nums">{totalDebits.toFixed(2)}</span>
                      <span className="w-20 text-right tabular-nums">{totalCredits.toFixed(2)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className={isBalanced ? "text-muted-foreground" : "text-destructive font-medium"}>
                      Difference
                    </span>
                    <span className={`w-20 text-right tabular-nums ${isBalanced ? "text-muted-foreground" : "text-destructive font-semibold"}`}>
                      {difference.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Attachments ── */}
            <div className="bg-white border rounded-lg shadow-sm p-6">
              <p className="text-sm font-medium mb-3">Attachments</p>
              <div className="flex gap-0">
                <Button variant="outline" className="rounded-r-none gap-2 text-sm">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  Upload File
                </Button>
                <Button variant="outline" size="icon" className="rounded-l-none border-l-0 px-2">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                You can upload a maximum of 5 files, 10MB each
              </p>
            </div>

          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div className="border-t bg-background px-8 py-4 flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => handleSubmit(true)}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save and Publish
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={saving}
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
