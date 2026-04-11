import { Schema, model, Document, Types } from "mongoose";
import {
  activityLogPlugin,
  auditTrailPlugin,
  softDeletePlugin,
} from "../plugins";
import { Counter } from "./counter.model";
import {
  AssetLifeUnit,
  ComputationType,
  DepreciationFrequency,
  DepreciationMethod,
} from "./fixed-asset-type.model";

export type FixedAssetStatus = "DRAFT" | "ACTIVE" | "DISPOSED";

export interface IFixedAssetComment {
  author: string;
  text: string;
  time: Date;
  isSystem: boolean;
}

export interface IFixedAsset extends Document {
  organizationId: Types.ObjectId;
  assetName: string;
  assetNumber: string;
  sourceBillId?: Types.ObjectId | null;
  sourceBillNumber?: string;
  purchaseValue: number;
  purchaseQuantity: number;
  currentQuantity: number;
  serialNumber?: string;
  currentValue: number;
  disposalValue: number;
  fixedAssetTypeId: Types.ObjectId;
  purchaseDate: Date;
  warrantyExpirationDate?: Date | null;
  description?: string;
  depreciationMethod: DepreciationMethod;
  depreciationPercentage?: number | null;
  depreciationFrequency: DepreciationFrequency;
  assetLifeValue: number;
  assetLifeUnit: AssetLifeUnit;
  computationType: ComputationType;
  depreciationStartDate: Date;
  fixedAssetAccountId: Types.ObjectId;
  accumulatedDepreciationAccountId: Types.ObjectId;
  depreciationExpenseAccountId: Types.ObjectId;
  status: FixedAssetStatus;
  comments: IFixedAssetComment[];
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fixedAssetSchema = new Schema<IFixedAsset>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    assetName: { type: String, required: true, trim: true },
    assetNumber: { type: String, sparse: true },
    sourceBillId: { type: Schema.Types.ObjectId, ref: "Bill", default: null },
    sourceBillNumber: { type: String, default: "" },
    purchaseValue: { type: Number, required: true, min: 0, default: 0 },
    purchaseQuantity: { type: Number, min: 0, default: 1 },
    currentQuantity: { type: Number, min: 0, default: 1 },
    serialNumber: { type: String, default: "" },
    currentValue: { type: Number, min: 0, default: 0 },
    disposalValue: { type: Number, min: 0, default: 0 },
    fixedAssetTypeId: {
      type: Schema.Types.ObjectId,
      ref: "FixedAssetType",
      required: true,
    },
    purchaseDate: { type: Date, required: true },
    warrantyExpirationDate: { type: Date, default: null },
    description: { type: String, default: "" },
    depreciationMethod: {
      type: String,
      enum: ["Straight Line", "Declining Balance"],
      required: true,
    },
    depreciationPercentage: { type: Number, default: null, min: 0, max: 100 },
    depreciationFrequency: {
      type: String,
      enum: ["Monthly", "Yearly"],
      required: true,
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
    },
    depreciationStartDate: { type: Date, required: true },
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
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "DISPOSED"],
      default: "DRAFT",
      index: true,
    },
    comments: {
      type: [
        {
          author: { type: String, required: true },
          text: { type: String, required: true },
          time: { type: Date, default: Date.now },
          isSystem: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

fixedAssetSchema.plugin(auditTrailPlugin);
fixedAssetSchema.plugin(activityLogPlugin);
fixedAssetSchema.plugin(softDeletePlugin);

fixedAssetSchema.index({ organizationId: 1, purchaseDate: -1 });
fixedAssetSchema.index({ organizationId: 1, sourceBillId: 1 });
fixedAssetSchema.index(
  { organizationId: 1, assetNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      assetNumber: { $type: "string" },
    },
  },
);

fixedAssetSchema.pre("save", async function () {
  if (this.isNew && !this.assetNumber) {
    const counter = await Counter.findByIdAndUpdate(
      `fixed-asset-${this.organizationId}`,
      { $inc: { seq: 1 } },
      { returnDocument: "after", upsert: true },
    );
    this.assetNumber = `FA-${String(counter!.seq).padStart(4, "0")}`;
  }
});

const FixedAsset = model<IFixedAsset>("FixedAsset", fixedAssetSchema);
export default FixedAsset;
