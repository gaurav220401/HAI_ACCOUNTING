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
  salesOrderApi,
  type SalesOrderShipmentStatus,
  type SalesOrder,
} from "@/lib/api/sales-orders";
import { packageApi, type Package } from "@/lib/api/packages";

type ShipmentFilter = "all" | SalesOrderShipmentStatus;

interface ShipmentMetaPayload {
  shipmentOrderNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  shippingCharges?: number;
  shipmentAlreadyDelivered?: boolean;
  shipDate?: string;
  notes?: string;
}

interface ShipmentRow {
  id: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName: string;
  packageSlipNumber: string;
  shipmentOrderNumber: string;
  shipmentStatus: SalesOrderShipmentStatus;
  shipDate: string;
  carrier: string;
  trackingNumber: string;
  shippingCharges: number;
  createdAt: string;
}

const SHIPMENT_META_PREFIX = "[SHIPMENT_META]";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCustomerId(order: SalesOrder): string {
  if (typeof order.customerId === "object" && order.customerId) {
    return order.customerId._id;
  }
  return "";
}

function getCustomerName(order: SalesOrder): string {
  if (typeof order.customerId === "object" && order.customerId) {
    return (
      order.customerId.displayName || order.customerId.companyName || "Unknown"
    );
  }
  return "Unknown";
}

function parseShipmentNotes(rawNotes?: string | null): {
  meta: ShipmentMetaPayload;
  notes: string;
} {
  const text = String(rawNotes || "").trim();
  if (!text || !text.startsWith(SHIPMENT_META_PREFIX)) {
    return { meta: {}, notes: text };
  }

  const remainder = text.slice(SHIPMENT_META_PREFIX.length).trimStart();
  const breakIndex = remainder.indexOf("\n");
  const jsonChunk = (
    breakIndex === -1 ? remainder : remainder.slice(0, breakIndex)).trim();
  const plainNotes = (
    breakIndex === -1 ? "" : remainder.slice(breakIndex + 1)).trim();

  try {
    const parsed = JSON.parse(jsonChunk) as ShipmentMetaPayload;
    if (!parsed || typeof parsed !== "object") {
      return { meta: {}, notes: plainNotes };
    }
    const fallbackNotes = typeof parsed.notes === "string" ? parsed.notes : "";
    return {
      meta: parsed,
      notes: plainNotes || fallbackNotes,
    };
  } catch {
    return { meta: {}, notes: text };
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toInputDate(value?: string | null): string {
  if (!value) return todayIsoDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();
  return parsed.toISOString().slice(0, 10);
}

function statusPillTone(status: SalesOrderShipmentStatus): string {
  if (status === "Delivered") return "bg-emerald-100 text-emerald-700";
  if (status === "Shipped") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
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

function mapShipmentRows(
  orders: SalesOrder[],
  packagesByOrder: Record<string, Package[]>,
): ShipmentRow[] {
  const rows: ShipmentRow[] = [];

  for (const order of orders) {
    const customerName = getCustomerName(order);
    const customerId = getCustomerId(order);
    const orderPackages = packagesByOrder[order._id] || [];

    if (orderPackages.length === 0) continue;

    orderPackages.forEach((pkg, index) => {
      const parsed = parseShipmentNotes(pkg.internalNotes);
      const meta = parsed.meta;
      const explicitStatus =
        meta.shipmentAlreadyDelivered ? "Delivered" : order.shipmentStatus;

      rows.push({
        id: pkg._id,
        salesOrderId: order._id,
        salesOrderNumber: order.salesOrderNumber,
        customerId,
        customerName,
        packageSlipNumber: pkg.packageSlipNumber,
        shipmentOrderNumber:
          (
            typeof meta.shipmentOrderNumber === "string" &&
            meta.shipmentOrderNumber.trim()
          ) ?
            meta.shipmentOrderNumber.trim()
          : `SHP-${order.salesOrderNumber}-${index + 1}`,
        shipmentStatus: explicitStatus,
        shipDate:
          typeof meta.shipDate === "string" && meta.shipDate ?
            meta.shipDate
          : toInputDate(pkg.date),
        carrier:
          typeof meta.carrier === "string" && meta.carrier ?
            meta.carrier
          : order.deliveryMethod || "",
        trackingNumber:
          typeof meta.trackingNumber === "string" ? meta.trackingNumber : "",
        shippingCharges:
          (
            typeof meta.shippingCharges === "number" &&
            Number.isFinite(meta.shippingCharges)
          ) ?
            meta.shippingCharges
          : Number(order.shippingCharges || 0),
        createdAt: pkg.createdAt,
      });
    });
  }

  return rows.sort(
    (a, b) =>
      new Date(b.createdAt || b.shipDate).getTime() -
      new Date(a.createdAt || a.shipDate).getTime(),
  );
}

export default function InventoryShipmentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [shipmentFilter, setShipmentFilter] = useState<ShipmentFilter>("all");
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);

  const filteredShipments = useMemo(() => {
    if (shipmentFilter === "all") return shipments;
    return shipments.filter((row) => row.shipmentStatus === shipmentFilter);
  }, [shipmentFilter, shipments]);

  const shipmentTotals = useMemo(
    () => ({
      all: shipments.length,
      pending: shipments.filter((row) => row.shipmentStatus === "Pending")
        .length,
      shipped: shipments.filter((row) => row.shipmentStatus === "Shipped")
        .length,
      delivered: shipments.filter((row) => row.shipmentStatus === "Delivered")
        .length,
    }),
    [shipments],
  );

  const loadShipments = useCallback(async () => {
    setLoading(true);
    try {
      const allOrders = await fetchAllSalesOrders();
      const activeOrders = allOrders.filter((order) => order.status !== "VOID");

      const packageResults = await Promise.all(
        activeOrders.map(async (order) => {
          try {
            const res = await packageApi.listByOrder(order._id);
            return [order._id, res.data || []] as const;
          } catch {
            return [order._id, [] as Package[]] as const;
          }
        }),
      );

      const packageMap: Record<string, Package[]> = {};
      for (const [orderId, orderPackages] of packageResults) {
        packageMap[orderId] = orderPackages;
      }

      setShipments(mapShipmentRows(activeOrders, packageMap));
    } catch {
      toast.error("Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShipments();
  }, [loadShipments]);

  return (
    <InventoryShell
      title="Shipments"
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md"
            onClick={loadShipments}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            onClick={() => router.push("/inventory/shipments/new")}
          >
            <Plus className="mr-1 h-4 w-4" />
            New Shipment
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>All Shipments</CardTitle>
            <CardDescription>
              {shipmentTotals.all} total, {shipmentTotals.pending} pending,{" "}
              {shipmentTotals.shipped} shipped, {shipmentTotals.delivered}{" "}
              delivered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && shipments.length === 0 ?
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            : shipments.length === 0 ?
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No shipments added yet.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
                  onClick={() => router.push("/inventory/shipments/new")}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Create Shipment
                </Button>
              </div>
            : <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1.5">
                    <Label>Filter By Status</Label>
                    <Select
                      value={shipmentFilter}
                      onValueChange={(value) =>
                        setShipmentFilter(value as ShipmentFilter)
                      }
                    >
                      <SelectTrigger className="w-[210px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Shipped">Shipped</SelectItem>
                        <SelectItem value="Delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-left">
                      <tr>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Ship Date</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Shipment Order#</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Package#</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Sales Order#</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Customer</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Carrier</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Tracking#</th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                          Shipping Charges
                        </th>
                        <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShipments.length === 0 ?
                        <tr>
                          <td
                            className="px-3 py-6 text-muted-foreground"
                            colSpan={9}
                          >
                            No shipments found for the selected filter.
                          </td>
                        </tr>
                      : filteredShipments.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100 hover:bg-teal-50/30 transition-colors">
                            <td className="px-4 py-2 text-slate-500">
                              {formatDate(row.shipDate)}
                            </td>
                            <td className="px-4 py-2 font-medium text-teal-700 hover:text-teal-800 hover:underline cursor-pointer" onClick={() => router.push(`/sales/orders/${row.salesOrderId}`)}>
                              {row.shipmentOrderNumber}
                            </td>
                            <td className="px-4 py-2 text-slate-700">
                              {row.packageSlipNumber}
                            </td>
                            <td className="px-4 py-2 text-slate-700 font-medium hover:text-teal-700 hover:underline cursor-pointer" onClick={() => router.push(`/sales/orders/${row.salesOrderId}`)}>
                              {row.salesOrderNumber}
                            </td>
                            <td className="px-4 py-2 text-slate-700">{row.customerName}</td>
                            <td className="px-4 py-2 text-slate-600">{row.carrier || "-"}</td>
                            <td className="px-4 py-2 text-slate-600">
                              {row.trackingNumber || "-"}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-700">
                              {Number(row.shippingCharges || 0).toLocaleString(
                                "en-IN",
                                {
                                  minimumFractionDigits: 2,
                                },
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {row.shipmentStatus === "Delivered" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                  Delivered
                                </span>
                              )}
                              {row.shipmentStatus === "Shipped" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                                  <span className="h-1 w-1 rounded-full bg-purple-500" />
                                  Shipped
                                </span>
                              )}
                              {row.shipmentStatus === "Pending" && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                                  <span className="h-1 w-1 rounded-full bg-amber-500" />
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
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
