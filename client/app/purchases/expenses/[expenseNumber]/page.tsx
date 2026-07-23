"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Edit, Printer, MoreHorizontal, Copy, Trash2, BookOpen, Upload,
  ArrowLeft, RefreshCw, CheckCircle2, Clock, XCircle, DollarSign, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { expenseApi, type Expense } from "@/lib/api/expenses";
import { invoiceApi } from "@/lib/api/invoices";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getName(field: unknown): string {
  if (!field) return "—";
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, string>;
    return f.displayName || f.companyName || f.name || "—";
  }
  return "—";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(amount);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  Draft:      { label: "Draft",      color: "bg-muted text-muted-foreground border",        icon: <Clock className="h-3 w-3" /> },
  Submitted:  { label: "Submitted",  color: "bg-blue-100 text-blue-700 border-blue-200",    icon: <Clock className="h-3 w-3" /> },
  Approved:   { label: "Approved",   color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  Rejected:   { label: "Rejected",   color: "bg-red-100 text-red-700 border-red-200",       icon: <XCircle className="h-3 w-3" /> },
  Reimbursed: { label: "Reimbursed", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <DollarSign className="h-3 w-3" /> },
};

// ─── Journal Entry (computed from expense data) ───────────────────────────────

interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

function buildJournal(expense: Expense): JournalLine[] {
  const paidThrough = getName(expense.paidThroughAccountId);
  const debitAmount = expense.amount;

  if (expense.isItemized && expense.lineItems?.length) {
    const lines: JournalLine[] = [];
    for (const li of expense.lineItems) {
      const acct = typeof li.expenseAccountId === "object" && li.expenseAccountId
        ? (li.expenseAccountId as any).name : "Expense Account";
      lines.push({ account: acct, debit: li.amount, credit: 0 });
    }
    lines.push({ account: paidThrough, debit: 0, credit: debitAmount });
    return lines;
  }

  const expAccount = getName(expense.expenseAccountId);
  return [
    { account: paidThrough, debit: 0,           credit: debitAmount },
    { account: expAccount,  debit: debitAmount,  credit: 0 },
  ];
}

// ─── Print helper ───────────────────────────────────────────────────────────

function printExpense(e: Expense) {
  const acctName    = getName(e.expenseAccountId);
  const paidThrough = getName(e.paidThroughAccountId);
  const customer    = getName(e.customerId);
  const vendor      = getName(e.vendorId);

  const now = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const expDate = new Date(e.date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: e.currency ?? "INR", minimumFractionDigits: 2,
  }).format(e.amount);

  const rows: string[] = [];
  if (paidThrough !== "—") rows.push(`<div class="row"><div class="label">Paid Through</div><div class="val">${paidThrough}</div></div>`);
  if (customer !== "—")    rows.push(`<div class="row"><div class="label">Customer</div><div class="val link">${customer}</div></div>`);
  if (vendor !== "—")      rows.push(`<div class="row"><div class="label">Paid To</div><div class="val link">${vendor}</div></div>`);
  if (e.invoiceNumber)     rows.push(`<div class="row"><div class="label">Reference Number</div><div class="val">${e.invoiceNumber}</div></div>`);
  if (e.notes)             rows.push(`<div class="row"><div class="label">Notes</div><div class="val">${e.notes}</div></div>`);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Expense Details \u2013 ${e.expenseNumber ?? e._id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-size:13px; color:#111; padding:32px 40px; }
    .header-bar { display:flex; justify-content:space-between; font-size:11px; color:#666; border-bottom:1px solid #e5e7eb; padding-bottom:14px; margin-bottom:24px; }
    h1 { font-size:20px; font-weight:700; margin-bottom:20px; }
    .amount { font-size:22px; font-weight:700; color:#e84646; }
    .on-date { font-size:12px; color:#666; margin-left:6px; }
    .billable { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#888; margin-top:4px; }
    .acct-name { font-size:26px; font-weight:700; margin:20px 0; }
    hr { border:none; border-top:1px solid #e5e7eb; margin:18px 0; }
    .row { margin-bottom:14px; }
    .label { font-size:11px; color:#666; margin-bottom:2px; }
    .val { font-size:13px; font-weight:600; }
    .val.link { color:#2563eb; }
    .footer { font-size:10px; color:#aaa; margin-top:40px; border-top:1px solid #e5e7eb; padding-top:10px; }
    @media print { body { padding:20px 24px; } }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>${now}</div>
    <div>${acctName !== "\u2014" ? acctName : "Expense"} | Expenses | HAI Accounting</div>
    <div></div>
  </div>
  <h1>Expense Details</h1>
  <div class="label">Expense Amount</div>
  <div><span class="amount">${amount}</span><span class="on-date">on ${expDate}</span></div>
  <div class="billable">${e.isBillable ? "BILLABLE" : "NON-BILLABLE"}</div>
  ${acctName !== "\u2014" ? `<div class="acct-name">${acctName}</div>` : ""}
  <hr/>
  ${rows.join("\n  ")}
  <div class="footer">${window.location.origin}/purchases/expenses/${e.expenseNumber ?? e._id}</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpenseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const expenseNumber = params.expenseNumber as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [fetching, setFetching] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchExpense = useCallback(async () => {
    setFetching(true);
    try {
      const res = await expenseApi.getById(expenseNumber);
      setExpense(res.data);
    } catch {
      toast.error("Expense not found");
      router.push("/purchases/expenses");
    } finally {
      setFetching(false);
    }
  }, [expenseNumber, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchExpense();
  }, [firebaseUser, loading, activeOrganization?._id, fetchExpense]);

  async function handleDelete() {
    if (!expense) return;
    setDeleting(true);
    try {
      await expenseApi.remove(expense.expenseNumber);
      toast.success("Expense deleted");
      router.push("/purchases/expenses");
    } catch {
      toast.error("Failed to delete expense");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function handleConvertToInvoice() {
    if (!expense) return;
    const customerId = typeof expense.customerId === "object" && expense.customerId
      ? (expense.customerId as any)._id
      : expense.customerId as string | undefined;
    if (!customerId) {
      toast.error("A customer is required to convert this expense to an invoice");
      return;
    }
    const acctName = getName(expense.expenseAccountId);
    try {
      const res = await invoiceApi.create({
        customerId,
        invoiceDate: new Date().toISOString().slice(0, 10),
        items: [{
          name: acctName !== "—" ? acctName : "Expense",
          quantity: 1,
          rate: expense.amount,
          discountPercent: 0,
          taxPercent: 0,
        }],
        status: "Draft",
      });
      toast.success(`Invoice ${res.data.invoiceNumber} created from expense`);
      router.push(`/sales/invoices/${res.data._id}`);
    } catch {
      toast.error("Failed to convert expense to invoice");
    }
  }

  async function handleClone() {
    if (!expense) return;
    try {
      const res = await expenseApi.create({
        expenseType: expense.expenseType,
        date: new Date().toISOString().slice(0, 10),
        amount: expense.amount,
        currency: expense.currency,
        expenseAccountId: typeof expense.expenseAccountId === "object" && expense.expenseAccountId
          ? (expense.expenseAccountId as any)._id : expense.expenseAccountId as string | undefined,
        paidThroughAccountId: typeof expense.paidThroughAccountId === "object" && expense.paidThroughAccountId
          ? (expense.paidThroughAccountId as any)._id : expense.paidThroughAccountId as string | undefined,
        vendorId: typeof expense.vendorId === "object" && expense.vendorId
          ? (expense.vendorId as any)._id : expense.vendorId as string | undefined,
        customerId: typeof expense.customerId === "object" && expense.customerId
          ? (expense.customerId as any)._id : expense.customerId as string | undefined,
        invoiceNumber: expense.invoiceNumber,
        notes: expense.notes,
        isBillable: expense.isBillable,
        status: "Draft",
        isItemized: expense.isItemized,
        lineItems: expense.lineItems,
      });
      toast.success(`Cloned → ${res.data.expenseNumber}`);
      router.push(`/purchases/expenses/${res.data.expenseNumber}`);
    } catch {
      toast.error("Clone failed");
    }
  }

  async function handleApprove() {
    if (!expense) return;
    try {
      const res = await expenseApi.update(expense.expenseNumber, { status: "Approved" });
      toast.success("Expense approved and posted to ledger");
      setExpense(res.data);
    } catch {
      toast.error("Failed to approve expense");
    }
  }

  async function handleReject() {
    if (!expense) return;
    setRejecting(true);
    try {
      const res = await expenseApi.update(expense.expenseNumber, { status: "Rejected" });
      toast.success("Expense rejected");
      setRejectOpen(false);
      setExpense(res.data);
    } catch {
      toast.error("Failed to reject expense");
    } finally {
      setRejecting(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const statusCfg = expense ? (STATUS_CONFIG[expense.status] ?? STATUS_CONFIG.Draft) : null;
  const journalLines = expense ? buildJournal(expense) : [];
  const totalDebit = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = journalLines.reduce((s, l) => s + l.credit, 0);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <button
                onClick={() => router.push("/purchases/expenses")}
                className="hover:text-foreground transition-colors flex items-center gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Purchases
              </button>
              <span className="mx-0.5">/</span>
              <button
                onClick={() => router.push("/purchases/expenses")}
                className="hover:text-foreground transition-colors"
              >
                Expenses
              </button>
              <span className="mx-0.5">/</span>
              <span className="font-medium text-foreground">{expenseNumber}</span>
            </span>
          }
          actions={
            expense ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => router.push(`/purchases/expenses/${expenseNumber}/edit`)}
                >
                  <Edit className="h-3.5 w-3.5" /> Edit
                </Button>
                {(expense.status === "Draft" || expense.status === "Submitted" || expense.status === "Rejected") && (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 bg-green-600 hover:bg-green-700"
                    onClick={handleApprove}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                )}
                {(expense.status === "Draft" || expense.status === "Submitted" || expense.status === "Approved") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
                    onClick={() => setRejectOpen(true)}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                )}
                {expense.isBillable && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-primary border-primary/40 hover:bg-primary/5"
                    onClick={handleConvertToInvoice}
                  >
                    <FileText className="h-3.5 w-3.5" /> Convert to Invoice
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => expense && printExpense(expense)}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchExpense}
                  disabled={fetching}
                  className="px-2"
                >
                  <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-2">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem className="gap-2 text-sm" onClick={handleClone}>
                      <Copy className="h-3.5 w-3.5" /> Clone
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 text-sm text-destructive focus:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 text-sm" disabled>
                      <BookOpen className="h-3.5 w-3.5" /> View Journal
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null
          }
        />

        {/* Body */}
        <div className="flex-1 overflow-auto bg-background">
          {fetching ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !expense ? null : (
            <div className="flex min-h-full">
              {/* ── Main Content ── */}
              <div className="flex-1 p-8 max-w-3xl">

                {/* Status badge */}
                <div className="flex items-center gap-3 mb-6">
                  {statusCfg && (
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
                      statusCfg.color,
                    )}>
                      {statusCfg.icon} {statusCfg.label}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-mono">{expense.expenseNumber}</span>
                </div>

                {/* Expense Amount */}
                <div className="mb-6">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
                    Expense Amount
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-red-500">
                      {fmtAmount(expense.amount, expense.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">on {fmtDate(expense.date)}</span>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground mt-1 tracking-wide uppercase">
                    {expense.isBillable ? "BILLABLE" : "NON-BILLABLE"}
                  </p>
                </div>

                {/* Account tag / Mileage chip */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {expense.expenseType === "Mileage" ? (
                    <Badge variant="secondary" className="text-xs">
                      Mileage · {expense.distance} {expense.mileageUnit}
                    </Badge>
                  ) : expense.isItemized ? (
                    expense.lineItems?.map((li, i) => {
                      const lname = typeof li.expenseAccountId === "object" && li.expenseAccountId
                        ? (li.expenseAccountId as any).name : "Item";
                      return (
                        <Badge key={i} variant="outline" className="text-xs">
                          {lname} · {fmtAmount(li.amount, expense.currency)}
                        </Badge>
                      );
                    })
                  ) : (
                    <Badge variant="outline" className="text-xs font-normal px-3 py-1">
                      {getName(expense.expenseAccountId)}
                    </Badge>
                  )}
                </div>

                <Separator className="mb-6" />

                {/* Detail fields */}
                <div className="grid grid-cols-2 gap-x-12 gap-y-5">
                  {/* Paid Through */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Paid Through</p>
                    <p className="text-sm font-medium">{getName(expense.paidThroughAccountId)}</p>
                  </div>

                  {/* Expense Type */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Expense Type</p>
                    <p className="text-sm font-medium">{expense.expenseType}</p>
                  </div>

                  {/* Customer */}
                  {expense.customerId && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Customer</p>
                      <p className="text-sm font-medium text-primary">{getName(expense.customerId)}</p>
                    </div>
                  )}

                  {/* Vendor / Paid To */}
                  {expense.vendorId && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Paid To</p>
                      <p className="text-sm font-medium text-primary">{getName(expense.vendorId)}</p>
                    </div>
                  )}

                  {/* Invoice Number */}
                  {expense.invoiceNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Invoice Number</p>
                      <p className="text-sm font-medium">{expense.invoiceNumber}</p>
                    </div>
                  )}

                  {/* Currency */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                    <p className="text-sm font-medium">{expense.currency}</p>
                  </div>

                  {/* Mileage fields */}
                  {expense.expenseType === "Mileage" && (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Distance</p>
                        <p className="text-sm font-medium">{expense.distance} {expense.mileageUnit}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Rate per {expense.mileageUnit}</p>
                        <p className="text-sm font-medium">INR {expense.mileageRate?.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Method</p>
                        <p className="text-sm font-medium">
                          {expense.mileageCalcMethod === "DistanceTravelled" ? "Distance Travelled" : "Odometer Reading"}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Notes */}
                  {expense.notes && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                      <p className="text-sm text-muted-foreground">{expense.notes}</p>
                    </div>
                  )}
                </div>

                <Separator className="my-8" />

                {/* Journal Tab */}
                <Tabs defaultValue="journal">
                  <TabsList className="mb-4">
                    <TabsTrigger value="journal" className="flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5" /> Journal
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="journal">
                    <div className="rounded-md border overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b">
                        <p className="text-xs text-muted-foreground">
                          Amount is displayed in your base currency
                        </p>
                        <span className="text-[10px] font-bold bg-green-600 text-white rounded px-1.5 py-0.5">
                          {expense.currency}
                        </span>
                      </div>

                      {/* Section heading */}
                      <div className="px-4 pt-4 pb-2">
                        <p className="text-sm font-semibold">Expense</p>
                      </div>

                      {/* Table */}
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-t border-b bg-muted/20">
                            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Account
                            </th>
                            <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Debit
                            </th>
                            <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Credit
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {journalLines.map((line, i) => (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-muted/10">
                              <td className="px-4 py-2.5">{line.account}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {line.debit > 0 ? line.debit.toFixed(2) : "0.00"}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                {line.credit > 0 ? line.credit.toFixed(2) : "0.00"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/30">
                            <td className="px-4 py-2.5 font-semibold text-sm"></td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {totalDebit.toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {totalCredit.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* ── Right Receipts Panel ── */}
              <div className="w-72 border-l shrink-0 flex flex-col">
                <div className="p-4 border-b">
                  <p className="text-sm font-semibold">Receipts</p>
                </div>
                {expense.receiptUrls && expense.receiptUrls.length > 0 ? (
                  <div className="p-4 space-y-2">
                    {expense.receiptUrls?.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-primary hover:underline border rounded-md p-2"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Receipt {i + 1}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Upload className="h-8 w-8 text-primary/50" />
                    </div>
                    <p className="text-sm font-medium">Drag or Drop your Receipts</p>
                    <p className="text-xs text-muted-foreground">Maximum file size allowed is 10MB</p>
                    <Button variant="outline" size="sm" className="gap-2 mt-1">
                      <Upload className="h-3.5 w-3.5" /> Upload your Files
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {expenseNumber}?</AlertDialogTitle>
              <AlertDialogDescription>
                This expense will be permanently deleted and cannot be recovered.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* Reject confirm */}
        <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Expense?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to reject this expense? This will reverse any entries in your General Ledger and Trial Balance.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rejecting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={rejecting}
                onClick={(e) => {
                  e.preventDefault();
                  handleReject();
                }}
              >
                {rejecting ? "Rejecting..." : "Reject Expense"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
