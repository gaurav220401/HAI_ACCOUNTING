import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export interface ITdsTax extends Document {
  organizationId: Types.ObjectId;
  taxName: string;
  rate: number;
  sectionCode: string;
  sectionDescription: string;
  tdsPayableAccountId: Types.ObjectId | null;
  tdsReceivableAccountId: Types.ObjectId | null;
  isHigherRate: boolean;
  applicableStartDate: Date | null;
  applicableEndDate: Date | null;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
}

const tdsTaxSchema = new Schema<ITdsTax>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    taxName: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, default: 0 },
    sectionCode: { type: String, required: true, trim: true },
    sectionDescription: { type: String, default: "" },
    tdsPayableAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    tdsReceivableAccountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    isHigherRate: { type: Boolean, default: false },
    applicableStartDate: { type: Date, default: null },
    applicableEndDate: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

tdsTaxSchema.plugin(auditTrailPlugin);
tdsTaxSchema.plugin(softDeletePlugin);
tdsTaxSchema.index({ organizationId: 1, taxName: 1 });

const TdsTax = model<ITdsTax>("TdsTax", tdsTaxSchema);
export default TdsTax;
