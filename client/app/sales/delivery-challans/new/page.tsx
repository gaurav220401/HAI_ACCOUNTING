"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Search,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item, type CreateItemInput, type UnitOfMeasurement } from "@/lib/api/items";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import {
  deliveryChallanApi,
  type CreateDeliveryChallanInput,
  type ChallanType,
} from "@/lib/api/delivery-challans";
import { settingsApi, type Tax } from "@/lib/api/settings";
import { toast } from "sonner";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface LineItem {
  key: number;
  itemId: string;
  name: string;
  description: string;
  hsnSacCode: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxId: string;
  taxPercent: number;
}

function calcLineAmount(l: LineItem) {
  const lineTotal = l.quantity * l.rate;
  const discAmt = (lineTotal * l.discountPercent) / 100;
  const afterDisc = lineTotal - discAmt;
  const taxAmt = (afterDisc * l.taxPercent) / 100;
  return { lineTotal, discAmt, afterDisc, taxAmt, amount: afterDisc + taxAmt };
}

let lineKeyCounter = 1;
function newLine(): LineItem {
  return {
    key: lineKeyCounter++,
    itemId: "",
    name: "",
    description: "",
    hsnSacCode: "",
    quantity: 1,
    rate: 0,
    discountPercent: 0,
    taxId: "",
    taxPercent: 0,
  };
}

const CHALLAN_TYPES: ChallanType[] = [
  "Supply of Liquid Gas",
  "Job Work",
  "Supply on Approval",
  "Others",
];

// ─── New Item Modal ─────────────────────────────────────────────────────

interface NewItemModalProps {
  open: boolean;
  onClose: () => void;
  onItemCreated: (item: Item) => void;
}

function NewItemModal({ open, onClose, onItemCreated }: NewItemModalProps) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<"Goods" | "Service">("Goods");
  const [unit, setUnit] = useState("");
  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const loadUnits = useCallback(async () => {
    try {
      const res = await itemApi.listUnits();
      let list = res.data ?? [];
      if (list.length === 0) {
        await itemApi.seedUnits().catch(() => {});
        const seeded = await itemApi.listUnits().catch(() => ({ data: [] as UnitOfMeasurement[] }));
        list = seeded.data ?? [];
      }
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      setUnits(list);
      
      if (!unit) {
        const nos = list.find((u) => String(u.abbreviation).toUpperCase() === "NOS");
        if (nos) {
          setUnit(nos._id);
        } else if (list.length > 0) {
          setUnit(list[0]._id);
        }
      }
    } catch (e) {
      // non-fatal
    }
  }, [unit]);

  useEffect(() => {
    if (open) {
      loadUnits();
    }
  }, [open, loadUnits]);

  function reset() {
    setName("");
    setItemType("Goods");
    setUnit("");
    setSellingPrice("");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const payload: CreateItemInput = {
        name: name.trim(),
        itemType,
        unit: unit || undefined,
        sellingPrice: sellingPrice !== "" ? Number(sellingPrice) : undefined,
      };
      const res = await itemApi.create(payload);
      onItemCreated(res.data);
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-red-600">
              Name<span className="text-red-500">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter item name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="newItemType"
                  value="Goods"
                  checked={itemType === "Goods"}
                  onChange={() => setItemType("Goods")}
                  className="accent-primary"
                />
                Goods
                  </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="newItemType"
                  value="Service"
                  checked={itemType === "Service"}
                  onChange={() => setItemType("Service")}
                  className="accent-primary"
                />
                Service
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {units.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name} ({u.abbreviation})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Selling Price</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 bg-muted text-sm text-muted-foreground">
                INR
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="rounded-l-none"
                value={sellingPrice}
                onChange={(e) =>
                  setSellingPrice(
                    e.target.value === "" ? "" : parseFloat(e.target.value),
                  )
                }
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bulk Items Modal ───────────────────────────────────────────────────

interface BulkItemsModalProps {
  open: boolean;
  onClose: () => void;
  items: Item[];
  onAddItems: (selectedItems: Item[]) => void;
}

function BulkItemsModal({
  open,
  onClose,
  items,
  onAddItems,
}: BulkItemsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const selected = items.filter((i) => selectedIds.has(i._id));
    onAddItems(selected);
    setSelectedIds(new Set());
    setSearchQuery("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Add Items in Bulk</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_1fr] gap-4 min-h-[400px]">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Type to search or scan the barcode of the item"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="border rounded-lg h-[340px] overflow-y-auto">
              {filtered.length === 0 ?
                <div className="flex items-center justify-center h-full text-sm text-orange-500">
                  No results found.
                </div>
              : <div className="divide-y">
                  {filtered.map((item) => (
                    <label
                      key={item._id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(item._id)}
                        onCheckedChange={() => toggleItem(item._id)}
                      />
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        {item.sellingPrice != null && (
                          <div className="text-xs text-muted-foreground">
                            Rate: ₹{item.sellingPrice.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              }
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Selected Items{" "}
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                  {selectedIds.size}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                Total Quantity: {selectedIds.size}
              </span>
            </div>
            <div className="border rounded-lg h-[340px] overflow-y-auto">
              {selectedIds.size === 0 ?
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4 text-center">
                  Click the item names from the left pane to select them
                </div>
              : <div className="divide-y">
                  {items
                    .filter((i) => selectedIds.has(i._id))
                    .map((item) => (
                      <div
                        key={item._id}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <span className="text-sm">{item.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleItem(item._id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleAdd} disabled={selectedIds.size === 0}>
            Add Items
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function NewDeliveryChallanPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  // Master data
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [challanDate, setChallanDate] = useState(todayISO());
  const [challanType, setChallanType] = useState<ChallanType | "">("");

  // Items table
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  // Totals section
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");

  // Modals
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showBulkItemsModal, setShowBulkItemsModal] = useState(false);

  const [saving, setSaving] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );

  // Load master data
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization) return;
    setMasterLoading(true);
    Promise.allSettled([
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.taxes.list(),
      deliveryChallanApi.getNextNumber(),
    ])
      .then((results) => {
        const [customersRes, itemsRes, taxesRes, nextNumberRes] = results;
        if (customersRes.status === "fulfilled")
          setCustomers(customersRes.value.data ?? []);
        if (itemsRes.status === "fulfilled")
          setItems(itemsRes.value.data ?? []);
        if (taxesRes.status === "fulfilled")
          setTaxes(taxesRes.value.data ?? []);
        if (nextNumberRes.status === "fulfilled") {
          setChallanNumber(
            nextNumberRes.value.data?.challanNumber ?? "DC-00001",
          );
        } else {
          setChallanNumber("DC-00001");
        }
      })
      .finally(() => setMasterLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ─── Line item helpers ────────────────────────────────────────────

  const updateLine = useCallback(
    (key: number, field: keyof LineItem, value: any) => {
      setLines((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

  const selectedCustomer = customers.find((entry) => entry._id === customerId);

  const removeLine = useCallback((key: number) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.key !== key);
      return next.length === 0 ? [newLine()] : next;
    });
  }, []);

  const handleItemSelect = useCallback(
    (key: number, itemId: string) => {
      const item = items.find((i) => i._id === itemId);
      if (!item) return;
      const linkedTax = getItemTaxForTransaction({
        item,
        contact: selectedCustomer,
        organizationState: activeOrganization?.address?.state,
        taxes,
      });
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ?
            {
              ...l,
              itemId: item._id,
              name: item.name,
              description: item.description || "",
              rate: item.sellingPrice || 0,
              taxId: linkedTax.taxId,
              taxPercent: linkedTax.taxPercent,
            }
          : l,
        ),
      );
    },
    [items, selectedCustomer, activeOrganization?.address?.state, taxes],
  );

  const handleBulkAdd = useCallback((selectedItems: Item[]) => {
    const newLines: LineItem[] = selectedItems.map((item) => {
      const linkedTax = getItemTaxForTransaction({
        item,
        contact: selectedCustomer,
        organizationState: activeOrganization?.address?.state,
        taxes,
      });
      return {
        key: lineKeyCounter++,
        itemId: item._id,
        name: item.name,
        description: item.description || "",
        hsnSacCode: "",
        quantity: 1,
        rate: item.sellingPrice || 0,
        discountPercent: 0,
        taxId: linkedTax.taxId,
        taxPercent: linkedTax.taxPercent,
      };
    });
    setLines((prev) => {
      const existing = prev.filter((l) => l.name.trim());
      return [...existing, ...newLines];
    });
  }, [selectedCustomer, activeOrganization?.address?.state, taxes]);

  const handleNewItemCreated = useCallback((item: Item) => {
    setItems((prev) => [...prev, item]);
  }, []);

  useEffect(() => {
    if (!lines.some((line) => line.itemId)) return;
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.itemId) return line;
        const item = items.find((entry) => entry._id === line.itemId);
        if (!item) return line;
        const linkedTax = getItemTaxForTransaction({
          item,
          contact: selectedCustomer,
          organizationState: activeOrganization?.address?.state,
          taxes,
        });
        if (line.taxId === linkedTax.taxId && Number(line.taxPercent || 0) === Number(linkedTax.taxPercent || 0)) {
          return line;
        }
        changed = true;
        return {
          ...line,
          taxId: linkedTax.taxId,
          taxPercent: linkedTax.taxPercent,
        };
      });
      return changed ? next : prev;
    });
  }, [customerId, selectedCustomer, activeOrganization?.address?.state, items, taxes]);

  // ─── Computed totals ──────────────────────────────────────────────

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const lineTaxAmount = lines.reduce(
    (sum, line) => sum + calcLineAmount(line).taxAmt,
    0,
  );
  const total = subTotal - discountAmount + lineTaxAmount + adjustmentAmount;

  // ─── Save handler ─────────────────────────────────────────────────

  async function handleSave(status: "Draft" | "Open" = "Draft") {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    if (!challanType) {
      toast.error("Please select a challan type");
      return;
    }
    const validLines = lines.filter((l) => l.name.trim());
    if (validLines.length === 0) {
      toast.error("At least one item is required");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateDeliveryChallanInput = {
        challanNumber,
        salesOrderNumber: salesOrderNumber.trim() || undefined,
        referenceNumber,
        customerId,
        challanDate,
        challanType: challanType as ChallanType,
        items: validLines.map((l) => ({
          itemId: l.itemId || undefined,
          name: l.name,
          description: l.description,
          hsnSacCode: l.hsnSacCode,
          quantity: l.quantity,
          rate: l.rate,
          discountPercent: l.discountPercent,
          taxId: l.taxId || undefined,
          taxPercent: l.taxPercent,
        })),
        discountType,
        discountValue,
        taxId: null,
        taxAmount: lineTaxAmount,
        adjustmentLabel,
        adjustmentAmount,
        customerNotes,
        termsAndConditions,
        status,
      };

      const res = await deliveryChallanApi.create(payload);
      toast.success("Delivery Challan created");
      router.push(`/sales/delivery-challans/${res.data._id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create delivery challan");
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

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
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span
                className="cursor-pointer hover:text-foreground"
                onClick={() => router.push("/sales/delivery-challans")}
              >
                Delivery Challans
              </span>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/delivery-challans")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-5xl">
          <h1 className="text-2xl font-semibold">New Delivery Challan</h1>

          {masterLoading ?
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          : <div className="space-y-6">
              {/* Top Fields */}
              <div className="grid grid-cols-2 gap-6">
                {/* Customer Name */}
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Customer Name<span className="text-red-500">*</span>
                  </Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select or add a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Challan Number */}
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Delivery Challan#<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={challanNumber}
                    onChange={(e) => setChallanNumber(e.target.value)}
                  />
                </div>

                {/* Reference Number */}
                <div className="space-y-1.5">
                  <Label>Sales Order#</Label>
                  <Input
                    value={salesOrderNumber}
                    onChange={(e) => setSalesOrderNumber(e.target.value)}
                    placeholder="SO-00001"
                  />
                </div>

                {/* Reference Number */}
                <div className="space-y-1.5">
                  <Label>Reference#</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>

                {/* Challan Date */}
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Delivery Challan Date
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={challanDate}
                    onChange={(e) => setChallanDate(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              {/* Challan Type */}
              <div className="max-w-xs space-y-1.5">
                <Label className="text-red-600">
                  Challan Type<span className="text-red-500">*</span>
                </Label>
                <Select
                  value={challanType}
                  onValueChange={(v) => setChallanType(v as ChallanType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a proper challan type." />
                  </SelectTrigger>
                  <SelectContent>
                    {CHALLAN_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        {ct}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Item Table */}
              <div>
                <h3 className="font-semibold mb-3">Item Table</h3>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[250px]">
                          ITEM DETAILS
                        </TableHead>
                        <TableHead className="w-24 text-right">
                          QUANTITY
                        </TableHead>
                        <TableHead className="w-24 text-right">STOCK</TableHead>
                        <TableHead className="w-28 text-right">RATE</TableHead>
                        <TableHead className="w-28 text-right">
                          DISCOUNT %
                        </TableHead>
                        <TableHead className="w-28 text-right">
                          AMOUNT
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => {
                        const { amount } = calcLineAmount(line);
                        const selectedItem = itemsById.get(line.itemId);
                        const stockOnHand =
                          selectedItem?.inventoryTracked ?
                            Number(selectedItem.stockOnHand || 0)
                          : null;
                        const exceedsStock =
                          stockOnHand !== null && Number(line.quantity || 0) > stockOnHand;

                        return (
                          <TableRow key={line.key}>
                            <TableCell>
                              <Select
                                value={line.itemId || ""}
                                onValueChange={(v) => {
                                  handleItemSelect(line.key, v);
                                  requestAnimationFrame(() => {
                                    const qtyInput = document.querySelector(
                                      `input[data-quantity-key="${line.key}"]`,
                                    ) as HTMLInputElement | null;
                                    qtyInput?.focus();
                                    qtyInput?.select();
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Type or click to select an item." />
                                </SelectTrigger>
                                <SelectContent>
                                  {items.map((item) => (
                                    <SelectItem key={item._id} value={item._id}>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>{item.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {item.inventoryTracked ?
                                            `Stock ${Number(item.stockOnHand || 0).toLocaleString("en-IN")}`
                                          : "Non-stock"}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedItem ?
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {selectedItem.sku ? `SKU ${selectedItem.sku} · ` : ""}
                                  {selectedItem.inventoryTracked ?
                                    `Stock on hand ${Number(selectedItem.stockOnHand || 0).toLocaleString("en-IN")}`
                                  : "Inventory not tracked"}
                                </p>
                              : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                className="h-8 text-sm text-right"
                                data-quantity-key={line.key}
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLine(
                                    line.key,
                                    "quantity",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell
                              className={`text-right text-sm tabular-nums ${
                                exceedsStock ? "text-destructive font-medium" : ""
                              }`}
                            >
                              {stockOnHand === null ?
                                "N/A"
                              : Number(stockOnHand).toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="h-8 text-sm text-right"
                                value={line.rate}
                                onChange={(e) =>
                                  updateLine(
                                    line.key,
                                    "rate",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                className="h-8 text-sm text-right"
                                value={line.discountPercent}
                                onChange={(e) =>
                                  updateLine(
                                    line.key,
                                    "discountPercent",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              {amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeLine(line.key)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center gap-3 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLines((prev) => [...prev, newLine()])}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add New Row
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBulkItemsModal(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Items in Bulk
                  </Button>
                </div>
              </div>

              {/* Totals + Notes */}
              <div className="grid grid-cols-[1fr_1fr] gap-8">
                {/* Left: Notes */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Customer Notes</Label>
                    <textarea
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Enter any notes to be displayed in your transaction"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Right: Totals */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Sub Total</span>
                    <span className="font-medium tabular-nums">
                      {subTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span>Discount</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        className="h-7 w-20 text-right text-sm"
                        value={discountValue}
                        onChange={(e) =>
                          setDiscountValue(parseFloat(e.target.value) || 0)
                        }
                      />
                      <Select
                        value={discountType}
                        onValueChange={(v: "percent" | "amount") =>
                          setDiscountType(v)
                        }
                      >
                        <SelectTrigger className="h-7 w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="font-medium tabular-nums w-20 text-right">
                        {discountAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span>Tax</span>
                    <span className="font-medium tabular-nums w-20 text-right">
                      +{lineTaxAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <Input
                      className="h-7 w-28 text-sm"
                      value={adjustmentLabel}
                      onChange={(e) => setAdjustmentLabel(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="h-7 w-24 text-right text-sm"
                        value={adjustmentAmount}
                        onChange={(e) =>
                          setAdjustmentAmount(parseFloat(e.target.value) || 0)
                        }
                      />
                      <span className="font-medium tabular-nums w-20 text-right">
                        {adjustmentAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total ( ₹ )</span>
                    <span className="tabular-nums">{total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Terms & Conditions */}
              <div className="space-y-1.5">
                <Label>Terms &amp; Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pb-8">
                <Button onClick={() => handleSave("Draft")} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save as Draft
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => router.push("/sales/delivery-challans")}
                >
                  Cancel
                </Button>
              </div>
            </div>
          }
        </div>

        {/* Modals */}
        <NewItemModal
          open={showNewItemModal}
          onClose={() => setShowNewItemModal(false)}
          onItemCreated={handleNewItemCreated}
        />
        <BulkItemsModal
          open={showBulkItemsModal}
          onClose={() => setShowBulkItemsModal(false)}
          items={items}
          onAddItems={handleBulkAdd}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
