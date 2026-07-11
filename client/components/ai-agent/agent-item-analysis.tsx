"use client";

import { useEffect, useState } from "react";
import { getItemsAnalysis } from "@/lib/api/ai-agent";
import { cn } from "@/lib/utils";
import { BarChart3, RefreshCw, Box, AlertTriangle, Layers } from "lucide-react";

export function AgentItemAnalysis() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await getItemsAnalysis();
      if (res.success && res.data) {
        setAnalysisData(res.data.analysis);
        setAiSummary(res.data.aiSummary);
        setLowStockItems(res.data.items || []);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to compile inventory metrics analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, []);

  return (
    <div className="p-6 bg-slate-50/20 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Inventory Health Analysis</h3>
          <p className="text-xs text-slate-550 mt-0.5">AI-assisted analysis of item stocks, asset values, and category ranges.</p>
        </div>
        <button
          onClick={fetchAnalysis}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 text-slate-700 shadow-3xs cursor-pointer transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          Re-Analyze
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 animate-pulse">
            <div className="h-20 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-20 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-20 bg-slate-100 rounded-2xl border border-slate-200" />
            <div className="h-20 bg-slate-100 rounded-2xl border border-slate-200" />
          </div>
          <div className="h-44 bg-slate-100 rounded-2xl border border-slate-200 animate-pulse" />
        </div>
      ) : errorMsg ? (
        <div className="p-4 border border-rose-250 bg-rose-50 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
          {errorMsg}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-3xs flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-teal-50 border border-teal-150 text-teal-600 flex items-center justify-center text-lg select-none">
                📦
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Items</span>
                <span className="text-lg font-bold text-slate-800">{analysisData?.totalItems}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-3xs flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-purple-50 border border-purple-150 text-purple-600 flex items-center justify-center text-lg select-none">
                🪙
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Asset Value</span>
                <span className="text-lg font-bold text-slate-800">
                  INR {(analysisData?.totalInventoryValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-3xs flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-150 text-rose-600 flex items-center justify-center text-lg select-none">
                ⚠️
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Low Stock</span>
                <span className="text-lg font-bold text-slate-850">{analysisData?.lowStockItemsCount} items</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-3xs flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-150 text-amber-600 flex items-center justify-center text-lg select-none">
                🚫
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Zero Stock</span>
                <span className="text-lg font-bold text-slate-850">{analysisData?.zeroStockItemsCount} items</span>
              </div>
            </div>
          </div>

          {/* AI Narrative insight */}
          <div className="rounded-2xl border border-teal-500/25 bg-teal-500/3 p-5 shadow-3xs space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
              <span>🤖 AI Insights & Recommendations</span>
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
          </div>

          {/* Top Asset Values & Low Stock items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Value items table */}
            <div className="border border-slate-200 rounded-2xl bg-white p-4.5 shadow-3xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Top Inventory Assets</h4>
              {analysisData?.topValueItems?.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No inventory assets recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left border-collapse text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                        <th className="py-2">Item Name</th>
                        <th className="py-2">SKU</th>
                        <th className="py-2 text-right">Stock</th>
                        <th className="py-2 text-right">Value (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analysisData?.topValueItems?.map((itm: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 font-semibold text-slate-800">{itm.name}</td>
                          <td className="py-2.5 font-mono text-slate-500">{itm.sku || "—"}</td>
                          <td className="py-2.5 text-right font-medium">{itm.stock}</td>
                          <td className="py-2.5 text-right font-semibold text-teal-700">
                            {itm.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Low Stock items table */}
            <div className="border border-slate-200 rounded-2xl bg-white p-4.5 shadow-3xs space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500">Low Stock Alert</h4>
              {lowStockItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No low stock alerts. All items healthy!</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left border-collapse text-slate-750">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                        <th className="py-2">Item Name</th>
                        <th className="py-2">SKU</th>
                        <th className="py-2 text-right">Current Stock</th>
                        <th className="py-2 text-right">Reorder Point</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lowStockItems.map((itm: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 font-semibold text-slate-800">{itm.name}</td>
                          <td className="py-2.5 font-mono text-slate-500">{itm.sku || "—"}</td>
                          <td className="py-2.5 text-right font-bold text-rose-600">{itm.stockOnHand}</td>
                          <td className="py-2.5 text-right font-medium">{itm.reorderPoint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
