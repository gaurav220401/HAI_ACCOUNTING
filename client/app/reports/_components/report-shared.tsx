"use client";

import { cn } from "@/lib/utils";
import { formatCell, fmtCurrency, fmtDate, formatTotalMetricValue } from "../_lib/formatters";
import { Badge } from "@/components/ui/badge";

/* ─── Components ─────────────────────────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "shipped" || s === "delivered" || s === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {status}
      </span>
    );
  }
  if (s === "pending" || s === "overdue" || s === "partial") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {status}
      </span>
    );
  }
  if (s === "void" || s === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {status}
    </span>
  );
}

export function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50",
    red: "border-red-200 bg-red-50",
    teal: "border-teal-200 bg-teal-50",
    amber: "border-amber-200 bg-amber-50",
    purple: "border-purple-200 bg-purple-50",
  };
  const textMap: Record<string, string> = {
    emerald: "text-emerald-700",
    red: "text-red-700",
    teal: "text-teal-700",
    amber: "text-amber-700",
    purple: "text-purple-700",
  };
  // Map blue to teal automatically if passed from caller
  const mappedColor = color === "blue" ? "teal" : color;
  
  return (
    <div className={cn("rounded-xl border p-4 shadow-sm", colorMap[mappedColor] || "border-slate-200 bg-white")}> 
      <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{label}</div>
      <div className={cn("text-lg font-bold mt-1", textMap[mappedColor] || "text-slate-800")}>{fmtCurrency(value)}</div>
    </div>
  );
}

export function AccountTable({ title, rows, color }: { title: string; rows: { accountId: string; name: string; amount: number }[]; color: string }) {
  const headerBg: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-800",
    red: "bg-red-50 border-red-100 text-red-800",
    teal: "bg-teal-50 border-teal-100 text-teal-850",
    amber: "bg-amber-50 border-amber-100 text-amber-850",
    purple: "bg-purple-50/50 border-purple-100 text-purple-850",
  };
  // Map blue to teal automatically if passed from caller
  const mappedColor = color === "blue" ? "teal" : color;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className={cn("px-4 py-2.5 border-b font-bold text-xs flex justify-between", headerBg[mappedColor] || "bg-slate-50 text-slate-700 border-slate-200")}> 
        <span>{title}</span>
        <span className="font-mono">{fmtCurrency(total)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.accountId} className="hover:bg-slate-50/40 transition-colors">
              <td className="px-4 py-2 text-xs text-slate-650 font-medium">{row.name}</td>
              <td className="px-4 py-2 text-xs text-right font-mono text-slate-700">{fmtCurrency(row.amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-4 text-center text-xs text-slate-400">No balances</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
