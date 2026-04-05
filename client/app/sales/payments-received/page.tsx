"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Edit,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  paymentReceivedApi,
  type PaymentReceived,
  type PaymentReceivedStatus,
} from "@/lib/api/payments-received";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<PaymentReceivedStatus | "All"> = ["All", "DRAFT", "PAID", "VOID"];

const statusColor: Record<PaymentReceivedStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-300",
  VOID: "bg-gray-50 text-gray-400 border-gray-200",
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function customerName(customer: PaymentReceived["customer_id"]): string {
  if (typeof customer === "string") return customer;
  return customer.displayName || customer.companyName || "-";
}

export default function PaymentsReceivedPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentReceivedStatus | "All">("All");
  const [voidTarget, setVoidTarget] = useState<PaymentReceived | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) void fetchPayments();
  }, [firebaseUser, loading, statusFilter]);

  async function fetchPayments() {
    setFetching(true);
    try {
      const res = await paymentReceivedApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "payment_date",
        sortOrder: "desc",
      });
      setPayments(res.data || []);
    } catch {
      toast.error("Failed to load payments received");
    } finally {
      setFetching(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget) return;
    try {
      await paymentReceivedApi.void(voidTarget._id, "Voided from Payments Received screen");
      toast.success("Receipt voided");
      setVoidTarget(null);
      await fetchPayments();
    } catch {
      toast.error("Failed to void receipt");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((row) => {
      return (
        row.payment_number.toLowerCase().includes(q) ||
        (row.reference_number || "").toLowerCase().includes(q) ||
        customerName(row.customer_id).toLowerCase().includes(q) ||
        row.payment_mode.toLowerCase().includes(q)
      );
    });
  }, [payments, search]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Payments Received</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search receipts..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchPayments()} disabled={fetching}>
                <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              </Button>
              <Button size="sm" onClick={() => router.push("/sales/payments-received/new")}>
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    {statusFilter === "All" ? "All Receipts" : statusFilter}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                      {s === "All" ? "All Receipts" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {filtered.length} receipt{filtered.length !== 1 && "s"}
              </span>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Receipt #</th>
                    <th className="text-left px-3 py-2">Customer</th>
                    <th className="text-left px-3 py-2">Payment Mode</th>
                    <th className="text-right px-3 py-2">Amount Received</th>
                    <th className="text-right px-3 py-2">Applied</th>
                    <th className="text-right px-3 py-2">Excess</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2 w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        No payment receipts found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row._id} className="border-t">
                        <td className="px-3 py-2">{fmtDate(row.payment_date)}</td>
                        <td className="px-3 py-2 font-medium">{row.payment_number}</td>
                        <td className="px-3 py-2">{customerName(row.customer_id)}</td>
                        <td className="px-3 py-2">{row.payment_mode}</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(row.total_amount_received)}</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(row.amount_used_for_invoices)}</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(row.amount_in_excess)}</td>
                        <td className="px-3 py-2">
                          <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs", statusColor[row.status])}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/sales/payments-received/${row._id}/edit`)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {row.status !== "VOID" ? (
                                <DropdownMenuItem onClick={() => setVoidTarget(row)}>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Void
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <AlertDialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void Receipt</AlertDialogTitle>
              <AlertDialogDescription>
                This will reverse ledger effect and invoice allocations for receipt {voidTarget?.payment_number}. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleVoid()}>Void</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
