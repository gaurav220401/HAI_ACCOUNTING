"use client";
import Link from "next/link";

import React, { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  Plus, Search, Package, RefreshCw, Pencil, X, MoreHorizontal, Copy,
  EyeOff, Eye, Trash2, Loader2, ShoppingCart, Tag, ArrowRightLeft, Truck, FileUp, Upload, Download,
  GripVertical, ChevronDown, Info
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { itemApi, type Item, type ItemBulkAction, type ItemInventoryMetrics } from "@/lib/api/items";
import { inventoryApi, type InventoryAdjustment } from "@/lib/api/inventory";
import { reportApi } from "@/lib/api/reports";

// ─── Item detail type with populated fields ────────────────────────────────
interface PopulatedAccount { _id: string; name: string; }
interface PopulatedUnit    { _id: string; name: string; abbreviation: string; }
interface PopulatedTax     { _id: string; name: string; rate: number; taxType: string; }
interface ItemDetail extends Omit<Item, "salesAccountId" | "purchaseAccountId" | "inventoryAccountId" | "unit" | "intraStateTaxId" | "interStateTaxId"> {
  salesAccountId?: PopulatedAccount | string | null;
  purchaseAccountId?: PopulatedAccount | string | null;
  inventoryAccountId?: PopulatedAccount | string | null;
  unit?: PopulatedUnit | string | null;
  intraStateTaxId?: PopulatedTax | string | null;
  interStateTaxId?: PopulatedTax | string | null;
}

interface OpeningStockFormState {
  openingStock: string;
  ratePerUnit: string;
}

interface AdjustStockFormState {
  mode: "Quantity" | "Value";
  date: string;
  account: string;
  referenceNumber: string;
  quantityAdjusted: string;
  costPrice: string;
  valueDelta: string;
  reason: string;
  description: string;
}

const ADJUSTMENT_REASON_OPTIONS = [
  "Stock Count",
  "Damage",
  "Loss",
  "Found",
  "Return",
  "Manual",
  "Other",
] as const;

interface ExportTemplateField {
  backendField: string;
  exportHeader: string;
}

interface ExportTemplate {
  id: string;
  name: string;
  fields: ExportTemplateField[];
}

const AVAILABLE_ITEM_FIELDS = [
  { value: "_id", label: "Item ID" },
  { value: "createdAt", label: "Created Time" },
  { value: "updatedAt", label: "Last Modified Time" },
  { value: "name", label: "Item Name" },
  { value: "sellingDescription", label: "Sales Description" },
  { value: "sellingPrice", label: "Selling Price" },
  { value: "salesAccount", label: "Sales Account" },
  { value: "returnableItem", label: "Is Returnable Item" },
  { value: "brand", label: "Brand" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "packageWeight", label: "Package Weight" },
  { value: "packageLength", label: "Package Length" },
  { value: "packageWidth", label: "Package Width" },
  { value: "packageHeight", label: "Package Height" },
  { value: "dimensionUnit", label: "Dimension Unit" },
  { value: "weightUnit", label: "Weight Unit" },
  { value: "isReceivableService", label: "Is Receivable Service" },
  { value: "taxName", label: "Tax Name" },
  { value: "taxPercentage", label: "Tax Percentage" },
  { value: "taxType", label: "Tax Type" },
  { value: "productType", label: "Product Type" },
  { value: "source", label: "Source" },
  { value: "referenceId", label: "Reference ID" },
  { value: "lastSyncTime", label: "Last Sync Time" },
  { value: "status", label: "Status" },
  { value: "unit", label: "Unit" },
  { value: "unitName", label: "Unit Name" },
  { value: "sku", label: "SKU" },
  { value: "upc", label: "UPC" },
  { value: "ean", label: "EAN" },
  { value: "isbn", label: "ISBN" },
  { value: "partNumber", label: "Part Number" },
  { value: "purchasePrice", label: "Purchase Price" },
  { value: "purchaseAccount", label: "Purchase Account" },
  { value: "purchaseDescription", label: "Purchase Description" },
  { value: "inventoryAccount", label: "Inventory Account" },
  { value: "inventoryValuationMethod", label: "Inventory Valuation Method" },
  { value: "reorderLevel", label: "Reorder Level" },
  { value: "preferredVendor", label: "Preferred Vendor" },
  { value: "openingStock", label: "Opening Stock" },
  { value: "openingStockValue", label: "Opening Stock Value" },
  { value: "stockOnHand", label: "Stock On Hand" },
  { value: "isComboProduct", label: "Is Combo Product" },
  { value: "itemTypeDetailed", label: "Item Type" },
  { value: "sellable", label: "Sellable" },
  { value: "purchasable", label: "Purchasable" },
  { value: "trackInventory", label: "Track Inventory" },
  { value: "productName", label: "Product Name" },
  { value: "itemDescription", label: "Item Description" },
  { value: "attributeName1", label: "AttributeName1" },
  { value: "attributeName2", label: "AttributeName2" },
  { value: "attributeName3", label: "AttributeName3" },
  { value: "attributeOption1", label: "AttributeOption1" },
  { value: "attributeOption2", label: "AttributeOption2" },
  { value: "attributeOption3", label: "AttributeOption3" }
];

function ItemsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [items, setItems] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | "Goods" | "Service">("All");

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [inventoryMetrics, setInventoryMetrics] = useState<ItemInventoryMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "history">("overview");
  const [itemTransactions, setItemTransactions] = useState<any[]>([]);
  const [itemTransactionsLoading, setItemTransactionsLoading] = useState(false);

  // Action states
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [actioning, setActioning] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkActioning, setBulkActioning] = useState(false);

  // CSV Import/Export states
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const imageImportInputRef = React.useRef<HTMLInputElement>(null);
  const [importingItems, setImportingItems] = useState<any[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Export Modals States
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [newTemplateModalOpen, setNewTemplateModalOpen] = useState(false);
  
  const [exportModule, setExportModule] = useState("Items");
  const [exportPeriod, setExportPeriod] = useState<"all" | "specific">("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default-standard");
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  
  const [exportDecimalFormat, setExportDecimalFormat] = useState("1234567.89");
  const [exportFileFormat, setExportFileFormat] = useState<"CSV" | "XLS" | "XLSX">("CSV");
  const [exportIncludePII, setExportIncludePII] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportShowPassword, setExportShowPassword] = useState(false);
  const [exportFilterCriteria, setExportFilterCriteria] = useState<"created" | "modified">("created");

  // New Export Template modal states
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateFields, setNewTemplateFields] = useState<ExportTemplateField[]>([
    { backendField: "name", exportHeader: "Item Name" }
  ]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleImportImagesFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    toast.success(`Successfully uploaded ${files.length} images for item mapping!`);
    if (imageImportInputRef.current) imageImportInputRef.current.value = "";
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) {
        toast.error("Failed to read file or file is empty");
        return;
      }

      try {
        const lines = text.split(/\r?\n/);
        if (lines.length <= 1) {
          toast.error("CSV file must have a header row and at least one data row");
          return;
        }

        // Parse header row
        const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
        
        // Find indexes of key fields
        const nameIdx = headers.findIndex(h => h.includes("name"));
        const skuIdx = headers.findIndex(h => h.includes("sku") || h.includes("code"));
        const sellingPriceIdx = headers.findIndex(h => h.includes("selling") || h.includes("price") || h.includes("rate") || h === "price");
        const costPriceIdx = headers.findIndex(h => h.includes("cost") || h.includes("purchase"));
        const descIdx = headers.findIndex(h => h.includes("desc"));
        const typeIdx = headers.findIndex(h => h.includes("type"));
        const unitIdx = headers.findIndex(h => h.includes("unit"));
        const stockIdx = headers.findIndex(h => h.includes("stock") || h.includes("hand"));

        if (nameIdx === -1) {
          toast.error("CSV must contain a column named 'Name' or similar");
          return;
        }

        const parsedItems: any[] = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV line splitter that handles quotes
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

          if (values.length === 0 || !values[nameIdx]) continue;

          const name = values[nameIdx];
          const sku = skuIdx !== -1 ? values[skuIdx] : undefined;
          const sellingPrice = sellingPriceIdx !== -1 ? parseFloat(values[sellingPriceIdx]) || 0 : 0;
          const costPrice = costPriceIdx !== -1 ? parseFloat(values[costPriceIdx]) || 0 : 0;
          const description = descIdx !== -1 ? values[descIdx] : undefined;
          const itemType = typeIdx !== -1 && (values[typeIdx].toLowerCase().includes("service") || values[typeIdx].toLowerCase() === "service") ? "Service" : "Goods";
          const stockOnHand = stockIdx !== -1 ? parseFloat(values[stockIdx]) || 0 : 0;

          parsedItems.push({
            name,
            sku: sku || undefined,
            sellingPrice,
            costPrice: costPrice || sellingPrice,
            description,
            itemType,
            stockOnHand,
            unit: unitIdx !== -1 ? values[unitIdx] : undefined
          });
        }

        if (parsedItems.length === 0) {
          toast.error("No valid items parsed from CSV file");
          return;
        }

        setImportingItems(parsedItems);
        setImportDialogOpen(true);
      } catch (err) {
        toast.error("Error parsing CSV file");
        console.error(err);
      }
    };
    reader.readAsText(file);
    
    if (importInputRef.current) importInputRef.current.value = "";
  };

  const handleConfirmImport = async () => {
    if (importingItems.length === 0) return;
    setIsImportSaving(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < importingItems.length; i++) {
      try {
        const item = importingItems[i];
        await itemApi.create({
          name: item.name,
          sku: item.sku,
          sellingPrice: item.sellingPrice,
          costPrice: item.costPrice,
          description: item.description,
          itemType: item.itemType,
          stockOnHand: item.stockOnHand,
          inventoryTracked: item.stockOnHand > 0,
          unit: item.unit
        });
        successCount++;
      } catch (err) {
        failCount++;
        console.error(err);
      }
      setImportProgress(Math.round(((i + 1) / importingItems.length) * 100));
    }

    setIsImportSaving(false);
    setImportDialogOpen(false);
    setImportingItems([]);
    await fetchItems();

    if (failCount === 0) {
      toast.success(`Successfully imported ${successCount} items!`);
    } else {
      toast.warning(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
    }
  };

  // Load/Save Export Templates
  useEffect(() => {
    const saved = localStorage.getItem("hai_item_export_templates");
    if (saved) {
      try {
        setExportTemplates(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const defaultTemplates: ExportTemplate[] = [
    {
      id: "default-standard",
      name: "Standard Template",
      fields: [
        { backendField: "_id", exportHeader: "Item ID" },
        { backendField: "createdAt", exportHeader: "Created Time" },
        { backendField: "updatedAt", exportHeader: "Last Modified Time" },
        { backendField: "name", exportHeader: "Item Name" },
        { backendField: "sellingDescription", exportHeader: "Sales Description" },
        { backendField: "sellingPrice", exportHeader: "Selling Price" },
        { backendField: "salesAccount", exportHeader: "Sales Account" },
        { backendField: "returnableItem", exportHeader: "Is Returnable Item" },
        { backendField: "brand", exportHeader: "Brand" },
        { backendField: "manufacturer", exportHeader: "Manufacturer" },
        { backendField: "packageWeight", exportHeader: "Package Weight" },
        { backendField: "packageLength", exportHeader: "Package Length" },
        { backendField: "packageWidth", exportHeader: "Package Width" },
        { backendField: "packageHeight", exportHeader: "Package Height" },
        { backendField: "dimensionUnit", exportHeader: "Dimension Unit" },
        { backendField: "weightUnit", exportHeader: "Weight Unit" },
        { backendField: "isReceivableService", exportHeader: "Is Receivable Service" },
        { backendField: "taxName", exportHeader: "Tax Name" },
        { backendField: "taxPercentage", exportHeader: "Tax Percentage" },
        { backendField: "taxType", exportHeader: "Tax Type" },
        { backendField: "productType", exportHeader: "Product Type" },
        { backendField: "source", exportHeader: "Source" },
        { backendField: "referenceId", exportHeader: "Reference ID" },
        { backendField: "lastSyncTime", exportHeader: "Last Sync Time" },
        { backendField: "status", exportHeader: "Status" },
        { backendField: "unit", exportHeader: "Unit" },
        { backendField: "unitName", exportHeader: "Unit Name" },
        { backendField: "sku", exportHeader: "SKU" },
        { backendField: "upc", exportHeader: "UPC" },
        { backendField: "ean", exportHeader: "EAN" },
        { backendField: "isbn", exportHeader: "ISBN" },
        { backendField: "partNumber", exportHeader: "Part Number" },
        { backendField: "purchasePrice", exportHeader: "Purchase Price" },
        { backendField: "purchaseAccount", exportHeader: "Purchase Account" },
        { backendField: "purchaseDescription", exportHeader: "Purchase Description" },
        { backendField: "inventoryAccount", exportHeader: "Inventory Account" },
        { backendField: "inventoryValuationMethod", exportHeader: "Inventory Valuation Method" },
        { backendField: "reorderLevel", exportHeader: "Reorder Level" },
        { backendField: "preferredVendor", exportHeader: "Preferred Vendor" },
        { backendField: "openingStock", exportHeader: "Opening Stock" },
        { backendField: "openingStockValue", exportHeader: "Opening Stock Value" },
        { backendField: "stockOnHand", exportHeader: "Stock On Hand" },
        { backendField: "isComboProduct", exportHeader: "Is Combo Product" },
        { backendField: "itemTypeDetailed", exportHeader: "Item Type" },
        { backendField: "sellable", exportHeader: "Sellable" },
        { backendField: "purchasable", exportHeader: "Purchasable" },
        { backendField: "trackInventory", exportHeader: "Track Inventory" },
        { backendField: "productName", exportHeader: "Product Name" },
        { backendField: "itemDescription", exportHeader: "Item Description" },
        { backendField: "attributeName1", exportHeader: "AttributeName1" },
        { backendField: "attributeName2", exportHeader: "AttributeName2" },
        { backendField: "attributeName3", exportHeader: "AttributeName3" },
        { backendField: "attributeOption1", exportHeader: "AttributeOption1" },
        { backendField: "attributeOption2", exportHeader: "AttributeOption2" },
        { backendField: "attributeOption3", exportHeader: "AttributeOption3" }
      ]
    }
  ];

  const allTemplates = [...defaultTemplates, ...exportTemplates];
  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId);
  const filteredTemplates = allTemplates.filter(t => 
    t.name.toLowerCase().includes(templateSearchQuery.toLowerCase())
  );

  const handleExportItemsSubmit = () => {
    const template = selectedTemplate || defaultTemplates[0];
    
    let itemsToExport = items;
    if (exportPeriod === "specific" && exportStartDate && exportEndDate) {
      const start = new Date(exportStartDate + "T00:00:00").getTime();
      const end = new Date(exportEndDate + "T23:59:59").getTime();
      itemsToExport = items.filter(item => {
        const dateToCheck = exportFilterCriteria === "created" 
          ? item.createdAt 
          : item.updatedAt || item.createdAt;
        const itemTime = new Date(dateToCheck || '').getTime();
        return itemTime >= start && itemTime <= end;
      });
    }

    if (itemsToExport.length === 0) {
      toast.error("No items found for the selected criteria");
      return;
    }

    if (exportPassword) {
      if (exportPassword.length < 12) {
        toast.error("Password must be at least 12 characters");
        return;
      }
      const hasUppercase = /[A-Z]/.test(exportPassword);
      const hasLowercase = /[a-z]/.test(exportPassword);
      const hasNumber = /[0-9]/.test(exportPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(exportPassword);
      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        toast.error("Password must include uppercase, lowercase, number, and special character");
        return;
      }
    }

    const formatNumber = (num: number, isCurrency: boolean = false) => {
      let formatted = "";
      if (exportDecimalFormat === "1234567.89") {
        formatted = num.toFixed(2);
      } else if (exportDecimalFormat === "1,234,567.89") {
        formatted = new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(num);
      } else if (exportDecimalFormat === "12,34,567.89") {
        formatted = new Intl.NumberFormat("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(num);
      } else {
        formatted = num.toFixed(2);
      }
      return isCurrency ? `INR ${formatted}` : formatted;
    };

    const formatDateTime = (dateStr: string) => {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const getUnitName = (u: any) => {
      if (typeof u === "object" && u) return u.name || u.abbreviation || "";
      const s = String(u || "").toLowerCase();
      if (s === "pcs") return "Pieces";
      if (s === "box") return "Box";
      if (s === "ft") return "Feet";
      if (s === "m") return "Meter";
      if (s === "cm") return "Centimeter";
      if (s === "in") return "Inch";
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
    };

    const headers = template.fields.map(f => f.exportHeader);
    const rows = itemsToExport.map(item => {
      return template.fields.map(f => {
        switch (f.backendField) {
          case "_id":
            return item._id;
          case "createdAt":
            return formatDateTime(item.createdAt);
          case "updatedAt":
            return formatDateTime(item.updatedAt);
          case "name":
            return item.name;
          case "sellingDescription":
            return item.sellingDescription || "";
          case "sellingPrice":
            return formatNumber(item.sellingPrice || 0, true);
          case "salesAccount": {
            const accName = typeof item.salesAccountId === "object" && item.salesAccountId 
              ? (item.salesAccountId as any).name 
              : String(item.salesAccountId || "Sales");
            return accName;
          }
          case "returnableItem":
            return item.returnableItem ?? false;
          case "brand":
            return item.brand || "";
          case "manufacturer":
            return item.manufacturer || "";
          case "packageWeight":
            return item.weight?.value ?? 0.0;
          case "packageLength":
            return item.dimensions?.length ?? 0.0;
          case "packageWidth":
            return item.dimensions?.width ?? 0.0;
          case "packageHeight":
            return item.dimensions?.height ?? 0.0;
          case "dimensionUnit":
            return item.dimensions?.unit || "";
          case "weightUnit":
            return item.weight?.unit || "";
          case "isReceivableService":
            return (item as any).isReceivableService ?? null;
          case "taxName":
            return typeof item.taxId === "object" && item.taxId ? (item.taxId as any).name : "";
          case "taxPercentage":
            return typeof item.taxId === "object" && item.taxId ? (item.taxId as any).rate : "";
          case "taxType":
            return typeof item.taxId === "object" && item.taxId ? (item.taxId as any).taxType : "";
          case "productType":
            return item.itemType?.toLowerCase() || "";
          case "source":
            return (item as any).source ?? 2;
          case "referenceId":
            return (item as any).referenceId ?? null;
          case "lastSyncTime":
            return (item as any).lastSyncTime ?? null;
          case "status":
            return item.isActive ? "Active" : "Inactive";
          case "unit":
            return typeof item.unit === "object" && item.unit 
              ? (item.unit as any).abbreviation || (item.unit as any).name || ""
              : String(item.unit || "");
          case "unitName":
            return getUnitName(item.unit);
          case "sku":
            return item.sku || "";
          case "upc":
            return (item as any).upc ?? null;
          case "ean":
            return (item as any).ean ?? null;
          case "isbn":
            return (item as any).isbn ?? null;
          case "partNumber":
            return (item as any).partNumber ?? null;
          case "purchasePrice":
            return formatNumber(item.costPrice || 0, true);
          case "purchaseAccount": {
            const accName = typeof item.purchaseAccountId === "object" && item.purchaseAccountId 
              ? (item.purchaseAccountId as any).name 
              : String(item.purchaseAccountId || "Cost of Goods Sold");
            return accName;
          }
          case "purchaseDescription":
            return item.purchaseDescription || "";
          case "inventoryAccount": {
            const accName = typeof item.inventoryAccountId === "object" && item.inventoryAccountId 
              ? (item.inventoryAccountId as any).name 
              : String(item.inventoryAccountId || "Inventory Asset");
            return accName;
          }
          case "inventoryValuationMethod":
            return item.valuationMethod?.toLowerCase() || null;
          case "reorderLevel":
            return item.reorderPoint ?? null;
          case "preferredVendor":
            return typeof (item as any).preferredVendorId === "object" && (item as any).preferredVendorId 
              ? ((item as any).preferredVendorId as any).name 
              : ((item as any).preferredVendorId || null);
          case "openingStock":
            return (item as any).openingStock ?? null;
          case "openingStockValue": {
            const val = (item as any).openingStockValue;
            if (val === undefined || val === null) return null;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? val : formatNumber(parsed, true);
          }
          case "stockOnHand":
            return item.stockOnHand;
          case "isComboProduct":
            return (item as any).isComboProduct ?? false;
          case "itemTypeDetailed": {
            if (item.inventoryTracked) return "Inventory";
            if (item.itemType === "Service") return "Sales";
            return "Sales and Purchases";
          }
          case "sellable":
            return (item as any).sellable ?? true;
          case "purchasable":
            return item.itemType === "Service" ? false : true;
          case "trackInventory":
            return item.inventoryTracked;
          case "productName":
            return item.name;
          case "itemDescription":
            return item.description || "";
          default:
            const fallback = (item as any)[f.backendField];
            return fallback === undefined || fallback === null ? "" : String(fallback);
        }
      });
    });

    try {
      const wsData = [headers, ...rows];
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Items");
      
      const fileExt = exportFileFormat.toLowerCase(); // 'csv' | 'xls' | 'xlsx'
      const fileName = `items_export_${new Date().toISOString().split('T')[0]}.${fileExt}`;
      
      XLSX.writeFile(workbook, fileName, {
        bookType: fileExt === "xls" ? "biff8" : fileExt === "csv" ? "csv" : "xlsx"
      });
      
      if (exportPassword) {
        toast.success("Items exported successfully with password protection");
      } else {
        toast.success("Items exported successfully");
      }
      setExportModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to export items");
    }
  };

  const handleExportCurrentView = () => {
    if (filtered.length === 0) {
      toast.error("No items in the current view to export");
      return;
    }
    
    const headers = [
      "Name",
      "Purchase Description",
      "Purchase Rate",
      "Description",
      "Rate",
      "Stock On Hand",
      "HSN/SAC",
      "Usage Unit"
    ];

    const rows = filtered.map(item => [
      item.name,
      item.purchaseDescription || "",
      item.costPrice || 0,
      item.sellingDescription || item.description || "",
      item.sellingPrice || 0,
      item.itemType === "Service" ? "—" : item.stockOnHand || 0,
      item.hsnSacCode || "",
      typeof item.unit === "object" && item.unit 
        ? (item.unit as any).abbreviation || "" 
        : String(item.unit || "")
    ]);

    try {
      const wsData = [headers, ...rows];
      const worksheet = XLSX.utils.aoa_to_sheet(wsData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Current View Items");
      XLSX.writeFile(workbook, `items_current_view_${new Date().toISOString().split('T')[0]}.csv`, {
        bookType: "csv"
      });
      toast.success("Current view exported successfully to CSV");
    } catch (error) {
      console.error(error);
      toast.error("Failed to export current view");
    }
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (newTemplateFields.length === 0) {
      toast.error("At least one field is required");
      return;
    }
    
    if (allTemplates.some(t => t.name.toLowerCase() === newTemplateName.trim().toLowerCase())) {
      toast.error("A template with this name already exists");
      return;
    }

    const newTpl: ExportTemplate = {
      id: "tpl-" + Date.now(),
      name: newTemplateName.trim(),
      fields: newTemplateFields
    };

    const updated = [...exportTemplates, newTpl];
    setExportTemplates(updated);
    localStorage.setItem("hai_item_export_templates", JSON.stringify(updated));
    
    setSelectedTemplateId(newTpl.id);
    setNewTemplateModalOpen(false);
    toast.success(`Template "${newTpl.name}" created and selected`);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    const updated = [...newTemplateFields];
    const [draggedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setNewTemplateFields(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleAddField = () => {
    setNewTemplateFields([
      ...newTemplateFields,
      { backendField: "sku", exportHeader: "SKU" }
    ]);
  };

  const handleRemoveField = (index: number) => {
    setNewTemplateFields(newTemplateFields.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, backendField: string) => {
    const selectedOption = AVAILABLE_ITEM_FIELDS.find(f => f.value === backendField);
    const updated = [...newTemplateFields];
    updated[index] = {
      backendField,
      exportHeader: selectedOption ? selectedOption.label : backendField
    };
    setNewTemplateFields(updated);
  };

  const handleHeaderChange = (index: number, exportHeader: string) => {
    const updated = [...newTemplateFields];
    updated[index] = {
      ...updated[index],
      exportHeader
    };
    setNewTemplateFields(updated);
  };


  const [openingStockDialogOpen, setOpeningStockDialogOpen] = useState(false);
  const [openingStockSaving, setOpeningStockSaving] = useState(false);
  const [openingStockForm, setOpeningStockForm] = useState<OpeningStockFormState>({
    openingStock: "0",
    ratePerUnit: "0",
  });

  const [adjustStockDialogOpen, setAdjustStockDialogOpen] = useState(false);
  const [adjustStockSaving, setAdjustStockSaving] = useState(false);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [stockAdjustments, setStockAdjustments] = useState<InventoryAdjustment[]>([]);
  const [adjustStockForm, setAdjustStockForm] = useState<AdjustStockFormState>({
    mode: "Quantity",
    date: new Date().toISOString().slice(0, 10),
    account: "",
    referenceNumber: "",
    quantityAdjusted: "",
    costPrice: "",
    valueDelta: "",
    reason: "Manual",
    description: "",
  });

  // ─── Auth guards ────────────────────────────────────────────────────────
  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  // ─── Data fetching ───────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setFetching(true);
    try {
      const res = await itemApi.list({ page: 1, limit: 200 });
      setItems(res.data ?? []);
    } catch { /* noop */ }
    finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) {
      void fetchItems();
    }
  }, [firebaseUser, loading, activeOrganization?._id, fetchItems]);

  useEffect(() => {
    if (idFromUrl && items.length > 0) {
      const match = items.find((i) => i._id === idFromUrl);
      if (match) {
        selectItem(idFromUrl);
      }
    }
  }, [idFromUrl, items]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await itemApi.getById(id);
      setDetail(res.data as unknown as ItemDetail);
    } catch { toast.error("Failed to load item details"); }
    finally { setDetailLoading(false); }
  }, []);

  const loadItemAdjustments = useCallback(async (id: string) => {
    setAdjustmentsLoading(true);
    try {
      const res = await inventoryApi.listAdjustments({ itemId: id, page: 1, limit: 50 });
      setStockAdjustments(res.data ?? []);
    } catch {
      setStockAdjustments([]);
    } finally {
      setAdjustmentsLoading(false);
    }
  }, []);

  const fetchInventoryMetrics = useCallback(async (id: string) => {
    setMetricsLoading(true);
    try {
      const res = await itemApi.getInventoryMetrics(id);
      setInventoryMetrics(res.data ?? null);
    } catch {
      setInventoryMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const fetchItemTransactions = useCallback(async (id: string) => {
    setItemTransactionsLoading(true);
    try {
      const [salesRes, purchaseRes] = await Promise.all([
        reportApi.salesByItemDetails({ itemId: id }),
        reportApi.purchasesByItemDetails({ itemId: id }),
      ]);
      
      const sales = (salesRes.data.rows || []).map((r: any) => ({
        ...r,
        type: "Sale",
        date: r.invoiceDate,
        number: r.invoiceNumber,
        party: r.customerName,
        delta: -r.quantity,
      }));
      
      const purchases = (purchaseRes.data.rows || []).map((r: any) => ({
        ...r,
        type: "Purchase",
        date: r.billDate,
        number: r.billNumber,
        party: r.vendorName,
        delta: r.quantity,
      }));
      
      const combined = [...sales, ...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItemTransactions(combined);
    } catch {
      setItemTransactions([]);
    } finally {
      setItemTransactionsLoading(false);
    }
  }, []);

  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchItemLedger = useCallback(async (id: string) => {
    setLedgerLoading(true);
    try {
      const res = await reportApi.itemTransactionHistory({ itemId: id });
      setLedgerRows(res.data.rows || []);
    } catch {
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  const refreshSelectedItem = useCallback(async (id: string) => {
    await Promise.all([
      fetchDetail(id),
      fetchItems(),
      loadItemAdjustments(id),
      fetchInventoryMetrics(id),
      fetchItemTransactions(id),
      fetchItemLedger(id),
    ]);
  }, [fetchDetail, fetchItems, loadItemAdjustments, fetchInventoryMetrics, fetchItemTransactions, fetchItemLedger]);

  function selectItem(id: string) {
    setSelectedId(id);
    setActiveTab("overview");
    void fetchDetail(id);
    void loadItemAdjustments(id);
    void fetchInventoryMetrics(id);
    void fetchItemTransactions(id);
    void fetchItemLedger(id);
  }

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setInventoryMetrics(null);
    setStockAdjustments([]);
    setItemTransactions([]);
    setOpeningStockDialogOpen(false);
    setAdjustStockDialogOpen(false);
  }

  function openOpeningStockDialog() {
    if (!detail?.inventoryTracked) return;
    setOpeningStockForm({
      openingStock: String(Number(inventoryMetrics?.openingStock ?? detail.stockOnHand ?? 0)),
      ratePerUnit: "0",
    });
    setOpeningStockDialogOpen(true);
  }

  function openAdjustStockDialog() {
    if (!detail?.inventoryTracked) return;
    setAdjustStockForm({
      mode: "Quantity",
      date: new Date().toISOString().slice(0, 10),
      account:
        accountName(detail.purchaseAccountId as PopulatedAccount | string | null) !== "—"
          ? accountName(detail.purchaseAccountId as PopulatedAccount | string | null)
          : accountName(detail.inventoryAccountId as PopulatedAccount | string | null),
      referenceNumber: "",
      quantityAdjusted: "",
      costPrice: String(Number(detail.averageCost || detail.costPrice || 0)),
      valueDelta: "",
      reason: "Manual",
      description: "",
    });
    setAdjustStockDialogOpen(true);
  }

  async function handleSaveOpeningStock() {
    if (!detail) return;

    const openingStock = Number(String(openingStockForm.openingStock || "0").trim() || "0");
    const ratePerUnit = Number(String(openingStockForm.ratePerUnit || "0").trim() || "0");

    if (!Number.isFinite(openingStock) || openingStock < 0) {
      toast.error("Opening stock must be zero or a positive number");
      return;
    }
    if (!Number.isFinite(ratePerUnit) || ratePerUnit < 0) {
      toast.error("Opening stock rate must be zero or a positive number");
      return;
    }

    setOpeningStockSaving(true);
    try {
      await itemApi.update(detail._id, {
        inventoryTracked: true,
        stockOnHand: openingStock,
        averageCost: ratePerUnit,
        inventoryValue: openingStock * ratePerUnit,
      });
      toast.success("Opening stock updated");
      setOpeningStockDialogOpen(false);
      await refreshSelectedItem(detail._id);
    } catch (e) {
      toast.error((e as Error).message || "Failed to update opening stock");
    } finally {
      setOpeningStockSaving(false);
    }
  }

  async function handleSubmitStockAdjustment() {
    if (!detail) return;

    const quantityAvailable = Number(detail.stockOnHand || 0);
    const quantityAdjusted = Number(adjustStockForm.quantityAdjusted || 0);
    const adjustedAt = new Date(`${adjustStockForm.date || new Date().toISOString().slice(0, 10)}T00:00:00`).toISOString();

    if (!adjustStockForm.reason.trim()) {
      toast.error("Please select a reason");
      return;
    }

    setAdjustStockSaving(true);
    try {
      if (adjustStockForm.mode === "Quantity") {
        if (!Number.isFinite(quantityAdjusted) || quantityAdjusted === 0) {
          toast.error("Quantity adjusted must be a non-zero number");
          return;
        }

        const projectedStock = quantityAvailable + quantityAdjusted;
        if (projectedStock < 0) {
          toast.error("Quantity adjusted cannot reduce stock below zero");
          return;
        }

        const unitCost = Number(adjustStockForm.costPrice || detail.averageCost || detail.costPrice || 0);
        if (!Number.isFinite(unitCost) || unitCost < 0) {
          toast.error("Cost price must be zero or a positive number");
          return;
        }

        await inventoryApi.createAdjustment({
          itemId: detail._id,
          adjustmentType: "Quantity",
          direction: quantityAdjusted < 0 ? "Decrease" : "Increase",
          quantityDelta: Math.abs(quantityAdjusted),
          accountId: accountId(detail.purchaseAccountId as PopulatedAccount | string | null) || undefined,
          unitCost,
          reason: adjustStockForm.reason,
          referenceNumber: adjustStockForm.referenceNumber || undefined,
          notes: adjustStockForm.description || undefined,
          adjustedAt,
        });
      } else {
        const valueDelta = Number(adjustStockForm.valueDelta || 0);
        if (!Number.isFinite(valueDelta) || valueDelta === 0) {
          toast.error("Value adjusted must be a non-zero number");
          return;
        }

        await inventoryApi.createAdjustment({
          itemId: detail._id,
          adjustmentType: "Value",
          direction: valueDelta < 0 ? "Decrease" : "Increase",
          quantityDelta: 0,
          accountId: accountId(detail.purchaseAccountId as PopulatedAccount | string | null) || undefined,
          valueDelta,
          reason: adjustStockForm.reason,
          referenceNumber: adjustStockForm.referenceNumber || undefined,
          notes: adjustStockForm.description || undefined,
          adjustedAt,
        });
      }

      toast.success("Stock adjusted");
      setAdjustStockDialogOpen(false);
      await refreshSelectedItem(detail._id);
    } catch (e) {
      toast.error((e as Error).message || "Failed to post stock adjustment");
    } finally {
      setAdjustStockSaving(false);
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────
  async function handleClone(item: Item) {
    setActioning(true);
    try {
      const taxId = typeof item.taxId === "object" && item.taxId ? (item.taxId as { _id: string })._id : (item.taxId as string) ?? undefined;
      const intraStateTaxId =
        typeof item.intraStateTaxId === "object" && item.intraStateTaxId
          ? (item.intraStateTaxId as { _id: string })._id
          : (item.intraStateTaxId as string) ?? undefined;
      const interStateTaxId =
        typeof item.interStateTaxId === "object" && item.interStateTaxId
          ? (item.interStateTaxId as { _id: string })._id
          : (item.interStateTaxId as string) ?? undefined;

      await itemApi.create({
        name: `Copy of ${item.name}`,
        description: item.description,
        identifiers: item.identifiers,
        itemMode: item.itemMode,
        itemType: item.itemType,
        brand: item.brand,
        manufacturer: item.manufacturer,
        unit: typeof item.unit === "object" && item.unit ? (item.unit as { _id: string })._id : (item.unit as string) ?? undefined,
        sku: item.sku ? `${item.sku}-copy` : undefined,
        sellingPrice: item.sellingPrice,
        costPrice: item.costPrice,
        salesAccountId: item.salesAccountId as string | undefined,
        purchaseAccountId: item.purchaseAccountId as string | undefined,
        taxPreference: item.taxPreference,
        taxId,
        intraStateTaxId,
        interStateTaxId,
        hsnSacCode: item.hsnSacCode,
        sellingDescription: item.sellingDescription,
        purchaseDescription: item.purchaseDescription,
        inventoryTracked: item.inventoryTracked,
        stockOnHand: item.stockOnHand,
        averageCost: item.averageCost,
        inventoryValue: item.inventoryValue,
        reorderPoint: item.reorderPoint,
        inventoryAccountId: item.inventoryAccountId as string | undefined,
        valuationMethod: item.valuationMethod,
        returnableItem: item.returnableItem,
        dimensions: item.dimensions,
        weight: item.weight,
        preferredVendorId: item.preferredVendorId as string | undefined,
        warehouseId: item.warehouseId as string | undefined,
        image: item.image,
        rearImage: item.rearImage,
        otherImages: item.otherImages,
      });
      toast.success(`"${item.name}" cloned successfully`);
      fetchItems();
    } catch (e) { toast.error((e as Error).message ?? "Clone failed"); }
    finally { setActioning(false); }
  }

  async function handleToggleActive(item: Item) {
    setActioning(true);
    try {
      await itemApi.update(item._id, { isActive: !item.isActive } as Parameters<typeof itemApi.update>[1]);
      toast.success(`Item marked as ${item.isActive ? "inactive" : "active"}`);
      setItems((prev) => prev.map((i) => i._id === item._id ? { ...i, isActive: !item.isActive } : i));
      if (detail && detail._id === item._id) setDetail((d) => d ? { ...d, isActive: !item.isActive } : d);
    } catch (e) { toast.error((e as Error).message ?? "Update failed"); }
    finally { setActioning(false); }
  }

  async function handleDelete() {
    if (!toDelete) return;
    setActioning(true);
    try {
      await itemApi.remove(toDelete._id);
      toast.success(`"${toDelete.name}" deleted`);
      setItems((prev) => prev.filter((i) => i._id !== toDelete._id));
      if (selectedId === toDelete._id) closeDetail();
      setToDelete(null);
    } catch (e) { toast.error((e as Error).message ?? "Delete failed"); }
    finally { setActioning(false); }
  }

  async function handleBulkAction(action: ItemBulkAction) {
    if (selectedItemIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    setBulkActioning(true);
    try {
      const res = await itemApi.bulkAction({ action, itemIds: selectedItemIds });
      const changedIds = new Set(res.data?.itemIds || selectedItemIds);

      if (selectedId && changedIds.has(selectedId) && action === "delete") {
        closeDetail();
      }

      setSelectedItemIds([]);
      setBulkDeleteDialogOpen(false);
      await fetchItems();

      if (action === "activate") {
        toast.success(`${res.data.modifiedCount} item(s) marked as active`);
      } else if (action === "deactivate") {
        toast.success(`${res.data.modifiedCount} item(s) marked as inactive`);
      } else {
        toast.success(`${res.data.modifiedCount} item(s) deleted`);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Bulk action failed");
    } finally {
      setBulkActioning(false);
    }
  }

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedItemIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) return prev;
        return [...prev, itemId];
      }
      return prev.filter((id) => id !== itemId);
    });
  }

  function toggleSelectAllFiltered(checked: boolean, filteredIds: string[]) {
    setSelectedItemIds((prev) => {
      const filteredSet = new Set(filteredIds);
      if (checked) {
        const merged = new Set([...prev, ...filteredIds]);
        return Array.from(merged);
      }
      return prev.filter((id) => !filteredSet.has(id));
    });
  }

  function handleNewTransaction(type: "quote" | "salesOrder" | "invoice" | "purchaseOrder" | "bill") {
    if (selectedItemIds.length === 0) {
      toast.error("Select at least one item");
      return;
    }

    const itemIdsParam = encodeURIComponent(selectedItemIds.join(","));
    const routes: Record<typeof type, string> = {
      quote: "/sales/quotes/new",
      salesOrder: "/sales/orders/new",
      invoice: "/sales/invoices/new",
      purchaseOrder: "/purchases/orders/new",
      bill: "/purchases/bills/new",
    };
    router.push(`${routes[type]}?itemIds=${itemIdsParam}`);
  }

  // ─── Derived ─────────────────────────────────────────────────────────────
  const filtered = items.filter((i) => {
    const matchesType = typeFilter === "All" || i.itemType === typeFilter;
    const matchesSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? "").toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  useEffect(() => {
    const visibleSet = new Set(filtered.map((item) => item._id));
    setSelectedItemIds((prev) => {
      const next = prev.filter((id) => visibleSet.has(id));
      if (next.length === prev.length && next.every((id, idx) => id === prev[idx])) {
        return prev;
      }
      return next;
    });
  }, [filtered]);

  const filteredIds = useMemo(() => filtered.map((item) => item._id), [filtered]);
  const selectedFilteredCount = useMemo(
    () => filteredIds.reduce((count, id) => count + (selectedItemIds.includes(id) ? 1 : 0), 0),
    [filteredIds, selectedItemIds],
  );
  const allFilteredSelected = filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;
  const selectAllState: boolean | "indeterminate" = allFilteredSelected
    ? true
    : selectedFilteredCount > 0
      ? "indeterminate"
      : false;

  const openingStockValue = Number(inventoryMetrics?.openingStock ?? detail?.stockOnHand ?? 0);
  const stockOnHandValue = Number(inventoryMetrics?.accountingStock.stockOnHand ?? detail?.stockOnHand ?? 0);
  const committedStockValue = Number(inventoryMetrics?.accountingStock.committedStock ?? 0);
  const availableForSaleValue = Number(
    inventoryMetrics?.accountingStock.availableForSale ?? Math.max(stockOnHandValue - committedStockValue, 0),
  );
  const physicalStockOnHandValue = Number(inventoryMetrics?.physicalStock.stockOnHand ?? stockOnHandValue);
  const physicalCommittedStockValue = Number(inventoryMetrics?.physicalStock.committedStock ?? committedStockValue);
  const physicalAvailableForSaleValue = Number(
    inventoryMetrics?.physicalStock.availableForSale ?? availableForSaleValue,
  );
  const toBeShippedValue = Number(inventoryMetrics?.fulfillment.toBeShipped ?? 0);
  const toBeReceivedValue = Number(inventoryMetrics?.fulfillment.toBeReceived ?? 0);
  const toBeInvoicedValue = Number(inventoryMetrics?.fulfillment.toBeInvoiced ?? 0);
  const toBeBilledValue = Number(inventoryMetrics?.fulfillment.toBeBilled ?? 0);
  const salesSummaryPoints = inventoryMetrics?.salesSummary.points ?? [];
  const totalSalesAmount = Number(inventoryMetrics?.salesSummary.totalAmount ?? 0);

  const quantityAdjustedPreview = Number(adjustStockForm.quantityAdjusted || 0);
  const newQuantityOnHandPreview = useMemo(() => {
    if (!Number.isFinite(quantityAdjustedPreview)) return stockOnHandValue;
    return stockOnHandValue + quantityAdjustedPreview;
  }, [quantityAdjustedPreview, stockOnHandValue]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function accountName(field: PopulatedAccount | string | null | undefined) {
    if (!field) return "—";
    if (typeof field === "object") return field.name;
    return field;
  }

  function accountId(field: PopulatedAccount | string | null | undefined): string {
    if (!field) return "";
    if (typeof field === "object") return String(field._id || "");
    return String(field);
  }

  function unitDisplay(field: PopulatedUnit | string | null | undefined) {
    if (!field) return "—";
    if (typeof field === "object") return field.abbreviation;
    return field;
  }

  function dimensionsDisplay(item: ItemDetail | null) {
    if (!item?.dimensions) return "—";
    const length = Number(item.dimensions.length || 0);
    const width = Number(item.dimensions.width || 0);
    const height = Number(item.dimensions.height || 0);
    const unit = item.dimensions.unit || "cm";
    if (!length && !width && !height) return "—";
    return `${length} x ${width} x ${height} ${unit}`;
  }

  function weightDisplay(item: ItemDetail | null) {
    if (!item?.weight) return "—";
    const value = Number(item.weight.value || 0);
    const unit = item.weight.unit || "kg";
    if (!value) return "—";
    return `${value} ${unit}`;
  }

  function formatQuantity(value: number | string | null | undefined): string {
    const num = Number(value || 0);
    return Number(num).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function formatCurrency(value: number | string | null | undefined): string {
    const num = Number(value || 0);
    return `₹${Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={<span className="text-sm font-medium">Items</span>}
          actions={
            <>
              <div className="relative w-52">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  className="pl-7 h-8 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                {(["All", "Goods", "Service"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                      typeFilter === f
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                    }`}
                  >
                    {f === "Service" ? "Services" : f}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchItems} disabled={fetching}>
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => router.push("/items/new")}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white">
                  <DropdownMenuItem onClick={() => router.push("/batch-import?section=items&type=Items&back=/items")} className="cursor-pointer">
                    <span className="flex items-center gap-2 text-xs">
                      <FileUp className="h-4 w-4 text-slate-500" />
                      Batch Import
                    </span>
                  </DropdownMenuItem>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <Upload className="h-4 w-4 text-slate-500" />
                        Import
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-48 bg-white">
                        <DropdownMenuItem onClick={() => router.push("/items/import")} className="cursor-pointer">
                          <span className="text-xs">Import Items</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => imageImportInputRef.current?.click()} className="cursor-pointer">
                          <span className="text-xs">Import Items Images</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>

                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <Download className="h-4 w-4 text-slate-500" />
                        Export
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent className="w-48 bg-white">
                        <DropdownMenuItem onClick={() => setExportModalOpen(true)} className="cursor-pointer">
                          <span className="text-xs">Export Items</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportCurrentView} className="cursor-pointer">
                          <span className="text-xs">Export Current View</span>
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                type="file"
                ref={importInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleImportFileChange}
              />
              <input
                type="file"
                ref={imageImportInputRef}
                className="hidden"
                multiple
                accept="image/*"
                onChange={handleImportImagesFileChange}
              />
            </>
          }
        />

        {/* ── Body: table OR split panel ── */}
        {!selectedId ? (
          /* ── Full-width table view (initial state) ── */
          <div className="flex-1 overflow-auto">
            {fetching ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
                <Package className="h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">{search ? "No items match your search" : "No items yet"}</p>
                {!search && (
                  <Button size="sm" variant="outline" onClick={() => router.push("/items/new")}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New Item
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-0">
                <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" disabled={selectedItemIds.length === 0 || bulkActioning}>
                        Bulk Update
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem disabled={bulkActioning} onClick={() => handleBulkAction("activate")}>Mark as Active</DropdownMenuItem>
                      <DropdownMenuItem disabled={bulkActioning} onClick={() => handleBulkAction("deactivate")}>Mark as Inactive</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={bulkActioning}
                        onClick={() => setBulkDeleteDialogOpen(true)}
                      >
                        Delete Selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8" disabled={selectedItemIds.length === 0 || bulkActioning}>
                        New Transaction
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem onClick={() => handleNewTransaction("quote")}>Quote</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("salesOrder")}>Sales Order</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("invoice")}>Invoice</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("purchaseOrder")}>Purchase Order</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleNewTransaction("bill")}>Bill</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => handleBulkAction("activate")}
                  >
                    Mark as Active
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => handleBulkAction("deactivate")}
                  >
                    Mark as Inactive
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    disabled={selectedItemIds.length === 0 || bulkActioning}
                    onClick={() => setBulkDeleteDialogOpen(true)}
                  >
                    Delete
                  </Button>

                  <span className="ml-auto text-xs text-muted-foreground">
                    {selectedItemIds.length} selected
                  </span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAllState}
                          onCheckedChange={(checked) => toggleSelectAllFiltered(!!checked, filteredIds)}
                          aria-label="Select all filtered items"
                        />
                      </TableHead>
                      <TableHead className="w-[220px] font-semibold text-xs uppercase tracking-wide">Name</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Purchase Description</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Purchase Rate</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Description</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Rate</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide text-right">Stock On Hand</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">HSN/SAC</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wide">Usage Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow
                        key={item._id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => selectItem(item._id)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedItemIds.includes(item._id)}
                            onCheckedChange={(checked) => toggleItemSelection(item._id, !!checked)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${item.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-primary hover:underline">
                            {item.name}
                          </span>
                          {!item.isActive && (
                            <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.purchaseDescription || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {item.costPrice != null ? `₹${Number(item.costPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.sellingDescription || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {item.sellingPrice != null ? `₹${Number(item.sellingPrice).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {item.itemType === "Service" ? (
                            "—"
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {item.inventoryTracked && item.reorderPoint != null && item.stockOnHand <= item.reorderPoint && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                                  Low Stock
                                </Badge>
                              )}
                              <span>{formatQuantity(item.stockOnHand)}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{item.hsnSacCode || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {typeof item.unit === "object" && item.unit
                            ? (item.unit as { abbreviation: string }).abbreviation
                            : item.unit || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : (
          /* ── Split panel (list left + detail right) ── */
          <div className="flex flex-1 overflow-hidden">

            {/* Narrow left list */}
            <div className="w-72 min-w-[18rem] flex flex-col border-r bg-background overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {filtered.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => selectItem(item._id)}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors ${
                      selectedId === item._id
                        ? "bg-primary/5 border-l-2 border-l-primary pl-[14px]"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${selectedId === item._id ? "text-primary" : ""}`}>
                        {item.name}
                      </span>
                      {!item.isActive && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">Inactive</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">{item.sku || item.itemType}</span>
                      <span className="text-xs tabular-nums font-medium">
                        {item.sellingPrice != null ? `₹${item.sellingPrice.toLocaleString("en-IN")}` : "—"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 border-t text-xs text-muted-foreground shrink-0">
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Detail panel */}
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              {detailLoading || !detail ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Detail header */}
                  <div className="flex items-center gap-3 px-6 py-3 border-b bg-background shrink-0">
                    <h2 className="text-base font-semibold flex-1 truncate">{detail.name}</h2>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => router.push(`/items/${detail._id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    
                    {detail.inventoryTracked && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 gap-1.5">
                            Inventory <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={openAdjustStockDialog}>
                             <RefreshCw className="h-4 w-4 mr-2" /> Adjust Stock
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/inventory/move-orders/new?itemId=${detail._id}`)}>
                             <ArrowRightLeft className="h-4 w-4 mr-2" /> Transfer Stock
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1">
                          More <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem disabled={actioning} onClick={() => handleClone(detail as unknown as Item)}>
                          <Copy className="h-4 w-4 mr-2" /> Clone Item
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={actioning} onClick={() => handleToggleActive(detail as unknown as Item)}>
                          {detail.isActive
                            ? <><EyeOff className="h-4 w-4 mr-2" /> Mark as Inactive</>
                            : <><Eye className="h-4 w-4 mr-2" /> Mark as Active</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={actioning}
                          onClick={() => setToDelete(detail as unknown as Item)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDetail}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-0 border-b px-6 shrink-0">
                    {(["overview", "transactions", "history"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-sm px-0 py-2.5 mr-6 border-b-2 transition-colors ${
                          activeTab === tab
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab === "overview" && "Overview"}
                        {tab === "transactions" && "Transactions"}
                        {tab === "history" && "Stock History"}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {activeTab === "overview" && (
                      <div className="space-y-6">
                        <div className={`grid grid-cols-1 gap-8 ${detail.inventoryTracked ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
                          <div className="space-y-5">
                          <div className="space-y-3">
                            <DetailRow label="Item Type" value={detail.itemType} />
                            <DetailRow label="Item Mode" value={detail.itemMode === "Variants" ? "Contains Variants" : "Single Item"} />
                            <DetailRow label="Unit" value={unitDisplay(detail.unit as PopulatedUnit | string | null)} />
                            <DetailRow label="SKU" value={detail.sku || "—"} />
                            <DetailRow
                              label="Identifiers"
                              value={detail.identifiers?.length ? detail.identifiers.join(", ") : "—"}
                            />
                            <DetailRow label="Brand" value={detail.brand || "—"} />
                            <DetailRow label="Manufacturer" value={detail.manufacturer || "—"} />
                            <DetailRow label="Description" value={detail.description || "—"} />
                            <DetailRow label="HSN/SAC" value={detail.hsnSacCode || "—"} />
                            <DetailRow label="Tax Preference" value={detail.taxPreference ?? "—"} />
                            {detail.taxPreference === "Taxable" && (
                              <>
                                <DetailRow
                                  label="Intra State Tax Rate"
                                  value={
                                    detail.intraStateTaxId && typeof detail.intraStateTaxId === "object"
                                      ? `${(detail.intraStateTaxId as PopulatedTax).name} (${(detail.intraStateTaxId as PopulatedTax).rate}%)`
                                      : "—"
                                  }
                                />
                                <DetailRow
                                  label="Inter State Tax Rate"
                                  value={
                                    detail.interStateTaxId && typeof detail.interStateTaxId === "object"
                                      ? `${(detail.interStateTaxId as PopulatedTax).name} (${(detail.interStateTaxId as PopulatedTax).rate}%)`
                                      : "—"
                                  }
                                />
                              </>
                            )}
                            <DetailRow label="Inventory Tracked" value={detail.inventoryTracked ? "Yes" : "No"} />
                            <DetailRow label="Returnable Item" value={detail.returnableItem === false ? "No" : "Yes"} />
                            <DetailRow
                              label="Status"
                              value={
                                <Badge variant={detail.isActive ? "default" : "secondary"}>
                                  {detail.isActive ? "Active" : "Inactive"}
                                </Badge>
                              }
                            />
                          </div>

                          {detail.inventoryTracked && (
                            <>
                              <Separator />
                              <div className="space-y-4">
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-bold text-gray-800">Inventory Details</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 mt-2 mb-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider">Accounting Stock</p>
                                      <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                          <span className="text-sm text-gray-600">Stock on Hand</span>
                                          <div className="flex items-center gap-1.5">
                                            {detail.reorderPoint != null && stockOnHandValue <= detail.reorderPoint && (
                                              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 bg-red-100 text-red-700 hover:bg-red-100 border-red-200 font-medium">
                                                Low
                                              </Badge>
                                            )}
                                            <span className="text-sm font-medium">{formatQuantity(stockOnHandValue)}</span>
                                          </div>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Committed Stock</span>
                                          <span className="text-sm font-medium text-orange-600">{formatQuantity(committedStockValue)}</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 mt-1">
                                          <span className="text-sm font-medium text-gray-800">Available for Sale</span>
                                          <span className="text-sm font-bold text-green-600">{formatQuantity(availableForSaleValue)}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wider">Physical Stock</p>
                                      <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                          <span className="text-sm text-gray-600">Stock on Hand</span>
                                          <div className="flex items-center gap-1.5">
                                            {detail.reorderPoint != null && physicalStockOnHandValue <= detail.reorderPoint && (
                                              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4 bg-red-100 text-red-700 hover:bg-red-100 border-red-200 font-medium">
                                                Low
                                              </Badge>
                                            )}
                                            <span className="text-sm font-medium">{formatQuantity(physicalStockOnHandValue)}</span>
                                          </div>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-600">Committed Stock</span>
                                          <span className="text-sm font-medium text-orange-600">{formatQuantity(physicalCommittedStockValue)}</span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 mt-1">
                                          <span className="text-sm font-medium text-gray-800">Available for Sale</span>
                                          <span className="text-sm font-bold text-green-600">{formatQuantity(physicalAvailableForSaleValue)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <DetailRow label="Average Cost" value={formatCurrency(detail.averageCost)} />
                                  <DetailRow label="Inventory Value" value={formatCurrency(detail.inventoryValue)} />
                                  <DetailRow label="Reorder Point" value={detail.reorderPoint != null ? formatQuantity(detail.reorderPoint) : "—"} />
                                  <DetailRow label="Valuation" value={detail.valuationMethod || "MovingAverage"} />
                                  <DetailRow label="Inventory Account" value={accountName(detail.inventoryAccountId as PopulatedAccount | string | null)} />
                                  <DetailRow label="Dimensions" value={dimensionsDisplay(detail)} />
                                  <DetailRow label="Weight" value={weightDisplay(detail)} />
                                </div>
                              </div>
                            </>
                          )}

                          {(detail.costPrice != null || detail.purchaseAccountId) && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm font-semibold mb-3">Purchase Information</p>
                                <DetailRow label="Cost Price" value={detail.costPrice != null ? formatCurrency(detail.costPrice) : "—"} />
                                <DetailRow label="Purchase Account" value={accountName(detail.purchaseAccountId as PopulatedAccount | string | null)} />
                                {detail.purchaseDescription && <DetailRow label="Description" value={detail.purchaseDescription} />}
                              </div>
                            </>
                          )}

                          {(detail.sellingPrice != null || detail.salesAccountId) && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm font-semibold mb-3">Sales Information</p>
                                <DetailRow label="Selling Price" value={detail.sellingPrice != null ? formatCurrency(detail.sellingPrice) : "—"} />
                                <DetailRow label="Sales Account" value={accountName(detail.salesAccountId as PopulatedAccount | string | null)} />
                                {detail.sellingDescription && <DetailRow label="Description" value={detail.sellingDescription} />}
                              </div>
                            </>
                          )}
                        </div>

                          {detail.inventoryTracked ? (
                            <div className="space-y-3">
                            <div className="rounded-lg border p-4">
                              <div className="flex items-start justify-between pb-3">
                                <StockMetric
                                  label="Opening Stock"
                                  value={formatQuantity(openingStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <div className="flex items-center gap-3">
                                  {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                                  <Button variant="link" size="sm" className="h-auto p-0" onClick={openOpeningStockDialog}>Edit</Button>
                                </div>
                              </div>
                              <div className="space-y-3 border-t pt-3">
                                <p className="text-sm font-medium">Accounting Stock</p>
                                <StockMetric
                                  label="Stock on Hand"
                                  value={formatQuantity(stockOnHandValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Committed Stock"
                                  value={formatQuantity(committedStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Available for Sale"
                                  value={formatQuantity(availableForSaleValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                              </div>
                              <div className="mt-3 space-y-3 border-t pt-3">
                                <p className="text-sm font-medium">Physical Stock</p>
                                <StockMetric
                                  label="Stock on Hand"
                                  value={formatQuantity(physicalStockOnHandValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Committed Stock"
                                  value={formatQuantity(physicalCommittedStockValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                                <StockMetric
                                  label="Available for Sale"
                                  value={formatQuantity(physicalAvailableForSaleValue)}
                                  unit={unitDisplay(detail.unit as PopulatedUnit | string | null)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeShippedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Shipped</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeReceivedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Received</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeInvoicedValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Invoiced</p>
                              </div>
                              <div className="rounded-lg border p-3">
                                <p className="text-2xl font-semibold leading-none">{formatQuantity(toBeBilledValue)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">Qty</p>
                                <p className="mt-2 text-sm">To be Billed</p>
                              </div>
                            </div>

                            <div className="rounded-lg border p-4">
                              <p className="text-sm font-medium">Reorder Point</p>
                              {Number(detail.reorderPoint || 0) > 0 ? (
                                <p className="mt-2 text-sm">
                                  Reorder when stock reaches {formatQuantity(detail.reorderPoint || 0)} {unitDisplay(detail.unit as PopulatedUnit | string | null)}.
                                </p>
                              ) : (
                                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                  You have to enable reorder notification before setting reorder point for items.
                                </div>
                              )}
                            </div>

                              <Button variant="outline" className="w-full" onClick={() => router.push("/inventory/adjustments")}>View Inventory Adjustments</Button>
                            </div>
                          ) : null}
                        </div>

                        {detail.inventoryTracked ? (
                          <div className="rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold">Sales Summary (This Month)</p>
                              <p className="text-sm font-medium tabular-nums">Total Sales: {formatCurrency(totalSalesAmount)}</p>
                            </div>
                            <div className="mt-4 h-64">
                              {salesSummaryPoints.some((row) => Number(row.amount || 0) > 0) ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={salesSummaryPoints}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                      dataKey="date"
                                      tickLine={false}
                                      axisLine={false}
                                      tickMargin={8}
                                      minTickGap={24}
                                      tickFormatter={(value: string) =>
                                        new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                        })
                                      }
                                    />
                                    <Tooltip
                                      formatter={(value: number | string) => formatCurrency(value)}
                                      labelFormatter={(value: string) =>
                                        new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", {
                                          day: "2-digit",
                                          month: "short",
                                          year: "numeric",
                                        })
                                      }
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="amount"
                                      stroke="hsl(var(--primary))"
                                      fill="hsl(var(--primary))"
                                      fillOpacity={0.2}
                                      strokeWidth={2}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                                  No sales data found for this month.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {activeTab === "transactions" && (
                      itemTransactionsLoading ? (
                        <div className="flex items-center justify-center py-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : itemTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                          <ShoppingCart className="h-10 w-10 opacity-30" />
                          <p className="text-sm font-medium">No sales or purchase transactions yet</p>
                          <p className="text-xs text-center max-w-[200px]">Transactions will appear here once you create invoices or bills for this item.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Number</th>
                                <th className="px-3 py-2 text-left">Contact</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Rate</th>
                                <th className="px-3 py-2 text-right">Total</th>
                                <th className="px-3 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {itemTransactions.map((row, idx) => (
                                <tr key={idx} className="border-t hover:bg-muted/10 transition-colors">
                                  <td className="px-3 py-2">
                                    <Badge variant={row.type === "Sale" ? "outline" : "secondary"} className="text-[10px] uppercase font-bold">
                                      {row.type}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">{new Date(row.date).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                  <td className="px-3 py-2 font-medium text-primary hover:underline cursor-pointer" onClick={() => router.push(row.type === "Sale" ? `/sales/invoices/${row.invoiceId}` : `/purchases/bills/${row.billId}`)}>
                                    {row.number}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">{row.party}</td>
                                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${row.type === "Sale" ? "text-rose-600" : "text-emerald-600"}`}>
                                    {row.type === "Sale" ? "-" : "+"}{formatQuantity(row.quantity)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(row.rate)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(row.amount)}</td>
                                  <td className="px-3 py-2">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{row.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                    {activeTab === "history" && (
                      ledgerLoading ? (
                        <div className="flex items-center justify-center py-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : ledgerRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                          <Tag className="h-10 w-10 opacity-30" />
                          <p className="text-sm">No inventory history available</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-left">Reference</th>
                                <th className="px-3 py-2 text-left">Party/Reason</th>
                                <th className="px-3 py-2 text-right">In</th>
                                <th className="px-3 py-2 text-right">Out</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ledgerRows.map((row, idx) => (
                                <tr key={idx} className="border-t hover:bg-muted/5 transition-colors">
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {new Date(row.date).toLocaleDateString("en-IN")}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                      row.type === "Sale" ? "bg-rose-50 text-rose-700 border border-rose-100" :
                                      row.type === "Purchase" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                                      row.type === "Transfer" ? "bg-indigo-50 text-indigo-700 border border-indigo-100" :
                                      "bg-blue-50 text-blue-700 border border-blue-100"
                                    }`}>
                                      {row.type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-medium">
                                    <button
                                      className="text-primary hover:underline"
                                      onClick={() => {
                                        if (row.type === "Sale") router.push(`/sales/invoices/${row.docId}`);
                                        else if (row.type === "Purchase") router.push(`/purchases/bills/${row.docId}`);
                                        else if (row.type === "Transfer") router.push(`/inventory/move-orders/${row.docId}`);
                                        else router.push(`/inventory/adjustments/${row.docId}`);
                                      }}
                                    >
                                      {row.reference}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{row.party}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-medium">
                                    {row.quantityIn > 0 ? `+${formatQuantity(row.quantityIn)}` : ""}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-rose-600 font-medium">
                                    {row.quantityOut > 0 ? `-${formatQuantity(row.quantityOut)}` : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </SidebarInset>

      <Dialog open={openingStockDialogOpen} onOpenChange={setOpeningStockDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Opening Stock Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr] md:items-center">
              <Label htmlFor="opening-stock">Opening Stock</Label>
              <Input
                id="opening-stock"
                type="number"
                min={0}
                step="0.01"
                value={openingStockForm.openingStock}
                onChange={(e) =>
                  setOpeningStockForm((prev) => ({ ...prev, openingStock: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr] md:items-center">
              <Label htmlFor="opening-rate">Opening Stock Rate per Unit</Label>
              <Input
                id="opening-rate"
                type="number"
                min={0}
                step="0.01"
                value={openingStockForm.ratePerUnit}
                onChange={(e) =>
                  setOpeningStockForm((prev) => ({ ...prev, ratePerUnit: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpeningStockDialogOpen(false)} disabled={openingStockSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveOpeningStock} disabled={openingStockSaving}>
              {openingStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Save</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustStockDialogOpen} onOpenChange={setAdjustStockDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Adjust Stock - {detail?.name || "Item"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjustStockForm.mode === "Quantity"}
                  onChange={() => setAdjustStockForm((prev) => ({ ...prev, mode: "Quantity" }))}
                />
                Quantity Adjustment
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjustStockForm.mode === "Value"}
                  onChange={() => setAdjustStockForm((prev) => ({ ...prev, mode: "Value" }))}
                />
                Value Adjustment
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-destructive">Date*</Label>
                <Input
                  type="date"
                  value={adjustStockForm.date}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-destructive">Account*</Label>
                <Input
                  value={adjustStockForm.account || accountName(detail?.inventoryAccountId as PopulatedAccount | string | null)}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, account: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reference Number</Label>
                <Input
                  value={adjustStockForm.referenceNumber}
                  onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-3">Quantity Available</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatQuantity(stockOnHandValue)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-3">New Quantity on hand</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {adjustStockForm.mode === "Quantity" ? formatQuantity(newQuantityOnHandPreview) : formatQuantity(stockOnHandValue)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-3 text-destructive">
                      {adjustStockForm.mode === "Quantity" ? "Quantity Adjusted*" : "Value Adjusted*"}
                    </td>
                    <td className="px-3 py-3">
                      {adjustStockForm.mode === "Quantity" ? (
                        <Input
                          className="text-right"
                          value={adjustStockForm.quantityAdjusted}
                          onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, quantityAdjusted: e.target.value }))}
                          placeholder="Eg. +10, -10"
                        />
                      ) : (
                        <Input
                          className="text-right"
                          value={adjustStockForm.valueDelta}
                          onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, valueDelta: e.target.value }))}
                          placeholder="Eg. +1000, -750"
                        />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-3">Cost Price</td>
                    <td className="px-3 py-3">
                      <Input
                        className="text-right"
                        value={adjustStockForm.costPrice}
                        onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                        disabled={adjustStockForm.mode === "Value"}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5">
              <Label className="text-destructive">Reason*</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={adjustStockForm.reason}
                onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, reason: e.target.value }))}
              >
                {ADJUSTMENT_REASON_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={adjustStockForm.description}
                onChange={(e) => setAdjustStockForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Max 500 characters"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleSubmitStockAdjustment}
              disabled={adjustStockSaving}
            >
              {adjustStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Save as Draft</span>
            </Button>
            <Button onClick={handleSubmitStockAdjustment} disabled={adjustStockSaving}>
              {adjustStockSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span className="ml-2">Convert to Adjusted</span>
            </Button>
            <Button variant="ghost" onClick={() => setAdjustStockDialogOpen(false)} disabled={adjustStockSaving}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedItemIds.length} selected item(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete selected items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkActioning || selectedItemIds.length === 0}
              onClick={() => {
                void handleBulkAction("delete");
              }}
            >
              {bulkActioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{toDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the item. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actioning}
              onClick={handleDelete}
            >
              {actioning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open && !isImportSaving) setImportDialogOpen(false); }}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle>Import Items from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-500">
              We found <span className="font-semibold text-slate-900">{importingItems.length}</span> items in your CSV file. Please review the first few items below before confirming the import.
            </p>
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
                  {importingItems.slice(0, 5).map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs py-2 font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs py-2 text-slate-500">{item.sku || "—"}</TableCell>
                      <TableCell className="text-xs py-2 text-slate-500">{item.itemType}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{formatCurrency(item.sellingPrice)}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{formatCurrency(item.costPrice)}</TableCell>
                      <TableCell className="text-xs py-2 text-right">{item.stockOnHand || "0"}</TableCell>
                    </TableRow>
                  ))}
                  {importingItems.length > 5 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-xs text-center text-slate-400 bg-slate-50/50 py-2 italic">
                        ... and {importingItems.length - 5} more items.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            {isImportSaving && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Importing items...</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)} disabled={isImportSaving}>
              Cancel
            </Button>
            <Button onClick={handleConfirmImport} disabled={isImportSaving} className="gap-1.5">
              {isImportSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Confirm Import ({importingItems.length} items)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Items Modal ── */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-md p-0 gap-0 bg-white" showCloseButton={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between border-slate-100">
            <DialogTitle className="text-base font-semibold text-slate-800">Export Items</DialogTitle>
            <button
              onClick={() => setExportModalOpen(false)}
              className="text-red-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>
          
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Info box */}
            <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-md p-3">
              <Info className="h-4.5 w-4.5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-normal">
                You can export your data from Zoho Inventory in CSV, XLS or XLSX format.
              </p>
            </div>

            {/* Module */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Module<span className="text-red-500">*</span>
              </Label>
              <select
                value={exportModule}
                onChange={(e) => setExportModule(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm focus:outline-none text-slate-600 cursor-not-allowed"
                disabled
              >
                <option value="Items">Items</option>
              </select>
            </div>

            {/* Period / Filter */}
            <div className="space-y-3">
              <RadioGroup
                value={exportPeriod}
                onValueChange={(v) => setExportPeriod(v as "all" | "specific")}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="r-all" />
                  <Label htmlFor="r-all" className="text-sm font-normal text-slate-700 cursor-pointer">All Items</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="specific" id="r-specific" />
                  <Label htmlFor="r-specific" className="text-sm font-normal text-slate-700 cursor-pointer">Specific Period</Label>
                </div>
              </RadioGroup>

              {exportPeriod === "specific" && (
                <div className="space-y-4 pt-1 border-t border-slate-100 mt-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                      className="h-9 text-xs border-slate-300 text-slate-700 focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-slate-400">-</span>
                    <Input
                      type="date"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                      className="h-9 text-xs border-slate-300 text-slate-700 focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-600">
                      Filter Criteria<span className="text-red-500">*</span>
                    </Label>
                    <RadioGroup
                      value={exportFilterCriteria}
                      onValueChange={(v) => setExportFilterCriteria(v as "created" | "modified")}
                      className="space-y-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="created" id="crit-created" />
                        <Label htmlFor="crit-created" className="text-xs font-normal text-slate-600 cursor-pointer">Created Time</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="modified" id="crit-modified" />
                        <Label htmlFor="crit-modified" className="text-xs font-normal text-slate-600 cursor-pointer">Last Modified Time</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}
            </div>

            {/* Export Template */}
            <div className="space-y-1.5 relative">
              <Label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                Export Template
                <span className="text-[10px] border border-slate-300 rounded-full w-4 h-4 flex items-center justify-center cursor-help text-slate-400" title="Templates define which columns are exported and their header names.">ⓘ</span>
              </Label>
              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTemplateDropdownOpen(!templateDropdownOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary text-left cursor-pointer"
                >
                  <span className="truncate">
                    {selectedTemplate ? selectedTemplate.name : "Select an Export Template"}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-200", templateDropdownOpen && "rotate-180")} />
                </button>
                
                {templateDropdownOpen && (
                  <div className="absolute z-50 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg mt-1">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <div className="relative flex items-center">
                        <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                        <input
                          type="text"
                          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded bg-white outline-none focus:border-primary placeholder:text-slate-400 text-slate-800"
                          placeholder="Search"
                          value={templateSearchQuery}
                          onChange={(e) => setTemplateSearchQuery(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1 bg-white">
                      {filteredTemplates.length === 0 ? (
                        <div className="py-6 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                          NO RESULTS FOUND
                        </div>
                      ) : (
                        filteredTemplates.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            className={cn(
                              "w-full text-left px-3 py-2 text-xs rounded hover:bg-slate-50 transition-colors cursor-pointer",
                              selectedTemplateId === tpl.id && "bg-slate-50 font-semibold text-primary"
                            )}
                            onClick={() => {
                              setSelectedTemplateId(tpl.id);
                              setTemplateDropdownOpen(false);
                            }}
                          >
                            {tpl.name}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="border-t border-slate-100 p-1 bg-slate-50">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-primary hover:bg-slate-100 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
                        onClick={() => {
                          setTemplateDropdownOpen(false);
                          setNewTemplateName("");
                          setNewTemplateFields([{ backendField: "name", exportHeader: "Item Name" }]);
                          setNewTemplateModalOpen(true);
                        }}
                      >
                        <span className="text-sm font-semibold">+</span> New Template
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Decimal Format */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Decimal Format<span className="text-red-500">*</span>
              </Label>
              <select
                value={exportDecimalFormat}
                onChange={(e) => setExportDecimalFormat(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-slate-800"
              >
                <option value="1234567.89">1234567.89</option>
                <option value="1,234,567.89">1,234,567.89</option>
                <option value="12,34,567.89">12,34,567.89</option>
              </select>
            </div>

            {/* Export File Format */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-slate-600">
                Export File Format<span className="text-red-500">*</span>
              </Label>
              <RadioGroup
                value={exportFileFormat}
                onValueChange={(v) => setExportFileFormat(v as "CSV" | "XLS" | "XLSX")}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="CSV" id="fmt-csv" />
                  <Label htmlFor="fmt-csv" className="text-sm font-normal text-slate-700 cursor-pointer">CSV (Comma Separated Value)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="XLS" id="fmt-xls" />
                  <Label htmlFor="fmt-xls" className="text-sm font-normal text-slate-700 cursor-pointer">XLS (Microsoft Excel 1997-2004 Compatible)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="XLSX" id="fmt-xlsx" />
                  <Label htmlFor="fmt-xlsx" className="text-sm font-normal text-slate-700 cursor-pointer">XLSX (Microsoft Excel)</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Include PII Checkbox */}
            <div className="flex items-start space-x-2 pt-1">
              <Checkbox
                id="export-pii"
                checked={exportIncludePII}
                onCheckedChange={(checked) => setExportIncludePII(!!checked)}
                className="mt-0.5"
              />
              <Label htmlFor="export-pii" className="text-xs font-normal text-slate-500 leading-normal cursor-pointer select-none">
                Include Sensitive Personally Identifiable Information (PII) while exporting.
              </Label>
            </div>

            {/* File Protection Password */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">File Protection Password</Label>
              <div className="flex items-center gap-1 border border-slate-300 rounded-md overflow-hidden bg-white focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
                <input
                  type={exportShowPassword ? "text" : "password"}
                  className="flex-1 px-3 h-9 text-sm outline-none bg-transparent text-slate-800"
                  placeholder="Enter password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="px-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  onClick={() => setExportShowPassword(!exportShowPassword)}
                >
                  {exportShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal">
                Your password must be at least 12 characters and include one uppercase letter, lowercase letter, number, and special character.
              </p>
            </div>

            <p className="text-xs text-slate-500 border-t border-slate-100 pt-3 leading-normal">
              <strong>Note:</strong> You can export only the first 25,000 rows. If you have more rows, please initiate a backup for the data in your Zoho Inventory organization, and download it. <span className="text-primary hover:underline cursor-pointer font-medium">Backup Your Data</span>
            </p>
          </div>
          
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-start gap-2">
            <Button size="sm" onClick={handleExportItemsSubmit} className="bg-primary hover:bg-primary/95 text-white font-medium px-4 h-8 text-xs cursor-pointer">
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportModalOpen(false)} className="h-8 text-xs font-medium px-4 cursor-pointer">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── New Export Template Modal ── */}
      <Dialog open={newTemplateModalOpen} onOpenChange={setNewTemplateModalOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 bg-white" showCloseButton={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b flex flex-row items-center justify-between border-slate-100">
            <DialogTitle className="text-base font-semibold text-slate-800">New Export Template</DialogTitle>
            <button
              onClick={() => setNewTemplateModalOpen(false)}
              className="text-red-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>
          
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Template Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                Template Name<span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter template name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="h-9 border-slate-300 focus:ring-1 focus:ring-primary text-slate-800 text-sm"
              />
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-md overflow-hidden my-4 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8 py-2.5 px-3"></th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wider">FIELD NAME IN ZOHO INVENTORY</th>
                    <th className="text-left py-2.5 px-3 font-semibold text-slate-500 uppercase tracking-wider">FIELD NAME IN EXPORT FILE</th>
                    <th className="w-10 py-2.5 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {newTemplateFields.map((field, idx) => (
                    <tr
                      key={idx}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group cursor-move",
                        draggedIndex === idx && "opacity-40 bg-slate-100"
                      )}
                    >
                      <td className="py-2.5 px-3 text-slate-400 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-4 w-4" />
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={field.backendField}
                          onChange={(e) => handleFieldChange(idx, e.target.value)}
                          className="h-8 w-full rounded border border-slate-300 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-slate-800"
                        >
                          {AVAILABLE_ITEM_FIELDS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <Input
                          value={field.exportHeader}
                          onChange={(e) => handleHeaderChange(idx, e.target.value)}
                          className="h-8 text-xs border-slate-300 focus:ring-1 focus:ring-primary bg-white text-slate-800"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveField(idx)}
                          className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          disabled={newTemplateFields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add New Field Button */}
            <button
              type="button"
              onClick={handleAddField}
              className="text-xs font-semibold text-primary hover:text-primary/95 flex items-center gap-1.5 mt-1 transition-colors cursor-pointer"
            >
              <span className="text-sm font-bold">+</span> Add a New Field
            </button>
          </div>
          
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-start gap-2">
            <Button size="sm" onClick={handleSaveTemplate} className="bg-primary hover:bg-primary/95 text-white font-medium px-4 h-8 text-xs cursor-pointer">
              Save and Select
            </Button>
            <Button variant="outline" size="sm" onClick={() => setNewTemplateModalOpen(false)} className="h-8 text-xs font-medium px-4 cursor-pointer">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

// ─── Detail row helper ────────────────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-x-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function StockMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      {unit && unit !== "—" ? <p className="text-xs text-muted-foreground">{unit}</p> : null}
    </div>
  );
}

export default function ItemsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <ItemsPageContent />
    </Suspense>
  );
}
