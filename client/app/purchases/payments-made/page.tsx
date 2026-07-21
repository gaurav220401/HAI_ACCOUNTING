"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { DraggableText } from "@/components/ui/draggable-text";
import { billApi, type Bill } from "@/lib/api/bills";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { uploadApi } from "@/lib/api/upload";
import { paymentMadeApi, type PaymentBillMap, type PaymentMade } from "@/lib/api/payments-made";

type PaymentEntryMode = "bill-payment" | "vendor-advance" | "vendor-payable";

interface BillAllocation {
  bill_id: string;
  payment: number;
}

interface CreateFormState {
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

function vendorName(vendor: PaymentMade["vendor_id"] | Contact | null | undefined): string {
  if (!vendor) return "-";
  if (typeof vendor === "string") return vendor;
  return vendor.displayName || vendor.companyName || "-";
}

function buildInitialForm(): CreateFormState {
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

function TableSkeleton() {
  return (
    <div className="flex-1 overflow-auto animate-pulse bg-white">
      <div className="grid grid-cols-9 gap-4 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-32 bg-slate-200 rounded" />
        <div className="h-3 w-12 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-12 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
        <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
      </div>
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="grid grid-cols-9 gap-4 items-center px-4 py-3.5 border-b border-slate-100">
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-32 bg-slate-100 rounded" />
          <div className="h-3.5 w-12 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-12 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded ml-auto" />
          <div className="h-3.5 w-16 bg-slate-100 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100 bg-white">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="px-4 py-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-3.5 w-16 bg-slate-200 rounded animate-none font-semibold text-slate-300" />
          </div>
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-3.5 w-12 bg-slate-150 rounded" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse p-6 bg-white space-y-6 h-full">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-200 rounded" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
        </div>
        <div className="h-12 w-32 bg-slate-200 rounded" />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-[140px_1fr] items-center gap-4">
          <div className="h-3.5 w-20 bg-slate-100 rounded" />
          <div className="h-3.5 w-36 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-[140px_1fr] items-center gap-4">
          <div className="h-3.5 w-20 bg-slate-100 rounded" />
          <div className="h-3.5 w-28 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-[140px_1fr] items-center gap-4">
          <div className="h-3.5 w-20 bg-slate-100 rounded" />
          <div className="h-3.5 w-40 bg-slate-200 rounded" />
        </div>
      </div>
      <div className="space-y-2 pt-4">
        <div className="h-4 w-28 bg-slate-200 rounded" />
        <div className="h-20 bg-slate-50 border border-slate-100 rounded-md" />
      </div>
    </div>
  );
}

export default function PaymentsMadePage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [search, setSearch] = useState("");

  const [payments, setPayments] = useState<PaymentMade[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMade | null>(null);
  const [selectedPaymentMaps, setSelectedPaymentMaps] = useState<PaymentBillMap[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateFormState>(buildInitialForm());

  const [vendors, setVendors] = useState<Contact[]>([]);
  const [openBills, setOpenBills] = useState<Bill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  function beginCreate() {
    setSelectedPaymentId(null);
    setSelectedPayment(null);
    setSelectedPaymentMaps([]);
    setForm(buildInitialForm());
    setAttachments([]);
    setCreateOpen(true);
  }

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && activeOrganization?._id) {
      void loadPayments();
    }
  }, [firebaseUser, activeOrganization?._id]);

  useEffect(() => {
    if (!createOpen) return;
    void loadFormMeta();
  }, [createOpen]);

  useEffect(() => {
    if (!createOpen || !form.vendor_id || form.paymentType !== "bill-payment") {
      setOpenBills([]);
      setForm((prev) => ({ ...prev, billAllocations: [] }));
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
          billAllocations: bills.map((b) => ({ bill_id: b._id, payment: 0 })),
        }));
      } catch {
        if (cancelled) return;
        setOpenBills([]);
        setForm((prev) => ({ ...prev, billAllocations: [] }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createOpen, form.vendor_id, form.paymentType]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => {
      const vendor = vendorName(p.vendor_id).toLowerCase();
      return (
        p.payment_number.toLowerCase().includes(q) ||
        (p.reference_number || "").toLowerCase().includes(q) ||
        vendor.includes(q) ||
        p.payment_mode.toLowerCase().includes(q)
      );
    });
  }, [payments, search]);

  const appliedTotal = useMemo(() => {
    return form.billAllocations.reduce((sum, row) => sum + (Number.isFinite(row.payment) ? row.payment : 0), 0);
  }, [form.billAllocations]);

  const amountInExcess = useMemo(() => {
    return Math.max(0, Number(form.total_amount_paid || 0) - appliedTotal);
  }, [form.total_amount_paid, appliedTotal]);

  async function loadPayments() {
    setIsLoading(true);
    try {
      const res = await paymentMadeApi.list({ page: 1, limit: 200, sortBy: "payment_date", sortOrder: "desc" });
      const rows = res.data || [];
      setPayments(rows);

      if (rows.length > 0) {
        const keep = selectedPaymentId && rows.some((r) => r._id === selectedPaymentId);
        if (keep) {
          void loadPaymentDetails(selectedPaymentId!);
        } else {
          setSelectedPaymentId(null);
          setSelectedPayment(null);
          setSelectedPaymentMaps([]);
        }
      } else {
        setSelectedPaymentId(null);
        setSelectedPayment(null);
        setSelectedPaymentMaps([]);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payments made");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPaymentDetails(paymentId: string) {
    setIsLoadingDetails(true);
    try {
      const res = await paymentMadeApi.getOne(paymentId);
      setSelectedPayment(res.data.payment);
      setSelectedPaymentMaps(res.data.bill_applications || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load payment details");
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function loadFormMeta() {
    try {
      const [nextNum, vendorRes, accountRes] = await Promise.all([
        paymentMadeApi.getNextNumber(),
        contactApi.list({ type: "Vendor", page: 1, limit: 200 }),
        accountApi.list({ excludeGroups: true }),
      ]);

      setVendors(vendorRes.data || []);
      setAccounts(accountRes.data || []);
      setForm((prev) => ({ ...prev, payment_number: nextNum.data.payment_number }));
    } catch {
      toast.error("Failed to load payment form data");
    }
  }

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

  async function handleCreate(status: "DRAFT" | "PAID") {
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
      toast.error("Add at least one bill payment or switch to Vendor Advance");
      return;
    }

    setSubmitting(true);
    try {
      const payloadNotes = [form.notes.trim(), attachments.length ? `Attachments: ${attachments.join(", ")}` : ""]
        .filter(Boolean)
        .join("\n\n");

      const res = await paymentMadeApi.create({
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
      setCreateOpen(false);
      setForm(buildInitialForm());
      setAttachments([]);
      await loadPayments();
      setSelectedPaymentId(res.data._id);
      await loadPaymentDetails(res.data._id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save payment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoid() {
    if (!selectedPayment) return;
    if (!voidReason.trim()) {
      toast.error("Void reason is required");
      return;
    }

    try {
      await paymentMadeApi.void(selectedPayment._id, voidReason.trim());
      toast.success("Payment voided");
      setVoidOpen(false);
      setVoidReason("");
      await loadPayments();
      await loadPaymentDetails(selectedPayment._id);
    } catch (e: any) {
      toast.error(e?.message || "Failed to void payment");
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

  const selectedVendor = useMemo(
    () => vendors.find((v) => v._id === form.vendor_id) || null,
    [vendors, form.vendor_id],
  );

  const totalUnusedAmount = selectedPayment
    ? Math.max(0, selectedPayment.amount_in_excess)
    : 0;

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">Payments Made</span>
            </div>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder="Search payments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadPayments()}>
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-8 px-3"
                onClick={() => router.push("/purchases/payments-made/new")}
              >
                <Plus className="mr-1 h-4 w-4" /> New
              </Button>
            </>
          }
        />

        <div className="flex h-[calc(100svh-56px)] overflow-hidden">
          <section className={cn("border-r bg-white", selectedPaymentId ? "w-[320px]" : "w-full")}>
            <div className="flex h-11 items-center justify-between border-b px-3">
              <button className="flex items-center gap-1 text-sm font-semibold">
                All Payments <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-xs text-muted-foreground">{filteredPayments.length}</span>
            </div>

            <div className="h-[calc(100%-44px)] overflow-auto">
              {isLoading ? (
                selectedPaymentId ? <ListSkeleton /> : <TableSkeleton />
              ) : filteredPayments.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No payments found.
                </div>
              ) : !selectedPaymentId ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b bg-slate-50 text-[11px] uppercase text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Payment #</th>
                        <th className="px-3 py-2 text-left">Reference#</th>
                        <th className="px-3 py-2 text-left">Vendor Name</th>
                        <th className="px-3 py-2 text-left">Bill#</th>
                        <th className="px-3 py-2 text-left">Mode</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Unused Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((payment) => (
                        <tr
                          key={payment._id}
                          className="cursor-pointer border-b hover:bg-teal-50/30 transition-colors"
                          onClick={() => {
                            setSelectedPaymentId(payment._id);
                            void loadPaymentDetails(payment._id);
                          }}
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(payment.payment_date)}</td>
                          <td className="px-3 py-2 text-teal-700 hover:text-teal-800 hover:underline font-semibold max-w-[120px] overflow-hidden">
                            <DraggableText alwaysActive className="block truncate">{payment.payment_number}</DraggableText>
                          </td>
                          <td className="px-3 py-2">{payment.reference_number || "-"}</td>
                          <td className="px-3 py-2 font-medium text-slate-700 max-w-[160px] overflow-hidden">
                            <DraggableText alwaysActive className="block truncate">{vendorName(payment.vendor_id)}</DraggableText>
                          </td>
                          <td className="px-3 py-2">-</td>
                          <td className="px-3 py-2 text-slate-600">{payment.payment_mode}</td>
                          <td className="px-3 py-2">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                              payment.status === "PAID" && "bg-emerald-50 text-emerald-700 border-emerald-100",
                              payment.status === "VOID" && "bg-slate-100 text-slate-500 border-slate-200",
                              payment.status === "DRAFT" && "bg-amber-50 text-amber-700 border-amber-100"
                            )}>
                              <span className={cn(
                                "h-1 w-1 rounded-full",
                                payment.status === "PAID" && "bg-emerald-500",
                                payment.status === "VOID" && "bg-slate-400",
                                payment.status === "DRAFT" && "bg-amber-500"
                              )} />
                              {payment.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtCurrency(payment.total_amount_paid)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmtCurrency(payment.amount_in_excess)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                filteredPayments.map((payment) => {
                  const isActive = selectedPaymentId === payment._id;
                  return (
                    <button
                      key={payment._id}
                      className={cn(
                        "w-full border-b px-4 py-3 text-left transition-colors",
                        isActive ? "bg-teal-50/50 border-l-[3px] border-l-teal-600" : "hover:bg-slate-100/70",
                      )}
                      onClick={() => {
                        setSelectedPaymentId(payment._id);
                        void loadPaymentDetails(payment._id);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{vendorName(payment.vendor_id)}</p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{fmtCurrency(payment.total_amount_paid)}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{fmtDate(payment.payment_date)}</span>
                        <span>•</span>
                        <span>{payment.payment_mode}</span>
                      </div>
                      <div className="mt-1">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                          payment.status === "PAID" && "bg-emerald-50 text-emerald-700 border-emerald-100",
                          payment.status === "VOID" && "bg-slate-100 text-slate-500 border-slate-200",
                          payment.status === "DRAFT" && "bg-amber-50 text-amber-700 border-amber-100"
                        )}>
                          <span className={cn(
                            "h-1 w-1 rounded-full",
                            payment.status === "PAID" && "bg-emerald-500",
                            payment.status === "VOID" && "bg-slate-400",
                            payment.status === "DRAFT" && "bg-amber-500"
                          )} />
                          {payment.status}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="flex-1 overflow-auto bg-slate-50">
            {!selectedPaymentId ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-500">
                Select a payment to view details.
              </div>
            ) : isLoadingDetails || !selectedPayment ? (
              <DetailSkeleton />
            ) : (
              <div className="mx-auto max-w-[1040px] p-3 sm:p-6 bg-white shadow-xs rounded-lg mt-4 border border-slate-100">
                <div className="mb-3 flex items-center justify-between rounded-md border bg-slate-50/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs hover:bg-slate-200/50"
                      onClick={() => router.push(`/purchases/payments-made/${selectedPayment._id}/edit`)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs hover:bg-slate-200/50" onClick={() => window.print()}>
                      <Printer className="mr-1 h-3.5 w-3.5" /> PDF/Print
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 px-0 hover:bg-slate-200/50">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuItem onClick={() => document.getElementById("payment-journal")?.scrollIntoView({ behavior: "smooth" })}>
                          View Journal
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setVoidOpen(true)} disabled={selectedPayment.status === "VOID"}>
                          Void
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" disabled>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Payment #{selectedPayment.payment_number}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    onClick={() => {
                      setSelectedPaymentId(null);
                      setSelectedPayment(null);
                      setSelectedPaymentMaps([]);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Close
                  </Button>
                </div>

                <div className="rounded-lg border bg-white p-6 shadow-2xs statement-print-area">
                  <div className="mb-6 flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row">
                    <div className="flex items-start gap-4">
                      {activeOrganization?.logo ? (
                        <img
                          src={activeOrganization.logo}
                          alt={activeOrganization.name}
                          className="h-14 w-14 rounded object-contain"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded bg-teal-50 text-teal-700 border border-teal-100">
                          <FileText className="h-7 w-7" />
                        </div>
                      )}
                      <div>
                        <p className="text-2xl font-semibold">{activeOrganization?.name || "Organization"}</p>
                        <p className="text-sm text-muted-foreground">{activeOrganization?.address?.city || ""}</p>
                        <p className="text-sm text-muted-foreground">{activeOrganization?.country || ""}</p>
                      </div>
                    </div>
                    <div className="rounded-md bg-teal-700 px-6 py-4 text-center text-white">
                      <p className="text-xs uppercase tracking-wide">Amount Paid</p>
                      <p className="text-2xl font-bold">{fmtCurrency(selectedPayment.total_amount_paid)}</p>
                    </div>
                  </div>

                  <h2 className="mb-4 text-center text-xl font-semibold tracking-wide text-slate-800">PAYMENTS MADE</h2>

                  <div className="grid gap-3 border-b pb-6 text-sm sm:grid-cols-[220px_1fr]">
                    <p className="text-muted-foreground">Payment#</p>
                    <p className="font-semibold text-slate-900">{selectedPayment.payment_number}</p>

                    <p className="text-muted-foreground">Payment Date</p>
                    <p className="font-semibold text-slate-900">{fmtDate(selectedPayment.payment_date)}</p>

                    <p className="text-muted-foreground">Reference Number</p>
                    <p className="font-semibold text-slate-900">{selectedPayment.reference_number || "-"}</p>

                    <p className="text-muted-foreground">Paid To</p>
                    <p className="font-semibold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer">{vendorName(selectedPayment.vendor_id)}</p>

                    <p className="text-muted-foreground">Payment Mode</p>
                    <p className="font-semibold">{selectedPayment.payment_mode}</p>

                    <p className="text-muted-foreground">Amount in Excess</p>
                    <p className="font-semibold">{fmtCurrency(totalUnusedAmount)}</p>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 text-base font-semibold">Payment for</div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border text-sm">
                        <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                          <tr>
                            <th className="border px-3 py-2 text-left">Bill Number</th>
                            <th className="border px-3 py-2 text-left">Bill Date</th>
                            <th className="border px-3 py-2 text-right">Bill Amount</th>
                            <th className="border px-3 py-2 text-right">Payment Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPaymentMaps.length === 0 ? (
                            <tr>
                              <td className="border px-3 py-5 text-center text-muted-foreground" colSpan={4}>
                                No bill applied. This payment is recorded as vendor advance.
                              </td>
                            </tr>
                          ) : (
                            selectedPaymentMaps.map((map) => {
                              const bill = typeof map.bill_id === "object" ? map.bill_id : null;
                              return (
                                <tr key={map._id}>
                                  <td className="border px-3 py-2">{bill?.billNumber || "-"}</td>
                                  <td className="border px-3 py-2">{fmtDate(bill?.billDate || null)}</td>
                                  <td className="border px-3 py-2 text-right">{fmtCurrency(bill?.total || 0)}</td>
                                  <td className="border px-3 py-2 text-right font-semibold">{fmtCurrency(map.applied_amount)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div id="payment-journal" className="mt-8 border-t pt-6">
                    <p className="mb-1 text-sm text-muted-foreground">Amount is displayed in your base currency INR</p>
                    <h3 className="mb-4 text-xl font-semibold">Journal</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b text-xs uppercase text-muted-foreground">
                            <th className="px-2 py-2 text-left">Account</th>
                            <th className="px-2 py-2 text-right">Debit</th>
                            <th className="px-2 py-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="px-2 py-2">
                              {selectedPayment.payment_type === "vendor-advance"
                                ? "Advances to Suppliers"
                                : "Accounts Payable"}
                            </td>
                            <td className="px-2 py-2 text-right">{fmtCurrency(selectedPayment.total_amount_paid)}</td>
                            <td className="px-2 py-2 text-right">{fmtCurrency(0)}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="px-2 py-2">{selectedPayment.payment_mode}</td>
                            <td className="px-2 py-2 text-right">{fmtCurrency(0)}</td>
                            <td className="px-2 py-2 text-right">{fmtCurrency(selectedPayment.total_amount_paid)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <AlertDialog open={voidOpen} onOpenChange={setVoidOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Void Payment</AlertDialogTitle>
              <AlertDialogDescription>
                This will reverse all bill applications and mark the payment as VOID.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason for voiding"
              className="min-h-20"
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleVoid()}>
                Void Payment
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}

function FormBody({
  form,
  setForm,
  vendors,
  selectedVendor,
  accounts,
  openBills,
  appliedTotal,
  amountInExcess,
  updateAllocation,
  clearApplied,
  attachments,
  setAttachments,
  uploadAttachment,
  uploadingAttachment,
  showBills,
}: {
  form: CreateFormState;
  setForm: Dispatch<SetStateAction<CreateFormState>>;
  vendors: Contact[];
  selectedVendor: Contact | null;
  accounts: Account[];
  openBills: Bill[];
  appliedTotal: number;
  amountInExcess: number;
  updateAllocation: (billId: string, value: number) => void;
  clearApplied: () => void;
  attachments: string[];
  setAttachments: Dispatch<SetStateAction<string[]>>;
  uploadAttachment: (file: File) => Promise<void>;
  uploadingAttachment: boolean;
  showBills: boolean;
}) {
  const vendorLocked = !form.vendor_id;

  return (
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
              disabled={vendorLocked}
              value={form.payment_number}
              onChange={(e) => setForm((prev) => ({ ...prev, payment_number: e.target.value }))}
            />
          </div>

          <div className="vendor-dependent space-y-1.5">
            <Label>Payment Made*</Label>
            <Input
              disabled={vendorLocked}
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
                {PAYMENT_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="vendor-dependent space-y-1.5">
            <Label>Paid Through*</Label>
            <Select
              disabled={vendorLocked}
              value={form.paid_through_account}
              onValueChange={(v) => setForm((prev) => ({ ...prev, paid_through_account: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="vendor-dependent space-y-1.5">
            <Label>Deposit To</Label>
            <Select
              disabled={vendorLocked}
              value={form.deposit_to_account}
              onValueChange={(v) => setForm((prev) => ({ ...prev, deposit_to_account: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {showBills ? (
          <div className={cn("rounded-md border", vendorLocked && "pointer-events-none opacity-40")}>
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
              <span>Apply to Bills</span>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearApplied}>
                Clear Applied Amount
              </Button>
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
                  {openBills.length === 0 ? (
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
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-amber-50/40 p-4 text-sm text-amber-900">
            {form.paymentType === "vendor-payable"
              ? "Direct payable payment posts the full amount directly to decrease the vendor's accounts payable balance."
              : "Vendor advance mode keeps the full amount in excess until bills are applied later."}
          </div>
        )}

        <div className={cn("space-y-1.5", vendorLocked && "opacity-40")}>
          <Label>Notes (Internal use. Not visible to vendor)</Label>
          <Textarea
            disabled={vendorLocked}
            className="min-h-[96px]"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>

        <div className={cn("space-y-2", vendorLocked && "opacity-40")}>
          <Label>Attachments</Label>
          <div className="flex flex-wrap items-center gap-2">
            <label className={cn("inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm", vendorLocked ? "cursor-not-allowed bg-slate-100" : "cursor-pointer hover:bg-slate-50")}>
              <Paperclip className="h-4 w-4" />
              Upload File
              <input
                disabled={vendorLocked}
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

      <aside className={cn("space-y-4 rounded-lg border bg-[#f5eee5] p-4 text-sm", vendorLocked && "opacity-70")}>
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
  );
}
