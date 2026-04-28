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
  { key: "NOT SHIPPED", label: "Packages, Not Shipped", tone: "bg-cyan-100" },
  { key: "SHIPPED", label: "Shipped Packages", tone: "bg-amber-100" },
  { key: "DELIVERED", label: "Delivered Packages", tone: "bg-lime-100" },
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
            className="h-8 w-8"
            onClick={loadPackages}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="h-8"
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
                  <CardHeader className={`${column.tone} border-b py-4`}>
                    <CardTitle className="text-base font-semibold">
                      {column.label}
                    </CardTitle>
                    <CardDescription className="text-foreground/70">
                      {columnRows.length} package
                      {columnRows.length === 1 ? "" : "s"}
                    </CardDescription>
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
                              <p className="font-medium text-primary">
                                {row.packageNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">
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
                  <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(value) => toggleAll(Boolean(value))}
                          aria-label="Select all packages"
                        />
                      </th>
                      <th className="px-3 py-2">PACKAGE DATE</th>
                      <th className="px-3 py-2">PACKAGE#</th>
                      <th className="px-3 py-2">CARRIER</th>
                      <th className="px-3 py-2">TRACKING#</th>
                      <th className="px-3 py-2">SALES ORDER#</th>
                      <th className="px-3 py-2">STATUS</th>
                      <th className="px-3 py-2">SHIPMENT DATE</th>
                      <th className="px-3 py-2">CUSTOMER NAME</th>
                      <th className="px-3 py-2 text-right">QUANTITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ?
                      <tr>
                        <td
                          colSpan={10}
                          className="px-3 py-12 text-center text-muted-foreground"
                        >
                          No packages found.
                        </td>
                      </tr>
                    : rows.map((row) => {
                        const statusClass =
                          row.status === "DELIVERED" ? "text-emerald-700"
                          : row.status === "SHIPPED" ? "text-amber-700"
                          : "text-rose-600";

                        return (
                          <tr
                            key={row.id}
                            className="border-b last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-3 py-2">
                              <Checkbox
                                checked={Boolean(selectedRows[row.id])}
                                onCheckedChange={(value) =>
                                  toggleRow(row.id, Boolean(value))
                                }
                                aria-label={`Select package ${row.packageNumber}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {formatDate(row.packageDate)}
                            </td>
                            <td className="px-3 py-2 font-medium text-primary">
                              {row.packageNumber}
                            </td>
                            <td className="px-3 py-2">-</td>
                            <td className="px-3 py-2">-</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() =>
                                  router.push(
                                    `/sales/orders/${row.salesOrderId}`,
                                  )
                                }
                              >
                                {row.salesOrderNumber}
                              </button>
                            </td>
                            <td
                              className={`px-3 py-2 font-medium ${statusClass}`}
                            >
                              {row.status}
                            </td>
                            <td className="px-3 py-2">
                              {formatDate(row.shipmentDate)}
                            </td>
                            <td className="px-3 py-2">{row.customerName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.quantity.toLocaleString("en-IN")}
                            </td>
                          </tr>
                        );
                      })
                    }
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
