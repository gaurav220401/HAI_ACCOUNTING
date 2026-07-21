"use client";
import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, RefreshCw, FileUp, Calendar, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
import { DraggableText } from "@/components/ui/draggable-text";

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

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    let list = orders;

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter(
        (o) => new Date(o.orderDate || 0).getTime() >= fromTime,
      );
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter(
        (o) => new Date(o.orderDate || 0).getTime() <= toTime,
      );
    }

    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((o) => {
      const custName = getCustomerName(o.customerId).toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        (o.reference || "").toLowerCase().includes(q) ||
        custName.includes(q)
      );
    });
  }, [orders, search, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalAmount = filtered.reduce(
      (acc, o) => acc + Number(o.total || 0),
      0,
    );
    const deliveredCount = filtered.filter(
      (o) => o.shipmentStatus === "Delivered",
    ).length;
    const closedCount = filtered.filter((o) => o.status === "CLOSED").length;
    return {
      count: filtered.length,
      totalAmount,
      deliveredCount,
      closedCount,
    };
  }, [filtered]);

  type OrderSortField = "date" | "number" | "reference" | "customer" | "status" | "amount";
  type OrderSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<OrderSortField>("date");
  const [sortOrder, setSortOrder] = useState<OrderSortOrder>("desc");

  function toggleSort(field: OrderSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedOrders = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "date":
          aVal = new Date(a.orderDate || 0).getTime();
          bVal = new Date(b.orderDate || 0).getTime();
          break;
        case "number":
          aVal = a.salesOrderNumber || "";
          bVal = b.salesOrderNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "reference":
          aVal = (a.reference || "").toLowerCase();
          bVal = (b.reference || "").toLowerCase();
          break;
        case "customer":
          aVal = getCustomerName(a.customerId).toLowerCase();
          bVal = getCustomerName(b.customerId).toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "amount":
          aVal = Number(a.total || 0);
          bVal = Number(b.total || 0);
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortField, sortOrder]);

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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Sales Orders</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sales orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {/* Compact Date Range Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
                      (fromDate || toDate) && "border-teal-500 bg-teal-50/60 text-teal-700 font-semibold"
                    )}
                  >
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    {fromDate || toDate ? (
                      <span>
                        {fromDate || "Start"} - {toDate || "End"}
                      </span>
                    ) : (
                      <span>Date Range</span>
                    )}
                    <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-4 space-y-3 bg-white border border-slate-200 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">Filter by Date Range</span>
                    {(fromDate || toDate) && (
                      <button
                        onClick={() => {
                          setFromDate("");
                          setToDate("");
                        }}
                        className="text-xs text-rose-600 hover:underline font-medium"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">From Date</label>
                      <Input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="h-8 text-xs bg-slate-50 border-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-500 block mb-1">To Date</label>
                      <Input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="h-8 text-xs bg-slate-50 border-slate-200"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchOrders()}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/orders/new")}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                <Plus className="mr-1 h-4 w-4" />
                New Sales Order
              </Button>
              <Link href="/batch-import?section=sales&type=Sales Orders&back=/sales/orders">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-9 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50">
                  <FileUp className="h-3.5 w-3.5" /> Batch Import
                </Button>
              </Link>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-6 space-y-3">
          {/* Sleek Ultra-Compact KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Orders</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Order Value</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">₹{summary.totalAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Delivered</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.deliveredCount}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wide">Closed</span>
              <span className="text-sm font-bold text-indigo-600 tabular-nums">{summary.closedCount}</span>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-md px-4 py-2 text-sm text-teal-800">
              <span>{selectedIds.length} item(s) selected</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runBulkAction("Mark shipment fulfilled", salesOrderApi.markShipmentFulfilled)}
                  disabled={bulkRunning}
                >
                  Mark shipment as fulfilled
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runBulkAction("Instant invoice", salesOrderApi.instantInvoice)}
                  disabled={bulkRunning}
                >
                  Instant Invoice
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runBulkAction("Void", salesOrderApi.voidOrder)}
                  disabled={bulkRunning}
                >
                  Void
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => runBulkAction("Delete", salesOrderApi.remove)}
                  disabled={bulkRunning}
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
                  <TableHead className="w-28">
                    <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                      Date
                      <span className={cn("text-[10px]", sortField === "date" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-36">
                    <button onClick={() => toggleSort("number")} className="group flex items-center gap-1 hover:text-teal-700">
                      Sales Order Number
                      <span className={cn("text-[10px]", sortField === "number" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "number" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-32">
                    <button onClick={() => toggleSort("reference")} className="group flex items-center gap-1 hover:text-teal-700">
                      Reference Number
                      <span className={cn("text-[10px]", sortField === "reference" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "reference" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-48">
                    <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                      Customer Name
                      <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-28">
                    <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                      Status
                      <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-32 text-right">
                    <button onClick={() => toggleSort("amount")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                      Amount
                      <span className={cn("text-[10px]", sortField === "amount" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                        {sortField === "amount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="w-24 text-center">Shipping</TableHead>
                  <TableHead className="w-24 text-center">Invoiced</TableHead>
                  <TableHead className="w-24 text-center">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrders.map((o: SalesOrder) => (
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
                    <TableCell className="font-medium text-teal-700 max-w-[144px]">
                      <DraggableText alwaysActive className="font-medium text-teal-700">{o.salesOrderNumber}</DraggableText>
                    </TableCell>
                    <TableCell className="text-sm max-w-[128px]">
                      <DraggableText alwaysActive className="text-sm">{o.reference || "—"}</DraggableText>
                    </TableCell>
                    <TableCell className="text-sm max-w-[192px]">
                      <DraggableText alwaysActive className="text-sm">{getCustomerName(o.customerId) || "—"}</DraggableText>
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
                            "bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.6)]"
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
