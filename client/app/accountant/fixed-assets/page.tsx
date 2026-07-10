"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronLeft,
  Edit,
  Loader2,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FixedAssetTypeDialog } from "@/components/fixed-asset-type-dialog";
import {
  fixedAssetApi,
  type FixedAsset,
  type FixedAssetType,
} from "@/lib/api/fixed-assets";

type TabFilter = "DRAFT" | "All";
type DetailTab = "overview" | "depreciation";

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function typeName(typeRef: FixedAsset["fixedAssetTypeId"]) {
  if (!typeRef) return "-";
  if (typeof typeRef === "string") return "-";
  return typeRef.name || "-";
}

function refName(ref: unknown): string {
  if (!ref) return "-";
  if (typeof ref === "string") return "-";
  if (typeof ref === "object" && ref !== null && "name" in ref) {
    const row = ref as { name?: string; code?: string };
    const name = row.name;
    if (!name) return "-";
    const code = String(row.code || "").trim();
    return code ? `[ ${code} ] ${name}` : name;
  }
  return "-";
}

function sortAssetTypes(rows: FixedAssetType[]): FixedAssetType[] {
  return [...rows].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

function toDateString(input: string | undefined | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toDateTimeString(input: string | Date | undefined | null) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

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

function getPeriods(asset: FixedAsset) {
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

function buildDepreciationProjection(
  asset: FixedAsset,
): DepreciationProjection {
  const periods = getPeriods(asset);
  const startDate = new Date(
    asset.depreciationStartDate ||
      asset.purchaseDate ||
      new Date().toISOString(),
  );

  const openingValue = Math.max(
    0,
    Number(asset.currentValue || asset.purchaseValue || 0),
  );
  const floorValue = Math.max(0, Number(asset.disposalValue || 0));
  let remainingValue = openingValue;
  let cumulative = 0;

  const rows: ForecastRow[] = [];
  const points: ForecastPoint[] = [];

  const straightLineBase =
    periods > 0 ? (openingValue - floorValue) / periods : 0;
  const decliningPercentage = Number(asset.depreciationPercentage || 0);
  const fallbackDecliningRate = Math.min(
    0.95,
    Math.max(0.01, 2 / Math.max(1, periods)),
  );
  const annualDecliningRate =
    decliningPercentage > 0 ?
      Math.max(0, Math.min(1, decliningPercentage / 100))
    : fallbackDecliningRate;

  const monthBasedDecliningRate =
    asset.depreciationFrequency === "Monthly" ?
      annualDecliningRate / 12
    : annualDecliningRate;

  const computeDecliningValue = (
    index: number,
    available: number,
    periodDate: Date,
  ) => {
    const isProRata = asset.computationType === "Pro Rata";

    if (!isProRata) {
      return round2(available * monthBasedDecliningRate);
    }

    if (asset.depreciationFrequency === "Monthly") {
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
        Math.floor(
          (end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ) + 1,
      );
    }
    const ratio = periodDays / totalYearDays;
    return round2(available * annualDecliningRate * ratio);
  };

  for (let index = 0; index < periods; index += 1) {
    let periodDate = new Date(startDate);
    if (asset.depreciationFrequency === "Monthly") {
      periodDate.setMonth(periodDate.getMonth() + index);
      periodDate = monthEnd(periodDate);
    } else {
      periodDate.setFullYear(periodDate.getFullYear() + index);
      periodDate = yearEnd(periodDate);
    }

    const remainingPeriods = periods - index;
    const available = Math.max(0, remainingValue - floorValue);

    let depreciationValue = 0;
    if (asset.depreciationMethod === "Declining Balance") {
      depreciationValue = computeDecliningValue(index, available, periodDate);
    } else {
      depreciationValue = round2(straightLineBase);
    }

    if (
      asset.depreciationMethod !== "Declining Balance" &&
      remainingPeriods === 1
    ) {
      depreciationValue = round2(available);
    }

    depreciationValue = Math.min(depreciationValue, available);
    depreciationValue = Math.max(0, depreciationValue);

    cumulative = round2(cumulative + depreciationValue);
    remainingValue = round2(
      Math.max(floorValue, remainingValue - depreciationValue),
    );

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
  if (asset.depreciationMethod === "Declining Balance" && residual > 0.009) {
    let finalDate = new Date(startDate);
    if (asset.depreciationFrequency === "Monthly") {
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

function AssetOverview({ asset }: { asset: FixedAsset }) {
  const billId = asset.sourceBillId || "";
  const billNumber = String(asset.sourceBillNumber || "").trim();

  return (
    <div className="space-y-6 p-4">
      {billId ? (
        <section className="rounded-md border bg-muted/10 p-4">
          <h3 className="text-lg font-medium">Associated Transactions</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Bill - {" "}
            <Link
              href={`/purchases/bills?billId=${billId}`}
              className="font-medium text-primary hover:underline"
            >
              {billNumber || "View Bill"}
            </Link>
          </p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Fixed Asset Type
          </p>
          <p className="text-xl font-semibold mt-1">
            {typeName(asset.fixedAssetTypeId)}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Purchase Value
          </p>
          <p className="text-xl font-semibold mt-1">
            {formatCurrency(asset.purchaseValue)}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Current Value
          </p>
          <p className="text-xl font-semibold mt-1">
            {formatCurrency(asset.currentValue)}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-2xl font-medium">Asset Details</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Asset Name</p>
            <p className="font-medium">{asset.assetName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Asset Number</p>
            <p className="font-medium">{asset.assetNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Depreciation Start Value</p>
            <p className="font-medium">
              {formatCurrency(asset.currentValue || asset.purchaseValue)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Purchase Date</p>
            <p className="font-medium">{toDateString(asset.purchaseDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Purchase Quantity</p>
            <p className="font-medium">{asset.purchaseQuantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Current Quantity</p>
            <p className="font-medium">{asset.currentQuantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Asset Life</p>
            <p className="font-medium">
              {asset.assetLifeValue} ({asset.assetLifeUnit.toLowerCase()})
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Description</p>
            <p className="font-medium">{asset.description || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Serial Number</p>
            <p className="font-medium">{asset.serialNumber || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Disposal Value</p>
            <p className="font-medium">
              {asset.disposalValue > 0 ?
                formatCurrency(asset.disposalValue)
              : "-"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Notes</p>
            <p className="font-medium">-</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-2xl font-medium">Depreciation Details</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Depreciation Method</p>
            <p className="font-medium">{asset.depreciationMethod}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Computation Type</p>
            <p className="font-medium">{asset.computationType}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Depreciation Frequency</p>
            <p className="font-medium">{asset.depreciationFrequency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Depreciation Start Date</p>
            <p className="font-medium">
              {toDateString(asset.depreciationStartDate)}
            </p>
          </div>
          {asset.depreciationMethod === "Declining Balance" ?
            <div>
              <p className="text-muted-foreground">Depreciation percentage</p>
              <p className="font-medium">
                {asset.depreciationPercentage ?
                  `${asset.depreciationPercentage}%`
                : "-"}
              </p>
            </div>
          : null}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-2xl font-medium">Account Details</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2 text-sm">
          <div>
            <p className="text-muted-foreground">Fixed Asset Account</p>
            <p className="font-medium">{refName(asset.fixedAssetAccountId)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">
              Accumulated Depreciation Account
            </p>
            <p className="font-medium">
              {refName(asset.accumulatedDepreciationAccountId)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              Depreciation Expense Account
            </p>
            <p className="font-medium">
              {refName(asset.depreciationExpenseAccountId)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AssetDepreciation({ asset }: { asset: FixedAsset }) {
  const projection = useMemo(() => buildDepreciationProjection(asset), [asset]);

  return (
    <div className="space-y-6 p-4">
      <div className="rounded-md border bg-muted/20 p-4">
        <p className="text-xl font-medium mb-3">Depreciation Flowchart</p>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={projection.points}
              margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(value: number) =>
                  value >= 1000 ?
                    `${(value / 1000).toFixed(1)} K`
                  : String(value)
                }
              />
              <Tooltip
                formatter={(value: number) => [
                  formatCurrency(value),
                  "Current Value",
                ]}
                labelFormatter={(_, payload) => {
                  const first = payload?.[0]?.payload as
                    | ForecastPoint
                    | undefined;
                  return first ? toDateString(first.date) : "";
                }}
              />
              <Line
                type="monotone"
                dataKey="currentValue"
                stroke="#d9a15b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20">
          <h4 className="font-medium">Depreciation Forecast</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/10 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Depreciation Date</th>
                <th className="text-right px-3 py-2">Depreciation Value</th>
                <th className="text-right px-3 py-2">
                  Cumulated Depreciation Value
                </th>
                <th className="text-right px-3 py-2">Current Value</th>
              </tr>
            </thead>
            <tbody>
              {projection.rows.map((row) => (
                <tr key={row.depreciationDate} className="border-t">
                  <td className="px-3 py-2">
                    {toDateString(row.depreciationDate)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(row.depreciationValue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(row.cumulativeDepreciationValue)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(row.currentValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FixedAssetsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [rows, setRows] = useState<FixedAsset[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>("All");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markingActive, setMarkingActive] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [typeDialogMode, setTypeDialogMode] = useState<"create" | "edit" | "clone">("create");
  const [selectedType, setSelectedType] = useState<FixedAssetType | null>(null);
  const [assetTypes, setAssetTypes] = useState<FixedAssetType[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fixedAssetApi.listTypes();
      setAssetTypes(sortAssetTypes(res.data ?? []));
    } catch {
      setAssetTypes([]);
    }
  }, []);

  const fetchRows = useCallback(async () => {
    if (!activeOrganization?._id) return;
    setFetching(true);
    try {
      const res = await fixedAssetApi.list({
        page: 1,
        limit: 200,
        status: tab,
        search: search.trim() || undefined,
      });
      setRows(res.data ?? []);
    } catch (error) {
      toast.error((error as Error).message || "Failed to load fixed assets");
      setRows([]);
    } finally {
      setFetching(false);
    }
  }, [activeOrganization?._id, search, tab]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && activeOrganization?._id) {
      void fetchRows();
      void fetchTypes();
    }
  }, [
    loading,
    orgLoading,
    firebaseUser,
    activeOrganization?._id,
    fetchRows,
    fetchTypes,
  ]);

  const filteredCountLabel = useMemo(() => {
    if (tab === "DRAFT") return "Draft Assets";
    return "All Fixed Assets";
  }, [tab]);

  const selectedAsset = useMemo(
    () => rows.find((row) => row._id === selectedId) ?? null,
    [rows, selectedId],
  );

  const selectedComments = useMemo(() => {
    if (!selectedAsset) return [];

    const current = Array.isArray(selectedAsset.comments) ? selectedAsset.comments : [];
    if (current.length > 0) return current;

    return [
      {
        author: "System",
        text: "Fixed asset created.",
        time: selectedAsset.createdAt,
        isSystem: true,
      },
    ];
  }, [selectedAsset]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }

    if (selectedId && !rows.some((row) => row._id === selectedId)) {
      setSelectedId(null);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    setCommentText("");
    setShowComments(false);
  }, [selectedId]);

  async function handleMarkActive() {
    if (!selectedAsset) return;
    if (selectedAsset.status === "ACTIVE") return;

    setMarkingActive(true);
    try {
      const res = await fixedAssetApi.update(selectedAsset._id, {
        status: "ACTIVE",
      });
      setRows((prev) =>
        prev.map((row) => (row._id === selectedAsset._id ? res.data : row)),
      );
      toast.success("Asset marked as active");
    } catch (error) {
      toast.error((error as Error).message || "Failed to mark asset as active");
    } finally {
      setMarkingActive(false);
    }
  }

  async function handleDeleteAsset() {
    if (!selectedAsset) return;

    const assetLabel = selectedAsset.assetName || selectedAsset.assetNumber;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete fixed asset \"${assetLabel}\"?`);
    if (!ok) return;

    setDeletingAsset(true);
    try {
      await fixedAssetApi.remove(selectedAsset._id);
      setRows((prev) => prev.filter((row) => row._id !== selectedAsset._id));
      setShowComments(false);
      toast.success("Fixed asset deleted");
    } catch (error) {
      toast.error((error as Error).message || "Failed to delete fixed asset");
    } finally {
      setDeletingAsset(false);
    }
  }

  async function handleAddComment() {
    if (!selectedAsset) return;
    const text = commentText.trim();
    if (!text) return;

    setAddingComment(true);
    try {
      const res = await fixedAssetApi.addComment(selectedAsset._id, text);
      setRows((prev) =>
        prev.map((row) =>
          row._id === selectedAsset._id
            ? {
                ...row,
                comments: [...(row.comments || []), res.data],
              }
            : row,
        ),
      );
      setCommentText("");
      toast.success("Comment added");
    } catch (error) {
      toast.error((error as Error).message || "Failed to add comment");
    } finally {
      setAddingComment(false);
    }
  }

  function handleAssetClick(assetId: string) {
    if (selectedId === assetId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(assetId);
    setDetailTab("overview");
  }

  function openCreateTypeDialog() {
    setTypeDialogMode("create");
    setSelectedType(null);
    setTypeDialogOpen(true);
  }

  function openEditTypeDialog(type: FixedAssetType) {
    setTypeDialogMode("edit");
    setSelectedType(type);
    setTypeDialogOpen(true);
  }

  function openCloneTypeDialog(type: FixedAssetType) {
    setTypeDialogMode("clone");
    setSelectedType(type);
    setTypeDialogOpen(true);
  }

  function handleTypeSaved(saved: FixedAssetType) {
    setAssetTypes((prev) =>
      sortAssetTypes([
        ...prev.filter((type) => type._id !== saved._id),
        saved,
      ]),
    );
  }

  async function handleDeleteType(type: FixedAssetType) {
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(`Delete fixed asset type \"${type.name}\"?`);
    if (!ok) return;

    try {
      await fixedAssetApi.removeType(type._id);
      setAssetTypes((prev) => prev.filter((row) => row._id !== type._id));
      toast.success("Fixed asset type deleted");
    } catch (error) {
      toast.error((error as Error).message || "Failed to delete fixed asset type");
    }
  }

  const showEmpty = !fetching && rows.length === 0;

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

        <main className="p-4 md:p-6 space-y-4">
          {showTypeManager ? (
            <div className="rounded-md border bg-background overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowTypeManager(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Fixed Assets</p>
                    <h2 className="text-2xl font-semibold truncate">Fixed Asset Types</h2>
                  </div>
                </div>

                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm" onClick={openCreateTypeDialog}>
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Asset Type Name</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Depreciation Method</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Depreciation Account</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Expense Account</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetTypes.map((type) => (
                      <tr key={type._id} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-700">{type.name}</td>
                        <td className="px-4 py-3 text-slate-600">{type.depreciationMethod}</td>
                        <td className="px-4 py-3 text-slate-500">{refName(type.accumulatedDepreciationAccountId)}</td>
                        <td className="px-4 py-3 text-slate-500">{refName(type.depreciationExpenseAccountId)}</td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-teal-700 hover:bg-slate-100 rounded-md">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => openEditTypeDialog(type)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openCloneTypeDialog(type)}>
                                Clone
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  void handleDeleteType(type);
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}

                    {assetTypes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                          No fixed asset types found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant={tab === "DRAFT" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("DRAFT")}
                className={tab === "DRAFT" ? "bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"}
              >
                Draft Assets
              </Button>
              <Button
                variant={tab === "All" ? "default" : "outline"}
                size="sm"
                onClick={() => setTab("All")}
                className={tab === "All" ? "bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"}
              >
                All Fixed Assets
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                onClick={() => {
                  void fetchTypes();
                  setShowTypeManager(true);
                }}
              >
                Manage Asset Types ({assetTypes.length})
              </Button>
              <Link href="/accountant/fixed-assets/new">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative max-w-md">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchRows();
              }}
              placeholder="Search in Fixed Assets"
              className="pl-9 focus-visible:ring-teal-600/20 focus-visible:border-teal-500"
            />
          </div>

          <div className="rounded-md border bg-background">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-sm">{filteredCountLabel}</h2>
              <Badge variant="secondary">{rows.length}</Badge>
            </div>

            {fetching ?
              <div className="h-64 flex items-center justify-center text-sm text-slate-500 bg-white">
                <Loader2 className="h-6 w-6 animate-spin mr-2 text-teal-600" /> Loading fixed assets...
              </div>
            : showEmpty ?
              <div className="h-105 flex flex-col items-center justify-center text-center px-6 bg-white py-16">
                <h3 className="text-xl font-bold mb-2 text-slate-800">
                  Start Tracking Fixed Assets
                </h3>
                <p className="text-slate-500 mb-6 max-w-sm">
                  Create fixed assets to track their depreciation and lifecycle
                </p>
                <Link href="/accountant/fixed-assets/new">
                  <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Fixed Asset
                  </Button>
                </Link>
              </div>
            : selectedAsset ?
              <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] min-h-160">
                <div className="border-r">
                  <div className="overflow-y-auto max-h-185">
                    {rows.map((asset) => {
                      const active = asset._id === selectedId;
                      return (
                        <button
                          key={asset._id}
                          type="button"
                          onClick={() => handleAssetClick(asset._id)}
                          className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                            active ? "bg-teal-50/50 border-l-[3px] border-l-teal-600" : "hover:bg-teal-50/20 border-l-[3px] border-l-transparent"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-700">{asset.assetName}</p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {asset.assetNumber}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-700">
                                {formatCurrency(asset.purchaseValue)}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                {asset.status === "ACTIVE" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                    Active
                                  </span>
                                )}
                                {asset.status === "DRAFT" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                    <span className="h-1 w-1 rounded-full bg-slate-400" />
                                    Draft
                                  </span>
                                )}
                                {asset.status === "DISPOSED" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                                    <span className="h-1 w-1 rounded-full bg-rose-500" />
                                    Disposed
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="px-4 py-4 border-b">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-2xl font-bold truncate">
                          {selectedAsset.assetName}
                        </h3>
                        <Badge
                          variant={
                            selectedAsset.status === "DRAFT" ?
                              "secondary"
                            : "default"
                          }
                        >
                          {selectedAsset.status}
                        </Badge>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Link
                          href={`/accountant/fixed-assets/new?edit=${selectedAsset._id}`}
                        >
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4 mr-1" /> Edit
                          </Button>
                        </Link>
                        <Link
                          href={`/accountant/fixed-assets/new?clone=${selectedAsset._id}`}
                        >
                          <Button variant="outline" size="sm">
                            Clone
                          </Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarkActive}
                          disabled={
                            markingActive || selectedAsset.status === "ACTIVE"
                          }
                        >
                          {markingActive ?
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          : null}
                          Mark as Active
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-9 w-9">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={deletingAsset}
                              onClick={() => {
                                void handleDeleteAsset();
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="relative h-9 w-9"
                          onClick={() => setShowComments(true)}
                          title="Comments & History"
                        >
                          <MessageSquare className="h-4 w-4" />
                          {selectedComments.length > 0 ?
                            <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                              {selectedComments.length > 9 ? "9+" : selectedComments.length}
                            </span>
                          : null}
                        </Button>
                        <div className="h-5 w-px bg-border" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setSelectedId(null)}
                          title="Close"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 border-b">
                    <div className="flex items-center gap-6">
                      <button
                        type="button"
                        className={`py-3 text-sm border-b-2 transition-colors ${
                          detailTab === "overview" ?
                            "border-teal-600 text-teal-700 font-semibold"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                        }`}
                        onClick={() => setDetailTab("overview")}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        className={`py-3 text-sm border-b-2 transition-colors ${
                          detailTab === "depreciation" ?
                            "border-primary text-foreground font-medium"
                          : "border-transparent text-muted-foreground"
                        }`}
                        onClick={() => setDetailTab("depreciation")}
                      >
                        Depreciation
                      </button>
                    </div>
                  </div>

                  {detailTab === "overview" ?
                    <AssetOverview asset={selectedAsset} />
                  : <AssetDepreciation asset={selectedAsset} />}

                  <Sheet open={showComments} onOpenChange={setShowComments}>
                    <SheetContent
                      side="right"
                      className="p-0 sm:max-w-[400px]"
                    >
                      <SheetHeader className="px-5 py-4 border-b">
                        <SheetTitle>Comments & History</SheetTitle>
                      </SheetHeader>

                      <div className="flex h-full flex-col overflow-hidden">
                        <div className="border-b p-4 space-y-3">
                          <Textarea
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Type your comment here..."
                            className="min-h-24"
                          />
                          <div>
                            <Button
                              size="sm"
                              onClick={() => {
                                void handleAddComment();
                              }}
                              disabled={!commentText.trim() || addingComment}
                            >
                              {addingComment ?
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              : null}
                              Add Comment
                            </Button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              All Comments
                            </h4>
                            <Badge variant="secondary">{selectedComments.length}</Badge>
                          </div>

                          <div className="space-y-3">
                            {[...selectedComments]
                              .reverse()
                              .map((comment, index) => (
                                <div
                                  key={`${comment.time}-${index}`}
                                  className="rounded-md border p-3"
                                >
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">
                                      {comment.author || "User"}
                                    </span>
                                    <span>{toDateTimeString(comment.time)}</span>
                                  </div>
                                  <p className="mt-2 text-sm">{comment.text}</p>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            : <div className="overflow-y-auto">
                 {rows.map((asset) => (
                   <button
                     key={asset._id}
                     type="button"
                     onClick={() => handleAssetClick(asset._id)}
                     className="w-full text-left px-6 py-4 border-b border-slate-100 transition-colors hover:bg-teal-50/20"
                   >
                     <div className="flex items-start justify-between gap-3">
                       <div>
                         <p className="font-semibold text-teal-700 hover:text-teal-800 hover:underline">{asset.assetName}</p>
                         <p className="text-xs text-slate-400 mt-1">
                           {asset.assetNumber}
                         </p>
                       </div>
                       <div className="text-right">
                         <p className="font-semibold text-slate-700">
                           {formatCurrency(asset.purchaseValue)}
                         </p>
                         <p className="text-xs text-slate-500 mt-1">
                                {asset.status === "ACTIVE" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                                    Active
                                  </span>
                                )}
                                {asset.status === "DRAFT" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                    <span className="h-1 w-1 rounded-full bg-slate-400" />
                                    Draft
                                  </span>
                                )}
                                {asset.status === "DISPOSED" && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                                    <span className="h-1 w-1 rounded-full bg-rose-500" />
                                    Disposed
                                  </span>
                                )}
                         </p>
                       </div>
                     </div>
                   </button>
                 ))}
               </div>
            }
          </div>
            </>
          )}
        </main>

        <FixedAssetTypeDialog
          open={typeDialogOpen}
          onOpenChange={setTypeDialogOpen}
          mode={typeDialogMode}
          initialType={selectedType}
          onSaved={handleTypeSaved}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
