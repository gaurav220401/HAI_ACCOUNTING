"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import {
  retainerInvoiceApi,
  type RetainerInvoice,
  type RetainerInvoiceApplication,
  type RetainerInvoiceStatus,
} from "@/lib/api/retainer-invoices";

const STATUS_STYLES: Record<RetainerInvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Sent: "bg-blue-50 text-blue-700 border-blue-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Paid: "bg-green-50 text-green-700 border-green-200",
  "Partially Applied": "bg-cyan-50 text-cyan-700 border-cyan-200",
  Applied: "bg-teal-50 text-teal-700 border-teal-200",
  "Partially Refunded": "bg-orange-50 text-orange-700 border-orange-200",
  Refunded: "bg-purple-50 text-purple-700 border-purple-200",
  Void: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function asId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return "";
}

function customerName(customer: RetainerInvoice["customer_id"]) {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function appInvoiceId(app: RetainerInvoiceApplication): string {
  if (typeof app.invoice_id === "string") return app.invoice_id;
  return app.invoice_id?._id || "";
}

function appInvoiceLabel(app: RetainerInvoiceApplication): string {
  if (typeof app.invoice_id === "string") return app.invoice_id;
  return app.invoice_id?.invoiceNumber || app.invoice_id?._id || "-";
}

export default function RetainerInvoiceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const retainerId = String(params?.id || "");

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [retainer, setRetainer] = useState<RetainerInvoice | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [working, setWorking] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(isoToday());
  const [paymentMode, setPaymentMode] = useState("Cash");

  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");

  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState(isoToday());

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchData = useCallback(async () => {
    if (!retainerId) return;

    setFetching(true);
    try {
      const retainerRes = await retainerInvoiceApi.getOne(retainerId);
      const retainerData = retainerRes.data;
      setRetainer(retainerData);
      setPaymentMode(retainerData.payment_mode || "Cash");

      const customerId = asId(retainerData.customer_id);
      if (customerId) {
        const invoiceRes = await invoiceApi.list({
          page: 1,
          limit: 200,
          customerId,
          status: "All",
        });

        const applicable = (invoiceRes.data || []).filter(
          (invoice) => invoice.status !== "Void" && Number(invoice.balanceDue || 0) > 0,
        );
        setInvoices(applicable);
      } else {
        setInvoices([]);
      }
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Failed to load retainer invoice"));
    } finally {
      setFetching(false);
    }
  }, [retainerId]);

  useEffect(() => {
    if (firebaseUser && !loading && retainerId) {
      void fetchData();
    }
  }, [firebaseUser, loading, retainerId, fetchData]);

  useEffect(() => {
    if (!retainer) return;

    setPaymentAmount(retainer.balance_due > 0 ? String(retainer.balance_due) : "");
    setRefundAmount(retainer.amount_unapplied > 0 ? String(retainer.amount_unapplied) : "");
  }, [retainer]);

  const availableInvoices = useMemo(() => {
    const appliedInvoiceIds = new Set((retainer?.applications || []).map(appInvoiceId));
    return invoices.filter((invoice) => {
      if (Number(invoice.balanceDue || 0) <= 0) return false;
      if (!invoice._id) return false;
      if (!appliedInvoiceIds.has(invoice._id)) return true;
      return true;
    });
  }, [invoices, retainer?.applications]);

  async function withAction(work: () => Promise<void>) {
    setWorking(true);
    try {
      await work();
      await fetchData();
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Action failed"));
    } finally {
      setWorking(false);
    }
  }

  async function handleSend() {
    if (!retainer) return;
    await withAction(async () => {
      await retainerInvoiceApi.send(retainer._id);
      toast.success("Retainer invoice marked as sent");
    });
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!retainer) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }

    await withAction(async () => {
      await retainerInvoiceApi.recordPayment(retainer._id, {
        amount,
        payment_date: new Date(`${paymentDate}T00:00:00`).toISOString(),
        payment_mode: paymentMode || "Cash",
      });
      toast.success("Payment recorded");
    });
  }

  async function handleApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!retainer) return;

    const amount = Number(applyAmount);
    if (!applyInvoiceId) {
      toast.error("Select an invoice");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid apply amount");
      return;
    }

    await withAction(async () => {
      await retainerInvoiceApi.apply(retainer._id, {
        invoice_id: applyInvoiceId,
        applied_amount: amount,
      });
      setApplyAmount("");
      setApplyInvoiceId("");
      toast.success("Retainer amount applied to invoice");
    });
  }

  async function handleUnapply(app: RetainerInvoiceApplication) {
    if (!retainer) return;

    const maxAmount = Number(app.applied_amount || 0);
    const raw = window.prompt("Amount to unapply", String(maxAmount));
    if (!raw) return;

    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxAmount) {
      toast.error("Enter a valid unapply amount");
      return;
    }

    await withAction(async () => {
      await retainerInvoiceApi.unapply(retainer._id, {
        invoice_id: appInvoiceId(app),
        applied_amount: amount,
      });
      toast.success("Amount unapplied from invoice");
    });
  }

  async function handleRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!retainer) return;

    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }

    await withAction(async () => {
      await retainerInvoiceApi.refund(retainer._id, {
        amount,
        refund_date: new Date(`${refundDate}T00:00:00`).toISOString(),
      });
      toast.success("Refund recorded");
    });
  }

  async function handleVoid() {
    if (!retainer) return;

    const confirmed = window.confirm(`Void retainer invoice ${retainer.retainer_number}?`);
    if (!confirmed) return;

    await withAction(async () => {
      await retainerInvoiceApi.void(retainer._id, "Void from retainer detail");
      toast.success("Retainer invoice voided");
    });
  }

  async function handleDelete() {
    if (!retainer) return;

    const confirmed = window.confirm(`Delete retainer invoice ${retainer.retainer_number}?`);
    if (!confirmed) return;

    await withAction(async () => {
      await retainerInvoiceApi.remove(retainer._id);
      toast.success("Retainer invoice deleted");
      router.push("/sales/retainer-invoices");
    });
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
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => router.push("/sales/retainer-invoices")}
              >
                Retainer Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">{retainer?.retainer_number || "Details"}</span>
            </span>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/sales/retainer-invoices")}> 
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={fetching || working}>
                <RefreshCw className={`mr-1 h-4 w-4 ${(fetching || working) ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {retainer?.status === "Draft" ? (
                <Button size="sm" onClick={() => void handleSend()} disabled={working || fetching}>
                  Mark as Sent
                </Button>
              ) : null}
            </>
          }
        />

        <div className="flex-1 space-y-5 p-6">
          {(fetching && !retainer) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading retainer invoice...
            </div>
          ) : retainer ? (
            <>
              <div className="grid gap-3 md:grid-cols-6">
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1">
                    <Badge variant="outline" className={STATUS_STYLES[retainer.status]}>
                      {retainer.status}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="mt-1 font-semibold">{formatCurrency(retainer.total_amount)}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Received</div>
                  <div className="mt-1 font-semibold">{formatCurrency(retainer.amount_received)}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Applied</div>
                  <div className="mt-1 font-semibold">{formatCurrency(retainer.amount_applied)}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Unapplied</div>
                  <div className="mt-1 font-semibold">{formatCurrency(retainer.amount_unapplied)}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Balance Due</div>
                  <div className="mt-1 font-semibold">{formatCurrency(retainer.balance_due)}</div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
                <div className="space-y-5">
                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="text-base font-semibold">Retainer Details</h2>
                    <div className="mt-3 grid gap-x-4 gap-y-2 text-sm md:grid-cols-2">
                      <div className="text-muted-foreground">Retainer Number</div>
                      <div>{retainer.retainer_number}</div>

                      <div className="text-muted-foreground">Retainer Date</div>
                      <div>{formatDate(retainer.retainer_date)}</div>

                      <div className="text-muted-foreground">Due Date</div>
                      <div>{formatDate(retainer.due_date)}</div>

                      <div className="text-muted-foreground">Customer</div>
                      <div>{customerName(retainer.customer_id)}</div>

                      <div className="text-muted-foreground">Reference</div>
                      <div>{retainer.reference_number || "-"}</div>

                      <div className="text-muted-foreground">Payment Mode</div>
                      <div>{retainer.payment_mode || "-"}</div>

                      <div className="text-muted-foreground">Description</div>
                      <div>{retainer.description || "-"}</div>

                      <div className="text-muted-foreground">Notes</div>
                      <div>{retainer.notes || "-"}</div>
                    </div>
                  </section>

                  <section className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold">Applied Invoices</h2>
                      <span className="text-xs text-muted-foreground">
                        {retainer.applications.length} application(s)
                      </span>
                    </div>

                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Applied Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-[80px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {retainer.applications.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                                No invoice applications yet.
                              </TableCell>
                            </TableRow>
                          ) : (
                            retainer.applications.map((app) => (
                              <TableRow key={`${appInvoiceId(app)}-${app.applied_date}`}>
                                <TableCell>
                                  <button
                                    type="button"
                                    className="text-primary hover:underline"
                                    onClick={() => {
                                      const invoiceId = appInvoiceId(app);
                                      if (invoiceId) router.push(`/sales/invoices/${invoiceId}`);
                                    }}
                                  >
                                    {appInvoiceLabel(app)}
                                  </button>
                                </TableCell>
                                <TableCell>{formatDate(app.applied_date)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(app.applied_amount)}</TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void handleUnapply(app)}
                                    disabled={working || retainer.status === "Void"}
                                  >
                                    Unapply
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                </div>

                <div className="space-y-5">
                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="text-base font-semibold">Record Payment</h2>
                    <form className="mt-3 space-y-3" onSubmit={handleRecordPayment}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="paymentAmount">Amount</Label>
                          <Input
                            id="paymentAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentAmount}
                            onChange={(event) => setPaymentAmount(event.target.value)}
                            disabled={working || retainer.status === "Void" || retainer.balance_due <= 0.009}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="paymentDate">Payment Date</Label>
                          <Input
                            id="paymentDate"
                            type="date"
                            value={paymentDate}
                            onChange={(event) => setPaymentDate(event.target.value)}
                            disabled={working || retainer.status === "Void" || retainer.balance_due <= 0.009}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="paymentMode">Payment Mode</Label>
                        <Input
                          id="paymentMode"
                          value={paymentMode}
                          onChange={(event) => setPaymentMode(event.target.value)}
                          disabled={working || retainer.status === "Void" || retainer.balance_due <= 0.009}
                        />
                      </div>

                      <Button type="submit" disabled={working || retainer.status === "Void" || retainer.balance_due <= 0.009}>
                        Record Payment
                      </Button>
                    </form>
                  </section>

                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="text-base font-semibold">Apply to Invoice</h2>
                    <form className="mt-3 space-y-3" onSubmit={handleApply}>
                      <div className="space-y-1.5">
                        <Label htmlFor="applyInvoice">Invoice</Label>
                        <Select
                          value={applyInvoiceId}
                          onValueChange={setApplyInvoiceId}
                          disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}
                        >
                          <SelectTrigger id="applyInvoice">
                            <SelectValue placeholder="Select invoice" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableInvoices.map((invoice) => (
                              <SelectItem key={invoice._id} value={invoice._id}>
                                {invoice.invoiceNumber} - Due {formatCurrency(invoice.balanceDue || 0)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="applyAmount">Amount</Label>
                        <Input
                          id="applyAmount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={applyAmount}
                          onChange={(event) => setApplyAmount(event.target.value)}
                          disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}
                        />
                      </div>

                      <Button type="submit" disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}>
                        Apply
                      </Button>
                    </form>
                  </section>

                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="text-base font-semibold">Refund</h2>
                    <form className="mt-3 space-y-3" onSubmit={handleRefund}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="refundAmount">Amount</Label>
                          <Input
                            id="refundAmount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmount}
                            onChange={(event) => setRefundAmount(event.target.value)}
                            disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="refundDate">Refund Date</Label>
                          <Input
                            id="refundDate"
                            type="date"
                            value={refundDate}
                            onChange={(event) => setRefundDate(event.target.value)}
                            disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}
                          />
                        </div>
                      </div>

                      <Button type="submit" disabled={working || retainer.status === "Void" || retainer.amount_unapplied <= 0.009}>
                        Record Refund
                      </Button>
                    </form>
                  </section>

                  <section className="rounded-xl border bg-card p-4">
                    <h2 className="text-base font-semibold">Lifecycle Controls</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => void handleVoid()}
                        disabled={working || retainer.status === "Void" || retainer.amount_received > 0.009}
                      >
                        Void
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => void handleDelete()}
                        disabled={working || retainer.amount_received > 0.009}
                      >
                        Delete
                      </Button>
                    </div>
                    {retainer.amount_received > 0.009 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Delete/Void is restricted after payment activity.
                      </p>
                    ) : null}
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Retainer invoice not found.
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
