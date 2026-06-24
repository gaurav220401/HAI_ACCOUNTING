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
import { contactApi } from "@/lib/api/contacts";
import * as XLSX from "xlsx";

interface ParsedRow {
  [key: string]: string;
}

interface MappingState {
  displayName: string;
  contactType: string;
  companyName: string;
  email: string;
  phone: string;
  mobile: string;
  pan: string;
  gstin: string;
  taxTreatment: string;
  currency: string;
  openingBalance: string;
  billingAttention: string;
  billingStreet: string;
  billingStreet2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  billingPhone: string;
  billingFax: string;
  shippingAttention: string;
  shippingStreet: string;
  shippingStreet2: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingCountry: string;
  shippingPhone: string;
  shippingFax: string;
  salutation: string;
  firstName: string;
  lastName: string;
  language: string;
  placeOfSupply: string;
  businessLegalName: string;
  businessTradeName: string;
  taxPreference: string;
  exemptionReason: string;
  msmeRegistered: string;
  tdsCategory: string;
  portalEnabled: string;
  notes: string;
  contactPersonSalutation: string;
  contactPersonFirstName: string;
  contactPersonLastName: string;
  contactPersonEmail: string;
  contactPersonPhone: string;
  contactPersonMobile: string;
  accountsPayableAccount: string;
  paymentTerms: string;
  websiteUrl: string;
  department: string;
  designation: string;
  twitterHandle: string;
  skypeName: string;
  facebookUrl: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolderName: string;
  bankIfscCode: string;
  bankBranchName: string;
  bankUpiId: string;
}

const CHARACTER_ENCODINGS = [
  { value: "UTF-8", label: "UTF-8 (Unicode)" },
  { value: "UTF-16", label: "UTF-16 (Unicode)" },
  { value: "ISO-8859-1", label: "ISO-8859-1" },
  { value: "ISO-8859-2", label: "ISO-8859-2" },
];

const FIELD_GROUPS = [
  {
    title: "Primary Contact Details",
    fields: [
      { key: "salutation", label: "Salutation" },
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "displayName", label: "Display Name", required: true },
      { key: "contactType", label: "Contact Type (Customer/Vendor)" },
      { key: "companyName", label: "Company Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "mobile", label: "Mobile" },
      { key: "language", label: "Language" },
    ]
  },
  {
    title: "GST Details / Tax Details",
    fields: [
      { key: "taxTreatment", label: "GST Treatment" },
      { key: "placeOfSupply", label: "Place of Supply" },
      { key: "gstin", label: "GSTIN" },
      { key: "businessLegalName", label: "Business Legal Name" },
      { key: "businessTradeName", label: "Business Trade Name" },
      { key: "pan", label: "PAN" },
      { key: "taxPreference", label: "Tax Preference" },
      { key: "exemptionReason", label: "Exemption Reason" },
      { key: "msmeRegistered", label: "MSME Registered" },
    ]
  },
  {
    title: "Financial Details",
    fields: [
      { key: "currency", label: "Currency" },
      { key: "accountsPayableAccount", label: "Accounts Payable Account" },
      { key: "openingBalance", label: "Opening Balance" },
      { key: "paymentTerms", label: "Payment Terms" },
      { key: "tdsCategory", label: "TDS Category" },
      { key: "portalEnabled", label: "Portal Enabled" },
    ]
  },
  {
    title: "Social Details",
    fields: [
      { key: "websiteUrl", label: "Website URL" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "twitterHandle", label: "Twitter Handle" },
      { key: "skypeName", label: "Skype Name" },
      { key: "facebookUrl", label: "Facebook URL" },
    ]
  },
  {
    title: "Billing Address Details",
    fields: [
      { key: "billingAttention", label: "Attention" },
      { key: "billingCountry", label: "Country" },
      { key: "billingStreet", label: "Street 1" },
      { key: "billingStreet2", label: "Street 2" },
      { key: "billingCity", label: "City" },
      { key: "billingState", label: "State" },
      { key: "billingZip", label: "Zip/Pincode" },
      { key: "billingPhone", label: "Phone" },
      { key: "billingFax", label: "Fax" },
    ]
  },
  {
    title: "Shipping Address Details",
    fields: [
      { key: "shippingAttention", label: "Attention" },
      { key: "shippingCountry", label: "Country" },
      { key: "shippingStreet", label: "Street 1" },
      { key: "shippingStreet2", label: "Street 2" },
      { key: "shippingCity", label: "City" },
      { key: "shippingState", label: "State" },
      { key: "shippingZip", label: "Zip/Pincode" },
      { key: "shippingPhone", label: "Phone" },
      { key: "shippingFax", label: "Fax" },
    ]
  },
  {
    title: "Primary Contact Person Details",
    fields: [
      { key: "contactPersonSalutation", label: "Contact Person Salutation" },
      { key: "contactPersonFirstName", label: "Contact Person First Name" },
      { key: "contactPersonLastName", label: "Contact Person Last Name" },
      { key: "contactPersonEmail", label: "Contact Person Email" },
      { key: "contactPersonPhone", label: "Contact Person Phone" },
      { key: "contactPersonMobile", label: "Contact Person Mobile" },
    ]
  },
  {
    title: "Bank Details",
    fields: [
      { key: "bankName", label: "Bank Name" },
      { key: "bankAccountNumber", label: "Bank Account Number" },
      { key: "bankAccountHolderName", label: "Bank Account Holder Name" },
      { key: "bankIfscCode", label: "Bank IFSC Code" },
      { key: "bankBranchName", label: "Bank Branch Name" },
      { key: "bankUpiId", label: "Bank UPI ID" },
    ]
  },
  {
    title: "Remarks",
    fields: [
      { key: "notes", label: "Notes/Remarks" },
    ]
  }
];

const MAPPABLE_FIELDS = FIELD_GROUPS.flatMap(g => g.fields);

export default function VendorImportPage() {
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
    displayName: "",
    contactType: "",
    companyName: "",
    email: "",
    phone: "",
    mobile: "",
    pan: "",
    gstin: "",
    taxTreatment: "",
    currency: "",
    openingBalance: "",
    billingAttention: "",
    billingStreet: "",
    billingStreet2: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "",
    billingPhone: "",
    billingFax: "",
    shippingAttention: "",
    shippingStreet: "",
    shippingStreet2: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    shippingCountry: "",
    shippingPhone: "",
    shippingFax: "",
    salutation: "",
    firstName: "",
    lastName: "",
    language: "",
    placeOfSupply: "",
    businessLegalName: "",
    businessTradeName: "",
    taxPreference: "",
    exemptionReason: "",
    msmeRegistered: "",
    tdsCategory: "",
    portalEnabled: "",
    notes: "",
    contactPersonSalutation: "",
    contactPersonFirstName: "",
    contactPersonLastName: "",
    contactPersonEmail: "",
    contactPersonPhone: "",
    contactPersonMobile: "",
    accountsPayableAccount: "",
    paymentTerms: "",
    websiteUrl: "",
    department: "",
    designation: "",
    twitterHandle: "",
    skypeName: "",
    facebookUrl: "",
    bankName: "",
    bankAccountNumber: "",
    bankAccountHolderName: "",
    bankIfscCode: "",
    bankBranchName: "",
    bankUpiId: "",
  });

  // Step 3 States
  const [mappedItems, setMappedItems] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showReadyDetails, setShowReadyDetails] = useState(true);
  const [showSkippedDetails, setShowSkippedDetails] = useState(true);
  const [showUnmappedDetails, setShowUnmappedDetails] = useState(true);

  // File drag & drop handlers
  const [isDragActive, setIsDragActive] = useState(false);

  // Load saved mapping on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hai_vendor_import_mapping");
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
      const blob = await contactApi.downloadSampleTemplate(format, "vendor");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "sample_vendors.xlsx" : "sample_vendors.csv";
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
      const blob = await contactApi.downloadBlankTemplate(format, "vendor");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = format === "excel" ? "blank_vendors.xlsx" : "blank_vendors.csv";
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
        displayName: "",
        contactType: "",
        companyName: "",
        email: "",
        phone: "",
        mobile: "",
        pan: "",
        gstin: "",
        taxTreatment: "",
        currency: "",
        openingBalance: "",
        billingAttention: "",
        billingStreet: "",
        billingStreet2: "",
        billingCity: "",
        billingState: "",
        billingZip: "",
        billingCountry: "",
        billingPhone: "",
        billingFax: "",
        shippingAttention: "",
        shippingStreet: "",
        shippingStreet2: "",
        shippingCity: "",
        shippingState: "",
        shippingZip: "",
        shippingCountry: "",
        shippingPhone: "",
        shippingFax: "",
        salutation: "",
        firstName: "",
        lastName: "",
        language: "",
        placeOfSupply: "",
        businessLegalName: "",
        businessTradeName: "",
        taxPreference: "",
        exemptionReason: "",
        msmeRegistered: "",
        tdsCategory: "",
        portalEnabled: "",
        notes: "",
        contactPersonSalutation: "",
        contactPersonFirstName: "",
        contactPersonLastName: "",
        contactPersonEmail: "",
        contactPersonPhone: "",
        contactPersonMobile: "",
        accountsPayableAccount: "",
        paymentTerms: "",
        websiteUrl: "",
        department: "",
        designation: "",
        twitterHandle: "",
        skypeName: "",
        facebookUrl: "",
        bankName: "",
        bankAccountNumber: "",
        bankAccountHolderName: "",
        bankIfscCode: "",
        bankBranchName: "",
        bankUpiId: "",
      };

      headers.forEach(h => {
        const normalized = h.toLowerCase().replace(/[\s_\-\/]/g, "");
        if (normalized === "contacttype" || normalized === "type") mapping.contactType = h;
        else if (normalized === "displayname" || normalized === "name" || normalized === "contactname") mapping.displayName = h;
        else if (normalized === "companyname" || normalized === "company" || normalized === "organisation") mapping.companyName = h;
        else if (normalized === "email" || normalized === "emailaddress") mapping.email = h;
        else if (normalized === "phone" || normalized === "workphone" || normalized === "telephone") mapping.phone = h;
        else if (normalized === "mobile" || normalized === "mobilephone" || normalized === "cell") mapping.mobile = h;
        else if (normalized === "pan" || normalized === "pannumber") mapping.pan = h;
        else if (normalized === "gstin" || normalized === "gstnumber" || normalized === "gst") mapping.gstin = h;
        else if (normalized === "gsttreatment" || normalized === "taxtreatment" || normalized === "treatment") mapping.taxTreatment = h;
        else if (normalized === "currency" || normalized === "basecurrency") mapping.currency = h;
        else if (normalized === "openingbalance" || normalized === "balance") mapping.openingBalance = h;
        else if (normalized === "billingattention" || normalized === "billingattn") mapping.billingAttention = h;
        else if (normalized === "billingstreet" || normalized === "billingaddress" || normalized === "billingstreet1") mapping.billingStreet = h;
        else if (normalized === "billingstreet2") mapping.billingStreet2 = h;
        else if (normalized === "billingcity") mapping.billingCity = h;
        else if (normalized === "billingstate") mapping.billingState = h;
        else if (normalized === "billingzip" || normalized === "billingpincode" || normalized === "billingpostal") mapping.billingZip = h;
        else if (normalized === "billingcountry") mapping.billingCountry = h;
        else if (normalized === "billingphone") mapping.billingPhone = h;
        else if (normalized === "billingfax") mapping.billingFax = h;
        else if (normalized === "shippingattention" || normalized === "shippingattn") mapping.shippingAttention = h;
        else if (normalized === "shippingstreet" || normalized === "shippingaddress" || normalized === "shippingstreet1") mapping.shippingStreet = h;
        else if (normalized === "shippingstreet2") mapping.shippingStreet2 = h;
        else if (normalized === "shippingcity") mapping.shippingCity = h;
        else if (normalized === "shippingstate") mapping.shippingState = h;
        else if (normalized === "shippingzip" || normalized === "shippingpincode" || normalized === "shippingpostal") mapping.shippingZip = h;
        else if (normalized === "shippingcountry") mapping.shippingCountry = h;
        else if (normalized === "shippingphone") mapping.shippingPhone = h;
        else if (normalized === "shippingfax") mapping.shippingFax = h;
        else if (normalized === "salutation") mapping.salutation = h;
        else if (normalized === "firstname") mapping.firstName = h;
        else if (normalized === "lastname") mapping.lastName = h;
        else if (normalized === "language") mapping.language = h;
        else if (normalized === "placeofsupply") mapping.placeOfSupply = h;
        else if (normalized === "businesslegalname" || normalized === "legalname") mapping.businessLegalName = h;
        else if (normalized === "businesstradename" || normalized === "tradename") mapping.businessTradeName = h;
        else if (normalized === "taxpreference") mapping.taxPreference = h;
        else if (normalized === "exemptionreason") mapping.exemptionReason = h;
        else if (normalized === "msmeregistered") mapping.msmeRegistered = h;
        else if (normalized === "tdscategory") mapping.tdsCategory = h;
        else if (normalized === "portalenabled") mapping.portalEnabled = h;
        else if (normalized === "notes" || normalized === "remarks") mapping.notes = h;
        else if (normalized === "contactpersonsalutation") mapping.contactPersonSalutation = h;
        else if (normalized === "contactpersonfirstname") mapping.contactPersonFirstName = h;
        else if (normalized === "contactpersonlastname") mapping.contactPersonLastName = h;
        else if (normalized === "contactpersonemail") mapping.contactPersonEmail = h;
        else if (normalized === "contactpersonphone") mapping.contactPersonPhone = h;
        else if (normalized === "contactpersonmobile") mapping.contactPersonMobile = h;
        else if (normalized === "accountspayableaccount") mapping.accountsPayableAccount = h;
        else if (normalized === "paymentterms" || normalized === "terms") mapping.paymentTerms = h;
        else if (normalized === "websiteurl") mapping.websiteUrl = h;
        else if (normalized === "department") mapping.department = h;
        else if (normalized === "designation") mapping.designation = h;
        else if (normalized === "twitterhandle") mapping.twitterHandle = h;
        else if (normalized === "skypename") mapping.skypeName = h;
        else if (normalized === "facebookurl") mapping.facebookUrl = h;
        else if (normalized === "bankname") mapping.bankName = h;
        else if (normalized === "bankaccountnumber" || normalized === "accountnumber") mapping.bankAccountNumber = h;
        else if (normalized === "bankaccountholdername" || normalized === "accountholdername") mapping.bankAccountHolderName = h;
        else if (normalized === "bankifsccode" || normalized === "ifsccode") mapping.bankIfscCode = h;
        else if (normalized === "bankbranchname" || normalized === "branchname") mapping.bankBranchName = h;
        else if (normalized === "bankupiid" || normalized === "upiid") mapping.bankUpiId = h;
      });

      setFieldMapping(mapping);
      setStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse file");
    }
  };

  const handleNextFromStep2 = async () => {
    if (!fieldMapping.displayName) {
      toast.error("Display Name field must be mapped");
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
      formData.append("defaultContactType", "Vendor");

      const previewRes = await contactApi.previewImport(formData);
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
      formData.append("defaultContactType", "Vendor");

      setImportProgress(40);
      const importRes = await contactApi.executeImport(formData);
      setImportProgress(90);

      if (importRes?.data) {
        if (saveMapping) {
          try {
            localStorage.setItem("hai_vendor_import_mapping", JSON.stringify(fieldMapping));
          } catch (err) {
            console.error("Failed to save mapping:", err);
          }
        }
        const { successCount, failCount, errors } = importRes.data;
        setImportProgress(100);

        if (failCount === 0) {
          toast.success(`Successfully imported ${successCount} vendors!`);
          router.push("/purchases/vendors");
        } else {
          toast.warning(`Import complete: ${successCount} succeeded, ${failCount} failed.`);
          if (errors && errors.length > 0) {
            console.error("Import errors:", errors);
            toast.error(`Row ${errors[0].row}: ${errors[0].error}`);
          }
          router.push("/purchases/vendors");
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-slate-800">
            {step === 1 ? "Vendors - Select File" : step === 2 ? "Vendors - Map Fields" : "Vendors - Preview"}
          </h1>
        </div>
        <button
          onClick={() => router.push("/purchases/vendors")}
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

            {/* Templates download links */}
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

            {/* Duplicate handling strategy */}
            <Card className="p-6 bg-white space-y-6">
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
                        Retains the records in HAI Accounting and does not import the duplicates in the import file.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="overwrite" id="overwrite" className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor="overwrite" className="text-sm font-medium text-slate-800">
                        Overwrite Vendors
                      </Label>
                      <p className="text-xs text-slate-500">
                        Imports the duplicates in the import file, overwriting the details of the existing vendors.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Character encoding selection */}
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

            <div className="flex items-center gap-3 pt-4 border-t">
              <Button onClick={handleNextFromStep1} className="bg-blue-600 hover:bg-blue-700 text-white">
                Next
              </Button>
              <Button variant="outline" onClick={() => router.push("/purchases/vendors")} className="border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
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
                        <TableRow className="bg-white hover:bg-white border-none">
                          <TableCell colSpan={2} className="pt-6 pb-2 pl-4">
                            <h3 className="text-sm font-bold text-slate-800 tracking-tight">{group.title}</h3>
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-slate-50 hover:bg-slate-50 border-y border-slate-200">
                          <TableCell className="py-2.5 pl-4 text-[10px] font-bold text-slate-400 tracking-wider uppercase w-1/2">
                            HAI Accounting Field
                          </TableCell>
                          <TableCell className="py-2.5 text-[10px] font-bold text-slate-400 tracking-wider uppercase w-1/2">
                            Imported File Headers
                          </TableCell>
                        </TableRow>
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

          const downloadSkippedRowsCSV = () => {
            if (skippedItems.length === 0) return;
            const headers = ["Row Number", "Display Name", "Company Name", "Contact Type", "Email", "Opening Balance", "Error/Skip Reason"];
            const csvRows = skippedItems.map((item, idx) => [
              item.rowNumber || (idx + 2),
              item.displayName || "",
              item.companyName || "",
              item.contactType || "",
              item.email || "",
              item.openingBalance || "0",
              item.status === "Skip" ? "Row already exists (Skipped)" : (item.error || "Validation error")
            ]);
            const csvContent = [
              headers.join(","),
              ...csvRows.map(row => row.map(val => `"${val}"`).join(","))
            ].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "skipped_vendors.csv");
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };

          return (
            <div className="space-y-6">
              {readyItems.length === 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-red-800 text-sm">
                  <AlertCircle className="h-5 w-5 mt-0.5 text-red-600 flex-shrink-0" />
                  <span className="font-semibold">None of the vendors can be imported</span>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3 text-green-800 text-sm">
                  <Check className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
                  <span className="font-semibold">
                    {readyItems.length} of the {mappedItems.length} vendors are ready to be imported.
                  </span>
                </div>
              )}

              <Card className="p-6 bg-white space-y-6 divide-y divide-slate-100">
                {/* Ready Vendors */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>Vendors that are ready to be imported</span>
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
                            <TableHead className="text-xs font-semibold py-2">Row</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Display Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Company Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Type</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Email</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-right">Opening Balance</TableHead>
                            <TableHead className="text-xs font-semibold py-2 text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyItems.map((item, idx) => (
                            <TableRow key={idx} className="hover:bg-slate-50/50">
                              <TableCell className="text-xs py-2 text-slate-400">{item.rowNumber}</TableCell>
                              <TableCell className="text-xs py-2 font-medium text-slate-800">{item.displayName}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.companyName || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.contactType || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-slate-500">{item.email || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-right font-semibold tabular-nums text-slate-800">{fmtCurrency(item.openingBalance || 0)}</TableCell>
                              <TableCell className="text-xs py-2 text-center font-medium">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                                  item.status === "Overwrite" ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-green-50 border-green-200 text-green-600"
                                }`}>
                                  {item.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Skipped/Errors */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span>No. of Records skipped - {skippedItems.length}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {skippedItems.length > 0 && (
                        <span className="text-xs text-slate-500 font-medium">
                          Download skipped vendors ({" "}
                          <button
                            onClick={downloadSkippedRowsCSV}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            CSV
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
                            <TableHead className="text-xs font-semibold py-2">Display Name</TableHead>
                            <TableHead className="text-xs font-semibold py-2">Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {skippedItems.map((item, idx) => (
                            <TableRow key={idx} className="bg-amber-50/20">
                              <TableCell className="text-xs py-2 font-medium text-slate-400">{item.rowNumber}</TableCell>
                              <TableCell className="text-xs py-2 font-medium text-slate-800">{item.displayName || "—"}</TableCell>
                              <TableCell className="text-xs py-2 text-amber-600 font-medium">
                                {item.status === "Skip" ? "Row already exists (Skipped)" : (item.error || "Validation error")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Unmapped Fields */}
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
                        The following fields in your import file have not been mapped to any Vendor field. The data in these fields will be ignored.
                      </p>
                      <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                        {unmappedHeaders.map((header) => (
                          <li key={header} className="font-medium">{header}</li>
                        ))}
                      </ul>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 mt-4">
                        Click the Previous/Back button if you want to match the above column header(s) or click the Import button to continue with the import.
                      </div>
                    </div>
                  )}
                </div>

                {isImporting && (
                  <div className="space-y-2 pt-4 border-t">
                    <div className="flex justify-between text-xs font-semibold text-slate-700">
                      <span>Importing vendors...</span>
                      <span>{importProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full transition-all duration-150" style={{ width: `${importProgress}%` }} />
                    </div>
                  </div>
                )}
              </Card>

              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  onClick={handleConfirmImport}
                  disabled={isImporting || readyItems.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>Import Vendors ({readyItems.length})</span>
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
