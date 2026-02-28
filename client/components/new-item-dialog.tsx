"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ImageIcon, X } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { accountApi, type Account, type GroupedAccounts } from "@/lib/api/accounts";
import { itemApi, type CreateItemInput, type UnitOfMeasurement } from "@/lib/api/items";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormState {
  name: string;
  itemType: "Goods" | "Service";
  unit: string;
  // Sales
  hasSalesInfo: boolean;
  sellingPrice: string;
  salesAccountId: string;
  salesDescription: string;
  // Purchase
  hasPurchaseInfo: boolean;
  costPrice: string;
  purchaseAccountId: string;
  purchaseDescription: string;
  preferredVendorId: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  itemType: "Goods",
  unit: "",
  hasSalesInfo: true,
  sellingPrice: "",
  salesAccountId: "",
  salesDescription: "",
  hasPurchaseInfo: true,
  costPrice: "",
  purchaseAccountId: "",
  purchaseDescription: "",
  preferredVendorId: "",
};

// ─── Grouped Account Select ───────────────────────────────────────────────────

function AccountSelect({
  section,
  value,
  onChange,
  grouped,
}: {
  section: "sales" | "purchase";
  value: string;
  onChange: (v: string) => void;
  grouped: GroupedAccounts;
}) {
  const entries = Object.entries(grouped);
  if (entries.length === 0) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none" disabled>
            No accounts found — load CoA template first
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {entries.map(([groupName, accounts]) => (
          <SelectGroup key={groupName}>
            <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
              {groupName}
            </SelectLabel>
            {accounts.map((acc: Account) => (
              <SelectItem key={acc._id} value={acc._id}>
                {acc.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function NewItemDialog({ open, onOpenChange, onCreated }: NewItemDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [salesAccounts, setSalesAccounts] = useState<GroupedAccounts>({});
  const [purchaseAccounts, setPurchaseAccounts] = useState<GroupedAccounts>({});
  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadDropdowns = useCallback(async () => {
    try {
      const [salesRes, purchaseRes, unitsRes] = await Promise.all([
        accountApi.listForItem("sales"),
        accountApi.listForItem("purchase"),
        itemApi.listUnits(),
      ]);
      setSalesAccounts(salesRes.data ?? {});
      setPurchaseAccounts(purchaseRes.data ?? {});
      setUnits(unitsRes.data ?? []);
    } catch {
      // non-fatal — dropdowns just stay empty
    }
  }, []);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
      setErrors({});
      loadDropdowns();
    }
  }, [open, loadDropdowns]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.hasSalesInfo && !form.salesAccountId) errs.salesAccountId = "Account is required";
    if (form.hasPurchaseInfo && !form.purchaseAccountId) errs.purchaseAccountId = "Account is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CreateItemInput = {
        name: form.name.trim(),
        itemType: form.itemType,
        unit: form.unit || undefined,
      };
      if (form.hasSalesInfo) {
        payload.salesPrice = parseFloat(form.sellingPrice) || 0;
        payload.salesAccount = form.salesAccountId || undefined;
        payload.description = form.salesDescription || undefined;
      }
      if (form.hasPurchaseInfo) {
        payload.purchasePrice = parseFloat(form.costPrice) || 0;
        payload.purchaseAccount = form.purchaseAccountId || undefined;
      }
      await itemApi.create(payload);
      onCreated();
      onOpenChange(false);
    } catch (e: unknown) {
      setErrors({ general: (e as Error)?.message ?? "Failed to save item" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-lg font-semibold">New Item</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {errors.general && (
            <p className="text-sm text-destructive">{errors.general}</p>
          )}

          {/* Basic info row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left: fields */}
            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="item-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="item-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={errors.name ? "border-destructive" : ""}
                  autoFocus
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <Label>Type</Label>
                <RadioGroup
                  value={form.itemType}
                  onValueChange={(v: string) => set("itemType", v as "Goods" | "Service")}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Goods" id="type-goods" />
                    <Label htmlFor="type-goods" className="font-normal cursor-pointer">Goods</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Service" id="type-service" />
                    <Label htmlFor="type-service" className="font-normal cursor-pointer">Service</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Unit */}
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select or type to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u._id} value={u._id}>
                        {u.name} ({u.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: image upload placeholder */}
            <div className="flex items-center justify-center rounded-lg border border-dashed h-40 text-center text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="space-y-1">
                <ImageIcon className="h-8 w-8 mx-auto opacity-40" />
                <p className="text-xs">Drag image(s) here or</p>
                <p className="text-xs text-primary cursor-pointer">Browse images</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Sales Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sales-info"
                checked={form.hasSalesInfo}
                onCheckedChange={(c) => set("hasSalesInfo", !!c)}
              />
              <Label htmlFor="sales-info" className="font-semibold cursor-pointer">
                Sales Information
              </Label>
            </div>

            {form.hasSalesInfo && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 pl-6">
                {/* Selling Price */}
                <div className="space-y-1.5">
                  <Label>
                    Selling Price <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex">
                    <span className="flex items-center px-3 text-sm border border-r-0 rounded-l-md bg-muted text-muted-foreground">
                      INR
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.sellingPrice}
                      onChange={(e) => set("sellingPrice", e.target.value)}
                      className="rounded-l-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Sales Account */}
                <div className="space-y-1.5">
                  <Label>
                    Account <span className="text-destructive">*</span>
                  </Label>
                  <AccountSelect
                    section="sales"
                    value={form.salesAccountId}
                    onChange={(v) => set("salesAccountId", v)}
                    grouped={salesAccounts}
                  />
                  {errors.salesAccountId && (
                    <p className="text-xs text-destructive">{errors.salesAccountId}</p>
                  )}
                </div>

                {/* Sales Description */}
                <div className="col-span-2 space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={form.salesDescription}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("salesDescription", e.target.value)}
                    className="resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t" />

          {/* Purchase Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="purchase-info"
                checked={form.hasPurchaseInfo}
                onCheckedChange={(c) => set("hasPurchaseInfo", !!c)}
              />
              <Label htmlFor="purchase-info" className="font-semibold cursor-pointer">
                Purchase Information
              </Label>
            </div>

            {form.hasPurchaseInfo && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 pl-6">
                {/* Cost Price */}
                <div className="space-y-1.5">
                  <Label>
                    Cost Price <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex">
                    <span className="flex items-center px-3 text-sm border border-r-0 rounded-l-md bg-muted text-muted-foreground">
                      INR
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.costPrice}
                      onChange={(e) => set("costPrice", e.target.value)}
                      className="rounded-l-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {/* Purchase Account */}
                <div className="space-y-1.5">
                  <Label>
                    Account <span className="text-destructive">*</span>
                  </Label>
                  <AccountSelect
                    section="purchase"
                    value={form.purchaseAccountId}
                    onChange={(v) => set("purchaseAccountId", v)}
                    grouped={purchaseAccounts}
                  />
                  {errors.purchaseAccountId && (
                    <p className="text-xs text-destructive">{errors.purchaseAccountId}</p>
                  )}
                </div>

                {/* Purchase Description */}
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={form.purchaseDescription}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set("purchaseDescription", e.target.value)}
                    className="resize-none"
                  />
                </div>

                {/* Preferred Vendor */}
                <div className="space-y-1.5">
                  <Label>Preferred Vendor</Label>
                  <Select
                    value={form.preferredVendorId}
                    onValueChange={(v) => set("preferredVendorId", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" disabled>
                        No vendors yet
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t bg-muted/30">
          <Button onClick={handleSave} disabled={saving} className="min-w-[80px]">
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
