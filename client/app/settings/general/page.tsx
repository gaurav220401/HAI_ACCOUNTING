"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { organizationApi } from "@/lib/api";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
const NUMBER_FORMAT_OPTIONS = ["1,234,567.89", "1.234.567,89", "12,34,567.89"];

export default function GeneralSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup, refreshOrganizations } = useOrganization();

  const [fetchingOrg, setFetchingOrg] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    industry: "General",
    country: "India",
    timezone: "Asia/Kolkata",
    fiscalYearStart: "4",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234,567.89",
    language: "en",
    taxId: "",
  });

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  useEffect(() => {
    const loadOrg = async () => {
      if (!activeOrganization?._id) return;
      setFetchingOrg(true);
      try {
        const res = await organizationApi.getById(activeOrganization._id);
        const org = res.data;
        setFormData({
          name: org.name || "",
          industry: org.industry || "General",
          country: org.country || "India",
          timezone: org.timezone || "Asia/Kolkata",
          fiscalYearStart: String(org.fiscalYearStart || 4),
          dateFormat: org.dateFormat || "DD/MM/YYYY",
          numberFormat: org.numberFormat || "1,234,567.89",
          language: org.language || "en",
          taxId: org.taxId || "",
        });
      } catch {
        toast.error("Failed to load organization settings");
      } finally {
        setFetchingOrg(false);
      }
    };

    void loadOrg();
  }, [activeOrganization?._id]);

  const canSave = useMemo(() => {
    return Boolean(formData.name.trim()) && Boolean(activeOrganization?._id);
  }, [formData.name, activeOrganization?._id]);

  async function handleSave() {
    if (!activeOrganization?._id) return;
    if (!formData.name.trim()) {
      toast.error("Organization name is required");
      return;
    }

    setSaving(true);
    try {
      await organizationApi.update(activeOrganization._id, {
        name: formData.name.trim(),
        industry: formData.industry.trim() || "General",
        country: formData.country.trim() || "India",
        timezone: formData.timezone.trim() || "Asia/Kolkata",
        fiscalYearStart: Number(formData.fiscalYearStart),
        dateFormat: formData.dateFormat,
        numberFormat: formData.numberFormat,
        language: formData.language.trim().slice(0, 2).toLowerCase(),
        taxId: formData.taxId.trim() || undefined,
      });
      await refreshOrganizations();
      toast.success("General settings updated");
    } catch {
      toast.error("Failed to save general settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetupConfigShell
      title="General"
      subtitle="Manage your organization basics, locale, and accounting preferences."
      actions={(
        <Button onClick={handleSave} disabled={!canSave || saving || fetchingOrg}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save</span>
        </Button>
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="font-medium">Organization Details</h2>

          <div className="space-y-1.5">
            <Label>Organization Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="Organization name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Industry</Label>
            <Input
              value={formData.industry}
              onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))}
              placeholder="Industry"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tax ID / GSTIN</Label>
            <Input
              value={formData.taxId}
              onChange={(e) => setFormData((p) => ({ ...p, taxId: e.target.value }))}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <h2 className="font-medium">Locale & Accounting</h2>

          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input
              value={formData.country}
              onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
              placeholder="Country"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input
              value={formData.timezone}
              onChange={(e) => setFormData((p) => ({ ...p, timezone: e.target.value }))}
              placeholder="Timezone"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Fiscal Year Start</Label>
            <Select
              value={formData.fiscalYearStart}
              onValueChange={(value) => setFormData((p) => ({ ...p, fiscalYearStart: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Date Format</Label>
            <Select
              value={formData.dateFormat}
              onValueChange={(value) => setFormData((p) => ({ ...p, dateFormat: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMAT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Number Format</Label>
            <Select
              value={formData.numberFormat}
              onValueChange={(value) => setFormData((p) => ({ ...p, numberFormat: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_FORMAT_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Language (ISO code)</Label>
            <Input
              value={formData.language}
              maxLength={2}
              onChange={(e) => setFormData((p) => ({ ...p, language: e.target.value.toLowerCase() }))}
              placeholder="en"
            />
          </div>
        </div>
      </div>
    </SetupConfigShell>
  );
}
