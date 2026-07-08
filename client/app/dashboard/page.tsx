"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, PlusCircle, Loader2 } from "lucide-react";
import { itemApi, type Item } from "@/lib/api/items";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportApi, type DashboardSummaryResponse } from "@/lib/api/reports";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

type PeriodOption = "this-fy" | "previous-fy" | "last-12" | "last-6";
type BasisOption = "accrual" | "cash";

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getFinancialYearRange(reference: Date, offset = 0): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  const start = new Date(fyStartYear + offset, 3, 1);
  const end = endOfDay(new Date(fyStartYear + offset + 1, 2, 31));
  return { from: toISODate(start), to: toISODate(end) };
}

function getLastMonthsRange(reference: Date, months: number): { from: string; to: string } {
  const end = endOfDay(reference);
  const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  return { from: toISODate(start), to: toISODate(end) };
}

function getRangeForPeriod(period: PeriodOption, reference: Date): { from: string; to: string } {
  if (period === "this-fy") return getFinancialYearRange(reference, 0);
  if (period === "previous-fy") return getFinancialYearRange(reference, -1);
  if (period === "last-6") return getLastMonthsRange(reference, 6);
  return getLastMonthsRange(reference, 12);
}

function formatAxisAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)} M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)} K`;
  return `${Math.round(value)}`;
}

function getChartDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 5_000];

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);

  if (min === max) {
    if (min === 0) return [0, 5_000];
    const pad = Math.max(Math.abs(min) * 0.15, 1_000);
    return [Math.min(0, roundTo2(min - pad)), roundTo2(max + pad)];
  }

  const range = max - min;
  const pad = Math.max(range * 0.12, 1_000);
  return [roundTo2(min - pad), roundTo2(max + pad)];
}

function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDisplayDate(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonthYear(value?: string): string {
  if (!value) return "";
  const [year, month] = value.split("-").map((part) => Number(part));
  if (!year || !month) return value;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { firebaseUser, dbUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [lowStockItems, setLowStockItems] = useState<Item[]>([]);
  const [loadingLowStock, setLoadingLowStock] = useState(true);

  const [cashFlowPeriod, setCashFlowPeriod] = useState<PeriodOption>("this-fy");
  const [incomeExpensePeriod, setIncomeExpensePeriod] = useState<PeriodOption>("this-fy");
  const [incomeExpenseBasis, setIncomeExpenseBasis] = useState<BasisOption>("accrual");
  const [watchlistBasis, setWatchlistBasis] = useState<BasisOption>("accrual");
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string>("");

  const isUnverifiedEmailPasswordUser =
    !!firebaseUser &&
    firebaseUser.providerData.some((p) => p.providerId === "password") &&
    !firebaseUser.emailVerified;

  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      if (isUnverifiedEmailPasswordUser) {
        router.replace("/login");
      }
    }
  }, [loading, firebaseUser, isUnverifiedEmailPasswordUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (loading || orgLoading || !firebaseUser || isUnverifiedEmailPasswordUser) return;

    let cancelled = false;
    const now = new Date();
    const today = toISODate(now);

    async function loadDashboard() {
      setLoadingDashboard(true);
      setDashboardError("");
      try {
        const cashRange = getRangeForPeriod(cashFlowPeriod, now);
        const incomeRange = getRangeForPeriod(incomeExpensePeriod, now);

        const response = await reportApi.dashboardSummary({
          asOf: today,
          cashFrom: cashRange.from,
          cashTo: cashRange.to,
          incomeFrom: incomeRange.from,
          incomeTo: incomeRange.to,
          incomeBasis: incomeExpenseBasis,
          watchlistBasis,
          topExpensesLimit: 5,
        });

        if (cancelled) return;
        setDashboard(response.data);
      } catch {
        if (cancelled) return;
        setDashboardError("Unable to load dashboard data. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoadingDashboard(false);
      }
    }

    async function loadLowStockItems() {
      setLoadingLowStock(true);
      try {
        const res = await itemApi.list({ limit: 1000 });
        if (cancelled) return;
        const items = res.data || [];
        const lowStock = items.filter(
          (item) =>
            item.itemType === "Goods" &&
            item.inventoryTracked &&
            item.reorderPoint != null &&
            item.stockOnHand <= item.reorderPoint
        );
        setLowStockItems(lowStock);
      } catch (err) {
        console.error("Failed to load low stock items", err);
      } finally {
        if (!cancelled) setLoadingLowStock(false);
      }
    }

    if (pathname === "/dashboard") {
      loadDashboard();
      loadLowStockItems();
    }

    const handleFocus = () => {
      if (document.visibilityState === "visible" && pathname === "/dashboard") {
        loadDashboard();
        loadLowStockItems();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("visibilitychange", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleFocus);
    };
  }, [
    loading,
    orgLoading,
    firebaseUser,
    isUnverifiedEmailPasswordUser,
    cashFlowPeriod,
    incomeExpensePeriod,
    incomeExpenseBasis,
    watchlistBasis,
    pathname,
  ]);

  if (loading || orgLoading || !firebaseUser || isUnverifiedEmailPasswordUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const firstName = dbUser?.name?.split(" ")[0] || firebaseUser.displayName?.split(" ")[0] || "there";

  const receivableTotal = dashboard?.receivables.total || 0;
  const receivableCurrent = dashboard?.receivables.current || 0;
  const receivableOverdue = dashboard?.receivables.overdue || 0;

  const payableTotal = dashboard?.payables.total || 0;
  const payableCurrent = dashboard?.payables.current || 0;
  const payableOverdue = dashboard?.payables.overdue || 0;

  const cashFlowData = dashboard?.cashFlow.months || [];
  const cashFlowStart = dashboard?.cashFlow.startBalance || 0;
  const cashFlowIncomingTotal = dashboard?.cashFlow.incomingTotal || 0;
  const cashFlowOutgoingTotal = dashboard?.cashFlow.outgoingTotal || 0;
  const cashClosing = dashboard?.cashFlow.closingBalance || 0;
  const cashFlowStartDate = dashboard?.periods?.cashFlow?.from || toISODate(new Date());
  const cashFlowEndDate = dashboard?.periods?.cashFlow?.to || toISODate(new Date());
  const asOfDate = dashboard?.asOf || toISODate(new Date());

  const incomeExpenseData = dashboard?.incomeExpense.months || [];
  const incomeTotal = dashboard?.incomeExpense.totalIncome || 0;
  const expenseTotal = dashboard?.incomeExpense.totalExpense || 0;
  const incomeExpenseNet = dashboard?.incomeExpense.netAmount ?? incomeTotal - expenseTotal;

  const cashFlowDomain = getChartDomain(cashFlowData.map((row) => row.closing));
  const incomeExpenseDomain = getChartDomain([
    ...incomeExpenseData.map((row) => row.income),
    ...incomeExpenseData.map((row) => row.expense),
  ]);

  const topExpenses = dashboard?.topExpenses.rows || [];
  const bankAccounts = dashboard?.bankCreditCards.rows || [];
  const watchlistRows = dashboard?.accountWatchlist.rows || [];

  const onNavigateFromMenu = (path: string) => {
    router.push(path);
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader breadcrumb={<span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Dashboard</span>} />

        <div className="flex flex-1 flex-col gap-6 p-6 bg-white">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hello, {firstName}</h1>
            <p className="text-sm text-slate-500">Dashboard overview of receivables, payables, cash flow, and expenses.</p>
            {dashboardError ? <p className="text-sm text-rose-600 mt-1">{dashboardError}</p> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-slate-100 shadow-2xs">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900">Total Receivables</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-2.5 gap-1.5 text-xs font-semibold text-slate-600 bg-white border-slate-200 hover:bg-slate-50 rounded-md shadow-2xs">
                      <PlusCircle className="h-3.5 w-3.5 text-teal-600" />
                      <span>New</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem className="bg-teal-600 text-white focus:bg-teal-700 focus:text-white cursor-pointer" onSelect={() => onNavigateFromMenu("/sales/invoices/new")}>
                      <PlusCircle className="h-4 w-4" />
                      New Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => onNavigateFromMenu("/sales/recurring-invoices/new")}>
                      <PlusCircle className="h-4 w-4 text-teal-600" />
                      New Recurring Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => onNavigateFromMenu("/sales/retainer-invoices/new")}> 
                      <PlusCircle className="h-4 w-4 text-teal-600" />
                      New Retainer Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => onNavigateFromMenu("/sales/payments-received/new")}>
                      <PlusCircle className="h-4 w-4 text-teal-600" />
                      New Customer Payment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-400">Total unpaid invoices</div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{fmtCurrency(receivableTotal)}</div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${receivableTotal > 0 ? Math.round((receivableOverdue / receivableTotal) * 100) : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-500">Current: <span className="font-medium text-slate-700">{fmtCurrency(receivableCurrent)}</span></span>
                  <span className="text-slate-500">Overdue: <span className="font-medium text-amber-600">{fmtCurrency(receivableOverdue)}</span></span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-100 shadow-2xs">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-bold text-slate-900">Total Payables</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-2.5 gap-1.5 text-xs font-semibold text-slate-600 bg-white border-slate-200 hover:bg-slate-50 rounded-md shadow-2xs">
                      <PlusCircle className="h-3.5 w-3.5 text-teal-600" />
                      <span>New</span>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem className="bg-teal-600 text-white focus:bg-teal-700 focus:text-white cursor-pointer" onSelect={() => onNavigateFromMenu("/purchases/bills/new")}>
                      <PlusCircle className="h-4 w-4" />
                      New Bill
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => onNavigateFromMenu("/purchases/payments-made/new")}>
                      <PlusCircle className="h-4 w-4 text-teal-600" />
                      New Vendor Payment
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => onNavigateFromMenu("/purchases/recurring-bills/new")}>
                      <PlusCircle className="h-4 w-4 text-teal-600" />
                      New Recurring Bill
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-slate-400">Total unpaid bills</div>
                <div className="text-3xl font-bold text-slate-900 tracking-tight">{fmtCurrency(payableTotal)}</div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${payableTotal > 0 ? Math.round((payableOverdue / payableTotal) * 100) : 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-500">Current: <span className="font-medium text-slate-700">{fmtCurrency(payableCurrent)}</span></span>
                  <span className="text-slate-500">Overdue: <span className="font-medium text-rose-600">{fmtCurrency(payableOverdue)}</span></span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-100 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-lg font-bold text-slate-900">Cash Flow</CardTitle>
              <Select value={cashFlowPeriod} onValueChange={(v) => setCashFlowPeriod(v as PeriodOption)}>
                <SelectTrigger className="w-[190px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="this-fy">This Fiscal Year</SelectItem>
                  <SelectItem value="previous-fy">Previous Fiscal Year</SelectItem>
                  <SelectItem value="last-12">Last 12 Months</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1fr_320px]">
              {loadingDashboard ? (
                <>
                  <div className="h-[240px] bg-slate-50/50 rounded-xl animate-pulse flex items-center justify-center" />
                  <div className="space-y-5 text-sm animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2">
                        <div className="h-4 bg-slate-100 rounded w-1/3" />
                        <div className="h-4 bg-slate-100 rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cashFlowData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="cashClosing" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f766e" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#0f766e" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="key" tickLine={false} axisLine={false} tickFormatter={(value) => formatMonthYear(String(value))} />
                        <YAxis domain={cashFlowDomain} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisAmount(Number(v))} />
                        <Tooltip
                          labelFormatter={(value) => formatMonthYear(String(value))}
                          formatter={(value: number) => fmtCurrency(value)}
                        />
                        <Area
                          type="monotone"
                          dataKey="closing"
                          stroke="#0f766e"
                          fill="url(#cashClosing)"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#0f766e", strokeWidth: 0 }}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-slate-400" />Opening Balance</span>
                      <span className="font-semibold text-slate-800">{fmtCurrency(cashFlowStart)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-emerald-600 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-emerald-500" />Incoming</span>
                      <span className="font-semibold text-slate-800">{fmtCurrency(cashFlowIncomingTotal)} ( + )</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-rose-600 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-rose-500" />Outgoing</span>
                      <span className="font-semibold text-slate-800">{fmtCurrency(cashFlowOutgoingTotal)} ( - )</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <span className="text-teal-700 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-teal-600" />Cash as on {formatDisplayDate(asOfDate)}</span>
                      <span className="font-semibold text-slate-800">{fmtCurrency(cashClosing)} ( = )</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-100 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-lg font-bold text-slate-900">Income and Expense</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={incomeExpensePeriod} onValueChange={(v) => setIncomeExpensePeriod(v as PeriodOption)}>
                    <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this-fy">This Fiscal Year</SelectItem>
                      <SelectItem value="previous-fy">Previous Fiscal Year</SelectItem>
                      <SelectItem value="last-12">Last 12 Months</SelectItem>
                      <SelectItem value="last-6">Last 6 Months</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="rounded-lg border border-slate-200 p-0.5 text-xs flex bg-slate-50/50">
                    <button
                      type="button"
                      className={cn("px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium", incomeExpenseBasis === "accrual" ? "bg-teal-600 text-white shadow-2xs" : "text-slate-500 hover:text-slate-900")}
                      onClick={() => setIncomeExpenseBasis("accrual")}
                    >
                      Accrual
                    </button>
                    <button
                      type="button"
                      className={cn("px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium", incomeExpenseBasis === "cash" ? "bg-teal-600 text-white shadow-2xs" : "text-slate-500 hover:text-slate-900")}
                      onClick={() => setIncomeExpenseBasis("cash")}
                    >
                      Cash
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingDashboard ? (
                  <>
                    <div className="flex items-center gap-6 text-sm animate-pulse pb-2">
                      <div><div className="h-3 bg-slate-100 rounded w-16 mb-1.5" /><div className="h-6 bg-slate-100 rounded w-24" /></div>
                      <div><div className="h-3 bg-slate-100 rounded w-16 mb-1.5" /><div className="h-6 bg-slate-100 rounded w-24" /></div>
                    </div>
                    <div className="h-[220px] bg-slate-50/50 rounded-xl animate-pulse" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-6 text-sm">
                      <div><span className="text-emerald-600 text-xs font-medium">Total Income</span><div className="text-xl font-bold text-slate-800">{fmtCurrency(incomeTotal)}</div></div>
                      <div><span className="text-rose-600 text-xs font-medium">Total Expenses</span><div className="text-xl font-bold text-slate-800">{fmtCurrency(expenseTotal)}</div></div>
                    </div>
                    <div className="h-[220px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={incomeExpenseData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="key" tickLine={false} axisLine={false} tickFormatter={(value) => formatMonthYear(String(value))} />
                          <YAxis domain={incomeExpenseDomain} tickLine={false} axisLine={false} tickFormatter={(v) => formatAxisAmount(Number(v))} />
                          <Tooltip
                            labelFormatter={(value) => formatMonthYear(String(value))}
                            formatter={(value: number) => fmtCurrency(value)}
                          />
                          <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0, fill: "#10b981" }} activeDot={{ r: 4 }} />
                          <Line type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0, fill: "#f43f5e" }} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-slate-400">Net {incomeExpenseBasis === "cash" ? "cash" : "income"}: <span className="font-semibold text-slate-700">{fmtCurrency(incomeExpenseNet)}</span></p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-100 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-lg font-bold text-slate-900">Top Expenses</CardTitle>
                <Select value={incomeExpensePeriod} onValueChange={(v) => setIncomeExpensePeriod(v as PeriodOption)}>
                  <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-fy">This Fiscal Year</SelectItem>
                    <SelectItem value="previous-fy">Previous Fiscal Year</SelectItem>
                    <SelectItem value="last-12">Last 12 Months</SelectItem>
                    <SelectItem value="last-6">Last 6 Months</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {loadingDashboard ? (
                  <div className="space-y-4 animate-pulse">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="space-y-1.5 pb-3 border-b border-slate-50 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <div className="h-4 bg-slate-100 rounded w-1/3" />
                          <div className="h-4 bg-slate-100 rounded w-1/5" />
                        </div>
                        <div className="h-1.5 bg-slate-50 rounded-full w-full" />
                      </div>
                    ))}
                  </div>
                ) : topExpenses.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No expense recorded for selected period</div>
                ) : (
                  <div className="space-y-4">
                    {topExpenses.map((row) => {
                      const pct = expenseTotal > 0 ? Math.round((row.totalAmount / expenseTotal) * 100) : 0;
                      return (
                        <div key={row.categoryName} className="space-y-1.5 pb-3 border-b last:border-b-0 last:pb-0">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">{row.categoryName}</span>
                            <span className="font-semibold text-slate-900">{fmtCurrency(row.totalAmount)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div 
                                className="h-full bg-teal-600 rounded-full" 
                                style={{ width: `${pct}%` }} 
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-100 shadow-2xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>Low Stock Alert</span>
                  {lowStockItems.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                      <span className="h-1 w-1 rounded-full bg-rose-500" />
                      {lowStockItems.length}
                    </span>
                  )}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50/50"
                  onClick={() => router.push("/items")}
                >
                  View All
                </Button>
              </CardHeader>
              <CardContent className="h-[220px] overflow-y-auto">
                {loadingLowStock ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0 p-1.5">
                        <div className="flex flex-col gap-1.5 flex-1">
                          <div className="h-4 bg-slate-100 rounded w-1/3" />
                          <div className="h-3 bg-slate-50 rounded w-1/5" />
                        </div>
                        <div className="text-right flex flex-col items-end gap-1.5 w-1/4">
                          <div className="h-4 bg-slate-100 rounded w-1/2" />
                          <div className="h-3 bg-slate-50 rounded w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : lowStockItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
                    <span className="text-emerald-600 font-medium">✓ All stock levels healthy</span>
                    <span className="text-xs text-slate-400">No items are below their reorder points.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lowStockItems.map((item) => (
                      <div
                        key={item._id}
                        className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 cursor-pointer hover:bg-slate-50/50 p-1.5 rounded transition-colors"
                        onClick={() => router.push(`/items?id=${item._id}`)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-slate-800">{item.name}</span>
                          <span className="text-xs text-slate-400">SKU: {item.sku || "—"}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-rose-600 block">
                            {item.stockOnHand} {typeof item.unit === "object" && item.unit ? (item.unit as any).abbreviation : item.unit || "units"}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Reorder level: {item.reorderPoint}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border-slate-100 shadow-2xs">
              <CardHeader><CardTitle className="text-lg font-bold text-slate-900">Bank and Credit Cards</CardTitle></CardHeader>
              <CardContent>
                {loadingDashboard ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between border-b border-slate-55 pb-2.5 last:border-0">
                        <div className="h-4 bg-slate-100 rounded w-1/3" />
                        <div className="h-4 bg-slate-100 rounded w-1/4" />
                      </div>
                    ))}
                  </div>
                ) : bankAccounts.length === 0 ? (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No bank or credit account found</div>
                ) : (
                  <div className="space-y-1">
                    {bankAccounts.slice(0, 8).map((account) => (
                      <div key={account.accountId} className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0 last:pb-0 pt-2.5 first:pt-0">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-teal-500" />
                          <span className="text-sm font-medium text-slate-700">{account.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{fmtCurrency(account.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-100 shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-lg font-bold text-slate-900">Account Watchlist</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Basis</span>
                <Select value={watchlistBasis} onValueChange={(v) => setWatchlistBasis(v as BasisOption)}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrual">Accrual</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl border border-slate-100 p-4 bg-slate-50/30">
                      <div className="h-3 bg-slate-100 rounded w-1/2 mb-2" />
                      <div className="h-6 bg-slate-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(watchlistRows.length ? watchlistRows : [
                    { key: "receivables", label: "Receivables", value: receivableTotal },
                    { key: "payables", label: "Payables", value: payableTotal },
                    { key: "cash", label: "Cash Closing", value: cashClosing },
                    { key: "net", label: "Net Income", value: incomeTotal - expenseTotal },
                  ]).map((row) => (
                    <div key={row.key} className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 transition-all hover:bg-slate-50/60">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{row.label}</div>
                      <div className="text-xl font-bold text-slate-900 mt-1">{fmtCurrency(row.value)}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
