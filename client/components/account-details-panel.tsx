"use client";

import { FileUp, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountDetailsData, AccountDetailsTransaction } from "@/lib/api/accounts";

export type AccountAmountView = "BCY" | "FCY";

interface AccountDetailsPanelProps {
  details: AccountDetailsData | null;
  loading: boolean;
  error: string | null;
  baseCurrency: string;
  amountView: AccountAmountView;
  onAmountViewChange: (view: AccountAmountView) => void;
  onRefresh: () => void;
  onUploadClick: () => void;
  onOpenMoreDetails: () => void;
  uploading: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  onClose?: () => void;
  compact?: boolean;
}

function fmtDate(value?: string | Date | null): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function fmtMoney(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency || "INR"} ${safe.toFixed(2)}`;
  }
}

function txDebit(tx: AccountDetailsTransaction, amountView: AccountAmountView): number {
  return amountView === "BCY" ? tx.debitBCY : tx.debitFCY;
}

function txCredit(tx: AccountDetailsTransaction, amountView: AccountAmountView): number {
  return amountView === "BCY" ? tx.creditBCY : tx.creditFCY;
}

function txCurrency(tx: AccountDetailsTransaction, amountView: AccountAmountView, baseCurrency: string): string {
  return amountView === "BCY" ? baseCurrency : tx.currency || baseCurrency;
}

function typeLabel(tx: AccountDetailsTransaction): string {
  if (tx.voucherType === "System" && tx.description.toLowerCase().includes("opening")) {
    return "Opening Balance";
  }
  return tx.voucherType || "-";
}

function transactionDetails(tx: AccountDetailsTransaction): string {
  return tx.description || tx.contactName || "--";
}

export function AccountDetailsPanel({
  details,
  loading,
  error,
  baseCurrency,
  amountView,
  onAmountViewChange,
  onRefresh,
  onUploadClick,
  onOpenMoreDetails,
  uploading,
  onEdit,
  onDelete,
  canDelete = true,
  onClose,
  compact = false,
}: AccountDetailsPanelProps) {
  if (!details && loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="ml-2 text-sm">Loading account details...</span>
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <h3 className="text-base font-semibold">Account details</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || "Select an account to view account balance and recent transactions."}
        </p>
      </div>
    );
  }

  const previewRows = details.transactions.slice(0, 8);
  const sideLabel =
    details.summary.closingBalanceSide === "Debit"
      ? "(Dr)"
      : details.summary.closingBalanceSide === "Credit"
        ? "(Cr)"
        : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 lg:px-5">
        <div>
          <p className="text-xs text-muted-foreground">{details.account.accountType}</p>
          <h2 className="text-2xl leading-tight font-semibold tracking-tight lg:text-[28px]">
            {details.account.name}
            {details.account.code ? ` (${details.account.code})` : ""}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={onUploadClick}
            disabled={uploading}
          >
            <FileUp className="h-3.5 w-3.5" />
            {uploading ? "Uploading" : "Upload"}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex items-center gap-2 border-b px-4 py-2 lg:px-5">
          {onEdit && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={!canDelete}
              title={!canDelete ? "System accounts cannot be deleted" : undefined}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      )}

      <div className={cn("min-h-0 flex-1 overflow-auto", compact ? "px-3 py-2" : "px-4 py-3 lg:px-5")}>
        <div className="border-b border-dashed bg-muted/20 px-0 py-5">
          <p className="text-sm font-medium tracking-wide text-muted-foreground">CLOSING BALANCE</p>
          <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-primary lg:text-3xl">
            {fmtMoney(details.summary.closingBalanceBCY, baseCurrency)}
            {sideLabel ? <span className="ml-2 text-lg font-medium lg:text-xl">{sideLabel}</span> : null}
          </p>
          <p className="mt-3 text-base lg:text-lg">
            <span className="italic">Description :</span> {details.account.description || details.account.name}
          </p>
        </div>

        <div className="pt-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xl font-semibold leading-none lg:text-2xl">Recent Transactions</h3>
            <div className="inline-flex items-center rounded-md border p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium",
                  amountView === "FCY" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
                onClick={() => onAmountViewChange("FCY")}
              >
                FCY
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium",
                  amountView === "BCY" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
                onClick={() => onAmountViewChange("BCY")}
              >
                BCY
              </button>
            </div>
          </div>

          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Transaction Details</th>
                    <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-muted-foreground">Debit</th>
                    <th className="px-4 py-3 text-right font-medium uppercase tracking-wide text-muted-foreground">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No transactions available.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((tx) => {
                      const rowCurrency = txCurrency(tx, amountView, baseCurrency);
                      return (
                        <tr key={tx.id} className="border-t">
                          <td className="px-4 py-4">{fmtDate(tx.postingDate)}</td>
                          <td className="px-4 py-4">{transactionDetails(tx)}</td>
                          <td className="px-4 py-4">{typeLabel(tx)}</td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {txDebit(tx, amountView) > 0 ? fmtMoney(txDebit(tx, amountView), rowCurrency) : ""}
                          </td>
                          <td className="px-4 py-4 text-right tabular-nums">
                            {txCredit(tx, amountView) > 0 ? fmtMoney(txCredit(tx, amountView), rowCurrency) : ""}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 text-sm font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            onClick={onOpenMoreDetails}
          >
            Show more details
          </button>
        </div>
      </div>
    </div>
  );
}
