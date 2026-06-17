"use client";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, FileUp} from "lucide-react";
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
import {
  inventoryApi,
  type InventoryAdjustment,
} from "@/lib/api/inventory";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type Warehouse } from "@/lib/api/settings";

interface AdjustmentFormState {
  itemId: string;
  direction: "Increase" | "Decrease";
  quantityDelta: string;
  unitCost: string;
  valueDelta: string;
  warehouseId: string;
  reason: string;
  referenceNumber: string;
  notes: string;
}

const DEFAULT_FORM: AdjustmentFormState = {
  itemId: "",
  direction: "Increase",
  quantityDelta: "",
  unitCost: "",
  valueDelta: "",
  warehouseId: "",
  reason: "Manual",
  referenceNumber: "",
  notes: "",
};

function itemName(adjustment: InventoryAdjustment): string {
  if (typeof adjustment.itemId === "object" && adjustment.itemId) {
    return adjustment.itemId.name;
  }
  return String(adjustment.itemId || "Unknown");
}

function warehouseName(adjustment: InventoryAdjustment): string {
  if (!adjustment.warehouseId) return "-";
  if (typeof adjustment.warehouseId === "object") return adjustment.warehouseId.name;
  return adjustment.warehouseId;
}

export default function InventoryAdjustmentsPage() {
  const { activeOrganization } = useOrganization();
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AdjustmentFormState>(DEFAULT_FORM);

  const trackedItems = useMemo(
    () => (items || []).filter((item) => item.inventoryTracked && item.isActive),
    [items],
  );

  const loadAdjustments = useCallback(async () => {
    const res = await inventoryApi.listAdjustments({ page: 1, limit: 100 });
    setAdjustments(res.data || []);
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
      await loadAdjustments();
    } catch {
      toast.error("Failed to load inventory adjustment data");
    } finally {
      setFetching(false);
    }
  }, [loadAdjustments]);

  useEffect(() => {
    if (activeOrganization?._id) {
      void loadData();
    }
  }, [activeOrganization?._id, loadData]);

  async function handleSubmit() {
    const quantity = Number(form.quantityDelta);
    if (!form.itemId) {
      toast.error("Please select an item");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Quantity must be a positive number");
      return;
    }

    setSaving(true);
    try {
      await inventoryApi.createAdjustment({
        itemId: form.itemId,
        direction: form.direction,
        quantityDelta: quantity,
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        valueDelta: form.valueDelta ? Number(form.valueDelta) : undefined,
        warehouseId: form.warehouseId || undefined,
        reason: form.reason || "Manual",
        referenceNumber: form.referenceNumber || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Inventory adjustment posted");
      setForm((prev) => ({
        ...DEFAULT_FORM,
        direction: prev.direction,
        warehouseId: prev.warehouseId,
      }));
      await loadAdjustments();
    } catch (error) {
      toast.error((error as Error).message || "Failed to post adjustment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InventoryShell
      title="Inventory Adjustments"
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadData} disabled={fetching}>
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
        </Button>
          <Link href="/batch-import?section=inventory&type=Inventory Adjustments&back=/inventory/adjustments">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
              <FileUp className="h-3.5 w-3.5" /> Batch Import
            </Button>
          </Link>
        </div>
      )}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>New Adjustment</CardTitle>
            <CardDescription>
              Record manual stock and valuation changes. Every adjustment is stored as a movement entry for audit lineage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5 xl:col-span-2">
                <Label>Item</Label>
                <Select value={form.itemId} onValueChange={(v) => setForm((prev) => ({ ...prev, itemId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select inventory-tracked item" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {trackedItems.length === 0 ? (
                      <SelectItem value="__empty" disabled>No inventory-tracked items available</SelectItem>
                    ) : (
                      trackedItems.map((item) => (
                        <SelectItem key={item._id} value={item._id}>
                          {item.name} ({Number(item.stockOnHand || 0).toLocaleString("en-IN")})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, direction: v as "Increase" | "Decrease" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Increase">Increase</SelectItem>
                    <SelectItem value="Decrease">Decrease</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm((prev) => ({ ...prev, reason: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stock Count">Stock Count</SelectItem>
                    <SelectItem value="Damage">Damage</SelectItem>
                    <SelectItem value="Loss">Loss</SelectItem>
                    <SelectItem value="Found">Found</SelectItem>
                    <SelectItem value="Return">Return</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.quantityDelta}
                  onChange={(e) => setForm((prev) => ({ ...prev, quantityDelta: e.target.value }))}
                  placeholder="0"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Unit Cost (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitCost}
                  onChange={(e) => setForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                  placeholder="Auto from average cost"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Value Delta (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valueDelta}
                  onChange={(e) => setForm((prev) => ({ ...prev, valueDelta: e.target.value }))}
                  placeholder="Auto calculated if blank"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Warehouse</Label>
                <Select
                  value={form.warehouseId || "__none"}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, warehouseId: v === "__none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">- None -</SelectItem>
                    {warehouses.length === 0 ? (
                      <SelectItem value="__empty" disabled>No warehouses configured</SelectItem>
                    ) : (
                      warehouses.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>{warehouse.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input
                  value={form.referenceNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-1.5 xl:col-span-4">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Add context for auditors and reviewers"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={handleSubmit} disabled={saving || fetching}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span className="ml-2">Post Adjustment</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adjustment History</CardTitle>
            <CardDescription>Most recent inventory movement lineage entries.</CardDescription>
          </CardHeader>
          <CardContent>
            {fetching && adjustments.length === 0 ? (
              <div className="flex items-center justify-center py-14">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Reason</th>
                      <th className="px-3 py-2 text-right">Qty Delta</th>
                      <th className="px-3 py-2 text-right">Value Delta</th>
                      <th className="px-3 py-2 text-right">Result Stock</th>
                      <th className="px-3 py-2">Warehouse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-muted-foreground" colSpan={7}>
                          No inventory adjustments yet.
                        </td>
                      </tr>
                    )}
                    {adjustments.map((row) => (
                      <tr key={row._id} className="border-t">
                        <td className="px-3 py-2">{new Date(row.adjustedAt).toLocaleDateString("en-IN")}</td>
                        <td className="px-3 py-2 font-medium">{itemName(row)}</td>
                        <td className="px-3 py-2">{row.reason}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            row.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {row.quantityDelta >= 0 ? "+" : ""}
                          {Number(row.quantityDelta || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.valueDelta || 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.resultingStockOnHand || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-3 py-2">{warehouseName(row)}</td>
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
