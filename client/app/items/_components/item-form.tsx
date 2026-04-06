"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ImageIcon, Upload, Trash2, Loader2, Plus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  accountApi,
  type GroupedAccounts,
  type Account,
  type AccountType,
  type AccountRootType,
  type CreateAccountInput,
} from "@/lib/api/accounts";
import { itemApi, type CreateItemInput, type UnitOfMeasurement, type Item } from "@/lib/api/items";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { settingsApi, type Warehouse } from "@/lib/api/settings";
import { uploadApi } from "@/lib/api/upload";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  sku: string;
  description: string;
  identifiers: string[];
  itemMode: "SingleItem" | "Variants";
  itemType: "Goods" | "Service";
  brand: string;
  manufacturer: string;
  unit: string;
  hsnSacCode: string;
  // Inventory
  hasInventoryInfo: boolean;
  inventoryAccountId: string;
  warehouseId: string;
  valuationMethod: "MovingAverage" | "FIFO";
  stockOnHand: string;
  averageCost: string;
  reorderPoint: string;
  returnableItem: boolean;
  dimensionLength: string;
  dimensionWidth: string;
  dimensionHeight: string;
  dimensionUnit: "cm" | "m" | "in" | "ft";
  weightValue: string;
  weightUnit: "kg" | "g" | "lb" | "oz";
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
  rearImage: string;
  rearImagePublicId: string;
  otherImages: string[];
  otherImagePublicIds: string[];
}

const DEFAULT_FORM: FormState = {
  name: "",
  sku: "",
  description: "",
  identifiers: [],
  itemMode: "SingleItem",
  itemType: "Goods",
  brand: "",
  manufacturer: "",
  unit: "",
  hsnSacCode: "",
  hasInventoryInfo: false,
  inventoryAccountId: "",
  warehouseId: "",
  valuationMethod: "MovingAverage",
  stockOnHand: "",
  averageCost: "",
  reorderPoint: "",
  returnableItem: true,
  dimensionLength: "",
  dimensionWidth: "",
  dimensionHeight: "",
  dimensionUnit: "cm",
  weightValue: "",
  weightUnit: "kg",
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
  rearImage: "",
  rearImagePublicId: "",
  otherImages: [],
  otherImagePublicIds: [],
};

function extractId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
    return String((value as { _id?: string })._id || "");
  }
  return "";
}

// ─── Create Unit Dialog ───────────────────────────────────────────────────────

function CreateUnitDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (unit: UnitOfMeasurement) => void;
}) {
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() { setName(""); setAbbr(""); }

  async function handleSave() {
    if (!name.trim() || !abbr.trim()) {
      toast.error("Name and abbreviation are required");
      return;
    }
    setSaving(true);
    try {
      const res = await itemApi.createUnit({ name: name.trim(), abbreviation: abbr.trim() });
      onCreated(res.data);
      toast.success(`Unit "${res.data.name}" created`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to create unit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Unit</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Unit Name<span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kilogram"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Abbreviation<span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              value={abbr}
              onChange={(e) => setAbbr(e.target.value)}
              placeholder="e.g. kg"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Create Unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Account Dialog ────────────────────────────────────────────────────

type AccountSection = "sales" | "purchase";

const SALES_ACCOUNT_TYPES: AccountType[] = ["Income", "Other Income"];
const PURCHASE_ACCOUNT_TYPES: AccountType[] = ["Expense", "Cost Of Goods Sold", "Other Expense"];

const ACCOUNT_TYPE_ROOT: Record<string, AccountRootType> = {
  "Income": "Income",
  "Other Income": "Income",
  "Expense": "Expense",
  "Cost Of Goods Sold": "Expense",
  "Other Expense": "Expense",
};

function CreateAccountDialog({
  open,
  onOpenChange,
  section,
  parentAccounts,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: AccountSection;
  parentAccounts: Account[];
  onCreated: (account: Account) => void;
}) {
  const accountTypes = section === "sales" ? SALES_ACCOUNT_TYPES : PURCHASE_ACCOUNT_TYPES;
  const [accountType, setAccountType] = useState<AccountType>(accountTypes[0]);
  const [name, setName] = useState("");
  const [isSubAccount, setIsSubAccount] = useState(false);
  const [parentId, setParentId] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset default accountType when section changes
  useEffect(() => {
    setAccountType(accountTypes[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  function reset() {
    setAccountType(accountTypes[0]);
    setName("");
    setIsSubAccount(false);
    setParentId("");
    setCode("");
    setDescription("");
  }

  async function handleSave() {
    if (!name.trim()) { toast.error("Account name is required"); return; }
    setSaving(true);
    try {
      const payload: CreateAccountInput = {
        name: name.trim(),
        accountType,
        rootType: ACCOUNT_TYPE_ROOT[accountType] as AccountRootType,
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        parentId: isSubAccount && parentId ? parentId : undefined,
      };
      const res = await accountApi.create(payload);
      onCreated(res.data);
      toast.success(`Account "${res.data.name}" created`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Account Type<span className="text-destructive ml-0.5">*</span>
            </label>
            <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Account Name<span className="text-destructive ml-0.5">*</span>
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Revenue"
              className="h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sub-acct"
              checked={isSubAccount}
              onCheckedChange={(c) => { setIsSubAccount(!!c); if (!c) setParentId(""); }}
            />
            <label htmlFor="sub-acct" className="text-sm cursor-pointer select-none">
              Make this a sub-account
            </label>
          </div>
          {isSubAccount && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Parent Account</label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select parent account" />
                </SelectTrigger>
                <SelectContent className="max-h-52">
                  {parentAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium">Account Code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. 4001"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Optional description"
              rows={2}
              className="text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save and Select"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grouped Account Select ───────────────────────────────────────────────────

function AccountSelect({
  value,
  onChange,
  grouped,
  error,
  section,
  parentAccounts,
  onAccountCreated,
}: {
  value: string;
  onChange: (v: string) => void;
  grouped: GroupedAccounts;
  error?: string;
  section: AccountSection;
  parentAccounts: Account[];
  onAccountCreated: (account: Account) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const entries = Object.entries(grouped);
  return (
    <div className="space-y-0.5">
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === "__new_account__") { setCreateOpen(true); return; }
          onChange(v);
        }}
      >
        <SelectTrigger className={`h-9 text-sm w-full${error ? " border-destructive" : ""}`}>
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {/* ── Always-visible "New Account" pinned at top ── */}
          <SelectItem value="__new_account__" className="text-primary font-medium">
            <Plus className="h-3.5 w-3.5" />
            New Account
          </SelectItem>
          <SelectSeparator />
          {/* ── Scrollable account list ── */}
          {entries.length === 0 ? (
            <SelectItem value="__none" disabled>
              No accounts — load Chart of Accounts template first
            </SelectItem>
          ) : (
            entries.map(([groupName, accounts]) => (
              <SelectGroup key={groupName}>
                <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                  {groupName}
                </SelectLabel>
                {(accounts as Account[]).map((acc) => (
                  <SelectItem key={acc._id} value={acc._id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          )}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <CreateAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        section={section}
        parentAccounts={parentAccounts}
        onCreated={(account) => {
          onAccountCreated(account);
          onChange(account._id);
        }}
      />
    </div>
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
      className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed h-44 text-center text-muted-foreground transition-colors cursor-pointer select-none ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/20"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      onClick={() => !imageUrl && !uploading && inputRef.current?.click()}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Item" className="w-full h-full object-contain rounded" />
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="p-1.5 rounded bg-background/80 border hover:bg-muted transition-colors"
              title="Replace image"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1.5 rounded bg-background/80 border hover:bg-destructive/10 text-destructive transition-colors"
              title="Remove image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 p-4">
          <ImageIcon className="h-8 w-8 opacity-30" />
          <p className="text-xs">Drag image(s) here or</p>
          <p className="text-xs text-primary font-medium">Browse images</p>
        </div>
      )}
    </div>
  );
}

function OtherImagesUploader({
  images,
  uploading,
  onUpload,
  onRemove,
  maxImages = 15,
}: {
  images: string[];
  uploading: boolean;
  onUpload: (files: FileList | File[]) => void;
  onRemove: (index: number) => void;
  maxImages?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const canUpload = !uploading && images.length < maxImages;

  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border-2 border-dashed p-3 transition-colors ${
          dragOver && canUpload
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        } ${canUpload ? "cursor-pointer hover:bg-muted/20" : "opacity-80"}`}
        onClick={() => canUpload && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!canUpload) return;
          const files = e.dataTransfer.files;
          if (files?.length) onUpload(files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = "";
          }}
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading images...
          </div>
        ) : (
          <div className="text-center text-xs text-muted-foreground py-1">
            <p className="font-medium text-foreground">Drag & drop images or click to browse</p>
            <p>Up to {maxImages} images, each under 5 MB.</p>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="relative rounded-md border bg-muted/20 aspect-square overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Item image ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 rounded bg-background/85 p-1 text-destructive hover:bg-background"
                title="Remove image"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  id, label, checked, onToggle,
}: {
  id: string;
  label: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 py-3 border-t">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onToggle(!!c)} className="h-4 w-4" />
      <label htmlFor={id} className="text-sm font-semibold cursor-pointer select-none">{label}</label>
    </div>
  );
}

// ─── Form row: label + control ────────────────────────────────────────────────

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-x-4 gap-y-0.5">
      <label className="text-sm text-muted-foreground pt-2 leading-none">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

interface ItemFormProps {
  initialData?: Item;
  isEdit?: boolean;
}

export function ItemForm({ initialData, isEdit = false }: ItemFormProps) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => {
    if (!initialData) return DEFAULT_FORM;
    return {
      name: initialData.name ?? "",
      sku: initialData.sku ?? "",
      description: initialData.description ?? "",
      identifiers: initialData.identifiers ?? [],
      itemMode: initialData.itemMode ?? "SingleItem",
      itemType: initialData.itemType ?? "Goods",
      brand: initialData.brand ?? "",
      manufacturer: initialData.manufacturer ?? "",
      unit: extractId(initialData.unit),
      hsnSacCode: initialData.hsnSacCode ?? "",
      hasInventoryInfo: !!initialData.inventoryTracked,
      inventoryAccountId: extractId(initialData.inventoryAccountId),
      warehouseId: extractId(initialData.warehouseId),
      valuationMethod: initialData.valuationMethod ?? "MovingAverage",
      stockOnHand: initialData.inventoryTracked ? String(initialData.stockOnHand ?? "") : "",
      averageCost: initialData.inventoryTracked ? String(initialData.averageCost ?? "") : "",
      reorderPoint: initialData.inventoryTracked ? String(initialData.reorderPoint ?? "") : "",
      returnableItem: initialData.returnableItem ?? true,
      dimensionLength: initialData.dimensions?.length != null ? String(initialData.dimensions.length) : "",
      dimensionWidth: initialData.dimensions?.width != null ? String(initialData.dimensions.width) : "",
      dimensionHeight: initialData.dimensions?.height != null ? String(initialData.dimensions.height) : "",
      dimensionUnit: initialData.dimensions?.unit ?? "cm",
      weightValue: initialData.weight?.value != null ? String(initialData.weight.value) : "",
      weightUnit: initialData.weight?.unit ?? "kg",
      hasSalesInfo: initialData.sellingPrice != null,
      sellingPrice: initialData.sellingPrice?.toString() ?? "",
      salesAccountId: extractId(initialData.salesAccountId),
      salesDescription: initialData.sellingDescription ?? "",
      hasPurchaseInfo: initialData.costPrice != null,
      costPrice: initialData.costPrice?.toString() ?? "",
      purchaseAccountId: extractId(initialData.purchaseAccountId),
      purchaseDescription: initialData.purchaseDescription ?? "",
      preferredVendorId: extractId(initialData.preferredVendorId),
      taxPreference: initialData.taxPreference ?? "Taxable",
      image: initialData.image ?? "",
      imagePublicId: "",
      rearImage: initialData.rearImage ?? "",
      rearImagePublicId: "",
      otherImages: initialData.otherImages ?? [],
      otherImagePublicIds: (initialData.otherImages ?? []).map(() => ""),
    };
  });

  const [salesAccounts, setSalesAccounts] = useState<GroupedAccounts>({});
  const [purchaseAccounts, setPurchaseAccounts] = useState<GroupedAccounts>({});
  const [inventoryAccounts, setInventoryAccounts] = useState<Account[]>([]);
  const [allSalesAccounts, setAllSalesAccounts] = useState<Account[]>([]);
  const [allPurchaseAccounts, setAllPurchaseAccounts] = useState<Account[]>([]);
  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [saving, setSaving] = useState(false);
  const [frontUploading, setFrontUploading] = useState(false);
  const [rearUploading, setRearUploading] = useState(false);
  const [otherUploading, setOtherUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  const uploading = frontUploading || rearUploading || otherUploading;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function addIdentifier() {
    setForm((f) => ({ ...f, identifiers: [...f.identifiers, ""] }));
  }

  function updateIdentifier(index: number, value: string) {
    setForm((f) => ({
      ...f,
      identifiers: f.identifiers.map((entry, i) => (i === index ? value : entry)),
    }));
  }

  function removeIdentifier(index: number) {
    setForm((f) => ({
      ...f,
      identifiers: f.identifiers.filter((_, i) => i !== index),
    }));
  }

  const loadDropdowns = useCallback(async () => {
    try {
      const [
        salesRes,
        purchaseRes,
        unitsRes,
        vendorsRes,
        flatSalesRes,
        flatPurchaseRes,
        assetRes,
        warehouseRes,
      ] = await Promise.all([
        accountApi.listForItem("sales"),
        accountApi.listForItem("purchase"),
        itemApi.listUnits(),
        contactApi.list({ type: "Vendor", limit: 200 }),
        accountApi.list({ rootType: "Income" }),
        accountApi.list({ rootType: "Expense" }),
        accountApi.list({ rootType: "Asset", excludeGroups: true }),
        settingsApi.warehouses.list(),
      ]);
      setSalesAccounts(salesRes.data ?? {});
      setPurchaseAccounts(purchaseRes.data ?? {});
      setAllSalesAccounts(flatSalesRes.data ?? []);
      setAllPurchaseAccounts(flatPurchaseRes.data ?? []);
      setVendors(vendorsRes.data ?? []);
      setInventoryAccounts((assetRes.data ?? []).filter((acc) => acc.rootType === "Asset"));
      setWarehouses(warehouseRes.data ?? []);

      // Auto-seed the 13 GST default units for existing orgs that have none yet
      let unitList = unitsRes.data ?? [];
      if (unitList.length === 0) {
        await itemApi.seedUnits().catch(() => {});
        const seeded = await itemApi.listUnits().catch(() => ({ data: [] as UnitOfMeasurement[] }));
        unitList = seeded.data ?? [];
      }
      setUnits(unitList);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    loadDropdowns();
  }, [loadDropdowns]);

  // ─── Image ─────────────────────────────────────────────────────────────────

  const MAX_OTHER_IMAGES = 15;
  const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

  function isValidImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(`"${file.name}" is not an image`);
      return false;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(`"${file.name}" exceeds 5 MB limit`);
      return false;
    }
    return true;
  }

  async function handleFrontImageUpload(file: File) {
    if (!isValidImage(file)) return;
    setFrontUploading(true);
    try {
      if (form.imagePublicId) await uploadApi.remove(form.imagePublicId).catch(() => {});
      const result = await uploadApi.upload(file, "items");
      setForm((f) => ({ ...f, image: result.url, imagePublicId: result.publicId }));
    } catch (e) {
      toast.error((e as Error).message ?? "Image upload failed");
    } finally {
      setFrontUploading(false);
    }
  }

  async function handleFrontImageRemove() {
    if (form.imagePublicId) await uploadApi.remove(form.imagePublicId).catch(() => {});
    setForm((f) => ({ ...f, image: "", imagePublicId: "" }));
  }

  async function handleRearImageUpload(file: File) {
    if (!isValidImage(file)) return;
    setRearUploading(true);
    try {
      if (form.rearImagePublicId) await uploadApi.remove(form.rearImagePublicId).catch(() => {});
      const result = await uploadApi.upload(file, "items");
      setForm((f) => ({ ...f, rearImage: result.url, rearImagePublicId: result.publicId }));
    } catch (e) {
      toast.error((e as Error).message ?? "Image upload failed");
    } finally {
      setRearUploading(false);
    }
  }

  async function handleRearImageRemove() {
    if (form.rearImagePublicId) await uploadApi.remove(form.rearImagePublicId).catch(() => {});
    setForm((f) => ({ ...f, rearImage: "", rearImagePublicId: "" }));
  }

  async function handleOtherImagesUpload(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length === 0) return;

    const remaining = MAX_OTHER_IMAGES - form.otherImages.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_OTHER_IMAGES} images`);
      return;
    }

    const validFiles = selected.filter(isValidImage).slice(0, remaining);
    if (validFiles.length === 0) return;

    setOtherUploading(true);
    try {
      const uploaded: Array<{ url: string; publicId: string }> = [];
      for (const file of validFiles) {
        const result = await uploadApi.upload(file, "items");
        uploaded.push({ url: result.url, publicId: result.publicId });
      }
      setForm((f) => ({
        ...f,
        otherImages: [...f.otherImages, ...uploaded.map((u) => u.url)].slice(0, MAX_OTHER_IMAGES),
        otherImagePublicIds: [...f.otherImagePublicIds, ...uploaded.map((u) => u.publicId)].slice(0, MAX_OTHER_IMAGES),
      }));
    } catch (e) {
      toast.error((e as Error).message ?? "Image upload failed");
    } finally {
      setOtherUploading(false);
    }
  }

  async function handleOtherImageRemove(index: number) {
    const publicId = form.otherImagePublicIds[index];
    if (publicId) await uploadApi.remove(publicId).catch(() => {});
    setForm((f) => ({
      ...f,
      otherImages: f.otherImages.filter((_, i) => i !== index),
      otherImagePublicIds: f.otherImagePublicIds.filter((_, i) => i !== index),
    }));
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.hasInventoryInfo && !form.inventoryAccountId) errs.inventoryAccountId = "Inventory account is required";
    if (form.hasInventoryInfo && (Number(form.stockOnHand || 0) < 0)) errs.stockOnHand = "Stock cannot be negative";
    if (form.hasInventoryInfo && (Number(form.averageCost || 0) < 0)) errs.averageCost = "Cost cannot be negative";
    if (form.hasSalesInfo && !form.salesAccountId) errs.salesAccountId = "Sales account is required";
    if (form.hasPurchaseInfo && !form.purchaseAccountId) errs.purchaseAccountId = "Purchase account is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      const dimensionLength = Math.max(0, parseFloat(form.dimensionLength) || 0);
      const dimensionWidth = Math.max(0, parseFloat(form.dimensionWidth) || 0);
      const dimensionHeight = Math.max(0, parseFloat(form.dimensionHeight) || 0);
      const weightValue = Math.max(0, parseFloat(form.weightValue) || 0);

      const payload: CreateItemInput = {
        name: form.name.trim(),
        description: form.description.trim(),
        identifiers: form.identifiers.filter((value) => value.trim().length > 0),
        itemMode: form.itemMode,
        itemType: form.hasInventoryInfo ? "Goods" : form.itemType,
        brand: form.brand.trim(),
        manufacturer: form.manufacturer.trim(),
        unit: form.unit || undefined,
        sku: form.sku || undefined,
        hsnSacCode: form.hsnSacCode || undefined,
        taxPreference: form.taxPreference,
        image: form.image || "",
        rearImage: form.rearImage || "",
        otherImages: form.otherImages,
        returnableItem: form.returnableItem,
        dimensions: {
          length: dimensionLength,
          width: dimensionWidth,
          height: dimensionHeight,
          unit: form.dimensionUnit,
        },
        weight: {
          value: weightValue,
          unit: form.weightUnit,
        },
      };
      if (form.hasInventoryInfo) {
        const stockOnHand = Math.max(0, parseFloat(form.stockOnHand) || 0);
        const averageCost = Math.max(0, parseFloat(form.averageCost) || 0);
        payload.inventoryTracked = true;
        payload.inventoryAccountId = form.inventoryAccountId || undefined;
        payload.warehouseId = form.warehouseId || undefined;
        payload.valuationMethod = form.valuationMethod;
        payload.stockOnHand = stockOnHand;
        payload.averageCost = averageCost;
        payload.inventoryValue = stockOnHand * averageCost;
        payload.reorderPoint = Math.max(0, parseFloat(form.reorderPoint) || 0);
      } else {
        payload.inventoryTracked = false;
      }
      if (form.hasSalesInfo) {
        payload.sellingPrice = parseFloat(form.sellingPrice) || 0;
        payload.salesAccountId = form.salesAccountId || undefined;
        payload.sellingDescription = form.salesDescription || undefined;
      }
      if (form.hasPurchaseInfo) {
        payload.costPrice = parseFloat(form.costPrice) || 0;
        payload.purchaseAccountId = form.purchaseAccountId || undefined;
        payload.purchaseDescription = form.purchaseDescription || undefined;
        payload.preferredVendorId = form.preferredVendorId && form.preferredVendorId !== "__none" ? form.preferredVendorId : undefined;
      }

      if (isEdit && initialData?._id) {
        await itemApi.update(initialData._id, payload);
        toast.success("Item updated");
      } else {
        await itemApi.create(payload);
        toast.success("Item created");
      }
      router.push("/items");
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? "Failed to save item");
    } finally {
      setSaving(false);
    }
  }

  // ─── Account / Unit creation helpers ──────────────────────────────────────

  async function handleSalesAccountCreated(account: Account) {
    try {
      const [grouped, flat] = await Promise.all([
        accountApi.listForItem("sales"),
        accountApi.list({ rootType: "Income" }),
      ]);
      setSalesAccounts(grouped.data ?? {});
      setAllSalesAccounts(flat.data ?? []);
    } catch { /* non-fatal */ }
    set("salesAccountId", account._id);
  }

  async function handlePurchaseAccountCreated(account: Account) {
    try {
      const [grouped, flat] = await Promise.all([
        accountApi.listForItem("purchase"),
        accountApi.list({ rootType: "Expense" }),
      ]);
      setPurchaseAccounts(grouped.data ?? {});
      setAllPurchaseAccounts(flat.data ?? []);
    } catch { /* non-fatal */ }
    set("purchaseAccountId", account._id);
  }

  function handleUnitCreated(unit: UnitOfMeasurement) {
    // Refresh from server to guarantee correct _id strings for Select comparison
    itemApi.listUnits()
      .then((res) => setUnits(res.data ?? []))
      .catch(() => {
        // Fallback: add to local list
        setUnits((prev) => [...prev, unit].sort((a, b) => a.name.localeCompare(b.name)));
      });
    // Select the new unit immediately
    set("unit", unit._id as string);
  }

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background sticky top-0 z-10">
        <h1 className="text-lg font-semibold tracking-tight">{isEdit ? "Edit Item" : "New Item"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/items")} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || uploading}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : isEdit ? "Update" : "Save"}
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 py-4 max-w-4xl space-y-0">
        <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Turn on inventory tracking below to manage stock, valuation, replenishment, and fulfillment details.
        </div>

        {/* ── Basic Info: fields left, image controls right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_430px] gap-6 pb-1">
          <div className="space-y-3">
            <Row label="Name" required>
              <Input
                className={`h-9 text-sm${errors.name ? " border-destructive" : ""}`}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Item name"
                autoFocus
              />
              {errors.name && <p className="text-xs text-destructive mt-0.5">{errors.name}</p>}
            </Row>

            <Row label="Type">
              <RadioGroup
                value={form.itemType}
                onValueChange={(v) => set("itemType", v as "Goods" | "Service")}
                className="flex gap-5 pt-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="Goods" id="type-goods" />
                  <Label htmlFor="type-goods" className="font-normal cursor-pointer text-sm">Goods</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="Service" id="type-service" disabled={form.hasInventoryInfo} />
                  <Label
                    htmlFor="type-service"
                    className={`font-normal cursor-pointer text-sm ${form.hasInventoryInfo ? "opacity-50" : ""}`}
                  >
                    Service
                  </Label>
                </div>
              </RadioGroup>
            </Row>

            <Row label="Brand">
              <Input
                className="h-9 text-sm"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Select or add brand"
              />
            </Row>

            <Row label="Manufacturer">
              <Input
                className="h-9 text-sm"
                value={form.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
                placeholder="Select or add manufacturer"
              />
            </Row>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Front View</Label>
                <ImageUploader
                  imageUrl={form.image}
                  uploading={frontUploading}
                  onUpload={handleFrontImageUpload}
                  onRemove={handleFrontImageRemove}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Rear View</Label>
                <ImageUploader
                  imageUrl={form.rearImage}
                  uploading={rearUploading}
                  onUpload={handleRearImageUpload}
                  onRemove={handleRearImageRemove}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Other Images</Label>
              <OtherImagesUploader
                images={form.otherImages}
                uploading={otherUploading}
                onUpload={handleOtherImagesUpload}
                onRemove={handleOtherImageRemove}
              />
            </div>
          </div>
        </div>

        <div className="border-t mt-6 pt-5 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Item Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Item Type</label>
              <RadioGroup
                value={form.itemMode}
                onValueChange={(v) => set("itemMode", v as FormState["itemMode"])}
                className="flex gap-3"
              >
                <div className="flex items-center gap-1.5 rounded-md border px-3 py-2">
                  <RadioGroupItem value="SingleItem" id="mode-single" />
                  <Label htmlFor="mode-single" className="font-medium cursor-pointer text-sm">Single Item</Label>
                </div>
                <div className="flex items-center gap-1.5 rounded-md border px-3 py-2">
                  <RadioGroupItem value="Variants" id="mode-variants" />
                  <Label htmlFor="mode-variants" className="font-medium cursor-pointer text-sm">Contains Variants</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-destructive font-medium">Unit<span className="text-destructive">*</span></label>
              <Select
                value={form.unit}
                onValueChange={(v) => {
                  if (v === "__new_unit__") { setCreateUnitOpen(true); return; }
                  set("unit", v);
                }}
              >
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Select or type to add" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {units.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name} ({u.abbreviation})
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value="__new_unit__" className="text-primary font-medium">
                    <Plus className="h-3.5 w-3.5" />
                    New Unit
                  </SelectItem>
                </SelectContent>
              </Select>
              <CreateUnitDialog
                open={createUnitOpen}
                onOpenChange={setCreateUnitOpen}
                onCreated={handleUnitCreated}
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-1">
              <label className="text-sm text-muted-foreground">SKU</label>
              <Input
                className="h-9 text-sm"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="SKU"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={addIdentifier}
              >
                + Add Identifier
              </button>

              {form.identifiers.map((identifier, index) => (
                <div key={`identifier-${index}`} className="flex gap-2">
                  <Input
                    className="h-9 text-sm"
                    value={identifier}
                    onChange={(e) => updateIdentifier(index, e.target.value)}
                    placeholder="Identifier"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => removeIdentifier(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t mt-6 pt-5 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Item Description</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm text-muted-foreground">Description</label>
              <Textarea
                rows={3}
                className="text-sm resize-none"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Item description"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">HSN/SAC Code</label>
              <Input
                className="h-9 text-sm"
                value={form.hsnSacCode}
                onChange={(e) => set("hsnSacCode", e.target.value)}
                placeholder="e.g. 8471"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Tax Preference</label>
              <RadioGroup
                value={form.taxPreference}
                onValueChange={(v) => set("taxPreference", v as FormState["taxPreference"])}
                className="flex gap-5 pt-1.5"
              >
                {(["Taxable", "NonTaxable", "Exempt"] as const).map((val) => (
                  <div key={val} className="flex items-center gap-1.5">
                    <RadioGroupItem value={val} id={`tax-${val}`} />
                    <Label htmlFor={`tax-${val}`} className="font-normal cursor-pointer text-sm">
                      {val === "NonTaxable" ? "Non-Taxable" : val}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        </div>

        {/* ── Sales Information ─────────────────────────────────────────────── */}
        <SectionHeader
          id="sales-info"
          label="Sales Information"
          checked={form.hasSalesInfo}
          onToggle={(v) => set("hasSalesInfo", v)}
        />
        {form.hasSalesInfo && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 pl-6 pb-2">
            {/* Selling Price */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-destructive font-medium">
                Selling Price<span className="text-destructive">*</span>
              </label>
              <div className="flex h-9">
                <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-muted text-muted-foreground">INR</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-l-none h-9 text-sm"
                  value={form.sellingPrice}
                  onChange={(e) => set("sellingPrice", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Sales Account */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-destructive font-medium">
                Account<span className="text-destructive">*</span>
              </label>
              <AccountSelect
                value={form.salesAccountId}
                onChange={(v) => set("salesAccountId", v)}
                grouped={salesAccounts}
                error={errors.salesAccountId}
                section="sales"
                parentAccounts={allSalesAccounts}
                onAccountCreated={handleSalesAccountCreated}
              />
            </div>

            {/* Sales Description */}
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Description</label>
              <Textarea
                rows={2}
                className="text-sm resize-none"
                value={form.salesDescription}
                onChange={(e) => set("salesDescription", e.target.value)}
                placeholder="Description shown on invoices"
              />
            </div>
          </div>
        )}

        {/* ── Purchase Information ──────────────────────────────────────────── */}
        <SectionHeader
          id="purchase-info"
          label="Purchase Information"
          checked={form.hasPurchaseInfo}
          onToggle={(v) => set("hasPurchaseInfo", v)}
        />
        {form.hasPurchaseInfo && (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 pl-6 pb-2">
            {/* Cost Price */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-destructive font-medium">
                Cost Price<span className="text-destructive">*</span>
              </label>
              <div className="flex h-9">
                <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-muted text-muted-foreground">INR</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-l-none h-9 text-sm"
                  value={form.costPrice}
                  onChange={(e) => set("costPrice", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Purchase Account */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-destructive font-medium">
                Account<span className="text-destructive">*</span>
              </label>
              <AccountSelect
                value={form.purchaseAccountId}
                onChange={(v) => set("purchaseAccountId", v)}
                grouped={purchaseAccounts}
                error={errors.purchaseAccountId}
                section="purchase"
                parentAccounts={allPurchaseAccounts}
                onAccountCreated={handlePurchaseAccountCreated}
              />
            </div>

            {/* Purchase Description */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Description</label>
              <Textarea
                rows={2}
                className="text-sm resize-none"
                value={form.purchaseDescription}
                onChange={(e) => set("purchaseDescription", e.target.value)}
                placeholder="Description for purchase orders"
              />
            </div>

            {/* Preferred Vendor — now linked to real vendor list */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground">Preferred Vendor</label>
              <Select
                value={form.preferredVendorId || "__none"}
                onValueChange={(v) => set("preferredVendorId", v === "__none" ? "" : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__none">— None —</SelectItem>
                  {vendors.length === 0 ? (
                    <SelectItem value="__empty" disabled>No vendors yet</SelectItem>
                  ) : (
                    vendors.map((v) => (
                      <SelectItem key={v._id} value={v._id}>
                        {v.displayName || v.companyName || `${v.firstName} ${v.lastName}`.trim()}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* ── Inventory Information ──────────────────────────────────────── */}
        <SectionHeader
          id="inventory-info"
          label="Track Inventory for this item"
          checked={form.hasInventoryInfo}
          onToggle={(v) => {
            set("hasInventoryInfo", v);
            if (v) set("itemType", "Goods");
          }}
        />
        {form.hasInventoryInfo && (
          <div className="space-y-5 pl-6 pb-2">
            <p className="text-sm text-muted-foreground">
              You cannot enable/disable inventory tracking once you&apos;ve created transactions for this item.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-destructive font-medium">
                  Inventory Account<span className="text-destructive">*</span>
                </label>
                <Select
                  value={form.inventoryAccountId || "__none"}
                  onValueChange={(v) => set("inventoryAccountId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className={`h-9 text-sm ${errors.inventoryAccountId ? "border-destructive" : ""}`}>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">— Select —</SelectItem>
                    {inventoryAccounts.length === 0 ? (
                      <SelectItem value="__empty" disabled>No asset accounts found</SelectItem>
                    ) : (
                      inventoryAccounts.map((acc) => (
                        <SelectItem key={acc._id} value={acc._id}>
                          {acc.name} ({acc.accountType})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.inventoryAccountId && <p className="text-xs text-destructive">{errors.inventoryAccountId}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-destructive font-medium">
                  Inventory Valuation Method<span className="text-destructive">*</span>
                </label>
                <Select
                  value={form.valuationMethod}
                  onValueChange={(v) => set("valuationMethod", v as FormState["valuationMethod"])}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select the valuation method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
                    <SelectItem value="MovingAverage">WAC (Weighted Average Costing)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Reorder Point</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-9 text-sm"
                  value={form.reorderPoint}
                  onChange={(e) => set("reorderPoint", e.target.value)}
                  placeholder="0"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Opening Stock</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className={`h-9 text-sm ${errors.stockOnHand ? "border-destructive" : ""}`}
                  value={form.stockOnHand}
                  onChange={(e) => set("stockOnHand", e.target.value)}
                  placeholder="0"
                />
                {errors.stockOnHand && <p className="text-xs text-destructive">{errors.stockOnHand}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Opening Cost / Unit</label>
                <div className="flex h-9">
                  <span className="flex items-center px-2.5 text-xs border border-r-0 rounded-l-md bg-muted text-muted-foreground">INR</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className={`rounded-l-none h-9 text-sm ${errors.averageCost ? "border-destructive" : ""}`}
                    value={form.averageCost}
                    onChange={(e) => set("averageCost", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {errors.averageCost && <p className="text-xs text-destructive">{errors.averageCost}</p>}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Warehouse</label>
                <Select
                  value={form.warehouseId || "__none"}
                  onValueChange={(v) => set("warehouseId", v === "__none" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none">— None —</SelectItem>
                    {warehouses.length === 0 ? (
                      <SelectItem value="__empty" disabled>No warehouses configured</SelectItem>
                    ) : (
                      warehouses.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-5 space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight">Cancellation and Returns</h3>
              <div className="grid grid-cols-[160px_1fr] gap-4 items-start">
                <label className="text-sm text-muted-foreground pt-1">Returnable Item</label>
                <RadioGroup
                  value={form.returnableItem ? "yes" : "no"}
                  onValueChange={(v) => set("returnableItem", v === "yes")}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="yes" id="returnable-yes" />
                    <Label htmlFor="returnable-yes" className="font-normal cursor-pointer text-sm">Yes</Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="no" id="returnable-no" />
                    <Label htmlFor="returnable-no" className="font-normal cursor-pointer text-sm">No</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="border-t pt-5 space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight">Fulfillment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground">Dimensions</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9 text-sm"
                      value={form.dimensionLength}
                      onChange={(e) => set("dimensionLength", e.target.value)}
                      placeholder="L"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9 text-sm"
                      value={form.dimensionWidth}
                      onChange={(e) => set("dimensionWidth", e.target.value)}
                      placeholder="W"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9 text-sm"
                      value={form.dimensionHeight}
                      onChange={(e) => set("dimensionHeight", e.target.value)}
                      placeholder="H"
                    />
                    <Select value={form.dimensionUnit} onValueChange={(v) => set("dimensionUnit", v as FormState["dimensionUnit"])}>
                      <SelectTrigger className="h-9 text-sm w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="m">m</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                        <SelectItem value="ft">ft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">(Length x Width x Height)</p>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground">Weight</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9 text-sm"
                      value={form.weightValue}
                      onChange={(e) => set("weightValue", e.target.value)}
                      placeholder="Weight"
                    />
                    <Select value={form.weightUnit} onValueChange={(v) => set("weightUnit", v as FormState["weightUnit"])}>
                      <SelectTrigger className="h-9 text-sm w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
