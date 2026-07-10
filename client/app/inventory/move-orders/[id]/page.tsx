"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  MoreHorizontal,
  CheckCircle2,
  Truck,
  PackageCheck,
  XCircle,
  FileText,
  Clock,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { moveOrderApi, type MoveOrder, type MoveOrderStatus } from "@/lib/api/move-orders";

export default function MoveOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [order, setOrder] = useState<MoveOrder | null>(null);
  const [fetching, setFetching] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (id) {
      void fetchOrder();
    }
  }, [id]);

  async function fetchOrder() {
    setFetching(true);
    try {
      const res = await moveOrderApi.getById(id!);
      setOrder(res.data);
    } catch {
      toast.error("Failed to fetch move order details");
    } finally {
      setFetching(false);
    }
  }

  async function handleStatusUpdate(status: MoveOrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      await moveOrderApi.updateStatus(order._id, status);
      toast.success(`Move order marked as ${status}`);
      await fetchOrder();
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  const getStatusBadge = (status: MoveOrderStatus) => {
    switch (status) {
      case "Draft": 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            <span className="h-1 w-1 rounded-full bg-slate-400" />
            {status}
          </span>
        );
      case "Sent": 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
            <span className="h-1 w-1 rounded-full bg-amber-500" />
            Pending
          </span>
        );
      case "In Transit": 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-100">
            <span className="h-1 w-1 rounded-full bg-purple-500" />
            In Transit
          </span>
        );
      case "Received": 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
            <span className="h-1 w-1 rounded-full bg-emerald-500" />
            Received
          </span>
        );
      case "Cancelled": 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
            <span className="h-1 w-1 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default: 
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
            <span className="h-1 w-1 rounded-full bg-slate-400" />
            {status}
          </span>
        );
    }
  };

  const getWarehouseName = (w: any) => {
    if (!w) return "—";
    return typeof w === "string" ? w : w.name || "—";
  };

  if (fetching && !order) {
    return (
      <InventoryShell title="Move Order Details">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </InventoryShell>
    );
  }

  if (!order) {
    return (
      <InventoryShell title="Move Order Details">
        <div className="p-10 text-center">
          <p className="text-muted-foreground">Move Order not found.</p>
          <Button variant="link" onClick={() => router.push("/inventory/move-orders")}>
            Back to Move Orders
          </Button>
        </div>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title={order.orderNumber}
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={() => router.push("/inventory/move-orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md" onClick={fetchOrder} disabled={updating}>
            <RefreshCw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-muted/20 p-4 rounded-lg border">
          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Status</div>
              <div>{getStatusBadge(order.status)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Date</div>
              <div className="font-medium">{new Date(order.date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Source</div>
              <div className="font-medium text-teal-700">{getWarehouseName(order.fromWarehouseId)}</div>
            </div>
            <div className="space-y-1 text-center">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-4" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Destination</div>
              <div className="font-medium text-emerald-700">{getWarehouseName(order.toWarehouseId)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {order.status === "Draft" && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" onClick={() => handleStatusUpdate("Sent")} disabled={updating}>
                <Truck className="h-4 w-4 mr-2" /> Mark as Sent
              </Button>
            )}
            {order.status === "Sent" && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" onClick={() => handleStatusUpdate("In Transit")} disabled={updating}>
                <Truck className="h-4 w-4 mr-2" /> Mark In Transit
              </Button>
            )}
            {(order.status === "Sent" || order.status === "In Transit") && (
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" onClick={() => handleStatusUpdate("Received")} disabled={updating}>
                <PackageCheck className="h-4 w-4 mr-2" /> Mark Received
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleStatusUpdate("Cancelled")} disabled={order.status === "Received" || order.status === "Cancelled" || updating}>
                  <XCircle className="h-4 w-4 mr-2 text-destructive" /> Cancel Order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                  <FileText className="h-4 w-4 mr-2" /> Print Slip
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <PackageCheck className="h-5 w-5 mr-2 text-teal-600" />
                Items being Transferred
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left">
                    <tr>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">Item Details</th>
                      <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((li, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-700">{typeof li.itemId === 'object' ? li.itemId.name : 'Unknown Item'}</div>
                          {typeof li.itemId === 'object' && li.itemId.sku && (
                            <div className="text-xs text-slate-400">SKU: {li.itemId.sku}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">
                          {Number(li.quantity).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-teal-600" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                       <div className="text-sm font-medium">Order Created</div>
                       <div className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</div>
                    </div>
                 </div>
                 {order.status !== "Draft" && (
                    <div className="flex items-start gap-3">
                       <div className="h-2 w-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                       <div>
                          <div className="text-sm font-medium">Marked as Sent</div>
                          <div className="text-xs text-muted-foreground">Ready for dispatch from source</div>
                       </div>
                    </div>
                 )}
                 {order.status === "Received" && (
                    <div className="flex items-start gap-3">
                       <div className="h-2 w-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                       <div>
                          <div className="text-sm font-medium">Stock Received</div>
                          <div className="text-xs text-muted-foreground">Inventory updated at {getWarehouseName(order.toWarehouseId)}</div>
                       </div>
                    </div>
                 )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-teal-600" />
                  Additional Details
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-4">
                 <div>
                    <div className="text-muted-foreground mb-1">Reference Number</div>
                    <div className="font-medium">{order.referenceNumber || "—"}</div>
                 </div>
                 <div>
                    <div className="text-muted-foreground mb-1">Notes</div>
                    <div className="p-3 bg-muted/30 rounded border whitespace-pre-wrap italic">
                       {order.notes || "No notes provided for this transfer."}
                    </div>
                 </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </InventoryShell>
  );
}
