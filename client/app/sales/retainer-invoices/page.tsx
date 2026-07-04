"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  retainerInvoiceApi,
  type RetainerInvoice,
  type RetainerInvoiceStatus,
} from "@/lib/api/retainer-invoices";

const STATUS_FILTERS: Array<RetainerInvoiceStatus | "All"> = [
  "All",
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Partially Applied",
  "Applied",
  "Partially Refunded",
  "Refunded",
  "Void",
];

const STATUS_STYLES: Record<RetainerInvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Sent: "bg-teal-50 text-teal-700 border-teal-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Paid: "bg-green-50 text-green-700 border-green-200",
  "Partially Applied": "bg-cyan-50 text-cyan-700 border-cyan-200",
  Applied: "bg-teal-50 text-teal-700 border-teal-200",
  "Partially Refunded": "bg-orange-50 text-orange-700 border-orange-200",
  Refunded: "bg-purple-50 text-purple-700 border-purple-200",
  Void: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(customer: RetainerInvoice["customer_id"]) {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RetainerInvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [rows, setRows] = useState<RetainerInvoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RetainerInvoiceStatus | "All">("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      const response = await retainerInvoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setRows(response.data || []);
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Failed to fetch retainer invoices"));
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchRows();
    }
  }, [firebaseUser, loading, fetchRows]);

  async function handleAction(
    action: "send" | "payment" | "refund" | "void" | "delete",
    retainer: RetainerInvoice,
  ) {
    try {
      if (action === "send") {
        await retainerInvoiceApi.send(retainer._id);
      }

      if (action === "payment") {
        const amountInput = window.prompt("Enter payment amount", String(retainer.balance_due || ""));
        if (!amountInput) return;
        const amount = Number(amountInput);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter a valid amount");
          return;
        }
        await retainerInvoiceApi.recordPayment(retainer._id, {
          amount,
          payment_date: new Date().toISOString(),
          payment_mode: retainer.payment_mode || "Cash",
        });
      }

      if (action === "refund") {
        const amountInput = window.prompt("Enter refund amount", String(retainer.amount_unapplied || ""));
        if (!amountInput) return;
        const amount = Number(amountInput);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter a valid amount");
          return;
        }
        await retainerInvoiceApi.refund(retainer._id, {
          amount,
          refund_date: new Date().toISOString(),
        });
      }

      if (action === "void") {
        const confirmed = window.confirm(`Void retainer invoice ${retainer.retainer_number}?`);
        if (!confirmed) return;
        await retainerInvoiceApi.void(retainer._id, "Void from list view");
      }

      if (action === "delete") {
        const confirmed = window.confirm(`Delete retainer invoice ${retainer.retainer_number}?`);
        if (!confirmed) return;
        await retainerInvoiceApi.remove(retainer._id);
      }

      await fetchRows();
      toast.success("Action completed");
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Action failed"));
    }
  }

  const filteredRows = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return rows;

    return rows.filter((row) => {
      return [
        row.retainer_number,
        row.retainer_id,
        row.reference_number,
        customerName(row.customer_id),
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value));
    });
  }, [rows, search]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
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
              <span className="font-medium text-foreground">Retainer Invoices</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search retainer invoices..."
                  className="h-9 pl-8"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchRows()}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/sales/retainer-invoices/new")}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Retainer Invoices</h1>
              <p className="text-sm text-muted-foreground">
                Track customer retainers across draft, payment, application, and refund lifecycle.
              </p>
            </div>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as RetainerInvoiceStatus | "All")}
            >
              <SelectTrigger className="w-full md:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === "All" ? "All statuses" : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredRows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
              <div className="max-w-xl space-y-3">
                <h2 className="text-xl font-semibold">No retainer invoices yet</h2>
                <p className="text-sm text-muted-foreground">
                  Create a retainer invoice to collect and apply customer advances against invoices.
                </p>
                <Button onClick={() => router.push("/sales/retainer-invoices/new")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">
                  Create Retainer Invoice
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Retainer #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Applied</TableHead>
                    <TableHead className="text-right">Unapplied</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((retainer) => (
                    <TableRow
                      key={retainer._id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => router.push(`/sales/retainer-invoices/${retainer._id}`)}
                    >
                      <TableCell>{formatDate(retainer.retainer_date)}</TableCell>
                      <TableCell className="font-medium text-teal-700">{retainer.retainer_number}</TableCell>
                      <TableCell>{customerName(retainer.customer_id)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_received)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_applied)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_unapplied)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[retainer.status]}>
                          {retainer.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/sales/retainer-invoices/${retainer._id}`)}
                            >
                              View retainer invoice
                            </DropdownMenuItem>
                            {retainer.status === "Draft" ? (
                              <DropdownMenuItem onClick={() => void handleAction("send", retainer)}>
                                Mark as sent
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.balance_due > 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("payment", retainer)}>
                                Record payment
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_unapplied > 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("refund", retainer)}>
                                Record refund
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_received <= 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("void", retainer)}>
                                Void
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_received <= 0.009 ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleAction("delete", retainer)}
                              >
                                Delete
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
