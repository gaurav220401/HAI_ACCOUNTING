"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  moveOrderApi,
  type MoveOrder,
  type MoveOrderStatus,
} from "@/lib/api/move-orders";
import { listLocalMoveOrders } from "@/app/inventory/move-orders/_lib/local-move-orders";

type MoveOrderFilter = "all" | MoveOrderStatus;

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function warehouseLabel(
  warehouse:
    | MoveOrder["sourceWarehouseId"]
    | MoveOrder["destinationWarehouseId"],
): string {
  if (typeof warehouse === "object" && warehouse) {
    return warehouse.name || "-";
  }

  return warehouse || "-";
}

function assigneeLabel(order: MoveOrder): string {
  if (typeof order.assigneeId === "object" && order.assigneeId) {
    return order.assigneeId.name || "Unassigned";
  }

  if (order.assigneeName && order.assigneeName.trim()) {
    return order.assigneeName.trim();
  }

  return "Unassigned";
}

function mergeMoveOrders(
  remoteRows: MoveOrder[],
  localRows: MoveOrder[],
): MoveOrder[] {
  const byId = new Map<string, MoveOrder>();

  localRows.forEach((row) => {
    byId.set(row._id, row);
  });

  remoteRows.forEach((row) => {
    byId.set(row._id, row);
  });

  return Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.createdAt || b.moveDate).getTime() -
      new Date(a.createdAt || a.moveDate).getTime(),
  );
}

function statusTone(status: MoveOrderStatus): string {
  if (status === "Completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "Cancelled") {
    return "bg-rose-100 text-rose-700";
  }

  return "bg-amber-100 text-amber-700";
}

export default function InventoryMoveOrdersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [filter, setFilter] = useState<MoveOrderFilter>("all");
  const [rows, setRows] = useState<MoveOrder[]>([]);

  const loadMoveOrders = useCallback(async () => {
    setLoading(true);
    try {
      const localRows = listLocalMoveOrders();

      let remoteRows: MoveOrder[] = [];
      let fallback = false;

      try {
        const res = await moveOrderApi.list({ page: 1, limit: 200 });
        remoteRows = res.data || [];
      } catch {
        fallback = true;
      }

      setRows(mergeMoveOrders(remoteRows, localRows));
      setUsingLocalFallback(fallback);
    } catch {
      toast.error("Failed to load move orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMoveOrders();
  }, [loadMoveOrders]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.status === filter);
  }, [filter, rows]);

  const totals = useMemo(
    () => ({
      all: rows.length,
      draft: rows.filter((row) => row.status === "Draft").length,
      completed: rows.filter((row) => row.status === "Completed").length,
      cancelled: rows.filter((row) => row.status === "Cancelled").length,
    }),
    [rows],
  );

  return (
    <InventoryShell
      title="Move Orders"
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={loadMoveOrders}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={() => router.push("/inventory/move-orders/new")}
          >
            <Plus className="mr-1 h-4 w-4" />
            New Move Order
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>All Move Orders</CardTitle>
            <CardDescription>
              {totals.all} total, {totals.draft} draft, {totals.completed}{" "}
              completed, {totals.cancelled} cancelled
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usingLocalFallback ?
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Backend move-order endpoints are not available yet. Local
                persistence mode is active.
              </p>
            : null}

            {loading && rows.length === 0 ?
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            : rows.length === 0 ?
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No move orders created yet.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push("/inventory/move-orders/new")}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Create Move Order
                </Button>
              </div>
            : <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1.5">
                    <Label>Filter By Status</Label>
                    <Select
                      value={filter}
                      onValueChange={(value) =>
                        setFilter(value as MoveOrderFilter)
                      }
                    >
                      <SelectTrigger className="w-[210px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Move Order#</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Destination</th>
                        <th className="px-3 py-2">Assignee</th>
                        <th className="px-3 py-2 text-right">Items</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ?
                        <tr>
                          <td
                            className="px-3 py-4 text-muted-foreground"
                            colSpan={8}
                          >
                            No move orders found for selected status.
                          </td>
                        </tr>
                      : filteredRows.map((row) => {
                          const itemCount = row.lineItems?.length || 0;
                          const quantityTotal = (row.lineItems || []).reduce(
                            (sum, line) =>
                              sum + Number(line.quantityTransferred || 0),
                            0,
                          );

                          return (
                            <tr key={row._id} className="border-t">
                              <td className="px-3 py-2 font-medium">
                                {row.moveOrderNumber}
                              </td>
                              <td className="px-3 py-2">
                                {formatDate(row.moveDate)}
                              </td>
                              <td className="px-3 py-2">
                                {warehouseLabel(row.sourceWarehouseId)}
                              </td>
                              <td className="px-3 py-2">
                                {warehouseLabel(row.destinationWarehouseId)}
                              </td>
                              <td className="px-3 py-2">
                                {assigneeLabel(row)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {itemCount}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {Number(quantityTotal || 0).toLocaleString(
                                  "en-IN",
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(row.status)}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      }
                    </tbody>
                  </table>
                </div>
              </>
            }
          </CardContent>
        </Card>
      </div>
    </InventoryShell>
  );
}
