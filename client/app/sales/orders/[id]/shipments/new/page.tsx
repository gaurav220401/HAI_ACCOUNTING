"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import { packageApi, type Package } from "@/lib/api/packages";

function getItemId(item: SalesOrder["lineItems"][number]["itemId"]): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item._id || "";
}

export default function NewShipmentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const orderId = params.id;
  const shipmentMode = searchParams.get("mode") || "manual";

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  const [shipmentOrderNumber, setShipmentOrderNumber] = useState("");
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState(shipmentMode === "carrier" ? "Default Carrier" : "");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [shippingCharges, setShippingCharges] = useState("");
  const [notes, setNotes] = useState("");
  const [shipmentAlreadyDelivered, setShipmentAlreadyDelivered] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!orderId || !firebaseUser) return;
      setFetching(true);
      try {
        const [orderRes, pkgRes] = await Promise.all([
          salesOrderApi.getById(orderId),
          packageApi.listByOrder(orderId),
        ]);

        if (!mounted) return;
        setOrder(orderRes.data);
        setPackages(pkgRes.data || []);
        setShipmentOrderNumber(`SHP-${orderRes.data.salesOrderNumber}-${(pkgRes.data || []).length + 1}`);
      } catch {
        toast.error("Failed to load shipment form");
        router.push(`/sales/orders/${orderId}`);
      } finally {
        if (mounted) setFetching(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [orderId, firebaseUser, router]);

  const remainingPackageLines = useMemo(() => {
    if (!order) return [] as Array<{ itemId: string; name: string; ordered: number; packed: number; quantityToPack: number }>;

    const packedQtyMap: Record<string, number> = {};
    packages.forEach((pkg) => {
      pkg.lineItems.forEach((li) => {
        const iid = typeof li.itemId === "object" ? li.itemId._id : li.itemId;
        packedQtyMap[iid] = (packedQtyMap[iid] || 0) + (li.quantityToPack || 0);
      });
    });

    return order.lineItems
      .map((li) => {
        const iid = getItemId(li.itemId);
        const packed = packedQtyMap[iid] || 0;
        const ordered = Number(li.quantity) || 0;
        return {
          itemId: iid,
          name: li.name || (typeof li.itemId === "object" ? li.itemId?.name : "") || "Item",
          ordered,
          packed,
          quantityToPack: Math.max(0, ordered - packed),
        };
      })
      .filter((li) => li.itemId && li.quantityToPack > 0);
  }, [order, packages]);

  async function handleSave() {
    if (!order) return;
    if (!shipmentOrderNumber.trim()) {
      toast.error("Shipment Order# is required");
      return;
    }

    setSaving(true);
    try {
      if (remainingPackageLines.length > 0) {
        await packageApi.create({
          salesOrderId: order._id,
          packageSlipNumber: `PKG-${order.salesOrderNumber}-${packages.length + 1}`,
          date: shipDate,
          internalNotes: notes || `Auto package for shipment ${shipmentOrderNumber}`,
          lineItems: remainingPackageLines,
        });
      }

      await salesOrderApi.updateShipment(
        order._id,
        shipmentAlreadyDelivered ? "Delivered" : "Shipped",
      );

      const shipCharge = Number(shippingCharges);
      if (!Number.isNaN(shipCharge) && shipCharge > 0) {
        await salesOrderApi.update(order._id, { shippingCharges: shipCharge });
      }

      toast.success("Shipment saved successfully");
      router.push(`/sales/orders/${order._id}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save shipment");
    } finally {
      setSaving(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
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
              Sales Orders <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New Shipment</span>
            </span>
          }
        />

        <div className="p-6 max-w-4xl">
          <div className="rounded-lg border bg-card p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-red-600">Package Number</Label>
                <Input value={`PKG-${order?.salesOrderNumber || ""}-${packages.length + 1}`} readOnly className="mt-1" />
              </div>
              <div>
                <Label className="text-red-600">Shipment Order Number</Label>
                <Input value={shipmentOrderNumber} onChange={(e) => setShipmentOrderNumber(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-red-600">Ship Date</Label>
                <Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-red-600">Carrier</Label>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Select or type a carrier" className="mt-1" />
              </div>
              <div>
                <Label>Tracking Number</Label>
                <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Tracking URL</Label>
                <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Shipping Charges (if any)</Label>
                <Input value={shippingCharges} onChange={(e) => setShippingCharges(e.target.value)} placeholder="0" className="mt-1" />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="shipment-delivered"
                  checked={shipmentAlreadyDelivered}
                  onCheckedChange={(checked) => setShipmentAlreadyDelivered(Boolean(checked))}
                />
                <Label htmlFor="shipment-delivered">Shipment already delivered</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Remaining items to package: {remainingPackageLines.reduce((s, li) => s + li.quantityToPack, 0)}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Save
              </Button>
              <Button variant="outline" onClick={() => router.push(`/sales/orders/${orderId}`)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
