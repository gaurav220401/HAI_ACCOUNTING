"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Loader2, Package as PackageIcon } from "lucide-react";

import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import { packageApi } from "@/lib/api/packages";
import { itemApi, type Item } from "@/lib/api/items";

interface PackItem {
  itemId: string;
  name: string;
  ordered: number;
  packed: number;
  quantityToPack: number;
  stockOnHand: number;
}

export default function NewPackagePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [items, setItems] = useState<PackItem[]>([]);
  
  const [packageSlipNumber, setPackageSlipNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [internalNotes, setInternalNotes] = useState("");
  
  const [dimLength, setDimLength] = useState("");
  const [dimWidth, setDimWidth] = useState("");
  const [dimHeight, setDimHeight] = useState("");
  const [dimUnit, setDimUnit] = useState("cm");
  
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");

  useEffect(() => {
    if (!orderId) return;
    async function load() {
      try {
        const [orderRes, pkgRes, itemsRes] = await Promise.all([
          salesOrderApi.getById(orderId!),
          packageApi.listByOrder(orderId!),
          itemApi.list({ limit: 1000 }), // In a real app we'd fetch specific items
        ]);
        
        const so = orderRes.data;
        const pkgs = pkgRes.data || [];
        const inventoryItems = itemsRes.data || [];
        
        setOrder(so);
        setPackageSlipNumber(`PKG-${so.salesOrderNumber}-${pkgs.length + 1}`);

        // Calculate already packed quantities
        const packedQtyMap: Record<string, number> = {};
        pkgs.forEach(p => {
          p.lineItems.forEach(li => {
            const iid = typeof li.itemId === "object" ? li.itemId._id : li.itemId;
            packedQtyMap[iid] = (packedQtyMap[iid] || 0) + li.quantityToPack;
          });
        });

        // Setup items to pack
        const packItems: PackItem[] = so.lineItems.map(li => {
          const iid = (typeof li.itemId === "object" ? li.itemId?._id : (li.itemId as string)) || "";
          const alreadyPacked = packedQtyMap[iid] || 0;
          const invItem = inventoryItems.find(i => i._id === iid);
          
          return {
            itemId: iid,
            name: li.name || (typeof li.itemId === "object" ? li.itemId?.name : "Item") || "Item",
            ordered: li.quantity,
            packed: alreadyPacked,
            quantityToPack: Math.max(0, li.quantity - alreadyPacked),
            stockOnHand: invItem?.stockOnHand || 0,
          };
        });

        setItems(packItems);
      } catch (err) {
        toast.error("Failed to load sales order details");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  const totalItems = items.reduce((acc, curr) => acc + curr.quantityToPack, 0);

  async function handleSave() {
    if (!packageSlipNumber.trim()) {
      toast.error("Package Slip Number is required");
      return;
    }
    
    if (totalItems <= 0) {
      toast.error("You must pack at least one item.");
      return;
    }

    // Validate stock
    const stockErrors = items.filter(i => i.quantityToPack > i.stockOnHand);
    if (stockErrors.length > 0) {
      const names = stockErrors.map(e => e.name).join(", ");
      if (!confirm(`Warning: You are trying to pack items that exceed physical stock on hand (${names}). Do you want to proceed anyway?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      await packageApi.create({
        salesOrderId: orderId!,
        packageSlipNumber,
        date,
        internalNotes,
        dimensions: {
          length: dimLength ? parseFloat(dimLength) : undefined,
          width: dimWidth ? parseFloat(dimWidth) : undefined,
          height: dimHeight ? parseFloat(dimHeight) : undefined,
          unit: dimUnit,
        },
        weight: {
          value: weightValue ? parseFloat(weightValue) : undefined,
          unit: weightUnit,
        },
        lineItems: items
          .filter(i => i.quantityToPack > 0)
          .map(i => ({
            itemId: i.itemId,
            name: i.name,
            ordered: i.ordered,
            packed: i.packed,
            quantityToPack: i.quantityToPack,
          })),
      });
      toast.success("Package created successfully");
      router.push(`/sales/orders/${orderId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create package");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              Sales <span className="mx-1">/</span>
              <span className="cursor-pointer hover:underline" onClick={() => router.push("/sales/orders")}>Sales Orders</span> <span className="mx-1">/</span>
              <span className="cursor-pointer hover:underline" onClick={() => router.push(`/sales/orders/${orderId}`)}>{order?.salesOrderNumber}</span> <span className="mx-1">/</span>
              <span className="font-medium text-foreground">New Package</span>
            </span>
          }
        />
        
        <main className="flex-1 overflow-auto p-6 max-w-5xl">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <PackageIcon className="h-5 w-5 text-teal-600" />
              <h1 className="text-2xl font-semibold">New Package</h1>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-6 shadow-sm mb-6 space-y-6">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-teal-700 font-semibold flex gap-1">Package Slip Number *</Label>
                <Input 
                  value={packageSlipNumber} 
                  onChange={e => setPackageSlipNumber(e.target.value)} 
                  className="bg-teal-50/50 border-teal-200 focus-visible:ring-teal-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-teal-700 font-semibold flex gap-1">Date *</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="focus-visible:ring-teal-500" />
              </div>
              
              <div className="space-y-2">
                <Label>Dimensions</Label>
                <div className="flex items-center gap-2">
                  <Input placeholder="L" className="w-20 focus-visible:ring-teal-500" value={dimLength} onChange={e => setDimLength(e.target.value)} type="number" />
                  <span className="text-muted-foreground">x</span>
                  <Input placeholder="W" className="w-20 focus-visible:ring-teal-500" value={dimWidth} onChange={e => setDimWidth(e.target.value)} type="number" />
                  <span className="text-muted-foreground">x</span>
                  <Input placeholder="H" className="w-20 focus-visible:ring-teal-500" value={dimHeight} onChange={e => setDimHeight(e.target.value)} type="number" />
                  <select 
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    value={dimUnit}
                    onChange={e => setDimUnit(e.target.value)}
                  >
                    <option value="cm">cm</option>
                    <option value="in">in</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Weight</Label>
                <div className="flex items-center gap-2">
                  <Input className="w-32 focus-visible:ring-teal-500" value={weightValue} onChange={e => setWeightValue(e.target.value)} type="number" />
                  <select 
                    className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    value={weightUnit}
                    onChange={e => setWeightUnit(e.target.value)}
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="pt-4 pb-2">
              <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800 border border-orange-100">
                You can also select or scan the items to be included from the sales order.
              </div>
            </div>

            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="h-10 px-4 text-left align-middle font-medium">ITEMS & DESCRIPTION</th>
                    <th className="h-10 px-4 text-right align-middle font-medium w-24">ORDERED</th>
                    <th className="h-10 px-4 text-right align-middle font-medium w-24">PACKED</th>
                    <th className="h-10 px-4 text-right align-middle font-medium w-32">QUANTITY TO PACK</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.itemId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-4 align-middle font-medium">{item.name}</td>
                      <td className="p-4 align-middle text-right">{item.ordered}</td>
                      <td className="p-4 align-middle text-right">{item.packed}</td>
                      <td className="p-4 align-middle text-right space-y-1">
                        <Input 
                          type="number" 
                          min={0}
                          max={item.ordered - item.packed}
                          value={item.quantityToPack}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 0;
                            const newItems = [...items];
                            newItems[idx].quantityToPack = val;
                            setItems(newItems);
                          }}
                          className="w-full text-right h-8 focus-visible:ring-teal-500"
                        />
                        <div className="text-[10px] text-muted-foreground">
                          Stock on Hand: <span className="font-semibold">{item.stockOnHand}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-muted-foreground">No line items available to pack.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea 
                value={internalNotes} 
                onChange={e => setInternalNotes(e.target.value)} 
                placeholder="Add any internal notes..."
                className="focus-visible:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t py-4">
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => router.back()} disabled={saving}>
                Cancel
              </Button>
            </div>
            <div className="text-sm font-medium">
              Total Items: {totalItems}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
