"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Calendar, Loader2, Paperclip, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { uploadApi } from "@/lib/api/upload";
import { paymentReceivedApi, type PaymentInvoiceMap } from "@/lib/api/payments-received";

type ReceiptEntryMode = "invoice-payment" | "customer-advance";

interface InvoiceAllocation {
  invoice_id: string;
  payment: number;
}

interface FormState {
  receiptType: ReceiptEntryMode;
  customer_id: string;
  payment_number: string;
  total_amount_received: number;
  payment_date: string;
  payment_mode: string;
  deposited_to_account: string;
  reference_number: string;
  notes: string;
  invoiceAllocations: InvoiceAllocation[];
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

function getInvoiceCustomerId(invoice: Invoice): string {
  return typeof invoice.customerId === "string" ? invoice.customerId : invoice.customerId?._id || "";
}

function buildInitialForm(): FormState {
  return {
    receiptType: "invoice-payment",
    customer_id: "",
    payment_number: "",
    total_amount_received: 0,
    payment_date: nowIsoDate(),
    payment_mode: "Cash",
    deposited_to_account: "",
    reference_number: "",
    notes: "",
    invoiceAllocations: [],
  };
}

export function PaymentReceivedEditor({
  mode,
  paymentId,
  initialInvoiceId,
}: {
  mode: "create" | "edit";
  paymentId?: string;
  initialInvoiceId?: string;
}) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(buildInitialForm());
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openInvoices, setOpenInvoices] = useState<Invoice[]>([]);
  const [appliedMaps, setAppliedMaps] = useState<PaymentInvoiceMap[]>([]);

  const [attachments, setAttachments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);

  const PRIORITY_ACCOUNTS = [
    "Petty Cash",
    "Cash",
    "Habib Bank Limited",
    "MCB Bank Limited",
    "Undeposited Funds",
    "Other Current Liability",
    "Accrued expenses",
    "Employee Reimbursements",
    "Opening Balance Adjustments",
    "TDS Payable",
  ];

  const sortedAccounts = useMemo(() => {
    const priority = [...accounts].filter((acc) =>
      PRIORITY_ACCOUNTS.some((p) => acc.name.toLowerCase().includes(p.toLowerCase())),
    );

    // Sort priority accounts based on the order in PRIORITY_ACCOUNTS
    priority.sort((a, b) => {
      const indexA = PRIORITY_ACCOUNTS.findIndex((p) => a.name.toLowerCase().includes(p.toLowerCase()));
      const indexB = PRIORITY_ACCOUNTS.findIndex((p) => b.name.toLowerCase().includes(p.toLowerCase()));
      return indexA - indexB;
    });

    const others = accounts.filter((acc) => !priority.find((p) => p._id === acc._id));
    return { priority, others };
  }, [accounts]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c._id === form.customer_id) || null,
    [customers, form.customer_id],
  );

  useEffect(() => {
    let cancelled = false;
    const search = new URLSearchParams(window.location.search);
    const initialCustomerId = search.get("customerId");

    (async () => {
      setLoading(true);
      try {
        const [customerRes, accountRes] = await Promise.all([
          contactApi.list({ type: "Customer", page: 1, limit: 200 }),
          accountApi.list({ excludeGroups: true }),
        ]);
        if (cancelled) return;
        setCustomers(customerRes.data || []);
        setAccounts(accountRes.data || []);

        if (mode === "create") {
          const nextNum = await paymentReceivedApi.getNextNumber();
          if (cancelled) return;
          setForm((prev) => ({
            ...prev,
            payment_number: nextNum.data.payment_number,
            customer_id: initialCustomerId || prev.customer_id,
          }));

          // Set default "Petty Cash" account
          const pettyCash = accountRes.data.find((acc: Account) =>
            acc.name.toLowerCase().includes("petty cash"),
          );
          if (pettyCash) {
            setForm((prev) => ({ ...prev, deposited_to_account: pettyCash._id }));
          }

          if (initialInvoiceId) {
            const invoiceRes = await invoiceApi.getById(initialInvoiceId);
            if (cancelled) return;
            const linkedInvoice = invoiceRes.data;
            const linkedCustomerId = getInvoiceCustomerId(linkedInvoice);

            if (linkedCustomerId) {
              setForm((prev) => ({
                ...prev,
                receiptType: "invoice-payment",
                customer_id: linkedCustomerId,
                reference_number: prev.reference_number || linkedInvoice.invoiceNumber || "",
                total_amount_received:
                  prev.total_amount_received > 0 ? prev.total_amount_received : Number(linkedInvoice.balanceDue || 0),
              }));
            }
          }
        }

        if (mode === "edit" && paymentId) {
          const paymentRes = await paymentReceivedApi.getOne(paymentId);
          if (cancelled) return;
          const payment = paymentRes.data.payment;
          const maps = paymentRes.data.invoice_applications || [];

          setAppliedMaps(maps);
          setForm({
            receiptType: maps.length > 0 ? "invoice-payment" : "customer-advance",
            customer_id: typeof payment.customer_id === "string" ? payment.customer_id : payment.customer_id._id,
            payment_number: payment.payment_number,
            total_amount_received: payment.total_amount_received,
            payment_date: new Date(payment.payment_date).toISOString().split("T")[0],
            payment_mode: payment.payment_mode,
            deposited_to_account: payment.deposited_to_account || "",
            reference_number: payment.reference_number || "",
            notes: payment.notes || "",
            invoiceAllocations: maps
              .filter((m) => typeof m.invoice_id === "object")
              .map((m) => ({
                invoice_id: typeof m.invoice_id === "object" ? m.invoice_id._id : "",
                payment: m.applied_amount,
              })),
          });
        }
      } catch (e: any) {
        toast.error(e?.message || `Failed to load receipt ${mode} data`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, paymentId, initialInvoiceId]);

  useEffect(() => {
    if (mode !== "create" || !form.customer_id || form.receiptType !== "invoice-payment") {
      if (mode === "create") {
        setOpenInvoices([]);
      }
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await invoiceApi.list({ page: 1, limit: 200, status: "All" });
        if (cancelled) return;

        const invoices = (res.data || []).filter((inv) => {
          const customerId = getInvoiceCustomerId(inv);
          if (customerId !== form.customer_id) return false;
          return !["Paid", "Void"].includes(inv.status);
        });

        setOpenInvoices(invoices);
        setForm((prev) => ({
          ...prev,
          invoiceAllocations: invoices.map((inv) => ({
            invoice_id: inv._id,
            payment: initialInvoiceId && inv._id === initialInvoiceId ? Number(inv.balanceDue || 0) : 0,
          })),
          total_amount_received:
            initialInvoiceId && prev.total_amount_received <= 0
              ? Number(invoices.find((inv) => inv._id === initialInvoiceId)?.balanceDue || 0)
              : prev.total_amount_received,
        }));
      } catch {
        if (cancelled) return;
        setOpenInvoices([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, form.customer_id, form.receiptType, initialInvoiceId]);

  const customerLocked = mode === "create" ? !form.customer_id : true;

  const appliedTotal = useMemo(() => {
    if (mode === "edit") {
      return appliedMaps.reduce((sum, row) => sum + (row.applied_amount || 0), 0);
    }
    return form.invoiceAllocations.reduce((sum, row) => sum + (Number.isFinite(row.payment) ? row.payment : 0), 0);
  }, [mode, form.invoiceAllocations, appliedMaps]);

  const amountInExcess = useMemo(() => {
    return Math.max(0, Number(form.total_amount_received || 0) - appliedTotal);
  }, [form.total_amount_received, appliedTotal]);

  async function uploadAttachment(file: File) {
    setUploadingAttachment(true);
    try {
      const uploaded = await uploadApi.upload(file, "payments-received");
      setAttachments((prev) => [...prev, uploaded.url]);
    } catch {
      toast.error("Attachment upload failed");
    } finally {
      setUploadingAttachment(false);
    }
  }

  function updateAllocation(invoiceId: string, value: number) {
    setForm((prev) => ({
      ...prev,
      invoiceAllocations: prev.invoiceAllocations.map((row) =>
        row.invoice_id === invoiceId ? { ...row, payment: Math.max(0, value) } : row,
      ),
    }));
  }

  function clearApplied() {
    setForm((prev) => ({
      ...prev,
      invoiceAllocations: prev.invoiceAllocations.map((row) => ({ ...row, payment: 0 })),
    }));
  }

  async function saveCreate(status: "DRAFT" | "PAID") {
    if (!form.customer_id) {
      toast.error("Customer is required");
      return;
    }
    if (!form.payment_number.trim()) {
      toast.error("Receipt number is required");
      return;
    }
    if (!form.payment_date) {
      toast.error("Receipt date is required");
      return;
    }
    if (form.total_amount_received <= 0) {
      toast.error("Receipt amount must be greater than zero");
      return;
    }

    const selectedApps = form.invoiceAllocations
      .filter((a) => a.payment > 0)
      .map((a) => ({ invoice_id: a.invoice_id, applied_amount: Number(a.payment) }));

    if (form.receiptType === "invoice-payment" && status === "PAID" && selectedApps.length === 0) {
      toast.error("Add invoice allocation or switch to Customer Advance");
      return;
    }

    setSaving(true);
    try {
      const payloadNotes = [form.notes.trim(), attachments.length ? `Attachments: ${attachments.join(", ")}` : ""]
        .filter(Boolean)
        .join("\n\n");

      await paymentReceivedApi.create({
        customer_id: form.customer_id,
        payment_number: form.payment_number,
        payment_date: form.payment_date,
        payment_mode: form.payment_mode,
        deposited_to_account: form.deposited_to_account || null,
        reference_number: form.reference_number,
        notes: payloadNotes,
        status,
        total_amount_received: Number(form.total_amount_received),
        invoice_applications: form.receiptType === "invoice-payment" ? selectedApps : [],
      });

      toast.success(status === "PAID" ? "Receipt saved" : "Receipt saved as draft");
      router.push("/sales/payments-received");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save receipt");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!paymentId) return;
    setSaving(true);
    try {
      await paymentReceivedApi.update(paymentId, {
        payment_date: form.payment_date,
        payment_mode: form.payment_mode,
        deposited_to_account: form.deposited_to_account || null,
        reference_number: form.reference_number,
        notes: [form.notes.trim(), attachments.length ? `Attachments: ${attachments.join(", ")}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      });
      toast.success("Receipt updated");
      router.push("/sales/payments-received");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update receipt");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  const invoiceRowsForEdit = appliedMaps
    .map((m) => ({ map: m, invoice: typeof m.invoice_id === "object" ? m.invoice_id : null }))
    .filter((x) => x.invoice);

  return (
    <div className="h-full overflow-auto bg-slate-50 p-3 sm:p-6">
      <div className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{mode === "create" ? "New Payment Received" : `Edit Receipt #${form.payment_number}`}</p>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/sales/payments-received")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs
          value={form.receiptType}
          onValueChange={(v) => mode === "create" && setForm((p) => ({ ...p, receiptType: v as ReceiptEntryMode }))}
          className="rounded-none"
        >
          <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3 py-2">
            <TabsTrigger value="invoice-payment" className="px-3 text-sm" disabled={mode === "edit"}>Invoice Payment</TabsTrigger>
            <TabsTrigger value="customer-advance" className="px-3 text-sm" disabled={mode === "edit"}>Customer Advance</TabsTrigger>
          </TabsList>

          <TabsContent value={form.receiptType} className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div className={cn("rounded-md border bg-emerald-50 px-3 py-2 text-sm text-emerald-900", customerLocked && "opacity-70")}>
                  Receive and allocate customer collections directly against open invoices.
                </div>

                <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", customerLocked && "[&_.customer-dependent]:opacity-40")}>
                  <div className="space-y-1.5">
                    <Label>Customer Name*</Label>
                    <Select
                      disabled={mode === "edit"}
                      value={form.customer_id}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, customer_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.displayName || c.companyName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="customer-dependent space-y-1.5">
                    <Label>Receipt #*</Label>
                    <Input disabled value={form.payment_number} onChange={(e) => setForm((prev) => ({ ...prev, payment_number: e.target.value }))} />
                  </div>

                  <div className="customer-dependent space-y-1.5">
                    <Label>Amount Received*</Label>
                    <Input
                      disabled={customerLocked || mode === "edit"}
                      type="number"
                      min={0}
                      value={form.total_amount_received || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, total_amount_received: Number(e.target.value || 0) }))}
                      placeholder="INR"
                    />
                  </div>

                  <div className="customer-dependent space-y-1.5">
                    <Label>Receipt Date*</Label>
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        disabled={customerLocked}
                        type="date"
                        className="pl-9"
                        value={form.payment_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, payment_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="customer-dependent space-y-1.5">
                    <Label>Payment Mode</Label>
                    <Select
                      disabled={customerLocked}
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

                  <div className="customer-dependent space-y-1.5">
                    <Label>Deposited To*</Label>
                    <Popover open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={accountSearchOpen}
                          className="w-full justify-between font-normal"
                          disabled={customerLocked}
                        >
                          {form.deposited_to_account
                            ? (() => {
                                const acc = accounts.find((a) => a._id === form.deposited_to_account);
                                if (!acc) return "Select account...";
                                return acc.code ? `[ ${acc.code} ] ${acc.name}` : acc.name;
                              })()
                            : "Select account..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search account..." />
                          <CommandList>
                            <CommandEmpty>No account found.</CommandEmpty>
                            <CommandGroup heading="Priority Accounts">
                              {sortedAccounts.priority.map((acc) => (
                                <CommandItem
                                  key={acc._id}
                                  value={acc.name}
                                  onSelect={() => {
                                    setForm((prev) => ({ ...prev, deposited_to_account: acc._id }));
                                    setAccountSearchOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      form.deposited_to_account === acc._id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  {acc.code ? `[ ${acc.code} ] ${acc.name}` : acc.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            {sortedAccounts.others.length > 0 && (
                              <CommandGroup heading="Other Accounts">
                                {sortedAccounts.others.map((acc) => (
                                  <CommandItem
                                    key={acc._id}
                                    value={acc.name}
                                    onSelect={() => {
                                      setForm((prev) => ({ ...prev, deposited_to_account: acc._id }));
                                      setAccountSearchOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        form.deposited_to_account === acc._id ? "opacity-100" : "opacity-0",
                                      )}
                                    />
                                    {acc.code ? `[ ${acc.code} ] ${acc.name}` : acc.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="customer-dependent space-y-1.5">
                    <Label>Reference#</Label>
                    <Input
                      disabled={customerLocked}
                      value={form.reference_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, reference_number: e.target.value }))}
                    />
                  </div>
                </div>

                <div className={cn("rounded-md border", customerLocked && mode === "create" && "pointer-events-none opacity-40")}>
                  <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
                    <span>Apply to Invoices</span>
                    {mode === "create" ? (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs text-teal-600 hover:text-teal-700" onClick={clearApplied}>
                        Clear Applied Amount
                      </Button>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                        <tr>
                          <th className="border-b px-3 py-2 text-left">Date</th>
                          <th className="border-b px-3 py-2 text-left">Invoice#</th>
                          <th className="border-b px-3 py-2 text-right">Invoice Amount</th>
                          <th className="border-b px-3 py-2 text-right">Amount Due</th>
                          <th className="border-b px-3 py-2 text-right">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mode === "create" ? (
                          openInvoices.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                                There are no open invoices for this customer.
                              </td>
                            </tr>
                          ) : (
                            openInvoices.map((invoice) => {
                              const current = form.invoiceAllocations.find((a) => a.invoice_id === invoice._id)?.payment || 0;
                              return (
                                <tr key={invoice._id}>
                                  <td className="border-b px-3 py-2">{fmtDate(invoice.invoiceDate)}</td>
                                  <td className="border-b px-3 py-2">{invoice.invoiceNumber}</td>
                                  <td className="border-b px-3 py-2 text-right">{fmtCurrency(invoice.total)}</td>
                                  <td className="border-b px-3 py-2 text-right">{fmtCurrency(invoice.balanceDue)}</td>
                                  <td className="border-b px-3 py-2 text-right">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={invoice.balanceDue}
                                      value={current || ""}
                                      onChange={(e) => updateAllocation(invoice._id, Number(e.target.value || 0))}
                                      className="ml-auto h-8 w-28 text-right"
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )
                        ) : (
                          invoiceRowsForEdit.length === 0 ? (
                            <tr>
                              <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                                No invoice applications for this receipt.
                              </td>
                            </tr>
                          ) : (
                            invoiceRowsForEdit.map((row) => (
                              <tr key={row.map._id}>
                                <td className="border-b px-3 py-2">{fmtDate(row.invoice?.invoiceDate)}</td>
                                <td className="border-b px-3 py-2">{row.invoice?.invoiceNumber || "-"}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.invoice?.total || 0)}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.invoice?.balanceDue || 0)}</td>
                                <td className="border-b px-3 py-2 text-right">{fmtCurrency(row.map.applied_amount)}</td>
                              </tr>
                            ))
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={cn("space-y-1.5", customerLocked && mode === "create" && "opacity-40")}>
                  <Label>Notes (Internal use. Not visible to customer)</Label>
                  <Textarea
                    disabled={customerLocked && mode === "create"}
                    className="min-h-[96px]"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                <div className={cn("space-y-2", customerLocked && mode === "create" && "opacity-40")}>
                  <Label>Attachments</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm", customerLocked && mode === "create" ? "cursor-not-allowed bg-slate-100" : "cursor-pointer hover:bg-slate-50")}>
                      <Paperclip className="h-4 w-4" />
                      Upload File
                      <input
                        disabled={customerLocked && mode === "create"}
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

              <aside className={cn("space-y-4 rounded-lg border bg-[#ecfdf3] p-4 text-sm", customerLocked && mode === "create" && "opacity-70")}>
                <div className="rounded-md border bg-white px-3 py-2">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-semibold">{selectedCustomer?.displayName || selectedCustomer?.companyName || "-"}</p>
                </div>

                <div className="rounded-md border bg-white px-3 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Contact Details</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-medium">{selectedCustomer?.currency || "INR"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Payment Terms</span>
                      <span className="font-medium">{selectedCustomer?.paymentTermsId ? "Configured" : "Due on Receipt"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">GSTIN</span>
                      <span className="font-medium">{selectedCustomer?.gstin || "-"}</span>
                    </div>
                    <div className="pt-1 text-muted-foreground">
                      {selectedCustomer?.billingAddress?.street || ""}
                      {selectedCustomer?.billingAddress?.city ? `, ${selectedCustomer.billingAddress.city}` : ""}
                      {selectedCustomer?.billingAddress?.state ? `, ${selectedCustomer.billingAddress.state}` : ""}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Total Allocated</span>
                    <span className="font-semibold">{fmtCurrency(appliedTotal)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex items-center justify-between">
                      <span>Amount Received</span>
                      <span>{fmtCurrency(form.total_amount_received)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Amount used for Invoices</span>
                      <span>{fmtCurrency(appliedTotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span>Amount Refunded</span>
                      <span>{fmtCurrency(0)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between font-semibold text-emerald-700">
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
                <Button variant="outline" onClick={() => void saveCreate("DRAFT")} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save as Draft
                </Button>
                <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void saveCreate("PAID")} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
                  Save as Paid
                </Button>
              </>
            ) : (
              <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void saveEdit()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
                Save Changes
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.push("/sales/payments-received")}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
