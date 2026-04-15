"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { purchaseReceiveApi, type PurchaseReceiveFromPoLine } from "@/lib/api/purchase-receives";

type ReceiveLine = PurchaseReceiveFromPoLine & { quantityReceived: number };

function NewPurchaseReceivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purchaseOrderId = searchParams.get("purchaseOrderId") || "";

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchaseReceiveNumber, setPurchaseReceiveNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [poData, setPoData] = useState<any>(null);
  const [lines, setLines] = useState<ReceiveLine[]>([]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!purchaseOrderId) {
      toast.error("Purchase order is required to create a purchase receive");
      router.push("/purchases/orders");
      return;
    }

    let mounted = true;
    (async () => {
      setFetching(true);
      try {
        const [numRes, poRes] = await Promise.all([
          purchaseReceiveApi.getNextNumber(),
          purchaseReceiveApi.getFromPurchaseOrder(purchaseOrderId),
        ]);

        if (!mounted) return;
        setPurchaseReceiveNumber(numRes.data.purchaseReceiveNumber);
        setPoData(poRes.data);

        const lineRows = (poRes.data.lineItems || [])
          .filter((l: PurchaseReceiveFromPoLine) => !l.isHeader)
          .map((l: PurchaseReceiveFromPoLine) => ({
            ...l,
            quantityReceived: Number(l.quantityToReceive || 0),
          }));

        setLines(lineRows);
      } catch {
        toast.error("Failed to load purchase order details for receive");
        router.push("/purchases/orders");
      } finally {
        if (mounted) setFetching(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [purchaseOrderId, router]);

  const totalReceivedQty = useMemo(() => {
    return lines.reduce((sum, line) => sum + Number(line.quantityReceived || 0), 0);
  }, [lines]);

  function updateLine(index: number, nextQty: number) {
    setLines((prev) => {
      const clone = [...prev];
      const row = clone[index];
      if (!row) return prev;
      const maxQty = Number(row.quantityToReceive || 0);
      row.quantityReceived = Math.max(0, Math.min(maxQty, Number.isFinite(nextQty) ? nextQty : 0));
      return clone;
    });
  }

  async function handleSave() {
    if (!poData?.purchaseOrder?._id) {
      toast.error("Invalid purchase order context");
      return;
    }

    const validLines = lines.filter((l) => Number(l.quantityReceived) > 0);
    if (validLines.length === 0) {
      toast.error("Enter receive quantity for at least one item");
      return;
    }

    setSaving(true);
    try {
      await purchaseReceiveApi.create({
        purchaseOrderId: poData.purchaseOrder._id,
        purchaseReceiveNumber,
        receivedDate,
        notes,
        status: "Received",
        lineItems: validLines.map((l) => ({
          purchaseOrderLineItemId: l.purchaseOrderLineItemId || null,
          itemId: l.itemId || null,
          name: l.name,
          description: l.description || "",
          quantityToReceive: Number(l.quantityToReceive || 0),
          quantityReceived: Number(l.quantityReceived || 0),
          rate: Number(l.rate || 0),
          unit: l.unit || "",
        })),
      });

      toast.success("Purchase receive created and inventory updated");
      router.push("/purchases/receives");
    } catch {
      toast.error("Failed to create purchase receive");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">New Purchase Receive</span>}
        />

        {fetching ? (
          <div className="h-[70vh] flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading purchase order details...
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Purchase Receive #</Label>
                <Input value={purchaseReceiveNumber} onChange={(e) => setPurchaseReceiveNumber(e.target.value)} />
              </div>
              <div>
                <Label>Received Date</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              </div>
              <div>
                <Label>Purchase Order #</Label>
                <Input value={poData?.purchaseOrder?.purchaseOrderNumber || ""} disabled />
              </div>
            </div>

            <div className="rounded border bg-white overflow-hidden">
              <div className="grid text-xs uppercase tracking-wide text-muted-foreground bg-muted/30" style={{ gridTemplateColumns: "1fr 130px 130px 130px" }}>
                <div className="px-3 py-2">Item</div>
                <div className="px-3 py-2 text-right">Ordered</div>
                <div className="px-3 py-2 text-right">Pending</div>
                <div className="px-3 py-2 text-right">Receive Now</div>
              </div>
              {lines.map((line, idx) => (
                <div key={`${line.purchaseOrderLineItemId || line.itemId || idx}`} className="grid border-t items-center text-sm" style={{ gridTemplateColumns: "1fr 130px 130px 130px" }}>
                  <div className="px-3 py-2.5">
                    <div className="font-medium">{line.name}</div>
                    {line.description ? <div className="text-xs text-muted-foreground">{line.description}</div> : null}
                  </div>
                  <div className="px-3 py-2.5 text-right">{line.quantityOrdered}</div>
                  <div className="px-3 py-2.5 text-right">{line.quantityToReceive}</div>
                  <div className="px-3 py-2.5">
                    <Input
                      type="number"
                      min={0}
                      max={line.quantityToReceive}
                      value={line.quantityReceived}
                      onChange={(e) => updateLine(idx, Number(e.target.value))}
                      className="h-8 text-right"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">Total quantity to receive now: <span className="font-semibold text-foreground">{totalReceivedQty}</span></div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal receive notes" />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save as Received
              </Button>
              <Button variant="outline" onClick={() => router.push("/purchases/orders")}>Cancel</Button>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function NewPurchaseReceivePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading purchase receive form...</div>}>
      <NewPurchaseReceivePageContent />
    </Suspense>
  );
}
