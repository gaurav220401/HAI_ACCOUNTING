"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DashboardOverview } from "@/app/inventory/_components/dashboard-overview";
import { useOrganization } from "@/contexts/organization-context";
import { inventoryApi, type InventoryOverviewResponse } from "@/lib/api/inventory";
import { InventoryShell } from "./_components/inventory-shell";
import { Button } from "@/components/ui/button";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";

export default function InventoryOverviewPage() {
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<InventoryOverviewResponse | null>(null);
  const [period, setPeriod] = useState("month");

  const loadOverview = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await inventoryApi.getOverview(p);
      setOverview(res.data);
    } catch {
      toast.error("Failed to load inventory overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeOrganization?._id) {
      void loadOverview(period);
    }
  }, [activeOrganization?._id, period, loadOverview]);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
  };

  return (
    <InventoryShell
      title="Inventory"
      actions={(
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadOverview(period)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" className="h-8 rounded-lg shadow-sm" onClick={() => router.push("/inventory/adjustments")}>New Adjustment</Button>
        </>
      )}
    >
      <div className="flex flex-col flex-1">
        {loading && !overview ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-500 font-medium animate-pulse">Gathering inventory insights...</p>
          </div>
        ) : overview ? (
          <div className="flex-1 p-6 bg-slate-50/70 overflow-auto scrollbar-thin">
            <DashboardOverview 
              data={overview} 
              period={period} 
              onPeriodChange={handlePeriodChange} 
              onNewAdjustment={() => router.push("/inventory/adjustments")}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <p>Failed to load data. Please refresh.</p>
          </div>
        )}
      </div>
    </InventoryShell>
  );
}
