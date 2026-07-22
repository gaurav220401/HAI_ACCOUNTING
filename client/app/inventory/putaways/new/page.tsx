"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings, ScanLine, Plus, UploadCloud, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { putawayApi } from "@/lib/api/putaways";
import { purchaseReceiveApi, type PurchaseReceive } from "@/lib/api/purchase-receives";
import { warehouseApi, type Warehouse } from "@/lib/api/warehouses";
import { settingsApi } from "@/lib/api/settings";

function NewPutawayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const receiveId = searchParams.get("receiveId");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [putawayNumber, setPutawayNumber] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [receiveData, setReceiveData] = useState<PurchaseReceive | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [isCreateWarehouseOpen, setIsCreateWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, [receiveId]);

  async function loadInitialData() {
    setFetching(true);
    try {
      const [numRes, whRes] = await Promise.all([
        putawayApi.getNextNumber(),
        warehouseApi.list(),
      ]);
      setPutawayNumber(numRes.data.putawayNumber);
      const activeWarehouses = (whRes.data || []).filter((w) => w.isActive !== false);
      setWarehouses(activeWarehouses);
      
      // Select primary warehouse by default if available
      const primary = activeWarehouses.find(w => w.isPrimary);
      if (primary) setSelectedWarehouse(primary._id);
      else if (activeWarehouses.length > 0) setSelectedWarehouse(activeWarehouses[0]._id);

      if (receiveId) {
        const recRes = await purchaseReceiveApi.getOne(receiveId);
        const rd = recRes.data;
        setReceiveData(rd);
        setItems(rd.lineItems.map(li => ({
          itemId: li.itemId?._id || li.itemId,
          name: li.name,
          quantityReceived: li.quantityReceived,
          quantityPutaway: li.quantityReceived, // Default to full putaway
          remainingQuantity: 0,
        })));
      }
    } catch (err) {
      toast.error("Failed to load initial data");
    } finally {
      setFetching(false);
    }
  }

  async function handleCreateWarehouse() {
    const name = newWarehouseName.trim();
    if (!name) {
      toast.error("Warehouse name is required");
      return;
    }

    setCreatingWarehouse(true);
    try {
      const created = await warehouseApi.create({
        name,
        isPrimary: warehouses.length === 0,
        isActive: true,
      });
      const nextWarehouse = created.data;
      setWarehouses((prev) => [...prev, nextWarehouse].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedWarehouse(nextWarehouse._id);
      setNewWarehouseName("");
      setIsCreateWarehouseOpen(false);
      toast.success("Warehouse created");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to create warehouse";
      toast.error(msg);
    } finally {
      setCreatingWarehouse(false);
    }
  }

  const handleGenerate = async () => {
    if (!selectedWarehouse) {
      toast.error("Please select a warehouse");
      return;
    }
    if (!receiveId) {
      toast.error("No purchase receive linked");
      return;
    }

    setLoading(true);
    try {
      await putawayApi.create({
        putawayNumber,
        purchaseReceiveId: receiveId,
        warehouseId: selectedWarehouse,
        lineItems: items,
        notes,
        date,
      });
      toast.success("Putaway completed successfully!");
      router.push("/inventory/putaways");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to create putaway";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative max-w-5xl mx-auto border-x border-b shadow-sm min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-semibold text-slate-800">New Putaway</h1>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/inventory/putaways">
            <X className="h-5 w-5 text-slate-500" />
          </Link>
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 space-y-10">
        {/* Form Fields */}
        <div className="max-w-xl space-y-6">
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-slate-700 font-medium text-sm">Putaway Number<span className="text-rose-500">*</span></Label>
            <div className="relative">
              <Input 
                value={putawayNumber}
                onChange={(e) => setPutawayNumber(e.target.value)}
                className="pr-10 bg-teal-50/30 border-teal-250 focus-visible:ring-teal-600/20 focus-visible:border-teal-500 focus-visible:ring-1" 
              />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-1 top-1 h-7 w-7 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {receiveData && (
            <div className="grid grid-cols-[160px_1fr] items-center gap-4 text-sm">
              <Label className="font-medium text-slate-700">Source Receive</Label>
              <div className="font-medium text-teal-700">{receiveData.purchaseReceiveNumber} (PO: {receiveData.purchaseOrderNumber})</div>
            </div>
          )}

          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="font-medium text-slate-700 text-sm">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-rose-600 font-medium text-sm">Warehouse Name*</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                    ))}
                    {warehouses.length === 0 ? (
                      <SelectItem value="__empty" disabled>
                        No active warehouses found.
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <Dialog open={isCreateWarehouseOpen} onOpenChange={setIsCreateWarehouseOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="shrink-0 border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md">
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Warehouse</DialogTitle>
                    <DialogDescription>
                      Add a warehouse now so you can complete this putaway without leaving the page.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2 py-2">
                    <Label htmlFor="warehouse-name">Warehouse name</Label>
                    <Input
                      id="warehouse-name"
                      value={newWarehouseName}
                      onChange={(e) => setNewWarehouseName(e.target.value)}
                      placeholder="e.g. Main Warehouse"
                      autoComplete="off"
                    />
                  </div>

                  <DialogFooter>
                    <Button variant="outline" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={() => setIsCreateWarehouseOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateWarehouse} disabled={creatingWarehouse} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md">
                      {creatingWarehouse ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Create and Select
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <Label className="font-medium text-slate-700 text-sm pt-2">Internal Notes</Label>
            <Textarea 
              rows={4} 
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add internal notes here..." 
              className="resize-none"
            />
          </div>
        </div>

        {/* Item Details */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Item Details</h3>
            <Button variant="ghost" className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-md">
              <ScanLine className="h-4 w-4 mr-2" />
              Scan Item
            </Button>
          </div>
          
          <div className="border rounded-md overflow-hidden bg-slate-50/50">
            <div className="grid grid-cols-[1fr_150px_150px] gap-4 p-3 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              <div>Item Details</div>
              <div className="text-right">Qty Received</div>
              <div className="text-right">Qty to Store</div>
            </div>
            
            <div className="p-2 space-y-2">
              {items.map((item, index) => (
                <div key={item.itemId} className="grid grid-cols-[1fr_150px_150px] gap-4 items-center p-1">
                  <div className="text-sm font-medium text-slate-700">{item.name}</div>
                  <div className="text-right text-sm text-slate-500 pr-2">{item.quantityReceived}</div>
                  <Input 
                    type="number" 
                    value={item.quantityPutaway}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[index].quantityPutaway = Number(e.target.value);
                      setItems(newItems);
                    }}
                    className="bg-white border-slate-200 text-right" 
                  />
                </div>
              ))}
              {items.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-sm">
                  {receiveId ? "No items found in this receive" : "Please select a purchase receive to load items"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="sticky bottom-0 bg-slate-50 border-t p-4 flex gap-3 px-6 mt-auto">
        <Button 
          className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px] font-semibold rounded-md shadow-sm" 
          onClick={handleGenerate}
          disabled={loading || items.length === 0}
        >
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Complete Putaway
        </Button>
        <Button variant="outline" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" asChild>
          <Link href="/inventory/putaways">Cancel</Link>
        </Button>
      </div>
    </div>
  );
}

export default function NewPutawayPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    }>
      <NewPutawayContent />
    </Suspense>
  );
}
