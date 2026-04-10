"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountApi, type Account } from "@/lib/api/accounts";
import {
  fixedAssetApi,
  type AssetLifeUnit,
  type ComputationType,
  type DepreciationFrequency,
  type DepreciationMethod,
  type FixedAssetType,
} from "@/lib/api/fixed-assets";
import { FixedAssetTypeDialog } from "@/components/fixed-asset-type-dialog";

type FormState = {
  assetName: string;
  purchaseValue: string;
  purchaseQuantity: string;
  currentQuantity: string;
  serialNumber: string;
  currentValue: string;
  disposalValue: string;
  fixedAssetTypeId: string;
  purchaseDate: string;
  warrantyExpirationDate: string;
  description: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage: string;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: string;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  depreciationStartDate: string;
  fixedAssetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
};

const today = new Date().toISOString().slice(0, 10);

function defaultForm(): FormState {
  return {
    assetName: "",
    purchaseValue: "",
    purchaseQuantity: "",
    currentQuantity: "",
    serialNumber: "",
    currentValue: "",
    disposalValue: "",
    fixedAssetTypeId: "",
    purchaseDate: today,
    warrantyExpirationDate: "",
    description: "",
    depreciationMethod: "Straight Line",
    depreciationPercentage: "",
    depreciationFrequency: "Monthly",
    assetLifeValue: "12",
    assetLifeUnit: "Months",
    computationType: "Non Pro Rata",
    depreciationStartDate: today,
    fixedAssetAccountId: "",
    accumulatedDepreciationAccountId: "",
    depreciationExpenseAccountId: "",
  };
}

function toNumber(input: string) {
  if (!input.trim()) return 0;
  const value = Number(input);
  return Number.isFinite(value) ? value : NaN;
}

function getRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: string })._id);
  }
  return "";
}

function MoneyInput({
  value,
  onChange,
  placeholder = "",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex rounded-md border border-input overflow-hidden">
      <span className="px-3 flex items-center text-sm text-muted-foreground bg-muted/40 border-r">
        INR
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 rounded-none focus-visible:ring-0"
        placeholder={placeholder}
        inputMode="decimal"
      />
    </div>
  );
}

export default function NewFixedAssetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [form, setForm] = useState<FormState>(defaultForm);
  const [assetTypes, setAssetTypes] = useState<FixedAssetType[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const loadInitial = useCallback(async () => {
    if (!activeOrganization?._id) return;
    setLoadingData(true);
    try {
      const [typesRes, accountsRes] = await Promise.all([
        fixedAssetApi.listTypes(),
        accountApi.list({ excludeGroups: true }),
      ]);

      setAssetTypes(typesRes.data ?? []);
      setAccounts(accountsRes.data ?? []);

      if (!cloneId) return;

      const cloned = await fixedAssetApi.getById(cloneId);
      const asset = cloned.data;
      setForm({
        assetName: asset.assetName,
        purchaseValue: String(asset.purchaseValue || ""),
        purchaseQuantity: String(asset.purchaseQuantity || ""),
        currentQuantity: String(asset.currentQuantity || ""),
        serialNumber: asset.serialNumber || "",
        currentValue: String(asset.currentValue || ""),
        disposalValue: String(asset.disposalValue || ""),
        fixedAssetTypeId: getRefId(asset.fixedAssetTypeId),
        purchaseDate: asset.purchaseDate?.slice(0, 10) || today,
        warrantyExpirationDate:
          asset.warrantyExpirationDate?.slice(0, 10) || "",
        description: asset.description || "",
        depreciationMethod: asset.depreciationMethod,
        depreciationPercentage: String(asset.depreciationPercentage || ""),
        depreciationFrequency: asset.depreciationFrequency,
        assetLifeValue: String(asset.assetLifeValue || ""),
        assetLifeUnit: asset.assetLifeUnit,
        computationType: asset.computationType,
        depreciationStartDate:
          asset.depreciationStartDate?.slice(0, 10) || today,
        fixedAssetAccountId: getRefId(asset.fixedAssetAccountId),
        accumulatedDepreciationAccountId: getRefId(
          asset.accumulatedDepreciationAccountId,
        ),
        depreciationExpenseAccountId: getRefId(
          asset.depreciationExpenseAccountId,
        ),
      });
    } catch (error) {
      toast.error((error as Error).message || "Failed to load form data");
    } finally {
      setLoadingData(false);
    }
  }, [activeOrganization?._id, cloneId]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && activeOrganization?._id) {
      void loadInitial();
    }
  }, [loading, orgLoading, firebaseUser, activeOrganization?._id, loadInitial]);

  const fixedAssetAccountOptions = useMemo(
    () => accounts.filter((account) => account.accountType === "Fixed Asset"),
    [accounts],
  );

  const expenseAccountOptions = useMemo(
    () => accounts.filter((account) => account.rootType === "Expense"),
    [accounts],
  );

  const accountOptionsForFixed =
    fixedAssetAccountOptions.length > 0 ? fixedAssetAccountOptions : accounts;
  const accountOptionsForAccumulated =
    fixedAssetAccountOptions.length > 0 ? fixedAssetAccountOptions : accounts;
  const accountOptionsForExpense =
    expenseAccountOptions.length > 0 ? expenseAccountOptions : accounts;

  function applyTypeDefaults(typeId: string) {
    const selected = assetTypes.find((type) => type._id === typeId);
    if (!selected) return;

    setForm((prev) => ({
      ...prev,
      fixedAssetTypeId: typeId,
      depreciationMethod: selected.depreciationMethod,
      depreciationPercentage:
        selected.depreciationMethod === "Declining Balance" ?
          String(
            selected.depreciationPercentage ||
              prev.depreciationPercentage ||
              "10",
          )
        : "",
      depreciationFrequency: selected.depreciationFrequency,
      assetLifeValue: String(selected.assetLifeValue),
      assetLifeUnit: selected.assetLifeUnit,
      computationType: selected.computationType,
      fixedAssetAccountId: getRefId(selected.fixedAssetAccountId),
      accumulatedDepreciationAccountId: getRefId(
        selected.accumulatedDepreciationAccountId,
      ),
      depreciationExpenseAccountId: getRefId(
        selected.depreciationExpenseAccountId,
      ),
    }));
  }

  async function handleSaveDraft() {
    if (!form.assetName.trim()) {
      toast.error("Fixed Asset Name is required");
      return;
    }
    if (!form.fixedAssetTypeId) {
      toast.error("Fixed Asset Type is required");
      return;
    }
    if (!form.purchaseDate) {
      toast.error("Purchase Date is required");
      return;
    }
    if (
      !form.depreciationMethod ||
      !form.depreciationFrequency ||
      !form.computationType
    ) {
      toast.error("Please complete depreciation details");
      return;
    }
    if (!form.assetLifeValue || Number(form.assetLifeValue) <= 0) {
      toast.error("Asset Life must be greater than 0");
      return;
    }
    if (form.depreciationMethod === "Declining Balance") {
      const percentage = Number(form.depreciationPercentage || "0");
      if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        toast.error("Depreciation percentage must be between 0 and 100");
        return;
      }
    }
    if (
      !form.fixedAssetAccountId ||
      !form.accumulatedDepreciationAccountId ||
      !form.depreciationExpenseAccountId
    ) {
      toast.error("Please select all account details");
      return;
    }

    const purchaseValue = toNumber(form.purchaseValue);
    const purchaseQuantity = toNumber(form.purchaseQuantity || "1");
    const currentQuantity = toNumber(
      form.currentQuantity || form.purchaseQuantity || "1",
    );
    const currentValue = toNumber(
      form.currentValue || form.purchaseValue || "0",
    );
    const disposalValue = toNumber(form.disposalValue || "0");

    if (
      [
        purchaseValue,
        purchaseQuantity,
        currentQuantity,
        currentValue,
        disposalValue,
      ].some((value) => Number.isNaN(value))
    ) {
      toast.error("Please enter valid numeric values");
      return;
    }

    setSaving(true);
    try {
      await fixedAssetApi.create({
        assetName: form.assetName.trim(),
        purchaseValue,
        purchaseQuantity,
        currentQuantity,
        serialNumber: form.serialNumber.trim() || undefined,
        currentValue,
        disposalValue,
        fixedAssetTypeId: form.fixedAssetTypeId,
        purchaseDate: form.purchaseDate,
        warrantyExpirationDate: form.warrantyExpirationDate || null,
        description: form.description.trim() || undefined,
        depreciationMethod: form.depreciationMethod,
        depreciationPercentage:
          form.depreciationMethod === "Declining Balance" ?
            Number(form.depreciationPercentage)
          : undefined,
        depreciationFrequency: form.depreciationFrequency,
        assetLifeValue: Number(form.assetLifeValue),
        assetLifeUnit: form.assetLifeUnit,
        computationType: form.computationType,
        depreciationStartDate: form.depreciationStartDate || form.purchaseDate,
        fixedAssetAccountId: form.fixedAssetAccountId,
        accumulatedDepreciationAccountId: form.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: form.depreciationExpenseAccountId,
        status: "DRAFT",
      });

      toast.success("Fixed asset saved as draft");
      router.push("/accountant/fixed-assets");
    } catch (error) {
      toast.error((error as Error).message || "Failed to save fixed asset");
    } finally {
      setSaving(false);
    }
  }

  function renderAccountOptions(options: Account[]) {
    return options.map((account) => (
      <SelectItem key={account._id} value={account._id}>
        {account.name}
      </SelectItem>
    ));
  }

  if (loadingData) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader
            breadcrumb={
              <span className="font-medium">Accountant / Fixed Assets</span>
            }
          />
          <main className="p-6">
            <div className="h-[60vh] flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading form...
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => router.push("/accountant/fixed-assets")}
                className="text-primary hover:underline inline-flex items-center"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Fixed Assets
              </button>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">New Fixed Asset</span>
            </div>
          }
        />

        <main className="p-4 md:p-6">
          <div className="rounded-lg border bg-background">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h1 className="text-2xl font-semibold">New Fixed Asset</h1>
            </div>

            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-red-500">Fixed Asset Name*</Label>
                  <Input
                    value={form.assetName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        assetName: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Fixed Asset#</Label>
                  <Input
                    value="Auto Generated"
                    readOnly
                    className="bg-muted/40"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-red-500">Purchase Value*</Label>
                  <MoneyInput
                    value={form.purchaseValue}
                    onChange={(purchaseValue) =>
                      setForm((prev) => ({ ...prev, purchaseValue }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Purchase Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.purchaseQuantity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        purchaseQuantity: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Serial Number</Label>
                  <Input
                    value={form.serialNumber}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        serialNumber: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Current Quantity</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.currentQuantity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        currentQuantity: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Current Value</Label>
                  <MoneyInput
                    value={form.currentValue}
                    onChange={(currentValue) =>
                      setForm((prev) => ({ ...prev, currentValue }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-red-500">Purchase Date*</Label>
                  <Input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        purchaseDate: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Disposal Value</Label>
                  <MoneyInput
                    value={form.disposalValue}
                    onChange={(disposalValue) =>
                      setForm((prev) => ({ ...prev, disposalValue }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Warranty Expiration Date</Label>
                  <Input
                    type="date"
                    value={form.warrantyExpirationDate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        warrantyExpirationDate: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-red-500">Fixed Asset Type*</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => setTypeDialogOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add New Fixed Asset
                      Type
                    </Button>
                  </div>
                  <Select
                    value={form.fixedAssetTypeId}
                    onValueChange={applyTypeDefaults}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fixed asset type" />
                    </SelectTrigger>
                    <SelectContent>
                      {assetTypes.map((type) => (
                        <SelectItem key={type._id} value={type._id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="min-h-24"
                  />
                </div>
              </div>

              <Separator />

              <section className="space-y-4">
                <h2 className="text-2xl font-medium">Depreciation Details</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-red-500">Depreciation Method*</Label>
                    <Select
                      value={form.depreciationMethod}
                      onValueChange={(value: DepreciationMethod) =>
                        setForm((prev) => ({
                          ...prev,
                          depreciationMethod: value,
                          depreciationPercentage:
                            value === "Declining Balance" ?
                              prev.depreciationPercentage || "10"
                            : "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Straight Line">
                          Straight Line
                        </SelectItem>
                        <SelectItem value="Declining Balance">
                          Declining Balance
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.depreciationMethod === "Declining Balance" ?
                    <div className="space-y-2">
                      <Label className="text-red-500">
                        Depreciation percentage*
                      </Label>
                      <Input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={form.depreciationPercentage}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            depreciationPercentage: e.target.value,
                          }))
                        }
                      />
                    </div>
                  : null}

                  <div className="space-y-2">
                    <Label className="text-red-500">Computation Type*</Label>
                    <Select
                      value={form.computationType}
                      onValueChange={(value: ComputationType) =>
                        setForm((prev) => ({ ...prev, computationType: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Non Pro Rata">
                          Non Pro Rata
                        </SelectItem>
                        <SelectItem value="Pro Rata">Pro Rata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-red-500">
                      Depreciation Frequency*
                    </Label>
                    <Select
                      value={form.depreciationFrequency}
                      onValueChange={(value: DepreciationFrequency) =>
                        setForm((prev) => ({
                          ...prev,
                          depreciationFrequency: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                        <SelectItem value="Yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Depreciation Start Date</Label>
                    <Input
                      type="date"
                      value={form.depreciationStartDate}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          depreciationStartDate: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-red-500">Asset Life*</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        value={form.assetLifeValue}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            assetLifeValue: e.target.value,
                          }))
                        }
                        className="flex-1"
                      />
                      <Select
                        value={form.assetLifeUnit}
                        onValueChange={(value: AssetLifeUnit) =>
                          setForm((prev) => ({ ...prev, assetLifeUnit: value }))
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Months">Months</SelectItem>
                          <SelectItem value="Days">Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-4">
                <h2 className="text-2xl font-medium">Account Details</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-red-500">Fixed Asset Account*</Label>
                    <Select
                      value={form.fixedAssetAccountId}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          fixedAssetAccountId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {renderAccountOptions(accountOptionsForFixed)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-red-500">
                      Accumulated Depreciation Account*
                    </Label>
                    <Select
                      value={form.accumulatedDepreciationAccountId}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          accumulatedDepreciationAccountId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {renderAccountOptions(accountOptionsForAccumulated)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-red-500">
                      Depreciation Expense Account*
                    </Label>
                    <Select
                      value={form.depreciationExpenseAccountId}
                      onValueChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          depreciationExpenseAccountId: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {renderAccountOptions(accountOptionsForExpense)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-between">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
              >
                Preview Depreciation Entries
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/accountant/fixed-assets")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveDraft} disabled={saving}>
                  {saving ?
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : null}
                  Save as Draft
                </Button>
              </div>
            </div>
          </div>
        </main>

        <FixedAssetTypeDialog
          open={typeDialogOpen}
          onOpenChange={setTypeDialogOpen}
          onCreated={(created) => {
            setAssetTypes((prev) => {
              const next = [...prev, created];
              return next.sort((a, b) => a.name.localeCompare(b.name));
            });
            applyTypeDefaults(created._id);
          }}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
