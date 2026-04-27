"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Plus, Trash2, ArrowRightLeft } from "lucide-react";
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
import { useOrganization } from "@/contexts/organization-context";
import { moveOrderApi, type MoveOrder, type MoveOrderStatus } from "@/lib/api/move-orders";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type Warehouse } from "@/lib/api/settings";
import { Badge } from "@/components/ui/badge";

interface MoveOrderFormState {
  orderNumber: string;
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  items: Array<{ itemId: string; quantity: string }>;
  referenceNumber: string;
  notes: string;
}

const DEFAULT_FORM: MoveOrderFormState = {
  orderNumber: "",
  date: new Date().toISOString().split("T")[0],
  fromWarehouseId: "",
  toWarehouseId: "",
  items: [{ itemId: "", quantity: "1" }],
  referenceNumber: "",
  notes: "",
};

export default function InventoryMoveOrdersPage() {
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [moveOrders, setMoveOrders] = useState<MoveOrder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MoveOrderFormState>(DEFAULT_FORM);

  const trackedItems = useMemo(
    () => (items || []).filter((item) => item.inventoryTracked && item.isActive),
    [items],
  );

  const loadMoveOrders = useCallback(async () => {
    const res = await moveOrderApi.list({ page: 1, limit: 100 });
    setMoveOrders(res.data || []);
  }, []);

  const loadData = useCallback(async () => {
    setFetching(true);
    try {
      const [itemsRes, warehousesRes] = await Promise.all([
        itemApi.list({ page: 1, limit: 500 }),
        settingsApi.warehouses.list(),
      ]);
      setItems(itemsRes.data || []);
      setWarehouses(warehousesRes.data || []);
      await loadMoveOrders();
      
      // Auto-generate order number if empty
      setForm(prev => ({
        ...prev,
        orderNumber: `MO-${Date.now().toString().slice(-6)}`
      }));
    } catch {
      toast.error("Failed to load move order data");
    } finally {
      setFetching(false);
    }
  }, [loadMoveOrders]);

  useEffect(() => {
    if (activeOrganization?._id) {
      void loadData();
    }
  }, [activeOrganization?._id, loadData]);

  const addItemRow = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { itemId: "", quantity: "1" }]
    }));
  };

  const removeItemRow = (index: number) => {
    if (form.items.length === 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItemRow = (index: number, field: "itemId" | "quantity", value: string) => {
    setForm(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  async function handleSubmit() {
    if (!form.fromWarehouseId || !form.toWarehouseId) {
      toast.error("Please select source and destination warehouses");
      return;
    }
    if (form.fromWarehouseId === form.toWarehouseId) {
      toast.error("Source and destination warehouses must be different");
      return;
    }
    
    const validItems = form.items.filter(i => i.itemId && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      toast.error("At least one valid item is required");
      return;
    }

    setSaving(true);
    try {
      await moveOrderApi.create({
        orderNumber: form.orderNumber,
        date: form.date,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
        items: validItems.map(i => ({ itemId: i.itemId, quantity: Number(i.quantity) })),
        referenceNumber: form.referenceNumber,
        notes: form.notes,
      });
      toast.success("Move order created successfully");
      setForm({
        ...DEFAULT_FORM,
        orderNumber: `MO-${Date.now().toString().slice(-6)}`,
        fromWarehouseId: form.fromWarehouseId,
        toWarehouseId: form.toWarehouseId,
      });
      await loadMoveOrders();
    } catch (error) {
      toast.error((error as Error).message || "Failed to create move order");
    } finally {
      setSaving(false);
    }
  }

  const getStatusBadge = (status: MoveOrderStatus) => {
    switch (status) {
      case "Draft": return <Badge variant="secondary">{status}</Badge>;
      case "Sent": return <Badge variant="outline" className="border-blue-500 text-blue-600">{status}</Badge>;
      case "In Transit": return <Badge variant="outline" className="border-orange-500 text-orange-600">{status}</Badge>;
      case "Received": return <Badge variant="success">{status}</Badge>;
      case "Cancelled": return <Badge variant="destructive">{status}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const getWarehouseName = (w: any) => {
    if (!w) return "-";
    if (typeof w === "string") return warehouses.find(wh => wh._id === w)?.name || w;
    return w.name || "-";
  };

  const getItemName = (item: any) => {
    if (!item) return "-";
    if (typeof item === "string") return items.find(i => i._id === item)?.name || item;
    return item.name || "-";
  };

  return (
    <InventoryShell
      title="Move Orders"
      actions={(
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadData} disabled={fetching}>
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
        </Button>
      )}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>New Move Order</CardTitle>
            <CardDescription>
              Orchestrate internal stock transfers between warehouses. Release committed stock from source and receive at destination.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <div className="space-y-1.5">
                <Label>Order Number</Label>
                <Input 
                  value={form.orderNumber} 
                  onChange={e => setForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input 
                  type="date"
                  value={form.date} 
                  onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>From Warehouse</Label>
                <Select value={form.fromWarehouseId} onValueChange={v => setForm(prev => ({ ...prev, fromWarehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>To Warehouse</Label>
                <Select value={form.toWarehouseId} onValueChange={v => setForm(prev => ({ ...prev, toWarehouseId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Transfer Items</Label>
              {form.items.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={row.itemId} onValueChange={v => updateItemRow(idx, "itemId", v)}>
                      <SelectTrigger><SelectValue placeholder="Select Item" /></SelectTrigger>
                      <SelectContent>
                        {trackedItems.map(item => (
                          <SelectItem key={item._id} value={item._id}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32">
                    <Input 
                      type="number" 
                      value={row.quantity} 
                      onChange={e => updateItemRow(idx, "quantity", e.target.value)}
                      placeholder="Qty"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItemRow(idx)} disabled={form.items.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addItemRow} className="mt-2">
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input 
                  value={form.referenceNumber} 
                  onChange={e => setForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea 
                  value={form.notes} 
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Internal transfer notes..."
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={handleSubmit} disabled={saving || fetching}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                Initiate Transfer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer History</CardTitle>
            <CardDescription>Internal stock movements across organization warehouses.</CardDescription>
          </CardHeader>
          <CardContent>
            {fetching && moveOrders.length === 0 ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">From</th>
                      <th className="px-4 py-3">To</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moveOrders.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-muted-foreground text-center" colSpan={7}>
                          No move orders recorded yet.
                        </td>
                      </tr>
                    )}
                    {moveOrders.map((order) => (
                      <tr key={order._id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-blue-600">{order.orderNumber}</td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(order.date).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-3">{getWarehouseName(order.fromWarehouseId)}</td>
                        <td className="px-4 py-3">{getWarehouseName(order.toWarehouseId)}</td>
                        <td className="px-4 py-3">
                           <div className="max-w-xs truncate">
                              {order.items.map(i => `${getItemName(i.itemId)} (${i.quantity})`).join(", ")}
                           </div>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(order.status)}</td>
                        <td className="px-4 py-3 text-right">
                           <Button variant="ghost" size="sm" onClick={() => router.push(`/inventory/move-orders/${order._id}`)}>View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </InventoryShell>
  );
}
