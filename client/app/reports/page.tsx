"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  ChevronDown,
  Download,
  FileText,
  Filter,
  Home,
  Loader2,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  Wallet,
  CreditCard,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  reportApi,
  dateRangeFromPreset,
  type TrialBalanceResponse,
  type ProfitLossResponse,
  type BalanceSheetResponse,
  type ControlReconciliationResponse,
  type GenericReportResponse,
} from "@/lib/api/reports";
import { cn } from "@/lib/utils";

/* ─── Report Definitions ────────────────────────────────────────────── */

interface ReportDef {
  id: string;
  name: string;
  category: string;
  apiCall: string;
  columns: { key: string; label: string; align?: "left" | "right"; format?: "currency" | "date" | "number" }[];
  useDateRange?: boolean;
  useAsOf?: boolean;
  useAgingBuckets?: boolean;
}

const REPORT_CATEGORIES = [
  { id: "all", label: "All Reports", icon: Home },
  { id: "financial-statements", label: "Financial Statements", icon: BarChart3 },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "receivables", label: "Receivables", icon: Wallet },
  { id: "payments-received", label: "Payments Received", icon: CreditCard },
  { id: "payables", label: "Payables", icon: FileText },
  { id: "purchases-expenses", label: "Purchases & Expenses", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "activity", label: "Activity", icon: Activity },
];

const REPORTS: ReportDef[] = [
  // Financial Statements
  {
    id: "trial-balance", name: "Trial Balance", category: "financial-statements", apiCall: "trialBalance",
    useAsOf: true,
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Account" },
      { key: "rootType", label: "Type" },
      { key: "closingDebit", label: "Debit (INR)", align: "right", format: "currency" },
      { key: "closingCredit", label: "Credit (INR)", align: "right", format: "currency" },
    ],
  },
  {
    id: "profit-loss", name: "Profit & Loss", category: "financial-statements", apiCall: "profitLoss",
    useDateRange: true, columns: [],
  },
  {
    id: "balance-sheet", name: "Balance Sheet", category: "financial-statements", apiCall: "balanceSheet",
    useAsOf: true, columns: [],
  },
  {
    id: "control-reconciliation", name: "Control Reconciliation", category: "financial-statements",
    apiCall: "controlReconciliation", useAsOf: true, columns: [],
  },
  // Sales
  {
    id: "sales-by-customer", name: "Sales by Customer", category: "sales", apiCall: "salesByCustomer",
    useDateRange: true,
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "invoiceCount", label: "Invoice Count", align: "right", format: "number" },
      { key: "totalSales", label: "Sales", align: "right", format: "currency" },
      { key: "totalWithTax", label: "Sales with Tax", align: "right", format: "currency" },
    ],
  },
  {
    id: "sales-by-item", name: "Sales by Item", category: "sales", apiCall: "salesByItem",
    useDateRange: true,
    columns: [
      { key: "itemName", label: "Item Name" },
      { key: "totalQuantity", label: "Quantity Sold", align: "right", format: "number" },
      { key: "totalAmount", label: "Total Amount", align: "right", format: "currency" },
      { key: "invoiceCount", label: "Invoices", align: "right", format: "number" },
    ],
  },
  // Receivables
  {
    id: "customer-balance-summary", name: "Customer Balance Summary", category: "receivables",
    apiCall: "customerBalanceSummary",
    columns: [
      { key: "customerName", label: "Customer Name" },
      { key: "openingBalance", label: "Opening Balance", align: "right", format: "currency" },
      { key: "outstandingReceivable", label: "Outstanding Receivable", align: "right", format: "currency" },
    ],
  },
  {
    id: "invoice-details", name: "Invoice Details", category: "receivables", apiCall: "invoiceDetails",
    useDateRange: true,
    columns: [
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "invoiceDate", label: "Date", format: "date" },
      { key: "customerName", label: "Customer" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", align: "right", format: "currency" },
      { key: "amountPaid", label: "Paid", align: "right", format: "currency" },
      { key: "balanceDue", label: "Balance Due", align: "right", format: "currency" },
    ],
  },
  {
    id: "receivable-summary", name: "Receivable Summary", category: "receivables",
    apiCall: "receivableSummary", useAgingBuckets: true,
    columns: [
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "customerName", label: "Customer" },
      { key: "invoiceDate", label: "Date", format: "date" },
      { key: "dueDate", label: "Due Date", format: "date" },
      { key: "balanceDue", label: "Balance Due", align: "right", format: "currency" },
    ],
  },
  // Payments Received
  {
    id: "payments-received", name: "Payments Received", category: "payments-received",
    apiCall: "paymentsReceived", useDateRange: true,
    columns: [
      { key: "paymentNumber", label: "Payment #" },
      { key: "paymentDate", label: "Date", format: "date" },
      { key: "customerName", label: "Customer" },
      { key: "paymentMode", label: "Mode" },
      { key: "totalReceived", label: "Amount", align: "right", format: "currency" },
      { key: "usedForInvoices", label: "Applied", align: "right", format: "currency" },
      { key: "excess", label: "Excess", align: "right", format: "currency" },
    ],
  },
  // Payables
  {
    id: "vendor-balance-summary", name: "Vendor Balance Summary", category: "payables",
    apiCall: "vendorBalanceSummary",
    columns: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "openingBalance", label: "Opening Balance", align: "right", format: "currency" },
      { key: "outstandingPayable", label: "Outstanding Payable", align: "right", format: "currency" },
    ],
  },
  {
    id: "bill-details", name: "Bill Details", category: "payables", apiCall: "billDetails",
    useDateRange: true,
    columns: [
      { key: "billNumber", label: "Bill #" },
      { key: "billDate", label: "Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", align: "right", format: "currency" },
      { key: "amountPaid", label: "Paid", align: "right", format: "currency" },
      { key: "balanceDue", label: "Balance Due", align: "right", format: "currency" },
    ],
  },
  {
    id: "vendor-credit-details", name: "Vendor Credit Details", category: "payables",
    apiCall: "vendorCreditDetails", useDateRange: true,
    columns: [
      { key: "creditNumber", label: "Credit #" },
      { key: "creditDate", label: "Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", align: "right", format: "currency" },
      { key: "applied", label: "Applied", align: "right", format: "currency" },
      { key: "balance", label: "Balance", align: "right", format: "currency" },
    ],
  },
  {
    id: "payments-made", name: "Payments Made", category: "payables", apiCall: "paymentsMade",
    useDateRange: true,
    columns: [
      { key: "paymentNumber", label: "Payment #" },
      { key: "paymentDate", label: "Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "paymentMode", label: "Mode" },
      { key: "totalPaid", label: "Amount", align: "right", format: "currency" },
      { key: "usedForBills", label: "Applied", align: "right", format: "currency" },
      { key: "excess", label: "Excess", align: "right", format: "currency" },
    ],
  },
  {
    id: "purchase-order-details", name: "Purchase Order Details", category: "payables",
    apiCall: "purchaseOrderDetails", useDateRange: true,
    columns: [
      { key: "poNumber", label: "PO #" },
      { key: "poDate", label: "Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total", align: "right", format: "currency" },
    ],
  },
  {
    id: "payable-summary", name: "Payable Summary", category: "payables", apiCall: "payableSummary",
    useAgingBuckets: true,
    columns: [
      { key: "billNumber", label: "Bill #" },
      { key: "vendorName", label: "Vendor" },
      { key: "billDate", label: "Date", format: "date" },
      { key: "dueDate", label: "Due Date", format: "date" },
      { key: "balanceDue", label: "Balance Due", align: "right", format: "currency" },
    ],
  },
  // Purchases & Expenses
  {
    id: "expense-details", name: "Expense Details", category: "purchases-expenses",
    apiCall: "expenseDetails", useDateRange: true,
    columns: [
      { key: "expenseNumber", label: "Expense #" },
      { key: "date", label: "Date", format: "date" },
      { key: "vendorName", label: "Vendor" },
      { key: "accountName", label: "Account" },
      { key: "paidThrough", label: "Paid Through" },
      { key: "amount", label: "Amount", align: "right", format: "currency" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "expenses-by-category", name: "Expenses by Category", category: "purchases-expenses",
    apiCall: "expensesByCategory", useDateRange: true,
    columns: [
      { key: "categoryName", label: "Category" },
      { key: "count", label: "Count", align: "right", format: "number" },
      { key: "totalAmount", label: "Total Amount", align: "right", format: "currency" },
    ],
  },
  {
    id: "purchases-by-item", name: "Purchases by Item", category: "purchases-expenses",
    apiCall: "purchasesByItem", useDateRange: true,
    columns: [
      { key: "itemName", label: "Item Name" },
      { key: "totalQuantity", label: "Quantity", align: "right", format: "number" },
      { key: "totalAmount", label: "Total Amount", align: "right", format: "currency" },
      { key: "billCount", label: "Bills", align: "right", format: "number" },
    ],
  },
];

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "this-week", label: "This Week" },
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "this-financial-year", label: "This Financial Year" },
  { value: "last-month", label: "Last Month" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "last-year", label: "Last Year" },
  { value: "custom", label: "Custom" },
];

/* ─── Helpers ──────────────────────────────────────────────────────── */

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtNumber(n?: number) {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}

function formatCell(value: unknown, format?: string): string {
  if (value === undefined || value === null) return "-";
  if (format === "currency") return fmtCurrency(Number(value));
  if (format === "date") return fmtDate(String(value));
  if (format === "number") return fmtNumber(Number(value));
  return String(value);
}

/* ─── Main Component ───────────────────────────────────────────────── */

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [activeCategory, setActiveCategory] = useState("all");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState("this-month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [fetching, setFetching] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showDatePresets, setShowDatePresets] = useState(false);

  // Special state for financial statement reports
  const [trialBalance, setTrialBalance] = useState<TrialBalanceResponse | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossResponse | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResponse | null>(null);
  const [controlRec, setControlRec] = useState<ControlReconciliationResponse | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // Read report from URL
  useEffect(() => {
    const report = searchParams.get("report");
    if (report) {
      setActiveReportId(report);
      const def = REPORTS.find(r => r.id === report);
      if (def) setActiveCategory(def.category);
    }
  }, [searchParams]);

  const { from, to } = useMemo(() => {
    if (datePreset === "custom") {
      return {
        from: customFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        to: customTo || new Date().toISOString().slice(0, 10),
      };
    }
    return dateRangeFromPreset(datePreset);
  }, [datePreset, customFrom, customTo]);

  const activeReport = useMemo(() => REPORTS.find(r => r.id === activeReportId), [activeReportId]);

  const filteredReports = useMemo(() => {
    let list = REPORTS;
    if (activeCategory !== "all") list = list.filter(r => r.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, searchQuery]);

  const loadReport = useCallback(async () => {
    if (!activeReport || !firebaseUser) return;
    setFetching(true);
    try {
      const api = reportApi as any;
      const fn = api[activeReport.apiCall];
      if (!fn) {
        toast.error(`Report API not found: ${activeReport.apiCall}`);
        return;
      }

      let params: any = {};
      if (activeReport.useDateRange) params = { from, to };
      else if (activeReport.useAsOf) params = { asOf };

      const result = await fn(params);

      // Special handling for financial statement reports
      if (activeReport.id === "trial-balance") setTrialBalance(result.data);
      else if (activeReport.id === "profit-loss") setProfitLoss(result.data);
      else if (activeReport.id === "balance-sheet") setBalanceSheet(result.data);
      else if (activeReport.id === "control-reconciliation") setControlRec(result.data);
      else setReportData(result.data);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load report");
    } finally {
      setFetching(false);
    }
  }, [activeReport, firebaseUser, from, to, asOf]);

  useEffect(() => {
    if (activeReportId && firebaseUser && !loading) {
      void loadReport();
    }
  }, [activeReportId, firebaseUser, loading]);

  function openReport(reportId: string) {
    setActiveReportId(reportId);
    setReportData(null);
    setTrialBalance(null);
    setProfitLoss(null);
    setBalanceSheet(null);
    setControlRec(null);
    router.push(`/reports?report=${reportId}`, { scroll: false });
  }

  function goBack() {
    setActiveReportId(null);
    setReportData(null);
    router.push("/reports", { scroll: false });
  }

  async function exportCSV() {
    if (!reportData?.rows?.length && !trialBalance?.rows?.length) {
      toast.error("No data to export");
      return;
    }
    const rows = reportData?.rows || trialBalance?.rows || [];
    if (rows.length === 0) return;
    const cols = activeReport?.columns || [];
    const headers = cols.map(c => c.label).join(",");
    const csv = rows.map((row: any) => cols.map(c => String(row[c.key] ?? "")).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeReport?.name || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported as CSV");
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─── Report List View ─────────────────────────────────────────────
  if (!activeReportId) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader
            breadcrumb={<span className="text-sm font-medium text-foreground">Reports Center</span>}
          />

          <div className="flex h-[calc(100vh-61px)]">
            {/* Category Sidebar */}
            <div className="w-60 shrink-0 border-r bg-muted/20 overflow-y-auto">
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search reports..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>

              <nav className="px-2 pb-4 space-y-0.5">
                {REPORT_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const count = cat.id === "all"
                    ? REPORTS.length
                    : REPORTS.filter(r => r.category === cat.id).length;

                  if (count === 0 && cat.id !== "all") return null;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCategory(cat.id); setSearchQuery(""); }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        activeCategory === cat.id
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                      <span className={cn(
                        "ml-auto text-[10px] rounded-full px-1.5 py-0.5 shrink-0",
                        activeCategory === cat.id
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}>{count}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Report List */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  {REPORT_CATEGORIES.find(c => c.id === activeCategory)?.label || "All Reports"}
                  <span className="ml-2 text-xs text-muted-foreground font-normal bg-muted rounded-full px-2 py-0.5">
                    {filteredReports.length}
                  </span>
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b hover:bg-accent/50 cursor-pointer transition-colors"
                        onClick={() => openReport(report.id)}
                      >
                        <td className="px-4 py-3">
                          <span className="text-primary font-medium hover:underline">{report.name}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {REPORT_CATEGORIES.find(c => c.id === report.category)?.label || report.category}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">System Generated</td>
                      </tr>
                    ))}
                    {filteredReports.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-12 text-center text-muted-foreground text-sm">
                          No reports found matching your criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // ─── Individual Report View ──────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Report Header */}
        <div className="border-b bg-background px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground">
              {REPORT_CATEGORIES.find(c => c.id === activeReport?.category)?.label}
            </div>
            <h1 className="text-sm font-semibold truncate">
              {activeReport?.name}
              {activeReport?.useDateRange && (
                <span className="text-muted-foreground font-normal ml-2">
                  • From {fmtDate(from)} To {fmtDate(to)}
                </span>
              )}
              {activeReport?.useAsOf && (
                <span className="text-muted-foreground font-normal ml-2">
                  • As of {fmtDate(asOf)}
                </span>
              )}
            </h1>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={loadReport} disabled={fetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
          </Button>
        </div>

        {/* Filters Bar */}
        <div className="border-b bg-muted/20 px-4 py-2 flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-muted-foreground shrink-0">Filters :</span>

          {(activeReport?.useDateRange || activeReport?.useAgingBuckets) && (
            <div className="relative">
              <button
                className="flex items-center gap-1 bg-background border rounded-md px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                onClick={() => setShowDatePresets(!showDatePresets)}
              >
                <Calendar className="h-3 w-3" />
                Date Range: {DATE_PRESETS.find(p => p.value === datePreset)?.label || "Custom"}
                <ChevronDown className="h-3 w-3" />
              </button>
              {showDatePresets && (
                <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg py-1 z-20 w-48">
                  {DATE_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      className={cn(
                        "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                        datePreset === preset.value && "bg-primary/10 text-primary font-medium",
                      )}
                      onClick={() => {
                        setDatePreset(preset.value);
                        setShowDatePresets(false);
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {datePreset === "custom" && activeReport?.useDateRange && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-36 text-xs" />
            </>
          )}

          {activeReport?.useAsOf && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">As of:</span>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-7 w-36 text-xs" />
            </div>
          )}

          <Button size="sm" className="h-7 px-3 text-xs gap-1" onClick={loadReport} disabled={fetching}>
            {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Run Report
          </Button>
        </div>

        {/* Overlay to close date picker */}
        {showDatePresets && (
          <div className="fixed inset-0 z-10" onClick={() => setShowDatePresets(false)} />
        )}

        {/* Report Content */}
        <div className="p-4 overflow-auto flex-1">
          {fetching && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!fetching && activeReport?.id === "profit-loss" && profitLoss && (
            <ProfitLossView data={profitLoss} />
          )}
          {!fetching && activeReport?.id === "balance-sheet" && balanceSheet && (
            <BalanceSheetView data={balanceSheet} />
          )}
          {!fetching && activeReport?.id === "control-reconciliation" && controlRec && (
            <ControlReconciliationView data={controlRec} />
          )}
          {!fetching && activeReport?.useAgingBuckets && reportData?.buckets && activeReport && (
            <AgingBucketsView data={reportData} columns={activeReport.columns} title={activeReport.name} />
          )}
          {!fetching && activeReport && !activeReport.useAgingBuckets && activeReport.columns?.length > 0 && reportData?.rows && (
            <GenericTableView
              data={reportData}
              columns={activeReport.columns}
              title={activeReport.name}
              from={from}
              to={to}
            />
          )}
          {!fetching && activeReport?.id === "trial-balance" && trialBalance && (
            <TrialBalanceView data={trialBalance} />
          )}

          {!fetching && !reportData && !trialBalance && !profitLoss && !balanceSheet && !controlRec && (
            <div className="text-center py-20 text-muted-foreground text-sm">
              Click <span className="font-medium text-primary">"Run Report"</span> to generate this report
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function GenericTableView({ data, columns, title, from, to }: {
  data: GenericReportResponse;
  columns: ReportDef["columns"];
  title: string;
  from: string;
  to: string;
}) {
  const rows = data.rows || [];
  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      {data.totals && Object.keys(data.totals).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.totals).map(([key, value]) => (
            <div key={key} className="rounded-lg border bg-white p-3 min-w-[160px] shadow-sm">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
              </div>
              <div className="text-lg font-bold mt-0.5">{fmtCurrency(value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {from && to && (
          <p className="text-xs text-muted-foreground">From {fmtDate(from)} To {fmtDate(to)}</p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                {columns.map(col => (
                  <th key={col.key} className={cn("px-3 py-2.5 text-xs font-semibold uppercase tracking-wider", col.align === "right" ? "text-right" : "text-left")}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className={cn("px-3 py-2", col.align === "right" ? "text-right font-mono" : "text-left")}>
                      {col.key === "status" ? (
                        <StatusBadge status={String(row[col.key] || "")} />
                      ) : (
                        formatCell(row[col.key], col.format)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                    No data found for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count */}
      {data.count !== undefined && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {rows.length} of {data.count} records
        </p>
      )}
    </div>
  );
}

function AgingBucketsView({ data, columns, title }: {
  data: GenericReportResponse;
  columns: ReportDef["columns"];
  title: string;
}) {
  const buckets = data.buckets || {};
  const bucketLabels: Record<string, string> = {
    current: "Current",
    "1-15": "1-15 Days",
    "16-30": "16-30 Days",
    "31-45": "31-45 Days",
    "above-45": "Above 45 Days",
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(buckets).map(([key, bucket]: [string, any]) => (
          <div key={key} className={cn(
            "rounded-lg border p-3 min-w-[140px] shadow-sm",
            key === "current" ? "bg-emerald-50 border-emerald-200" :
            key === "above-45" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200",
          )}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {bucketLabels[key] || key}
            </div>
            <div className="text-lg font-bold mt-0.5">{fmtCurrency(bucket.total)}</div>
            <div className="text-[10px] text-muted-foreground">{bucket.rows?.length || 0} records</div>
          </div>
        ))}
        {data.grandTotal !== undefined && (
          <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 min-w-[140px] shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Grand Total</div>
            <div className="text-lg font-bold mt-0.5 text-primary">{fmtCurrency(data.grandTotal)}</div>
          </div>
        )}
      </div>

      <h2 className="text-base font-semibold text-center">{title}</h2>

      {/* Bucket Tables */}
      {Object.entries(buckets).map(([key, bucket]: [string, any]) => {
        const rows = bucket.rows || [];
        if (rows.length === 0) return null;
        return (
          <div key={key} className="rounded-lg border overflow-hidden bg-white shadow-sm">
            <div className="px-3 py-2 bg-muted/30 border-b flex items-center justify-between">
              <span className="text-xs font-semibold">{bucketLabels[key] || key}</span>
              <span className="text-xs text-muted-foreground">{fmtCurrency(bucket.total)}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/20">
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className={cn("px-3 py-2 text-xs font-semibold", col.align === "right" ? "text-right" : "text-left")}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, i: number) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    {columns.map(col => (
                      <td key={col.key} className={cn("px-3 py-1.5 text-xs", col.align === "right" ? "text-right font-mono" : "text-left")}>
                        {formatCell(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function TrialBalanceView({ data }: { data: TrialBalanceResponse }) {
  const imbalance = Math.abs(data.totals.difference) > 0.009;
  return (
    <div className="space-y-3">
      <div className={cn("rounded-lg border p-3 text-sm", imbalance ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200")}>
        {imbalance ? "⚠ Trial balance is not balanced. Check missing/reversed entries." : "✓ Trial balance is balanced."}
      </div>
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">Trial Balance</h2>
        <p className="text-xs text-muted-foreground">As of {fmtDate(data.asOf)}</p>
      </div>
      <div className="rounded-lg border overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="text-left px-3 py-2.5 text-xs font-semibold">Code</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold">Account</th>
              <th className="text-left px-3 py-2.5 text-xs font-semibold">Type</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold">Debit</th>
              <th className="text-right px-3 py-2.5 text-xs font-semibold">Credit</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row.accountId} className="border-t hover:bg-muted/20">
                <td className="px-3 py-2 text-xs">{row.code || "-"}</td>
                <td className="px-3 py-2 text-xs font-medium">{row.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.rootType}</td>
                <td className="px-3 py-2 text-xs text-right font-mono">{fmtCurrency(row.closingDebit)}</td>
                <td className="px-3 py-2 text-xs text-right font-mono">{fmtCurrency(row.closingCredit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/20 border-t">
            <tr className="font-semibold">
              <td className="px-3 py-2 text-xs" colSpan={3}>Totals</td>
              <td className="px-3 py-2 text-xs text-right font-mono">{fmtCurrency(data.totals.totalDebit)}</td>
              <td className="px-3 py-2 text-xs text-right font-mono">{fmtCurrency(data.totals.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ProfitLossView({ data }: { data: ProfitLossResponse }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Income" value={data.totals.totalIncome} color="emerald" />
        <SummaryCard label="Total Expense" value={data.totals.totalExpense} color="red" />
        <SummaryCard label="Net Profit" value={data.totals.netProfit} color={data.totals.netProfit >= 0 ? "emerald" : "red"} />
      </div>
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">Profit & Loss</h2>
        <p className="text-xs text-muted-foreground">From {fmtDate(data.from)} To {fmtDate(data.to)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AccountTable title="Income" rows={data.income} color="emerald" />
        <AccountTable title="Expenses" rows={data.expenses} color="red" />
      </div>
    </div>
  );
}

function BalanceSheetView({ data }: { data: BalanceSheetResponse }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Assets" value={data.totals.totalAssets} color="blue" />
        <SummaryCard label="Total Liabilities" value={data.totals.totalLiabilities} color="amber" />
        <SummaryCard label="Total Equity" value={data.totals.totalEquity} color="purple" />
      </div>
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">Balance Sheet</h2>
        <p className="text-xs text-muted-foreground">As of {fmtDate(data.asOf)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AccountTable title="Assets" rows={data.assets} color="blue" />
        <AccountTable title="Liabilities" rows={data.liabilities} color="amber" />
        <AccountTable title="Equity" rows={data.equity} color="purple" />
      </div>
    </div>
  );
}

function ControlReconciliationView({ data }: { data: ControlReconciliationResponse }) {
  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">Control Reconciliation</h2>
        <p className="text-xs text-muted-foreground">As of {fmtDate(data.asOf)}</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReconciliationCard title="Receivables Control" data={data.receivables} />
        <ReconciliationCard title="Payables Control" data={data.payables} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50",
    red: "border-red-200 bg-red-50",
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    purple: "border-purple-200 bg-purple-50",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-700",
    red: "text-red-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    purple: "text-purple-700",
  };
  return (
    <div className={cn("rounded-lg border p-3 shadow-sm", colorMap[color] || "")}>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-bold mt-0.5", textMap[color] || "")}>{fmtCurrency(value)}</div>
    </div>
  );
}

function AccountTable({ title, rows, color }: { title: string; rows: { accountId: string; name: string; amount: number }[]; color: string }) {
  const headerBg: Record<string, string> = {
    emerald: "bg-emerald-100/50",
    red: "bg-red-100/50",
    blue: "bg-blue-100/50",
    amber: "bg-amber-100/50",
    purple: "bg-purple-100/50",
  };
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="rounded-lg border overflow-hidden bg-white shadow-sm">
      <div className={cn("px-3 py-2 border-b font-semibold text-xs flex justify-between", headerBg[color] || "bg-muted/30")}>
        <span>{title}</span>
        <span className="font-mono">{fmtCurrency(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(row => (
            <tr key={row.accountId} className="border-t hover:bg-muted/20">
              <td className="px-3 py-1.5 text-xs">{row.name}</td>
              <td className="px-3 py-1.5 text-xs text-right font-mono">{fmtCurrency(row.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={2} className="px-3 py-4 text-center text-xs text-muted-foreground">No data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReconciliationCard({ title, data }: { title: string; data: { glBalance: number; subledgerBalance: number; difference: number } }) {
  const hasDiff = Math.abs(data.difference) > 0.009;
  return (
    <div className={cn("rounded-lg border p-4 space-y-2 shadow-sm", hasDiff ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200")}>
      <div className="font-semibold text-sm">{title}</div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">GL Balance</span>
        <span className="font-mono font-medium">{fmtCurrency(data.glBalance)}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Subledger Balance</span>
        <span className="font-mono font-medium">{fmtCurrency(data.subledgerBalance)}</span>
      </div>
      <div className="flex justify-between text-xs font-semibold border-t pt-2">
        <span>Difference</span>
        <span className={cn("font-mono", hasDiff ? "text-amber-700" : "text-emerald-700")}>{fmtCurrency(data.difference)}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Open: "bg-blue-100 text-blue-700",
    Paid: "bg-emerald-100 text-emerald-700",
    "Partially Paid": "bg-amber-100 text-amber-700",
    Overdue: "bg-red-100 text-red-700",
    Draft: "bg-gray-100 text-gray-600",
    Void: "bg-gray-100 text-gray-500",
    OPEN: "bg-blue-100 text-blue-700",
    PAID: "bg-emerald-100 text-emerald-700",
    PARTIALLY_APPLIED: "bg-amber-100 text-amber-700",
    CLOSED: "bg-emerald-100 text-emerald-700",
    DRAFT: "bg-gray-100 text-gray-600",
    VOID: "bg-gray-100 text-gray-500",
    Sent: "bg-blue-100 text-blue-700",
    Issued: "bg-blue-100 text-blue-700",
    Billed: "bg-emerald-100 text-emerald-700",
    Accepted: "bg-emerald-100 text-emerald-700",
    Declined: "bg-red-100 text-red-700",
    Cancelled: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium", colors[status] || "bg-gray-100 text-gray-600")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
