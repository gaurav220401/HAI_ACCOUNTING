"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { organizationApi } from "@/lib/api";
import type { ReminderSettings } from "@/lib/api/organizations";

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  sendInvoiceDueReminder: true,
  invoiceDueDaysBefore: 3,
  sendPaymentDueReminder: true,
  paymentDueFrequencyDays: 7,
};

export default function ReminderSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup } = useOrganization();

  const [form, setForm] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  useEffect(() => {
    const loadSettings = async () => {
      if (!activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await organizationApi.getReminderSettings(activeOrganization._id);
        setForm({ ...DEFAULT_REMINDER_SETTINGS, ...(res.data || {}) });
      } catch {
        toast.error("Failed to load reminder settings");
      } finally {
        setFetching(false);
      }
    };

    void loadSettings();
  }, [activeOrganization?._id]);

  async function handleSave() {
    if (!activeOrganization?._id) return;

    setSaving(true);
    try {
      await organizationApi.updateReminderSettings(activeOrganization._id, {
        ...form,
        invoiceDueDaysBefore: Math.max(0, Math.min(365, Number(form.invoiceDueDaysBefore) || 0)),
        paymentDueFrequencyDays: Math.max(1, Math.min(365, Number(form.paymentDueFrequencyDays) || 7)),
      });
      toast.success("Reminder settings saved");
    } catch {
      toast.error("Failed to save reminder settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetupConfigShell
      title="Reminders"
      subtitle="Configure automated follow-ups for due invoices and payment cycles."
      actions={(
        <Button onClick={handleSave} disabled={saving || fetching || !activeOrganization?._id}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save</span>
        </Button>
      )}
    >
      <div className="space-y-4 rounded-lg border p-4 max-w-3xl">
        <div className="flex items-start justify-between gap-4 border rounded-md p-3">
          <div>
            <h3 className="font-medium">Enable Reminder Engine</h3>
            <p className="text-sm text-muted-foreground">Turn this on to send scheduled reminder notifications.</p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm((p: ReminderSettings) => ({ ...p, enabled: checked }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Invoice Due Reminder</h4>
                <p className="text-xs text-muted-foreground">Alert before due date.</p>
              </div>
              <Switch
                checked={form.sendInvoiceDueReminder}
                onCheckedChange={(checked) => setForm((p: ReminderSettings) => ({ ...p, sendInvoiceDueReminder: checked }))}
                disabled={!form.enabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Days Before Due Date</Label>
              <Input
                type="number"
                min="0"
                max="365"
                value={form.invoiceDueDaysBefore}
                onChange={(e) => setForm((p: ReminderSettings) => ({ ...p, invoiceDueDaysBefore: Number(e.target.value) || 0 }))}
                disabled={!form.enabled || !form.sendInvoiceDueReminder}
              />
            </div>
          </div>

          <div className="space-y-3 border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Payment Due Reminder</h4>
                <p className="text-xs text-muted-foreground">Recurring reminder for unpaid balances.</p>
              </div>
              <Switch
                checked={form.sendPaymentDueReminder}
                onCheckedChange={(checked) => setForm((p: ReminderSettings) => ({ ...p, sendPaymentDueReminder: checked }))}
                disabled={!form.enabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Frequency (days)</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={form.paymentDueFrequencyDays}
                onChange={(e) => setForm((p: ReminderSettings) => ({ ...p, paymentDueFrequencyDays: Number(e.target.value) || 1 }))}
                disabled={!form.enabled || !form.sendPaymentDueReminder}
              />
            </div>
          </div>
        </div>
      </div>
    </SetupConfigShell>
  );
}
