import { Schema, model } from "mongoose";
import { IPriceList } from "../types";
import { auditTrailPlugin } from "../plugins";

const priceListItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    customPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
  },
  { _id: false },
);

const priceListSchema = new Schema<IPriceList>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    priceListType: { type: String, enum: ["Sales", "Purchase", "Both"], default: "Sales" },
    currency: { type: String, required: true, default: "INR" },
    items: { type: [priceListItemSchema], default: [] },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

priceListSchema.plugin(auditTrailPlugin);
priceListSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const PriceList = model<IPriceList>("PriceList", priceListSchema);
export default PriceList;
