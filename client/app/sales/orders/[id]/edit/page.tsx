"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  MoreHorizontal,
  FileText,
  Download,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { settingsApi, type PaymentTerms, type Tax } from "@/lib/api/settings";
import {
  salesOrderApi,
  type CreateSalesOrderInput,
  type SalesOrder,
  type SalesOrderStatus,
} from "@/lib/api/sales-orders";
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax } from "@/lib/api/tcs-taxes";

const EDITABLE_ORDER_STATUSES: SalesOrderStatus[] = [
  "DRAFT",
  "APPROVED",
  "OVERDUE",
  "CLOSED",
  "PARTIALLY_INVOICED",
  "INVOICED",
];

type LineItemUi = {
  id: string;
  itemId: string;
  description: string;
  hsnSacCode: string;
  taxPercent: string;
  quantity: string;
  rate: string;
  discount: string;
  taxId: string;
  amount: number;
};

type RefValue = string | { _id: string } | null | undefined;

function getRefId(value: RefValue): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

function getConvertedInvoiceId(
  value: { _id?: string; invoiceId?: string } | undefined,
) {
  return value?.invoiceId || value?._id || "";
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function EditSalesOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [saving, setSaving] = useState(false);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [allTaxes, setAllTaxes] = useState<Tax[]>([]);

  const [formData, setFormData] = useState({
    customerId: "",
    salesOrderNumber: "",
    reference: "",
    orderDate: todayISO(),
    expectedShipmentDate: "",
    paymentTermsId: "",
    deliveryMethod: "",
    salesPersonId: "",
    status: "DRAFT" as SalesOrderStatus,
    shippingCharges: "0",
    adjustment: "0",
    notes: "",
    terms: "",
    taxType: "none" as "TDS" | "TCS" | "none",
    tdsId: "",
    tcsId: "",
  });

  const [lineItems, setLineItems] = useState<LineItemUi[]>([
    {
      id: "1",
      itemId: "",
      description: "",
      hsnSacCode: "",
      taxId: "",
      taxPercent: "0",
      quantity: "1",
      rate: "0",
      discount: "0",
      amount: 0,
    },
  ]);

  const itemsById = useMemo(
    () => new Map(items.map((item) => [item._id, item])),
    [items],
  );

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && !orgLoading && activeOrganization) {
      void fetchInitialData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization]);

  async function fetchInitialData() {
    try {
      const [contactsRes, itemsRes, termsRes, tdsRes, tcsRes, taxesRes, orderRes] = await Promise.all([
        contactApi.list({ page: 1, limit: 100 }),
        itemApi.list({ page: 1, limit: 100 }),
        settingsApi.paymentTerms.list(),
        tdsTaxApi.list(),
        tcsTaxApi.list(),
        settingsApi.taxes.list(),
        id ? salesOrderApi.getById(id) : null,
      ]);

      setContacts(contactsRes.data ?? []);
      setItems(itemsRes.data ?? []);
      setPaymentTerms(termsRes.data ?? []);
      setTdsTaxes(tdsRes.data ?? []);
      setTcsTaxes(tcsRes.data ?? []);
      setAllTaxes(taxesRes.data ?? []);

      if (orderRes?.data) {
        const orderData = orderRes.data;
        setOrder(orderData);
        setFormData({
          customerId: getRefId(orderData.customerId),
          salesOrderNumber: orderData.salesOrderNumber || "",
          reference: orderData.reference || "",
          orderDate: orderData.orderDate?.split("T")[0] || todayISO(),
          expectedShipmentDate:
            orderData.expectedShipmentDate?.split("T")[0] || "",
          paymentTermsId: getRefId(orderData.paymentTermsId),
          deliveryMethod: orderData.deliveryMethod || "",
          salesPersonId: getRefId(orderData.salesPersonId),
          status: (orderData.status || "DRAFT") as SalesOrderStatus,
          shippingCharges: String(orderData.shippingCharges || 0),
          adjustment: String(orderData.adjustment || 0),
          notes: orderData.notes || "",
          terms: orderData.terms || "",
          taxType: (orderData.taxType || "none") as "TDS" | "TCS" | "none",
          tdsId: getRefId(orderData.tdsId),
          tcsId: getRefId(orderData.tcsId),
        });

        if (orderData.lineItems?.length) {
          const formattedItems = orderData.lineItems.map((li, idx: number) => ({
            id: String(idx + 1),
            itemId: getRefId(li.itemId),
            description: li.description || "",
            hsnSacCode: li.hsnSacCode || "",
            taxId: getRefId(li.taxId),
            taxPercent: String(li.taxPercent || 0),
            quantity: String(li.quantity || 1),
            rate: String(li.rate || 0),
            discount: String(li.discount || 0),
            amount: li.amount || 0,
          }));
          setLineItems(
            formattedItems.length > 0 ?
              formattedItems
            : [
                {
                  id: "1",
                  itemId: "",
                  description: "",
                  hsnSacCode: "",
                  taxId: "",
                  taxPercent: "0",
                  quantity: "1",
                  rate: "0",
                  discount: "0",
                  amount: 0,
                },
              ],
          );
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoadingOrder(false);
    }
  }

  function recalcLineItem(line: LineItemUi): LineItemUi {
    const qty = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const discount = Number(line.discount) || 0;
    const taxP = Number(line.taxPercent) || 0;
    const amountBeforeTax = qty * rate - discount;
    const amount = amountBeforeTax + (amountBeforeTax * taxP) / 100;
    return {
      ...line,
      amount,
    };
  }

  function updateLineItem(id: string, patch: Partial<LineItemUi>) {
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.id !== id) return li;
        return recalcLineItem({ ...li, ...patch });
      }),
    );
  }

  function addLineItem() {
    const newId = String(Math.max(...lineItems.map((li) => Number(li.id))) + 1);
    const gst18 = allTaxes.find(t => t.name.toUpperCase().includes("GST18"));
    setLineItems((prev) => [
      ...prev,
      recalcLineItem({
        id: newId,
        itemId: "",
        description: "",
        hsnSacCode: "",
        taxId: gst18?._id || "",
        taxPercent: gst18 ? String(gst18.rate) : "0",
        quantity: "1",
        rate: "0",
        discount: "0",
        amount: 0,
      }),
    ]);
  }

  function removeLineItem(id: string) {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((li) => li.id !== id));
    }
  }

  const totals = useMemo(() => {
    const subTotal = lineItems.reduce((sum, li) => {
      const q = Number(li.quantity) || 0;
      const r = Number(li.rate) || 0;
      const d = Number(li.discount) || 0;
      return sum + (q * r - d);
    }, 0);

    const taxBreakdown: Array<{ name: string; amount: number; rate: number }> = [];
    const breakdownMap = new Map<string, { name: string; amount: number; rate: number }>();
    
    lineItems.forEach((li) => {
      const q = Number(li.quantity) || 0;
      const r = Number(li.rate) || 0;
      const d = Number(li.discount) || 0;
      const amountBeforeTax = q * r - d;
      const taxP = Number(li.taxPercent) || 0;

      if (taxP > 0) {
        const selectedTax = allTaxes.find((t) => t._id === li.taxId);
        if (selectedTax && selectedTax.components && selectedTax.components.length > 0) {
          selectedTax.components.forEach((comp) => {
            const compAmount = (amountBeforeTax * comp.rate) / 100;
            const existing = breakdownMap.get(comp.name) || { name: comp.name, amount: 0, rate: comp.rate };
            existing.amount += compAmount;
            breakdownMap.set(comp.name, existing);
          });
        } else {
          const amount = (amountBeforeTax * taxP) / 100;
          const name = selectedTax?.name || `Tax ${taxP}%`;
          const existing = breakdownMap.get(name) || { name, amount: 0, rate: taxP };
          existing.amount += amount;
          breakdownMap.set(name, existing);
        }
      }
    });

    breakdownMap.forEach((v) => taxBreakdown.push(v));
    const itemTaxes = taxBreakdown.reduce((sum, b) => sum + b.amount, 0);

    const shipping = Number(formData.shippingCharges) || 0;
    const adjustment = Number(formData.adjustment) || 0;

    let taxAmount = 0;
    if (formData.taxType === "TDS") {
      const selected = tdsTaxes.find((t) => t._id === formData.tdsId);
      if (selected) taxAmount = (subTotal * selected.rate) / 100;
    } else if (formData.taxType === "TCS") {
      const selected = tcsTaxes.find((t) => t._id === formData.tcsId);
      if (selected) taxAmount = (subTotal * selected.rate) / 100;
    }

    const total = subTotal + itemTaxes + shipping + adjustment + (formData.taxType === "TCS" ? taxAmount : -taxAmount);
    return { subTotal, itemTaxes, taxBreakdown, shipping, adjustment, taxAmount, total };
  }, [lineItems, allTaxes, formData.shippingCharges, formData.adjustment, formData.taxType, formData.tdsId, formData.tcsId, tdsTaxes, tcsTaxes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    setSaving(true);
    try {
      const submitData: CreateSalesOrderInput = {
        customerId: formData.customerId,
        salesOrderNumber: formData.salesOrderNumber,
        reference: formData.reference || undefined,
        orderDate: formData.orderDate,
        expectedShipmentDate: formData.expectedShipmentDate || undefined,
        paymentTermsId: formData.paymentTermsId || undefined,
        deliveryMethod: formData.deliveryMethod || undefined,
        salesPersonId: formData.salesPersonId || undefined,
        status: formData.status,
        lineItems: lineItems
          .filter((li) => li.itemId && li.quantity && li.rate)
          .map((li) => {
            const q = Number(li.quantity) || 0;
            const r = Number(li.rate) || 0;
            const d = Number(li.discount) || 0;
            const taxP = Number(li.taxPercent) || 0;
            const amountBeforeTax = q * r - d;
            const lineTaxAmount = (amountBeforeTax * taxP) / 100;
            return {
              itemId: li.itemId,
              name: itemsById.get(li.itemId)?.name || "",
              description: li.description || undefined,
              hsnSacCode: li.hsnSacCode || undefined,
              quantity: q,
              rate: r,
              discount: d,
              taxId: li.taxId || null,
              taxPercent: taxP,
              taxAmount: lineTaxAmount,
              amount: amountBeforeTax + lineTaxAmount,
            };
          }),
        shippingCharges: totals.shipping,
        adjustment: totals.adjustment,
        notes: formData.notes || undefined,
        terms: formData.terms || undefined,
        taxType: formData.taxType,
        tdsId: formData.taxType === "TDS" ? formData.tdsId : undefined,
        tcsId: formData.taxType === "TCS" ? formData.tcsId : undefined,
        taxAmount: formData.taxType === "TDS" ? totals.taxAmount : 0,
        tcsAmount: formData.taxType === "TCS" ? totals.taxAmount : 0,
      };

      await salesOrderApi.update(order._id, submitData);
      router.push(`/sales/orders/${order._id}`);
    } catch (error) {
      console.error("Error updating sales order:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertToInvoice() {
    if (!order) return;
    try {
      const result = await salesOrderApi.convertToInvoice(order._id);
      const invoiceId = getConvertedInvoiceId(result.data);
      if (invoiceId) {
        router.push(`/sales/invoices/${invoiceId}`);
      }
    } catch (_err) {
      // noop
    }
  }

  async function handleDelete() {
    if (!order) return;
    try {
      await salesOrderApi.remove(order._id);
      router.push("/sales/orders");
    } catch (_err) {
      // noop
    }
  }

  function handleDownloadPDF() {
    // placeholder for sales order PDF
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (loadingOrder || orgLoading || !activeOrganization) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Sales order not found.
        </div>
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
              Sales Orders <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                Edit {order.salesOrderNumber}
              </span>
            </span>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button size="sm" onClick={handleConvertToInvoice}>
                <FileText className="h-4 w-4 mr-1" />
                Convert to Invoice
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm" aria-label="More">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleDownloadPDF}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="customerId">Customer *</Label>
              <Select
                value={formData.customerId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, customerId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="salesOrderNumber">Sales Order # *</Label>
              <Input
                id="salesOrderNumber"
                value={formData.salesOrderNumber}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    salesOrderNumber: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="reference">Reference #</Label>
              <Input
                id="reference"
                value={formData.reference}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reference: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    orderDate: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="expectedShipmentDate">
                Expected Shipment Date
              </Label>
              <Input
                id="expectedShipmentDate"
                type="date"
                value={formData.expectedShipmentDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    expectedShipmentDate: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <Label htmlFor="paymentTermsId">Payment Terms</Label>
              <Select
                value={formData.paymentTermsId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, paymentTermsId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
                <SelectContent>
                  {paymentTerms.map((pt) => (
                    <SelectItem key={pt._id} value={pt._id}>
                      {pt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="deliveryMethod">Delivery Method</Label>
              <Input
                id="deliveryMethod"
                value={formData.deliveryMethod}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    deliveryMethod: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <Label htmlFor="salesPersonId">Sales Person</Label>
              <Select
                value={formData.salesPersonId}
                onValueChange={(v) =>
                  setFormData((prev) => ({ ...prev, salesPersonId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sales person" />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    status: v as SalesOrderStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_ORDER_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Line Items</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLineItem}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28">HSN/SAC</TableHead>
                    <TableHead className="w-24">Quantity</TableHead>
                    <TableHead className="w-24 text-right">Stock</TableHead>
                    <TableHead className="w-24">Rate</TableHead>
                    <TableHead className="w-24">Discount (Amt)</TableHead>
                    <TableHead className="w-40">Tax</TableHead>
                    <TableHead className="w-24 text-right">Amount</TableHead>
                    <TableHead className="w-16"></TableHead>
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
                                const gst18 = allTaxes.find(t => t.name.toUpperCase().includes("GST18"));
                                updateLineItem(li.id, {
                                  itemId: v,
                                  description: selected?.description || li.description,
                                  hsnSacCode: selected?.hsnSacCode || li.hsnSacCode,
                                  rate:
                                    selected?.sellingPrice != null ?
                                      String(selected.sellingPrice)
                                    : li.rate,
                                  taxId: li.taxId || gst18?._id || "",
                                  taxPercent: li.taxId ? li.taxPercent : (gst18 ? String(gst18.rate) : "0"),
                                });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select item" />
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
                              <p className="text-xs text-muted-foreground">
                                {selectedItem.sku ? `SKU ${selectedItem.sku} · ` : ""}
                                {selectedItem.inventoryTracked ?
                                  `Stock on hand ${Number(selectedItem.stockOnHand || 0).toLocaleString("en-IN")}`
                                : "Inventory not tracked"}
                              </p>
                            : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={li.description}
                            onChange={(e) =>
                              updateLineItem(li.id, { description: e.target.value })
                            }
                            placeholder="Description"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={li.hsnSacCode}
                            onChange={(e) =>
                              updateLineItem(li.id, { hsnSacCode: e.target.value })
                            }
                            placeholder="HSN/SAC"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={li.quantity}
                            onChange={(e) =>
                              updateLineItem(li.id, { quantity: e.target.value })
                            }
                            min="0"
                            step="0.01"
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
                            value={li.rate}
                            onChange={(e) =>
                              updateLineItem(li.id, { rate: e.target.value })
                            }
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={li.discount}
                            onChange={(e) =>
                              updateLineItem(li.id, { discount: e.target.value })
                            }
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={li.taxId}
                            onValueChange={(val) => {
                              const selectedTax = allTaxes.find(t => t._id === val);
                              updateLineItem(li.id, { 
                                taxId: val, 
                                taxPercent: selectedTax ? String(selectedTax.rate) : "0" 
                              });
                            }}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Select Tax" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Non-Taxable</SelectItem>
                              {allTaxes.map((t) => (
                                <SelectItem key={t._id} value={t._id} className="text-xs">
                                  {t.name} ({t.rate}%)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{li.amount.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => removeLineItem(li.id)}
                            disabled={lineItems.length === 1}
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="shippingCharges">Shipping Charges</Label>
              <Input
                id="shippingCharges"
                type="number"
                value={formData.shippingCharges}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    shippingCharges: e.target.value,
                  }))
                }
                min="0"
                step="0.01"
              />
            </div>

            <div>
              <Label htmlFor="adjustment">Adjustment</Label>
              <Input
                id="adjustment"
                type="number"
                value={formData.adjustment}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    adjustment: e.target.value,
                  }))
                }
                step="0.01"
              />
            </div>

            <div className="md:col-span-3 mt-4 border-t pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs cursor-pointer text-muted-foreground">
                    <input
                      type="radio"
                      name="taxType"
                      value="none"
                      checked={formData.taxType === "none"}
                      onChange={() => setFormData(p => ({...p, taxType: "none"}))}
                      className="accent-primary"
                    />
                    None
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer text-muted-foreground">
                    <input
                      type="radio"
                      name="taxType"
                      value="TDS"
                      checked={formData.taxType === "TDS"}
                      onChange={() => setFormData(p => ({...p, taxType: "TDS"}))}
                      className="accent-primary"
                    />
                    TDS
                  </label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer text-muted-foreground">
                    <input
                      type="radio"
                      name="taxType"
                      value="TCS"
                      checked={formData.taxType === "TCS"}
                      onChange={() => setFormData(p => ({...p, taxType: "TCS"}))}
                      className="accent-primary"
                    />
                    TCS
                  </label>
                </div>
                <div className="w-48">
                  {formData.taxType === "TDS" && (
                    <Select value={formData.tdsId} onValueChange={(v) => setFormData(p => ({...p, tdsId: v}))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select TDS" />
                      </SelectTrigger>
                      <SelectContent>
                        {tdsTaxes.map((t) => (
                          <SelectItem key={t._id} value={t._id} className="text-xs">
                            {t.taxName} ({t.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {formData.taxType === "TCS" && (
                    <Select value={formData.tcsId} onValueChange={(v) => setFormData(p => ({...p, tcsId: v}))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select TCS" />
                      </SelectTrigger>
                      <SelectContent>
                        {tcsTaxes.map((t) => (
                          <SelectItem key={t._id} value={t._id} className="text-xs">
                            {t.taxName} ({t.rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {(formData.taxType === "TDS" || formData.taxType === "TCS") && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{formData.taxType} Amount</span>
                  <span className="tabular-nums font-medium">
                    {formData.taxType === "TDS" ? "-" : "+"} ₹{totals.taxAmount.toLocaleString("en-IN", {minimumFractionDigits:2})}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sub Total:</span>
                <span className="tabular-nums">₹{totals.subTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              {totals.taxBreakdown.map((b, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{b.name} [{b.rate}%]</span>
                  <span className="tabular-nums">₹{b.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping Charges</span>
                <span className="tabular-nums">₹{totals.shipping.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              {totals.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{formData.taxType} Amount</span>
                  <span className="tabular-nums">
                    {formData.taxType === "TDS" ? "-" : "+"} ₹{totals.taxAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Adjustment</span>
                <span className="tabular-nums">₹{totals.adjustment.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Total ( ₹ )</span>
                <span className="tabular-nums text-lg">₹{totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                className="w-full min-h-24 p-2 border rounded-md"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Add any notes or special instructions..."
              />
            </div>

            <div>
              <Label htmlFor="terms">Terms and Conditions</Label>
              <textarea
                id="terms"
                className="w-full min-h-24 p-2 border rounded-md"
                value={formData.terms}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, terms: e.target.value }))
                }
                placeholder="Add terms and conditions..."
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4">
            <Button type="submit" disabled={saving}>
              {saving ?
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SidebarInset>
    </SidebarProvider>
  );
}
