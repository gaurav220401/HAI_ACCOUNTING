"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  salesOrderApi,
  type SalesOrder,
  type SalesOrderShipmentStatus,
} from "@/lib/api/sales-orders";
import { packageApi, type Package } from "@/lib/api/packages";

interface ShipmentMetaPayload {
  shipmentOrderNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shippingCharges?: number;
  notes?: string;
  sendStatusNotification?: boolean;
  shipmentAlreadyDelivered?: boolean;
  shipDate?: string;
}

interface ShipmentFormState {
  customerId: string;
  salesOrderId: string;
  packageSlipNumber: string;
  shipmentOrderNumber: string;
  shipDate: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  shippingCharges: string;
  notes: string;
  shipmentAlreadyDelivered: boolean;
  sendStatusNotification: boolean;
}

const SHIPMENT_META_PREFIX = "[SHIPMENT_META]";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFormState(): ShipmentFormState {
  return {
    customerId: "all",
    salesOrderId: "",
    packageSlipNumber: "",
    shipmentOrderNumber: "",
    shipDate: todayIsoDate(),
    carrier: "",
    trackingNumber: "",
    trackingUrl: "",
    shippingCharges: "",
    notes: "",
    shipmentAlreadyDelivered: false,
    sendStatusNotification: false,
  };
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

function getLineItemId(
  item: SalesOrder["lineItems"][number]["itemId"],
): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item._id || "";
}

function serializeShipmentNotes(
  meta: ShipmentMetaPayload,
  notes: string,
): string {
  const cleanNotes = notes.trim();
  const payload: ShipmentMetaPayload = {
    ...meta,
    notes: cleanNotes || undefined,
  };
  const serializedMeta = JSON.stringify(payload);
  if (!cleanNotes) {
    return `${SHIPMENT_META_PREFIX}${serializedMeta}`;
  }
  return `${SHIPMENT_META_PREFIX}${serializedMeta}\n${cleanNotes}`;
}

function createRemainingPackageLines(
  order: SalesOrder,
  packages: Package[],
): Array<{
  itemId: string;
  name?: string;
  ordered: number;
  packed: number;
  quantityToPack: number;
}> {
  const packedByItem: Record<string, number> = {};
  for (const pkg of packages) {
    for (const line of pkg.lineItems || []) {
      const itemId =
        typeof line.itemId === "object" ? line.itemId._id : line.itemId;
      if (!itemId) continue;
      packedByItem[itemId] =
        (packedByItem[itemId] || 0) + Number(line.quantityToPack || 0);
    }
  }

  return (order.lineItems || [])
    .map((line) => {
      const itemId = getLineItemId(line.itemId);
      const ordered = Number(line.quantity || 0);
      const packed = Number(packedByItem[itemId] || 0);
      return {
        itemId,
        name:
          line.name ||
          (typeof line.itemId === "object" && line.itemId ?
            line.itemId.name
          : "") ||
          "Item",
        ordered,
        packed,
        quantityToPack: Math.max(0, ordered - packed),
      };
    })
    .filter((line) => line.itemId && line.quantityToPack > 0);
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

export default function NewInventoryShipmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [packagesByOrder, setPackagesByOrder] = useState<
    Record<string, Package[]>
  >({});
  const [form, setForm] = useState<ShipmentFormState>(() => defaultFormState());

  const selectedOrder = useMemo(
    () => orders.find((order) => order._id === form.salesOrderId) || null,
    [orders, form.salesOrderId],
  );

  const selectedOrderPackages = useMemo(
    () => (form.salesOrderId ? packagesByOrder[form.salesOrderId] || [] : []),
    [packagesByOrder, form.salesOrderId],
  );

  const customerOptions = useMemo(() => {
    const customerMap = new Map<string, string>();
    for (const order of orders) {
      const id = getCustomerId(order);
      if (!id) continue;
      if (!customerMap.has(id)) {
        customerMap.set(id, getCustomerName(order));
      }
    }
    return Array.from(customerMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const salesOrderOptions = useMemo(() => {
    return orders
      .filter((order) => {
        if (form.customerId === "all") return true;
        return getCustomerId(order) === form.customerId;
      })
      .sort(
        (a, b) =>
          new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
      );
  }, [orders, form.customerId]);

  const loadData = useCallback(async () => {
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

      setOrders(activeOrders);
      setPackagesByOrder(packageMap);
    } catch {
      toast.error("Failed to load shipment form data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function selectSalesOrder(orderId: string) {
    if (!orderId) {
      setForm((prev) => ({
        ...prev,
        salesOrderId: "",
        packageSlipNumber: "",
        shipmentOrderNumber: "",
      }));
      return;
    }

    const order = orders.find((entry) => entry._id === orderId);
    const orderPackages = packagesByOrder[orderId] || [];
    const nextSequence = orderPackages.length + 1;
    const fallbackPrefix = order?.salesOrderNumber || "SO";

    setForm((prev) => ({
      ...prev,
      salesOrderId: orderId,
      packageSlipNumber: `PKG-${fallbackPrefix}-${nextSequence}`,
      shipmentOrderNumber: `SHP-${fallbackPrefix}-${nextSequence}`,
      shipDate: prev.shipDate || todayIsoDate(),
      carrier: order?.deliveryMethod || prev.carrier,
      shippingCharges:
        prev.shippingCharges ||
        (order?.shippingCharges ? String(order.shippingCharges) : ""),
    }));
  }

  async function handleSaveShipment() {
    if (!form.salesOrderId) {
      toast.error("Sales Order is required");
      return;
    }
    if (!form.packageSlipNumber.trim()) {
      toast.error("Package Number is required");
      return;
    }
    if (!form.shipmentOrderNumber.trim()) {
      toast.error("Shipment Order Number is required");
      return;
    }
    if (!form.shipDate) {
      toast.error("Ship Date is required");
      return;
    }

    const order = selectedOrder;
    if (!order) {
      toast.error("Selected sales order was not found");
      return;
    }

    const shippingChargesNumber = Number(form.shippingCharges || "0");
    if (
      form.shippingCharges.trim() &&
      (!Number.isFinite(shippingChargesNumber) || shippingChargesNumber < 0)
    ) {
      toast.error("Shipping Charges must be a valid non-negative number");
      return;
    }

    const relatedPackages = packagesByOrder[order._id] || [];
    const packageLines = createRemainingPackageLines(order, relatedPackages);

    const shipmentMeta: ShipmentMetaPayload = {
      shipmentOrderNumber: form.shipmentOrderNumber.trim(),
      carrier: form.carrier.trim() || undefined,
      trackingNumber: form.trackingNumber.trim() || undefined,
      trackingUrl: form.trackingUrl.trim() || undefined,
      shippingCharges:
        form.shippingCharges.trim() ? shippingChargesNumber : undefined,
      sendStatusNotification: form.sendStatusNotification,
      shipmentAlreadyDelivered: form.shipmentAlreadyDelivered,
      shipDate: form.shipDate,
    };

    setSaving(true);
    try {
      await packageApi.create({
        salesOrderId: order._id,
        packageSlipNumber: form.packageSlipNumber.trim(),
        date: form.shipDate,
        internalNotes: serializeShipmentNotes(shipmentMeta, form.notes),
        lineItems: packageLines,
      });

      const shipmentStatus: SalesOrderShipmentStatus =
        form.shipmentAlreadyDelivered ? "Delivered" : "Shipped";

      const orderUpdate: Partial<SalesOrder> = {
        expectedShipmentDate: form.shipDate,
        deliveryMethod: form.carrier.trim() || undefined,
      };

      if (form.shippingCharges.trim()) {
        orderUpdate.shippingCharges = shippingChargesNumber;
      }

      await Promise.all([
        salesOrderApi.updateShipment(order._id, shipmentStatus),
        salesOrderApi.update(order._id, orderUpdate as any),
      ]);

      toast.success("Shipment saved successfully");
      router.push("/inventory/shipments");
    } catch (error) {
      toast.error((error as Error).message || "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryShell title="New Shipment">
      <div className="space-y-6">
        {loading ?
          <Card>
            <CardContent className="flex items-center justify-center py-14">
              <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            </CardContent>
          </Card>
        : null}

        <Card>
          <CardHeader>
            <CardTitle>New Shipment</CardTitle>
            <CardDescription>
              Create a shipment record and update dispatch status from here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Select
                  value={form.customerId}
                  onValueChange={(value) => {
                    setForm((prev) => ({
                      ...prev,
                      customerId: value,
                      salesOrderId: "",
                      packageSlipNumber: "",
                      shipmentOrderNumber: "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customerOptions.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sales Order Number</Label>
                <Select
                  value={form.salesOrderId || "__none"}
                  onValueChange={(value) =>
                    selectSalesOrder(value === "__none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Sales Order" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">Select Sales Order</SelectItem>
                    {salesOrderOptions.map((order) => (
                      <SelectItem key={order._id} value={order._id}>
                        {order.salesOrderNumber} - {getCustomerName(order)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Package Number</Label>
                <Input
                  value={form.packageSlipNumber}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      packageSlipNumber: event.target.value,
                    }))
                  }
                  placeholder="Enter Package Number"
                />
                {selectedOrderPackages.length > 0 ?
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedOrderPackages.slice(0, 6).map((pkg) => (
                      <button
                        key={pkg._id}
                        type="button"
                        className="rounded border px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-muted"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            packageSlipNumber: pkg.packageSlipNumber,
                          }))
                        }
                      >
                        {pkg.packageSlipNumber}
                      </button>
                    ))}
                  </div>
                : null}
              </div>

              <div className="space-y-1.5">
                <Label>Shipment Order Number</Label>
                <Input
                  value={form.shipmentOrderNumber}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      shipmentOrderNumber: event.target.value,
                    }))
                  }
                  placeholder="Enter Shipment Order Number"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Ship Date</Label>
                <Input
                  type="date"
                  value={form.shipDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      shipDate: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Carrier</Label>
                <Input
                  value={form.carrier}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      carrier: event.target.value,
                    }))
                  }
                  placeholder="Select or type to add"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tracking Number</Label>
                <Input
                  value={form.trackingNumber}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trackingNumber: event.target.value,
                    }))
                  }
                  placeholder="Tracking number"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Tracking URL</Label>
                <Input
                  value={form.trackingUrl}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      trackingUrl: event.target.value,
                    }))
                  }
                  placeholder="https://"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Shipping Charges (if any)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.shippingCharges}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      shippingCharges: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Add notes"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="shipment-delivered"
                  checked={form.shipmentAlreadyDelivered}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      shipmentAlreadyDelivered: checked === true,
                    }))
                  }
                />
                <Label htmlFor="shipment-delivered">
                  Shipment already delivered
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="shipment-notification"
                  checked={form.sendStatusNotification}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      sendStatusNotification: checked === true,
                    }))
                  }
                />
                <Label htmlFor="shipment-notification">
                  Send Status Notification
                </Label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                onClick={() => router.push("/inventory/shipments")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md"
                onClick={handleSaveShipment}
                disabled={saving || loading}
              >
                {saving ?
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : null}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </InventoryShell>
  );
}
