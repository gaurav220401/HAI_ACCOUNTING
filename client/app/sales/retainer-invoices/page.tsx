"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, RefreshCw, Search, Calendar, ChevronDown } from "lucide-react";
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
  retainerInvoiceApi,
  type RetainerInvoice,
  type RetainerInvoiceStatus,
} from "@/lib/api/retainer-invoices";

const STATUS_FILTERS: Array<RetainerInvoiceStatus | "All"> = [
  "All",
  "Draft",
  "Sent",
  "Partially Paid",
  "Paid",
  "Partially Applied",
  "Applied",
  "Partially Refunded",
  "Refunded",
  "Void",
];

const STATUS_STYLES: Record<RetainerInvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-200",
  Sent: "bg-teal-50 text-teal-700 border-teal-200",
  "Partially Paid": "bg-amber-50 text-amber-700 border-amber-200",
  Paid: "bg-green-50 text-green-700 border-green-200",
  "Partially Applied": "bg-cyan-50 text-cyan-700 border-cyan-200",
  Applied: "bg-teal-50 text-teal-700 border-teal-200",
  "Partially Refunded": "bg-orange-50 text-orange-700 border-orange-200",
  Refunded: "bg-purple-50 text-purple-700 border-purple-200",
  Void: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(customer: RetainerInvoice["customer_id"]) {
  if (typeof customer === "string") return customer;
  return customer?.displayName || customer?.companyName || "-";
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RetainerInvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [rows, setRows] = useState<RetainerInvoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RetainerInvoiceStatus | "All">("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchRows = useCallback(async () => {
    setFetching(true);
    try {
      const response = await retainerInvoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 200,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setRows(response.data || []);
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Failed to fetch retainer invoices"));
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchRows();
    }
  }, [firebaseUser, loading, fetchRows]);

  async function handleAction(
    action: "send" | "payment" | "refund" | "void" | "delete",
    retainer: RetainerInvoice,
  ) {
    try {
      if (action === "send") {
        await retainerInvoiceApi.send(retainer._id);
      }

      if (action === "payment") {
        const amountInput = window.prompt("Enter payment amount", String(retainer.balance_due || ""));
        if (!amountInput) return;
        const amount = Number(amountInput);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter a valid amount");
          return;
        }
        await retainerInvoiceApi.recordPayment(retainer._id, {
          amount,
          payment_date: new Date().toISOString(),
          payment_mode: retainer.payment_mode || "Cash",
        });
      }

      if (action === "refund") {
        const amountInput = window.prompt("Enter refund amount", String(retainer.amount_unapplied || ""));
        if (!amountInput) return;
        const amount = Number(amountInput);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter a valid amount");
          return;
        }
        await retainerInvoiceApi.refund(retainer._id, {
          amount,
          refund_date: new Date().toISOString(),
        });
      }

      if (action === "void") {
        const confirmed = window.confirm(`Void retainer invoice ${retainer.retainer_number}?`);
        if (!confirmed) return;
        await retainerInvoiceApi.void(retainer._id, "Void from list view");
      }

      if (action === "delete") {
        const confirmed = window.confirm(`Delete retainer invoice ${retainer.retainer_number}?`);
        if (!confirmed) return;
        await retainerInvoiceApi.remove(retainer._id);
      }

      await fetchRows();
      toast.success("Action completed");
    } catch (error: unknown) {
      toast.error(toErrorMessage(error, "Action failed"));
    }
  }

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredRows = useMemo(() => {
    let list = rows;

    if (fromDate) {
      const fromTime = new Date(fromDate).getTime();
      list = list.filter(
        (row) => new Date(row.retainer_date || 0).getTime() >= fromTime,
      );
    }
    if (toDate) {
      const toTime = new Date(toDate).getTime() + 86399999;
      list = list.filter(
        (row) => new Date(row.retainer_date || 0).getTime() <= toTime,
      );
    }

    const value = search.trim().toLowerCase();
    if (!value) return list;

    return list.filter((row) => {
      return [
        row.retainer_number,
        row.retainer_id,
        row.reference_number,
        customerName(row.customer_id),
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value));
    });
  }, [rows, search, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalAmount = filteredRows.reduce(
      (acc, r) => acc + Number(r.total_amount || 0),
      0,
    );
    const totalApplied = filteredRows.reduce(
      (acc, r) => acc + Number(r.amount_applied || 0),
      0,
    );
    const totalUnapplied = filteredRows.reduce(
      (acc, r) => acc + Number(r.amount_unapplied || 0),
      0,
    );
    return {
      count: filteredRows.length,
      totalAmount,
      totalApplied,
      totalUnapplied,
    };
  }, [filteredRows]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  type RetainerSortField = "date" | "number" | "customer" | "total" | "received" | "applied" | "unapplied" | "status";
  type RetainerSortOrder = "asc" | "desc";

  const [sortField, setSortField] = useState<RetainerSortField>("date");
  const [sortOrder, setSortOrder] = useState<RetainerSortOrder>("desc");

  function toggleSort(field: RetainerSortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  }

  const sortedRetainers = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let aVal: any = "";
      let bVal: any = "";
      switch (sortField) {
        case "date":
          aVal = new Date(a.retainer_date || 0).getTime();
          bVal = new Date(b.retainer_date || 0).getTime();
          break;
        case "number":
          aVal = a.retainer_number || "";
          bVal = b.retainer_number || "";
          return sortOrder === "asc"
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
        case "customer":
          aVal = customerName(a.customer_id).toLowerCase();
          bVal = customerName(b.customer_id).toLowerCase();
          break;
        case "total":
          aVal = Number(a.total_amount || 0);
          bVal = Number(b.total_amount || 0);
          break;
        case "received":
          aVal = Number(a.amount_received || 0);
          bVal = Number(b.amount_received || 0);
          break;
        case "applied":
          aVal = Number(a.amount_applied || 0);
          bVal = Number(b.amount_applied || 0);
          break;
        case "unapplied":
          aVal = Number(a.amount_unapplied || 0);
          bVal = Number(b.amount_unapplied || 0);
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Retainer Invoices</span>
            </span>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search retainer invoices..."
                  className="h-9 pl-8"
                />
              </div>

              {/* Compact Date Range Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 text-xs gap-1.5 border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50",
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

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RetainerInvoiceStatus | "All")}>
                <SelectTrigger className="w-36 h-9 text-xs bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Retainer Invoices</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Sent">Sent</SelectItem>
                  <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Unpaid">Unpaid</SelectItem>
                  <SelectItem value="Void">Void</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => void fetchRows()}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/sales/retainer-invoices/new")}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-3">
          {/* Sleek Ultra-Compact KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Retainers</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{summary.count}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Amount</span>
              <span className="text-sm font-bold text-teal-700 tabular-nums">{formatCurrency(summary.totalAmount)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Applied</span>
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{formatCurrency(summary.totalApplied)}</span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2 rounded-lg border border-slate-200 bg-white shadow-2xs">
              <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wide">Unapplied</span>
              <span className="text-sm font-bold text-amber-600 tabular-nums">{formatCurrency(summary.totalUnapplied)}</span>
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
              <div className="max-w-xl space-y-3">
                <h2 className="text-xl font-semibold">No retainer invoices yet</h2>
                <p className="text-sm text-muted-foreground">
                  Create a retainer invoice to collect and apply customer advances against invoices.
                </p>
                <Button onClick={() => router.push("/sales/retainer-invoices/new")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">
                  Create Retainer Invoice
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button onClick={() => toggleSort("date")} className="group flex items-center gap-1 hover:text-teal-700">
                        Date
                        <span className={cn("text-[10px]", sortField === "date" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "date" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("number")} className="group flex items-center gap-1 hover:text-teal-700">
                        Retainer Number
                        <span className={cn("text-[10px]", sortField === "number" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "number" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort("customer")} className="group flex items-center gap-1 hover:text-teal-700">
                        Customer
                        <span className={cn("text-[10px]", sortField === "customer" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "customer" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("total")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Total
                        <span className={cn("text-[10px]", sortField === "total" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "total" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("received")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Received
                        <span className={cn("text-[10px]", sortField === "received" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "received" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("applied")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Applied
                        <span className={cn("text-[10px]", sortField === "applied" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "applied" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => toggleSort("unapplied")} className="group flex items-center gap-1 ml-auto hover:text-teal-700">
                        Unapplied
                        <span className={cn("text-[10px]", sortField === "unapplied" ? "text-teal-700 font-bold" : "text-slate-300 group-hover:text-slate-500")}>
                          {sortField === "unapplied" ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
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
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRetainers.map((retainer) => (
                    <TableRow
                      key={retainer._id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => router.push(`/sales/retainer-invoices/${retainer._id}`)}
                    >
                      <TableCell>{formatDate(retainer.retainer_date)}</TableCell>
                      <TableCell className="font-medium text-teal-700">{retainer.retainer_number}</TableCell>
                      <TableCell>{customerName(retainer.customer_id)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_received)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_applied)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(retainer.amount_unapplied)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[retainer.status]}>
                          {retainer.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/sales/retainer-invoices/${retainer._id}`)}
                            >
                              View retainer invoice
                            </DropdownMenuItem>
                            {retainer.status === "Draft" ? (
                              <DropdownMenuItem onClick={() => void handleAction("send", retainer)}>
                                Mark as sent
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.balance_due > 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("payment", retainer)}>
                                Record payment
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_unapplied > 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("refund", retainer)}>
                                Record refund
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_received <= 0.009 && retainer.status !== "Void" ? (
                              <DropdownMenuItem onClick={() => void handleAction("void", retainer)}>
                                Void
                              </DropdownMenuItem>
                            ) : null}
                            {retainer.amount_received <= 0.009 ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => void handleAction("delete", retainer)}
                              >
                                Delete
                              </DropdownMenuItem>
                            ) : null}
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
