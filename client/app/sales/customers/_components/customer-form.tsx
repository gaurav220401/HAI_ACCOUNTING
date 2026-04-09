"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { accountApi, type Account } from "@/lib/api/accounts";
import { apiFetch } from "@/lib/api/client";
import {
  contactApi,
  type Address,
  type Contact,
  type ContactDocument,
  type ContactPerson,
  type ContactTaxPreference,
  type CreateContactInput,
  type TaxTreatment,
} from "@/lib/api/contacts";
import { settingsApi, type PaymentTerms, type ReportingTag } from "@/lib/api/settings";

type CustomerTypeUi = "Business" | "Individual";

type FormTab =
  | "other-details"
  | "address"
  | "contact-persons"
  | "custom-fields"
  | "reporting-tags"
  | "remarks";

interface GstTreatmentOption {
  value: TaxTreatment;
  description: string;
  requiresGstin: boolean;
  showPlaceOfSupply: boolean;
  showTaxPreference: boolean;
}

interface CustomerFormProps {
  mode: "create" | "edit";
  initialData?: Contact | null;
  onCancel: () => void;
  onSaved: (contact: Contact) => void;
}

const SALUTATIONS = ["", "Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "bn", label: "Bengali" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
];
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];
const MAX_DOCUMENTS = 10;
const MAX_DOC_SIZE_MB = 10;

const GST_TREATMENT_OPTIONS: GstTreatmentOption[] = [
  {
    value: "Registered Business - Regular",
    description: "Business that is registered under GST",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Registered Business - Composition",
    description: "Business that is registered under the Composition Scheme in GST",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Unregistered Business",
    description: "Business that has not been registered under GST",
    requiresGstin: false,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Consumer",
    description: "A customer who is a regular consumer",
    requiresGstin: false,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Overseas",
    description: "Persons with whom you do import or export of supplies outside India",
    requiresGstin: false,
    showPlaceOfSupply: false,
    showTaxPreference: false,
  },
  {
    value: "Special Economic Zone",
    description: "Business (Unit) located in a Special Economic Zone (SEZ) of India or a SEZ Developer",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Deemed Export",
    description: "Supply of goods to an EOU or against Advance Authorization / EPCG",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Tax Deductor",
    description: "Departments of government, governmental agencies or local authorities",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "SEZ Developer",
    description: "An organisation that owns at least 26% equity in creating SEZ business units",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
  {
    value: "Input Service Distributor",
    description: "Office that receives service tax invoices for the same PAN across states",
    requiresGstin: true,
    showPlaceOfSupply: true,
    showTaxPreference: true,
  },
];

const GST_TREATMENT_ALIAS_TO_CANONICAL: Record<string, TaxTreatment> = {
  Taxable: "Registered Business - Regular",
  TaxExempt: "Consumer",
  ReverseCharge: "Tax Deductor",
  SEZ: "Special Economic Zone",
  Composition: "Registered Business - Composition",
  UIN: "Input Service Distributor",
};

const PLACE_OF_SUPPLY_OPTIONS = [
  { code: "AN", label: "[AN] - Andaman and Nicobar Islands" },
  { code: "AD", label: "[AD] - Andhra Pradesh" },
  { code: "AR", label: "[AR] - Arunachal Pradesh" },
  { code: "AS", label: "[AS] - Assam" },
  { code: "BR", label: "[BR] - Bihar" },
  { code: "CH", label: "[CH] - Chandigarh" },
  { code: "CG", label: "[CG] - Chhattisgarh" },
  { code: "DN", label: "[DN] - Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DD", label: "[DD] - Daman and Diu" },
  { code: "DL", label: "[DL] - Delhi" },
  { code: "FC", label: "[FC] - Foreign Country" },
  { code: "GA", label: "[GA] - Goa" },
  { code: "GJ", label: "[GJ] - Gujarat" },
  { code: "HR", label: "[HR] - Haryana" },
  { code: "HP", label: "[HP] - Himachal Pradesh" },
  { code: "JK", label: "[JK] - Jammu and Kashmir" },
  { code: "JH", label: "[JH] - Jharkhand" },
  { code: "KA", label: "[KA] - Karnataka" },
  { code: "KL", label: "[KL] - Kerala" },
  { code: "LA", label: "[LA] - Ladakh" },
  { code: "LD", label: "[LD] - Lakshadweep" },
  { code: "MP", label: "[MP] - Madhya Pradesh" },
  { code: "MH", label: "[MH] - Maharashtra" },
  { code: "MN", label: "[MN] - Manipur" },
  { code: "ML", label: "[ML] - Meghalaya" },
  { code: "MZ", label: "[MZ] - Mizoram" },
  { code: "NL", label: "[NL] - Nagaland" },
  { code: "OD", label: "[OD] - Odisha" },
  { code: "OT", label: "[OT] - Other Territory" },
  { code: "PY", label: "[PY] - Puducherry" },
  { code: "PB", label: "[PB] - Punjab" },
  { code: "RJ", label: "[RJ] - Rajasthan" },
  { code: "SK", label: "[SK] - Sikkim" },
  { code: "TN", label: "[TN] - Tamil Nadu" },
  { code: "TS", label: "[TS] - Telangana" },
  { code: "TR", label: "[TR] - Tripura" },
  { code: "UP", label: "[UP] - Uttar Pradesh" },
  { code: "UK", label: "[UK] - Uttarakhand" },
  { code: "WB", label: "[WB] - West Bengal" },
] as const;

const PLACE_CODE_SET = new Set<string>(PLACE_OF_SUPPLY_OPTIONS.map((row) => row.code));

function emptyAddress(): Address {
  return {
    attention: "",
    street: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    country: "India",
    phone: "",
    fax: "",
  };
}

function emptyContactPerson(): ContactPerson {
  return {
    salutation: "",
    firstName: "",
    lastName: "",
    name: "",
    email: "",
    workPhone: "",
    mobile: "",
    isPrimary: false,
  };
}

function displayNameFromInputs(
  customerType: CustomerTypeUi,
  salutation: string,
  firstName: string,
  lastName: string,
  companyName: string,
): string {
  if (customerType === "Business") return companyName.trim();
  return [salutation, firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ");
}

function normalizeTreatment(value: unknown): TaxTreatment {
  const raw = String(value || "").trim();
  if (!raw) return "Registered Business - Regular";
  const mapped = GST_TREATMENT_ALIAS_TO_CANONICAL[raw];
  return (mapped || raw) as TaxTreatment;
}

function normalizePlaceOfSupplyCode(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (PLACE_CODE_SET.has(raw.toUpperCase())) return raw.toUpperCase();

  const bracket = raw.match(/^\[([A-Za-z]{2})\]/)?.[1]?.toUpperCase();
  if (bracket && PLACE_CODE_SET.has(bracket)) return bracket;

  const found = PLACE_OF_SUPPLY_OPTIONS.find((row) =>
    row.label.toLowerCase().includes(raw.toLowerCase()) ||
    row.label.toLowerCase().endsWith(raw.toLowerCase()),
  );
  return found?.code || "";
}

function toObjectIdOrUndefined(value: string): string | undefined {
  const trimmed = String(value || "").trim();
  return /^[a-f\d]{24}$/i.test(trimmed) ? trimmed : undefined;
}

function idFromUnknown(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const rec = value as { _id?: unknown };
    if (rec._id) return String(rec._id);
  }
  return "";
}

function hasAddressData(address: Address): boolean {
  return [
    address.attention,
    address.street,
    address.street2,
    address.city,
    address.state,
    address.zip,
    address.country,
    address.phone,
    address.fax,
  ]
    .map((v) => String(v || "").trim())
    .some(Boolean);
}

function pruneAddress(address: Address): Address | undefined {
  const out: Address = {
    attention: String(address.attention || "").trim() || undefined,
    street: String(address.street || "").trim() || undefined,
    street2: String(address.street2 || "").trim() || undefined,
    city: String(address.city || "").trim() || undefined,
    state: String(address.state || "").trim() || undefined,
    zip: String(address.zip || "").trim() || undefined,
    country: String(address.country || "").trim() || undefined,
    phone: String(address.phone || "").trim() || undefined,
    fax: String(address.fax || "").trim() || undefined,
  };

  return hasAddressData(out) ? out : undefined;
}

function optionByTreatment(value: TaxTreatment): GstTreatmentOption {
  return (
    GST_TREATMENT_OPTIONS.find((row) => row.value === value) ||
    GST_TREATMENT_OPTIONS[0]
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stateNameFromPlaceLabel(label: string): string {
  return label.replace(/^\[[A-Z]{2}\]\s*-\s*/, "").trim();
}

function AddressFields({
  address,
  onChange,
}: {
  address: Address;
  onChange: (field: keyof Address, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Input
        className="h-9"
        placeholder="Attention"
        value={address.attention || ""}
        onChange={(e) => onChange("attention", e.target.value)}
      />

      <Select value={address.country || ""} onValueChange={(v) => onChange("country", v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Country/Region" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="India">India</SelectItem>
          <SelectItem value="Foreign Country">Foreign Country</SelectItem>
          <SelectItem value="United States">United States</SelectItem>
          <SelectItem value="United Kingdom">United Kingdom</SelectItem>
          <SelectItem value="Singapore">Singapore</SelectItem>
          <SelectItem value="UAE">UAE</SelectItem>
        </SelectContent>
      </Select>

      <Textarea
        className="min-h-[72px]"
        placeholder="Street 1"
        value={address.street || ""}
        onChange={(e) => onChange("street", e.target.value)}
      />

      <Textarea
        className="min-h-[72px]"
        placeholder="Street 2"
        value={address.street2 || ""}
        onChange={(e) => onChange("street2", e.target.value)}
      />

      <Input
        className="h-9"
        placeholder="City"
        value={address.city || ""}
        onChange={(e) => onChange("city", e.target.value)}
      />

      <Select value={address.state || ""} onValueChange={(v) => onChange("state", v)}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select or type to add" />
        </SelectTrigger>
        <SelectContent>
          {PLACE_OF_SUPPLY_OPTIONS.filter((row) => row.code !== "FC").map((row) => (
            <SelectItem key={row.code} value={stateNameFromPlaceLabel(row.label)}>{row.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        className="h-9"
        placeholder="Pin Code"
        value={address.zip || ""}
        onChange={(e) => onChange("zip", e.target.value)}
      />

      <div className="flex gap-2">
        <div className="flex h-9 flex-1 overflow-hidden rounded-md border border-input">
          <span className="flex items-center border-r border-input bg-muted px-2.5 text-xs text-muted-foreground">+91</span>
          <input
            type="tel"
            className="flex-1 bg-background px-2.5 text-sm outline-none"
            value={address.phone || ""}
            onChange={(e) => onChange("phone", e.target.value)}
            placeholder="Phone"
          />
        </div>
      </div>

      <Input
        className="h-9"
        placeholder="Fax Number"
        value={address.fax || ""}
        onChange={(e) => onChange("fax", e.target.value)}
      />
    </div>
  );
}

function Row({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[170px_1fr]">
      <Label className="pt-2 text-sm text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

export function CustomerForm({ mode, initialData, onCancel, onSaved }: CustomerFormProps) {
  const isEdit = mode === "edit";
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<FormTab>("other-details");

  const [customerType, setCustomerType] = useState<CustomerTypeUi>("Business");
  const [salutation, setSalutation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayNameManual, setDisplayNameManual] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mobile, setMobile] = useState("");
  const [language, setLanguage] = useState("en");

  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>("Registered Business - Regular");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [gstin, setGstin] = useState("");
  const [businessLegalName, setBusinessLegalName] = useState("");
  const [businessTradeName, setBusinessTradeName] = useState("");
  const [pan, setPan] = useState("");
  const [taxPreference, setTaxPreference] = useState<ContactTaxPreference>("Taxable");
  const [exemptionReason, setExemptionReason] = useState("");

  const [currency, setCurrency] = useState("INR");
  const [accountsReceivableId, setAccountsReceivableId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [paymentTermsId, setPaymentTermsId] = useState("");
  const [portalEnabled, setPortalEnabled] = useState(false);

  const [billingAddress, setBillingAddress] = useState<Address>(emptyAddress());
  const [shippingAddress, setShippingAddress] = useState<Address>(emptyAddress());

  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([emptyContactPerson()]);
  const [reportingTags, setReportingTags] = useState<string[]>([]);

  const [notes, setNotes] = useState("");
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [documentUploading, setDocumentUploading] = useState(false);

  const [receivableAccounts, setReceivableAccounts] = useState<Account[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms[]>([]);
  const [reportingTagOptions, setReportingTagOptions] = useState<ReportingTag[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const computedDisplayName = useMemo(
    () => displayNameFromInputs(customerType, salutation, firstName, lastName, companyName),
    [customerType, salutation, firstName, lastName, companyName],
  );

  const treatmentMeta = useMemo(() => optionByTreatment(taxTreatment), [taxTreatment]);

  useEffect(() => {
    let cancelled = false;

    async function loadRefData() {
      try {
        const [accountsRes, termsRes, tagsRes] = await Promise.all([
          accountApi.list({ accountType: "Accounts Receivable", excludeGroups: true }),
          settingsApi.paymentTerms.list(),
          settingsApi.reportingTags.list(),
        ]);

        if (cancelled) return;
        setReceivableAccounts(accountsRes.data || []);
        setPaymentTerms(termsRes.data || []);
        setReportingTagOptions((tagsRes.data || []).filter((t) => t.isActive));
      } catch {
        if (cancelled) return;
        setReceivableAccounts([]);
        setPaymentTerms([]);
        setReportingTagOptions([]);
      }
    }

    void loadRefData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialData) return;

    setCustomerType(initialData.companyName ? "Business" : "Individual");
    setSalutation(initialData.salutation || "");
    setFirstName(initialData.firstName || "");
    setLastName(initialData.lastName || "");
    setCompanyName(initialData.companyName || "");
    setDisplayName(initialData.displayName || "");
    setDisplayNameManual(true);

    setEmail(initialData.email || "");
    setPhone(initialData.phone || "");
    setMobile(initialData.mobile || "");
    setLanguage(initialData.language || "en");

    setTaxTreatment(normalizeTreatment(initialData.taxTreatment));
    setPlaceOfSupply(normalizePlaceOfSupplyCode(initialData.placeOfSupply));
    setGstin(initialData.gstin || "");
    setBusinessLegalName(initialData.businessLegalName || "");
    setBusinessTradeName(initialData.businessTradeName || "");
    setPan(initialData.pan || "");
    setTaxPreference(initialData.taxPreference === "Tax Exempt" ? "Tax Exempt" : "Taxable");
    setExemptionReason(initialData.exemptionReason || "");

    setCurrency(initialData.currency || "INR");
    setAccountsReceivableId(idFromUnknown(initialData.accountsReceivableId));
    setOpeningBalance(initialData.openingBalance ? String(initialData.openingBalance) : "");
    setPaymentTermsId(idFromUnknown(initialData.paymentTermsId));
    setPortalEnabled(Boolean(initialData.portalEnabled));

    setBillingAddress({ ...emptyAddress(), ...(initialData.billingAddress || {}) });
    setShippingAddress({ ...emptyAddress(), ...(initialData.shippingAddress || {}) });

    setContactPersons(initialData.contactPersons?.length ? initialData.contactPersons : [emptyContactPerson()]);
    setReportingTags(
      Array.isArray(initialData.reportingTags)
        ? initialData.reportingTags
            .map((row) => idFromUnknown(row))
            .filter(Boolean)
        : [],
    );

    setNotes(initialData.notes || "");
    setDocuments(initialData.documents || []);
  }, [initialData]);

  useEffect(() => {
    if (!displayNameManual) {
      setDisplayName(computedDisplayName);
    }
  }, [computedDisplayName, displayNameManual]);

  useEffect(() => {
    if (taxTreatment === "Overseas") {
      setPlaceOfSupply("FC");
      setTaxPreference("Taxable");
      setExemptionReason("");
      setGstin("");
      setBusinessLegalName("");
      setBusinessTradeName("");
    }
  }, [taxTreatment]);

  function updateBilling(field: keyof Address, value: string) {
    setBillingAddress((prev) => ({ ...prev, [field]: value }));
  }

  function updateShipping(field: keyof Address, value: string) {
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
  }

  function copyBillingToShipping() {
    setShippingAddress({ ...billingAddress });
  }

  function addContactPerson() {
    setContactPersons((prev) => [...prev, emptyContactPerson()]);
  }

  function removeContactPerson(index: number) {
    setContactPersons((prev) => prev.filter((_, i) => i !== index));
  }

  function updateContactPerson(index: number, field: keyof ContactPerson, value: string | boolean) {
    setContactPersons((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value } as ContactPerson;
      const personName = [row.firstName, row.lastName].map((s) => String(s || "").trim()).filter(Boolean).join(" ");
      row.name = personName || row.name || "Contact";
      next[index] = row;
      return next;
    });
  }

  function toggleReportingTag(id: string, checked: boolean) {
    setReportingTags((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((row) => row !== id);
    });
  }

  async function handleUploadDocuments(files: FileList | null) {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    if (documents.length + selected.length > MAX_DOCUMENTS) {
      toast.error(`Maximum ${MAX_DOCUMENTS} documents allowed`);
      return;
    }

    const tooLarge = selected.find((f) => f.size > MAX_DOC_SIZE_MB * 1024 * 1024);
    if (tooLarge) {
      toast.error(`\"${tooLarge.name}\" exceeds ${MAX_DOC_SIZE_MB}MB limit`);
      return;
    }

    setDocumentUploading(true);
    try {
      const uploaded: ContactDocument[] = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await apiFetch<{ data: { url: string; publicId: string } }>(
            "/upload?folder=contacts/documents&resourceType=auto",
            { method: "POST", body: formData },
          );

          uploaded.push({
            name: file.name,
            url: res.data.url,
            publicId: res.data.publicId,
            size: file.size,
            mimeType: file.type,
          });
        } catch {
          toast.error(`Failed to upload \"${file.name}\"`);
        }
      }

      if (uploaded.length > 0) {
        setDocuments((prev) => [...prev, ...uploaded]);
        toast.success(`${uploaded.length} file(s) uploaded`);
      }
    } finally {
      setDocumentUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  }

  function removeDocument(index: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError("");

    if (customerType === "Business" && !companyName.trim()) {
      setError("Company Name is required for Business customer type");
      return;
    }

    if (customerType === "Individual" && !firstName.trim()) {
      setError("First Name is required for Individual customer type");
      return;
    }

    const finalDisplayName = displayName.trim() || computedDisplayName;
    if (!finalDisplayName) {
      setError("Display Name is required");
      return;
    }

    if (treatmentMeta.showPlaceOfSupply && !placeOfSupply.trim()) {
      setError("Place of Supply is required for selected GST treatment");
      return;
    }

    if (treatmentMeta.requiresGstin && !gstin.trim()) {
      setError("GSTIN / UIN is required for selected GST treatment");
      return;
    }

    if (treatmentMeta.showTaxPreference && taxPreference === "Tax Exempt" && !exemptionReason.trim()) {
      setError("Exemption Reason is required when Tax Preference is Tax Exempt");
      return;
    }

    const ob = openingBalance.trim() ? Number(openingBalance) : undefined;
    if (ob !== undefined && Number.isNaN(ob)) {
      setError("Opening Balance must be a valid number");
      return;
    }

    const contactRows = contactPersons
      .map((row) => {
        const first = String(row.firstName || "").trim();
        const last = String(row.lastName || "").trim();
        const name = [first, last].filter(Boolean).join(" ") || String(row.name || "").trim();

        return {
          salutation: String(row.salutation || "").trim() || undefined,
          firstName: first || undefined,
          lastName: last || undefined,
          name: name || "Contact",
          email: String(row.email || "").trim() || undefined,
          workPhone: String(row.workPhone || "").trim() || undefined,
          mobile: String(row.mobile || "").trim() || undefined,
          isPrimary: Boolean(row.isPrimary),
        } satisfies ContactPerson;
      })
      .filter((row) => row.firstName || row.lastName || row.email || row.workPhone || row.mobile);

    const payload: CreateContactInput = {
      contactType: "Customer",
      salutation: salutation.trim() || undefined,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      displayName: finalDisplayName,
      companyName: companyName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      mobile: mobile.trim() || undefined,
      language: language || "en",

      taxTreatment,
      taxPreference: treatmentMeta.showTaxPreference ? taxPreference : "Taxable",
      exemptionReason:
        treatmentMeta.showTaxPreference && taxPreference === "Tax Exempt"
          ? exemptionReason.trim() || undefined
          : undefined,
      placeOfSupply: treatmentMeta.showPlaceOfSupply ? placeOfSupply : "FC",
      gstin: treatmentMeta.requiresGstin ? gstin.trim().toUpperCase() || undefined : undefined,
      businessLegalName: treatmentMeta.requiresGstin ? businessLegalName.trim() || undefined : undefined,
      businessTradeName: treatmentMeta.requiresGstin ? businessTradeName.trim() || undefined : undefined,
      pan: pan.trim().toUpperCase() || undefined,

      currency: currency || "INR",
      accountsReceivableId: toObjectIdOrUndefined(accountsReceivableId),
      openingBalance: ob,
      paymentTermsId: toObjectIdOrUndefined(paymentTermsId),
      portalEnabled,

      billingAddress: pruneAddress(billingAddress),
      shippingAddress: pruneAddress(shippingAddress),
      contactPersons: contactRows.length ? contactRows : undefined,
      reportingTags: reportingTags.length ? reportingTags : undefined,
      notes: notes.trim() || undefined,
      documents: documents.length ? documents : undefined,
    };

    setSaving(true);
    try {
      const res = isEdit && initialData?._id
        ? await contactApi.update(initialData._id, payload)
        : await contactApi.create(payload);

      toast.success(isEdit ? "Customer updated" : "Customer created");
      onSaved(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : isEdit
          ? "Failed to update customer"
          : "Failed to create customer";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <Row label="Customer Type" required>
          <RadioGroup
            className="flex items-center gap-6 pt-2"
            value={customerType}
            onValueChange={(v) => setCustomerType(v as CustomerTypeUi)}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Business" id="customer-type-business" />
              <Label htmlFor="customer-type-business" className="font-normal">Business</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="Individual" id="customer-type-individual" />
              <Label htmlFor="customer-type-individual" className="font-normal">Individual</Label>
            </div>
          </RadioGroup>
        </Row>

        <Row label="Primary Contact" required={customerType === "Individual"}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Select value={salutation || "__none"} onValueChange={(v) => setSalutation(v === "__none" ? "" : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Salutation" />
              </SelectTrigger>
              <SelectContent>
                {SALUTATIONS.map((row) => (
                  <SelectItem key={row || "__none"} value={row || "__none"}>{row || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-9"
              placeholder={customerType === "Individual" ? "First Name *" : "First Name"}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              className="h-9"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </Row>

        <Row label="Company Name" required={customerType === "Business"}>
          <Input
            className="h-9"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </Row>

        <Row label="Display Name" required>
          <Input
            className="h-9"
            placeholder="Select or type to add"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDisplayNameManual(true);
            }}
          />
        </Row>

        <Row label="Email Address">
          <Input
            className="h-9"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Row>

        <Row label="Phone">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="flex h-9 overflow-hidden rounded-md border border-input">
              <span className="flex items-center border-r border-input bg-muted px-2.5 text-xs text-muted-foreground">+91</span>
              <input
                type="tel"
                className="flex-1 bg-background px-2.5 text-sm outline-none"
                placeholder="Work Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex h-9 overflow-hidden rounded-md border border-input">
              <span className="flex items-center border-r border-input bg-muted px-2.5 text-xs text-muted-foreground">+91</span>
              <input
                type="tel"
                className="flex-1 bg-background px-2.5 text-sm outline-none"
                placeholder="Mobile"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </div>
          </div>
        </Row>

        <Row label="Customer Language">
          <Select value={language || "en"} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 max-w-[320px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((row) => (
                <SelectItem key={row.value} value={row.value}>{row.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as FormTab)} className="w-full">
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b px-0"
        >
          <TabsTrigger value="other-details">Other Details</TabsTrigger>
          <TabsTrigger value="address">Address</TabsTrigger>
          <TabsTrigger value="contact-persons">Contact Persons</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="reporting-tags">Reporting Tags</TabsTrigger>
          <TabsTrigger value="remarks">Remarks</TabsTrigger>
        </TabsList>

        <TabsContent value="other-details" className="space-y-4 pt-6">
          <Row label="GST Treatment" required>
            <div className="space-y-2">
              <Select value={taxTreatment} onValueChange={(v) => setTaxTreatment(v as TaxTreatment)}>
                <SelectTrigger className="h-10 max-w-[430px]">
                  <SelectValue placeholder="Select a GST treatment" />
                </SelectTrigger>
                <SelectContent>
                  {GST_TREATMENT_OPTIONS.map((row) => (
                    <SelectItem key={row.value} value={row.value}>{row.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{treatmentMeta.description}</p>
            </div>
          </Row>

          {treatmentMeta.requiresGstin ? (
            <>
              <Row label="GSTIN / UIN" required>
                <div className="flex items-center gap-3">
                  <Input
                    className="h-9 max-w-[430px] font-mono uppercase"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    maxLength={15}
                  />
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-0"
                    onClick={() => {
                      toast.info("GST portal lookup can be done from the GSTIN dialog flow.");
                    }}
                  >
                    Get Taxpayer details
                  </Button>
                </div>
              </Row>

              <Row label="Business Legal Name">
                <Input
                  className="h-9 max-w-[430px]"
                  value={businessLegalName}
                  onChange={(e) => setBusinessLegalName(e.target.value)}
                />
              </Row>

              <Row label="Business Trade Name">
                <Input
                  className="h-9 max-w-[430px]"
                  value={businessTradeName}
                  onChange={(e) => setBusinessTradeName(e.target.value)}
                />
              </Row>
            </>
          ) : null}

          {treatmentMeta.showPlaceOfSupply ? (
            <Row label="Place of Supply" required>
              <Select value={placeOfSupply || "__none"} onValueChange={(v) => setPlaceOfSupply(v === "__none" ? "" : v)}>
                <SelectTrigger className="h-10 max-w-[430px]">
                  <SelectValue placeholder="Select place of supply" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select place of supply</SelectItem>
                  {PLACE_OF_SUPPLY_OPTIONS.map((row) => (
                    <SelectItem key={row.code} value={row.code}>{row.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          ) : null}

          <Row label="PAN">
            <Input
              className="h-9 max-w-[430px]"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </Row>

          {treatmentMeta.showTaxPreference ? (
            <>
              <Row label="Tax Preference" required>
                <RadioGroup
                  className="flex items-center gap-6 pt-2"
                  value={taxPreference}
                  onValueChange={(v) => setTaxPreference(v as ContactTaxPreference)}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Taxable" id="tax-pref-taxable" />
                    <Label htmlFor="tax-pref-taxable" className="font-normal">Taxable</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Tax Exempt" id="tax-pref-exempt" />
                    <Label htmlFor="tax-pref-exempt" className="font-normal">Tax Exempt</Label>
                  </div>
                </RadioGroup>
              </Row>

              {taxPreference === "Tax Exempt" ? (
                <Row label="Exemption Reason" required>
                  <Input
                    className="h-9 max-w-[430px]"
                    placeholder="Select or type to add"
                    value={exemptionReason}
                    onChange={(e) => setExemptionReason(e.target.value)}
                  />
                </Row>
              ) : null}
            </>
          ) : null}

          <Row label="Currency">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 max-w-[430px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((row) => (
                  <SelectItem key={row} value={row}>{row}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Accounts Receivable">
            <Select
              value={accountsReceivableId || "__none"}
              onValueChange={(v) => setAccountsReceivableId(v === "__none" ? "" : v)}
            >
              <SelectTrigger className="h-10 max-w-[430px]">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Select an account</SelectItem>
                {receivableAccounts.map((account) => (
                  <SelectItem key={account._id} value={account._id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Opening Balance">
            <div className="flex h-10 max-w-[430px]">
              <span className="flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                {currency}
              </span>
              <Input
                type="number"
                className="h-10 rounded-l-none"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          </Row>

          <Row label="Payment Terms">
            <Select
              value={paymentTermsId || "__none"}
              onValueChange={(v) => setPaymentTermsId(v === "__none" ? "" : v)}
            >
              <SelectTrigger className="h-10 max-w-[430px]">
                <SelectValue placeholder="Due on Receipt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Due on Receipt</SelectItem>
                {paymentTerms.map((term) => (
                  <SelectItem key={term._id} value={term._id}>{term.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Enable Portal?">
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="customer-enable-portal"
                checked={portalEnabled}
                onCheckedChange={(v) => setPortalEnabled(Boolean(v))}
              />
              <Label htmlFor="customer-enable-portal" className="font-normal">
                Allow portal access for this customer
              </Label>
            </div>
          </Row>

          <Row label="Documents">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={documentUploading || documents.length >= MAX_DOCUMENTS}
                  onClick={() => docInputRef.current?.click()}
                >
                  {documentUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload File
                </Button>
                <span className="text-xs text-muted-foreground">
                  You can upload a maximum of {MAX_DOCUMENTS} files, {MAX_DOC_SIZE_MB}MB each
                </span>
              </div>

              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc, index) => (
                    <div key={`${doc.publicId}-${index}`} className="flex items-center justify-between rounded border px-3 py-2">
                      <div className="min-w-0">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-primary hover:underline">
                          {doc.name}
                        </a>
                        <p className="text-xs text-muted-foreground">{formatBytes(doc.size)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeDocument(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <input
                ref={docInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleUploadDocuments(e.target.files);
                }}
              />
            </div>
          </Row>

          <Row label="">
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => setShowMoreDetails((v) => !v)}
            >
              {showMoreDetails ? "Hide more details" : "Add more details"}
            </button>
          </Row>

          {showMoreDetails ? (
            <div className="rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Customer Owner:</span> Assign a user as the customer owner to provide access only to the data of this customer.
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="address" className="pt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Billing Address</h3>
              <AddressFields address={billingAddress} onChange={updateBilling} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Shipping Address</h3>
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={copyBillingToShipping}
                >
                  Copy billing address
                </button>
              </div>
              <AddressFields address={shippingAddress} onChange={updateShipping} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contact-persons" className="pt-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>SALUTATION</TableHead>
                  <TableHead>FIRST NAME</TableHead>
                  <TableHead>LAST NAME</TableHead>
                  <TableHead>EMAIL ADDRESS</TableHead>
                  <TableHead>WORK PHONE</TableHead>
                  <TableHead>MOBILE</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactPersons.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Select
                        value={row.salutation || "__none"}
                        onValueChange={(v) => updateContactPerson(index, "salutation", v === "__none" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SALUTATIONS.map((sal) => (
                            <SelectItem key={sal || "__none"} value={sal || "__none"}>{sal || "—"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={row.firstName || ""}
                        onChange={(e) => updateContactPerson(index, "firstName", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={row.lastName || ""}
                        onChange={(e) => updateContactPerson(index, "lastName", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        type="email"
                        value={row.email || ""}
                        onChange={(e) => updateContactPerson(index, "email", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={row.workPhone || ""}
                        onChange={(e) => updateContactPerson(index, "workPhone", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={row.mobile || ""}
                        onChange={(e) => updateContactPerson(index, "mobile", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeContactPerson(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button type="button" variant="outline" className="mt-3" onClick={addContactPerson}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact Person
          </Button>
        </TabsContent>

        <TabsContent value="custom-fields" className="pt-6">
          <div className="rounded-md border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Start adding custom fields for your Customers and Vendors by going to Settings {">"} Preferences {">"} Customers and Vendors.
            You can also refine the address format of your Customers and Vendors from there.
          </div>
        </TabsContent>

        <TabsContent value="reporting-tags" className="pt-6">
          {reportingTagOptions.length === 0 ? (
            <div className="rounded-md border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No reporting tags found. Create tags from Settings to use them here.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {reportingTagOptions.map((tag) => (
                <label
                  key={tag._id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                >
                  <Checkbox
                    checked={reportingTags.includes(tag._id)}
                    onCheckedChange={(v) => toggleReportingTag(tag._id, Boolean(v))}
                  />
                  <span className="text-sm">{tag.name}</span>
                </label>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="remarks" className="pt-6">
          <Row label="Remarks">
            <Textarea
              className="min-h-[120px] max-w-[760px]"
              placeholder="Remarks (For Internal Use)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Row>
        </TabsContent>
      </Tabs>

      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button onClick={() => void handleSave()} disabled={saving || documentUploading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isEdit ? "Save Changes" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          Customer form is linked with opening balance reports and chart of accounts.
        </div>
      </div>
    </div>
  );
}
