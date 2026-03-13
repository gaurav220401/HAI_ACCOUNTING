"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2, RefreshCw,
  ShoppingBag, ChevronDown,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { purchaseOrderApi, type PurchaseOrder, type PurchaseOrderStatus } from "@/lib/api/purchase-orders";
import { cn } from "@/lib/utils";

const fmt = (v: number, cur = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);

const statusColor: Record<PurchaseOrderStatus, string> = {
  Draft:  "bg-gray-100 text-gray-600",
  Open:   "bg-blue-100 text-blue-700",
  Billed: "bg-green-100 text-green-700",
  Closed: "bg-slate-100 text-slate-600",
};

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | PurchaseOrderStatus>("");
  const [toDelete, setToDelete] = useState<PurchaseOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchOrders = useCallback(async () => {
    setFetching(true);
    try {
      const res = await purchaseOrderApi.list({ page: 1, limit: 100 });
      setOrders(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchOrders();
  }, [firebaseUser, loading, activeOrganization?._id, fetchOrders]);

  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [o.purchaseOrderNumber, o.referenceNumber || "", getName(o.vendorId)].some((v) => v.toLowerCase().includes(s));
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await purchaseOrderApi.remove(toDelete._id);
      toast.success("Purchase order deleted");
      setOrders((prev) => prev.filter((o) => o._id !== toDelete._id));
    } catch { toast.error("Failed to delete"); } finally { setDeleting(false); setToDelete(null); }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Purchases <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Purchase Orders</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <div className="relative w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    {filterStatus || "All Orders"} <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-36">
                  <DropdownMenuItem onClick={() => setFilterStatus("")}>All Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Draft")}>Draft</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Open")}>Open</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Billed")}>Billed</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilterStatus("Closed")}>Closed</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => router.push("/purchases/orders/new")}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchOrders}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        />

        <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
          {fetching ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 && !search && !filterStatus ? (
            <div className="flex-1 overflow-auto">
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <h2 className="text-2xl font-semibold text-foreground mb-2">Start Managing Your Purchase Activities!</h2>
                <p className="text-muted-foreground text-sm mb-8">Create, customize, and send professional Purchase Orders to your vendors.</p>
                <Button className="px-8 py-2.5 text-sm font-semibold uppercase tracking-wide" onClick={() => router.push("/purchases/orders/new")}>
                  Create New Purchase Order
                </Button>
                <div className="mt-14 w-full max-w-2xl">
                  <p className="text-sm font-medium text-muted-foreground mb-6">Life cycle of a Purchase Order</p>
                  <div className="flex items-center justify-center gap-0">
                    {[
                      { icon: "🛒", label: "RAISE PURCHASE ORDER" },
                      { label: "CONVERT TO OPEN", dash: true },
                      { icon: "📦", label: "RECEIVE GOODS" },
                      { label: "CONVERT TO BILL", dash: true },
                      { icon: "🧾", label: "RECORD PAYMENT" },
                    ].map((step, i) =>
                      step.dash ? (
                        <div key={i} className="flex items-center gap-0">
                          <div className="w-8 border-t border-dashed border-gray-400" />
                          <div className="bg-white border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-500 max-w-[90px] text-center leading-tight">{step.label}</div>
                          <div className="w-8 border-t border-dashed border-gray-400" />
                        </div>
                      ) : (
                        <div key={i} className="flex flex-col items-center bg-white border border-gray-300 rounded-md px-4 py-3 text-xs font-medium text-gray-600 min-w-[110px]">
                          <span className="text-xl mb-1">{step.icon}</span>
                          <span className="text-center leading-tight">{step.label}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
                <div className="mt-10 max-w-md text-left">
                  <p className="text-sm font-medium mb-3">In the Purchase Orders module, you can:</p>
                  <ul className="space-y-2">
                    {[
                      "Create and send a purchase order to your vendors when you are in need of a product.",
                      "Convert the purchase order into a bill after you receive an invoice for your purchase.",
                      "Set conditions that determine when a purchase order is marked as closed.",
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="text-blue-500 mt-0.5">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm">No purchase orders match your filter.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5 font-medium">PO Number</th>
                    <th className="text-left px-4 py-2.5 font-medium">Vendor</th>
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o) => (
                    <tr
                      key={o._id}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => router.push(`/purchases/orders/${o._id}`)}
                    >
                      <td className="px-4 py-2.5 font-medium text-primary">{o.purchaseOrderNumber}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{getName(o.vendorId) || "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {new Date(o.purchaseOrderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColor[o.status])}>{o.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{fmt(o.total)}</td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => router.push(`/purchases/orders/${o._id}/edit`)}>Edit</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(o)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
              <AlertDialogDescription>
                {toDelete?.purchaseOrderNumber} will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
