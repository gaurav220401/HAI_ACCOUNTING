"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { contactApi, type Contact } from "@/lib/api/contacts";
import { journalApi } from "@/lib/api/journals";

const toInputDate = (d: Date) => d.toISOString().split("T")[0];

type JournalRow = {
  id: string;
  accountId: string;
  description: string;
  contactId: string;
  debits: number | "";
  credits: number | "";
};

type ReportingMethod = "accrual_and_cash" | "accrual_only" | "cash_only";

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

export default function EditJournalPage() {
  const router = useRouter();
  const params = useParams();
  const journalId = params?.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [notFound, setNotFound] = useState(false);

  const [date, setDate] = useState(toInputDate(new Date()));
  const [journalNumber, setJournalNumber] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [reportingMethod, setReportingMethod] =
    useState<ReportingMethod>("accrual_and_cash");
  const [currency, setCurrency] = useState("INR");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
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

  useEffect(() => {
    if (!journalId) return;

    const loadData = async () => {
      try {
        const [accountsRes, journalRes, contactsRes] = await Promise.all([
          accountApi.list({ excludeGroups: true }),
          journalApi.getOne(journalId),
          contactApi.list({ limit: 1000 }),
        ]);

        setAccounts((accountsRes.data || []).filter((acc) => acc.isActive));
        setContacts(contactsRes.data || []);

        const journal = journalRes.data;
        setDate(toInputDate(new Date(journal.date)));
        setJournalNumber(journal.journalNumber || "");
        setReference(journal.referenceNumber || "");
        setNotes(journal.notes || journal.description || "");

        const mappedRows = (journal.lineItems || []).map((line): JournalRow => ({
          id: String(rowKey++),
          accountId:
            typeof line.accountId === "string" ?
              line.accountId
            : line.accountId?._id || "",
          description: line.narration || "",
          contactId:
            typeof line.contactId === "string" ?
              line.contactId
            : line.contactId?._id || "",
          debits: Number(line.debit || 0) || "",
          credits: Number(line.credit || 0) || "",
        }));

        if (mappedRows.length === 0) {
          setRows([makeRow(), makeRow()]);
        } else if (mappedRows.length === 1) {
          setRows([mappedRows[0], makeRow()]);
        } else {
          setRows(mappedRows);
        }

        setReady(true);
      } catch {
        setNotFound(true);
      }
    };

    void loadData();
  }, [journalId]);

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

  const handleSubmit = async (publish: boolean) => {
    if (!notes.trim()) {
      toast.error("Notes are required");
      return;
    }
    if (!isBalanced) {
      toast.error("Debits and Credits must be equal before saving");
      return;
    }

    const payloadLines = rows
      .filter(
        (r) => r.accountId && (Number(r.debits) > 0 || Number(r.credits) > 0),
      )
      .map((r) => ({
        accountId: r.accountId,
        debit: Number(r.debits) || 0,
        credit: Number(r.credits) || 0,
        narration: r.description || undefined,
        contactId: (r.contactId && r.contactId !== "none_contact") ? r.contactId : undefined,
      }));

    if (payloadLines.length < 2) {
      toast.error("Journal requires at least two line items");
      return;
    }

    setSaving(true);
    try {
      await journalApi.update(journalId, {
        date,
        referenceNumber: reference,
        status: publish ? "Posted" : "Draft",
        description: notes,
        notes,
        lineItems: payloadLines,
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (notFound) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col h-svh overflow-hidden bg-white">
          <PageHeader
            breadcrumb={
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant</span>
                <span className="text-sm font-semibold text-slate-700 mt-0.5">Edit Journal Entry</span>
              </span>
            }
          />
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-3">
              <p className="text-lg font-medium">Journal not found</p>
              <p className="text-sm">
                The journal entry you&apos;re trying to edit doesn&apos;t exist.
              </p>
              <Button
                onClick={() => router.push("/accountant/journal-entries")}
              >
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-hidden bg-white">
        <PageHeader
          breadcrumb={
            <span className="flex flex-col text-left">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant</span>
              <span className="text-sm font-semibold text-slate-700 mt-0.5">Edit Journal {journalNumber}</span>
            </span>
          }
        />

        <div className="flex-1 overflow-auto bg-muted/5 px-8 py-6">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
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

              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-red-500 text-sm font-medium text-right">
                  Journal Number *
                </Label>
                <div className="relative max-w-xs">
                  <Input value={journalNumber} readOnly className="pr-9" />
                  <Settings className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer" />
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] gap-x-6 items-center">
                <Label className="text-sm font-medium text-right">
                  Reference Number
                </Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="max-w-xs"
                />
              </div>

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

            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left w-72">
                      Account
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">
                      Description
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left w-48">
                      Contact ({currency})
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right w-32">
                      Debits
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right w-32">
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
                            <SelectItem value="none_contact">None</SelectItem>
                            {contacts.map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.displayName || c.companyName || "Unnamed Contact"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

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

              <div className="flex justify-between items-start px-4 py-3 border-t bg-muted/5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addRow}
                  className="text-teal-700 hover:text-teal-800 hover:bg-teal-50/50 gap-1.5 text-sm font-semibold rounded-md"
                >
                  <Plus className="h-4 w-4" />
                  Add New Row
                </Button>

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

        <div className="border-t bg-background px-8 py-4 flex items-center gap-3 shrink-0">
          <Button
            size="sm"
            className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            onClick={() => handleSubmit(true)}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save and Publish
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
            onClick={() => handleSubmit(false)}
            disabled={saving}
          >
            Save as Draft
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md"
            onClick={() => router.push("/accountant/journal-entries")}
          >
            Cancel
          </Button>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
