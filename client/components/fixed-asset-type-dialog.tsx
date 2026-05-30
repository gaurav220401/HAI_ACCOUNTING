"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  accountApi,
  type Account,
  type AccountType,
} from "@/lib/api/accounts";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountDialog } from "@/components/account-dialog";

interface FixedAssetTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (type: FixedAssetType) => void;
  onSaved?: (type: FixedAssetType) => void;
  mode?: "create" | "edit" | "clone";
  initialType?: FixedAssetType | null;
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

type AccountFieldKey =
  | "fixedAssetAccountId"
  | "accumulatedDepreciationAccountId"
  | "depreciationExpenseAccountId";

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

const NEW_ACCOUNT_VALUE = "__new_account__";
const FIXED_ASSET_ACCOUNT_TYPES: AccountType[] = ["Fixed Asset"];
const CONTRA_ASSET_ACCOUNT_TYPES: AccountType[] = ["Contra Asset"];
const DEPRECIATION_EXPENSE_ACCOUNT_TYPES: AccountType[] = [
  "Expense",
  "Other Expense",
];

function accountLabel(account: Account): string {
  const code = String(account.code || "").trim();
  return code ? `[ ${code} ] ${account.name}` : account.name;
}

function sortAccounts(rows: Account[]): Account[] {
  return [...rows].sort((a, b) => {
    const typeCmp = String(a.accountType || "").localeCompare(
      String(b.accountType || ""),
    );
    if (typeCmp !== 0) return typeCmp;
    const codeCmp = String(a.code || "").localeCompare(String(b.code || ""));
    if (codeCmp !== 0) return codeCmp;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

function getRefId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: string })._id);
  }
  return "";
}

export function FixedAssetTypeDialog({
  open,
  onOpenChange,
  onCreated,
  onSaved,
  mode = "create",
  initialType,
}: FixedAssetTypeDialogProps) {
  const [form, setForm] = useState<FormState>(defaultState);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createTargetField, setCreateTargetField] =
    useState<AccountFieldKey>("accumulatedDepreciationAccountId");
  const isEditMode = mode === "edit";
  const isCloneMode = mode === "clone";

  useEffect(() => {
    if (!open) return;

    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await accountApi.list({ excludeGroups: true });
        setAccounts(sortAccounts(res.data ?? []));
      } catch {
        toast.error("Failed to load chart of accounts");
      } finally {
        setLoadingAccounts(false);
      }
    };

    void loadAccounts();
  }, [open]);

  function openCreateAccountFor(field: AccountFieldKey) {
    setCreateTargetField(field);
    setCreateAccountOpen(true);
  }

  const createAccountTypes =
    createTargetField === "depreciationExpenseAccountId"
      ? DEPRECIATION_EXPENSE_ACCOUNT_TYPES
      : createTargetField === "accumulatedDepreciationAccountId"
        ? CONTRA_ASSET_ACCOUNT_TYPES
        : FIXED_ASSET_ACCOUNT_TYPES;

  function setCreatedAccountOnField(field: AccountFieldKey, accountId: string) {
    if (field === "fixedAssetAccountId") {
      setForm((prev) => ({
        ...prev,
        fixedAssetAccountId: accountId,
      }));
      return;
    }
    if (field === "accumulatedDepreciationAccountId") {
      setForm((prev) => ({
        ...prev,
        accumulatedDepreciationAccountId: accountId,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, depreciationExpenseAccountId: accountId }));
  }

  function handleAccountCreated(savedAccount?: Account) {
    if (!savedAccount?._id) return;
    setAccounts((prev) =>
      sortAccounts([
        ...prev.filter((account) => account._id !== savedAccount._id),
        savedAccount,
      ]),
    );
    setCreatedAccountOnField(createTargetField, savedAccount._id);
  }

  function renderGroupedAccountItems(options: Account[]) {
    const grouped = options.reduce<Record<string, Account[]>>((acc, account) => {
      const key = account.accountType || account.rootType || "Accounts";
      if (!acc[key]) acc[key] = [];
      acc[key].push(account);
      return acc;
    }, {});

    return Object.entries(grouped).map(([group, groupAccounts]) => (
      <SelectGroup key={group}>
        <SelectLabel className="text-xs font-semibold uppercase tracking-wide">
          {group}
        </SelectLabel>
        {groupAccounts.map((account) => (
          <SelectItem key={account._id} value={account._id}>
            {accountLabel(account)}
          </SelectItem>
        ))}
      </SelectGroup>
    ));
  }

  const fixedAssetAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "Fixed Asset"),
    [accounts],
  );

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.rootType === "Expense" && a.accountType !== "Cost Of Goods Sold"),
    [accounts],
  );

  const contraAssetAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "Contra Asset"),
    [accounts],
  );

  const accumulatedAccounts = useMemo(() => {
    return contraAssetAccounts;
  }, [contraAssetAccounts]);

  useEffect(() => {
    if (!open) return;

    const next: FormState = {
      ...defaultState,
      fixedAssetAccountId: fixedAssetAccounts[0]?._id || "",
      accumulatedDepreciationAccountId: accumulatedAccounts[0]?._id || "",
      depreciationExpenseAccountId:
        (expenseAccounts.find(
          (a) => a.name.toLowerCase() === "depreciation expense",
        ) ?? expenseAccounts[0])
          ?._id || "",
    };

    if ((isEditMode || isCloneMode) && initialType) {
      next.name =
        isCloneMode ? `${initialType.name} (Copy)` : String(initialType.name || "");
      next.depreciationMethod = initialType.depreciationMethod;
      next.depreciationPercentage =
        initialType.depreciationMethod === "Declining Balance" &&
        initialType.depreciationPercentage !== null &&
        initialType.depreciationPercentage !== undefined
          ? String(initialType.depreciationPercentage)
          : "";
      next.depreciationFrequency = initialType.depreciationFrequency;
      next.assetLifeValue = String(initialType.assetLifeValue || "12");
      next.assetLifeUnit = initialType.assetLifeUnit;
      next.computationType = initialType.computationType;
      next.fixedAssetAccountId =
        getRefId(initialType.fixedAssetAccountId) || next.fixedAssetAccountId;
      next.accumulatedDepreciationAccountId =
        getRefId(initialType.accumulatedDepreciationAccountId) ||
        next.accumulatedDepreciationAccountId;
      next.depreciationExpenseAccountId =
        getRefId(initialType.depreciationExpenseAccountId) ||
        next.depreciationExpenseAccountId;
    }

    setForm(next);
  }, [
    open,
    fixedAssetAccounts,
    accumulatedAccounts,
    expenseAccounts,
    initialType,
    isEditMode,
    isCloneMode,
  ]);

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
      toast.error("Please select all required account mappings");
      return;
    }

    if (form.fixedAssetAccountId === form.accumulatedDepreciationAccountId) {
      toast.error("Asset Account and Accumulated Depreciation Account cannot be the same GL account");
      return;
    }

    setSaving(true);
    try {
      const payload = {
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
      };

      const res =
        isEditMode && initialType?._id
          ? await fixedAssetApi.updateType(initialType._id, payload)
          : await fixedAssetApi.createType(payload);

      onSaved?.(res.data);
      onCreated?.(res.data);
      toast.success(
        isEditMode
          ? "Fixed asset type updated"
          : isCloneMode
            ? "Fixed asset type cloned"
            : "Fixed asset type created",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(
        (error as Error).message || "Failed to save fixed asset type",
      );
    } finally {
      setSaving(false);
    }
  }

  const accountSelectDisabled = loadingAccounts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode
              ? "Edit Fixed Asset Type"
              : isCloneMode
                ? "Clone Fixed Asset Type"
                : "New Fixed Asset Type"}
          </DialogTitle>
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
              onValueChange={(value) => {
                if (value === NEW_ACCOUNT_VALUE) {
                  openCreateAccountFor("fixedAssetAccountId");
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  fixedAssetAccountId: value,
                }));
              }}
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_ACCOUNT_VALUE} className="text-primary font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  New Account
                </SelectItem>
                <SelectSeparator />
                {fixedAssetAccounts.length === 0 ? (
                  <SelectItem value="__none_fixed" disabled>
                    No accounts available
                  </SelectItem>
                ) : (
                  renderGroupedAccountItems(fixedAssetAccounts)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-red-500">
              Accumulated Depreciation Account*
            </Label>
            <Select
              value={form.accumulatedDepreciationAccountId}
              onValueChange={(value) => {
                if (value === NEW_ACCOUNT_VALUE) {
                  openCreateAccountFor("accumulatedDepreciationAccountId");
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  accumulatedDepreciationAccountId: value,
                }));
              }}
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_ACCOUNT_VALUE} className="text-primary font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  New Account
                </SelectItem>
                <SelectSeparator />
                {accumulatedAccounts.length === 0 ? (
                  <SelectItem value="__none_acc" disabled>
                    No accounts available
                  </SelectItem>
                ) : (
                  renderGroupedAccountItems(accumulatedAccounts)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-red-500">
              Depreciation Expense Account*
            </Label>
            <Select
              value={form.depreciationExpenseAccountId}
              onValueChange={(value) => {
                if (value === NEW_ACCOUNT_VALUE) {
                  openCreateAccountFor("depreciationExpenseAccountId");
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  depreciationExpenseAccountId: value,
                }));
              }}
              disabled={accountSelectDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_ACCOUNT_VALUE} className="text-primary font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  New Account
                </SelectItem>
                <SelectSeparator />
                {expenseAccounts.length === 0 ? (
                  <SelectItem value="__none_exp" disabled>
                    No accounts available
                  </SelectItem>
                ) : (
                  renderGroupedAccountItems(expenseAccounts)
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
            {isEditMode ? "Save Changes" : "Save"}
          </Button>
        </div>

        <AccountDialog
          open={createAccountOpen}
          onOpenChange={setCreateAccountOpen}
          allAccounts={accounts}
          initialAccountType={
            createTargetField === "depreciationExpenseAccountId"
              ? "Expense"
              : createTargetField === "accumulatedDepreciationAccountId"
                ? "Contra Asset"
                : "Fixed Asset"
          }
          allowedAccountTypes={createAccountTypes}
          saveLabel="Save and Select"
          onSaved={handleAccountCreated}
        />
      </DialogContent>
    </Dialog>
  );
}
