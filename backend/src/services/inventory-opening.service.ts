import { Types } from "mongoose";
import Account from "../models/account.model";
import Item from "../models/item.model";
import { findAccountIdByName } from "./gl-posting.service";

const OPENING_BALANCE_ADJUSTMENT_ACCOUNT = "Opening Balance Adjustments";
const INVENTORY_ASSET_ACCOUNT_NAMES = [
  "Inventory Asset (Stock)",
  "Inventory Asset",
  "Inventory",
  "Stock",
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
}

function toObjectIdString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return Types.ObjectId.isValid(value) ? value : "";
  if (typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)) {
    const id = String((value as { _id?: unknown })._id || "");
    return Types.ObjectId.isValid(id) ? id : "";
  }
  const raw = String(value);
  return Types.ObjectId.isValid(raw) ? raw : "";
}

function toFinite(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return round2(n);
}

function toDeltaEntries(deltas: Record<string, number>): Array<[string, number]> {
  return Object.entries(deltas || {}).filter(([accountId, delta]) => {
    if (!Types.ObjectId.isValid(accountId)) return false;
    return Math.abs(toFinite(delta)) >= 0.009;
  }).map(([accountId, delta]) => [accountId, toFinite(delta)]);
}

async function resolveDefaultInventoryAssetAccountId(
  organizationId: Types.ObjectId,
): Promise<string> {
  try {
    const accountId = await findAccountIdByName({
      organizationId,
      names: INVENTORY_ASSET_ACCOUNT_NAMES,
      rootType: "Asset",
      accountType: "Stock",
    });
    return String(accountId);
  } catch {
    return "";
  }
}

async function rebalanceOpeningBalanceAdjustmentsAccount(
  organizationId: Types.ObjectId,
): Promise<number> {
  const adjustmentAccount = await Account.findOne({
    organizationId,
    name: OPENING_BALANCE_ADJUSTMENT_ACCOUNT,
    isDeleted: false,
    isGroup: false,
  }).select("_id openingBalance").lean();

  if (!adjustmentAccount) return 0;

  const rows = await Account.aggregate([
    {
      $match: {
        organizationId,
        isDeleted: false,
        isGroup: false,
        _id: { $ne: adjustmentAccount._id },
      },
    },
    {
      $group: {
        _id: null,
        totalSignedOpening: { $sum: { $ifNull: ["$openingBalance", 0] } },
      },
    },
  ]);

  const totalWithoutAdjustment = toFinite(rows?.[0]?.totalSignedOpening || 0);
  const targetAdjustmentOpening = round2(-totalWithoutAdjustment);
  const currentAdjustmentOpening = toFinite((adjustmentAccount as any).openingBalance);
  const delta = round2(targetAdjustmentOpening - currentAdjustmentOpening);

  if (Math.abs(delta) < 0.009) return 0;

  await Account.updateOne({
    _id: adjustmentAccount._id,
    organizationId,
    isDeleted: false,
    isGroup: false,
  }, {
    $inc: {
      openingBalance: delta,
      balance: delta,
    },
  });

  return delta;
}

export async function applyInventoryOpeningDeltas(params: {
  organizationId: Types.ObjectId | string;
  deltas: Record<string, number>;
}): Promise<{ touched: number; netDelta: number }> {
  const organizationId = toObjectId(params.organizationId);
  const entries = toDeltaEntries(params.deltas);
  if (entries.length === 0) {
    return { touched: 0, netDelta: 0 };
  }

  const candidateIds = entries.map(([accountId]) => new Types.ObjectId(accountId));
  const activeAccounts = await Account.find({
    _id: { $in: candidateIds },
    organizationId,
    isDeleted: false,
    isGroup: false,
  }).select("_id").lean();

  const activeAccountIds = new Set(activeAccounts.map((account: any) => String(account._id)));
  const validEntries = entries.filter(([accountId]) => activeAccountIds.has(accountId));
  if (validEntries.length === 0) {
    return { touched: 0, netDelta: 0 };
  }

  const netDelta = round2(validEntries.reduce((sum, [, delta]) => sum + delta, 0));
  const ops: any[] = validEntries.map(([accountId, delta]) => ({
    updateOne: {
      filter: {
        _id: accountId,
        organizationId,
        isDeleted: false,
        isGroup: false,
      },
      update: {
        $inc: {
          openingBalance: delta,
          balance: delta,
        },
      },
    },
  }));

  const adjustmentAccount = await Account.findOne({
    organizationId,
    name: OPENING_BALANCE_ADJUSTMENT_ACCOUNT,
    isDeleted: false,
    isGroup: false,
  }).select("_id").lean();

  if (adjustmentAccount && Math.abs(netDelta) >= 0.009) {
    ops.push({
      updateOne: {
        filter: {
          _id: adjustmentAccount._id,
          organizationId,
          isDeleted: false,
          isGroup: false,
        },
        update: {
          $inc: {
            openingBalance: round2(-netDelta),
            balance: round2(-netDelta),
          },
        },
      },
    });
  }

  await Account.bulkWrite(ops);
  return { touched: validEntries.length, netDelta };
}

export async function reconcileInventoryOpeningBalances(params: {
  organizationId: Types.ObjectId | string;
}): Promise<{ touched: number; netDelta: number }> {
  const organizationId = toObjectId(params.organizationId);

  const [activeTrackedItems, historicalAccountValues] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
    }).select("inventoryAccountId inventoryValue").lean(),
    Item.distinct("inventoryAccountId", {
      organizationId,
      inventoryTracked: true,
      inventoryAccountId: { $ne: null },
    }),
  ]);

  const historicalAccountIds = Array.from(new Set(
    (historicalAccountValues || [])
      .map((value: unknown) => toObjectIdString(value))
      .filter(Boolean),
  ));

  const historicalAccounts = historicalAccountIds.length > 0
    ? await Account.find({
      _id: { $in: historicalAccountIds.map((id) => new Types.ObjectId(id)) },
      organizationId,
      isDeleted: false,
      isGroup: false,
    }).select("_id").lean()
    : [];

  const comparableAccountIds = new Set(historicalAccounts.map((account: any) => String(account._id)));

  const needsFallbackInventoryAccount = activeTrackedItems.some((item: any) => {
    const accountId = toObjectIdString(item?.inventoryAccountId);
    return !accountId || !comparableAccountIds.has(accountId);
  });

  const fallbackInventoryAccountId = needsFallbackInventoryAccount
    ? await resolveDefaultInventoryAssetAccountId(organizationId)
    : "";

  if (fallbackInventoryAccountId) {
    comparableAccountIds.add(fallbackInventoryAccountId);
  }

  // Aggressive Consolidation Logic: 
  // We want to ensure ALL items point to the SAME primary inventory account.
  // We prioritize: 1. Account with code '1008' (Standard), 2. Fallback account, 3. First existing account.
  const allInventoryAccounts = await Account.find({
    organizationId,
    isDeleted: false,
    name: { $in: INVENTORY_ASSET_ACCOUNT_NAMES },
    isGroup: false
  }).select("_id code").lean();

  const primaryAccount = allInventoryAccounts.find(a => a.code === "1008") 
    || allInventoryAccounts.find(a => String(a._id) === fallbackInventoryAccountId)
    || allInventoryAccounts[0];

  const primaryInventoryAccountId = primaryAccount ? String(primaryAccount._id) : fallbackInventoryAccountId;

  const expectedByAccount = new Map<string, number>();
  const itemUpdates: any[] = [];

  for (const item of activeTrackedItems as any[]) {
    const targetAccountId = primaryInventoryAccountId;
    
    if (targetAccountId && toObjectIdString(item.inventoryAccountId) !== targetAccountId) {
      itemUpdates.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { inventoryAccountId: new Types.ObjectId(targetAccountId) } }
        }
      });
    }

    if (!targetAccountId) continue;

    const currentTotal = toFinite(expectedByAccount.get(targetAccountId) || 0);
    const inventoryValue = toFinite(item?.inventoryValue);
    expectedByAccount.set(targetAccountId, round2(currentTotal + inventoryValue));
    comparableAccountIds.add(targetAccountId);
  }

  // Execute item reassignments to consolidate
  if (itemUpdates.length > 0) {
    await Item.bulkWrite(itemUpdates);
  }

  let result: { touched: number; netDelta: number } = { touched: 0, netDelta: 0 };

  if (comparableAccountIds.size > 0) {
    const accountRows = await Account.find({
      _id: { $in: Array.from(comparableAccountIds).map((id) => new Types.ObjectId(id)) },
      organizationId,
      isDeleted: false,
      isGroup: false,
    }).select("openingBalance").lean();

    const openingByAccount = new Map<string, number>(
      accountRows.map((account: any) => [String(account._id), toFinite(account.openingBalance)]),
    );

    const deltas: Record<string, number> = {};
    for (const accountId of comparableAccountIds) {
      const expected = toFinite(expectedByAccount.get(accountId) || 0);
      const current = toFinite(openingByAccount.get(accountId) || 0);
      const delta = round2(expected - current);
      if (Math.abs(delta) < 0.009) continue;
      deltas[accountId] = delta;
    }

    result = await applyInventoryOpeningDeltas({ organizationId, deltas });
  }

  await rebalanceOpeningBalanceAdjustmentsAccount(organizationId);
  return result;
}
