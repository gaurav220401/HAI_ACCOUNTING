"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Copy, ChevronDown, ChevronUp,
  Upload, FileText, X as XIcon, Loader2, Globe, ExternalLink, RefreshCw,
  Settings, Lock, Save,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { LinkField } from "@/components/link-field";

import {
  contactApi,
  type CreateContactInput,
  type ContactPerson,
  type Address,
  type BankDetail,
  type ContactDocument,
  type GstinLookupResult,
} from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { settingsApi, type PaymentTerms } from "@/lib/api/settings";
import { apiFetch } from "@/lib/api/client";

// ─── Constants ────────────────────────────────────────────────────────────────

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
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const MAX_DOCUMENTS = 10;

// Standard Indian TDS categories
const TDS_CATEGORIES = [
  { id: "comm-2",         label: "Commission or Brokerage",                    rate: 2    },
  { id: "comm-r-3.75",   label: "Commission or Brokerage (Reduced)",           rate: 3.75 },
  { id: "div-10",        label: "Dividend",                                    rate: 10   },
  { id: "div-r-7.5",     label: "Dividend (Reduced)",                          rate: 7.5  },
  { id: "int-10",        label: "Other Interest than securities",              rate: 10   },
  { id: "int-r-7.5",     label: "Other Interest than securities (Reduced)",    rate: 7.5  },
  { id: "con-oth-2",     label: "Payment of contractors for Others",           rate: 2    },
  { id: "con-oth-r-1.5", label: "Payment of contractors for Others (Reduced)", rate: 1.5  },
  { id: "con-ind-1",     label: "Payment of contractors HUF/Indiv",            rate: 1    },
  { id: "con-ind-r-0.75",label: "Payment of contractors HUF/Indiv (Reduced)", rate: 0.75 },
  { id: "prof-10",       label: "Professional Fees",                           rate: 10   },
  { id: "prof-r-7.5",    label: "Professional Fees (Reduced)",                 rate: 7.5  },
  { id: "rent-10",       label: "Rent on land or furniture etc",               rate: 10   },
  { id: "rent-r-7.5",    label: "Rent on land or furniture etc (Reduced)",     rate: 7.5  },
  { id: "tech-2",        label: "Technical Fees (2%)",                         rate: 2    },
] as const;
const MAX_DOC_SIZE_MB = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorFormProps {
  initialData?: {
    _id: string;
    salutation?: string;
    firstName?: string;
    lastName?: string;
    displayName: string;
    companyName?: string;
    gstin?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    language?: string;
    pan?: string;
    msmeRegistered?: boolean;
    currency?: string;
    accountsPayableId?: string;
    openingBalance?: number;
    paymentTermsId?: string;
    tdsCategory?: string;
    portalEnabled?: boolean;
    billingAddress?: Address;
    shippingAddress?: Address;
    contactPersons?: ContactPerson[];
    bankDetails?: BankDetail[];
    reportingTags?: string[];
    notes?: string;
    // Extra / social
    websiteUrl?: string;
    department?: string;
    designation?: string;
    twitterHandle?: string;
    skypeName?: string;
    facebookUrl?: string;
    // Documents
    documents?: ContactDocument[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Empty defaults ───────────────────────────────────────────────────────────

const emptyAddress = (): Address => ({
  attention: "", street: "", street2: "", city: "", state: "", zip: "", country: "India", phone: "", fax: "",
});

const emptyContactPerson = (): ContactPerson => ({
  salutation: "", firstName: "", lastName: "", name: "", email: "", workPhone: "", mobile: "", isPrimary: false,
});

const emptyBankDetail = (): BankDetail => ({
  bankName: "", accountNumber: "", accountHolderName: "", ifscCode: "", branchName: "", upiId: "", isPrimary: false,
});

// ─── Helper: derive display name ─────────────────────────────────────────────

function deriveDisplayName(salutation: string, firstName: string, lastName: string, companyName: string): string {
  // Company name is the primary default display name
  if (companyName) return companyName;
  const personal = [salutation, firstName, lastName].filter(Boolean).join(" ");
  return personal || "";
}

/** Generate 4-5 display name suggestions from name parts. Company name is shown first. */
function generateDisplayNameSuggestions(salutation: string, firstName: string, lastName: string, companyName: string): string[] {
  const suggestions: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => { const t = s.trim(); if (t && !seen.has(t)) { seen.add(t); suggestions.push(t); } };

  // 1. Company name first (primary suggestion)
  if (companyName) add(companyName);
  // 2. Full personal name with company
  const personalFull = [salutation, firstName, lastName].filter(Boolean).join(" ");
  if (personalFull && companyName) add(`${personalFull} (${companyName})`);
  // 3. First Last
  const firstLast = [firstName, lastName].filter(Boolean).join(" ");
  if (firstLast) add(firstLast);
  // 4. Salutation + First Last
  if (salutation && firstLast) add(`${salutation} ${firstLast}`);
  // 5. LastName, FirstName
  if (firstName && lastName) add(`${lastName}, ${firstName}`);

  return suggestions.slice(0, 5);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VendorForm({ initialData }: VendorFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData?._id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Primary Contact ──────────────────────────────────────────────────────
  const [salutation, setSalutation] = useState(initialData?.salutation ?? "");
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  
  const [companyName, setCompanyName] = useState(initialData?.companyName ?? "");
  const [displayName, setDisplayName] = useState(initialData?.displayName ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [mobile, setMobile] = useState(initialData?.mobile ?? "");
  const [language, setLanguage] = useState(initialData?.language ?? "en");
  const [displayNameManual, setDisplayNameManual] = useState(() => {
    if (!initialData) return false;
    const sal = initialData.salutation || "";
    const first = initialData.firstName || "";
    const last = initialData.lastName || "";
    const comp = initialData.companyName || "";

    const computedWithSal = deriveDisplayName(sal, first, last, comp);
    const computedWithoutSal = deriveDisplayName("", first, last, comp);
    const computedPersonalWithSal = [sal, first, last].filter(Boolean).join(" ");
    const computedPersonalWithoutSal = [first, last].filter(Boolean).join(" ");
    const computedCompany = comp;

    const isMatched =
      initialData.displayName?.trim() === computedWithSal.trim() ||
      initialData.displayName?.trim() === computedWithoutSal.trim() ||
      initialData.displayName?.trim() === computedPersonalWithSal.trim() ||
      initialData.displayName?.trim() === computedPersonalWithoutSal.trim() ||
      initialData.displayName?.trim() === computedCompany.trim() ||
      !initialData.displayName?.trim();

    return !isMatched;
  });
  const [displayNameFocused, setDisplayNameFocused] = useState(false);
  const displayNameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initialData) {
      const searchParams = new URLSearchParams(window.location.search);
      const initialName = searchParams.get("name") || "";
      if (initialName) {
        setCompanyName(initialName);
        setDisplayName(initialName);
        setDisplayNameManual(true);
      }
    }
  }, [initialData]);

  // ── GSTIN Prefill Dialog ─────────────────────────────────────────────────
  const [gstinDialogOpen, setGstinDialogOpen] = useState(false);
  const [gstinInput, setGstinInput] = useState("");
  const [gstinFetching, setGstinFetching] = useState(false);
  const [gstinResult, setGstinResult] = useState<GstinLookupResult | null>(null);
  const [gstinSource, setGstinSource] = useState<"gst-portal" | "local-parse" | null>(null);
  const [selectedAddressIdx, setSelectedAddressIdx] = useState<number>(0);
  // Captcha
  const [captchaImage, setCaptchaImage] = useState<string | null>(null);
  const [captchaCookieState, setCaptchaCookieState] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // ── Other Details ────────────────────────────────────────────────────────
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);
  const [gstin, setGstin] = useState(initialData?.gstin ?? "");
  const [pan, setPan] = useState(initialData?.pan ?? "");
  const [msmeRegistered, setMsmeRegistered] = useState(initialData?.msmeRegistered ?? false);
  const [currency, setCurrency] = useState(initialData?.currency ?? "INR");
  const [accountsPayableId, setAccountsPayableId] = useState(initialData?.accountsPayableId ?? "");
  const [openingBalance, setOpeningBalance] = useState<string>(initialData?.openingBalance?.toString() ?? "");
  const [paymentTermsId, setPaymentTermsId] = useState(initialData?.paymentTermsId ?? "");
  const [tdsCategory, setTdsCategory] = useState(initialData?.tdsCategory ?? "");
  const [portalEnabled, setPortalEnabled] = useState(initialData?.portalEnabled ?? false);

  // ── "Add more details" ────────────────────────────────────────────────────
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl ?? "");
  const [department, setDepartment] = useState(initialData?.department ?? "");
  const [designation, setDesignation] = useState(initialData?.designation ?? "");
  const [twitterHandle, setTwitterHandle] = useState(initialData?.twitterHandle ?? "");
  const [skypeName, setSkypeName] = useState(initialData?.skypeName ?? "");
  const [facebookUrl, setFacebookUrl] = useState(initialData?.facebookUrl ?? "");

  // ── Address ──────────────────────────────────────────────────────────────
  const [billingAddress, setBillingAddress] = useState<Address>(initialData?.billingAddress ?? emptyAddress());
  const [shippingAddress, setShippingAddress] = useState<Address>(initialData?.shippingAddress ?? emptyAddress());

  // ── Contact Persons ──────────────────────────────────────────────────────
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>(
    initialData?.contactPersons?.length ? initialData.contactPersons : [emptyContactPerson()]
  );

  // ── Bank Details ─────────────────────────────────────────────────────────
  const [bankDetails, setBankDetails] = useState<BankDetail[]>(initialData?.bankDetails ?? []);
  // parallel array to track "re-enter account number" for each bank entry (not persisted)
  const [reenterAccountNumbers, setReenterAccountNumbers] = useState<string[]>(
    () => (initialData?.bankDetails ?? []).map(() => "")
  );
  const [sectionSaving, setSectionSaving] = useState(false);

  // ── Documents ────────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<ContactDocument[]>(initialData?.documents ?? []);
  const [documentUploading, setDocumentUploading] = useState(false);

  // ── Remarks ──────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  // ── Reference data ───────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Configure Terms dialog ───────────────────────────────────────────────
  const [configTermsOpen, setConfigTermsOpen] = useState(false);
  const [termName, setTermName] = useState("");
  const [termDays, setTermDays] = useState("");
  const [termType, setTermType] = useState<"net_days" | "end_of_month" | "end_of_next_month">("net_days");
  const [termAddingNew, setTermAddingNew] = useState(false);
  const [termSaving, setTermSaving] = useState(false);

  async function refreshTerms() {
    try { const r = await settingsApi.paymentTerms.list(); setPaymentTermsList(r.data ?? []); } catch {}
  }

  function openConfigTerms() {
    setTermName(""); setTermDays(""); setTermType("net_days"); setTermAddingNew(false);
    setConfigTermsOpen(true);
  }

  async function handleSaveTerm() {
    const name = termName.trim();
    if (!name) { toast.error("Term name is required"); return; }
    const netDays = termType === "net_days" ? Number(termDays) : 0;
    if (termType === "net_days" && (isNaN(netDays) || netDays < 0)) {
      toast.error("Enter valid days (0 or more)"); return;
    }
    setTermSaving(true);
    try {
      await settingsApi.paymentTerms.create({ name, termType, netDays, discountPercentage: 0, discountDays: 0, isActive: true } as any);
      toast.success(`“${name}” added`);
      setTermName(""); setTermDays(""); setTermType("net_days"); setTermAddingNew(false);
      await refreshTerms();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save term");
    } finally { setTermSaving(false); }
  }

  async function handleDeleteTerm(id: string, name: string) {
    if (!confirm(`Delete “${name}”?`)) return;
    try {
      await settingsApi.paymentTerms.remove(id);
      toast.success(`“${name}” deleted`);
      if (paymentTermsId === id) setPaymentTermsId("");
      await refreshTerms();
    } catch (e: any) { toast.error(e?.message ?? "Failed to delete"); }
  }

  async function handleSetDefault(id: string) {
    try {
      await settingsApi.paymentTerms.setDefault(id);
      await refreshTerms();
      toast.success("Default payment term set");
    } catch (e: any) { toast.error(e?.message ?? "Failed to update default"); }
  }

  async function handleUnsetDefault() {
    try {
      await settingsApi.paymentTerms.unsetDefault();
      await refreshTerms();
      toast.success("Default removed");
    } catch (e: any) { toast.error(e?.message ?? "Failed to clear default"); }
  }

  // fetch reference data
  useEffect(() => {
    setLoadingDropdowns(true);
    Promise.all([
      accountApi.list({ accountType: "Accounts Payable", excludeGroups: true }).catch(() => ({ data: [] })),
      settingsApi.paymentTerms.list().catch(() => ({ data: [] }))
    ])
      .then(([accountsRes, paymentTermsRes]) => {
        setAccounts(accountsRes.data ?? []);
        setPaymentTermsList(paymentTermsRes.data ?? []);
      })
      .finally(() => {
        setLoadingDropdowns(false);
      });
  }, []);

  // Auto-derive displayName if not manually edited
  useEffect(() => {
    if (!displayNameManual) {
      const derived = deriveDisplayName(salutation, firstName, lastName, companyName);
      if (derived) setDisplayName(derived);
    }
  }, [salutation, firstName, lastName, companyName, displayNameManual]);

  // Expand "more details" if any social field is pre-filled (edit mode)
  useEffect(() => {
    if (isEdit && (
      initialData?.websiteUrl || initialData?.department || initialData?.designation ||
      initialData?.twitterHandle || initialData?.skypeName || initialData?.facebookUrl
    )) {
      setShowMoreDetails(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GSTIN Handlers ────────────────────────────────────────────────────────

  async function fetchCaptcha() {
    setCaptchaLoading(true);
    setCaptchaImage(null);
    setCaptchaCookieState("");
    setCaptchaInput("");
    try {
      const res = await (contactApi.getGstinCaptcha() as any);
      const d = res?.data ?? res;
      if (d?.captchaImage) {
        setCaptchaImage(d.captchaImage);
        setCaptchaCookieState(d.captchaCookie ?? "");
      } else {
        toast.error("Failed to load CAPTCHA. Please try again.");
      }
    } catch {
      toast.error("Failed to load CAPTCHA from GST portal.");
    } finally {
      setCaptchaLoading(false);
    }
  }

  function openGstinDialog() {
    setGstinInput(gstin || "");
    setGstinResult(null);
    setGstinSource(null);
    setSelectedAddressIdx(0);
    setCaptchaInput("");
    setGstinDialogOpen(true);
  }

  // Auto-fetch captcha whenever the dialog opens
  useEffect(() => {
    if (gstinDialogOpen) { fetchCaptcha(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstinDialogOpen]);

  async function handleFetchGstin() {
    const val = gstinInput.trim().toUpperCase();
    if (!GSTIN_REGEX.test(val)) {
      toast.error("Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)");
      return;
    }
    if (!captchaInput.trim()) {
      toast.error("Please enter the captcha text shown in the image");
      return;
    }
    setGstinFetching(true);
    try {
      const res = await (contactApi.lookupGstin(val, captchaInput.trim(), captchaCookieState) as any);
      if (res?.errorCode === "INVALID_CAPTCHA") {
        toast.error(res.message ?? "Incorrect captcha. Please refresh and try again.");
        fetchCaptcha();
        return;
      }
      if (res?.errorCode === "INVALID_GSTIN") {
        toast.error(res.message ?? "GSTIN not found in GST portal.");
        return;
      }
      setGstinResult(res.data);
      setGstinSource(res.source);
      setSelectedAddressIdx(0);
    } catch (err: any) {
      const msg = (err?.message ?? "Failed to fetch GSTIN details") as string;
      if (msg.toLowerCase().includes("captcha")) {
        toast.error("Incorrect captcha. Please refresh and try again.");
        fetchCaptcha();
      } else {
        toast.error(msg);
      }
    } finally {
      setGstinFetching(false);
    }
  }

  function handlePrefillDetails() {
    if (!gstinResult) return;

    const allAddresses = [gstinResult.address, ...gstinResult.additionalAddresses];
    const chosenAddr = allAddresses[selectedAddressIdx] ?? gstinResult.address;

    // ── Basic info ────────────────────────────────────────────────────
    const name = gstinResult.companyName || gstinResult.legalName;
    if (name) {
      setCompanyName(name);
      setDisplayName(name);
      setDisplayNameManual(true);
    }

    // ── Other Details tab ─────────────────────────────────────────────
    setGstin(gstinResult.gstin);
    if (gstinResult.pan) setPan(gstinResult.pan);

    // ── Billing Address — fill every sub-field ────────────────────────
    if (chosenAddr) {
      setBillingAddress((prev) => ({
        attention: chosenAddr.attention || name || prev.attention || "",
        street:    chosenAddr.street   || prev.street   || "",
        street2:   chosenAddr.street2  || prev.street2  || "",
        city:      chosenAddr.city     || prev.city     || "",
        // Ensure the state value matches one of the INDIAN_STATES list items
        state:     chosenAddr.state    || gstinResult.state || prev.state || "",
        zip:       chosenAddr.zip      || prev.zip      || "",
        country:   chosenAddr.country  || "India",
        phone:     prev.phone  || "",
        fax:       prev.fax    || "",
      }));
    }

    // ── Notes: append nature of business if portal gave us that ───────
    if (gstinResult.naturalBusinessActivities?.length > 0) {
      const nba = gstinResult.naturalBusinessActivities.join(", ");
      setNotes((prev) => {
        const tag = `Nature of Business: ${nba}`;
        return prev ? `${prev}\n${tag}` : tag;
      });
    }

    setGstinDialogOpen(false);

    // Build a summary of what was filled
    const filled: string[] = [];
    if (name) filled.push("Company Name");
    if (gstinResult.pan) filled.push("PAN");
    if (chosenAddr?.city || chosenAddr?.state) filled.push("Billing Address");
    if (gstinResult.naturalBusinessActivities?.length) filled.push("Notes");
    toast.success(
      filled.length
        ? `Prefilled: ${filled.join(", ")}`
        : "GSTIN verified — no additional data available from portal",
    );
  }

  // ── Document Handlers ─────────────────────────────────────────────────────

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    if (documents.length + files.length > MAX_DOCUMENTS) {
      toast.error(`Maximum ${MAX_DOCUMENTS} documents allowed`);
      return;
    }
    const oversized = files.find((f) => f.size > MAX_DOC_SIZE_MB * 1024 * 1024);
    if (oversized) {
      toast.error(`"${oversized.name}" exceeds ${MAX_DOC_SIZE_MB}MB limit`);
      return;
    }

    setDocumentUploading(true);
    const uploaded: ContactDocument[] = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
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
        toast.error(`Failed to upload "${file.name}"`);
      }
    }
    if (uploaded.length) {
      setDocuments((prev) => [...prev, ...uploaded]);
      toast.success(`${uploaded.length} file(s) uploaded`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDocumentUploading(false);
  }

  async function handleRemoveDocument(idx: number) {
    const doc = documents[idx];
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
    try {
      await apiFetch(`/upload?publicId=${encodeURIComponent(doc.publicId)}`, { method: "DELETE" });
    } catch { /* best effort */ }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function copyBillingToShipping() {
    setShippingAddress({ ...billingAddress });
  }

  function updateBilling(field: keyof Address, value: string) {
    setBillingAddress((prev) => ({ ...prev, [field]: value }));
  }

  function updateShipping(field: keyof Address, value: string) {
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
  }

  function updateContactPerson(idx: number, field: keyof ContactPerson, value: string | boolean) {
    setContactPersons((prev) => {
      const next = [...prev];
      const person = { ...next[idx] };
      (person as any)[field] = value;
      // keep the `name` field in sync
      person.name = [person.firstName, person.lastName].filter(Boolean).join(" ") || "Contact";
      next[idx] = person;
      return next;
    });
  }

  function addContactPerson() {
    setContactPersons((prev) => [...prev, emptyContactPerson()]);
  }

  function removeContactPerson(idx: number) {
    setContactPersons((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateBankDetail(idx: number, field: keyof BankDetail, value: string | boolean) {
    setBankDetails((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  function addBankDetail() {
    setBankDetails((prev) => [...prev, emptyBankDetail()]);
    setReenterAccountNumbers((prev) => [...prev, ""]);
  }

  function removeBankDetail(idx: number) {
    setBankDetails((prev) => prev.filter((_, i) => i !== idx));
    setReenterAccountNumbers((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Build the full vendor payload ─────────────────────────────────────────
  function buildPayload(): CreateContactInput {
    return {
      contactType: "Vendor",
      salutation,
      firstName,
      lastName,
      displayName: displayName.trim(),
      companyName,
      gstin: gstin.trim().toUpperCase(),
      email,
      phone,
      mobile,
      language,
      pan: pan.toUpperCase(),
      msmeRegistered,
      currency,
      accountsPayableId: accountsPayableId || undefined,
      openingBalance: openingBalance ? parseFloat(openingBalance) : 0,
      paymentTermsId: paymentTermsId || undefined,
      tdsCategory,
      portalEnabled,
      billingAddress,
      shippingAddress,
      contactPersons: contactPersons.filter((cp) => cp.firstName || cp.lastName || cp.name),
      bankDetails: bankDetails.filter((bd) => bd.bankName || bd.accountNumber),
      notes,
      websiteUrl,
      department,
      designation,
      twitterHandle,
      skypeName,
      facebookUrl,
      documents,
    };
  }

  // ── Save a single contact-person row ──────────────────────────────────────
  async function handleSaveContactPerson(idx: number) {
    if (!isEdit || !initialData?._id) {
      toast.info("Contact person will be saved when you save the vendor");
      return;
    }
    setSectionSaving(true);
    try {
      await contactApi.update(initialData._id, buildPayload());
      toast.success("Contact person saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save contact person");
    } finally {
      setSectionSaving(false);
    }
  }

  // ── Save a single bank-detail card ────────────────────────────────────────
  async function handleSaveBankDetail(idx: number) {
    if (!isEdit || !initialData?._id) {
      toast.info("Bank detail will be saved when you save the vendor");
      return;
    }
    const bd = bankDetails[idx];
    if (bd.accountNumber && reenterAccountNumbers[idx] !== bd.accountNumber) {
      toast.error("Account numbers do not match");
      return;
    }
    if (!bd.accountNumber) {
      toast.error("Account Number is required");
      return;
    }
    if (!bd.ifscCode) {
      toast.error("IFSC Code is required");
      return;
    }
    setSectionSaving(true);
    try {
      await contactApi.update(initialData._id, buildPayload());
      toast.success("Bank detail saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save bank detail");
    } finally {
      setSectionSaving(false);
    }
  }

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display Name is required");
      return;
    }

    const payload = buildPayload();

    setSaving(true);
    try {
      let createdContactId = "";
      if (isEdit && initialData?._id) {
        await contactApi.update(initialData._id, payload);
        toast.success("Vendor updated");
      } else {
        const res = await contactApi.create(payload);
        createdContactId = res.data?._id || "";
        toast.success("Vendor created");
      }

      const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const redirectUrl = searchParams?.get("redirect");
      if (redirectUrl) {
        const url = new URL(redirectUrl, window.location.origin);
        if (createdContactId) {
          url.searchParams.set("newVendorId", createdContactId);
        }
        router.push(url.pathname + url.search);
      } else {
        router.push("/purchases/vendors");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white min-h-full flex flex-col overflow-y-auto flex-1 min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-white sticky top-0 z-10">
        <div>
          <p className="text-[11px] font-medium text-teal-700 mb-0.5">Purchases</p>
          <h1 className="text-lg font-bold text-slate-900 leading-none">{isEdit ? "Edit Vendor" : "New Vendor"}</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-8 px-4 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md text-sm font-medium transition-colors cursor-pointer"
            onClick={() => {
              const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
              const redirectUrl = searchParams?.get("redirect");
              if (redirectUrl) {
                router.push(redirectUrl);
              } else {
                router.push("/purchases/vendors");
              }
            }}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-8 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md text-sm transition-colors cursor-pointer"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</span> : "Save"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-5 w-full max-w-6xl mr-auto space-y-5">

        {/* ── GSTIN Prefill Banner ── */}
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span>Prefill Vendor details from the GST portal using the Vendor&apos;s GSTIN.</span>
          <button
            type="button"
            className="ml-1 font-semibold underline underline-offset-2 hover:text-amber-950 flex items-center gap-0.5"
            onClick={openGstinDialog}
          >
            Prefill <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        {/* ── Primary Contact & Basic Info ── */}
        <div className="grid grid-cols-[180px_1fr] items-start gap-x-6 gap-y-3">

          {/* Salutation + First Name + Last Name */}
          <label className="text-sm font-medium text-muted-foreground pt-2">Primary Contact</label>
          <div className="flex gap-2">
            <Select value={salutation || "__none"} onValueChange={(v) => setSalutation(v === "__none" ? "" : v)}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Salutation" />
              </SelectTrigger>
              <SelectContent>
                {SALUTATIONS.map((s) => (
                  <SelectItem key={s || "__none"} value={s || "__none"}>
                    {s || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="First Name"
              className="flex-1 h-9"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              placeholder="Last Name"
              className="flex-1 h-9"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          {/* Company Name */}
          <label className="text-sm font-medium text-muted-foreground pt-2">Company Name</label>
          <Input
            placeholder="Company Name"
            className="h-9"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />

          {/* Display Name */}
          <label className="text-sm font-medium text-muted-foreground pt-2">
            Display Name <span className="text-destructive">*</span>
          </label>
          <div className="relative" ref={displayNameRef}>
            <Input
              placeholder="Select or type to add"
              className="h-9"
              value={displayName}
              onChange={(e) => {
                const val = e.target.value;
                setDisplayName(val);
                if (!val.trim()) {
                  setDisplayNameManual(false);
                } else {
                  setDisplayNameManual(true);
                }
              }}
              onFocus={(e) => {
                setDisplayNameFocused(true);
                const target = e.target;
                setTimeout(() => {
                  try { target.select(); } catch {}
                }, 50);
              }}
              onBlur={() => setTimeout(() => setDisplayNameFocused(false), 200)}
            />
            {displayNameFocused && (() => {
              const suggestions = generateDisplayNameSuggestions(salutation, firstName, lastName, companyName);
              return suggestions.length > 0 ? (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-teal-50 hover:text-teal-700 transition-colors ${
                        i === 0 ? "font-medium text-teal-700 bg-teal-50/50" : "text-foreground"
                      } ${displayName === s ? "bg-teal-50 text-teal-700" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        setDisplayName(s);
                        setDisplayNameManual(true);
                        setDisplayNameFocused(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>

          {/* Email */}
          <label className="text-sm font-medium text-muted-foreground pt-2">Email Address</label>
          <Input
            type="email"
            placeholder="vendor@example.com"
            className="h-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {/* Phone */}
          <label className="text-sm font-medium text-muted-foreground pt-2">Phone</label>
          <div className="flex gap-2">
            <div className="flex rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring h-9 flex-1">
              <span className="flex items-center px-2.5 text-xs text-muted-foreground bg-muted border-r border-input select-none">+91</span>
              <input
                type="tel"
                placeholder="Work Phone"
                className="flex-1 px-2.5 text-sm bg-background outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="flex rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring h-9 flex-1">
              <span className="flex items-center px-2.5 text-xs text-muted-foreground bg-muted border-r border-input select-none">+91</span>
              <input
                type="tel"
                placeholder="Mobile"
                className="flex-1 px-2.5 text-sm bg-background outline-none"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </div>
          </div>

          {/* Vendor Language */}
          <label className="text-sm font-medium text-muted-foreground pt-2">Vendor Language</label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-56 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* ── "Add more details" toggle ── */}
          <div className="col-span-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setShowMoreDetails((v) => !v)}
            >
              {showMoreDetails
                ? <ChevronUp className="h-3.5 w-3.5" />
                : <ChevronDown className="h-3.5 w-3.5" />}
              {showMoreDetails ? "Hide extra details" : "Add more details"}
            </button>

            {showMoreDetails && (
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border rounded-lg p-3 bg-muted/20">
                {/* Website URL */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                    <Globe className="h-3 w-3" />Website URL
                  </Label>
                  <Input className="h-8 text-sm" placeholder="ex: www.example.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
                </div>

                {/* Department */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Department</Label>
                  <Input className="h-8 text-sm" placeholder="e.g. Procurement" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </div>

                {/* Designation */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Designation</Label>
                  <Input className="h-8 text-sm" placeholder="e.g. Manager" value={designation} onChange={(e) => setDesignation(e.target.value)} />
                </div>

                {/* X / Twitter */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">X (Twitter)</Label>
                  <div className="flex h-8">
                    <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-muted text-muted-foreground font-bold">𝕏</span>
                    <Input className="rounded-l-none h-8 text-sm" placeholder="username" value={twitterHandle} onChange={(e) => setTwitterHandle(e.target.value)} />
                  </div>
                </div>

                {/* Skype */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Skype Name / Number</Label>
                  <div className="flex h-8">
                    <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-[#00aff0] text-white font-bold">S</span>
                    <Input className="rounded-l-none h-8 text-sm" placeholder="Skype name or number" value={skypeName} onChange={(e) => setSkypeName(e.target.value)} />
                  </div>
                </div>

                {/* Facebook */}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Facebook</Label>
                  <div className="flex h-8">
                    <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-[#1877f2] text-white font-bold">f</span>
                    <Input className="rounded-l-none h-8 text-sm" placeholder="profile URL or username" value={facebookUrl} onChange={(e) => setFacebookUrl(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="other-details" className="w-full">
          <TabsList className="border-b w-full justify-start rounded-none bg-transparent px-0 h-auto gap-0">
            {[
              { value: "other-details", label: "Other Details" },
              { value: "address", label: "Address" },
              { value: "contact-persons", label: "Contact Persons" },
              { value: "bank-details", label: "Bank Details" },
              { value: "reporting-tags", label: "Reporting Tags" },
              { value: "remarks", label: "Remarks" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-1.5 text-sm font-medium"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ─── Other Details ─────────────────────────────────────────────── */}
          <TabsContent value="other-details" className="pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {/* GSTIN */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">GSTIN / UIN</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="22AAAAA0000A1Z5"
                    className="uppercase font-mono h-9 text-sm"
                    value={gstin}
                    maxLength={15}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0 h-9" onClick={openGstinDialog}>
                    Verify &amp; Prefill
                  </Button>
                </div>
              </div>

              {/* PAN */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">PAN</Label>
                <Input
                  placeholder="ABCDE1234F"
                  className="h-9 text-sm"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>

              {/* MSME */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">MSME Registered?</Label>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox
                    id="msme"
                    checked={msmeRegistered}
                    onCheckedChange={(v) => setMsmeRegistered(Boolean(v))}
                  />
                  <label htmlFor="msme" className="text-sm cursor-pointer">
                    This vendor is MSME registered
                  </label>
                </div>
              </div>

              {/* Currency */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Accounts Payable */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Accounts Payable</Label>
                {loadingDropdowns ? (
                  <div className="h-9 w-full bg-slate-100 rounded-md animate-pulse border border-slate-200" />
                ) : (
                  <LinkField
                    value={accountsPayableId}
                    onChange={setAccountsPayableId}
                    staticOptions={accounts.map((a) => ({
                      value: a._id,
                      label: a.name,
                    }))}
                    placeholder="Select an account"
                    clearable={true}
                    triggerClassName="h-9 text-sm"
                  />
                )}
              </div>

              {/* Opening Balance */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Opening Balance</Label>
                <div className="flex h-9">
                  <span className="flex items-center px-3 text-sm border rounded-l-md bg-muted text-muted-foreground border-r-0">
                    {currency}
                  </span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="rounded-l-none h-9 text-sm"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment Terms */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Payment Terms</Label>
                {loadingDropdowns ? (
                  <div className="h-9 w-full bg-slate-100 rounded-md animate-pulse border border-slate-200" />
                ) : (
                  <Select value={paymentTermsId || "__none"} onValueChange={(v) => setPaymentTermsId(v === "__none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select payment terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Due on Receipt</SelectItem>
                      {paymentTermsList.map((pt) => (
                        <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>
                      ))}
                      <div className="border-t mt-1 pt-1">
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 px-2 py-1.5 text-sm text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-sm"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => openConfigTerms()}
                        >
                          <Settings className="h-3.5 w-3.5" />
                          Configure Terms
                        </button>
                      </div>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* TDS */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">TDS</Label>
                <Select value={tdsCategory || "__none"} onValueChange={(v) => setTdsCategory(v === "__none" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select TDS category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {TDS_CATEGORIES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}&nbsp;
                        <span className="text-muted-foreground">[{t.rate}%]</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tdsCategory && tdsCategory !== "__none" && (() => {
                  const cat = TDS_CATEGORIES.find((c) => c.id === tdsCategory);
                  return cat ? (
                    <p className="text-xs text-muted-foreground">
                      Rate: <span className="font-medium">{cat.rate}%</span> · {cat.label}
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Enable Portal */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Enable Portal?</Label>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox
                    id="portal"
                    checked={portalEnabled}
                    onCheckedChange={(v) => setPortalEnabled(Boolean(v))}
                  />
                  <label htmlFor="portal" className="text-sm cursor-pointer">
                    Allow portal access for this vendor
                  </label>
                </div>
              </div>
            </div>

            {/* ── Documents Section ── */}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Documents</Label>
                <span className="text-xs text-muted-foreground">
                  {documents.length}/{MAX_DOCUMENTS} files · max {MAX_DOC_SIZE_MB}MB each
                </span>
              </div>

              {documents.length > 0 && (
                <div className="space-y-2">
                  {documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 bg-background"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate block hover:underline text-primary"
                        >
                          {doc.name}
                        </a>
                        {doc.size && (
                          <span className="text-xs text-muted-foreground">{formatBytes(doc.size)}</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleRemoveDocument(idx)}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={documentUploading || documents.length >= MAX_DOCUMENTS}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {documentUploading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</>
                    : <><Upload className="h-4 w-4 mr-2" />Upload File</>}
                </Button>
                <span className="text-xs text-muted-foreground">
                  You can upload a maximum of {MAX_DOCUMENTS} files, {MAX_DOC_SIZE_MB}MB each
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={handleDocumentUpload}
              />
            </div>
          </TabsContent>

          {/* ─── Address ────────────────────────────────────────────────────── */}
          <TabsContent value="address" className="pt-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-0">
              {/* Billing Address */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Billing Address</h3>
                <AddressFields address={billingAddress} onChange={updateBilling} />
              </div>

              {/* Shipping Address */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Shipping Address</h3>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-xs h-auto p-0 text-primary"
                    onClick={copyBillingToShipping}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy billing address
                  </Button>
                </div>
                <AddressFields address={shippingAddress} onChange={updateShipping} />
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Add and manage additional addresses from the Vendor&apos;s details page.
            </p>
          </TabsContent>

          {/* ─── Contact Persons ─────────────────────────────────────────────── */}
          <TabsContent value="contact-persons" className="pt-4">
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs uppercase font-semibold">Salutation</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">First Name</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Last Name</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Email Address</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Work Phone</TableHead>
                    <TableHead className="text-xs uppercase font-semibold">Mobile</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactPersons.map((cp, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="py-2 pr-2">
                        <Select
                          value={cp.salutation || "__none"}
                          onValueChange={(v) => updateContactPerson(idx, "salutation", v === "__none" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SALUTATIONS.map((s) => (
                              <SelectItem key={s || "__none"} value={s || "__none"}>{s || "—"}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <Input
                          className="h-8"
                          value={cp.firstName ?? ""}
                          onChange={(e) => updateContactPerson(idx, "firstName", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <Input
                          className="h-8"
                          value={cp.lastName ?? ""}
                          onChange={(e) => updateContactPerson(idx, "lastName", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <Input
                          className="h-8"
                          type="email"
                          value={cp.email ?? ""}
                          onChange={(e) => updateContactPerson(idx, "email", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <div className="flex h-8 rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                          <span className="flex items-center px-2 text-xs text-muted-foreground bg-muted border-r border-input select-none whitespace-nowrap">+91</span>
                          <input
                            type="tel"
                            className="flex-1 px-2 text-sm bg-background outline-none"
                            value={cp.workPhone ?? ""}
                            onChange={(e) => updateContactPerson(idx, "workPhone", e.target.value)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <div className="flex h-8 rounded-md border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                          <span className="flex items-center px-2 text-xs text-muted-foreground bg-muted border-r border-input select-none whitespace-nowrap">+91</span>
                          <input
                            type="tel"
                            className="flex-1 px-2 text-sm bg-background outline-none"
                            value={cp.mobile ?? ""}
                            onChange={(e) => updateContactPerson(idx, "mobile", e.target.value)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Save contact person"
                            disabled={sectionSaving}
                            onClick={() => handleSaveContactPerson(idx)}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeContactPerson(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={addContactPerson}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Contact Person
            </Button>
          </TabsContent>

          {/* ─── Bank Details ─────────────────────────────────────────────────── */}
          <TabsContent value="bank-details" className="pt-4 space-y-3">
            {bankDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bank details added yet.</p>
            ) : (
              bankDetails.map((bd, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeBankDetail(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Bank Name</Label>
                      <Input className="h-9 text-sm" value={bd.bankName ?? ""} onChange={(e) => updateBankDetail(idx, "bankName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Account Number <span className="text-destructive">*</span></Label>
                      <Input className="h-9 text-sm" value={bd.accountNumber ?? ""} onChange={(e) => updateBankDetail(idx, "accountNumber", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Re-enter Account Number <span className="text-destructive">*</span></Label>
                      <Input
                        className={`h-9 text-sm${reenterAccountNumbers[idx] && reenterAccountNumbers[idx] !== bd.accountNumber ? " border-destructive focus-visible:ring-destructive" : ""}`}
                        value={reenterAccountNumbers[idx] ?? ""}
                        onChange={(e) => setReenterAccountNumbers((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value;
                          return next;
                        })}
                        placeholder="Re-enter account number"
                      />
                      {reenterAccountNumbers[idx] && reenterAccountNumbers[idx] !== bd.accountNumber && (
                        <p className="text-xs text-destructive">Account numbers do not match</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Account Holder Name</Label>
                      <Input className="h-9 text-sm" value={bd.accountHolderName ?? ""} onChange={(e) => updateBankDetail(idx, "accountHolderName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">IFSC Code <span className="text-destructive">*</span></Label>
                      <Input className="h-9 text-sm" value={bd.ifscCode ?? ""} onChange={(e) => updateBankDetail(idx, "ifscCode", e.target.value.toUpperCase())} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Branch Name</Label>
                      <Input className="h-9 text-sm" value={bd.branchName ?? ""} onChange={(e) => updateBankDetail(idx, "branchName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">UPI ID</Label>
                      <Input className="h-9 text-sm" value={bd.upiId ?? ""} onChange={(e) => updateBankDetail(idx, "upiId", e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`primary-bank-${idx}`}
                        checked={bd.isPrimary ?? false}
                        onCheckedChange={(v) => updateBankDetail(idx, "isPrimary", Boolean(v))}
                      />
                      <label htmlFor={`primary-bank-${idx}`} className="text-sm cursor-pointer">
                        Primary bank account
                      </label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={sectionSaving}
                      onClick={() => handleSaveBankDetail(idx)}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </Button>
                  </div>
                </div>
              ))
            )}
            <Button variant="outline" size="sm" onClick={addBankDetail}>
              <Plus className="h-4 w-4 mr-1" />
              Add Bank Account
            </Button>
          </TabsContent>

          {/* ─── Reporting Tags ───────────────────────────────────────────────── */}
          <TabsContent value="reporting-tags" className="pt-4">
            <p className="text-sm text-muted-foreground">
              Reporting tags can be configured in Settings → Reporting Tags.
            </p>
          </TabsContent>

          {/* ─── Remarks ─────────────────────────────────────────────────────── */}
          <TabsContent value="remarks" className="pt-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Remarks / Notes</Label>
              <Textarea
                rows={5}
                placeholder="Add any notes or remarks about this vendor…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ══ Configure Payment Terms Dialog ════════════════════════════════════ */}
      <Dialog open={configTermsOpen} onOpenChange={(o) => { setConfigTermsOpen(o); if (!o) { setTermAddingNew(false); setTermName(""); setTermDays(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Payment Terms</DialogTitle>
          </DialogHeader>

          {/* Terms table */}
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs font-semibold tracking-wide uppercase py-2.5">Term Name</TableHead>
                  <TableHead className="text-xs font-semibold tracking-wide uppercase py-2.5 text-right w-36">Number of Days</TableHead>
                  <TableHead className="w-[200px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentTermsList.length === 0 && !termAddingNew && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      No terms yet. Click "+ Add New" to create one.
                    </TableCell>
                  </TableRow>
                )}
                {paymentTermsList.map((pt) => (
                  <TableRow key={pt._id} className="group">
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        {pt.isPermanent && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="text-sm">{pt.name}</span>
                      </div>
                      {pt.isDefault && (
                        <Badge variant="secondary" className="ml-5 text-xs py-0">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 text-right text-sm">
                      {pt.termType === "net_days" ? pt.netDays : "N/A"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Default toggle */}
                        {pt.isDefault ? (
                          <button
                            type="button"
                            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline whitespace-nowrap"
                            onClick={() => handleUnsetDefault()}
                          >
                            Remove as Default
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-sm text-primary hover:underline whitespace-nowrap"
                            onClick={() => handleSetDefault(pt._id)}
                          >
                            Mark as Default
                          </button>
                        )}
                        {/* Delete — hidden for permanent terms */}
                        {!pt.isPermanent && (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-sm text-destructive hover:text-destructive/80"
                            onClick={() => handleDeleteTerm(pt._id, pt.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Inline Add New row */}
                {termAddingNew && (
                  <TableRow className="bg-muted/20">
                    <TableCell className="py-2">
                      <div className="space-y-1.5">
                        <Input
                          autoFocus
                          className="h-8 text-sm"
                          placeholder='e.g. "Net 90"'
                          value={termName}
                          onChange={(e) => setTermName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveTerm(); if (e.key === "Escape") setTermAddingNew(false); }}
                        />
                        <Select value={termType} onValueChange={(v) => setTermType(v as typeof termType)}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="net_days">Net Days</SelectItem>
                            <SelectItem value="end_of_month">Due end of the month</SelectItem>
                            <SelectItem value="end_of_next_month">Due end of next month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      {termType === "net_days" ? (
                        <Input
                          className="h-8 text-sm w-24 ml-auto"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={termDays}
                          onChange={(e) => setTermDays(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveTerm(); }}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground flex justify-end pt-1.5">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 align-top">
                      <div className="flex items-center gap-2 justify-end pt-1">
                        <Button size="sm" type="button" className="h-7 px-3" onClick={handleSaveTerm} disabled={termSaving}>
                          {termSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" type="button" variant="ghost" className="h-7 px-2" onClick={() => { setTermAddingNew(false); setTermName(""); setTermDays(""); }}>
                          <XIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Add New button */}
          {!termAddingNew && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 w-fit"
              onClick={() => { setTermAddingNew(true); setTermName(""); setTermDays(""); setTermType("net_days"); }}
            >
              <Plus className="h-4 w-4" />
              Add New
            </button>
          )}

          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setConfigTermsOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => setConfigTermsOpen(false)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ GSTIN Prefill Dialog ══════════════════════════════════════════════ */}
      <Dialog open={gstinDialogOpen} onOpenChange={setGstinDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prefill Vendor Details From the GST Portal</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">

            {/* GSTIN input */}
            <div className="flex flex-col gap-1.5">
              <Label>
                GSTIN / UIN <span className="text-destructive">*</span>
              </Label>
              <Input
                className="uppercase font-mono tracking-wider"
                placeholder="22AAAAA0000A1Z5"
                value={gstinInput}
                maxLength={15}
                onChange={(e) => setGstinInput(e.target.value.toUpperCase())}
              />
            </div>

            {/* Captcha section */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Captcha <span className="text-destructive">*</span></Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1.5"
                  onClick={fetchCaptcha}
                  disabled={captchaLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${captchaLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {/* Captcha image */}
              <div className="flex items-center gap-3">
                <div className="relative flex h-14 w-48 items-center justify-center rounded-md border bg-muted/30 overflow-hidden shrink-0">
                  {captchaLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : captchaImage ? (
                    <img src={captchaImage} alt="CAPTCHA" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Loading…</span>
                  )}
                </div>
                <Input
                  placeholder="Enter captcha text"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleFetchGstin(); }}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Can&apos;t read the captcha? Click &quot;Refresh&quot; to get a new one.
              </p>
            </div>

            {/* Fetch button */}
            <Button
              type="button"
              className="w-full"
              onClick={handleFetchGstin}
              disabled={gstinFetching || gstinInput.length < 15 || !captchaInput.trim() || captchaLoading}
            >
              {gstinFetching
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fetching…</>
                : "Fetch Details from GST Portal"}
            </Button>

            {/* Results */}
            {gstinResult && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                {gstinSource === "local-parse" ? (
                  <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    GST portal is currently unavailable. Showing locally-extracted data (PAN + state) from the GSTIN.
                    Please verify company details manually.
                  </div>
                ) : (
                  <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                    ✓ Data fetched from the official GST portal
                  </div>
                )}

                <h3 className="font-semibold text-sm">Business Details</h3>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {gstinResult.companyName && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Trade / Company Name</p>
                      <p className="font-semibold">{gstinResult.companyName}</p>
                      {gstinResult.legalName && gstinResult.legalName !== gstinResult.companyName && (
                        <p className="text-xs text-muted-foreground mt-0.5">Legal: {gstinResult.legalName}</p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">GSTIN Status</p>
                    {gstinResult.gstinStatus ? (
                      <Badge
                        variant={gstinResult.gstinStatus.toLowerCase() === "active" ? "default" : "destructive"}
                        className="capitalize mt-0.5"
                      >
                        {gstinResult.gstinStatus}
                      </Badge>
                    ) : <p className="text-muted-foreground">—</p>}
                  </div>
                  {gstinResult.taxpayerType && (
                    <div>
                      <p className="text-xs text-muted-foreground">Taxpayer Type</p>
                      <p>{gstinResult.taxpayerType}</p>
                    </div>
                  )}
                  {gstinResult.pan && (
                    <div>
                      <p className="text-xs text-muted-foreground">PAN</p>
                      <p className="font-mono">{gstinResult.pan}</p>
                    </div>
                  )}
                  {gstinResult.companyType && (
                    <div>
                      <p className="text-xs text-muted-foreground">Constitution</p>
                      <p>{gstinResult.companyType}</p>
                    </div>
                  )}
                  {gstinResult.eInvoiceApplicable && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">e-Invoice Applicability</p>
                      <p>{gstinResult.eInvoiceApplicable}</p>
                    </div>
                  )}
                  {gstinResult.naturalBusinessActivities?.length > 0 && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Nature of Business</p>
                      <p className="text-xs">{gstinResult.naturalBusinessActivities.join(", ")}</p>
                    </div>
                  )}
                </div>

                {/* Address selection */}
                {(() => {
                  const allAddrs = [gstinResult.address, ...gstinResult.additionalAddresses];
                  return allAddrs.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Select Address to Prefill
                      </p>
                      {allAddrs.map((addr, idx) => {
                        const addrType = idx === 0
                          ? (gstinResult.addressType || "Principal Place of Business")
                          : ((gstinResult.additionalAddresses[idx - 1] as any)?.type ?? `Address ${idx + 1}`);
                        // Prefer addressString (full string from portal) over assembled parts
                        const addrStr = idx === 0
                          ? (gstinResult.addressString || [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(", "))
                          : ((gstinResult.additionalAddresses[idx - 1] as any)?.addressString || [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(", "));
                        return (
                          <label
                            key={idx}
                            className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                              selectedAddressIdx === idx
                                ? "border-primary bg-primary/5"
                                : "border-muted hover:bg-muted/30"
                            }`}
                          >
                            <input
                              type="radio"
                              name="gstin-address"
                              value={idx}
                              checked={selectedAddressIdx === idx}
                              onChange={() => setSelectedAddressIdx(idx)}
                              className="mt-0.5 shrink-0"
                            />
                            <div className="text-sm min-w-0">
                              <p className="font-medium">{addrType}</p>
                              <p className="text-muted-foreground text-xs mt-0.5 break-words">{addrStr}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGstinDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePrefillDetails} disabled={!gstinResult}>
              Prefill Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Address Fields Sub-Component ────────────────────────────────────────────

function AddressFields({
  address,
  onChange,
}: {
  address: Address;
  onChange: (field: keyof Address, value: string) => void;
}) {
  const stateOptions = useMemo(() => {
    return INDIAN_STATES.map((s) => ({
      value: s,
      label: s,
    }));
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Attention</Label>
        <Input placeholder="Attention" className="h-8 text-sm" value={address.attention ?? ""} onChange={(e) => onChange("attention", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Country / Region</Label>
        <Input placeholder="Country / Region" className="h-8 text-sm" value={address.country ?? ""} onChange={(e) => onChange("country", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Address</Label>
        <Input placeholder="Street 1" className="h-8 text-sm" value={address.street ?? ""} onChange={(e) => onChange("street", e.target.value)} />
        <Input placeholder="Street 2" className="h-8 text-sm mt-1" value={address.street2 ?? ""} onChange={(e) => onChange("street2", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">City</Label>
        <Input placeholder="City" className="h-8 text-sm" value={address.city ?? ""} onChange={(e) => onChange("city", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">State</Label>
        <LinkField
          value={address.state || ""}
          onChange={(v) => onChange("state", v)}
          staticOptions={stateOptions}
          placeholder="Select state"
          clearable={true}
          triggerClassName="h-8 text-sm"
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Pin Code</Label>
        <Input placeholder="Pin Code" className="h-8 text-sm" value={address.zip ?? ""} onChange={(e) => onChange("zip", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Phone</Label>
        <Input placeholder="Phone" className="h-8 text-sm" value={address.phone ?? ""} onChange={(e) => onChange("phone", e.target.value)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label className="text-xs text-muted-foreground">Fax Number</Label>
        <Input placeholder="Fax Number" className="h-8 text-sm" value={address.fax ?? ""} onChange={(e) => onChange("fax", e.target.value)} />
      </div>
    </div>
  );
}
