"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { accountApi, type Account } from "@/lib/api/accounts";
import { settingsApi, type SalesPerson, type Tax } from "@/lib/api/settings";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax } from "@/lib/api/tcs-taxes";
import {
  creditNoteApi,
  type CreditNote,
  type CreateCreditNoteInput,
  type UpdateCreditNoteInput,
} from "@/lib/api/credit-notes";
import { uploadApi } from "@/lib/api/upload";
import { divideMoney, formatMoney, multiplyMoney, percentMoney, roundMoney, subtractMoney, sumMoney } from "@/lib/money";
import { getItemTaxForTransaction } from "@/lib/item-tax-linkage";
import { useOrganization } from "@/contexts/organization-context";

const REASONS = [
  "Sales Return",
  "Rate Difference",
  "Post-Sale Discount",
  "Service Reversal",
  "Quality Issue",
  "Other",
];

interface CreditNoteFormProps {
  mode: "create" | "edit";
  initialData?: CreditNote | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Row {
  id: string;
  itemId: string;
  accountId: string;
  description: string;
  quantity: number;
  rate: number;
  taxId: string;
  taxPercent: number;
  amount: number;
}

function makeRow(): Row {
  return {
    id: Math.random().toString(36).slice(2),
    itemId: "",
    accountId: "",
    description: "",
    quantity: 1,
    rate: 0,
    taxId: "",
    taxPercent: 0,
    amount: 0,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(v: number) {
  return formatMoney(v || 0);
}

function refId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value);
}

export function CreditNoteForm({
  mode,
  initialData,
  onSuccess,
  onCancel,
}: CreditNoteFormProps) {
  const { activeOrganization } = useOrganization();
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [arAccounts, setArAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [creditNoteNumber, setCreditNoteNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(todayIso());
  const [referenceInvoiceId, setReferenceInvoiceId] = useState("");
  const [accountsReceivableId, setAccountsReceivableId] = useState("");
  const [salesPersonId, setSalesPersonId] = useState("");
  const [subject, setSubject] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");

  const [discountMode, setDiscountMode] = useState<"percent" | "amount">(
    "percent",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"none" | "TDS" | "TCS">("none");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [customerNotes, setCustomerNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [saving, setSaving] = useState(false);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === customerId) || null,
    [customers, customerId],
  );

  useEffect(() => {
    setLoadingDropdowns(true);
    Promise.all([
      contactApi.list({ type: "Customer", page: 1, limit: 300 }),
      itemApi.list({ page: 1, limit: 300 }),
      accountApi.list({ rootType: "Income", excludeGroups: true }),
      accountApi.list({ accountType: "Accounts Receivable", excludeGroups: true }),
      settingsApi.taxes.list(),
      settingsApi.salesPersons.list(),
      tdsTaxApi.list(),
      tcsTaxApi.list(),
    ])
      .then(([contactsRes, itemsRes, incomeRes, arRes, taxesRes, salesPersonsRes, tdsRes, tcsRes]) => {
        setCustomers(contactsRes.data || []);
        setItems(itemsRes.data || []);
        setIncomeAccounts(incomeRes.data || []);
        setArAccounts(arRes.data || []);
        setTaxes(taxesRes.data || []);
        setSalesPersons(salesPersonsRes.data || []);
        setTdsTaxes(tdsRes.data || []);
        setTcsTaxes(tcsRes.data || []);
      })
      .catch(() => {
        toast.error("Failed to load master data for credit note");
      })
      .finally(() => {
        setLoadingDropdowns(false);
      });

    if (mode === "create") {
      creditNoteApi
        .getNextNumber()
        .then((res) => setCreditNoteNumber(res.data.creditNoteNumber))
        .catch(() => {
          // noop
        });
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const invoiceId = search.get("invoiceId");
    const customerQueryId = search.get("customerId");

    if (customerQueryId && !customerId) {
      setCustomerId(customerQueryId);
    }

    if (!invoiceId) return;

    invoiceApi
      .getById(invoiceId)
      .then((res) => {
        const invoice = res.data;
        const invoiceCustomerId = refId(invoice.customerId);
        if (invoiceCustomerId) setCustomerId(invoiceCustomerId);

        setReferenceInvoiceId(invoice._id);
        if (!referenceNumber) setReferenceNumber(invoice.invoiceNumber || "");
        if (!subject) setSubject(`Credit for invoice ${invoice.invoiceNumber || ""}`.trim());

        if (invoice.items?.length) {
          setRows(
            invoice.items.map((line) => ({
              id: Math.random().toString(36).slice(2),
              itemId: refId(line.itemId),
              accountId: refId(line.accountId),
              description: line.description || "",
              quantity: Number(line.quantity || 1),
              rate: Number(line.rate || 0),
              taxId: "",  // re-tax effect resolves correct IGST/GST once customer is known
              taxPercent: Number(line.taxPercent || 0),
              amount: Number(line.amount || 0),
            })),
          );
        }
      })
      .catch(() => {
        // noop
      });
  }, [mode, customerId, referenceNumber, subject]);

  useEffect(() => {
    if (!customerId) {
      setCustomerInvoices([]);
      return;
    }

    invoiceApi
      .list({ customerId, page: 1, limit: 200, status: "All" })
      .then((res) => {
        const openInvoices = (res.data || []).filter(
          (invoice) =>
            invoice.status !== "Draft" &&
            invoice.status !== "Void" &&
            Number(invoice.balanceDue || 0) > 0,
        );
        setCustomerInvoices(openInvoices);
      })
      .catch(() => setCustomerInvoices([]));
  }, [customerId]);

  // ── Derive place-of-supply from customer, then re-apply correct IGST/GST ─
  useEffect(() => {
    const state =
      selectedCustomer?.billingAddress?.state ||
      selectedCustomer?.shippingAddress?.state ||
      selectedCustomer?.placeOfSupply ||
      "";
    setPlaceOfSupply(state);
  }, [customerId, selectedCustomer]);

  // Re-tax existing rows whenever the customer / org state changes
  useEffect(() => {
    if (!taxes.length || !items.length) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (!row.itemId) return row;
        const item = items.find((i) => i._id === row.itemId);
        if (!item) return row;
        const contactForTax = selectedCustomer
          ? { ...selectedCustomer, placeOfSupply: placeOfSupply || selectedCustomer.placeOfSupply }
          : placeOfSupply
            ? ({ placeOfSupply } as unknown as Contact)
            : undefined;
        const linked = getItemTaxForTransaction({
          item,
          contact: contactForTax,
          organizationState: activeOrganization?.address?.state,
          taxes,
        });
        if (row.taxId === linked.taxId && row.taxPercent === linked.taxPercent) return row;
        changed = true;
        const base = multiplyMoney(row.quantity || 0, row.rate || 0);
        const tax = percentMoney(base, linked.taxPercent || 0);
        const amount = sumMoney([base, tax]);
        return { ...row, taxId: linked.taxId, taxPercent: linked.taxPercent, amount };
      });
      return changed ? next : prev;
    });
  }, [customerId, selectedCustomer, placeOfSupply, activeOrganization?.address?.state, items, taxes]);

  useEffect(() => {
    if (!selectedCustomer?.accountsReceivableId) return;
    if (mode === "create" || !accountsReceivableId) {
      setAccountsReceivableId(String(selectedCustomer.accountsReceivableId));
    }
  }, [selectedCustomer, mode, accountsReceivableId]);

  useEffect(() => {
    if (!initialData) return;

    setCustomerId(refId(initialData.customerId));
    setReason(initialData.reason || "");
    setCreditNoteNumber(initialData.creditNoteNumber || "");
    setReferenceNumber(initialData.referenceNumber || "");
    setCreditNoteDate(initialData.creditNoteDate?.slice(0, 10) || todayIso());
    setReferenceInvoiceId(refId(initialData.referenceInvoiceId));
    setAccountsReceivableId(refId(initialData.accountsReceivableId));
    setSalesPersonId(refId(initialData.salesPersonId));
    setSubject(initialData.subject || "");

    const modeValue = (initialData.discountPercent || 0) > 0 ? "percent" : "amount";
    setDiscountMode(modeValue);
    setDiscountValue(
      modeValue === "percent"
        ? Number(initialData.discountPercent || 0)
        : Number(initialData.discountAmount || 0),
    );

    setTaxType(initialData.taxType || "none");
    setTdsId(refId(initialData.tdsId));
    setTcsId(refId(initialData.tcsId));
    setAdjustmentAmount(Number(initialData.adjustmentAmount || 0));
    setCustomerNotes(initialData.customerNotes || "");
    setTermsAndConditions(initialData.termsAndConditions || "");
    setAttachments(initialData.attachments || []);

    const mappedRows = (initialData.lineItems || [])
      .filter((line) => !line.isHeader)
      .map((line) => ({
        id: line._id || Math.random().toString(36).slice(2),
        itemId: refId(line.itemId),
        accountId: refId(line.accountId),
        description: line.description || "",
        quantity: Number(line.quantity || 1),
        rate: Number(line.rate || 0),
        taxId: "",  // will be resolved by re-tax effect when taxes load
        taxPercent: Number(line.taxPercent || 0),
        amount: Number(line.amount || 0),
      }));

    setRows(mappedRows.length ? mappedRows : [makeRow()]);
  }, [initialData]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const base = multiplyMoney(next.quantity || 0, next.rate || 0);
        const tax = percentMoney(base, next.taxPercent || 0);
        next.amount = sumMoney([base, tax]);
        return next;
      }),
    );
  }

  const subTotal = useMemo(
    () => sumMoney(rows.map((row) => multiplyMoney(row.quantity, row.rate))),
    [rows],
  );

  const lineTaxTotal = useMemo(
    () =>
      sumMoney(rows.map((row) => percentMoney(multiplyMoney(row.quantity, row.rate), row.taxPercent))),
    [rows],
  );

  const discountAmount = useMemo(() => {
    if (discountMode === "percent") return percentMoney(subTotal, discountValue);
    return roundMoney(discountValue);
  }, [discountMode, discountValue, subTotal]);

  const taxableAfterDiscount = useMemo(
    () => Math.max(0, subtractMoney(subTotal, discountAmount)),
    [subTotal, discountAmount],
  );

  const tdsAmount = useMemo(() => {
    if (taxType !== "TDS") return 0;
    const tax = tdsTaxes.find((t) => t._id === tdsId);
    return tax ? percentMoney(taxableAfterDiscount, Number(tax.rate || 0)) : 0;
  }, [taxType, tdsId, tdsTaxes, taxableAfterDiscount]);

  const tcsAmount = useMemo(() => {
    if (taxType !== "TCS") return 0;
    const tax = tcsTaxes.find((t) => t._id === tcsId);
    return tax ? percentMoney(taxableAfterDiscount, Number(tax.rate || 0)) : 0;
  }, [taxType, tcsId, tcsTaxes, taxableAfterDiscount]);

  const total = useMemo(
    () =>
      Math.max(
        0,
        sumMoney([taxableAfterDiscount, lineTaxTotal, -tdsAmount, tcsAmount, adjustmentAmount]),
      ),
    [taxableAfterDiscount, lineTaxTotal, tdsAmount, tcsAmount, adjustmentAmount],
  );

  async function uploadAttachment(file: File) {
    try {
      const result = await uploadApi.upload(file, "credit-notes");
      setAttachments((prev) => [...prev, result.url]);
      toast.success("Attachment uploaded");
    } catch {
      toast.error("Failed to upload attachment");
    }
  }

  async function submit(status: "DRAFT" | "OPEN") {
    if (!customerId) {
      toast.error("Customer is required");
      return;
    }

    if (!creditNoteNumber.trim()) {
      toast.error("Credit note number is required");
      return;
    }

    const nonEmptyRows = rows.filter(
      (row) =>
        row.itemId ||
        row.description.trim() ||
        Number(row.quantity || 0) > 0 ||
        Number(row.rate || 0) > 0,
    );

    if (nonEmptyRows.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    const lineItems = nonEmptyRows.map((row) => {
      const item = items.find((entry) => entry._id === row.itemId);
      const taxObj = taxes.find((t) => t._id === row.taxId);
      return {
        itemId: row.itemId || null,
        accountId: row.accountId || item?.salesAccountId || null,
        name: item?.name || row.description || "Item",
        description: row.description,
        quantity: Number(row.quantity || 0),
        rate: Number(row.rate || 0),
        taxPercent: taxObj ? Number(taxObj.rate || 0) : Number(row.taxPercent || 0),
        taxId: row.taxId || null,
        amount: roundMoney(row.amount || 0),
      };
    });

    const payload: CreateCreditNoteInput | UpdateCreditNoteInput = {
      customerId,
      reason,
      creditNoteNumber,
      referenceNumber,
      creditNoteDate,
      referenceInvoiceId: referenceInvoiceId || null,
      accountsReceivableId: accountsReceivableId || null,
      salesPersonId: salesPersonId || null,
      subject,
      lineItems,
      discountLevel: "transaction",
      discountPercent:
        discountMode === "percent"
          ? discountValue
          : subTotal > 0
            ? multiplyMoney(divideMoney(discountValue, subTotal, 6), 100)
            : 0,
      taxType,
      tdsId: taxType === "TDS" ? tdsId || null : null,
      tcsId: taxType === "TCS" ? tcsId || null : null,
      tdsAmount,
      tcsAmount,
      adjustmentLabel: "Adjustment",
      adjustmentAmount,
      customerNotes,
      termsAndConditions,
      attachments,
      status,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        await creditNoteApi.create(payload as CreateCreditNoteInput);
        toast.success("Credit note created");
      } else if (initialData?._id) {
        await creditNoteApi.update(initialData._id, payload as UpdateCreditNoteInput);
        toast.success("Credit note updated");
      }
      onSuccess();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save credit note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-0">
      <div className="px-6 py-5 bg-muted/25 border-b">
        <div className="max-w-[980px] space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-red-500">Customer Name*</Label>
              {loadingDropdowns ? (
                <div className="w-full h-10 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                  <span className="text-slate-400 text-xs">Loading customers...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="mt-1 bg-white">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer._id} value={customer._id}>
                        {customer.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-transparent">Currency</Label>
              <Input className="mt-1 w-24 bg-white" value="INR" readOnly />
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <button type="button" className="text-teal-600 hover:text-teal-700 font-medium hover:underline">
              View Customer Details
            </button>
            <div>
              <span className="text-muted-foreground">GST Treatment: </span>
              <span>{selectedCustomer?.taxTreatment || "Not configured"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">GSTIN: </span>
              <span>{selectedCustomer?.gstin || "Not available"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="max-w-[980px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label>Reason</Label>
            <Select value={reason || "none"} onValueChange={(v) => setReason(v === "none" ? "" : v)}>
              <SelectTrigger className="mt-1 bg-white">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {REASONS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Reference Invoice</Label>
            {loadingDropdowns ? (
              <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                <span className="text-slate-400 text-xs">Loading invoices...</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            ) : (
              <Select
                value={referenceInvoiceId || "none"}
                onValueChange={(v) => {
                  const value = v === "none" ? "" : v;
                  setReferenceInvoiceId(value);
                  const invoice = customerInvoices.find((entry) => entry._id === value);
                  if (invoice) {
                    if (!referenceNumber) setReferenceNumber(invoice.invoiceNumber || "");
                    if (!subject) {
                      setSubject(`Credit for invoice ${invoice.invoiceNumber || ""}`.trim());
                    }
                  }
                }}
              >
                <SelectTrigger className="mt-1 bg-white">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customerInvoices.map((invoice) => (
                    <SelectItem key={invoice._id} value={invoice._id}>
                      {invoice.invoiceNumber} (Balance: {fmt(Number(invoice.balanceDue || 0))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label htmlFor="creditNoteNumber" className="text-red-500">Credit Note#*</Label>
            <Input
              id="creditNoteNumber"
              name="creditNoteNumber"
              autoComplete="off"
              className="mt-1 bg-white"
              value={creditNoteNumber}
              onChange={(e) => setCreditNoteNumber(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="referenceNumber">Reference#</Label>
            <Input
              id="referenceNumber"
              name="referenceNumber"
              autoComplete="off"
              className="mt-1 bg-white"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          <div>
            <Label>Credit Note Date</Label>
            <Input
              className="mt-1 bg-white"
              type="date"
              value={creditNoteDate}
              onChange={(e) => setCreditNoteDate(e.target.value)}
            />
          </div>

          <div>
            <Label>Accounts Receivable</Label>
            {loadingDropdowns ? (
              <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                <span className="text-slate-400 text-xs">Loading accounts...</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            ) : (
              <Select
                value={accountsReceivableId || "none"}
                onValueChange={(v) => setAccountsReceivableId(v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-1 bg-white">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {arAccounts.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label>Sales Person</Label>
            {loadingDropdowns ? (
              <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                <span className="text-slate-400 text-xs">Loading sales persons...</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            ) : (
              <Select
                value={salesPersonId || "none"}
                onValueChange={(v) => setSalesPersonId(v === "none" ? "" : v)}
              >
                <SelectTrigger className="mt-1 bg-white">
                  <SelectValue placeholder="Select sales person" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {salesPersons.map((salesPerson) => (
                    <SelectItem key={salesPerson._id} value={salesPerson._id}>
                      {salesPerson.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="lg:col-span-2">
            <Label>Subject</Label>
            <Input
              className="mt-1 bg-white"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary for this credit note"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Item Table</h3>
            <button type="button" className="text-teal-600 hover:text-teal-700 font-medium text-sm">
              Bulk Actions
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item Details</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-left">Tax</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-2 align-top min-w-[220px]">
                    <Select
                      value={row.itemId || "none"}
                      onValueChange={(value) => {
                        const selectedItemId = value === "none" ? "" : value;
                        const selected = items.find((item) => item._id === selectedItemId);
                        const linked = selected
                          ? getItemTaxForTransaction({
                              item: selected,
                              contact: selectedCustomer || undefined,
                              organizationState: activeOrganization?.address?.state,
                              taxes,
                            })
                          : { taxId: "", taxPercent: 0 };
                        updateRow(row.id, {
                          itemId: selectedItemId,
                          description: selected?.sellingDescription || selected?.description || row.description,
                          rate: selected?.sellingPrice ?? row.rate,
                          accountId: selected?.salesAccountId || row.accountId,
                          taxId: linked.taxId,
                          taxPercent: linked.taxPercent,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {items.map((item) => (
                          <SelectItem key={item._id} value={item._id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="mt-1"
                      placeholder="Description"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, { description: e.target.value })}
                    />
                  </td>

                  <td className="p-2 align-top min-w-[180px]">
                    <Select
                      value={row.accountId || "none"}
                      onValueChange={(value) =>
                        updateRow(row.id, {
                          accountId: value === "none" ? "" : value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {incomeAccounts.map((account) => (
                          <SelectItem key={account._id} value={account._id}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="p-2 align-top w-[110px]">
                    <Input
                      type="number"
                      className="text-right"
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.id, {
                          quantity: Number(e.target.value || 0),
                        })
                      }
                    />
                  </td>

                  <td className="p-2 align-top w-[120px]">
                    <Input
                      type="number"
                      className="text-right"
                      value={row.rate}
                      onChange={(e) =>
                        updateRow(row.id, {
                          rate: Number(e.target.value || 0),
                        })
                      }
                    />
                  </td>

                  <td className="p-2 align-top min-w-[150px]">
                    <Select
                      value={row.taxId || "__none"}
                      onValueChange={(value) => {
                        const taxObj = taxes.find((t) => t._id === value);
                        updateRow(row.id, {
                          taxId: value === "__none" ? "" : value,
                          taxPercent: taxObj ? Number(taxObj.rate || 0) : 0,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No Tax</SelectItem>
                        {taxes
                          .filter((tax) => typeof tax.rate === "number" && tax.isActive !== false)
                          .map((tax) => (
                            <SelectItem key={tax._id} value={tax._id}>
                              {tax.name} ({tax.rate || 0}%)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="p-2 align-top text-right font-semibold">
                    {fmt(row.amount)}
                  </td>

                  <td className="p-2 align-top text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setRows((prev) => {
                          if (prev.length <= 1) return [makeRow()];
                          return prev.filter((entry) => entry.id !== row.id);
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRows((prev) => [...prev, makeRow()])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add New Row
          </Button>
          <Button size="sm" variant="outline">
            Add Items in Bulk
          </Button>
        </div>

        <div className="border rounded-lg p-4 ml-auto mt-4 md:w-[430px] space-y-2 bg-muted/10">
          <div className="flex justify-between text-sm">
            <span>Sub Total</span>
            <span>{fmt(subTotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm gap-3">
            <span>Discount</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                className="w-28 h-8 text-right bg-white"
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value || 0))}
              />
              <Select
                value={discountMode}
                onValueChange={(value: "percent" | "amount") => setDiscountMode(value)}
              >
                <SelectTrigger className="w-20 h-8 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="amount">INR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between text-sm">
            <span>Tax</span>
            <span>{fmt(lineTaxTotal)}</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={taxType === "TDS"} onChange={() => setTaxType("TDS")} />
              TDS
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={taxType === "TCS"} onChange={() => setTaxType("TCS")} />
              TCS
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={taxType === "none"} onChange={() => setTaxType("none")} />
              None
            </label>
          </div>

          {taxType === "TDS" && (
            <div className="flex justify-between items-center gap-3 text-sm">
              {loadingDropdowns ? (
                <div className="w-[220px] h-8 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-2.5">
                  <span className="text-slate-400 text-xs">Loading TDS...</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </div>
              ) : (
                <Select value={tdsId || "none"} onValueChange={(v) => setTdsId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-white w-[220px]">
                    <SelectValue placeholder="Select a TDS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a TDS</SelectItem>
                    {tdsTaxes.map((tax) => (
                      <SelectItem key={tax._id} value={tax._id}>
                        {tax.taxName} ({tax.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span>- {fmt(tdsAmount)}</span>
            </div>
          )}

          {taxType === "TCS" && (
            <div className="flex justify-between items-center gap-3 text-sm">
              {loadingDropdowns ? (
                <div className="w-[220px] h-8 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-2.5">
                  <span className="text-slate-400 text-xs">Loading TCS...</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </div>
              ) : (
                <Select value={tcsId || "none"} onValueChange={(v) => setTcsId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-white w-[220px]">
                    <SelectValue placeholder="Select a TCS" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a TCS</SelectItem>
                    {tcsTaxes.map((tax) => (
                      <SelectItem key={tax._id} value={tax._id}>
                        {tax.taxName} ({tax.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span>{fmt(tcsAmount)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm gap-3">
            <span>Adjustment</span>
            <Input
              type="number"
              className="w-28 h-8 text-right bg-white"
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(Number(e.target.value || 0))}
            />
          </div>

          <div className="pt-2 flex justify-between text-2xl font-semibold">
            <span>Total ( INR )</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Customer Notes</Label>
            <Textarea
              className="mt-1 min-h-[90px]"
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
            />
          </div>

          <div>
            <Label>Terms and Conditions</Label>
            <Textarea
              className="mt-1 min-h-[90px]"
              value={termsAndConditions}
              onChange={(e) => setTermsAndConditions(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Label>Attach File(s) to Credit Note</Label>
          <div className="mt-1 border rounded-md p-3">
            <label className="inline-flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40">
              <Upload className="h-4 w-4" /> Upload File
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadAttachment(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            {attachments.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {attachments.map((url, index) => (
                  <div key={`${url}-${index}`} className="flex items-center justify-between gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="truncate underline">
                      {url}
                    </a>
                    <button
                      type="button"
                      className="text-red-500"
                      onClick={() =>
                        setAttachments((prev) => prev.filter((_, idx) => idx !== index))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex items-center gap-2">
        <Button variant="outline" disabled={saving} onClick={() => submit("DRAFT")}>
          Save as Draft
        </Button>
        <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" disabled={saving} onClick={() => submit("OPEN")}>
          Save as Open
        </Button>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
