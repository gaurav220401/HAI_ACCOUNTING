"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Search, Calendar, ChevronDown } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [shipmentFilter, setShipmentFilter] = useState<ShipmentFilter>("all");
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);

  type ShipmentSortField =
    | "shipDate"
    | "shipmentOrderNumber"
    | "packageSlipNumber"
    | "salesOrderNumber"
    | "customerName"
    | "carrier"
    | "trackingNumber"
    | "shippingCharges"
    | "shipmentStatus";
  type ShipmentSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<ShipmentSortField>("shipDate");
  const [sortOrder, setSortOrder] = useState<ShipmentSortOrder>("desc");

  function toggleSort(field: ShipmentSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const filteredShipments = useMemo(() => {
    return shipments.filter((row) => {
      if (shipmentFilter !== "all" && row.shipmentStatus !== shipmentFilter) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matches =
          row.shipmentOrderNumber.toLowerCase().includes(q) ||
          row.packageSlipNumber.toLowerCase().includes(q) ||
          row.salesOrderNumber.toLowerCase().includes(q) ||
          row.customerName.toLowerCase().includes(q) ||
          (row.carrier || "").toLowerCase().includes(q) ||
          (row.trackingNumber || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (fromDate || toDate) {
        const d = row.shipDate ? new Date(row.shipDate).toISOString().slice(0, 10) : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [shipments, shipmentFilter, search, fromDate, toDate]);

  const sortedShipments = useMemo(() => {
    const list = [...filteredShipments];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "shipDate":
          aVal = new Date(a.shipDate || 0).getTime();
          bVal = new Date(b.shipDate || 0).getTime();
          break;
        case "shipmentOrderNumber":
          aVal = a.shipmentOrderNumber.toLowerCase();
          bVal = b.shipmentOrderNumber.toLowerCase();
          break;
        case "packageSlipNumber":
          aVal = a.packageSlipNumber.toLowerCase();
          bVal = b.packageSlipNumber.toLowerCase();
          break;
        case "salesOrderNumber":
          aVal = a.salesOrderNumber.toLowerCase();
          bVal = b.salesOrderNumber.toLowerCase();
          break;
        case "customerName":
          aVal = a.customerName.toLowerCase();
          bVal = b.customerName.toLowerCase();
          break;
        case "carrier":
          aVal = (a.carrier || "").toLowerCase();
          bVal = (b.carrier || "").toLowerCase();
          break;
        case "trackingNumber":
          aVal = (a.trackingNumber || "").toLowerCase();
          bVal = (b.trackingNumber || "").toLowerCase();
          break;
        case "shippingCharges":
          aVal = Number(a.shippingCharges || 0);
          bVal = Number(b.shippingCharges || 0);
          break;
        case "shipmentStatus":
          aVal = a.shipmentStatus.toLowerCase();
          bVal = b.shipmentStatus.toLowerCase();
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredShipments, sortField, sortOrder]);

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
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search shipments..."
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

          {/* Status Filter */}
          <Select
            value={shipmentFilter}
            onValueChange={(value) =>
              setShipmentFilter(value as ShipmentFilter)
            }
          >
            <SelectTrigger className="h-8 w-32 text-xs bg-white border-slate-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="Pending" className="text-xs">Pending</SelectItem>
              <SelectItem value="Shipped" className="text-xs">Shipped</SelectItem>
              <SelectItem value="Delivered" className="text-xs">Delivered</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 border-slate-200 bg-white"
            onClick={loadShipments}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            onClick={() => router.push("/inventory/shipments/new")}
          >
            <Plus className="h-3.5 w-3.5" />
            New Shipment
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Sleek Compact KPI Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Total Shipments</span>
            <p className="text-lg font-bold text-slate-800 mt-0.5">{shipmentTotals.all}</p>
          </div>
          <div className="p-3 rounded-lg border border-amber-200/60 bg-amber-50/30 shadow-2xs">
            <span className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">Pending</span>
            <p className="text-lg font-bold text-amber-800 mt-0.5">{shipmentTotals.pending}</p>
          </div>
          <div className="p-3 rounded-lg border border-purple-200/60 bg-purple-50/30 shadow-2xs">
            <span className="text-[11px] font-medium text-purple-700 uppercase tracking-wide">Shipped</span>
            <p className="text-lg font-bold text-purple-800 mt-0.5">{shipmentTotals.shipped}</p>
          </div>
          <div className="p-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30 shadow-2xs">
            <span className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">Delivered</span>
            <p className="text-lg font-bold text-emerald-800 mt-0.5">{shipmentTotals.delivered}</p>
          </div>
        </div>

        {loading && shipments.length === 0 ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center bg-white">
            <p className="text-sm text-muted-foreground">
              No shipments added yet.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm text-xs gap-1"
              onClick={() => router.push("/inventory/shipments/new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Shipment
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-left">
                  <tr>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("shipDate")} className="group flex items-center gap-1 hover:text-teal-700">
                        Ship Date
                        <span className={sortField === "shipDate" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "shipDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("shipmentOrderNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Shipment Order Number
                        <span className={sortField === "shipmentOrderNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "shipmentOrderNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("packageSlipNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Package Number
                        <span className={sortField === "packageSlipNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "packageSlipNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("salesOrderNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Sales Order Number
                        <span className={sortField === "salesOrderNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "salesOrderNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("customerName")} className="group flex items-center gap-1 hover:text-teal-700">
                        Customer
                        <span className={sortField === "customerName" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "customerName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("carrier")} className="group flex items-center gap-1 hover:text-teal-700">
                        Carrier
                        <span className={sortField === "carrier" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "carrier" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("trackingNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Tracking Number
                        <span className={sortField === "trackingNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "trackingNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                      <button onClick={() => toggleSort("shippingCharges")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Shipping Charges
                        <span className={sortField === "shippingCharges" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "shippingCharges" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("shipmentStatus")} className="group flex items-center gap-1 hover:text-teal-700">
                        Status
                        <span className={sortField === "shipmentStatus" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                          {sortField === "shipmentStatus" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedShipments.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-6 text-muted-foreground text-center"
                        colSpan={9}
                      >
                        No shipments found for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    sortedShipments.map((row) => (
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
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </InventoryShell>
  );
}
