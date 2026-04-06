import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export type InventoryAdjustmentReason =
  | "Stock Count"
  | "Damage"
  | "Loss"
  | "Found"
  | "Return"
  | "Manual"
  | "Other";

export interface IInventoryAdjustment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  itemId: Types.ObjectId;
  warehouseId?: Types.ObjectId | null;
  direction: "Increase" | "Decrease";
  quantityDelta: number;
  valueDelta: number;
  reason: InventoryAdjustmentReason;
  referenceNumber?: string;
  notes?: string;
  adjustedAt: Date;
  resultingStockOnHand: number;
  resultingInventoryValue: number;
  createdAt: Date;
  updatedAt: Date;
}

const inventoryAdjustmentSchema = new Schema<IInventoryAdjustment>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "Item",
      required: true,
      index: true,
    },
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      default: null,
    },
    direction: {
      type: String,
      enum: ["Increase", "Decrease"],
      required: true,
    },
    quantityDelta: { type: Number, required: true },
    valueDelta: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ["Stock Count", "Damage", "Loss", "Found", "Return", "Manual", "Other"],
      default: "Manual",
    },
    referenceNumber: { type: String, default: "" },
    notes: { type: String, default: "" },
    adjustedAt: { type: Date, default: Date.now },
    resultingStockOnHand: { type: Number, required: true },
    resultingInventoryValue: { type: Number, required: true },
  },
  { timestamps: true },
);

inventoryAdjustmentSchema.plugin(auditTrailPlugin);
inventoryAdjustmentSchema.index({ organizationId: 1, adjustedAt: -1 });
inventoryAdjustmentSchema.index({ organizationId: 1, itemId: 1, adjustedAt: -1 });

const InventoryAdjustment = model<IInventoryAdjustment>(
  "InventoryAdjustment",
  inventoryAdjustmentSchema,
);

export default InventoryAdjustment;
