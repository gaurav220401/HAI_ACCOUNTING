"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Mail, Send, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Settings <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Email / SMTP</span>
            </span>
          }
        />

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Email Settings</h1>
              <p className="text-sm text-muted-foreground">
                Configure your SMTP server so invoices are actually sent to
                customers.
              </p>
            </div>
          </div>

          {/* Quick presets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Presets</CardTitle>
              <CardDescription>
                Click a provider to autofill the server settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          {/* SMTP config */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">SMTP Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Gmail warning */}
              {settings.host.includes("gmail.com") && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    <strong>Gmail requires an App Password.</strong> Your
                    regular Google password will be rejected. Go to{" "}
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-medium"
                    >
                      myaccount.google.com/apppasswords
                    </a>
                    , generate an App Password for &quot;Mail&quot;, and paste
                    it in the password field below. (2-Step Verification must be
                    enabled on your Google account first.)
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>SMTP Host</Label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={settings.host}
                    onChange={(e) => update("host", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={settings.port}
                    onChange={(e) =>
                      update("port", parseInt(e.target.value) || 587)
                    }
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    checked={settings.secure}
                    onCheckedChange={(v) => update("secure", v)}
                  />
                  <Label className="cursor-pointer">
                    Use SSL / TLS (port 465)
                  </Label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>SMTP Username</Label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={settings.user}
                  onChange={(e) => update("user", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>SMTP Password / App Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={settings.pass}
                  onChange={(e) => update("pass", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  <strong>Gmail users:</strong> You <em>must</em> use an{" "}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    App Password
                  </a>{" "}
                  — your regular Google password will always be rejected. Enable
                  2-Step Verification on your Google account first, then
                  generate the App Password for &quot;Mail&quot;.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sender identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sender Identity</CardTitle>
              <CardDescription>
                The name and email address customers will see in their inbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>From Name</Label>
                <Input
                  placeholder="Haldar Accounting"
                  value={settings.fromName}
                  onChange={(e) => update("fromName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>From Email</Label>
                <Input
                  type="email"
                  placeholder="accounts@yourcompany.com"
                  value={settings.fromEmail}
                  onChange={(e) => update("fromEmail", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              <Save className="h-4 w-4 mr-1" />
              Save Settings
            </Button>
          </div>

          {/* Test email */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Test Your Settings</CardTitle>
              <CardDescription>
                Send a test email to confirm everything is configured correctly.
                Save settings before testing.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="max-w-xs"
              />
              <Button onClick={handleTest} disabled={testing} variant="outline">
                {testing ?
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Send className="h-4 w-4 mr-1" />}
                Send Test Email
              </Button>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
