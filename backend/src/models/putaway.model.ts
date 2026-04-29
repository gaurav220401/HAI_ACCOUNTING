import { Schema, model, Types, Document } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export interface IPutawayLineItem {
  itemId: Types.ObjectId;
  name: string;
  quantityReceived: number;
  quantityPutaway: number;
  remainingQuantity: number;
  warehouseId?: Types.ObjectId; // Destination warehouse
}

export interface IPutaway extends Document {
  organizationId: Types.ObjectId;
  putawayNumber: string;
  purchaseReceiveId: Types.ObjectId;
  purchaseReceiveNumber: string;
  date: Date;
  warehouseId: Types.ObjectId; // Default destination warehouse
  status: "Draft" | "Completed" | "Cancelled";
  lineItems: IPutawayLineItem[];
  notes: string;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IPutawayLineItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    name: { type: String, required: true },
    quantityReceived: { type: Number, required: true, default: 0 },
    quantityPutaway: { type: Number, required: true, default: 0 },
    remainingQuantity: { type: Number, required: true, default: 0 },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
  },
  { _id: true }
);

const putawaySchema = new Schema<IPutaway>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    putawayNumber: { type: String, required: true, index: true },
    purchaseReceiveId: { type: Schema.Types.ObjectId, ref: "PurchaseReceive", required: true, index: true },
    purchaseReceiveNumber: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    status: {
      type: String,
      enum: ["Draft", "Completed", "Cancelled"],
      default: "Completed",
    },
    lineItems: { type: [lineItemSchema], default: [] },
    notes: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

putawaySchema.plugin(auditTrailPlugin);
putawaySchema.plugin(softDeletePlugin);

putawaySchema.index({ organizationId: 1, putawayNumber: 1 }, { unique: true });

const Putaway = model<IPutaway>("Putaway", putawaySchema);
export default Putaway;
