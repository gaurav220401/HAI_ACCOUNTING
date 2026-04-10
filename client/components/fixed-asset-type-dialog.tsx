"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { accountApi, type Account } from "@/lib/api/accounts";
import {
  fixedAssetApi,
  type AssetLifeUnit,
  type ComputationType,
  type DepreciationFrequency,
  type DepreciationMethod,
  type FixedAssetType,
} from "@/lib/api/fixed-assets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FixedAssetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (type: FixedAssetType) => void;
}

interface FormState {
  name: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage: string;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: string;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  fixedAssetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
}

const defaultState: FormState = {
  name: "",
  depreciationMethod: "Straight Line",
  depreciationPercentage: "",
  depreciationFrequency: "Monthly",
  assetLifeValue: "12",
  assetLifeUnit: "Months",
  computationType: "Non Pro Rata",
  fixedAssetAccountId: "",
  accumulatedDepreciationAccountId: "",
  depreciationExpenseAccountId: "",
};

export function FixedAssetTypeDialog({
  open,
  onOpenChange,
  onCreated,
}: FixedAssetTypeDialogProps) {
  const [form, setForm] = useState<FormState>(defaultState);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await accountApi.list({ excludeGroups: true });
        setAccounts(res.data ?? []);
      } catch {
        toast.error("Failed to load chart of accounts");
      } finally {
        setLoadingAccounts(false);
      }
    };

    void loadAccounts();
  }, [open]);

  const fixedAssetAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "Fixed Asset"),
    [accounts],
  );

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.rootType === "Expense"),
    [accounts],
  );

  const accumulatedAccounts = useMemo(() => {
    if (fixedAssetAccounts.length > 0) return fixedAssetAccounts;
    return accounts;
  }, [fixedAssetAccounts, accounts]);

  useEffect(() => {
    if (!open) return;
    const next = { ...defaultState };
    if (fixedAssetAccounts[0])
      next.fixedAssetAccountId = fixedAssetAccounts[0]._id;
    if (accumulatedAccounts[0])
      next.accumulatedDepreciationAccountId = accumulatedAccounts[0]._id;
    if (expenseAccounts[0])
      next.depreciationExpenseAccountId = expenseAccounts[0]._id;
    setForm(next);
  }, [open, fixedAssetAccounts, accumulatedAccounts, expenseAccounts]);

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Fixed asset type name is required");
      return;
    }

    const life = Number(form.assetLifeValue || "0");
    if (!Number.isFinite(life) || life <= 0) {
      toast.error("Asset life must be greater than 0");
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
      toast.error("Please select all account mappings");
      return;
    }

    setSaving(true);
    try {
      const res = await fixedAssetApi.createType({
        name: form.name.trim(),
        depreciationMethod: form.depreciationMethod,
        depreciationPercentage:
          form.depreciationMethod === "Declining Balance" ?
            Number(form.depreciationPercentage)
          : undefined,
        depreciationFrequency: form.depreciationFrequency,
        assetLifeValue: life,
        assetLifeUnit: form.assetLifeUnit,
        computationType: form.computationType,
        fixedAssetAccountId: form.fixedAssetAccountId,
        accumulatedDepreciationAccountId: form.accumulatedDepreciationAccountId,
        depreciationExpenseAccountId: form.depreciationExpenseAccountId,
      });

      onCreated(res.data);
      toast.success("Fixed asset type created");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        (error as Error).message || "Failed to create fixed asset type",
      );
    } finally {
      setSaving(false);
    }
  }

  const accountSelectDisabled = loadingAccounts || accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Fixed Asset Type</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label className="text-red-500">Fixed Asset Type Name*</Label>
            <Input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="Furniture"
            />
          </div>

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
                <SelectItem value="Straight Line">Straight Line</SelectItem>
                <SelectItem value="Declining Balance">
                  Declining Balance
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.depreciationMethod === "Declining Balance" ?
            <div className="space-y-2">
              <Label className="text-red-500">Depreciation percentage*</Label>
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
            <Label className="text-red-500">Depreciation Frequency*</Label>
            <Select
              value={form.depreciationFrequency}
              onValueChange={(value: DepreciationFrequency) =>
                setForm((prev) => ({ ...prev, depreciationFrequency: value }))
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
                <SelectItem value="Non Pro Rata">Non Pro Rata</SelectItem>
                <SelectItem value="Pro Rata">Pro Rata</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-red-500">Fixed Asset Account*</Label>
            <Select
              value={form.fixedAssetAccountId}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, fixedAssetAccountId: value }))
              }
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {(fixedAssetAccounts.length > 0 ?
                  fixedAssetAccounts
                : accounts
                ).map((account) => (
                  <SelectItem key={account._id} value={account._id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
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
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accumulatedAccounts.map((account) => (
                  <SelectItem key={account._id} value={account._id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
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
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {(expenseAccounts.length > 0 ? expenseAccounts : accounts).map(
                  (account) => (
                    <SelectItem key={account._id} value={account._id}>
                      {account.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingAccounts}>
            {saving ?
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Plus className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
