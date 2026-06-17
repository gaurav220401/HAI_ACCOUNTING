"use client";
import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, RefreshCw, FileUp} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  salesOrderApi,
  type SalesOrder,
  type SalesOrderStatus,
} from "@/lib/api/sales-orders";

function getCustomerName(
  customer: SalesOrder["customerId"] | null | undefined,
): string {
  if (!customer || typeof customer === "string") return "";
  return customer.displayName || customer.companyName || "";
}

function formatDate(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function statusBadgeVariant(status: SalesOrderStatus) {
  if (status === "DRAFT") return "secondary" as const;
  if (status === "APPROVED") return "outline" as const;
  if (status === "OVERDUE") return "destructive" as const;
  if (status === "VOID") return "destructive" as const;
  if (status === "CLOSED") return "success" as const;
  return "default" as const;
}

export default function SalesOrdersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  async function fetchOrders() {
    setFetching(true);
    try {
      const res = await salesOrderApi.list({
        page: 1,
        limit: 100,
        search: search || undefined,
      });
      setOrders(res.data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const custName = getCustomerName(o.customerId).toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        (o.reference || "").toLowerCase().includes(q) ||
        custName.includes(q)
      );
    });
  }, [orders, search]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allFilteredIds = useMemo(() => filtered.map((o) => o._id), [filtered]);
  const allFilteredSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedSet.has(id));

  function toggleRowSelection(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return Array.from(next);
    });
  }

  function toggleAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        const next = new Set(prev);
        allFilteredIds.forEach((id) => next.add(id));
        return Array.from(next);
      }
      const remove = new Set(allFilteredIds);
      return prev.filter((id) => !remove.has(id));
    });
  }

  async function runBulkAction(
    label: string,
    fn: (id: string) => Promise<unknown>,
  ) {
    if (selectedIds.length === 0) {
      toast.error("Select at least one sales order");
      return;
    }

    setBulkRunning(true);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => fn(id)));
      const success = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - success;

      if (success > 0 && failed === 0) {
        toast.success(`${label} completed for ${success} sales order(s)`);
      } else if (success > 0 && failed > 0) {
        toast.warning(`${label}: ${success} succeeded, ${failed} failed`);
      } else {
        toast.error(`${label} failed for selected sales orders`);
      }

      await fetchOrders();
      setSelectedIds([]);
    } finally {
      setBulkRunning(false);
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
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Sales Orders</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Sales Orders..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOrders}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/orders/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
              <Link href="/batch-import?section=sales&type=Sales Orders&back=/sales/orders">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                  <FileUp className="h-3.5 w-3.5" /> Batch Import
                </Button>
              </Link>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-4">
          <div>
            <h1 className="text-xl font-bold">All Sales Orders</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} sales orders
            </p>
          </div>

          {selectedIds.length > 0 && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{selectedIds.length} selected</span>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkRunning}
                onClick={() => runBulkAction("Mark shipment fulfilled", salesOrderApi.markShipmentFulfilled)}
              >
                Mark shipment as fulfilled
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkRunning}
                onClick={() => runBulkAction("Instant invoice", salesOrderApi.instantInvoice)}
              >
                Instant Invoice
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkRunning}
                onClick={() => runBulkAction("Dropship", salesOrderApi.dropship)}
              >
                Dropship
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkRunning}
                onClick={() => runBulkAction("Void", salesOrderApi.voidOrder)}
              >
                Void
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkRunning}
                onClick={() => runBulkAction("Delete", salesOrderApi.remove)}
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={bulkRunning}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={(checked) => toggleAllFiltered(Boolean(checked))}
                      aria-label="Select all sales orders"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Sales Order#</TableHead>
                  <TableHead>Reference#</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Shipping</TableHead>
                  <TableHead className="text-center">Invoiced</TableHead>
                  <TableHead className="text-center">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/sales/orders/${o._id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedSet.has(o._id)}
                        onCheckedChange={(checked) => toggleRowSelection(o._id, Boolean(checked))}
                        aria-label={`Select ${o.salesOrderNumber}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(o.orderDate)}
                    </TableCell>
                    <TableCell className="font-medium text-primary">
                      {o.salesOrderNumber}
                    </TableCell>
                    <TableCell className="text-sm">
                      {o.reference || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {getCustomerName(o.customerId) || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(o.status)}>
                        {o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {o.total != null ?
                        `₹${Number(o.total).toLocaleString("en-IN")}`
                      : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          o.shipmentStatus === "Delivered" ?
                            "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                          : o.shipmentStatus === "Shipped" ?
                            "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                          : "bg-muted-foreground/30"
                        }`}
                        title={
                          o.shipmentStatus === "Delivered" ? "Fully Delivered" :
                          o.shipmentStatus === "Shipped" ? "Shipped" :
                          "Pending"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          o.status === "INVOICED" || o.status === "CLOSED" ?
                            "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                          : o.status === "PARTIALLY_INVOICED" ?
                            "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
                          : "bg-muted-foreground/30"
                        }`}
                        title={
                          o.status === "INVOICED" || o.status === "CLOSED" ? "Fully Invoiced" :
                          o.status === "PARTIALLY_INVOICED" ? "Partially Invoiced" :
                          "Not Invoiced"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          o.invoicePaymentStatus === "Paid" || o.invoicePaymentReceived || o.status === "CLOSED" ?
                            "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                          : o.invoicePaymentStatus === "Partially Paid" ?
                            "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
                          : "bg-muted-foreground/30"
                        }`}
                        title={
                          o.invoicePaymentStatus === "Paid" || o.invoicePaymentReceived || o.status === "CLOSED" ? "Fully Paid" :
                          o.invoicePaymentStatus === "Partially Paid" ? "Partially Paid" :
                          "Unpaid"
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 ?
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No sales orders found.
                    </TableCell>
                  </TableRow>
                : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
