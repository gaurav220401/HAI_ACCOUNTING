"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { itemApi, type Item } from "@/lib/api/items";
import { accountApi, type Account } from "@/lib/api/accounts";
import { settingsApi, type Tax } from "@/lib/api/settings";
import { billApi, type Bill } from "@/lib/api/bills";
import { tdsTaxApi, type TdsTax } from "@/lib/api/tds-taxes";
import { tcsTaxApi, type TcsTax } from "@/lib/api/tcs-taxes";
import {
  vendorCreditApi,
  type VendorCredit,
  type CreateVendorCreditInput,
  type UpdateVendorCreditInput,
} from "@/lib/api/vendor-credits";
import { uploadApi } from "@/lib/api/upload";
import { divideMoney, formatMoney, multiplyMoney, percentMoney, roundMoney, subtractMoney, sumMoney } from "@/lib/money";

const SUPPLY_STATES = [
  "[AN] - Andaman and Nicobar Islands",
  "[AP] - Andhra Pradesh",
  "[AR] - Arunachal Pradesh",
  "[AS] - Assam",
  "[BR] - Bihar",
  "[CG] - Chhattisgarh",
  "[GA] - Goa",
  "[GJ] - Gujarat",
  "[HR] - Haryana",
  "[HP] - Himachal Pradesh",
  "[JH] - Jharkhand",
  "[KA] - Karnataka",
  "[KL] - Kerala",
  "[MP] - Madhya Pradesh",
  "[MH] - Maharashtra",
  "[MN] - Manipur",
  "[ML] - Meghalaya",
  "[MZ] - Mizoram",
  "[NL] - Nagaland",
  "[OD] - Odisha",
  "[PB] - Punjab",
  "[RJ] - Rajasthan",
  "[SK] - Sikkim",
  "[TN] - Tamil Nadu",
  "[TS] - Telangana",
  "[TR] - Tripura",
  "[UP] - Uttar Pradesh",
  "[UK] - Uttarakhand",
  "[WB] - West Bengal",
  "[CH] - Chandigarh",
  "[DN] - Dadra and Nagar Haveli and Daman and Diu",
  "[DL] - Delhi",
  "[JK] - Jammu and Kashmir",
  "[LA] - Ladakh",
  "[LD] - Lakshadweep",
  "[PY] - Puducherry",
  "[OT] - Other Territory",
];

interface VendorCreditFormProps {
  mode: "create" | "edit";
  initialData?: VendorCredit | null;
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

export function VendorCreditForm({ mode, initialData, onSuccess, onCancel }: VendorCreditFormProps) {
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [tdsTaxes, setTdsTaxes] = useState<TdsTax[]>([]);
  const [tcsTaxes, setTcsTaxes] = useState<TcsTax[]>([]);
  const [vendorBills, setVendorBills] = useState<Bill[]>([]);

  const [loadingDropdowns, setLoadingDropdowns] = useState(true);

  const [vendorId, setVendorId] = useState("");
  const [sourceOfSupply, setSourceOfSupply] = useState("");
  const [destinationOfSupply, setDestinationOfSupply] = useState("");
  const [referenceBillId, setReferenceBillId] = useState("");
  const [billType, setBillType] = useState("");
  const [vendorCreditNumber, setVendorCreditNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [vendorCreditDate, setVendorCreditDate] = useState(todayIso());
  const [discountMode, setDiscountMode] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxType, setTaxType] = useState<"none" | "TDS" | "TCS">("none");
  const [tdsId, setTdsId] = useState("");
  const [tcsId, setTcsId] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([makeRow()]);
  const [saving, setSaving] = useState(false);
  const selectedVendor = useMemo(
    () => vendors.find((v) => v._id === vendorId) || null,
    [vendors, vendorId],
  );

  useEffect(() => {
    setLoadingDropdowns(true);
    Promise.all([
      contactApi.list({ type: "Vendor", page: 1, limit: 200 }).then((res) => setVendors(res.data || [])),
      itemApi.list({ page: 1, limit: 200 }).then((res) => setItems(res.data || [])),
      accountApi.list({ rootType: "Expense", excludeGroups: true }).then((res) => setAccounts(res.data || [])),
      settingsApi.taxes.list().then((res) => setTaxes(res.data || [])),
      tdsTaxApi.list().then((res) => setTdsTaxes(res.data || [])),
      tcsTaxApi.list().then((res) => setTcsTaxes(res.data || [])),
    ]).catch(() => {}).finally(() => {
      setLoadingDropdowns(false);
    });

    if (mode === "create") {
      vendorCreditApi.getNextNumber().then((res) => setVendorCreditNumber(res.data.vendorCreditNumber)).catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "create" || typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const billId = search.get("billId");
    const vId = search.get("vendorId");

    if (vId && !vendorId) {
      setVendorId(vId);
    }

    if (!billId) return;

    billApi
      .getOne(billId)
      .then((res) => {
        const bill = res.data;
        const billVendorId =
          typeof bill.vendorId === "object"
            ? bill.vendorId._id
            : String(bill.vendorId || "");
        if (billVendorId) {
          setVendorId(billVendorId);
        }
        setReferenceBillId(bill._id);
      })
      .catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (!vendorId) {
      setVendorBills([]);
      return;
    }
    billApi
      .list({ vendorId, page: 1, limit: 200, sortBy: "billDate", sortOrder: "desc" })
      .then((res) => setVendorBills((res.data || []).filter((b) => b.status !== "Void")))
      .catch(() => setVendorBills([]));
  }, [vendorId]);

  useEffect(() => {
    if (!initialData) return;
    setVendorId(typeof initialData.vendorId === "object" ? initialData.vendorId._id : String(initialData.vendorId || ""));
    setSourceOfSupply(initialData.sourceOfSupply || "");
    setDestinationOfSupply(initialData.destinationOfSupply || "");
    setReferenceBillId(
      initialData.referenceBillId
        ? typeof initialData.referenceBillId === "object"
          ? initialData.referenceBillId._id
          : String(initialData.referenceBillId)
        : "",
    );
    setBillType(initialData.billType || "");
    setVendorCreditNumber(initialData.vendorCreditNumber || "");
    setOrderNumber(initialData.orderNumber || "");
    setVendorCreditDate(initialData.vendorCreditDate?.slice(0, 10) || todayIso());
    setNotes(initialData.notes || "");
    setAttachments(initialData.attachments || []);
    setTaxType(initialData.taxType || "none");
    setTdsId(initialData.tdsId ? (typeof initialData.tdsId === "object" ? initialData.tdsId._id : String(initialData.tdsId)) : "");
    setTcsId(initialData.tcsId ? (typeof initialData.tcsId === "object" ? initialData.tcsId._id : String(initialData.tcsId)) : "");
    setAdjustmentAmount(Number(initialData.adjustmentAmount || 0));
    if ((initialData.discountPercent || 0) > 0) {
      setDiscountMode("percent");
      setDiscountValue(initialData.discountPercent || 0);
    } else {
      setDiscountMode("amount");
      setDiscountValue(initialData.discountAmount || 0);
    }
    setRows(
      (initialData.lineItems || []).map((line) => ({
        id: line._id || Math.random().toString(36).slice(2),
        itemId: line.itemId ? (typeof line.itemId === "object" ? line.itemId._id : String(line.itemId)) : "",
        accountId: line.accountId
          ? typeof line.accountId === "object"
            ? line.accountId._id
            : String(line.accountId)
          : "",
        description: line.description || "",
        quantity: Number(line.quantity || 1),
        rate: Number(line.rate || 0),
        taxPercent: Number(line.taxPercent || 0),
        amount: Number(line.amount || 0),
      })) || [makeRow()],
    );
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

  const subTotal = useMemo(() => sumMoney(rows.map((row) => multiplyMoney(row.quantity, row.rate))), [rows]);
  const lineTaxTotal = useMemo(
    () => sumMoney(rows.map((row) => percentMoney(multiplyMoney(row.quantity, row.rate), row.taxPercent))),
    [rows],
  );
  const discountAmount = useMemo(() => {
    if (discountMode === "percent") return percentMoney(subTotal, discountValue);
    return roundMoney(discountValue);
  }, [discountMode, discountValue, subTotal]);
  const taxableAfterDiscount = useMemo(() => Math.max(0, subtractMoney(subTotal, discountAmount)), [subTotal, discountAmount]);
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
    () => Math.max(0, sumMoney([taxableAfterDiscount, lineTaxTotal, -tdsAmount, tcsAmount, adjustmentAmount])),
    [taxableAfterDiscount, lineTaxTotal, tdsAmount, tcsAmount, adjustmentAmount],
  );

  async function uploadAttachment(file: File) {
    try {
      const result = await uploadApi.upload(file, "vendor-credits");
      setAttachments((prev) => [...prev, result.url]);
      toast.success("Attachment uploaded");
    } catch {
      toast.error("Failed to upload attachment");
    }
  }

  async function submit(status: "DRAFT" | "OPEN") {
    if (!vendorId) {
      toast.error("Vendor is required");
      return;
    }
    if (!vendorCreditNumber.trim()) {
      toast.error("Credit note number is required");
      return;
    }
    if (rows.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    const lineItems = rows.map((row) => {
      const item = items.find((it) => it._id === row.itemId);
      return {
        itemId: row.itemId || null,
        accountId: row.accountId || null,
        name: item?.name || row.description || "Item",
        description: row.description,
        quantity: Number(row.quantity || 0),
        rate: Number(row.rate || 0),
        taxPercent: Number(row.taxPercent || 0),
        amount: roundMoney(row.amount || 0),
      };
    });

    const payload: CreateVendorCreditInput | UpdateVendorCreditInput = {
      vendorId,
      vendorCreditNumber,
      vendorCreditDate,
      referenceBillId: referenceBillId || null,
      sourceOfSupply,
      destinationOfSupply,
      billType,
      orderNumber,
      subject: orderNumber || billType || "",
      discountLevel: "transaction",
      discountPercent: discountMode === "percent" ? discountValue : subTotal > 0 ? multiplyMoney(divideMoney(discountValue, subTotal, 6), 100) : 0,
      taxType,
      tdsId: taxType === "TDS" ? tdsId || null : null,
      tcsId: taxType === "TCS" ? tcsId || null : null,
      tdsAmount,
      tcsAmount,
      adjustmentAmount,
      lineItems,
      notes,
      attachments,
      status,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        await vendorCreditApi.create(payload as CreateVendorCreditInput);
        toast.success("Vendor credit created");
      } else if (initialData?._id) {
        await vendorCreditApi.update(initialData._id, payload as UpdateVendorCreditInput);
        toast.success("Vendor credit updated");
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save vendor credit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-0 py-0 space-y-0">
      <div className="px-6 py-5 bg-muted/25 border-b">
        <div className="max-w-[900px] space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-red-500">Vendor Name*</Label>
              {loadingDropdowns ? (
                <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                  <span className="text-slate-400 text-xs">Loading vendors...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>{v.displayName}</SelectItem>
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
            <button type="button" className="text-blue-600 hover:underline">View Vendor Details</button>
            <div>
              <span className="text-muted-foreground">GST Treatment: </span>
              <span>{selectedVendor?.taxTreatment || "GST Treatment not configured."}</span>
            </div>
            <div>
              <span className="text-muted-foreground">GSTIN: </span>
              <span>{selectedVendor?.gstin || "Not available"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-red-500">Source Of Supply*</Label>
              {loadingDropdowns ? (
                <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                  <span className="text-slate-400 text-xs">Loading states...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <Select value={sourceOfSupply} onValueChange={setSourceOfSupply}>
                  <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {SUPPLY_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-red-500">Destination Of Supply*</Label>
              {loadingDropdowns ? (
                <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                  <span className="text-slate-400 text-xs">Loading states...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <Select value={destinationOfSupply} onValueChange={setDestinationOfSupply}>
                  <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {SUPPLY_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Bill Number</Label>
              {loadingDropdowns ? (
                <div className="w-full h-9 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-3 mt-1">
                  <span className="text-slate-400 text-xs">Loading bills...</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </div>
              ) : (
                <Select value={referenceBillId || "none"} onValueChange={(v) => setReferenceBillId(v === "none" ? "" : v)}>
                  <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Select bill" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {vendorBills.map((b) => (
                      <SelectItem key={b._id} value={b._id}>{b.billNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Bill Type</Label>
              <Select value={billType || "none"} onValueChange={(v) => setBillType(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1 bg-white"><SelectValue placeholder="Select bill type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="Goods Returned">Goods Returned</SelectItem>
                  <SelectItem value="Rate Difference">Rate Difference</SelectItem>
                  <SelectItem value="Damaged Goods">Damaged Goods</SelectItem>
                  <SelectItem value="Service Reversal">Service Reversal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="max-w-[900px] grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="vendorCreditNumber" className="text-red-500">Credit Note Number *</Label>
            <Input
              id="vendorCreditNumber"
              name="vendorCreditNumber"
              autoComplete="off"
              className="mt-1 bg-white"
              value={vendorCreditNumber}
              onChange={(e) => setVendorCreditNumber(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="orderNumber">Order Number</Label>
            <Input
              id="orderNumber"
              name="orderNumber"
              autoComplete="off"
              className="mt-1 bg-white"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>Vendor Credit Date</Label>
            <Input className="mt-1 bg-white" type="date" value={vendorCreditDate} onChange={(e) => setVendorCreditDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="flex items-center gap-5 mb-3 text-sm text-muted-foreground">
          <button type="button" className="hover:text-foreground">Tax Exclusive</button>
          <button type="button" className="hover:text-foreground">Select Price List</button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Item Table</h3>
            <button type="button" className="text-blue-600 text-sm">Bulk Actions</button>
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
                    <Select value={row.itemId || "none"} onValueChange={(value) => {
                      const val = value === "none" ? "" : value;
                      const selected = items.find((i) => i._id === val);
                      updateRow(row.id, { itemId: val, description: selected?.purchaseDescription || row.description, rate: selected?.costPrice ?? row.rate });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {items.map((item) => <SelectItem key={item._id} value={item._id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="mt-1" placeholder="Description" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} />
                  </td>
                  <td className="p-2 align-top min-w-[180px]">
                    <Select value={row.accountId || "none"} onValueChange={(value) => updateRow(row.id, { accountId: value === "none" ? "" : value })}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {accounts.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 align-top w-[110px]"><Input type="number" className="text-right" value={row.quantity} onChange={(e) => updateRow(row.id, { quantity: Number(e.target.value || 0) })} /></td>
                  <td className="p-2 align-top w-[120px]"><Input type="number" className="text-right" value={row.rate} onChange={(e) => updateRow(row.id, { rate: Number(e.target.value || 0) })} /></td>
                  <td className="p-2 align-top min-w-[150px]">
                    <Select value={String(row.taxPercent)} onValueChange={(value) => updateRow(row.id, { taxPercent: Number(value) })}>
                      <SelectTrigger><SelectValue placeholder="Select tax" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No Tax</SelectItem>
                        {taxes.filter((t) => typeof t.rate === "number").map((tax) => (
                          <SelectItem key={tax._id} value={String(tax.rate || 0)}>{tax.name} ({tax.rate || 0}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 align-top text-right font-semibold">{fmt(row.amount)}</td>
                  <td className="p-2 align-top text-right">
                    <Button type="button" variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setRows((prev) => [...prev, makeRow()])}>
            <Plus className="h-4 w-4 mr-1" /> Add New Row
          </Button>
          <Button size="sm" variant="outline">Add Items in Bulk</Button>
        </div>

        <div className="border rounded-lg p-4 ml-auto mt-4 md:w-[420px] space-y-2 bg-muted/10">
          <div className="flex justify-between text-sm"><span>Sub Total</span><span>{fmt(subTotal)}</span></div>
          <div className="flex justify-between items-center text-sm gap-3">
            <span>Discount</span>
            <div className="flex items-center gap-2">
              <Input type="number" className="w-28 h-8 text-right bg-white" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value || 0))} />
              <Select value={discountMode} onValueChange={(v: "percent" | "amount") => setDiscountMode(v)}>
                <SelectTrigger className="w-20 h-8 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="amount">INR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-between text-sm"><span>Tax</span><span>{fmt(lineTaxTotal)}</span></div>
          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={taxType === "TDS"}
                onChange={() => setTaxType("TDS")}
              />
              TDS
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={taxType === "TCS"}
                onChange={() => setTaxType("TCS")}
              />
              TCS
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={taxType === "none"}
                onChange={() => setTaxType("none")}
              />
              None
            </label>
          </div>
          {taxType === "TDS" && (
            <div className="flex justify-between items-center gap-3 text-sm">
              {loadingDropdowns ? (
                <div className="h-8 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-2.5 w-[220px]">
                  <span className="text-slate-400 text-xs">Loading tax...</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </div>
              ) : (
                <Select value={tdsId || "none"} onValueChange={(v) => setTdsId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-white w-[220px]"><SelectValue placeholder="Select a Tax" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a Tax</SelectItem>
                    {tdsTaxes.map((t) => (
                      <SelectItem key={t._id} value={t._id}>{t.taxName} ({t.rate}%)</SelectItem>
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
                <div className="h-8 bg-slate-100/80 animate-pulse border border-slate-200 rounded-md flex items-center justify-between px-2.5 w-[220px]">
                  <span className="text-slate-400 text-xs">Loading tax...</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </div>
              ) : (
                <Select value={tcsId || "none"} onValueChange={(v) => setTcsId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-white w-[220px]"><SelectValue placeholder="Select a Tax" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a Tax</SelectItem>
                    {tcsTaxes.map((t) => (
                      <SelectItem key={t._id} value={t._id}>{t.taxName} ({t.rate}%)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <span>+ {fmt(tcsAmount)}</span>
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
          <div className="pt-2 flex justify-between text-2xl font-semibold"><span>Total ( INR )</span><span>{fmt(total)}</span></div>
        </div>
      </div>

      <div className="px-6 py-5 border-b">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
          <Label>Notes</Label>
          <Textarea className="mt-1 min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
          <Label>Attach File(s) to Vendor Credits</Label>
          <div className="mt-1 border rounded-md p-3">
            <label className="inline-flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer hover:bg-muted/40">
              <Upload className="h-4 w-4" /> Upload File
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAttachment(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {attachments.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {attachments.map((url, i) => (
                  <div key={url + i} className="flex items-center justify-between gap-2">
                    <a href={url} target="_blank" rel="noreferrer" className="truncate underline">{url}</a>
                    <button type="button" className="text-red-500" onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex items-center gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => submit("DRAFT")}
          className="border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md h-9 px-4"
        >
          Save as Draft
        </Button>
        <Button
          disabled={saving}
          onClick={() => submit("OPEN")}
          className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-9 px-4"
        >
          Save as Open
        </Button>
        <Button
          variant="outline"
          disabled={saving}
          onClick={onCancel}
          className="border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md h-9 px-4"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
