"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accountApi,
  type Account,
  type AccountType,
  type AccountRootType,
  type CreateAccountInput,
} from "@/lib/api/accounts";
import { fixedAssetApi, type FixedAssetType } from "@/lib/api/fixed-assets";

// ─── Account type metadata ───────────────────────────────────────────────────

type AccountTypeMeta = {
  label: string;
  rootType: AccountRootType;
  description: string;
  bullets?: string[];
};

const ACCOUNT_TYPE_META: Record<AccountType, AccountTypeMeta> = {
  // Asset
  "Other Asset": {
    label: "Other Asset",
    rootType: "Asset",
    description: "Track special assets like goodwill and other intangible assets.",
  },
  "Other Current Asset": {
    label: "Other Current Asset",
    rootType: "Asset",
    description: "Any short term asset that can be converted into cash or cash equivalents easily.",
    bullets: ["Prepaid expenses", "Stocks and Mutual Funds"],
  },
  "Cash": {
    label: "Cash",
    rootType: "Asset",
    description: "The cash balance you have on hand.",
    bullets: ["Petty cash", "Cash in drawer"],
  },
  "Bank": {
    label: "Bank",
    rootType: "Asset",
    description: "The checking or savings account you have at your bank.",
  },
  "Fixed Asset": {
    label: "Fixed Asset",
    rootType: "Asset",
    description: "Long term tangible assets used in business operations.",
    bullets: ["Machinery and equipment", "Furniture & fixtures"],
  },
  "Accounts Receivable": {
    label: "Accounts Receivable",
    rootType: "Asset",
    description: "The amount of money your customers owe you for goods or services rendered.",
  },
  "Stock": {
    label: "Stock",
    rootType: "Asset",
    description: "Track the value of goods you hold in stock.",
    bullets: ["Finished goods", "Raw materials inventory"],
  },
  "Payment Clearing Account": {
    label: "Payment Clearing Account",
    rootType: "Asset",
    description: "A temporary account to hold payments in transit before they clear.",
  },
  "Intangible Asset": {
    label: "Intangible Asset",
    rootType: "Asset",
    description: "Non-physical long-term assets.",
    bullets: ["Patents and trademarks", "Software licenses"],
  },
  "Non Current Asset": {
    label: "Non Current Asset",
    rootType: "Asset",
    description: "Long-term assets not expected to be converted to cash within a year.",
  },
  "Deferred Tax Asset": {
    label: "Deferred Tax Asset",
    rootType: "Asset",
    description: "Taxes paid in advance or overpaid that can be recovered in future periods.",
  },
  // Liability
  "Other Current Liability": {
    label: "Other Current Liability",
    rootType: "Liability",
    description: "Short term financial obligations due within a year.",
    bullets: ["Wages payable", "GST/VAT payable"],
  },
  "Credit Card": {
    label: "Credit Card",
    rootType: "Liability",
    description: "Track credit card transactions and outstanding balances.",
  },
  "Non Current Liability": {
    label: "Non Current Liability",
    rootType: "Liability",
    description: "Long-term financial obligations not due within a year.",
    bullets: ["Bank loans", "Debentures"],
  },
  "Other Liability": {
    label: "Other Liability",
    rootType: "Liability",
    description: "Other financial obligations that do not fall under standard categories.",
  },
  "Accounts Payable": {
    label: "Accounts Payable",
    rootType: "Liability",
    description: "The amount of money you owe to your vendors for goods or services received.",
  },
  "Overseas Tax Payable": {
    label: "Overseas Tax Payable",
    rootType: "Liability",
    description: "Taxes payable to overseas tax authorities.",
  },
  "Deferred Tax Liability": {
    label: "Deferred Tax Liability",
    rootType: "Liability",
    description: "Taxes owed but not yet paid, deferred to a future period.",
  },
  // Equity
  "Equity": {
    label: "Equity",
    rootType: "Equity",
    description: "Owner's equity, retained earnings, and shareholders' funds.",
    bullets: ["Capital contributed", "Retained earnings"],
  },
  // Income
  "Income": {
    label: "Income",
    rootType: "Income",
    description: "Income from your primary business activities.",
    bullets: ["Sales revenue", "Service fees"],
  },
  "Other Income": {
    label: "Other Income",
    rootType: "Income",
    description: "Income from activities outside your primary business.",
    bullets: ["Interest received", "Gain on sale of assets"],
  },
  // Expense
  "Expense": {
    label: "Expense",
    rootType: "Expense",
    description: "Operating expenses incurred in running your business.",
    bullets: ["Rent", "Salaries", "Utilities"],
  },
  "Cost Of Goods Sold": {
    label: "Cost Of Goods Sold",
    rootType: "Expense",
    description: "Direct costs attributable to the production of the goods sold.",
    bullets: ["Material and Labor costs", "Cost of obtaining raw materials"],
  },
  "Other Expense": {
    label: "Other Expense",
    rootType: "Expense",
    description: "Expenses from activities outside your primary business operations.",
  },
};

// Grouped for the select dropdown
const ACCOUNT_TYPE_GROUPS: Array<{ rootType: AccountRootType; types: AccountType[] }> = [
  {
    rootType: "Asset",
    types: [
      "Other Asset", "Other Current Asset", "Cash", "Bank", "Fixed Asset",
      "Accounts Receivable", "Stock", "Payment Clearing Account",
      "Intangible Asset", "Non Current Asset", "Deferred Tax Asset",
    ],
  },
  {
    rootType: "Liability",
    types: [
      "Other Current Liability", "Credit Card", "Non Current Liability",
      "Other Liability", "Accounts Payable", "Overseas Tax Payable", "Deferred Tax Liability",
    ],
  },
  { rootType: "Equity", types: ["Equity"] },
  { rootType: "Income", types: ["Income", "Other Income"] },
  { rootType: "Expense", types: ["Expense", "Cost Of Goods Sold", "Other Expense"] },
];

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (savedAccount?: Account) => void;
  /** Pass account to edit mode, undefined for create */
  editAccount?: Account | null;
  allAccounts: Account[];
  initialAccountType?: AccountType;
  allowedAccountTypes?: AccountType[];
  saveLabel?: string;
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

export function AccountDialog({
  open,
  onOpenChange,
  onSaved,
  editAccount,
  allAccounts,
  initialAccountType,
  allowedAccountTypes,
  saveLabel,
}: AccountDialogProps) {
  const isEdit = !!editAccount;
  const isPredefined = Boolean(editAccount?.isSystemAccount);

  const allowedTypeSet = useMemo(() => {
    const list =
      allowedAccountTypes && allowedAccountTypes.length > 0
        ? allowedAccountTypes
        : (Object.keys(ACCOUNT_TYPE_META) as AccountType[]);
    return new Set<AccountType>(list);
  }, [allowedAccountTypes]);

  const groupedTypeOptions = useMemo(
    () =>
      ACCOUNT_TYPE_GROUPS.map((group) => ({
        rootType: group.rootType,
        types: group.types.filter((type) => allowedTypeSet.has(type)),
      })).filter((group) => group.types.length > 0),
    [allowedTypeSet],
  );

  const defaultCreateType = useMemo<AccountType>(() => {
    if (initialAccountType && allowedTypeSet.has(initialAccountType)) {
      return initialAccountType;
    }
    return groupedTypeOptions[0]?.types[0] || "Other Asset";
  }, [initialAccountType, allowedTypeSet, groupedTypeOptions]);

  const [accountType, setAccountType] = useState<AccountType>("Other Asset");
  const [name, setName] = useState("");
  const [isSubAccount, setIsSubAccount] = useState(false);
  const [parentId, setParentId] = useState("");
  const [code, setCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [description, setDescription] = useState("");
  const [createItemAsFixedAsset, setCreateItemAsFixedAsset] = useState(false);
  const [fixedAssetTypeId, setFixedAssetTypeId] = useState("");
  const [fixedAssetTypes, setFixedAssetTypes] = useState<FixedAssetType[]>([]);
  const [loadingFixedAssetTypes, setLoadingFixedAssetTypes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    if (editAccount) {
      setAccountType(editAccount.accountType as AccountType);
      setName(editAccount.name);
      setCode(editAccount.code ?? "");
      setAccountNumber(editAccount.accountNumber ?? "");
      setIfsc(editAccount.ifsc ?? "");
      setCurrency(editAccount.currency || "INR");
      setDescription(editAccount.description ?? "");
      setParentId(editAccount.parentId ?? "");
      setIsSubAccount(!!editAccount.parentId);
      setCreateItemAsFixedAsset(Boolean(editAccount.createItemAsFixedAsset));
      setFixedAssetTypeId(String(editAccount.fixedAssetTypeId || ""));
    } else {
      setAccountType(defaultCreateType);
      setName("");
      setCode("");
      setAccountNumber("");
      setIfsc("");
      setCurrency("INR");
      setDescription("");
      setParentId("");
      setIsSubAccount(false);
      setCreateItemAsFixedAsset(false);
      setFixedAssetTypeId("");
    }
    setErrors({});
  }, [open, editAccount, defaultCreateType]);

  useEffect(() => {
    if (!open) return;
    let isCancelled = false;

    async function loadFixedAssetTypes() {
      setLoadingFixedAssetTypes(true);
      try {
        const res = await fixedAssetApi.listTypes();
        if (!isCancelled) {
          const sorted = [...(res.data || [])].sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || "")),
          );
          setFixedAssetTypes(sorted);
        }
      } catch {
        if (!isCancelled) {
          setFixedAssetTypes([]);
        }
      } finally {
        if (!isCancelled) {
          setLoadingFixedAssetTypes(false);
        }
      }
    }

    void loadFixedAssetTypes();

    return () => {
      isCancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || isEdit) return;
    if (!allowedTypeSet.has(accountType)) {
      setAccountType(defaultCreateType);
    }
  }, [open, isEdit, accountType, allowedTypeSet, defaultCreateType]);

  useEffect(() => {
    if (accountType === "Fixed Asset") return;
    setCreateItemAsFixedAsset(false);
    setFixedAssetTypeId("");
  }, [accountType]);

  const meta = ACCOUNT_TYPE_META[accountType];
  const selectedRootType = meta?.rootType;

  // Parent candidates: same rootType group accounts
  const parentCandidates = allAccounts.filter(
    (a) => a.rootType === selectedRootType && a._id !== editAccount?._id,
  );

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Account name is required";
    if (isSubAccount && !parentId) e.parentId = "Please select a parent account";
    if (accountType === "Fixed Asset" && createItemAsFixedAsset && !fixedAssetTypeId) {
      e.fixedAssetTypeId = "Please select Fixed Asset Type";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const input: CreateAccountInput = {
        name: name.trim(),
        accountType,
        rootType: selectedRootType,
        code: code.trim() || undefined,
        accountNumber: accountType === "Bank" ? accountNumber.trim() || undefined : undefined,
        ifsc: accountType === "Bank" ? ifsc.trim().toUpperCase() || undefined : undefined,
        currency: accountType === "Bank" ? currency : undefined,
        description: description.trim() || undefined,
        parentId: isSubAccount && parentId ? parentId : undefined,
        createItemAsFixedAsset:
          accountType === "Fixed Asset" ? createItemAsFixedAsset : false,
        fixedAssetTypeId:
          accountType === "Fixed Asset" && createItemAsFixedAsset
            ? fixedAssetTypeId
            : undefined,
      };
      let savedAccount: Account | undefined;
      if (isEdit && editAccount) {
        const res = await accountApi.update(editAccount._id, input);
        savedAccount = res.data;
      } else {
        const res = await accountApi.create(input);
        savedAccount = res.data;
      }
      onSaved(savedAccount);
      onOpenChange(false);
    } catch (e: unknown) {
      setErrors({ general: (e as Error)?.message ?? "Failed to save account" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,52rem)] max-w-[52rem] max-h-[92vh] p-0 gap-0 overflow-hidden grid grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">
            {isEdit ? "Edit Account" : "Create Account"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {errors.general && (
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{errors.general}</p>
          )}

          {/* Account Type + description tooltip side-by-side */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="flex-1 space-y-1.5">
              <Label className="font-medium">
                Account Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={accountType}
                disabled={isEdit && isPredefined}
                onValueChange={(v) => {
                  setAccountType(v as AccountType);
                  setParentId(""); // reset parent when type changes
                  if (v !== "Bank") {
                    setAccountNumber("");
                    setIfsc("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={6} className="max-h-[min(60vh,22rem)]">
                  {groupedTypeOptions.map((g) => (
                    <SelectGroup key={g.rootType}>
                      <SelectLabel className="text-xs font-bold uppercase tracking-wide text-muted-foreground px-2 py-1">
                        {g.rootType}
                      </SelectLabel>
                      {g.types.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ACCOUNT_TYPE_META[t].label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              {isEdit && isPredefined && (
                <p className="text-xs text-muted-foreground">
                  Predefined account type is locked. You can still edit name, code, description, and sub-account.
                </p>
              )}
            </div>

            {/* Description card */}
            {meta && (
              <div className="w-full lg:w-56 rounded-lg bg-slate-800 text-white p-3 text-xs leading-relaxed shrink-0 mt-1 lg:mt-6">
                <p className="font-semibold mb-1">{meta.label}</p>
                <p className="text-slate-400 mb-1.5">Root Type: {selectedRootType}</p>
                <p className="text-slate-300">{meta.description}</p>
                {meta.bullets && (
                  <ul className="mt-2 space-y-0.5 list-disc list-inside text-slate-300">
                    {meta.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Account Name */}
          <div className="space-y-1.5">
            <Label className="font-medium">
              Account Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={errors.name ? "border-destructive" : ""}
              placeholder="Enter account name"
              autoFocus={!isEdit}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Make this a sub-account */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sub-account"
                checked={isSubAccount}
                onCheckedChange={(c) => {
                  setIsSubAccount(!!c);
                  if (!c) setParentId("");
                }}
              />
              <Label htmlFor="sub-account" className="font-normal cursor-pointer flex items-center gap-1.5">
                Make this a sub-account
                <span className="text-muted-foreground text-xs">
                  (Select this option if you are creating a sub-account.)
                </span>
              </Label>
            </div>

            {isSubAccount && (
              <div className="pl-6 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Parent Account</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className={errors.parentId ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select parent account" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={6} className="max-h-[min(50vh,16rem)]">
                    {parentCandidates.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No accounts of type {selectedRootType} yet
                      </SelectItem>
                    ) : (
                      parentCandidates.map((pa) => (
                        <SelectItem key={pa._id} value={pa._id}>
                          {pa.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.parentId && <p className="text-xs text-destructive">{errors.parentId}</p>}
              </div>
            )}
          </div>

          {/* Account Code */}
          <div className="space-y-1.5">
            <Label className="font-medium">Account Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 1001"
              className="max-w-xs"
            />
          </div>

          {accountType === "Fixed Asset" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="create-item-as-fixed-asset"
                  checked={createItemAsFixedAsset}
                  onCheckedChange={(checked) => {
                    const enabled = Boolean(checked);
                    setCreateItemAsFixedAsset(enabled);
                    if (!enabled) setFixedAssetTypeId("");
                  }}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="create-item-as-fixed-asset" className="font-medium cursor-pointer">
                    Create Item as Fixed Asset
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When this account is associated with a line item in a transaction, create the item as a fixed asset.
                  </p>
                </div>
              </div>

              {createItemAsFixedAsset && (
                <div className="pl-6 space-y-1.5">
                  <Label className="font-medium">
                    Fixed Asset Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={fixedAssetTypeId || undefined}
                    onValueChange={setFixedAssetTypeId}
                    disabled={loadingFixedAssetTypes}
                  >
                    <SelectTrigger className={errors.fixedAssetTypeId ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select the Fixed Asset Type" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={6} className="max-h-64">
                      {fixedAssetTypes.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          {loadingFixedAssetTypes
                            ? "Loading fixed asset types..."
                            : "No active fixed asset types found"}
                        </SelectItem>
                      ) : (
                        fixedAssetTypes.map((type) => (
                          <SelectItem key={type._id} value={type._id}>
                            {type.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.fixedAssetTypeId && (
                    <p className="text-xs text-destructive">{errors.fixedAssetTypeId}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {accountType === "Bank" && (
            <>
              <div className="space-y-1.5">
                <Label className="font-medium">Account Number</Label>
                <Input
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Enter bank account number"
                  className="max-w-md"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">IFSC</Label>
                <Input
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  className="max-w-md"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-medium">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={6} className="max-h-56">
                    {CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder="Max. 500 characters"
              maxLength={500}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t bg-muted/20">
          <Button onClick={handleSave} disabled={saving} className="min-w-[72px]">
            {saving ? "Saving..." : saveLabel || "Save"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
