"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { purchaseReceiveApi, type PurchaseReceive } from "@/lib/api/purchase-receives";

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

export default function PurchaseReceivesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [rows, setRows] = useState<PurchaseReceive[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser) return;
    void loadData();
  }, [firebaseUser]);

  async function loadData() {
    setFetching(true);
    try {
      const res = await purchaseReceiveApi.list({ page: 1, limit: 200 });
      setRows(res.data || []);
    } catch {
      toast.error("Failed to load purchase receives");
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.purchaseReceiveNumber,
        r.purchaseOrderNumber,
        getName(r.vendorId),
        r.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Purchase Receives</span>}
          actions={
            <Button size="sm" onClick={() => router.push("/purchases/orders")}>
              <Plus className="h-4 w-4 mr-2" /> New from Purchase Order
            </Button>
          }
        />

        <div className="p-4">
          <div className="mb-3 max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receive/order/vendor"
            />
          </div>

          <div className="rounded border overflow-hidden bg-white">
            <div className="grid text-xs uppercase tracking-wide text-muted-foreground bg-muted/30" style={{ gridTemplateColumns: "180px 180px 1fr 140px 140px 120px" }}>
              <div className="px-3 py-2">Receive #</div>
              <div className="px-3 py-2">Order #</div>
              <div className="px-3 py-2">Vendor</div>
              <div className="px-3 py-2">Received Date</div>
              <div className="px-3 py-2 text-right">Total Qty</div>
              <div className="px-3 py-2">Status</div>
            </div>

            {fetching ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading purchase receives...
              </div>
            ) : filtered.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                No purchase receives found.
              </div>
            ) : (
              filtered.map((row) => (
                <div key={row._id} className="grid border-t text-sm hover:bg-muted/20" style={{ gridTemplateColumns: "180px 180px 1fr 140px 140px 120px" }}>
                  <div className="px-3 py-2.5 font-medium text-primary">{row.purchaseReceiveNumber}</div>
                  <div className="px-3 py-2.5">{row.purchaseOrderNumber}</div>
                  <div className="px-3 py-2.5">{getName(row.vendorId) || "-"}</div>
                  <div className="px-3 py-2.5">{new Date(row.receivedDate).toLocaleDateString("en-IN")}</div>
                  <div className="px-3 py-2.5 text-right">{row.totalQuantityReceived}</div>
                  <div className="px-3 py-2.5">{row.status}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
