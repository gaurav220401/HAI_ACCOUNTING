"use client";

import React from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

interface ImportTemplatesCardProps {
  onDownloadSample: (format: "csv" | "excel") => void;
  onDownloadBlank: (format: "csv" | "excel") => void;
  theme?: "teal" | "blue";
}

const ICON_THEME = {
  teal: { text: "text-teal-600", bg: "bg-teal-50" },
  blue: { text: "text-blue-600", bg: "bg-blue-50" },
};

const BTN_CLASS =
  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1";

export function ImportTemplatesCard({
  onDownloadSample,
  onDownloadBlank,
  theme = "teal",
}: ImportTemplatesCardProps) {
  const { text, bg } = ICON_THEME[theme];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-2">
      {/* Sample Template */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${bg} ${text} shrink-0`}>
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Sample Template</h4>
            <p className="text-xs text-slate-500 mt-1">
              Includes pre-filled sample records to demonstrate correct formatting and field mapping.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <button type="button" onClick={() => onDownloadSample("csv")} className={BTN_CLASS}>
            <Download className="h-3.5 w-3.5" />
            CSV Format
          </button>
          <button type="button" onClick={() => onDownloadSample("excel")} className={BTN_CLASS}>
            <Download className="h-3.5 w-3.5" />
            Excel Format
          </button>
        </div>
      </div>

      {/* Blank Template */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${bg} ${text} shrink-0`}>
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Blank Template</h4>
            <p className="text-xs text-slate-500 mt-1">
              Contains only the required column headers, ready for pasting or entering your own data.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <button type="button" onClick={() => onDownloadBlank("csv")} className={BTN_CLASS}>
            <Download className="h-3.5 w-3.5" />
            CSV Format
          </button>
          <button type="button" onClick={() => onDownloadBlank("excel")} className={BTN_CLASS}>
            <Download className="h-3.5 w-3.5" />
            Excel Format
          </button>
        </div>
      </div>
    </div>
  );
}
