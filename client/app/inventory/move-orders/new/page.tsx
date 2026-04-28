"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  moveOrderApi,
  type CreateMoveOrderInput,
  type MoveOrder,
  type MoveOrderStatus,
} from "@/lib/api/move-orders";
import {
  settingsApi,
  type SalesPerson,
  type Warehouse,
} from "@/lib/api/settings";
import {
  listLocalMoveOrders,
  saveLocalMoveOrder,
} from "@/app/inventory/move-orders/_lib/local-move-orders";

interface MoveOrderLineDraft {
  id: string;
  itemId: string;
  quantityTransferred: string;
}

interface MoveOrderFormState {
  moveOrderNumber: string;
  moveDate: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  assigneeId: string;
  assigneeName: string;
  internalNotes: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeLineId(): string {
  return `line-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function buildMoveOrderNumber(serial: number): string {
  const datePart = todayIsoDate().replace(/-/g, "");
  return `MO-${datePart}-${String(Math.max(1, serial)).padStart(3, "0")}`;
}

function availableForWarehouse(item: Item, sourceWarehouseId: string): number {
  if (!sourceWarehouseId) {
    return Number(item.stockOnHand || 0);
  }

  if (!item.warehouseId || item.warehouseId === sourceWarehouseId) {
    return Number(item.stockOnHand || 0);
  }

  return 0;
}

export default function NewInventoryMoveOrderPage() {
  const router = useRouter();

  const [bootLoading, setBootLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);

  const [form, setForm] = useState<MoveOrderFormState>({
    moveOrderNumber: "",
    moveDate: todayIsoDate(),
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    assigneeId: "",
    assigneeName: "",
    internalNotes: "",
  });

  const [lines, setLines] = useState<MoveOrderLineDraft[]>([
    { id: makeLineId(), itemId: "", quantityTransferred: "" },
  ]);

  const trackedItems = useMemo(
    () =>
      items
        .filter((item) => item.inventoryTracked && item.isActive)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );

  const destinationWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) => warehouse._id !== form.sourceWarehouseId,
      ),
    [warehouses, form.sourceWarehouseId],
  );

  const itemMap = useMemo(() => {
    const map = new Map<string, Item>();
    trackedItems.forEach((item) => {
      map.set(item._id, item);
    });
    return map;
  }, [trackedItems]);

  const totalTransferQty = useMemo(
    () =>
      lines.reduce(
        (sum, row) =>
          sum +
          (Number.isFinite(Number(row.quantityTransferred)) ?
            Number(row.quantityTransferred)
          : 0),
        0,
      ),
    [lines],
  );

  const loadBootData = useCallback(async () => {
    setBootLoading(true);
    try {
      const [itemsRes, warehousesRes, salesPersonsRes] = await Promise.all([
        itemApi.list({ page: 1, limit: 1000 }),
        settingsApi.warehouses.list(),
        settingsApi.salesPersons.list(),
      ]);

      setItems(itemsRes.data || []);
      setWarehouses(
        (warehousesRes.data || []).filter((warehouse) => warehouse.isActive),
      );
      setSalesPersons(
        (salesPersonsRes.data || []).filter((person) => person.isActive),
      );

      const localOrders = listLocalMoveOrders();

      let remoteOrders: MoveOrder[] = [];
      try {
        const res = await moveOrderApi.list({ page: 1, limit: 500 });
        remoteOrders = res.data || [];
      } catch {
        remoteOrders = [];
      }

      const nextSerial = Math.max(localOrders.length, remoteOrders.length) + 1;

      setForm((prev) => ({
        ...prev,
        moveOrderNumber:
          prev.moveOrderNumber || buildMoveOrderNumber(nextSerial),
      }));
    } catch {
      toast.error("Failed to load move order setup data");
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootData();
  }, [loadBootData]);

  useEffect(() => {
    if (
      form.sourceWarehouseId &&
      form.destinationWarehouseId === form.sourceWarehouseId
    ) {
      setForm((prev) => ({ ...prev, destinationWarehouseId: "" }));
    }
  }, [form.sourceWarehouseId, form.destinationWarehouseId]);

  function updateLine(id: string, patch: Partial<MoveOrderLineDraft>) {
    setLines((prev) =>
      prev.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { id: makeLineId(), itemId: "", quantityTransferred: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => {
      if (prev.length <= 1) {
        return [{ ...prev[0], itemId: "", quantityTransferred: "" }];
      }
      return prev.filter((line) => line.id !== id);
    });
  }

  async function handleSave(status: MoveOrderStatus) {
    if (!form.moveOrderNumber.trim()) {
      toast.error("Move Order# is required");
      return;
    }

    if (!form.moveDate) {
      toast.error("Date is required");
      return;
    }

    if (!form.sourceWarehouseId) {
      toast.error("Source warehouse is required");
      return;
    }

    if (!form.destinationWarehouseId) {
      toast.error("Destination warehouse is required");
      return;
    }

    if (form.sourceWarehouseId === form.destinationWarehouseId) {
      toast.error("Source and destination warehouse cannot be the same");
      return;
    }

    const filledRows = lines.filter(
      (line) => line.itemId || line.quantityTransferred.trim(),
    );

    if (filledRows.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    const preparedItems: CreateMoveOrderInput["lineItems"] = [];

    for (const row of filledRows) {
      if (!row.itemId) {
        toast.error("Each line item needs an item");
        return;
      }

      const qty = Number(row.quantityTransferred);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error("Transferred quantity must be a positive number");
        return;
      }

      const item = itemMap.get(row.itemId);
      if (!item) {
        toast.error("One of the selected items no longer exists");
        return;
      }

      preparedItems.push({
        itemId: row.itemId,
        itemName: item.name,
        sku: item.sku,
        quantityTransferred: qty,
      });
    }

    const overdrawnItems = preparedItems
      .map((line) => {
        const item = itemMap.get(line.itemId);
        if (!item) return null;

        const available = availableForWarehouse(item, form.sourceWarehouseId);
        if (line.quantityTransferred > available) {
          return `${item.name} (${line.quantityTransferred} > ${available})`;
        }

        return null;
      })
      .filter(Boolean) as string[];

    if (overdrawnItems.length > 0) {
      const confirmed = window.confirm(
        `Some lines exceed available stock in source warehouse: ${overdrawnItems.join(
          ", ",
        )}. Do you want to continue?`,
      );
      if (!confirmed) {
        return;
      }
    }

    const assigneeById = salesPersons.find(
      (person) => person._id === form.assigneeId,
    );

    const payload: CreateMoveOrderInput = {
      moveOrderNumber: form.moveOrderNumber.trim(),
      moveDate: form.moveDate,
      sourceWarehouseId: form.sourceWarehouseId,
      destinationWarehouseId: form.destinationWarehouseId,
      assigneeId: form.assigneeId || undefined,
      assigneeName: form.assigneeName.trim() || assigneeById?.name || undefined,
      internalNotes: form.internalNotes.trim() || undefined,
      status,
      lineItems: preparedItems,
    };

    setSaving(true);

    try {
      await moveOrderApi.create(payload);
      toast.success(`Move order saved as ${status.toLowerCase()}`);
      router.push("/inventory/move-orders");
    } catch {
      saveLocalMoveOrder(payload, status);
      toast.success(
        "Move order saved locally. Backend endpoint can be connected later without UI changes.",
      );
      router.push("/inventory/move-orders");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryShell
      title="New Move Order"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => router.push("/inventory/move-orders")}
        >
          Back to Move Orders
        </Button>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Create Move Order</CardTitle>
            <CardDescription>
              Transfer inventory between warehouses with complete, editable
              fields.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {bootLoading ?
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading inventory and warehouse data...
              </div>
            : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Move Order#</Label>
                <Input
                  value={form.moveOrderNumber}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      moveOrderNumber: e.target.value,
                    }))
                  }
                  placeholder="MO-YYYYMMDD-001"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.moveDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, moveDate: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Assignee</Label>
                <Select
                  value={form.assigneeId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, assigneeId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesPersons.length === 0 ?
                      <SelectItem value="__none" disabled>
                        No users configured
                      </SelectItem>
                    : salesPersons.map((person) => (
                        <SelectItem key={person._id} value={person._id}>
                          {person.name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Source Warehouse</Label>
                <Select
                  value={form.sourceWarehouseId}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, sourceWarehouseId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.length === 0 ?
                      <SelectItem value="__none" disabled>
                        No warehouses configured
                      </SelectItem>
                    : warehouses.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Destination Warehouse</Label>
                <Select
                  value={form.destinationWarehouseId}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      destinationWarehouseId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationWarehouses.length === 0 ?
                      <SelectItem value="__none" disabled>
                        {warehouses.length === 0 ?
                          "No warehouses configured"
                        : "Select source warehouse first"}
                      </SelectItem>
                    : destinationWarehouses.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Assignee Name (optional)</Label>
                <Input
                  value={form.assigneeName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      assigneeName: e.target.value,
                    }))
                  }
                  placeholder="Type a custom assignee name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Textarea
                value={form.internalNotes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    internalNotes: e.target.value,
                  }))
                }
                rows={2}
                placeholder="Optional notes for this movement"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Item Details</CardTitle>
            <CardDescription>
              Add one or more items to transfer. All row fields are editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">Transfer Qty</th>
                    <th className="w-16 px-3 py-2 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const selectedItem =
                      line.itemId ? itemMap.get(line.itemId) : undefined;
                    const available =
                      selectedItem ?
                        availableForWarehouse(
                          selectedItem,
                          form.sourceWarehouseId,
                        )
                      : 0;

                    return (
                      <tr key={line.id} className="border-t">
                        <td className="px-3 py-2">
                          <Select
                            value={line.itemId}
                            onValueChange={(value) =>
                              updateLine(line.id, { itemId: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {trackedItems.length === 0 ?
                                <SelectItem value="__none" disabled>
                                  No inventory tracked items
                                </SelectItem>
                              : trackedItems.map((item) => (
                                  <SelectItem key={item._id} value={item._id}>
                                    {item.name}
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {selectedItem?.sku || "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(available || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.quantityTransferred}
                            onChange={(e) =>
                              updateLine(line.id, {
                                quantityTransferred: e.target.value,
                              })
                            }
                            className="ml-auto w-32 text-right"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeLine(line.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add New Row
              </Button>

              <p className="text-sm text-muted-foreground">
                Total Quantity Transferred:{" "}
                {Number(totalTransferQty || 0).toLocaleString("en-IN")}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/inventory/move-orders")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSave("Draft")}
            disabled={saving}
          >
            {saving ?
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : null}
            Save as Draft
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave("Completed")}
            disabled={saving}
          >
            {saving ?
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : null}
            Save as Completed
          </Button>
        </div>
      </div>
    </InventoryShell>
  );
}
