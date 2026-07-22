"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Loader2, Plus, ArrowRight, Search, Calendar, ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { InventoryShell } from "@/app/inventory/_components/inventory-shell";
import { putawayApi, type Putaway } from "@/lib/api/putaways";

export default function InventoryPutawaysPage() {
  const [rows, setRows] = useState<Putaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  type PutawaySortField = "putawayNumber" | "date" | "receive" | "warehouse" | "status";
  type PutawaySortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<PutawaySortField>("date");
  const [sortOrder, setSortOrder] = useState<PutawaySortOrder>("desc");

  function toggleSort(field: PutawaySortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

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

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          r.putawayNumber.toLowerCase().includes(q) ||
          r.purchaseReceiveNumber.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (fromDate || toDate) {
        const d = r.date ? new Date(r.date).toISOString().slice(0, 10) : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
  }, [rows, search, fromDate, toDate]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "putawayNumber":
          aVal = (a.putawayNumber || "").toLowerCase();
          bVal = (b.putawayNumber || "").toLowerCase();
          break;
        case "date":
          aVal = new Date(a.date || 0).getTime();
          bVal = new Date(b.date || 0).getTime();
          break;
        case "receive":
          aVal = (a.purchaseReceiveNumber || "").toLowerCase();
          bVal = (b.purchaseReceiveNumber || "").toLowerCase();
          break;
        case "warehouse":
          aVal = ((a.warehouseId as any)?.name || "Main Warehouse").toLowerCase();
          bVal = ((b.warehouseId as any)?.name || "Main Warehouse").toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRows, sortField, sortOrder]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const completed = filteredRows.filter((r) => r.status === "Completed").length;
    const draft = filteredRows.filter((r) => r.status === "Draft" || !r.status).length;
    const totalQty = filteredRows.reduce((acc, r) => {
      const lineSum = (r.lineItems || []).reduce((lAcc, li) => lAcc + Number(li.quantityPutaway || 0), 0);
      return acc + lineSum;
    }, 0);
    return { total, completed, draft, totalQty };
  }, [filteredRows]);

  return (
    <InventoryShell
      title="All Putaways"
      actions={
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search putaways..."
              className="pl-8 h-8 text-xs bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Compact Date Range Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
                  (fromDate || toDate) && "border-teal-500 bg-teal-50/60 text-teal-700 font-semibold"
                )}
              >
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                {fromDate || toDate ? (
                  <span>
                    {fromDate || "Start"} - {toDate || "End"}
                  </span>
                ) : (
                  <span>Date Range</span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 space-y-3 bg-white border border-slate-200 shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Filter by Date Range</span>
                {(fromDate || toDate) && (
                  <button
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                    }}
                    className="text-xs text-rose-600 hover:underline font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">From Date</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-8 text-xs bg-slate-50 border-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-500 block mb-1">To Date</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-8 text-xs bg-slate-50 border-slate-200"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 border-slate-200 bg-white"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>

          <Button asChild size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm">
            <Link href="/purchases/receives">
              <Plus className="h-3.5 w-3.5 mr-1" /> New from Receive
            </Link>
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {/* Sleek Ultra-Compact KPI Summary Strip */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Putaways</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.total}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Completed</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.completed}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Draft / Pending</span>
              <span className="text-sm font-bold text-amber-700 tabular-nums">{summary.draft}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Total Qty Putaway</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{summary.totalQty.toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm text-slate-500">Loading putaways...</p>
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-dashed border-slate-200">
            <div className="h-16 w-16 bg-teal-50 rounded-full flex items-center justify-center mb-4">
              <Plus className="h-8 w-8 text-teal-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-slate-800">No Putaways Found</h2>
            <p className="text-slate-500 mb-6 max-w-xs">
              Putaways help you track items from the receiving dock to their final storage locations.
            </p>
            <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-md shadow-teal-100 transition-all">
              <Link href="/purchases/receives">SELECT A RECEIVE TO START</Link>
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-[130px_110px_1fr_140px_100px_100px_80px] gap-4 px-6 py-4 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div>
                <button onClick={() => toggleSort("putawayNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                  Putaway Number
                  <span className={sortField === "putawayNumber" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                    {sortField === "putawayNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </div>
              <div>
                <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                  Date
                  <span className={sortField === "date" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                    {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </div>
              <div>
                <button onClick={() => toggleSort("receive")} className="group flex items-center gap-1 hover:text-teal-700">
                  Source Receive
                  <span className={sortField === "receive" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                    {sortField === "receive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </div>
              <div>
                <button onClick={() => toggleSort("warehouse")} className="group flex items-center gap-1 hover:text-teal-700">
                  Warehouse
                  <span className={sortField === "warehouse" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                    {sortField === "warehouse" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </div>
              <div className="text-right">Total Qty</div>
              <div>
                <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                  Status
                  <span className={sortField === "status" ? "text-teal-700 font-bold text-[10px]" : "text-slate-300 group-hover:text-slate-500 text-[10px]"}>
                    {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              </div>
              <div className="text-right">Action</div>
            </div>
            <div className="divide-y divide-slate-100">
              {sortedRows.map((row) => {
                const totalPutawayQty = (row.lineItems || []).reduce((acc, li) => acc + Number(li.quantityPutaway || 0), 0);
                return (
                  <div key={row._id} className="grid grid-cols-[130px_110px_1fr_140px_100px_100px_80px] gap-4 px-6 py-4 items-center hover:bg-teal-50/30 transition-colors">
                    <div className="font-semibold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer">{row.putawayNumber}</div>
                    <div className="text-sm text-slate-500">{new Date(row.date).toLocaleDateString("en-IN")}</div>
                    <div className="text-sm">
                      <div className="font-medium text-slate-700">{row.purchaseReceiveNumber}</div>
                      <div className="text-xs text-slate-400">Linked Purchase Receive</div>
                    </div>
                    <div className="text-sm text-slate-600">{(row.warehouseId as any)?.name || "Main Warehouse"}</div>
                    <div className="text-right text-sm font-semibold text-slate-800 tabular-nums">{totalPutawayQty.toLocaleString("en-IN")}</div>
                    <div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-semibold border",
                        row.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
                      )}>
                        {row.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <Button variant="ghost" size="sm" asChild className="h-8 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50">
                        <Link href="/purchases/receives">
                          View <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </InventoryShell>
  );
}
