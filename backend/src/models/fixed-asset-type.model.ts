import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type DepreciationMethod = "Straight Line" | "Declining Balance";
export type DepreciationFrequency = "Monthly" | "Yearly";
export type AssetLifeUnit = "Months" | "Days";
export type ComputationType = "Non Pro Rata" | "Pro Rata";

export interface IFixedAssetType extends Document {
  organizationId: Types.ObjectId;
  name: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number | null;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  fixedAssetAccountId: Types.ObjectId;
  accumulatedDepreciationAccountId: Types.ObjectId;
  depreciationExpenseAccountId: Types.ObjectId;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fixedAssetTypeSchema = new Schema<IFixedAssetType>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    depreciationMethod: {
      type: String,
      enum: ["Straight Line", "Declining Balance"],
      required: true,
      default: "Straight Line",
    },
    depreciationPercentage: { type: Number, default: null, min: 0, max: 100 },
    depreciationFrequency: {
      type: String,
      enum: ["Monthly", "Yearly"],
      required: true,
      default: "Monthly",
    },
    assetLifeValue: { type: Number, required: true, min: 1 },
    assetLifeUnit: {
      type: String,
      enum: ["Months", "Days"],
      required: true,
      default: "Months",
    },
    computationType: {
      type: String,
      enum: ["Non Pro Rata", "Pro Rata"],
      required: true,
      default: "Non Pro Rata",
    },
    fixedAssetAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    accumulatedDepreciationAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    depreciationExpenseAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

fixedAssetTypeSchema.plugin(auditTrailPlugin);
fixedAssetTypeSchema.plugin(softDeletePlugin);

fixedAssetTypeSchema.index(
  { organizationId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

const FixedAssetType = model<IFixedAssetType>(
  "FixedAssetType",
  fixedAssetTypeSchema,
);
export default FixedAssetType;
