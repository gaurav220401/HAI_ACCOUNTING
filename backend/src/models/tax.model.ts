import { Schema, model } from "mongoose";
import { ITax } from "../types";
import { auditTrailPlugin } from "../plugins";
import { softDeletePlugin } from "../plugins";

const taxComponentSchema = new Schema(
  {
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", required: true },
    rate: { type: Number, required: true },
  },
  { _id: false },
);

const taxSchema = new Schema<ITax>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    taxType: { type: String, enum: ["Tax", "TaxGroup", "CompoundTax"], default: "Tax" },
    rate: { type: Number, default: 0 },
    taxAuthority: { type: String, default: "" },
    components: { type: [taxComponentSchema], default: [] },
    isCompound: { type: Boolean, default: false },
    isSystemTax: { type: Boolean, default: false },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

taxSchema.plugin(auditTrailPlugin);
taxSchema.plugin(softDeletePlugin);
taxSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const Tax = model<ITax>("Tax", taxSchema);
export default Tax;
