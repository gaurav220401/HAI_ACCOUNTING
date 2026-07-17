"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { organizationApi } from "@/lib/api";
import type { PortalSettings } from "@/lib/api/organizations";

const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  enabled: false,
  subdomain: "",
};

export default function CustomerPortalSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup } = useOrganization();

  const [form, setForm] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  useEffect(() => {
    const load = async () => {
      if (!activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await organizationApi.getPortalSettings(activeOrganization._id);
        setForm({ ...DEFAULT_PORTAL_SETTINGS, ...(res.data || {}) });
      } catch {
        toast.error("Failed to load portal settings");
      } finally {
        setFetching(false);
      }
    };

    void load();
  }, [activeOrganization?._id]);

  async function handleSave() {
    if (!activeOrganization?._id) return;

    setSaving(true);
    try {
      const sanitized = (form.subdomain || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 40);

      await organizationApi.updatePortalSettings(activeOrganization._id, {
        enabled: form.enabled,
        subdomain: sanitized,
      });
      setForm((prev: PortalSettings) => ({ ...prev, subdomain: sanitized }));
      toast.success("Customer portal settings updated");
    } catch {
      toast.error("Failed to update customer portal settings");
    } finally {
      setSaving(false);
    }
  }

  const portalPreviewUrl = form.subdomain ? `https://${form.subdomain}.example.com` : "";

  return (
    <SetupConfigShell
      title="Customer Portal"
      subtitle="Let customers view statements and track status through your portal."
      actions={(
        <Button onClick={handleSave} disabled={saving || fetching || !activeOrganization?._id} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Save</span>
        </Button>
      )}
    >
      <div className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-6 max-w-3xl">
        <div className="flex items-start justify-between gap-4 border border-slate-150 bg-slate-50/30 rounded-lg p-4">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Enable Customer Portal</h3>
            <p className="text-xs text-slate-500 leading-relaxed mt-0.5">Allow contacts to access a secure self-service view.</p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm((p: PortalSettings) => ({ ...p, enabled: checked }))}
            className="data-[state=checked]:bg-teal-600"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Portal Subdomain</Label>
          <Input
            value={form.subdomain || ""}
            onChange={(e) => setForm((p: PortalSettings) => ({ ...p, subdomain: e.target.value }))}
            placeholder="your-company"
            disabled={!form.enabled}
            className="h-9 text-xs"
          />
          <p className="text-[11px] text-slate-400">Only lowercase letters, numbers, and hyphens are allowed.</p>
        </div>

        {portalPreviewUrl && (
          <div className="rounded-lg border border-teal-150 bg-teal-50/40 p-4 text-xs font-medium text-teal-800 flex items-center justify-between gap-2">
            <span className="truncate">Portal URL: {portalPreviewUrl}</span>
            <Button type="button" variant="ghost" size="sm" disabled className="border-slate-200 text-slate-400 bg-slate-50 rounded-md font-semibold text-xs py-1 px-3 h-8 cursor-not-allowed">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="ml-1.5">Open</span>
            </Button>
          </div>
        )}
      </div>
    </SetupConfigShell>
  );
}
