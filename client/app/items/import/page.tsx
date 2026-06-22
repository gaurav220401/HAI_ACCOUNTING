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
  reorderPoint: string;
  preferredVendor: string;
  stockOnHand: string;
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

const MAPPABLE_FIELDS = [
  { key: "name", label: "Item Name", required: true },
  { key: "sku", label: "SKU" },
  { key: "hsnSacCode", label: "HSN/SAC" },
  { key: "sellingDescription", label: "Sales Desc" },
  { key: "sellingPrice", label: "Selling Price" },
  { key: "returnableItem", label: "Is Returnable" },
  { key: "brand", label: "Brand" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "upc", label: "UPC" },
  { key: "ean", label: "EAN" },
  { key: "isbn", label: "ISBN" },
  { key: "partNumber", label: "Part Number" },
  { key: "productType", label: "Product Type" },
  { key: "salesAccount", label: "Sales Account" },
  { key: "unit", label: "Unit" },
  { key: "purchaseDescription", label: "Purchase Desc" },
  { key: "costPrice", label: "Purchase Rate" },
  { key: "itemType", label: "Item Type" },
  { key: "purchaseAccount", label: "Purchase Account" },
  { key: "inventoryAccount", label: "Inventory Account" },
  { key: "reorderPoint", label: "Reorder Level" },
  { key: "preferredVendor", label: "Preferred Vendor" },
  { key: "stockOnHand", label: "Opening Stock" },
  { key: "averageCost", label: "Opening Stock Rate" },
  { key: "packageWeight", label: "Package Weight" },
  { key: "packageLength", label: "Package Length" },
  { key: "packageWidth", label: "Package Width" },
  { key: "packageHeight", label: "Package Height" },
  { key: "weightUnit", label: "Weight unit" },
  { key: "dimensionUnit", label: "Dimension unit" },
  { key: "interStateTax", label: "Inter State Tax" },
  { key: "interStateTaxType", label: "Inter State Tax Type" },
  { key: "interStateTaxPercentage", label: "Inter State Tax Percentage" },
  { key: "intraStateTax", label: "Intra State Tax" },
  { key: "intraStateTaxType", label: "Intra State Tax Type" },
  { key: "intraStateTaxPercentage", label: "Intra State Tax Percentage" },
  { key: "taxability", label: "Taxability" },
  { key: "exemptionReason", label: "Exemption Reason" },
  { key: "warehouseName", label: "Warehouse Name" },
];

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
    reorderPoint: "",
    preferredVendor: "",
    stockOnHand: "",
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

  const handleDownloadSample = () => {
    const headers = [
      "Item Name",
      "SKU",
      "HSN/SAC",
      "Sales Desc",
      "Selling Price",
      "Is Returnable",
      "Brand",
      "Manufacturer",
      "UPC",
      "EAN",
      "ISBN",
      "Part Number",
      "Product Type",
      "Sales Account",
      "Unit",
      "Purchase Desc",
      "Purchase Rate",
      "Item Type",
      "Purchase Account",
      "Inventory Account",
      "Reorder Level",
      "Preferred Vendor",
      "Opening Stock",
      "Opening Stock Rate",
      "Package Weight",
      "Package Length",
      "Package Width",
      "Package Height",
      "Weight unit",
      "Dimension unit",
      "Inter State Tax",
      "Inter State Tax Type",
      "Inter State Tax Percentage",
      "Intra State Tax",
      "Intra State Tax Type",
      "Intra State Tax Percentage",
      "Taxability",
      "Exemption Reason",
      "Warehouse Name"
    ];

    const rows = [
      [
        "Premium Desk Organizer",
        "PDO-100",
        "83040000",
        "Elegant wood and metal desk organizer",
        "1500",
        "true",
        "Haldara Woodworks",
        "Haldara Industries Ltd",
        "123456789012",
        "9781234567897",
        "ISBN-123-456",
        "PART-PDO100",
        "Inventory",
        "Sales",
        "pcs",
        "Desk organizer raw materials and manufacturing cost",
        "800",
        "Goods",
        "Cost of Goods Sold",
        "Inventory Asset (Stock)",
        "10",
        "Apex Materials Inc",
        "100",
        "800",
        "1.2",
        "30",
        "20",
        "15",
        "kg",
        "cm",
        "GST18",
        "GST",
        "18",
        "GST18",
        "GST",
        "18",
        "Taxable",
        "",
        "Main Warehouse"
      ],
      [
        "Professional Setup Service",
        "SRV-SETUP",
        "998313",
        "On-site installation and workspace setup",
        "2500",
        "false",
        "",
        "",
        "",
        "",
        "",
        "",
        "Service",
        "General Income",
        "hrs",
        "Service consultant hourly cost",
        "1200",
        "Service",
        "Consulting Expense",
        "",
        "0",
        "",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "kg",
        "cm",
        "GST18",
        "GST",
        "18",
        "GST18",
        "GST",
        "18",
        "Taxable",
        "",
        ""
      ]
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "items_import_sample.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sample CSV file downloaded successfully");
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
        reorderPoint: "",
        preferredVendor: "",
        stockOnHand: "",
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
        else if (normalized === "reorderlevel" || normalized === "reorderpoint") mapping.reorderPoint = h;
        else if (normalized === "preferredvendor" || normalized === "vendor") mapping.preferredVendor = h;
        else if (normalized === "openingstock" || normalized === "stockonhand" || normalized === "qty") mapping.stockOnHand = h;
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
      });

      setFieldMapping(mapping);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV file");
    }
  };

  const handleNextFromStep2 = () => {
    if (!fieldMapping.name) {
      toast.error("Item Name field must be mapped");
      return;
    }

    const items = csvRows.map(row => {
      const name = row[fieldMapping.name];
      if (!name) {
        return { isValid: false, name: "", sellingPrice: 0, costPrice: 0, stockOnHand: 0, itemType: "Goods" };
      }

      const sku = fieldMapping.sku ? row[fieldMapping.sku] : "";
      const hsnSacCode = fieldMapping.hsnSacCode ? row[fieldMapping.hsnSacCode] : "";
      const sellingDescription = fieldMapping.sellingDescription ? row[fieldMapping.sellingDescription] : "";
      const sellingPrice = fieldMapping.sellingPrice ? parseFloat(row[fieldMapping.sellingPrice]) || 0 : 0;
      
      let returnableItem = true;
      if (fieldMapping.returnableItem && row[fieldMapping.returnableItem]) {
        const val = row[fieldMapping.returnableItem].toLowerCase();
        if (val === "false" || val === "no" || val === "0") {
          returnableItem = false;
        }
      }

      const brand = fieldMapping.brand ? row[fieldMapping.brand] : "";
      const manufacturer = fieldMapping.manufacturer ? row[fieldMapping.manufacturer] : "";
      
      const upc = fieldMapping.upc ? row[fieldMapping.upc] : "";
      const ean = fieldMapping.ean ? row[fieldMapping.ean] : "";
      const isbn = fieldMapping.isbn ? row[fieldMapping.isbn] : "";
      const partNumber = fieldMapping.partNumber ? row[fieldMapping.partNumber] : "";
      const identifiers = [upc, ean, isbn, partNumber].filter(Boolean);

      const unit = fieldMapping.unit ? row[fieldMapping.unit] : "";

      let salesAccountId = undefined;
      if (fieldMapping.salesAccount && row[fieldMapping.salesAccount]) {
        const accName = row[fieldMapping.salesAccount].trim().toLowerCase();
        const matched = accounts.find(a => a.name.toLowerCase() === accName);
        if (matched) salesAccountId = matched._id;
      }

      let purchaseAccountId = undefined;
      if (fieldMapping.purchaseAccount && row[fieldMapping.purchaseAccount]) {
        const accName = row[fieldMapping.purchaseAccount].trim().toLowerCase();
        const matched = accounts.find(a => a.name.toLowerCase() === accName);
        if (matched) purchaseAccountId = matched._id;
      }

      let inventoryAccountId = undefined;
      if (fieldMapping.inventoryAccount && row[fieldMapping.inventoryAccount]) {
        const accName = row[fieldMapping.inventoryAccount].trim().toLowerCase();
        const matched = accounts.find(a => a.name.toLowerCase() === accName);
        if (matched) inventoryAccountId = matched._id;
      }

      let warehouseId = undefined;
      if (fieldMapping.warehouseName && row[fieldMapping.warehouseName]) {
        const whName = row[fieldMapping.warehouseName].trim().toLowerCase();
        const matched = warehouses.find(w => w.name.toLowerCase() === whName);
        if (matched) warehouseId = matched._id;
      }

      let preferredVendorId = undefined;
      if (fieldMapping.preferredVendor && row[fieldMapping.preferredVendor]) {
        const vendorName = row[fieldMapping.preferredVendor].trim().toLowerCase();
        const matched = contacts.find(c => c.displayName.toLowerCase() === vendorName || c.companyName?.toLowerCase() === vendorName);
        if (matched) preferredVendorId = matched._id;
      }

      let interStateTaxId = undefined;
      if (fieldMapping.interStateTax && row[fieldMapping.interStateTax]) {
        const taxName = row[fieldMapping.interStateTax].trim().toLowerCase();
        const matched = taxes.find(t => t.name.toLowerCase() === taxName || String(t.rate) === taxName);
        if (matched) interStateTaxId = matched._id;
      }

      let intraStateTaxId = undefined;
      if (fieldMapping.intraStateTax && row[fieldMapping.intraStateTax]) {
        const taxName = row[fieldMapping.intraStateTax].trim().toLowerCase();
        const matched = taxes.find(t => t.name.toLowerCase() === taxName || String(t.rate) === taxName);
        if (matched) intraStateTaxId = matched._id;
      }

      const purchaseDescription = fieldMapping.purchaseDescription ? row[fieldMapping.purchaseDescription] : "";
      const costPrice = fieldMapping.costPrice ? parseFloat(row[fieldMapping.costPrice]) || 0 : 0;
      
      const itemType = fieldMapping.itemType && row[fieldMapping.itemType]?.toLowerCase().includes("service") ? "Service" : "Goods";
      const stockOnHand = fieldMapping.stockOnHand ? parseFloat(row[fieldMapping.stockOnHand]) || 0 : 0;
      const averageCost = fieldMapping.averageCost ? parseFloat(row[fieldMapping.averageCost]) || 0 : 0;
      const reorderPoint = fieldMapping.reorderPoint ? parseFloat(row[fieldMapping.reorderPoint]) || 0 : 0;

      const packageWeight = fieldMapping.packageWeight ? parseFloat(row[fieldMapping.packageWeight]) || 0 : 0;
      const packageLength = fieldMapping.packageLength ? parseFloat(row[fieldMapping.packageLength]) || 0 : 0;
      const packageWidth = fieldMapping.packageWidth ? parseFloat(row[fieldMapping.packageWidth]) || 0 : 0;
      const packageHeight = fieldMapping.packageHeight ? parseFloat(row[fieldMapping.packageHeight]) || 0 : 0;

      const weightUnit = (fieldMapping.weightUnit && row[fieldMapping.weightUnit]) ? row[fieldMapping.weightUnit].toLowerCase() : "kg";
      const dimensionUnit = (fieldMapping.dimensionUnit && row[fieldMapping.dimensionUnit]) ? row[fieldMapping.dimensionUnit].toLowerCase() : "cm";

      const weight = {
        value: packageWeight,
        unit: ["kg", "g", "lb", "oz"].includes(weightUnit) ? weightUnit : "kg"
      };

      const dimensions = {
        length: packageLength,
        width: packageWidth,
        height: packageHeight,
        unit: ["cm", "m", "in", "ft"].includes(dimensionUnit) ? dimensionUnit : "cm"
      };

      let taxPreference = "Taxable";
      if (fieldMapping.taxability && row[fieldMapping.taxability]) {
        const val = row[fieldMapping.taxability].toLowerCase();
        if (val.includes("non") || val.includes("untaxable")) taxPreference = "NonTaxable";
        else if (val.includes("exempt")) taxPreference = "Exempt";
      }

      const exemptionReason = fieldMapping.exemptionReason ? row[fieldMapping.exemptionReason] : "";

      return {
        name,
        sku: sku || undefined,
        hsnSacCode,
        sellingDescription,
        sellingPrice,
        returnableItem,
        brand,
        manufacturer,
        identifiers,
        unit: unit || undefined,
        salesAccountId,
        purchaseDescription,
        costPrice: costPrice || sellingPrice,
        itemType,
        purchaseAccountId,
        inventoryAccountId,
        reorderPoint,
        preferredVendorId,
        stockOnHand,
        averageCost: averageCost || costPrice,
        weight,
        dimensions,
        taxPreference,
        exemptionReason,
        warehouseId,
        interStateTaxId,
        intraStateTaxId,
        taxId: intraStateTaxId || interStateTaxId || undefined,
        isValid: true,
      };
    });

    setMappedItems(items);
    setStep(3);
  };

  const handleConfirmImport = async () => {
    const validItems = mappedItems.filter(item => item.isValid);
    if (validItems.length === 0) {
      toast.error("No valid items to import");
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validItems.length; i++) {
      try {
        const item = validItems[i];
        await itemApi.create({
          name: item.name,
          sku: item.sku,
          hsnSacCode: item.hsnSacCode,
          sellingDescription: item.sellingDescription || undefined,
          sellingPrice: item.sellingPrice,
          returnableItem: item.returnableItem,
          brand: item.brand || undefined,
          manufacturer: item.manufacturer || undefined,
          identifiers: item.identifiers,
          unit: item.unit,
          salesAccountId: item.salesAccountId,
          purchaseDescription: item.purchaseDescription || undefined,
          costPrice: item.costPrice,
          itemType: item.itemType,
          purchaseAccountId: item.purchaseAccountId,
          inventoryAccountId: item.inventoryAccountId,
          reorderPoint: item.reorderPoint,
          preferredVendorId: item.preferredVendorId,
          stockOnHand: item.stockOnHand,
          averageCost: item.averageCost,
          weight: item.weight,
          dimensions: item.dimensions,
          taxPreference: item.taxPreference,
          exemptionReason: item.exemptionReason || undefined,
          warehouseId: item.warehouseId,
          interStateTaxId: item.interStateTaxId,
          intraStateTaxId: item.intraStateTaxId,
          taxId: item.taxId,
          inventoryTracked: item.stockOnHand > 0,
        });
        successCount++;
      } catch (err) {
        failCount++;
        console.error(err);
      }
      setImportProgress(Math.round(((i + 1) / validItems.length) * 100));
    }

    setIsImporting(false);
    if (failCount === 0) {
      toast.success(`Successfully imported ${successCount} items!`);
      router.push("/items");
    } else {
      toast.warning(`Import complete with errors: ${successCount} succeeded, ${failCount} failed.`);
      router.push("/items");
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
              <button onClick={handleDownloadSample} className="text-blue-600 hover:underline">
                sample file
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

              <div className="border rounded-md overflow-hidden max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-xs font-semibold text-slate-700 py-3 pl-4">HAI Accounting Field</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-700 py-3">Import Header (CSV)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MAPPABLE_FIELDS.map((field) => (
                      <TableRow key={field.key}>
                        <TableCell className="py-3 pl-4">
                          <Label className="text-sm font-semibold text-slate-800">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </Label>
                        </TableCell>
                        <TableCell className="py-3">
                          <Select
                            value={fieldMapping[field.key as keyof MappingState] || ""}
                            onValueChange={(val) =>
                              setFieldMapping((prev) => ({ ...prev, [field.key]: val }))
                            }
                          >
                            <SelectTrigger className="w-full md:w-[320px] bg-white border-slate-300">
                              <SelectValue placeholder="- Select Header -" />
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

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

        {step === 3 && (
          <div className="space-y-6">
            <Card className="p-6 bg-white space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Import Preview</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm the parsed items from your CSV file. Make sure everything is correct before final submission.
                </p>
              </div>

              <div className="border rounded-md overflow-hidden max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-xs font-semibold py-2">Name</TableHead>
                      <TableHead className="text-xs font-semibold py-2">SKU</TableHead>
                      <TableHead className="text-xs font-semibold py-2">Type</TableHead>
                      <TableHead className="text-xs font-semibold py-2 text-right">Selling Price</TableHead>
                      <TableHead className="text-xs font-semibold py-2 text-right">Cost Price</TableHead>
                      <TableHead className="text-xs font-semibold py-2 text-right">Stock</TableHead>
                      <TableHead className="text-xs font-semibold py-2">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedItems.map((item, idx) => (
                      <TableRow key={idx} className={item.isValid ? "" : "bg-red-50/50"}>
                        <TableCell className="text-xs py-2 font-medium">{item.name || <span className="text-red-500 italic">Missing Name</span>}</TableCell>
                        <TableCell className="text-xs py-2 text-slate-500">{item.sku || "—"}</TableCell>
                        <TableCell className="text-xs py-2 text-slate-500">{item.itemType}</TableCell>
                        <TableCell className="text-xs py-2 text-right tabular-nums">₹{item.sellingPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-xs py-2 text-right tabular-nums">₹{item.costPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-xs py-2 text-right tabular-nums">{item.stockOnHand}</TableCell>
                        <TableCell className="text-xs py-2">
                          {item.isValid ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 text-[10px] py-0 h-4">Ready</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 text-[10px] py-0 h-4">Error</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {isImporting && (
                <div className="space-y-2 pt-2">
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
                disabled={isImporting || mappedItems.filter(item => item.isValid).length === 0} 
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Import Items ({mappedItems.filter(item => item.isValid).length})</span>
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={isImporting} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                Back
              </Button>
            </div>
          </div>
        )}
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
