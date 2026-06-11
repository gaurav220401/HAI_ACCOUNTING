"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, Settings, Mail } from "lucide-react";
import { toast } from "sonner";
import { SendEmailModal } from "../../_components/send-email-modal";
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
import { getItemTaxForTransaction, normalizeState } from "@/lib/item-tax-linkage";
import { LinkField } from "@/components/link-field";
import { PLACE_OF_SUPPLY_OPTIONS } from "@/app/sales/customers/_components/customer-form";
import {
  decimalToFixed,
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "@/lib/money";
import {
  quoteApi,
  type Quote,
  type SendQuoteEmailInput,
  type UpdateQuoteInput,
} from "@/lib/api/quotes";
import { settingsApi, type SalesPerson, type Tax } from "@/lib/api/settings";

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
  taxIsManual?: boolean;
}

const EXPLICIT_NO_TAX = "none";

type QuoteEmailFormData = SendQuoteEmailInput & {
  files: File[];
};

type RefValue = string | { _id: string } | null | undefined;

function getRefId(value: RefValue): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const fmt = (v: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function RateInput({ 
   value, 
   onChange, 
   className 
}: { 
   value: number; 
   onChange: (v: number) => void; 
   className?: string;
}) {
   const [isFocused, setIsFocused] = useState(false);
   const [localVal, setLocalVal] = useState("");

   const displayVal = isFocused ? localVal : fmt(value);

   return (
      <Input
         type="text"
         className={className}
         value={displayVal}
         onChange={(e) => {
            const val = e.target.value;
            setLocalVal(val);
            const cleaned = val.replace(/[^0-9.-]/g, "");
            const num = parseFloat(cleaned);
            onChange(isNaN(num) ? 0 : num);
         }}
         onFocus={() => {
            setIsFocused(true);
            setLocalVal(value === 0 ? "" : String(value));
         }}
         onBlur={() => {
            setIsFocused(false);
            const cleaned = localVal.replace(/[^0-9.-]/g, "");
            const num = parseFloat(cleaned);
            onChange(isNaN(num) ? 0 : num);
         }}
      />
   );
}

function calcLineAmount(l: LineItem) {
  const lineTotal = multiplyMoney(l.quantity, l.rate);
  const discAmt = percentMoney(lineTotal, l.discountPercent);
  const afterDisc = Math.max(0, subtractMoney(lineTotal, discAmt));
  const taxAmt = percentMoney(afterDisc, l.taxPercent);
  return { lineTotal, discAmt, afterDisc, taxAmt, amount: sumMoney([afterDisc, taxAmt]) };
}

function normalizeTaxLabel(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function resolveTaxMode(tax?: Tax): "igst" | "cgst" | "sgst" | "gst" | "unknown" {
  if (!tax) return "unknown";
  const name = normalizeTaxLabel(tax.name);
  const authority = normalizeTaxLabel(tax.taxAuthority);

  if (authority === "IGST" || name.startsWith("IGST")) return "igst";
  if (authority === "CGST" || name.startsWith("CGST")) return "cgst";
  if (authority === "SGST" || name.startsWith("SGST")) return "sgst";
  if (tax.taxType === "TaxGroup" || authority === "GST" || name.startsWith("GST")) return "gst";

  return "unknown";
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
    taxIsManual: false,
  };
}

export default function EditQuotePage() {
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
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");
  const [lines, setLines] = useState<LineItem[]>([newLine()]);
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("none");
  const [totalTaxId, setTotalTaxId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Redirects
  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Fetch quote + master data
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization || !id)
      return;
    setFetching(true);
    Promise.all([
      quoteApi.getById(id),
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.salesPersons.list(),
      settingsApi.taxes.list(),
    ])
      .then(([qr, cr, ir, spr, txr]) => {
        const q = qr.data;
        setCustomers(cr.data ?? []);
        setItems(ir.data ?? []);
        setSalesPersons(spr.data ?? []);
        setTaxes(txr.data ?? []);

        // Populate form
        setCustomerId(
          typeof q.customerId === "string" ? q.customerId : q.customerId._id,
        );
        setQuoteNumber(q.quoteNumber);
        setReferenceNumber(q.referenceNumber || "");
        setQuoteDate(q.quoteDate?.slice(0, 10) || "");
        setExpiryDate(q.expiryDate?.slice(0, 10) || "");
        setSalesPersonId(getRefId(q.salesPersonId));
        setSubject(q.subject || "");
        setDiscountType(q.discountType || "percent");
        setDiscountValue(q.discountValue || 0);
        setTaxType(q.taxType || "none");
        setTotalTaxId(getRefId(q.taxId));
        setAdjustmentLabel(q.adjustmentLabel || "Adjustment");
        setAdjustmentAmount(q.adjustmentAmount || 0);
        setCustomerNotes(q.customerNotes || "");
        setTermsAndConditions(q.termsAndConditions || "");
        setPlaceOfSupply(q.placeOfSupply || "");

        if (q.items && q.items.length > 0) {
          setLines(
            q.items.map((it: Quote["items"][number]) => {
              const taxId = getRefId(it.taxId);
              const taxPercent = it.taxPercent || 0;
              return {
                key: lineKeyCounter++,
                itemId: getRefId(it.itemId),
                name: it.name,
                description: it.description || "",
                hsnSacCode: it.hsnSacCode || "",
                quantity: it.quantity || 1,
                rate: it.rate || 0,
                discountPercent: it.discountPercent || 0,
                taxId,
                taxPercent,
                taxIsManual: !taxId && taxPercent <= 0,
              };
            }),
          );
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization, id]);

  // Line helpers
  const updateLine = useCallback(
    <K extends keyof LineItem>(key: number, field: K, value: LineItem[K]) => {
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
              taxIsManual: false,
            }
          : l,
        ),
      );
    },
    [items, selectedCustomer, activeOrganization?.address?.state, taxes],
  );

  // ─── Query Param Autoselect ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const newCustomerId = searchParams.get("newCustomerId");
    if (newCustomerId && customers.some((c) => c._id === newCustomerId)) {
      setCustomerId(newCustomerId);
    }
  }, [customers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const createdItemId = searchParams.get("createdItemId");
    if (createdItemId && items.some((i) => i._id === createdItemId)) {
      setLines((prev) => {
        if (prev.some((l) => l.itemId === createdItemId)) return prev;
        const target = prev[prev.length - 1];
        if (!target.itemId && !target.name) {
          setTimeout(() => handleItemSelect(target.key, createdItemId), 0);
          return prev;
        } else {
          const newKey = Date.now();
          setTimeout(() => handleItemSelect(newKey, createdItemId), 0);
          return [...prev, { ...newLine(), key: newKey }];
        }
      });
    }
  }, [items, handleItemSelect]);

  useEffect(() => {
    setLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (!line.itemId || line.taxIsManual) return line;
        const item = items.find((entry) => entry._id === line.itemId);
        if (!item) return line;
        const linkedTax = getItemTaxForTransaction({
          item,
          contact: selectedCustomer,
          organizationState: activeOrganization?.address?.state,
          taxes,
        });
        if (
          line.taxId === linkedTax.taxId &&
          Number(line.taxPercent || 0) === Number(linkedTax.taxPercent || 0)
        ) {
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
  }, [
    customerId,
    selectedCustomer,
    activeOrganization?.address?.state,
    items,
    taxes,
  ]);

  // Calculations
  const subTotal = sumMoney(lines.map((l) => multiplyMoney(l.quantity, l.rate)));
  const lineItemsTotal = sumMoney(lines.map((l) => calcLineAmount(l).amount));
  const lineTaxesSum = sumMoney(lines.map((l) => calcLineAmount(l).taxAmt));
  const lineDiscountsSum = sumMoney(lines.map((l) => calcLineAmount(l).discAmt));
  const discountAmount =
    discountType === "percent" ?
      percentMoney(subTotal, discountValue)
    : roundMoney(discountValue);
  const selectedTax =
    taxType !== "none" ? taxes.find((t) => t._id === totalTaxId) : undefined;
  const taxAmount =
    selectedTax ? percentMoney(subTotal, selectedTax.rate || 0) : 0;
  const taxSignedAmount =
    taxType === "TCS" ? taxAmount
    : taxType === "TDS" ? -taxAmount
    : 0;
  const total = sumMoney([lineItemsTotal, -discountAmount, taxSignedAmount, adjustmentAmount]);

  const taxBreakdown = useMemo(() => {
    const fallbackIsIntra =
      placeOfSupply && activeOrganization?.address?.state ?
        normalizeState(placeOfSupply) === normalizeState(activeOrganization.address.state)
      : false;

    return lines.reduce(
      (acc, line) => {
        const taxAmt = calcLineAmount(line).taxAmt;
        if (!taxAmt) return acc;

        const tax = taxes.find((entry) => entry._id === line.taxId);
        const mode = resolveTaxMode(tax);

        if (mode === "igst") {
          acc.igst += taxAmt;
        } else if (mode === "cgst") {
          acc.cgst += taxAmt;
        } else if (mode === "sgst") {
          acc.sgst += taxAmt;
        } else if (mode === "gst") {
          acc.cgst += taxAmt / 2;
          acc.sgst += taxAmt / 2;
        } else if (fallbackIsIntra) {
          acc.cgst += taxAmt / 2;
          acc.sgst += taxAmt / 2;
        } else {
          acc.igst += taxAmt;
        }

        return acc;
      },
      { cgst: 0, sgst: 0, igst: 0 },
    );
  }, [lines, taxes, placeOfSupply, activeOrganization?.address?.state]);

  // Submit
  async function handleSave(status?: "Draft" | "Sent") {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    setSaving(true);
    try {
      const normalizedTaxType =
        taxType !== "none" && totalTaxId ? taxType : "none";
      const normalizedTaxAmount =
        normalizedTaxType === "none" ? 0 : taxAmount;
      const payload: UpdateQuoteInput = {
        referenceNumber,
        customerId,
        quoteDate,
        expiryDate: expiryDate || null,
        salesPersonId:
          salesPersonId === "__none" || !salesPersonId ? null : salesPersonId,
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
            taxId: l.taxId || (l.taxIsManual ? EXPLICIT_NO_TAX : null),
            taxPercent: l.taxId ? l.taxPercent : 0,
          })),
        discountType,
        discountValue,
        taxType: normalizedTaxType,
        taxId: normalizedTaxType === "none" ? null : totalTaxId,
        taxAmount: normalizedTaxAmount,
        adjustmentLabel,
        adjustmentAmount,
        customerNotes,
        termsAndConditions,
        placeOfSupply,
      };

      if (status) payload.status = status;

      await quoteApi.update(id, payload);

      if (status === "Sent") {
        setShowEmailModal(true);
        setSaving(false);
        return;
      }

      toast.success("Quote updated successfully");
      router.push(`/sales/quotes/${id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save quote"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail(data: QuoteEmailFormData) {
    await quoteApi.sendEmailWithFiles(
      id,
      {
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.body,
        attachQuotePdf: data.attachQuotePdf,
      },
      data.files || [],
    );
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
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
              <span className="font-medium text-foreground">
                Edit {quoteNumber}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/sales/quotes/${id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-6xl">
          <h1 className="text-xl font-bold">Edit Quote — {quoteNumber}</h1>

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
                    router.push(`/sales/customers/new?redirect=${encodeURIComponent(window.location.pathname)}`);
                    return;
                  }
                  setCustomerId(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
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
            <div />

            <div className="space-y-1.5">
              <Label>Quote#</Label>
              <Input value={quoteNumber} disabled />
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
                Quote Date<span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Salesperson</Label>
              <Select value={salesPersonId} onValueChange={setSalesPersonId}>
                <SelectTrigger>
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
            <div className="space-y-1.5 flex flex-col justify-end">
              <Label>Place Of Supply</Label>
              <LinkField
                value={placeOfSupply}
                onChange={setPlaceOfSupply}
                staticOptions={PLACE_OF_SUPPLY_OPTIONS.map((row) => ({
                  value: row.code,
                  label: row.label,
                }))}
                placeholder="Select Place of Supply"
                clearable={true}
                triggerClassName="h-9 w-full"
              />
            </div>
          </div>

          <Separator />

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
            <h2 className="text-sm font-semibold">Item Table</h2>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-60">ITEM DETAILS</TableHead>
                    <TableHead className="w-25 text-right">QUANTITY</TableHead>
                    <TableHead className="w-[180px] text-right">RATE</TableHead>
                    <TableHead className="w-25 text-right">
                      DISCOUNT %
                    </TableHead>
                    <TableHead className="w-30 text-right">TAX</TableHead>
                    <TableHead className="w-36 text-right">
                      AMOUNT (EXCL. TAX)
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const { afterDisc } = calcLineAmount(line);
                    return (
                      <TableRow key={line.key}>
                        <TableCell>
                          <Select
                            value={line.itemId || "__custom"}
                            onValueChange={(v) => {
                              if (v === "__add_new") {
                                router.push(`/items/new?returnUrl=${encodeURIComponent(window.location.pathname)}`);
                                return;
                              }
                              if (v === "__custom") {
                                updateLine(line.key, "itemId", "");
                              } else {
                                handleItemSelect(line.key, v);
                                requestAnimationFrame(() => {
                                  const qtyInput = document.querySelector(
                                    `input[data-quantity-key="${line.key}"]`,
                                  ) as HTMLInputElement | null;
                                  qtyInput?.focus();
                                  qtyInput?.select();
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__add_new">
                                <span className="text-blue-600 font-medium">
                                  + Add an item
                                </span>
                              </SelectItem>
                              <SelectItem value="__custom">
                                <span className="text-muted-foreground">
                                  Custom item…
                                </span>
                              </SelectItem>
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
                            data-quantity-key={line.key}
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
                          <RateInput value={line.rate} className="h-8 text-right text-sm w-full font-medium" onChange={(val) => updateLine(line.key, "rate", val)} />
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
                        <TableCell>
                          <Select
                            value={line.taxId || "__none"}
                            onValueChange={(v) => {
                              const tax = taxes.find((t) => t._id === v);
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.key === line.key ?
                                    {
                                      ...row,
                                      taxId: v === "__none" ? "" : v,
                                      taxPercent: tax ? tax.rate : 0,
                                      taxIsManual: true,
                                    }
                                  : row,
                                ),
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 text-right text-sm">
                              <SelectValue placeholder="Select Tax" />
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
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {decimalToFixed(afterDisc)}
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

          {/* ═══ Totals ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Customer Notes</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-20 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Terms & Conditions</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-25 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Enter your terms and conditions"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Sub Total</span>
                <span className="font-medium tabular-nums">
                  {decimalToFixed(subTotal)}
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
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">₹</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm tabular-nums w-20 text-right">
                    {decimalToFixed(discountAmount)}
                  </span>
                </div>
              </div>

              {/* Line Discounts */}
              {lineDiscountsSum > 0 && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-sm">Item Discounts</span>
                  <span className="tabular-nums w-20 text-right">
                    - {decimalToFixed(lineDiscountsSum)}
                  </span>
                </div>
              )}

              {/* Line Taxes */}
              {lineTaxesSum > 0 && (
                <>
                  {taxBreakdown.cgst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-sm">CGST</span>
                      <span className="tabular-nums w-20 text-right">
                        {decimalToFixed(taxBreakdown.cgst)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.sgst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-sm">SGST</span>
                      <span className="tabular-nums w-20 text-right">
                        {decimalToFixed(taxBreakdown.sgst)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.igst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-sm">IGST</span>
                      <span className="tabular-nums w-20 text-right">
                        {decimalToFixed(taxBreakdown.igst)}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="taxType"
                      value="none"
                      checked={taxType === "none"}
                      onChange={() => {
                        setTaxType("none");
                        setTotalTaxId("");
                      }}
                      className="accent-primary"
                    />
                    None
                  </label>
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
                  <Select
                    value={totalTaxId || "__none"}
                    onValueChange={(value) => {
                      if (value === "__none") {
                        setTotalTaxId("");
                        setTaxType("none");
                        return;
                      }
                      setTotalTaxId(value);
                      if (taxType === "none") setTaxType("TDS");
                    }}
                  >
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
                    {taxType === "TCS" ? "+" : taxType === "TDS" ? "-" : ""}{" "}
                    {decimalToFixed(taxAmount)}
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
                    {decimalToFixed(adjustmentAmount)}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-base font-bold">
                <span>Total ( ₹ )</span>
                <span className="tabular-nums">{decimalToFixed(total)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ═══ Actions ═══ */}
          <div className="flex items-center gap-3 pb-8">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => handleSave()}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
            <Button disabled={saving} onClick={() => handleSave("Sent")}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save and Send
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push(`/sales/quotes/${id}`)}
            >
              Cancel
            </Button>
          </div>
        </div>

        <SendEmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            router.push(`/sales/quotes/${id}`);
          }}
          quoteNumber={quoteNumber}
          defaultRecipient={selectedCustomer?.email || ""}
          onSend={handleSendEmail}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
