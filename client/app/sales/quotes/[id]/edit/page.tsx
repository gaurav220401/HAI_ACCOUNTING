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

  const [lastCustomerId, setLastCustomerId] = useState("");
  useEffect(() => {
    if (customerId && !lastCustomerId) {
      setLastCustomerId(customerId);
    }
  }, [customerId, lastCustomerId]);

  useEffect(() => {
    if (selectedCustomer && customerId !== lastCustomerId) {
      setLastCustomerId(customerId);
      setPlaceOfSupply(
        selectedCustomer.placeOfSupply ||
        selectedCustomer.billingAddress?.state ||
        selectedCustomer.shippingAddress?.state ||
        ""
      );
    }
  }, [customerId, selectedCustomer, lastCustomerId]);

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
      const contactForTax = selectedCustomer
        ? { ...selectedCustomer, placeOfSupply: placeOfSupply || selectedCustomer.placeOfSupply }
        : placeOfSupply
          ? ({ placeOfSupply } as unknown as Contact)
          : undefined;
      const linkedTax = getItemTaxForTransaction({
        item,
        contact: contactForTax,
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
    [items, selectedCustomer, placeOfSupply, activeOrganization?.address?.state, taxes],
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
        const contactForTax = selectedCustomer
          ? { ...selectedCustomer, placeOfSupply: placeOfSupply || selectedCustomer.placeOfSupply }
          : placeOfSupply
            ? ({ placeOfSupply } as unknown as Contact)
            : undefined;
        const linkedTax = getItemTaxForTransaction({
          item,
          contact: contactForTax,
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
    placeOfSupply,
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
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-teal-700">Sales</span>
              <span className="text-slate-400">/</span>
              <button
                type="button"
                className="hover:underline text-slate-500 font-medium"
                onClick={() => router.push("/sales/quotes")}
              >
                Quotes
              </button>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">
                Edit {quoteNumber}
              </span>
            </div>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => router.push(`/sales/quotes/${id}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex-1 overflow-auto p-6 max-w-6xl space-y-6">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Edit Quote — {quoteNumber}</h1>
            <p className="text-xs text-slate-500">Modify quote details for customer offer.</p>
          </div>

          {/* ═══ Header Fields ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5 bg-slate-50/50 p-6 rounded-xl border border-slate-100">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-semibold">
                Customer Name<span className="text-rose-500">*</span>
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
                <SelectTrigger className="border-slate-200 focus-visible:ring-teal-600 h-9">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="__add_new">
                    <span className="text-teal-600 font-semibold">
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
                       <div className="flex flex-col text-left">
                         <span className="font-semibold text-slate-700">{c.displayName}</span>
                         {c.companyName && (
                           <span className="text-[10px] text-slate-400">
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
              <Label className="text-xs text-slate-600 font-semibold">Quote#</Label>
              <Input value={quoteNumber} disabled className="border-slate-200 bg-slate-100/50 h-9 cursor-not-allowed" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-semibold">Reference#</Label>
              <Input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="border-slate-200 focus-visible:ring-teal-600 h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-semibold">
                Quote Date<span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="border-slate-200 focus-visible:ring-teal-600 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-semibold">Expiry Date</Label>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="border-slate-200 focus-visible:ring-teal-600 h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-semibold">Salesperson</Label>
              <Select value={salesPersonId} onValueChange={setSalesPersonId}>
                <SelectTrigger className="border-slate-200 focus-visible:ring-teal-600 h-9">
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
              <Label className="text-xs text-slate-600 font-semibold">Place Of Supply</Label>
              <LinkField
                value={placeOfSupply}
                onChange={setPlaceOfSupply}
                staticOptions={PLACE_OF_SUPPLY_OPTIONS.map((row) => ({
                  value: row.code,
                  label: row.label,
                }))}
                placeholder="Select Place of Supply"
                clearable={true}
                triggerClassName="h-9 w-full border-slate-200 focus-visible:ring-teal-600"
              />
            </div>
          </div>

          <Separator className="bg-slate-100" />

          <div className="space-y-1.5 max-w-2xl bg-slate-50/50 p-6 rounded-xl border border-slate-100">
            <Label className="text-xs text-slate-600 font-semibold">Subject</Label>
            <Input
              placeholder="Let your customer know what this Quote is for"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border-slate-200 focus-visible:ring-teal-600 h-9"
            />
          </div>

          <Separator className="bg-slate-100" />

          {/* ═══ Item Table ═══ */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Item Table</h2>
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide min-w-60">
                      ITEM DETAILS
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-25 text-right">
                      QUANTITY
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-[180px] text-right">
                      RATE
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-25 text-right">
                      DISCOUNT %
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-30 text-right">
                      TAX
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-36 text-right">
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
                            <SelectTrigger className="h-8 text-sm border-slate-200">
                              <SelectValue placeholder="Select item" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__add_new">
                                <span className="text-teal-600 font-semibold">
                                  + Add an item
                                </span>
                              </SelectItem>
                              <SelectItem value="__custom">
                                <span className="text-slate-400">
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
                              className="mt-1 h-7 text-xs border-slate-200"
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
                            className="h-8 text-right text-sm border-slate-200"
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
                          <RateInput value={line.rate} className="h-8 text-right text-sm w-full font-medium border-slate-200" onChange={(val) => updateLine(line.key, "rate", val)} />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 text-right text-sm border-slate-200"
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
                            <SelectTrigger className="h-8 text-right text-sm border-slate-200">
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
                        <TableCell className="text-right text-sm font-semibold tabular-nums text-slate-700">
                          {decimalToFixed(afterDisc)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
              className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => setLines((prev) => [...prev, newLine()])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add New Row
            </Button>
          </div>

          <Separator className="bg-slate-100" />

          {/* ═══ Totals ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/20 p-6 rounded-xl border border-slate-100">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold">Customer Notes</Label>
                <textarea
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-h-20 resize-y focus:outline-none focus:ring-2 focus:ring-teal-600"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600 font-semibold">Terms & Conditions</Label>
                <textarea
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm min-h-25 resize-y focus:outline-none focus:ring-2 focus:ring-teal-600"
                  placeholder="Enter your terms and conditions"
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 bg-white p-6 rounded-xl border border-slate-100 shadow-2xs">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Sub Total</span>
                <span className="font-semibold tabular-nums text-slate-800">
                  {decimalToFixed(subTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <span>Discount</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-20 text-right text-sm border-slate-200"
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
                    <SelectTrigger className="h-8 w-16 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">₹</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                    {decimalToFixed(discountAmount)}
                  </span>
                </div>
              </div>

              {/* Line Discounts */}
              {lineDiscountsSum > 0 && (
                <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span>Item Discounts</span>
                  <span className="tabular-nums w-20 text-right font-semibold text-rose-600">
                    - {decimalToFixed(lineDiscountsSum)}
                  </span>
                </div>
              )}

              {/* Line Taxes */}
              {lineTaxesSum > 0 && (
                <>
                  {taxBreakdown.cgst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>CGST</span>
                      <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                        {decimalToFixed(taxBreakdown.cgst)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.sgst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>SGST</span>
                      <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                        {decimalToFixed(taxBreakdown.sgst)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.igst > 0 && (
                    <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                      <span>IGST</span>
                      <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                        {decimalToFixed(taxBreakdown.igst)}
                      </span>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="taxType"
                      value="none"
                      checked={taxType === "none"}
                      onChange={() => {
                        setTaxType("none");
                        setTotalTaxId("");
                      }}
                      className="accent-teal-600"
                    />
                    None
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="taxType"
                      value="TDS"
                      checked={taxType === "TDS"}
                      onChange={() => setTaxType("TDS")}
                      className="accent-teal-600"
                    />
                    TDS
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="taxType"
                      value="TCS"
                      checked={taxType === "TCS"}
                      onChange={() => setTaxType("TCS")}
                      className="accent-teal-600"
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
                    <SelectTrigger className="h-8 w-40 border-slate-200">
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
                  <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                    {taxType === "TCS" ? "+" : taxType === "TDS" ? "-" : ""}{" "}
                    {decimalToFixed(taxAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
                <Input
                  className="h-8 w-32 border-slate-200"
                  value={adjustmentLabel}
                  onChange={(e) => setAdjustmentLabel(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 w-24 text-right text-sm border-slate-200"
                    value={adjustmentAmount}
                    onChange={(e) =>
                      setAdjustmentAmount(parseFloat(e.target.value) || 0)
                    }
                  />
                  <span className="tabular-nums w-20 text-right font-semibold text-slate-800">
                    {decimalToFixed(adjustmentAmount)}
                  </span>
                </div>
              </div>

              <Separator className="my-2 bg-slate-100" />

              <div className="flex items-center justify-between text-base font-bold text-slate-800">
                <span>Total ( ₹ )</span>
                <span className="tabular-nums text-teal-700">{decimalToFixed(total)}</span>
              </div>
            </div>
          </div>

          <Separator className="bg-slate-100" />

          {/* ═══ Actions ═══ */}
          <div className="flex items-center gap-3 pb-8">
            <Button
              variant="outline"
              disabled={saving}
              className="h-9 border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold"
              onClick={() => handleSave()}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
            <Button
              disabled={saving}
              className="h-9 bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              onClick={() => handleSave("Sent")}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save and Send
            </Button>
            <Button
              variant="ghost"
              className="h-9 text-slate-500 hover:bg-slate-50"
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
