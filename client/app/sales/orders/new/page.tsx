"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, Send } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { cn } from "@/lib/utils";

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

import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import {
  formatMoney,
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "@/lib/money";
import { settingsApi, type PaymentTerms, type Tax } from "@/lib/api/settings";
import {
  salesOrderApi,
  type CreateSalesOrderInput,
  type SalesOrderStatus,
} from "@/lib/api/sales-orders";
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax } from "@/lib/api/tcs-taxes";

// Status is now set automatically based on save action

type LineItemUi = {
  id: string;
  itemId: string;
  description: string;
  hsnSacCode: string;
  quantity: string;
  rate: string;
  discount: string;
  taxId: string | null;
  taxPercent: string;
  taxIsManual?: boolean;
  amount: number;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState("");
  const [reference, setReference] = useState("");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedShipmentDate, setExpectedShipmentDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("none");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [allTaxes, setAllTaxes] = useState<Tax[]>([]);

  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const [shippingCharges, setShippingCharges] = useState<string>("");
  const [adjustment, setAdjustment] = useState<string>("");

  const [lineItems, setLineItems] = useState<LineItemUi[]>([
    {
      id: crypto.randomUUID(),
      itemId: "",
      description: "",
      hsnSacCode: "",
      quantity: "1",
      rate: "0",
      discount: "0",
      taxId: "",
      taxPercent: "0",
      taxIsManual: false,
      amount: 0,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );
  const selectedCustomer = customers.find((customer) => customer._id === customerId);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization) return;

    contactApi
      .list({ type: "Customer", page: 1, limit: 200 })
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => setCustomers([]));

    itemApi
      .list({ page: 1, limit: 200 })
      .then((res) => setItems(res.data ?? []))
      .catch(() => setItems([]));

    settingsApi.paymentTerms
      .list()
      .then((res) => setPaymentTerms(res.data ?? []))
      .catch(() => setPaymentTerms([]));

    tdsTaxApi.list().then(res => setTdsTaxes(res.data ?? []));
    tcsTaxApi.list().then(res => setTcsTaxes(res.data ?? []));
    settingsApi.taxes.list().then(res => setAllTaxes(res.data ?? []));
    salesOrderApi.getNextNumber()
      .then(res => setSalesOrderNumber(res.data?.salesOrderNumber || "SO-00001"))
      .catch(() => setSalesOrderNumber("SO-00001"));
  }, [firebaseUser, loading, orgLoading, activeOrganization]);

  const totals = useMemo(() => {
    const subTotal = sumMoney(
      lineItems.map((li) =>
        subtractMoney(
          multiplyMoney(Number(li.quantity) || 0, Number(li.rate) || 0),
          Number(li.discount) || 0,
        ),
      ),
    );

    const taxBreakdown: Array<{ name: string; amount: number; rate: number }> =
      [];
    const breakdownMap = new Map<
      string,
      { name: string; amount: number; rate: number }
    >();

    lineItems.forEach((li) => {
      const q = Number(li.quantity) || 0;
      const r = Number(li.rate) || 0;
      const d = Number(li.discount) || 0;
      const amountBeforeTax = Math.max(0, subtractMoney(multiplyMoney(q, r), d));
      const taxP = Number(li.taxPercent) || 0;

      if (taxP > 0) {
        const selectedTax = allTaxes.find((t) => t._id === li.taxId);
        if (
          selectedTax &&
          selectedTax.components &&
          selectedTax.components.length > 0
        ) {
          selectedTax.components.forEach((comp) => {
            const compAmount = percentMoney(amountBeforeTax, comp.rate);
            const compTax = allTaxes.find(t => t._id === comp.taxId);
            const compName = compTax?.name || comp.name || `Tax ${comp.rate}%`;
            const existing = breakdownMap.get(compName) || { name: compName, amount: 0, rate: comp.rate };
            existing.amount = sumMoney([existing.amount, compAmount]);
            breakdownMap.set(compName, existing);
          });
        } else {
          const amount = percentMoney(amountBeforeTax, taxP);
          const name = selectedTax?.name || `Tax ${taxP}%`;
          const existing = breakdownMap.get(name) || { name, amount: 0, rate: taxP };
          existing.amount = sumMoney([existing.amount, amount]);
          breakdownMap.set(name, existing);
        }
      }
    });

    breakdownMap.forEach((v) => taxBreakdown.push(v));
    const itemTaxes = sumMoney(taxBreakdown.map((b) => b.amount));

    const shipping = shippingCharges.trim() ? roundMoney(shippingCharges) : 0;
    const adj = adjustment.trim() ? roundMoney(adjustment) : 0;

    let taxAmount = 0;
    if (taxType === "TDS") {
      const selected = tdsTaxes.find((t) => t._id === tdsId);
      if (selected) taxAmount = percentMoney(subTotal, selected.rate);
    } else if (taxType === "TCS") {
      const selected = tcsTaxes.find((t) => t._id === tcsId);
      if (selected) taxAmount = percentMoney(subTotal, selected.rate);
    }

    const total = sumMoney([subTotal, itemTaxes, shipping, adj, taxType === "TCS" ? taxAmount : -taxAmount]);
    return { subTotal, itemTaxes, taxBreakdown, shipping, adj, taxAmount, total };
  }, [lineItems, allTaxes, shippingCharges, adjustment, taxType, tdsId, tcsId, tdsTaxes, tcsTaxes]);

  function recalcLine(item: LineItemUi): LineItemUi {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const disc = Number(item.discount) || 0;
    const taxP = Number(item.taxPercent) || 0;
    const amountBeforeTax = Math.max(0, subtractMoney(multiplyMoney(qty, rate), disc));
    const amount = sumMoney([amountBeforeTax, percentMoney(amountBeforeTax, taxP)]);
    return { ...item, amount };
  }

  function updateLine(id: string, patch: Partial<LineItemUi>) {
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? recalcLine({ ...li, ...patch }) : li)),
    );
  }

  const getDefaultLineTax = useCallback((item: Item) => {
    const linkedTax = getItemTaxForTransaction({
      item,
      contact: selectedCustomer,
      organizationState: activeOrganization?.address?.state,
      taxes: allTaxes,
    });
    return {
      taxId: linkedTax.taxId || "",
      taxPercent: linkedTax.taxPercent ? String(linkedTax.taxPercent) : "0",
    };
  }, [selectedCustomer, activeOrganization?.address?.state, allTaxes]);

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      recalcLine({
        id: crypto.randomUUID(),
        itemId: "",
        description: "",
        hsnSacCode: "",
        quantity: "1",
        rate: "0",
        discount: "0",
        taxId: "",
        taxPercent: "0",
        taxIsManual: false,
        amount: 0,
      }),
    ]);
  }

  function removeLine(id: string) {
    setLineItems((prev) =>
      prev.length === 1 ? prev : prev.filter((li) => li.id !== id),
    );
  }

  function buildPayload(
    saveStatus: SalesOrderStatus,
  ): CreateSalesOrderInput | null {
    setError("");
    if (!customerId) {
      setError("Customer Name is required");
      return null;
    }
    if (!salesOrderNumber.trim()) {
      setError("Sales Order# is required");
      return null;
    }

    const cleanedLines = lineItems
      .map((li) => {
        const qty = Number(li.quantity);
        const rate = Number(li.rate);
        const disc = roundMoney(li.discount || 0);
        const selectedItem = itemsById.get(li.itemId);
        const taxId =
          li.taxId && li.taxId !== "none" ? li.taxId
          : li.taxIsManual ? "none"
          : null;
        const safeQty = Number.isFinite(qty) ? qty : 0;
        const safeRate = Number.isFinite(rate) ? roundMoney(rate) : 0;
        const taxPercent = Number(li.taxPercent) || 0;
        const amountBeforeTax = Math.max(0, subtractMoney(multiplyMoney(safeQty, safeRate), disc));
        const taxAmount = percentMoney(amountBeforeTax, taxPercent);
        return {
          itemId: li.itemId,
          name: selectedItem?.name || "",
          description: li.description || undefined,
          hsnSacCode: li.hsnSacCode || selectedItem?.hsnSacCode || "",
          quantity: safeQty,
          rate: safeRate,
          discount: disc,
          taxId,
          taxPercent,
          taxAmount,
          amount: sumMoney([amountBeforeTax, taxAmount]),
        };
      })
      .filter((li) => li.itemId);

    if (cleanedLines.length === 0) {
      setError("Add at least one item");
      return null;
    }

    return {
      customerId,
      salesOrderNumber: salesOrderNumber.trim(),
      reference: reference.trim() || undefined,
      orderDate,
      expectedShipmentDate: expectedShipmentDate || undefined,
      paymentTermsId: paymentTermsId || undefined,
      deliveryMethod: deliveryMethod.trim() || undefined,
      lineItems: cleanedLines,
      shippingCharges: totals.shipping,
      adjustment: totals.adj,
      taxType,
      tdsId: taxType === "TDS" ? tdsId : undefined,
      tcsId: taxType === "TCS" ? tcsId : undefined,
      taxAmount: taxType === "TDS" ? totals.taxAmount : 0,
      tcsAmount: taxType === "TCS" ? totals.taxAmount : 0,
      notes: notes.trim() || undefined,
      terms: terms.trim() || undefined,
      status: saveStatus,
    };
  }

  useEffect(() => {
    if (!lineItems.some((line) => line.itemId && !line.taxIsManual)) return;
    setLineItems((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.itemId || line.taxIsManual) return line;
        const item = itemsById.get(line.itemId);
        if (!item) return line;
        const linkedTax = getDefaultLineTax(item);
        if (
          (line.taxId || "") === linkedTax.taxId &&
          String(line.taxPercent || "0") === linkedTax.taxPercent
        ) {
          return line;
        }
        changed = true;
        return recalcLine({ ...line, ...linkedTax });
      });
      return changed ? next : prev;
    });
  }, [getDefaultLineTax, itemsById, lineItems]);

  async function onSaveDraft() {
    const payload = buildPayload("DRAFT");
    if (!payload) return;
    setSaving(true);
    try {
      await salesOrderApi.create(payload);
      router.push("/sales/orders");
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to create sales order"));
    } finally { setSaving(false); }
  }

  async function onSaveAndSend() {
    const payload = buildPayload("APPROVED");
    if (!payload) return;
    setSaving(true);
    try {
      const res = await salesOrderApi.create(payload);
      const newId = res.data?._id;
      if (newId) {
        router.push(`/sales/orders/${newId}/send-email`);
      } else {
        router.push("/sales/orders");
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to create sales order"));
    } finally { setSaving(false); }
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/sales/orders")}
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Sales <span className="mx-1">/</span>
                Sales Orders <span className="mx-1">/</span>
                <span className="font-medium text-foreground">
                  New Sales Order
                </span>
              </span>
            </div>
          }
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/sales/orders")}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onSaveDraft}
                disabled={saving}
              >
                {saving ?
                  <Loader2 className="h-4 w-4 animate-spin" />
                : null}
                Save as Draft
              </Button>
              <Button
                size="sm"
                onClick={onSaveAndSend}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ?
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <Send className="h-4 w-4 mr-1" />}
                Save and Send
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6">
          <div className="max-w-5xl">
            {error ?
              <p className="mb-4 text-sm text-destructive">{error}</p>
            : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">
                  Customer Name <span className="text-red-500">*</span>
                </Label>
                <div className="md:col-span-8">
                  <Select
                    value={customerId || undefined}
                    onValueChange={(v) => {
                      if (v === "__add_new") {
                        router.push("/sales/customers/new");
                        return;
                      }
                      setCustomerId(v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select or add a customer" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="__add_new">
                        <span className="text-blue-600 font-medium">
                          + Add a customer
                        </span>
                      </SelectItem>
                      {customers.length === 0 && (
                        <SelectItem value="__empty" disabled>
                          No customers found
                        </SelectItem>
                      )}
                      {customers.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{c.displayName}</span>
                            {c.companyName && (
                              <span className="text-xs text-muted-foreground">
                                {c.companyName}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Sales Order#*</Label>
                <div className="md:col-span-8">
                  <Input
                    value={salesOrderNumber}
                    onChange={(e) => setSalesOrderNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Reference#</Label>
                <div className="md:col-span-8">
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Sales Order Date*</Label>
                <div className="md:col-span-8">
                  <Input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Expected Shipment Date</Label>
                <div className="md:col-span-8">
                  <Input
                    type="date"
                    value={expectedShipmentDate}
                    onChange={(e) => setExpectedShipmentDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Payment Terms</Label>
                <div className="md:col-span-8">
                  <Select
                    value={paymentTermsId}
                    onValueChange={setPaymentTermsId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Due on Receipt" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTerms.map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Delivery Method</Label>
                <div className="md:col-span-8">
                  <Input
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value)}
                    placeholder="(optional)"
                  />
                </div>
              </div>

              {/* Status is determined automatically by save action */}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Item Table</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLine}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add New Row
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Details</TableHead>
                      <TableHead className="w-24 text-right">HSN/SAC</TableHead>
                      <TableHead className="w-20 text-right">Qty</TableHead>
                      <TableHead className="w-24 text-right">Stock</TableHead>
                      <TableHead className="w-24 text-right">Rate</TableHead>
                      <TableHead className="w-24 text-right">
                        Discount
                      </TableHead>
                      <TableHead className="w-40 text-right">Tax</TableHead>
                      <TableHead className="w-32 text-right">
                        Amount (excl. tax)
                      </TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li) => {
                      const selectedItem = itemsById.get(li.itemId);
                      const quantity = Number(li.quantity) || 0;
                      const amountBeforeTax =
                        quantity * Number(li.rate || 0) -
                        Number(li.discount || 0);
                      const stockOnHand =
                        selectedItem?.inventoryTracked ?
                          Number(selectedItem.stockOnHand || 0)
                        : null;
                      const exceedsStock =
                        stockOnHand !== null && quantity > stockOnHand;

                      return (
                        <TableRow key={li.id}>
                          <TableCell>
                            <div className="space-y-2">
                              <Select
                                value={li.itemId}
                                onValueChange={(v) => {
                                  const selected = itemsById.get(v);
                                  const linkedTax = selected && !li.taxIsManual ? getDefaultLineTax(selected) : null;
                                  updateLine(li.id, {
                                    itemId: v,
                                    description: selected?.description || "",
                                    hsnSacCode: selected?.hsnSacCode || "",
                                    rate: selected?.sellingPrice != null ? String(selected.sellingPrice) : li.rate,
                                    ...(linkedTax || {}),
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select an item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {items.map((it) => (
                                    <SelectItem key={it._id} value={it._id}>
                                      <div className="flex items-center justify-between gap-3">
                                        <span>{it.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {it.inventoryTracked ?
                                            `Stock ${Number(it.stockOnHand || 0).toLocaleString("en-IN")}`
                                          : "Non-stock"}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Description"
                                value={li.description}
                                onChange={(e) =>
                                  updateLine(li.id, {
                                    description: e.target.value,
                                  })
                                }
                                className="h-7 text-xs"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.hsnSacCode}
                              onChange={(e) =>
                                updateLine(li.id, {
                                  hsnSacCode: e.target.value,
                                })
                              }
                              className="text-right text-xs w-20"
                              placeholder="HSN"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.quantity}
                              onChange={(e) =>
                                updateLine(li.id, { quantity: e.target.value })
                              }
                              className="text-right"
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
                          <TableCell className="text-right">
                            <Input
                              value={li.rate}
                              onChange={(e) =>
                                updateLine(li.id, { rate: e.target.value })
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.discount}
                              onChange={(e) =>
                                updateLine(li.id, { discount: e.target.value })
                              }
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={li.taxId || "none"}
                              onValueChange={(val) => {
                                const selectedTax = allTaxes.find(t => t._id === val);
                                updateLine(li.id, { 
                                  taxId: val === "none" ? null : val, 
                                  taxPercent: selectedTax ? String(selectedTax.rate) : "0",
                                  taxIsManual: true,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select Tax" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  Non-Taxable
                                </SelectItem>
                                {allTaxes.map((t) => (
                                  <SelectItem
                                    key={t._id}
                                    value={t._id}
                                    className="text-xs"
                                  >
                                    {t.name} ({t.rate}%)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatMoney(amountBeforeTax)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeLine(li.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label>Customer Notes</Label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notes"
                    />
                  </div>
                  <div>
                    <Label>Terms & Conditions</Label>
                    <Input
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder="Terms"
                    />
                  </div>
                </div>

                <div className="bg-muted/30 rounded-xl border p-6 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sub Total</span>
                      <span className="tabular-nums font-medium">₹{formatMoney(totals.subTotal)}</span>
                    </div>

                    {totals.taxBreakdown.length > 0 && (
                      <div className="py-2 border-y border-dashed space-y-2">
                        {totals.taxBreakdown.map((b, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-muted-foreground flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                              {b.name}{" "}
                              <span className="text-[10px] opacity-70">
                                [{b.rate}%]
                              </span>
                            </span>
                            <span className="tabular-nums font-medium">
                              ₹
                              {b.amount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            <span className="tabular-nums font-medium">₹{formatMoney(b.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4 pt-1">
                      <span className="text-muted-foreground text-sm">
                        Shipping Charges
                      </span>
                      <div className="w-32 relative group">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">
                          ₹
                        </span>
                        <Input
                          value={shippingCharges}
                          onChange={(e) => setShippingCharges(e.target.value)}
                          className="text-right h-8 text-xs pl-5 focus:ring-1 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground text-sm">
                        Adjustment
                      </span>
                      <div className="w-32 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">
                          ₹
                        </span>
                        <Input
                          value={adjustment}
                          onChange={(e) => setAdjustment(e.target.value)}
                          className="text-right h-8 text-xs pl-5 focus:ring-1 focus:ring-primary/20"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {(["none", "TDS", "TCS"] as const).map((t) => (
                            <label key={t} className={cn(
                              "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full cursor-pointer transition-colors border",
                              taxType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted"
                            )}>
                              <input
                                type="radio"
                                name="taxType"
                                value={t}
                                checked={taxType === t}
                                onChange={() => setTaxType(t)}
                                className="sr-only"
                              />
                              {t.toUpperCase()}
                            </label>
                          ))}
                        </div>

                        {taxType !== "none" && (
                          <div className="w-32">
                            <Select
                              value={taxType === "TDS" ? tdsId : tcsId}
                              onValueChange={
                                taxType === "TDS" ? setTdsId : setTcsId
                              }
                            >
                              <SelectTrigger className="h-7 text-[10px]">
                                <SelectValue
                                  placeholder={`Select ${taxType}`}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {(taxType === "TDS" ? tdsTaxes : tcsTaxes).map(
                                  (t) => (
                                    <SelectItem
                                      key={t._id}
                                      value={t._id}
                                      className="text-xs"
                                    >
                                      {t.taxName} ({t.rate}%)
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {taxType !== "none" && (
                        <div className="flex items-center justify-between text-xs py-1 text-muted-foreground bg-muted/50 px-2 rounded mb-3">
                          <span>{taxType} Amount</span>
                          <span className="tabular-nums font-medium">
                            {taxType === "TDS" ? "-" : "+"} ₹{formatMoney(totals.taxAmount)}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <span className="text-base font-bold text-foreground">
                          Total
                        </span>
                        <div className="text-right">
                          <span className="text-xl font-bold text-primary tabular-nums">
                            ₹{formatMoney(totals.total)}
                          </span>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            Indian Rupee
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
