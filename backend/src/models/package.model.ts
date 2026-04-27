import { Schema, model, Document } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export interface IPackageLineItem {
  itemId: Schema.Types.ObjectId;
  name?: string;
  ordered: number;
  packed: number;
  quantityToPack: number;
}

export interface IPackage extends Document {
  organizationId: Schema.Types.ObjectId;
  salesOrderId: Schema.Types.ObjectId;
  packageSlipNumber: string;
  date: Date;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit?: string;
  };
  weight?: {
    value?: number;
    unit?: string;
  };
  internalNotes?: string;
  lineItems: IPackageLineItem[];
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

const packageLineItemSchema = new Schema<IPackageLineItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    name: { type: String, default: "" },
    ordered: { type: Number, required: true, min: 0 },
    packed: { type: Number, required: true, min: 0 },
    quantityToPack: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const packageSchema = new Schema<IPackage>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    salesOrderId: {
      type: Schema.Types.ObjectId,
      ref: "SalesOrder",
      required: true,
      index: true,
    },
    packageSlipNumber: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
      unit: { type: String, default: "cm" },
    },
    weight: {
      value: { type: Number },
      unit: { type: String, default: "kg" },
    },
    internalNotes: { type: String, default: "" },
    lineItems: { type: [packageLineItemSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

packageSchema.index({ organizationId: 1, packageSlipNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

packageSchema.plugin(auditTrailPlugin);
packageSchema.plugin(softDeletePlugin);

const Package = model<IPackage>("Package", packageSchema);
export default Package;
