"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
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
import { useOrganization } from "@/contexts/organization-context";
import {
  inventoryApi,
  type InventoryAdjustment,
  type InventoryOverviewResponse,
} from "@/lib/api/inventory";

function formatMoney(value: number): string {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function itemLabel(adjustment: InventoryAdjustment): string {
  if (typeof adjustment.itemId === "object" && adjustment.itemId) {
    return adjustment.itemId.name;
  }
  return String(adjustment.itemId || "Unknown Item");
}

function warehouseLabel(adjustment: InventoryAdjustment): string {
  if (!adjustment.warehouseId) return "-";
  if (typeof adjustment.warehouseId === "object") {
    return adjustment.warehouseId.name;
  }
  return adjustment.warehouseId;
}

export default function InventoryOverviewPage() {
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<InventoryOverviewResponse | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getOverview();
      setOverview(res.data);
    } catch {
      toast.error("Failed to load inventory overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeOrganization?._id) {
      void loadOverview();
    }
  }, [activeOrganization?._id, loadOverview]);

  const summary = overview?.summary;

  return (
    <InventoryShell
      title="Inventory"
      actions={(
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadOverview} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="h-8" onClick={() => router.push("/inventory/adjustments")}>New Adjustment</Button>
        </>
      )}
    >
      {!overview && loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tracked Items</CardDescription>
                <CardTitle className="text-2xl">{summary?.trackedItems ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Out of Stock</CardDescription>
                <CardTitle className="text-2xl">{summary?.outOfStockItems ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Low Stock</CardDescription>
                <CardTitle className="text-2xl">{summary?.lowStockItems ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Quantity</CardDescription>
                <CardTitle className="text-2xl">{Number(summary?.totalQuantity || 0).toLocaleString("en-IN")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Committed (Sales Orders)</CardDescription>
                <CardTitle className="text-2xl">{Number(summary?.committedQuantity || 0).toLocaleString("en-IN")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Available to Sell</CardDescription>
                <CardTitle className="text-2xl">{Number(summary?.availableQuantity || 0).toLocaleString("en-IN")}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Open Sales Orders</CardDescription>
                <CardTitle className="text-2xl">{summary?.openSalesOrders ?? 0}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Stock Value</CardDescription>
                <CardTitle className="text-2xl">{formatMoney(summary?.totalValue || 0)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Low Stock Alerts</CardTitle>
                <CardDescription>Items that are below their reorder point.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.lowStock?.length ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2 text-right">Stock</th>
                          <th className="px-3 py-2 text-right">Reorder</th>
                          <th className="px-3 py-2 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.lowStock.map((row) => (
                          <tr key={row._id} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(row.stockOnHand || 0).toLocaleString("en-IN")}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{Number(row.reorderPoint || 0).toLocaleString("en-IN")}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.inventoryValue || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No low stock items.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Inventory Movements</CardTitle>
                <CardDescription>Latest stock adjustments and valuation changes.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview?.recentAdjustments?.length ? (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Value</th>
                          <th className="px-3 py-2">Warehouse</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.recentAdjustments.map((row) => (
                          <tr key={row._id} className="border-t">
                            <td className="px-3 py-2">{new Date(row.adjustedAt).toLocaleDateString("en-IN")}</td>
                            <td className="px-3 py-2 font-medium">{itemLabel(row)}</td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums ${
                                row.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {row.quantityDelta >= 0 ? "+" : ""}
                              {Number(row.quantityDelta || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.valueDelta || 0)}</td>
                            <td className="px-3 py-2">{warehouseLabel(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No inventory movements recorded yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </InventoryShell>
  );
}
