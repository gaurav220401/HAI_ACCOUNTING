"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { itemApi, type CreateItemInput, type ItemType, type UnitOfMeasurement } from "@/lib/api/items";

type TabKey = "general" | "inventory";

export default function NewItemPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [tab, setTab] = useState<TabKey>("general");

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [itemType, setItemType] = useState<ItemType>("Goods");
  const [unit, setUnit] = useState<string>("");
  const [description, setDescription] = useState("");

  const [sellingPrice, setSellingPrice] = useState<string>("");
  const [costPrice, setCostPrice] = useState<string>("");

  const [inventoryTracked, setInventoryTracked] = useState(false);
  const [openingStock, setOpeningStock] = useState<string>("");
  const [openingStockRate, setOpeningStockRate] = useState<string>("");
  const [reorderPoint, setReorderPoint] = useState<string>("");

  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);

  const [seedingUnits, setSeedingUnits] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading) return;
    void loadUnits();
  }, [firebaseUser, loading]);

  async function loadUnits() {
    try {
      const res = await itemApi.listUnits();
      setUnits(res.data ?? []);
    } catch {
      setUnits([]);
    }
  }

  async function seedDefaultUnits() {
    setSeedingUnits(true);
    try {
      await itemApi.seedUnits();
      await loadUnits();
    } finally {
      setSeedingUnits(false);
    }
  }

  const computedIsService = useMemo(() => itemType === "Service", [itemType]);

  async function onSave() {
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const toNumOrUndef = (v: string) => {
      if (!v.trim()) return undefined;
      const n = Number(v);
      if (Number.isNaN(n)) return NaN;
      return n;
    };

    const payload: CreateItemInput = {
      name: name.trim(),
      sku: sku.trim() || undefined,
      itemType,
      unit: unit || undefined,
      description: description.trim() || undefined,
      sellingPrice: toNumOrUndef(sellingPrice),
      costPrice: toNumOrUndef(costPrice),
      inventoryTracked: inventoryTracked && !computedIsService,
      openingStock: !computedIsService ? toNumOrUndef(openingStock) : undefined,
      openingStockRate: !computedIsService ? toNumOrUndef(openingStockRate) : undefined,
      reorderPoint: !computedIsService ? toNumOrUndef(reorderPoint) : undefined,
    } as any;

    const numericFields: Array<[string, any]> = [
      ["sellingPrice", payload.sellingPrice],
      ["costPrice", payload.costPrice],
      ["openingStock", payload.openingStock],
      ["openingStockRate", payload.openingStockRate],
      ["reorderPoint", payload.reorderPoint],
    ];
    for (const [field, value] of numericFields) {
      if (value === undefined) continue;
      if (Number.isNaN(value)) {
        setError(`${field} must be a number`);
        return;
      }
    }

    setSaving(true);
    try {
      await itemApi.create(payload);
      router.push("/items");
    } catch (e: any) {
      setError(e?.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => router.push("/items")} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Items <span className="mx-1">/</span>
                <span className="font-medium text-foreground">New Item</span>
              </span>
            </div>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/items")} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6">
          <div className="max-w-4xl">
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">New Item</h1>
                <p className="text-sm text-muted-foreground">Create a new item</p>
              </div>
            </div>

            <div className="mt-6">
              <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                <TabsList>
                  <TabsTrigger value="general">Item Details</TabsTrigger>
                  <TabsTrigger value="inventory" disabled={computedIsService}>Inventory</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="pt-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Name*</Label>
                      <div className="md:col-span-9">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">SKU</Label>
                      <div className="md:col-span-9">
                        <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="(optional)" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Type</Label>
                      <div className="md:col-span-9">
                        <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Goods">Goods</SelectItem>
                            <SelectItem value="Service">Service</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Unit</Label>
                      <div className="md:col-span-9">
                        <Select value={unit} onValueChange={setUnit}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((u) => (
                              <SelectItem key={u._id} value={u._id}>
                                {u.name} ({u.abbreviation})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {units.length === 0 ? (
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={seedDefaultUnits}
                              disabled={seedingUnits}
                            >
                              {seedingUnits ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Seed default units
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Description</Label>
                      <div className="md:col-span-9">
                        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(optional)" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Selling Price</Label>
                      <div className="md:col-span-9">
                        <Input value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Cost Price</Label>
                      <div className="md:col-span-9">
                        <Input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Track Inventory</Label>
                      <div className="md:col-span-9 flex items-center gap-2">
                        <Checkbox
                          checked={inventoryTracked}
                          onCheckedChange={(v) => setInventoryTracked(Boolean(v))}
                          disabled={computedIsService}
                        />
                        <span className="text-sm text-muted-foreground">
                          {computedIsService ? "Inventory is not applicable for Service items" : "Enable inventory tracking"}
                        </span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="inventory" className="pt-6">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Opening Stock</Label>
                      <div className="md:col-span-9">
                        <Input value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Opening Stock Rate</Label>
                      <div className="md:col-span-9">
                        <Input value={openingStockRate} onChange={(e) => setOpeningStockRate(e.target.value)} placeholder="0" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      <Label className="md:col-span-3">Reorder Point</Label>
                      <div className="md:col-span-9">
                        <Input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
