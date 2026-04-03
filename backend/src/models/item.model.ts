import { Schema, model } from "mongoose";
import { IItem } from "../types";
import { auditTrailPlugin } from "../plugins";
import { softDeletePlugin } from "../plugins";

const itemSchema = new Schema<IItem>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    itemType: { type: String, enum: ["Goods", "Service"], required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, default: "" },
    unit: { type: Schema.Types.ObjectId, ref: "UnitOfMeasurement", default: null },
    itemGroupId: { type: Schema.Types.ObjectId, ref: "ItemGroup", default: null },
    description: { type: String, default: "" },
    sellingPrice: { type: Number, default: 0 },
    sellingDescription: { type: String, default: "" },
    costPrice: { type: Number, default: 0 },
    purchaseDescription: { type: String, default: "" },
    taxPreference: {
      type: String,
      enum: ["Taxable", "NonTaxable", "Exempt"],
      default: "Taxable",
    },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    hsnSacCode: { type: String, default: "" },
    salesAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    purchaseAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    inventoryTracked: { type: Boolean, default: false },
    stockOnHand: { type: Number, default: 0 },
    inventoryValue: { type: Number, default: 0 },
    averageCost: { type: Number, default: 0 },
    reorderPoint: { type: Number, default: 0 },
    preferredVendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", default: null },
    image: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

itemSchema.plugin(auditTrailPlugin);
itemSchema.plugin(softDeletePlugin);
itemSchema.index({ organizationId: 1, name: 1 });
itemSchema.index({ organizationId: 1, sku: 1 }, { sparse: true });

const Item = model<IItem>("Item", itemSchema);
export default Item;
