"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  FileText,
  Trash2,
  Download,
  Copy,
  Mail,
  Truck,
  Package as PackageIcon,
  ArrowRightLeft,
} from "lucide-react";

import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  salesOrderApi,
  type SalesOrder,
  type SalesOrderStatus,
} from "@/lib/api/sales-orders";
import { packageApi, type Package } from "@/lib/api/packages";

type TabKey = "overview" | "packages" | "documents";

function getCustomerName(
  customer: SalesOrder["customerId"] | null | undefined,
): string {
  if (!customer || typeof customer === "string") return "";
  return customer.displayName || customer.companyName || "";
}

function getPaymentTermsName(
  paymentTerms: SalesOrder["paymentTermsId"] | null | undefined,
): string {
  if (!paymentTerms || typeof paymentTerms === "string") return "";
  return paymentTerms.name || "";
}

function getLineItemName(lineItem: SalesOrder["lineItems"][number]): string {
  if (!lineItem.itemId || typeof lineItem.itemId === "string") return "";
  return lineItem.itemId.name || "";
}

function getConvertedInvoiceId(
  value: { _id?: string; invoiceId?: string } | undefined,
) {
  return value?.invoiceId || value?._id || "";
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

function formatQty(value: number | null | undefined) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function statusVariant(status: SalesOrderStatus) {
  if (status === "DRAFT") return "secondary" as const;
  if (status === "OVERDUE") return "destructive" as const;
  if (status === "VOID") return "destructive" as const;
  if (status === "APPROVED") return "outline" as const;
  if (status === "CLOSED") return "success" as const;
  return "default" as const;
}

const VALID_SALES_ORDER_STATUSES: SalesOrderStatus[] = [
  "DRAFT",
  "APPROVED",
  "INVOICED",
  "PARTIALLY_INVOICED",
  "CLOSED",
  "OVERDUE",
  "VOID",
];

function salesOrderStatusOf(
  order: Partial<SalesOrder> | null | undefined,
): SalesOrderStatus {
  const raw = String((order as any)?.status || "").toUpperCase();
  if (VALID_SALES_ORDER_STATUSES.includes(raw as SalesOrderStatus)) {
    return raw as SalesOrderStatus;
  }
  return "DRAFT";
}

function invoiceStatusOf(
  order: Partial<SalesOrder> | null | undefined,
): "Invoiced" | "Not Invoiced" {
  const raw = String((order as any)?.invoiceStatus || "");
  if (raw === "Invoiced" || raw === "Not Invoiced") return raw;
  return (order as any)?.invoiceId ? "Invoiced" : "Not Invoiced";
}

function shipmentStatusOf(
  order: Partial<SalesOrder> | null | undefined,
): "Pending" | "Shipped" | "Delivered" {
  const raw = String((order as any)?.shipmentStatus || "");
  if (raw === "Pending" || raw === "Shipped" || raw === "Delivered") return raw;
  return "Pending";
}

function normalizeSalesOrder(order: SalesOrder): SalesOrder {
  return {
    ...order,
    status: salesOrderStatusOf(order),
    invoiceStatus: invoiceStatusOf(order),
    shipmentStatus: shipmentStatusOf(order),
    lineItems: Array.isArray((order as any)?.lineItems) ? order.lineItems : [],
    subTotal: Number((order as any)?.subTotal || 0),
    shippingCharges: Number((order as any)?.shippingCharges || 0),
    adjustment: Number((order as any)?.adjustment || 0),
    total: Number((order as any)?.total || 0),
  };
}

// ─── Send Email Modal ───────────────────────────────────────────────────────

interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  order: SalesOrder;
  onSent: () => void;
}

function SendEmailModal({ open, onClose, order, onSent }: SendEmailModalProps) {
  const name = getCustomerName(order.customerId);
  const customerEmail = (order.customerId as any)?.email || "";
  const { activeOrganization } = useOrganization();

  const [to, setTo] = useState(customerEmail);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    `Sales Order - ${order.salesOrderNumber} from ${activeOrganization?.name || "HAI"}`,
  );

  const defaultBody = `Dear ${name},

Thanks for your business. Please find our sales order (${order.salesOrderNumber}) attached for your reference.

Order Summary:
- Number: ${order.salesOrderNumber}
- Date: ${formatDate(order.orderDate)}
- Sub Total: ₹${Number(order.subTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
${order.lineItems.reduce((acc, curr) => acc + (curr.taxAmount || 0), 0) > 0 ? `- CGST: ₹${Number(order.lineItems.reduce((acc, curr) => acc + (curr.taxAmount || 0), 0) / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n- SGST: ₹${Number(order.lineItems.reduce((acc, curr) => acc + (curr.taxAmount || 0), 0) / 2).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""}${order.shippingCharges + order.adjustment !== 0 ? `\n- Shipping & Adj: ₹${Number(order.shippingCharges + order.adjustment).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : ""}
- Total Amount: ₹${Number(order.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}

Assuring you of our best services at all times.

Regards,
${activeOrganization?.name || "HAI"}`;

  const [body, setBody] = useState(defaultBody);
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const toList = to
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    const ccList = cc
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);
    const bccList = bcc
      .split(",")
      .map((e: string) => e.trim())
      .filter(Boolean);

    if (toList.length === 0) {
      toast.error("Please provide at least one recipient email");
      return;
    }

    setSending(true);
    try {
      await salesOrderApi.sendEmail(order._id, {
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject,
        body,
        attachPdf,
      });
      toast.success(`Email sent to ${toList.length} recipient(s)`);
      onSent();
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[650px] p-0 overflow-hidden rounded-xl border-none shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Send Sales Order
            </DialogTitle>
            <p className="text-blue-100 text-sm mt-1">
              Send professionally formatted order details to your customers.
            </p>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                To (Recipients)
              </Label>
              <Input
                placeholder="customer@example.com, colleague@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-muted/30 focus-visible:ring-blue-500"
              />
              <p className="text-[10px] text-muted-foreground italic">
                Use commas to separate multiple emails
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                CC / BCC
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="CC"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className="bg-muted/30"
                />
                <Input
                  placeholder="BCC"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className="bg-muted/30"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Subject
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-muted/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Message Body
            </Label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-muted/30 font-sans resize-none"
            />
          </div>

          <div className="flex items-center space-x-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
            <Checkbox
              id="attach"
              checked={attachPdf}
              onCheckedChange={(v) => setAttachPdf(v === true)}
              className="data-[state=checked]:bg-blue-600"
            />
            <Label
              htmlFor="attach"
              className="text-sm font-medium text-blue-900 cursor-pointer flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              Attach Sales Order PDF
            </Label>
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t flex justify-between items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
          >
            {sending ?
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            : <Mail className="h-4 w-4 mr-2" />}
            Send Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id;

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [active, setActive] = useState<SalesOrder | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showShipmentTypeModal, setShowShipmentTypeModal] = useState(false);
  const [showPdfView, setShowPdfView] = useState(true);
  const [fulfilling, setFulfilling] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  useEffect(() => {
    if (!id) return;
    if (orders.length === 0) return;
    const found = orders.find((o) => o._id === id) || null;
    if (found) {
      setActive(found);
      salesOrderApi
        .getById(found._id)
        .then((res) => setActive(normalizeSalesOrder(res.data)))
        .catch(() => {});
      packageApi
        .listByOrder(found._id)
        .then((res) => setPackages(res.data || []))
        .catch(() => {});
    }
  }, [id, orders]);

  // Auto-open email modal when navigated from "Save and Send"
  useEffect(() => {
    if (searchParams?.get("send") === "true" && active) {
      setShowEmailModal(true);
      router.replace(`/sales/orders/${active._id}`, { scroll: false });
    }
  }, [active, searchParams, router]);

  async function fetchOrders() {
    setFetching(true);
    try {
      const res = await salesOrderApi.list({ page: 1, limit: 200 });
      setOrders((res.data ?? []).map(normalizeSalesOrder));
    } catch {
      setOrders([]);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const custName = getCustomerName(o.customerId).toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        (o.reference || "").toLowerCase().includes(q) ||
        custName.includes(q)
      );
    });
  }, [orders, search]);

  function openOrder(o: SalesOrder) {
    router.push(`/sales/orders/${o._id}`);
  }

  async function handleConvertToInvoice() {
    if (!active) return;
    try {
      const result = await salesOrderApi.convertToInvoice(active._id);
      const invoiceId = getConvertedInvoiceId(result.data);
      toast.success("Sales order converted to invoice successfully");
      if (invoiceId) {
        router.push(`/sales/invoices/${invoiceId}`);
      }
    } catch {
      toast.error("Failed to convert sales order to invoice");
    }
  }

  async function handleInstantInvoice() {
    if (!active) return;
    try {
      const result = await salesOrderApi.instantInvoice(active._id);
      const invoiceId = getConvertedInvoiceId(result.data);
      toast.success("Instant invoice created");
      if (invoiceId) {
        router.push(`/sales/invoices/${invoiceId}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to create instant invoice");
    }
  }

  function handleConvertToPurchaseOrder() {
    if (!active) return;
    router.push(
      `/purchases/orders/new?sourceSalesOrderId=${encodeURIComponent(active._id)}`,
    );
  }

  async function handleDropship() {
    if (!active) return;
    try {
      await salesOrderApi.dropship(active._id);
      toast.success("Order marked as dropship");
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark dropship");
    }
  }

  async function handleCancelItems() {
    if (!active) return;
    if (!confirm("Cancel all items for this Sales Order?")) return;
    try {
      await salesOrderApi.cancelItems(active._id);
      toast.success("Sales order items cancelled");
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel items");
    }
  }

  async function handleVoidOrder() {
    if (!active) return;
    if (!confirm("Void this Sales Order?")) return;
    try {
      await salesOrderApi.voidOrder(active._id);
      toast.success("Sales order voided");
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.message || "Failed to void sales order");
    }
  }

  async function handleCloneOrder() {
    if (!active) return;
    try {
      const result = await salesOrderApi.clone(active._id);
      const clonedId = result.data?._id;
      toast.success("Sales order cloned");
      if (clonedId) {
        router.push(`/sales/orders/${clonedId}`);
      } else {
        await fetchOrders();
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to clone sales order");
    }
  }

  async function handleDelete() {
    if (!active) return;
    if (!confirm("Are you sure you want to delete this sales order?")) return;
    try {
      await salesOrderApi.remove(active._id);
      toast.success("Sales order deleted successfully");
      router.push("/sales/orders");
    } catch (error) {
      toast.error("Failed to delete sales order");
    }
  }

  async function handleDownloadPDF() {
    if (!active) return;
    try {
      const blob = await salesOrderApi.downloadPdf(active._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Sales-Order-${active.salesOrderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  async function handleUpdateShipment(
    status: "Pending" | "Shipped" | "Delivered",
  ) {
    if (!active) return;
    try {
      await salesOrderApi.updateShipment(active._id, status);
      toast.success(`Shipment status updated to ${status}`);
      fetchOrders();
    } catch {
      toast.error("Failed to update shipment status");
    }
  }

  async function handleMarkShipmentFulfilled() {
    if (!active) return;
    setFulfilling(true);
    try {
      await salesOrderApi.markShipmentFulfilled(active._id);
      toast.success("Shipment marked as fulfilled");
      await fetchOrders();
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark shipment as fulfilled");
    } finally {
      setFulfilling(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const activeInvoiceStatus = invoiceStatusOf(active);
  const activeShipmentStatus = shipmentStatusOf(active);
  const activeStatus = salesOrderStatusOf(active);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              Sales Orders <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                {active?.salesOrderNumber || "Sales Order"}
              </span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Sales Orders..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOrders}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/orders/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 min-h-[calc(100svh-3.5rem)]">
          <aside className="w-80 border-r bg-background">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">All Sales Orders</div>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => router.push("/sales/orders/new")}
                  aria-label="Add sales order"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(100svh-3.5rem-3rem)] overflow-auto">
              {filtered.map((o) => {
                const isActive = o._id === active?._id;
                return (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => openOrder(o)}
                    className={
                      "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors " +
                      (isActive ? "bg-muted" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">
                        {o.salesOrderNumber}
                      </div>
                      <Badge
                        variant={statusVariant(o.status)}
                        className="shrink-0"
                      >
                        {o.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {getCustomerName(o.customerId) || "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {o.total != null ?
                        `₹${Number(o.total).toLocaleString("en-IN")}`
                      : "—"}
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 ?
                <div className="p-6 text-sm text-muted-foreground">
                  No sales orders found.
                </div>
              : null}
            </div>
          </aside>

          <main className="flex-1 p-6">
            {!active ?
              <div className="text-sm text-muted-foreground">
                Select a sales order to view details.
              </div>
            : <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold">
                      {active.salesOrderNumber}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{getCustomerName(active.customerId) || "—"}</span>
                      <span>{formatDate(active.orderDate)}</span>
                      {active.reference ?
                        <span>Ref {active.reference}</span>
                      : null}
                      <Badge variant={statusVariant(activeStatus)}>
                        {activeStatus}
                      </Badge>
                      {activeInvoiceStatus === "Invoiced" && (
                        <Badge variant="default" className="bg-green-600">
                          <FileText className="h-3 w-3 mr-1" />
                          Invoiced
                        </Badge>
                      )}
                      {activeShipmentStatus !== "Pending" && (
                        <Badge
                          variant="outline"
                          className="border-blue-500 text-blue-600"
                        >
                          <Truck className="h-3 w-3 mr-1" />
                          {activeShipmentStatus}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/sales/orders/${active._id}/edit`)
                      }
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEmailModal(true)}
                    >
                      <Mail className="h-4 w-4 mr-1" />
                      Send Email
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConvertToInvoice}
                      disabled={
                        activeStatus === "INVOICED" ||
                        activeStatus === "PARTIALLY_INVOICED" ||
                        activeStatus === "CLOSED"
                      }
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Convert to Invoice
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Create
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/sales/orders/${active._id}/packages/new`,
                            )
                          }
                        >
                          <PackageIcon className="h-4 w-4 mr-2" />
                          Package
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setShowShipmentTypeModal(true)}
                        >
                          <Truck className="h-4 w-4 mr-2" />
                          Shipment
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleInstantInvoice}>
                          <FileText className="h-4 w-4 mr-2" />
                          Instant Invoice
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label="More"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={handleConvertToPurchaseOrder}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Create Purchase Order
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {activeShipmentStatus === "Pending" ?
                          <DropdownMenuItem
                            onClick={() => handleUpdateShipment("Shipped")}
                          >
                            <Truck className="h-4 w-4 mr-2" />
                            Mark as Shipped
                          </DropdownMenuItem>
                        : null}
                        {activeShipmentStatus !== "Delivered" ?
                          <DropdownMenuItem
                            disabled={fulfilling}
                            onClick={handleMarkShipmentFulfilled}
                          >
                            <PackageIcon className="h-4 w-4 mr-2" />
                            {fulfilling ?
                              "Fulfilling shipment..."
                            : "Mark shipment fulfilled"}
                          </DropdownMenuItem>
                        : <DropdownMenuItem
                            onClick={() => handleUpdateShipment("Pending")}
                          >
                            <Truck className="h-4 w-4 mr-2" />
                            Reset shipment to Pending
                          </DropdownMenuItem>
                        }
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDropship}>
                          <Truck className="h-4 w-4 mr-2" />
                          Dropship
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCancelItems}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Cancel Items
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleVoidOrder}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Void
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCloneOrder}>
                          <Copy className="h-4 w-4 mr-2" />
                          Clone
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadPDF}>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleDelete}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-6">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                    <TabsList className="w-full justify-start border-b rounded-none px-0 bg-transparent h-auto">
                      <TabsTrigger
                        value="overview"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                      >
                        Sales Order
                      </TabsTrigger>
                      <TabsTrigger
                        value="packages"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                      >
                        Packages
                      </TabsTrigger>
                      <TabsTrigger
                        value="documents"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
                      >
                        Linked Documents
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="packages" className="pt-6">
                      <div className="space-y-4">
                        {packages.length === 0 ?
                          <div className="text-center p-8 bg-muted/20 border rounded-lg">
                            <PackageIcon className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                            <p className="text-muted-foreground mb-4">
                              No packages created yet.
                            </p>
                            <Button
                              variant="outline"
                              onClick={() =>
                                router.push(
                                  `/sales/orders/${active._id}/packages/new`,
                                )
                              }
                            >
                              Create Package
                            </Button>
                          </div>
                        : packages.map((pkg) => (
                            <div
                              key={pkg._id}
                              className="p-4 border rounded-lg bg-card flex justify-between items-center hover:bg-muted/30 cursor-pointer"
                              onClick={() =>
                                router.push(`/sales/packages/${pkg._id}`)
                              }
                            >
                              <div>
                                <div className="font-medium text-blue-600">
                                  {pkg.packageSlipNumber}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  Date:{" "}
                                  {new Date(pkg.date).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-sm text-right">
                                <div className="font-medium">
                                  {pkg.lineItems.reduce(
                                    (acc, li) => acc + li.packed,
                                    0,
                                  )}{" "}
                                  Items Packed
                                </div>
                                {pkg.weight?.value && (
                                  <div className="text-muted-foreground mt-1">
                                    Weight: {pkg.weight.value} {pkg.weight.unit}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center">
                              <FileText className="h-4 w-4 mr-2 text-blue-500" />
                              Linked Invoices
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {!active?.linkedDocuments?.invoices?.length ?
                              <div className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded">
                                No linked invoices.
                              </div>
                            : active.linkedDocuments.invoices.map((inv) => (
                                <div
                                  key={inv._id}
                                  className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer transition-colors"
                                  onClick={() =>
                                    router.push(`/sales/invoices/${inv._id}`)
                                  }
                                >
                                  <div>
                                    <div className="text-sm font-medium text-blue-600">
                                      {inv.invoiceNumber}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {formatDate(inv.invoiceDate)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-bold">
                                      ₹{inv.total.toLocaleString("en-IN")}
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] h-4 py-0 uppercase"
                                    >
                                      {inv.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))
                            }
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center">
                              <Truck className="h-4 w-4 mr-2 text-orange-500" />
                              Linked Delivery Challans
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {(
                              !active?.linkedDocuments?.deliveryChallans?.length
                            ) ?
                              <div className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded">
                                No linked challans.
                              </div>
                            : active.linkedDocuments.deliveryChallans.map(
                                (dc) => (
                                  <div
                                    key={dc._id}
                                    className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer transition-colors"
                                    onClick={() =>
                                      router.push(
                                        `/inventory/delivery-challans/${dc._id}`,
                                      )
                                    }
                                  >
                                    <div>
                                      <div className="text-sm font-medium text-orange-600">
                                        {dc.challanNumber}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {formatDate(dc.challanDate)}
                                      </div>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] h-4 py-0 uppercase"
                                    >
                                      {dc.status}
                                    </Badge>
                                  </div>
                                ),
                              )
                            }
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold flex items-center">
                              <ArrowRightLeft className="h-4 w-4 mr-2 text-indigo-500" />
                              Linked Move Orders (Transfers)
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {!active?.linkedDocuments?.moveOrders?.length ?
                              <div className="text-xs text-muted-foreground italic p-2 bg-muted/20 rounded">
                                No linked move orders.
                              </div>
                            : active.linkedDocuments.moveOrders.map((mo) => (
                                <div
                                  key={mo._id}
                                  className="flex items-center justify-between p-2 border rounded hover:bg-muted/50 cursor-pointer transition-colors"
                                  onClick={() =>
                                    router.push(
                                      `/inventory/move-orders/${mo._id}`,
                                    )
                                  }
                                >
                                  <div>
                                    <div className="text-sm font-medium text-indigo-600">
                                      {mo.orderNumber}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {formatDate(mo.date)}
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-4 py-0 uppercase"
                                  >
                                    {mo.status}
                                  </Badge>
                                </div>
                              ))
                            }
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>

                    <TabsContent value="overview" className="pt-6">
                      <div className="flex justify-between items-center mb-4">
                        <div className="text-sm font-medium space-x-2 flex items-center">
                          <span className="text-muted-foreground">
                            Invoice Status :
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${activeInvoiceStatus === "Invoiced" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}
                          >
                            {activeInvoiceStatus.toUpperCase()}
                          </span>
                          <span className="text-muted-foreground ml-4">
                            Shipment :
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-bold ${
                              activeShipmentStatus === "Delivered" ?
                                "bg-green-100 text-green-700"
                              : activeShipmentStatus === "Shipped" ?
                                "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {activeShipmentStatus.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground italic">
                            Show PDF View
                          </span>
                          <Switch
                            checked={showPdfView}
                            onCheckedChange={setShowPdfView}
                          />
                        </div>
                      </div>

                      {showPdfView ?
                        <div className="border border-gray-200 rounded-lg overflow-hidden relative bg-white shadow-sm max-w-4xl mx-auto">
                          {/* Ribbon */}
                          {activeStatus && (
                            <div className="absolute top-0 left-0 z-10 w-32 h-32 overflow-hidden pointer-events-none">
                              <div
                                className={`absolute top-6 -left-8 text-white text-xs font-bold px-10 py-1 transform -rotate-45 shadow-md tracking-wider ${
                                  activeStatus === "CLOSED" ? "bg-green-500"
                                  : activeStatus === "DRAFT" ? "bg-gray-400"
                                  : "bg-blue-500"
                                }`}
                              >
                                {activeStatus.toUpperCase()}
                              </div>
                            </div>
                          )}

                          <div className="p-12 pl-16 pr-16 bg-white min-h-[800px]">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-bold text-xl mb-1 text-gray-900">
                                  {activeOrganization?.name || "Your Company"}
                                </div>
                                <div className="text-sm text-gray-600 space-y-0.5 leading-relaxed">
                                  <div>
                                    {activeOrganization?.address?.street ||
                                      "Company Address Line 1"}
                                  </div>
                                  <div>
                                    {activeOrganization?.address?.city ||
                                      "City"}
                                    ,{" "}
                                    {activeOrganization?.address?.state ||
                                      "State"}
                                  </div>
                                  <div>
                                    {activeOrganization?.address?.country ||
                                      "Country"}
                                  </div>
                                  <div className="pt-1">
                                    {activeOrganization?.email ||
                                      "email@example.com"}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-3xl font-serif text-gray-900 tracking-wider mb-6">
                                  SALES ORDER
                                </div>
                                <div className="text-sm text-gray-700 font-semibold mb-1">
                                  Sales Order# {active.salesOrderNumber}
                                </div>
                              </div>
                            </div>

                            <div className="mt-16 flex justify-between">
                              <div className="text-sm">
                                <div className="font-semibold text-gray-800 mb-1">
                                  Bill To
                                </div>
                                <div className="text-blue-600 font-medium text-base">
                                  {getCustomerName(active.customerId)}
                                </div>
                              </div>
                              <div className="text-sm">
                                <div className="grid grid-cols-[120px_1fr] gap-2 mb-1">
                                  <div className="text-gray-500">
                                    Order Date :
                                  </div>
                                  <div className="font-medium text-gray-900 text-right">
                                    {new Date(
                                      active.orderDate,
                                    ).toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                    })}
                                  </div>
                                </div>
                                {active.expectedShipmentDate && (
                                  <div className="grid grid-cols-[120px_1fr] gap-2 mb-1">
                                    <div className="text-gray-500">
                                      Exp. Shipment Date :
                                    </div>
                                    <div className="font-medium text-gray-900 text-right">
                                      {new Date(
                                        active.expectedShipmentDate,
                                      ).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      })}
                                    </div>
                                  </div>
                                )}
                                {active.reference && (
                                  <div className="grid grid-cols-[120px_1fr] gap-2 mb-1">
                                    <div className="text-gray-500">
                                      Reference :
                                    </div>
                                    <div className="font-medium text-gray-900 text-right">
                                      {active.reference}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-8 text-sm font-medium border-t border-b py-3 text-gray-800">
                              Place Of Supply:{" "}
                              <span className="font-normal text-gray-600">
                                {activeOrganization?.address?.state || "State"}
                              </span>
                            </div>

                            <table className="w-full mt-6 text-sm">
                              <thead>
                                <tr className="bg-[#333333] text-white">
                                  <th className="px-4 py-2.5 text-left font-semibold">
                                    #
                                  </th>
                                  <th className="px-4 py-2.5 text-left font-semibold">
                                    Item & Description
                                  </th>
                                  <th className="px-4 py-2.5 text-left font-semibold">
                                    HSN/SAC
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    Qty
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    Rate
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    GST%
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    CGST
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    SGST
                                  </th>
                                  <th className="px-4 py-2.5 text-right font-semibold">
                                    Amount (excl. tax)
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {active.lineItems.map((li, idx) => {
                                  const lineTotal =
                                    Number(li.quantity || 0) *
                                    Number(li.rate || 0);
                                  const lineDiscount = Number(li.discount || 0);
                                  const amountBeforeTax =
                                    lineTotal - lineDiscount;
                                  return (
                                    <tr
                                      key={idx}
                                      className="border-b border-gray-200 last:border-b-0"
                                    >
                                      <td className="px-4 py-3 align-top">
                                        {idx + 1}
                                      </td>
                                      <td className="px-4 py-3 align-top">
                                        <div className="text-gray-900 font-medium">
                                          {getLineItemName(li)}
                                        </div>
                                        {li.description && (
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            {li.description}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-gray-700 align-top">
                                        {li.hsnSacCode || ""}
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-900 align-top whitespace-nowrap">
                                        {li.quantity}{" "}
                                        <span className="text-gray-500 text-xs">
                                          Number
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-900 align-top">
                                        {Number(li.rate).toLocaleString(
                                          "en-IN",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-700 align-top">
                                        {li.taxPercent || 0}%
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-900 align-top">
                                        {Number(
                                          (li.taxAmount || 0) / 2,
                                        ).toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-900 align-top">
                                        {Number(
                                          (li.taxAmount || 0) / 2,
                                        ).toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </td>
                                      <td className="px-4 py-3 text-right text-gray-900 align-top font-medium">
                                        {Number(amountBeforeTax).toLocaleString(
                                          "en-IN",
                                          { minimumFractionDigits: 2 },
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>

                            <div className="mt-6 flex justify-end">
                              <div className="w-[300px] text-sm">
                                <div className="flex justify-between py-1.5">
                                  <div className="text-gray-600">Sub Total</div>
                                  <div className="font-medium text-gray-900">
                                    {Number(active.subTotal).toLocaleString(
                                      "en-IN",
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </div>
                                </div>
                                {active.shippingCharges > 0 && (
                                  <div className="flex justify-between py-1.5">
                                    <div className="text-gray-600">
                                      Shipping Charges
                                    </div>
                                    <div className="font-medium text-gray-900">
                                      {Number(
                                        active.shippingCharges,
                                      ).toLocaleString("en-IN", {
                                        minimumFractionDigits: 2,
                                      })}
                                    </div>
                                  </div>
                                )}
                                {active.adjustment !== 0 && (
                                  <div className="flex justify-between py-1.5">
                                    <div className="text-gray-600">
                                      Adjustment
                                    </div>
                                    <div className="font-medium text-gray-900">
                                      {Number(active.adjustment).toLocaleString(
                                        "en-IN",
                                        { minimumFractionDigits: 2 },
                                      )}
                                    </div>
                                  </div>
                                )}
                                {/* Display taxes if any */}
                                {active.lineItems.reduce(
                                  (acc, curr) => acc + (curr.taxAmount || 0),
                                  0,
                                ) > 0 && (
                                  <>
                                    <div className="flex justify-between py-1.5">
                                      <div className="text-gray-600">CGST</div>
                                      <div className="font-medium text-gray-900">
                                        {Number(
                                          active.lineItems.reduce(
                                            (acc, curr) =>
                                              acc + (curr.taxAmount || 0),
                                            0,
                                          ) / 2,
                                        ).toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </div>
                                    </div>
                                    <div className="flex justify-between py-1.5">
                                      <div className="text-gray-600">SGST</div>
                                      <div className="font-medium text-gray-900">
                                        {Number(
                                          active.lineItems.reduce(
                                            (acc, curr) =>
                                              acc + (curr.taxAmount || 0),
                                            0,
                                          ) / 2,
                                        ).toLocaleString("en-IN", {
                                          minimumFractionDigits: 2,
                                        })}
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div className="flex justify-between py-3 border-t border-b border-gray-200 mt-2 bg-gray-50 px-2 rounded">
                                  <div className="font-bold text-gray-900">
                                    Total
                                  </div>
                                  <div className="font-bold text-gray-900">
                                    ₹
                                    {Number(active.total).toLocaleString(
                                      "en-IN",
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {active.notes && (
                              <div className="mt-12">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                  Notes
                                </div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                                  {active.notes}
                                </div>
                              </div>
                            )}

                            {active.terms && (
                              <div className="mt-6">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                  Terms & Conditions
                                </div>
                                <div className="text-sm text-gray-800 whitespace-pre-wrap">
                                  {active.terms}
                                </div>
                              </div>
                            )}

                            <div className="mt-16 pt-8 text-right text-sm">
                              <div className="border-b border-gray-300 w-48 inline-block mb-2"></div>
                              <div className="text-gray-600">
                                Authorized Signature
                              </div>
                            </div>
                          </div>
                        </div>
                      : <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">
                                Order Info
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Sales Order#
                                </span>
                                <span className="font-medium">
                                  {active.salesOrderNumber}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Customer
                                </span>
                                <span className="font-medium">
                                  {getCustomerName(active.customerId) || "-"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Order Date
                                </span>
                                <span>{formatDate(active.orderDate)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Expected Shipment
                                </span>
                                <span>
                                  {formatDate(
                                    active.expectedShipmentDate || null,
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Reference
                                </span>
                                <span>{active.reference || "-"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Payment Terms
                                </span>
                                <span>
                                  {getPaymentTermsName(active.paymentTermsId) ||
                                    "-"}
                                </span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">
                                Status
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  Order
                                </span>
                                <Badge variant={statusVariant(activeStatus)}>
                                  {activeStatus}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  Invoice
                                </span>
                                <span className="font-medium">
                                  {activeInvoiceStatus}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  Shipment
                                </span>
                                <span className="font-medium">
                                  {activeShipmentStatus}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">
                                  Delivery Method
                                </span>
                                <span className="font-medium">
                                  {active.deliveryMethod || "-"}
                                </span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">
                                Amounts
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Sub Total
                                </span>
                                <span className="font-medium">
                                  ₹
                                  {Number(active.subTotal || 0).toLocaleString(
                                    "en-IN",
                                    { minimumFractionDigits: 2 },
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Shipping Charges
                                </span>
                                <span>
                                  ₹
                                  {Number(
                                    active.shippingCharges || 0,
                                  ).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Adjustment
                                </span>
                                <span>
                                  ₹
                                  {Number(
                                    active.adjustment || 0,
                                  ).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Tax
                                </span>
                                <span>
                                  ₹
                                  {Number(
                                    active.lineItems.reduce(
                                      (acc, curr) =>
                                        acc + (curr.taxAmount || 0),
                                      0,
                                    ),
                                  ).toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                              <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>Total</span>
                                <span>
                                  ₹
                                  {Number(active.total || 0).toLocaleString(
                                    "en-IN",
                                    { minimumFractionDigits: 2 },
                                  )}
                                </span>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="lg:col-span-3">
                            <CardHeader>
                              <CardTitle className="text-base">Items</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2">Item</th>
                                      <th className="text-left py-2">
                                        HSN/SAC
                                      </th>
                                      <th className="text-right py-2">Qty</th>
                                      <th className="text-right py-2">
                                        To be Invoiced
                                      </th>
                                      <th className="text-right py-2">
                                        To be Shipped
                                      </th>
                                      <th className="text-right py-2">Rate</th>
                                      <th className="text-right py-2">
                                        Amount (excl. tax)
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {active.lineItems.map((li, idx) => {
                                      const lineTotal =
                                        Number(li.quantity || 0) *
                                        Number(li.rate || 0);
                                      const lineDiscount = Number(
                                        li.discount || 0,
                                      );
                                      const amountBeforeTax =
                                        lineTotal - lineDiscount;
                                      return (
                                        <tr
                                          key={idx}
                                          className="border-b last:border-0"
                                        >
                                          <td className="py-2">
                                            <div className="font-medium">
                                              {getLineItemName(li) ||
                                                li.name ||
                                                "Item"}
                                            </div>
                                            {li.description ?
                                              <div className="text-xs text-muted-foreground">
                                                {li.description}
                                              </div>
                                            : null}
                                          </td>
                                          <td className="py-2">
                                            {li.hsnSacCode || "-"}
                                          </td>
                                          <td className="py-2 text-right">
                                            {formatQty(li.quantity)}
                                          </td>
                                          <td className="py-2 text-right">
                                            <span
                                              className={
                                                (
                                                  Number(
                                                    li.qtyToBeInvoiced ??
                                                      li.quantity,
                                                  ) === 0
                                                ) ?
                                                  "text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                                                : "text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700"
                                              }
                                            >
                                              {formatQty(
                                                li.qtyToBeInvoiced ??
                                                  li.quantity,
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 text-right">
                                            <span
                                              className={
                                                (
                                                  Number(
                                                    li.qtyToBeShipped ??
                                                      li.quantity,
                                                  ) === 0
                                                ) ?
                                                  "text-xs font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700"
                                                : "text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700"
                                              }
                                            >
                                              {formatQty(
                                                li.qtyToBeShipped ??
                                                  li.quantity,
                                              )}
                                            </span>
                                          </td>
                                          <td className="py-2 text-right">
                                            ₹
                                            {Number(
                                              li.rate || 0,
                                            ).toLocaleString("en-IN", {
                                              minimumFractionDigits: 2,
                                            })}
                                          </td>
                                          <td className="py-2 text-right font-medium">
                                            ₹
                                            {Number(
                                              amountBeforeTax || 0,
                                            ).toLocaleString("en-IN", {
                                              minimumFractionDigits: 2,
                                            })}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>

                          {active.notes ?
                            <Card className="lg:col-span-3">
                              <CardHeader>
                                <CardTitle className="text-base">
                                  Notes
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="text-sm whitespace-pre-wrap">
                                {active.notes}
                              </CardContent>
                            </Card>
                          : null}

                          {active.terms ?
                            <Card className="lg:col-span-3">
                              <CardHeader>
                                <CardTitle className="text-base">
                                  Terms & Conditions
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="text-sm whitespace-pre-wrap">
                                {active.terms}
                              </CardContent>
                            </Card>
                          : null}
                        </div>
                      }
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            }
          </main>
        </div>
      </SidebarInset>

      {active && showEmailModal && (
        <SendEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          order={active}
          onSent={fetchOrders}
        />
      )}

      {showShipmentTypeModal && active && (
        <Dialog
          open={showShipmentTypeModal}
          onOpenChange={setShowShipmentTypeModal}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-medium border-b pb-4">
                Choose Shipment Type
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-6">
              <div
                className="flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center space-y-4"
                onClick={() => {
                  setShowShipmentTypeModal(false);
                  router.push(
                    `/sales/orders/${active._id}/shipments/new?mode=manual`,
                  );
                }}
              >
                <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                  <PackageIcon className="h-8 w-8" />
                </div>
                <div className="font-medium text-gray-700">Ship Manually</div>
              </div>
              <div
                className="flex flex-col items-center justify-center p-6 border-2 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-center space-y-4"
                onClick={() => {
                  setShowShipmentTypeModal(false);
                  router.push(
                    `/sales/orders/${active._id}/shipments/new?mode=carrier`,
                  );
                }}
              >
                <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 border border-dashed border-blue-400">
                  <Truck className="h-8 w-8" />
                </div>
                <div className="font-medium text-gray-700">
                  Ship via Carrier
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </SidebarProvider>
  );
}
