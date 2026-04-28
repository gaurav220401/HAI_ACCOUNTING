"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  Plus, Search, Package, RefreshCw, Pencil, X, MoreHorizontal, Copy,
  EyeOff, Eye, Trash2, Loader2, ShoppingCart, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { itemApi, type Item, type ItemBulkAction, type ItemInventoryMetrics } from "@/lib/api/items";
import { inventoryApi, type InventoryAdjustment } from "@/lib/api/inventory";

// ─── Item detail type with populated fields ────────────────────────────────
interface PopulatedAccount { _id: string; name: string; }
interface PopulatedUnit    { _id: string; name: string; abbreviation: string; }
interface PopulatedTax     { _id: string; name: string; rate: number; taxType: string; }
interface ItemDetail extends Omit<Item, "salesAccountId" | "purchaseAccountId" | "inventoryAccountId" | "unit" | "intraStateTaxId" | "interStateTaxId"> {
  salesAccountId?: PopulatedAccount | string | null;
  purchaseAccountId?: PopulatedAccount | string | null;
  inventoryAccountId?: PopulatedAccount | string | null;
  unit?: PopulatedUnit | string | null;
  intraStateTaxId?: PopulatedTax | string | null;
  interStateTaxId?: PopulatedTax | string | null;
}

interface OpeningStockFormState {
  openingStock: string;
  ratePerUnit: string;
}

interface AdjustStockFormState {
  mode: "Quantity" | "Value";
  date: string;
  account: string;
  referenceNumber: string;
  quantityAdjusted: string;
  costPrice: string;
  valueDelta: string;
  reason: string;
  description: string;
}

const ADJUSTMENT_REASON_OPTIONS = [
  "Stock Count",
  "Damage",
  "Loss",
  "Found",
  "Return",
  "Manual",
  "Other",
] as const;

export default function ItemsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Goods" | "Service">("All");

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [inventoryMetrics, setInventoryMetrics] = useState<ItemInventoryMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "history">("overview");

  // Action states
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [actioning, setActioning] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkActioning, setBulkActioning] = useState(false);

  const [openingStockDialogOpen, setOpeningStockDialogOpen] = useState(false);
  const [openingStockSaving, setOpeningStockSaving] = useState(false);
  const [openingStockForm, setOpeningStockForm] = useState<OpeningStockFormState>({
    openingStock: "0",
    ratePerUnit: "0",
  });

  const [adjustStockDialogOpen, setAdjustStockDialogOpen] = useState(false);
  const [adjustStockSaving, setAdjustStockSaving] = useState(false);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [stockAdjustments, setStockAdjustments] = useState<InventoryAdjustment[]>([]);
  const [adjustStockForm, setAdjustStockForm] = useState<AdjustStockFormState>({
    mode: "Quantity",
    date: new Date().toISOString().slice(0, 10),
    account: "",
    referenceNumber: "",
    quantityAdjusted: "",
    costPrice: "",
    valueDelta: "",
    reason: "Manual",
    description: "",
  });

  // ─── Auth guards ────────────────────────────────────────────────────────
  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ─── Data fetching ───────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setFetching(true);
    try {
      const res = await itemApi.list({ page: 1, limit: 200 });
      setItems(res.data ?? []);
    } catch { /* noop */ }
    finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) {
      void fetchItems();
    }
  }, [firebaseUser, loading, activeOrganization?._id, fetchItems]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await itemApi.getById(id);
      setDetail(res.data as unknown as ItemDetail);
    } catch { toast.error("Failed to load item details"); }
    finally { setDetailLoading(false); }
  }, []);

  const loadItemAdjustments = useCallback(async (id: string) => {
    setAdjustmentsLoading(true);
    try {
      const res = await inventoryApi.listAdjustments({ itemId: id, page: 1, limit: 50 });
      setStockAdjustments(res.data ?? []);
    } catch {
      setStockAdjustments([]);
    } finally {
      setAdjustmentsLoading(false);
    }
  }, []);

  const fetchInventoryMetrics = useCallback(async (id: string) => {
    setMetricsLoading(true);
    try {
      const res = await itemApi.getInventoryMetrics(id);
      setInventoryMetrics(res.data ?? null);
    } catch {
      setInventoryMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const refreshSelectedItem = useCallback(async (id: string) => {
    await Promise.all([
      fetchDetail(id),
      fetchItems(),
      loadItemAdjustments(id),
      fetchInventoryMetrics(id),
    ]);
  }, [fetchDetail, fetchItems, loadItemAdjustments, fetchInventoryMetrics]);

  function selectItem(id: string) {
    setSelectedId(id);
    setActiveTab("overview");
    void fetchDetail(id);
    void loadItemAdjustments(id);
    void fetchInventoryMetrics(id);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setInventoryMetrics(null);
    setStockAdjustments([]);
    setOpeningStockDialogOpen(false);
    setAdjustStockDialogOpen(false);
  }

  function openOpeningStockDialog() {
    if (!detail?.inventoryTracked) return;
    setOpeningStockForm({
      openingStock: String(Number(inventoryMetrics?.openingStock ?? detail.stockOnHand ?? 0)),
      ratePerUnit: "0",
    });
    setOpeningStockDialogOpen(true);
  }

  function openAdjustStockDialog() {
    if (!detail?.inventoryTracked) return;
    setAdjustStockForm({
      mode: "Quantity",
      date: new Date().toISOString().slice(0, 10),
      account:
        accountName(detail.purchaseAccountId as PopulatedAccount | string | null) !== "—"
          ? accountName(detail.purchaseAccountId as PopulatedAccount | string | null)
          : accountName(detail.inventoryAccountId as PopulatedAccount | string | null),
      referenceNumber: "",
      quantityAdjusted: "",
      costPrice: String(Number(detail.averageCost || detail.costPrice || 0)),
      valueDelta: "",
      reason: "Manual",
      description: "",
    });
    setAdjustStockDialogOpen(true);
  }

  async function handleSaveOpeningStock() {
    if (!detail) return;

    const openingStock = Number(String(openingStockForm.openingStock || "0").trim() || "0");
    const ratePerUnit = Number(String(openingStockForm.ratePerUnit || "0").trim() || "0");

    if (!Number.isFinite(openingStock) || openingStock < 0) {
      toast.error("Opening stock must be zero or a positive number");
      return;
    }
    if (!Number.isFinite(ratePerUnit) || ratePerUnit < 0) {
      toast.error("Opening stock rate must be zero or a positive number");
      return;
    }

    setOpeningStockSaving(true);
    try {
      await itemApi.update(detail._id, {
        inventoryTracked: true,
        stockOnHand: openingStock,
        averageCost: ratePerUnit,
        inventoryValue: openingStock * ratePerUnit,
      });
      toast.success("Opening stock updated");
      setOpeningStockDialogOpen(false);
      await refreshSelectedItem(detail._id);
    } catch (e) {
      toast.error((e as Error).message || "Failed to update opening stock");
    } finally {
      setOpeningStockSaving(false);
    }
  }

  async function handleSubmitStockAdjustment() {
    if (!detail) return;

    const quantityAvailable = Number(detail.stockOnHand || 0);
    const quantityAdjusted = Number(adjustStockForm.quantityAdjusted || 0);
    const adjustedAt = new Date(`${adjustStockForm.date || new Date().toISOString().slice(0, 10)}T00:00:00`).toISOString();

    if (!adjustStockForm.reason.trim()) {
      toast.error("Please select a reason");
      return;
    }

    setAdjustStockSaving(true);
    try {
      if (adjustStockForm.mode === "Quantity") {
        if (!Number.isFinite(quantityAdjusted) || quantityAdjusted === 0) {
          toast.error("Quantity adjusted must be a non-zero number");
          return;
        }

        const projectedStock = quantityAvailable + quantityAdjusted;
        if (projectedStock < 0) {
          toast.error("Quantity adjusted cannot reduce stock below zero");
          return;
        }

        const unitCost = Number(adjustStockForm.costPrice || detail.averageCost || detail.costPrice || 0);
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          toast.error("Cost price must be zero or a positive number");
          return;
        }

        await inventoryApi.createAdjustment({
          itemId: detail._id,
          adjustmentType: "Quantity",
          direction: quantityAdjusted < 0 ? "Decrease" : "Increase",
          quantityDelta: Math.abs(quantityAdjusted),
          accountId: accountId(detail.purchaseAccountId as PopulatedAccount | string | null) || undefined,
          unitCost,
          reason: adjustStockForm.reason,
          referenceNumber: adjustStockForm.referenceNumber || undefined,
          notes: adjustStockForm.description || undefined,
          adjustedAt,
        });
      } else {
        const valueDelta = Number(adjustStockForm.valueDelta || 0);
        if (!Number.isFinite(valueDelta) || valueDelta === 0) {
          toast.error("Value adjusted must be a non-zero number");
          return;
        }

        await inventoryApi.createAdjustment({
          itemId: detail._id,
          adjustmentType: "Value",
          direction: valueDelta < 0 ? "Decrease" : "Increase",
          quantityDelta: 0,
          accountId: accountId(detail.purchaseAccountId as PopulatedAccount | string | null) || undefined,
          valueDelta,
          reason: adjustStockForm.reason,
          referenceNumber: adjustStockForm.referenceNumber || undefined,
          notes: adjustStockForm.description || undefined,
          adjustedAt,
        });
      }

      toast.success("Stock adjusted");
      setAdjustStockDialogOpen(false);
      await refreshSelectedItem(detail._id);
    } catch (e) {
      toast.error((e as Error).message || "Failed to post stock adjustment");
    } finally {
      setAdjustStockSaving(false);
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function handleClone(item: Item) {
    setActioning(true);
    try {
      const taxId = typeof item.taxId === "object" && item.taxId ? (item.taxId as { _id: string })._id : (item.taxId as string) ?? undefined;
      const intraStateTaxId =
        typeof item.intraStateTaxId === "object" && item.intraStateTaxId
          ? (item.intraStateTaxId as { _id: string })._id
          : (item.intraStateTaxId as string) ?? undefined;
      const interStateTaxId =
        typeof item.interStateTaxId === "object" && item.interStateTaxId
          ? (item.interStateTaxId as { _id: string })._id
          : (item.interStateTaxId as string) ?? undefined;

      await itemApi.create({
        name: `Copy of ${item.name}`,
        description: item.description,
        identifiers: item.identifiers,
        itemMode: item.itemMode,
        itemType: item.itemType,
        brand: item.brand,
        manufacturer: item.manufacturer,
        unit: typeof item.unit === "object" && item.unit ? (item.unit as { _id: string })._id : (item.unit as string) ?? undefined,
        sku: item.sku ? `${item.sku}-copy` : undefined,
        sellingPrice: item.sellingPrice,
        costPrice: item.costPrice,
        salesAccountId: item.salesAccountId as string | undefined,
        purchaseAccountId: item.purchaseAccountId as string | undefined,
        taxPreference: item.taxPreference,
        taxId,
        intraStateTaxId,
        interStateTaxId,
        hsnSacCode: item.hsnSacCode,
        sellingDescription: item.sellingDescription,
        purchaseDescription: item.purchaseDescription,
        inventoryTracked: item.inventoryTracked,
        stockOnHand: item.stockOnHand,
        averageCost: item.averageCost,
        inventoryValue: item.inventoryValue,
        reorderPoint: item.reorderPoint,
        inventoryAccountId: item.inventoryAccountId as string | undefined,
        valuationMethod: item.valuationMethod,
        returnableItem: item.returnableItem,
        dimensions: item.dimensions,
        weight: item.weight,
        preferredVendorId: item.preferredVendorId as string | undefined,
        warehouseId: item.warehouseId as string | undefined,
        image: item.image,
        rearImage: item.rearImage,
        otherImages: item.otherImages,
      });
      toast.success(`"${item.name}" cloned successfully`);
      fetchItems();
    } catch (e) { toast.error((e as Error).message ?? "Clone failed"); }
    finally { setActioning(false); }
  }

  async function handleToggleActive(item: Item) {
    setActioning(true);
    try {
      await itemApi.update(item._id, { isActive: !item.isActive } as Parameters<typeof itemApi.update>[1]);
      toast.success(`Item marked as ${item.isActive ? "inactive" : "active"}`);
      setItems((prev) => prev.map((i) => i._id === item._id ? { ...i, isActive: !item.isActive } : i));
      if (detail && detail._id === item._id) setDetail((d) => d ? { ...d, isActive: !item.isActive } : d);
    } catch (e) { toast.error((e as Error).message ?? "Update failed"); }
    finally { setActioning(false); }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setActioning(true);
    try {
      await itemApi.remove(toDelete._id);
      toast.success(`"${toDelete.name}" deleted`);
      setItems((prev) => prev.filter((i) => i._id !== toDelete._id));
      if (selectedId === toDelete._id) closeDetail();
      setToDelete(null);
    } catch (e) { toast.error((e as Error).message ?? "Delete failed"); }
    finally { setActioning(false); }
  }

  async function handleBulkAction(action: ItemBulkAction) {
    if (selectedItemIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    setBulkActioning(true);
    try {
      const res = await itemApi.bulkAction({ action, itemIds: selectedItemIds });
      const changedIds = new Set(res.data?.itemIds || selectedItemIds);

      if (selectedId && changedIds.has(selectedId) && action === "delete") {
        closeDetail();
      }

      setSelectedItemIds([]);
      setBulkDeleteDialogOpen(false);
      await fetchItems();

      if (action === "activate") {
        toast.success(`${res.data.modifiedCount} item(s) marked as active`);
      } else if (action === "deactivate") {
        toast.success(`${res.data.modifiedCount} item(s) marked as inactive`);
      } else {
        toast.success(`${res.data.modifiedCount} item(s) deleted`);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Bulk action failed");
    } finally {
      setBulkActioning(false);
    }
  }

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedItemIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  }

  function toggleSelectAllFiltered(checked: boolean, filteredIds: string[]) {
    setSelectedItemIds((prev) => {
      const filteredSet = new Set(filteredIds);
      if (checked) {
        const merged = new Set([...prev, ...filteredIds]);
        return Array.from(merged);
      }
      return prev.filter((id) => !filteredSet.has(id));
    });
  }

  function handleNewTransaction(type: "quote" | "salesOrder" | "invoice" | "purchaseOrder" | "bill") {
    if (selectedItemIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    const itemIdsParam = encodeURIComponent(selectedItemIds.join(","));
    const routes: Record<typeof type, string> = {
      quote: "/sales/quotes/new",
      salesOrder: "/sales/orders/new",
      invoice: "/sales/invoices/new",
      purchaseOrder: "/purchases/orders/new",
      bill: "/purchases/bills/new",
    };
    router.push(`${routes[type]}?itemIds=${itemIdsParam}`);
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const filtered = items.filter((i) => {
    const matchesType = typeFilter === "All" || i.itemType === typeFilter;
    const matchesSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  useEffect(() => {
    const visibleSet = new Set(filtered.map((item) => item._id));
    setSelectedItemIds((prev) => {
      const next = prev.filter((id) => visibleSet.has(id));
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [filtered]);

  const filteredIds = useMemo(() => filtered.map((item) => item._id), [filtered]);
  const selectedFilteredCount = useMemo(
    () => filteredIds.reduce((count, id) => count + (selectedItemIds.includes(id) ? 1 : 0), 0),
    [filteredIds, selectedItemIds],
  );
  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const selectAllState: boolean | "indeterminate" = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;

  const openingStockValue = Number(inventoryMetrics?.openingStock ?? detail?.stockOnHand ?? 0);
  const stockOnHandValue = Number(inventoryMetrics?.accountingStock.stockOnHand ?? detail?.stockOnHand ?? 0);
  const committedStockValue = Number(inventoryMetrics?.accountingStock.committedStock ?? 0);
  const availableForSaleValue = Number(
    inventoryMetrics?.accountingStock.availableForSale ?? Math.max(stockOnHandValue - committedStockValue, 0),
  );
  const physicalStockOnHandValue = Number(inventoryMetrics?.physicalStock.stockOnHand ?? stockOnHandValue);
  const physicalCommittedStockValue = Number(inventoryMetrics?.physicalStock.committedStock ?? committedStockValue);
  const physicalAvailableForSaleValue = Number(
    inventoryMetrics?.physicalStock.availableForSale ?? availableForSaleValue,
  );
  const toBeShippedValue = Number(inventoryMetrics?.fulfillment.toBeShipped ?? 0);
  const toBeReceivedValue = Number(inventoryMetrics?.fulfillment.toBeReceived ?? 0);
  const toBeInvoicedValue = Number(inventoryMetrics?.fulfillment.toBeInvoiced ?? 0);
  const toBeBilledValue = Number(inventoryMetrics?.fulfillment.toBeBilled ?? 0);
  const salesSummaryPoints = inventoryMetrics?.salesSummary.points ?? [];
  const totalSalesAmount = Number(inventoryMetrics?.salesSummary.totalAmount ?? 0);

  const quantityAdjustedPreview = Number(adjustStockForm.quantityAdjusted || 0);
  const newQuantityOnHandPreview = useMemo(() => {
    if (!Number.isFinite(quantityAdjustedPreview)) return stockOnHandValue;
    return stockOnHandValue + quantityAdjustedPreview;
  }, [quantityAdjustedPreview, stockOnHandValue]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function accountName(field: PopulatedAccount | string | null | undefined) {
    if (!field) return "—";
    if (typeof field === "object") return field.name;
    return field;
  }

  function accountId(field: PopulatedAccount | string | null | undefined): string {
    if (!field) return "";
    if (typeof field === "object") return String(field._id || "");
    return String(field);
  }

  function unitDisplay(field: PopulatedUnit | string | null | undefined) {
    if (!field) return "—";
    if (typeof field === "object") return field.abbreviation;
    return field;
  }

  function dimensionsDisplay(item: ItemDetail | null) {
    if (!item?.dimensions) return "—";
    const length = Number(item.dimensions.length || 0);
    const width = Number(item.dimensions.width || 0);
    const height = Number(item.dimensions.height || 0);
    const unit = item.dimensions.unit || "cm";
    if (!length && !width && !height) return "—";
    return `${length} x ${width} x ${height} ${unit}`;
  }

  function weightDisplay(item: ItemDetail | null) {
    if (!item?.weight) return "—";
    const value = Number(item.weight.value || 0);
    const unit = item.weight.unit || "kg";
    if (!value) return "—";
    return `${value} ${unit}`;
  }

  function formatQuantity(value: number | string | null | undefined): string {
    const num = Number(value || 0);
    return Number(num).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function formatCurrency(value: number | string | null | undefined): string {
    const num = Number(value || 0);
    return `₹${Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Items</span>}
          actions={
            <>
              <div className="relative w-52">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  className="pl-7 h-8 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {(["All", "Goods", "Service"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                      typeFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                    }`}
                  >
                    {f === "Service" ? "Services" : f}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchItems} disabled={fetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => router.push("/items/new")}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </>
          }
        />

        {/* ── Body: table OR split panel ── */}
        {!selectedId ? (
          /* ── Full-width table view (initial state) ── */
          <div className="flex-1 overflow-auto">
            {fetching ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <Package className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">{search ? "No items match your search" : "No items yet"}</p>
                {!search && (
                  <Button size="sm" variant="outline" onClick={() => router.push("/items/new")}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Item
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-0">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" disabled={selectedItemIds.length === 0 || bulkActioning}>
                        Bulk Update
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem disabled={bulkActioning} onClick={() => handleBulkAction("activate")}>Mark as Active</DropdownMenuItem>
                      <DropdownMenuItem disabled={bulkActioning} onClick={() => handleBulkAction("deactivate")}>Mark as Inactive</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={bulkActioning}
                        onClick={() => setBulkDeleteDialogOpen(true)}
                      >
                        Delete Selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" disabled={selectedItemIds.length === 0 || bulkActioning}>
                        New Transaction
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem onClick={() => handleNewTransaction("quote")}>Quote</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("salesOrder")}>Sales Order</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("invoice")}>Invoice</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("purchaseOrder")}>Purchase Order</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("bill")}>Bill</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => handleBulkAction("activate")}
                  >
                    Mark as Active
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => handleBulkAction("deactivate")}
                  >
                    Mark as Inactive
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    Delete
                  </Button>

                  <span className="ml-auto text-xs text-muted-foreground">
                    {selectedItemIds.length} selected
                  </span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAllState}
                          onCheckedChange={(checked) => toggleSelectAllFiltered(!!checked, filteredIds)}
                          aria-label="Select all filtered items"
                        />
                      </TableHead>
                      <TableHead className="w-[220px] font-semibold text-xs uppercase tracking-wide">Name</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Purchase Description</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Purchase Rate</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Description</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Rate</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Stock On Hand</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">HSN/SAC</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Usage Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow
                        key={item._id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => selectItem(item._id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedItemIds.includes(item._id)}
                            onCheckedChange={(checked) => toggleItemSelection(item._id, !!checked)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${item.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-primary hover:underline">
                            {item.name}
                          </span>
                          {!item.isActive && (
                            <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.purchaseDescription || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {item.costPrice != null ? `₹${Number(item.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.sellingDescription || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {item.sellingPrice != null ? `₹${Number(item.sellingPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatQuantity(item.stockOnHand)}</TableCell>
                        <TableCell className="text-sm">{item.hsnSacCode || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {typeof item.unit === "object" && item.unit
                            ? (item.unit as { abbreviation: string }).abbreviation
                            : item.unit || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          /* ── Split panel (list left + detail right) ── */
          <div className="flex flex-1 overflow-hidden">

            {/* Narrow left list */}
            <div className="w-72 min-w-[18rem] flex flex-col border-r bg-background overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {filtered.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => selectItem(item._id)}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors ${
                      selectedId === item._id
                        ? "bg-primary/5 border-l-2 border-l-primary pl-[14px]"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${selectedId === item._id ? "text-primary" : ""}`}>
                        {item.name}
                      </span>
                      {!item.isActive && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">{item.sku || item.itemType}</span>
                      <span className="text-xs tabular-nums font-medium">
                        {item.sellingPrice != null ? `₹${item.sellingPrice.toLocaleString("en-IN")}` : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Detail panel */}
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              {detailLoading || !detail ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Detail header */}
                  <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0">
                    <h2 className="text-base font-semibold flex-1 truncate">{detail.name}</h2>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      title="Edit" onClick={() => router.push(`/items/${detail._id}/edit`)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {detail.inventoryTracked ? (
                      <Button size="sm" className="h-8" onClick={openAdjustStockDialog}>
                        Adjust Stock
                      </Button>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1">
                          More <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem disabled={actioning} onClick={() => handleClone(detail as unknown as Item)}>
                          <Copy className="h-4 w-4 mr-2" /> Clone Item
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={actioning} onClick={() => handleToggleActive(detail as unknown as Item)}>
                          {detail.isActive
                            ? <><EyeOff className="h-4 w-4 mr-2" /> Mark as Inactive</>
                            : <><Eye className="h-4 w-4 mr-2" /> Mark as Active</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={actioning}
                          onClick={() => setToDelete(detail as unknown as Item)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDetail}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-0 border-b px-6 shrink-0">
                    {(["overview", "transactions", "history"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`capitalize text-sm px-0 py-2.5 mr-6 border-b-2 transition-colors ${
                          activeTab === tab
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {activeTab === "overview" && (
                      <div className="space-y-6">
                        <div className={`grid grid-cols-1 gap-8 ${detail.inventoryTracked ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                          <div className="space-y-5">
                          <div className="space-y-3">
                            <DetailRow label="Item Type" value={detail.itemType} />
                            <DetailRow label="Item Mode" value={detail.itemMode === "Variants" ? "Contains Variants" : "Single Item"} />
                            <DetailRow label="Unit" value={unitDisplay(detail.unit as PopulatedUnit | string | null)} />
                            <DetailRow label="SKU" value={detail.sku || "—"} />
                            <DetailRow
                              label="Identifiers"
                              value={detail.identifiers?.length ? detail.identifiers.join(", ") : "—"}
                            />
                            <DetailRow label="Brand" value={detail.brand || "—"} />
                            <DetailRow label="Manufacturer" value={detail.manufacturer || "—"} />
                            <DetailRow label="Description" value={detail.description || "—"} />
                            <DetailRow label="HSN/SAC" value={detail.hsnSacCode || "—"} />
                            <DetailRow label="Tax Preference" value={detail.taxPreference ?? "—"} />
                            {detail.taxPreference === "Taxable" && (
                              <>
                                <DetailRow
                                  label="Intra State Tax Rate"
                                  value={
                                    detail.intraStateTaxId && typeof detail.intraStateTaxId === "object"
                                      ? `${(detail.intraStateTaxId as PopulatedTax).name} (${(detail.intraStateTaxId as PopulatedTax).rate}%)`
                                      : "—"
                                  }
                                />
                                <DetailRow
                                  label="Inter State Tax Rate"
                                  value={
                                    detail.interStateTaxId && typeof detail.interStateTaxId === "object"
                                      ? `${(detail.interStateTaxId as PopulatedTax).name} (${(detail.interStateTaxId as PopulatedTax).rate}%)`
                                      : "—"
                                  }
                                />
                              </>
                            )}
                            <DetailRow label="Inventory Tracked" value={detail.inventoryTracked ? "Yes" : "No"} />
                            <DetailRow label="Returnable Item" value={detail.returnableItem === false ? "No" : "Yes"} />
                            <DetailRow
                              label="Status"
                              value={
                                <Badge variant={detail.isActive ? "default" : "secondary"}>
                                  {detail.isActive ? "Active" : "Inactive"}
                                </Badge>
                              }
                            />
                          </div>

                          {detail.inventoryTracked && (
                            <>
                              <Separator />
                              <div className="space-y-4">
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-bold text-gray-800">Inventory Details</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 mt-2 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider">Accounting Stock</p>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Stock on Hand</span>
                                          <span className="text-sm font-medium">{formatQuantity(stockOnHandValue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Committed Stock</span>
                                          <span className="text-sm font-medium text-orange-600">{formatQuantity(detail.committedStock || 0)}</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 mt-1">
                                          <span className="text-sm font-medium text-gray-800">Available for Sale</span>
                                          <span className="text-sm font-bold text-green-600">{formatQuantity(stockOnHandValue - (detail.committedStock || 0))}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider">Physical Stock</p>
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Stock on Hand</span>
                                          <span className="text-sm font-medium">{formatQuantity(stockOnHandValue)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Committed Stock</span>
                                          <span className="text-sm font-medium text-orange-600">{formatQuantity(detail.committedStock || 0)}</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 mt-1">
                                          <span className="text-sm font-medium text-gray-800">Available for Sale</span>
                                          <span className="text-sm font-bold text-green-600">{formatQuantity(stockOnHandValue - (detail.committedStock || 0))}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <DetailRow label="Average Cost" value={formatCurrency(detail.averageCost)} />
                                  <DetailRow label="Inventory Value" value={formatCurrency(detail.inventoryValue)} />
                                  <DetailRow label="Reorder Point" value={detail.reorderPoint != null ? formatQuantity(detail.reorderPoint) : "—"} />
                                  <DetailRow label="Valuation" value={detail.valuationMethod || "MovingAverage"} />
                                  <DetailRow label="Inventory Account" value={accountName(detail.inventoryAccountId as PopulatedAccount | string | null)} />
                                  <DetailRow label="Dimensions" value={dimensionsDisplay(detail)} />
                                  <DetailRow label="Weight" value={weightDisplay(detail)} />
                                </div>
                              </div>
                            </>
                          )}

                          {(detail.costPrice != null || detail.purchaseAccountId) && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm font-semibold mb-3">Purchase Information</p>
                                <DetailRow label="Cost Price" value={detail.costPrice != null ? formatCurrency(detail.costPrice) : "—"} />
                                <DetailRow label="Purchase Account" value={accountName(detail.purchaseAccountId as PopulatedAccount | string | null)} />
                                {detail.purchaseDescription && <DetailRow label="Description" value={detail.purchaseDescription} />}
                              </div>
                            </>
                          )}

                          {(detail.sellingPrice != null || detail.salesAccountId) && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm font-semibold mb-3">Sales Information</p>
                                <DetailRow label="Selling Price" value={detail.sellingPrice != null ? formatCurrency(detail.sellingPrice) : "—"} />
                                <DetailRow label="Sales Account" value={accountName(detail.salesAccountId as PopulatedAccount | string | null)} />
                                {detail.sellingDescription && <DetailRow label="Description" value={detail.sellingDescription} />}
                              </div>
                            </>
                          )}
                        </div>

                          {detail.inventoryTracked ? (
                            <div className="space-y-3">
                            <div className="rounded-lg border p-4">
                              <div className="flex items-start justify-between pb-3">
                                <StockMetric
                                  label="Opening Stock"
                                  value={formatQuantity(openingStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <div className="flex items-center gap-3">
                                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                                  <Button variant="link" size="sm" className="h-auto p-0" onClick={openOpeningStockDialog}>Edit</Button>
                                </div>
                              </div>
                              <div className="space-y-3 border-t pt-3">
                                <p className="text-sm font-medium">Accounting Stock</p>
                                <StockMetric
                                  label="Stock on Hand"
                                  value={formatQuantity(stockOnHandValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Committed Stock"
                                  value={formatQuantity(committedStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Available for Sale"
                                  value={formatQuantity(availableForSaleValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                              </div>
                              <div className="mt-3 space-y-3 border-t pt-3">
                                <p className="text-sm font-medium">Physical Stock</p>
                                <StockMetric
                                  label="Stock on Hand"
                                  value={formatQuantity(physicalStockOnHandValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Committed Stock"
                                  value={formatQuantity(physicalCommittedStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Available for Sale"
                                  value={formatQuantity(physicalAvailableForSaleValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeShippedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Shipped</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeReceivedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Received</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeInvoicedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Invoiced</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeBilledValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Billed</p>
                              </div>
                            </div>

                            <div className="rounded-lg border p-4">
                              <p className="text-sm font-medium">Reorder Point</p>
                              {Number(detail.reorderPoint || 0) > 0 ? (
                                <p className="mt-2 text-sm">
                                  Reorder when stock reaches {formatQuantity(detail.reorderPoint || 0)} {unitDisplay(detail.unit as PopulatedUnit | string | null)}.
                                </p>
                              ) : (
                                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                  You have to enable reorder notification before setting reorder point for items.
                                </div>
                              )}
                            </div>

                              <Button variant="outline" className="w-full" onClick={() => router.push("/inventory/adjustments")}>View Inventory Adjustments</Button>
                            </div>
                          ) : null}
                        </div>

                        {detail.inventoryTracked ? (
                          <div className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">Sales Summary (This Month)</p>
                              <p className="text-sm font-medium tabular-nums">Total Sales: {formatCurrency(totalSalesAmount)}</p>
                            </div>
                            <div className="mt-4 h-64">
                              {salesSummaryPoints.some((row) => Number(row.amount || 0) > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={salesSummaryPoints}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                      dataKey="date"
                                      tickLine={false}
                                      axisLine={false}
                                      tickMargin={8}
                                      minTickGap={24}
                                      tickFormatter={(value: string) =>
                                        new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                        })
                                      }
                                    />
                                    <Tooltip
                                      formatter={(value: number | string) => formatCurrency(value)}
                                      labelFormatter={(value: string) =>
                                        new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                        })
                                      }
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="amount"
                                      stroke="hsl(var(--primary))"
                                      fill="hsl(var(--primary))"
                                      fillOpacity={0.2}
                                      strokeWidth={2}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                                  No sales data found for this month.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {activeTab === "transactions" && (
                      adjustmentsLoading && stockAdjustments.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : stockAdjustments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                          <ShoppingCart className="h-10 w-10 opacity-30" />
                          <p className="text-sm">No stock transactions yet</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Reference</th>
                                <th className="px-3 py-2 text-left">Reason</th>
                                <th className="px-3 py-2 text-right">Qty Delta</th>
                                <th className="px-3 py-2 text-right">Value Delta</th>
                                <th className="px-3 py-2 text-right">Result Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stockAdjustments.map((row) => (
                                <tr key={row._id} className="border-t">
                                  <td className="px-3 py-2">{new Date(row.adjustedAt).toLocaleDateString("en-IN")}</td>
                                  <td className="px-3 py-2">{row.referenceNumber || "-"}</td>
                                  <td className="px-3 py-2">{row.reason || "-"}</td>
                                  <td className={`px-3 py-2 text-right tabular-nums ${row.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                    {row.quantityDelta >= 0 ? "+" : ""}
                                    {formatQuantity(row.quantityDelta)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.valueDelta)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(row.resultingStockOnHand)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                    {activeTab === "history" && (
                      adjustmentsLoading && stockAdjustments.length === 0 ? (
                        <div className="flex items-center justify-center py-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : stockAdjustments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                          <Tag className="h-10 w-10 opacity-30" />
                          <p className="text-sm">No history available</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {stockAdjustments.map((row) => (
                            <div key={row._id} className="rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">{row.reason}</p>
                                <p className="text-xs text-muted-foreground">{new Date(row.adjustedAt).toLocaleString("en-IN")}</p>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Qty delta: {row.quantityDelta >= 0 ? "+" : ""}{formatQuantity(row.quantityDelta)} | Value delta: {formatCurrency(row.valueDelta)}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Result stock on hand: {formatQuantity(row.resultingStockOnHand)}
                              </p>
                              {row.referenceNumber ? (
                                <p className="mt-1 text-xs text-muted-foreground">Reference: {row.referenceNumber}</p>
                              ) : null}
                              {row.notes ? <p className="mt-1 text-sm">{row.notes}</p> : null}
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SidebarInset>

      <Dialog open={openingStockDialogOpen} onOpenChange={setOpeningStockDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Opening Stock Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr] md:items-center">
              <Label htmlFor="opening-stock">Opening Stock</Label>
              <Input
                id="opening-stock"
                type="number"
                min={0}
                step="0.01"
                value={openingStockForm.openingStock}
                onChange={(e) =>
                  setOpeningStockForm((prev) => ({ ...prev, openingStock: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr] md:items-center">
              <Label htmlFor="opening-rate">Opening Stock Rate per Unit</Label>
              <Input
                id="opening-rate"
                type="number"
                min={0}
                step="0.01"
                value={openingStockForm.ratePerUnit}
                onChange={(e) =>
                  setOpeningStockForm((prev) => ({ ...prev, ratePerUnit: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningStockDialogOpen(false)} disabled={openingStockSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveOpeningStock} disabled={openingStockSaving}>
              {openingStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Save</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustStockDialogOpen} onOpenChange={setAdjustStockDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Adjust Stock - {detail?.name || "Item"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjustStockForm.mode === "Quantity"}
                  onChange={() => setAdjustStockForm((prev) => ({ ...prev, mode: "Quantity" }))}
                />
                Quantity Adjustment
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjustStockForm.mode === "Value"}
                  onChange={() => setAdjustStockForm((prev) => ({ ...prev, mode: "Value" }))}
                />
                Value Adjustment
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-destructive">Date*</Label>
                <Input
                  type="date"
                  value={adjustStockForm.date}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-destructive">Account*</Label>
                <Input
                  value={adjustStockForm.account || accountName(detail?.inventoryAccountId as PopulatedAccount | string | null)}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, account: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input
                  value={adjustStockForm.referenceNumber}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-3">Quantity Available</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatQuantity(stockOnHandValue)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-3">New Quantity on hand</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {adjustStockForm.mode === "Quantity" ? formatQuantity(newQuantityOnHandPreview) : formatQuantity(stockOnHandValue)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-3 text-destructive">
                      {adjustStockForm.mode === "Quantity" ? "Quantity Adjusted*" : "Value Adjusted*"}
                    </td>
                    <td className="px-3 py-3">
                      {adjustStockForm.mode === "Quantity" ? (
                        <Input
                          className="text-right"
                          value={adjustStockForm.quantityAdjusted}
                          onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, quantityAdjusted: e.target.value }))}
                          placeholder="Eg. +10, -10"
                        />
                      ) : (
                        <Input
                          className="text-right"
                          value={adjustStockForm.valueDelta}
                          onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, valueDelta: e.target.value }))}
                          placeholder="Eg. +1000, -750"
                        />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-3">Cost Price</td>
                    <td className="px-3 py-3">
                      <Input
                        className="text-right"
                        value={adjustStockForm.costPrice}
                        onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                        disabled={adjustStockForm.mode === "Value"}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5">
              <Label className="text-destructive">Reason*</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={adjustStockForm.reason}
                onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, reason: e.target.value }))}
              >
                {ADJUSTMENT_REASON_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={adjustStockForm.description}
                onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Max 500 characters"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleSubmitStockAdjustment}
              disabled={adjustStockSaving}
            >
              {adjustStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Save as Draft</span>
            </Button>
            <Button onClick={handleSubmitStockAdjustment} disabled={adjustStockSaving}>
              {adjustStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Convert to Adjusted</span>
            </Button>
            <Button variant="ghost" onClick={() => setAdjustStockDialogOpen(false)} disabled={adjustStockSaving}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItemIds.length} selected item(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete selected items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkActioning || selectedItemIds.length === 0}
              onClick={() => {
                void handleBulkAction("delete");
              }}
            >
              {bulkActioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{toDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actioning}
              onClick={handleDelete}
            >
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}

// ─── Detail row helper ────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-x-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function StockMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      {unit && unit !== "—" ? <p className="text-xs text-muted-foreground">{unit}</p> : null}
    </div>
  );
}
