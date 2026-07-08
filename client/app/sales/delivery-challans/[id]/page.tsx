"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Loader2,
  Printer,
  ChevronDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deliveryChallanApi,
  type DeliveryChallan,
  type DeliveryChallanStatus,
} from "@/lib/api/delivery-challans";
import { toast } from "sonner";

const statusColor: Record<DeliveryChallanStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Open: "bg-teal-50 text-teal-700 border-teal-200",
  Delivered: "bg-green-50 text-green-700 border-green-300",
  Returned: "bg-red-50 text-red-700 border-red-300",
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
    month: "2-digit",
    year: "numeric",
  });
}

function customerName(c: DeliveryChallan["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function getConvertedInvoiceId(
  value: { _id?: string; invoiceId?: string } | undefined,
) {
  return value?.invoiceId || value?._id || "";
}

function numberToWords(num: number): string {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if (num === 0) return "Zero";
  const rupees = Math.floor(num);
  if (rupees < 20) return `Indian Rupee ${ones[rupees]} Only`;
  if (rupees < 100)
    return `Indian Rupee ${tens[Math.floor(rupees / 10)]}${rupees % 10 ? "-" + ones[rupees % 10] : ""} Only`;
  if (rupees < 1000)
    return `Indian Rupee ${ones[Math.floor(rupees / 100)]} Hundred ${
      rupees % 100 ?
        numberToWords(rupees % 100)
          .replace("Indian Rupee ", "")
          .replace(" Only", "")
      : ""
    } Only`;
  return `Indian Rupee ${rupees.toLocaleString("en-IN")} Only`;
}

export default function DeliveryChallanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [challan, setChallan] = useState<DeliveryChallan | null>(null);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && id) fetchChallan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, id]);

  async function fetchChallan() {
    setFetching(true);
    try {
      const res = await deliveryChallanApi.getById(id);
      setChallan(res.data);
    } catch {
      toast.error("Failed to load delivery challan");
    } finally {
      setFetching(false);
    }
  }

  async function handleAction(
    action: "convertToOpen" | "markAsDelivered" | "markAsReturned",
  ) {
    setActionLoading(true);
    try {
      const res = await deliveryChallanApi[action](id);
      setChallan(res.data);
      toast.success(
        action === "convertToOpen" ? "Challan is now Open"
        : action === "markAsDelivered" ? "Challan marked as Delivered"
        : "Challan marked as Returned",
      );
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this delivery challan?"))
      return;
    try {
      await deliveryChallanApi.remove(id);
      toast.success("Delivery Challan deleted");
      router.push("/sales/delivery-challans");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  async function handleConvertToInvoice() {
    if (!challan) return;
    setActionLoading(true);
    try {
      const result = await deliveryChallanApi.convertToInvoice(challan._id);
      const invoiceId = getConvertedInvoiceId(result.data);
      toast.success("Delivery Challan converted to invoice");
      if (invoiceId) {
        router.push(`/sales/invoices/${invoiceId}`);
      } else {
        await fetchChallan();
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to convert delivery challan");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (!challan) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center py-20">
            <p className="text-muted-foreground">Delivery Challan not found</p>
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
              <span
                className="cursor-pointer hover:text-foreground"
                onClick={() => router.push("/sales/delivery-challans")}
              >
                Delivery Challans
              </span>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                {challan.challanNumber}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/sales/delivery-challans")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-6">
          {/* Title + Status + Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">
                {challan.challanNumber}
              </h1>
              <Badge variant="outline" className={statusColor[challan.status]}>
                {challan.status.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/sales/delivery-challans/${id}/edit`)
                }
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                onClick={handleConvertToInvoice}
                disabled={actionLoading || challan.invoiceStatus === "INVOICED"}
              >
                {actionLoading && (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                )}
                Convert to Invoice
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-1" />
                    PDF/Print
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowPrintView(true)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPrintView(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {challan.status === "Draft" && (
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                  onClick={() => handleAction("convertToOpen")}
                  disabled={actionLoading}
                >
                  {actionLoading && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Convert to Open
                </Button>
              )}
              {challan.status === "Open" && (
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                  onClick={() => handleAction("markAsDelivered")}
                  disabled={actionLoading}
                >
                  {actionLoading && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Mark as Delivered
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <span>More</span>
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {challan.status === "Open" && (
                    <DropdownMenuItem
                      onClick={() => handleAction("markAsReturned")}
                    >
                      Mark as Returned
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Invoice Status */}
          <div className="text-sm">
            <span className="text-muted-foreground">Invoice Status: </span>
            <span
              className={
                challan.invoiceStatus === "NOT INVOICED" ?
                  "text-orange-600 font-medium"
                : "text-green-600 font-medium"
              }
            >
              {challan.invoiceStatus}
            </span>
            {challan.invoiceStatus === "INVOICED" && challan.invoiceId ?
              <Button
                variant="link"
                size="sm"
                className="h-auto px-2"
                onClick={() =>
                  router.push(`/sales/invoices/${String(challan.invoiceId)}`)
                }
              >
                View Linked Invoice
              </Button>
            : null}
          </div>

          <div className="text-sm">
            <span className="text-muted-foreground">Sales Order#: </span>
            <span className="font-medium text-foreground">
              {challan.salesOrderNumber || "-"}
            </span>
          </div>

          {/* Challan Preview Card */}
          <div className="border rounded-lg overflow-hidden bg-white">
            {/* Status Ribbon */}
            <div className="relative">
              <div className="absolute top-0 left-0 w-24 h-24 overflow-hidden">
                <div
                  className={`absolute top-6 -left-6 w-36 text-center text-xs font-bold text-white py-1 rotate-[-45deg] ${
                    challan.status === "Draft" ? "bg-gray-500"
                    : challan.status === "Open" ? "bg-teal-600"
                    : challan.status === "Delivered" ? "bg-green-500"
                    : "bg-red-500"
                  }`}
                >
                  {challan.status}
                </div>
              </div>
            </div>

            <div className="p-8 pt-12">
              {/* Header */}
              <div className="flex justify-between mb-8">
                <div>
                  <h2 className="text-lg font-bold">
                    {activeOrganization?.name || "Organization"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {activeOrganization?.address?.state || ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activeOrganization?.country || "India"}
                  </p>
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-bold text-muted-foreground tracking-wider">
                    DELIVERY
                  </h2>
                  <h2 className="text-2xl font-bold text-muted-foreground tracking-wider">
                    CHALLAN
                  </h2>
                  <p className="text-sm mt-2">
                    <span className="font-semibold">Delivery Challan#</span>{" "}
                    {challan.challanNumber}
                  </p>
                </div>
              </div>

              {/* Date & Type */}
              <div className="flex justify-end mb-6 gap-8 text-sm">
                <div>
                  <span className="text-muted-foreground">Challan Date : </span>
                  <span>{fmtDate(challan.challanDate)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Challan Type : </span>
                  <span>{challan.challanType}</span>
                </div>
              </div>

              {/* Deliver To */}
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">Deliver To</p>
                <p className="text-sm font-medium text-teal-700">
                  {customerName(challan.customerId)}
                </p>
              </div>

              {/* Items Table */}
              <div className="rounded border overflow-hidden mb-6">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-teal-800 hover:bg-teal-800">
                      <TableHead className="text-white font-semibold">
                        #
                      </TableHead>
                      <TableHead className="text-white font-semibold">
                        Item &amp; Description
                      </TableHead>
                      <TableHead className="text-white font-semibold text-right">
                        Qty
                      </TableHead>
                      <TableHead className="text-white font-semibold text-right">
                        Rate
                      </TableHead>
                      <TableHead className="text-white font-semibold text-right">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {challan.items.map((item, idx) => {
                      const itemName =
                        typeof item.itemId === "object" && item.itemId ?
                          item.itemId.name
                        : item.name;
                      return (
                        <TableRow key={item._id || idx}>
                          <TableCell className="text-sm">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{itemName}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {item.quantity.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {item.rate.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {item.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-72 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Sub Total</span>
                    <span className="tabular-nums">
                      {challan.subTotal.toFixed(2)}
                    </span>
                  </div>
                  {challan.discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Discount</span>
                      <span className="tabular-nums">
                        -{challan.discountAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {challan.taxAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Tax</span>
                      <span className="tabular-nums">
                        +{challan.taxAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {challan.adjustmentAmount !== 0 && (
                    <div className="flex justify-between text-sm">
                      <span>{challan.adjustmentLabel || "Adjustment"}</span>
                      <span className="tabular-nums">
                        {challan.adjustmentAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">{fmt(challan.total)}</span>
                  </div>
                </div>
              </div>

              {/* Total in Words */}
              <div className="mt-4 text-sm italic text-muted-foreground">
                <span className="font-semibold">Total In Words: </span>
                {numberToWords(challan.total)}
              </div>

              {/* Signature */}
              <div className="mt-12 text-sm">
                <span>Authorized Signature</span>
                <span className="inline-block ml-2 w-48 border-b border-gray-400" />
              </div>
            </div>
          </div>

          {/* Customer Notes & Terms */}
          {(challan.customerNotes || challan.termsAndConditions) && (
            <div className="grid grid-cols-2 gap-6">
              {challan.customerNotes && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Customer Notes</h3>
                  <p className="text-sm text-muted-foreground">
                    {challan.customerNotes}
                  </p>
                </div>
              )}
              {challan.termsAndConditions && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">
                    Terms &amp; Conditions
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {challan.termsAndConditions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Print Preview Modal */}
        {showPrintView && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
            {/* Header Bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-zinc-900 text-white">
              <h2 className="text-lg font-semibold">Preview</h2>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:text-white hover:bg-zinc-700"
                  onClick={() => setShowPrintView(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Document Preview Area */}
            <div className="flex-1 overflow-auto flex justify-center py-8 px-4">
              <div
                id="print-content"
                className="bg-white shadow-2xl w-[210mm] min-h-[297mm] p-12 text-black print:shadow-none print:p-8"
              >
                {/* Header: Company + Title */}
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h2 className="text-lg font-bold">
                      {activeOrganization?.name || "Organization"}
                    </h2>
                    {activeOrganization?.address?.state && (
                      <p className="text-sm text-gray-600">
                        {activeOrganization.address.state}
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      {activeOrganization?.country || "India"}
                    </p>
                    {activeOrganization?.email && (
                      <p className="text-sm text-gray-600">
                        {activeOrganization.email}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <h1 className="text-3xl font-bold text-gray-800 tracking-wide">
                      DELIVERY
                    </h1>
                    <h1 className="text-3xl font-bold text-gray-800 tracking-wide">
                      CHALLAN
                    </h1>
                    <p className="text-sm mt-2 font-semibold">
                      Delivery Challan# {challan.challanNumber}
                    </p>
                  </div>
                </div>

                {/* Date & Challan Type */}
                <div className="flex justify-end mb-6 gap-12 text-sm">
                  <div>
                    <span className="text-gray-500">Challan Date : </span>
                    <span className="font-medium">
                      {fmtDate(challan.challanDate)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Challan Type : </span>
                    <span className="font-medium">{challan.challanType}</span>
                  </div>
                </div>

                {/* Deliver To */}
                <div className="mb-8">
                  <p className="text-sm text-gray-500">Deliver To</p>
                  <p className="text-sm font-semibold">
                    {customerName(challan.customerId)}
                  </p>
                </div>

                {/* Items Table */}
                <table className="w-full mb-6 border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="py-2 px-3 text-left font-semibold w-10">
                        #
                      </th>
                      <th className="py-2 px-3 text-left font-semibold">
                        Item &amp; Description
                      </th>
                      <th className="py-2 px-3 text-right font-semibold w-20">
                        Qty
                      </th>
                      <th className="py-2 px-3 text-right font-semibold w-24">
                        Rate
                      </th>
                      <th className="py-2 px-3 text-right font-semibold w-24">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {challan.items.map((item, idx) => {
                      const itemName =
                        typeof item.itemId === "object" && item.itemId ?
                          item.itemId.name
                        : item.name;
                      return (
                        <tr
                          key={item._id || idx}
                          className="border-b border-gray-200"
                        >
                          <td className="py-2 px-3 text-gray-600">{idx + 1}</td>
                          <td className="py-2 px-3">{itemName}</td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {item.quantity.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {item.rate.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {item.amount.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end mb-6">
                  <div className="w-64">
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-gray-600">Sub Total</span>
                      <span className="tabular-nums">
                        {challan.subTotal.toFixed(2)}
                      </span>
                    </div>
                    {challan.discountAmount > 0 && (
                      <div className="flex justify-between py-1 text-sm">
                        <span className="text-gray-600">Discount</span>
                        <span className="tabular-nums">
                          -{challan.discountAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {challan.adjustmentAmount !== 0 && (
                      <div className="flex justify-between py-1 text-sm">
                        <span className="text-gray-600">
                          {challan.adjustmentLabel || "Adjustment"}
                        </span>
                        <span className="tabular-nums">
                          {challan.adjustmentAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 mt-1 border-t-2 border-gray-800 font-bold">
                      <span>Total</span>
                      <span className="tabular-nums">{fmt(challan.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Total in Words */}
                <div className="mb-8 text-sm">
                  <span className="text-gray-500">Total In Words: </span>
                  <span className="italic font-medium">
                    {numberToWords(challan.total)}
                  </span>
                </div>

                {/* Authorized Signature */}
                <div className="mt-16 text-sm">
                  <span>Authorized Signature</span>
                  <span className="inline-block ml-2 w-48 border-b border-gray-400" />
                </div>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
