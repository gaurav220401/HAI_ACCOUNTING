"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Search, Receipt, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { expenseApi, type Expense } from "@/lib/api/expenses";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Reimbursed: "bg-purple-100 text-purple-700",
};

export default function ExpensesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchExpenses();
  }, [firebaseUser, loading, activeOrganization?._id, fetchExpenses]);

  const filtered = expenses.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const account = typeof e.expenseAccountId === "object" && e.expenseAccountId
      ? e.expenseAccountId.name : "";
    const vendor = typeof e.vendorId === "object" && e.vendorId
      ? (e.vendorId.displayName || e.vendorId.companyName || "") : "";
    return account.toLowerCase().includes(s) || vendor.toLowerCase().includes(s)
      || (e.invoiceNumber || "").toLowerCase().includes(s) || (e.notes || "").toLowerCase().includes(s);
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await expenseApi.remove(toDelete._id);
      toast.success("Expense deleted");
      setExpenses((prev) => prev.filter((e) => e._id !== toDelete._id));
    } catch {
      toast.error("Failed to delete expense");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
              <span className="font-medium text-foreground">Expenses</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses…"
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchExpenses} disabled={fetching}>
                <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              </Button>
              <Button size="sm" onClick={() => router.push("/purchases/expenses/new")}>
                <Plus className="h-4 w-4 mr-1" />
                New Expense
              </Button>
            </>
          }
        />

        {/* Body */}
        <div className="flex-1 overflow-auto">
          <div className="px-6 pt-5 pb-2">
            <h1 className="text-xl font-bold">All Expenses</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} expense{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          {fetching ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            /* ── Empty state (Zoho style) ── */
            <div className="flex flex-col items-center py-16 gap-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-1">Time To Manage Your Expenses!</h2>
                <p className="text-sm text-muted-foreground">
                  Create and manage expenses that are part of your organization&apos;s operating costs.
                </p>
              </div>
              <Button onClick={() => router.push("/purchases/expenses/new")} className="px-6">
                <Receipt className="h-4 w-4 mr-2" /> RECORD EXPENSE
              </Button>

              {/* Lifecycle diagram */}
              <div className="mt-6 border rounded-xl p-8 bg-muted/20 max-w-3xl w-full mx-6">
                <p className="text-center text-sm font-medium text-muted-foreground mb-6">Life cycle of an Expense</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {/* Step 1 */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="border-2 border-blue-300 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center w-28">
                      <Receipt className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                      EXPENSE INCURRED
                    </div>
                  </div>
                  <div className="text-muted-foreground text-lg">→</div>
                  {/* Step 2 */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="border-2 border-green-300 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center w-28">
                      <Receipt className="h-4 w-4 mx-auto mb-1 text-green-500" />
                      RECORD EXPENSE
                    </div>
                  </div>
                  <div className="text-muted-foreground text-lg">→</div>
                  {/* Branch */}
                  <div className="flex flex-col gap-3">
                    <div className="border-2 border-blue-200 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center">
                      BILLABLE → CONVERT TO INVOICE → GET REIMBURSED
                    </div>
                    <div className="border-2 border-orange-200 rounded-lg px-4 py-2 bg-white text-xs font-medium text-center">
                      NON-BILLABLE
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 max-w-xl text-left px-6 space-y-2">
                <p className="text-sm text-muted-foreground font-medium">In the Expenses module, you can:</p>
                <ul className="space-y-1">
                  {[
                    "Record a single expense or record expenses in bulk.",
                    "Set mileage rates and record expenses based on the distance travelled.",
                    "Convert an expense into an invoice to get it reimbursed.",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-green-500 mt-0.5">✓</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            /* ── Table ── */
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Date</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Expense Account</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Vendor</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Invoice #</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide text-right">Amount</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Paid Through</TableHead>
                  <TableHead className="text-xs uppercase font-semibold tracking-wide">Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((expense) => {
                  const accountName = typeof expense.expenseAccountId === "object" && expense.expenseAccountId
                    ? expense.expenseAccountId.name : "—";
                  const vendorName = typeof expense.vendorId === "object" && expense.vendorId
                    ? (expense.vendorId.displayName || expense.vendorId.companyName || "—") : (expense.vendorId || "—");
                  const paidThrough = typeof expense.paidThroughAccountId === "object" && expense.paidThroughAccountId
                    ? expense.paidThroughAccountId.name : "—";
                  return (
                    <TableRow key={expense._id} className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => router.push(`/purchases/expenses/${expense._id}`)}>
                      <TableCell className="text-sm">
                        {new Date(expense.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-primary">{accountName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{vendorName as string}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{expense.invoiceNumber || "—"}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-medium">
                        {expense.currency} {Number(expense.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{paidThrough}</TableCell>
                      <TableCell>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[expense.status] ?? STATUS_COLORS.Draft)}>
                          {expense.status}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setToDelete(expense)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Delete confirm */}
        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
