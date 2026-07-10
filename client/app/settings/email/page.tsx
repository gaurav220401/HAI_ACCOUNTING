"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Mail, Send, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { smtpApi, type SmtpSettings } from "@/lib/api/smtp";
import { toast } from "sonner";

const DEFAULT_SETTINGS: SmtpSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  fromName: "",
  fromEmail: "",
};

// Common SMTP presets for quick setup
const PRESETS = [
  {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    note: "Use an App Password (not your Google account password)",
  },
  {
    label: "Outlook / Office 365",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    note: "",
  },
  {
    label: "Yahoo Mail",
    host: "smtp.mail.yahoo.com",
    port: 587,
    secure: false,
    note: "",
  },
  {
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 587,
    secure: false,
    note: "",
  },
  {
    label: "Brevo (SendinBlue)",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    note: "",
  },
];

export default function EmailSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const {
    activeOrganization,
    needsOrgSetup,
    loading: orgLoading,
  } = useOrganization();

  const [settings, setSettings] = useState<SmtpSettings>(DEFAULT_SETTINGS);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (activeOrganization?._id) loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?._id]);

  async function loadSettings() {
    if (!activeOrganization?._id) return;
    setFetching(true);
    try {
      const res = await smtpApi.get(activeOrganization._id);
      if (res.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...res.data });
        setTestEmail(res.data.fromEmail || res.data.user || "");
      }
    } catch {
      // noop — org may not have SMTP configured yet
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    if (!activeOrganization?._id) return;
    setSaving(true);
    try {
      await smtpApi.save(activeOrganization._id, settings);
      toast.success("SMTP settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!activeOrganization?._id) return;
    if (!testEmail) {
      toast.error("Enter a test email address first");
      return;
    }
    setTesting(true);
    try {
      const res = await smtpApi.test(activeOrganization._id, testEmail);
      toast.success(res.message || "Test email sent!");
    } catch (e: any) {
      toast.error(e.message || "Test failed. Check your SMTP settings.");
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(preset: (typeof PRESETS)[0]) {
    setSettings((s) => ({
      ...s,
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
    }));
    if (preset.note) toast.info(preset.note);
  }

  function update(field: keyof SmtpSettings, value: string | number | boolean) {
    setSettings((s) => ({ ...s, [field]: value }));
  }

  if (loading || orgLoading || fetching) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SetupConfigShell
      title="Email / SMTP Settings"
      subtitle="Configure your SMTP server so invoices are actually sent to customers."
      actions={(
        <Button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>Save Settings</span>
        </Button>
      )}
    >
      <div className="space-y-6 max-w-3xl">
        {/* Quick presets */}
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-1.5">Quick Presets</h2>
          <p className="text-xs text-slate-500 mb-4">Click a provider to autofill the server settings.</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
                className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-medium text-xs py-1 px-3 h-8"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </section>

        {/* SMTP config */}
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-2">SMTP Configuration</h2>
          
          {/* Gmail warning */}
          {settings.host.includes("gmail.com") && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-xs leading-relaxed text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>Gmail requires an App Password.</strong> Your
                regular Google password will be rejected. Go to{" "}
                <a
                  href="https://myaccount.google.com/apppasswords"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold text-amber-900"
                >
                  myaccount.google.com/apppasswords
                </a>
                , generate an App Password for &quot;Mail&quot;, and paste
                it in the password field below. (2-Step Verification must be
                enabled on your Google account first.)
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <Label className="text-xs">SMTP Host</Label>
              <Input
                placeholder="smtp.gmail.com"
                value={settings.host}
                onChange={(e) => update("host", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Port</Label>
              <Input
                type="number"
                placeholder="587"
                value={settings.port}
                onChange={(e) =>
                  update("port", parseInt(e.target.value) || 587)
                }
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={settings.secure}
                onCheckedChange={(v) => update("secure", v)}
                className="data-[state=checked]:bg-teal-600"
              />
              <Label className="cursor-pointer text-xs font-normal text-slate-650">
                Use SSL / TLS (port 465)
              </Label>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <Label className="text-xs">SMTP Username</Label>
            <Input
              type="email"
              placeholder="your@email.com"
              value={settings.user}
              onChange={(e) => update("user", e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5 text-xs">
            <Label className="text-xs">SMTP Password / App Password</Label>
            <Input
              type="password"
              placeholder="••••••••"
              value={settings.pass}
              onChange={(e) => update("pass", e.target.value)}
              className="h-9 text-xs"
            />
            <p className="text-[11px] text-slate-400">
              <strong>Gmail users:</strong> You <em>must</em> use an{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 hover:text-teal-850 font-semibold underline"
              >
                App Password
              </a>{" "}
              — your regular Google password will always be rejected. Enable
              2-Step Verification on your Google account first, then
              generate the App Password for &quot;Mail&quot;.
            </p>
          </div>
        </section>

        {/* Sender identity */}
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-1.5">Sender Identity</h2>
          <p className="text-xs text-slate-500 mb-4">
            The name and email address customers will see in their inbox.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">From Name</Label>
              <Input
                placeholder="Haldar Accounting"
                value={settings.fromName}
                onChange={(e) => update("fromName", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From Email</Label>
              <Input
                type="email"
                placeholder="accounts@yourcompany.com"
                value={settings.fromEmail}
                onChange={(e) => update("fromEmail", e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>
        </section>

        {/* Test email */}
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-1.5">Test Your Settings</h2>
          <p className="text-xs text-slate-500 mb-4">
            Send a test email to confirm everything is configured correctly.
            Save settings before testing.
          </p>
          <div className="flex gap-3 text-xs">
            <Input
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="max-w-xs h-9 text-xs"
            />
            <Button onClick={handleTest} disabled={testing} variant="outline" className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-3 h-9 gap-1.5">
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Send Test Email</span>
            </Button>
          </div>
        </section>
      </div>
    </SetupConfigShell>
  );
}
