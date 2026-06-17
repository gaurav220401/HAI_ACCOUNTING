"use client";

import React, { useState, useRef, useEffect } from "react";
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
  Search,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit,
  Eye,
  Check,
  X,
  Loader2,
  FileCode,
  CheckSquare,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

export type OcrDocType = "Invoices" | "Bills" | "Expenses" | "Journal Entries" | "Sales Orders" | "Quotes" | "Purchase Orders" | "Vendor Credits" | "Items" | "Bank Statements" | "Inventory Adjustments";

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
  parsedData: {
    docNumber: string;
    date: string;
    contactName: string;
    subtotal: number;
    taxRate: number; // e.g. 18 for 18%
    taxAmount: number;
    total: number;
    description: string;
    lines: OcrLineItem[];
  };
  validationStatus: "valid" | "warning" | "error";
  validationMessage?: string;
  // Visual positions of detected OCR bounding boxes for the file preview
  boundingBoxes: Array<{
    id: string;
    label: string;
    value: string;
    x: number; // percentage from left (0-100)
    y: number; // percentage from top (0-100)
    w: number; // percentage width
    h: number; // percentage height
    fieldName: string; // matches parsedData keys
  }>;
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

// ─── MOCK DATA GENERATORS ────────────────────────────────────────────────────

const MOCK_CONTACTS = {
  sales: ["Acme Corp", "TechNova Solutions", "Global Trading Inc", "Vanguard Industries", "Zephyr Digital"],
  purchases: ["Office Depot", "Amazon Web Services", "Grid Power Corp", "City Stationery Ltd", "Deloitte Advisory"],
  accountant: ["General Ledger", "Acme Corp", "Amazon Web Services", "Opening Balances Offset"],
  items: ["Internal Inventory", "Hardware Supplier Ltd", "Stationery Supplier", "Services Provider Inc"],
  banking: ["HDFC Bank", "ICICI Bank", "SBI Bank", "Axis Bank"],
  inventory: ["Main Warehouse", "Transit Warehouse", "Damage Control", "Adjustment Adjustment"]
};

const getMockContacts = (section: string) => {
  if (section === "sales") return MOCK_CONTACTS.sales;
  if (section === "purchases") return MOCK_CONTACTS.purchases;
  if (section === "items") return MOCK_CONTACTS.items;
  if (section === "banking") return MOCK_CONTACTS.banking;
  if (section === "inventory") return MOCK_CONTACTS.inventory;
  return MOCK_CONTACTS.accountant;
};

// Generates fake OCR parser results based on filename and type
const generateMockOcrResult = (file: File, docType: OcrDocType, section: string): ParsedOcrDocument => {
  const fileBaseName = file.name;
  const sizeKb = (file.size / 1024).toFixed(1) + " KB";
  
  // Date calculations
  const today = new Date();
  const formatYmd = (d: Date) => d.toISOString().split("T")[0];
  
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const contacts = getMockContacts(section);
  const contactName = contacts[Math.floor(Math.random() * contacts.length)] || "Unknown Party";

  // Create document-specific fields
  let docNumber = "";
  let subtotal = 1000;
  let taxRate = 18;
  let lines: OcrLineItem[] = [];
  let description = "Imported via Intelligent OCR Service";

  if (docType === "Invoices" || docType === "Sales Orders" || docType === "Quotes") {
    docNumber = (docType === "Invoices" ? "INV-" : docType === "Sales Orders" ? "SO-" : "QT-") + randomSuffix;
    subtotal = Math.floor(150 + Math.random() * 8000);
    lines = [
      {
        id: "l1",
        description: "Professional IT Consulting Services",
        qty: 1,
        rate: subtotal,
        taxRate: taxRate,
        total: Math.round(subtotal * (1 + taxRate / 100) * 100) / 100,
      }
    ];
  } else if (docType === "Bills" || docType === "Expenses" || docType === "Vendor Credits" || docType === "Purchase Orders") {
    docNumber = (docType === "Bills" ? "BILL-" : docType === "Expenses" ? "EXP-" : docType === "Vendor Credits" ? "VCR-" : "PO-") + randomSuffix;
    subtotal = Math.floor(50 + Math.random() * 2000);
    lines = [
      {
        id: "l1",
        description: docType === "Expenses" ? "Travel Expense / Meals" : docType === "Vendor Credits" ? "Vendor Credit Claim" : docType === "Purchase Orders" ? "Purchase of Goods/Materials" : "Monthly Software Subscription Fee",
        qty: 1,
        rate: subtotal,
        taxRate: taxRate,
        total: Math.round(subtotal * (1 + taxRate / 100) * 100) / 100,
      }
    ];
  } else if (docType === "Items") {
    docNumber = "ITEM-" + randomSuffix;
    subtotal = Math.floor(100 + Math.random() * 500);
    lines = [
      { id: "l1", description: "Standard Office Chair", qty: 1, rate: subtotal, taxRate: 18, total: Math.round(subtotal * 1.18 * 100) / 100 },
      { id: "l2", description: "Ergonomic Mechanical Keyboard", qty: 1, rate: subtotal * 1.5, taxRate: 18, total: Math.round(subtotal * 1.5 * 1.18 * 100) / 100 }
    ];
    taxRate = 18;
  } else if (docType === "Bank Statements") {
    docNumber = "STMT-" + randomSuffix;
    subtotal = Math.floor(10000 + Math.random() * 50000);
    lines = [
      { id: "l1", description: "NEFT Inward Credit - Customer Payment", qty: 1, rate: subtotal, taxRate: 0, total: subtotal },
      { id: "l2", description: "Monthly Bank Service Charges", qty: 1, rate: -150, taxRate: 18, total: -177 }
    ];
    taxRate = 0;
  } else if (docType === "Inventory Adjustments") {
    docNumber = "ADJ-" + randomSuffix;
    subtotal = Math.floor(100 + Math.random() * 1000);
    lines = [
      { id: "l1", description: "Damaged office goods write-off", qty: -5, rate: 150, taxRate: 0, total: -750 },
      { id: "l2", description: "Found inventory surplus reconciliation", qty: 2, rate: 200, taxRate: 0, total: 400 }
    ];
    taxRate = 0;
  } else {
    // Journal entry
    docNumber = "JV-" + randomSuffix;
    subtotal = Math.floor(1000 + Math.random() * 5000);
    lines = [
      { id: "l1", description: "Office Equipment Purchase Debit", qty: 1, rate: subtotal, taxRate: 0, total: subtotal },
      { id: "l2", description: "Cash / Bank Account Credit", qty: 1, rate: subtotal, taxRate: 0, total: subtotal }
    ];
    taxRate = 0;
  }

  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  // Let's create beautiful bounding box positions on the simulated page (values are percentages)
  const boundingBoxes = [
    { id: "b1", label: "Doc Number", value: docNumber, x: 75, y: 8, w: 20, h: 4, fieldName: "docNumber" },
    { id: "b2", label: "Date", value: formatYmd(today), x: 75, y: 14, w: 18, h: 3, fieldName: "date" },
    { id: "b3", label: "Party", value: contactName, x: 8, y: 20, w: 35, h: 8, fieldName: "contactName" },
    { id: "b4", label: "Subtotal", value: subtotal.toFixed(2), x: 75, y: 65, w: 18, h: 3, fieldName: "subtotal" },
    { id: "b5", label: "Tax Amount", value: taxAmount.toFixed(2), x: 75, y: 70, w: 18, h: 3, fieldName: "taxAmount" },
    { id: "b6", label: "Total Amount", value: total.toFixed(2), x: 75, y: 76, w: 20, h: 4, fieldName: "total" }
  ];

  // Randomly throw some warnings on some documents to simulate validation
  const validationStatus = Math.random() > 0.65 ? "warning" : "valid";
  const validationMessage = validationStatus === "warning" ? "Contact match is low confidence. Please verify." : undefined;

  return {
    id: `doc-${randomSuffix}`,
    fileName: fileBaseName,
    fileSize: sizeKb,
    fileType: file.type,
    docType,
    parsedData: {
      docNumber,
      date: formatYmd(today),
      contactName,
      subtotal,
      taxRate,
      taxAmount,
      total,
      description,
      lines,
    },
    validationStatus,
    validationMessage,
    boundingBoxes
  };
};

export default function BulkOcrImport({
  open,
  onOpenChange,
  section,
  defaultDocType,
  onImportComplete,
  isFullScreenPage = false,
  backUrl
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

  // OCR color highlights for successfully extracted fields
  const ocrInputClass = "h-8 bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-300 text-xs text-slate-900 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.04)]";
  const ocrDateClass = "w-full h-8 bg-emerald-50/20 hover:bg-emerald-50/40 border border-emerald-300 rounded px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.04)]";
  const ocrSelectClass = "h-8 bg-emerald-50/20 hover:bg-emerald-50/40 border-emerald-300 text-xs text-slate-900 focus:ring-emerald-500 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.04)]";
  const ocrDisabledClass = "h-8 bg-slate-50 border-slate-200 text-xs text-slate-400 font-mono cursor-not-allowed";
  
  // Doc Type options based on section
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

  const [docType, setDocType] = useState<OcrDocType>(
    defaultDocType || docTypeOptions[0]
  );

  // Workflow steps: "upload" | "processing" | "review" | "saving" | "success"
  const [step, setStep] = useState<"upload" | "processing" | "review" | "saving" | "success">("upload");
  
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [ocrDocuments, setOcrDocuments] = useState<ParsedOcrDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  
  // Processing animation states
  const [processProgress, setProcessProgress] = useState(0);
  const [loaderMessage, setLoaderMessage] = useState("");
  const loaderMessagesList = [
    "Initializing secure upload tunnel...",
    "Executing optical character recognition (OCR) engines...",
    "Applying multi-language layout detection...",
    "Scanning line items & tabular structures...",
    "Validating mathematical totals and Tax IDs...",
    "Mapping contacts against local database charts..."
  ];

  // Save states
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Sync default type when section changes
  useEffect(() => {
    setDocType(defaultDocType || docTypeOptions[0]);
  }, [section, defaultDocType]);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setUploadedFiles([]);
      setOcrDocuments([]);
      setSelectedDocId(null);
      setProcessProgress(0);
      setSaveProgress(0);
    }
  }, [open]);

  // Handle file drop/selection
  const handleFilesAdded = (files: FileList | null) => {
    if (!files) return;
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase();
      const validTypes = ["png", "jpg", "jpeg", "pdf", "xls", "xlsx", "doc", "docx"];
      if (ext && validTypes.includes(ext)) {
        validFiles.push(file);
      } else {
        toast.error(`Invalid file type: ${file.name}. Only PDF, Excel, Word, and Images are supported.`);
      }
    }
    
    if (validFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...validFiles]);
      toast.success(`${validFiles.length} file(s) added successfully.`);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop events
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFilesAdded(e.dataTransfer.files);
  };

  // Run the mock OCR processing
  const startProcessing = () => {
    if (uploadedFiles.length === 0) {
      toast.warning("Please upload at least one document to process.");
      return;
    }

    setStep("processing");
    setProcessProgress(0);
    
    // Simulate OCR progress
    let currentPercent = 0;
    let messageIndex = 0;
    setLoaderMessage(loaderMessagesList[0]);

    const interval = setInterval(() => {
      currentPercent += Math.floor(Math.random() * 10) + 5;
      if (currentPercent >= 100) {
        currentPercent = 100;
        clearInterval(interval);
        
        // Generate parsed documents
        const results = uploadedFiles.map(file => generateMockOcrResult(file, docType, section));
        setOcrDocuments(results);
        setSelectedDocId(results[0]?.id || null);
        setStep("review");
        toast.success("OCR document analysis completed.");
      } else {
        setProcessProgress(currentPercent);
        // Change messages dynamically
        const newMsgIdx = Math.min(
          Math.floor((currentPercent / 100) * loaderMessagesList.length),
          loaderMessagesList.length - 1
        );
        if (newMsgIdx !== messageIndex) {
          messageIndex = newMsgIdx;
          setLoaderMessage(loaderMessagesList[messageIndex]);
        }
      }
    }, 250);
  };

  // Handle inline changes in review grid
  const handleDocChange = (docId: string, field: string, value: any) => {
    setOcrDocuments(prev => prev.map(doc => {
      if (doc.id !== docId) return doc;
      
      const updatedData = { ...doc.parsedData, [field]: value };
      
      // Auto-recalc tax and total if subtotal or taxRate changes
      if (field === "subtotal" || field === "taxRate") {
        const sub = Number(updatedData.subtotal || 0);
        const rate = Number(updatedData.taxRate || 0);
        updatedData.taxAmount = Math.round(sub * (rate / 100) * 100) / 100;
        updatedData.total = Math.round((sub + updatedData.taxAmount) * 100) / 100;
      }
      
      // Auto-recalc subtotal if total changes
      if (field === "total") {
        const tot = Number(updatedData.total || 0);
        const rate = Number(updatedData.taxRate || 0);
        updatedData.subtotal = Math.round((tot / (1 + rate / 100)) * 100) / 100;
        updatedData.taxAmount = Math.round((tot - updatedData.subtotal) * 100) / 100;
      }

      // Check validation status
      let validationStatus: "valid" | "warning" | "error" = "valid";
      let validationMessage = "";

      if (!updatedData.docNumber) {
        validationStatus = "error";
        validationMessage = "Document Number is required.";
      } else if (!updatedData.contactName) {
        validationStatus = "warning";
        validationMessage = "Please select/assign a partner contact.";
      } else if (updatedData.total <= 0) {
        validationStatus = "error";
        validationMessage = "Total must be greater than zero.";
      }

      return {
        ...doc,
        parsedData: updatedData,
        validationStatus,
        validationMessage: validationMessage || undefined
      };
    }));
  };

  // Handle bulk submission
  const handleSaveAndUpload = () => {
    // Check if any error validation
    const hasErrors = ocrDocuments.some(d => d.validationStatus === "error");
    if (hasErrors) {
      toast.error("Please resolve all validation errors before uploading.");
      return;
    }

    setStep("saving");
    setSaveProgress(0);
    setSaveMessage("Initializing database upload...");

    let current = 0;
    const interval = setInterval(() => {
      current += 20;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setStep("success");
        if (onImportComplete) {
          onImportComplete(ocrDocuments.length, ocrDocuments);
        }
      } else {
        setSaveProgress(current);
        const docIdx = Math.min(Math.floor((current / 100) * ocrDocuments.length), ocrDocuments.length - 1);
        setSaveMessage(`Importing transaction ${docIdx + 1} of ${ocrDocuments.length}: ${ocrDocuments[docIdx].parsedData.docNumber}...`);
      }
    }, 400);
  };

  const selectedDoc = ocrDocuments.find(d => d.id === selectedDocId);
  const contactsList = getMockContacts(section);

  const mainContent = (
    <div className={`flex flex-col overflow-hidden bg-white text-slate-900 ${
      isFullScreenPage 
        ? "w-full h-full flex-1 min-h-[calc(100vh-60px)]" 
        : "max-w-6xl w-[95vw] h-[90vh] rounded-xl border border-slate-200 shadow-2xl [&>button]:text-slate-500 [&>button]:hover:text-slate-900"
    }`}>
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div>
          {isFullScreenPage ? (
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <FileText className="h-5 w-5 text-slate-700" />
              Document Batch Import
            </h2>
          ) : (
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <FileText className="h-5 w-5 text-slate-700" />
              Document Batch Import
            </DialogTitle>
          )}
          {isFullScreenPage ? (
            <p className="text-slate-500 text-xs mt-1">
              Upload PDF or image files to extract text details, edit values, and save to ledger.
            </p>
          ) : (
            <DialogDescription className="text-slate-500 text-xs mt-1">
              Upload PDF or image files to extract text details, edit values, and save to ledger.
            </DialogDescription>
          )}
        </div>
          
          {step === "upload" && (
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-xs text-slate-700 font-medium">Document Type:</span>
              <Select value={docType} onValueChange={(v) => setDocType(v as OcrDocType)}>
                <SelectTrigger className="h-7 w-40 bg-white border-slate-300 text-xs text-slate-900 focus:ring-slate-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {docTypeOptions.map((opt) => (
                    <SelectItem key={opt} value={opt} className="hover:bg-slate-100 focus:bg-slate-100 text-xs text-slate-900">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Dynamic Workflow Area */}
        <div className="flex-1 min-h-0 bg-white overflow-hidden relative">
          
          {/* STEP 1: UPLOAD FILES */}
          {step === "upload" && (
            <div className="h-full flex flex-col p-6 overflow-y-auto bg-white">
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 transition-all ${
                  isDragOver
                    ? "border-slate-400 bg-slate-50 scale-[0.99]"
                    : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  className="hidden"
                  accept=".png,.jpg,.jpeg,.pdf,.xls,.xlsx,.doc,.docx"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />
                
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-4 group">
                  <UploadCloud className="h-8 w-8 text-slate-500 group-hover:scale-105 transition-transform" />
                </div>
                
                <h3 className="text-base font-semibold text-slate-800 mb-1">
                  Drag and drop files here to parse
                </h3>
                
                <p className="text-xs text-slate-500 mb-6 max-w-sm text-center">
                  Supports Images (PNG, JPG), PDF, Microsoft Excel, and Word files up to 25MB each.
                </p>
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium shadow transition-all flex items-center gap-2"
                >
                  <FileUp className="h-4 w-4" />
                  Select Files
                </Button>
              </div>

              {/* Upload Queue */}
              {uploadedFiles.length > 0 && (
                <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 shrink-0">
                  <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Upload Queue ({uploadedFiles.length} files)
                    </span>
                    <button
                      onClick={() => setUploadedFiles([])}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-200">
                    {uploadedFiles.map((file, idx) => {
                      const ext = file.name.split(".").pop()?.toLowerCase() || "";
                      return (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 group">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-white border border-slate-200 shrink-0">
                              {ext === "pdf" ? (
                                <FileText className="h-5 w-5 text-rose-500" />
                              ) : ["xls", "xlsx"].includes(ext) ? (
                                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                              ) : ["png", "jpg", "jpeg"].includes(ext) ? (
                                <ImageIcon className="h-5 w-5 text-blue-500" />
                              ) : (
                                <FileCode className="h-5 w-5 text-slate-600" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate pr-4">{file.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => removeFile(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                          >
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

          {/* STEP 2: SHIMMER LOADER / PROCESSING */}
          {step === "processing" && (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-white">
              <div className="max-w-md w-full text-center space-y-6">
                
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-slate-600 animate-spin" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">Processing Documents</h3>
                  <p className="text-sm text-slate-500 font-mono text-center min-h-[20px] transition-all">
                    {loaderMessage}
                  </p>
                </div>

                {/* Shimmer loading bar */}
                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
                    <div 
                      className="h-full bg-slate-800 rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${processProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                    <span>Document scanner active</span>
                    <span>{processProgress}%</span>
                  </div>
                </div>

                {/* Shimmer List Preview */}
                <div className="border border-slate-200 rounded-lg bg-slate-50/50 p-4 space-y-3">
                  {uploadedFiles.slice(0, 3).map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full bg-slate-200 animate-pulse shrink-0" />
                      <div className="flex-1 h-3 bg-slate-200 rounded animate-pulse" />
                      <div className="w-12 h-3 bg-slate-200 rounded animate-pulse" />
                    </div>
                  ))}
                  {uploadedFiles.length > 3 && (
                    <p className="text-[10px] text-slate-500 text-center">and {uploadedFiles.length - 3} more file(s)</p>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* STEP 3: INTERACTIVE REVIEW PORTAL */}
          {step === "review" && (
            <div className="h-full flex divide-x divide-slate-200 bg-white">
              
              {/* Left Column: File Previewer with Interactive OCR Canvas */}
              <div className="w-[34%] shrink-0 flex flex-col bg-slate-50 overflow-hidden">
                <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-slate-500" />
                    Document Layout Preview
                  </span>
                  {selectedDoc && (
                    <span className="text-[10px] bg-slate-200 border border-slate-300 text-slate-700 px-2 py-0.5 rounded truncate max-w-[140px]">
                      {selectedDoc.fileName}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start bg-slate-100/30 relative">
                  {selectedDoc ? (
                    <div className="w-full max-w-[340px] aspect-[1/1.414] bg-white rounded-lg border border-slate-200 shadow-sm relative overflow-hidden flex flex-col p-4 text-[10px] font-sans text-slate-600 select-none">
                      
                      {/* Grid background watermark */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:1rem_1rem] opacity-40 pointer-events-none" />

                      {/* Header block inside receipt preview */}
                      <div className="flex justify-between items-start border-b border-slate-200 pb-3 relative z-10">
                        <div>
                          <p className="font-bold text-slate-800 text-[12px] tracking-tight uppercase">TAX DOCUMENT</p>
                          <p className="text-[8px] text-slate-400 mt-0.5">OCR Text Extraction Preview</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-slate-700 font-bold">{selectedDoc.docType.toUpperCase()}</p>
                          <p className="text-[8px] text-slate-400 mt-0.5">{selectedDoc.fileSize}</p>
                        </div>
                      </div>

                      {/* Content block inside receipt preview */}
                      <div className="mt-4 space-y-3 relative z-10 flex-1">
                        <div className="flex justify-between">
                          <div>
                            <p className="text-[8px] text-slate-400">BILL FROM / CUSTOMER</p>
                            <p className="font-semibold text-slate-800 mt-0.5">{selectedDoc.parsedData.contactName}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] text-slate-400">REF NUMBER</p>
                            <p className="font-mono text-slate-800 mt-0.5">{selectedDoc.parsedData.docNumber}</p>
                          </div>
                        </div>

                        <div className="flex justify-between border-t border-slate-200 pt-2">
                          <div>
                            <p className="text-[8px] text-slate-400">DOCUMENT DATE</p>
                            <p className="text-slate-600 mt-0.5">{selectedDoc.parsedData.date}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] text-slate-400">TAX RATE</p>
                            <p className="text-slate-600 mt-0.5">{selectedDoc.parsedData.taxRate}%</p>
                          </div>
                        </div>

                        {/* List items representation */}
                        <div className="border-t border-slate-200 pt-2 flex-1 flex flex-col justify-between">
                          <div>
                            <p className="text-[8px] text-slate-400 mb-1">EXTRACTED LINE ITEMS</p>
                            <div className="divide-y divide-slate-100">
                              {selectedDoc.parsedData.lines.map((ln) => (
                                <div key={ln.id} className="py-1 flex justify-between">
                                  <span className="truncate max-w-[180px] text-slate-600">{ln.description}</span>
                                  <span className="font-mono text-slate-600">₹{ln.rate.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Calculations */}
                          <div className="border-t border-slate-200 pt-2 mt-4 space-y-1 text-[9px]">
                            <div className="flex justify-between">
                              <span>Subtotal</span>
                              <span className="font-mono">₹{selectedDoc.parsedData.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-500">
                              <span>Tax ({selectedDoc.parsedData.taxRate}%)</span>
                              <span className="font-mono">₹{selectedDoc.parsedData.taxAmount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-800 text-[11px]">
                              <span>Total Amount</span>
                              <span className="font-mono text-slate-900">₹{selectedDoc.parsedData.total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Bounding Box Overlays */}
                      {selectedDoc.boundingBoxes.map((box) => (
                        <div
                          key={box.id}
                          style={{
                            left: `${box.x}%`,
                            top: `${box.y}%`,
                            width: `${box.w}%`,
                            height: `${box.h}%`,
                          }}
                          className={`absolute rounded border cursor-help transition-all duration-200 flex items-center justify-center ${
                            activeBoxId === box.id
                              ? "border-amber-500 bg-amber-500/10 scale-105 shadow-sm z-30"
                              : "border-slate-300 bg-slate-500/5 hover:border-slate-400 hover:bg-slate-500/10 z-20"
                          }`}
                          onMouseEnter={() => setActiveBoxId(box.id)}
                          onMouseLeave={() => setActiveBoxId(null)}
                        >
                          <span className="opacity-0 hover:opacity-100 absolute -bottom-4 bg-slate-850 text-white px-1.5 py-0.5 rounded text-[8px] pointer-events-none whitespace-nowrap z-40">
                            {box.label}: {box.value}
                          </span>
                        </div>
                      ))}

                    </div>
                  ) : (
                    <div className="text-center text-slate-500 py-12">
                      No document selected
                    </div>
                  )}

                  {/* Document selector thumbnails at the bottom */}
                  <div className="w-full mt-6 space-y-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Processed Queue</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ocrDocuments.map((doc) => {
                        const isSelected = doc.id === selectedDocId;
                        return (
                          <button
                            key={doc.id}
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              isSelected
                                ? "bg-white border-slate-900 shadow-sm"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="text-[11px] font-medium text-slate-800 truncate block w-full">{doc.fileName}</span>
                              <span className="shrink-0">
                                {doc.validationStatus === "valid" ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : doc.validationStatus === "warning" ? (
                                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <X className="h-3 w-3 text-rose-500" />
                                )}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-800 mt-1 block font-semibold">
                              ₹{doc.parsedData.total.toLocaleString("en-IN")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Spreadsheet-like Bulk Editing Workspace */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4 text-slate-600" />
                    Interactive Bulk Spreadsheet Workspace
                  </span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-600">
                      Total: <span className="font-semibold text-slate-900">₹{ocrDocuments.reduce((sum, d) => sum + d.parsedData.total, 0).toLocaleString("en-IN")}</span>
                    </span>
                    <Badge className="bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono">
                      {ocrDocuments.filter(d => d.validationStatus === "valid").length} / {ocrDocuments.length} Ready
                    </Badge>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6 bg-white">
                  {ocrDocuments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-600" />
                      <p>No document data available.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {ocrDocuments.map((doc) => {
                        const isSelected = doc.id === selectedDocId;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDocId(doc.id)}
                            className={`border rounded-lg overflow-hidden transition-all ${
                              isSelected
                                ? "border-slate-400 bg-slate-50/50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/10"
                            }`}
                          >
                            
                            {/* Summary bar */}
                            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50">
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full ${
                                  doc.validationStatus === "valid" ? "bg-emerald-500" : doc.validationStatus === "warning" ? "bg-amber-500" : "bg-rose-500"
                                }`} />
                                <span className="text-xs font-mono text-slate-600 truncate max-w-[150px]">{doc.fileName}</span>
                                <span className="text-slate-300 text-xs">|</span>
                                <Badge variant="outline" className="text-[10px] py-0 border-slate-200 bg-white text-slate-700 font-mono">
                                  {doc.docType}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {doc.validationStatus !== "valid" && (
                                  <div className="flex items-center gap-1.5 text-amber-600 text-xs font-medium mr-2">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="text-[11px]">{doc.validationMessage}</span>
                                  </div>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOcrDocuments(prev => prev.filter(d => d.id !== doc.id));
                                  }}
                                  className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Delete Document Row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Spreadsheet Grid Row */}
                            <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 bg-white">
                              {doc.docType === "Items" ? (
                                <>
                                  {/* Items Fields Layout */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Item Name
                                      </label>
                                      <Input
                                        value={doc.parsedData.description}
                                        onChange={(e) => handleDocChange(doc.id, "description", e.target.value)}
                                        className={ocrInputClass}
                                        placeholder="e.g. Ergonomic Office Chair"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        SKU / Item Code
                                      </label>
                                      <Input
                                        value={doc.parsedData.docNumber}
                                        onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                        className={ocrInputClass}
                                        placeholder="e.g. SKU-8273"
                                      />
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Item Type
                                      </label>
                                      <Select 
                                        value={doc.parsedData.contactName === "Service" ? "Service" : "Goods"} 
                                        onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select type..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          <SelectItem value="Goods" className="text-xs hover:bg-slate-100 text-slate-900">Goods</SelectItem>
                                          <SelectItem value="Service" className="text-xs hover:bg-slate-100 text-slate-900">Services</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Tax Rate %
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.taxRate}
                                        onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Sales Price (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.subtotal}
                                        onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Purchase Price (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.total}
                                        onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Stock Status
                                      </span>
                                      <p className="text-[11px] text-slate-600 mt-1">
                                        Initial stock tracked will be auto-set to: <span className="font-semibold font-mono text-slate-800">0</span> on creation.
                                      </p>
                                    </div>
                                  </div>
                                </>
                              ) : doc.docType === "Bank Statements" ? (
                                <>
                                  {/* Bank Statements Layout */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Bank Account / Card
                                      </label>
                                      <Select 
                                        value={doc.parsedData.contactName} 
                                        onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select bank..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          {contactsList.map((c) => (
                                            <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100 text-slate-900">{c}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Statement Period Ref
                                      </label>
                                      <Input
                                        value={doc.parsedData.docNumber}
                                        onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Statement Date
                                      </label>
                                      <input
                                        type="date"
                                        value={doc.parsedData.date}
                                        onChange={(e) => handleDocChange(doc.id, "date", e.target.value)}
                                        className={ocrDateClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Opening Balance (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.subtotal}
                                        onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Closing Balance (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.total}
                                        onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono font-bold"}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Parsed Line Items ({doc.parsedData.lines.length})
                                      </span>
                                      <div className="space-y-1 max-h-16 overflow-y-auto">
                                        {doc.parsedData.lines.map((ln) => (
                                          <div key={ln.id} className="text-[9px] flex items-center justify-between font-mono bg-white p-1 border border-slate-100 rounded">
                                            <span className="truncate max-w-[80px]">{ln.description}</span>
                                            <span className={ln.rate >= 0 ? "text-emerald-600" : "text-rose-600"}>₹{ln.rate.toFixed(2)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              ) : doc.docType === "Inventory Adjustments" ? (
                                <>
                                  {/* Inventory Adjustments Layout */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Adjustment Reference
                                      </label>
                                      <Input
                                        value={doc.parsedData.docNumber}
                                        onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Adjustment Date
                                      </label>
                                      <input
                                        type="date"
                                        value={doc.parsedData.date}
                                        onChange={(e) => handleDocChange(doc.id, "date", e.target.value)}
                                        className={ocrDateClass}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Warehouse
                                      </label>
                                      <Select 
                                        value={doc.parsedData.contactName} 
                                        onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select warehouse..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          {contactsList.map((c) => (
                                            <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100 text-slate-900">{c}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Reason Code
                                      </label>
                                      <Select 
                                        value={doc.parsedData.description === "Manual" ? "Manual" : "Stock Count"} 
                                        onValueChange={(v) => handleDocChange(doc.id, "description", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select reason..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          <SelectItem value="Stock Count" className="text-xs hover:bg-slate-100 text-slate-900">Stock Count</SelectItem>
                                          <SelectItem value="Manual" className="text-xs hover:bg-slate-100 text-slate-900">Manual</SelectItem>
                                          <SelectItem value="Damage" className="text-xs hover:bg-slate-100 text-slate-900">Damage</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Quantity Delta
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.subtotal}
                                        onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Unit Cost (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.total}
                                        onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Target Item
                                      </span>
                                      <p className="text-[11px] font-medium text-slate-700 mt-1">
                                        {doc.parsedData.lines[0]?.description || "Default Item"}
                                      </p>
                                    </div>
                                  </div>
                                </>
                              ) : doc.docType === "Journal Entries" ? (
                                <>
                                  {/* Journal Entries Layout */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Journal Number
                                      </label>
                                      <Input
                                        value={doc.parsedData.docNumber}
                                        onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Date
                                      </label>
                                      <input
                                        type="date"
                                        value={doc.parsedData.date}
                                        onChange={(e) => handleDocChange(doc.id, "date", e.target.value)}
                                        className={ocrDateClass}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Reference / Partner
                                      </label>
                                      <Input
                                        value={doc.parsedData.contactName}
                                        onChange={(e) => handleDocChange(doc.id, "contactName", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Journal Description
                                      </label>
                                      <Input
                                        value={doc.parsedData.description}
                                        onChange={(e) => handleDocChange(doc.id, "description", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Total Debits (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.subtotal}
                                        onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono font-semibold"}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Total Credits (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.total}
                                        onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono font-semibold"}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Ledger Lines
                                      </span>
                                      <div className="space-y-1 max-h-16 overflow-y-auto">
                                        {doc.parsedData.lines.map((ln) => (
                                          <div key={ln.id} className="text-[9px] flex items-center justify-between font-mono bg-white p-1 border border-slate-100 rounded">
                                            <span className="truncate max-w-[85px]">{ln.description}</span>
                                            <span>₹{ln.total.toFixed(2)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </>
                              ) : doc.docType === "Expenses" ? (
                                <>
                                  {/* Expenses Layout */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Expense Ref
                                      </label>
                                      <Input
                                        value={doc.parsedData.docNumber}
                                        onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                        className={ocrInputClass}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Expense Date
                                      </label>
                                      <input
                                        type="date"
                                        value={doc.parsedData.date}
                                        onChange={(e) => handleDocChange(doc.id, "date", e.target.value)}
                                        className={ocrDateClass}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Paid To (Vendor)
                                      </label>
                                      <Select 
                                        value={doc.parsedData.contactName} 
                                        onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select vendor..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          {contactsList.map((c) => (
                                            <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100 text-slate-900">{c}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Expense Category
                                      </label>
                                      <Select 
                                        value={doc.parsedData.description.includes("IT") ? "Consulting" : "Software"} 
                                        onValueChange={(v) => handleDocChange(doc.id, "description", v)}
                                      >
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue placeholder="Select category..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          <SelectItem value="Software" className="text-xs hover:bg-slate-100 text-slate-900">Software Subscription</SelectItem>
                                          <SelectItem value="Consulting" className="text-xs hover:bg-slate-100 text-slate-900">Consulting & IT</SelectItem>
                                          <SelectItem value="Meals" className="text-xs hover:bg-slate-100 text-slate-900">Meals & Entertainment</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Paid Through
                                      </label>
                                      <Select defaultValue="Bank Account">
                                        <SelectTrigger className={ocrSelectClass}>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                                          <SelectItem value="Bank Account" className="text-xs hover:bg-slate-100 text-slate-900">Petty Cash / Bank</SelectItem>
                                          <SelectItem value="Credit Card" className="text-xs hover:bg-slate-100 text-slate-900">Corporate Card</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Tax Rate %
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.taxRate}
                                        onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono"}
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Total Amount (₹)
                                      </label>
                                      <Input
                                        type="number"
                                        value={doc.parsedData.total}
                                        onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                        className={ocrInputClass + " font-mono font-bold text-emerald-700 bg-emerald-50/10"}
                                      />
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  {/* Standard Invoices / Bills Grid (Default) */}
                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Document Number
                                      </label>
                                      <div 
                                        className="relative group"
                                        onMouseEnter={() => setActiveBoxId("b1")}
                                        onMouseLeave={() => setActiveBoxId(null)}
                                      >
                                        <Input
                                          value={doc.parsedData.docNumber}
                                          onChange={(e) => handleDocChange(doc.id, "docNumber", e.target.value)}
                                          className={ocrInputClass}
                                          placeholder="e.g. INV-1002"
                                        />
                                        <span className="absolute right-2.5 top-2.5 w-1.5 h-1.5 rounded-full bg-emerald-500 pointer-events-none animate-pulse" />
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        Date
                                      </label>
                                      <div 
                                        className="relative group"
                                        onMouseEnter={() => setActiveBoxId("b2")}
                                        onMouseLeave={() => setActiveBoxId(null)}
                                      >
                                        <input
                                          type="date"
                                          value={doc.parsedData.date}
                                          onChange={(e) => handleDocChange(doc.id, "date", e.target.value)}
                                          className={ocrDateClass}
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        {section === "sales" ? "Customer" : section === "purchases" ? "Vendor" : "Account/Partner"}
                                      </label>
                                      <div 
                                        className="relative group"
                                        onMouseEnter={() => setActiveBoxId("b3")}
                                        onMouseLeave={() => setActiveBoxId(null)}
                                      >
                                        <Select 
                                          value={doc.parsedData.contactName} 
                                          onValueChange={(v) => handleDocChange(doc.id, "contactName", v)}
                                        >
                                          <SelectTrigger className={ocrSelectClass}>
                                            <SelectValue placeholder="Select partner..." />
                                          </SelectTrigger>
                                          <SelectContent className="bg-white border-slate-200 text-slate-900">
                                            {contactsList.map((c) => (
                                              <SelectItem key={c} value={c} className="text-xs hover:bg-slate-100 focus:bg-slate-100 text-slate-900">
                                                {c}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                        General Description
                                      </label>
                                      <Input
                                        value={doc.parsedData.description}
                                        onChange={(e) => handleDocChange(doc.id, "description", e.target.value)}
                                        className={ocrInputClass}
                                        placeholder="Add description..."
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                          Subtotal
                                        </label>
                                        <div 
                                          className="relative group"
                                          onMouseEnter={() => setActiveBoxId("b4")}
                                          onMouseLeave={() => setActiveBoxId(null)}
                                        >
                                          <Input
                                            type="number"
                                            value={doc.parsedData.subtotal}
                                            onChange={(e) => handleDocChange(doc.id, "subtotal", Number(e.target.value))}
                                            className={ocrInputClass + " font-mono"}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                          Tax Rate %
                                        </label>
                                        <Input
                                          type="number"
                                          value={doc.parsedData.taxRate}
                                          onChange={(e) => handleDocChange(doc.id, "taxRate", Number(e.target.value))}
                                          className={ocrInputClass + " font-mono"}
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                          Tax Amount
                                        </label>
                                        <div 
                                          className="relative group"
                                          onMouseEnter={() => setActiveBoxId("b5")}
                                          onMouseLeave={() => setActiveBoxId(null)}
                                        >
                                          <Input
                                            type="number"
                                            value={doc.parsedData.taxAmount}
                                            disabled
                                            className={ocrDisabledClass}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                          Total Amount
                                        </label>
                                        <div 
                                          className="relative group"
                                          onMouseEnter={() => setActiveBoxId("b6")}
                                          onMouseLeave={() => setActiveBoxId(null)}
                                        >
                                          <Input
                                            type="number"
                                            value={doc.parsedData.total}
                                            onChange={(e) => handleDocChange(doc.id, "total", Number(e.target.value))}
                                            className={ocrInputClass + " font-mono font-bold"}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Line Items Details */}
                                  <div className="bg-slate-50 border border-slate-200 rounded p-3 flex flex-col justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                                        Extracted Line Items ({doc.parsedData.lines.length})
                                      </span>
                                      <div className="space-y-1.5 max-h-20 overflow-y-auto pr-1">
                                        {doc.parsedData.lines.map((ln) => (
                                          <div key={ln.id} className="text-[10px] flex items-center justify-between text-slate-700 font-mono bg-white border border-slate-100 px-2 py-1 rounded">
                                            <span className="truncate max-w-[100px]">{ln.description}</span>
                                            <span>₹{ln.total.toFixed(2)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newLine: OcrLineItem = {
                                          id: `l-${Date.now()}`,
                                          description: "New Line Item",
                                          qty: 1,
                                          rate: 0,
                                          taxRate: doc.parsedData.taxRate,
                                          total: 0
                                        };
                                        handleDocChange(doc.id, "lines", [...doc.parsedData.lines, newLine]);
                                      }}
                                      className="mt-2 text-[10px] text-slate-600 hover:text-slate-800 font-medium flex items-center gap-1 text-left transition-colors"
                                    >
                                      <Plus className="h-3 w-3" /> Add Item Line
                                    </button>
                                  </div>
                                </>
                              )}

                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* STEP 4: BULK SAVING LOADER */}
          {step === "saving" && (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-white">
              <div className="max-w-md w-full text-center space-y-6">
                
                <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-slate-600 animate-spin" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">Syncing Ledger Ingestions</h3>
                  <p className="text-sm text-slate-500 font-mono min-h-[20px] transition-all">
                    {saveMessage}
                  </p>
                </div>

                <div className="space-y-1">
                  <Progress value={saveProgress} className="h-1.5 bg-slate-100 border border-slate-200" />
                  <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                    <span>Database Commit: active</span>
                    <span>{saveProgress}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: SUCCESS WORKFLOW */}
          {step === "success" && (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-white">
              <div className="max-w-md w-full text-center space-y-6">
                
                <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Bulk Import Completed!</h3>
                  <p className="text-sm text-slate-500">
                    All <span className="font-semibold text-emerald-600">{ocrDocuments.length}</span> documents have been successfully verified, matched, and synchronized with your ledger.
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-left max-w-sm mx-auto">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Uploaded Documents</span>
                    <span className="font-semibold text-slate-800">{ocrDocuments.length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Imported Ledger Entries</span>
                    <span className="font-semibold text-slate-800">{ocrDocuments.length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Tax Audited Transactions</span>
                    <span className="font-semibold text-emerald-600">100% compliant</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-xs font-semibold text-slate-800">
                    <span>Total Amount Synced</span>
                    <span className="font-mono text-slate-900">₹{ocrDocuments.reduce((sum, d) => sum + d.parsedData.total, 0).toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleClose}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-8 font-medium shadow"
                  >
                    Done & Close
                  </Button>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-slate-500 text-xs">
            {step === "upload" && `${uploadedFiles.length} document(s) queued for processing`}
            {step === "review" && `${ocrDocuments.length} document(s) ready to verify`}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 hover:text-slate-900"
            >
              Cancel
            </Button>
            
            {step === "upload" && (
              <Button
                size="sm"
                onClick={startProcessing}
                disabled={uploadedFiles.length === 0}
                className="bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-2"
              >
                Process with OCR
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {step === "review" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("upload")}
                  className="bg-white hover:bg-slate-50 border-slate-300 text-slate-700 hover:text-slate-900 flex items-center gap-1.5"
                >
                  <UploadCloud className="h-3.5 w-3.5" /> Upload More
                </Button>
                
                <Button
                  size="sm"
                  onClick={handleSaveAndUpload}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-1.5 shadow"
                >
                  <CheckSquare className="h-4 w-4" /> Save & Sync All
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
  );

  if (isFullScreenPage) {
    return mainContent;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden bg-white border border-slate-200 text-slate-900 rounded-xl shadow-2xl [&>button]:text-slate-500 [&>button]:hover:text-slate-900">
        {mainContent}
      </DialogContent>
    </Dialog>
  );
}
