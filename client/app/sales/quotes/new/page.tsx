"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, Settings } from "lucide-react";
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
import {
  quoteApi,
  type CreateQuoteInput,
  type QuoteItem,
} from "@/lib/api/quotes";
import { settingsApi, type SalesPerson, type Tax } from "@/lib/api/settings";

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

export default function NewQuotePage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  // Master data
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");

  // Items table
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  // Totals section
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("TDS");
  const [totalTaxId, setTotalTaxId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState(
    "Looking forward for your business.",
  );
  const [termsAndConditions, setTermsAndConditions] = useState("");

  const [saving, setSaving] = useState(false);

  // Load master data
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization) return;
    Promise.allSettled([
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.salesPersons.list(),
      settingsApi.taxes.list(),
      quoteApi.getNextNumber(),
    ])
      .then((results) => {
        const [c, i, sp, tx, nn] = results;
        if (c.status === "fulfilled") setCustomers(c.value.data ?? []);
        if (i.status === "fulfilled") setItems(i.value.data ?? []);
        if (sp.status === "fulfilled") setSalesPersons(sp.value.data ?? []);
        if (tx.status === "fulfilled") setTaxes(tx.value.data ?? []);
        if (nn.status === "fulfilled")
          setQuoteNumber(nn.value.data?.quoteNumber ?? "QT-000001");
      })
      .catch(() => {});
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

  // ─── Calculations ────────────────────────────────────────────────

  const subTotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const selectedTax = taxes.find((t) => t._id === totalTaxId);
  const taxAmount =
    selectedTax ? (subTotal * (selectedTax.rate || 0)) / 100 : 0;
  const total = subTotal - discountAmount - taxAmount + adjustmentAmount;

  // ─── Submit ──────────────────────────────────────────────────────

  async function handleSave(status: "Draft" | "Sent") {
    if (!customerId) {
      alert("Please select a customer");
      return;
    }
    const hasItems = lines.some((l) => l.name.trim());
    if (!hasItems) {
      alert("Please add at least one item");
      return;
    }

    setSaving(true);
    try {
      const payload: CreateQuoteInput = {
        quoteNumber,
        referenceNumber,
        customerId,
        quoteDate,
        expiryDate: expiryDate || null,
        salesPersonId: salesPersonId === "__none" || !salesPersonId ? null : salesPersonId,
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
        status,
      };
      await quoteApi.create(payload);
      router.push("/sales/quotes");
    } catch (e: any) {
      alert(e.message || "Failed to save quote");
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
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/quotes")}
              >
                Quotes
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New Quote</span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/quotes")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-6xl">
          <h1 className="text-xl font-bold">New Quote</h1>

          {/* ═══ Header Fields ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
            {/* Customer Name */}
            <div className="space-y-1.5">
              <Label>
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

            {/* Empty right placeholder */}
            <div />

            {/* Quote # */}
            <div className="space-y-1.5">
              <Label>
                Quote#<span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={quoteNumber}
                  onChange={(e) => setQuoteNumber(e.target.value)}
                />
                <Button variant="outline" size="icon" className="shrink-0">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Reference # */}
            <div className="space-y-1.5">
              <Label>Reference#</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            {/* Quote Date */}
            <div className="space-y-1.5">
              <Label className="text-red-600">
                Quote Date<span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
              />
            </div>

            {/* Expiry Date */}
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            {/* Salesperson */}
            <div className="space-y-1.5">
              <Label>Salesperson</Label>
              <Select value={salesPersonId} onValueChange={setSalesPersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select or Add Salesperson" />
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

            {/* Spacer */}
            <div />
          </div>

          <Separator />

          {/* Subject */}
          <div className="space-y-1.5 max-w-xl">
            <Label>Subject</Label>
            <Input
              placeholder="Let your customer know what this Quote is for"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <Separator />

          {/* ═══ Item Table ═══ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Item Table</h2>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[240px]">
                      ITEM DETAILS
                    </TableHead>
                    <TableHead className="w-[100px] text-right">
                      QUANTITY
                    </TableHead>
                    <TableHead className="w-[120px] text-right">RATE</TableHead>
                    <TableHead className="w-[100px] text-right">
                      DISCOUNT %
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
                            value={line.itemId || "__custom"}
                            onValueChange={(v) => {
                              if (v === "__custom") {
                                updateLine(line.key, "itemId", "");
                              } else {
                                handleItemSelect(line.key, v);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Type or click to select an item." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__custom">
                                <span className="text-muted-foreground">
                                  Custom item…
                                </span>
                              </SelectItem>
                              {items.map((it) => (
                                <SelectItem key={it._id} value={it._id}>
                                  {it.name}
                                  {it.sku ? ` (${it.sku})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!line.itemId && (
                            <Input
                              className="mt-1 h-7 text-xs"
                              placeholder="Item name"
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
                            <Trash2 className="h-3.5 w-3.5" />
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
            {/* Left: Notes & Terms */}
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
                <Label>Terms & Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            {/* Right: Totals */}
            <div className="space-y-3">
              {/* Sub Total */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sub Total</span>
                <span className="font-medium tabular-nums">
                  {subTotal.toFixed(2)}
                </span>
              </div>

              {/* Discount */}
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
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">₹</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    {discountAmount.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* TDS / TCS */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="taxType"
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
                      name="taxType"
                      value="TCS"
                      checked={taxType === "TCS"}
                      onChange={() => setTaxType("TCS")}
                      className="accent-primary"
                    />
                    TCS
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={totalTaxId} onValueChange={setTotalTaxId}>
                    <SelectTrigger className="h-8 w-40">
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

              {/* Adjustment */}
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

              {/* Total */}
              <div className="flex items-center justify-between text-base font-bold">
                <span>Total ( ₹ )</span>
                <span className="tabular-nums">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ═══ Actions ═══ */}
          <div className="flex items-center gap-3 pb-8">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleSave("Draft")}
            >
              {saving ?
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : null}
              Save as Draft
            </Button>
            <Button disabled={saving} onClick={() => handleSave("Sent")}>
              {saving ?
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : null}
              Save and Send
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push("/sales/quotes")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
