"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { journalApi } from "@/lib/api/journals";
import { accountApi } from "@/lib/api/accounts";
import * as XLSX from "xlsx";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialModule?: "journals" | "accounts";
}

function formatDecimal(val: number, format: string): string {
  if (isNaN(val)) return "";
  const parts = val.toFixed(2).split(".");
  let integerPart = parts[0];
  let decimalPart = parts[1];

  if (format === "1,234,567.89") {
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${integerPart}.${decimalPart}`;
  } else if (format === "1.234.567,89") {
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${integerPart},${decimalPart}`;
  } else {
    return `${integerPart}.${decimalPart}`;
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function validatePassword(pw: string): boolean {
  if (!pw) return true; // empty password is allowed (no protection)
  if (pw.length < 12) return false;
  const hasUppercase = /[A-Z]/.test(pw);
  const hasLowercase = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  return hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

export function ExportDialog({ open, onOpenChange, initialModule = "journals" }: ExportDialogProps) {
  const [module, setModule] = useState<"journals" | "accounts">(initialModule);
  const [period, setPeriod] = useState<"all" | "specific">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [template, setTemplate] = useState("standard");
  const [decimalFormat, setDecimalFormat] = useState("1234567.89");
  const [fileFormat, setFileFormat] = useState<"csv" | "xls" | "xlsx">("csv");
  const [includePii, setIncludePii] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync initial module if it changes from parent
  useEffect(() => {
    if (open) {
      setModule(initialModule);
      setPeriod("all");
      setStartDate("");
      setEndDate("");
      setTemplate("standard");
      setDecimalFormat("1234567.89");
      setFileFormat("csv");
      setIncludePii(false);
      setPassword("");
      setShowPassword(false);
    }
  }, [open, initialModule]);

  const isPasswordValid = validatePassword(password);
  const showPasswordError = password.length > 0 && !isPasswordValid;

  const handleExport = async () => {
    if (showPasswordError) {
      toast.error("Please enter a password that meets the safety requirements.");
      return;
    }

    if (period === "specific" && (!startDate || !endDate)) {
      toast.error("Please specify both Start Date and End Date.");
      return;
    }

    setLoading(true);
    try {
      // 1. Check for Import Template downloads
      if (template === "blank" || template === "sample") {
        const format = fileFormat === "csv" ? "csv" : "excel";
        let blob: Blob;
        if (module === "journals") {
          blob = template === "blank"
            ? await journalApi.downloadBlankTemplate(format)
            : await journalApi.downloadSampleTemplate(format);
        } else {
          blob = template === "blank"
            ? await accountApi.downloadBlankTemplate(format)
            : await accountApi.downloadSampleTemplate(format);
        }
        const ext = format === "excel" ? "xlsx" : "csv";
        const filename = `${template}_${module}_template.${ext}`;
        triggerDownload(blob, filename);
        toast.success(`${template === "blank" ? "Blank" : "Sample"} template downloaded successfully`);
        onOpenChange(false);
        return;
      }

      // 2. Fetch records
      let dataToExport: any[] = [];
      if (module === "journals") {
        const params: any = { limit: 25000 };
        if (period === "specific") {
          if (startDate) params.dateStart = startDate;
          if (endDate) params.dateEnd = endDate;
        }
        const res = await journalApi.list(params);
        dataToExport = res.data || [];
      } else {
        const res = await accountApi.list();
        let list = res.data || [];
        if (period === "specific") {
          list = list.filter((a: any) => {
            const createdDate = a.createdAt ? a.createdAt.split("T")[0] : "";
            if (startDate && createdDate < startDate) return false;
            if (endDate && createdDate > endDate) return false;
            return true;
          });
        }
        dataToExport = list;
      }

      if (dataToExport.length === 0) {
        toast.error("No data found to export for the selected filters");
        setLoading(false);
        return;
      }

      // 3. Map records
      let rows: any[] = [];
      let headers: string[] = [];

      if (module === "journals") {
        if (template === "standard") {
          headers = [
            "Journal ID",
            "Organization ID",
            "Journal Number",
            "Date",
            "Reference Number",
            "Description",
            "Notes",
            "Total Debit",
            "Total Credit",
            "Status",
            "Contact ID",
            "Contact Name",
            "Created At",
            "Updated At"
          ];
          rows = dataToExport.map((j: any) => {
            const vendorIdVal = typeof j.vendorId === "string" ? j.vendorId : j.vendorId?._id || "";
            const vendorName = j.vendorId && typeof j.vendorId !== "string" ? j.vendorId.displayName || j.vendorId.companyName || "" : "";
            const maskedContact = includePii ? vendorName : (vendorName ? "[MASKED]" : "");
            const debitFormatted = formatDecimal(Number(j.totalDebit || 0), decimalFormat);
            const creditFormatted = formatDecimal(Number(j.totalCredit || 0), decimalFormat);
            return {
              "Journal ID": j._id || "",
              "Organization ID": j.organizationId || "",
              "Journal Number": j.journalNumber || "",
              "Date": j.date ? j.date.split("T")[0] : "",
              "Reference Number": j.referenceNumber || "",
              "Description": j.description || "",
              "Notes": j.notes || "",
              "Total Debit": debitFormatted,
              "Total Credit": creditFormatted,
              "Status": j.status || "",
              "Contact ID": vendorIdVal,
              "Contact Name": maskedContact,
              "Created At": j.createdAt || "",
              "Updated At": j.updatedAt || ""
            };
          });
        } else {
          // Detailed Template (Includes line items)
          headers = [
            "Journal ID",
            "Organization ID",
            "Journal Number",
            "Date",
            "Reference Number",
            "Description",
            "Notes",
            "Total Debit",
            "Total Credit",
            "Status",
            "Contact ID",
            "Contact Name",
            "Created At",
            "Updated At",
            "Line Account ID",
            "Line Account Name",
            "Line Debit",
            "Line Credit",
            "Line Narration"
          ];
          dataToExport.forEach((j: any) => {
            const vendorIdVal = typeof j.vendorId === "string" ? j.vendorId : j.vendorId?._id || "";
            const vendorName = j.vendorId && typeof j.vendorId !== "string" ? j.vendorId.displayName || j.vendorId.companyName || "" : "";
            const maskedContact = includePii ? vendorName : (vendorName ? "[MASKED]" : "");
            const totalDebitFormatted = formatDecimal(Number(j.totalDebit || 0), decimalFormat);
            const totalCreditFormatted = formatDecimal(Number(j.totalCredit || 0), decimalFormat);
            const lines = j.lineItems || [];

            const baseRow = {
              "Journal ID": j._id || "",
              "Organization ID": j.organizationId || "",
              "Journal Number": j.journalNumber || "",
              "Date": j.date ? j.date.split("T")[0] : "",
              "Reference Number": j.referenceNumber || "",
              "Description": j.description || "",
              "Notes": j.notes || "",
              "Total Debit": totalDebitFormatted,
              "Total Credit": totalCreditFormatted,
              "Status": j.status || "",
              "Contact ID": vendorIdVal,
              "Contact Name": maskedContact,
              "Created At": j.createdAt || "",
              "Updated At": j.updatedAt || ""
            };

            if (lines.length === 0) {
              rows.push({
                ...baseRow,
                "Line Account ID": "",
                "Line Account Name": "",
                "Line Debit": "",
                "Line Credit": "",
                "Line Narration": ""
              });
            } else {
              lines.forEach((line: any) => {
                const accountIdVal = typeof line.accountId === "string" ? line.accountId : line.accountId?._id || "";
                const accountName = typeof line.accountId === "string" ? line.accountId : line.accountId?.name || "";
                const debitFormatted = line.debit ? formatDecimal(Number(line.debit), decimalFormat) : "";
                const creditFormatted = line.credit ? formatDecimal(Number(line.credit), decimalFormat) : "";
                rows.push({
                  ...baseRow,
                  "Line Account ID": accountIdVal,
                  "Line Account Name": accountName,
                  "Line Debit": debitFormatted,
                  "Line Credit": creditFormatted,
                  "Line Narration": line.narration || ""
                });
              });
            }
          });
        }
      } else {
        // Accounts
        const accountMap = new Map(dataToExport.map(a => [a._id, a]));
        if (template === "standard") {
          headers = [
            "Account ID",
            "Organization ID",
            "Account Name",
            "Account Code",
            "Account Type",
            "Root Type",
            "Parent Account Name",
            "Description",
            "Opening Balance",
            "Balance",
            "Status",
            "Created At",
            "Updated At"
          ];
          rows = dataToExport.map((a: any) => {
            const parentName = a.parentId ? accountMap.get(a.parentId)?.name || "" : "";
            const openingBalFormatted = formatDecimal(Number(a.openingBalance || 0), decimalFormat);
            const balanceFormatted = formatDecimal(Number(a.balance || 0), decimalFormat);
            return {
              "Account ID": a._id || "",
              "Organization ID": a.organizationId || "",
              "Account Name": a.name || "",
              "Account Code": a.code || "",
              "Account Type": a.accountType || "",
              "Root Type": a.rootType || "",
              "Parent Account Name": parentName,
              "Description": a.description || "",
              "Opening Balance": openingBalFormatted,
              "Balance": balanceFormatted,
              "Status": a.isActive ? "Active" : "Inactive",
              "Created At": a.createdAt || "",
              "Updated At": a.updatedAt || ""
            };
          });
        } else {
          // Detailed
          headers = [
            "Account ID",
            "Organization ID",
            "Account Name",
            "Account Code",
            "Account Type",
            "Root Type",
            "Parent Account ID",
            "Parent Account Name",
            "Is Group",
            "Currency",
            "Description",
            "Create Item As Fixed Asset",
            "Fixed Asset Type ID",
            "Is System Account",
            "Opening Balance",
            "Balance",
            "Bank Account Number",
            "Bank IFSC",
            "Status",
            "Created At",
            "Updated At"
          ];
          rows = dataToExport.map((a: any) => {
            const parentName = a.parentId ? accountMap.get(a.parentId)?.name || "" : "";
            const bankNum = a.accountNumber || "";
            const ifsc = a.ifsc || "";
            const maskedBankNum = includePii ? bankNum : (bankNum ? "[MASKED]" : "");
            const maskedIfsc = includePii ? ifsc : (ifsc ? "[MASKED]" : "");

            const openingBalFormatted = formatDecimal(Number(a.openingBalance || 0), decimalFormat);
            const balanceFormatted = formatDecimal(Number(a.balance || 0), decimalFormat);

            return {
              "Account ID": a._id || "",
              "Organization ID": a.organizationId || "",
              "Account Name": a.name || "",
              "Account Code": a.code || "",
              "Account Type": a.accountType || "",
              "Root Type": a.rootType || "",
              "Parent Account ID": a.parentId || "",
              "Parent Account Name": parentName,
              "Is Group": a.isGroup ? "Yes" : "No",
              "Currency": a.currency || "",
              "Description": a.description || "",
              "Create Item As Fixed Asset": a.createItemAsFixedAsset ? "Yes" : "No",
              "Fixed Asset Type ID": a.fixedAssetTypeId || "",
              "Is System Account": a.isSystemAccount ? "Yes" : "No",
              "Opening Balance": openingBalFormatted,
              "Balance": balanceFormatted,
              "Bank Account Number": maskedBankNum,
              "Bank IFSC": maskedIfsc,
              "Status": a.isActive ? "Active" : "Inactive",
              "Created At": a.createdAt || "",
              "Updated At": a.updatedAt || ""
            };
          });
        }
      }

      // 4. File generation and download
      if (fileFormat === "csv") {
        if (password) {
          toast.warning("CSV format does not support password protection natively. Generating unprotected CSV.");
        }
        const csvHeadersStr = headers.join(",");
        const csvRowsStr = rows.map(r => {
          return headers.map(h => {
            const val = String(r[h] ?? "").replace(/"/g, '""');
            return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
          }).join(",");
        }).join("\n");
        const csvContent = `${csvHeadersStr}\n${csvRowsStr}`;
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const filename = `${module}_export_${new Date().toISOString().split("T")[0]}.csv`;
        triggerDownload(blob, filename);
      } else {
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, module === "journals" ? "Journals" : "Accounts");

        if (password) {
          worksheet["!protect"] = {
            password: password,
            selectLockedCells: true,
            selectUnlockedCells: true
          };
        }

        const bookType = fileFormat === "xls" ? "biff8" : "xlsx";
        const wbout = XLSX.write(workbook, { bookType: bookType, type: "array" });
        const blob = new Blob([wbout], { type: "application/octet-stream" });
        const ext = fileFormat === "xls" ? "xls" : "xlsx";
        const filename = `${module}_export_${new Date().toISOString().split("T")[0]}.${ext}`;
        triggerDownload(blob, filename);
      }

      toast.success("Data exported successfully");
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to export data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-100 flex flex-col gap-5">
        <DialogHeader className="border-b pb-4 flex items-center justify-between">
          <DialogTitle className="text-xl font-bold text-slate-800">Export Items</DialogTitle>
        </DialogHeader>

        {/* Info Banner */}
        <div className="flex gap-3 bg-blue-50/70 border border-blue-100 p-4 rounded-lg text-sm text-slate-700 leading-relaxed shadow-inner">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <p>
            You can export your data from Zoho Accountant in <span className="font-semibold text-blue-900">CSV, XLS or XLSX</span> format.
          </p>
        </div>

        {/* Form controls */}
        <div className="flex flex-col gap-5 flex-1">
          {/* Module Select */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Module<span className="text-red-500 ml-0.5">*</span></Label>
            <Select value={module} onValueChange={(val: any) => setModule(val)}>
              <SelectTrigger className="w-full h-10 border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-slate-800">
                <SelectValue placeholder="Select Module" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 shadow-lg">
                <SelectItem value="journals">Journal Entries</SelectItem>
                <SelectItem value="accounts">Chart of Accounts</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Period Range Radio */}
          <div className="flex flex-col gap-3.5">
            <RadioGroup value={period} onValueChange={(val: any) => setPeriod(val)} className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="all-period" className="text-blue-600 border-slate-300 focus:ring-blue-500" />
                <Label htmlFor="all-period" className="text-sm font-medium text-slate-700 cursor-pointer">
                  All {module === "journals" ? "Journals" : "Accounts"}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="specific" id="specific-period" className="text-blue-600 border-slate-300 focus:ring-blue-500" />
                <Label htmlFor="specific-period" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Specific Period
                </Label>
              </div>
            </RadioGroup>

            {/* Conditional Date Pickers with nice animation container */}
            {period === "specific" && (
              <div className="grid grid-cols-2 gap-4 border border-slate-100 bg-slate-50/50 p-4 rounded-lg animate-in fade-in duration-200">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start-date" className="text-xs text-slate-500 font-semibold">Start Date</Label>
                  <Input
                    type="date"
                    id="start-date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9 border-slate-200 bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="end-date" className="text-xs text-slate-500 font-semibold">End Date</Label>
                  <Input
                    type="date"
                    id="end-date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9 border-slate-200 bg-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Export Template Select */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              Export Template
            </Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="w-full h-10 border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-slate-800">
                <SelectValue placeholder="Select Export Template" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 shadow-lg">
                <SelectItem value="standard">Standard Template</SelectItem>
                <SelectItem value="detailed">Detailed Template</SelectItem>
                <SelectItem value="blank">Import Blank Template</SelectItem>
                <SelectItem value="sample">Import Sample Template</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Decimal Format Select */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Decimal Format<span className="text-red-500 ml-0.5">*</span></Label>
            <Select value={decimalFormat} onValueChange={setDecimalFormat}>
              <SelectTrigger className="w-full h-10 border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-slate-800">
                <SelectValue placeholder="Select Decimal Format" />
              </SelectTrigger>
              <SelectContent className="bg-white border border-slate-200 shadow-lg">
                <SelectItem value="1234567.89">1234567.89</SelectItem>
                <SelectItem value="1,234,567.89">1,234,567.89</SelectItem>
                <SelectItem value="1.234.567,89">1.234.567,89</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File Format Radio */}
          <div className="flex flex-col gap-2.5">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Export File Format<span className="text-red-500 ml-0.5">*</span></Label>
            <RadioGroup value={fileFormat} onValueChange={(val: any) => setFileFormat(val)} className="flex flex-col gap-2 bg-slate-50/30 p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="csv" id="format-csv" className="text-blue-600 border-slate-300" />
                <Label htmlFor="format-csv" className="text-sm font-medium text-slate-700 cursor-pointer">
                  CSV (Comma Separated Value)
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="xls" id="format-xls" className="text-blue-600 border-slate-300" />
                <Label htmlFor="format-xls" className="text-sm font-medium text-slate-700 cursor-pointer">
                  XLS (Microsoft Excel 1997-2004 Compatible)
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="xlsx" id="format-xlsx" className="text-blue-600 border-slate-300" />
                <Label htmlFor="format-xlsx" className="text-sm font-medium text-slate-700 cursor-pointer">
                  XLSX (Microsoft Excel)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* PII Masking Checkbox */}
          <div className="flex items-start gap-3 bg-amber-50/30 border border-amber-100/50 p-3.5 rounded-lg">
            <Checkbox
              id="include-pii"
              checked={includePii}
              onCheckedChange={(val) => setIncludePii(!!val)}
              className="mt-0.5 text-blue-600 border-slate-300 focus:ring-blue-500"
            />
            <div className="grid gap-1">
              <Label htmlFor="include-pii" className="text-sm font-medium text-slate-700 cursor-pointer leading-none">
                Include Sensitive Personally Identifiable Information (PII) while exporting.
              </Label>
              <p className="text-xs text-slate-400">
                {module === "journals"
                  ? "(If unchecked, contact and vendor names will be masked as [MASKED])"
                  : "(If unchecked, bank account numbers and IFSC codes will be masked as [MASKED])"
                }
              </p>
            </div>
          </div>

          {/* Password Protection */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-password" className="text-xs font-semibold text-slate-600 uppercase tracking-wider">File Protection Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                id="export-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to lock sheet editing"
                className="h-10 pr-10 border-slate-200 focus:border-blue-500 text-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
            {showPasswordError ? (
              <p className="text-xs text-red-500 leading-normal animate-in slide-in-from-top-1 duration-150">
                Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
              </p>
            ) : (
              <p className="text-xs text-slate-400 leading-normal">
                Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character. (Applicable to Excel formats)
              </p>
            )}
          </div>

          {/* Note Footer Info */}
          <p className="text-xs text-slate-400 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="font-semibold text-slate-600">Note:</span> You can export only the first 25,000 rows. If you have more rows, please initiate a backup for the data in your Zoho Inventory organization, and download it.
          </p>
        </div>

        {/* Footer buttons */}
        <div className="border-t pt-4 flex items-center justify-end gap-3">
          <Button
            type="button"
            onClick={handleExport}
            disabled={loading || showPasswordError}
            className="px-5 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Export
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="px-5 border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
