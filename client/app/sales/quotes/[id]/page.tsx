"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quoteApi, type Quote, type QuoteStatus } from "@/lib/api/quotes";

const statusColor: Record<QuoteStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Accepted: "bg-green-50 text-green-700 border-green-300",
  Rejected: "bg-red-50 text-red-700 border-red-300",
  Invoiced: "bg-purple-50 text-purple-700 border-purple-300",
  Expired: "bg-yellow-50 text-yellow-700 border-yellow-300",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(c: Quote["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function salesPersonName(sp: Quote["salesPersonId"]) {
  if (!sp) return "—";
  if (typeof sp === "string") return sp;
  return sp.name || "—";
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && id) fetchQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, id]);

  async function fetchQuote() {
    setFetching(true);
    try {
      const res = await quoteApi.getById(id);
      setQuote(res.data);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function handleAction(action: "send" | "accept" | "reject" | "delete") {
    if (!quote) return;
    if (action === "delete" && !confirm("Delete this quote?")) return;
    setActionLoading(true);
    try {
      if (action === "send") await quoteApi.send(quote._id);
      else if (action === "accept") await quoteApi.accept(quote._id);
      else if (action === "reject") await quoteApi.reject(quote._id);
      else if (action === "delete") {
        await quoteApi.remove(quote._id);
        router.push("/sales/quotes");
        return;
      }
      fetchQuote();
    } catch (e: any) {
      alert(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!quote) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center">
            <p>Quote not found.</p>
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
                {quote.quoteNumber}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/quotes")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6 max-w-5xl">
          {/* ═══ Header ═══ */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold">{quote.quoteNumber}</h1>
                <Badge variant="outline" className={statusColor[quote.status]}>
                  {quote.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {customerName(quote.customerId)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {["Draft", "Sent"].includes(quote.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/sales/quotes/${quote._id}/edit`)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
              {quote.status === "Draft" && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleAction("send")}
                >
                  {actionLoading ?
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-1" />}
                  Mark as Sent
                </Button>
              )}
              {["Draft", "Sent"].includes(quote.status) && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-300 hover:bg-green-50"
                    disabled={actionLoading}
                    onClick={() => handleAction("accept")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50"
                    disabled={actionLoading}
                    onClick={() => handleAction("reject")}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={actionLoading}
                onClick={() => handleAction("delete")}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>

          <Separator />

          {/* ═══ Details Grid ═══ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-8 text-sm">
            <div>
              <span className="text-muted-foreground block">Quote Date</span>
              <span className="font-medium">{fmtDate(quote.quoteDate)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Expiry Date</span>
              <span className="font-medium">
                {quote.expiryDate ? fmtDate(quote.expiryDate) : "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Reference#</span>
              <span className="font-medium">
                {quote.referenceNumber || "—"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Salesperson</span>
              <span className="font-medium">
                {salesPersonName(quote.salesPersonId)}
              </span>
            </div>
            {quote.subject && (
              <div className="col-span-4">
                <span className="text-muted-foreground block">Subject</span>
                <span className="font-medium">{quote.subject}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* ═══ Items Table ═══ */}
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right w-24">Qty</TableHead>
                  <TableHead className="text-right w-28">Rate</TableHead>
                  <TableHead className="text-right w-28">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.items.map((item, idx) => (
                  <TableRow key={item._id || idx}>
                    <TableCell className="text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(item.rate)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmt(item.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ═══ Totals ═══ */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Sub Total</span>
                <span className="tabular-nums">{fmt(quote.subTotal)}</span>
              </div>
              {quote.discountAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Discount
                    {quote.discountType === "percent" ?
                      ` (${quote.discountValue}%)`
                    : ""}
                  </span>
                  <span className="tabular-nums">
                    - {fmt(quote.discountAmount)}
                  </span>
                </div>
              )}
              {quote.taxAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{quote.taxType}</span>
                  <span className="tabular-nums">- {fmt(quote.taxAmount)}</span>
                </div>
              )}
              {quote.adjustmentAmount !== 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{quote.adjustmentLabel}</span>
                  <span className="tabular-nums">
                    {fmt(quote.adjustmentAmount)}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Total ( ₹ )</span>
                <span className="tabular-nums">{fmt(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* ═══ Notes ═══ */}
          {(quote.customerNotes || quote.termsAndConditions) && (
            <>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                {quote.customerNotes && (
                  <div>
                    <span className="text-muted-foreground font-medium block mb-1">
                      Customer Notes
                    </span>
                    <p className="whitespace-pre-wrap">{quote.customerNotes}</p>
                  </div>
                )}
                {quote.termsAndConditions && (
                  <div>
                    <span className="text-muted-foreground font-medium block mb-1">
                      Terms & Conditions
                    </span>
                    <p className="whitespace-pre-wrap">
                      {quote.termsAndConditions}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
