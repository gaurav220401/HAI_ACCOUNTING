"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  type FixedAssetStatus,
  type FixedAssetType,
} from "@/lib/api/fixed-assets";
import { FixedAssetTypeDialog } from "@/components/fixed-asset-type-dialog";
import { AccountDialog } from "@/components/account-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type AccountFieldKey =
  | "fixedAssetAccountId"
  | "accumulatedDepreciationAccountId"
  | "depreciationExpenseAccountId";

const NEW_ACCOUNT_VALUE = "__new_account__";
const FIXED_ASSET_ACCOUNT_TYPES: AccountType[] = ["Fixed Asset"];
const CONTRA_ASSET_ACCOUNT_TYPES: AccountType[] = ["Contra Asset"];
const DEPRECIATION_EXPENSE_ACCOUNT_TYPES: AccountType[] = [
  "Expense",
  "Other Expense",
];

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

type ForecastRow = {
  depreciationDate: string;
  depreciationValue: number;
  cumulativeDepreciationValue: number;
  currentValue: number;
};

type ForecastPoint = {
  date: string;
  label: string;
  currentValue: number;
};

type DepreciationProjection = {
  rows: ForecastRow[];
  points: ForecastPoint[];
};

function monthEnd(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0);
}

function yearEnd(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function daysInYear(date: Date) {
  const year = date.getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPeriods(asset: {
  assetLifeValue: string;
  assetLifeUnit: string;
  depreciationFrequency: string;
}) {
  const life = Math.max(1, Number(asset.assetLifeValue || 1));
  const unit = asset.assetLifeUnit;
  const frequency = asset.depreciationFrequency;

  if (frequency === "Monthly") {
    if (unit === "Months") return life;
    return Math.max(1, Math.ceil(life / 30));
  }

  if (unit === "Months") return Math.max(1, Math.ceil(life / 12));
  return Math.max(1, Math.ceil(life / 365));
}

function buildDepreciationProjection(form: FormState): DepreciationProjection {
  const periods = getPeriods({
    assetLifeValue: form.assetLifeValue,
    assetLifeUnit: form.assetLifeUnit,
    depreciationFrequency: form.depreciationFrequency,
  });
  const startDate = new Date(form.depreciationStartDate || form.purchaseDate || new Date().toISOString());

  const openingValue = Math.max(0, toNumber(form.currentValue || form.purchaseValue || "0"));
  const floorValue = Math.max(0, toNumber(form.disposalValue || "0"));
  let remainingValue = openingValue;
  let cumulative = 0;

  const rows: ForecastRow[] = [];
  const points: ForecastPoint[] = [];

  const straightLineBase = periods > 0 ? (openingValue - floorValue) / periods : 0;
  const decliningPercentage = toNumber(form.depreciationPercentage || "0");
  const fallbackDecliningRate = Math.min(0.95, Math.max(0.01, 2 / Math.max(1, periods)));
  const annualDecliningRate = decliningPercentage > 0 ? Math.max(0, Math.min(1, decliningPercentage / 100)) : fallbackDecliningRate;

  const monthBasedDecliningRate = form.depreciationFrequency === "Monthly" ? annualDecliningRate / 12 : annualDecliningRate;

  const computeDecliningValue = (index: number, available: number, periodDate: Date) => {
    const isProRata = form.computationType === "Pro Rata";

    if (!isProRata) {
      return round2(available * monthBasedDecliningRate);
    }

    if (form.depreciationFrequency === "Monthly") {
      const totalMonthDays = monthEnd(periodDate).getDate();
      let periodDays = totalMonthDays;
      if (index === 0) {
        periodDays = Math.max(1, totalMonthDays - startDate.getDate() + 1);
      }
      const ratio = periodDays / daysInYear(periodDate);
      return round2(available * annualDecliningRate * ratio);
    }

    const totalYearDays = daysInYear(periodDate);
    let periodDays = totalYearDays;
    if (index === 0) {
      const end = yearEnd(startDate);
      periodDays = Math.max(
        1,
        Math.floor((end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      );
    }
    const ratio = periodDays / totalYearDays;
    return round2(available * annualDecliningRate * ratio);
  };

  for (let index = 0; index < periods; index += 1) {
    let periodDate = new Date(startDate);
    if (form.depreciationFrequency === "Monthly") {
      periodDate.setMonth(periodDate.getMonth() + index);
      periodDate = monthEnd(periodDate);
    } else {
      periodDate.setFullYear(periodDate.getFullYear() + index);
      periodDate = yearEnd(periodDate);
    }

    const remainingPeriods = periods - index;
    const available = Math.max(0, remainingValue - floorValue);

    let depreciationValue = 0;
    if (form.depreciationMethod === "Declining Balance") {
      depreciationValue = computeDecliningValue(index, available, periodDate);
    } else {
      depreciationValue = round2(straightLineBase);
    }

    if (form.depreciationMethod !== "Declining Balance" && remainingPeriods === 1) {
      depreciationValue = round2(available);
    }

    depreciationValue = Math.min(depreciationValue, available);
    depreciationValue = Math.max(0, depreciationValue);

    cumulative = round2(cumulative + depreciationValue);
    remainingValue = round2(Math.max(floorValue, remainingValue - depreciationValue));

    rows.push({
      depreciationDate: periodDate.toISOString(),
      depreciationValue,
      cumulativeDepreciationValue: cumulative,
      currentValue: remainingValue,
    });

    points.push({
      date: periodDate.toISOString(),
      label: periodDate.toLocaleDateString("en-US", { month: "short" }),
      currentValue: remainingValue,
    });
  }

  // Declining balance can leave residual value; add one balancing row to close at disposal value.
  const residual = round2(Math.max(0, remainingValue - floorValue));
  if (form.depreciationMethod === "Declining Balance" && residual > 0.009) {
    let finalDate = new Date(startDate);
    if (form.depreciationFrequency === "Monthly") {
      finalDate.setMonth(finalDate.getMonth() + periods);
      finalDate = monthEnd(finalDate);
    } else {
      finalDate.setFullYear(finalDate.getFullYear() + periods);
      finalDate = yearEnd(finalDate);
    }

    cumulative = round2(cumulative + residual);
    remainingValue = round2(Math.max(floorValue, remainingValue - residual));

    rows.push({
      depreciationDate: finalDate.toISOString(),
      depreciationValue: residual,
      cumulativeDepreciationValue: cumulative,
      currentValue: remainingValue,
    });

    points.push({
      date: finalDate.toISOString(),
      label: finalDate.toLocaleDateString("en-US", { month: "short" }),
      currentValue: remainingValue,
    });
  }

  return { rows, points };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
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
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewFixedAssetPageContent />
    </Suspense>
  );
}

function NewFixedAssetPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const editId = searchParams.get("edit");
  const sourceAssetId = editId || cloneId;
  const isEditMode = Boolean(editId);

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [form, setForm] = useState<FormState>(defaultForm);
  const [overrideAccounts, setOverrideAccounts] = useState(false);
  const [assetTypes, setAssetTypes] = useState<FixedAssetType[]>([]);
  const assetTypesRef = useRef<FixedAssetType[]>(assetTypes);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [createTargetField, setCreateTargetField] =
    useState<AccountFieldKey>("fixedAssetAccountId");
  const [editStatus, setEditStatus] = useState<FixedAssetStatus | null>(null);
  const initialLoadDone = useRef(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [projection, setProjection] = useState<DepreciationProjection | null>(null);

  const handlePreview = () => {
    const purchaseVal = toNumber(form.purchaseValue);
    const lifeVal = toNumber(form.assetLifeValue);
    if (!form.purchaseValue || Number.isNaN(purchaseVal) || purchaseVal <= 0) {
      toast.error("Please enter a valid Purchase Value before previewing.");
      return;
    }
    if (!form.assetLifeValue || Number.isNaN(lifeVal) || lifeVal <= 0) {
      toast.error("Please enter a valid Asset Life before previewing.");
      return;
    }

    try {
      const proj = buildDepreciationProjection(form);
      setProjection(proj);
      setPreviewOpen(true);
    } catch (error) {
      toast.error("Failed to generate depreciation schedule preview.");
    }
  };

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
    // Only show the loading spinner on the very first load.
    // Subsequent re-fetches (caused by context re-renders) must NOT
    // unmount the form — doing so causes Radix Select to lose its value.
    if (initialLoadDone.current) return;
    setLoadingData(true);
    try {
      const [typesRes, accountsRes] = await Promise.all([
        fixedAssetApi.listTypes(),
        accountApi.list({ excludeGroups: true }),
      ]);

      setAssetTypes(typesRes.data ?? []);
      assetTypesRef.current = typesRes.data ?? [];
      setAccounts(sortAccounts(accountsRes.data ?? []));

      if (!sourceAssetId) {
        initialLoadDone.current = true;
        return;
      }

      const cloned = await fixedAssetApi.getById(sourceAssetId);
      const asset = cloned.data;
      if (isEditMode) {
        setEditStatus(asset.status);
      } else {
        setEditStatus(null);
      }

      const assetTypeId = getRefId(asset.fixedAssetTypeId);
      const fixedAssetAccId = getRefId(asset.fixedAssetAccountId);
      const accumulatedDeprAccId = getRefId(asset.accumulatedDepreciationAccountId);
      const deprExpenseAccId = getRefId(asset.depreciationExpenseAccountId);

      const selectedType = typesRes.data?.find((t) => t._id === assetTypeId);
      const hasOverride = selectedType ? (
        fixedAssetAccId !== getRefId(selectedType.fixedAssetAccountId) ||
        accumulatedDeprAccId !== getRefId(selectedType.accumulatedDepreciationAccountId) ||
        deprExpenseAccId !== getRefId(selectedType.depreciationExpenseAccountId)
      ) : false;

      setOverrideAccounts(hasOverride);

      setForm({
        assetName: asset.assetName,
        purchaseValue: String(asset.purchaseValue || ""),
        purchaseQuantity: String(asset.purchaseQuantity || ""),
        currentQuantity: String(asset.currentQuantity || ""),
        serialNumber: asset.serialNumber || "",
        currentValue: String(asset.currentValue || ""),
        disposalValue: String(asset.disposalValue || ""),
        fixedAssetTypeId: assetTypeId,
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
        fixedAssetAccountId: fixedAssetAccId,
        accumulatedDepreciationAccountId: accumulatedDeprAccId,
        depreciationExpenseAccountId: deprExpenseAccId,
      });
      initialLoadDone.current = true;
    } catch (error) {
      toast.error((error as Error).message || "Failed to load form data");
    } finally {
      setLoadingData(false);
    }
  }, [activeOrganization?._id, sourceAssetId, isEditMode]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && activeOrganization?._id) {
      void loadInitial();
    }
  }, [loading, orgLoading, firebaseUser, activeOrganization?._id, loadInitial]);

  const fixedAssetAccountOptions = useMemo(
    () => accounts.filter((account) => account.accountType === "Fixed Asset"),
    [accounts],
  );

  const contraAssetAccountOptions = useMemo(
    () => accounts.filter((account) => account.accountType === "Contra Asset"),
    [accounts],
  );

  const expenseAccountOptions = useMemo(
    () => accounts.filter((account) => account.rootType === "Expense" && account.accountType !== "Cost Of Goods Sold"),
    [accounts],
  );

  const accountOptionsForFixed =
    fixedAssetAccountOptions.length > 0 ? fixedAssetAccountOptions : accounts;
  const accountOptionsForAccumulated =
    contraAssetAccountOptions.length > 0 ? contraAssetAccountOptions : accounts;
  const accountOptionsForExpense =
    expenseAccountOptions.length > 0 ? expenseAccountOptions : accounts;

  const createAccountTypes =
    createTargetField === "depreciationExpenseAccountId"
      ? DEPRECIATION_EXPENSE_ACCOUNT_TYPES
      : createTargetField === "accumulatedDepreciationAccountId"
        ? CONTRA_ASSET_ACCOUNT_TYPES
        : FIXED_ASSET_ACCOUNT_TYPES;

  function openCreateAccountFor(field: AccountFieldKey) {
    setCreateTargetField(field);
    setCreateAccountOpen(true);
  }

  function setCreatedAccountOnField(field: AccountFieldKey, accountId: string) {
    if (field === "fixedAssetAccountId") {
      setForm((prev) => ({ ...prev, fixedAssetAccountId: accountId }));
      return;
    }
    if (field === "accumulatedDepreciationAccountId") {
      setForm((prev) => ({ ...prev, accumulatedDepreciationAccountId: accountId }));
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

  function applyTypeDefaults(typeId: string) {
    // Use the ref to avoid stale-closure issues with the assetTypes array
    const types = assetTypesRef.current;
    const selected = types.find((type) => type._id === typeId);
    if (!selected) {
      // Still persist the selected typeId even if we can't find its defaults
      setForm((prev) => ({ ...prev, fixedAssetTypeId: typeId }));
      return;
    }

    setOverrideAccounts(false);

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

  const handleToggleOverride = (checked: boolean) => {
    setOverrideAccounts(checked);
    if (!checked && form.fixedAssetTypeId) {
      const selected = assetTypesRef.current.find((type) => type._id === form.fixedAssetTypeId);
      if (selected) {
        setForm((prev) => ({
          ...prev,
          fixedAssetAccountId: getRefId(selected.fixedAssetAccountId),
          accumulatedDepreciationAccountId: getRefId(
            selected.accumulatedDepreciationAccountId,
          ),
          depreciationExpenseAccountId: getRefId(
            selected.depreciationExpenseAccountId,
          ),
        }));
      }
    }
  };

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

    if (form.fixedAssetAccountId === form.accumulatedDepreciationAccountId) {
      toast.error("Asset Account and Accumulated Depreciation Account cannot be the same GL account");
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
      const payload = {
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
      };

      if (isEditMode && editId) {
        await fixedAssetApi.update(editId, {
          ...payload,
          status: editStatus || undefined,
        });
        toast.success("Fixed asset updated");
      } else {
        await fixedAssetApi.create({
          ...payload,
          status: "DRAFT",
        });
        toast.success("Fixed asset saved as draft");
      }

      router.push("/accountant/fixed-assets");
    } catch (error) {
      toast.error((error as Error).message || "Failed to save fixed asset");
    } finally {
      setSaving(false);
    }
  }

  function renderAccountOptions(options: Account[]) {
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

  if (loadingData) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-white">
          <PageHeader
            breadcrumb={
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant</span>
                <span className="text-sm font-semibold text-slate-700 mt-0.5">Fixed Assets</span>
              </span>
            }
          />
          <main className="p-6">
            <div className="h-[60vh] flex items-center justify-center text-sm text-slate-500 bg-white">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-teal-600" /> Loading form...
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  const formTitle = isEditMode ? "Edit Fixed Asset" : cloneId ? "Clone Fixed Asset" : "New Fixed Asset";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white">
        <PageHeader
          breadcrumb={
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Accountant / Fixed Assets</span>
              <button
                type="button"
                onClick={() => router.push("/accountant/fixed-assets")}
                className="text-sm font-bold text-slate-800 leading-none mt-0.5 hover:text-teal-700 flex items-center"
              >
                <ChevronLeft className="h-4 w-4 mr-0.5 -ml-1 text-slate-500" />
                {formTitle}
              </button>
            </div>
          }
        />

        <main className="p-4 md:p-6">
          <div className="rounded-lg border bg-background">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h1 className="text-2xl font-semibold">{formTitle}</h1>
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
                  <Label>Asset Number</Label>
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
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-medium">Account Details</h2>
                  {form.fixedAssetTypeId && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="override-accounts"
                        checked={overrideAccounts}
                        onChange={(e) => handleToggleOverride(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                      <Label htmlFor="override-accounts" className="cursor-pointer text-sm font-medium">
                        Override default GL accounts
                      </Label>
                    </div>
                  )}
                </div>

                {!form.fixedAssetTypeId ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground bg-muted/10">
                    Please select a Fixed Asset Type to view account details.
                  </div>
                ) : !overrideAccounts ? (
                  <div className="rounded-md bg-muted/40 p-5 border text-sm text-muted-foreground shadow-sm">
                    <p className="font-semibold text-foreground mb-3 text-sm flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Inherited from Asset Type — override here for this asset only
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="bg-background/60 p-3 rounded border">
                        <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fixed Asset Account</span>
                        <span className="text-foreground font-medium mt-1.5 block">
                          {(() => {
                            const acc = accounts.find(a => a._id === form.fixedAssetAccountId);
                            return acc ? accountLabel(acc) : "None selected";
                          })()}
                        </span>
                      </div>
                      <div className="bg-background/60 p-3 rounded border">
                        <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Accumulated Depreciation Account</span>
                        <span className="text-foreground font-medium mt-1.5 block">
                          {(() => {
                            const acc = accounts.find(a => a._id === form.accumulatedDepreciationAccountId);
                            return acc ? accountLabel(acc) : "None selected";
                          })()}
                        </span>
                      </div>
                      <div className="bg-background/60 p-3 rounded border">
                        <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Depreciation Expense Account</span>
                        <span className="text-foreground font-medium mt-1.5 block">
                          {(() => {
                            const acc = accounts.find(a => a._id === form.depreciationExpenseAccountId);
                            return acc ? accountLabel(acc) : "None selected";
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
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
                          {accountOptionsForFixed.length === 0 ? (
                            <SelectItem value="__none_fixed" disabled>
                              No accounts available
                            </SelectItem>
                          ) : (
                            renderAccountOptions(accountOptionsForFixed)
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-red-500">
                        Accumulated Depreciation Account*
                      </Label>
                      <Select
                        value={form.accumulatedDepreciationAccountId}
                        onValueChange={(value) => {
                          if (value === NEW_ACCOUNT_VALUE) {
                            openCreateAccountFor(
                              "accumulatedDepreciationAccountId",
                            );
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            accumulatedDepreciationAccountId: value,
                          }));
                        }}
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
                          {accountOptionsForAccumulated.length === 0 ? (
                            <SelectItem value="__none_acc" disabled>
                              No accounts available
                            </SelectItem>
                          ) : (
                            renderAccountOptions(accountOptionsForAccumulated)
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
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
                          {accountOptionsForExpense.length === 0 ? (
                            <SelectItem value="__none_exp" disabled>
                              No accounts available
                            </SelectItem>
                          ) : (
                            renderAccountOptions(accountOptionsForExpense)
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="px-5 py-4 border-t flex items-center justify-between">
              <button
                type="button"
                onClick={handlePreview}
                className="text-sm text-teal-700 hover:text-teal-800 hover:underline font-semibold"
              >
                Preview Depreciation Entries
              </button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                  onClick={() => router.push("/accountant/fixed-assets")}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveDraft} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm">
                  {saving ?
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : null}
                  {isEditMode ? "Save Changes" : "Save as Draft"}
                </Button>
              </div>
            </div>
          </div>
        </main>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-teal-50 text-teal-700">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-range"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M17 14h-6"/><path d="M13 18H7"/></svg>
                </span>
                Depreciation Schedule Preview
              </DialogTitle>
            </DialogHeader>

            {projection && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/30 border text-xs">
                  <div>
                    <span className="text-muted-foreground block font-medium">Method</span>
                    <span className="font-semibold text-foreground">{form.depreciationMethod || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Frequency</span>
                    <span className="font-semibold text-foreground">{form.depreciationFrequency || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Asset Life</span>
                    <span className="font-semibold text-foreground">{form.assetLifeValue} {form.assetLifeUnit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block font-medium">Comp. Type</span>
                    <span className="font-semibold text-foreground">{form.computationType || "N/A"}</span>
                  </div>
                </div>

                <div className="rounded-lg border overflow-hidden shadow-xs">
                  <div className="overflow-x-auto max-h-[45vh] scrollbar-thin">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50 text-muted-foreground sticky top-0 backdrop-blur-xs border-b">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold">Period</th>
                          <th className="text-left px-4 py-3 font-semibold">Depreciation Date</th>
                          <th className="text-right px-4 py-3 font-semibold">Depreciation Amount</th>
                          <th className="text-right px-4 py-3 font-semibold">Accumulated Depr.</th>
                          <th className="text-right px-4 py-3 font-semibold">Book Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y bg-background">
                        {projection.rows.map((row, index) => (
                          <tr key={index} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-muted-foreground">
                              {index + 1}
                            </td>
                            <td className="px-4 py-2.5 text-foreground">
                              {new Date(row.depreciationDate).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-foreground">
                              {formatCurrency(row.depreciationValue)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-muted-foreground">
                              {formatCurrency(row.cumulativeDepreciationValue)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(row.currentValue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md" onClick={() => setPreviewOpen(false)}>
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <FixedAssetTypeDialog
          open={typeDialogOpen}
          onOpenChange={setTypeDialogOpen}
          onCreated={(created) => {
            const updated = [...assetTypesRef.current, created].sort((a, b) => a.name.localeCompare(b.name));
            assetTypesRef.current = updated;
            setAssetTypes(updated);
            applyTypeDefaults(created._id);
          }}
        />

        <AccountDialog
          open={createAccountOpen}
          onOpenChange={setCreateAccountOpen}
          allAccounts={accounts}
          initialAccountType={
            createTargetField === "depreciationExpenseAccountId"
              ? "Expense"
              : "Fixed Asset"
          }
          allowedAccountTypes={createAccountTypes}
          saveLabel="Save and Select"
          onSaved={handleAccountCreated}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
