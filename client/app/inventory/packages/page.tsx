"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";
import { Button } from "@/components/ui/button";
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
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

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
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
            onClick={loadPackages}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md"
            onClick={() => router.push("/inventory/packages/new")}
          >
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </>
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
              const columnRows = rowsByStatus[column.key];
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
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">PACKAGE DATE</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">PACKAGE#</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">CARRIER</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">TRACKING#</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">SALES ORDER#</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">STATUS</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">SHIPMENT DATE</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">CUSTOMER NAME</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">QUANTITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          No packages found.
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => {
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
