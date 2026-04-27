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
import { itemApi, type Item } from "@/lib/api/items";
import { packageApi, type Package } from "@/lib/api/packages";
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";

interface PackItem {
  itemId: string;
  name: string;
  ordered: number;
  packed: number;
  quantityToPack: number;
  stockOnHand: number;
}

interface CustomerOption {
  id: string;
  name: string;
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

function createPackItems(
  order: SalesOrder,
  packages: Package[],
  inventoryItems: Item[],
): PackItem[] {
  const packedQtyMap: Record<string, number> = {};
  for (const pkg of packages) {
    for (const line of pkg.lineItems || []) {
      const itemId =
        typeof line.itemId === "object" ? line.itemId._id : line.itemId;
      if (!itemId) continue;
      packedQtyMap[itemId] =
        (packedQtyMap[itemId] || 0) + Number(line.quantityToPack || 0);
    }
  }

  return (order.lineItems || []).map((line) => {
    const itemId =
      typeof line.itemId === "object" && line.itemId ?
        line.itemId._id
      : String(line.itemId || "");

    const alreadyPacked = packedQtyMap[itemId] || 0;
    const inv = inventoryItems.find((item) => item._id === itemId);

    return {
      itemId,
      name:
        line.name ||
        (typeof line.itemId === "object" && line.itemId ?
          line.itemId.name
        : "Item") ||
        "Item",
      ordered: Number(line.quantity || 0),
      packed: alreadyPacked,
      quantityToPack: Math.max(0, Number(line.quantity || 0) - alreadyPacked),
      stockOnHand: Number(inv?.stockOnHand || 0),
    };
  });
}

export default function NewInventoryPackagePage() {
  const router = useRouter();

  const [bootLoading, setBootLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [allOrders, setAllOrders] = useState<SalesOrder[]>([]);
  const [inventoryItems, setInventoryItems] = useState<Item[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string>("");

  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);

  const [packageSlipNumber, setPackageSlipNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [internalNotes, setInternalNotes] = useState("");

  const [dimLength, setDimLength] = useState("");
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");
  const [dimUnit, setDimUnit] = useState("cm");

  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");

  const loadBootData = useCallback(async () => {
    setBootLoading(true);
    try {
      const [orders, itemsRes] = await Promise.all([
        fetchAllSalesOrders(),
        itemApi.list({ page: 1, limit: 1000 }),
      ]);
      const validOrders = orders.filter((order) => order.status !== "VOID");
      setAllOrders(validOrders);
      setInventoryItems(itemsRes.data || []);
    } catch {
      toast.error("Failed to load package setup data");
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootData();
  }, [loadBootData]);

  const customerOptions = useMemo<CustomerOption[]>(() => {
    const map = new Map<string, string>();
    for (const order of allOrders) {
      const id = getCustomerId(order);
      if (!id) continue;
      if (!map.has(id)) {
        map.set(id, getCustomerName(order));
      }
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allOrders]);

  const salesOrderOptions = useMemo(() => {
    const scoped = allOrders.filter((order) => {
      const customerId = getCustomerId(order);
      return selectedCustomerId === "all" || customerId === selectedCustomerId;
    });

    return scoped.sort(
      (a, b) =>
        new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(),
    );
  }, [allOrders, selectedCustomerId]);

  const totalItems = useMemo(
    () =>
      items.reduce((acc, curr) => acc + Number(curr.quantityToPack || 0), 0),
    [items],
  );

  const hasSelectedOrder = Boolean(selectedSalesOrderId && selectedOrder);

  useEffect(() => {
    async function loadSelectedOrderData() {
      if (!selectedSalesOrderId) {
        setSelectedOrder(null);
        setItems([]);
        setPackageSlipNumber("");
        return;
      }

      setOrderLoading(true);
      try {
        const [orderRes, pkgRes] = await Promise.all([
          salesOrderApi.getById(selectedSalesOrderId),
          packageApi.listByOrder(selectedSalesOrderId),
        ]);

        const order = orderRes.data;
        const packages = pkgRes.data || [];

        setSelectedOrder(order);
        setPackageSlipNumber(
          `PKG-${order.salesOrderNumber}-${packages.length + 1}`,
        );
        setItems(createPackItems(order, packages, inventoryItems));
      } catch {
        toast.error("Failed to load selected sales order");
      } finally {
        setOrderLoading(false);
      }
    }

    void loadSelectedOrderData();
  }, [selectedSalesOrderId, inventoryItems]);

  async function handleSave() {
    if (!selectedSalesOrderId) {
      toast.error("Sales Order is required");
      return;
    }
    if (!packageSlipNumber.trim()) {
      toast.error("Package Slip# is required");
      return;
    }
    if (totalItems <= 0) {
      toast.error("You must pack at least one item");
      return;
    }

    const stockErrors = items.filter(
      (item) =>
        item.quantityToPack > 0 && item.quantityToPack > item.stockOnHand,
    );
    if (stockErrors.length > 0) {
      const itemNames = stockErrors.map((item) => item.name).join(", ");
      const confirmed = window.confirm(
        `Packing quantity exceeds stock on hand for: ${itemNames}. Do you want to continue?`,
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const dimLengthNum = dimLength ? Number(dimLength) : undefined;
      const dimWidthNum = dimWidth ? Number(dimWidth) : undefined;
      const dimHeightNum = dimHeight ? Number(dimHeight) : undefined;
      const hasDimensions =
        dimLengthNum !== undefined ||
        dimWidthNum !== undefined ||
        dimHeightNum !== undefined;

      const weightValueNum = weightValue ? Number(weightValue) : undefined;
      const hasWeight = weightValueNum !== undefined;

      await packageApi.create({
        salesOrderId: selectedSalesOrderId,
        packageSlipNumber,
        date,
        dimensions:
          hasDimensions ?
            {
              length: dimLengthNum,
              width: dimWidthNum,
              height: dimHeightNum,
              unit: dimUnit,
            }
          : undefined,
        weight:
          hasWeight ?
            {
              value: weightValueNum,
              unit: weightUnit,
            }
          : undefined,
        internalNotes: internalNotes || undefined,
        lineItems: items
          .filter((item) => Number(item.quantityToPack) > 0)
          .map((item) => ({
            itemId: item.itemId,
            name: item.name,
            ordered: Number(item.ordered),
            packed: Number(item.packed),
            quantityToPack: Number(item.quantityToPack),
          })),
      });

      toast.success("Package created successfully");
      router.push("/inventory/packages");
    } catch (error) {
      toast.error((error as Error).message || "Failed to create package");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryShell title="New Package">
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Create Package</CardTitle>
            <CardDescription>
              Choose customer and sales order first, then complete package
              details and item quantities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={(value) => {
                    setSelectedCustomerId(value);
                    setSelectedSalesOrderId("");
                  }}
                  disabled={bootLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
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
                <Label>Sales Order#</Label>
                <Select
                  value={selectedSalesOrderId}
                  onValueChange={setSelectedSalesOrderId}
                  disabled={bootLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Sales Order" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {salesOrderOptions.length === 0 ?
                      <SelectItem value="__none" disabled>
                        No sales orders available
                      </SelectItem>
                    : salesOrderOptions.map((order) => (
                        <SelectItem key={order._id} value={order._id}>
                          {order.salesOrderNumber} - {getCustomerName(order)}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {bootLoading || orderLoading ?
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        : <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Package Slip#</Label>
                  <Input
                    value={packageSlipNumber}
                    onChange={(e) => setPackageSlipNumber(e.target.value)}
                    placeholder="Package number"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Dimensions</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="L"
                      type="number"
                      value={dimLength}
                      onChange={(e) => setDimLength(e.target.value)}
                    />
                    <span className="text-muted-foreground">x</span>
                    <Input
                      placeholder="W"
                      type="number"
                      value={dimWidth}
                      onChange={(e) => setDimWidth(e.target.value)}
                    />
                    <span className="text-muted-foreground">x</span>
                    <Input
                      placeholder="H"
                      type="number"
                      value={dimHeight}
                      onChange={(e) => setDimHeight(e.target.value)}
                    />
                    <Select value={dimUnit} onValueChange={setDimUnit}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                        <SelectItem value="m">m</SelectItem>
                        <SelectItem value="ft">ft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Weight</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={weightValue}
                      onChange={(e) => setWeightValue(e.target.value)}
                    />
                    <Select value={weightUnit} onValueChange={setWeightUnit}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You can also select or scan the items to be included from the
                sales order.
              </div>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">ITEMS & DESCRIPTION</th>
                      <th className="px-3 py-2 text-right">ORDERED</th>
                      <th className="px-3 py-2 text-right">PACKED</th>
                      <th className="px-3 py-2 text-right">QUANTITY TO PACK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ?
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-10 text-center text-muted-foreground"
                        >
                          {hasSelectedOrder ?
                            "No line items available to pack."
                          : "Select a sales order to load line items."}
                        </td>
                      </tr>
                    : items.map((item, idx) => (
                        <tr
                          key={item.itemId || String(idx)}
                          className="border-t"
                        >
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {item.ordered}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {item.packed}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={Math.max(0, item.ordered - item.packed)}
                              className="ml-auto h-8 w-28 text-right"
                              value={item.quantityToPack}
                              disabled={!hasSelectedOrder}
                              onChange={(e) => {
                                const next = [...items];
                                const raw = Number(e.target.value);
                                const safe =
                                  Number.isFinite(raw) ?
                                    Math.max(
                                      0,
                                      Math.min(
                                        raw,
                                        Math.max(0, item.ordered - item.packed),
                                      ),
                                    )
                                  : 0;
                                next[idx].quantityToPack = safe;
                                setItems(next);
                              }}
                            />
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Stock on hand: {item.stockOnHand}
                            </div>
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5">
                <Label>Internal Notes</Label>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Add internal notes"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Total items to pack:{" "}
                  <span className="font-medium text-foreground">
                    {totalItems}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push("/inventory/packages")}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={!hasSelectedOrder || saving}
                  >
                    {saving ?
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : null}
                    Save
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        }
      </div>
    </InventoryShell>
  );
}
