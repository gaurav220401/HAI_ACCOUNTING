"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  FileUp,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  ArrowRight,
  RefreshCw,
  Edit3,
  Eye,
  Check,
  X,
  Loader2,
  FileCode,
  CheckSquare,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Download,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ocrApi } from "@/lib/api/ocr";
import { contactApi } from "@/lib/api/contacts";
import { invoiceApi } from "@/lib/api/invoices";
import { billApi } from "@/lib/api/bills";
import { expenseApi } from "@/lib/api/expenses";
import { journalApi } from "@/lib/api/journals";
import { salesOrderApi } from "@/lib/api/sales-orders";
import { itemApi } from "@/lib/api/items";
import { accountApi } from "@/lib/api/accounts";
import { quoteApi } from "@/lib/api/quotes";
import { purchaseOrderApi } from "@/lib/api/purchase-orders";
import { vendorCreditApi } from "@/lib/api/vendor-credits";
import { inventoryApi } from "@/lib/api/inventory";
import { warehouseApi } from "@/lib/api/warehouses";
import { settingsApi } from "@/lib/api/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ─── TYPES ──────────────────────────────────────────────────────────────────

export type OcrDocType =
  | "Invoices"
  | "Bills"
  | "Expenses"
  | "Journal Entries"
  | "Sales Orders"
  | "Quotes"
  | "Purchase Orders"
  | "Vendor Credits"
  | "Items"
  | "Bank Statements"
  | "Inventory Adjustments";

export interface OcrLineItem {
  id: string;
  description: string;
  qty: number;
  rate: number;
  taxRate: number;
  total: number;
}

export interface ParsedOcrDocument {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  docType: OcrDocType;
  file?: File; // store original File for preview
  parsedData: {
    docNumber: string;
    date: string;
    contactName: string;
    contactId?: string | null;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    description: string;
    lines: OcrLineItem[];
    gstin?: string;
    placeOfSupply?: string;
    itemDescription?: string;
    hsnSacCode?: string;
    unit?: string;
    taxPreference?: string;
    inventoryTracked?: boolean;
    stockOnHand?: number;
    warehouseId?: string;
    reorderPoint?: number;
    salesAccountId?: string;
    purchaseAccountId?: string;
    inventoryAccountId?: string;
    dueDate?: string;
    referenceNumber?: string;
    orderNumber?: string;
    paymentTermsId?: string;
    salesPersonId?: string;
    sourceOfSupply?: string;
    destinationOfSupply?: string;
    subject?: string;
    notes?: string;
    termsAndConditions?: string;
  };
  validationStatus: "valid" | "warning" | "error";
  validationMessage?: string;
}

interface BulkOcrImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: "sales" | "purchases" | "accountant" | "items" | "banking" | "inventory";
  defaultDocType?: OcrDocType;
  onImportComplete?: (importedCount: number, data: any[]) => void;
  isFullScreenPage?: boolean;
  backUrl?: string;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

const MOCK_CONTACTS: Record<string, string[]> = {
  sales: ["Acme Corp", "TechNova Solutions", "Global Trading Inc", "Vanguard Industries"],
  purchases: ["Office Depot", "Amazon Web Services", "Grid Power Corp", "City Stationery Ltd"],
  accountant: ["General Ledger", "Acme Corp", "Amazon Web Services", "Opening Balances Offset"],
  items: ["Internal Inventory", "Hardware Supplier Ltd"],
  banking: ["HDFC Bank", "ICICI Bank", "SBI Bank", "Axis Bank"],
  inventory: ["Main Warehouse", "Transit Warehouse", "Damage Control"],
};

const getMockContacts = (section: string) => MOCK_CONTACTS[section] || MOCK_CONTACTS.accountant;

const matchContact = (name: string, contacts: any[]) => {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  return (
    contacts.find(
      (c) =>
        c.displayName?.toLowerCase() === n || c.companyName?.toLowerCase() === n
    ) ||
    contacts.find(
      (c) =>
        c.displayName?.toLowerCase().includes(n) ||
        c.companyName?.toLowerCase().includes(n) ||
        n.includes(c.displayName?.toLowerCase() || "")
    ) ||
    null
  );
};

const matchItem = (description: string, items: any[]) => {
  if (!description) return null;
  const n = description.toLowerCase().trim();
  return (
    items.find((it) => it.name?.toLowerCase() === n || it.sku?.toLowerCase() === n) ||
    items.find(
      (it) =>
        n.includes(it.name?.toLowerCase() || "") ||
        (it.name && it.name.toLowerCase().includes(n))
    ) ||
    null
  );
};

const getGstStateName = (gstin: string): string => {
  if (!gstin || gstin.length < 2) return "";
  const code = gstin.substring(0, 2);
  const states: Record<string, string> = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar Islands", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
  };
  return states[code] || "";
};

// ─── FILE PREVIEW COMPONENT ──────────────────────────────────────────────────

function FilePreview({ file }: { file: File | undefined }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!file) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setZoom(100);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!file || !objectUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
        <FileText className="h-12 w-12 text-slate-300" />
        <p className="text-xs text-slate-400">Select a document to preview</p>
      </div>
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(ext);
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const isExcel = ["xls", "xlsx"].includes(ext);
  const isWord = ["doc", "docx"].includes(ext);

  if (isImage) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        {/* Zoom controls */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 text-slate-700 shrink-0">
          <span className="text-[11px] font-mono text-slate-700 truncate max-w-[160px]">{file.name}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-600 font-medium w-10 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(300, z + 25))}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Reset zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 flex items-start justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectUrl}
            alt={file.name}
            className="max-w-none shadow-lg rounded transition-transform origin-top"
            style={{ width: `${zoom}%`, maxWidth: "none" }}
          />
        </div>
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200 text-slate-700 shrink-0">
          <span className="text-[11px] font-mono text-slate-700 truncate max-w-[200px]">{file.name}</span>
          <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
            <Info className="h-3 w-3 text-slate-400" />
            All pages processed by OCR
          </span>
        </div>
        <div className="flex-1 overflow-hidden bg-white">
          <iframe
            src={`${objectUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
            className="w-full h-full border-0"
            title={file.name}
          />
        </div>
      </div>
    );
  }

  if (isExcel) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-emerald-50/30 p-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center">
          <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">{file.name}</p>
          <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Excel Spreadsheet</p>
        </div>
        <div className="bg-white border border-emerald-200 rounded-lg p-4 max-w-[280px] w-full">
          <p className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">OCR Processing</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            All sheets in this workbook are extracted and processed as structured text for AI analysis. 
            Multi-sheet workbooks are supported.
          </p>
        </div>
        <a
          href={objectUrl}
          download={file.name}
          className="text-[11px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5 font-medium"
        >
          <Download className="h-3.5 w-3.5" />
          Download to inspect
        </a>
      </div>
    );
  }

  if (isWord) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-blue-50/30 p-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center">
          <FileText className="h-8 w-8 text-blue-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">{file.name}</p>
          <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB · Word Document</p>
        </div>
        <div className="bg-white border border-blue-200 rounded-lg p-4 max-w-[280px] w-full">
          <p className="text-[11px] font-semibold text-slate-600 mb-2 uppercase tracking-wide">OCR Processing</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Document text is extracted via mammoth.js and analyzed by Gemini AI 
            for structured accounting data extraction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 p-6">
      <FileCode className="h-12 w-12 text-slate-300" />
      <p className="text-xs text-slate-400 text-center">{file.name}</p>
      <p className="text-[11px] text-slate-400">File preview not available — OCR will process content automatically</p>
    </div>
  );
}

const countPagesPdf = async (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const arr = new Uint8Array(e.target?.result as ArrayBuffer);
        const text = new TextDecoder("ascii").decode(arr);
        const matches1 = text.match(/\/Type\s*\/Page\b/g);
        if (matches1) {
          resolve(matches1.length || 1);
          return;
        }
        const matches2 = text.match(/\/Count\s+(\d+)/g);
        if (matches2) {
          const counts = matches2.map(m => parseInt(m.match(/\d+/)?.[0] || "0", 10));
          resolve(Math.max(...counts, 1));
          return;
        }
      } catch (err) {
        // ignore
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file);
  });
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function BulkOcrImport({
  open,
  onOpenChange,
  section,
  defaultDocType,
  onImportComplete,
  isFullScreenPage = false,
  backUrl,
}: BulkOcrImportProps) {
  const router = useRouter();

  const handleClose = () => {
    if (isFullScreenPage) {
      let dest = backUrl;
      if (!dest) {
        if (section === "items") dest = "/items";
        else if (section === "banking") dest = "/banking";
        else if (section === "inventory") dest = "/inventory/adjustments";
        else if (section === "accountant") {
          if (defaultDocType === "Journal Entries") dest = "/accountant/journal-entries";
          else if (defaultDocType === "Invoices") dest = "/accountant/bulk-update";
          else dest = "/accountant/chart-of-accounts";
        } else if (section === "sales") {
          if (defaultDocType === "Sales Orders") dest = "/sales/orders";
          else if (defaultDocType === "Quotes") dest = "/sales/quotes";
          else dest = "/sales/invoices";
        } else if (section === "purchases") {
          if (defaultDocType === "Purchase Orders") dest = "/purchases/orders";
          else if (defaultDocType === "Bills") dest = "/purchases/bills";
          else if (defaultDocType === "Expenses") dest = "/purchases/expenses";
          else dest = "/purchases/vendor-credits";
        } else {
          dest = "/";
        }
      }
      router.push(dest);
    } else {
      onOpenChange(false);
    }
  };

  // Style utilities
  const inputCls =
    "h-8 bg-emerald-50/30 hover:bg-emerald-50/50 border-emerald-300 text-xs text-slate-900 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 transition-colors";
  const dateCls =
    "w-full h-8 bg-emerald-50/30 hover:bg-emerald-50/50 border border-emerald-300 rounded px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors";
  const selectCls =
    "h-8 bg-emerald-50/30 hover:bg-emerald-50/50 border-emerald-300 text-xs text-slate-900 focus:ring-emerald-500 transition-colors";
  const disabledCls =
    "h-8 bg-slate-50 border-slate-200 text-xs text-slate-400 font-mono cursor-not-allowed";

  const docTypeOptions: OcrDocType[] =
    section === "sales"
      ? ["Invoices", "Sales Orders", "Quotes"]
      : section === "purchases"
      ? ["Bills", "Expenses", "Purchase Orders", "Vendor Credits"]
      : section === "items"
      ? ["Items"]
      : section === "banking"
      ? ["Bank Statements"]
      : section === "inventory"
      ? ["Inventory Adjustments"]
      : ["Journal Entries", "Invoices", "Bills"];

  const [docType, setDocType] = useState<OcrDocType>(defaultDocType || docTypeOptions[0]);
  const [step, setStep] = useState<"upload" | "processing" | "review" | "saving" | "success">("upload");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [ocrDocuments, setOcrDocuments] = useState<ParsedOcrDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [processProgress, setProcessProgress] = useState(0);
  const [loaderMessage, setLoaderMessage] = useState("");
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // Real-time agent log stream
  interface AgentLog { id: string; ts: string; type: "info" | "scan" | "ok" | "warn" | "field" | "phase"; text: string; }
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("");
  const [currentFileIdx, setCurrentFileIdx] = useState<number>(0);
  const [currentFilePageCount, setCurrentFilePageCount] = useState<number>(1);
  const [currentFileCurrentPage, setCurrentFileCurrentPage] = useState<number>(1);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((type: AgentLog["type"], text: string) => {
    const ts = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    setAgentLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, ts, type, text }]);
    // Auto-scroll after state update
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, []);

  // DB data
  const [dbContacts, setDbContacts] = useState<any[]>([]);
  const [dbAccounts, setDbAccounts] = useState<any[]>([]);
  const [dbItems, setDbItems] = useState<any[]>([]);
  const [dbWarehouses, setDbWarehouses] = useState<any[]>([]);
  const [dbUnits, setDbUnits] = useState<any[]>([]);
  const [dbTaxes, setDbTaxes] = useState<any[]>([]);
  const [dbPaymentTerms, setDbPaymentTerms] = useState<any[]>([]);
  const [dbSalesPersons, setDbSalesPersons] = useState<any[]>([]);

  useEffect(() => {
    setDocType(defaultDocType || docTypeOptions[0]);
  }, [section, defaultDocType]);

  useEffect(() => {
    const load = async () => {
      try { setDbContacts((await contactApi.list({ limit: 1000 })).data || []); } catch {}
      try { setDbAccounts((await accountApi.list()).data || []); } catch {}
      try { setDbItems((await itemApi.list()).data || []); } catch {}
      try { setDbWarehouses((await warehouseApi.list()).data || []); } catch {}
      try { setDbUnits((await itemApi.listUnits()).data || []); } catch {}
      try { setDbTaxes((await settingsApi.taxes.list()).data || []); } catch {}
      try { setDbPaymentTerms((await settingsApi.paymentTerms.list()).data || []); } catch {}
      try { setDbSalesPersons((await settingsApi.salesPersons.list()).data || []); } catch {}
    };
    load();
  }, []);

  useEffect(() => {
    if (!open) {
      setStep("upload");
      setUploadedFiles([]);
      setOcrDocuments([]);
      setSelectedDocId(null);
      setProcessProgress(0);
      setSaveProgress(0);
      setAgentLogs([]);
      setCurrentPhase("");
      setCurrentFileIdx(0);
      setCurrentFilePageCount(1);
      setCurrentFileCurrentPage(1);
    }
  }, [open]);

  const getContactsForDocType = (dt: OcrDocType): string[] => {
    if (dbContacts.length === 0) return getMockContacts(section);
    return dbContacts
      .filter((c) => {
        if (["Invoices", "Sales Orders", "Quotes"].includes(dt))
          return c.contactType === "Customer" || c.contactType === "Both";
        if (["Bills", "Expenses", "Purchase Orders", "Vendor Credits"].includes(dt))
          return c.contactType === "Vendor" || c.contactType === "Both";
        return true;
      })
      .map((c) => c.displayName);
  };

  const handleFilesAdded = (files: FileList | null) => {
    if (!files) return;
    const valid: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (ext && ["png", "jpg", "jpeg", "pdf", "xls", "xlsx", "doc", "docx", "webp", "gif", "bmp", "tiff"].includes(ext)) {
        valid.push(f);
      } else {
        toast.error(`Unsupported: ${f.name}. Supported: PDF, Images, Excel, Word`);
      }
    }
    if (valid.length > 0) {
      setUploadedFiles((prev) => [...prev, ...valid]);
      toast.success(`${valid.length} file(s) added`);
    }
  };

  const removeFile = (index: number) => setUploadedFiles((prev) => prev.filter((_, i) => i !== index));

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const onDragLeave = () => setIsDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFilesAdded(e.dataTransfer.files);
  };

  const startProcessing = async () => {
    if (uploadedFiles.length === 0) { toast.warning("Please upload at least one document."); return; }

    setStep("processing");
    setProcessProgress(0);
    setAgentLogs([]);
    setCurrentFileIdx(0);

    const docTypeMap: Record<OcrDocType, string> = {
      "Invoices": "invoice", "Bills": "bill", "Expenses": "expense",
      "Journal Entries": "journal_entry", "Sales Orders": "sales_order",
      "Quotes": "quote", "Purchase Orders": "purchase_order",
      "Vendor Credits": "vendor_credit", "Items": "item",
      "Bank Statements": "bank_statement", "Inventory Adjustments": "inventory_adjustment",
    };
    const backendType = docTypeMap[docType] || "auto";
    const results: ParsedOcrDocument[] = [];

    addLog("phase", `OCR Agent started — ${uploadedFiles.length} document(s) queued`);
    addLog("info", `Document type: ${docType} → backend model: ${backendType}`);
    addLog("info", `Gemini Vision API initializing…`);

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      setCurrentFileIdx(i);
      setLoaderMessage(`Analyzing "${file.name}" (${i + 1}/${uploadedFiles.length})…`);

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      addLog("phase", `── Document ${i + 1}/${uploadedFiles.length}: ${file.name}`);
      addLog("info", `File size: ${(file.size / 1024).toFixed(1)} KB · Type: ${ext.toUpperCase()}`);
      if (ext === "pdf") addLog("scan", "Decoding PDF pages via Gemini multimodal…");
      else if (["xls", "xlsx"].includes(ext)) addLog("scan", "Parsing Excel sheets via XLSX engine…");
      else if (["doc", "docx"].includes(ext)) addLog("scan", "Extracting Word document text via Mammoth…");
      else addLog("scan", "Encoding image as base64 for vision API…");

      // Count pages first
      let pageCount = 1;
      if (ext === "pdf") {
        try {
          pageCount = await countPagesPdf(file);
        } catch (e) {
          console.error(e);
        }
      }
      setCurrentFilePageCount(pageCount);
      setCurrentFileCurrentPage(1);

      const baseProgress = (i / uploadedFiles.length) * 100;
      const targetProgress = ((i + 0.95) / uploadedFiles.length) * 100;
      let currentProgress = baseProgress;
      setProcessProgress(Math.round(currentProgress));

      const secondsPerPage = 4;
      const pageIntervalMs = secondsPerPage * 1000;
      const tickIntervalMs = 250;
      let elapsedMs = 0;

      setCurrentPhase("Uploading to Gemini…");

      const interval = setInterval(() => {
        elapsedMs += tickIntervalMs;
        const totalDurationMs = pageCount * secondsPerPage * 1000;
        const progressFraction = Math.min(1, elapsedMs / totalDurationMs);
        currentProgress = baseProgress + (targetProgress - baseProgress) * progressFraction;
        
        if (elapsedMs > totalDurationMs) {
          const extraTime = elapsedMs - totalDurationMs;
          const creepFraction = 1 - Math.exp(-extraTime / 12000);
          currentProgress = baseProgress + (targetProgress - baseProgress) * (1 + creepFraction * 0.05);
        }
        setProcessProgress(Math.min(99, Math.round(currentProgress)));

        const curPage = Math.min(pageCount, Math.floor(elapsedMs / pageIntervalMs) + 1);
        setCurrentFileCurrentPage(curPage);

        if (elapsedMs % 2000 === 0) {
          const logsSim = [
            `Running visual layout analysis on page ${curPage}…`,
            `Extracting structural key-value tables for page ${curPage}…`,
            `Validating page ${curPage} items against tax schema…`,
            `Refining extracted text blocks via OCR post-processing on page ${curPage}…`
          ];
          const logIdx = Math.floor(elapsedMs / 2000) % logsSim.length;
          setCurrentPhase(logsSim[logIdx]);
        }
      }, tickIntervalMs);

      try {
        const ocrRes = await ocrApi.extract(file, backendType);
        clearInterval(interval);
        setCurrentPhase("Parsing extracted data…");
        addLog("ok", `Gemini response received in ${ocrRes.data?.processingTimeMs ?? "??"}ms`);
        if (ocrRes.success && ocrRes.data?.success) {
          const rawKeys = Object.keys(ocrRes.data.extractedData || {}).slice(0, 6);
          rawKeys.forEach((k) => addLog("field", `→ ${k}: ${JSON.stringify((ocrRes.data.extractedData as any)[k])?.slice(0, 60)}`));
          const ext = ocrRes.data.extractedData || {};
          const today = new Date().toISOString().split("T")[0];

          if (docType === "Items") {
            const salesList = dbAccounts.filter((a) => a.rootType === "Income");
            const purchaseList = dbAccounts.filter((a) => a.rootType === "Expense");
            const inventoryList = dbAccounts.filter((a) => a.rootType === "Asset");

            const defaultSalesAccountId = salesList.find((a) => ["sales", "sales revenue", "sales income"].includes(a.name?.toLowerCase()))?._id || salesList[0]?._id || "";
            const defaultPurchaseAccountId = purchaseList.find((a) => ["cost of goods sold", "costofgoodssold", "purchases", "purchase"].includes(a.name?.toLowerCase().replace(/\s+/g, "")))?._id || purchaseList[0]?._id || "";
            const defaultInventoryAccountId = inventoryList.find((a) => ["inventory asset (stock)", "inventory asset", "inventory", "stock", "closing stock"].includes(a.name?.toLowerCase()))?._id || inventoryList[0]?._id || "";
            const defaultWarehouseId = dbWarehouses[0]?._id || "";

            let itemsList = Array.isArray(ext.items)
              ? ext.items
              : Array.isArray(ext.lineItems)
              ? ext.lineItems
              : Array.isArray(ext.products)
              ? ext.products
              : [ext];

            if (itemsList.length === 0) {
              itemsList = [ext];
            }

            for (let idx = 0; idx < itemsList.length; idx++) {
              const item = itemsList[idx];
              const name = item.itemName || item.productName || item.name || item.description || "";
              if (!name && itemsList.length > 1) continue;
              const finalName = name || `Imported Item ${idx + 1} (${file.name})`;

              const skuCode = item.sku || item.itemCode || item.hsnSacCode || "";

              // Fallback price parsing
              const salesPrice = Number(item.salesPrice ?? item.sellingPrice ?? item.rate ?? item.price ?? 0);
              const costPrice = Number(item.costPrice ?? item.purchasePrice ?? item.rate ?? item.price ?? 0);

              let finalSalesPrice = salesPrice;
              let finalCostPrice = costPrice;

              if (finalSalesPrice === 0 && finalCostPrice > 0) {
                finalSalesPrice = finalCostPrice;
              } else if (finalCostPrice === 0 && finalSalesPrice > 0) {
                finalCostPrice = finalSalesPrice;
              }

              let pd: any = {
                docNumber: skuCode,
                date: today,
                contactName: item.itemType === "Service" ? "Service" : "Goods",
                subtotal: finalSalesPrice,
                total: finalCostPrice,
                taxRate: Number(item.taxRate ?? item.gstRate ?? item.taxPercent ?? 0),
                description: finalName,
                lines: [],
                gstin: "",
                placeOfSupply: "",

                // Additional fields for Item creation
                itemDescription: item.description || "",
                hsnSacCode: item.hsnSacCode || skuCode || "",
                unit: item.unit || dbUnits[0]?._id || "",
                taxPreference: item.taxPreference || "Taxable",
                inventoryTracked: false,
                stockOnHand: 0,
                warehouseId: defaultWarehouseId,
                reorderPoint: 0,
                salesAccountId: defaultSalesAccountId,
                purchaseAccountId: defaultPurchaseAccountId,
                inventoryAccountId: defaultInventoryAccountId,
              };

              let validationStatus: "valid" | "warning" | "error" = "valid";
              let validationMessage: string | undefined;

              if (!pd.description) {
                validationStatus = "error";
                validationMessage = "Item Name is required.";
              }

              addLog("ok", `Extracted Item: "${pd.description}" | SKU: "${pd.docNumber}" | Cost Price: ₹${pd.total}`);

              results.push({
                id: `doc-${i}-${idx}-${Date.now()}`,
                fileName: itemsList.length > 1 ? `${file.name} - Item ${idx + 1}` : file.name,
                fileSize: (file.size / 1024).toFixed(1) + " KB",
                fileType: file.type,
                docType,
                file,
                parsedData: pd,
                validationStatus,
                validationMessage,
              });
            }
          } else {
            let pd: any = {
              docNumber: "", date: today, contactName: "",
              subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
              description: "Imported via Gemini OCR", lines: [],
              gstin: "", placeOfSupply: "",
              dueDate: "", referenceNumber: "",
            };

            if (docType === "Invoices") {
              pd.docNumber = ext.invoiceNumber || ext.referenceNumber || "";
              pd.date = ext.invoiceDate || today;
              pd.dueDate = ext.dueDate || "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.orderNumber = ext.orderNumber || "";
              pd.contactName = ext.customerName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.taxBreakdown?.[0]?.rate ?? 0);
              pd.description = ext.notes || "Sales Invoice";
              pd.gstin = ext.customerGSTIN || ext.vendorGSTIN || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.subject = ext.subject || "";
              pd.notes = ext.notes || ext.customerNotes || "";
              pd.termsAndConditions = ext.termsAndConditions || "";
              pd.lines = (ext.items || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.name || "Item",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxPercent ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Bills") {
              pd.docNumber = ext.billNumber || ext.referenceNumber || "";
              pd.date = ext.billDate || today;
              pd.dueDate = ext.dueDate || "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.orderNumber = ext.orderNumber || "";
              pd.contactName = ext.vendorName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.lineItems?.[0]?.taxRate ?? ext.taxBreakdown?.[0]?.rate ?? 0);
              pd.description = ext.notes || "Vendor Bill";
              pd.gstin = ext.vendorGSTIN || ext.customerGSTIN || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.sourceOfSupply = ext.sourceOfSupply || pd.placeOfSupply;
              pd.destinationOfSupply = ext.destinationOfSupply || pd.placeOfSupply;
              pd.notes = ext.notes || "";
              pd.termsAndConditions = ext.termsAndConditions || "";
              pd.lines = (ext.lineItems || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || "Bill Line",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxRate ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Expenses") {
              pd.docNumber = ext.invoiceNumber || ext.receiptNumber || "";
              pd.date = ext.expenseDate || today;
              pd.contactName = ext.vendorName || ext.merchantName || "";
              pd.total = Number(ext.amount ?? ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? 0);
              pd.subtotal = Math.max(0, pd.total - pd.taxAmount);
              pd.taxRate = Number(ext.taxBreakdown?.[0]?.rate ?? ext.gstRate ?? 0);
              pd.description = ext.description || ext.category || "Business Expense";
              pd.gstin = ext.vendorGSTIN || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
            } else if (docType === "Journal Entries") {
              pd.docNumber = ext.journalNumber || "";
              pd.date = ext.date || today;
              pd.contactName = ext.reference || "";
              pd.description = ext.description || "Journal Entry";
              pd.subtotal = Number(ext.totalDebits ?? 0);
              pd.total = Number(ext.totalCredits ?? 0);
              pd.lines = (ext.lines || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || "Ledger Line",
                qty: 1, rate: Number(it.amount || it.debit || it.credit || 0),
                taxRate: 0, total: Number(it.amount || it.debit || it.credit || 0),
              }));
            } else if (docType === "Sales Orders") {
              pd.docNumber = ext.salesOrderNumber || "";
              pd.date = ext.orderDate || today;
              pd.dueDate = ext.dueDate || ext.expectedShipmentDate || "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.contactName = ext.customerName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.items?.[0]?.taxPercent ?? 0);
              pd.gstin = ext.customerGSTIN || ext.gstin || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.notes = ext.notes || "";
              pd.termsAndConditions = ext.terms || ext.termsAndConditions || "";
              pd.lines = (ext.items || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.name || "Item",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxPercent ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Quotes") {
              pd.docNumber = ext.quoteNumber || ext.estimateNumber || "";
              pd.date = ext.quoteDate || ext.estimateDate || today;
              pd.dueDate = ext.expiryDate || ext.validUntil || "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.contactName = ext.customerName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.items?.[0]?.taxPercent ?? 0);
              pd.gstin = ext.customerGSTIN || ext.gstin || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.subject = ext.subject || "";
              pd.notes = ext.notes || ext.customerNotes || "";
              pd.termsAndConditions = ext.termsAndConditions || "";
              pd.lines = (ext.items || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.name || "Item",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxPercent ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Purchase Orders") {
              pd.docNumber = ext.purchaseOrderNumber || "";
              pd.date = ext.orderDate || today;
              pd.dueDate = ext.dueDate || ext.deliveryDate || "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.contactName = ext.vendorName || ext.supplierName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.items?.[0]?.taxPercent ?? 0);
              pd.gstin = ext.vendorGSTIN || ext.gstin || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.notes = ext.notes || "";
              pd.termsAndConditions = ext.termsAndConditions || "";
              pd.lines = (ext.items || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.name || "Item",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxPercent ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Vendor Credits") {
              pd.docNumber = ext.creditNoteNumber || "";
              pd.date = ext.creditNoteDate || today;
              pd.dueDate = "";
              pd.referenceNumber = ext.referenceNumber || "";
              pd.orderNumber = ext.orderNumber || "";
              pd.contactName = ext.vendorName || "";
              pd.subtotal = Number(ext.subTotal ?? 0);
              pd.total = Number(ext.total ?? 0);
              pd.taxAmount = Number(ext.totalTaxAmount ?? Math.max(0, pd.total - pd.subtotal));
              pd.taxRate = Number(ext.items?.[0]?.taxPercent ?? 0);
              pd.gstin = ext.vendorGSTIN || ext.gstin || "";
              pd.placeOfSupply = ext.placeOfSupply || getGstStateName(pd.gstin);
              pd.sourceOfSupply = ext.sourceOfSupply || pd.placeOfSupply;
              pd.destinationOfSupply = ext.destinationOfSupply || pd.placeOfSupply;
              pd.notes = ext.notes || "";
              pd.termsAndConditions = ext.termsAndConditions || "";
              pd.lines = (ext.items || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.name || "Credit Line",
                qty: Number(it.quantity ?? 1), rate: Number(it.rate ?? 0),
                taxRate: Number(it.taxPercent ?? 0), total: Number(it.amount ?? 0),
              }));
            } else if (docType === "Bank Statements") {
              pd.docNumber = ext.accountNumber || ext.statementRef || "";
              pd.date = ext.statementPeriod?.to || ext.endDate || today;
              pd.contactName = ext.bankName || ext.bankBranch || "";
              pd.subtotal = Number(ext.openingBalance ?? 0);
              pd.total = Number(ext.closingBalance ?? 0);
              pd.lines = (ext.transactions || []).map((it: any, idx: number) => ({
                id: `l${idx}-${Date.now()}`, description: it.description || it.narration || "Transaction",
                qty: 1, rate: Number(it.credit ?? -(it.debit ?? 0)),
                taxRate: 0, total: Number(it.credit ?? -(it.debit ?? 0)),
              }));
            } else if (docType === "Inventory Adjustments") {
              pd.docNumber = ext.adjustmentReference || ext.referenceNumber || "";
              pd.date = ext.date || today;
              pd.contactName = ext.warehouseName || ext.location || "";
              pd.description = ext.reason || "Stock Count";
              pd.subtotal = Number(ext.quantityDelta ?? ext.quantity ?? 0);
              pd.total = Number(ext.unitCost ?? ext.costPerUnit ?? 0);
              pd.lines = [{
                id: `l0-${Date.now()}`,
                description: ext.itemName || ext.productName || "Adjusted Item",
                qty: Number(ext.quantityDelta ?? 0), rate: Number(ext.unitCost ?? 0),
                taxRate: 0, total: Number((ext.quantityDelta ?? 0) * (ext.unitCost ?? 0)),
              }];
            }

            // Try auto-match contact
            let matchedContact: any = null;
            if (pd.contactName) {
              matchedContact = matchContact(pd.contactName, dbContacts);
              if (matchedContact) {
                pd.contactName = matchedContact.displayName;
                pd.contactId = matchedContact._id;
                if (matchedContact.gstin && !pd.gstin) pd.gstin = matchedContact.gstin;
                if (matchedContact.placeOfSupply && !pd.placeOfSupply)
                  pd.placeOfSupply = matchedContact.placeOfSupply;
              }
            }

            // Validate
            let validationStatus: "valid" | "warning" | "error" = "valid";
            let validationMessage: string | undefined;

            if (docType === "Inventory Adjustments") {
              if (!pd.contactName) { validationStatus = "error"; validationMessage = "Warehouse is required."; }
              else {
                const wh = dbWarehouses.find((w) => w.name?.toLowerCase() === pd.contactName.toLowerCase());
                if (!wh) { validationStatus = "warning"; validationMessage = "Warehouse not found in system — please verify."; }
              }
            } else if (docType === "Bank Statements") {
              if (!pd.contactName) { validationStatus = "warning"; validationMessage = "Bank account not identified."; }
            } else {
              if (!pd.docNumber) { validationStatus = "warning"; validationMessage = "Document number not extracted."; }
              else if (!pd.contactName && docType !== "Journal Entries") { validationStatus = "warning"; validationMessage = "Contact not matched — please assign."; }
              else if (pd.contactName && !matchedContact && docType !== "Journal Entries") { validationStatus = "warning"; validationMessage = "Contact not found in system — will be created."; }
              else if (pd.total <= 0 && docType !== "Journal Entries") { validationStatus = "error"; validationMessage = "Total amount must be greater than zero."; }
            }

            // Log summary
            addLog("ok", `Extracted: doc# "${pd.docNumber}" | partner: "${pd.contactName}" | total: ₹${pd.total}`);
            if (pd.gstin) addLog("field", `GSTIN: ${pd.gstin} → State: ${pd.placeOfSupply || "(detecting…)"}`);
            if (pd.lines.length > 0) addLog("field", `Line items found: ${pd.lines.length} (${pd.lines.slice(0,2).map((l: any) => l.description).join(", ")}${pd.lines.length > 2 ? "…" : ""})`);
            if (pd.contactName && matchedContact) addLog("ok", `Contact matched in DB: "${pd.contactName}" ✓`);
            else if (pd.contactName) addLog("warn", `Contact "${pd.contactName}" not in DB — will be created`);
            addLog(validationStatus === "valid" ? "ok" : validationStatus === "warning" ? "warn" : "warn",
              `Validation: ${validationStatus.toUpperCase()}${validationMessage ? ` — ${validationMessage}` : " — all fields verified"}`);

            results.push({
              id: `doc-${i}-${Date.now()}`,
              fileName: file.name,
              fileSize: (file.size / 1024).toFixed(1) + " KB",
              fileType: file.type,
              docType, file,
              parsedData: pd,
              validationStatus, validationMessage,
            });
          }
        } else {
          throw new Error(ocrRes.data?.error || "OCR extraction returned no data");
        }
      } catch (err: any) {
        addLog("warn", `✗ Error on "${file.name}": ${err.message || err}`);
        toast.error(`Failed to process ${file.name}: ${err.message || err}`);
        results.push({
          id: `doc-err-${i}-${Date.now()}`,
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(1) + " KB",
          fileType: file.type,
          docType, file,
          parsedData: {
            docNumber: "", date: new Date().toISOString().split("T")[0],
            contactName: "", subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
            description: `Processing failed: ${err.message || err}`, lines: [],
          },
          validationStatus: "error",
          validationMessage: `OCR failed: ${err.message || err}`,
        });
      }

      setProcessProgress(Math.round(((i + 1) / uploadedFiles.length) * 100));
    }
    addLog("phase", `── All documents processed. ${results.filter(r=>r.validationStatus==="valid").length} valid, ${results.filter(r=>r.validationStatus==="warning").length} warnings, ${results.filter(r=>r.validationStatus==="error").length} errors`);

    if (results.length > 0) {
      setOcrDocuments(results);
      setSelectedDocId(results[0]?.id || null);
      setStep("review");
      toast.success("OCR processing complete. Please review the extracted data.");
    } else {
      setStep("upload");
      toast.error("No documents could be processed.");
    }
  };

  const handleDocChange = (docId: string, field: string, value: any) => {
    setOcrDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== docId) return doc;
        const up = { ...doc.parsedData, [field]: value };

        if (field === "contactName") {
          const m = matchContact(value, dbContacts);
          up.contactId = m ? m._id : null;
          if (m?.gstin && !up.gstin) up.gstin = m.gstin;
          if (m?.placeOfSupply && !up.placeOfSupply) up.placeOfSupply = m.placeOfSupply;
        }
        if (field === "gstin") {
          const state = getGstStateName(value);
          if (state) up.placeOfSupply = state;
        }
        if (field === "subtotal" || field === "taxRate") {
          const sub = Number(up.subtotal || 0);
          const rate = Number(up.taxRate || 0);
          up.taxAmount = Math.round(sub * (rate / 100) * 100) / 100;
          up.total = Math.round((sub + up.taxAmount) * 100) / 100;
        }
        if (field === "total") {
          const tot = Number(up.total || 0);
          const rate = Number(up.taxRate || 0);
          up.subtotal = Math.round((tot / (1 + rate / 100)) * 100) / 100;
          up.taxAmount = Math.round((tot - up.subtotal) * 100) / 100;
        }

        // Revalidate
        let vs: "valid" | "warning" | "error" = "valid";
        let vm: string | undefined;

        if (doc.docType === "Items") {
          if (!up.description) { vs = "error"; vm = "Item Name is required."; }
        } else if (doc.docType === "Inventory Adjustments") {
          if (!up.contactName) { vs = "error"; vm = "Warehouse is required."; }
          else {
            const wh = dbWarehouses.find((w) => w.name?.toLowerCase() === up.contactName.toLowerCase());
            if (!wh) { vs = "warning"; vm = "Warehouse not found in system."; }
          }
        } else if (doc.docType === "Bank Statements") {
          if (!up.contactName) { vs = "warning"; vm = "Bank account not assigned."; }
        } else {
          const m = up.contactName ? matchContact(up.contactName, dbContacts) : null;
          if (!up.docNumber) { vs = "warning"; vm = "Document number missing."; }
          else if (!up.contactName && doc.docType !== "Journal Entries") { vs = "warning"; vm = "Please assign a partner."; }
          else if (up.contactName && !m && doc.docType !== "Journal Entries") { vs = "warning"; vm = "Contact not in system."; }
          else if (up.total <= 0 && doc.docType !== "Journal Entries") { vs = "error"; vm = "Total must be > 0."; }
        }

        return { ...doc, parsedData: up, validationStatus: vs, validationMessage: vm };
      })
    );
  };

  const handleLineChange = (docId: string, lineId: string, field: string, value: any) => {
    setOcrDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== docId) return doc;
        const lines = doc.parsedData.lines.map((ln) => {
          if (ln.id !== lineId) return ln;
          const updated = { ...ln, [field]: value };
          if (field === "qty" || field === "rate" || field === "taxRate") {
            const q = Number(updated.qty);
            const r = Number(updated.rate);
            const t = Number(updated.taxRate);
            updated.total = Math.round(q * r * (1 + t / 100) * 100) / 100;
          }
          return updated;
        });
        // Recalculate subtotals from lines
        const newSubtotal = lines.reduce((s, ln) => s + ln.qty * ln.rate, 0);
        const newTaxAmount = lines.reduce((s, ln) => s + ln.qty * ln.rate * (ln.taxRate / 100), 0);
        return {
          ...doc,
          parsedData: {
            ...doc.parsedData,
            lines,
            subtotal: Math.round(newSubtotal * 100) / 100,
            taxAmount: Math.round(newTaxAmount * 100) / 100,
            total: Math.round((newSubtotal + newTaxAmount) * 100) / 100,
          },
        };
      })
    );
  };

  const handleSaveAndUpload = async () => {
    const hasErrors = ocrDocuments.some((d) => d.validationStatus === "error");
    if (hasErrors) { toast.error("Please resolve all validation errors before uploading."); return; }

    setStep("saving");
    setSaveProgress(0);
    setSaveMessage("Initializing database upload…");

    let successCount = 0;
    for (let i = 0; i < ocrDocuments.length; i++) {
      const doc = ocrDocuments[i];
      setSaveMessage(`Importing ${i + 1}/${ocrDocuments.length}: ${doc.parsedData.docNumber || doc.fileName}…`);
      setSaveProgress(Math.round((i / ocrDocuments.length) * 100));

      try {
        if (doc.docType === "Invoices") {
          await invoiceApi.create({
            invoiceNumber: doc.parsedData.docNumber,
            invoiceDate: doc.parsedData.date,
            dueDate: doc.parsedData.dueDate || null,
            referenceNumber: doc.parsedData.referenceNumber || "",
            orderNumber: doc.parsedData.orderNumber || "",
            customerId: doc.parsedData.contactId || "",
            paymentTermsId: doc.parsedData.paymentTermsId || null,
            salesPersonId: doc.parsedData.salesPersonId || null,
            subject: doc.parsedData.subject || "",
            items: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || null, name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, taxPercent: ln.taxRate, discountPercent: 0 };
            }),
            customerNotes: doc.parsedData.description,
            taxAmount: doc.parsedData.taxAmount,
          });
        } else if (doc.docType === "Bills") {
          const defAcc = dbAccounts.find((a) => a.accountType === "Expense")?._id || dbAccounts[0]?._id || null;
          await billApi.create({
            vendorId: doc.parsedData.contactId || "",
            billNumber: doc.parsedData.docNumber,
            billDate: doc.parsedData.date,
            dueDate: doc.parsedData.dueDate || null,
            paymentTermsId: doc.parsedData.paymentTermsId || null,
            referenceNumber: doc.parsedData.referenceNumber || "",
            orderNumber: doc.parsedData.orderNumber || "",
            sourceOfSupply: doc.parsedData.sourceOfSupply || doc.parsedData.placeOfSupply || "",
            destinationOfSupply: doc.parsedData.destinationOfSupply || doc.parsedData.placeOfSupply || "",
            lineItems: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || null, name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, amount: ln.total, taxRate: ln.taxRate, accountId: defAcc };
            }),
            notes: doc.parsedData.description,
            taxAmount: doc.parsedData.taxAmount,
          });
        } else if (doc.docType === "Expenses") {
          await expenseApi.create({
            date: doc.parsedData.date,
            amount: doc.parsedData.total,
            invoiceNumber: doc.parsedData.docNumber,
            notes: `${doc.parsedData.description}${doc.parsedData.gstin ? ` | GSTIN: ${doc.parsedData.gstin}` : ""}`,
            vendorId: doc.parsedData.contactId || null,
          });
        } else if (doc.docType === "Journal Entries") {
          const defAcc = dbAccounts[0]?._id || "";
          await journalApi.create({
            journalNumber: doc.parsedData.docNumber,
            date: doc.parsedData.date,
            referenceNumber: doc.parsedData.contactName,
            description: doc.parsedData.description,
            lineItems: doc.parsedData.lines.map((ln) => ({
              accountId: defAcc,
              debit: ln.rate >= 0 ? ln.rate : 0,
              credit: ln.rate < 0 ? Math.abs(ln.rate) : 0,
              narration: ln.description,
            })),
          });
        } else if (doc.docType === "Sales Orders") {
          await salesOrderApi.create({
            customerId: doc.parsedData.contactId || "",
            salesOrderNumber: doc.parsedData.docNumber,
            orderDate: doc.parsedData.date,
            expectedShipmentDate: doc.parsedData.dueDate || undefined,
            reference: doc.parsedData.referenceNumber || "",
            paymentTermsId: doc.parsedData.paymentTermsId || undefined,
            deliveryMethod: doc.parsedData.sourceOfSupply || "",
            salesPersonId: doc.parsedData.salesPersonId || undefined,
            placeOfSupply: doc.parsedData.placeOfSupply || "",
            lineItems: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || dbItems[0]?._id || "", name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, amount: ln.total, taxPercent: ln.taxRate };
            }),
            notes: doc.parsedData.description,
          });
        } else if (doc.docType === "Quotes") {
          await quoteApi.create({
            customerId: doc.parsedData.contactId || "",
            quoteNumber: doc.parsedData.docNumber,
            quoteDate: doc.parsedData.date,
            expiryDate: doc.parsedData.dueDate || null,
            referenceNumber: doc.parsedData.referenceNumber || "",
            salesPersonId: doc.parsedData.salesPersonId || null,
            subject: doc.parsedData.subject || "",
            placeOfSupply: doc.parsedData.placeOfSupply || "",
            items: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || null, name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, taxPercent: ln.taxRate, discountPercent: 0 };
            }),
            customerNotes: doc.parsedData.description,
            taxAmount: doc.parsedData.taxAmount,
          });
        } else if (doc.docType === "Purchase Orders") {
          await purchaseOrderApi.create({
            vendorId: doc.parsedData.contactId || "",
            purchaseOrderNumber: doc.parsedData.docNumber,
            purchaseOrderDate: doc.parsedData.date,
            deliveryDate: doc.parsedData.dueDate || null,
            paymentTermsId: doc.parsedData.paymentTermsId || null,
            referenceNumber: doc.parsedData.referenceNumber || "",
            shipmentPreference: doc.parsedData.sourceOfSupply || "",
            lineItems: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || dbItems[0]?._id || null, name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, amount: ln.qty * ln.rate };
            }),
            notes: doc.parsedData.description,
            taxAmount: doc.parsedData.taxAmount,
          });
        } else if (doc.docType === "Vendor Credits") {
          await vendorCreditApi.create({
            vendorId: doc.parsedData.contactId || "",
            vendorCreditNumber: doc.parsedData.docNumber,
            vendorCreditDate: doc.parsedData.date,
            orderNumber: doc.parsedData.orderNumber || "",
            sourceOfSupply: doc.parsedData.sourceOfSupply || doc.parsedData.placeOfSupply || "",
            destinationOfSupply: doc.parsedData.destinationOfSupply || doc.parsedData.placeOfSupply || "",
            subject: doc.parsedData.subject || "",
            lineItems: doc.parsedData.lines.map((ln) => {
              const mi = matchItem(ln.description, dbItems);
              return { itemId: mi?._id || dbItems[0]?._id || null, name: ln.description, description: ln.description, quantity: ln.qty, rate: ln.rate, taxPercent: ln.taxRate, amount: ln.qty * ln.rate };
            }),
            notes: doc.parsedData.description,
            taxAmount: doc.parsedData.taxAmount,
          });
        } else if (doc.docType === "Items") {
          let intraStateTaxId: string | undefined = undefined;
          let interStateTaxId: string | undefined = undefined;
          let legacyTaxId: string | undefined = undefined;

          if (doc.parsedData.taxPreference === "Taxable") {
            const rate = Number(doc.parsedData.taxRate || 0);
            const intraTax = dbTaxes.find((t) => t.taxType === "TaxGroup" && t.rate === rate);
            const interTax = dbTaxes.find((t) => t.taxType === "Tax" && t.taxAuthority === "IGST" && t.rate === rate);
            intraStateTaxId = intraTax?._id;
            interStateTaxId = interTax?._id;
            legacyTaxId = intraTax?._id || interTax?._id;
          }

          await itemApi.create({
            name: doc.parsedData.description,
            sku: doc.parsedData.docNumber || undefined,
            itemType: doc.parsedData.contactName === "Service" ? "Service" : "Goods",
            sellingPrice: doc.parsedData.subtotal || 0,
            costPrice: doc.parsedData.total || 0,
            description: doc.parsedData.itemDescription || "",
            hsnSacCode: doc.parsedData.hsnSacCode || undefined,
            unit: doc.parsedData.unit || undefined,
            taxPreference: (doc.parsedData.taxPreference as any) || "Taxable",
            taxId: legacyTaxId || null,
            intraStateTaxId: intraStateTaxId || null,
            interStateTaxId: interStateTaxId || null,
            inventoryTracked: !!doc.parsedData.inventoryTracked,
            stockOnHand: doc.parsedData.inventoryTracked ? Number(doc.parsedData.stockOnHand || 0) : 0,
            warehouseId: doc.parsedData.inventoryTracked ? (doc.parsedData.warehouseId || undefined) : null,
            reorderPoint: doc.parsedData.inventoryTracked ? Number(doc.parsedData.reorderPoint || 0) : 0,
            salesAccountId: doc.parsedData.salesAccountId || undefined,
            purchaseAccountId: doc.parsedData.purchaseAccountId || undefined,
            inventoryAccountId: doc.parsedData.inventoryAccountId || undefined,
          });
        } else if (doc.docType === "Inventory Adjustments") {
          const mi = matchItem(doc.parsedData.lines[0]?.description || "", dbItems);
          const mw = dbWarehouses.find((w) => w.name?.toLowerCase() === doc.parsedData.contactName?.toLowerCase()) || dbWarehouses[0];
          await inventoryApi.createAdjustment({
            itemId: mi?._id || dbItems[0]?._id || "",
            direction: doc.parsedData.subtotal >= 0 ? "Increase" : "Decrease",
            adjustmentType: "Quantity",
            quantityDelta: Math.abs(doc.parsedData.subtotal),
            unitCost: doc.parsedData.total,
            warehouseId: mw?._id,
            reason: doc.parsedData.description,
            referenceNumber: doc.parsedData.docNumber,
            notes: `Imported via batch OCR from ${doc.fileName}`,
            adjustedAt: doc.parsedData.date,
          });
        } else if (doc.docType === "Bank Statements") {
          const bankAcc = dbAccounts.find(
            (a) => a.accountType === "Bank" && (a.name?.toLowerCase().includes(doc.parsedData.contactName?.toLowerCase()) || doc.parsedData.contactName?.toLowerCase().includes(a.name?.toLowerCase()))
          ) || dbAccounts.find((a) => a.accountType === "Bank") || dbAccounts[0];
          const clearingAcc = dbAccounts.find((a) => a.name === "Documents Clearing") || dbAccounts.find((a) => a.accountType === "Expense") || dbAccounts[0];
          for (let idx = 0; idx < doc.parsedData.lines.length; idx++) {
            const ln = doc.parsedData.lines[idx];
            const amount = Math.abs(ln.total);
            if (amount <= 0) continue;
            const isDeposit = ln.total >= 0;
            await journalApi.create({
              journalNumber: `BANK-${doc.parsedData.docNumber || "STMT"}-${idx}-${Date.now()}`,
              date: doc.parsedData.date,
              description: ln.description,
              referenceNumber: doc.parsedData.docNumber,
              lineItems: isDeposit
                ? [
                    { accountId: bankAcc?._id || "", debit: amount, credit: 0, narration: ln.description },
                    { accountId: clearingAcc?._id || "", debit: 0, credit: amount, narration: ln.description },
                  ]
                : [
                    { accountId: clearingAcc?._id || "", debit: amount, credit: 0, narration: ln.description },
                    { accountId: bankAcc?._id || "", debit: 0, credit: amount, narration: ln.description },
                  ],
            });
          }
        }
        successCount++;
      } catch (err: any) {
        toast.error(`Error saving ${doc.fileName}: ${err.message || err}`);
      }
    }

    setSaveProgress(100);
    if (successCount === ocrDocuments.length) {
      setStep("success");
      onImportComplete?.(ocrDocuments.length, ocrDocuments);
    } else {
      setStep("review");
      toast.error(`Saved ${successCount}/${ocrDocuments.length} documents.`);
    }
  };

  const selectedDoc = ocrDocuments.find((d) => d.id === selectedDocId);

  // ─── EDIT FORM per doc type ─────────────────────────────────────────────
  const renderEditForm = (doc: ParsedOcrDocument) => {
    const contacts = getContactsForDocType(doc.docType);
    const isStandard = ["Invoices", "Bills", "Sales Orders", "Quotes", "Purchase Orders", "Vendor Credits"].includes(doc.docType);
    const contactLabel = ["Invoices", "Sales Orders", "Quotes"].includes(doc.docType) ? "Customer" : ["Bills", "Purchase Orders", "Vendor Credits", "Expenses"].includes(doc.docType) ? "Vendor" : "Partner";

    if (doc.docType === "Items") {
      const salesAccounts = dbAccounts.filter((a) => a.rootType === "Income");
      const purchaseAccounts = dbAccounts.filter((a) => a.rootType === "Expense");
      const inventoryAccounts = dbAccounts.filter((a) => a.rootType === "Asset");

      return (
        <div className="space-y-4 p-4 bg-white">
          {/* General Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              General Info
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Item Name *</label>
                <Input
                  value={doc.parsedData.description}
                  onChange={(e) => handleDocChange(doc.id, "description", e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Laptop HP 15s"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">SKU / Code</label>
                <Input
                  value={doc.parsedData.docNumber}
                  onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                  className={inputCls}
                  placeholder="e.g. SKU-8273"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">HSN / SAC Code</label>
                <Input
                  value={doc.parsedData.hsnSacCode || ""}
                  onChange={(e) => handleDocChange(doc.id, "hsnSacCode", e.target.value)}
                  className={inputCls + " font-mono"}
                  placeholder="e.g. 84713010"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Item Type</label>
                <Select
                  value={doc.parsedData.contactName === "Service" ? "Service" : "Goods"}
                  onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    <SelectItem value="Goods" className="text-xs">Goods</SelectItem>
                    <SelectItem value="Service" className="text-xs">Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Unit</label>
                <Select
                  value={doc.parsedData.unit || ""}
                  onValueChange={(v) => handleDocChange(doc.id, "unit", v)}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue placeholder="Select unit…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                    {dbUnits.map((u) => (
                      <SelectItem key={u._id} value={u._id} className="text-xs">
                        {u.name} ({u.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Item Description</label>
                <Input
                  value={doc.parsedData.itemDescription || ""}
                  onChange={(e) => handleDocChange(doc.id, "itemDescription", e.target.value)}
                  className={inputCls}
                  placeholder="Description for invoices/bills"
                />
              </div>
            </div>
          </div>

          {/* Financial Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Financial Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tax Preference</label>
                <Select
                  value={doc.parsedData.taxPreference || "Taxable"}
                  onValueChange={(v) => handleDocChange(doc.id, "taxPreference", v)}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    <SelectItem value="Taxable" className="text-xs">Taxable</SelectItem>
                    <SelectItem value="NonTaxable" className="text-xs">Non-Taxable</SelectItem>
                    <SelectItem value="Exempt" className="text-xs">Exempt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tax Rate %</label>
                <Input
                  type="number"
                  value={doc.parsedData.taxRate}
                  onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))}
                  disabled={doc.parsedData.taxPreference !== "Taxable"}
                  className={inputCls + " font-mono"}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sales Price (₹)</label>
                <Input
                  type="number"
                  value={doc.parsedData.subtotal}
                  onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                  className={inputCls + " font-mono"}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Purchase Price (₹)</label>
                <Input
                  type="number"
                  value={doc.parsedData.total}
                  onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                  className={inputCls + " font-mono"}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sales Account</label>
                <Select
                  value={doc.parsedData.salesAccountId || ""}
                  onValueChange={(v) => handleDocChange(doc.id, "salesAccountId", v)}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue placeholder="Select account…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                    {salesAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id} className="text-xs">
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Purchase Account</label>
                <Select
                  value={doc.parsedData.purchaseAccountId || ""}
                  onValueChange={(v) => handleDocChange(doc.id, "purchaseAccountId", v)}
                >
                  <SelectTrigger className={selectCls}>
                    <SelectValue placeholder="Select account…" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                    {purchaseAccounts.map((a) => (
                      <SelectItem key={a._id} value={a._id} className="text-xs">
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Inventory Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1 flex items-center justify-between">
              <span>Inventory Details</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none normal-case text-[10px] font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={!!doc.parsedData.inventoryTracked}
                  onChange={(e) => handleDocChange(doc.id, "inventoryTracked", e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                />
                Track Inventory for this Item
              </label>
            </h4>
            
            {doc.parsedData.inventoryTracked && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Opening Stock</label>
                  <Input
                    type="number"
                    value={doc.parsedData.stockOnHand ?? 0}
                    onChange={(e) => handleDocChange(doc.id, "stockOnHand", Number(e.target.value))}
                    className={inputCls + " font-mono"}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warehouse *</label>
                  <Select
                    value={doc.parsedData.warehouseId || ""}
                    onValueChange={(v) => handleDocChange(doc.id, "warehouseId", v)}
                  >
                    <SelectTrigger className={selectCls}>
                      <SelectValue placeholder="Select warehouse…" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900">
                      {dbWarehouses.map((w) => (
                        <SelectItem key={w._id} value={w._id} className="text-xs">
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reorder Point</label>
                  <Input
                    type="number"
                    value={doc.parsedData.reorderPoint ?? 0}
                    onChange={(e) => handleDocChange(doc.id, "reorderPoint", Number(e.target.value))}
                    className={inputCls + " font-mono"}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Inventory Account *</label>
                  <Select
                    value={doc.parsedData.inventoryAccountId || ""}
                    onValueChange={(v) => handleDocChange(doc.id, "inventoryAccountId", v)}
                  >
                    <SelectTrigger className={selectCls}>
                      <SelectValue placeholder="Select account…" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                      {inventoryAccounts.map((a) => (
                        <SelectItem key={a._id} value={a._id} className="text-xs">
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (doc.docType === "Bank Statements") {
      return (
        <div className="space-y-4 p-4 bg-white">
          {/* General Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              General Info
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Bank / Account</label>
                <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
                  <SelectTrigger className={selectCls}><SelectValue placeholder="Select bank…" /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    {(dbAccounts.filter((a) => a.accountType === "Bank").map((a) => a.name).length > 0
                      ? dbAccounts.filter((a) => a.accountType === "Bank").map((a) => a.name)
                      : ["HDFC Bank", "ICICI Bank", "SBI Bank"]
                    ).map((n) => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Statement Ref</label>
                <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Statement Date</label>
                <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
              </div>
            </div>
          </div>

          {/* Balance Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Financial Balances
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Opening Balance (₹)</label>
                <Input type="number" value={doc.parsedData.subtotal} onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))} className={inputCls + " font-mono"} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Closing Balance (₹)</label>
                <Input type="number" value={doc.parsedData.total} onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))} className={inputCls + " font-mono font-bold"} />
              </div>
            </div>
          </div>

          {/* Transactions Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Statement Transactions ({doc.parsedData.lines.length})
            </h4>
            <div className="border border-slate-200 rounded max-h-36 overflow-y-auto bg-slate-50">
              {doc.parsedData.lines.map((ln) => (
                <div key={ln.id} className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono border-b border-slate-100 last:border-0 hover:bg-slate-100/50">
                  <span className="truncate max-w-[240px] text-slate-600 font-medium">{ln.description}</span>
                  <span className={ln.rate >= 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>₹{Math.abs(ln.rate).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (doc.docType === "Inventory Adjustments") {
      return (
        <div className="space-y-4 p-4 bg-white">
          {/* General Details */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              General Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
                <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Adj. Date</label>
                <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Warehouse *</label>
                <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
                  <SelectTrigger className={selectCls}><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    {(dbWarehouses.length > 0 ? dbWarehouses.map((w) => w.name) : ["Main Warehouse", "Transit Warehouse"]).map((n) => (
                      <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reason</label>
                <Select value={["Stock Count", "Manual", "Damage", "Surplus"].includes(doc.parsedData.description) ? doc.parsedData.description : "Stock Count"} onValueChange={(v) => handleDocChange(doc.id, "description", v)}>
                  <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    <SelectItem value="Stock Count" className="text-xs">Stock Count</SelectItem>
                    <SelectItem value="Manual" className="text-xs">Manual</SelectItem>
                    <SelectItem value="Damage" className="text-xs">Damage / Write-off</SelectItem>
                    <SelectItem value="Surplus" className="text-xs">Surplus Found</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Adjustment Details */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Adjustment Specifics
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="col-span-1 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Item *</label>
                <Input value={doc.parsedData.lines[0]?.description || ""} onChange={(e) => {
                  const lines = [...doc.parsedData.lines];
                  if (lines[0]) { lines[0] = { ...lines[0], description: e.target.value }; handleDocChange(doc.id, "lines", lines); }
                }} className={inputCls} placeholder="Item name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Qty Delta</label>
                  <Input type="number" value={doc.parsedData.subtotal} onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))} className={inputCls + " font-mono"} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Unit Cost (₹)</label>
                  <Input type="number" value={doc.parsedData.total} onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))} className={inputCls + " font-mono"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (doc.docType === "Journal Entries") {
      return (
        <div className="space-y-4 p-4 bg-white">
          {/* General Details */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              General Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Journal #</label>
                <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date</label>
                <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference</label>
                <Input value={doc.parsedData.contactName} onChange={(e) => handleDocChange(doc.id, "contactName", e.target.value)} className={inputCls} placeholder="Reference / party" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Description</label>
                <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Financial Totals */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Financial Totals
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Total Debits (₹)</label>
                <Input type="number" value={doc.parsedData.subtotal} onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))} className={inputCls + " font-mono"} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Total Credits (₹)</label>
                <Input type="number" value={doc.parsedData.total} onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))} className={inputCls + " font-mono"} />
              </div>
            </div>
          </div>

          {/* Ledger Lines */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Ledger Lines ({doc.parsedData.lines.length})
            </h4>
            <div className="border border-slate-200 rounded max-h-36 overflow-y-auto divide-y divide-slate-100 bg-slate-50">
              {doc.parsedData.lines.map((ln) => (
                <div key={ln.id} className="flex gap-2 p-2 hover:bg-slate-100/50">
                  <Input value={ln.description} onChange={(e) => handleLineChange(doc.id, ln.id, "description", e.target.value)} className="h-7 text-[10px] flex-1 border-slate-200 bg-white px-2" />
                  <Input type="number" value={ln.rate} onChange={(e) => handleLineChange(doc.id, ln.id, "rate", Number(e.target.value))} className="h-7 text-[10px] w-28 font-mono border-slate-200 bg-white px-2 text-right" placeholder="Debit / Credit rate" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (doc.docType === "Expenses") {
      return (
        <div className="space-y-4 p-4 bg-white">
          {/* General Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              General Info
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expense Ref</label>
                <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expense Date</label>
                <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Paid To (Vendor)</label>
                <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
                  <SelectTrigger className={selectCls}><SelectValue placeholder="Select vendor…" /></SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Financial Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Financial Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Category</label>
                <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="e.g. Office Supplies" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Subtotal (₹)</label>
                <Input type="number" value={doc.parsedData.subtotal} onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))} className={inputCls + " font-mono"} />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Total Amount (₹)</label>
                <Input type="number" value={doc.parsedData.total} onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))} className={inputCls + " font-mono font-bold text-emerald-700"} />
              </div>
            </div>
          </div>

          {/* Compliance Section */}
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Compliance & Taxes
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">GSTIN</label>
                <Input value={doc.parsedData.gstin || ""} onChange={(e) => handleDocChange(doc.id, "gstin", e.target.value)} className={inputCls + " font-mono uppercase"} placeholder="15-char GSTIN" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Place of Supply</label>
                  <Input value={doc.parsedData.placeOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "placeOfSupply", e.target.value)} className={inputCls} placeholder="POS State" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tax Rate %</label>
                  <Input type="number" value={doc.parsedData.taxRate} onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))} className={inputCls + " font-mono"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Standard: Invoices, Bills, Sales Orders, Quotes, Purchase Orders, Vendor Credits
    let generalFieldsNode = null;
    let extraFieldsNode = null;
    let financialFieldsNode = null;

    if (doc.docType === "Invoices") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Customer Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Invoice # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. INV-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="Ref number" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order / Challan Number</label>
            <Input value={doc.parsedData.orderNumber || ""} onChange={(e) => handleDocChange(doc.id, "orderNumber", e.target.value)} className={inputCls} placeholder="SO-00001 or DC-00001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Invoice Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Payment Terms</label>
            <Select value={doc.parsedData.paymentTermsId || ""} onValueChange={(v) => handleDocChange(doc.id, "paymentTermsId", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select terms…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {dbPaymentTerms.map((pt) => <SelectItem key={pt._id} value={pt._id} className="text-xs">{pt.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Due Date</label>
            <input type="date" value={doc.parsedData.dueDate || ""} onChange={(e) => handleDocChange(doc.id, "dueDate", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Salesperson</label>
            <Select value={doc.parsedData.salesPersonId || ""} onValueChange={(v) => handleDocChange(doc.id, "salesPersonId", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select salesperson…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {dbSalesPersons.map((sp) => <SelectItem key={sp._id} value={sp._id} className="text-xs">{sp.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Subject</label>
            <Input value={doc.parsedData.subject || ""} onChange={(e) => handleDocChange(doc.id, "subject", e.target.value)} className={inputCls} placeholder="Invoice subject…" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Description / Notes</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on invoice…" />
          </div>
        </div>
      );
    } else if (doc.docType === "Bills") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select vendor…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Bill # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. BILL-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="Vendor reference" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order Number</label>
            <Input value={doc.parsedData.orderNumber || ""} onChange={(e) => handleDocChange(doc.id, "orderNumber", e.target.value)} className={inputCls} placeholder="Purchase Order Ref" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Bill Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Payment Terms</label>
            <Select value={doc.parsedData.paymentTermsId || ""} onValueChange={(v) => handleDocChange(doc.id, "paymentTermsId", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select terms…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {dbPaymentTerms.map((pt) => <SelectItem key={pt._id} value={pt._id} className="text-xs">{pt.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Due Date</label>
            <input type="date" value={doc.parsedData.dueDate || ""} onChange={(e) => handleDocChange(doc.id, "dueDate", e.target.value)} className={dateCls} />
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Source of Supply</label>
            <Input value={doc.parsedData.sourceOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "sourceOfSupply", e.target.value)} className={inputCls} placeholder="State" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Destination of Supply</label>
            <Input value={doc.parsedData.destinationOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "destinationOfSupply", e.target.value)} className={inputCls} placeholder="State" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Notes / Description</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on bill…" />
          </div>
        </div>
      );
    } else if (doc.docType === "Sales Orders") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Customer Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Sales Order # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. SO-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="Ref number" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Shipment Date</label>
            <input type="date" value={doc.parsedData.dueDate || ""} onChange={(e) => handleDocChange(doc.id, "dueDate", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Delivery Method</label>
            <Input value={doc.parsedData.sourceOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "sourceOfSupply", e.target.value)} className={inputCls} placeholder="e.g. UPS, FedEx" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Salesperson</label>
            <Select value={doc.parsedData.salesPersonId || ""} onValueChange={(v) => handleDocChange(doc.id, "salesPersonId", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select salesperson…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {dbSalesPersons.map((sp) => <SelectItem key={sp._id} value={sp._id} className="text-xs">{sp.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Notes / Description</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on sales order…" />
          </div>
        </div>
      );
    } else if (doc.docType === "Quotes") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Customer Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Quote # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. QT-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="Ref number" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Quote Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Expiry Date</label>
            <input type="date" value={doc.parsedData.dueDate || ""} onChange={(e) => handleDocChange(doc.id, "dueDate", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Salesperson</label>
            <Select value={doc.parsedData.salesPersonId || ""} onValueChange={(v) => handleDocChange(doc.id, "salesPersonId", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select salesperson…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {dbSalesPersons.map((sp) => <SelectItem key={sp._id} value={sp._id} className="text-xs">{sp.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Subject</label>
            <Input value={doc.parsedData.subject || ""} onChange={(e) => handleDocChange(doc.id, "subject", e.target.value)} className={inputCls} placeholder="Quote subject…" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Description / Notes</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on quote…" />
          </div>
        </div>
      );
    } else if (doc.docType === "Purchase Orders") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select vendor…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Purchase Order # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. PO-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Reference #</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="Ref number" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Purchase Order Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Delivery Date</label>
            <input type="date" value={doc.parsedData.dueDate || ""} onChange={(e) => handleDocChange(doc.id, "dueDate", e.target.value)} className={dateCls} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Shipment Preference</label>
            <Input value={doc.parsedData.sourceOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "sourceOfSupply", e.target.value)} className={inputCls} placeholder="e.g. Courier, Delivery" />
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Notes / Description</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on purchase order…" />
          </div>
        </div>
      );
    } else if (doc.docType === "Vendor Credits") {
      generalFieldsNode = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor Name *</label>
            <Select value={doc.parsedData.contactName} onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Select vendor…" /></SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900 max-h-48">
                {contacts.map((c) => <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Credit Note # *</label>
            <Input value={doc.parsedData.docNumber} onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)} className={inputCls} placeholder="e.g. VCN-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Order Number</label>
            <Input value={doc.parsedData.referenceNumber || ""} onChange={(e) => handleDocChange(doc.id, "referenceNumber", e.target.value)} className={inputCls} placeholder="SO-0001" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor Credit Date *</label>
            <input type="date" value={doc.parsedData.date} onChange={(e) => handleDocChange(doc.id, "date", e.target.value)} className={dateCls} />
          </div>
        </div>
      );

      extraFieldsNode = (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Source of Supply</label>
            <Input value={doc.parsedData.sourceOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "sourceOfSupply", e.target.value)} className={inputCls} placeholder="State" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Destination of Supply</label>
            <Input value={doc.parsedData.destinationOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "destinationOfSupply", e.target.value)} className={inputCls} placeholder="State" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Notes / Description</label>
            <Input value={doc.parsedData.description} onChange={(e) => handleDocChange(doc.id, "description", e.target.value)} className={inputCls} placeholder="Notes to display on vendor credit…" />
          </div>
        </div>
      );
    }

    financialFieldsNode = (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">GSTIN</label>
          <Input value={doc.parsedData.gstin || ""} onChange={(e) => handleDocChange(doc.id, "gstin", e.target.value)} className={inputCls + " font-mono uppercase"} placeholder="15-char GSTIN" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">State / POS</label>
          <Input value={doc.parsedData.placeOfSupply || ""} onChange={(e) => handleDocChange(doc.id, "placeOfSupply", e.target.value)} className={inputCls} placeholder="State" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Subtotal (₹)</label>
          <Input type="number" value={doc.parsedData.subtotal} onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))} className={inputCls + " font-mono"} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Tax Rate / Amount</label>
          <div className="flex gap-1">
            <Input type="number" value={doc.parsedData.taxRate} onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))} className={inputCls + " font-mono w-16"} placeholder="%" />
            <Input type="number" value={doc.parsedData.taxAmount} disabled className={disabledCls + " flex-1"} />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Total (₹) *</label>
          <Input type="number" value={doc.parsedData.total} onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))} className={inputCls + " font-mono font-bold border-2 border-emerald-400"} />
        </div>
      </div>
    );

    return (
      <div className="space-y-4 p-4 bg-white">
        {/* General Details */}
        <div>
          <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
            General Details
          </h4>
          {generalFieldsNode}
        </div>

        {/* Financial & Compliance Info */}
        <div>
          <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
            Financial & Tax Details
          </h4>
          {financialFieldsNode}
        </div>

        {/* Notes/Notes description */}
        {extraFieldsNode && (
          <div>
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2 border-b border-emerald-100 pb-1">
              Supply & Notes
            </h4>
            {extraFieldsNode}
          </div>
        )}

        {/* Line Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide border-b border-emerald-100 pb-1 flex-1 mr-4">
              Line Items ({doc.parsedData.lines.length})
            </h4>
            <button
              onClick={() => {
                const newLine: OcrLineItem = { id: `l-${Date.now()}`, description: "New Item", qty: 1, rate: 0, taxRate: doc.parsedData.taxRate, total: 0 };
                handleDocChange(doc.id, "lines", [...doc.parsedData.lines, newLine]);
              }}
              className="text-[10px] text-slate-500 hover:text-slate-700 flex items-center gap-1 font-medium transition-colors border border-slate-200 rounded px-2 py-1 bg-slate-50 hover:bg-slate-100 shadow-sm"
            >
              <Plus className="h-3 w-3" /> Add Line Item
            </button>
          </div>
          {doc.parsedData.lines.length > 0 ? (
            <div className="border border-slate-200 rounded overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-50 text-[9px] font-bold text-slate-500 uppercase px-3 py-2 border-b border-slate-200">
                <span className="col-span-5">Description</span>
                <span className="col-span-2 text-right">Qty</span>
                <span className="col-span-2 text-right">Rate (₹)</span>
                <span className="col-span-2 text-right">Total (₹)</span>
                <span className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto bg-white">
                {doc.parsedData.lines.map((ln) => (
                  <div key={ln.id} className="grid grid-cols-12 gap-1 px-3 py-1.5 items-center hover:bg-slate-50/50">
                    <div className="col-span-5">
                      <Input value={ln.description} onChange={(e) => handleLineChange(doc.id, ln.id, "description", e.target.value)} className="h-7 text-[10px] border-slate-200 bg-transparent px-1.5 focus-visible:ring-1 focus-visible:ring-emerald-400" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" value={ln.qty} onChange={(e) => handleLineChange(doc.id, ln.id, "qty", Number(e.target.value))} className="h-7 text-[10px] font-mono text-right border-slate-200 bg-transparent px-1.5 focus-visible:ring-1 focus-visible:ring-emerald-400" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" value={ln.rate} onChange={(e) => handleLineChange(doc.id, ln.id, "rate", Number(e.target.value))} className="h-7 text-[10px] font-mono text-right border-slate-200 bg-transparent px-1.5 focus-visible:ring-1 focus-visible:ring-emerald-400" />
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-mono text-slate-700 font-semibold block text-right pr-2">₹{ln.total.toFixed(2)}</span>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button onClick={() => handleDocChange(doc.id, "lines", doc.parsedData.lines.filter((l) => l.id !== ln.id))} className="text-slate-300 hover:text-rose-500 transition-colors p-1 hover:bg-rose-50 rounded">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded">
              No line items extracted — click "Add Line Item" to add manually
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── MAIN CONTENT ───────────────────────────────────────────────────────

  const mainContent = (
    <div
      className={`flex flex-col overflow-hidden bg-white text-slate-900 ${
        isFullScreenPage
          ? "w-full h-full flex-1 min-h-[calc(100vh-60px)]"
          : "max-w-7xl w-[97vw] h-[92vh] rounded-xl border border-slate-200 shadow-2xl"
      }`}
    >
      {/* ── Header ── */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <FileUp className="h-4.5 w-4.5 text-emerald-700" />
          </div>
          <div>
            {isFullScreenPage ? (
              <h2 className="text-base font-bold text-slate-900">Document Batch Import</h2>
            ) : (
              <DialogTitle className="text-base font-bold text-slate-900">Document Batch Import</DialogTitle>
            )}
            {isFullScreenPage ? (
              <p className="text-[11px] text-slate-500">Upload PDF, images, Excel or Word to extract data automatically</p>
            ) : (
              <DialogDescription className="text-[11px] text-slate-500">Upload PDF, images, Excel or Word to extract data automatically</DialogDescription>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Step indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px]">
            {(["upload", "processing", "review", "saving", "success"] as const).map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <span className="text-slate-300">›</span>}
                <span className={`font-medium capitalize px-2 py-0.5 rounded-full ${
                  step === s ? "bg-slate-800 text-white" : step === "success" || (["upload","processing","review","saving"].indexOf(step) > i) ? "text-emerald-600" : "text-slate-400"
                }`}>{s}</span>
              </React.Fragment>
            ))}
          </div>

          {step === "upload" && (
            <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
              <span className="text-[11px] text-slate-600 font-medium">Type:</span>
              <Select value={docType} onValueChange={(v) => setDocType(v as OcrDocType)}>
                <SelectTrigger className="h-7 w-40 bg-transparent border-0 text-xs text-slate-900 focus:ring-0 p-0 font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {docTypeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* ── Dynamic Content Area ── */}
      <div className="flex-1 min-h-0 bg-white overflow-hidden relative">

        {/* STEP 1: UPLOAD */}
        {step === "upload" && (
          <div className="h-full flex flex-col p-5 overflow-y-auto">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-10 transition-all cursor-pointer select-none ${
                isDragOver
                  ? "border-slate-500 bg-slate-50 scale-[0.99]"
                  : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              <input type="file" multiple ref={fileInputRef} className="hidden"
                accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.pdf,.xls,.xlsx,.doc,.docx"
                onChange={(e) => handleFilesAdded(e.target.files)} />
              <div className="w-14 h-14 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4">
                <UploadCloud className="h-7 w-7 text-slate-500" />
              </div>
              <h3 className="text-sm font-semibold text-slate-800 mb-1">Drag & drop files here, or click to browse</h3>
              <p className="text-xs text-slate-500 max-w-sm text-center leading-relaxed">
                Supports <strong>PDF</strong> (multi-page), <strong>Images</strong> (PNG, JPG, WEBP, TIFF), <strong>Excel</strong> (.xlsx/.xls) and <strong>Word</strong> (.docx) · Up to 25 MB each
              </p>
              <div className="flex items-center gap-6 mt-6">
                {[
                  { icon: <FileText className="h-4 w-4 text-rose-500" />, label: "PDF" },
                  { icon: <ImageIcon className="h-4 w-4 text-blue-500" />, label: "Images" },
                  { icon: <FileSpreadsheet className="h-4 w-4 text-emerald-600" />, label: "Excel" },
                  { icon: <FileCode className="h-4 w-4 text-indigo-500" />, label: "Word" },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center">{icon}</div>
                    <span className="text-[10px] font-medium text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden shrink-0">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Upload Queue — {uploadedFiles.length} file(s)</span>
                  <button onClick={() => setUploadedFiles([])} className="text-[11px] text-rose-500 hover:text-rose-600 font-medium transition-colors">Clear All</button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {uploadedFiles.map((file, idx) => {
                    const ext = file.name.split(".").pop()?.toLowerCase() || "";
                    return (
                      <div key={idx} className="px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
                            {ext === "pdf" ? <FileText className="h-4 w-4 text-rose-500" /> :
                             ["xls","xlsx"].includes(ext) ? <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> :
                             ["png","jpg","jpeg","webp","gif","bmp","tiff"].includes(ext) ? <ImageIcon className="h-4 w-4 text-blue-500" /> :
                             <FileCode className="h-4 w-4 text-indigo-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{file.name}</p>
                            <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB · {ext.toUpperCase()}</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile(idx)} className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PROCESSING */}
        {step === "processing" && (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-slate-50/50">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl shadow-lg p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Spinner & status */}
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-emerald-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileUp className="h-6 w-6 text-emerald-600 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Processing Documents</h3>
                  <p className="text-xs text-slate-500 mt-1 min-h-4" title={loaderMessage}>
                    {loaderMessage}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Please wait, extracting details…</span>
                  <span className="font-mono font-bold text-slate-700">{processProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${processProgress}%` }}
                  />
                </div>
              </div>

              {/* File list */}
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
                {uploadedFiles.map((f, idx) => {
                  const ext = f.name.split(".").pop()?.toLowerCase() || "";
                  const isDone = idx < currentFileIdx;
                  const isActive = idx === currentFileIdx;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                        isActive ? "bg-slate-50" : ""
                      }`}
                    >
                      {/* Status dot */}
                      <div className="shrink-0">
                        {isDone ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center">
                            <Check className="h-3 w-3 text-emerald-600" />
                          </div>
                        ) : isActive ? (
                          <div className="w-5 h-5 rounded-full border-2 border-t-emerald-600 border-emerald-200 animate-spin" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-white" />
                        )}
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${
                          isDone ? "text-emerald-700" : isActive ? "text-slate-800" : "text-slate-400"
                        }`}>{f.name}</p>
                        {isActive ? (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <p className="text-[10px] text-slate-500">{currentPhase}</p>
                            {currentFilePageCount > 1 && (
                              <p className="text-[9px] text-emerald-600 font-medium animate-pulse">
                                Scanning page {currentFileCurrentPage} of {currentFilePageCount}…
                              </p>
                            )}
                          </div>
                        ) : isDone ? (
                          <p className="text-[10px] text-emerald-600 font-medium">Processed</p>
                        ) : null}
                      </div>

                      {/* Size + type */}
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="text-center text-[10px] text-slate-400">
                Multi-page PDFs or Excel workbooks may take a few seconds longer.
              </p>
            </div>
          </div>
        )}


        {/* STEP 3: REVIEW */}
        {step === "review" && (
          <div className="h-full flex divide-x divide-slate-200">
            {/* Left: File Preview Panel */}
            <div className="w-[38%] shrink-0 flex flex-col bg-slate-50 overflow-hidden border-r border-slate-200">
              {/* Preview header with doc selector */}
              <div className="px-3 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between shrink-0">
                <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-slate-500" /> Original File Preview
                </span>
                <span className="text-[10px] text-slate-600 bg-slate-200 px-2 py-0.5 rounded font-mono">
                  {selectedDoc?.docType}
                </span>
              </div>

              {/* Document thumbnails */}
              <div className="flex overflow-x-auto bg-slate-100 border-b border-slate-200 shrink-0 py-2 px-2 gap-1.5">
                {ocrDocuments.map((doc) => {
                  const ext = doc.fileName.split(".").pop()?.toLowerCase() || "";
                  const isSelected = doc.id === selectedDocId;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className={`shrink-0 w-24 text-left rounded-lg p-2 border transition-all ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        {ext === "pdf" ? <FileText className="h-3.5 w-3.5 text-rose-500 shrink-0" /> :
                         ["xls","xlsx"].includes(ext) ? <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> :
                         ["png","jpg","jpeg","webp"].includes(ext) ? <ImageIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" /> :
                         <FileCode className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                        {doc.validationStatus === "valid" ? <Check className="h-3 w-3 text-emerald-500 ml-auto shrink-0" /> :
                         doc.validationStatus === "warning" ? <AlertTriangle className="h-3 w-3 text-amber-500 ml-auto shrink-0" /> :
                         <X className="h-3 w-3 text-rose-500 ml-auto shrink-0" />}
                      </div>
                      <p className={`text-[9px] truncate font-medium ${isSelected ? "text-slate-900 font-semibold" : "text-slate-600"}`}>{doc.fileName}</p>
                      <p className={`text-[9px] font-mono mt-0.5 ${isSelected ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>₹{doc.parsedData.total.toLocaleString("en-IN")}</p>
                    </button>
                  );
                })}
              </div>

              {/* Actual file preview */}
              <div className="flex-1 overflow-hidden bg-white">
                <FilePreview file={selectedDoc?.file} />
              </div>
            </div>

            {/* Right: Review & Edit workspace */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">Review & Edit Extracted Data</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">Total: <span className="font-bold text-slate-800 font-mono">₹{ocrDocuments.reduce((s, d) => s + d.parsedData.total, 0).toLocaleString("en-IN")}</span></span>
                  <Badge className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono">
                    {ocrDocuments.filter((d) => d.validationStatus === "valid").length}/{ocrDocuments.length} Ready
                  </Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {ocrDocuments.map((doc) => {
                  const isSelected = doc.id === selectedDocId;
                  const isExpanded = expandedDocId === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        isSelected
                          ? "border-slate-400 shadow-sm"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => setSelectedDocId(doc.id)}
                    >
                      {/* Document header bar */}
                      <div className={`px-4 py-2.5 flex items-center justify-between ${
                        doc.validationStatus === "error" ? "bg-rose-50 border-b border-rose-100"
                        : doc.validationStatus === "warning" ? "bg-amber-50 border-b border-amber-100"
                        : "bg-slate-50 border-b border-slate-100"
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            doc.validationStatus === "valid" ? "bg-emerald-500"
                            : doc.validationStatus === "warning" ? "bg-amber-500"
                            : "bg-rose-500"
                          }`} />
                          <span className="text-xs font-mono text-slate-600 truncate max-w-[160px]">{doc.fileName}</span>
                          <Badge variant="outline" className="text-[9px] py-0 border-slate-300 text-slate-600 font-mono">{doc.docType}</Badge>
                          {doc.parsedData.docNumber && (
                            <span className="text-[10px] text-slate-500 font-mono">#{doc.parsedData.docNumber}</span>
                          )}
                          {doc.validationMessage && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-700">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[180px]">{doc.validationMessage}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-mono font-bold text-slate-800">₹{doc.parsedData.total.toLocaleString("en-IN")}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedDocId(isExpanded ? null : doc.id); }}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all"
                            title={isExpanded ? "Collapse" : "Expand edit form"}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOcrDocuments((prev) => prev.filter((d) => d.id !== doc.id)); }}
                            className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            title="Remove document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Edit form — always visible for selected, expandable for others */}
                      {(isSelected || isExpanded) && (
                        <div className="border-t border-slate-100">
                          {renderEditForm(doc)}
                        </div>
                      )}

                      {/* Compact summary when not selected/expanded */}
                      {!isSelected && !isExpanded && (
                        <div className="px-4 py-2 flex items-center gap-4 text-[10px] text-slate-500 bg-white">
                          {doc.parsedData.contactName && <span className="font-medium text-slate-700">{doc.parsedData.contactName}</span>}
                          {doc.parsedData.date && <span>{doc.parsedData.date}</span>}
                          {doc.parsedData.gstin && <span className="font-mono">{doc.parsedData.gstin}</span>}
                          <span className="ml-auto text-[10px] text-slate-400">{doc.parsedData.lines.length} line item(s)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: SAVING */}
        {step === "saving" && (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-white">
            <div className="max-w-md w-full text-center space-y-6">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckSquare className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Syncing to Ledger</h3>
                <p className="text-sm text-slate-500 font-mono mt-1 min-h-5">{saveMessage}</p>
              </div>
              <div className="space-y-1.5">
                <Progress value={saveProgress} className="h-2 bg-slate-100" />
                <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                  <span>Database commit active…</span>
                  <span>{saveProgress}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: SUCCESS */}
        {step === "success" && (
          <div className="h-full flex flex-col items-center justify-center p-8 bg-white">
            <div className="max-w-md w-full text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Bulk Import Completed!</h3>
                <p className="text-sm text-slate-500 mt-1">
                  All <span className="font-bold text-emerald-600">{ocrDocuments.length}</span> documents have been verified and synced to your ledger.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-left">
                <div className="flex justify-between text-xs text-slate-500"><span>Documents Processed</span><span className="font-bold text-slate-800">{ocrDocuments.length}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Ledger Entries Created</span><span className="font-bold text-slate-800">{ocrDocuments.length}</span></div>
                <div className="flex justify-between text-xs text-slate-500"><span>Compliance Status</span><span className="font-bold text-emerald-600">100% Compliant</span></div>
                <div className="border-t border-slate-200 pt-3 flex justify-between text-sm font-bold text-slate-800">
                  <span>Total Synced</span>
                  <span className="font-mono">₹{ocrDocuments.reduce((s, d) => s + d.parsedData.total, 0).toLocaleString("en-IN")}</span>
                </div>
              </div>
              <Button onClick={handleClose} className="bg-slate-900 hover:bg-slate-800 text-white px-8 font-medium shadow">
                Done & Close
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div className="text-slate-400 text-xs font-mono">
          {step === "upload" && `${uploadedFiles.length} file(s) queued`}
          {step === "review" && `${ocrDocuments.length} document(s) ready · ${ocrDocuments.filter((d) => d.validationStatus === "error").length} error(s)`}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 text-xs h-8">
            Cancel
          </Button>

          {step === "upload" && (
            <Button size="sm" onClick={startProcessing} disabled={uploadedFiles.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-8 flex items-center gap-1.5 text-xs shadow">
              <FileUp className="h-3.5 w-3.5" />
              Process Documents
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}

          {step === "review" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}
                className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 h-8 flex items-center gap-1.5 text-xs">
                <UploadCloud className="h-3.5 w-3.5" /> Add More
              </Button>
              <Button size="sm" onClick={handleSaveAndUpload}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium h-8 flex items-center gap-1.5 text-xs shadow">
                <CheckSquare className="h-3.5 w-3.5" /> Save & Sync All
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (isFullScreenPage) return mainContent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[97vw] h-[92vh] p-0 flex flex-col overflow-hidden bg-white border border-slate-200 text-slate-900 rounded-xl shadow-2xl [&>button]:text-slate-500 [&>button]:hover:text-slate-900">
        {mainContent}
      </DialogContent>
    </Dialog>
  );
}
