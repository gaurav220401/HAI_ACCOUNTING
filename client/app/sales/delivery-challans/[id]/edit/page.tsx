"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, Search, X } from "lucide-react";
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
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import {
  deliveryChallanApi,
  type DeliveryChallan,
  type UpdateDeliveryChallanInput,
  type ChallanType,
} from "@/lib/api/delivery-challans";
import { settingsApi, type Tax } from "@/lib/api/settings";
import { toast } from "sonner";
import { decimalToFixed, multiplyMoney, percentMoney, roundMoney, subtractMoney, sumMoney } from "@/lib/money";

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
  const lineTotal = multiplyMoney(l.quantity, l.rate);
  const discAmt = percentMoney(lineTotal, l.discountPercent);
  const afterDisc = Math.max(0, subtractMoney(lineTotal, discAmt));
  const taxAmt = percentMoney(afterDisc, l.taxPercent);
  return { lineTotal, discAmt, afterDisc, taxAmt, amount: sumMoney([afterDisc, taxAmt]) };
}

let lineKeyCounter = 1000;
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

export default function EditDeliveryChallanPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
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

  // The original challan
  const [challan, setChallan] = useState<DeliveryChallan | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [challanDate, setChallanDate] = useState("");
  const [challanType, setChallanType] = useState<ChallanType | "">("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");

  const [saving, setSaving] = useState(false);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );

  // Auth redirects
  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Load master data + challan
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization || !id)
      return;
    setMasterLoading(true);
    Promise.allSettled([
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.taxes.list(),
      deliveryChallanApi.getById(id),
    ])
      .then((results) => {
        const [customersRes, itemsRes, taxesRes, challanRes] = results;
        if (customersRes.status === "fulfilled")
          setCustomers(customersRes.value.data ?? []);
        if (itemsRes.status === "fulfilled")
          setItems(itemsRes.value.data ?? []);
        if (taxesRes.status === "fulfilled")
          setTaxes(taxesRes.value.data ?? []);
        if (challanRes.status === "fulfilled") {
          const dc = challanRes.value.data;
          setChallan(dc);
          // Populate form
          setCustomerId(
            typeof dc.customerId === "string" ?
              dc.customerId
            : dc.customerId._id,
          );
          setChallanNumber(dc.challanNumber);
          setSalesOrderNumber(dc.salesOrderNumber || "");
          setReferenceNumber(dc.referenceNumber || "");
          setChallanDate(dc.challanDate.slice(0, 10));
          setChallanType(dc.challanType);
          setDiscountType(dc.discountType || "percent");
          setDiscountValue(dc.discountValue || 0);
          setAdjustmentLabel(dc.adjustmentLabel || "Adjustment");
          setAdjustmentAmount(dc.adjustmentAmount || 0);
          setCustomerNotes(dc.customerNotes || "");
          setTermsAndConditions(dc.termsAndConditions || "");

          // Populate lines
          if (dc.items && dc.items.length > 0) {
            setLines(
              dc.items.map((item, idx) => ({
                key: lineKeyCounter++,
                itemId:
                  typeof item.itemId === "object" && item.itemId ?
                    item.itemId._id
                  : (item.itemId as string) || "",
                name:
                  typeof item.itemId === "object" && item.itemId ?
                    item.itemId.name
                  : item.name,
                description: item.description || "",
                hsnSacCode: item.hsnSacCode || "",
                quantity: item.quantity,
                rate: item.rate,
                discountPercent: item.discountPercent || 0,
                taxId:
                  typeof item.taxId === "object" && item.taxId ?
                    item.taxId._id
                  : (item.taxId as string) || "",
                taxPercent: item.taxPercent || 0,
              })),
            );
          }
        } else {
          toast.error("Failed to load delivery challan");
        }
      })
      .finally(() => setMasterLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization, id]);

  // Line item helpers
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

  // Computed totals
  const subTotal = sumMoney(lines.map((l) => multiplyMoney(l.quantity, l.rate)));
  const discountAmount =
    discountType === "percent" ?
      percentMoney(subTotal, discountValue)
    : roundMoney(discountValue);
  const lineTaxAmount = lines.reduce(
    (sum, line) => sumMoney([sum, calcLineAmount(line).taxAmt]),
    0,
  );
  const total = sumMoney([subTotal, -discountAmount, lineTaxAmount, adjustmentAmount]);

  // Save handler
  async function handleSave() {
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
      const payload: UpdateDeliveryChallanInput = {
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
      };

      await deliveryChallanApi.update(id, payload);
      toast.success("Delivery Challan updated");
      router.push(`/sales/delivery-challans/${id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
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
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span
                className="cursor-pointer hover:text-foreground"
                onClick={() => router.push("/sales/delivery-challans")}
              >
                Delivery Challans
              </span>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Edit</span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/sales/delivery-challans/${id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-5xl">
          <h1 className="text-2xl font-semibold">Edit Delivery Challan</h1>

          {masterLoading ?
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          : <div className="space-y-6">
              {/* Top Fields */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Customer Name<span className="text-red-500">*</span>
                  </Label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
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

                <div className="space-y-1.5">
                  <Label className="text-red-600">
                    Delivery Challan#<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={challanNumber}
                    onChange={(e) => setChallanNumber(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Sales Order#</Label>
                  <Input
                    value={salesOrderNumber}
                    onChange={(e) => setSalesOrderNumber(e.target.value)}
                    placeholder="SO-00001"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Reference#</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>

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
                                onValueChange={(v) =>
                                  handleItemSelect(line.key, v)
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Select an item" />
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
                              {decimalToFixed(amount)}
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
                </div>
              </div>

              {/* Totals + Notes */}
              <div className="grid grid-cols-[1fr_1fr] gap-8">
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

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Sub Total</span>
                    <span className="font-medium tabular-nums">
                      {decimalToFixed(subTotal)}
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
                        {decimalToFixed(discountAmount)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm gap-2">
                    <span>Tax</span>
                    <span className="font-medium tabular-nums w-20 text-right">
                      +{decimalToFixed(lineTaxAmount)}
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
                        {decimalToFixed(adjustmentAmount)}
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total ( ₹ )</span>
                    <span className="tabular-nums">{decimalToFixed(total)}</span>
                  </div>
                </div>
              </div>

              {/* Terms & Conditions */}
              <div className="space-y-1.5">
                <Label>Terms &amp; Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter the terms and conditions of your business"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pb-8">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => router.push(`/sales/delivery-challans/${id}`)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          }
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
