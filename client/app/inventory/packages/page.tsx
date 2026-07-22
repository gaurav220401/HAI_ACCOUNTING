"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Loader2, Plus, RefreshCw, Search, Calendar, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { packageApi, type Package } from "@/lib/api/packages";
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";

type PackageStatus = "NOT SHIPPED" | "SHIPPED" | "DELIVERED";
type ViewMode = "board" | "list";

interface PackageRow {
  id: string;
  packageDate: string;
  packageNumber: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerName: string;
  status: PackageStatus;
  shipmentDate?: string | null;
  quantity: number;
  createdAt: string;
}

const BOARD_COLUMNS: Array<{
  key: PackageStatus;
  label: string;
  tone: string;
}> = [
  { key: "NOT SHIPPED", label: "Packages, Not Shipped", tone: "bg-slate-50 border-b border-slate-200" },
  { key: "SHIPPED", label: "Shipped Packages", tone: "bg-slate-50 border-b border-slate-200" },
  { key: "DELIVERED", label: "Delivered Packages", tone: "bg-slate-50 border-b border-slate-200" },
];

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mapShipmentStatusToPackageStatus(order: SalesOrder): PackageStatus {
  if (order.shipmentStatus === "Delivered") return "DELIVERED";
  if (order.shipmentStatus === "Shipped") return "SHIPPED";
  return "NOT SHIPPED";
}

function getCustomerName(order: SalesOrder): string {
  if (typeof order.customerId === "object" && order.customerId) {
    return (
      order.customerId.displayName || order.customerId.companyName || "Unknown"
    );
  }
  return "Unknown";
}

function quantityFromPackage(pkg: Package): number {
  return (pkg.lineItems || []).reduce(
    (sum, line) => sum + Number(line.quantityToPack || 0),
    0,
  );
}

async function fetchAllSalesOrders(): Promise<SalesOrder[]> {
  const limit = 100;
  let page = 1;
  let pages = 1;
  const all: SalesOrder[] = [];

  do {
    const res = await salesOrderApi.list({ page, limit });
    all.push(...(res.data || []));
    pages = Math.max(1, Number(res.pagination?.pages || 1));
    page += 1;
  } while (page <= pages);

  return all;
}

export default function InventoryPackagesPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  type PackageSortField =
    | "packageDate"
    | "packageNumber"
    | "trackingNumber"
    | "salesOrderNumber"
    | "status"
    | "shipmentDate"
    | "customerName"
    | "quantity";
  type PackageSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<PackageSortField>("packageDate");
  const [sortOrder, setSortOrder] = useState<PackageSortOrder>("desc");

  function toggleSort(field: PackageSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          row.packageNumber.toLowerCase().includes(q) ||
          row.salesOrderNumber.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          row.status.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (fromDate || toDate) {
        const d = row.packageDate ? new Date(row.packageDate).toISOString().slice(0, 10) : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [rows, search, fromDate, toDate]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "packageDate":
          aVal = new Date(a.packageDate || 0).getTime();
          bVal = new Date(b.packageDate || 0).getTime();
          break;
        case "packageNumber":
          aVal = a.packageNumber.toLowerCase();
          bVal = b.packageNumber.toLowerCase();
          break;
        case "salesOrderNumber":
          aVal = a.salesOrderNumber.toLowerCase();
          bVal = b.salesOrderNumber.toLowerCase();
          break;
        case "status":
          aVal = a.status.toLowerCase();
          bVal = b.status.toLowerCase();
          break;
        case "shipmentDate":
          aVal = new Date(a.shipmentDate || 0).getTime();
          bVal = new Date(b.shipmentDate || 0).getTime();
          break;
        case "customerName":
          aVal = a.customerName.toLowerCase();
          bVal = b.customerName.toLowerCase();
          break;
        case "quantity":
          aVal = Number(a.quantity || 0);
          bVal = Number(b.quantity || 0);
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRows, sortField, sortOrder]);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const allOrders = await fetchAllSalesOrders();

      const packageResults = await Promise.all(
        allOrders.map(async (order) => {
          try {
            const res = await packageApi.listByOrder(order._id);
            return { order, packages: res.data || [] };
          } catch {
            return { order, packages: [] as Package[] };
          }
        }),
      );

      const mappedRows = packageResults
        .flatMap(({ order, packages }) => {
          const customerName = getCustomerName(order);
          const status = mapShipmentStatusToPackageStatus(order);
          return packages.map((pkg) => ({
            id: pkg._id,
            packageDate: pkg.date,
            packageNumber: pkg.packageSlipNumber,
            salesOrderId: order._id,
            salesOrderNumber: order.salesOrderNumber,
            customerName,
            status,
            shipmentDate: order.expectedShipmentDate || null,
            quantity: quantityFromPackage(pkg),
            createdAt: pkg.createdAt,
          }));
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

      setRows(mappedRows);
      setSelectedRows({});
    } catch {
      toast.error("Failed to load packages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const rowsByStatus = useMemo(() => {
    return {
      "NOT SHIPPED": rows.filter((row) => row.status === "NOT SHIPPED"),
      SHIPPED: rows.filter((row) => row.status === "SHIPPED"),
      DELIVERED: rows.filter((row) => row.status === "DELIVERED"),
    };
  }, [rows]);

  const statusTotals = useMemo(
    () => ({
      all: rows.length,
      notShipped: rowsByStatus["NOT SHIPPED"].length,
      shipped: rowsByStatus.SHIPPED.length,
      delivered: rowsByStatus.DELIVERED.length,
    }),
    [rows.length, rowsByStatus],
  );

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedRows[row.id]);

  function toggleRow(id: string, checked: boolean) {
    setSelectedRows((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelectedRows({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const row of rows) {
      next[row.id] = true;
    }
    setSelectedRows(next);
  }

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  return (
    <InventoryShell
      title="Packages"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search packages..."
              className="pl-8 h-8 text-xs bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Compact Date Range Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
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
            className="h-8 px-2 border-slate-200 bg-white"
            onClick={loadPackages}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md"
            onClick={() => router.push("/inventory/packages/new")}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">All Packages</h2>
            <p className="text-sm text-muted-foreground">
              {statusTotals.all} total • {statusTotals.notShipped} not shipped •{" "}
              {statusTotals.shipped} shipped • {statusTotals.delivered}{" "}
              delivered
            </p>
          </div>

          <div className="inline-flex items-center rounded-md border bg-muted/30 p-1">
            <Button
              type="button"
              variant={viewMode === "board" ? "default" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setViewMode("board")}
            >
              <LayoutGrid className="mr-1 h-4 w-4" />
              Board
            </Button>
            <Button
              type="button"
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => setViewMode("list")}
            >
              <List className="mr-1 h-4 w-4" />
              List
            </Button>
          </div>
        </div>

        {loading ?
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        : viewMode === "board" ?
          <div className="grid gap-4 lg:grid-cols-3">
            {BOARD_COLUMNS.map((column) => {
              const columnRows = sortedRows.filter((r) => r.status === column.key);
              return (
                <Card key={column.key} className="overflow-hidden">
                  <CardHeader className={`${column.tone} py-3`}>
                    <CardTitle className="text-xs uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                      <span>{column.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-600 font-semibold">{columnRows.length}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="min-h-52 space-y-3 p-4">
                    {columnRows.length === 0 ?
                      <p className="pt-10 text-center text-sm text-muted-foreground">
                        No Records Found
                      </p>
                    : columnRows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          className="w-full rounded-md border bg-background p-3 text-left transition hover:bg-muted/40"
                          onClick={() =>
                            router.push(`/sales/orders/${row.salesOrderId}`)
                          }
                        >
                          <div className="flex items-start justify-between gap-2">
                             <div className="space-y-0.5">
                              <p className="font-semibold text-teal-700 hover:text-teal-800 hover:underline">
                                {row.packageNumber}
                              </p>
                              <p className="text-xs text-slate-400">
                                {row.salesOrderNumber}
                              </p>
                            </div>
                            <p className="text-sm font-medium tabular-nums">
                              {row.quantity.toLocaleString("en-IN")}
                            </p>
                          </div>
                          <p className="mt-1 text-sm text-foreground/80">
                            {row.customerName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(row.packageDate)}
                          </p>
                        </button>
                      ))
                    }
                  </CardContent>
                </Card>
              );
            })}
          </div>
        : <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left">
                    <tr>
                      <th className="w-10 px-4 py-2.5">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(value) => toggleAll(Boolean(value))}
                          aria-label="Select all packages"
                        />
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("packageDate")} className="group flex items-center gap-1 hover:text-teal-700">
                          Package Date
                          <span className={sortField === "packageDate" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "packageDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("packageNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                          Package Number
                          <span className={sortField === "packageNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "packageNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Carrier</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Tracking Number</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("salesOrderNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                          Sales Order Number
                          <span className={sortField === "salesOrderNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "salesOrderNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                          Status
                          <span className={sortField === "status" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("shipmentDate")} className="group flex items-center gap-1 hover:text-teal-700">
                          Shipment Date
                          <span className={sortField === "shipmentDate" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "shipmentDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        <button onClick={() => toggleSort("customerName")} className="group flex items-center gap-1 hover:text-teal-700">
                          Customer Name
                          <span className={sortField === "customerName" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "customerName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                        <button onClick={() => toggleSort("quantity")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                          Quantity
                          <span className={sortField === "quantity" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "quantity" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          No packages found.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => {
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30 transition-colors"
                          >
                            <td className="px-4 py-2">
                              <Checkbox
                                checked={Boolean(selectedRows[row.id])}
                                onCheckedChange={(value) =>
                                  toggleRow(row.id, Boolean(value))
                                }
                                aria-label={`Select package ${row.packageNumber}`}
                              />
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {formatDate(row.packageDate)}
                            </td>
                            <td className="px-4 py-2 font-medium text-teal-700 hover:text-teal-800 hover:underline cursor-pointer" onClick={() => router.push(`/sales/orders/${row.salesOrderId}`)}>
                              {row.packageNumber}
                            </td>
                            <td className="px-4 py-2 text-slate-500">-</td>
                            <td className="px-4 py-2 text-slate-500">-</td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="text-teal-700 hover:text-teal-800 hover:underline font-medium"
                                onClick={() =>
                                  router.push(
                                    `/sales/orders/${row.salesOrderId}`,
                                  )
                                }
                              >
                                {row.salesOrderNumber}
                              </button>
                            </td>
                            <td className="px-4 py-2">
                              {row.status === "DELIVERED" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                  Delivered
                                </span>
                              )}
                              {row.status === "SHIPPED" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                                  <span className="h-1 w-1 rounded-full bg-purple-500" />
                                  Shipped
                                </span>
                              )}
                              {row.status === "NOT SHIPPED" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                                  <span className="h-1 w-1 rounded-full bg-rose-500" />
                                  Not Shipped
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-600">
                              {formatDate(row.shipmentDate)}
                            </td>
                            <td className="px-4 py-2 text-slate-700">{row.customerName}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-700">
                              {row.quantity.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {selectedCount > 0 ?
                <div className="border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {selectedCount} package{selectedCount === 1 ? "" : "s"}{" "}
                  selected
                </div>
              : null}
            </CardContent>
          </Card>
        }
      </div>
    </InventoryShell>
  );
}
