"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  RefreshCw,
  FileText,
  MoreHorizontal,
  ChevronDown,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deliveryChallanApi,
  type DeliveryChallan,
  type DeliveryChallanStatus,
} from "@/lib/api/delivery-challans";

const STATUS_FILTERS: Array<DeliveryChallanStatus | "All"> = [
  "All",
  "Draft",
  "Open",
  "Delivered",
  "Returned",
];

const statusColor: Record<DeliveryChallanStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Open: "bg-teal-50 text-teal-700 border-teal-200",
  Delivered: "bg-green-50 text-green-700 border-green-300",
  Returned: "bg-red-50 text-red-700 border-red-300",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCustomerName(c: DeliveryChallan["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

export default function DeliveryChallansPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [challans, setChallans] = useState<DeliveryChallan[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    DeliveryChallanStatus | "All"
  >("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) fetchChallans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, statusFilter]);

  async function fetchChallans() {
    setFetching(true);
    try {
      const res = await deliveryChallanApi.list({
        status: statusFilter,
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setChallans(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    let list = challans;

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter(
        (dc) => new Date(dc.challanDate || 0).getTime() >= fromTime,
      );
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter(
        (dc) => new Date(dc.challanDate || 0).getTime() <= toTime,
      );
    }

    if (!search) return list;
    const query = search.toLowerCase();
    return list.filter(
      (dc) =>
        dc.challanNumber.toLowerCase().includes(query) ||
        (dc.salesOrderNumber || "").toLowerCase().includes(query) ||
        dc.referenceNumber?.toLowerCase().includes(query) ||
        getCustomerName(dc.customerId).toLowerCase().includes(query),
    );
  }, [challans, search, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalAmount = filtered.reduce(
      (acc, dc) => acc + Number(dc.total || 0),
      0,
    );
    const deliveredCount = filtered.filter(
      (dc) => dc.status === "Delivered",
    ).length;
    const openCount = filtered.filter(
      (dc) => dc.status === "Open" || dc.status === "Draft",
    ).length;
    return {
      count: filtered.length,
      totalAmount,
      deliveredCount,
      openCount,
    };
  }, [filtered]);

  type ChallanSortField = "date" | "number" | "order" | "reference" | "customer" | "status" | "invoiceStatus" | "amount";
  type ChallanSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<ChallanSortField>("date");
  const [sortOrder, setSortOrder] = useState<ChallanSortOrder>("desc");

  function toggleSort(field: ChallanSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedChallans = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "date":
          aVal = new Date(a.challanDate || 0).getTime();
          bVal = new Date(b.challanDate || 0).getTime();
          break;
        case "number":
          aVal = a.challanNumber || "";
          bVal = b.challanNumber || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "order":
          aVal = (a.salesOrderNumber || "").toLowerCase();
          bVal = (b.salesOrderNumber || "").toLowerCase();
          break;
        case "reference":
          aVal = (a.referenceNumber || "").toLowerCase();
          bVal = (a.referenceNumber || "").toLowerCase();
          break;
        case "customer":
          aVal = getCustomerName(a.customerId).toLowerCase();
          bVal = getCustomerName(b.customerId).toLowerCase();
          break;
        case "status":
          aVal = (a.status || "").toLowerCase();
          bVal = (b.status || "").toLowerCase();
          break;
        case "invoiceStatus":
          aVal = (a.invoiceStatus || "").toLowerCase();
          bVal = (b.invoiceStatus || "").toLowerCase();
          break;
        case "amount":
          aVal = Number(a.total || 0);
          bVal = Number(b.total || 0);
          break;
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
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                Delivery Challans
              </span>
            </span>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search challans..."
                  className="pl-8 h-8 text-sm"
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 bg-white border-slate-200 h-8 text-xs">
                    {statusFilter === "All" ?
                      "All Statuses"
                    : `${statusFilter}`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "All" ? "All Delivery Challans" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchChallans}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                onClick={() => router.push("/sales/delivery-challans/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-3">
          {/* Sleek Ultra-Compact KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Challans</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Value</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{formatCurrency(summary.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Delivered</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.deliveredCount}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide">Draft / Open</span>
              <span className="text-sm font-bold text-amber-600 tabular-nums">{summary.openCount}</span>
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
              <FileText className="h-16 w-16 opacity-30" />
              <div className="text-center max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Deliver Goods effectively!
                </h2>
                <p className="text-sm">
                  Create, customize and print professional Delivery Challans
                </p>

                {/* Lifecycle diagram */}
                <div className="mt-6 mb-2">
                  <p className="text-xs font-medium text-muted-foreground mb-4">
                    Life cycle of a Delivery Challan
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <span className="border rounded px-3 py-1.5 bg-gray-50 text-gray-700 border-gray-300 font-medium">
                      CREATE
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="border rounded px-3 py-1.5 bg-teal-50 text-teal-700 border-teal-200 font-medium">
                      OPEN
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <div className="flex flex-col items-start gap-1">
                      <span className="border rounded px-3 py-1.5 bg-green-50 text-green-700 border-green-300 font-medium">
                        DELIVERED
                      </span>
                      <span className="border rounded px-3 py-1.5 bg-red-50 text-red-700 border-red-300 font-medium">
                        RETURNED
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => router.push("/sales/delivery-challans/new")}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                <Plus className="h-4 w-4 mr-1" />
                CREATE DELIVERY CHALLAN
              </Button>
            </div>
          : <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                        Date
                        <span className={cn("text-[10px]", sortField === "date" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-40 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("number")} className="group flex items-center gap-1 hover:text-teal-700">
                        Delivery Challan Number
                        <span className={cn("text-[10px]", sortField === "number" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "number" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("order")} className="group flex items-center gap-1 hover:text-teal-700">
                        Sales Order Number
                        <span className={cn("text-[10px]", sortField === "order" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "order" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-36 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("reference")} className="group flex items-center gap-1 hover:text-teal-700">
                        Reference Number
                        <span className={cn("text-[10px]", sortField === "reference" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "reference" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-48 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                        Customer Name
                        <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                        Status
                        <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                      <button onClick={() => toggleSort("invoiceStatus")} className="group flex items-center gap-1 hover:text-teal-700">
                        Invoice Status
                        <span className={cn("text-[10px]", sortField === "invoiceStatus" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "invoiceStatus" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                      <button onClick={() => toggleSort("amount")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Amount
                        <span className={cn("text-[10px]", sortField === "amount" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "amount" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedChallans.map((dc: DeliveryChallan) => (
                    <TableRow
                      key={dc._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/sales/delivery-challans/${dc._id}`)
                      }
                    >
                      <TableCell className="text-sm">
                        {formatDate(dc.challanDate)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-teal-700 hover:text-teal-800 hover:underline">
                        {dc.challanNumber}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.salesOrderNumber || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.referenceNumber || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getCustomerName(dc.customerId)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColor[dc.status]}
                        >
                          {dc.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.invoiceStatus}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatCurrency(dc.total)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                  `/sales/delivery-challans/${dc._id}/edit`,
                                );
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            {dc.status === "Draft" && (
                              <DropdownMenuItem
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await deliveryChallanApi.convertToOpen(
                                    dc._id,
                                  );
                                  fetchChallans();
                                }}
                              >
                                Convert to Open
                              </DropdownMenuItem>
                            )}
                            {dc.status === "Open" && (
                              <>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await deliveryChallanApi.markAsDelivered(
                                      dc._id,
                                    );
                                    fetchChallans();
                                  }}
                                >
                                  Mark as Delivered
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await deliveryChallanApi.markAsReturned(
                                      dc._id,
                                    );
                                    fetchChallans();
                                  }}
                                >
                                  Mark as Returned
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    "Are you sure you want to delete this delivery challan?",
                                  )
                                ) {
                                  await deliveryChallanApi.remove(dc._id);
                                  fetchChallans();
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
