"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Loader2, Paperclip, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { billApi, type Bill } from "@/lib/api/bills";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { uploadApi } from "@/lib/api/upload";
import { paymentMadeApi, type PaymentBillMap } from "@/lib/api/payments-made";
import { useOrganization } from "@/contexts/organization-context";

type PaymentEntryMode = "bill-payment" | "vendor-advance";

interface BillAllocation {
  bill_id: string;
  payment: number;
}

interface FormState {
  paymentType: PaymentEntryMode;
  vendor_id: string;
  payment_number: string;
  total_amount_paid: number;
  payment_date: string;
  payment_mode: string;
  paid_through_account: string;
  deposit_to_account: string;
  reference_number: string;
  notes: string;
  billAllocations: BillAllocation[];
}

const PAYMENT_MODES = ["Cash", "Bank Transfer", "Bank Check", "UPI", "Credit Card"];

function nowIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function buildInitialForm(): FormState {
  return {
    paymentType: "bill-payment",
    vendor_id: "",
    payment_number: "",
    total_amount_paid: 0,
    payment_date: nowIsoDate(),
    payment_mode: "Cash",
    paid_through_account: "",
    deposit_to_account: "",
    reference_number: "",
    notes: "",
    billAllocations: [],
  };
}

export function PaymentMadeEditor({
  mode,
  paymentId,
  initialBillId,
}: {
  mode: "create" | "edit";
  paymentId?: string;
  initialBillId?: string;
}) {
  const router = useRouter();
  const { activeOrganization } = useOrganization();

  const [form, setForm] = useState<FormState>(buildInitialForm());
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openBills, setOpenBills] = useState<Bill[]>([]);
  const [appliedMaps, setAppliedMaps] = useState<PaymentBillMap[]>([]);

  const [attachments, setAttachments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [showPaidThroughDD, setShowPaidThroughDD] = useState(false);
  const [paidThroughSearch, setPaidThroughSearch] = useState("");
  const [showDepositToDD, setShowDepositToDD] = useState(false);
  const [depositToSearch, setDepositToSearch] = useState("");

  const selectedVendor = useMemo(
    () => vendors.find((v) => v._id === form.vendor_id) || null,
    [vendors, form.vendor_id],
  );

  const selectedPaidThrough = useMemo(
    () => accounts.find((a) => a._id === form.paid_through_account) || null,
    [accounts, form.paid_through_account],
  );

  const selectedDepositTo = useMemo(
    () => accounts.find((a) => a._id === form.deposit_to_account) || null,
    [accounts, form.deposit_to_account],
  );

  useEffect(() => {
    if (!activeOrganization?._id) return;
    let cancelled = false;
    const search = new URLSearchParams(window.location.search);
    const initialVendorId = search.get("vendorId");

    (async () => {
      setLoading(true);
      try {
        const [vendorRes, accountRes] = await Promise.all([
          contactApi.list({ type: "Vendor", page: 1, limit: 200 }),
          accountApi.list({ excludeGroups: true }),
        ]);
        if (cancelled) return;
        setVendors(vendorRes.data || []);
        setAccounts(accountRes.data || []);

        if (mode === "create") {
          const nextNum = await paymentMadeApi.getNextNumber();
          if (cancelled) return;
          setForm((prev) => ({ 
            ...prev, 
            payment_number: nextNum.data.payment_number,
            vendor_id: initialVendorId || prev.vendor_id
          }));

          if (initialBillId) {
            const billRes = await billApi.getOne(initialBillId);
            if (cancelled) return;
            const linkedBill = billRes.data;
            const linkedVendorId =
              typeof linkedBill.vendorId === "string" ? linkedBill.vendorId : linkedBill.vendorId?._id;

            if (linkedVendorId) {
              setForm((prev) => ({
                ...prev,
                paymentType: "bill-payment",
                vendor_id: linkedVendorId,
                reference_number: prev.reference_number || linkedBill.billNumber || "",
                total_amount_paid: prev.total_amount_paid > 0 ? prev.total_amount_paid : Number(linkedBill.balanceDue || 0),
              }));
            }
          }
        }

        if (mode === "edit" && paymentId) {
          const paymentRes = await paymentMadeApi.getOne(paymentId);
          if (cancelled) return;
          const payment = paymentRes.data.payment;
          const maps = paymentRes.data.bill_applications || [];

          setAppliedMaps(maps);
          setForm({
            paymentType: maps.length > 0 ? "bill-payment" : "vendor-advance",
            vendor_id: typeof payment.vendor_id === "string" ? payment.vendor_id : payment.vendor_id._id,
            payment_number: payment.payment_number,
            total_amount_paid: payment.total_amount_paid,
            payment_date: new Date(payment.payment_date).toISOString().split("T")[0],
            payment_mode: payment.payment_mode,
            paid_through_account: payment.paid_through_account || "",
            deposit_to_account: payment.deposit_to_account || "",
            reference_number: payment.reference_number || "",
            notes: payment.notes || "",
            billAllocations: maps
              .filter((m) => typeof m.bill_id === "object")
              .map((m) => ({
                bill_id: typeof m.bill_id === "object" ? m.bill_id._id : "",
                payment: m.applied_amount,
              })),
          });
        }
      } catch (e: any) {
        toast.error(e?.message || `Failed to load payment ${mode} data`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, paymentId, initialBillId, activeOrganization?._id]);

  useEffect(() => {
    if (mode !== "create" || !form.vendor_id || form.paymentType !== "bill-payment") {
      if (mode === "create") {
        setOpenBills([]);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await billApi.list({ page: 1, limit: 200, vendorId: form.vendor_id });
        if (cancelled) return;
        const bills = (res.data || []).filter((b) => !["Paid", "Void"].includes(b.status));
        setOpenBills(bills);
        setForm((prev) => ({
          ...prev,
          billAllocations: bills.map((b) => ({
            bill_id: b._id,
            payment: initialBillId && b._id === initialBillId ? Number(b.balanceDue || 0) : 0,
          })),
          total_amount_paid:
            initialBillId && prev.total_amount_paid <= 0
              ? Number(bills.find((b) => b._id === initialBillId)?.balanceDue || 0)
              : prev.total_amount_paid,
        }));
      } catch {
        if (cancelled) return;
        setOpenBills([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, form.vendor_id, form.paymentType, initialBillId, activeOrganization?._id]);

  const vendorLocked = mode === "create" ? !form.vendor_id : true;

  const appliedTotal = useMemo(() => {
    if (mode === "edit") {
      return appliedMaps.reduce((sum, row) => sum + (row.applied_amount || 0), 0);
    }
    return form.billAllocations.reduce((sum, row) => sum + (Number.isFinite(row.payment) ? row.payment : 0), 0);
  }, [mode, form.billAllocations, appliedMaps]);

  const amountInExcess = useMemo(() => {
    return Math.max(0, Number(form.total_amount_paid || 0) - appliedTotal);
  }, [form.total_amount_paid, appliedTotal]);

  async function uploadAttachment(file: File) {
    setUploadingAttachment(true);
    try {
      const uploaded = await uploadApi.upload(file, "payments-made");
      setAttachments((prev) => [...prev, uploaded.url]);
    } catch {
      toast.error("Attachment upload failed");
    } finally {
      setUploadingAttachment(false);
    }
  }

  function updateAllocation(billId: string, value: number) {
    setForm((prev) => ({
      ...prev,
      billAllocations: prev.billAllocations.map((row) =>
        row.bill_id === billId ? { ...row, payment: Math.max(0, value) } : row,
      ),
    }));
  }

  function clearApplied() {
    setForm((prev) => ({
      ...prev,
      billAllocations: prev.billAllocations.map((row) => ({ ...row, payment: 0 })),
    }));
  }

  async function saveCreate(status: "DRAFT" | "PAID") {
    if (!form.vendor_id) {
      toast.error("Vendor is required");
      return;
    }
    if (!form.payment_number.trim()) {
      toast.error("Payment number is required");
      return;
    }
    if (!form.payment_date) {
      toast.error("Payment date is required");
      return;
    }
    if (form.total_amount_paid <= 0) {
      toast.error("Payment amount must be greater than zero");
      return;
    }

    const selectedApps = form.billAllocations
      .filter((a) => a.payment > 0)
      .map((a) => ({ bill_id: a.bill_id, applied_amount: Number(a.payment) }));

    if (form.paymentType === "bill-payment" && status === "PAID" && selectedApps.length === 0) {
      toast.error("Add bill allocation or switch to Vendor Advance");
      return;
    }

    setSaving(true);
    try {
      const payloadNotes = [form.notes.trim(), attachments.length ? `Attachments: ${attachments.join(", ")}` : ""]
        .filter(Boolean)
        .join("\n\n");

      await paymentMadeApi.create({
        vendor_id: form.vendor_id,
        payment_number: form.payment_number,
        payment_date: form.payment_date,
        payment_mode: form.payment_mode,
        paid_through_account: form.paid_through_account || null,
        deposit_to_account: form.deposit_to_account || null,
        reference_number: form.reference_number,
        notes: payloadNotes,
        status,
        total_amount_paid: Number(form.total_amount_paid),
        bill_applications: form.paymentType === "bill-payment" ? selectedApps : [],
      });

      toast.success(status === "PAID" ? "Payment saved" : "Payment saved as draft");
      router.push("/purchases/payments-made");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save payment");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!paymentId) return;
    setSaving(true);
    try {
      await paymentMadeApi.update(paymentId, {
        payment_date: form.payment_date,
        payment_mode: form.payment_mode,
        paid_through_account: form.paid_through_account || null,
        deposit_to_account: form.deposit_to_account || null,
        reference_number: form.reference_number,
        notes: [form.notes.trim(), attachments.length ? `Attachments: ${attachments.join(", ")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      });
      toast.success("Payment updated");
      router.push("/purchases/payments-made");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update payment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const billRowsForEdit = appliedMaps
    .map((m) => ({ map: m, bill: typeof m.bill_id === "object" ? m.bill_id : null }))
    .filter((x) => x.bill);

  return (
    <div className="h-full overflow-auto bg-slate-50 p-3 sm:p-6">
      <div className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{mode === "create" ? "New Payment Made" : `Edit Payment #${form.payment_number}`}</p>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/purchases/payments-made")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs
          value={form.paymentType}
          onValueChange={(v) => mode === "create" && setForm((p) => ({ ...p, paymentType: v as PaymentEntryMode }))}
          className="rounded-none"
        >
          <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3 py-2">
            <TabsTrigger value="bill-payment" className="px-3 text-sm" disabled={mode === "edit"}>Bill Payment</TabsTrigger>
            <TabsTrigger value="vendor-advance" className="px-3 text-sm" disabled={mode === "edit"}>Vendor Advance</TabsTrigger>
          </TabsList>

          <TabsContent value={form.paymentType} className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div className={cn("rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900", vendorLocked && "opacity-70")}>
                  Initiate payments for your bills directly by integrating with one of our partner banks.
                  <span className="ml-1 font-semibold text-blue-600">Set Up Now</span>
                </div>

                <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", vendorLocked && "[&_.vendor-dependent]:opacity-40")}>
                  <div className="space-y-1.5">
                    <Label>Vendor Name*</Label>
                    <Select
                      disabled={mode === "edit"}
                      value={form.vendor_id}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, vendor_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v._id} value={v._id}>
                            {v.displayName || v.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Payment #*</Label>
                    <Input
                      disabled
                      value={form.payment_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, payment_number: e.target.value }))}
                    />
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Payment Made*</Label>
                    <Input
                      disabled={vendorLocked || mode === "edit"}
                      type="number"
                      min={0}
                      value={form.total_amount_paid || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, total_amount_paid: Number(e.target.value || 0) }))}
                      placeholder="INR"
                    />
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Payment Date*</Label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        disabled={vendorLocked}
                        type="date"
                        className="pl-9"
                        value={form.payment_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>TDS</Label>
                    <Select value="none" onValueChange={() => undefined} disabled={vendorLocked}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select a Tax</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Payment Mode</Label>
                    <Select
                      disabled={vendorLocked}
                      value={form.payment_mode}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, payment_mode: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Paid Through*</Label>
                    <DropdownMenu open={showPaidThroughDD} onOpenChange={(o) => { setShowPaidThroughDD(o); if (!o) setPaidThroughSearch(""); }}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full text-sm border bg-white rounded-md px-3 h-10 hover:bg-muted/30 text-muted-foreground transition-colors" disabled={vendorLocked}>
                          <span className="truncate text-left flex-1 mr-2">{selectedPaidThrough ? `${selectedPaidThrough.code ? `[${selectedPaidThrough.code}] ` : ""}${selectedPaidThrough.name}` : "Select account"}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                        <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                          <Input className="h-7 text-xs" placeholder="Search accounts" value={paidThroughSearch} onChange={(e) => setPaidThroughSearch(e.target.value)} autoFocus />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {accounts.filter((account) => 
                            account.name.toLowerCase().includes(paidThroughSearch.toLowerCase()) || 
                            (account.code && account.code.toLowerCase().includes(paidThroughSearch.toLowerCase()))
                          ).map((account) => (
                            <button key={account._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.paid_through_account === account._id && "bg-primary/10 font-medium")}
                              onClick={() => { setForm((prev) => ({ ...prev, paid_through_account: account._id })); setShowPaidThroughDD(false); setPaidThroughSearch(""); }}>
                              {account.code ? `[${account.code}] ` : ""}{account.name}
                            </button>
                          ))}
                          {accounts.filter((account) => 
                            account.name.toLowerCase().includes(paidThroughSearch.toLowerCase()) || 
                            (account.code && account.code.toLowerCase().includes(paidThroughSearch.toLowerCase()))
                          ).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-5 uppercase tracking-wide font-medium">No Results Found</p>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Deposit To</Label>
                    <DropdownMenu open={showDepositToDD} onOpenChange={(o) => { setShowDepositToDD(o); if (!o) setDepositToSearch(""); }}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="flex items-center justify-between w-full text-sm border bg-white rounded-md px-3 h-10 hover:bg-muted/30 text-muted-foreground transition-colors" disabled={vendorLocked}>
                          <span className="truncate text-left flex-1 mr-2">{selectedDepositTo ? `${selectedDepositTo.code ? `[${selectedDepositTo.code}] ` : ""}${selectedDepositTo.name}` : "Select account"}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={6} className="z-[220] w-80 p-0 overflow-hidden">
                        <div className="p-2 border-b" onClick={(e) => e.stopPropagation()}>
                          <Input className="h-7 text-xs" placeholder="Search accounts" value={depositToSearch} onChange={(e) => setDepositToSearch(e.target.value)} autoFocus />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {accounts.filter((account) => 
                            account.name.toLowerCase().includes(depositToSearch.toLowerCase()) || 
                            (account.code && account.code.toLowerCase().includes(depositToSearch.toLowerCase()))
                          ).map((account) => (
                            <button key={account._id} type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-muted/50", form.deposit_to_account === account._id && "bg-primary/10 font-medium")}
                              onClick={() => { setForm((prev) => ({ ...prev, deposit_to_account: account._id })); setShowDepositToDD(false); setDepositToSearch(""); }}>
                              {account.code ? `[${account.code}] ` : ""}{account.name}
                            </button>
                          ))}
                          {accounts.filter((account) => 
                            account.name.toLowerCase().includes(depositToSearch.toLowerCase()) || 
                            (account.code && account.code.toLowerCase().includes(depositToSearch.toLowerCase()))
                          ).length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-5 uppercase tracking-wide font-medium">No Results Found</p>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="vendor-dependent space-y-1.5">
                    <Label>Reference#</Label>
                    <Input
                      disabled={vendorLocked}
                      value={form.reference_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, reference_number: e.target.value }))}
                    />
                  </div>
                </div>

                <div className={cn("rounded-md border", vendorLocked && mode === "create" && "pointer-events-none opacity-40")}>
                  <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
                    <span>Apply to Bills</span>
                    {mode === "create" ? (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearApplied}>
                        Clear Applied Amount
                      </Button>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                        <tr>
                          <th className="border-b px-3 py-2 text-left">Date</th>
                          <th className="border-b px-3 py-2 text-left">Bill#</th>
                          <th className="border-b px-3 py-2 text-right">Bill Amount</th>
                          <th className="border-b px-3 py-2 text-right">Amount Due</th>
                          <th className="border-b px-3 py-2 text-right">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mode === "create" ? (
                          openBills.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                                There are no bills for this vendor.
                              </td>
                            </tr>
                          ) : (
                            openBills.map((bill) => {
                              const current = form.billAllocations.find((a) => a.bill_id === bill._id)?.payment || 0;
                              return (
                                <tr key={bill._id}>
                                  <td className="border-b px-3 py-2">{fmtDate(bill.billDate)}</td>
                                  <td className="border-b px-3 py-2">{bill.billNumber}</td>
                                  <td className="border-b px-3 py-2 text-right">{fmtCurrency(bill.total)}</td>
                                  <td className="border-b px-3 py-2 text-right">{fmtCurrency(bill.balanceDue)}</td>
                                  <td className="border-b px-3 py-2 text-right">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={bill.balanceDue}
                                      value={current || ""}
                                      onChange={(e) => updateAllocation(bill._id, Number(e.target.value || 0))}
                                      className="ml-auto h-8 w-28 text-right"
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )
                        ) : (
                          billRowsForEdit.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                                No bill applications for this payment.
                              </td>
                            </tr>
                          ) : (
                            billRowsForEdit.map((row) => (
                              <tr key={row.map._id}>
                                <td className="border-b px-3 py-2">{fmtDate(row.bill?.billDate)}</td>
                                <td className="border-b px-3 py-2">{row.bill?.billNumber || "-"}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.bill?.total || 0)}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.bill?.balanceDue || 0)}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.map.applied_amount)}</td>
                              </tr>
                            ))
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={cn("space-y-1.5", vendorLocked && mode === "create" && "opacity-40")}>
                  <Label>Notes (Internal use. Not visible to vendor)</Label>
                  <Textarea
                    disabled={vendorLocked && mode === "create"}
                    className="min-h-[96px]"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className={cn("space-y-2", vendorLocked && mode === "create" && "opacity-40")}>
                  <Label>Attachments</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm", vendorLocked && mode === "create" ? "cursor-not-allowed bg-slate-100" : "cursor-pointer hover:bg-slate-50")}>
                      <Paperclip className="h-4 w-4" />
                      Upload File
                      <input
                        disabled={vendorLocked && mode === "create"}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadAttachment(file);
                        }}
                      />
                    </label>
                    {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">You can upload a maximum of 5 files, 10MB each.</p>
                  {attachments.length > 0 ? (
                    <div className="space-y-1">
                      {attachments.map((url, idx) => (
                        <div key={url} className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1 text-xs">
                          <span className="truncate">Attachment {idx + 1}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => setAttachments((prev) => prev.filter((u) => u !== url))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className={cn("space-y-4 rounded-lg border bg-[#f5eee5] p-4 text-sm", vendorLocked && mode === "create" && "opacity-70")}>
                <div className="rounded-md border bg-white px-3 py-2">
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="font-semibold">{selectedVendor?.displayName || selectedVendor?.companyName || "-"}</p>
                </div>

                <div className="rounded-md border bg-white px-3 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Contact Details</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-medium">{selectedVendor?.currency || "INR"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Payment Terms</span>
                      <span className="font-medium">{selectedVendor?.paymentTermsId ? "Configured" : "Due on Receipt"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">PAN</span>
                      <span className="font-medium">{selectedVendor?.pan || "-"}</span>
                    </div>
                    <div className="pt-1 text-muted-foreground">
                      {selectedVendor?.billingAddress?.street || ""}
                      {selectedVendor?.billingAddress?.city ? `, ${selectedVendor.billingAddress.city}` : ""}
                      {selectedVendor?.billingAddress?.state ? `, ${selectedVendor.billingAddress.state}` : ""}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span className="font-semibold">{fmtCurrency(appliedTotal)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between">
                      <span>Amount Paid</span>
                      <span>{fmtCurrency(form.total_amount_paid)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Amount used for Payments</span>
                      <span>{fmtCurrency(appliedTotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Amount Refunded</span>
                      <span>{fmtCurrency(0)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between font-semibold text-amber-700">
                      <span>Amount in Excess</span>
                      <span>{fmtCurrency(amountInExcess)}</span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 border-t bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === "create" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void saveCreate("DRAFT")}
                  disabled={saving}
                  className="border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md h-9 px-4"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save as Draft
                </Button>
                <Button
                  onClick={() => void saveCreate("PAID")}
                  disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-9 px-4"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save as Paid
                </Button>
              </>
            ) : (
              <Button
                onClick={() => void saveEdit()}
                disabled={saving}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-9 px-4"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push("/purchases/payments-made")}
              className="border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md h-9 px-4"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
