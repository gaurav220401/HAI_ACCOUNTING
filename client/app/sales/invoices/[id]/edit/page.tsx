"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Settings,
  X,
  ChevronDown,
  ScanBarcode,
  RefreshCw,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import {
  invoiceApi,
  type Invoice,
  type UpdateInvoiceInput,
} from "@/lib/api/invoices";
import {
  settingsApi,
  type SalesPerson,
  type Tax,
  type PaymentTerms,
} from "@/lib/api/settings";
import { toast } from "sonner";

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
  accountId: string;
}

function calcLineAmount(l: LineItem) {
  const lineTotal = l.quantity * l.rate;
  const discAmt = (lineTotal * l.discountPercent) / 100;
  const afterDisc = lineTotal - discAmt;
  const taxAmt = (afterDisc * l.taxPercent) / 100;
  return { lineTotal, discAmt, afterDisc, taxAmt, amount: afterDisc + taxAmt };
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
    accountId: "",
  };
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [fetching, setFetching] = useState(true);

  // Master data
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [totalTaxId, setTotalTaxId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Fetch invoice + master data
  useEffect(() => {
    if (!firebaseUser || loading || !id) return;
    setFetching(true);
    Promise.all([
      invoiceApi.getById(id),
      contactApi.list({ type: "Customer" as any, page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.salesPersons.list(),
      settingsApi.taxes.list(),
      settingsApi.paymentTerms.list(),
    ])
      .then(([inv, c, i, sp, tx, pt]) => {
        const data = inv.data;
        setInvoice(data);
        setCustomers(c.data ?? []);
        setItems(i.data ?? []);
        setSalesPersons(sp.data ?? []);
        setTaxes(tx.data ?? []);
        setPaymentTermsList(pt.data ?? []);

        // Populate form
        setCustomerId(
          typeof data.customerId === "string" ?
            data.customerId
          : data.customerId?._id || "",
        );
        setInvoiceNumber(data.invoiceNumber);
        setOrderNumber(data.orderNumber || "");
        setInvoiceDate(data.invoiceDate?.slice(0, 10) || "");
        setDueDate(data.dueDate?.slice(0, 10) || "");
        setPaymentTermsId(data.paymentTermsId || "");
        setSalesPersonId(
          typeof data.salesPersonId === "string" ?
            data.salesPersonId
          : (data.salesPersonId as any)?._id || "",
        );
        setSubject(data.subject || "");
        setDiscountType(data.discountType || "percent");
        setDiscountValue(data.discountValue || 0);
        setTaxType(data.taxType || "TDS");
        setTotalTaxId(data.taxId || "");
        setAdjustmentLabel(data.adjustmentLabel || "Adjustment");
        setAdjustmentAmount(data.adjustmentAmount || 0);
        setCustomerNotes(data.customerNotes || "");
        setTermsAndConditions(data.termsAndConditions || "");

        // Populate lines
        if (data.items.length > 0) {
          setLines(
            data.items.map((item, idx) => ({
              key: idx + 1,
              itemId: (item.itemId as string) || "",
              name: item.name,
              description: item.description || "",
              hsnSacCode: item.hsnSacCode || "",
              quantity: item.quantity,
              rate: item.rate,
              discountPercent: item.discountPercent || 0,
              taxId: (item.taxId as string) || "",
              taxPercent: item.taxPercent || 0,
              accountId: (item.accountId as string) || "",
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, id]);

  const updateLine = useCallback(
    (key: number, field: keyof LineItem, value: any) => {
      setLines((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
      );
    },
    [],
  );

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
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ?
            {
              ...l,
              itemId: item._id,
              name: item.name,
              description: item.description || "",
              rate: item.sellingPrice || 0,
            }
          : l,
        ),
      );
    },
    [items],
  );

  // Calculations
  const subTotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const selectedTax = taxes.find((t) => t._id === totalTaxId);
  const taxAmount =
    selectedTax ? (subTotal * (selectedTax.rate || 0)) / 100 : 0;
  const total = subTotal - discountAmount - taxAmount + adjustmentAmount;

  async function handleUpdate() {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    setSaving(true);
    try {
      const payload: UpdateInvoiceInput = {
        invoiceNumber,
        orderNumber,
        customerId,
        invoiceDate,
        dueDate: dueDate || null,
        paymentTermsId: paymentTermsId || null,
        salesPersonId: salesPersonId || null,
        subject,
        items: lines
          .filter((l) => l.name.trim())
          .map((l) => ({
            itemId: l.itemId || null,
            name: l.name,
            description: l.description,
            hsnSacCode: l.hsnSacCode,
            quantity: l.quantity,
            rate: l.rate,
            discountPercent: l.discountPercent,
            taxId: l.taxId || null,
            taxPercent: l.taxPercent,
            accountId: l.accountId || null,
          })),
        discountType,
        discountValue,
        taxType,
        taxId: totalTaxId || null,
        taxAmount,
        adjustmentLabel,
        adjustmentAmount,
        customerNotes,
        termsAndConditions,
      };
      await invoiceApi.update(id, payload);
      router.push(`/sales/invoices/${id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center">
            <p>Invoice not found.</p>
          </div>
        </SidebarInset>
      </SidebarProvider>
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
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/invoices")}
              >
                Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                Edit {invoice.invoiceNumber}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/sales/invoices/${id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-6xl">
          <h1 className="text-xl font-bold">Edit Invoice</h1>

          {/* ═══ Header Fields ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
            <div className="space-y-1.5">
              <Label className="text-red-600">
                Customer Name<span className="text-red-500">*</span>
              </Label>
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
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
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
                      {c.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
            <div className="space-y-1.5">
              <Label>
                Invoice#<span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
                <Button variant="outline" size="icon" className="shrink-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Order Number</Label>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-red-600">
                Invoice Date<span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Salesperson</Label>
              <Select
                value={salesPersonId || undefined}
                onValueChange={setSalesPersonId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Salesperson" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {salesPersons.map((sp) => (
                    <SelectItem key={sp._id} value={sp._id}>
                      {sp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
          </div>

          <Separator />

          <div className="space-y-1.5 max-w-xl">
            <Label>Subject</Label>
            <Input
              placeholder="Let your customer know what this Invoice is for"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <Separator />

          {/* ═══ Item Table ═══ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Item Table</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs">
                  <ScanBarcode className="h-3.5 w-3.5 mr-1" />
                  Scan Item
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs">
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Bulk Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Bulk Update Line Items</DropdownMenuItem>
                    <DropdownMenuItem>
                      Hide All Additional Information
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">
                      ITEM DETAILS
                    </TableHead>
                    <TableHead className="w-[100px] text-right">QTY</TableHead>
                    <TableHead className="w-[120px] text-right">RATE</TableHead>
                    <TableHead className="w-[100px] text-right">
                      DISC %
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      AMOUNT
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const { amount } = calcLineAmount(line);
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Select
                            value={line.itemId || undefined}
                            onValueChange={(v) => {
                              handleItemSelect(line.key, v);
                            }}
                          >
                            <SelectTrigger className="h-8 w-full text-sm">
                              <SelectValue placeholder="Select an item" />
                            </SelectTrigger>
                            <SelectContent>
                              {items.length === 0 && (
                                <SelectItem value="__empty" disabled>
                                  No items found
                                </SelectItem>
                              )}
                              {items.map((it) => (
                                <SelectItem key={it._id} value={it._id}>
                                  {it.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!line.itemId && (
                            <Input
                              className="mt-1 h-7 text-xs"
                              placeholder="Or type a custom item name"
                              value={line.name}
                              onChange={(e) =>
                                updateLine(line.key, "name", e.target.value)
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 text-right text-sm"
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
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-right text-sm"
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
                            className="h-8 text-right text-sm"
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
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(line.key)}
                          >
                            <X className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add New Row
            </Button>
          </div>

          <Separator />

          {/* ═══ Totals Section ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Customer Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Terms &amp; Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter terms and conditions"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sub Total</span>
                <span className="font-medium tabular-nums">
                  {subTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm">Discount</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-20 text-right text-sm"
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
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">&#8377;</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    {discountAmount.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="editTaxType"
                      value="TDS"
                      checked={taxType === "TDS"}
                      onChange={() => setTaxType("TDS")}
                      className="accent-primary"
                    />
                    TDS
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="editTaxType"
                      value="TCS"
                      checked={taxType === "TCS"}
                      onChange={() => setTaxType("TCS")}
                      className="accent-primary"
                    />
                    TCS
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={totalTaxId || undefined}
                    onValueChange={setTotalTaxId}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue placeholder="Select a Tax" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {taxes.map((t) => (
                        <SelectItem key={t._id} value={t._id}>
                          {t.name} ({t.rate}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    - {taxAmount.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Input
                  className="h-8 w-32 text-sm"
                  value={adjustmentLabel}
                  onChange={(e) => setAdjustmentLabel(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-right text-sm"
                    value={adjustmentAmount}
                    onChange={(e) =>
                      setAdjustmentAmount(parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="text-sm tabular-nums w-20 text-right">
                    {adjustmentAmount.toFixed(2)}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-bold">
                <span>Total ( &#8377; )</span>
                <span className="tabular-nums">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ═══ Actions ═══ */}
          <div className="flex items-center gap-3 pb-8">
            <Button disabled={saving} onClick={handleUpdate}>
              {saving ?
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : null}
              Save
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push(`/sales/invoices/${id}`)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
