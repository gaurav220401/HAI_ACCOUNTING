"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, RefreshCw, MoreHorizontal, X, ChevronDown,
  Square, Receipt, Loader2, Trash2, Clock, CheckCircle2,
  ArrowUpDown, Upload, Download, ChevronRight, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  recurringExpenseApi,
  type RecurringExpense,
} from "@/lib/api/recurring-expenses";
import type { Expense } from "@/lib/api/expenses";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, string>;
    return f.displayName || f.companyName || f.name || "";
  }
  return "";
}

function getId(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null && "_id" in field) {
    return (field as { _id: string })._id;
  }
  return String(field);
}

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

function freqLabel(rec: RecurringExpense) {
  if (rec.repeatEvery === 1) return rec.frequency;
  return `Every ${rec.repeatEvery} ${rec.frequency === "Daily" ? "Days" : rec.frequency === "Weekly" ? "Weeks" : rec.frequency === "Monthly" ? "Months" : "Years"}`;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function RecurringDetailPanel({
  rec,
  onClose,
  onDeleted,
  onStatusChange,
}: {
  rec: RecurringExpense;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onStatusChange: (updated: RecurringExpense) => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [generatedExpenses, setGeneratedExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const acctName    = getName(rec.expenseAccountId);
  const paidThrough = getName(rec.paidThroughAccountId);
  const vendorName  = getName(rec.vendorId);
  const custName    = getName(rec.customerId);

  const loadExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const res = await recurringExpenseApi.getExpenses(rec._id);
      setGeneratedExpenses(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoadingExpenses(false);
    }
  }, [rec._id]);

  useEffect(() => {
    if (activeTab === "expenses") loadExpenses();
  }, [activeTab, loadExpenses]);

  async function handleStop() {
    try {
      const res = await recurringExpenseApi.stop(rec._id);
      onStatusChange(res.data);
      toast.success("Recurring expense stopped");
    } catch {
      toast.error("Failed to stop");
    }
  }

  async function handleResume() {
    try {
      const res = await recurringExpenseApi.resume(rec._id);
      onStatusChange(res.data);
      toast.success("Recurring expense resumed");
    } catch {
      toast.error("Failed to resume");
    }
  }

  async function handleCreateExpense() {
    setCreatingExpense(true);
    try {
      const res = await recurringExpenseApi.createExpenseNow(rec._id);
      toast.success("Expense created successfully");
      if (activeTab === "expenses") loadExpenses();
    } catch {
      toast.error("Failed to create expense");
    } finally {
      setCreatingExpense(false);
    }
  }

  async function handleDelete() {
    try {
      await recurringExpenseApi.remove(rec._id);
      onDeleted(rec._id);
      toast.success("Recurring profile deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{rec.profileName}</h2>
          <Badge
            variant={rec.status === "Active" ? "default" : "secondary"}
            className={cn("text-xs px-1.5 py-0", rec.status === "Active" ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600")}
          >
            {rec.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => router.push(`/purchases/recurring-expenses/${rec._id}/edit`)}
            title="Edit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                More <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {rec.status === "Active" ? (
                <DropdownMenuItem className="gap-2 text-sm" onClick={handleStop}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="gap-2 text-sm" onClick={handleResume}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resume
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="gap-2 text-sm" onClick={handleCreateExpense} disabled={creatingExpense}>
                <Receipt className="h-3.5 w-3.5" />
                {creatingExpense ? "Creating..." : "Create Expense"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-sm text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
        <div className="border-b px-4 shrink-0">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="overview"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="expenses"
              className="h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs px-3"
            >
              All Expenses
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="flex-1 overflow-y-auto mt-0">
          <div className="p-4 space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <p className="text-sm font-bold">{fmtCurrency(rec.amount, rec.currency)}</p>
                  <p className="text-xs text-muted-foreground">Expense Amount</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-bold">{freqLabel(rec)}</p>
                  <p className="text-xs text-muted-foreground">Repeats</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <p className="text-sm font-bold">{fmtDate(rec.nextExpenseDate)}</p>
                  <p className="text-xs text-muted-foreground">Next Expense Date</p>
                </div>
              </div>
            </div>

            {/* Account grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Expense Account</p>
                <p className="font-medium text-xs">{acctName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Paid Through</p>
                <p className="font-medium text-xs">{paidThrough || "—"}</p>
              </div>
              <div className="col-span-2 border-l-2 border-orange-400 pl-3">
                <div className="flex gap-8">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Start On</p>
                    <p className="font-semibold text-xs">{fmtDate(rec.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Ends On</p>
                    <p className="font-semibold text-xs">{rec.neverExpires ? "Never Expires" : fmtDate(rec.endsOn)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Other details */}
            {(custName || vendorName || rec.notes) && (
              <div className="border-t pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Other Details</p>
                <div className="space-y-2.5 text-sm">
                  {custName && (
                    <div className="flex gap-8">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">Customer</span>
                      <button
                        onClick={() => router.push(`/sales/customers/${getId(rec.customerId)}`)}
                        className="text-xs text-blue-600 font-medium hover:underline text-left"
                      >
                        {custName}
                      </button>
                    </div>
                  )}
                  {vendorName && (
                    <div className="flex gap-8">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">Payable To</span>
                      <button
                        onClick={() => router.push(`/purchases/vendors/${getId(rec.vendorId)}`)}
                        className="text-xs text-blue-600 font-medium hover:underline text-left"
                      >
                        {vendorName}
                      </button>
                    </div>
                  )}
                  {rec.notes && (
                    <div className="flex gap-8">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">Notes</span>
                      <span className="text-xs">{rec.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* History */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">History</p>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Receipt className="h-2.5 w-2.5 text-amber-600" />
                    </div>
                    <div className="w-px flex-1 bg-border mt-1" />
                  </div>
                  <div className="pb-3">
                    <p className="text-xs font-medium">
                      Recurring profile created for {fmtCurrency(rec.amount, rec.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(rec.createdAt).toLocaleString("en-IN", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "numeric", minute: "2-digit", hour12: true,
                      })}
                    </p>
                  </div>
                </div>
                {rec.lastExpenseDate && (
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5 text-blue-600" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium">Last expense created</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(rec.lastExpenseDate)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* All Expenses tab */}
        <TabsContent value="expenses" className="flex-1 overflow-auto mt-0">
          {loadingExpenses ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : generatedExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Receipt className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No expenses generated yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs h-7"
                onClick={handleCreateExpense}
                disabled={creatingExpense}
              >
                {creatingExpense ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                Create Expense Now
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Expense Account</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Paid Through</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedExpenses.map((exp) => (
                    <tr key={exp._id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => router.push(`/purchases/expenses/${exp._id}`)}>  
                      <td className="px-4 py-2.5">{fmtDate(exp.date)}</td>
                      <td className="px-4 py-2.5">{getName(exp.expenseAccountId) || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "text-xs font-medium",
                          exp.status === "Approved" ? "text-green-600" :
                          exp.status === "Rejected" ? "text-red-500" :
                          exp.status === "Reimbursed" ? "text-blue-600" :
                          exp.isBillable ? "text-blue-500" : "text-muted-foreground"
                        )}>
                          {exp.isBillable ? "Billable" : exp.status === "Draft" ? "Non-Billable" : exp.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{getName(exp.paidThroughAccountId) || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmtCurrency(exp.amount, exp.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the recurring expense profile &quot;{rec.profileName}&quot;. Previously generated expenses will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Import Dialog ────────────────────────────────────────────────────────────

const SAMPLE_CSV_HEADERS = [
  "Recurring Expense#", "Recurrence Frequency", "Repeat Every", "Start Date", "End Date",
  "Expense Category", "Expense Type", "HSN/SAC", "Currency Code", "Exchange Rate",
  "Expense Amount", "GST Treatment", "GST Identification Number", "Destination of Supply",
  "Tax Name", "Tax Percentage", "Tax Type", "Item Tax Exemption", "Is Inclusive Tax",
  "Reason", "Expense Description", "Mileage Rate", "Distance", "Customer Name",
  "Is Billable", "Project Name", "Paid Through", "Vendor", "Branch Name", "CF.Sample Field",
].join(",");

const SAMPLE_CSV_ROW = [
  "6435", "Weeks", "1", "01/01/2026", "", "Office Supplies", "", "", "AUD", "1",
  "", "GST", "", "", "GST FREE", "10", "ItemAmount", "", "FALSE", "",
  "", "0", "0", "", "FALSE", "", "Petty Cash", "Mr. Pradeep", "Head Office", "Sample",
].join(",");

function downloadSampleFile(type: "csv" | "xls") {
  const content = `${SAMPLE_CSV_HEADERS}\n${SAMPLE_CSV_ROW}`;
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recurring-expenses-sample.${type === "xls" ? "csv" : "csv"}`;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [charEncoding, setCharEncoding] = useState("UTF-8");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() { setStep(1); setFile(null); setIsDragging(false); }
  function handleClose() { reset(); onClose(); }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">Recurring Expenses – Select File</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-4 py-5 px-6">
          {([1, 2, 3] as const).map((n, i) => (
            <div key={n} className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                  step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>{n}</div>
                <span className={cn("text-sm font-medium", step >= n ? "text-foreground" : "text-muted-foreground")}>
                  {n === 1 ? "Configure" : n === 2 ? "Map Fields" : "Preview"}
                </span>
              </div>
              {i < 2 && <div className="w-12 h-px bg-border" />}
            </div>
          ))}
        </div>

        <div className="px-6 pb-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {step === 1 && (
            <>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                className={cn(
                  "border-2 border-dashed rounded-lg p-10 flex flex-col items-center gap-3 transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20",
                  file && "border-green-400 bg-green-50"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                </div>
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <p className="text-sm font-medium">Drag and drop file to import</p>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    Choose File
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs px-2">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Maximum File Size: 25 MB • File Format: CSV or TSV or XLS
                </p>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.xls,.xlsx" className="hidden" onChange={handleFileChange} />
              </div>

              <p className="text-xs text-muted-foreground">
                Download a{" "}
                <button onClick={() => downloadSampleFile("csv")} className="text-primary underline hover:no-underline">sample csv file</button>
                {" "}or{" "}
                <button onClick={() => downloadSampleFile("xls")} className="text-primary underline hover:no-underline">sample xls file</button>
                {" "}and compare it to your import file to ensure you have the file perfect for the import.
              </p>

              {/* Character Encoding */}
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground w-36 shrink-0">Character Encoding</label>
                <Select value={charEncoding} onValueChange={setCharEncoding}>
                  <SelectTrigger className="h-9 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTF-8">UTF-8 (Unicode)</SelectItem>
                    <SelectItem value="ISO-8859-1">ISO-8859-1 (Latin-1)</SelectItem>
                    <SelectItem value="UTF-16">UTF-16</SelectItem>
                    <SelectItem value="Windows-1252">Windows-1252</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Page Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">💡</span>
                  <p className="text-sm font-semibold">Page Tips</p>
                </div>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li className="text-xs text-muted-foreground">
                    Import data with the details of GST Treatment by referring these{" "}
                    <span className="text-primary cursor-pointer underline">accepted formats.</span>
                  </li>
                  <li className="text-xs text-muted-foreground">
                    You can download the{" "}
                    <button onClick={() => downloadSampleFile("xls")} className="text-primary underline hover:no-underline">sample xls file</button>
                    {" "}to get detailed information about the data fields used while importing.
                  </li>
                  <li className="text-xs text-muted-foreground">
                    If you have files in other formats, you can convert it to an accepted file format using any online/offline converter.
                  </li>
                </ul>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Map your file columns to the system fields below.</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Your Column</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Maps To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Recurring Expense#", "Recurrence Frequency", "Repeat Every", "Start Date", "End Date",
                      "Expense Category", "Currency Code", "Expense Amount", "Vendor", "Customer Name"].map((col, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-2">{col}</td>
                        <td className="px-4 py-2 text-primary">{col}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Preview of your import data (first 5 rows).</p>
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {["Recurrence", "Repeat Every", "Start Date", "Category", "Amount", "Vendor"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      {["Weeks", "1", "01/01/2026", "Office Supplies", "–", "Mr. Pradeep"].map((v, i) => (
                        <td key={i} className="px-3 py-2">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-between w-full">
            <Button variant="outline" size="sm" onClick={step === 1 ? handleClose : () => setStep((s) => (s - 1) as 1 | 2 | 3)}>
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            <div className="flex gap-2">
              {step < 3 ? (
                <Button size="sm" onClick={() => setStep((s) => (s + 1) as 2 | 3)} disabled={step === 1 && !file}>
                  Next
                </Button>
              ) : (
                <Button size="sm" onClick={() => { toast.success("Import initiated"); handleClose(); }}>
                  Import
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export Dialog ────────────────────────────────────────────────────────────

function ExportDialog({
  open, onClose, items,
}: {
  open: boolean; onClose: () => void; items: RecurringExpense[];
}) {
  const [period, setPeriod] = useState<"all" | "specific">("all");
  const [fmt, setFmt] = useState<"csv" | "xls" | "xlsx">("csv");
  const [decimal, setDecimal] = useState("1234567.89");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [includePII, setIncludePII] = useState(false);

  function handleExport() {
    if (fmt === "csv") {
      const rows = items.map((r) => [
        r.profileName, r.frequency, r.repeatEvery, r.startDate ?? "", r.endsOn ?? "",
        "", "", "", r.currency, "1", r.amount, "", "", "", "", "", "", "", "",
        r.notes ?? "", "", "", "", "", r.isBillable ? "TRUE" : "FALSE", "",
        "", "", "",
      ].join(",")).join("\n");
      const blob = new Blob([SAMPLE_CSV_HEADERS + "\n" + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "recurring-expenses.csv"; a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.info(`${fmt.toUpperCase()} export initiated`);
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">Export Recurring Expenses</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Info banner */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md p-3">
            <svg className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            <p className="text-xs text-blue-700">You can export your data in CSV, XLS or XLSX format.</p>
          </div>

          {/* Module */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-destructive">Module *</Label>
            <Select defaultValue="recurring">
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="recurring">Recurring Expenses</SelectItem></SelectContent>
            </Select>
          </div>

          {/* Period */}
          <RadioGroup value={period} onValueChange={(v) => setPeriod(v as "all" | "specific")} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="exp-all" />
              <Label htmlFor="exp-all" className="text-sm cursor-pointer font-normal">All Recurring Expenses</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="specific" id="exp-specific" />
              <Label htmlFor="exp-specific" className="text-sm cursor-pointer font-normal">Specific Period</Label>
            </div>
          </RadioGroup>

          {/* Export Template */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              Export Template <span className="text-[10px] border rounded px-1">ⓘ</span>
            </Label>
            <Select>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select an Export Template" /></SelectTrigger>
              <SelectContent><SelectItem value="default">Default</SelectItem></SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Decimal Format */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-destructive">Decimal Format *</Label>
            <Select value={decimal} onValueChange={setDecimal}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1234567.89">1234567.89</SelectItem>
                <SelectItem value="1,234,567.89">1,234,567.89</SelectItem>
                <SelectItem value="1.234.567,89">1.234.567,89</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export File Format */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-destructive">Export File Format *</Label>
            <RadioGroup value={fmt} onValueChange={(v) => setFmt(v as "csv" | "xls" | "xlsx")} className="space-y-1.5">
              {[
                { value: "csv", label: "CSV (Comma Separated Value)" },
                { value: "xls", label: "XLS (Microsoft Excel 1997-2004 Compatible)" },
                { value: "xlsx", label: "XLSX (Microsoft Excel)" },
              ].map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`fmt-${o.value}`} />
                  <Label htmlFor={`fmt-${o.value}`} className="text-sm cursor-pointer font-normal">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Include PII */}
          <div className="flex items-center gap-2">
            <Checkbox id="pii" checked={includePII} onCheckedChange={(v) => setIncludePII(v === true)} />
            <Label htmlFor="pii" className="text-xs cursor-pointer font-normal">
              Include Sensitive Personally Identifiable Information (PII) while exporting.
            </Label>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">File Protection Password</Label>
            <div className="flex items-center gap-1 border rounded-md overflow-hidden">
              <input
                type={showPw ? "text" : "password"}
                className="flex-1 px-3 h-9 text-sm outline-none bg-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="px-2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            <strong>Note:</strong> You can export only the first 25,000 rows. If you have more rows, please initiate a backup for the data in your organization.
          </p>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleExport}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Export Current View Dialog ───────────────────────────────────────────────

function ExportCurrentViewDialog({
  open, onClose, items,
}: {
  open: boolean; onClose: () => void; items: RecurringExpense[];
}) {
  const [fmt, setFmt] = useState<"csv" | "xls" | "xlsx">("csv");
  const [decimal, setDecimal] = useState("1234567.89");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  function handleExport() {
    const rows = items.map((r) => [
      r.profileName, r.frequency, r.repeatEvery, r.startDate ?? "", r.endsOn ?? "",
      r.currency, r.amount, r.status,
    ].join(",")).join("\n");
    const header = "Profile Name,Frequency,Repeat Every,Start Date,End Date,Currency,Amount,Status";
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "recurring-expenses-view.csv"; a.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">Export Current View</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md p-3">
            <svg className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
            <p className="text-xs text-blue-700">Only the current view with its visible columns will be exported in CSV or XLS format.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-destructive">Decimal Format *</Label>
            <Select value={decimal} onValueChange={setDecimal}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1234567.89">1234567.89</SelectItem>
                <SelectItem value="1,234,567.89">1,234,567.89</SelectItem>
                <SelectItem value="1.234.567,89">1.234.567,89</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-destructive">Export File Format *</Label>
            <RadioGroup value={fmt} onValueChange={(v) => setFmt(v as "csv" | "xls" | "xlsx")} className="space-y-1.5">
              {[
                { value: "csv", label: "CSV (Comma Separated Value)" },
                { value: "xls", label: "XLS (Microsoft Excel 1997-2004 Compatible)" },
                { value: "xlsx", label: "XLSX (Microsoft Excel)" },
              ].map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`cv-fmt-${o.value}`} />
                  <Label htmlFor={`cv-fmt-${o.value}`} className="text-sm cursor-pointer font-normal">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">File Protection Password</Label>
            <div className="flex items-center gap-1 border rounded-md overflow-hidden">
              <input
                type={showPw ? "text" : "password"}
                className="flex-1 px-3 h-9 text-sm outline-none bg-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="px-2 text-muted-foreground hover:text-foreground" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            <strong>Note:</strong> You can export only the first 10,000 rows.
          </p>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleExport}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecurringExpensesPage() {
  const router = useRouter();
  const { firebaseUser, loading: authLoading } = useAuth();

  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "Active" | "Stopped">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null);

  // Sort
  const [sortField, setSortField] = useState<"profileName" | "amount" | "nextExpenseDate" | "status">("profileName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Bulk selection
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showExportView, setShowExportView] = useState(false);

  const selected = items.find((i) => i._id === selectedId) ?? null;
  const panelOpen = !!selected;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const res = await recurringExpenseApi.list(params);
      setItems(res.data);
    } catch {
      toast.error("Failed to load recurring expenses");
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => {
    if (!authLoading && firebaseUser) load();
  }, [authLoading, firebaseUser, load]);

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i._id !== id));
    if (selectedId === id) setSelectedId(null);
    setCheckedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  function handleStatusChange(updated: RecurringExpense) {
    setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)));
  }

  // Sort + derive displayed list
  const displayItems = [...items].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    if (sortField === "profileName") { av = a.profileName.toLowerCase(); bv = b.profileName.toLowerCase(); }
    else if (sortField === "amount") { av = a.amount; bv = b.amount; }
    else if (sortField === "nextExpenseDate") { av = a.nextExpenseDate ?? ""; bv = b.nextExpenseDate ?? ""; }
    else if (sortField === "status") { av = a.status; bv = b.status; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Checkbox helpers
  const allChecked = displayItems.length > 0 && displayItems.every((i) => checkedIds.has(i._id));
  const anyChecked = checkedIds.size > 0;
  function toggleAll() {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(displayItems.map((i) => i._id)));
  }
  function toggleOne(id: string) {
    setCheckedIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  // Bulk actions
  async function bulkStop() {
    const ids = [...checkedIds];
    await Promise.allSettled(ids.map((id) => recurringExpenseApi.stop(id)));
    await load(); setCheckedIds(new Set()); toast.success(`${ids.length} profile(s) stopped`);
  }
  async function bulkResume() {
    const ids = [...checkedIds];
    await Promise.allSettled(ids.map((id) => recurringExpenseApi.resume(id)));
    await load(); setCheckedIds(new Set()); toast.success(`${ids.length} profile(s) resumed`);
  }
  async function bulkDelete() {
    const ids = [...checkedIds];
    await Promise.allSettled(ids.map((id) => recurringExpenseApi.remove(id)));
    setItems((prev) => prev.filter((i) => !ids.includes(i._id)));
    if (ids.includes(selectedId ?? "")) setSelectedId(null);
    setCheckedIds(new Set()); toast.success(`${ids.length} profile(s) deleted`);
  }

  function setSortBy(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Recurring Expenses</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => router.push("/purchases/recurring-expenses/new")}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-xs">
                      <ArrowUpDown className="h-3.5 w-3.5" /> Sort by
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48">
                      {([
                        { field: "profileName", label: "Profile Name" },
                        { field: "amount",      label: "Amount" },
                        { field: "nextExpenseDate", label: "Next Expense Date" },
                        { field: "status",      label: "Status" },
                      ] as const).map(({ field, label }) => (
                        <DropdownMenuItem key={field} className="text-xs gap-2" onClick={() => setSortBy(field)}>
                          {label}
                          {sortField === field && (
                            <span className="ml-auto text-primary">{sortDir === "asc" ? "↑" : "↓"}</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-xs" onClick={() => setShowImport(true)}>
                    <Upload className="h-3.5 w-3.5" /> Import Recurring Expenses
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-xs">
                      <Download className="h-3.5 w-3.5" /> Export
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48">
                      <DropdownMenuItem className="text-xs" onClick={() => setShowExport(true)}>
                        Export Recurring Expenses
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" onClick={() => setShowExportView(true)}>
                        Export Current View
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-xs" onClick={load}>
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh List
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
        <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
          {/* Toolbar — bulk action bar when selections exist, normal bar otherwise */}
          {anyChecked && !panelOpen ? (
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-blue-50 shrink-0">
              <Checkbox
                checked={allChecked}
                onCheckedChange={toggleAll}
                className="border-blue-400"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => toast.info("Bulk Update coming soon")}>
                Bulk Update
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button variant="ghost" size="sm" className="h-7 text-xs px-3" onClick={bulkResume}>Resume</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-3" onClick={bulkStop}>Stop</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-3 text-destructive hover:text-destructive" onClick={bulkDelete}>Delete</Button>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-xs font-medium text-blue-700">{checkedIds.size} Selected</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={() => setCheckedIds(new Set())}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center px-4 py-2 border-b shrink-0 gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-xs"
                  placeholder="Search profiles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    {filterStatus || "All Profiles"} <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => setFilterStatus("")}>All Profiles</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Active")}>Active</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Stopped")}>Stopped</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* List */}
            <div className={cn(
              "flex flex-col border-r overflow-hidden transition-all duration-200",
              panelOpen ? "w-[340px] shrink-0" : "flex-1"
            )}>
              {loading ? (
                <div className="flex items-center justify-center flex-1">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-6">
                  <RefreshCw className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No recurring expenses</p>
                  <p className="text-xs text-muted-foreground mt-1">Create your first recurring expense profile</p>
                  <Button
                    size="sm"
                    className="mt-4 text-xs gap-1"
                    onClick={() => router.push("/purchases/recurring-expenses/new")}
                  >
                    <Plus className="h-3.5 w-3.5" /> New Recurring Expense
                  </Button>
                </div>
              ) : panelOpen ? (
                /* Compact list when panel open */
                <div className="flex-1 overflow-y-auto">
                  {/* Compact header with bulk actions */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                      className="h-3.5 w-3.5"
                    />
                    {anyChecked ? (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-6 text-xs gap-1 px-2">
                              Bulk Actions <ChevronDown className="h-2.5 w-2.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44">
                            <DropdownMenuItem className="text-xs" onClick={() => toast.info("Bulk Update coming soon")}>Bulk Update</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs" onClick={bulkResume}>Resume</DropdownMenuItem>
                            <DropdownMenuItem className="text-xs" onClick={bulkStop}>Stop</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-xs text-destructive focus:text-destructive" onClick={bulkDelete}>Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <span className="text-[11px] font-medium text-blue-700">{checkedIds.size} Selected</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => setCheckedIds(new Set())}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs gap-1 px-2"
                        onClick={() => router.push("/purchases/recurring-expenses/new")}
                      >
                        <Plus className="h-3 w-3" /> New
                      </Button>
                    )}
                  </div>
                  {displayItems.map((rec) => (
                    <div
                      key={rec._id}
                      className={cn(
                        "flex items-start gap-2 px-3 py-2.5 border-b hover:bg-muted/40 transition-colors",
                        selectedId === rec._id && "bg-blue-50 border-l-2 border-l-primary"
                      )}
                    >
                      <Checkbox
                        checked={checkedIds.has(rec._id)}
                        onCheckedChange={() => toggleOne(rec._id)}
                        className="h-3.5 w-3.5 mt-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        className="flex-1 text-left min-w-0"
                        onClick={() => setSelectedId(rec._id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate text-blue-600">{rec.profileName}</span>
                          <span className="text-xs font-semibold shrink-0 ml-2">{fmtCurrency(rec.amount, rec.currency)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{getName(rec.expenseAccountId) || "—"}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={cn(
                            "text-[10px] font-semibold uppercase",
                            rec.status === "Active" ? "text-green-700" : "text-gray-500"
                          )}>
                            {rec.status}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{freqLabel(rec)}</span>
                        </div>
                        {rec.nextExpenseDate && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Next expense date {fmtDate(rec.nextExpenseDate)}
                          </p>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* Table when no panel open */
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="px-4 py-2.5 w-8">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={toggleAll}
                            className="h-3.5 w-3.5"
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Profile Name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Expense Account</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Vendor Name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Frequency</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Last Expense Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Next Expense Date</th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Status</th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground uppercase text-[10px] tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((rec) => (
                        <tr
                          key={rec._id}
                          className={cn(
                            "border-b hover:bg-muted/30 cursor-pointer transition-colors",
                            checkedIds.has(rec._id) && "bg-blue-50"
                          )}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={checkedIds.has(rec._id)}
                              onCheckedChange={() => toggleOne(rec._id)}
                              className="h-3.5 w-3.5"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-blue-600" onClick={() => setSelectedId(rec._id)}>{rec.profileName}</td>
                          <td className="px-4 py-3 text-muted-foreground" onClick={() => setSelectedId(rec._id)}>{getName(rec.expenseAccountId) || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground" onClick={() => setSelectedId(rec._id)}>{getName(rec.vendorId) || "—"}</td>
                          <td className="px-4 py-3" onClick={() => setSelectedId(rec._id)}>{freqLabel(rec)}</td>
                          <td className="px-4 py-3 text-muted-foreground" onClick={() => setSelectedId(rec._id)}>{fmtDate(rec.lastExpenseDate)}</td>
                          <td className="px-4 py-3" onClick={() => setSelectedId(rec._id)}>{fmtDate(rec.nextExpenseDate)}</td>
                          <td className="px-4 py-3" onClick={() => setSelectedId(rec._id)}>
                            <span className={cn(
                              "text-xs font-semibold uppercase tracking-wide",
                              rec.status === "Active" ? "text-green-600" : "text-gray-500"
                            )}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium" onClick={() => setSelectedId(rec._id)}>
                            {fmtCurrency(rec.amount, rec.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Detail panel */}
            {panelOpen && selected && (
              <div className="flex-1 overflow-hidden">
                <RecurringDetailPanel
                  rec={selected}
                  onClose={() => setSelectedId(null)}
                  onDeleted={handleDeleted}
                  onStatusChange={handleStatusChange}
                />
              </div>
            )}
          </div>
        </div>
      </SidebarInset>

      {/* Dialogs */}
      <ImportDialog open={showImport} onClose={() => setShowImport(false)} />
      <ExportDialog open={showExport} onClose={() => setShowExport(false)} items={displayItems} />
      <ExportCurrentViewDialog open={showExportView} onClose={() => setShowExportView(false)} items={displayItems} />
    </SidebarProvider>
  );
}
