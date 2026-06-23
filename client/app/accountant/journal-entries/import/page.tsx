"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Loader2, Check, HelpCircle, AlertCircle, FileSpreadsheet, Info, ChevronDown, ChevronRight, Eye } from "lucide-react";
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
import { journalApi } from "@/lib/api/journals";
import * as XLSX from "xlsx";

interface ParsedRow {
  [key: string]: string;
}

interface MappingState {
  journalNumber: string;
  date: string;
  referenceNumber: string;
  description: string;
  notes: string;
  status: string;
  vendorName: string;
  accountName: string;
  debit: string;
  credit: string;
  narration: string;
}

const CHARACTER_ENCODINGS = [
  { value: "UTF-8", label: "UTF-8 (Unicode)" },
  { value: "UTF-16", label: "UTF-16 (Unicode)" },
  { value: "ISO-8859-1", label: "ISO-8859-1" },
  { value: "ISO-8859-2", label: "ISO-8859-2" },
  { value: "ISO-8859-9", label: "ISO-8859-9 (Turkish)" },
  { value: "GB2312", label: "GB2312 (Simplified Chinese)" },
  { value: "Big5", label: "Big5 (Traditional Chinese)" },
  { value: "Shift_JIS", label: "Shift_JIS (Japanese)" },
];

const FIELD_GROUPS = [
  {
    title: "Journal Header Details",
    fields: [
      { key: "journalNumber", label: "Journal Number" },
      { key: "date", label: "Journal Date", required: true },
      { key: "referenceNumber", label: "Reference Number" },
      { key: "description", label: "Description/Narration" },
      { key: "notes", label: "Notes" },
      { key: "status", label: "Status" },
      { key: "vendorName", label: "Contact/Vendor Name" },
    ]
  },
  {
    title: "Journal Line Details",
    fields: [
      { key: "accountName", label: "Account Name", required: true },
      { key: "debit", label: "Debit", required: true },
      { key: "credit", label: "Credit", required: true },
      { key: "narration", label: "Line Narration" },
    ]
  }
];

const MAPPABLE_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);

export default function JournalImportPage() {
  const router = useRouter();

  // Steps: 1 = Configure, 2 = Map Fields, 3 = Preview
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "overwrite">("skip");
  const [characterEncoding, setCharacterEncoding] = useState("UTF-8");

  // Step 2 States (Headers & Mappings)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<ParsedRow[]>([]);
  const [saveMapping, setSaveMapping] = useState(true);
  const [fieldMapping, setFieldMapping] = useState<MappingState>({
    journalNumber: "",
    date: "",
    referenceNumber: "",
    description: "",
    notes: "",
    status: "",
    vendorName: "",
    accountName: "",
    debit: "",
    credit: "",
    narration: "",
  });

  // Step 3 States
  const [mappedItems, setMappedItems] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showReadyDetails, setShowReadyDetails] = useState(true);
  const [showSkippedDetails, setShowSkippedDetails] = useState(true);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(true);
  const [expandedJournals, setExpandedJournals] = useState<Record<string | number, boolean>>({});

  // File drag & drop handlers
  const [isDragActive, setIsDragActive] = useState(false);

  // Load saved mapping on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hai_journal_import_mapping");
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
      const blob = await journalApi.downloadSampleTemplate(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "sample_journals.xlsx" : "sample_journals.csv";
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
      const blob = await journalApi.downloadBlankTemplate(format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "blank_journals.xlsx" : "blank_journals.csv";
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
        journalNumber: "",
        date: "",
        referenceNumber: "",
        description: "",
        notes: "",
        status: "",
        vendorName: "",
        accountName: "",
        debit: "",
        credit: "",
        narration: "",
      };

      headers.forEach(h => {
        const normalized = h.toLowerCase().replace(/[\s_\-\/]/g, "");
        if (normalized === "journalnumber" || normalized === "journal" || normalized === "number") mapping.journalNumber = h;
        else if (normalized === "journaldate" || normalized === "date" || normalized === "jdate") mapping.date = h;
        else if (normalized === "referencenumber" || normalized === "reference" || normalized === "ref" || normalized === "refnumber") mapping.referenceNumber = h;
        else if (normalized === "description" || normalized === "desc" || normalized === "journaldescription" || normalized === "narration" || normalized === "linenarration") {
          // Fallback logic so we map narration if it is present
          if (normalized === "description" || normalized === "desc" || normalized === "journaldescription") {
            mapping.description = h;
          }
        }
        else if (normalized === "notes" || normalized === "note" || normalized === "journalnotes") mapping.notes = h;
        else if (normalized === "status" || normalized === "journalstatus") mapping.status = h;
        else if (normalized === "vendorname" || normalized === "contactname" || normalized === "vendor" || normalized === "contact" || normalized === "customername" || normalized === "customer") mapping.vendorName = h;
        else if (normalized === "accountname" || normalized === "account" || normalized === "accountcode" || normalized === "accountnumber") mapping.accountName = h;
        else if (normalized === "debit" || normalized === "debits" || normalized === "dr" || normalized === "debitamount") mapping.debit = h;
        else if (normalized === "credit" || normalized === "credits" || normalized === "cr" || normalized === "creditamount") mapping.credit = h;
        else if (normalized === "narration" || normalized === "linenarration" || normalized === "naration") mapping.narration = h;
      });

      // Secondary check: description maps narration if description column doesn't exist
      if (!mapping.description && mapping.narration) {
        mapping.description = mapping.narration;
      }

      setFieldMapping(mapping);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    }
  };

  const handleNextFromStep2 = async () => {
    if (!fieldMapping.date) {
      toast.error("Journal Date field must be mapped");
      return;
    }
    if (!fieldMapping.accountName) {
      toast.error("Account Name field must be mapped");
      return;
    }
    if (!fieldMapping.debit) {
      toast.error("Debit field must be mapped");
      return;
    }
    if (!fieldMapping.credit) {
      toast.error("Credit field must be mapped");
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

      const previewRes = await journalApi.previewImport(formData);
      if (previewRes?.data) {
        setMappedItems(previewRes.data.previewItems || []);
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

      setImportProgress(40);
      const importRes = await journalApi.executeImport(formData);
      setImportProgress(90);

      if (importRes?.data) {
        if (saveMapping) {
          try {
            localStorage.setItem("hai_journal_import_mapping", JSON.stringify(fieldMapping));
          } catch (err) {
            console.error("Failed to save mapping:", err);
          }
        }
        const { successCount, failCount, errors } = importRes.data;
        setImportProgress(100);

        if (failCount === 0) {
          toast.success(`Successfully imported ${successCount} journals!`);
          router.push("/accountant/journal-entries");
        } else {
          toast.warning(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
          if (errors && errors.length > 0) {
            console.error("Import errors:", errors);
            toast.error(`Row ${errors[0].row}: ${errors[0].error}`);
          }
          router.push("/accountant/journal-entries");
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

  const toggleExpand = (rowKey: string | number) => {
    setExpandedJournals(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey]
    }));
  };

  const formatDate = (dateStr: any) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const fmtCurrency = (n: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(n);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-800">
            {step === 1 ? "Journals - Select File" : step === 2 ? "Journals - Map Fields" : "Journals - Preview"}
          </h1>
        </div>
        <button
          onClick={() => router.push("/accountant/journal-entries")}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-full hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Stepper progress */}
      <div className="bg-white border-b px-6 py-3 flex justify-center">
        <div className="flex items-center gap-12 max-w-2xl w-full justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step >= 1 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {step > 1 ? <Check className="h-3.5 w-3.5" /> : "1"}
            </div>
            <span className={`text-sm font-medium ${step >= 1 ? "text-slate-900" : "text-slate-500"}`}>Configure</span>
          </div>
          <div className="h-px bg-slate-200 flex-1" />
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step >= 2 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              {step > 2 ? <Check className="h-3.5 w-3.5" /> : "2"}
            </div>
            <span className={`text-sm font-medium ${step >= 2 ? "text-slate-900" : "text-slate-500"}`}>Map Fields</span>
          </div>
          <div className="h-px bg-slate-200 flex-1" />
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${step === 3 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              3
            </div>
            <span className={`text-sm font-medium ${step === 3 ? "text-slate-900" : "text-slate-500"}`}>Preview</span>
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
              className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${
                isDragActive ? "border-blue-500 bg-blue-50/50" : "border-slate-300 bg-white hover:border-slate-400"
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv,.xls,.xlsx"
                onChange={handleFileChange}
              />
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-800">
                  {selectedFile ? selectedFile.name : "Drag and drop file to import"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Maximum File Size: 25 MB • File Format: CSV or Excel
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="bg-white border-slate-300 text-slate-700 hover:text-slate-900">
                Choose File
              </Button>
            </div>

            {/* Sample Link */}
            <p className="text-xs text-slate-500">
              Download a sample file ({" "}
              <button onClick={() => handleDownloadSample("csv")} className="text-blue-600 hover:underline font-semibold">
                CSV
              </button>{" "}
              •{" "}
              <button onClick={() => handleDownloadSample("excel")} className="text-blue-600 hover:underline font-semibold">
                Excel
              </button>{" "}
              ) or a blank template ({" "}
              <button onClick={() => handleDownloadBlank("csv")} className="text-blue-600 hover:underline font-semibold">
                CSV
              </button>{" "}
              •{" "}
              <button onClick={() => handleDownloadBlank("excel")} className="text-blue-600 hover:underline font-semibold">
                Excel
              </button>{" "}
              ) and compare it to your import file to ensure you have the file perfect for the import.
            </p>

            {/* Form Fields */}
            <Card className="p-6 bg-white space-y-6">
              {/* Duplicate handling */}
              <div className="space-y-3">
                <div className="flex items-center gap-1">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Duplicate Handling <span className="text-red-500">*</span>
                  </Label>
                  <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                </div>
                <RadioGroup
                  value={duplicateHandling}
                  onValueChange={(val: any) => setDuplicateHandling(val)}
                  className="space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="skip" id="skip" className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor="skip" className="text-sm font-medium text-slate-800">
                        Skip Duplicates
                      </Label>
                      <p className="text-xs text-slate-500">
                        Retains the journals in HAI Accounting and does not import the duplicates in the import file.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="overwrite" id="overwrite" className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor="overwrite" className="text-sm font-medium text-slate-800">
                        Overwrite Journals
                      </Label>
                      <p className="text-xs text-slate-500">
                        Imports the duplicates in the import file, voids/reverses previous postings, and overwrites with the new journal entries.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Character encoding */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Character Encoding
                  </Label>
                  <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                </div>
                <Select value={characterEncoding} onValueChange={setCharacterEncoding}>
                  <SelectTrigger className="w-full md:w-[320px] bg-white border-slate-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {CHARACTER_ENCODINGS.map((encoding) => (
                      <SelectItem key={encoding.value} value={encoding.value}>
                        {encoding.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Page Tips */}
            <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Page Tips</span>
              </div>
              <ul className="text-xs text-slate-600 list-disc pl-5 space-y-1.5">
                <li>Import data with the details of manual journals by referring to our standard sample format.</li>
                <li>Multiple rows with the same Journal Number or Reference Number will be grouped into a single multi-line journal entry.</li>
                <li>Journals must consist of at least 2 lines and the sum of Debits must equal the sum of Credits.</li>
                <li>Ensure all decimal fields do not contain any currency symbols.</li>
              </ul>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleNextFromStep1} className="bg-blue-600 hover:bg-blue-700 text-white">
                Next
              </Button>
              <Button variant="outline" onClick={() => router.push("/accountant/journal-entries")} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Card className="p-6 bg-white space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Info className="h-4 w-4 text-blue-500" />
                <span>Map the columns in your CSV/Excel file to the corresponding fields in HAI Accounting.</span>
              </div>

              <div className="border rounded-md overflow-hidden max-h-[500px] overflow-y-auto bg-white">
                <Table>
                  <TableBody>
                    {FIELD_GROUPS.map((group) => (
                      <React.Fragment key={group.title}>
                        {/* Section Title Row */}
                        <TableRow className="bg-white hover:bg-white border-none">
                          <TableCell colSpan={2} className="pt-6 pb-2 pl-4">
                            <h3 className="text-sm font-bold text-slate-800 tracking-tight">{group.title}</h3>
                          </TableCell>
                        </TableRow>
                        {/* Section Sub-Header Row */}
                        <TableRow className="bg-slate-50 hover:bg-slate-50 border-y border-slate-200">
                          <TableCell className="py-2.5 pl-4 text-[10px] font-bold text-slate-400 tracking-wider uppercase w-1/2">
                            HAI Accounting Field
                          </TableCell>
                          <TableCell className="py-2.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase w-1/2">
                            Imported File Headers
                          </TableCell>
                        </TableRow>
                        {/* Fields Rows */}
                        {group.fields.map((field) => (
                          <TableRow key={field.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <TableCell className="py-3 pl-4 w-1/2">
                              <Label className="text-sm font-medium text-slate-700">
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </Label>
                            </TableCell>
                            <TableCell className="py-3 w-1/2">
                              <div className="relative w-full md:w-[320px] flex items-center">
                                <Select
                                  value={fieldMapping[field.key as keyof MappingState] || "none"}
                                  onValueChange={(val) =>
                                    setFieldMapping((prev) => ({ ...prev, [field.key]: val === "none" ? "" : val }))
                                  }
                                >
                                  <SelectTrigger className="w-full bg-white border-slate-300 text-slate-700 hover:border-slate-400 transition-colors [&_[data-slot=select-value]]:pr-10">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white max-h-[200px] overflow-y-auto">
                                    <SelectItem value="none">- None -</SelectItem>
                                    {csvHeaders.map((h) => (
                                      <SelectItem key={h} value={h}>
                                        {h}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {fieldMapping[field.key as keyof MappingState] && (
                                  <button
                                    type="button"
                                    onClick={() => setFieldMapping((prev) => ({ ...prev, [field.key]: "" }))}
                                    className="absolute right-9 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="saveMappingCheckbox"
                checked={saveMapping}
                onChange={(e) => setSaveMapping(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <Label htmlFor="saveMappingCheckbox" className="text-sm text-slate-600 font-medium cursor-pointer">
                Save these selections for use during future imports.
              </Label>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleNextFromStep2} className="bg-blue-600 hover:bg-blue-700 text-white">
                Next
              </Button>
              <Button variant="outline" onClick={() => setStep(1)} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                Back
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (() => {
          const readyItems = mappedItems.filter(item => item.statusFlag === "Ready" || item.statusFlag === "Overwrite");
          const skippedItems = mappedItems.filter(item => item.statusFlag === "Skip" || item.statusFlag === "Error" || !item.isValid);

          const mappedHeaders = Object.values(fieldMapping).filter(Boolean);
          const unmappedHeaders = csvHeaders.filter(header => !mappedHeaders.includes(header));

          const downloadSkippedRowsCSV = () => {
            if (skippedItems.length === 0) return;
            const headers = ["Row Number", "Journal Number", "Reference Number", "Description", "Error/Skip Reason"];
            const csvRows = skippedItems.map((item, idx) => [
              item.rowNumber || (idx + 2),
              item.journalNumber || "",
              item.referenceNumber || "",
              item.description || "",
              item.statusFlag === "Skip" ? "Row already exists (Skipped)" : (item.error || "Validation error")
            ]);
            const csvContent = [
              headers.join(","),
              ...csvRows.map(row => row.map(val => `"${val}"`).join(","))
            ].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "skipped_journals.csv");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Skipped journals (CSV) downloaded successfully");
          };

          const downloadSkippedRowsExcel = () => {
            if (skippedItems.length === 0) return;
            const headers = ["Row Number", "Journal Number", "Reference Number", "Description", "Error/Skip Reason"];
            const dataRows = skippedItems.map((item, idx) => [
              item.rowNumber || (idx + 2),
              item.journalNumber || "",
              item.referenceNumber || "",
              item.description || "",
              item.statusFlag === "Skip" ? "Row already exists (Skipped)" : (item.error || "Validation error")
            ]);
            
            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Skipped Journals");
            
            const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "skipped_journals.xlsx");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Skipped journals (Excel) downloaded successfully");
          };

          return (
            <div className="space-y-6">
              {/* Alert banner */}
              {readyItems.length === 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-800 text-sm">
                  <AlertCircle className="h-5 w-5 mt-0.5 text-red-600 flex-shrink-0" />
                  <span className="font-semibold">None of the journals can be imported</span>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3 text-green-800 text-sm">
                  <Check className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
                  <span className="font-semibold">
                    {readyItems.length} of the {mappedItems.length} journals are ready to be imported.
                  </span>
                </div>
              )}

              <Card className="p-6 bg-white space-y-6 divide-y divide-slate-100">
                {/* 1. Ready Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>Journals that are ready to be imported</span>
                      <span className="text-xs text-slate-400">({readyItems.length})</span>
                    </div>
                    {readyItems.length > 0 && (
                      <button
                        onClick={() => setShowReadyDetails(!showReadyDetails)}
                        className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                      >
                        {showReadyDetails ? "Hide Details" : "View Details"}
                      </button>
                    )}
                  </div>

                  {showReadyDetails && readyItems.length > 0 && (
                    <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-12 text-center text-xs font-semibold py-2"></TableHead>
                            <TableHead className="text-xs font-semibold py-2">Date</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Journal Number</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Reference</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Description</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Debit/Credit</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-center">Lines</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyItems.map((item, idx) => {
                            const isExpanded = !!expandedJournals[item.rowNumber ?? idx];
                            return (
                              <React.Fragment key={idx}>
                                <TableRow className="hover:bg-slate-50/50">
                                  <TableCell className="text-center py-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(item.rowNumber ?? idx)}
                                      className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                                    >
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                  </TableCell>
                                  <TableCell className="text-xs py-2 font-medium">{formatDate(item.date)}</TableCell>
                                  <TableCell className="text-xs py-2 text-primary font-medium">{item.journalNumber || "Auto-allocated"}</TableCell>
                                  <TableCell className="text-xs py-2 text-slate-500">{item.referenceNumber || "—"}</TableCell>
                                  <TableCell className="text-xs py-2 text-slate-500 max-w-[200px] truncate">{item.description || "—"}</TableCell>
                                  <TableCell className="text-xs py-2 text-right font-semibold tabular-nums text-slate-800">{fmtCurrency(item.totalDebit)}</TableCell>
                                  <TableCell className="text-xs py-2 text-center text-slate-500 font-medium">{item.lineItems?.length || 0}</TableCell>
                                  <TableCell className="text-xs py-2 text-center font-medium">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                      item.statusFlag === "Overwrite" ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-green-50 border-green-200 text-green-600"
                                    }`}>
                                      {item.statusFlag}
                                    </span>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <TableRow className="bg-slate-50/40">
                                    <TableCell colSpan={8} className="p-4 border-t border-b">
                                      <div className="bg-white rounded-lg border shadow-sm p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                          <Eye className="h-4 w-4 text-slate-400" />
                                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Journal Double-Entry Lines</h4>
                                        </div>
                                        <Table>
                                          <TableHeader className="bg-slate-50">
                                            <TableRow>
                                              <TableHead className="text-[10px] font-bold py-2 w-1/3">Account</TableHead>
                                              <TableHead className="text-[10px] font-bold py-2">Narration</TableHead>
                                              <TableHead className="text-[10px] font-bold py-2 text-right w-28">Debit</TableHead>
                                              <TableHead className="text-[10px] font-bold py-2 text-right w-28">Credit</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {item.lineItems?.map((line: any, lIdx: number) => (
                                              <TableRow key={lIdx} className="hover:bg-slate-50/30">
                                                <TableCell className="text-xs py-2.5 font-semibold text-slate-800">{line.accountName}</TableCell>
                                                <TableCell className="text-xs py-2.5 text-slate-500 italic">{line.narration || "—"}</TableCell>
                                                <TableCell className="text-xs py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{line.debit > 0 ? fmtCurrency(line.debit) : "—"}</TableCell>
                                                <TableCell className="text-xs py-2.5 text-right tabular-nums text-amber-600 font-semibold">{line.credit > 0 ? fmtCurrency(line.credit) : "—"}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
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
                        <span className="text-xs text-slate-500 font-medium">
                          Download skipped journals ({" "}
                          <button
                            onClick={downloadSkippedRowsCSV}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            CSV
                          </button>
                          {" "}•{" "}
                          <button
                            onClick={downloadSkippedRowsExcel}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            Excel
                          </button>
                          {" "})
                        </span>
                      )}
                      {skippedItems.length > 0 && (
                        <button
                          onClick={() => setShowSkippedDetails(!showSkippedDetails)}
                          className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
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
                            <TableHead className="text-xs font-semibold py-2">Journal Number</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Description</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {skippedItems.map((item, idx) => (
                            <TableRow key={idx} className="bg-amber-50/20">
                              <TableCell className="text-xs py-2 font-medium text-slate-400">{item.rowNumber || (idx + 2)}</TableCell>
                              <TableCell className="text-xs py-2 font-medium text-slate-800">{item.journalNumber || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.description || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-amber-600 font-medium">
                                {item.statusFlag === "Skip" ? "Row already exists (Skipped)" : (item.error || "Validation error")}
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
                        className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                      >
                        {showUnmappedDetails ? "Hide Details" : "View Details"}
                      </button>
                    )}
                  </div>

                  {showUnmappedDetails && unmappedHeaders.length > 0 && (
                    <div className="space-y-3 pl-2 mt-2">
                      <p className="text-xs text-slate-500">
                        The following fields in your import file have not been mapped to any Manual Journal field. The data in these fields will be ignored during the import.
                      </p>
                      <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                        {unmappedHeaders.map((header) => (
                          <li key={header} className="font-medium">{header}</li>
                        ))}
                      </ul>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 mt-4">
                        Click the Previous button if you want to match the above column header(s) or click the Import button to continue with the import.
                      </div>
                    </div>
                  )}
                </div>

                {isImporting && (
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Importing journals...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                    </div>
                  </div>
                )}
              </Card>

              {/* Bottom Actions */}
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || readyItems.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>Import Journals ({readyItems.length})</span>
                </Button>
                <Button variant="outline" onClick={() => setStep(2)} disabled={isImporting} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
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
