"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, PlusCircle } from "lucide-react";
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

    if (pathname === "/dashboard") {
      loadDashboard();
    }

    const handleFocus = () => {
      if (document.visibilityState === "visible" && pathname === "/dashboard") {
        loadDashboard();
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
        <PageHeader breadcrumb={<span className="text-sm font-medium">Dashboard</span>} />

        <div className="flex flex-1 flex-col gap-6 p-6 bg-slate-50/70">
          <div>
            <h1 className="text-2xl font-semibold">Hello, {firstName}</h1>
            <p className="text-sm text-muted-foreground">Dashboard overview of receivables, payables, cash flow, and expenses.</p>
            {dashboardError ? <p className="text-sm text-red-600 mt-1">{dashboardError}</p> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-2xl border-b border-dotted">Total Receivables</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-sm font-medium text-slate-700">
                      <PlusCircle className="h-4 w-4 text-blue-600" />
                      <span>New</span>
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem className="bg-blue-500 text-white focus:bg-blue-500 focus:text-white" onSelect={() => onNavigateFromMenu("/sales/invoices/new")}>
                      <PlusCircle className="h-4 w-4" />
                      New Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onNavigateFromMenu("/sales/recurring-invoices/new")}>
                      <PlusCircle className="h-4 w-4 text-blue-500" />
                      New Recurring Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onNavigateFromMenu("/sales/retainer-invoices/new")}> 
                      <PlusCircle className="h-4 w-4 text-blue-500" />
                      New Retainer Invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onNavigateFromMenu("/sales/payments-received/new")}>
                      <PlusCircle className="h-4 w-4 text-blue-500" />
                      New Customer Payment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">Total unpaid invoices</div>
                <div className="text-4xl font-semibold">{fmtCurrency(receivableTotal)}</div>
                <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${receivableTotal > 0 ? Math.round((receivableOverdue / receivableTotal) * 100) : 0}%` }} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-blue-600">Current : {fmtCurrency(receivableCurrent)}</span>
                  <span className="text-orange-600">Overdue : {fmtCurrency(receivableOverdue)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-2xl border-b border-dotted">Total Payables</CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-sm font-medium text-slate-700">
                      <PlusCircle className="h-4 w-4 text-blue-600" />
                      <span>New</span>
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem className="bg-blue-500 text-white focus:bg-blue-500 focus:text-white" onSelect={() => onNavigateFromMenu("/purchases/bills/new")}>
                      <PlusCircle className="h-4 w-4" />
                      New Bill
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onNavigateFromMenu("/purchases/payments-made/new")}>
                      <PlusCircle className="h-4 w-4 text-blue-500" />
                      New Vendor Payment
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onNavigateFromMenu("/purchases/recurring-bills/new")}>
                      <PlusCircle className="h-4 w-4 text-blue-500" />
                      New Recurring Bill
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">Total unpaid bills</div>
                <div className="text-4xl font-semibold">{fmtCurrency(payableTotal)}</div>
                <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${payableTotal > 0 ? Math.round((payableOverdue / payableTotal) * 100) : 0}%` }} />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-blue-600">Current : {fmtCurrency(payableCurrent)}</span>
                  <span className="text-orange-600">Overdue : {fmtCurrency(payableOverdue)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-2xl">Cash Flow</CardTitle>
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
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cashFlowData} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cashClosing" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
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
                      type="linear"
                      dataKey="closing"
                      stroke="#3b82f6"
                      fill="url(#cashClosing)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-slate-400" />Opening Balance</span>
                  <span className="font-semibold">{fmtCurrency(cashFlowStart)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-600 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-emerald-500" />Incoming</span>
                  <span className="font-semibold">{fmtCurrency(cashFlowIncomingTotal)} ( + )</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-rose-600 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-rose-500" />Outgoing</span>
                  <span className="font-semibold">{fmtCurrency(cashFlowOutgoingTotal)} ( - )</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <span className="text-blue-700 inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-blue-600" />Cash as on {formatDisplayDate(asOfDate)}</span>
                  <span className="font-semibold">{fmtCurrency(cashClosing)} ( = )</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-2xl">Income and Expense</CardTitle>
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
                  <div className="rounded border p-0.5 text-xs">
                    <button
                      type="button"
                      className={cn("px-2 py-1 rounded", incomeExpenseBasis === "accrual" ? "bg-blue-500 text-white" : "text-muted-foreground")}
                      onClick={() => setIncomeExpenseBasis("accrual")}
                    >
                      Accrual
                    </button>
                    <button
                      type="button"
                      className={cn("px-2 py-1 rounded", incomeExpenseBasis === "cash" ? "bg-blue-500 text-white" : "text-muted-foreground")}
                      onClick={() => setIncomeExpenseBasis("cash")}
                    >
                      Cash
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-6 text-sm">
                  <div><span className="text-emerald-600">Total Income</span><div className="text-xl font-semibold">{fmtCurrency(incomeTotal)}</div></div>
                  <div><span className="text-rose-600">Total Expenses</span><div className="text-xl font-semibold">{fmtCurrency(expenseTotal)}</div></div>
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
                      <Line type="linear" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                      <Line type="linear" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">Net {incomeExpenseBasis === "cash" ? "cash" : "income"}: {fmtCurrency(incomeExpenseNet)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-2xl">Top Expenses</CardTitle>
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
                {topExpenses.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No expense recorded for selected period</div>
                ) : (
                  <div className="space-y-3">
                    {topExpenses.map((row) => (
                      <div key={row.categoryName} className="flex items-center justify-between border-b pb-2">
                        <span className="text-sm">{row.categoryName}</span>
                        <span className="font-semibold">{fmtCurrency(row.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-2xl">Projects</CardTitle></CardHeader>
              <CardContent className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">Add Project(s) to this watchlist</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-2xl">Bank and Credit Cards</CardTitle></CardHeader>
              <CardContent>
                {bankAccounts.length === 0 ? (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No bank or credit account found</div>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.slice(0, 8).map((account) => (
                      <div key={account.accountId} className="flex items-center justify-between border-b pb-2">
                        <span className="text-sm">{account.name}</span>
                        <span className="font-semibold">{fmtCurrency(account.balance)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-2xl">Account Watchlist</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Basis</span>
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
                <div className="h-16 flex items-center text-sm text-muted-foreground">Loading dashboard widgets...</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(watchlistRows.length ? watchlistRows : [
                    { key: "receivables", label: "Receivables", value: receivableTotal },
                    { key: "payables", label: "Payables", value: payableTotal },
                    { key: "cash", label: "Cash Closing", value: cashClosing },
                    { key: "net", label: "Net Income", value: incomeTotal - expenseTotal },
                  ]).map((row) => (
                    <div key={row.key} className="rounded border p-3">
                      <div className="text-xs text-muted-foreground">{row.label}</div>
                      <div className="text-lg font-semibold">{fmtCurrency(row.value)}</div>
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
