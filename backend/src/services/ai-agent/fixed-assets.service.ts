import FixedAsset from "../../models/fixed-asset.model";
import FixedAssetType from "../../models/fixed-asset-type.model";
import { Types } from "mongoose";

export async function listFixedAssets(organizationId: any) {
  return FixedAsset.find({ organizationId, isDeleted: false })
    .populate("fixedAssetTypeId")
    .sort({ assetName: 1 })
    .lean();
}

export async function getFixedAssetById(organizationId: any, id: any) {
  return FixedAsset.findOne({ _id: id, organizationId, isDeleted: false })
    .populate("fixedAssetTypeId")
    .lean();
}

export async function createFixedAsset(organizationId: any, data: any) {
  return FixedAsset.create({
    organizationId,
    assetName: data.assetName,
    purchaseValue: Number(data.purchaseValue) || 0,
    purchaseQuantity: Number(data.purchaseQuantity) || 1,
    currentQuantity: Number(data.purchaseQuantity) || 1,
    currentValue: Number(data.purchaseValue) || 0,
    fixedAssetTypeId: new Types.ObjectId(data.fixedAssetTypeId),
    purchaseDate: data.purchaseDate || new Date(),
    depreciationMethod: data.depreciationMethod || "StraightLine",
    depreciationFrequency: data.depreciationFrequency || "Monthly",
    assetLifeValue: Number(data.assetLifeValue) || 60,
    assetLifeUnit: data.assetLifeUnit || "Months",
    computationType: data.computationType || "Non Pro Rata",
    depreciationStartDate: data.depreciationStartDate || new Date(),
    fixedAssetAccountId: new Types.ObjectId(data.fixedAssetAccountId),
    accumulatedDepreciationAccountId: new Types.ObjectId(data.accumulatedDepreciationAccountId),
    depreciationExpenseAccountId: new Types.ObjectId(data.depreciationExpenseAccountId),
    status: "DRAFT",
    isActive: true,
  });
}

export async function updateFixedAsset(organizationId: any, id: any, data: any) {
  const updates: any = {};
  if (data.assetName !== undefined) updates.assetName = data.assetName;
  if (data.purchaseValue !== undefined) updates.purchaseValue = Number(data.purchaseValue);
  if (data.purchaseQuantity !== undefined) {
    updates.purchaseQuantity = Number(data.purchaseQuantity);
    updates.currentQuantity = Number(data.purchaseQuantity);
  }
  if (data.purchaseDate !== undefined) updates.purchaseDate = data.purchaseDate;
  if (data.depreciationMethod !== undefined) updates.depreciationMethod = data.depreciationMethod;
  if (data.depreciationFrequency !== undefined) updates.depreciationFrequency = data.depreciationFrequency;
  if (data.assetLifeValue !== undefined) updates.assetLifeValue = Number(data.assetLifeValue);
  if (data.assetLifeUnit !== undefined) updates.assetLifeUnit = data.assetLifeUnit;
  if (data.status !== undefined) updates.status = data.status;

  return FixedAsset.findOneAndUpdate(
    { _id: id, organizationId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

export async function getDepreciationSchedule(organizationId: any, assetId: any) {
  const asset = await FixedAsset.findOne({ _id: assetId, organizationId }).lean();
  if (!asset) throw new Error("Asset not found");

  const schedule = [];
  const months = asset.assetLifeUnit === "Months" ? asset.assetLifeValue : asset.assetLifeValue * 30;
  const years = Math.max(1, Math.ceil(months / 12));
  let remainingValue = asset.purchaseValue;
  const annualRate = 1 / (years || 1);

  for (let i = 1; i <= years; i++) {
    const depreciationAmount = asset.purchaseValue * annualRate;
    remainingValue -= depreciationAmount;
    schedule.push({
      year: i,
      depreciationAmount: Math.min(depreciationAmount, remainingValue + depreciationAmount),
      accumulatedDepreciation: asset.purchaseValue - Math.max(0, remainingValue),
      bookValue: Math.max(0, remainingValue),
      status: "Projected",
    });
  }

  return schedule;
}

export async function listFixedAssetTypes(organizationId: any) {
  return FixedAssetType.find({ organizationId, isDeleted: false }).lean();
}

export async function createFixedAssetType(organizationId: any, data: any) {
  return FixedAssetType.create({
    organizationId,
    name: data.name || data.typeName,
    depreciationMethod: data.depreciationMethod || "Straight Line",
    depreciationFrequency: data.depreciationFrequency || "Monthly",
    assetLifeValue: Number(data.assetLifeValue) || 5,
    assetLifeUnit: data.assetLifeUnit || "Months",
    computationType: data.computationType || "Non Pro Rata",
    fixedAssetAccountId: new Types.ObjectId(data.fixedAssetAccountId),
    accumulatedDepreciationAccountId: new Types.ObjectId(data.accumulatedDepreciationAccountId),
    depreciationExpenseAccountId: new Types.ObjectId(data.depreciationExpenseAccountId),
    isActive: true,
  });
}
