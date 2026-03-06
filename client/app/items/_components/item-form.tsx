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
import { uploadApi } from "@/lib/api/upload";

// ─── Types ────────────────────────────────────────────────────────────────────

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
      itemType: initialData.itemType ?? "Goods",
      unit: typeof initialData.unit === "object" && initialData.unit ? (initialData.unit as UnitOfMeasurement)._id : (initialData.unit as string) ?? "",
      hsnSacCode: initialData.hsnSacCode ?? "",
      hasSalesInfo: initialData.sellingPrice != null,
      sellingPrice: initialData.sellingPrice?.toString() ?? "",
      salesAccountId: (initialData.salesAccountId as string) ?? "",
      salesDescription: initialData.sellingDescription ?? "",
      hasPurchaseInfo: initialData.costPrice != null,
      costPrice: initialData.costPrice?.toString() ?? "",
      purchaseAccountId: (initialData.purchaseAccountId as string) ?? "",
      purchaseDescription: initialData.purchaseDescription ?? "",
      preferredVendorId: (initialData.preferredVendorId as string) ?? "",
      taxPreference: initialData.taxPreference ?? "Taxable",
      image: initialData.image ?? "",
      imagePublicId: "",
    };
  });

  const [salesAccounts, setSalesAccounts] = useState<GroupedAccounts>({});
  const [purchaseAccounts, setPurchaseAccounts] = useState<GroupedAccounts>({});
  const [allSalesAccounts, setAllSalesAccounts] = useState<Account[]>([]);
  const [allPurchaseAccounts, setAllPurchaseAccounts] = useState<Account[]>([]);
  const [units, setUnits] = useState<UnitOfMeasurement[]>([]);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadDropdowns = useCallback(async () => {
    try {
      const [salesRes, purchaseRes, unitsRes, vendorsRes, flatSalesRes, flatPurchaseRes] = await Promise.all([
        accountApi.listForItem("sales"),
        accountApi.listForItem("purchase"),
        itemApi.listUnits(),
        contactApi.list({ type: "Vendor", limit: 200 }),
        accountApi.list({ rootType: "Income" }),
        accountApi.list({ rootType: "Expense" }),
      ]);
      setSalesAccounts(salesRes.data ?? {});
      setPurchaseAccounts(purchaseRes.data ?? {});
      setAllSalesAccounts(flatSalesRes.data ?? []);
      setAllPurchaseAccounts(flatPurchaseRes.data ?? []);
      setVendors(vendorsRes.data ?? []);

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

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      if (form.imagePublicId) await uploadApi.remove(form.imagePublicId).catch(() => {});
      const result = await uploadApi.upload(file, "items");
      setForm((f) => ({ ...f, image: result.url, imagePublicId: result.publicId }));
    } catch (e) {
      toast.error((e as Error).message ?? "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleImageRemove() {
    if (form.imagePublicId) await uploadApi.remove(form.imagePublicId).catch(() => {});
    setForm((f) => ({ ...f, image: "", imagePublicId: "" }));
  }

  // ─── Validation ────────────────────────────────────────────────────────────

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
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

        {/* ── Inventory banner ── */}
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 mb-4">
          <span className="mt-0.5 text-blue-500 text-base leading-none">ℹ</span>
          <div>
            <span className="font-medium">Do you want to keep track of this item?</span>{" "}
            Enable Inventory to view its stock based on transactions. Go to{" "}
            <span className="font-semibold">Settings &gt; Preferences &gt; Items</span> and enable inventory.
          </div>
        </div>

        {/* ── Basic Info: fields left, image right ── */}
        <div className="grid grid-cols-[1fr_200px] gap-6 pb-1">
          <div className="space-y-3">
            {/* Name */}
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

            {/* Type */}
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
                  <RadioGroupItem value="Service" id="type-service" />
                  <Label htmlFor="type-service" className="font-normal cursor-pointer text-sm">Service</Label>
                </div>
              </RadioGroup>
            </Row>

            {/* Unit */}
            <Row label="Unit">
              <Select
                value={form.unit}
                onValueChange={(v) => {
                  if (v === "__new_unit__") { setCreateUnitOpen(true); return; }
                  set("unit", v);
                }}
              >
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="Select unit" />
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
            </Row>

            {/* HSN/SAC Code */}
            <Row label="HSN/SAC Code">
              <Input
                className="h-9 text-sm"
                value={form.hsnSacCode}
                onChange={(e) => set("hsnSacCode", e.target.value)}
                placeholder="e.g. 8471"
              />
            </Row>

            {/* SKU */}
            <Row label="SKU">
              <Input
                className="h-9 text-sm"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="e.g. PROD-001"
              />
            </Row>

            {/* Tax Preference */}
            <Row label="Tax Preference">
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
            </Row>
          </div>

          {/* Image uploader — right column */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Image</Label>
            <ImageUploader
              imageUrl={form.image}
              uploading={uploading}
              onUpload={handleImageUpload}
              onRemove={handleImageRemove}
            />
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
      </div>
    </div>
  );
}
