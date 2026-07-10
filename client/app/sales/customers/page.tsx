"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  FileUp,
  Upload,
  Download,
  X,
  Info,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { CustomerDetailView } from "./[id]/customer-detail-view";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExportDialog } from "@/components/export-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import * as XLSX from "xlsx";

interface ExportTemplateField {
  backendField: string;
  exportHeader: string;
}

interface ExportTemplate {
  id: string;
  name: string;
  fields: ExportTemplateField[];
}

const AVAILABLE_CONTACT_FIELDS = [
  { value: "_id", label: "Contact ID" },
  { value: "createdAt", label: "Created Time" },
  { value: "updatedAt", label: "Last Modified Time" },
  { value: "salutation", label: "Salutation" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "displayName", label: "Display Name" },
  { value: "companyName", label: "Company Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "mobile", label: "Mobile" },
  { value: "currency", label: "Currency" },
  { value: "language", label: "Language" },
  { value: "openingBalance", label: "Opening Balance" },
  { value: "outstandingReceivable", label: "Outstanding Receivable" },
  { value: "outstandingPayable", label: "Outstanding Payable" },
  { value: "taxTreatment", label: "Tax Treatment" },
  { value: "taxPreference", label: "Tax Preference" },
  { value: "exemptionReason", label: "Exemption Reason" },
  { value: "placeOfSupply", label: "Place of Supply" },
  { value: "gstin", label: "GSTIN" },
  { value: "pan", label: "PAN" },
  { value: "notes", label: "Notes" },
  { value: "isActive", label: "Status" },
  
  // Billing Address
  { value: "billingAttention", label: "Billing Attention" },
  { value: "billingStreet", label: "Billing Street" },
  { value: "billingStreet2", label: "Billing Street 2" },
  { value: "billingCity", label: "Billing City" },
  { value: "billingState", label: "Billing State" },
  { value: "billingZip", label: "Billing Zip" },
  { value: "billingCountry", label: "Billing Country" },
  { value: "billingPhone", label: "Billing Phone" },
  { value: "billingFax", label: "Billing Fax" },

  // Shipping Address
  { value: "shippingAttention", label: "Shipping Attention" },
  { value: "shippingStreet", label: "Shipping Street" },
  { value: "shippingStreet2", label: "Shipping Street 2" },
  { value: "shippingCity", label: "Shipping City" },
  { value: "shippingState", label: "Shipping State" },
  { value: "shippingZip", label: "Shipping Zip" },
  { value: "shippingCountry", label: "Shipping Country" },
  { value: "shippingPhone", label: "Shipping Phone" },
  { value: "shippingFax", label: "Shipping Fax" }
];

const AVAILABLE_CONTACT_PERSON_FIELDS = [
  { value: "customerDisplayName", label: "Customer Name" },
  { value: "salutation", label: "Salutation" },
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "name", label: "Full Name" },
  { value: "email", label: "Email" },
  { value: "workPhone", label: "Work Phone" },
  { value: "mobile", label: "Mobile" },
  { value: "designation", label: "Designation" },
  { value: "department", label: "Department" },
  { value: "isPrimary", label: "Is Primary" }
];

const AVAILABLE_CONTACT_ADDRESS_FIELDS = [
  { value: "customerDisplayName", label: "Customer Name" },
  { value: "addressType", label: "Address Type" },
  { value: "attention", label: "Attention" },
  { value: "street", label: "Street" },
  { value: "street2", label: "Street 2" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "Zip Code" },
  { value: "country", label: "Country" },
  { value: "phone", label: "Phone" },
  { value: "fax", label: "Fax" }
];

const defaultTemplatesByModule: Record<string, ExportTemplate[]> = {
  "Customers": [
    {
      id: "default-contact-standard",
      name: "Standard Customer Template",
      fields: [
        { backendField: "_id", exportHeader: "Contact ID" },
        { backendField: "displayName", exportHeader: "Display Name" },
        { backendField: "companyName", exportHeader: "Company Name" },
        { backendField: "email", exportHeader: "Email" },
        { backendField: "phone", exportHeader: "Phone" },
        { backendField: "mobile", exportHeader: "Mobile" },
        { backendField: "taxTreatment", exportHeader: "Tax Treatment" },
        { backendField: "openingBalance", exportHeader: "Opening Balance" },
        { backendField: "outstandingReceivable", exportHeader: "Outstanding Receivable" },
        { backendField: "currency", exportHeader: "Currency" },
        { backendField: "isActive", exportHeader: "Status" },
        { backendField: "createdAt", exportHeader: "Created Time" }
      ]
    }
  ],
  "Customer's Contact Persons": [
    {
      id: "default-cp-standard",
      name: "Standard Contact Persons Template",
      fields: [
        { backendField: "customerDisplayName", exportHeader: "Customer Name" },
        { backendField: "salutation", exportHeader: "Salutation" },
        { backendField: "firstName", exportHeader: "First Name" },
        { backendField: "lastName", exportHeader: "Last Name" },
        { backendField: "email", exportHeader: "Email" },
        { backendField: "workPhone", exportHeader: "Work Phone" },
        { backendField: "mobile", exportHeader: "Mobile" },
        { backendField: "isPrimary", exportHeader: "Is Primary" }
      ]
    }
  ],
  "Customer's Addresses": [
    {
      id: "default-addr-standard",
      name: "Standard Addresses Template",
      fields: [
        { backendField: "customerDisplayName", exportHeader: "Customer Name" },
        { backendField: "addressType", exportHeader: "Address Type" },
        { backendField: "attention", exportHeader: "Attention" },
        { backendField: "street", exportHeader: "Street" },
        { backendField: "street2", exportHeader: "Street 2" },
        { backendField: "city", exportHeader: "City" },
        { backendField: "state", exportHeader: "State" },
        { backendField: "zip", exportHeader: "Zip Code" },
        { backendField: "country", exportHeader: "Country" },
        { backendField: "phone", exportHeader: "Phone" },
        { backendField: "fax", exportHeader: "Fax" }
      ]
    }
  ]
};

const fmt = (value?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);

export default function CustomersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | "All">("All");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Contact | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  // Export Modal States
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [newTemplateModalOpen, setNewTemplateModalOpen] = useState(false);
  
  const [exportModule, setExportModule] = useState("Customers"); // "Customers" | "Customer's Contact Persons" | "Customer's Addresses"
  const [exportPeriod, setExportPeriod] = useState<"all" | "specific">("all");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default-contact-standard");
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
    { backendField: "displayName", exportHeader: "Display Name" }
  ]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    let defaultId = "default-contact-standard";
    if (exportModule === "Customer's Contact Persons") {
      defaultId = "default-cp-standard";
    } else if (exportModule === "Customer's Addresses") {
      defaultId = "default-addr-standard";
    }
    setSelectedTemplateId(defaultId);
    
    const saved = localStorage.getItem(`hai_customer_export_templates_${exportModule}`);
    if (saved) {
      try {
        setExportTemplates(JSON.parse(saved));
      } catch (e) {
        console.error(e);
        setExportTemplates([]);
      }
    } else {
      setExportTemplates([]);
    }
  }, [exportModule]);

  const getAvailableFieldsForModule = () => {
    if (exportModule === "Customer's Contact Persons") {
      return AVAILABLE_CONTACT_PERSON_FIELDS;
    }
    if (exportModule === "Customer's Addresses") {
      return AVAILABLE_CONTACT_ADDRESS_FIELDS;
    }
    return AVAILABLE_CONTACT_FIELDS;
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
    const fields = getAvailableFieldsForModule();
    const firstField = fields[0]?.value || "";
    const firstLabel = fields[0]?.label || "";
    setNewTemplateFields([
      ...newTemplateFields,
      { backendField: firstField, exportHeader: firstLabel }
    ]);
  };

  const handleRemoveField = (index: number) => {
    setNewTemplateFields(newTemplateFields.filter((_, idx) => idx !== index));
  };

  const handleFieldChange = (index: number, backendField: string) => {
    const fields = getAvailableFieldsForModule();
    const selectedOption = fields.find(f => f.value === backendField);
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

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (newTemplateFields.length === 0) {
      toast.error("At least one field is required");
      return;
    }
    
    const defaults = defaultTemplatesByModule[exportModule] || [];
    const allTemplates = [...defaults, ...exportTemplates];

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
    localStorage.setItem(`hai_customer_export_templates_${exportModule}`, JSON.stringify(updated));
    
    setSelectedTemplateId(newTpl.id);
    setNewTemplateModalOpen(false);
    toast.success(`Template "${newTpl.name}" created and selected`);
  };

  const handleExportCustomersSubmit = async () => {
    const defaults = defaultTemplatesByModule[exportModule] || [];
    const allTemplates = [...defaults, ...exportTemplates];
    const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId) || defaults[0];
    
    let contactsToExport = contacts;
    if (exportPeriod === "specific" && exportStartDate && exportEndDate) {
      const start = new Date(exportStartDate + "T00:00:00").getTime();
      const end = new Date(exportEndDate + "T23:59:59").getTime();
      contactsToExport = contacts.filter(c => {
        const dateToCheck = exportFilterCriteria === "created" 
          ? c.createdAt 
          : c.updatedAt || c.createdAt;
        const itemTime = new Date(dateToCheck || '').getTime();
        return itemTime >= start && itemTime <= end;
      });
    }

    if (contactsToExport.length === 0) {
      toast.error("No customers found for the selected criteria");
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

    const headers = selectedTemplate.fields.map(f => f.exportHeader);
    let rows: any[][] = [];

    if (exportModule === "Customers") {
      rows = contactsToExport.map(contact => {
        return selectedTemplate.fields.map(f => {
          switch (f.backendField) {
            case "_id":
              return contact._id;
            case "createdAt":
              return formatDateTime(contact.createdAt);
            case "updatedAt":
              return formatDateTime(contact.updatedAt);
            case "displayName":
              return contact.displayName || "";
            case "companyName":
              return contact.companyName || "";
            case "email":
              return contact.email || "";
            case "phone":
              return contact.phone || "";
            case "mobile":
              return contact.mobile || "";
            case "currency":
              return contact.currency || "INR";
            case "language":
              return contact.language || "en";
            case "salutation":
              return contact.salutation || "";
            case "firstName":
              return contact.firstName || "";
            case "lastName":
              return contact.lastName || "";
            case "taxTreatment":
              return contact.taxTreatment || "";
            case "taxPreference":
              return contact.taxPreference || "";
            case "exemptionReason":
              return contact.exemptionReason || "";
            case "placeOfSupply":
              return contact.placeOfSupply || "";
            case "gstin":
              return contact.gstin || "";
            case "pan":
              return contact.pan || "";
            case "notes":
              return contact.notes || "";
            case "isActive":
              return contact.isActive ? "Active" : "Inactive";
            case "openingBalance":
              return formatNumber(contact.openingBalance || 0);
            case "outstandingReceivable":
              return formatNumber(contact.outstandingReceivable || 0);
            case "outstandingPayable":
              return formatNumber((contact as any).outstandingPayable || 0);
            case "creditLimit":
              return formatNumber((contact as any).creditLimit || 0);
            case "tdsCategory":
              return contact.tdsCategory || "";
            case "msmeRegistered":
              return contact.msmeRegistered ? "Yes" : "No";
            case "portalEnabled":
              return contact.portalEnabled ? "Yes" : "No";
            
            // Billing Address
            case "billingAttention":
              return contact.billingAddress?.attention || "";
            case "billingStreet":
              return contact.billingAddress?.street || "";
            case "billingStreet2":
              return contact.billingAddress?.street2 || "";
            case "billingCity":
              return contact.billingAddress?.city || "";
            case "billingState":
              return contact.billingAddress?.state || "";
            case "billingZip":
              return contact.billingAddress?.zip || "";
            case "billingCountry":
              return contact.billingAddress?.country || "";
            case "billingPhone":
              return contact.billingAddress?.phone || "";
            case "billingFax":
              return contact.billingAddress?.fax || "";

            // Shipping Address
            case "shippingAttention":
              return contact.shippingAddress?.attention || "";
            case "shippingStreet":
              return contact.shippingAddress?.street || "";
            case "shippingStreet2":
              return contact.shippingAddress?.street2 || "";
            case "shippingCity":
              return contact.shippingAddress?.city || "";
            case "shippingState":
              return contact.shippingAddress?.state || "";
            case "shippingZip":
              return contact.shippingAddress?.zip || "";
            case "shippingCountry":
              return contact.shippingAddress?.country || "";
            case "shippingPhone":
              return contact.shippingAddress?.phone || "";
            case "shippingFax":
              return contact.shippingAddress?.fax || "";
            
            default:
              const val = (contact as any)[f.backendField];
              return val === undefined || val === null ? "" : String(val);
          }
        });
      });
    } else if (exportModule === "Customer's Contact Persons") {
      contactsToExport.forEach(contact => {
        const persons = contact.contactPersons || [];
        persons.forEach(person => {
          const row = selectedTemplate.fields.map(f => {
            switch (f.backendField) {
              case "customerDisplayName":
                return contact.displayName;
              case "salutation":
                return person.salutation || "";
              case "firstName":
                return person.firstName || "";
              case "lastName":
                return person.lastName || "";
              case "name":
                return person.name || "";
              case "email":
                return person.email || "";
              case "workPhone":
                return person.workPhone || "";
              case "mobile":
                return person.mobile || "";
              case "designation":
                return person.designation || "";
              case "department":
                return person.department || "";
              case "isPrimary":
                return person.isPrimary ? "Yes" : "No";
              default:
                const val = (person as any)[f.backendField];
                return val === undefined || val === null ? "" : String(val);
            }
          });
          rows.push(row);
        });
      });
    } else if (exportModule === "Customer's Addresses") {
      contactsToExport.forEach(contact => {
        if (contact.billingAddress && Object.values(contact.billingAddress).some(val => val)) {
          const row = selectedTemplate.fields.map(f => {
            switch (f.backendField) {
              case "customerDisplayName":
                return contact.displayName;
              case "addressType":
                return "Billing Address";
              case "attention":
                return contact.billingAddress?.attention || "";
              case "street":
                return contact.billingAddress?.street || "";
              case "street2":
                return contact.billingAddress?.street2 || "";
              case "city":
                return contact.billingAddress?.city || "";
              case "state":
                return contact.billingAddress?.state || "";
              case "zip":
                return contact.billingAddress?.zip || "";
              case "country":
                return contact.billingAddress?.country || "";
              case "phone":
                return contact.billingAddress?.phone || "";
              case "fax":
                return contact.billingAddress?.fax || "";
              default:
                return "";
            }
          });
          rows.push(row);
        }
        
        if (contact.shippingAddress && Object.values(contact.shippingAddress).some(val => val)) {
          const row = selectedTemplate.fields.map(f => {
            switch (f.backendField) {
              case "customerDisplayName":
                return contact.displayName;
              case "addressType":
                return "Shipping Address";
              case "attention":
                return contact.shippingAddress?.attention || "";
              case "street":
                return contact.shippingAddress?.street || "";
              case "street2":
                return contact.shippingAddress?.street2 || "";
              case "city":
                return contact.shippingAddress?.city || "";
              case "state":
                return contact.shippingAddress?.state || "";
              case "zip":
                return contact.shippingAddress?.zip || "";
              case "country":
                return contact.shippingAddress?.country || "";
              case "phone":
                return contact.shippingAddress?.phone || "";
              case "fax":
                return contact.shippingAddress?.fax || "";
              default:
                return "";
            }
          });
          rows.push(row);
        }
      });
    }

    try {
      const fileExt = exportFileFormat.toLowerCase();
      const baseName = `customers_export_${new Date().toISOString().split('T')[0]}`;
      const fileName = `${baseName}.${fileExt}`;
      
      if (exportPassword) {
        toast("Preparing password-protected export...");
        const blob = await contactApi.exportProtected({
          fileName: baseName,
          fileFormat: fileExt,
          password: exportPassword,
          headers,
          rows
        });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${baseName}.zip`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success("Customers exported successfully with password protection");
      } else {
        const wsData = [headers, ...rows];
        const worksheet = XLSX.utils.aoa_to_sheet(wsData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, exportModule);
        
        XLSX.writeFile(workbook, fileName, {
          bookType: fileExt === "xls" ? "biff8" : fileExt === "csv" ? "csv" : "xlsx"
        });
        
        toast.success("Customers exported successfully");
      }
      setExportModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to export customers");
    }
  };

  const panelOpen = !!selectedId;

  const fetchContacts = useCallback(async () => {
    setFetching(true);
    try {
      const includeInactive = statusFilter !== "Active";
      const res = await contactApi.list({
        type: "Customer",
        page: 1,
        limit: 200,
        includeInactive,
      });
      setContacts(res.data ?? []);
    } catch {
      setContacts([]);
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) {
      void fetchContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id, statusFilter]);

  useEffect(() => {
    if (selectedId && !fetching && !contacts.find((c) => c._id === selectedId)) {
      void fetchContacts();
    }
  }, [selectedId, contacts, fetching, fetchContacts]);

  async function selectCustomer(id: string, tabOverride?: string) {
    setSelectedId(id);
    if (tabOverride !== undefined) {
      setSelectedTab(tabOverride || null);
    }
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search);
      const tabToUse = tabOverride ?? query.get("tab") ?? selectedTab ?? "overview";
      const currentSelectedId = query.get("selectedId") || "";
      const currentTab = query.get("tab") || "";

      if (currentSelectedId !== id || currentTab !== tabToUse) {
        query.set("selectedId", id);
        if (tabToUse) query.set("tab", tabToUse);
        router.replace(`/sales/customers?${query.toString()}`, { scroll: false });
      }
    }

    const quick = contacts.find((row) => row._id === id);
    if (quick) setSelectedCustomer(quick);

    setLoadingCustomer(true);
    try {
      const res = await contactApi.getById(id);
      setSelectedCustomer(res.data);
    } catch {
      // keep quick data
    } finally {
      setLoadingCustomer(false);
    }
  }

  function closePanel() {
    setSelectedId(null);
    setSelectedTab(null);
    setSelectedCustomer(null);
    router.push("/sales/customers");
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const filtered = contacts
    .filter((row) => {
      if (statusFilter === "Active") return row.isActive !== false;
      if (statusFilter === "Inactive") return row.isActive === false;
      return true;
    })
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        row.displayName.toLowerCase().includes(q) ||
        (row.companyName || "").toLowerCase().includes(q) ||
        (row.email || "").toLowerCase().includes(q)
      );
    });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex h-svh min-h-0 flex-col overflow-hidden">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Customers</span>
            </span>
          }
          actions={
            !panelOpen ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative w-52">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-sm"
                      placeholder="Search customers..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "Active" | "Inactive" | "All")
                    }
                    className="h-8 rounded border border-muted px-2 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="All">All</option>
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchContacts()}
                  disabled={fetching}
                  className="px-2"
                >
                  <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                </Button>

                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold gap-1.5" onClick={() => router.push("/sales/customers/new")}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Customer
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white">
                    <DropdownMenuItem onClick={() => router.push("/batch-import?section=sales&type=Customers&back=/sales/customers")} className="cursor-pointer">
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
                          <DropdownMenuItem onClick={() => router.push("/sales/customers/import")} className="cursor-pointer">
                            <span className="text-xs">Import Customers</span>
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
                            <span className="text-xs">Export Customers</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null
          }
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex flex-col overflow-hidden border-r transition-all duration-200",
              panelOpen ? "w-[320px] shrink-0" : "flex-1",
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center border-b",
                panelOpen ? "justify-between px-3 py-2" : "justify-between px-4 py-3",
              )}
            >
              {panelOpen ? (
                <>
                  <button className="flex items-center gap-1.5 text-sm font-semibold">
                    All Customers
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => void fetchContacts()}
                      disabled={fetching}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => router.push("/sales/customers/new")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <button className="flex items-center gap-1.5 text-sm font-medium">
                    All Customers
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            {panelOpen ? (
              <div className="border-b px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    className="h-7 pl-7 text-xs"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {fetching && contacts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : panelOpen ? (
              <div className="flex-1 divide-y overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-30" />
                    <p className="text-xs">{search ? "No customers match your search" : "No customers yet"}</p>
                  </div>
                ) : null}

                {filtered.map((row) => (
                  <button
                    key={row._id}
                    className={cn(
                      "w-full border-l-2 px-3 py-3 text-left transition-colors hover:bg-muted/20",
                      row.isActive === false && "bg-muted/60 text-muted-foreground",
                      selectedId === row._id ? "border-l-teal-600 bg-teal-50/40" : "border-l-transparent",
                    )}
                    onClick={() => void selectCustomer(row._id)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{row.displayName}</p>
                        {row.companyName && row.companyName !== row.displayName ? (
                          <p className="truncate text-[10px] text-muted-foreground">{row.companyName}</p>
                        ) : null}
                        {row.isActive === false ? <p className="text-[10px] text-muted-foreground">Inactive</p> : null}
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmt((row.outstandingReceivable ?? 0) + (row.openingBalance ?? 0), row.currency || "INR")}
                      </span>
                    </div>
                  </button>
                ))}

                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mx-6 my-4 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-20 text-muted-foreground">
                <Building2 className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">
                  {search ? "No customers match your search" : "No customers yet"}
                </p>
                {!search ? (
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => router.push("/sales/customers/new")}>
                    <Plus className="mr-1 h-4 w-4" /> New Customer
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-6 py-4">
                <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">GST Treatment</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receivables (BCY)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const primary = row.contactPersons?.find((person) => person.isPrimary) ?? row.contactPersons?.[0];
                        const email = row.email || primary?.email || "";
                        const phone = row.phone || primary?.workPhone || primary?.mobile || row.mobile || "";
                        return (
                          <tr
                            key={row._id}
                            className={cn(
                              "cursor-pointer border-b transition-colors hover:bg-muted/40 last:border-0",
                              row.isActive === false && "bg-muted/60 text-muted-foreground",
                            )}
                            onClick={() => void selectCustomer(row._id)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-medium text-teal-700 hover:text-teal-800 hover:underline">{row.displayName}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.companyName || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {email ? (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" /> {email}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" /> {phone}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.taxTreatment || "-"}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              {fmt((row.outstandingReceivable ?? 0) + (row.openingBalance ?? 0), row.currency || "INR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {panelOpen ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loadingCustomer && !selectedCustomer ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : selectedCustomer ? (
                <CustomerDetailView
                  customer={selectedCustomer}
                  initialTab={selectedTab || undefined}
                  onClose={closePanel}
                  onCustomerUpdate={(updated) => {
                    setSelectedCustomer(updated);
                    setContacts((prev) =>
                      prev.map((row) => (row._id === updated._id ? { ...row, ...updated } : row)),
                    );
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </SidebarInset>

      {/* ── Export Customers Modal ── */}
      <ExportDialog open={exportModalOpen} onOpenChange={setExportModalOpen} initialModule="customers" />

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
                          {getAvailableFieldsForModule().map((opt) => (
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
