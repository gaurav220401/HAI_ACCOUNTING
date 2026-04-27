"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, Send } from "lucide-react";

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

import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import {
  salesOrderApi,
  type CreateSalesOrderInput,
  type SalesOrderStatus,
} from "@/lib/api/sales-orders";

// Status is now set automatically based on save action

type LineItemUi = {
  id: string;
  itemId: string;
  description: string;
  hsnSacCode: string;
  quantity: string;
  rate: string;
  discount: string;
  taxPercent: string;
  amount: number;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function genSoNumber() {
  const n = String(Date.now()).slice(-5);
  return `SO-${n}`;
}

export default function NewSalesOrderPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [salesOrderNumber, setSalesOrderNumber] = useState(genSoNumber());
  const [reference, setReference] = useState("");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedShipmentDate, setExpectedShipmentDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [sendAfterSave, setSendAfterSave] = useState(false);

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
      taxPercent: "0",
      amount: 0,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
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
  }, [firebaseUser, loading, orgLoading, activeOrganization]);

  const totals = useMemo(() => {
    const subTotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
    const shipping = shippingCharges.trim() ? Number(shippingCharges) : 0;
    const adj = adjustment.trim() ? Number(adjustment) : 0;
    const total = subTotal + shipping + adj;
    return { subTotal, shipping, adj, total };
  }, [lineItems, shippingCharges, adjustment]);

  function recalcLine(item: LineItemUi): LineItemUi {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const disc = Number(item.discount) || 0;
    const amount = Math.max(0, qty * rate - disc);
    return { ...item, amount };
  }

  function updateLine(id: string, patch: Partial<LineItemUi>) {
    setLineItems((prev) => prev.map((li) => (li.id === id ? recalcLine({ ...li, ...patch }) : li)));
  }

  function addLine() {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: "",
        description: "",
        hsnSacCode: "",
        quantity: "1",
        rate: "0",
        discount: "0",
        taxPercent: "0",
        amount: 0,
      },
    ]);
  }

  function removeLine(id: string) {
    setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((li) => li.id !== id)));
  }

  function buildPayload(saveStatus: SalesOrderStatus): CreateSalesOrderInput | null {
    setError("");
    if (!customerId) { setError("Customer Name is required"); return null; }
    if (!salesOrderNumber.trim()) { setError("Sales Order# is required"); return null; }

    const cleanedLines = lineItems
      .map((li) => {
        const qty = Number(li.quantity);
        const rate = Number(li.rate);
        const disc = Number(li.discount) || 0;
        const selectedItem = itemsById.get(li.itemId);
        return {
          itemId: li.itemId,
          name: selectedItem?.name || "",
          description: li.description || undefined,
          hsnSacCode: li.hsnSacCode || selectedItem?.hsnSacCode || "",
          quantity: Number.isFinite(qty) ? qty : 0,
          rate: Number.isFinite(rate) ? rate : 0,
          discount: disc,
          taxId: null,
          taxPercent: Number(li.taxPercent) || 0,
          amount: Number(li.amount) || 0,
        };
      })
      .filter((li) => li.itemId);

    if (cleanedLines.length === 0) { setError("Add at least one item"); return null; }

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
      notes: notes.trim() || undefined,
      terms: terms.trim() || undefined,
      status: saveStatus,
    };
  }

  async function onSaveDraft() {
    const payload = buildPayload("DRAFT");
    if (!payload) return;
    setSaving(true);
    try {
      await salesOrderApi.create(payload);
      router.push("/sales/orders");
    } catch (e: any) {
      setError(e?.message || "Failed to create sales order");
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
    } catch (e: any) {
      setError(e?.message || "Failed to create sales order");
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
              <Button variant="ghost" size="icon" onClick={() => router.push("/sales/orders")} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Sales <span className="mx-1">/</span>
                Sales Orders <span className="mx-1">/</span>
                <span className="font-medium text-foreground">New Sales Order</span>
              </span>
            </div>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/sales/orders")} disabled={saving}>
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={onSaveDraft} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save as Draft
              </Button>
              <Button size="sm" onClick={onSaveAndSend} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Save and Send
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6">
          <div className="max-w-5xl">
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Customer Name <span className="text-red-500">*</span></Label>
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
                  <Input value={salesOrderNumber} onChange={(e) => setSalesOrderNumber(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Reference#</Label>
                <div className="md:col-span-8">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <Label className="md:col-span-4">Sales Order Date*</Label>
                <div className="md:col-span-8">
                  <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
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
                  <Select value={paymentTermsId} onValueChange={setPaymentTermsId}>
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
                  <Input value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="(optional)" />
                </div>
              </div>

              {/* Status is determined automatically by save action */}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Item Table</div>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
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
                      <TableHead className="w-24 text-right">Discount</TableHead>
                      <TableHead className="w-24 text-right">Amount</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((li) => {
                      const selectedItem = itemsById.get(li.itemId);
                      const quantity = Number(li.quantity) || 0;
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
                                  updateLine(li.id, {
                                    itemId: v,
                                    description: selected?.description || "",
                                    hsnSacCode: selected?.hsnSacCode || "",
                                    rate: selected?.sellingPrice != null ? String(selected.sellingPrice) : li.rate,
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
                                onChange={(e) => updateLine(li.id, { description: e.target.value })}
                                className="h-7 text-xs"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.hsnSacCode}
                              onChange={(e) => updateLine(li.id, { hsnSacCode: e.target.value })}
                              className="text-right text-xs w-20"
                              placeholder="HSN"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.quantity}
                              onChange={(e) => updateLine(li.id, { quantity: e.target.value })}
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
                              onChange={(e) => updateLine(li.id, { rate: e.target.value })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              value={li.discount}
                              onChange={(e) => updateLine(li.id, { discount: e.target.value })}
                              className="text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {li.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(li.id)}>
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
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
                  </div>
                  <div>
                    <Label>Terms & Conditions</Label>
                    <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Terms" />
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sub Total</span>
                    <span className="tabular-nums">{totals.subTotal.toFixed(2)}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Shipping Charges</span>
                    <div className="w-40">
                      <Input
                        value={shippingCharges}
                        onChange={(e) => setShippingCharges(e.target.value)}
                        className="text-right"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Adjustment</span>
                    <div className="w-40">
                      <Input
                        value={adjustment}
                        onChange={(e) => setAdjustment(e.target.value)}
                        className="text-right"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="mt-4 border-t pt-4 flex items-center justify-between">
                    <span className="font-medium">Total (₹)</span>
                    <span className="font-semibold tabular-nums">{totals.total.toFixed(2)}</span>
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
