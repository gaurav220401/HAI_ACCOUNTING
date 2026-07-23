"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  ChevronDown,
  RefreshCw,
  Loader2,
  Mail,
  Phone,
  MoreHorizontal,
  FileUp,
  Upload,
  Download,
  Calendar,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { VendorDetailView } from "./[id]/vendor-detail-view";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DraggableText } from "@/components/ui/draggable-text";

import { ExportDialog } from "@/components/export-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


const fmt = (v?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v ?? 0);

export default function VendorsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | "All">("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Contact | null>(null);
  const [loadingVendor, setLoadingVendor] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  type SortField = "displayName" | "companyName" | "isActive" | "email" | "phone" | "outstandingPayable" | "unusedCredits";
  type SortOrder = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("displayName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("No vendors to export");
      return;
    }
    const headers = ["Display Name", "Company Name", "Email", "Phone", "GST Treatment", "Currency", "Opening Balance"];
    const csvContent = [
      headers.join(","),
      ...filtered.map(c => [
        `"${c.displayName || ""}"`,
        `"${c.companyName || ""}"`,
        `"${c.email || ""}"`,
        `"${c.phone || ""}"`,
        `"${c.taxTreatment || ""}"`,
        `"${c.currency || "INR"}"`,
        `"${c.openingBalance || 0}"`,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "vendors.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Vendors exported successfully");
  };

  const panelOpen = !!selectedId;

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id, statusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = new URLSearchParams(window.location.search);
    const selected = query.get("selectedId");
    const tab = query.get("tab");

    setSelectedTab(tab);

    if (selected) {
      selectVendor(selected);
    } else {
      setSelectedId(null);
      setSelectedVendor(null);
    }
  }, []);

  async function fetchContacts() {
    setFetching(true);
    try {
      const includeInactive = statusFilter !== "Active";
      const res = await contactApi.list({ type: "Vendor", page: 1, limit: 200, includeInactive });
      setContacts(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function selectVendor(id: string) {
    setSelectedId(id);
    const tabQuery = selectedTab ? `&tab=${encodeURIComponent(selectedTab)}` : "";
    router.replace(`/purchases/vendors?selectedId=${encodeURIComponent(id)}${tabQuery}`);

    const quick = contacts.find((c) => c._id === id);
    if (quick) setSelectedVendor(quick);
    setLoadingVendor(true);
    try {
      const res = await contactApi.getById(id);
      const full = (res as any).data ?? res;
      setSelectedVendor(full);
    } catch {
      // leave quick version
    } finally {
      setLoadingVendor(false);
    }
  }

  function handleClose() {
    setSelectedId(null);
    setSelectedVendor(null);
    router.push("/purchases/vendors");
  }

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = contacts
    .filter((c) => {
      if (statusFilter === "Active") return c.isActive !== false;
      if (statusFilter === "Inactive") return c.isActive === false;
      return true;
    })
    .filter((c) => {
      if (fromDate || toDate) {
        const d = (c as any).createdAt ? new Date((c as any).createdAt).toISOString().slice(0, 10) : "";
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    })
    .filter(
      (c) =>
        !search ||
        c.displayName.toLowerCase().includes(search.toLowerCase()) ||
        c.companyName?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.toLowerCase().includes(search.toLowerCase()),
    );

  const summary = {
    total: filtered.length,
    active: filtered.filter((c) => c.isActive !== false).length,
    payables: filtered.reduce((acc, c) => acc + Number(c.outstandingPayable || 0), 0),
    unusedCredits: filtered.reduce((acc, c) => acc + Number(c.unusedCredits || 0), 0),
  };

  const sortedVendors = [...filtered].sort((a, b) => {
    let aVal: any = "";
    let bVal: any = "";
    switch (sortField) {
      case "displayName":
        aVal = a.displayName || "";
        bVal = b.displayName || "";
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal, undefined, { numeric: true })
          : bVal.localeCompare(aVal, undefined, { numeric: true });
      case "companyName":
        aVal = a.companyName || "";
        bVal = b.companyName || "";
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal, undefined, { numeric: true })
          : bVal.localeCompare(aVal, undefined, { numeric: true });
      case "isActive":
        aVal = a.isActive !== false ? 1 : 0;
        bVal = b.isActive !== false ? 1 : 0;
        break;
      case "email":
        aVal = a.email || "";
        bVal = b.email || "";
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      case "phone":
        aVal = a.phone || "";
        bVal = b.phone || "";
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      case "outstandingPayable":
        aVal = Number(a.outstandingPayable || 0);
        bVal = Number(b.outstandingPayable || 0);
        break;
      case "unusedCredits":
        aVal = Number(a.unusedCredits || 0);
        bVal = Number(b.unusedCredits || 0);
        break;
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex h-svh min-h-0 flex-col overflow-hidden">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col">
              <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">Purchases</span>
              <span className="text-sm font-semibold text-slate-700">Vendors</span>
            </div>
          }
          actions={
            !panelOpen ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative w-52">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      className="pl-8 h-8 text-xs border-slate-200 focus-visible:ring-teal-500"
                      placeholder="Search vendors…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "Active" | "Inactive" | "All")}
                    className="h-8 rounded border border-slate-200 px-2 text-xs text-slate-600 focus-visible:ring-teal-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="All">All</option>
                  </select>

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
                </div>
                <Button variant="outline" size="sm" onClick={fetchContacts} disabled={fetching} className="h-8 w-8 px-0 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                </Button>
                <Button size="sm" className="h-8 gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md text-xs px-3" onClick={() => router.push("/purchases/vendors/new")}>
                  <Plus className="h-3.5 w-3.5" /> New Vendor
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white">
                    <DropdownMenuItem onClick={() => router.push("/batch-import?section=purchases&type=Vendors&back=/purchases/vendors")} className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <FileUp className="h-4 w-4 text-slate-500" />
                        Batch Import
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <span className="flex items-center gap-2 text-xs">
                          <Upload className="h-4 w-4 text-slate-500" />
                          Import
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={() => router.push("/purchases/vendors/import")} className="cursor-pointer">
                            <span className="text-xs">Import Vendors</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <span className="flex items-center gap-2 text-xs">
                          <Download className="h-4 w-4 text-slate-500" />
                          Export
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={() => setExportDialogOpen(true)} className="cursor-pointer">
                            <span className="text-xs">Export Vendors</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null
          }
        />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── LEFT panel ── */}
          <div className={cn(
            "flex flex-col border-r transition-all duration-200 overflow-hidden",
            panelOpen ? "w-[320px] shrink-0" : "flex-1",
          )}>
            {/* Panel header (split view sidebar header) */}
            {panelOpen && (
              <div className="flex items-center justify-between shrink-0 border-b px-3 py-2">
                <button className="flex items-center gap-1.5 text-sm font-semibold">
                  All Vendors
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-600" onClick={fetchContacts} disabled={fetching}>
                    <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                  </Button>
                  <Button size="icon" className="h-6 w-6 bg-teal-600 hover:bg-teal-700 text-white rounded" onClick={() => router.push("/purchases/vendors/new")}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Search row — shown only in narrow (split) mode */}
            {panelOpen && (
              <div className="px-2 py-1.5 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search vendors..."
                    className="pl-7 h-7 text-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Content */}
            {/* Content */}
            {fetching ? (
              panelOpen ? (
                /* Narrow sidebar list skeleton */
                <div className="flex-1 overflow-y-auto divide-y animate-pulse bg-white">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-4 py-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="h-3.5 w-24 bg-slate-200 rounded" />
                        <div className="h-3 w-16 bg-slate-100 rounded" />
                      </div>
                      <div className="h-3 w-36 bg-slate-100 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                /* Full-width table skeleton */
                <div className="flex-1 overflow-auto px-6 py-4 animate-pulse">
                  <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Company Name</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Work Phone</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Payables (BCY)</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Unused Credits (BCY)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-3"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-4 w-32 bg-slate-100 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-4 w-12 bg-slate-100 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-4 w-40 bg-slate-100 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-4 w-16 bg-slate-100 rounded ml-auto" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : panelOpen ? (
              /* Narrow sidebar list */
              <div className="flex-1 overflow-y-auto divide-y bg-white">
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-30" />
                    <p className="text-xs">{search ? "No vendors match your search" : "No vendors yet"}</p>
                  </div>
                )}
                {filtered.map((c) => (
                  <button
                    key={c._id}
                    className={cn(
                      "w-full text-left px-4 py-3.5 border-b border-slate-100 last:border-b-0 transition-all duration-150 cursor-pointer border-l-[3px]",
                      c.isActive === false && "bg-slate-50/50 text-slate-400",
                      selectedId === c._id ? "bg-teal-50/50 border-l-teal-600 pl-[13px]" : "border-l-transparent hover:bg-slate-50/50",
                    )}
                    onClick={() => selectVendor(c._id)}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <DraggableText className={cn("text-[13px] font-semibold", selectedId === c._id && c.isActive !== false ? "text-teal-700" : "text-slate-800")}>
                          {c.displayName}
                        </DraggableText>
                        {c.companyName && c.companyName !== c.displayName && (
                          <DraggableText className="text-[10px] text-slate-400 mt-0.5">{c.companyName}</DraggableText>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {c.isActive === false ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200 select-none">
                            Inactive
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100 select-none">
                            Active
                          </span>
                        )}
                        <span className="text-[10px] tabular-nums text-slate-500 font-medium">
                          {fmt(c.outstandingPayable ?? 0, c.currency ?? "INR")}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                <div className="px-4 py-2.5 text-xs text-slate-400 font-medium border-t bg-slate-50/50">
                  {filtered.length} vendor{filtered.length !== 1 ? "s" : ""}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              /* Full-width empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground mx-6 my-4 border-2 border-dashed rounded-xl">
                <Building2 className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">{search ? "No vendors match your search" : "No vendors yet"}</p>
                {!search && (
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/purchases/vendors/new")}>
                    <Plus className="h-4 w-4 mr-1" /> New Vendor
                  </Button>
                )}
              </div>
            ) : (
              /* Full-width table view with KPI summary strip */
              <div className="flex-1 flex flex-col overflow-hidden px-6 py-4 gap-3">
                {/* Compact KPI summary strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Vendors</span>
                    <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.total}</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                    <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Active Vendors</span>
                    <span className="text-sm font-bold text-emerald-700 tabular-nums">{summary.active}</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                    <span className="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">Total Payables</span>
                    <span className="text-sm font-bold text-rose-600 tabular-nums">{fmt(summary.payables)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
                    <span className="text-[11px] font-semibold text-teal-600 uppercase tracking-wide">Unused Credits</span>
                    <span className="text-sm font-bold text-teal-700 tabular-nums">{fmt(summary.unusedCredits)}</span>
                  </div>
                </div>

                <div className="flex-1 border border-slate-100 rounded-xl overflow-auto bg-white shadow-2xs">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 bg-slate-50">
                        <TableHead className="w-1/5 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("displayName")} className="group flex items-center gap-1 hover:text-teal-700">
                            Name
                            <span className={cn("text-[10px]", sortField === "displayName" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "displayName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-1/5 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("companyName")} className="group flex items-center gap-1 hover:text-teal-700">
                            Company Name
                            <span className={cn("text-[10px]", sortField === "companyName" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "companyName" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-24 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("isActive")} className="group flex items-center gap-1 hover:text-teal-700">
                            Status
                            <span className={cn("text-[10px]", sortField === "isActive" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "isActive" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-1/5 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("email")} className="group flex items-center gap-1 hover:text-teal-700">
                            Email
                            <span className={cn("text-[10px]", sortField === "email" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "email" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-32 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("phone")} className="group flex items-center gap-1 hover:text-teal-700">
                            Work Phone
                            <span className={cn("text-[10px]", sortField === "phone" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "phone" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-36 px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("outstandingPayable")} className="group flex items-center justify-end gap-1 w-full hover:text-teal-700">
                            Payables (BCY)
                            <span className={cn("text-[10px]", sortField === "outstandingPayable" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "outstandingPayable" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                        <TableHead className="w-40 px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <button onClick={() => toggleSort("unusedCredits")} className="group flex items-center justify-end gap-1 w-full hover:text-teal-700">
                            Unused Credits (BCY)
                            <span className={cn("text-[10px]", sortField === "unusedCredits" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                              {sortField === "unusedCredits" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedVendors.map((c) => {
                        const primary = c.contactPersons?.find((p) => p.isPrimary) ?? c.contactPersons?.[0];
                        const email = c.email ?? primary?.email ?? "";
                        const phone = c.phone ?? primary?.workPhone ?? primary?.mobile ?? "";
                        return (
                          <TableRow
                            key={c._id}
                            className={cn(
                              "border-b border-slate-100 last:border-0 hover:bg-slate-100/70 cursor-pointer transition-colors px-4 py-2.5",
                              c.isActive === false && "bg-slate-50/50 text-slate-400",
                            )}
                            onClick={() => selectVendor(c._id)}
                          >
                            <TableCell className="px-4 py-3 max-w-[160px] overflow-hidden">
                              <DraggableText alwaysActive className={cn("text-[13px] font-medium hover:underline block truncate", c.isActive === false ? "text-slate-400" : "text-teal-700 hover:text-teal-800")}>
                                {c.displayName}
                              </DraggableText>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-500 max-w-[160px] overflow-hidden">
                              <DraggableText alwaysActive className="block truncate">
                                {c.companyName ?? "—"}
                              </DraggableText>
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-500">
                              {c.isActive === false ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 select-none">
                                  <span className="h-1 w-1 rounded-full bg-slate-400" />
                                  Inactive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 select-none">
                                  <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-500 max-w-[180px] overflow-hidden">
                              {email ? (
                                <DraggableText alwaysActive className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{email}</span>
                                </DraggableText>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-slate-500 max-w-[140px] overflow-hidden">
                              {phone ? (
                                <DraggableText alwaysActive className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{phone}</span>
                                </DraggableText>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700">
                              {fmt(c.outstandingPayable ?? 0, c.currency ?? "INR")}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right tabular-nums text-slate-500">
                              {fmt(c.unusedCredits ?? 0, c.currency ?? "INR")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: vendor detail panel ── */}
          {panelOpen && (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white">
              {loadingVendor && !selectedVendor ? (
                <div className="flex flex-1 flex-col animate-pulse bg-white">
                  {/* Detail header shimmer */}
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                    <div className="h-5 w-48 bg-slate-200 rounded" />
                    <div className="ml-auto flex items-center gap-2">
                      <div className="h-8 w-16 bg-slate-100 rounded" />
                      <div className="h-8 w-8 bg-slate-100 rounded-full" />
                    </div>
                  </div>
                  {/* Detail tabs shimmer */}
                  <div className="flex gap-6 border-b border-slate-100 px-6 shrink-0 bg-white py-3">
                    <div className="h-4 w-16 bg-slate-200 rounded" />
                    <div className="h-4 w-20 bg-slate-200/50 rounded" />
                    <div className="h-4 w-24 bg-slate-200/50 rounded" />
                  </div>
                  {/* Detail content shimmer */}
                  <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                    {Array.from({ length: 7 }).map((_, idx) => (
                      <div key={idx} className="flex py-2 border-b border-slate-50 last:border-0 items-center">
                        <div className="w-1/3 h-4 bg-slate-100 rounded" />
                        <div className="w-1/2 h-4 bg-slate-200/80 rounded ml-4" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedVendor ? (
                <VendorDetailView
                  vendor={selectedVendor}
                  initialTab={selectedTab ?? undefined}
                  onVendorUpdate={(v) => {
                    setSelectedVendor(v);
                    setContacts((cs) =>
                      cs.map((c) =>
                        c._id === v._id
                          ? { ...c, displayName: v.displayName, companyName: v.companyName, isActive: v.isActive }
                          : c,
                      ),
                    );
                  }}
                  onClose={handleClose}
                />
              ) : null}
            </div>
          )}
        </div>
        <ExportDialog
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          initialModule="vendors"
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
