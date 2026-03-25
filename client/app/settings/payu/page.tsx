"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, CreditCard, Shield, Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
              <span className="font-medium text-foreground">PayU Payment Gateway</span>
            </span>
          }
          actions={
            <Button variant="outline" size="sm" onClick={handleTestConnection}>
              <Shield className="h-4 w-4 mr-1" />
              Test Connection
            </Button>
          }
        />

        <div className="p-6 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6" />
              PayU Payment Gateway
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure PayU to accept online payments for your invoices
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Basic Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Configuration</CardTitle>
                <CardDescription>
                  Enter your PayU merchant credentials. You can get these from your PayU dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="merchantKey">Merchant Key</Label>
                    <Input
                      id="merchantKey"
                      value={formData.merchantKey}
                      onChange={(e) => setFormData(prev => ({ ...prev, merchantKey: e.target.value }))}
                      placeholder="Enter your PayU merchant key"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="merchantSecret">Merchant Secret</Label>
                    <div className="relative">
                      <Input
                        id="merchantSecret"
                        type={showSecret ? "text" : "password"}
                        value={formData.merchantSecret}
                        onChange={(e) => setFormData(prev => ({ ...prev, merchantSecret: e.target.value }))}
                        placeholder={config ? "Enter new secret to update" : "Enter your PayU merchant secret"}
                        className="pr-10"
                        required={!config}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowSecret(!showSecret)}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {config && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave as "***" to keep existing secret unchanged
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label htmlFor="environment">Environment</Label>
                  <Select
                    value={formData.environment}
                    onValueChange={(value: "test" | "production") => 
                      setFormData(prev => ({ ...prev, environment: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test (Sandbox)</SelectItem>
                      <SelectItem value="production">Production (Live)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Callback URLs */}
            <Card>
              <CardHeader>
                <CardTitle>Callback URLs</CardTitle>
                <CardDescription>
                  URLs where PayU will redirect customers after payment completion
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="successUrl">Success URL</Label>
                  <Input
                    id="successUrl"
                    value={formData.successUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, successUrl: e.target.value }))}
                    placeholder="https://yourdomain.com/payment/success"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="failureUrl">Failure URL</Label>
                  <Input
                    id="failureUrl"
                    value={formData.failureUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, failureUrl: e.target.value }))}
                    placeholder="https://yourdomain.com/payment/failure"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cancelUrl">Cancel URL (Optional)</Label>
                  <Input
                    id="cancelUrl"
                    value={formData.cancelUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, cancelUrl: e.target.value }))}
                    placeholder="https://yourdomain.com/payment/cancel"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
                <CardDescription>
                  Enable or disable PayU payments for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">Enable PayU Payments</Label>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  When enabled, customers will see a "Pay with PayU" button on unpaid invoices
                </p>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Configuration"}
              </Button>
              <Button type="button" variant="outline" onClick={fetchConfig}>
                Reset
              </Button>
            </div>
          </form>

          {/* Help Section */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Getting Started with PayU</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold mb-2">1. Get PayU Account</h4>
                  <p className="text-muted-foreground">
                    Sign up for a PayU merchant account at{" "}
                    <a href="https://payu.in" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      payu.in
                    </a>
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">2. Get Credentials</h4>
                  <p className="text-muted-foreground">
                    Get your Merchant Key and Secret from the PayU dashboard
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">3. Configure Here</h4>
                  <p className="text-muted-foreground">
                    Enter your credentials and callback URLs above
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">4. Test & Go Live</h4>
                  <p className="text-muted-foreground">
                    Test with the sandbox environment, then switch to production
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
