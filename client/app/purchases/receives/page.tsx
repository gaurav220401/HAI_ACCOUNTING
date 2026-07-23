"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Calendar, ChevronDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
      <div className="grid text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b bg-slate-50" style={{ gridTemplateColumns: "170px 170px 1fr 120px 100px 100px 120px" }}>
        <div className="px-4 py-2.5">Purchase Receive Number</div>
        <div className="px-4 py-2.5">Purchase Order Number</div>
        <div className="px-4 py-2.5">Vendor</div>
        <div className="px-4 py-2.5">Date</div>
        <div className="px-4 py-2.5 text-right">Qty</div>
        <div className="px-4 py-2.5 text-center">Putaway</div>
        <div className="px-4 py-2.5 text-right">Actions</div>
      </div>
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="grid border-t border-slate-100 items-center" style={{ gridTemplateColumns: "170px 170px 1fr 120px 100px 100px 120px" }}>
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
  const [statusFilter, setStatusFilter] = useState<"All" | "Received" | "Draft">("All");
  const [showFilterDD, setShowFilterDD] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  type SortField = "purchaseReceiveNumber" | "purchaseOrderNumber" | "vendor" | "receivedDate" | "totalQuantityReceived" | "putawayStatus";
  type SortOrder = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("receivedDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

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
    let list = rows;
    if (statusFilter !== "All") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter((r) => new Date(r.receivedDate || 0).getTime() >= fromTime);
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter((r) => new Date(r.receivedDate || 0).getTime() <= toTime);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
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
  }, [rows, search, statusFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    return {
      count: filtered.length,
      receivedCount: filtered.filter((r) => r.status === "Received").length,
      totalQty: filtered.reduce((acc, r) => acc + Number(r.totalQuantityReceived || 0), 0),
      pendingPutaway: filtered.filter((r) => r.putawayStatus !== "Completed").length,
    };
  }, [filtered]);

  const sortedRows = useMemo(() => {
    const list = [...filtered];
    list.sort((a: any, b: any) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "purchaseReceiveNumber":
          aVal = a.purchaseReceiveNumber || "";
          bVal = b.purchaseReceiveNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "purchaseOrderNumber":
          aVal = a.purchaseOrderNumber || "";
          bVal = b.purchaseOrderNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "vendor":
          aVal = getName(a.vendorId).toLowerCase();
          bVal = getName(b.vendorId).toLowerCase();
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "receivedDate":
          aVal = new Date(a.receivedDate || 0).getTime();
          bVal = new Date(b.receivedDate || 0).getTime();
          break;
        case "totalQuantityReceived":
          aVal = Number(a.totalQuantityReceived || 0);
          bVal = Number(b.totalQuantityReceived || 0);
          break;
        case "putawayStatus":
          aVal = a.putawayStatus || "";
          bVal = b.putawayStatus || "";
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortField, sortOrder]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">Purchases</span>
                <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-teal-700">
                      {statusFilter === "All" ? "All Purchase Receives" : `${statusFilter} Receives`} <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem onClick={() => { setStatusFilter("All"); setShowFilterDD(false); }}>All Purchase Receives</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setStatusFilter("Received"); setShowFilterDD(false); }}>Received</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setStatusFilter("Draft"); setShowFilterDD(false); }}>Draft</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
            actions={
              <div className="flex items-center gap-1.5">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search receives..."
                    className="pl-8 h-8 text-sm border-slate-200 focus-visible:ring-teal-600"
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
                  className="h-8 w-8 p-0 border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={loadData}
                  disabled={fetching}
                >
                  <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
                </Button>

                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-8 text-xs gap-1"
                  onClick={() => router.push("/purchases/orders")}
                >
                  <Plus className="h-3.5 w-3.5" /> New from Purchase Order
                </Button>
              </div>
            }
          />

          <div className="flex flex-1 flex-col overflow-hidden p-6 gap-3">
            {/* Sleek Ultra-Compact KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Receives</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Received Status</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.receivedCount}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Total Qty</span>
                <span className="text-sm font-bold text-teal-700 tabular-nums">{summary.totalQty}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Pending Putaways</span>
                <span className="text-sm font-bold text-amber-700 tabular-nums">{summary.pendingPutaway}</span>
              </div>
            </div>

            <div className="flex-1 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs flex flex-col">
              {fetching ? (
                <TableSkeleton />
              ) : filtered.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center gap-1.5 text-sm text-muted-foreground bg-white">
                  No purchase receives found.
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <div className="grid text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b bg-slate-50 sticky top-0 items-center z-10" style={{ gridTemplateColumns: "170px 170px 1fr 120px 100px 100px 120px" }}>
                    <div className="px-4 py-2.5">
                      <button onClick={() => toggleSort("purchaseReceiveNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Purchase Receive Number
                        <span className={cn("text-[10px]", sortField === "purchaseReceiveNumber" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "purchaseReceiveNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5">
                      <button onClick={() => toggleSort("purchaseOrderNumber")} className="group flex items-center gap-1 hover:text-teal-700">
                        Purchase Order Number
                        <span className={cn("text-[10px]", sortField === "purchaseOrderNumber" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "purchaseOrderNumber" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5">
                      <button onClick={() => toggleSort("vendor")} className="group flex items-center gap-1 hover:text-teal-700">
                        Vendor Name
                        <span className={cn("text-[10px]", sortField === "vendor" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "vendor" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5">
                      <button onClick={() => toggleSort("receivedDate")} className="group flex items-center gap-1 hover:text-teal-700">
                        Date
                        <span className={cn("text-[10px]", sortField === "receivedDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "receivedDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5 text-right">
                      <button onClick={() => toggleSort("totalQuantityReceived")} className="group flex items-center justify-end gap-1 w-full hover:text-teal-700">
                        Qty
                        <span className={cn("text-[10px]", sortField === "totalQuantityReceived" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "totalQuantityReceived" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5 text-center">
                      <button onClick={() => toggleSort("putawayStatus")} className="group flex items-center justify-center gap-1 w-full hover:text-teal-700">
                        Putaway
                        <span className={cn("text-[10px]", sortField === "putawayStatus" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "putawayStatus" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </div>
                    <div className="px-4 py-2.5 text-right">Actions</div>
                  </div>
                  {sortedRows.map((row: any) => (
                    <div key={row._id} className="grid border-t border-slate-100 text-sm hover:bg-teal-50/30 transition-colors items-center" style={{ gridTemplateColumns: "170px 170px 1fr 120px 100px 100px 120px" }}>
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
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
