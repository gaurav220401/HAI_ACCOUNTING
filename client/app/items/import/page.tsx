"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Loader2, Check, HelpCircle, AlertCircle, FileSpreadsheet, Info } from "lucide-react";
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
import { itemApi } from "@/lib/api/items";
import { accountApi } from "@/lib/api/accounts";
import { contactApi } from "@/lib/api/contacts";
import { settingsApi } from "@/lib/api/settings";

interface ParsedRow {
  [key: string]: string;
}

interface MappingState {
  name: string;
  sku: string;
  hsnSacCode: string;
  sellingDescription: string;
  sellingPrice: string;
  returnableItem: string;
  brand: string;
  manufacturer: string;
  upc: string;
  ean: string;
  isbn: string;
  partNumber: string;
  productType: string;
  salesAccount: string;
  unit: string;
  purchaseDescription: string;
  costPrice: string;
  itemType: string;
  purchaseAccount: string;
  inventoryAccount: string;
  valuationMethod: string;
  reorderPoint: string;
  preferredVendor: string;
  stockOnHand: string;
  openingStockValue: string;
  averageCost: string;
  packageWeight: string;
  packageLength: string;
  packageWidth: string;
  packageHeight: string;
  weightUnit: string;
  dimensionUnit: string;
  interStateTax: string;
  interStateTaxType: string;
  interStateTaxPercentage: string;
  intraStateTax: string;
  intraStateTaxType: string;
  intraStateTaxPercentage: string;
  taxability: string;
  exemptionReason: string;
  warehouseName: string;
  isReceivableService: string;
  isComboProduct: string;
  taxName: string;
  taxType: string;
  taxPercentage: string;
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
    title: "Item Details",
    fields: [
      { key: "name", label: "Item Name", required: true },
      { key: "sku", label: "SKU" },
      { key: "unit", label: "Unit" },
      { key: "brand", label: "Brand" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "upc", label: "UPC" },
      { key: "ean", label: "EAN" },
      { key: "isbn", label: "ISBN" },
      { key: "partNumber", label: "Part Number" },
      { key: "productType", label: "Product Type" },
      { key: "returnableItem", label: "Is Returnable" },
    ]
  },
  {
    title: "Sales Information",
    fields: [
      { key: "sellingDescription", label: "Sales Desc" },
      { key: "sellingPrice", label: "Selling Price" },
      { key: "salesAccount", label: "Sales Account" },
    ]
  },
  {
    title: "Purchase & Inventory Information",
    fields: [
      { key: "purchaseDescription", label: "Purchase Description" },
      { key: "costPrice", label: "Purchase Price" },
      { key: "purchaseAccount", label: "Purchase Account" },
      { key: "inventoryAccount", label: "Inventory Account" },
      { key: "valuationMethod", label: "Inventory Valuation Method" },
      { key: "reorderPoint", label: "Reorder Level" },
      { key: "preferredVendor", label: "Preferred Vendor" },
      { key: "stockOnHand", label: "Opening Stock" },
      { key: "openingStockValue", label: "Opening Stock Value" },
      { key: "averageCost", label: "Opening Stock Rate" },
      { key: "isReceivableService", label: "Is Receivable Service" },
      { key: "isComboProduct", label: "Is Combo Product" },
    ]
  },
  {
    title: "Dimensions",
    fields: [
      { key: "packageWeight", label: "Package Weight" },
      { key: "packageLength", label: "Package Length" },
      { key: "packageWidth", label: "Package Width" },
      { key: "packageHeight", label: "Package Height" },
      { key: "weightUnit", label: "Weight unit" },
      { key: "dimensionUnit", label: "Dimension unit" },
    ]
  },
  {
    title: "Tax Details",
    fields: [
      { key: "taxName", label: "Tax Name" },
      { key: "taxType", label: "Tax Type" },
      { key: "taxPercentage", label: "Tax Percentage" },
      { key: "interStateTax", label: "Inter State Tax" },
      { key: "interStateTaxType", label: "Inter State Tax Type" },
      { key: "interStateTaxPercentage", label: "Inter State Tax Percentage" },
      { key: "intraStateTax", label: "Intra State Tax" },
      { key: "intraStateTaxType", label: "Intra State Tax Type" },
      { key: "intraStateTaxPercentage", label: "Intra State Tax Percentage" },
      { key: "taxability", label: "Taxability" },
      { key: "exemptionReason", label: "Exemption Reason" },
      { key: "warehouseName", label: "Warehouse Name" },
    ]
  }
];

const MAPPABLE_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);

export default function ItemImportPage() {
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
    name: "",
    sku: "",
    hsnSacCode: "",
    sellingDescription: "",
    sellingPrice: "",
    returnableItem: "",
    brand: "",
    manufacturer: "",
    upc: "",
    ean: "",
    isbn: "",
    partNumber: "",
    productType: "",
    salesAccount: "",
    unit: "",
    purchaseDescription: "",
    costPrice: "",
    itemType: "",
    purchaseAccount: "",
    inventoryAccount: "",
    valuationMethod: "",
    reorderPoint: "",
    preferredVendor: "",
    stockOnHand: "",
    openingStockValue: "",
    averageCost: "",
    packageWeight: "",
    packageLength: "",
    packageWidth: "",
    packageHeight: "",
    weightUnit: "",
    dimensionUnit: "",
    interStateTax: "",
    interStateTaxType: "",
    interStateTaxPercentage: "",
    intraStateTax: "",
    intraStateTaxType: "",
    intraStateTaxPercentage: "",
    taxability: "",
    exemptionReason: "",
    warehouseName: "",
    isReceivableService: "",
    isComboProduct: "",
    taxName: "",
    taxType: "",
    taxPercentage: "",
  });

  // Lookup data states
  const [accounts, setAccounts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);

  // Step 3 States
  const [mappedItems, setMappedItems] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showReadyDetails, setShowReadyDetails] = useState(true);
  const [showSkippedDetails, setShowSkippedDetails] = useState(true);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(true);

  // File drag & drop handlers
  const [isDragActive, setIsDragActive] = useState(false);

  // Load lookup entities on mount
  useEffect(() => {
    async function loadLookups() {
      try {
        const [accRes, contactRes, whRes, taxRes] = await Promise.all([
          accountApi.list().catch(() => ({ data: [] })),
          contactApi.list({ type: "Vendor" }).catch(() => ({ data: [] })),
          settingsApi.warehouses.list().catch(() => ({ data: [] })),
          settingsApi.taxes.list().catch(() => ({ data: [] })),
        ]);
        
        if (accRes?.data) setAccounts(accRes.data);
        if (contactRes?.data) setContacts(contactRes.data);
        if (whRes?.data) setWarehouses(whRes.data);
        if (taxRes?.data) setTaxes(taxRes.data);
      } catch (err) {
        console.error("Failed to load lookups:", err);
      }
    }
    loadLookups();

    try {
      const saved = localStorage.getItem("hai_item_import_mapping");
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
      if (file.name.endsWith(".csv")) {
        setSelectedFile(file);
      } else {
        toast.error("Please drop a valid CSV file");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDownloadSample = async () => {
    try {
      const blob = await itemApi.downloadSampleTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "sample_items.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Sample CSV file downloaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download sample file");
    }
  };

  const handleDownloadBlank = async () => {
    try {
      const blob = await itemApi.downloadBlankTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "blank_items.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Blank template downloaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to download blank template");
    }
  };

  const parseCSV = async (file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) {
          reject(new Error("Empty file"));
          return;
        }

        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
          reject(new Error("No data in file"));
          return;
        }

        // Parse header row
        const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ''));
        const rows: ParsedRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Split line values respecting quotes
          const values: string[] = [];
          let currentVal = "";
          let insideQuotes = false;
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
              values.push(currentVal.trim().replace(/^["']|["']$/g, ''));
              currentVal = "";
            } else {
              currentVal += char;
            }
          }
          values.push(currentVal.trim().replace(/^["']|["']$/g, ''));

          const rowData: ParsedRow = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index] || "";
          });
          rows.push(rowData);
        }

        resolve({ headers, rows });
      };
      reader.onerror = () => reject(new Error("Error reading file"));
      reader.readAsText(file);
    });
  };

  const handleNextFromStep1 = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to import");
      return;
    }

    try {
      const { headers, rows } = await parseCSV(selectedFile);
      setCsvHeaders(headers);
      setCsvRows(rows);

      // Auto map logic
      const mapping: MappingState = {
        name: "",
        sku: "",
        hsnSacCode: "",
        sellingDescription: "",
        sellingPrice: "",
        returnableItem: "",
        brand: "",
        manufacturer: "",
        upc: "",
        ean: "",
        isbn: "",
        partNumber: "",
        productType: "",
        salesAccount: "",
        unit: "",
        purchaseDescription: "",
        costPrice: "",
        itemType: "",
        purchaseAccount: "",
        inventoryAccount: "",
        valuationMethod: "",
        reorderPoint: "",
        preferredVendor: "",
        stockOnHand: "",
        openingStockValue: "",
        averageCost: "",
        packageWeight: "",
        packageLength: "",
        packageWidth: "",
        packageHeight: "",
        weightUnit: "",
        dimensionUnit: "",
        interStateTax: "",
        interStateTaxType: "",
        interStateTaxPercentage: "",
        intraStateTax: "",
        intraStateTaxType: "",
        intraStateTaxPercentage: "",
        taxability: "",
        exemptionReason: "",
        warehouseName: "",
        isReceivableService: "",
        isComboProduct: "",
        taxName: "",
        taxType: "",
        taxPercentage: "",
      };

      headers.forEach(h => {
        const normalized = h.toLowerCase().replace(/[\s_-]/g, "");
        if (normalized === "itemname" || normalized === "name" || normalized === "title") mapping.name = h;
        else if (normalized === "sku") mapping.sku = h;
        else if (normalized === "hsnsac" || normalized === "hsn" || normalized === "sac") mapping.hsnSacCode = h;
        else if (normalized === "salesdesc" || normalized === "salesdescription") mapping.sellingDescription = h;
        else if (normalized === "sellingprice" || normalized === "rate" || normalized === "price") mapping.sellingPrice = h;
        else if (normalized === "isreturnable" || normalized === "returnable") mapping.returnableItem = h;
        else if (normalized === "brand") mapping.brand = h;
        else if (normalized === "manufacturer") mapping.manufacturer = h;
        else if (normalized === "upc") mapping.upc = h;
        else if (normalized === "ean") mapping.ean = h;
        else if (normalized === "isbn") mapping.isbn = h;
        else if (normalized === "partnumber") mapping.partNumber = h;
        else if (normalized === "producttype") mapping.productType = h;
        else if (normalized === "salesaccount") mapping.salesAccount = h;
        else if (normalized === "unit" || normalized === "uom") mapping.unit = h;
        else if (normalized === "purchasedesc" || normalized === "purchasedescription") mapping.purchaseDescription = h;
        else if (normalized === "purchaserate" || normalized === "costprice" || normalized === "purchaseprice") mapping.costPrice = h;
        else if (normalized === "itemtype") mapping.itemType = h;
        else if (normalized === "purchaseaccount") mapping.purchaseAccount = h;
        else if (normalized === "inventoryaccount") mapping.inventoryAccount = h;
        else if (normalized === "inventoryvaluationmethod" || normalized === "valuationmethod") mapping.valuationMethod = h;
        else if (normalized === "reorderlevel" || normalized === "reorderpoint") mapping.reorderPoint = h;
        else if (normalized === "preferredvendor" || normalized === "vendor") mapping.preferredVendor = h;
        else if (normalized === "openingstock" || normalized === "stockonhand" || normalized === "qty") mapping.stockOnHand = h;
        else if (normalized === "openingstockvalue" || normalized === "stockvalue") mapping.openingStockValue = h;
        else if (normalized === "openingstockrate" || normalized === "averagecost") mapping.averageCost = h;
        else if (normalized === "packageweight") mapping.packageWeight = h;
        else if (normalized === "packagelength") mapping.packageLength = h;
        else if (normalized === "packagewidth") mapping.packageWidth = h;
        else if (normalized === "packageheight") mapping.packageHeight = h;
        else if (normalized === "weightunit") mapping.weightUnit = h;
        else if (normalized === "dimensionunit") mapping.dimensionUnit = h;
        else if (normalized === "interstatetax") mapping.interStateTax = h;
        else if (normalized === "interstatetaxtype") mapping.interStateTaxType = h;
        else if (normalized === "interstatetaxpercentage") mapping.interStateTaxPercentage = h;
        else if (normalized === "intrastatetax") mapping.intraStateTax = h;
        else if (normalized === "intrastatetaxtype") mapping.intraStateTaxType = h;
        else if (normalized === "intrastatetaxpercentage") mapping.intraStateTaxPercentage = h;
        else if (normalized === "taxability") mapping.taxability = h;
        else if (normalized === "exemptionreason") mapping.exemptionReason = h;
        else if (normalized === "warehousename" || normalized === "warehouse") mapping.warehouseName = h;
        else if (normalized === "isreceivableservice" || normalized === "receivableservice") mapping.isReceivableService = h;
        else if (normalized === "iscomboproduct" || normalized === "comboproduct") mapping.isComboProduct = h;
        else if (normalized === "taxname") mapping.taxName = h;
        else if (normalized === "taxtype") mapping.taxType = h;
        else if (normalized === "taxpercentage" || normalized === "taxrate") mapping.taxPercentage = h;
      });

      setFieldMapping(mapping);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV file");
    }
  };

  const handleNextFromStep2 = async () => {
    if (!fieldMapping.name) {
      toast.error("Item Name field must be mapped");
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

      const previewRes = await itemApi.previewImport(formData);
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
      const importRes = await itemApi.executeImport(formData);
      setImportProgress(90);

      if (importRes?.data) {
        if (saveMapping) {
          try {
            localStorage.setItem("hai_item_import_mapping", JSON.stringify(fieldMapping));
          } catch (err) {
            console.error("Failed to save mapping:", err);
          }
        }
        const { successCount, failCount, errors } = importRes.data;
        setImportProgress(100);

        if (failCount === 0) {
          toast.success(`Successfully imported ${successCount} items!`);
          router.push("/items");
        } else {
          toast.warning(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
          if (errors && errors.length > 0) {
            console.error("Import errors:", errors);
            toast.error(`Row ${errors[0].row}: ${errors[0].error}`);
          }
          router.push("/items");
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-800">
            {step === 1 ? "Items - Select File" : step === 2 ? "Items - Map Fields" : "Items - Preview"}
          </h1>
        </div>
        <button 
          onClick={() => router.push("/items")}
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
                accept=".csv"
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
                  Maximum File Size: 25 MB • File Format: CSV
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="bg-white border-slate-300 text-slate-700 hover:text-slate-900">
                Choose File
              </Button>
            </div>

            {/* Sample Link */}
            <p className="text-xs text-slate-500">
              Download a{" "}
              <button onClick={handleDownloadSample} className="text-blue-600 hover:underline font-semibold">
                sample file
              </button>{" "}
              or a{" "}
              <button onClick={handleDownloadBlank} className="text-blue-600 hover:underline font-semibold">
                blank template
              </button>{" "}
              and compare it to your import file to ensure you have the file perfect for the import.
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
                        Retains the items in HAI Accounting and does not import the duplicates in the import file.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="overwrite" id="overwrite" className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor="overwrite" className="text-sm font-medium text-slate-800">
                        Overwrite items
                      </Label>
                      <p className="text-xs text-slate-500">
                        Imports the duplicates in the import file and overwrites the existing items in HAI Accounting.
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
                <li>Import data with the details of items by referring to our standard sample format.</li>
                <li>If you have files in other formats, you can convert it to CSV first.</li>
                <li>Ensure all decimal fields do not contain any currency symbols.</li>
              </ul>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleNextFromStep1} className="bg-blue-600 hover:bg-blue-700 text-white">
                Next
              </Button>
              <Button variant="outline" onClick={() => router.push("/items")} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
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
                <span>Map the columns in your CSV file to the corresponding fields in HAI Accounting.</span>
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
                            Zoho Inventory Field
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
                                  value={fieldMapping[field.key as keyof MappingState] || ""}
                                  onValueChange={(val) =>
                                    setFieldMapping((prev) => ({ ...prev, [field.key]: val }))
                                  }
                                >
                                  <SelectTrigger className="w-full bg-white border-slate-300 pr-10 text-slate-700 hover:border-slate-400 transition-colors">
                                    <SelectValue placeholder="Select" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-white max-h-[200px] overflow-y-auto">
                                    <SelectItem value="">- None -</SelectItem>
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
                                    className="absolute right-8 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
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
          const readyItems = mappedItems.filter(item => item.status === "Ready" || item.status === "Overwrite");
          const skippedItems = mappedItems.filter(item => item.status === "Skip" || item.status === "Error" || !item.isValid);

          const mappedHeaders = Object.values(fieldMapping).filter(Boolean);
          const unmappedHeaders = csvHeaders.filter(header => !mappedHeaders.includes(header));

          const downloadSkippedRows = () => {
            if (skippedItems.length === 0) return;
            const headers = ["Row Number", "Item Name", "SKU", "Error/Skip Reason"];
            const csvRows = skippedItems.map((item, idx) => [
              item.rowNumber || (idx + 2),
              item.name || "",
              item.sku || "",
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
            link.setAttribute("download", "skipped_rows.csv");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success("Skipped rows downloaded successfully");
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
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3 text-green-800 text-sm">
                  <Check className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
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
                      <span>Items that are ready to be imported</span>
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
                    <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="text-xs font-semibold py-2">Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">SKU</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Type</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Selling Price</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Cost Price</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Stock</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyItems.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs py-2 font-medium">{item.name}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.sku || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.itemType}</TableCell>
                              <TableCell className="text-xs py-2 text-right tabular-nums">₹{(item.sellingPrice || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-xs py-2 text-right tabular-nums">₹{(item.costPrice || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-xs py-2 text-right tabular-nums">{item.stockOnHand || 0}</TableCell>
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
                          className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                        >
                          Download skipped rows
                        </button>
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
                            <TableHead className="text-xs font-semibold py-2">Item Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Reason</TableHead>
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
                        The following fields in your import file have not been mapped to any Zoho Inventory field. The data in these fields will be ignored during the import.
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
                      <span>Importing items...</span>
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
                  <span>Import Items ({readyItems.length})</span>
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

// Inline badge helper for the import table
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${className}`}>
      {children}
    </span>
  );
}
