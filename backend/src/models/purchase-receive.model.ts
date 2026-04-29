import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type PurchaseReceiveStatus = "Draft" | "Received";

export interface IPurchaseReceiveLineItem {
  _id?: Types.ObjectId;
  purchaseOrderLineItemId?: Types.ObjectId | null;
  itemId?: Types.ObjectId | null;
  name: string;
  description?: string;
  quantityToReceive: number;
  quantityReceived: number;
  rate: number;
  unit?: string;
}

export interface IPurchaseReceive extends Document {
  organizationId: Types.ObjectId;
  vendorId: Types.ObjectId | null;
  purchaseOrderId: Types.ObjectId;
  purchaseOrderNumber: string;
  purchaseReceiveNumber: string;
  receivedDate: Date;
  notes: string;
  lineItems: IPurchaseReceiveLineItem[];
  totalQuantityReceived: number;
  status: PurchaseReceiveStatus;
  putawayStatus: "Pending" | "Partially Putaway" | "Completed";
  linkedBillIds: Types.ObjectId[];
  isDeleted: boolean;
  deletedAt: Date | null;
}

const lineItemSchema = new Schema<IPurchaseReceiveLineItem>(
  {
    purchaseOrderLineItemId: { type: Schema.Types.ObjectId, default: null },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    quantityToReceive: { type: Number, default: 0 },
    quantityReceived: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    unit: { type: String, default: "" },
  },
  { _id: true },
);

const purchaseReceiveSchema = new Schema<IPurchaseReceive>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    purchaseOrderNumber: { type: String, required: true, trim: true },
    purchaseReceiveNumber: { type: String, required: true, trim: true },
    receivedDate: { type: Date, required: true },
    notes: { type: String, default: "" },
    lineItems: { type: [lineItemSchema], default: [] },
    totalQuantityReceived: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Draft", "Received"],
      default: "Received",
    },
    putawayStatus: {
      type: String,
      enum: ["Pending", "Partially Putaway", "Completed"],
      default: "Pending",
    },
    linkedBillIds: [{ type: Schema.Types.ObjectId, ref: "Bill" }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

purchaseReceiveSchema.plugin(auditTrailPlugin);
purchaseReceiveSchema.plugin(softDeletePlugin);

purchaseReceiveSchema.index(
  { organizationId: 1, purchaseReceiveNumber: 1 },
  { unique: true },
);
purchaseReceiveSchema.index({ organizationId: 1, purchaseOrderId: 1, status: 1 });

const PurchaseReceive = model<IPurchaseReceive>("PurchaseReceive", purchaseReceiveSchema);
export default PurchaseReceive;
