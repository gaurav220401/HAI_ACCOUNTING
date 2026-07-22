"use client";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, FileUp, Search, Calendar, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
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
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const trackedItems = useMemo(
    () => (items || []).filter((item) => item.inventoryTracked && item.isActive),
    [items],
  );

  type AdjSortField = "date" | "item" | "reason" | "qty" | "value" | "stock" | "warehouse";
  type AdjSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<AdjSortField>("date");
  const [sortOrder, setSortOrder] = useState<AdjSortOrder>("desc");

  function toggleSort(field: AdjSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const filteredAdjustments = useMemo(() => {
    return adjustments.filter((adj) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          itemName(adj).toLowerCase().includes(q) ||
          (adj.reason || "").toLowerCase().includes(q) ||
          warehouseName(adj).toLowerCase().includes(q) ||
          (adj.referenceNumber || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (fromDate || toDate) {
        const d = adj.adjustedAt ? new Date(adj.adjustedAt).toISOString().slice(0, 10) : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [adjustments, search, fromDate, toDate]);

  const sortedAdjustments = useMemo(() => {
    const list = [...filteredAdjustments];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "date":
          aVal = new Date(a.adjustedAt || 0).getTime();
          bVal = new Date(b.adjustedAt || 0).getTime();
          break;
        case "item":
          aVal = itemName(a).toLowerCase();
          bVal = itemName(b).toLowerCase();
          break;
        case "reason":
          aVal = (a.reason || "").toLowerCase();
          bVal = (b.reason || "").toLowerCase();
          break;
        case "qty":
          aVal = Number(a.quantityDelta || 0);
          bVal = Number(b.quantityDelta || 0);
          break;
        case "value":
          aVal = Number(a.valueDelta || 0);
          bVal = Number(b.valueDelta || 0);
          break;
        case "stock":
          aVal = Number(a.resultingStockOnHand || 0);
          bVal = Number(b.resultingStockOnHand || 0);
          break;
        case "warehouse":
          aVal = warehouseName(a).toLowerCase();
          bVal = warehouseName(b).toLowerCase();
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredAdjustments, sortField, sortOrder]);

  const summary = useMemo(() => {
    const total = filteredAdjustments.length;
    const increases = filteredAdjustments.filter((a) => a.direction === "Increase").length;
    const decreases = filteredAdjustments.filter((a) => a.direction === "Decrease").length;
    const netQtyDelta = filteredAdjustments.reduce((acc, a) => {
      const qty = Number(a.quantityDelta || 0);
      return acc + (a.direction === "Increase" ? qty : -qty);
    }, 0);
    const netValueDelta = filteredAdjustments.reduce((acc, a) => {
      const val = Number(a.valueDelta || 0);
      return acc + (a.direction === "Increase" ? val : -val);
    }, 0);
    return { total, increases, decreases, netQtyDelta, netValueDelta };
  }, [filteredAdjustments]);

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
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search adjustments..."
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

          <Button variant="outline" size="sm" className="h-8 px-2 border-slate-200 bg-white" onClick={loadData} disabled={fetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
          </Button>
          <Link href="/batch-import?section=inventory&type=Inventory Adjustments&back=/inventory/adjustments">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md">
              <FileUp className="h-3.5 w-3.5" /> Batch Import
            </Button>
          </Link>
        </div>
      )}
    >
      <div className="space-y-6">
        {/* Sleek Ultra-Compact KPI Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Adjustments</span>
            <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.total}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Stock Increases</span>
            <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.increases}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <span className="text-[11px] font-semibold text-rose-600 uppercase tracking-wide">Stock Decreases</span>
            <span className="text-sm font-bold text-rose-700 tabular-nums">{summary.decreases}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
            <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Net Value Change</span>
            <span className={cn("text-sm font-bold tabular-nums", summary.netValueDelta >= 0 ? "text-teal-700" : "text-rose-600")}>
              {summary.netValueDelta >= 0 ? "+" : ""}₹{summary.netValueDelta.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

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

            {form.quantityDelta ? (
              <div className="flex items-center justify-between mt-4 p-3 bg-teal-50/50 rounded-md border border-slate-200 text-xs font-semibold text-slate-700">
                <span>Direction: <strong className={form.direction === "Increase" ? "text-emerald-700" : "text-rose-600"}>{form.direction}</strong></span>
                <span>Qty Change: <strong className={form.direction === "Increase" ? "text-emerald-700" : "text-rose-600"}>{form.direction === "Increase" ? "+" : "-"}{form.quantityDelta}</strong></span>
                {form.valueDelta ? (
                  <span>Valuation Change: <strong className="text-teal-700">{form.direction === "Increase" ? "+" : "-"}₹{Number(form.valueDelta).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                ) : form.unitCost ? (
                  <span>Est. Valuation Change: <strong className="text-teal-700">{form.direction === "Increase" ? "+" : "-"}₹{(Number(form.quantityDelta) * Number(form.unitCost)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Button onClick={handleSubmit} disabled={saving || fetching} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md">
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
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">
                        <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                          Date
                          <span className={sortField === "date" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">
                        <button onClick={() => toggleSort("item")} className="group flex items-center gap-1 hover:text-teal-700">
                          Item
                          <span className={sortField === "item" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "item" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">
                        <button onClick={() => toggleSort("reason")} className="group flex items-center gap-1 hover:text-teal-700">
                          Reason
                          <span className={sortField === "reason" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "reason" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                        <button onClick={() => toggleSort("qty")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                          Qty Delta
                          <span className={sortField === "qty" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "qty" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                        <button onClick={() => toggleSort("value")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                          Value Delta
                          <span className={sortField === "value" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "value" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                        <button onClick={() => toggleSort("stock")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                          Result Stock
                          <span className={sortField === "stock" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "stock" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">
                        <button onClick={() => toggleSort("warehouse")} className="group flex items-center gap-1 hover:text-teal-700">
                          Warehouse
                          <span className={sortField === "warehouse" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                            {sortField === "warehouse" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdjustments.length === 0 && (
                      <tr>
                        <td className="px-4 py-4 text-muted-foreground" colSpan={7}>
                          No inventory adjustments yet.
                        </td>
                      </tr>
                    )}
                    {sortedAdjustments.map((row) => (
                      <tr key={row._id} className="border-t border-slate-100 hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-2">{new Date(row.adjustedAt).toLocaleDateString("en-IN")}</td>
                        <td className="px-4 py-2 font-medium text-slate-700">{itemName(row)}</td>
                        <td className="px-4 py-2 text-slate-600">{row.reason}</td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-semibold ${
                            row.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {row.quantityDelta >= 0 ? "+" : ""}
                          {Number(row.quantityDelta || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                          {Number(row.valueDelta || 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-700">
                          {Number(row.resultingStockOnHand || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{warehouseName(row)}</td>
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
