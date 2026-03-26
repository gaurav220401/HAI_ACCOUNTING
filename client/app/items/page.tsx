"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { itemApi, type Item } from "@/lib/api/items";

// ─── Item detail type with populated fields ────────────────────────────────
interface PopulatedAccount { _id: string; name: string; }
interface PopulatedUnit    { _id: string; name: string; abbreviation: string; }
interface ItemDetail extends Omit<Item, "salesAccountId" | "purchaseAccountId" | "unit"> {
  salesAccountId?: PopulatedAccount | string | null;
  purchaseAccountId?: PopulatedAccount | string | null;
  unit?: PopulatedUnit | string | null;
}

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
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "history">("overview");

  // Action states
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [actioning, setActioning] = useState(false);

  // ─── Auth guards ────────────────────────────────────────────────────────
  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);
  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id]);

  // ─── Data fetching ───────────────────────────────────────────────────────
  async function fetchItems() {
    setFetching(true);
    try {
      const res = await itemApi.list({ page: 1, limit: 200 });
      setItems(res.data ?? []);
    } catch { /* noop */ }
    finally { setFetching(false); }
  }

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await itemApi.getById(id);
      setDetail(res.data as unknown as ItemDetail);
    } catch { toast.error("Failed to load item details"); }
    finally { setDetailLoading(false); }
  }, []);

  function selectItem(id: string) {
    setSelectedId(id);
    setActiveTab("overview");
    fetchDetail(id);
  }

  function closeDetail() { setSelectedId(null); setDetail(null); }

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function handleClone(item: Item) {
    setActioning(true);
    try {
      await itemApi.create({
        name: `Copy of ${item.name}`,
        itemType: item.itemType,
        unit: typeof item.unit === "object" && item.unit ? (item.unit as { _id: string })._id : (item.unit as string) ?? undefined,
        sku: item.sku ? `${item.sku}-copy` : undefined,
        sellingPrice: item.sellingPrice,
        costPrice: item.costPrice,
        salesAccountId: item.salesAccountId as string | undefined,
        purchaseAccountId: item.purchaseAccountId as string | undefined,
        taxPreference: item.taxPreference,
        hsnSacCode: item.hsnSacCode,
        sellingDescription: item.sellingDescription,
        purchaseDescription: item.purchaseDescription,
        preferredVendorId: item.preferredVendorId as string | undefined,
        image: item.image,
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

  // ─── Derived ─────────────────────────────────────────────────────────────
  const filtered = items.filter((i) => {
    const matchesType = typeFilter === "All" || i.itemType === typeFilter;
    const matchesSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

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
  function unitDisplay(field: PopulatedUnit | string | null | undefined) {
    if (!field) return "—";
    if (typeof field === "object") return field.abbreviation;
    return field;
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
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[220px] font-semibold text-xs uppercase tracking-wide">Name</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide">Purchase Description</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Purchase Rate</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide">Description</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Rate</TableHead>
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
                      <TableCell className="text-sm">
                        {typeof item.unit === "object" && item.unit
                          ? (item.unit as { abbreviation: string }).abbreviation
                          : item.unit || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                      <div className="max-w-lg space-y-5">
                        <div className="space-y-3">
                          <DetailRow label="Item Type" value={detail.itemType} />
                          <DetailRow label="Unit" value={unitDisplay(detail.unit as PopulatedUnit | string | null)} />
                          <DetailRow label="SKU" value={detail.sku || "—"} />
                          <DetailRow label="HSN/SAC" value={detail.hsnSacCode || "—"} />
                          <DetailRow label="Tax Preference" value={detail.taxPreference ?? "—"} />
                          <DetailRow
                            label="Status"
                            value={
                              <Badge variant={detail.isActive ? "default" : "secondary"}>
                                {detail.isActive ? "Active" : "Inactive"}
                              </Badge>
                            }
                          />
                        </div>
                        {(detail.costPrice != null || detail.purchaseAccountId) && (
                          <>
                            <Separator />
                            <div className="space-y-1">
                              <p className="text-sm font-semibold mb-3">Purchase Information</p>
                              <DetailRow label="Cost Price" value={detail.costPrice != null ? `₹${Number(detail.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"} />
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
                              <DetailRow label="Selling Price" value={detail.sellingPrice != null ? `₹${Number(detail.sellingPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"} />
                              <DetailRow label="Sales Account" value={accountName(detail.salesAccountId as PopulatedAccount | string | null)} />
                              {detail.sellingDescription && <DetailRow label="Description" value={detail.sellingDescription} />}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {activeTab === "transactions" && (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                        <ShoppingCart className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No transactions yet</p>
                      </div>
                    )}
                    {activeTab === "history" && (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                        <Tag className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No history available</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SidebarInset>

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
