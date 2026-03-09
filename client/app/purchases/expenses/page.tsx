"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Receipt, Loader2, MoreHorizontal, Trash2, Edit, Copy,
  X, Printer, BookOpen, Upload, RefreshCw, ChevronDown, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { expenseApi, type Expense } from "@/lib/api/expenses";
import { invoiceApi } from "@/lib/api/invoices";
import { cn } from "@/lib/utils";

// ─── Print helper ─────────────────────────────────────────────────────────────

function printExpense(e: Expense) {
  const acctName    = getName(e.expenseAccountId);
  const paidThrough = getName(e.paidThroughAccountId);
  const customer    = getName(e.customerId);
  const vendor      = getName(e.vendorId);

  const now = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const appName = "HAI Accounting";
  const expDate = new Date(e.date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: e.currency ?? "INR",
    minimumFractionDigits: 2,
  }).format(e.amount);

  const rows: string[] = [];
  if (paidThrough) rows.push(`<div class="row"><div class="label">Paid Through</div><div class="val">${paidThrough}</div></div>`);
  if (customer)    rows.push(`<div class="row"><div class="label">Customer</div><div class="val link">${customer}</div></div>`);
  if (vendor)      rows.push(`<div class="row"><div class="label">Paid To</div><div class="val link">${vendor}</div></div>`);
  if (e.invoiceNumber) rows.push(`<div class="row"><div class="label">Reference #</div><div class="val">${e.invoiceNumber}</div></div>`);
  if (e.notes)     rows.push(`<div class="row"><div class="label">Notes</div><div class="val">${e.notes}</div></div>`);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Expense Details – ${e.expenseNumber ?? e._id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size:13px; color:#111; padding:32px 40px; }
    .header-bar { display:flex; justify-content:space-between; align-items:flex-start; font-size:11px; color:#666; border-bottom:1px solid #e5e7eb; padding-bottom:14px; margin-bottom:24px; }
    .header-bar .center { text-align:center; }
    h1 { font-size:20px; font-weight:700; margin-bottom:20px; }
    .amount { font-size:22px; font-weight:700; color:#e84646; }
    .on-date { font-size:12px; color:#666; margin-left:6px; }
    .billable { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:#888; margin-top:4px; }
    .acct-name { font-size:26px; font-weight:700; color:#111; margin:20px 0; }
    hr { border:none; border-top:1px solid #e5e7eb; margin:18px 0; }
    .row { margin-bottom:14px; }
    .label { font-size:11px; color:#666; margin-bottom:2px; }
    .val { font-size:13px; font-weight:600; color:#111; }
    .val.link { color:#2563eb; }
    .footer { font-size:10px; color:#aaa; margin-top:40px; border-top:1px solid #e5e7eb; padding-top:10px; }
    @media print { body { padding:20px 24px; } }
  </style>
</head>
<body>
  <div class="header-bar">
    <div>${now}</div>
    <div class="center">${acctName || "Expense"} | Expenses | ${appName}</div>
    <div></div>
  </div>

  <h1>Expense Details</h1>

  <div class="label">Expense Amount</div>
  <div>
    <span class="amount">${amount}</span>
    <span class="on-date">on ${expDate}</span>
  </div>
  <div class="billable">${e.isBillable ? "BILLABLE" : "NON-BILLABLE"}</div>

  ${acctName ? `<div class="acct-name">${acctName}</div>` : ""}

  <hr/>

  ${rows.join("\n  ")}

  <div class="footer">${window.location.origin}/purchases/expenses/${e.expenseNumber ?? e._id}</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=700");
  if (!win) { window.print(); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, string>;
    return f.displayName || f.companyName || f.name || "";
  }
  return "";
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtDateLong(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Journal builder ─────────────────────────────────────────────────────────

interface JournalLine { account: string; debit: number; credit: number }

function buildJournal(e: Expense): JournalLine[] {
  const paid = getName(e.paidThroughAccountId) || "Paid Through";
  if (e.isItemized && e.lineItems?.length) {
    const lines: JournalLine[] = e.lineItems.map((li) => ({
      account: typeof li.expenseAccountId === "object" && li.expenseAccountId
        ? (li.expenseAccountId as any).name : "Expense Account",
      debit: li.amount, credit: 0,
    }));
    lines.push({ account: paid, debit: 0, credit: e.amount });
    return lines;
  }
  return [
    { account: paid,                                          debit: 0,       credit: e.amount },
    { account: getName(e.expenseAccountId) || "Expense Account", debit: e.amount, credit: 0 },
  ];
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ExpenseDetailPanel({
  expense,
  onClose,
  onDelete,
  onClone,
  onEdit,
  onConvertToInvoice,
}: {
  expense: Expense;
  onClose: () => void;
  onDelete: (e: Expense) => void;
  onClone: (e: Expense) => void;
  onEdit: (e: Expense) => void;
  onConvertToInvoice: (e: Expense) => void;
}) {
  const journalLines = buildJournal(expense);
  const totalD = journalLines.reduce((s, l) => s + l.debit, 0);
  const totalC = journalLines.reduce((s, l) => s + l.credit, 0);
  const acctName    = getName(expense.expenseAccountId);
  const customerName = getName(expense.customerId);
  const vendorName   = getName(expense.vendorId);
  const paidThrough  = getName(expense.paidThroughAccountId);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
        <h2 className="text-sm font-semibold">Expense Details</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded p-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => onEdit(expense)}>
          <Edit className="h-3.5 w-3.5" /> Edit
        </Button>
        {expense.isBillable && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7 text-primary" onClick={() => onConvertToInvoice(expense)}>
            <FileText className="h-3.5 w-3.5" /> Convert to Invoice
          </Button>
        )}
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" disabled>
          <RefreshCw className="h-3.5 w-3.5" /> Make Recurring
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={() => printExpense(expense)}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="gap-2 text-sm bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground cursor-pointer"
              onClick={() => onClone(expense)}
            >
              <Copy className="h-3.5 w-3.5" /> Clone
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-sm text-destructive focus:text-destructive cursor-pointer"
              onClick={() => onDelete(expense)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-sm" disabled>
              <BookOpen className="h-3.5 w-3.5" /> View Journal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Scrollable body + receipts */}
      <div className="flex flex-1 overflow-hidden">

        {/* Main */}
        <div className="flex-1 overflow-y-auto p-5 space-y-0">

          {/* Amount */}
          <div className="mb-5">
            <p className="text-xs text-muted-foreground mb-1">Expense Amount</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold" style={{ color: "#e84646" }}>
                {fmtCurrency(expense.amount, expense.currency)}
              </span>
              <span className="text-xs text-muted-foreground">on {fmtDateLong(expense.date)}</span>
            </div>
            <p className="text-[11px] font-semibold tracking-widest text-muted-foreground mt-1 uppercase">
              {expense.isBillable ? "Billable" : "Non-billable"}
            </p>
          </div>

          {/* Account chips */}
          <div className="flex flex-wrap gap-2 mb-5">
            {expense.expenseType === "Mileage" ? (
              <span className="text-xs border rounded px-2.5 py-1 bg-muted/30 font-medium">
                Mileage · {expense.distance} {expense.mileageUnit}
              </span>
            ) : expense.isItemized ? (
              expense.lineItems?.map((li, i) => {
                const n = typeof li.expenseAccountId === "object" && li.expenseAccountId
                  ? (li.expenseAccountId as any).name : "Item";
                return <span key={i} className="text-xs border rounded px-2.5 py-1 bg-muted/30 font-medium">{n}</span>;
              })
            ) : acctName ? (
              <span className="text-xs border rounded px-2.5 py-1 bg-muted/30 font-medium">{acctName}</span>
            ) : null}
          </div>

          <Separator className="mb-5" />

          {/* Info rows */}
          <div className="space-y-4 text-sm mb-5">
            {paidThrough && (
              <div>
                <p className="text-xs text-muted-foreground">Paid Through</p>
                <p className="font-medium mt-0.5">{paidThrough}</p>
              </div>
            )}
            {customerName && (
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="mt-0.5 text-primary font-medium">{customerName}</p>
              </div>
            )}
            {vendorName && (
              <div>
                <p className="text-xs text-muted-foreground">Paid To</p>
                <p className="mt-0.5 text-primary font-medium">{vendorName}</p>
              </div>
            )}
            {expense.invoiceNumber && (
              <div>
                <p className="text-xs text-muted-foreground">Reference #</p>
                <p className="font-medium mt-0.5">{expense.invoiceNumber}</p>
              </div>
            )}
            {expense.expenseType === "Mileage" && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground">Distance</p>
                  <p className="font-medium mt-0.5">{expense.distance} {expense.mileageUnit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate / {expense.mileageUnit}</p>
                  <p className="font-medium mt-0.5">INR {expense.mileageRate?.toFixed(2)}</p>
                </div>
              </>
            )}
            {expense.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-muted-foreground text-xs mt-0.5">{expense.notes}</p>
              </div>
            )}
          </div>

          <Separator className="mb-5" />

          {/* Journal */}
          <Tabs defaultValue="journal">
            <TabsList className="h-8 mb-3">
              <TabsTrigger value="journal" className="text-xs h-7 px-3">Journal</TabsTrigger>
            </TabsList>
            <TabsContent value="journal">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                Amount is displayed in your base currency
                <span className="bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {expense.currency}
                </span>
              </div>
              <p className="text-sm font-semibold mb-2">Expense</p>
              <table className="w-full text-sm border rounded-md overflow-hidden">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Debit</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                      <td className="px-3 py-2.5">{l.account}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.debit.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.credit.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20 font-semibold">
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 text-right tabular-nums">{totalD.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{totalC.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </TabsContent>
          </Tabs>
        </div>

        {/* Receipts sidebar */}
        <div className="w-48 shrink-0 border-l flex flex-col bg-muted/5">
          {expense.receiptUrls && expense.receiptUrls.length > 0 ? (
            <div className="p-3 space-y-2 overflow-auto">
              {expense.receiptUrls.map((url, i) => (
                <a
                  key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary hover:underline border rounded p-2"
                >
                  <Upload className="h-3 w-3 shrink-0" /> Receipt {i + 1}
                </a>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                <Upload className="h-6 w-6 text-primary/40" />
              </div>
              <p className="text-xs font-medium leading-snug">Drag or Drop your Receipts</p>
              <p className="text-[10px] text-muted-foreground leading-snug">Maximum file size allowed is 10MB</p>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 mt-1 w-full">
                <Upload className="h-3 w-3" /> Upload your Files
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [expenses, setExpenses]   = useState<Expense[]>([]);
  const [fetching, setFetching]   = useState(false);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Expense | null>(null);
  const [toDelete, setToDelete]   = useState<Expense | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [activeListTab, setActiveListTab] = useState<"expenses" | "receipts">("expenses");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchExpenses = useCallback(async () => {
    setFetching(true);
    try {
      const res = await expenseApi.list({ page: 1, limit: 100 });
      setExpenses(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchExpenses();
  }, [firebaseUser, loading, activeOrganization?._id, fetchExpenses]);

  const filtered = expenses.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [
      getName(e.expenseAccountId), getName(e.vendorId), getName(e.customerId),
      getName(e.paidThroughAccountId), e.invoiceNumber || "", e.notes || "", e.expenseNumber || "",
    ].some((v) => v.toLowerCase().includes(s));
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await expenseApi.remove(toDelete.expenseNumber || toDelete._id);
      toast.success("Expense deleted");
      setExpenses((prev) => prev.filter((e) => e._id !== toDelete._id));
      if (selected?._id === toDelete._id) setSelected(null);
    } catch { toast.error("Failed to delete expense"); }
    finally { setDeleting(false); setToDelete(null); }
  }

  async function handleConvertToInvoice(expense: Expense) {
    const customerId = typeof expense.customerId === "object" && expense.customerId
      ? (expense.customerId as any)._id
      : expense.customerId as string | undefined;
    if (!customerId) {
      toast.error("A customer is required to convert this expense to an invoice");
      return;
    }
    const acctName = getName(expense.expenseAccountId) || "Expense";
    try {
      const res = await invoiceApi.create({
        customerId,
        invoiceDate: new Date().toISOString().slice(0, 10),
        items: [{
          name: acctName,
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

  async function handleClone(expense: Expense) {
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
        isBillable: expense.isBillable, status: "Draft",
      });
      toast.success(`Cloned → ${res.data.expenseNumber}`);
      await fetchExpenses();
      setSelected(res.data);
    } catch { toast.error("Clone failed"); }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const panelOpen = !!selected;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Expenses</span>
            </span>
          }
          actions={
            !panelOpen ? (
              <>
                <div className="relative w-52">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 h-8 text-sm" placeholder="Search expenses…"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Button variant="outline" size="sm" onClick={fetchExpenses} disabled={fetching} className="px-2">
                  <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => router.push("/purchases/expenses/new")}>
                  <Plus className="h-4 w-4" /> New Expense
                </Button>
              </>
            ) : null
          }
        />

        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT panel ── */}
          <div className={cn(
            "flex flex-col border-r transition-all duration-200 overflow-hidden",
            panelOpen ? "w-[320px] shrink-0" : "flex-1",
          )}>

            {/* List header */}
            <div className={cn(
              "flex items-center shrink-0 border-b",
              panelOpen ? "px-3 py-2 justify-between" : "px-4 pt-1",
            )}>
              {panelOpen ? (
                <>
                  <button className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors">
                    All Expenses <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-1">
                    <Button size="icon" className="h-6 w-6"
                      onClick={() => router.push("/purchases/expenses/new")}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-0">
                  {(["receipts", "expenses"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveListTab(tab)}
                      className={cn(
                        "text-sm pb-2 mr-5 flex items-center gap-1 border-b-2 -mb-px transition-colors",
                        activeListTab === tab
                          ? "border-primary text-primary font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab === "receipts" ? "Receipts Inbox" : <>All Expenses <ChevronDown className="h-3 w-3" /></>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search when narrow */}
            {panelOpen && (
              <div className="px-2 py-1.5 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="pl-7 h-7 text-xs" placeholder="Search…"
                    value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            )}

            {/* Content */}
            {fetching ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 && !panelOpen ? (
              /* Empty state */
              <div className="flex flex-col items-center py-16 gap-5 flex-1 overflow-auto px-6">
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-1">Time To Manage Your Expenses!</h2>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Create and manage expenses that are part of your organization&apos;s operating costs.
                  </p>
                </div>
                <Button onClick={() => router.push("/purchases/expenses/new")} className="px-6">
                  <Receipt className="h-4 w-4 mr-2" /> RECORD EXPENSE
                </Button>
                <div className="border rounded-xl p-8 bg-muted/20 max-w-3xl w-full">
                  <p className="text-center text-sm font-medium text-muted-foreground mb-6">Life cycle of an Expense</p>
                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    <div className="border-2 border-blue-300 rounded-lg px-4 py-3 bg-white text-xs font-medium text-center w-32">
                      <Receipt className="h-4 w-4 mx-auto mb-1 text-blue-500" /> EXPENSE INCURRED
                    </div>
                    <span className="text-muted-foreground text-lg">→</span>
                    <div className="border-2 border-green-300 rounded-lg px-4 py-3 bg-white text-xs font-medium text-center w-32">
                      <Receipt className="h-4 w-4 mx-auto mb-1 text-green-500" /> RECORD EXPENSE
                    </div>
                    <span className="text-muted-foreground text-lg">→</span>
                    <div className="flex flex-col gap-2">
                      <div className="border-2 border-blue-200 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center">BILLABLE → INVOICE → REIMBURSED</div>
                      <div className="border-2 border-orange-200 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center">NON-BILLABLE</div>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1 max-w-sm w-full">
                  {[
                    "Record a single expense or record expenses in bulk.",
                    "Set mileage rates and record expenses based on distance travelled.",
                    "Convert an expense into an invoice to get it reimbursed.",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : panelOpen ? (
              /* Narrow rows */
              <div className="flex-1 overflow-y-auto divide-y">
                {filtered.map((exp) => {
                  const acct = getName(exp.expenseAccountId) || (exp.expenseType === "Mileage" ? "Mileage" : "Expense");
                  const vendor = getName(exp.vendorId);
                  const isSel = selected?._id === exp._id;
                  return (
                    <div
                      key={exp._id}
                      onClick={() => setSelected(exp)}
                      className={cn(
                        "flex items-start gap-2 px-3 py-3 cursor-pointer hover:bg-muted/20 transition-colors",
                        isSel && "bg-blue-50 border-l-2 border-l-primary",
                      )}
                    >
                      <input type="checkbox" className="accent-primary mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2 items-start">
                          <p className={cn("text-xs font-medium truncate", isSel ? "text-primary" : "")}>
                            {acct}
                          </p>
                          <p className="text-xs font-semibold tabular-nums shrink-0">
                            {fmtCurrency(exp.amount, exp.currency)}
                          </p>
                        </div>
                        <div className="flex gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span>{fmtDate(exp.date)}</span>
                          {vendor && <><span>·</span><span className="truncate">{vendor}</span></>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Full table */
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm min-w-[860px]">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b">
                      <th className="w-10 px-3 py-3">
                        <input type="checkbox" className="accent-primary" />
                      </th>
                      {[
                        "Date", "Expense Account", "Reference #",
                        "Vendor Name", "Paid Through", "Customer Name", "Status",
                      ].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                      <th className="text-right px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((expense) => {
                      const acct       = getName(expense.expenseAccountId) || (expense.expenseType === "Mileage" ? "Mileage" : "");
                      const vendor     = getName(expense.vendorId);
                      const customer   = getName(expense.customerId);
                      const paidThru   = getName(expense.paidThroughAccountId);
                      return (
                        <tr
                          key={expense._id}
                          className="hover:bg-muted/20 cursor-pointer group"
                          onClick={() => setSelected(expense)}
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="accent-primary" />
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(expense.date)}</td>
                          <td className="px-3 py-2.5 text-primary font-medium">{acct}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{expense.invoiceNumber || ""}</td>
                          <td className="px-3 py-2.5">{vendor}</td>
                          <td className="px-3 py-2.5">{paidThru}</td>
                          <td className="px-3 py-2.5">{customer}</td>
                          <td className="px-3 py-2.5">
                            <span className={cn(
                              "text-[11px] font-semibold tracking-wide uppercase",
                              expense.isBillable ? "text-green-700" : "text-muted-foreground",
                            )}>
                              {expense.isBillable ? "Billable" : "Non-billable"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                            {fmtCurrency(expense.amount, expense.currency)}
                          </td>
                          <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem className="gap-2 text-sm"
                                  onClick={() => router.push(`/purchases/expenses/${expense.expenseNumber || expense._id}/edit`)}>
                                  <Edit className="h-3.5 w-3.5" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-sm" onClick={() => handleClone(expense)}>
                                  <Copy className="h-3.5 w-3.5" /> Clone
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-sm text-destructive focus:text-destructive"
                                  onClick={() => setToDelete(expense)}>
                                  <Trash2 className="h-3.5 w-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── RIGHT: detail panel ── */}
          {panelOpen && selected && (
            <div className="flex-1 overflow-hidden">
              <ExpenseDetailPanel
                expense={selected}
                onClose={() => setSelected(null)}
                onDelete={(e) => setToDelete(e)}
                onClone={handleClone}
                onEdit={(e) => router.push(`/purchases/expenses/${e.expenseNumber || e._id}/edit`)}
                onConvertToInvoice={handleConvertToInvoice}
              />
            </div>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
              <AlertDialogDescription>This expense will be permanently deleted and cannot be recovered.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete} disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
