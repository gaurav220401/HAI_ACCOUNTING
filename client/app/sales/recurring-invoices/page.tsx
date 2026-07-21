"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  recurringInvoiceApi,
  type RecurringInvoice,
  type RecurringInvoiceStatus,
} from "@/lib/api/recurring-invoices";

const STATUS_FILTERS: Array<RecurringInvoiceStatus | "All"> = [
  "All",
  "active",
  "paused",
  "stopped",
  "completed",
];

const FREQUENCY_FILTERS = [
  { value: "All", label: "All frequencies" },
  { value: "weekly", label: "Weekly" },
  { value: "every_10_days", label: "Every 10 Days" },
  { value: "every_15_days", label: "Every 15 Days" },
  { value: "monthly", label: "Monthly" },
];

const STATUS_STYLES: Record<RecurringInvoiceStatus, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  stopped: "bg-red-50 text-red-700 border-red-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
};

const FREQUENCY_LABELS: Record<RecurringInvoice["frequency"], string> = {
  weekly: "Weekly",
  every_10_days: "Every 10 Days",
  every_15_days: "Every 15 Days",
  monthly: "Monthly",
};

type SortField = "customer" | "profileName" | "frequency" | "lastRunDate" | "nextRunDate" | "status" | "total";
type SortOrder = "asc" | "desc";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(customer: RecurringInvoice["customerId"]) {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [profiles, setProfiles] = useState<RecurringInvoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RecurringInvoiceStatus | "All">("All");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [sortField, setSortField] = useState<SortField>("profileName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchProfiles = useCallback(async () => {
    setFetching(true);
    try {
      const response = await recurringInvoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setProfiles(response.data ?? []);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to fetch recurring invoice profiles"));
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchProfiles();
    }
  }, [firebaseUser, loading, fetchProfiles]);

  async function handleAction(
    action: "pause" | "resume" | "stop" | "run" | "delete",
    profile: RecurringInvoice,
  ) {
    try {
      if (action === "delete") {
        const confirmed = window.confirm(`Delete recurring profile ${profile.profileName}?`);
        if (!confirmed) return;
        await recurringInvoiceApi.remove(profile._id);
      } else if (action === "pause") {
        await recurringInvoiceApi.pause(profile._id);
      } else if (action === "resume") {
        await recurringInvoiceApi.resume(profile._id);
      } else if (action === "stop") {
        await recurringInvoiceApi.stop(profile._id);
      } else {
        const response = await recurringInvoiceApi.runNow(profile._id);
        toast.success(response.message || "Invoice created");
      }

      await fetchProfiles();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Action failed"));
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      // Frequency Filter
      if (frequencyFilter !== "All" && profile.frequency !== frequencyFilter) {
        return false;
      }
      // Date Range Filter (against createdAt or nextRunDate)
      if (fromDate || toDate) {
        const pDate = profile.createdAt ? new Date(profile.createdAt).toISOString().slice(0, 10) : "";
        if (fromDate && pDate && pDate < fromDate) return false;
        if (toDate && pDate && pDate > toDate) return false;
      }
      // Search Filter
      const value = search.trim().toLowerCase();
      if (!value) return true;
      return [
        profile.profileName,
        profile.referenceNumber,
        profile.orderNumber,
        customerName(profile.customerId),
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value));
    });
  }, [profiles, frequencyFilter, fromDate, toDate, search]);

  const sortedRows = useMemo(() => {
    const list = [...filteredProfiles];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "customer":
          aVal = customerName(a.customerId).toLowerCase();
          bVal = customerName(b.customerId).toLowerCase();
          break;
        case "profileName":
          aVal = (a.profileName || "").toLowerCase();
          bVal = (b.profileName || "").toLowerCase();
          break;
        case "frequency":
          aVal = a.frequency || "";
          bVal = b.frequency || "";
          break;
        case "lastRunDate":
          aVal = a.lastRunDate ? new Date(a.lastRunDate).getTime() : 0;
          bVal = b.lastRunDate ? new Date(b.lastRunDate).getTime() : 0;
          break;
        case "nextRunDate":
          aVal = a.nextRunDate ? new Date(a.nextRunDate).getTime() : 0;
          bVal = b.nextRunDate ? new Date(b.nextRunDate).getTime() : 0;
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
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
  }, [filteredProfiles, sortField, sortOrder]);

  const summary = useMemo(() => {
    const totalAmount = filteredProfiles.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const activeCount = filteredProfiles.filter((p) => p.status === "active").length;
    const pausedCount = filteredProfiles.filter((p) => p.status === "paused").length;
    return {
      count: filteredProfiles.length,
      activeCount,
      pausedCount,
      totalAmount,
    };
  }, [filteredProfiles]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Recurring Invoices</span>
            </span>
          }
          actions={
            <>
              <div className="flex items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search profiles..."
                    className="h-8 pl-8 text-xs"
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

                {/* Status Filter */}
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as RecurringInvoiceStatus | "All")}
                >
                  <SelectTrigger className="h-8 w-36 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((status) => (
                      <SelectItem key={status} value={status} className="text-xs">
                        {status === "All" ? "All statuses" : status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Frequency Filter */}
                <Select
                  value={frequencyFilter}
                  onValueChange={(value) => setFrequencyFilter(value)}
                >
                  <SelectTrigger className="h-8 w-40 text-xs bg-white border-slate-200">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_FILTERS.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value} className="text-xs">
                        {freq.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchProfiles()}
                disabled={fetching}
                className="px-2"
              >
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>

              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold gap-1.5"
                onClick={() => router.push("/sales/recurring-invoices/new")}
              >
                <Plus className="mr-1 h-4 w-4" />
                New Profile
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-6 overflow-hidden">
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
              <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Paused Profiles</span>
              <span className="text-sm font-bold text-amber-700 tabular-nums">{summary.pausedCount}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Total Recurring Value</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{formatCurrency(summary.totalAmount)}</span>
            </div>
          </div>

          {sortedRows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
              <div className="max-w-xl space-y-3">
                <h2 className="text-xl font-semibold">No recurring invoices found</h2>
                <p className="text-sm text-muted-foreground">
                  Create recurring profiles that generate invoices automatically and keep your billing cadence on track.
                </p>
                <Button
                  onClick={() => router.push("/sales/recurring-invoices/new")}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                >
                  Create New Recurring Invoice
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white flex-1 flex flex-col shadow-2xs">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-slate-200">
                    <TableHead>
                      <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                        Customer
                        <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("profileName")} className="group flex items-center gap-1 hover:text-teal-700">
                        Profile Name
                        <span className={cn("text-[10px]", sortField === "profileName" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "profileName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("frequency")} className="group flex items-center gap-1 hover:text-teal-700">
                        Frequency
                        <span className={cn("text-[10px]", sortField === "frequency" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "frequency" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("lastRunDate")} className="group flex items-center gap-1 hover:text-teal-700">
                        Last Invoice Date
                        <span className={cn("text-[10px]", sortField === "lastRunDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "lastRunDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("nextRunDate")} className="group flex items-center gap-1 hover:text-teal-700">
                        Next Invoice Date
                        <span className={cn("text-[10px]", sortField === "nextRunDate" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "nextRunDate" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("status")} className="group flex items-center gap-1 hover:text-teal-700">
                        Status
                        <span className={cn("text-[10px]", sortField === "status" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("total")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Amount
                        <span className={cn("text-[10px]", sortField === "total" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((profile) => (
                    <TableRow
                      key={profile._id}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0"
                      onClick={() => router.push(`/sales/recurring-invoices/${profile._id}`)}
                    >
                      <TableCell className="font-medium text-slate-800">{customerName(profile.customerId)}</TableCell>
                      <TableCell className="font-medium text-teal-700">
                        {profile.profileName}
                      </TableCell>
                      <TableCell>{FREQUENCY_LABELS[profile.frequency]}</TableCell>
                      <TableCell>{formatDate(profile.lastRunDate)}</TableCell>
                      <TableCell>{formatDate(profile.nextRunDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[profile.status]}>
                          {profile.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-slate-900 tabular-nums">
                        {formatCurrency(profile.total)}
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-800">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white">
                            <DropdownMenuItem
                              onClick={() => router.push(`/sales/recurring-invoices/${profile._id}`)}
                            >
                              View profile
                            </DropdownMenuItem>
                            {profile.status !== "completed" && profile.status !== "stopped" ? (
                              <DropdownMenuItem onClick={() => void handleAction("run", profile)}>
                                Create invoice now
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status === "active" ? (
                              <DropdownMenuItem onClick={() => void handleAction("pause", profile)}>
                                Pause
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status === "paused" ? (
                              <DropdownMenuItem onClick={() => void handleAction("resume", profile)}>
                                Resume
                              </DropdownMenuItem>
                            ) : null}
                            {profile.status !== "stopped" && profile.status !== "completed" ? (
                              <DropdownMenuItem onClick={() => void handleAction("stop", profile)}>
                                Stop
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleAction("delete", profile)}
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
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
