"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { Separator } from "@/components/ui/separator";

import { contactApi, type CreateContactInput, type ContactPerson, type Address, type BankDetail } from "@/lib/api/contacts";
import { accountApi, type Account } from "@/lib/api/accounts";
import { settingsApi, type PaymentTerms, type Tax } from "@/lib/api/settings";

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorFormProps {
  initialData?: {
    _id: string;
    salutation?: string;
    firstName?: string;
    lastName?: string;
    displayName: string;
    companyName?: string;
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
  };
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
  const personal = [salutation, firstName, lastName].filter(Boolean).join(" ");
  if (personal && companyName) return `${personal} (${companyName})`;
  return personal || companyName || "";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VendorForm({ initialData }: VendorFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData?._id);

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
  const [displayNameManual, setDisplayNameManual] = useState(isEdit);

  // ── Other Details ────────────────────────────────────────────────────────
  const [pan, setPan] = useState(initialData?.pan ?? "");
  const [msmeRegistered, setMsmeRegistered] = useState(initialData?.msmeRegistered ?? false);
  const [currency, setCurrency] = useState(initialData?.currency ?? "INR");
  const [accountsPayableId, setAccountsPayableId] = useState(initialData?.accountsPayableId ?? "");
  const [openingBalance, setOpeningBalance] = useState<string>(initialData?.openingBalance?.toString() ?? "");
  const [paymentTermsId, setPaymentTermsId] = useState(initialData?.paymentTermsId ?? "");
  const [tdsCategory, setTdsCategory] = useState(initialData?.tdsCategory ?? "");
  const [portalEnabled, setPortalEnabled] = useState(initialData?.portalEnabled ?? false);

  // ── Address ──────────────────────────────────────────────────────────────
  const [billingAddress, setBillingAddress] = useState<Address>(initialData?.billingAddress ?? emptyAddress());
  const [shippingAddress, setShippingAddress] = useState<Address>(initialData?.shippingAddress ?? emptyAddress());

  // ── Contact Persons ──────────────────────────────────────────────────────
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>(
    initialData?.contactPersons?.length ? initialData.contactPersons : [emptyContactPerson()]
  );

  // ── Bank Details ─────────────────────────────────────────────────────────
  const [bankDetails, setBankDetails] = useState<BankDetail[]>(initialData?.bankDetails ?? []);

  // ── Remarks ──────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  // ── Reference data ───────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerms[]>([]);
  const [taxList, setTaxList] = useState<Tax[]>([]);
  const [saving, setSaving] = useState(false);

  // fetch reference data
  useEffect(() => {
    accountApi.list({ accountType: "Accounts Payable", excludeGroups: true })
      .then((r) => setAccounts(r.data ?? []))
      .catch(() => {});
    settingsApi.paymentTerms.list()
      .then((r) => setPaymentTermsList(r.data ?? []))
      .catch(() => {});
    settingsApi.taxes.list()
      .then((r) => setTaxList(r.data ?? []))
      .catch(() => {});
  }, []);

  // Auto-derive displayName if not manually edited
  useEffect(() => {
    if (!displayNameManual) {
      const derived = deriveDisplayName(salutation, firstName, lastName, companyName);
      if (derived) setDisplayName(derived);
    }
  }, [salutation, firstName, lastName, companyName, displayNameManual]);

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
  }

  function removeBankDetail(idx: number) {
    setBankDetails((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!displayName.trim()) {
      toast.error("Display Name is required");
      return;
    }

    const payload: CreateContactInput = {
      contactType: "Vendor",
      salutation,
      firstName,
      lastName,
      displayName: displayName.trim(),
      companyName,
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
    };

    setSaving(true);
    try {
      if (isEdit && initialData?._id) {
        await contactApi.update(initialData._id, payload);
        toast.success("Vendor updated");
      } else {
        await contactApi.create(payload);
        toast.success("Vendor created");
      }
      router.push("/purchases/vendors");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background sticky top-0 z-10">
        <h1 className="text-xl font-semibold">{isEdit ? "Edit Vendor" : "New Vendor"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/purchases/vendors")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-6 max-w-5xl space-y-6">

        {/* ── Primary Contact & Basic Info ── */}
        <div className="grid gap-4">

          {/* Salutation + First Name + Last Name */}
          <div className="flex flex-col gap-1.5">
            <Label>Primary Contact</Label>
            <div className="flex gap-2">
              <Select value={salutation} onValueChange={setSalutation}>
                <SelectTrigger className="w-32">
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
                className="flex-1"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                placeholder="Last Name"
                className="flex-1"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          {/* Company Name */}
          <div className="flex flex-col gap-1.5">
            <Label>Company Name</Label>
            <Input
              placeholder="Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>

          {/* Display Name */}
          <div className="flex flex-col gap-1.5">
            <Label>
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Select or type to add"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDisplayNameManual(true);
              }}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="vendor@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1.5">
            <Label>Phone</Label>
            <div className="flex gap-2">
              <div className="flex gap-1">
                <span className="flex items-center px-3 text-sm border rounded-md bg-muted text-muted-foreground">+91</span>
                <Input
                  placeholder="Work Phone"
                  className="flex-1"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                <span className="flex items-center px-3 text-sm border rounded-md bg-muted text-muted-foreground">+91</span>
                <Input
                  placeholder="Mobile"
                  className="flex-1"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Vendor Language */}
          <div className="flex flex-col gap-1.5">
            <Label>Vendor Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="other-details" className="w-full">
          <TabsList className="border-b w-full justify-start rounded-none bg-transparent px-0 h-auto gap-0">
            {["other-details", "address", "contact-persons", "bank-details", "reporting-tags", "remarks"].map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent capitalize px-4 pb-2"
              >
                {t.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ─── Other Details ─────────────────────────────────────────────── */}
          <TabsContent value="other-details" className="pt-6 space-y-4">
            {/* PAN */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex flex-col gap-1.5">
                <Label>PAN</Label>
                <Input
                  placeholder="ABCDE1234F"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>

              {/* MSME */}
              <div className="flex flex-col gap-1.5">
                <Label>MSME Registered?</Label>
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
              <div className="flex flex-col gap-1.5">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
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
              <div className="flex flex-col gap-1.5">
                <Label>Accounts Payable</Label>
                <Select value={accountsPayableId || "__none"} onValueChange={(v) => setAccountsPayableId(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Opening Balance */}
              <div className="flex flex-col gap-1.5">
                <Label>Opening Balance</Label>
                <div className="flex gap-1">
                  <span className="flex items-center px-3 text-sm border rounded-l-md bg-muted text-muted-foreground border-r-0">
                    {currency}
                  </span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    className="rounded-l-none"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment Terms */}
              <div className="flex flex-col gap-1.5">
                <Label>Payment Terms</Label>
                <Select value={paymentTermsId || "__none"} onValueChange={(v) => setPaymentTermsId(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Due on Receipt</SelectItem>
                    {paymentTermsList.map((pt) => (
                      <SelectItem key={pt._id} value={pt._id}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* TDS */}
              <div className="flex flex-col gap-1.5">
                <Label>TDS</Label>
                <Select value={tdsCategory || "__none"} onValueChange={(v) => setTdsCategory(v === "__none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {taxList.map((t) => (
                      <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Enable Portal */}
              <div className="flex flex-col gap-1.5">
                <Label>Enable Portal?</Label>
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
          </TabsContent>

          {/* ─── Address ────────────────────────────────────────────────────── */}
          <TabsContent value="address" className="pt-6">
            <div className="grid grid-cols-2 gap-x-10 gap-y-0">
              {/* Billing Address */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Billing Address</h3>
                <AddressFields address={billingAddress} onChange={updateBilling} />
              </div>

              {/* Shipping Address */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">Shipping Address</h3>
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

            <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800 space-y-1">
              <p className="font-medium">Note:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Add and manage additional addresses from this Vendors details section.</li>
                <li>You can customise how vendors&apos; addresses are displayed in transaction PDFs.</li>
              </ul>
            </div>
          </TabsContent>

          {/* ─── Contact Persons ─────────────────────────────────────────────── */}
          <TabsContent value="contact-persons" className="pt-6">
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
                    <TableHead className="w-8" />
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
                        <Input
                          className="h-8"
                          value={cp.workPhone ?? ""}
                          onChange={(e) => updateContactPerson(idx, "workPhone", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="py-2 pr-2">
                        <Input
                          className="h-8"
                          value={cp.mobile ?? ""}
                          onChange={(e) => updateContactPerson(idx, "mobile", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeContactPerson(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
          <TabsContent value="bank-details" className="pt-6 space-y-4">
            {bankDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bank details added yet.</p>
            ) : (
              bankDetails.map((bd, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeBankDetail(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Bank Name</Label>
                      <Input value={bd.bankName ?? ""} onChange={(e) => updateBankDetail(idx, "bankName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Account Number</Label>
                      <Input value={bd.accountNumber ?? ""} onChange={(e) => updateBankDetail(idx, "accountNumber", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Account Holder Name</Label>
                      <Input value={bd.accountHolderName ?? ""} onChange={(e) => updateBankDetail(idx, "accountHolderName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>IFSC Code</Label>
                      <Input value={bd.ifscCode ?? ""} onChange={(e) => updateBankDetail(idx, "ifscCode", e.target.value.toUpperCase())} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Branch Name</Label>
                      <Input value={bd.branchName ?? ""} onChange={(e) => updateBankDetail(idx, "branchName", e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>UPI ID</Label>
                      <Input value={bd.upiId ?? ""} onChange={(e) => updateBankDetail(idx, "upiId", e.target.value)} />
                    </div>
                  </div>
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
                </div>
              ))
            )}
            <Button variant="outline" size="sm" onClick={addBankDetail}>
              <Plus className="h-4 w-4 mr-1" />
              Add Bank Account
            </Button>
          </TabsContent>

          {/* ─── Reporting Tags ───────────────────────────────────────────────── */}
          <TabsContent value="reporting-tags" className="pt-6">
            <p className="text-sm text-muted-foreground">
              Reporting tags can be configured in Settings → Reporting Tags.
            </p>
          </TabsContent>

          {/* ─── Remarks ─────────────────────────────────────────────────────── */}
          <TabsContent value="remarks" className="pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Remarks / Notes</Label>
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
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Attention</Label>
        <Input placeholder="Attention" className="h-8" value={address.attention ?? ""} onChange={(e) => onChange("attention", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Country / Region</Label>
        <Input placeholder="Country / Region" className="h-8" value={address.country ?? ""} onChange={(e) => onChange("country", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Address</Label>
        <Input placeholder="Street 1" className="h-8" value={address.street ?? ""} onChange={(e) => onChange("street", e.target.value)} />
        <Input placeholder="Street 2" className="h-8 mt-1" value={address.street2 ?? ""} onChange={(e) => onChange("street2", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">City</Label>
        <Input placeholder="City" className="h-8" value={address.city ?? ""} onChange={(e) => onChange("city", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">State</Label>
        <Select value={address.state || "__none"} onValueChange={(v) => onChange("state", v === "__none" ? "" : v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select or type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Select state —</SelectItem>
            {INDIAN_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Pin Code</Label>
        <Input placeholder="Pin Code" className="h-8" value={address.zip ?? ""} onChange={(e) => onChange("zip", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Phone</Label>
        <Input placeholder="Phone" className="h-8" value={address.phone ?? ""} onChange={(e) => onChange("phone", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Fax Number</Label>
        <Input placeholder="Fax Number" className="h-8" value={address.fax ?? ""} onChange={(e) => onChange("fax", e.target.value)} />
      </div>
    </div>
  );
}
