"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { organizationApi } from "@/lib/api/organizations";
import { useOrganization } from "@/contexts/organization-context";

// ─── Data ──────────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Advertising Agency",
  "Agriculture",
  "Automotive",
  "Banking & Finance",
  "Construction",
  "Consulting",
  "Education",
  "Entertainment",
  "Food Industry",
  "Government",
  "Healthcare",
  "Hospitality",
  "Information Technology",
  "Legal",
  "Manufacturing",
  "Media & Publishing",
  "Non-Profit",
  "Real Estate",
  "Retail",
  "Small Business",
  "Technology",
  "Telecommunications",
  "Transportation",
  "Other",
];

const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "JP", name: "Japan" },
  { code: "CN", name: "China" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
];

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli",
  "Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep",
  "Puducherry",
];

const CURRENCIES = [
  { code: "INR", name: "INR - Indian Rupee" },
  { code: "USD", name: "USD - US Dollar" },
  { code: "EUR", name: "EUR - Euro" },
  { code: "GBP", name: "GBP - British Pound" },
  { code: "AUD", name: "AUD - Australian Dollar" },
  { code: "CAD", name: "CAD - Canadian Dollar" },
  { code: "SGD", name: "SGD - Singapore Dollar" },
  { code: "AED", name: "AED - UAE Dirham" },
  { code: "JPY", name: "JPY - Japanese Yen" },
  { code: "CNY", name: "CNY - Chinese Yuan" },
  { code: "NZD", name: "NZD - New Zealand Dollar" },
  { code: "ZAR", name: "ZAR - South African Rand" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "bn", name: "Bengali" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "ar", name: "Arabic" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "(GMT 5:30) India Standard Time (Asia/Kolkata)" },
  { value: "America/New_York", label: "(GMT -5:00) Eastern Time (US & Canada)" },
  { value: "America/Chicago", label: "(GMT -6:00) Central Time (US & Canada)" },
  { value: "America/Denver", label: "(GMT -7:00) Mountain Time (US & Canada)" },
  { value: "America/Los_Angeles", label: "(GMT -8:00) Pacific Time (US & Canada)" },
  { value: "Europe/London", label: "(GMT 0:00) London, Dublin, Edinburgh" },
  { value: "Europe/Berlin", label: "(GMT 1:00) Amsterdam, Berlin, Brussels" },
  { value: "Europe/Paris", label: "(GMT 1:00) Paris, Madrid, Rome" },
  { value: "Asia/Dubai", label: "(GMT 4:00) Abu Dhabi, Muscat" },
  { value: "Asia/Singapore", label: "(GMT 8:00) Singapore, Kuala Lumpur" },
  { value: "Asia/Tokyo", label: "(GMT 9:00) Tokyo, Osaka, Sapporo" },
  { value: "Australia/Sydney", label: "(GMT 10:00) Sydney, Melbourne, Brisbane" },
  { value: "Pacific/Auckland", label: "(GMT 12:00) Auckland, Wellington" },
  { value: "Africa/Nairobi", label: "(GMT 3:00) Nairobi, Addis Ababa" },
];

const FISCAL_YEAR_MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

// ─── Component ──────────────────────────────────────────────────────────

export function OrgSetupForm() {
  const router = useRouter();
  const { refreshOrganizations } = useOrganization();

  const [submitting, setSubmitting] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  const [form, setForm] = useState({
    name: "",
    industry: "",
    country: "IN",
    state: "",
    baseCurrency: "INR",
    language: "en",
    timezone: "Asia/Kolkata",
    fiscalYearStart: 4, // April (India default)
    taxId: "", // GSTIN
    isGstRegistered: false,
    // Address
    street: "",
    city: "",
    zip: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Organization name is required";
    if (!form.country) e.country = "Country is required";
    if (form.country === "IN" && !form.state)
      e.state = "State is required for India";
    if (!form.baseCurrency) e.baseCurrency = "Currency is required";
    if (!form.timezone) e.timezone = "Time zone is required";
    if (!form.language) e.language = "Language is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      await organizationApi.create({
        name: form.name.trim(),
        industry: form.industry || "General",
        baseCurrency: form.baseCurrency,
        fiscalYearStart: form.fiscalYearStart,
        country:
          COUNTRIES.find((c) => c.code === form.country)?.name ?? form.country,
        timezone: form.timezone,
        language: form.language,
        taxId: form.isGstRegistered ? form.taxId : undefined,
        address:
          showAddress
            ? {
                street: form.street,
                city: form.city,
                state: form.state,
                zip: form.zip,
                country:
                  COUNTRIES.find((c) => c.code === form.country)?.name ??
                  form.country,
              }
            : { state: form.state },
      });
      toast.success(`Organization "${form.name}" created!`);
      await refreshOrganizations();
      router.push("/dashboard");
    } catch (err: any) {
      const msg =
        err?.name === "TypeError"
          ? "Cannot reach the server. Please try again."
          : err?.message ?? "Failed to create organization";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const stateOptions =
    form.country === "IN" ? INDIA_STATES : [];

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar matching Zoho Books */}
      <div className="border-b bg-white px-6 py-3 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
          <span className="text-white text-xs font-bold">H</span>
        </div>
        <span className="text-sm text-muted-foreground">
          HAI Accounting is your end-to-end online accounting software.
        </span>
      </div>

      {/* Form area */}
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Set up your organization profile
          </h1>
          <div className="mx-auto mt-2 h-0.5 w-10 bg-blue-500" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ORGANIZATIONAL DETAILS */}
          <section>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Organizational Details
            </p>
            <div className="space-y-4">
              {/* Organization Name */}
              <div className="space-y-1.5">
                <Label htmlFor="org-name">
                  Organization Name<span className="text-red-500">*</span>
                </Label>
                <Input
                  id="org-name"
                  placeholder="e.g. Haldar Accounting Innovations"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Industry */}
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Select
                  value={form.industry}
                  onValueChange={(v) => set("industry", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Country + State row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    Organization Location
                    <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.country}
                    onValueChange={(v) => {
                      set("country", v);
                      set("state", "");
                    }}
                  >
                    <SelectTrigger
                      className={errors.country ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && (
                    <p className="text-xs text-red-500">{errors.country}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    State / Union Territory
                    {form.country === "IN" && (
                      <span className="text-red-500">*</span>
                    )}
                  </Label>
                  {stateOptions.length > 0 ? (
                    <Select
                      value={form.state}
                      onValueChange={(v) => set("state", v)}
                    >
                      <SelectTrigger
                        className={errors.state ? "border-red-500" : ""}
                      >
                        <SelectValue placeholder="State/Union Territory" />
                      </SelectTrigger>
                      <SelectContent>
                        {stateOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="State / Province"
                      value={form.state}
                      onChange={(e) => set("state", e.target.value)}
                    />
                  )}
                  {errors.state && (
                    <p className="text-xs text-red-500">{errors.state}</p>
                  )}
                </div>
              </div>

              {/* Add Address toggle */}
              {!showAddress && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  onClick={() => setShowAddress(true)}
                >
                  <span className="text-lg leading-none">⊕</span>
                  Add Organization Address
                </button>
              )}

              {showAddress && (
                <div className="space-y-3 rounded-md border p-4">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                    Organization Address
                  </p>
                  <Input
                    placeholder="Street address"
                    value={form.street}
                    onChange={(e) => set("street", e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                    />
                    <Input
                      placeholder="ZIP / Postal Code"
                      value={form.zip}
                      onChange={(e) => set("zip", e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => setShowAddress(false)}
                  >
                    Remove address
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* REGIONAL SETTINGS */}
          <section>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Regional Settings
            </p>
            <div className="space-y-4">
              {/* Currency + Language */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>
                    Currency<span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.baseCurrency}
                    onValueChange={(v) => set("baseCurrency", v)}
                  >
                    <SelectTrigger
                      className={errors.baseCurrency ? "border-red-500" : ""}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Language<span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.language}
                    onValueChange={(v) => set("language", v)}
                  >
                    <SelectTrigger
                      className={errors.language ? "border-red-500" : ""}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Timezone */}
              <div className="space-y-1.5">
                <Label>
                  Time Zone<span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.timezone}
                  onValueChange={(v) => set("timezone", v)}
                >
                  <SelectTrigger
                    className={errors.timezone ? "border-red-500" : ""}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fiscal Year */}
              <div className="space-y-1.5">
                <Label>Fiscal Year Starts</Label>
                <Select
                  value={String(form.fiscalYearStart)}
                  onValueChange={(v) => set("fiscalYearStart", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FISCAL_YEAR_MONTHS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* GST Toggle */}
          <div className="flex items-center justify-between rounded-md border px-4 py-3">
            <Label htmlFor="gst-toggle" className="cursor-pointer">
              Is this business registered for GST?
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {form.isGstRegistered ? "Yes" : "No"}
              </span>
              <Switch
                id="gst-toggle"
                checked={form.isGstRegistered}
                onCheckedChange={(v) => set("isGstRegistered", v)}
              />
            </div>
          </div>

          {/* GSTIN input (shown if GST registered) */}
          {form.isGstRegistered && (
            <div className="space-y-1.5">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                placeholder="e.g. 27AAPFU0939F1ZV"
                value={form.taxId}
                onChange={(e) => set("taxId", e.target.value.toUpperCase())}
                maxLength={15}
              />
            </div>
          )}

          {/* Notes */}
          <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-600 space-y-1.5">
            <p className="font-medium">Note:</p>
            <ul className="list-disc pl-4 space-y-1 text-xs">
              <li>
                You can update some of these preferences from Settings anytime.
              </li>
              <li>
                The language you select on this page will be the default
                language for the following features even if you change the
                language later:
              </li>
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 pl-4 text-xs">
              {[
                "Chart of Accounts",
                "Email Templates",
                "Template Customizations",
                "Payment Modes",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1">
                  <span className="text-yellow-500">★</span> {item}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button type="submit" disabled={submitting} className="px-8">
              {submitting ? "Setting up…" : "Get Started"}
            </Button>
            <a
              href="#"
              className="text-xs text-muted-foreground hover:underline"
            >
              Privacy Policy
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
