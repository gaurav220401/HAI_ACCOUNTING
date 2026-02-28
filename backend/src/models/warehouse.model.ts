import { Schema, model } from "mongoose";
import { IWarehouse } from "../types";
import { auditTrailPlugin } from "../plugins";

const warehouseSchema = new Schema<IWarehouse>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
      country: { type: String, default: "" },
    },
    isPrimary: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

warehouseSchema.plugin(auditTrailPlugin);
warehouseSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const Warehouse = model<IWarehouse>("Warehouse", warehouseSchema);
export default Warehouse;
