"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, MoreHorizontal, PauseCircle, PlayCircle, Plus, X, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { recurringBillApi, type RecurringBill } from "@/lib/api/recurring-bills";
import type { Bill } from "@/lib/api/bills";
import { cn } from "@/lib/utils";
import { DraggableText } from "@/components/ui/draggable-text";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount || 0);
}
function freqLabel(rec: RecurringBill) {
  if (rec.repeatEvery === 1) return rec.frequency;
  return `Every ${rec.repeatEvery} ${rec.frequency === "Daily" ? "Days" : rec.frequency === "Weekly" ? "Weeks" : rec.frequency === "Monthly" ? "Months" : "Years"}`;
}
function statusStyle(status: RecurringBill["status"]) {
  if (status === "Active") return "text-green-600";
  if (status === "Stopped") return "text-orange-600";
  return "text-gray-500";
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "V";
}
function getName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, string>;
    return f.displayName || f.companyName || f.name || "";
  }
  return "";
}

function ListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100 bg-white">
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="px-4 py-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-3.5 w-16 bg-slate-200 rounded" />
          </div>
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 bg-slate-100 rounded" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="flex-1 overflow-auto animate-pulse bg-white">
      <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b">
        <div className="h-3.5 w-3.5 bg-slate-200 rounded flex items-center justify-center mx-auto" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-20 bg-slate-200 rounded" />
        <div className="h-3 w-12 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-3 w-12 bg-slate-200 rounded" />
        <div className="h-3 w-16 bg-slate-200 rounded ml-auto" />
      </div>
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 items-center px-4 py-3.5 border-b border-slate-100">
          <div className="h-3.5 w-3.5 bg-slate-100 rounded flex items-center justify-center mx-auto" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
          <div className="h-3.5 w-32 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-12 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

function RecurringBillsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [recs, setRecs] = useState<RecurringBill[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [childBills, setChildBills] = useState<Bill[]>([]);
  const [loadingChildBills, setLoadingChildBills] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "activities">("overview");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Stopped">("All");
  const [showFilterDD, setShowFilterDD] = useState(false);

  type SortField = "vendor" | "profileName" | "frequency" | "lastBillDate" | "nextBillDate" | "status" | "total";
  type SortOrder = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("nextBillDate");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const filteredRecs = useMemo(() => {
    let list = recs;
    if (statusFilter !== "All") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter((r) => new Date(r.nextBillDate || 0).getTime() >= fromTime);
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter((r) => new Date(r.nextBillDate || 0).getTime() <= toTime);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      return (
        r.profileName.toLowerCase().includes(q) ||
        getName(r.vendorId).toLowerCase().includes(q) ||
        (r.frequency || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        String(r.total || "").includes(q)
      );
    });
  }, [recs, search, statusFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    return {
      count: filteredRecs.length,
      activeCount: filteredRecs.filter((r) => r.status === "Active").length,
      stoppedCount: filteredRecs.filter((r) => r.status === "Stopped").length,
      totalAmount: filteredRecs.reduce((acc, r) => acc + Number(r.total || 0), 0),
    };
  }, [filteredRecs]);

  const sortedRecs = useMemo(() => {
    const list = [...filteredRecs];
    list.sort((a: any, b: any) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "vendor":
          aVal = getName(a.vendorId).toLowerCase();
          bVal = getName(b.vendorId).toLowerCase();
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "profileName":
          aVal = a.profileName || "";
          bVal = b.profileName || "";
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "frequency":
          aVal = a.frequency || "";
          bVal = b.frequency || "";
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "lastBillDate":
          aVal = new Date(a.lastBillDate || 0).getTime();
          bVal = new Date(b.lastBillDate || 0).getTime();
          break;
        case "nextBillDate":
          aVal = new Date(a.nextBillDate || 0).getTime();
          bVal = new Date(b.nextBillDate || 0).getTime();
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          return sortOrder === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        case "total":
          aVal = Number(a.total || 0);
          bVal = Number(b.total || 0);
          break;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRecs, sortField, sortOrder]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchRecs = useCallback(async () => {
    setFetching(true);
    try {
      const res = await recurringBillApi.list({ page: 1, limit: 200 });
      setRecs(res.data ?? []);
    } catch {
      /* noop */
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading) fetchRecs();
  }, [firebaseUser, loading, fetchRecs]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  const selectedRec = useMemo(
    () => recs.find((r) => r._id === selectedId) ?? null,
    [recs, selectedId]
  );

  const loadChildBills = useCallback(async (id: string) => {
    setLoadingChildBills(true);
    try {
      const res = await recurringBillApi.getBills(id);
      setChildBills(res.data || []);
    } catch {
      setChildBills([]);
    } finally {
      setLoadingChildBills(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadChildBills(selectedId);
  }, [selectedId, loadChildBills]);

  async function handleCreateBill(rec: RecurringBill) {
    try {
      await recurringBillApi.createBillNow(rec._id);
      toast.success("Bill created");
      fetchRecs();
      loadChildBills(rec._id);
    } catch {
      toast.error("Failed to create bill");
    }
  }

  async function handleStop(rec: RecurringBill) {
    try {
      const res = await recurringBillApi.stop(rec._id);
      setRecs((prev) => prev.map((r) => (r._id === rec._id ? res.data : r)));
      toast.success("Recurring bill stopped");
    } catch {
      toast.error("Failed to stop");
    }
  }

  async function handleResume(rec: RecurringBill) {
    try {
      const res = await recurringBillApi.resume(rec._id);
      setRecs((prev) => prev.map((r) => (r._id === rec._id ? res.data : r)));
      toast.success("Recurring bill resumed");
    } catch {
      toast.error("Failed to resume");
    }
  }

  async function handleDelete(rec: RecurringBill) {
    try {
      await recurringBillApi.remove(rec._id);
      setRecs((prev) => prev.filter((r) => r._id !== rec._id));
      if (selectedId === rec._id) setSelectedId(null);
      toast.success("Recurring bill deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">Purchases</span>
              <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-teal-700">
                    {statusFilter === "All" ? "All Recurring Bills" : `${statusFilter} Profiles`} <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => { setStatusFilter("All"); setShowFilterDD(false); }}>All Recurring Bills</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setStatusFilter("Active"); setShowFilterDD(false); }}>Active</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setStatusFilter("Stopped"); setShowFilterDD(false); }}>Stopped</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input className="pl-8 h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search profiles..." />
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
                    <span className="text-xs font-semibold text-slate-800">Filter by Next Date Range</span>
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
                size="sm"
                className="gap-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md h-8 px-3 text-xs"
                onClick={() => router.push("/purchases/recurring-bills/new")}
              >
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </div>
          }
        />

        {selectedId ? (
        <div className="flex h-[calc(100vh-120px)] border-t">
          <div className="w-[360px] border-r bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{fetching ? "Loading..." : `${sortedRecs.length} Profiles`}</span>
            </div>
            {fetching ? (
              <ListSkeleton />
            ) : (
              <div className="divide-y">
                {sortedRecs.map((rec) => (
                  <button
                    key={rec._id}
                    type="button"
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-slate-100/70 transition-colors",
                      selectedId === rec._id && "bg-teal-50/50 border-l-[3px] border-l-teal-600"
                    )}
                    onClick={() => setSelectedId(rec._id)}
                  >
                    <div className="flex items-start gap-3">
                      <input type="checkbox" aria-label={`Select ${rec.profileName}`} onClick={(e) => e.stopPropagation()} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-gray-900 overflow-hidden">
                            <DraggableText alwaysActive className="block truncate">
                              {getName(rec.vendorId) || "—"}
                            </DraggableText>
                          </div>
                          <div className="text-sm font-semibold shrink-0">{fmtCurrency(rec.total || 0)}</div>
                        </div>
                        <div className="text-xs text-teal-700 font-semibold hover:underline cursor-pointer overflow-hidden mt-0.5">
                          <DraggableText alwaysActive className="block truncate">
                            {rec.profileName}
                          </DraggableText>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{freqLabel(rec)}</span>
                          <span>Next Bill on {fmtDate(rec.nextBillDate)}</span>
                        </div>
                        <div className="mt-1">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                            rec.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                          )}>
                            <span className={cn(
                              "h-1 w-1 rounded-full",
                              rec.status === "Active" ? "bg-emerald-500" : "bg-amber-500"
                            )} />
                            {rec.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {recs.length === 0 && (
                  <div className="px-6 py-8 text-sm text-muted-foreground text-center">No recurring bills</div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 bg-white overflow-y-auto">
            {!selectedRec ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a recurring bill to view details.
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedRec.profileName}</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/purchases/recurring-bills/${selectedRec._id}/edit`)}>
                      Edit
                    </Button>
                    <Button size="sm" onClick={() => handleCreateBill(selectedRec)}>
                      Create Bill
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          More <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {selectedRec.status === "Active" ? (
                          <DropdownMenuItem onClick={() => handleStop(selectedRec)}>
                            <PauseCircle className="h-3.5 w-3.5 mr-2" /> Stop
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleResume(selectedRec)}>
                            <PlayCircle className="h-3.5 w-3.5 mr-2" /> Resume
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(selectedRec)}>
                          <X className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        onClick={() => setSelectedId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                        Close
                      </Button>
                  </div>
                </div>

                <div className="mt-4 border-b">
                  <div className="flex gap-6 text-sm">
                    <button
                      className={cn("pb-2 transition-all", activeTab === "overview" && "border-b-2 border-teal-600 text-teal-700 font-semibold")}
                      onClick={() => setActiveTab("overview")}
                    >
                      Overview
                    </button>
                    <button
                      className={cn("pb-2 transition-all", activeTab === "activities" && "border-b-2 border-teal-600 text-teal-700 font-semibold")}
                      onClick={() => setActiveTab("activities")}
                    >
                      Recent Activities
                    </button>
                  </div>
                </div>

                {activeTab === "overview" ? (
                  <div className="mt-4 space-y-6">
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="col-span-1 border border-slate-100 rounded-lg p-4 flex items-center gap-3 bg-white shadow-2xs">
                        <div className="h-10 w-10 rounded-full bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center text-sm font-semibold">
                          {initials(getName(selectedRec.vendorId))}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Vendor</div>
                          <div className="font-semibold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer truncate max-w-[160px]">{getName(selectedRec.vendorId)}</div>
                        </div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Bill Amount</div>
                        <div className="font-semibold">{fmtCurrency(selectedRec.total || 0)}</div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Next Bill Date</div>
                        <div className="font-semibold">{fmtDate(selectedRec.nextBillDate)}</div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Recurring Period</div>
                        <div className="font-semibold">{freqLabel(selectedRec)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 text-sm">
                      <div className="border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Details</div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Profile Status</span>
                            <Badge className={cn(
                              selectedRec.status === "Active" ? "bg-green-100 text-green-700" : selectedRec.status === "Stopped" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
                            )}>
                              {selectedRec.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Start Date</span>
                            <span>{fmtDate(selectedRec.startDate)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">End Date</span>
                            <span>{selectedRec.neverExpires ? "Never Expires" : fmtDate(selectedRec.endsOn)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Payment Terms</span>
                            <span>{(selectedRec.paymentTermsId as any)?.name || "—"}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">All Child Bills</div>
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            All Child Bills <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="border rounded-lg mt-2 overflow-hidden">
                          {loadingChildBills ? (
                            <div className="flex items-center justify-center h-24">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : childBills.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No child bills yet</div>
                          ) : (
                            <div className="divide-y">
                              {childBills.map((b) => (
                                <div key={b._id} className="flex items-center justify-between px-4 py-3">
                                  <div className="text-sm">
                                    <button
                                      className="text-blue-600 hover:underline"
                                      onClick={() => router.push(`/purchases/bills?billId=${b._id}`)}
                                    >
                                      {b.billNumber}
                                    </button>
                                    <span className="text-muted-foreground ml-2">{fmtDate(b.billDate)}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold">{fmtCurrency(b.total || 0)}</div>
                                    <div className={cn(
                                      "text-[10px] uppercase font-bold",
                                      b.status === "Paid" ? "text-green-600" : b.status === "Void" ? "text-gray-500" : "text-orange-600"
                                    )}>
                                      {b.status}
                                    </div>
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => router.push(`/purchases/bills?billId=${b._id}`)}>
                                    Record Payment
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                    There are no Recent Activities
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        ) : fetching ? (
          <TableSkeleton />
        ) : (
        <div className="flex flex-1 flex-col overflow-hidden p-6 gap-3 bg-white">
          {/* Sleek Ultra-Compact KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Profiles</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Active Profiles</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.activeCount}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Stopped Profiles</span>
              <span className="text-sm font-bold text-amber-700 tabular-nums">{summary.stoppedCount}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Total Amount</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{fmtCurrency(summary.totalAmount)}</span>
            </div>
          </div>

          <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs flex flex-col">
            <div className="flex-1 overflow-auto">
              <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border-b sticky top-0 items-center z-10">
                <div className="flex items-center justify-center">
                  <input type="checkbox" aria-label="Select all" />
                </div>
                <div>
                  <button onClick={() => toggleSort("vendor")} className="group flex items-center gap-1 hover:text-teal-700">
                    Vendor Name
                    <span className={cn("text-[10px]", sortField === "vendor" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "vendor" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div>
                  <button onClick={() => toggleSort("profileName")} className="group flex items-center gap-1 hover:text-teal-700">
                    Profile Name
                    <span className={cn("text-[10px]", sortField === "profileName" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "profileName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div>
                  <button onClick={() => toggleSort("frequency")} className="group flex items-center gap-1 hover:text-teal-700">
                    Frequency
                    <span className={cn("text-[10px]", sortField === "frequency" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "frequency" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div>
                  <button onClick={() => toggleSort("lastBillDate")} className="group flex items-center gap-1 hover:text-teal-700">
                    Last Bill Date
                    <span className={cn("text-[10px]", sortField === "lastBillDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "lastBillDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div>
                  <button onClick={() => toggleSort("nextBillDate")} className="group flex items-center gap-1 hover:text-teal-700">
                    Next Bill Date
                    <span className={cn("text-[10px]", sortField === "nextBillDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "nextBillDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div>
                  <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                    Status
                    <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
                <div className="text-right">
                  <button onClick={() => toggleSort("total")} className="group flex items-center justify-end gap-1 w-full hover:text-teal-700">
                    Amount
                    <span className={cn("text-[10px]", sortField === "total" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                      {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </div>
              </div>
              <div className="divide-y">
                {sortedRecs.map((rec) => (
                  <button
                    key={rec._id}
                    type="button"
                    className="w-full text-left px-4 py-3.5 hover:bg-teal-50/30 transition-colors border-b border-slate-100"
                    onClick={() => setSelectedId(rec._id)}
                  >
                    <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 items-center text-sm">
                      <div className="flex items-center justify-center">
                        <input type="checkbox" aria-label={`Select ${rec.profileName}`} onClick={(e) => e.stopPropagation()} />
                      </div>
                      <div className="font-semibold text-slate-700 overflow-hidden">
                        <DraggableText alwaysActive className="block truncate">
                          {getName(rec.vendorId) || "—"}
                        </DraggableText>
                      </div>
                      <div className="text-teal-700 font-semibold hover:underline cursor-pointer overflow-hidden">
                        <DraggableText alwaysActive className="block truncate">
                          {rec.profileName}
                        </DraggableText>
                      </div>
                      <div className="text-slate-600">{freqLabel(rec)}</div>
                      <div className="text-slate-500">{fmtDate(rec.lastBillDate)}</div>
                      <div className="text-slate-500">{fmtDate(rec.nextBillDate)}</div>
                      <div className="flex items-center">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border",
                          rec.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        )}>
                          <span className={cn(
                            "h-1 w-1 rounded-full",
                            rec.status === "Active" ? "bg-emerald-500" : "bg-amber-500"
                          )} />
                          {rec.status}
                        </span>
                      </div>
                      <div className="text-right font-semibold text-slate-900">{fmtCurrency(rec.total || 0)}</div>
                    </div>
                  </button>
                ))}
                {sortedRecs.length === 0 && (
                  <div className="px-6 py-8 text-sm text-muted-foreground text-center bg-white">No recurring bills</div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function RecurringBillsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading recurring bills...</div>}>
      <RecurringBillsPageContent />
    </Suspense>
  );
}
