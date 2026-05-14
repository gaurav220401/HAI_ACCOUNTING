"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Trash2, AlertTriangle } from "lucide-react";
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

  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  async function handleReset() {
    if (resetConfirmText !== "RESET_ALL_DATA") {
      toast.error("Please type the confirmation code correctly");
      return;
    }

    setResetting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
      const token = await firebaseUser?.getIdToken();
      
      const res = await fetch(`${apiBase}/settings/reset-organization`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmReset: "RESET_ALL_DATA" }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Organization data reset successfully");
        setShowResetConfirm(false);
        setResetConfirmText("");
        // Reload the page to reflect changes
        window.location.reload();
      } else {
        toast.error(data.message || "Failed to reset data");
      }
    } catch (err) {
      toast.error("An error occurred while resetting data");
    } finally {
      setResetting(false);
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

      {/* Danger Zone */}
      <div className="mt-12 rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center gap-3 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Danger Zone</h2>
        </div>
        <p className="mt-2 text-sm text-red-600">
          Resetting your organization will permanently delete all transactions (Invoices, Bills, Sales Orders, etc.), 
          contacts, items, and reset all account balances. This action cannot be undone.
        </p>
        
        {!showResetConfirm ? (
          <Button 
            variant="destructive" 
            className="mt-4"
            onClick={() => setShowResetConfirm(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Reset Organization Data
          </Button>
        ) : (
          <div className="mt-4 space-y-4 rounded-md border border-red-300 bg-white p-4">
            <p className="text-sm font-medium text-gray-900">
              To confirm, type <span className="font-bold text-red-600">RESET_ALL_DATA</span> below:
            </p>
            <Input 
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type RESET_ALL_DATA"
              className="max-w-xs"
            />
            <div className="flex gap-2">
              <Button 
                variant="destructive" 
                onClick={handleReset}
                disabled={resetting || resetConfirmText !== "RESET_ALL_DATA"}
              >
                {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Confirm Reset
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { setShowResetConfirm(false); setResetConfirmText(""); }}
                disabled={resetting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </SetupConfigShell>
  );
}
