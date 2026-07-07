"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { purchaseReceiveApi, type PurchaseReceive } from "@/lib/api/purchase-receives";
import { cn } from "@/lib/utils";

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

function TableSkeleton() {
  return (
    <div className="flex-1 overflow-auto animate-pulse">
      <div className="grid text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b bg-slate-50" style={{ gridTemplateColumns: "150px 150px 1fr 120px 100px 100px 120px" }}>
        <div className="px-4 py-2.5">Receive #</div>
        <div className="px-4 py-2.5">Order #</div>
        <div className="px-4 py-2.5">Vendor</div>
        <div className="px-4 py-2.5">Date</div>
        <div className="px-4 py-2.5 text-right">Qty</div>
        <div className="px-4 py-2.5 text-center">Putaway</div>
        <div className="px-4 py-2.5 text-right">Actions</div>
      </div>
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="grid border-t border-slate-100 items-center" style={{ gridTemplateColumns: "150px 150px 1fr 120px 100px 100px 120px" }}>
          <div className="px-4 py-3.5"><div className="h-3.5 w-20 bg-slate-100 rounded" /></div>
          <div className="px-4 py-3.5"><div className="h-3.5 w-20 bg-slate-100 rounded" /></div>
          <div className="px-4 py-3.5"><div className="h-3.5 w-40 bg-slate-100 rounded" /></div>
          <div className="px-4 py-3.5"><div className="h-3.5 w-16 bg-slate-100 rounded" /></div>
          <div className="px-4 py-3.5 text-right"><div className="h-3.5 w-8 bg-slate-100 rounded ml-auto" /></div>
          <div className="px-4 py-3.5 text-center"><div className="h-3.5 w-16 bg-slate-100 rounded mx-auto" /></div>
          <div className="px-4 py-3.5 text-right"><div className="h-3.5 w-16 bg-slate-100 rounded ml-auto" /></div>
        </div>
      ))}
    </div>
  );
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
      <SidebarInset className="bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Purchases</span>
              <span className="text-sm font-bold text-slate-900 leading-none mt-0.5">Purchase Receives</span>
            </div>
          }
          actions={
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-8"
              onClick={() => router.push("/purchases/orders")}
            >
              <Plus className="h-4 w-4 mr-1.5" /> New from Purchase Order
            </Button>
          }
        />

        <div className="p-6">
          <div className="mb-4 max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receive/order/vendor..."
              className="h-9 text-sm"
            />
          </div>

          <div className="rounded-lg border border-slate-100 overflow-hidden bg-white shadow-2xs">
            {fetching ? (
              <TableSkeleton />
            ) : filtered.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center gap-1.5 text-sm text-muted-foreground bg-white">
                No purchase receives found.
              </div>
            ) : (
              <>
                <div className="grid text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b bg-slate-50" style={{ gridTemplateColumns: "150px 150px 1fr 120px 100px 100px 120px" }}>
                  <div className="px-4 py-2.5">Receive #</div>
                  <div className="px-4 py-2.5">Order #</div>
                  <div className="px-4 py-2.5">Vendor</div>
                  <div className="px-4 py-2.5">Date</div>
                  <div className="px-4 py-2.5 text-right">Qty</div>
                  <div className="px-4 py-2.5 text-center">Putaway</div>
                  <div className="px-4 py-2.5 text-right">Actions</div>
                </div>
                {filtered.map((row: any) => (
                  <div key={row._id} className="grid border-t border-slate-100 text-sm hover:bg-teal-50/30 transition-colors items-center" style={{ gridTemplateColumns: "150px 150px 1fr 120px 100px 100px 120px" }}>
                    <div className="px-4 py-3 font-semibold text-teal-700 hover:text-teal-800 cursor-pointer">{row.purchaseReceiveNumber}</div>
                    <div className="px-4 py-3 text-slate-600">{row.purchaseOrderNumber}</div>
                    <div className="px-4 py-3 font-medium text-slate-700">{getName(row.vendorId) || "-"}</div>
                    <div className="px-4 py-3 text-slate-500">{new Date(row.receivedDate).toLocaleDateString("en-IN")}</div>
                    <div className="px-4 py-3 text-right font-medium">{row.totalQuantityReceived}</div>
                    <div className="px-4 py-3 text-center">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                        row.putawayStatus === "Completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      )}>
                        <span className={cn(
                          "h-1 w-1 rounded-full",
                          row.putawayStatus === "Completed" ? "bg-emerald-500" : "bg-amber-500"
                        )} />
                        {row.putawayStatus || "Pending"}
                      </span>
                    </div>
                    <div className="px-4 py-3 text-right">
                      {row.status === "Received" && row.putawayStatus !== "Completed" && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-7 text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                          onClick={() => router.push(`/inventory/putaways/new?receiveId=${row._id}`)}
                        >
                          Putaway
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
