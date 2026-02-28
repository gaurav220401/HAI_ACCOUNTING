import { Schema, model } from "mongoose";
import { ISalesPerson } from "../types";
import { auditTrailPlugin } from "../plugins";

const salesPersonSchema = new Schema<ISalesPerson>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    commissionRate: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

salesPersonSchema.plugin(auditTrailPlugin);
salesPersonSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const SalesPerson = model<ISalesPerson>("SalesPerson", salesPersonSchema);
export default SalesPerson;
