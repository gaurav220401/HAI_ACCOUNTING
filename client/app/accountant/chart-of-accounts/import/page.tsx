"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Loader2, Check, HelpCircle, AlertCircle, FileSpreadsheet, Info, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountApi } from "@/lib/api/accounts";
import * as XLSX from "xlsx";

interface ParsedRow {
  [key: string]: string;
}

interface MappingState {
  name: string;
  code: string;
  accountType: string;
  parentAccount: string;
  description: string;
  openingBalance: string;
  accountNumber: string;
  ifsc: string;
  currency: string;
  createItemAsFixedAsset: string;
  fixedAssetType: string;
}

const FIELD_GROUPS = [
  {
    title: "Account Details",
    fields: [
      { key: "name", label: "Account Name", required: true },
      { key: "code", label: "Account Code" },
      { key: "accountType", label: "Account Type", required: true },
      { key: "parentAccount", label: "Parent Account Name" },
      { key: "description", label: "Description" },
    ]
  },
  {
    title: "Financial & Bank Settings",
    fields: [
      { key: "openingBalance", label: "Opening Balance" },
      { key: "accountNumber", label: "Bank Account Number" },
      { key: "ifsc", label: "Bank IFSC" },
      { key: "currency", label: "Bank Currency" },
    ]
  },
  {
    title: "Fixed Asset Integration",
    fields: [
      { key: "createItemAsFixedAsset", label: "Create Item As Fixed Asset" },
      { key: "fixedAssetType", label: "Fixed Asset Type" },
    ]
  }
];

const MAPPABLE_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);

export default function ChartOfAccountsImportPage() {
  const router = useRouter();

  // Steps: 1 = Configure, 2 = Map Fields, 3 = Preview
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "overwrite">("skip");

  // Step 2 States (Headers & Mappings)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [saveMapping, setSaveMapping] = useState(true);
  const [fieldMapping, setFieldMapping] = useState<MappingState>({
    name: "",
    code: "",
    accountType: "",
    parentAccount: "",
    description: "",
    openingBalance: "",
    accountNumber: "",
    ifsc: "",
    currency: "",
    createItemAsFixedAsset: "",
    fixedAssetType: "",
  });

  // Step 3 States
  const [mappedItems, setMappedItems] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showReadyDetails, setShowReadyDetails] = useState(true);
  const [showSkippedDetails, setShowSkippedDetails] = useState(true);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(true);
  const [overriddenRows, setOverriddenRows] = useState<number[]>([]);

  const handleOverrideRow = (rowNum: number) => {
    setOverriddenRows(prev => [...prev, rowNum]);
    setMappedItems(prevItems => 
      prevItems.map(item => 
        item.rowNumber === rowNum 
          ? { ...item, status: "Overwrite" } 
          : item
      )
    );
  };

  const handleUndoOverrideRow = (rowNum: number) => {
    setOverriddenRows(prev => prev.filter(r => r !== rowNum));
    setMappedItems(prevItems => 
      prevItems.map(item => 
        item.rowNumber === rowNum 
          ? { ...item, status: "Skip" } 
          : item
      )
    );
  };

  // File drag & drop handlers
  const [isDragActive, setIsDragActive] = useState(false);

  // Load saved mapping on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hai_account_import_mapping");
      if (saved) {
        setFieldMapping(JSON.parse(saved));
      }
    } catch (err) {
      console.error("Failed to load saved mapping:", err);
    }
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "csv" || ext === "xls" || ext === "xlsx") {
        setSelectedFile(file);
      } else {
        toast.error("Please drop a valid CSV or Excel file");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDownloadSample = async (format: "csv" | "excel") => {
    try {
      const blob = await accountApi.downloadSampleTemplate(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "sample_chart_of_accounts.xlsx" : "sample_chart_of_accounts.csv";
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Sample template (${format.toUpperCase()}) downloaded successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download sample file");
    }
  };

  const handleDownloadBlank = async (format: "csv" | "excel") => {
    try {
      const blob = await accountApi.downloadBlankTemplate(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "blank_chart_of_accounts.xlsx" : "blank_chart_of_accounts.csv";
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Blank template (${format.toUpperCase()}) downloaded successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to download blank template");
    }
  };

  const parseFile = async (file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = event.target?.result;
          if (!data) {
            reject(new Error("Empty file"));
            return;
          }
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          if (!worksheet) {
            reject(new Error("Could not read sheet"));
            return;
          }

          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });
          const sheetHeaders = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })[0] || [];
          const cleanHeaders = sheetHeaders.map(h => String(h || "").trim()).filter(Boolean);

          const parsedRows: ParsedRow[] = rows.map((row) => {
            const parsedRow: ParsedRow = {};
            cleanHeaders.forEach((header) => {
              parsedRow[header] = String(row[header] ?? "").trim();
            });
            return parsedRow;
          });

          resolve({ headers: cleanHeaders, rows: parsedRows });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Error reading file"));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleNextFromStep1 = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to import");
      return;
    }

    try {
      const { headers, rows } = await parseFile(selectedFile);
      setCsvHeaders(headers);
      setCsvRows(rows);

      const mapping: MappingState = {
        name: "",
        code: "",
        accountType: "",
        parentAccount: "",
        description: "",
        openingBalance: "",
        accountNumber: "",
        ifsc: "",
        currency: "",
        createItemAsFixedAsset: "",
        fixedAssetType: "",
      };

      headers.forEach(h => {
        const normalized = h.toLowerCase().replace(/[\s_\-\/]/g, "");
        if (normalized === "accountname" || normalized === "name") mapping.name = h;
        else if (normalized === "accountcode" || normalized === "code") mapping.code = h;
        else if (normalized === "accounttype" || normalized === "type") mapping.accountType = h;
        else if (normalized === "parentaccount" || normalized === "parentaccountname" || normalized === "parent") mapping.parentAccount = h;
        else if (normalized === "description" || normalized === "notes") mapping.description = h;
        else if (normalized === "openingbalance" || normalized === "balance") mapping.openingBalance = h;
        else if (normalized === "bankaccountnumber" || normalized === "accountnumber") mapping.accountNumber = h;
        else if (normalized === "bankifsc" || normalized === "ifsc") mapping.ifsc = h;
        else if (normalized === "bankcurrency" || normalized === "currency") mapping.currency = h;
        else if (normalized === "createitemasfixedasset" || normalized === "createfixedasset") mapping.createItemAsFixedAsset = h;
        else if (normalized === "fixedassettype" || normalized === "assettype") mapping.fixedAssetType = h;
      });

      setFieldMapping(mapping);
      setOverriddenRows([]);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    }
  };

  const handleNextFromStep2 = async () => {
    if (!fieldMapping.name) {
      toast.error("Account Name field must be mapped");
      return;
    }
    if (!fieldMapping.accountType) {
      toast.error("Account Type field must be mapped");
      return;
    }
    if (!selectedFile) {
      toast.error("No file selected");
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mapping", JSON.stringify(fieldMapping));
      formData.append("duplicateHandling", duplicateHandling);

      const previewRes = await accountApi.previewImport(formData);
      if (previewRes?.data) {
        setMappedItems(previewRes.data.previewItems || []);
        setOverriddenRows([]);
        setStep(3);
      } else {
        toast.error("Failed to generate preview from server");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to generate preview");
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) {
      toast.error("No file selected");
      return;
    }

    setIsImporting(true);
    setImportProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("mapping", JSON.stringify(fieldMapping));
      formData.append("duplicateHandling", duplicateHandling);
      formData.append("overrides", JSON.stringify(overriddenRows));

      setImportProgress(40);
      const importRes = await accountApi.executeImport(formData);
      setImportProgress(90);

      if (importRes?.data) {
        if (saveMapping) {
          try {
            localStorage.setItem("hai_account_import_mapping", JSON.stringify(fieldMapping));
          } catch (err) {
            console.error("Failed to save mapping:", err);
          }
        }
        const { successCount, failCount, errors } = importRes.data;
        setImportProgress(100);

        if (failCount === 0) {
          toast.success(`Successfully imported ${successCount} accounts!`);
          router.push("/accountant/chart-of-accounts");
        } else {
          toast.warning(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
          if (errors && errors.length > 0) {
            console.error("Import errors:", errors);
            toast.error(`Row ${errors[0].row}: ${errors[0].error}`);
          }
          router.push("/accountant/chart-of-accounts");
        }
      } else {
        toast.error("Failed to execute import");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const fmtCurrency = (n: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(n);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-teal-600" />
          <h1 className="text-lg font-semibold text-slate-800">
            {step === 1 ? "Chart of Accounts - Select File" : step === 2 ? "Chart of Accounts - Map Fields" : "Chart of Accounts - Preview"}
          </h1>
        </div>
        <button
          onClick={() => router.push("/accountant/chart-of-accounts")}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-full hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Stepper progress */}
      <div className="bg-white border-b px-6 py-3 flex justify-center">
        <div className="flex items-center gap-12 max-w-2xl w-full justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step >= 1 ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {step > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
            </div>
            <span className={`text-sm font-semibold ${step >= 1 ? "text-slate-900" : "text-slate-500"}`}>Configure</span>
          </div>
          <div className="h-px bg-slate-200 flex-1" />
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step >= 2 ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {step > 2 ? <Check className="h-3.5 w-3.5" /> : "2"}
            </div>
            <span className={`text-sm font-semibold ${step >= 2 ? "text-slate-900" : "text-slate-500"}`}>Map Fields</span>
          </div>
          <div className="h-px bg-slate-200 flex-1" />
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step === 3 ? "bg-teal-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              3
            </div>
            <span className={`text-sm font-semibold ${step === 3 ? "text-slate-900" : "text-slate-500"}`}>Preview</span>
          </div>
        </div>
      </div>

      {/* Page Content area */}
      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        {step === 1 && (
          <div className="space-y-6">
            {/* Drag and Drop Container */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all bg-white ${
                isDragActive ? "border-teal-500 bg-teal-50/50" : "border-slate-200 bg-white hover:border-slate-350"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.xls,.xlsx"
                onChange={handleFileChange}
              />
              <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">
                  {selectedFile ? selectedFile.name : "Drag and drop file to import"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Maximum File Size: 25 MB • File Format: CSV or Excel
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md">
                Choose File
              </Button>
            </div>

            {/* Templates download links */}
            <p className="text-xs text-slate-500">
              Download a sample file ({" "}
              <button onClick={() => handleDownloadSample("csv")} className="text-teal-700 hover:text-teal-800 hover:underline font-semibold">
                CSV
              </button>{" "}
              •{" "}
              <button onClick={() => handleDownloadSample("excel")} className="text-teal-700 hover:text-teal-800 hover:underline font-semibold">
                Excel
              </button>{" "}
              ) or a blank template ({" "}
              <button onClick={() => handleDownloadBlank("csv")} className="text-teal-700 hover:text-teal-800 hover:underline font-semibold">
                CSV
              </button>{" "}
              •{" "}
              <button onClick={() => handleDownloadBlank("excel")} className="text-teal-700 hover:text-teal-800 hover:underline font-semibold">
                Excel
              </button>{" "}
              ) to verify columns format.
            </p>

            {/* Options Panel */}
            <Card className="p-6 bg-white space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-800">Duplicate Handling</h3>
                <RadioGroup
                  value={duplicateHandling}
                  onValueChange={(val) => setDuplicateHandling(val as "skip" | "overwrite")}
                  className="space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="skip" id="dup-skip" className="mt-1" />
                    <Label htmlFor="dup-skip" className="flex flex-col cursor-pointer">
                      <span className="text-sm font-medium text-slate-800">Skip duplicate rows</span>
                      <span className="text-xs text-slate-500 mt-0.5">
                        Retain existing accounts in the database and ignore duplicates found in the spreadsheet.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="overwrite" id="dup-overwrite" className="mt-1" />
                    <Label htmlFor="dup-overwrite" className="flex flex-col cursor-pointer">
                      <span className="text-sm font-medium text-slate-800">Overwrite duplicate rows</span>
                      <span className="text-xs text-slate-500 mt-0.5">
                        Replace existing account settings in the database with spreadsheet data.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </Card>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleNextFromStep1} disabled={!selectedFile} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm">
                Next
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/accountant/chart-of-accounts")}
                className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Card className="p-6 bg-white">
              <div className="space-y-2 mb-6">
                <h2 className="text-sm font-semibold text-slate-800">Field Mapping Settings</h2>
                <p className="text-xs text-slate-500">
                  Map headers from your file to equivalent fields in HAI Accounting. Required fields must be mapped.
                </p>
              </div>

              {/* Mapping Tables grouped by section */}
              <div className="space-y-8">
                {FIELD_GROUPS.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800 border-b pb-1.5">{group.title}</h3>
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-1/2 text-xs font-semibold text-slate-700">HAI ACCOUNTING FIELD</TableHead>
                          <TableHead className="w-1/2 text-xs font-semibold text-slate-700">IMPORTED FILE HEADERS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.fields.map((field) => {
                          const currentVal = fieldMapping[field.key as keyof MappingState] || "";
                          return (
                            <TableRow key={field.key} className="hover:bg-slate-50/50">
                              <TableCell className="py-3.5">
                                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                                  {field.label}
                                  {field.required && <span className="text-red-500">*</span>}
                                </span>
                              </TableCell>
                              <TableCell className="py-2.5">
                                <div className="relative flex items-center w-full max-w-sm">
                                  <Select
                                    value={currentVal}
                                    onValueChange={(val) => {
                                      setFieldMapping((prev) => ({
                                        ...prev,
                                        [field.key]: val,
                                      }));
                                    }}
                                  >
                                    <SelectTrigger className="h-9 pr-10 [&_[data-slot=select-value]]:pr-10 text-xs w-full text-left bg-white border-slate-300">
                                      <SelectValue placeholder="-- Select Header --" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white">
                                      {csvHeaders.map((header) => (
                                        <SelectItem key={header} value={header} className="text-xs">
                                          {header}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {currentVal && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFieldMapping((prev) => ({
                                          ...prev,
                                          [field.key]: "",
                                        }));
                                      }}
                                      className="absolute right-9 p-1 rounded hover:bg-slate-100 text-red-500 hover:text-red-700 transition-colors"
                                      title="Clear mapping"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>

              {/* Mapping save toggle */}
              <div className="mt-8 pt-4 border-t flex items-center gap-2">
                <input
                  type="checkbox"
                  id="save-mapping"
                  checked={saveMapping}
                  onChange={(e) => setSaveMapping(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <Label htmlFor="save-mapping" className="text-xs text-slate-600 cursor-pointer">
                  Save these selections for use during future imports
                </Label>
              </div>
            </Card>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button
                onClick={handleNextFromStep2}
                disabled={isImporting}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5"
              >
                {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                Next
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isImporting}
                className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (() => {
          const readyItems = mappedItems.filter(item => item.status === "Ready" || item.status === "Overwrite");
          const skippedItems = mappedItems.filter(item => item.status === "Skip" || item.status === "Error" || !item.isValid);

          const mappedHeaders = Object.values(fieldMapping).filter(Boolean);
          const unmappedHeaders = csvHeaders.filter(header => !mappedHeaders.includes(header));

          const downloadSkippedRows = () => {
            if (skippedItems.length === 0) return;
            const headers = ["Row Number", "Account Name", "Account Code", "Account Type", "Error/Skip Reason"];
            const csvRows = skippedItems.map((item, idx) => [
              item.rowNumber || (idx + 2),
              item.name || "",
              item.code || "",
              item.accountType || "",
              item.status === "Skip" ? "Row already exists" : (item.error || "Validation error")
            ]);
            const csvContent = [
              headers.join(","),
              ...csvRows.map(row => row.map(val => `"${val}"`).join(","))
            ].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "skipped_accounts.csv");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Skipped accounts downloaded successfully");
          };

          return (
            <div className="space-y-6">
              {/* Alert banner */}
              {readyItems.length === 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-800 text-sm">
                  <AlertCircle className="h-5 w-5 mt-0.5 text-red-600 flex-shrink-0" />
                  <span className="font-semibold">None of the rows can be imported</span>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3 text-emerald-800 text-sm">
                  <Check className="h-5 w-5 mt-0.5 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold">
                    {readyItems.length} of the {mappedItems.length} rows are ready to be imported.
                  </span>
                </div>
              )}

              <Card className="p-6 bg-white space-y-6 divide-y divide-slate-100">
                {/* 1. Ready Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>Accounts that are ready to be imported</span>
                      <span className="text-xs text-slate-400">({readyItems.length})</span>
                    </div>
                    {readyItems.length > 0 && (
                      <button
                        onClick={() => setShowReadyDetails(!showReadyDetails)}
                        className="text-xs text-teal-700 font-semibold hover:text-teal-805 hover:underline flex items-center gap-1"
                      >
                        {showReadyDetails ? "Hide Details" : "View Details"}
                      </button>
                    )}
                  </div>

                  {showReadyDetails && readyItems.length > 0 && (
                    <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="text-xs font-semibold py-2">Account Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Code</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Type</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Opening Balance</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Status</TableHead>
                            <TableHead className="text-xs font-semibold py-2 w-24">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyItems.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs py-2 font-medium">{item.name}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.code || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500 uppercase text-[10px] tracking-tight">{item.accountType}</TableCell>
                              <TableCell className="text-xs py-2 text-right tabular-nums">{fmtCurrency(item.openingBalance || 0)}</TableCell>
                              <TableCell className="text-xs py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  item.status === "Ready" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-teal-50 text-teal-700 border border-teal-100"
                                }`}>
                                  {item.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs py-2">
                                {overriddenRows.includes(item.rowNumber) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUndoOverrideRow(item.rowNumber)}
                                    className="h-7 px-2 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-md"
                                  >
                                    Undo
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* 2. Skipped Section */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span>No. of Records skipped - {skippedItems.length}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {skippedItems.length > 0 && (
                        <button
                          onClick={downloadSkippedRows}
                          className="text-xs text-teal-700 font-semibold hover:text-teal-800 hover:underline flex items-center gap-1"
                        >
                          Download skipped rows
                        </button>
                      )}
                      {skippedItems.length > 0 && (
                        <button
                          onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                          className="text-xs text-teal-700 font-semibold hover:text-teal-805 hover:underline flex items-center gap-1"
                        >
                          {showSkippedDetails ? "Hide Details" : "View Details"}
                        </button>
                      )}
                    </div>
                  </div>

                  {showSkippedDetails && skippedItems.length > 0 && (
                    <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto mt-2">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="text-xs font-semibold py-2 w-16">Row</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Account Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Reason</TableHead>
                            <TableHead className="text-xs font-semibold py-2 w-24">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {skippedItems.map((item, idx) => (
                            <TableRow key={idx} className="bg-amber-50/20">
                              <TableCell className="text-xs py-2 font-medium text-slate-400">{item.rowNumber || (idx + 2)}</TableCell>
                              <TableCell className="text-xs py-2 font-medium text-slate-800">{item.name || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-amber-600 font-medium">
                                {item.status === "Skip" ? "Row already exists" : (item.error || "Validation error")}
                              </TableCell>
                              <TableCell className="text-xs py-2">
                                {item.status === "Skip" && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOverrideRow(item.rowNumber)}
                                    className="h-7 px-2 text-[10px] bg-white border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-805 rounded-md font-semibold"
                                  >
                                    Overwrite
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* 3. Unmapped Section */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span>Unmapped Fields - {unmappedHeaders.length}</span>
                    </div>
                    {unmappedHeaders.length > 0 && (
                      <button
                        onClick={() => setShowUnmappedDetails(!showUnmappedDetails)}
                        className="text-xs text-teal-700 font-semibold hover:text-teal-805 hover:underline flex items-center gap-1"
                      >
                        {showUnmappedDetails ? "Hide Details" : "View Details"}
                      </button>
                    )}
                  </div>

                  {showUnmappedDetails && unmappedHeaders.length > 0 && (
                    <div className="space-y-3 pl-2 mt-2">
                      <p className="text-xs text-slate-500">
                        The following fields in your import file have not been mapped to any database fields. The data in these fields will be ignored during the import.
                      </p>
                      <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                        {unmappedHeaders.map((header) => (
                          <li key={header} className="font-medium">{header}</li>
                        ))}
                      </ul>
                      
                      <div className="bg-teal-50/50 border border-teal-100 rounded-md p-3 text-xs text-teal-800 mt-4">
                        Click the Previous button if you want to match the above column header(s) or click the Import button to continue with the import.
                      </div>
                    </div>
                  )}
                </div>

                {isImporting && (
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Importing accounts...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-teal-600 h-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                    </div>
                  </div>
                )}
              </Card>

              {/* Bottom Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || readyItems.length === 0}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5"
                >
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Import Accounts ({readyItems.length})</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  disabled={isImporting}
                  className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                >
                  Back
                </Button>
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
}
