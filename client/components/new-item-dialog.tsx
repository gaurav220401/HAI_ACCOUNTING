"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ImageIcon, Upload, Trash2, Loader2 } from "lucide-react";
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
import { uploadApi } from "@/lib/api/upload";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NewItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormState {
  name: string;
  sku: string;
  itemType: "Goods" | "Service";
  unit: string;
  hsnSacCode: string;
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
  // Tax
  taxPreference: "Taxable" | "NonTaxable" | "Exempt";
  // Image
  image: string;
  imagePublicId: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  sku: "",
  itemType: "Goods",
  unit: "",
  hsnSacCode: "",
  hasSalesInfo: true,
  sellingPrice: "",
  salesAccountId: "",
  salesDescription: "",
  hasPurchaseInfo: true,
  costPrice: "",
  purchaseAccountId: "",
  purchaseDescription: "",
  preferredVendorId: "",
  taxPreference: "Taxable",
  image: "",
  imagePublicId: "",
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

// ─── Image Uploader ───────────────────────────────────────────────────────────

function ImageUploader({
  imageUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  imageUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    onUpload(file);
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed h-44 text-center text-muted-foreground transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs">Uploading...</p>
        </div>
      ) : imageUrl ? (
        <div className="relative w-full h-full p-2">
          <img
            src={imageUrl}
            alt="Item"
            className="w-full h-full object-contain rounded"
          />
          <div className="absolute top-1 right-1 flex gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="p-1 rounded bg-background/80 border hover:bg-muted transition-colors"
              title="Replace image"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded bg-background/80 border hover:bg-destructive/10 text-destructive transition-colors"
              title="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex flex-col items-center gap-1.5 p-4 cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-8 w-8 opacity-40" />
          <p className="text-xs">Drag image here or</p>
          <p className="text-xs text-primary font-medium">Browse images</p>
        </button>
      )}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

export function NewItemDialog({ open, onOpenChange, onCreated }: NewItemDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [salesAccounts, setSalesAccounts] = useState<GroupedAccounts>({});
  const [purchaseAccounts, setPurchaseAccounts] = useState<GroupedAccounts>({});
  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
      setErrors({});
      loadDropdowns();
    }
  }, [open, loadDropdowns]);

  // ─── Image upload handlers ─────────────────────────────────────────

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      // If there's an existing image, delete it first
      if (form.imagePublicId) {
        await uploadApi.remove(form.imagePublicId).catch(() => {});
      }
      const result = await uploadApi.upload(file, "items");
      setForm((f) => ({ ...f, image: result.url, imagePublicId: result.publicId }));
    } catch (e) {
      setErrors((prev) => ({ ...prev, image: (e as Error).message }));
    } finally {
      setUploading(false);
    }
  }

  async function handleImageRemove() {
    if (form.imagePublicId) {
      await uploadApi.remove(form.imagePublicId).catch(() => {});
    }
    setForm((f) => ({ ...f, image: "", imagePublicId: "" }));
  }

  // ─── Validation ────────────────────────────────────────────────────

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.hasSalesInfo && !form.salesAccountId) errs.salesAccountId = "Sales account is required";
    if (form.hasPurchaseInfo && !form.purchaseAccountId) errs.purchaseAccountId = "Purchase account is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ─── Save ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CreateItemInput = {
        name: form.name.trim(),
        itemType: form.itemType,
        unit: form.unit || undefined,
        sku: form.sku || undefined,
        hsnSacCode: form.hsnSacCode || undefined,
        taxPreference: form.taxPreference,
        image: form.image || undefined,
      };
      if (form.hasSalesInfo) {
        payload.sellingPrice = parseFloat(form.sellingPrice) || 0;
        payload.salesAccountId = form.salesAccountId || undefined;
        payload.sellingDescription = form.salesDescription || undefined;
      }
      if (form.hasPurchaseInfo) {
        payload.costPrice = parseFloat(form.costPrice) || 0;
        payload.purchaseAccountId = form.purchaseAccountId || undefined;
        payload.purchaseDescription = form.purchaseDescription || undefined;
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
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-0">
        {/* Header — single close button from DialogContent */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-lg font-semibold">New Item</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {errors.general && (
            <p className="text-sm text-destructive">{errors.general}</p>
          )}

          {/* ── Basic Info ────────────────────────────────────────────── */}
          <div className="grid grid-cols-[1fr_220px] gap-8">
            {/* Left: fields */}
            <div className="space-y-4">
              {/* Row 1: Type */}
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

              {/* Row 2: Name + SKU */}
              <div className="grid grid-cols-2 gap-4">
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
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="item-sku">SKU</Label>
                  <Input
                    id="item-sku"
                    value={form.sku}
                    onChange={(e) => set("sku", e.target.value)}
                    placeholder="e.g. PROD-001"
                  />
                </div>
              </div>

              {/* Row 3: Unit + HSN/SAC Code */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Unit</Label>
                  <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select unit" />
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

                <div className="space-y-1.5">
                  <Label htmlFor="item-hsn">HSN/SAC Code</Label>
                  <Input
                    id="item-hsn"
                    value={form.hsnSacCode}
                    onChange={(e) => set("hsnSacCode", e.target.value)}
                    placeholder="e.g. 8471"
                  />
                </div>
              </div>

              {/* Row 4: Tax Preference */}
              <div className="space-y-1.5">
                <Label>Tax Preference</Label>
                <RadioGroup
                  value={form.taxPreference}
                  onValueChange={(v: string) => set("taxPreference", v as FormState["taxPreference"])}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Taxable" id="tax-taxable" />
                    <Label htmlFor="tax-taxable" className="font-normal cursor-pointer">Taxable</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="NonTaxable" id="tax-non" />
                    <Label htmlFor="tax-non" className="font-normal cursor-pointer">Non-Taxable</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Exempt" id="tax-exempt" />
                    <Label htmlFor="tax-exempt" className="font-normal cursor-pointer">Exempt</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Right: image upload */}
            <div className="space-y-1.5">
              <Label>Image</Label>
              <ImageUploader
                imageUrl={form.image}
                uploading={uploading}
                onUpload={handleImageUpload}
                onRemove={handleImageRemove}
              />
              {errors.image && <p className="text-xs text-destructive">{errors.image}</p>}
            </div>
          </div>

          {/* ── Divider ─────────────────────────────────────────────── */}
          <div className="border-t" />

          {/* ── Sales Information ─────────────────────────────────────── */}
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
                  <Label>Selling Price</Label>
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
                    placeholder="Description shown on invoices"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Divider ─────────────────────────────────────────────── */}
          <div className="border-t" />

          {/* ── Purchase Information ──────────────────────────────────── */}
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
                  <Label>Cost Price</Label>
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
                    placeholder="Description for purchase orders"
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
          <Button onClick={handleSave} disabled={saving || uploading} className="min-w-[80px]">
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
