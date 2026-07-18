/**
 * fixed-asset-type.service.ts
 *
 * Auto-seeds standard Fixed Asset Types for an organization, matching the default
 * Chart of Accounts template (chart-of-accounts.service.ts). Each type maps:
 *   - fixedAssetAccountId           → the Fixed Asset account
 *   - accumulatedDepreciationAccountId → its Contra Asset accumulation account
 *   - depreciationExpenseAccountId  → the shared Depreciation Expense account
 *
 * Called on Fixed Asset list / type-list requests so existing orgs get the
 * default types without a manual migration step.
 */

import { Types } from "mongoose";
import Account from "../models/account.model";
import FixedAssetType from "../models/fixed-asset-type.model";

interface DefaultTypeTemplate {
  name: string;
  assetAccountName: string;
  accumDepAccountName: string;
  expenseAccountName: string;
  /** Straight Line, 60 months (5 years) by default; override per type */
  assetLifeValue?: number;
}

const DEFAULT_TYPE_TEMPLATES: DefaultTypeTemplate[] = [
  {
    name: "Computer Equipment",
    assetAccountName: "Computer Equipment",
    accumDepAccountName: "Accumulated Depreciation - Computer Equipment",
    expenseAccountName: "Depreciation And Amortisation",
    assetLifeValue: 36, // 3 years (IT assets)
  },
  {
    name: "Furniture and Equipment",
    assetAccountName: "Furniture and Equipment",
    accumDepAccountName: "Accumulated Depreciation - Furniture and Equipment",
    expenseAccountName: "Depreciation And Amortisation",
    assetLifeValue: 60, // 5 years
  },
  {
    name: "Vehicles",
    assetAccountName: "Vehicles",
    accumDepAccountName: "Accumulated Depreciation - Vehicles",
    expenseAccountName: "Depreciation And Amortisation",
    assetLifeValue: 60, // 5 years
  },
  {
    name: "Machinery and Equipment",
    assetAccountName: "Machinery and Equipment",
    accumDepAccountName: "Accumulated Depreciation - Machinery",
    expenseAccountName: "Depreciation And Amortisation",
    assetLifeValue: 120, // 10 years
  },
];

/**
 * Finds an account by name for the given org, returning null if not found.
 */
async function findAccount(
  organizationId: Types.ObjectId,
  name: string,
): Promise<{ _id: Types.ObjectId } | null> {
  return Account.findOne({
    organizationId,
    isDeleted: false,
    isGroup: false,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  })
    .select("_id")
    .lean() as Promise<{ _id: Types.ObjectId } | null>;
}

/**
 * Ensures all standard Fixed Asset Types exist for the organization.
 * Safe to call on every request — idempotent, skips existing types.
 */
export async function ensureDefaultFixedAssetTypes(
  organizationId: Types.ObjectId,
): Promise<void> {
  // Load existing type names for this org (to skip re-seeding)
  const existingTypes = await FixedAssetType.find({
    organizationId,
    isDeleted: false,
  })
    .select("name")
    .lean();

  const existingNames = new Set(
    existingTypes.map((t) => String(t.name || "").toLowerCase().trim()),
  );

  for (const template of DEFAULT_TYPE_TEMPLATES) {
    const normalizedName = template.name.toLowerCase().trim();
    if (existingNames.has(normalizedName)) continue; // already exists

    // Resolve account IDs — skip if any required account doesn't exist yet
    const [assetAccount, accumDepAccount, expenseAccount] = await Promise.all([
      findAccount(organizationId, template.assetAccountName),
      findAccount(organizationId, template.accumDepAccountName),
      findAccount(organizationId, template.expenseAccountName),
    ]);

    if (!assetAccount || !accumDepAccount || !expenseAccount) continue; // CoA not seeded yet

    try {
      await FixedAssetType.create({
        organizationId,
        name: template.name,
        depreciationMethod: "Straight Line",
        depreciationFrequency: "Monthly",
        assetLifeValue: template.assetLifeValue ?? 60,
        assetLifeUnit: "Months",
        computationType: "Non Pro Rata",
        fixedAssetAccountId: assetAccount._id,
        accumulatedDepreciationAccountId: accumDepAccount._id,
        depreciationExpenseAccountId: expenseAccount._id,
        isActive: true,
        isDeleted: false,
      });
    } catch (err: any) {
      // Race condition or duplicate key — another request seeded it first, ignore
      if (err?.code !== 11000) throw err;
    }
  }
}

/**
 * Given a Fixed Asset Account ID, returns the matching FixedAssetType (if any).
 * Used when creating draft assets from bills to auto-link the type.
 */
export async function findTypeByAssetAccount(
  organizationId: Types.ObjectId,
  fixedAssetAccountId: Types.ObjectId | string,
): Promise<(typeof FixedAssetType extends { prototype: infer P } ? P : never) | null> {
  return FixedAssetType.findOne({
    organizationId,
    fixedAssetAccountId,
    isDeleted: false,
    isActive: true,
  }).lean() as any;
}
