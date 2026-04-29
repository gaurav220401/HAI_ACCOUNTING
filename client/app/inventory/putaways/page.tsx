"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";
import { putawayApi, type Putaway } from "@/lib/api/putaways";

export default function InventoryPutawaysPage() {
  const [rows, setRows] = useState<Putaway[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await putawayApi.list();
      setRows(res.data || []);
    } catch {
      toast.error("Failed to load putaways");
    } finally {
      setLoading(false);
    }
  }

  return (
    <InventoryShell
      title="All Putaways"
      actions={
        <Button asChild size="sm" className="h-8 rounded-lg">
          <Link href="/purchases/receives">
            <Plus className="h-4 w-4 mr-2" /> New from Receive
          </Link>
        </Button>
      }
    >
      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-500">Loading putaways...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-slate-800">No Putaways Yet</h2>
            <p className="text-slate-500 mb-6 max-w-xs">
              Putaways help you track items from the receiving dock to their final storage locations.
            </p>
            <Button asChild className="bg-blue-600 hover:bg-blue-700 shadow-md transition-all">
              <Link href="/purchases/receives">SELECT A RECEIVE TO START</Link>
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-[140px_140px_1fr_160px_120px_100px] gap-4 px-6 py-4 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div>Putaway #</div>
              <div>Date</div>
              <div>Source Receive</div>
              <div>Warehouse</div>
              <div>Status</div>
              <div className="text-right">Action</div>
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div key={row._id} className="grid grid-cols-[140px_140px_1fr_160px_120px_100px] gap-4 px-6 py-4 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="font-semibold text-blue-600">{row.putawayNumber}</div>
                  <div className="text-sm text-slate-600">{new Date(row.date).toLocaleDateString("en-IN")}</div>
                  <div className="text-sm">
                    <div className="font-medium text-slate-800">{row.purchaseReceiveNumber}</div>
                    <div className="text-xs text-slate-400">Linked Purchase Receive</div>
                  </div>
                  <div className="text-sm font-medium text-slate-700">
                    {(row.warehouseId as any)?.name || "Main Warehouse"}
                  </div>
                  <div>
                    <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700 border border-green-200">
                      {row.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-blue-600">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </InventoryShell>
  );
}
