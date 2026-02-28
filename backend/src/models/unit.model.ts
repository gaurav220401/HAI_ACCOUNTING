import { Schema, model } from "mongoose";
import { IUnitOfMeasurement } from "../types";

const unitSchema = new Schema<IUnitOfMeasurement>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    abbreviation: { type: String, required: true, trim: true },
    isSystemUnit: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

unitSchema.index({ organizationId: 1, abbreviation: 1 }, { unique: true });

const UnitOfMeasurement = model<IUnitOfMeasurement>("UnitOfMeasurement", unitSchema);
export default UnitOfMeasurement;
