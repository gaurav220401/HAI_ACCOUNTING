"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { retainerInvoiceApi } from "@/lib/api/retainer-invoices";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function NewRetainerInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const prefillCustomerId = useMemo(
    () => searchParams.get("customerId") || "",
    [searchParams],
  );

  const [customers, setCustomers] = useState<Contact[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customerId, setCustomerId] = useState(prefillCustomerId);
  const [retainerNumber, setRetainerNumber] = useState("");
  const [retainerDate, setRetainerDate] = useState(isoToday());
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"Draft" | "Sent">("Draft");
  const [totalAmount, setTotalAmount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser) return;

    let cancelled = false;

    async function loadInitial() {
      setLoadingCustomers(true);
      try {
        const [numberRes, customerRes] = await Promise.all([
          retainerInvoiceApi.getNextNumber(),
          contactApi.list({ type: "Customer", page: 1, limit: 200, includeInactive: false }),
        ]);

        if (cancelled) return;

        setRetainerNumber(numberRes.data.retainer_number || "");
        setCustomers(customerRes.data || []);

        if (prefillCustomerId) {
          setCustomerId(prefillCustomerId);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          toast.error(toErrorMessage(error, "Failed to load form defaults"));
        }
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, prefillCustomerId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(totalAmount);
    if (!customerId) {
      toast.error("Customer is required");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid total amount");
      return;
    }

    setSaving(true);
    try {
      const response = await retainerInvoiceApi.create({
        customer_id: customerId,
        total_amount: amount,
        retainer_number: retainerNumber || undefined,
        retainer_date: retainerDate,
        due_date: dueDate || null,
        status,
        reference_number: referenceNumber || undefined,
        description: description || undefined,
        payment_mode: paymentMode || "Cash",
        notes: notes || undefined,
      });

      toast.success("Retainer invoice created");
      router.push(`/sales/retainer-invoices/${response.data._id}`);
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Failed to create retainer invoice"));
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
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => router.push("/sales/retainer-invoices")}
              >
                Retainer Invoices
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New</span>
            </span>
          }
          actions={
            <Button variant="outline" size="sm" onClick={() => router.push("/sales/retainer-invoices")}> 
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          }
        />

        <div className="mx-auto w-full max-w-4xl p-6">
          <form onSubmit={onSubmit} className="space-y-6 rounded-xl border bg-card p-6">
            <div>
              <h1 className="text-2xl font-semibold">Create Retainer Invoice</h1>
              <p className="text-sm text-muted-foreground">
                Record an advance request from a customer and track how it gets paid and applied.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId} disabled={loadingCustomers}>
                  <SelectTrigger id="customer">
                    <SelectValue placeholder={loadingCustomers ? "Loading customers..." : "Select customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer._id} value={customer._id}>
                        {customer.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retainerNumber">Retainer Number</Label>
                <Input
                  id="retainerNumber"
                  value={retainerNumber}
                  onChange={(event) => setRetainerNumber(event.target.value)}
                  placeholder="Auto-generated"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retainerDate">Retainer Date</Label>
                <Input
                  id="retainerDate"
                  type="date"
                  value={retainerDate}
                  onChange={(event) => setRetainerDate(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Initial Status</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as "Draft" | "Sent")}> 
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalAmount">Total Amount</Label>
                <Input
                  id="totalAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="referenceNumber">Reference Number</Label>
                <Input
                  id="referenceNumber"
                  value={referenceNumber}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMode">Default Payment Mode</Label>
                <Input
                  id="paymentMode"
                  value={paymentMode}
                  onChange={(event) => setPaymentMode(event.target.value)}
                  placeholder="Cash"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this retainer for?"
                className="min-h-[90px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes"
                className="min-h-[90px]"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => router.push("/sales/retainer-invoices")}> 
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} 
                Save Retainer Invoice
              </Button>
            </div>
          </form>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
