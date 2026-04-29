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
      case "Draft": return <Badge variant="secondary" className="px-3 py-1">{status}</Badge>;
      case "Sent": return <Badge variant="outline" className="px-3 py-1 border-blue-500 text-blue-600">{status}</Badge>;
      case "In Transit": return <Badge variant="outline" className="px-3 py-1 border-orange-500 text-orange-600">{status}</Badge>;
      case "Received": return <Badge variant="success" className="px-3 py-1">{status}</Badge>;
      case "Cancelled": return <Badge variant="destructive" className="px-3 py-1">{status}</Badge>;
      default: return <Badge className="px-3 py-1">{status}</Badge>;
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
          <Button variant="outline" size="sm" onClick={() => router.push("/inventory/move-orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrder} disabled={updating}>
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
              <div className="font-medium text-blue-600">{getWarehouseName(order.fromWarehouseId)}</div>
            </div>
            <div className="space-y-1 text-center">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground mt-4" />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase font-semibold">Destination</div>
              <div className="font-medium text-emerald-600">{getWarehouseName(order.toWarehouseId)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {order.status === "Draft" && (
              <Button size="sm" onClick={() => handleStatusUpdate("Sent")} disabled={updating}>
                <Truck className="h-4 w-4 mr-2" /> Mark as Sent
              </Button>
            )}
            {order.status === "Sent" && (
              <Button size="sm" onClick={() => handleStatusUpdate("In Transit")} disabled={updating}>
                <Truck className="h-4 w-4 mr-2" /> Mark In Transit
              </Button>
            )}
            {(order.status === "Sent" || order.status === "In Transit") && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleStatusUpdate("Received")} disabled={updating}>
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
                <PackageCheck className="h-5 w-5 mr-2 text-primary" />
                Items being Transferred
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 font-semibold">Item Details</th>
                      <th className="text-right py-3 font-semibold">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((li, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-4">
                          <div className="font-medium">{typeof li.itemId === 'object' ? li.itemId.name : 'Unknown Item'}</div>
                          {typeof li.itemId === 'object' && li.itemId.sku && (
                            <div className="text-xs text-muted-foreground">SKU: {li.itemId.sku}</div>
                          )}
                        </td>
                        <td className="py-4 text-right tabular-nums font-medium">
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
                  <Clock className="h-5 w-5 mr-2 text-primary" />
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
                   <FileText className="h-5 w-5 mr-2 text-primary" />
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
