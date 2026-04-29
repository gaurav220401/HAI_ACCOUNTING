"use client";

import { cn } from "@/lib/utils";
import { formatCell, fmtCurrency, fmtDate, formatTotalMetricValue } from "../_lib/formatters";
import { StatusBadge, SummaryCard, AccountTable } from "./report-shared";
import {
  type TrialBalanceResponse,
  type ProfitLossResponse,
  type BalanceSheetResponse,
  type ControlReconciliationResponse,
  type GenericReportResponse,
} from "@/lib/api/reports";

/* ─── Interfaces ─────────────────────────────────────────────────── */

interface ReportDef {
  id: string;
  name: string;
  category: string;
  apiCall: string;
  columns: { key: string; label: string; align?: "left" | "right"; format?: "currency" | "date" | "number" }[];
  useDateRange?: boolean;
  useAsOf?: boolean;
  useAgingBuckets?: boolean;
  statusOptions?: string[];
  partyFilter?: "vendor" | "customer";
}

/* ─── Generic Table View ─────────────────────────────────────────── */

export function GenericTableView({ data, columns, title, from, to }: {
  data: GenericReportResponse;
  columns: ReportDef["columns"];
  title: string;
  from: string;
  to: string;
}) {
  const rows = data.rows || [];
  const totals = data.totals || {};

  const totalForColumn = (columnKey: string): number | null => {
    const key = String(columnKey || "");
    if (!key) return null;
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    const candidates = [`total${pascal}`, `grand${pascal}`, key];

    for (const candidate of candidates) {
      const value = totals[candidate];
      if (typeof value === "number") return value;
    }

    return null;
  };

  const showTotalsRow = Object.keys(totals).length > 0 && columns.some((col) => totalForColumn(col.key) !== null);

  return (
    <div className="space-y-3">
      {data.totals && Object.keys(data.totals).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.totals).map(([key, value]) => (
            <div key={key} className="rounded-lg border bg-white p-3 min-w-[160px] shadow-sm">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </div>
              <div className="text-lg font-bold mt-0.5">{formatTotalMetricValue(key, value)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center py-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {from && to && <p className="text-xs text-muted-foreground">From {fmtDate(from)} To {fmtDate(to)}</p>}
      </div>

      <div className="rounded-lg border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={cn("px-3 py-2.5 text-xs font-semibold uppercase tracking-wider", col.align === "right" ? "text-right" : "text-left")}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                  {columns.map((col) => (
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
            {showTotalsRow && (
              <tfoot className="bg-muted/20 border-t">
                <tr className="font-semibold">
                  {columns.map((col, idx) => {
                    if (idx === 0) return <td key={col.key} className="px-3 py-2 text-xs">Total</td>;
                    const totalValue = totalForColumn(col.key);
                    return (
                      <td key={col.key} className={cn("px-3 py-2 text-xs", col.align === "right" ? "text-right font-mono" : "text-left")}>
                        {totalValue === null ? "" : formatCell(totalValue, col.format)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {data.count !== undefined && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {rows.length} of {data.count} records
        </p>
      )}
    </div>
  );
}

/* ─── Aging Buckets View ─────────────────────────────────────────── */

type AgingBucket = {
  rows?: Record<string, unknown>[];
  total: number;
};

export function AgingBucketsView({ data, columns, title }: {
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
      <div className="flex flex-wrap gap-3">
        {Object.entries(buckets).map(([key, bucket]: [string, AgingBucket]) => (
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

      {Object.entries(buckets).map(([key, bucket]: [string, AgingBucket]) => {
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
                  {columns.map((col) => (
                    <th key={col.key} className={cn("px-3 py-2 text-xs font-semibold", col.align === "right" ? "text-right" : "text-left")}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-t hover:bg-muted/20">
                    {columns.map((col) => (
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

/* ─── Trial Balance View ─────────────────────────────────────────── */

export function TrialBalanceView({ data }: { data: TrialBalanceResponse }) {
  const imbalance = Math.abs(data.totals.difference) > 0.009;
  return (
    <div className="space-y-3">
      <div className={cn("rounded-lg border p-3 text-sm", imbalance ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200")}>
        {imbalance ? "Trial balance is not balanced. Check missing/reversed entries." : "Trial balance is balanced."}
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
            {data.rows.map((row) => (
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

/* ─── Profit & Loss View ─────────────────────────────────────────── */

export function ProfitLossView({ data }: { data: ProfitLossResponse }) {
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

/* ─── Balance Sheet Helpers & View ───────────────────────────────── */

type BalanceSheetTableLine = {
  accountId: string;
  code: string;
  name: string;
  accountType?: string;
  amount: number;
};

type BalanceSheetRenderRow = {
  kind: "heading" | "account" | "total";
  label: string;
  code?: string;
  amount?: number;
  depth: number;
};

function sumBalanceLines(lines: BalanceSheetTableLine[]): number {
  return lines.reduce((sum, row) => sum + row.amount, 0);
}

function sortBalanceLines(lines: BalanceSheetTableLine[]): BalanceSheetTableLine[] {
  return [...lines].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function normalizeBalanceText(value?: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function textIncludesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isLineAccountType(line: BalanceSheetTableLine, accountTypes: string[]): boolean {
  const lineType = normalizeBalanceText(line.accountType);
  return accountTypes.some((type) => lineType === normalizeBalanceText(type));
}

function consumeLinesByMatcher(pool: BalanceSheetTableLine[], matcher: (line: BalanceSheetTableLine) => boolean): BalanceSheetTableLine[] {
  const picked: BalanceSheetTableLine[] = [];
  for (let idx = pool.length - 1; idx >= 0; idx -= 1) {
    const row = pool[idx];
    if (matcher(row)) {
      picked.push(row);
      pool.splice(idx, 1);
    }
  }
  return sortBalanceLines(picked);
}

function isCashAndBankAssetLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Cash", "Bank", "Payment Clearing Account"]) || textIncludesAny(name, ["petty cash", "cash in hand", "cash", "bank", "current account", "savings account"]);
}

function isBankLikeLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Bank"]) || textIncludesAny(name, ["bank", "current account", "savings account"]);
}

function isCashLikeLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Cash", "Payment Clearing Account"]) || (textIncludesAny(name, ["cash", "petty cash", "cash in hand"]) && !textIncludesAny(name, ["bank"]));
}

function isAccountsReceivableLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Accounts Receivable"]) || textIncludesAny(name, ["accounts receivable", "receivable", "debtors", "debtor"]);
}

function isOtherCurrentAssetLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Other Current Asset", "Stock"]) || textIncludesAny(name, ["inventory", "stock", "prepaid", "advance tax"]);
}

function isNonCurrentAssetLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Non Current Asset", "Deferred Tax Asset", "Intangible Asset"]) || textIncludesAny(name, ["non current", "deferred tax asset", "intangible"]);
}

function isFixedAssetLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Fixed Asset"]) || textIncludesAny(name, ["acc dep", "accumulated depreciation", "depreciation", "furniture", "fixture", "equipment", "machinery", "vehicle", "plant", "computer", "office equipment"]);
}

function isAccountsPayableLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Accounts Payable"]) || textIncludesAny(name, ["accounts payable", "trade payable", "creditors", "creditor"]);
}

function isOtherCurrentLiabilityLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Other Current Liability", "Credit Card", "Overseas Tax Payable"]) || textIncludesAny(name, ["accrued", "accrual", "credit card", "gst payable", "tax payable", "tcs payable", "tds payable"]);
}

function isNonCurrentLiabilityLine(line: BalanceSheetTableLine): boolean {
  const name = normalizeBalanceText(line.name);
  return isLineAccountType(line, ["Non Current Liability", "Deferred Tax Liability"]) || textIncludesAny(name, ["long term", "term loan", "deferred tax liability", "non current liability"]);
}

function toAccountRows(lines: BalanceSheetTableLine[], depth: number): BalanceSheetRenderRow[] {
  return lines.map((line) => ({ kind: "account", label: line.name, code: line.code || "", amount: line.amount, depth }));
}

function buildFlatGroupRows(label: string, lines: BalanceSheetTableLine[], depth: number): { rows: BalanceSheetRenderRow[]; total: number } {
  const sortedLines = sortBalanceLines(lines);
  const total = sumBalanceLines(sortedLines);
  return {
    rows: [{ kind: "heading", label, depth }, ...toAccountRows(sortedLines, depth + 1), { kind: "total", label: `Total for ${label}`, amount: total, depth }],
    total,
  };
}

function buildAssetHierarchyRows(lines: BalanceSheetTableLine[]): BalanceSheetRenderRow[] {
  const pool = sortBalanceLines(lines);
  const rows: BalanceSheetRenderRow[] = [];
  rows.push({ kind: "heading", label: "Current Assets", depth: 1 });
  let currentAssetsTotal = 0;
  const cashAndEqPool = consumeLinesByMatcher(pool, isCashAndBankAssetLine);
  const bankRows = consumeLinesByMatcher(cashAndEqPool, isBankLikeLine);
  const cashRows = consumeLinesByMatcher(cashAndEqPool, isCashLikeLine);
  const otherCashEqRows = sortBalanceLines(cashAndEqPool);
  rows.push({ kind: "heading", label: "Cash and Cash Equivalents", depth: 2 });
  const cashGroup = buildFlatGroupRows("Cash", cashRows, 3);
  rows.push(...cashGroup.rows);
  const bankGroup = buildFlatGroupRows("Bank", bankRows, 3);
  rows.push(...bankGroup.rows);
  let cashAndEqTotal = cashGroup.total + bankGroup.total;
  if (otherCashEqRows.length) {
    const otherCashEqGroup = buildFlatGroupRows("Other Cash Equivalents", otherCashEqRows, 3);
    rows.push(...otherCashEqGroup.rows);
    cashAndEqTotal += otherCashEqGroup.total;
  }
  rows.push({ kind: "total", label: "Total for Cash and Cash Equivalents", amount: cashAndEqTotal, depth: 2 });
  currentAssetsTotal += cashAndEqTotal;
  const accountsReceivable = buildFlatGroupRows("Accounts Receivable", consumeLinesByMatcher(pool, isAccountsReceivableLine), 2);
  rows.push(...accountsReceivable.rows);
  currentAssetsTotal += accountsReceivable.total;
  const otherCurrentAssets = buildFlatGroupRows("Other current assets", consumeLinesByMatcher(pool, isOtherCurrentAssetLine), 2);
  rows.push(...otherCurrentAssets.rows);
  currentAssetsTotal += otherCurrentAssets.total;
  rows.push({ kind: "total", label: "Total for Current Assets", amount: currentAssetsTotal, depth: 1 });
  const nonCurrentAssets = buildFlatGroupRows("Non Current Assets", consumeLinesByMatcher(pool, isNonCurrentAssetLine), 1);
  rows.push(...nonCurrentAssets.rows);
  const fixedAssets = buildFlatGroupRows("Fixed Assets", consumeLinesByMatcher(pool, isFixedAssetLine), 1);
  rows.push(...fixedAssets.rows);
  const knownOtherAssets = consumeLinesByMatcher(pool, (line) => isLineAccountType(line, ["Other Asset"]));
  const fallbackAssets = sortBalanceLines(pool);
  pool.length = 0;
  const otherAssets = buildFlatGroupRows("Other Assets", [...knownOtherAssets, ...fallbackAssets], 1);
  rows.push(...otherAssets.rows);
  return rows;
}

function buildLiabilityHierarchyRows(lines: BalanceSheetTableLine[]): BalanceSheetRenderRow[] {
  const pool = sortBalanceLines(lines);
  const rows: BalanceSheetRenderRow[] = [];
  rows.push({ kind: "heading", label: "Current Liabilities", depth: 2 });
  let currentLiabilitiesTotal = 0;
  const accountsPayable = buildFlatGroupRows("Accounts Payable", consumeLinesByMatcher(pool, isAccountsPayableLine), 3);
  rows.push(...accountsPayable.rows);
  currentLiabilitiesTotal += accountsPayable.total;
  const otherCurrentLiabilities = buildFlatGroupRows("Other Current Liabilities", consumeLinesByMatcher(pool, isOtherCurrentLiabilityLine), 3);
  rows.push(...otherCurrentLiabilities.rows);
  currentLiabilitiesTotal += otherCurrentLiabilities.total;
  rows.push({ kind: "total", label: "Total for Current Liabilities", amount: currentLiabilitiesTotal, depth: 2 });
  const nonCurrentLiabilities = buildFlatGroupRows("Non Current Liabilities", consumeLinesByMatcher(pool, isNonCurrentLiabilityLine), 2);
  rows.push(...nonCurrentLiabilities.rows);
  const knownOtherLiabilities = consumeLinesByMatcher(pool, (line) => isLineAccountType(line, ["Other Liability"]));
  const fallbackLiabilities = sortBalanceLines(pool);
  pool.length = 0;
  const otherLiabilities = buildFlatGroupRows("Other Liabilities", [...knownOtherLiabilities, ...fallbackLiabilities], 2);
  rows.push(...otherLiabilities.rows);
  return rows;
}

function buildEquityHierarchyRows(lines: BalanceSheetTableLine[]): BalanceSheetRenderRow[] {
  const pool = sortBalanceLines(lines);
  const knownEquities = consumeLinesByMatcher(pool, (line) => isLineAccountType(line, ["Equity"]));
  const fallbackEquities = sortBalanceLines(pool);
  return toAccountRows([...knownEquities, ...fallbackEquities], 2);
}

export function BalanceSheetView({ data }: { data: BalanceSheetResponse }) {
  const assetRows = buildAssetHierarchyRows(data.assets as BalanceSheetTableLine[]);
  const liabilityRows = buildLiabilityHierarchyRows(data.liabilities as BalanceSheetTableLine[]);
  const equityRows = buildEquityHierarchyRows(data.equity as BalanceSheetTableLine[]);
  const liabilitiesAndEquityTotal = Number((data.totals.totalLiabilities + data.totals.totalEquity).toFixed(2));
  const hasEquationDiff = Math.abs(data.totals.equationDifference) > 0.009;

  const tableRows: BalanceSheetRenderRow[] = [
    { kind: "heading", label: "Assets", depth: 0 },
    ...assetRows,
    { kind: "total", label: "Total for Assets", amount: data.totals.totalAssets, depth: 0 },
    { kind: "heading", label: "Liabilities & Equities", depth: 0 },
    { kind: "heading", label: "Liabilities", depth: 1 },
    ...liabilityRows,
    { kind: "total", label: "Total for Liabilities", amount: data.totals.totalLiabilities, depth: 1 },
    { kind: "heading", label: "Equities", depth: 1 },
    ...equityRows,
    { kind: "total", label: "Total for Equities", amount: data.totals.totalEquity, depth: 1 },
    { kind: "total", label: "Total for Liabilities & Equities", amount: liabilitiesAndEquityTotal, depth: 1 },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Assets" value={data.totals.totalAssets} color="blue" />
        <SummaryCard label="Total Liabilities" value={data.totals.totalLiabilities} color="amber" />
        <SummaryCard label="Total Equity" value={data.totals.totalEquity} color="purple" />
      </div>
      {hasEquationDiff && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Balance check difference detected: {fmtCurrency(data.totals.equationDifference)}.
        </div>
      )}
      <div className="text-center py-2">
        <h2 className="text-base font-semibold">Balance Sheet</h2>
        <p className="text-xs text-muted-foreground">As of {fmtDate(data.asOf)}</p>
      </div>

      <div className="rounded-lg border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-muted/30 border-b">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-semibold">Account</th>
                <th className="px-4 py-2.5 text-left font-semibold w-40">Account Code</th>
                <th className="px-4 py-2.5 text-right font-semibold w-56">Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr key={`${row.kind}-${row.label}-${idx}`} className={cn("border-t", row.kind === "heading" && "bg-muted/10", row.kind === "total" && "bg-muted/20")}>
                  <td className={cn("py-2 text-sm", (row.kind === "heading" || row.kind === "total") && "font-semibold")} style={{ paddingLeft: `${16 + row.depth * 16}px`, paddingRight: "16px" }}>
                    {row.kind === "account" ? <span className="text-blue-600">{row.label}</span> : row.label}
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{row.code || ""}</td>
                  <td className={cn("px-4 py-2 text-right font-mono", row.kind === "total" && "font-semibold")}>
                    {row.amount === undefined ? "" : fmtCurrency(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Reconciliation Card ────────────────────────────────────────── */

function ReconciliationCard({ title, data }: { title: string; data: { glBalance: number; subledgerBalance: number; difference: number } }) {
  const diff = Math.abs(data.difference) > 0.009;
  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b font-semibold text-xs">{title}</div>
      <div className="p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Control Account Balance:</span>
          <span className="font-mono">{fmtCurrency(data.glBalance)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total Party Balance:</span>
          <span className="font-mono">{fmtCurrency(data.subledgerBalance)}</span>
        </div>
        <div className={cn("flex justify-between text-xs pt-1 border-t font-semibold", diff ? "text-red-600" : "text-emerald-600")}>
          <span>Difference:</span>
          <span className="font-mono">{fmtCurrency(data.difference)}</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Control Reconciliation View ────────────────────────────────── */

export function ControlReconciliationView({ data }: { data: ControlReconciliationResponse }) {
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
