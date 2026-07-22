/**
 * fixed-asset-depreciation.service.ts
 *
 * Posts depreciation journal entries for Fixed Assets.
 *
 * Journal per period:
 *   Dr  Depreciation Expense Account      depreciationAmount
 *   Cr  Accumulated Depreciation Account  depreciationAmount
 *
 * VoucherId format: `fixedasset:dep:{assetId}:{YYYY-MM}` — idempotent per period.
 * Re-posting the same period replaces the previous entry (via postVoucher cleanup).
 */

import { Types } from "mongoose";
import { AuthenticatedRequest } from "../types";
import { postVoucher, reverseVoucher } from "./gl-posting.service";
import { ValidationError } from "../utils/errors";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(val: unknown, fallback = 0): number {
  const n = Number(val ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function periodKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function depreciationVoucherId(assetId: string, periodDate: Date): string {
  return `fixedasset:dep:${assetId}:${periodKey(periodDate)}`;
}

export interface PostDepreciationParams {
  asset: {
    _id: Types.ObjectId | string;
    organizationId: Types.ObjectId | string;
    assetName: string;
    assetNumber?: string;
    purchaseValue: number;
    currentValue: number;
    disposalValue: number;
    depreciationMethod: string;
    depreciationPercentage?: number | null;
    depreciationFrequency: string;
    assetLifeValue: number;
    computationType: string;
    status: string;
    fixedAssetAccountId?: Types.ObjectId | string | null;
    accumulatedDepreciationAccountId?: Types.ObjectId | string | null;
    depreciationExpenseAccountId?: Types.ObjectId | string | null;
  };
  periodDate: Date;
  req?: AuthenticatedRequest;
}

export interface PostDepreciationResult {
  posted: boolean;
  periodKey: string;
  depreciationAmount: number;
  entryIds: string[];
  message?: string;
}

/**
 * Computes the depreciation amount for a single period.
 */
export function computePeriodDepreciation(params: {
  purchaseValue: number;
  currentValue: number;
  disposalValue: number;
  depreciationMethod: string;
  depreciationPercentage?: number | null;
  assetLifeValue: number;
  depreciationFrequency: string;
  computationType: string;
  periodIndex?: number; // 0-based
}): number {
  const {
    currentValue,
    disposalValue,
    depreciationMethod,
    depreciationPercentage,
    assetLifeValue,
    depreciationFrequency,
  } = params;

  const life = Math.max(1, toNum(assetLifeValue));
  const floor = Math.max(0, toNum(disposalValue));
  const available = Math.max(0, toNum(currentValue) - floor);

  if (available <= 0.009) return 0;

  if (depreciationMethod === "Declining Balance") {
    const annualRate = toNum(depreciationPercentage, 0) / 100;
    if (annualRate <= 0) return 0;
    const periodRate =
      depreciationFrequency === "Monthly" ? annualRate / 12 : annualRate;
    return round2(Math.min(available, round2(available * periodRate)));
  }

  // Straight Line
  const periods =
    depreciationFrequency === "Monthly"
      ? life
      : Math.max(1, Math.ceil(life / 12));

  return round2(Math.min(available, round2(available / periods)));
}

/**
 * Posts a depreciation journal for the given asset and period.
 * If an entry for this period already exists it will be replaced (postVoucher is idempotent).
 */
export async function postDepreciationEntry(
  params: PostDepreciationParams,
): Promise<PostDepreciationResult> {
  const { asset, periodDate, req } = params;
  const assetId = String(asset._id);
  const organizationId = asset.organizationId;
  const pk = periodKey(periodDate);

  // Validate status
  if (String(asset.status || "").toUpperCase() !== "ACTIVE") {
    throw new ValidationError(
      "Depreciation can only be posted for ACTIVE assets",
    );
  }

  // Validate account mappings
  if (!asset.accumulatedDepreciationAccountId) {
    throw new ValidationError(
      "Accumulated Depreciation account is required to post depreciation",
    );
  }
  if (!asset.depreciationExpenseAccountId) {
    throw new ValidationError(
      "Depreciation Expense account is required to post depreciation",
    );
  }

  const amount = computePeriodDepreciation({
    purchaseValue: toNum(asset.purchaseValue),
    currentValue: toNum(asset.currentValue),
    disposalValue: toNum(asset.disposalValue),
    depreciationMethod: asset.depreciationMethod,
    depreciationPercentage: asset.depreciationPercentage,
    assetLifeValue: toNum(asset.assetLifeValue),
    depreciationFrequency: asset.depreciationFrequency,
    computationType: asset.computationType,
  });

  if (amount < 0.009) {
    return {
      posted: false,
      periodKey: pk,
      depreciationAmount: 0,
      entryIds: [],
      message: "No depreciation to post (asset fully depreciated or zero value)",
    };
  }

  const voucherId = depreciationVoucherId(assetId, periodDate);
  const voucherNo = `DEP-${String(asset.assetNumber || assetId).slice(-8)}-${pk}`;

  const result = await postVoucher({
    organizationId,
    voucherType: "FixedAsset",
    voucherId,
    voucherNo,
    postingDate: periodDate,
    lines: [
      {
        accountId: asset.depreciationExpenseAccountId!,
        debit: amount,
        description: `Depreciation – ${asset.assetName} (${pk})`,
      },
      {
        accountId: asset.accumulatedDepreciationAccountId!,
        credit: amount,
        description: `Accumulated depreciation – ${asset.assetName} (${pk})`,
      },
    ],
    description: `Monthly depreciation for ${asset.assetName}`,
    req,
  });

  return {
    posted: result.posted,
    periodKey: pk,
    depreciationAmount: amount,
    entryIds: result.entryIds,
  };
}

/**
 * Reverses a depreciation entry for the given asset and period.
 * Used when an asset is disposed or the entry needs to be corrected.
 */
export async function reverseDepreciationEntry(params: {
  assetId: string;
  organizationId: Types.ObjectId | string;
  periodDate: Date;
  req?: AuthenticatedRequest;
}): Promise<{ reversed: boolean }> {
  return reverseVoucher({
    organizationId: params.organizationId,
    voucherType: "FixedAsset",
    voucherId: depreciationVoucherId(params.assetId, params.periodDate),
    reversalVoucherNo: `REV-DEP-${params.assetId.slice(-6)}-${periodKey(params.periodDate)}`,
    postingDate: new Date(),
    description: `Depreciation reversal for asset ${params.assetId}`,
    req: params.req,
  });
}

/**
 * Posts the purchase journal for a manually-created Fixed Asset (no source bill).
 *
 *   Dr  Fixed Asset Account    purchaseValue
 *   Cr  Accounts Payable       purchaseValue
 *
 * This must ONLY be called when there is no sourceBillId.
 * If the asset came from a bill, the bill already posted the purchase journal.
 */
export async function postAssetPurchaseJournal(params: {
  asset: {
    _id: Types.ObjectId | string;
    organizationId: Types.ObjectId | string;
    assetName: string;
    assetNumber?: string;
    purchaseValue: number;
    purchaseDate: Date;
    fixedAssetAccountId?: Types.ObjectId | string | null;
    vendorId?: Types.ObjectId | string | null;
    accountsPayableId?: Types.ObjectId | string | null;
  };
  accountsPayableAccountId: Types.ObjectId | string;
  req?: AuthenticatedRequest;
}): Promise<{ posted: boolean; entryIds: string[] }> {
  const { asset, accountsPayableAccountId, req } = params;

  if (!asset.fixedAssetAccountId) {
    throw new ValidationError(
      "Fixed Asset account is required to post purchase journal",
    );
  }

  const assetId = String(asset._id);
  const voucherId = `fixedasset:purchase:${assetId}`;
  const voucherNo = `FA-${String(asset.assetNumber || assetId).slice(-8)}`;

  return postVoucher({
    organizationId: asset.organizationId,
    voucherType: "FixedAsset",
    voucherId,
    voucherNo,
    postingDate: asset.purchaseDate || new Date(),
    lines: [
      {
        accountId: asset.fixedAssetAccountId!,
        debit: round2(toNum(asset.purchaseValue)),
        description: `Asset purchase – ${asset.assetName}`,
        contactType: asset.vendorId ? "Vendor" : undefined,
        contactId: asset.vendorId ?? null,
      },
      {
        accountId: accountsPayableAccountId,
        credit: round2(toNum(asset.purchaseValue)),
        description: `Asset payable – ${asset.assetName}`,
        contactType: asset.vendorId ? "Vendor" : undefined,
        contactId: asset.vendorId ?? null,
      },
    ],
    description: `Fixed asset purchase: ${asset.assetName}`,
    req,
  });
}

/**
 * Reverses the purchase journal for a fixed asset (e.g. on deletion).
 */
export async function reversePurchaseJournal(params: {
  assetId: string;
  assetNumber?: string;
  organizationId: Types.ObjectId | string;
  req?: AuthenticatedRequest;
}): Promise<{ reversed: boolean }> {
  return reverseVoucher({
    organizationId: params.organizationId,
    voucherType: "FixedAsset",
    voucherId: `fixedasset:purchase:${params.assetId}`,
    reversalVoucherNo: `REV-FA-${String(params.assetNumber || params.assetId).slice(-8)}`,
    postingDate: new Date(),
    description: `Fixed asset purchase reversal – ${params.assetId}`,
    req: params.req,
  });
}
