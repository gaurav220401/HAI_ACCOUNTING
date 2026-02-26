"use client";

import * as React from "react";
import { Printer, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface PrintViewProps {
  /** The title of the document */
  title: string;
  /** The document type name (e.g., "Sales Invoice") */
  doctype: string;
  /** Document name/ID (e.g., "SINV-2024-00001") */
  documentName: string;
  /** Company name */
  companyName?: string;
  /** Company address lines */
  companyAddress?: string[];
  /** Company logo URL */
  companyLogo?: string;
  /** Customer/Supplier/Party info */
  partyLabel?: string;
  partyName?: string;
  partyAddress?: string[];
  /** Document date */
  date?: string;
  /** Due date */
  dueDate?: string;
  /** Header fields (key-value pairs shown in header) */
  headerFields?: { label: string; value: string }[];
  /** Line items table */
  lineItems?: {
    columns: {
      key: string;
      label: string;
      align?: "left" | "right" | "center";
    }[];
    rows: Record<string, string | number>[];
  };
  /** Summary / totals (right-aligned below table) */
  totals?: { label: string; value: string; bold?: boolean }[];
  /** Terms & conditions text */
  terms?: string;
  /** Notes / remarks */
  notes?: string;
  /** Additional children to render in the print body */
  children?: React.ReactNode;
  /** Called when print is triggered */
  onPrint?: () => void;
  /** Called when close/back is triggered */
  onClose?: () => void;
  /** Whether to show controls */
  showControls?: boolean;
}

// ─── PrintView ──────────────────────────────────────────────────────────

export function PrintView({
  title,
  doctype,
  documentName,
  companyName,
  companyAddress,
  companyLogo,
  partyLabel = "Bill To",
  partyName,
  partyAddress,
  date,
  dueDate,
  headerFields,
  lineItems,
  totals,
  terms,
  notes,
  children,
  onPrint,
  onClose,
  showControls = true,
}: PrintViewProps) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    window.print();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Toolbar — hidden when printing */}
      {showControls && (
        <div className="print:hidden sticky top-0 z-10 bg-background border-b px-4 py-2 flex items-center justify-between">
          <div className="text-sm font-medium">
            {doctype}: {documentName}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Print Content */}
      <div className="flex justify-center py-8 print:py-0">
        <div
          ref={printRef}
          className={cn(
            "bg-white shadow-lg print:shadow-none",
            "w-[210mm] min-h-[297mm] p-[20mm]",
            "text-black text-sm print:text-xs",
          )}
        >
          {/* ── Header ───────────────────────────────────────────── */}
          <div className="flex justify-between items-start mb-8">
            <div>
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={companyName ?? "Logo"}
                  className="h-12 mb-2 object-contain"
                />
              )}
              {companyName && (
                <h2 className="text-lg font-bold">{companyName}</h2>
              )}
              {companyAddress?.map((line, i) => (
                <div key={i} className="text-xs text-gray-600">
                  {line}
                </div>
              ))}
            </div>
            <div className="text-right">
              <h1 className="text-xl font-bold text-gray-800">{title}</h1>
              <div className="text-sm font-mono text-gray-600 mt-1">
                {documentName}
              </div>
            </div>
          </div>

          {/* ── Party & Dates ────────────────────────────────────── */}
          <div className="flex justify-between mb-6">
            {partyName && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {partyLabel}
                </div>
                <div className="font-semibold">{partyName}</div>
                {partyAddress?.map((line, i) => (
                  <div key={i} className="text-xs text-gray-600">
                    {line}
                  </div>
                ))}
              </div>
            )}
            <div className="text-right space-y-1">
              {date && (
                <div>
                  <span className="text-xs text-gray-500">Date: </span>
                  <span className="font-medium">{date}</span>
                </div>
              )}
              {dueDate && (
                <div>
                  <span className="text-xs text-gray-500">Due Date: </span>
                  <span className="font-medium">{dueDate}</span>
                </div>
              )}
              {headerFields?.map((field, i) => (
                <div key={i}>
                  <span className="text-xs text-gray-500">{field.label}: </span>
                  <span className="font-medium">{field.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Line Items Table ─────────────────────────────────── */}
          {lineItems && lineItems.rows.length > 0 && (
            <table className="w-full mb-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide w-8">
                    #
                  </th>
                  {lineItems.columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center",
                        (!col.align || col.align === "left") && "text-left",
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-2 text-gray-500">{idx + 1}</td>
                    {lineItems.columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "py-2",
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                        )}
                      >
                        {row[col.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Totals ───────────────────────────────────────────── */}
          {totals && totals.length > 0 && (
            <div className="flex justify-end mb-6">
              <div className="w-64">
                {totals.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex justify-between py-1",
                      item.bold &&
                        "border-t-2 border-gray-800 font-bold text-base mt-1 pt-2",
                    )}
                  >
                    <span className="text-gray-600">{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Custom content ───────────────────────────────────── */}
          {children}

          {/* ── Notes ────────────────────────────────────────────── */}
          {notes && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Notes
              </div>
              <div className="text-xs text-gray-600 whitespace-pre-wrap">
                {notes}
              </div>
            </div>
          )}

          {/* ── Terms ────────────────────────────────────────────── */}
          {terms && (
            <div className="mt-8 pt-4 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Terms & Conditions
              </div>
              <div className="text-xs text-gray-600 whitespace-pre-wrap">
                {terms}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
