"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { purchaseOrderApi, type PurchaseOrder } from "@/lib/api/purchase-orders";

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

function fmt(v: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function statusBadgeClass(status: PurchaseOrder["status"]) {
  if (status === "Open") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "Billed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "Closed") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  if (status === "Canceled") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function PrintPurchaseOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!orderId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await purchaseOrderApi.getOne(orderId);
        if (mounted) setOrder(res.data);
      } catch {
        toast.error("Failed to load purchase order");
        router.push("/purchases/orders");
      } finally {
        if (mounted) setFetching(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [orderId, firebaseUser, activeOrganization?._id, router]);

  const vendorName = useMemo(() => (order ? getName(order.vendorId) : ""), [order]);
  const orgName = activeOrganization?.name || "";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Print Purchase Order</span>}
          actions={<Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>}
        />

        {fetching || !order ? (
          <div className="flex items-center justify-center h-[70vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-6 bg-muted/20 min-h-screen">
            <div className="mx-auto bg-white border shadow-sm statement-print-area" style={{ width: "920px" }}>
              <div className="p-10">
                <div className="flex justify-between items-start border-b pb-6 mb-6">
                  <div>
                    <p className="text-xs tracking-[0.18em] uppercase text-muted-foreground">Purchase Order</p>
                    <h1 className="text-2xl font-semibold mt-1">{orgName}</h1>
                    <p className="text-sm text-muted-foreground mt-1 max-w-[360px]">Professional purchase order document generated from HAI Accounting.</p>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex px-3 py-1 rounded border text-xs font-semibold uppercase mb-2 print:mb-1 ${statusBadgeClass(order.status)}`}>
                      {order.status}
                    </div>
                    <p className="text-sm text-muted-foreground">PO Number</p>
                    <p className="font-semibold text-base">{order.purchaseOrderNumber}</p>
                    <p className="text-sm text-muted-foreground mt-2">Order Date</p>
                    <p>{new Date(order.purchaseOrderDate).toLocaleDateString("en-IN")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
                  <div className="rounded-md border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Vendor</p>
                    <p className="font-semibold">{vendorName || "-"}</p>
                    {(order.vendorId as any)?.email && <p className="text-muted-foreground mt-1">{(order.vendorId as any).email}</p>}
                  </div>
                  <div className="rounded-md border p-4 space-y-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{order.referenceNumber || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Delivery Date</span><span>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "-"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Items</span><span>{order.lineItems.filter((li) => !li.isHeader).length}</span></div>
                  </div>
                </div>

                <table className="w-full border text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-2.5 border w-10">#</th>
                      <th className="text-left p-2.5 border">Item</th>
                      <th className="text-right p-2.5 border">Qty</th>
                      <th className="text-right p-2.5 border">Rate</th>
                      <th className="text-right p-2.5 border">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.filter((li) => !li.isHeader).map((li, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 border text-center text-muted-foreground">{idx + 1}</td>
                        <td className="p-2.5 border">
                          <div className="font-medium">{li.name}</div>
                          {li.description && <div className="text-xs text-muted-foreground mt-0.5">{li.description}</div>}
                        </td>
                        <td className="p-2.5 border text-right">{li.quantity}</td>
                        <td className="p-2.5 border text-right">{fmt(li.rate)}</td>
                        <td className="p-2.5 border text-right font-medium">{fmt(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-6 ml-auto w-80 space-y-1.5 text-sm rounded border p-4 bg-muted/10">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span>{fmt(order.subTotal)}</span></div>
                  {order.discountAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{fmt(order.discountAmount)}</span></div>}
                  {order.taxAmount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{order.taxType}</span><span>-{fmt(order.taxAmount)}</span></div>}
                  {order.adjustmentAmount !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">{order.adjustmentLabel || "Adjustment"}</span><span>{fmt(order.adjustmentAmount)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-2 text-base"><span>Total</span><span>{fmt(order.total)}</span></div>
                </div>

                {order.notes && (
                  <div className="mt-8 rounded border p-4">
                    <p className="text-sm font-semibold">Notes</p>
                    <p className="text-sm text-muted-foreground mt-1">{order.notes}</p>
                  </div>
                )}

                <div className="mt-10 pt-6 border-t text-xs text-muted-foreground flex justify-between">
                  <span>Generated on {new Date().toLocaleDateString("en-IN")}</span>
                  <span>Authorized Signature ________________________</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
