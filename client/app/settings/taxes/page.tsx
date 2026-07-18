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
import { cn } from "@/lib/utils";

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
          <Button type="button" variant="outline" onClick={handleSeedTaxes} disabled={seeding || fetching} className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md">
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1.5">Seed Defaults</span>
          </Button>
          <Button onClick={handleSaveTax} disabled={!canSave || saving || fetching} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{editingId ? "Update Tax" : "Save Tax"}</span>
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-4">{editingId ? "Edit Tax" : "New Tax"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
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
            <div className="mt-4">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100/70 rounded-md">Cancel editing</Button>
            </div>
          )}
        </section>

        <section className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl">
          <h2 className="text-sm font-semibold text-slate-800 border-b pb-2 mb-4">Tax List</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {[
                    { label: "Name", cls: "text-left" },
                    { label: "Type", cls: "text-left" },
                    { label: "Rate", cls: "text-left" },
                    { label: "Status", cls: "text-left" },
                  ].map(({ label, cls }) => (
                    <th key={label} className={cn(
                      "text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap",
                      cls
                    )}>{label}</th>
                  ))}
                  <th className="w-44 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {taxes.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-400 text-sm" colSpan={5}>
                      {fetching ? "Loading taxes…" : "No taxes available. Click Seed Defaults to initialize."}
                    </td>
                  </tr>
                )}
                {taxes.map((tax) => (
                  <tr key={tax._id} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/20 transition-colors">
                    <td className="px-4 py-2 font-medium text-slate-750">{tax.name}</td>
                    <td className="px-4 py-2 text-slate-650">{tax.taxType}</td>
                    <td className="px-4 py-2 text-slate-650 font-mono">{typeof tax.rate === "number" ? `${tax.rate}%` : "-"}</td>
                    <td className="px-4 py-2 text-xs">
                      {tax.isActive ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          <span className="h-1 w-1 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-505 border border-slate-200">
                          <span className="h-1 w-1 rounded-full bg-slate-400" />
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(tax)} className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-semibold text-xs py-1 px-2.5 h-7">
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteTax(tax._id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md h-7 w-7">
                          <Trash2 className="h-4 w-4 text-rose-650" />
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
