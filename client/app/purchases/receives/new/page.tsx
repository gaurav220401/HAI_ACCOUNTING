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

function FormSkeleton() {
  return (
    <div className="p-6 space-y-6 max-w-5xl animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 bg-slate-200 rounded" />
            <div className="h-9 w-full bg-slate-100 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-24 bg-slate-200 rounded" />
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="h-10 bg-slate-50 border-b" />
          <div className="p-4 space-y-3">
            <div className="h-8 bg-slate-100 rounded" />
            <div className="h-8 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-16 bg-slate-200 rounded" />
        <div className="h-20 w-full bg-slate-100 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-32 bg-slate-200 rounded" />
        <div className="h-9 w-20 bg-slate-100 rounded" />
      </div>
    </div>
  );
}

export default function NewPurchaseReceivePage() {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <NewPurchaseReceivePageContent />
    </Suspense>
  );
}

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
    if (!poData?.purchaseOrder?.id && !poData?.purchaseOrder?._id) {
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
        purchaseOrderId: poData.purchaseOrder._id || poData.purchaseOrder.id,
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
      <SidebarInset className="bg-white flex flex-col h-svh overflow-auto">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">New Purchase Receive</span>
            </div>
          }
        />

        {fetching ? (
          <FormSkeleton />
        ) : (
          <div className="p-6 space-y-6 max-w-5xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Purchase Receive Number</Label>
                <Input value={purchaseReceiveNumber} onChange={(e) => setPurchaseReceiveNumber(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Received Date</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Purchase Order Number</Label>
                <Input value={poData?.purchaseOrder?.purchaseOrderNumber || ""} disabled className="h-9 text-sm bg-slate-50" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-700">Receive Items</Label>
              <div className="rounded-lg border border-slate-100 bg-white overflow-hidden shadow-2xs">
                <div className="grid text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b bg-slate-50" style={{ gridTemplateColumns: "1fr 130px 130px 130px" }}>
                  <div className="px-4 py-2.5">Item</div>
                  <div className="px-4 py-2.5 text-right">Ordered</div>
                  <div className="px-4 py-2.5 text-right">Pending</div>
                  <div className="px-4 py-2.5 text-right">Receive Now</div>
                </div>
                {lines.map((line, idx) => (
                  <div key={`${line.purchaseOrderLineItemId || line.itemId || idx}`} className="grid border-t border-slate-100 items-center text-sm hover:bg-teal-50/10 transition-colors" style={{ gridTemplateColumns: "1fr 130px 130px 130px" }}>
                    <div className="px-4 py-3">
                      <div className="font-semibold text-slate-700">{line.name}</div>
                      {line.description ? <div className="text-xs text-muted-foreground mt-0.5">{line.description}</div> : null}
                    </div>
                    <div className="px-4 py-3 text-right text-slate-600">{line.quantityOrdered}</div>
                    <div className="px-4 py-3 text-right font-medium text-slate-700">{line.quantityToReceive}</div>
                    <div className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        max={line.quantityToReceive}
                        value={line.quantityReceived}
                        onChange={(e) => updateLine(idx, Number(e.target.value))}
                        className="h-8 text-right text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm text-slate-500">Total quantity to receive now: <span className="font-semibold text-slate-900">{totalReceivedQty}</span></div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal receive notes..." className="text-sm min-h-[80px]" />
            </div>

            <div className="flex gap-3 border-t border-slate-100 pt-5">
              <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-9 px-5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save as Received
              </Button>
              <Button variant="outline" onClick={() => router.push("/purchases/orders")} className="border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md h-9 px-5">Cancel</Button>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
