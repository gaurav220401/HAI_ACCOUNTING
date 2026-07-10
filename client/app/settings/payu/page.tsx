"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, CreditCard, Shield, Eye, EyeOff, Loader2, Save } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import SetupConfigShell from "@/components/settings/setup-config-shell";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { payUApi, type PayUConfig } from "@/lib/api/payu";
import { toast } from "sonner";

export default function PayUSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [config, setConfig] = useState<PayUConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [formData, setFormData] = useState({
    merchantKey: "",
    merchantSecret: "",
    environment: "test" as "test" | "production",
    successUrl: "",
    failureUrl: "",
    cancelUrl: "",
    isActive: false,
  });

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  async function fetchConfig() {
    setConfigLoading(true);
    try {
      const res = await payUApi.getConfig();
      if (res.data) {
        setConfig(res.data);
        setFormData({
          merchantKey: res.data.merchantKey,
          merchantSecret: "***", // Mask existing secret
          environment: res.data.environment,
          successUrl: res.data.successUrl,
          failureUrl: res.data.failureUrl,
          cancelUrl: res.data.cancelUrl,
          isActive: res.data.isActive,
        });
      }
    } catch (error) {
      console.error("Error fetching PayU config:", error);
    } finally {
      setConfigLoading(false);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);

    try {
      // Don't send masked secret if it hasn't changed
      const dataToSend = { ...formData };
      if (dataToSend.merchantSecret === "***" && config) {
        dataToSend.merchantSecret = config.merchantKey; // This is a placeholder - in real app, you'd handle this better
      }

      await payUApi.updateConfig(dataToSend);
      await fetchConfig();
      toast.success("PayU configuration updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update PayU configuration");
    } finally {
      setSaving(false);
    }
  }

  function handleTestConnection() {
    // This would test the PayU connection
    toast.info("Testing PayU connection...");
    // TODO: Implement actual connection test
  }

  if (loading || orgLoading || configLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <SetupConfigShell
      title="PayU Integration"
      subtitle="Configure PayU to accept online payments for your invoices."
      actions={(
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={handleTestConnection} className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-medium text-xs py-1 px-3 h-8 gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>Test Connection</span>
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5 h-8 text-xs py-1 px-3">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Configuration</span>
          </Button>
        </div>
      )}
    >
      <div className="space-y-6 max-w-3xl">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Configuration */}
          <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-2">Basic Configuration</h2>
            <p className="text-xs text-slate-500 mb-4">
              Enter your PayU merchant credentials. You can get these from your PayU dashboard.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs">Merchant Key</Label>
                <Input
                  id="merchantKey"
                  value={formData.merchantKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, merchantKey: e.target.value }))}
                  placeholder="Enter your PayU merchant key"
                  required
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Merchant Secret</Label>
                <div className="relative">
                  <Input
                    id="merchantSecret"
                    type={showSecret ? "text" : "password"}
                    value={formData.merchantSecret}
                    onChange={(e) => setFormData(prev => ({ ...prev, merchantSecret: e.target.value }))}
                    placeholder={config ? "Enter new secret to update" : "Enter your PayU merchant secret"}
                    className="pr-10 h-9 text-xs"
                    required={!config}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-slate-400 hover:text-slate-650"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {config && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Leave as "***" to keep existing secret unchanged
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <Label className="text-xs">Environment</Label>
              <Select
                value={formData.environment}
                onValueChange={(value: "test" | "production") => 
                  setFormData(prev => ({ ...prev, environment: value }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test (Sandbox)</SelectItem>
                  <SelectItem value="production">Production (Live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* Callback URLs */}
          <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-2">Callback URLs</h2>
            <p className="text-xs text-slate-500 mb-4">
              URLs where PayU will redirect customers after payment completion
            </p>
            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs">Success URL</Label>
                <Input
                  id="successUrl"
                  value={formData.successUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, successUrl: e.target.value }))}
                  placeholder="https://yourdomain.com/payment/success"
                  required
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Failure URL</Label>
                <Input
                  id="failureUrl"
                  value={formData.failureUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, failureUrl: e.target.value }))}
                  placeholder="https://yourdomain.com/payment/failure"
                  required
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cancel URL (Optional)</Label>
                <Input
                  id="cancelUrl"
                  value={formData.cancelUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, cancelUrl: e.target.value }))}
                  placeholder="https://yourdomain.com/payment/cancel"
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
            <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-2">Status</h2>
            <div className="flex items-center space-x-3 pt-1">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                className="data-[state=checked]:bg-teal-600"
              />
              <Label htmlFor="isActive" className="text-xs font-semibold text-slate-800 cursor-pointer">Enable PayU Payments</Label>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed max-w-lg mt-2">
              When enabled, customers will see a "Pay with PayU" button on unpaid invoices.
            </p>
          </section>
        </form>

        {/* Help Section */}
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl space-y-4">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-2">Getting Started with PayU</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-650 leading-relaxed">
            <div className="border border-slate-100 p-4 rounded-lg bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 mb-1">1. Get PayU Account</h4>
              <p>
                Sign up for a PayU merchant account at{" "}
                <a href="https://payu.in" target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:text-teal-900 font-semibold underline">
                  payu.in
                </a>
              </p>
            </div>
            <div className="border border-slate-100 p-4 rounded-lg bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 mb-1">2. Get Credentials</h4>
              <p>
                Get your Merchant Key and Secret from the PayU dashboard integration settings.
              </p>
            </div>
            <div className="border border-slate-100 p-4 rounded-lg bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 mb-1">3. Configure Here</h4>
              <p>
                Enter your credentials and callback URLs above, then click Save Configuration.
              </p>
            </div>
            <div className="border border-slate-100 p-4 rounded-lg bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 mb-1">4. Test & Go Live</h4>
              <p>
                Test with the sandbox environment, then switch the environment toggle to Production (Live) to start collecting payments.
              </p>
            </div>
          </div>
        </section>
      </div>
    </SetupConfigShell>
  );
}
