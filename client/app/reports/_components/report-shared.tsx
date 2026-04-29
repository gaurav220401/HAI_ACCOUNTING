"use client";

import { cn } from "@/lib/utils";
import { formatCell, fmtCurrency, fmtDate, formatTotalMetricValue } from "../_lib/formatters";
import { Badge } from "@/components/ui/badge";

/* ─── Components ─────────────────────────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  const s = String(status || "").toLowerCase();
  if (s === "paid" || s === "shipped" || s === "delivered" || s === "active") {
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">{status}</Badge>;
  }
  if (s === "pending" || s === "overdue" || s === "partial") {
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">{status}</Badge>;
  }
  if (s === "void" || s === "cancelled") {
    return <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
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

export function AccountTable({ title, rows, color }: { title: string; rows: { accountId: string; name: string; amount: number }[]; color: string }) {
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
          {rows.map((row) => (
            <tr key={row.accountId} className="border-t hover:bg-muted/10 transition-colors">
              <td className="px-3 py-1.5 text-xs">{row.name}</td>
              <td className="px-3 py-1.5 text-xs text-right font-mono">{fmtCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
