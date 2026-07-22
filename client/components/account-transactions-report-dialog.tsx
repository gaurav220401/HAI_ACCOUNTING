"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { accountApi, type AccountDetailsTransaction } from "@/lib/api/accounts";

type ReportRow = {
  date: string;
  account: string;
  details: string;
  type: string;
  transactionNo: string;
  referenceNo: string;
  debit: number;
  credit: number;
};

interface AccountTransactionsReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  accountName: string;
  organizationName: string;
  baseCurrency: string;
}

function toInputDate(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseInputDate(value: string): Date {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function fmtDate(value?: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function fmtMoney(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

function asOpeningType(tx: AccountDetailsTransaction): string {
  if (tx.voucherType === "System" && tx.description.toLowerCase().includes("opening")) {
    return "Opening Balance";
  }
  return tx.voucherType || "-";
}

function csvEscape(value: string | number): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AccountTransactionsReportDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
  organizationName,
  baseCurrency,
}: AccountTransactionsReportDialogProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [reportBasis, setReportBasis] = useState<"Accrual" | "Cash">("Accrual");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    setFromDate(toInputDate(from));
    setToDate(toInputDate(now));
  }, [open, accountId]);

  const runReport = useCallback(async () => {
    if (!accountId) return;
    if (!fromDate || !toDate) return;

    const from = parseInputDate(fromDate);
    const to = parseInputDate(toDate);
    if (from > to) {
      toast.error("From date cannot be after To date");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dayBeforeFrom = new Date(from);
      dayBeforeFrom.setDate(dayBeforeFrom.getDate() - 1);

      const [openingRes, reportRes] = await Promise.all([
        accountApi.getDetails(accountId, {
          to: toInputDate(dayBeforeFrom),
          page: 1,
          limit: 1,
        }),
        accountApi.getDetails(accountId, {
          from: fromDate,
          to: toDate,
          page: 1,
          limit: 400,
        }),
      ]);

      const opening = Number(openingRes.data.summary.closingBalanceBCY || 0);
      const debit = Number(reportRes.data.summary.totalDebitBCY || 0);
      const credit = Number(reportRes.data.summary.totalCreditBCY || 0);
      const closing = opening + debit - credit;

      const mapped = [...reportRes.data.transactions]
        .sort((a, b) => new Date(a.postingDate).getTime() - new Date(b.postingDate).getTime())
        .map((tx) => ({
          date: fmtDate(tx.postingDate),
          account: accountName,
          details: tx.description || tx.contactName || "--",
          type: asOpeningType(tx),
          transactionNo: tx.voucherNo || "-",
          referenceNo: tx.voucherId || "-",
          debit: tx.debitBCY,
          credit: tx.creditBCY,
        }));

      setRows(mapped);
      setOpeningBalance(opening);
      setTotalDebit(debit);
      setTotalCredit(credit);
      setClosingBalance(closing);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load account transactions";
      setError(message);
      setRows([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [accountId, fromDate, toDate, accountName]);

  useEffect(() => {
    if (!open || !accountId || !fromDate || !toDate) return;
    void runReport();
  }, [open, accountId, fromDate, toDate, runReport]);

  const headerFrom = useMemo(() => (fromDate ? fmtDate(fromDate) : "-"), [fromDate]);
  const headerTo = useMemo(() => (toDate ? fmtDate(toDate) : "-"), [toDate]);

  function exportCsv() {
    const csvRows: Array<Array<string | number>> = [
      ["Date", "Account", "Transaction Details", "Transaction Type", "Transaction Number", "Reference Number", "Debit", "Credit"],
      [`As On ${headerFrom}`, "Opening Balance", "", "Opening Balance", "", "", openingBalance > 0 ? openingBalance : 0, openingBalance < 0 ? Math.abs(openingBalance) : 0],
      ...rows.map((r) => [r.date, r.account, r.details, r.type, r.transactionNo, r.referenceNo, r.debit, r.credit]),
      ["", "Total Debits and Credits", `${headerFrom} - ${headerTo}`, "", "", "", totalDebit, totalCredit],
      [`As On ${headerTo}`, "Closing Balance", "", "", "", "", closingBalance > 0 ? closingBalance : 0, closingBalance < 0 ? Math.abs(closingBalance) : 0],
    ];

    const csvText = csvRows.map((line) => line.map((cell) => csvEscape(cell)).join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${accountName.replace(/\s+/g, "-").toLowerCase()}-transactions-${fromDate}-to-${toDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-w-[96vw] gap-0 overflow-hidden p-0 sm:max-w-[96vw]" showCloseButton>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-xl">Account Transactions</DialogTitle>
          <DialogDescription>
            {accountName} | From {headerFrom} To {headerTo}
          </DialogDescription>
        </DialogHeader>

        <div className="border-b bg-muted/20 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={[
                    "h-9 gap-1.5 border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50",
                    (fromDate || toDate) ? "border-teal-500 bg-teal-50/60 text-teal-700 font-semibold" : "",
                  ].join(" ")}
                >
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  {fromDate || toDate ? `${fromDate || "Start"} - ${toDate || "End"}` : "Date Range"}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3 border-slate-200 bg-white p-4 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Filter by Date Range</span>
                  {(fromDate || toDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate("");
                        setToDate("");
                      }}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">From Date</label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 border-slate-200 bg-slate-50 text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">To Date</label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 border-slate-200 bg-slate-50 text-xs" />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <select
              value={reportBasis}
              onChange={(e) => setReportBasis(e.target.value as "Accrual" | "Cash")}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="Accrual">Report Basis : Accrual</option>
              <option value="Cash">Report Basis : Cash</option>
            </select>
            <Button variant="outline" className="h-9">More Filters</Button>
            <Button onClick={() => void runReport()} className="h-9">Run Report</Button>
            <Button variant="outline" className="ml-auto h-9 gap-1.5" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-background px-4 py-4">
          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-end gap-6 border-b px-4 py-2 text-sm">
              <span className="text-muted-foreground">
                Group By : <span className="font-medium text-foreground">None</span>
              </span>
              <span className="text-muted-foreground">
                Customize Report Columns
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">8</span>
              </span>
            </div>
            <div className="border-b px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">{organizationName || "Organization"}</p>
              <h3 className="text-2xl font-semibold">Account Transactions</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Basis : {reportBasis}</p>
              <p className="mt-1 text-xl">{accountName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">From {headerFrom} To {headerTo}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-14 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="ml-2">Loading report...</span>
              </div>
            ) : error ? (
              <div className="px-4 py-10 text-center text-sm text-destructive">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Account</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Transaction Details</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Transaction Type</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Transaction Number</th>
                      <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted-foreground">Reference Number</th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-muted-foreground">Debit</th>
                      <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide text-muted-foreground">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t bg-muted/10">
                      <td className="px-4 py-3 font-medium">As On {headerFrom}</td>
                      <td className="px-4 py-3">Opening Balance</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3">Opening Balance</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3 text-right tabular-nums">{openingBalance > 0 ? fmtMoney(openingBalance, baseCurrency) : ""}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{openingBalance < 0 ? fmtMoney(Math.abs(openingBalance), baseCurrency) : ""}</td>
                    </tr>

                    {rows.map((row, idx) => (
                      <tr key={`${row.transactionNo}-${idx}`} className="border-t">
                        <td className="px-4 py-3">{row.date}</td>
                        <td className="px-4 py-3">{row.account}</td>
                        <td className="px-4 py-3">{row.details}</td>
                        <td className="px-4 py-3">{row.type}</td>
                        <td className="px-4 py-3">{row.transactionNo}</td>
                        <td className="px-4 py-3">{row.referenceNo}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.debit > 0 ? fmtMoney(row.debit, baseCurrency) : ""}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.credit > 0 ? fmtMoney(row.credit, baseCurrency) : ""}</td>
                      </tr>
                    ))}

                    <tr className="border-t bg-muted/10">
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 font-semibold">Total Debits and Credits</td>
                      <td className="px-4 py-3 text-muted-foreground">({headerFrom} - {headerTo})</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtMoney(totalDebit, baseCurrency)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtMoney(totalCredit, baseCurrency)}</td>
                    </tr>

                    <tr className="border-t bg-muted/10">
                      <td className="px-4 py-3 font-medium">As On {headerTo}</td>
                      <td className="px-4 py-3">Closing Balance</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3">--</td>
                      <td className="px-4 py-3 text-right tabular-nums">{closingBalance > 0 ? fmtMoney(closingBalance, baseCurrency) : ""}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{closingBalance < 0 ? fmtMoney(Math.abs(closingBalance), baseCurrency) : ""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
