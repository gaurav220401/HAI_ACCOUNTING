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
  Save,
  Send,
  Info,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax } from "@/lib/api/tcs-taxes";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceTemplateRenderer } from "@/components/invoice-template-renderer";
import { DEFAULT_CONFIG } from "../edit-template/config";

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

type RefValue = string | { _id: string } | null | undefined;

function getRefId(value: RefValue): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
    accountId: "",
  };
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [fetching, setFetching] = useState(true);

  // Master data
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
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
  const [taxType, setTaxType] = useState<"TDS" | "TCS" | "none">("none");
  const [totalTaxId, setTotalTaxId] = useState("");
  const [adjustmentLabel, setAdjustmentLabel] = useState("Adjustment");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Fetch invoice + master data
  useEffect(() => {
    if (!firebaseUser || loading || orgLoading || !activeOrganization || !id)
      return;
    setFetching(true);
    Promise.all([
      invoiceApi.getById(id),
      contactApi.list({ type: "Customer", page: 1, limit: 500 }),
      itemApi.list({ page: 1, limit: 500 }),
      settingsApi.salesPersons.list(),
      settingsApi.taxes.list(),
      settingsApi.paymentTerms.list(),
      tdsTaxApi.list(),
      tcsTaxApi.list(),
    ])
      .then(([ir, cr, itr, spr, txr, ptr, tdsr, tcsr]) => {
        const inv = ir.data;
        setInvoice(inv);
        setCustomers(cr.data ?? []);
        setItems(itr.data ?? []);
        setSalesPersons(spr.data ?? []);
        setTaxes(txr.data ?? []);
        setPaymentTermsList(ptr.data ?? []);
        setTdsTaxes((tdsr.data ?? []).filter((t: TdsTax) => t.isActive));
        setTcsTaxes((tcsr.data ?? []).filter((t: TcsTax) => t.isActive));

        // Populate form
        setCustomerId(getRefId(inv.customerId));
        setInvoiceNumber(inv.invoiceNumber);
        setReferenceNumber(inv.referenceNumber || "");
        setOrderNumber(inv.orderNumber || "");
        setInvoiceDate(inv.invoiceDate?.slice(0, 10) || "");
        setDueDate(inv.dueDate?.slice(0, 10) || "");
        setPaymentTermsId(getRefId(inv.paymentTermsId));
        setSalesPersonId(getRefId(inv.salesPersonId));
        setSubject(inv.subject || "");
        setDiscountType(inv.discountType || "percent");
        setDiscountValue(inv.discountValue || 0);
        setTaxType(inv.taxType || "none");
        setTotalTaxId(getRefId(inv.taxId));
        setAdjustmentLabel(inv.adjustmentLabel || "Adjustment");
        setAdjustmentAmount(inv.adjustmentAmount || 0);
        setCustomerNotes(inv.customerNotes || "");
        setTermsAndConditions(inv.termsAndConditions || "");

        if (inv.items && inv.items.length > 0) {
          setLines(
            inv.items.map((it: Invoice["items"][number]) => ({
              key: lineKeyCounter++,
              itemId: getRefId(it.itemId),
              name: it.name,
              description: it.description || "",
              hsnSacCode: it.hsnSacCode || "",
              quantity: it.quantity || 1,
              rate: it.rate || 0,
              discountPercent: it.discountPercent || 0,
              taxId: getRefId(it.taxId),
              taxPercent: it.taxPercent || 0,
              accountId: getRefId(it.accountId),
            })),
          );
        }
      })
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error, "Failed to fetch invoice data"));
      })
      .finally(() => setFetching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, orgLoading, activeOrganization, id]);

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

  const updateLineTax = useCallback(
    (key: number, taxId: string) => {
      const tax = taxes.find((entry) => entry._id === taxId);
      setLines((prev) =>
        prev.map((line) =>
          line.key === key ?
            {
              ...line,
              taxId: tax?._id || "",
              taxPercent: tax ? Number(tax.rate || 0) : 0,
            }
          : line,
        ),
      );
    },
    [taxes],
  );

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
              hsnSacCode: (item as any).hsnSacCode || "",
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
  const lineTotals = lines.map(calcLineAmount);
  const subTotal = sumMoney(lineTotals.map((l) => l.lineTotal));
  const lineDiscountAmount = sumMoney(lineTotals.map((l) => l.discAmt));
  const lineTaxAmount = sumMoney(lineTotals.map((l) => l.taxAmt));
  const lineItemsTotal = sumMoney(lineTotals.map((l) => l.amount));
  const discountAmount =
    discountType === "percent" ?
      percentMoney(subTotal, discountValue)
    : roundMoney(discountValue);
  // TDS/TCS calculation using proper TDS/TCS tax entries
  const selectedTdsTax = tdsTaxes.find((t) => t._id === totalTaxId);
  const selectedTcsTax = tcsTaxes.find((t) => t._id === totalTaxId);
  const selectedTax = taxes.find((t) => t._id === totalTaxId);
  
  let tdsTcsRate = 0;
  if (taxType === "TDS" && selectedTdsTax) {
    tdsTcsRate = selectedTdsTax.rate || 0;
  } else if (taxType === "TCS" && selectedTcsTax) {
    tdsTcsRate = selectedTcsTax.rate || 0;
  } else if (selectedTax && taxType !== "none") {
    tdsTcsRate = selectedTax.rate || 0;
  }
  
  const taxAmount = tdsTcsRate > 0 ? percentMoney(subTotal, tdsTcsRate) : 0;
  const taxSignedAmount =
    taxType === "TCS" ? taxAmount
    : taxType === "TDS" ? -taxAmount
    : 0;
  const total = sumMoney([lineItemsTotal, -discountAmount, taxSignedAmount, adjustmentAmount]);

  async function handleUpdate(shouldSend = false) {
    if (!customerId) {
      toast.error("Please select a customer");
      return;
    }
    setSaving(true);
    try {
      let finalInvoiceNumber = invoiceNumber;
      if (finalInvoiceNumber) {
        const match = finalInvoiceNumber.match(/^(INV-\d+)(INV-.*)$/i);
        if (match) {
          finalInvoiceNumber = match[2];
        }
      }

      const payload: UpdateInvoiceInput = {
        invoiceNumber: finalInvoiceNumber,
        referenceNumber,
        orderNumber,
        customerId,
        invoiceDate,
        dueDate: dueDate || null,
        paymentTermsId:
          paymentTermsId === "__receipt" || !paymentTermsId ?
            null
          : paymentTermsId,
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
            taxId: l.taxId || null,
            taxPercent: l.taxPercent,
            accountId: l.accountId || null,
          })),
        discountType,
        discountValue,
        taxType: totalTaxId && taxType !== "none" ? taxType : "none",
        taxId: totalTaxId && taxType !== "none" ? totalTaxId : null,
        tdsId: taxType === "TDS" && selectedTdsTax ? totalTaxId : null,
        tcsId: taxType === "TCS" && selectedTcsTax ? totalTaxId : null,
        taxAmount,
        tcsAmount: taxType === "TCS" ? taxAmount : 0,
        adjustmentLabel,
        adjustmentAmount,
        customerNotes,
        termsAndConditions,
        templateConfig: invoice?.templateConfig || {},
      };
      await invoiceApi.update(id, payload);

      if (shouldSend) {
        await invoiceApi.send(id);
        toast.success("Invoice updated and sent successfully");
      } else {
        toast.success("Invoice updated successfully");
      }

      router.push(`/sales/invoices/${id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to update invoice"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => router.push(`/sales/invoices/${id}`)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">Invoices</span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">
                Edit {invoice.invoiceNumber}
              </span>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/sales/invoices/${id}`)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => handleUpdate(false)}
                disabled={saving}
              >
                {saving ?
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Save className="h-4 w-4 mr-2" />}{" "}
                Save
              </Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleUpdate(true)}
                disabled={saving}
              >
                <Send className="h-4 w-4 mr-2" /> Save and Send
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 flex-col p-8 gap-8 max-w-7xl mx-auto bg-white/50 min-h-full">
          <div className="bg-white rounded-xl border shadow-sm p-8 space-y-10">
            {/* ═══ Header Section ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                    Customer Name <span className="text-red-500">*</span>
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
                    <SelectTrigger className="w-full h-11 border-slate-200 focus:ring-blue-500">
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__add_new">
                        <span className="text-blue-600 font-bold">
                          + Add New Customer
                        </span>
                      </SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c._id} value={c._id}>
                          {c.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Invoice# <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="h-11 border-slate-200 focus:ring-blue-500 font-mono"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0 border-slate-200"
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Order Number
                    </Label>
                    <Input
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="h-11 border-slate-200 focus:ring-blue-500"
                      placeholder="e.g. SO-00001"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Invoice Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="h-11 border-slate-200 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Due Date
                    </Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-11 border-slate-200 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Salesperson
                    </Label>
                    <Select
                      value={salesPersonId || undefined}
                      onValueChange={setSalesPersonId}
                    >
                      <SelectTrigger className="w-full h-11 border-slate-200 focus:ring-blue-500">
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
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-700">
                      Reference#
                    </Label>
                    <Input
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="h-11 border-slate-200 focus:ring-blue-500"
                      placeholder="Reference Number"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-100" />

            <div className="space-y-2 max-w-2xl">
              <Label className="text-sm font-bold text-slate-700">
                Subject
              </Label>
              <Input
                placeholder="Briefly describe the purpose of this invoice"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-11 border-slate-200 focus:ring-blue-500"
              />
            </div>

            {/* ═══ Item Table ═══ */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Line Items</h2>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <ScanBarcode className="h-4 w-4 mr-1.5" /> Barcode Scanning
                  </Button>
                  <Separator orientation="vertical" className="h-4" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs font-bold text-slate-600"
                  >
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh Prices
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[300px] py-4 font-bold text-slate-600">
                        ITEM DETAILS
                      </TableHead>
                      <TableHead className="w-[100px] text-right font-bold text-slate-600">
                        QTY
                      </TableHead>
                      <TableHead className="w-[140px] text-right font-bold text-slate-600">
                        RATE
                      </TableHead>
                      <TableHead className="w-[100px] text-right font-bold text-slate-600">
                        DISC %
                      </TableHead>
                      <TableHead className="w-[180px] text-right font-bold text-slate-600">
                        TAX
                      </TableHead>
                      <TableHead className="w-[160px] text-right font-bold text-slate-600">
                        AMOUNT (EXCL. TAX)
                      </TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => {
                      const { afterDisc } = calcLineAmount(line);
                      return (
                        <TableRow
                          key={line.key}
                          className="group hover:bg-slate-50/50 transition-colors"
                        >
                          <TableCell className="py-5">
                            <div className="space-y-2">
                              <Select
                                value={line.itemId || undefined}
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
                                <SelectTrigger className="h-10 border-slate-200 group-hover:border-slate-300">
                                  <SelectValue placeholder="Select an item" />
                                </SelectTrigger>
                                <SelectContent>
                                  {items.map((it) => (
                                    <SelectItem key={it._id} value={it._id}>
                                      {it.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                className="h-8 text-xs bg-slate-50 border-slate-100 italic"
                                placeholder="Add a description or note for this item"
                                value={line.description}
                                onChange={(e) =>
                                  updateLine(
                                    line.key,
                                    "description",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              className="h-10 text-right font-medium border-slate-200"
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
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-10 text-right font-medium border-slate-200"
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
                              className="h-10 text-right font-medium border-slate-200"
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
                              onValueChange={(v) =>
                                updateLineTax(line.key, v === "__none" ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-10 border-slate-200">
                                <SelectValue placeholder="Tax" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">
                                  Non-Taxable
                                </SelectItem>
                                {taxes.map((tax) => (
                                  <SelectItem key={tax._id} value={tax._id}>
                                    {tax.name} ({tax.rate}%)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right py-5 pr-4">
                            <div className="font-bold text-slate-900 tabular-nums">
                              {formatMoney(afterDisc)}
                            </div>
                          </TableCell>
                          <TableCell className="py-5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all rounded-full"
                              onClick={() => removeLine(line.key)}
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-bold border-dashed border-2 hover:bg-slate-50 h-10 px-6 border-slate-200"
                  onClick={() => setLines((prev) => [...prev, newLine()])}
                >
                  <Plus className="h-4 w-4 mr-2 text-blue-600" /> Add New Row
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-bold text-slate-500 h-10"
                >
                  Add Multiple Items
                </Button>
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* ═══ Footer Section ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-16">
              <div className="space-y-8">
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">
                    Customer Notes
                  </Label>
                  <textarea
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/30 px-4 py-3 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Notes added here will be visible on the invoice"
                    value={customerNotes}
                    onChange={(e) => setCustomerNotes(e.target.value)}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">
                    Terms & Conditions
                  </Label>
                  <textarea
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/30 px-4 py-3 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Enter the terms and conditions of your business"
                    value={termsAndConditions}
                    onChange={(e) => setTermsAndConditions(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-slate-50/50 rounded-2xl p-8 border border-slate-100 space-y-5 h-fit">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium">Sub Total</span>
                  <span className="font-bold tabular-nums text-slate-900">{formatMoney(subTotal)}</span>
                </div>

                {lineDiscountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-green-600 font-medium">
                    <span>Line Item Discount</span>
                    <span className="tabular-nums">- {formatMoney(lineDiscountAmount)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Discount</span>
                    <Select
                      value={discountType}
                      onValueChange={(v: any) => setDiscountType(v)}
                    >
                      <SelectTrigger className="h-7 w-16 text-[10px] py-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">₹</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    className="h-9 w-24 text-right font-bold border-slate-200"
                    value={discountValue}
                    onChange={(e) =>
                      setDiscountValue(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>

                {/* TDS / TCS */}
                <div className="flex items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-sm text-slate-500 font-medium">
                      <input
                        type="radio"
                        name="invoiceTaxType"
                        value="none"
                        checked={taxType === "none"}
                        onChange={() => {
                          setTaxType("none");
                          setTotalTaxId("");
                        }}
                        className="accent-blue-600"
                      />
                      None
                    </label>
                    <label className="flex items-center gap-1 text-sm text-slate-500 font-medium">
                      <input
                        type="radio"
                        name="invoiceTaxType"
                        value="TDS"
                        checked={taxType === "TDS"}
                        onChange={() => {
                          setTaxType("TDS");
                          setTotalTaxId("");
                        }}
                        className="accent-blue-600"
                      />
                      TDS
                    </label>
                    <label className="flex items-center gap-1 text-sm text-slate-500 font-medium">
                      <input
                        type="radio"
                        name="invoiceTaxType"
                        value="TCS"
                        checked={taxType === "TCS"}
                        onChange={() => {
                          setTaxType("TCS");
                          setTotalTaxId("");
                        }}
                        className="accent-blue-600"
                      />
                      TCS
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    {taxType === "TDS" ? (
                      <Select
                        value={totalTaxId || undefined}
                        onValueChange={(value) => {
                          if (value === "__none") {
                            setTotalTaxId("");
                            return;
                          }
                          setTotalTaxId(value);
                        }}
                      >
                        <SelectTrigger className="h-9 w-48 text-xs font-bold border-slate-200">
                          <SelectValue placeholder="Select TDS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">None</SelectItem>
                          {tdsTaxes.map((t) => (
                            <SelectItem key={t._id} value={t._id}>
                              {t.taxName} ({t.rate}%)
                            </SelectItem>
                          ))}
                          {tdsTaxes.length === 0 && (
                            <SelectItem value="__empty" disabled>
                              No TDS configured
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : taxType === "TCS" ? (
                      <Select
                        value={totalTaxId || undefined}
                        onValueChange={(value) => {
                          if (value === "__none") {
                            setTotalTaxId("");
                            return;
                          }
                          setTotalTaxId(value);
                        }}
                      >
                        <SelectTrigger className="h-9 w-48 text-xs font-bold border-slate-200">
                          <SelectValue placeholder="Select TCS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">None</SelectItem>
                          {tcsTaxes.map((t) => (
                            <SelectItem key={t._id} value={t._id}>
                              {t.taxName} ({t.rate}%)
                            </SelectItem>
                          ))}
                          {tcsTaxes.length === 0 && (
                            <SelectItem value="__empty" disabled>
                              No TCS configured
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {taxType !== "none" && (
                      <span className="text-sm tabular-nums w-20 text-right font-bold text-slate-700">
                        {taxType === "TCS" ? "+" : "-"} {taxAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-6 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Adjustment</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-slate-300 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Add or subtract a small amount for rounding or other
                          purposes
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    type="number"
                    className="h-9 w-24 text-right font-bold border-slate-200"
                    value={adjustmentAmount}
                    onChange={(e) =>
                      setAdjustmentAmount(parseFloat(e.target.value) || 0)
                    }
                  />
                </div>

                <Separator className="bg-slate-200" />

                <div className="flex items-center justify-between pt-2">
                  <span className="text-lg font-bold text-slate-900">
                    Total ( ₹ )
                  </span>
                  <span className="text-2xl font-black text-slate-900 tabular-nums">
                    {formatMoney(total)}
                  </span>
                </div>

                <div className="bg-white border rounded-xl p-4 mt-6 space-y-2">
                  <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Post-update Status
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-100 font-bold px-3 py-1"
                    >
                      {invoice.status}
                    </Badge>
                    {total > 0 && (
                      <span className="text-[10px] text-slate-400">
                        Syncs to Ledger & Stock
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pb-20">
            <Button
              variant="outline"
              className="px-8 font-bold border-slate-200"
              onClick={() => router.push(`/sales/invoices/${id}`)}
            >
              Discard
            </Button>
            <Button
              variant="outline"
              className="px-8 font-bold border-slate-200"
              onClick={() => setShowPreviewModal(true)}
            >
              Preview Template
            </Button>
            <Button
              className="px-8 font-bold bg-slate-900 hover:bg-slate-800"
              onClick={() => handleUpdate(false)}
              disabled={saving}
            >
              {saving ?
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : "Save Changes"}
            </Button>
            <Button
              className="px-8 font-bold bg-blue-600 hover:bg-blue-700"
              onClick={() => handleUpdate(true)}
              disabled={saving}
            >
              <Send className="h-4 w-4 mr-2" /> Update and Send
            </Button>
          </div>
        </div>
      </SidebarInset>

      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[850px] max-h-[90vh] overflow-y-auto bg-gray-50/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Invoice Preview</h2>
            <p className="text-sm text-muted-foreground">This is how your invoice will look based on the organization template</p>
          </div>
          <div className="shadow-2xl bg-white border border-border flex items-center justify-center">
            <InvoiceTemplateRenderer
              invoice={{
                invoiceNumber,
                orderNumber,
                referenceNumber,
                invoiceDate: invoiceDate,
                dueDate: dueDate,
                status: invoice?.status || "Draft",
                subTotal,
                discountType,
                discountValue,
                discountAmount: lineDiscountAmount > 0 ? lineDiscountAmount : (discountType === "percent" ? percentMoney(subTotal, discountValue) : discountValue),
                taxType,
                taxAmount: invoice?.taxAmount || 0,
                adjustmentLabel,
                adjustmentAmount,
                total,
                balanceDue: total,
                customerNotes,
                termsAndConditions,
                customerId: selectedCustomer as any,
                items: lines.filter(l => l.name.trim()).map(l => ({
                   name: l.name,
                   description: l.description,
                   quantity: l.quantity,
                   rate: l.rate,
                   discountPercent: l.discountPercent,
                   taxPercent: l.taxPercent,
                   amount: l.quantity * l.rate,
                })) as any[],
              } as any}
              config={{ ...DEFAULT_CONFIG, ...((invoice as any)?.templateConfig || (activeOrganization as any)?.templateConfig || {}) }}
              activeOrganization={activeOrganization}
            />
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
