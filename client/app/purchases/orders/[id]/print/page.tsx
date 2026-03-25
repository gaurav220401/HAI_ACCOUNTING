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
            <div className="mx-auto bg-white border shadow-sm" style={{ width: "900px" }}>
              <div className="p-10">
                <div className="flex justify-between items-start border-b pb-6 mb-6">
                  <div>
                    <h1 className="text-xl font-semibold">{orgName}</h1>
                    <p className="text-sm text-muted-foreground mt-1">Purchase Order</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">PO Number</p>
                    <p className="font-semibold">{order.purchaseOrderNumber}</p>
                    <p className="text-sm text-muted-foreground mt-2">Date</p>
                    <p>{new Date(order.purchaseOrderDate).toLocaleDateString("en-IN")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <p className="font-medium">{vendorName || "-"}</p>
                    {(order.vendorId as any)?.email && <p className="text-sm">{(order.vendorId as any).email}</p>}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reference</p>
                    <p>{order.referenceNumber || "-"}</p>
                    <p className="text-sm text-muted-foreground mt-2">Delivery Date</p>
                    <p>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString("en-IN") : "-"}</p>
                  </div>
                </div>

                <table className="w-full border text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left p-2 border">Item</th>
                      <th className="text-right p-2 border">Qty</th>
                      <th className="text-right p-2 border">Rate</th>
                      <th className="text-right p-2 border">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.filter((li) => !li.isHeader).map((li, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border">{li.name}</td>
                        <td className="p-2 border text-right">{li.quantity}</td>
                        <td className="p-2 border text-right">{fmt(li.rate)}</td>
                        <td className="p-2 border text-right">{fmt(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-6 ml-auto w-72 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Sub Total</span><span>{fmt(order.subTotal)}</span></div>
                  {order.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmt(order.discountAmount)}</span></div>}
                  {order.taxAmount > 0 && <div className="flex justify-between"><span>{order.taxType}</span><span>-{fmt(order.taxAmount)}</span></div>}
                  {order.adjustmentAmount !== 0 && <div className="flex justify-between"><span>{order.adjustmentLabel || "Adjustment"}</span><span>{fmt(order.adjustmentAmount)}</span></div>}
                  <div className="flex justify-between font-semibold border-t pt-2"><span>Total</span><span>{fmt(order.total)}</span></div>
                </div>

                {order.notes && (
                  <div className="mt-8">
                    <p className="text-sm font-medium">Notes</p>
                    <p className="text-sm text-muted-foreground">{order.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
