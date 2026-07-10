"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PlusCircle,
  Clock3,
  Printer,
  FileSpreadsheet,
  FileDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { contactApi } from "@/lib/api/contacts";
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
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { fmtCurrency, fmtDate, formatTotalMetricValue, formatCell, fmtNumber } from "./_lib/formatters";
import {
  GenericTableView,
  AgingBucketsView,
  TrialBalanceView,
  ProfitLossView,
  BalanceSheetView,
  ControlReconciliationView,
} from "./_components/report-views";
import {
  type ReportDef,
  REPORTS,
  REPORT_CATEGORIES,
  DATE_PRESETS,
} from "./_lib/report-definitions";

/* ─── Report Definitions extracted to _lib/report-definitions.ts ─── */

/* ─── Sub-components and constants extracted ─── */

/* ─── Helpers ──────────────────────────────────────────────────────── */

/* ─── Helpers extracted to _lib/formatters.ts ─── */

type ReportBasis = "Accrual" | "Cash";
type HistoryAction = "run" | "export" | "print";
type ExportFormat = "csv" | "xls" | "xlsx" | "pdf" | "zoho-sheet";

interface ReportHistoryEntry {
  id: string;
  reportId: string;
  reportName: string;
  action: HistoryAction;
  format?: string;
  createdAt: string;
  rows: number;
  filtersText: string;
  datePreset: string;
  customFrom: string;
  customTo: string;
  asOf: string;
  basis: ReportBasis;
  status: string;
  vendorId: string;
  customerId: string;
}

interface ExportPayload {
  title: string;
  subtitle: string;
  columns: ReportDef["columns"];
  rows: Record<string, unknown>[];
}

const REPORT_HISTORY_KEY = "hai_reports_history_v1";
const MAX_REPORT_HISTORY = 120;

/* ─── Main Component ───────────────────────────────────────────────── */

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <ReportsPageContent />
    </Suspense>
  );
}

function ReportsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [activeCategory, setActiveCategory] = useState("all");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [reportBasis, setReportBasis] = useState<ReportBasis>("Accrual");
  const [statusFilter, setStatusFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [customerFilter, setCustomerFilter] = useState("All");
  const [vendorOptions, setVendorOptions] = useState<Array<{ _id: string; displayName?: string; companyName?: string }>>([]);
  const [customerOptions, setCustomerOptions] = useState<Array<{ _id: string; displayName?: string; companyName?: string }>>([]);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>([]);
  const [partyLoading, setPartyLoading] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("portrait");
  const [fetching, setFetching] = useState(false);
  const [reportData, setReportData] = useState<GenericReportResponse | null>(null);

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

  useEffect(() => {
    const report = searchParams.get("report");
    if (report) {
      setActiveReportId(report);
      const def = REPORTS.find((r) => r.id === report);
      if (def) setActiveCategory(def.category);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(REPORT_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReportHistoryEntry[];
      if (Array.isArray(parsed)) setReportHistory(parsed);
    } catch {
      // ignore parse errors
    }
  }, []);

  const { from, to } = useMemo(() => {
    if (datePreset === "custom") {
      return {
        from: customFrom || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        to: customTo || new Date().toISOString().slice(0, 10),
      };
    }
    return dateRangeFromPreset(datePreset);
  }, [datePreset, customFrom, customTo]);

  const activeReport = useMemo(() => REPORTS.find((r) => r.id === activeReportId), [activeReportId]);

  const selectedVendorName = useMemo(() => {
    const vendor = vendorOptions.find((row) => row._id === vendorFilter);
    if (!vendor) return "";
    return vendor.displayName || vendor.companyName || "Vendor";
  }, [vendorOptions, vendorFilter]);

  const selectedCustomerName = useMemo(() => {
    const customer = customerOptions.find((row) => row._id === customerFilter);
    if (!customer) return "";
    return customer.displayName || customer.companyName || "Customer";
  }, [customerOptions, customerFilter]);

  const moreFiltersCount = useMemo(() => {
    let count = 0;
    if (activeReport?.statusOptions && statusFilter !== "All") count += 1;
    if (activeReport?.partyFilter === "vendor" && vendorFilter !== "All") count += 1;
    if (activeReport?.partyFilter === "customer" && customerFilter !== "All") count += 1;
    return count;
  }, [activeReport, statusFilter, vendorFilter, customerFilter]);

  useEffect(() => {
    if (!activeReport?.useAsOf || datePreset === "custom") return;
    const range = dateRangeFromPreset(datePreset);
    setAsOf(range.to);
  }, [activeReport?.useAsOf, datePreset]);

  useEffect(() => {
    if (!activeReport) return;
    if (!activeReport.statusOptions) setStatusFilter("All");
    if (activeReport.partyFilter !== "vendor") setVendorFilter("All");
    if (activeReport.partyFilter !== "customer") setCustomerFilter("All");
  }, [activeReport]);

  useEffect(() => {
    const partyFilter = activeReport?.partyFilter;
    if (!firebaseUser || !partyFilter) return;

    let isCancelled = false;

    async function loadPartyOptions() {
      setPartyLoading(true);
      try {
        if (partyFilter === "vendor") {
          const res = await contactApi.list({ type: "Vendor", limit: 300 });
          if (!isCancelled) {
            const data = [...(res.data || [])].sort((a, b) =>
              String(a.displayName || a.companyName || "").localeCompare(
                String(b.displayName || b.companyName || ""),
              ),
            );
            setVendorOptions(data);
          }
        } else {
          const res = await contactApi.list({ type: "Customer", limit: 300 });
          if (!isCancelled) {
            const data = [...(res.data || [])].sort((a, b) =>
              String(a.displayName || a.companyName || "").localeCompare(
                String(b.displayName || b.companyName || ""),
              ),
            );
            setCustomerOptions(data);
          }
        }
      } catch {
        if (!isCancelled) toast.error("Unable to load filter options");
      } finally {
        if (!isCancelled) setPartyLoading(false);
      }
    }

    void loadPartyOptions();

    return () => {
      isCancelled = true;
    };
  }, [firebaseUser, activeReport?.partyFilter]);

  const filteredReports = useMemo(() => {
    let list = REPORTS;
    if (activeCategory !== "all") list = list.filter((r) => r.category === activeCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    return list;
  }, [activeCategory, searchQuery]);

  const appendHistory = useCallback((action: HistoryAction, rows: number, format?: string) => {
    if (!activeReport) return;

    const presetLabel = DATE_PRESETS.find((row) => row.value === datePreset)?.label || datePreset;
    const parts: string[] = [];

    if (activeReport.useDateRange) {
      parts.push(`Date Range: ${presetLabel}`);
      if (datePreset === "custom") {
        const fromLabel = customFrom || from;
        const toLabel = customTo || to;
        parts.push(`${fmtDate(fromLabel)} to ${fmtDate(toLabel)}`);
      }
    }
    if (activeReport.useAsOf || activeReport.useAgingBuckets) parts.push(`As of ${fmtDate(asOf)}`);
    parts.push(`Basis: ${reportBasis}`);
    if (activeReport.statusOptions && statusFilter !== "All") parts.push(`Status: ${statusFilter}`);
    if (activeReport.partyFilter === "vendor" && vendorFilter !== "All") {
      parts.push(`Vendor: ${selectedVendorName || vendorFilter}`);
    }
    if (activeReport.partyFilter === "customer" && customerFilter !== "All") {
      parts.push(`Customer: ${selectedCustomerName || customerFilter}`);
    }

    const entry: ReportHistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reportId: activeReport.id,
      reportName: activeReport.name,
      action,
      format,
      createdAt: new Date().toISOString(),
      rows,
      filtersText: parts.join(" | "),
      datePreset,
      customFrom,
      customTo,
      asOf,
      basis: reportBasis,
      status: statusFilter,
      vendorId: vendorFilter,
      customerId: customerFilter,
    };

    setReportHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_REPORT_HISTORY);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [
    activeReport,
    datePreset,
    customFrom,
    customTo,
    from,
    to,
    asOf,
    reportBasis,
    statusFilter,
    vendorFilter,
    customerFilter,
    selectedVendorName,
    selectedCustomerName,
  ]);

  const countRowsFromResult = useCallback((reportId: string, payload: unknown): number => {
    if (!payload || typeof payload !== "object") return 0;

    const typedPayload = payload as {
      rows?: unknown[];
      income?: unknown[];
      expenses?: unknown[];
      assets?: unknown[];
      liabilities?: unknown[];
      equity?: unknown[];
      buckets?: Record<string, { rows?: unknown[] }>;
    };

    if (reportId === "trial-balance") return Array.isArray(typedPayload.rows) ? typedPayload.rows.length : 0;
    if (reportId === "profit-loss") return (typedPayload.income?.length || 0) + (typedPayload.expenses?.length || 0);
    if (reportId === "balance-sheet") {
      return (typedPayload.assets?.length || 0) + (typedPayload.liabilities?.length || 0) + (typedPayload.equity?.length || 0);
    }
    if (reportId === "control-reconciliation") return 2;

    if (typedPayload.buckets && typeof typedPayload.buckets === "object") {
      const buckets = Object.values(typedPayload.buckets);
      return buckets.reduce((sum, bucket) => sum + (bucket.rows?.length || 0), 0);
    }

    return Array.isArray(typedPayload.rows) ? typedPayload.rows.length : 0;
  }, []);

  const loadReport = useCallback(async (options?: { source?: "auto" | "manual" }): Promise<boolean> => {
    if (!activeReport || !firebaseUser) return false;

    setFetching(true);
    try {
      const api = reportApi as unknown as Record<string, (params?: Record<string, unknown>) => Promise<{ data: unknown }>>;
      const fn = api[activeReport.apiCall];
      if (!fn) {
        toast.error(`Report API not found: ${activeReport.apiCall}`);
        return false;
      }

      const params: Record<string, unknown> = {};
      if (activeReport.useDateRange) {
        params.from = from;
        params.to = to;
      }
      if (activeReport.useAsOf || activeReport.useAgingBuckets) {
        params.asOf = asOf;
      }
      if (activeReport.statusOptions && statusFilter !== "All") {
        params.status = statusFilter;
      }
      if (activeReport.partyFilter === "vendor" && vendorFilter !== "All") {
        params.vendorId = vendorFilter;
      }
      if (activeReport.partyFilter === "customer" && customerFilter !== "All") {
        params.customerId = customerFilter;
      }
      params.basis = reportBasis.toLowerCase();

      if (reportBasis === "Cash") {
        toast.info("Cash basis is not configured yet. Showing accrual values.");
      }

      const result = await fn(params);

      setReportData(null);
      setTrialBalance(null);
      setProfitLoss(null);
      setBalanceSheet(null);
      setControlRec(null);

      if (activeReport.id === "trial-balance") setTrialBalance(result.data as TrialBalanceResponse);
      else if (activeReport.id === "profit-loss") setProfitLoss(result.data as ProfitLossResponse);
      else if (activeReport.id === "balance-sheet") setBalanceSheet(result.data as BalanceSheetResponse);
      else if (activeReport.id === "control-reconciliation") setControlRec(result.data as ControlReconciliationResponse);
      else setReportData(result.data as GenericReportResponse);

      if (options?.source === "manual") {
        appendHistory("run", countRowsFromResult(activeReport.id, result.data));
      }

      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load report";
      toast.error(message);
      return false;
    } finally {
      setFetching(false);
    }
  }, [
    activeReport,
    firebaseUser,
    from,
    to,
    asOf,
    statusFilter,
    vendorFilter,
    customerFilter,
    reportBasis,
    appendHistory,
    countRowsFromResult,
  ]);

  useEffect(() => {
    if (activeReportId && firebaseUser && !loading) {
      const timer = setTimeout(() => {
        void loadReport({ source: "auto" });
      }, 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeReportId,
    firebaseUser,
    loading,
    datePreset,
    customFrom,
    customTo,
    asOf,
    statusFilter,
    vendorFilter,
    customerFilter,
    reportBasis
  ]);

  const exportPayload = useMemo<ExportPayload | null>(() => {
    if (!activeReport) return null;

    if (activeReport.id === "trial-balance" && trialBalance) {
      return {
        title: activeReport.name,
        subtitle: `As of ${fmtDate(trialBalance.asOf)}`,
        columns: activeReport.columns,
        rows: trialBalance.rows as unknown as Record<string, unknown>[],
      };
    }

    if (activeReport.id === "profit-loss" && profitLoss) {
      const columns: ReportDef["columns"] = [
        { key: "section", label: "Section" },
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "amount", label: "Amount (INR)", align: "right", format: "currency" },
      ];
      const rows = [
        ...profitLoss.income.map((row) => ({ section: "Income", code: row.code, name: row.name, amount: row.amount })),
        ...profitLoss.expenses.map((row) => ({ section: "Expense", code: row.code, name: row.name, amount: row.amount })),
      ];
      return {
        title: activeReport.name,
        subtitle: `From ${fmtDate(profitLoss.from)} To ${fmtDate(profitLoss.to)}`,
        columns,
        rows,
      };
    }

    if (activeReport.id === "balance-sheet" && balanceSheet) {
      const columns: ReportDef["columns"] = [
        { key: "section", label: "Section" },
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "amount", label: "Amount (INR)", align: "right", format: "currency" },
      ];
      const rows = [
        ...balanceSheet.assets.map((row) => ({ section: "Asset", code: row.code, name: row.name, amount: row.amount })),
        ...balanceSheet.liabilities.map((row) => ({ section: "Liability", code: row.code, name: row.name, amount: row.amount })),
        ...balanceSheet.equity.map((row) => ({ section: "Equity", code: row.code, name: row.name, amount: row.amount })),
      ];
      return {
        title: activeReport.name,
        subtitle: `As of ${fmtDate(balanceSheet.asOf)}`,
        columns,
        rows,
      };
    }

    if (activeReport.id === "control-reconciliation" && controlRec) {
      const columns: ReportDef["columns"] = [
        { key: "module", label: "Module" },
        { key: "glBalance", label: "GL Balance (INR)", align: "right", format: "currency" },
        { key: "subledgerBalance", label: "Subledger Balance (INR)", align: "right", format: "currency" },
        { key: "difference", label: "Difference (INR)", align: "right", format: "currency" },
      ];
      const rows = [
        {
          module: "Receivables Control",
          glBalance: controlRec.receivables.glBalance,
          subledgerBalance: controlRec.receivables.subledgerBalance,
          difference: controlRec.receivables.difference,
        },
        {
          module: "Payables Control",
          glBalance: controlRec.payables.glBalance,
          subledgerBalance: controlRec.payables.subledgerBalance,
          difference: controlRec.payables.difference,
        },
      ];
      return {
        title: activeReport.name,
        subtitle: `As of ${fmtDate(controlRec.asOf)}`,
        columns,
        rows,
      };
    }

    if (activeReport.useAgingBuckets && reportData?.buckets) {
      const bucketLabels: Record<string, string> = {
        current: "Current",
        "1-15": "1-15 Days",
        "16-30": "16-30 Days",
        "31-45": "31-45 Days",
        "above-45": "Above 45 Days",
      };

      const columns: ReportDef["columns"] = [{ key: "bucket", label: "Bucket" }, ...activeReport.columns];
      const rows = Object.entries(reportData.buckets as Record<string, { rows?: Record<string, unknown>[] }>).flatMap(([bucketKey, bucket]) =>
        (bucket.rows || []).map((row) => ({ bucket: bucketLabels[bucketKey] || bucketKey, ...row })),
      );

      return {
        title: activeReport.name,
        subtitle: `As of ${fmtDate(asOf)}`,
        columns,
        rows,
      };
    }

    if (reportData?.rows && activeReport.columns.length > 0) {
      const subtitle = activeReport.useDateRange
        ? `From ${fmtDate(from)} To ${fmtDate(to)}`
        : activeReport.useAsOf || activeReport.useAgingBuckets
          ? `As of ${fmtDate(asOf)}`
          : "";

      return {
        title: activeReport.name,
        subtitle,
        columns: activeReport.columns,
        rows: reportData.rows,
      };
    }

    return null;
  }, [activeReport, trialBalance, profitLoss, balanceSheet, controlRec, reportData, from, to, asOf]);

  const fileNameStem = useMemo(() => {
    const base = activeReport?.name || "report";
    const normalized = base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || "report";
  }, [activeReport]);

  const formatDisplayValue = useCallback((value: unknown, format?: string): string => {
    if (value === undefined || value === null) return "";
    if (format === "currency") return fmtCurrency(Number(value));
    if (format === "date") return fmtDate(String(value));
    if (format === "number") return fmtNumber(Number(value));
    return String(value);
  }, []);

  const formatSheetValue = useCallback((value: unknown, format?: string): string | number => {
    if (value === undefined || value === null) return "";
    if (format === "currency" || format === "number") {
      const num = Number(value);
      return Number.isFinite(num) ? num : "";
    }
    if (format === "date") {
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
    }
    return String(value);
  }, []);

  const csvEscape = useCallback((value: unknown): string => {
    const text = String(value ?? "");
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }, []);

  const htmlEscape = useCallback((value: unknown): string => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }, []);

  const handleExport = useCallback(async (format: ExportFormat) => {
    if (!activeReport) return;
    if (!exportPayload || exportPayload.rows.length === 0) {
      toast.error("No data to export. Run report first.");
      return;
    }

    if (format === "csv") {
      const headers = exportPayload.columns.map((col) => csvEscape(col.label)).join(",");
      const lines = exportPayload.rows.map((row) =>
        exportPayload.columns
          .map((col) => csvEscape(formatDisplayValue(row[col.key], col.format)))
          .join(","),
      );
      const content = `${headers}\n${lines.join("\n")}`;
      const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileNameStem}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      appendHistory("export", exportPayload.rows.length, "CSV");
      toast.success("Report exported as CSV");
      return;
    }

    if (format === "xls" || format === "xlsx") {
      const sheetRows = exportPayload.rows.map((row) => {
        const out: Record<string, string | number> = {};
        for (const col of exportPayload.columns) {
          out[col.label] = formatSheetValue(row[col.key], col.format);
        }
        return out;
      });

      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
      XLSX.writeFile(workbook, `${fileNameStem}.${format}`, {
        bookType: format === "xls" ? "biff8" : "xlsx",
      });
      appendHistory("export", exportPayload.rows.length, format.toUpperCase());
      toast.success(`Report exported as ${format.toUpperCase()}`);
      return;
    }

    if (format === "pdf") {
      const doc = new jsPDF({
        orientation: printOrientation,
        unit: "pt",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 28;
      const rowHeight = 18;
      const tableWidth = pageWidth - margin * 2;
      const colWidth = tableWidth / Math.max(exportPayload.columns.length, 1);

      let cursorY = margin;

      doc.setFontSize(13);
      doc.text(exportPayload.title, margin, cursorY);
      cursorY += 14;
      if (exportPayload.subtitle) {
        doc.setFontSize(9);
        doc.text(exportPayload.subtitle, margin, cursorY);
        cursorY += 16;
      }

      const drawRow = (cells: string[], isHeader: boolean) => {
        if (cursorY + rowHeight > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }

        let x = margin;
        doc.setFont("helvetica", isHeader ? "bold" : "normal");
        doc.setFontSize(isHeader ? 8 : 7);

        for (const cell of cells) {
          doc.rect(x, cursorY, colWidth, rowHeight);
          const text = cell.length > 30 ? `${cell.slice(0, 27)}...` : cell;
          doc.text(text, x + 3, cursorY + 12, { maxWidth: colWidth - 6 });
          x += colWidth;
        }
        cursorY += rowHeight;
      };

      drawRow(exportPayload.columns.map((col) => col.label), true);
      for (const row of exportPayload.rows) {
        drawRow(
          exportPayload.columns.map((col) => formatDisplayValue(row[col.key], col.format)),
          false,
        );
      }

      doc.save(`${fileNameStem}.pdf`);
      appendHistory("export", exportPayload.rows.length, "PDF");
      toast.success("Report exported as PDF");
      return;
    }

    if (format === "zoho-sheet") {
      const headers = exportPayload.columns.map((col) => col.label).join("\t");
      const lines = exportPayload.rows.map((row) =>
        exportPayload.columns.map((col) => formatDisplayValue(row[col.key], col.format)).join("\t"),
      );
      const tsv = `${headers}\n${lines.join("\n")}`;

      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(tsv);
          copied = true;
        }
      } catch {
        copied = false;
      }

      window.open("https://sheet.zoho.com/sheet/create", "_blank", "noopener,noreferrer");
      appendHistory("export", exportPayload.rows.length, "Zoho Sheet");
      if (copied) toast.success("Opened Zoho Sheet and copied data to clipboard");
      else toast.success("Opened Zoho Sheet");
    }
  }, [
    activeReport,
    exportPayload,
    fileNameStem,
    csvEscape,
    formatDisplayValue,
    formatSheetValue,
    appendHistory,
    printOrientation,
  ]);

  const handlePrint = useCallback(() => {
    if (!activeReport) return;
    if (!exportPayload || exportPayload.rows.length === 0) {
      toast.error("No data to print. Run report first.");
      return;
    }

    const headers = exportPayload.columns
      .map((col) => `<th style=\"text-align:${col.align === "right" ? "right" : "left"};\">${htmlEscape(col.label)}</th>`)
      .join("");

    const bodyRows = exportPayload.rows
      .map((row) => {
        const cells = exportPayload.columns
          .map((col) => `<td style=\"text-align:${col.align === "right" ? "right" : "left"};\">${htmlEscape(formatDisplayValue(row[col.key], col.format))}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
    if (!printWindow) {
      toast.error("Unable to open print window");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>${htmlEscape(activeReport.name)}</title>
          <style>
            @page { size: A4 ${printOrientation}; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #222; margin: 0; }
            h1 { font-size: 18px; margin: 0 0 6px; }
            p { margin: 0 0 12px; color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d6d6d6; padding: 6px; }
            th { background: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${htmlEscape(exportPayload.title)}</h1>
          <p>${htmlEscape(exportPayload.subtitle)}</p>
          <table>
            <thead><tr>${headers}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    appendHistory("print", exportPayload.rows.length, "Print");
    toast.success("Print dialog opened");
  }, [activeReport, exportPayload, htmlEscape, formatDisplayValue, appendHistory, printOrientation]);

  function clearHistory() {
    setReportHistory([]);
    if (typeof window !== "undefined") window.localStorage.removeItem(REPORT_HISTORY_KEY);
  }

  function openReport(reportId: string) {
    setActiveReportId(reportId);
    setReportData(null);
    setTrialBalance(null);
    setProfitLoss(null);
    setBalanceSheet(null);
    setControlRec(null);
    setStatusFilter("All");
    setVendorFilter("All");
    setCustomerFilter("All");
    setMoreFiltersOpen(false);
    router.push(`/reports?report=${reportId}`, { scroll: false });
  }

  function goBack() {
    setActiveReportId(null);
    setReportData(null);
    router.push("/reports", { scroll: false });
  }

  function applyHistoryEntry(entry: ReportHistoryEntry) {
    setDatePreset(entry.datePreset || "today");
    setCustomFrom(entry.customFrom || "");
    setCustomTo(entry.customTo || "");
    setAsOf(entry.asOf || new Date().toISOString().slice(0, 10));
    setReportBasis(entry.basis || "Accrual");
    setStatusFilter(entry.status || "All");
    setVendorFilter(entry.vendorId || "All");
    setCustomerFilter(entry.customerId || "All");
    setHistoryOpen(false);

    if (entry.reportId !== activeReportId) {
      openReport(entry.reportId);
      return;
    }

    void loadReport({ source: "manual" });
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeReportId) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-white">
          <PageHeader
            breadcrumb={
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Reports</span>
                <span className="text-sm font-semibold text-slate-700 mt-0.5">Reports Center</span>
              </span>
            }
          />

          <div className="flex h-[calc(100vh-61px)]">
            <div className="w-60 shrink-0 border-r border-slate-200 bg-slate-50/50 overflow-y-auto">
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search reports..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs border-slate-200"
                  />
                </div>
              </div>

              <nav className="px-2 pb-4 space-y-0.5">
                {REPORT_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const count = cat.id === "all"
                    ? REPORTS.length
                    : REPORTS.filter((r) => r.category === cat.id).length;

                  if (count === 0 && cat.id !== "all") return null;

                  const isActive = activeCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCategory(cat.id); setSearchQuery(""); }}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors my-[2px]",
                        isActive
                          ? "bg-teal-50 text-teal-700 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                      <span className={cn(
                        "ml-auto text-[10px] rounded-full px-1.5 py-0.5 shrink-0",
                        isActive
                          ? "bg-teal-100 text-teal-700 font-semibold"
                          : "bg-slate-100 text-slate-500",
                      )}>{count}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  {REPORT_CATEGORIES.find((c) => c.id === activeCategory)?.label || "All Reports"}
                  <span className="ml-2 text-xs text-slate-500 font-normal bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                    {filteredReports.length}
                  </span>
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-left">Report Name</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-left">Category</th>
                      <th className="px-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReports.map((report) => (
                      <tr
                        key={report.id}
                        className="border-b border-slate-100 hover:bg-teal-50/20 cursor-pointer transition-colors"
                        onClick={() => openReport(report.id)}
                      >
                        <td className="px-6 py-3">
                          <span className="text-teal-700 font-semibold hover:underline">{report.name}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-550">
                          {REPORT_CATEGORIES.find((c) => c.id === report.category)?.label || report.category}
                        </td>
                        <td className="px-6 py-3 text-slate-400">System Generated</td>
                      </tr>
                    ))}
                    {filteredReports.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
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

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white">
        <div className="border-b border-slate-200/70 bg-white px-4 py-2.5 flex items-center gap-3 sticky top-0 z-10">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">
              {REPORT_CATEGORIES.find((c) => c.id === activeReport?.category)?.label}
            </div>
            <h1 className="text-sm font-semibold text-slate-700 mt-0.5 truncate">
              {activeReport?.name}
              {activeReport?.useDateRange && (
                <span className="text-slate-400 font-normal ml-2">
                  • From {fmtDate(from)} To {fmtDate(to)}
                </span>
              )}
              {(activeReport?.useAsOf || activeReport?.useAgingBuckets) && (
                <span className="text-slate-400 font-normal ml-2">
                  • As of {fmtDate(asOf)}
                </span>
              )}
            </h1>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-105 rounded-md border border-slate-200" onClick={() => setHistoryOpen(true)}>
                  <Clock3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>Show History</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-105 rounded-md border border-slate-200" onClick={() => void loadReport({ source: "auto" })} disabled={fetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} />
          </Button>
        </div>

        <div className="border-b border-slate-150 bg-slate-50/30 px-4 py-2 flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 shrink-0">Filters :</span>

          {(activeReport?.useDateRange || activeReport?.useAsOf || activeReport?.useAgingBuckets) && (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">
                {activeReport?.useAsOf || activeReport?.useAgingBuckets ? "As of Date" : "Date Range"}
              </span>
              <span className="text-xs text-slate-400">:</span>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="h-7 w-[170px] border-0 px-1.5 text-xs shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {datePreset === "custom" && activeReport?.useDateRange && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-36 text-xs border-slate-200" />
              <span className="text-xs text-slate-400">to</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-36 text-xs border-slate-200" />
            </>
          )}

          {(activeReport?.useAsOf || activeReport?.useAgingBuckets) && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">As of:</span>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-7 w-36 text-xs border-slate-200" />
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1">
            <span className="text-xs text-slate-500">Report Basis</span>
            <span className="text-xs text-slate-400">:</span>
            <Select value={reportBasis} onValueChange={(value) => setReportBasis(value as ReportBasis)}>
              <SelectTrigger className="h-7 w-[120px] border-0 px-1.5 text-xs shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Accrual">Accrual</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs border-slate-200 text-slate-655 hover:bg-slate-50 hover:text-slate-900 rounded-md">
                <PlusCircle className="h-3.5 w-3.5 text-slate-400" />
                More Filters
                {moreFiltersCount > 0 && (
                  <span className="rounded-full bg-teal-50 text-teal-700 border border-teal-100 px-1.5 py-0.5 text-[10px] font-semibold">{moreFiltersCount}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] space-y-3">
              <div className="text-sm font-semibold text-slate-800 border-b pb-1.5">Additional Filters</div>

              {activeReport?.statusOptions && (
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Status</div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeReport.statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeReport?.partyFilter === "vendor" && (
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Vendor</div>
                  <Select value={vendorFilter} onValueChange={setVendorFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={partyLoading ? "Loading vendors..." : "All Vendors"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Vendors</SelectItem>
                      {vendorOptions.map((vendor) => (
                        <SelectItem key={vendor._id} value={vendor._id}>
                          {vendor.displayName || vendor.companyName || "Vendor"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeReport?.partyFilter === "customer" && (
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Customer</div>
                  <Select value={customerFilter} onValueChange={setCustomerFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={partyLoading ? "Loading customers..." : "All Customers"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Customers</SelectItem>
                      {customerOptions.map((customer) => (
                        <SelectItem key={customer._id} value={customer._id}>
                          {customer.displayName || customer.companyName || "Customer"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md"
                  onClick={() => {
                    setStatusFilter("All");
                    setVendorFilter("All");
                    setCustomerFilter("All");
                  }}
                >
                  Clear
                </Button>
                <Button type="button" size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold" onClick={() => setMoreFiltersOpen(false)}>
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-slate-200 text-slate-655 hover:bg-slate-50 hover:text-slate-900 rounded-md">
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  Export
                  <ChevronDown className="h-3 w-3 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Export As</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void handleExport("pdf")}>
                  <FileDown className="h-3.5 w-3.5" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport("xls")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  XLS (Microsoft Excel 97-2004)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport("xlsx")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  XLSX (Microsoft Excel)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport("csv")}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleExport("zoho-sheet")}>Export to Zoho Sheet</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Print</DropdownMenuLabel>
                <DropdownMenuItem onClick={handlePrint}>
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Print Preference</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuLabel>Orientation</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={printOrientation} onValueChange={(value) => setPrintOrientation(value as "portrait" | "landscape")}>
                      <DropdownMenuRadioItem value="portrait">Portrait</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="landscape">Landscape</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="inline-flex">
              <Button size="sm" className="h-8 rounded-l-md rounded-r-none px-3 text-xs gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void loadReport({ source: "manual" })} disabled={fetching}>
                {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1 text-white" /> : null}
                Run Report
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 rounded-r-md rounded-l-none border-l border-teal-500/40 bg-teal-600 hover:bg-teal-700 text-white px-2" disabled={fetching}>
                    <ChevronDown className="h-3.5 w-3.5 text-white" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => void loadReport({ source: "manual" })}>Run Report</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const ok = await loadReport({ source: "manual" });
                      if (ok) setHistoryOpen(true);
                    }}
                  >
                    Run Report and Show History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setDatePreset("today");
                      setCustomFrom("");
                      setCustomTo("");
                      setStatusFilter("All");
                      setVendorFilter("All");
                      setCustomerFilter("All");
                      setReportBasis("Accrual");
                    }}
                  >
                    Reset Filters
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="p-6 overflow-auto flex-1 bg-white">
          {fetching && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-teal-650" />
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
            <div className="text-center py-20 text-slate-400 text-sm">
              Click <span className="font-semibold text-teal-700">&quot;Run Report&quot;</span> to generate this report
            </div>
          )}
        </div>

        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0">
            <div className="flex h-full flex-col bg-white">
              <SheetHeader className="border-b px-4 py-4">
                <SheetTitle className="text-slate-800">Report History</SheetTitle>
                <SheetDescription className="text-xs text-slate-400">
                  Recent run and export activity for reports.
                </SheetDescription>
              </SheetHeader>

              <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50/50">
                <div className="text-xs text-slate-500 font-medium">{reportHistory.length} entries</div>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-slate-200 text-slate-650 hover:bg-slate-100 rounded-md" onClick={clearHistory}>
                  Clear History
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                {reportHistory.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                    No history yet. Run or export a report to see entries here.
                  </div>
                )}

                {reportHistory.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-150 p-4 space-y-2.5 bg-slate-50/10">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">{entry.reportName}</div>
                        <div className="text-[10px] text-teal-705 uppercase tracking-wide font-semibold mt-0.5">
                          {entry.action}{entry.format ? ` - ${entry.format}` : ""}
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 text-right">
                        {new Date(entry.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 p-2 rounded-md font-mono text-[10px]">{entry.filtersText || "Default filters"}</div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 mt-2">
                      <span className="text-[10px] text-slate-405 font-medium">Rows: {entry.rows}</span>
                      <Button type="button" size="sm" variant="outline" className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-2.5 h-7" onClick={() => applyHistoryEntry(entry)}>
                        Load This
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  );
}


