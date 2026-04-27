import { Schema, model, Types, Document } from "mongoose";

export interface IMoveOrderLine {
  itemId: Types.ObjectId;
  quantity: number;
}

export interface IMoveOrder extends Document {
  organizationId: Types.ObjectId;
  orderNumber: string;
  date: Date;
  fromWarehouseId: Types.ObjectId;
  toWarehouseId: Types.ObjectId;
  status: "Draft" | "Sent" | "In Transit" | "Received" | "Cancelled";
  items: IMoveOrderLine[];
  referenceNumber?: string;
  salesOrderId?: Types.ObjectId;
  notes?: string;
  isDeleted: boolean;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MoveOrderSchema = new Schema<IMoveOrder>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    date: { type: Date, default: Date.now },
    fromWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    toWarehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    status: {
      type: String,
      enum: ["Draft", "Sent", "In Transit", "Received", "Cancelled"],
      default: "Draft",
    },
    items: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],
    referenceNumber: { type: String },
    salesOrderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", index: true },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Ensure order number is unique per organization
MoveOrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });

export default model<IMoveOrder>("MoveOrder", MoveOrderSchema);
