"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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
import { settingsApi, type Tax, type TaxType } from "@/lib/api/settings";

type TaxFormState = {
  name: string;
  taxType: TaxType;
  rate: string;
  isActive: "true" | "false";
};

const EMPTY_FORM: TaxFormState = {
  name: "",
  taxType: "Tax",
  rate: "",
  isActive: "true",
};

export default function TaxesSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, loading: orgLoading, needsOrgSetup } = useOrganization();

  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxFormState>(EMPTY_FORM);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  async function loadTaxes() {
    if (!activeOrganization?._id) return;
    setFetching(true);
    try {
      const res = await settingsApi.taxes.list();
      let items = res.data || [];
      // Auto-seed defaults if list is empty (first visit or after reset)
      if (items.length === 0) {
        await settingsApi.taxes.seed();
        const res2 = await settingsApi.taxes.list();
        items = res2.data || [];
      }
      setTaxes(items);
    } catch {
      toast.error("Failed to load taxes");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void loadTaxes();
  }, [activeOrganization?._id]);

  const canSave = useMemo(() => {
    if (!form.name.trim()) return false;
    if (form.taxType === "Tax") {
      const parsed = Number(form.rate || "0");
      return Number.isFinite(parsed) && parsed >= 0;
    }
    return true;
  }, [form]);

  function startEdit(tax: Tax) {
    setEditingId(tax._id);
    setForm({
      name: tax.name || "",
      taxType: tax.taxType || "Tax",
      rate: typeof tax.rate === "number" ? String(tax.rate) : "",
      isActive: tax.isActive ? "true" : "false",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSaveTax() {
    if (!canSave) {
      toast.error("Please fill required tax fields");
      return;
    }

    const rate = form.taxType === "Tax" ? Number(form.rate || "0") : undefined;
    const payload = {
      name: form.name.trim(),
      taxType: form.taxType,
      rate,
      isActive: form.isActive === "true",
    };

    setSaving(true);
    try {
      if (editingId) {
        await settingsApi.taxes.update(editingId, payload as any);
        toast.success("Tax updated");
      } else {
        await settingsApi.taxes.create(payload as any);
        toast.success("Tax created");
      }
      resetForm();
      await loadTaxes();
    } catch {
      toast.error(editingId ? "Failed to update tax" : "Failed to create tax");
    } finally {
      setSaving(false);
    }
  }

  async function handleSeedTaxes() {
    setSeeding(true);
    try {
      await settingsApi.taxes.seed();
      await loadTaxes();
      toast.success("Default taxes ready");
    } catch {
      toast.error("Failed to seed taxes");
    } finally {
      setSeeding(false);
    }
  }

  async function handleDeleteTax(id: string) {
    if (!confirm("Delete this tax?")) return;
    try {
      await settingsApi.taxes.remove(id);
      setTaxes((prev) => prev.filter((t) => t._id !== id));
      if (editingId === id) resetForm();
      toast.success("Tax deleted");
    } catch {
      toast.error("Failed to delete tax");
    }
  }

  return (
    <SetupConfigShell
      title="Taxes"
      subtitle="Create, edit, and seed tax masters used across sales and purchases."
      actions={(
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={handleSeedTaxes} disabled={seeding || fetching}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-2">Seed Defaults</span>
          </Button>
          <Button onClick={handleSaveTax} disabled={!canSave || saving || fetching}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">{editingId ? "Update Tax" : "Save Tax"}</span>
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <section className="rounded-lg border p-4">
          <h2 className="font-medium mb-4">{editingId ? "Edit Tax" : "New Tax"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. GST 18%"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tax Type</Label>
              <Select value={form.taxType} onValueChange={(value) => setForm((p) => ({ ...p, taxType: value as TaxType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tax">Tax</SelectItem>
                  <SelectItem value="TaxGroup">TaxGroup</SelectItem>
                  <SelectItem value="CompoundTax">CompoundTax</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Rate (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm((p) => ({ ...p, rate: e.target.value }))}
                disabled={form.taxType !== "Tax"}
                placeholder={form.taxType === "Tax" ? "e.g. 18" : "Not used for this type"}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.isActive} onValueChange={(value) => setForm((p) => ({ ...p, isActive: value as "true" | "false" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {editingId && (
            <div className="mt-3">
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel editing</Button>
            </div>
          )}
        </section>

        <section className="rounded-lg border p-4">
          <h2 className="font-medium mb-4">Tax List</h2>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-44">Actions</th>
                </tr>
              </thead>
              <tbody>
                {taxes.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-muted-foreground" colSpan={5}>
                      {fetching ? "Loading taxes…" : "No taxes available. Click Seed Defaults to initialize."}
                    </td>
                  </tr>
                )}
                {taxes.map((tax) => (
                  <tr key={tax._id} className="border-t">
                    <td className="px-3 py-2">{tax.name}</td>
                    <td className="px-3 py-2">{tax.taxType}</td>
                    <td className="px-3 py-2">{typeof tax.rate === "number" ? `${tax.rate}%` : "-"}</td>
                    <td className="px-3 py-2">{tax.isActive ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(tax)}>
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteTax(tax._id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </SetupConfigShell>
  );
}
