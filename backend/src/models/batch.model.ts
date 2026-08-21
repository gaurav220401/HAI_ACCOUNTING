import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

/**
 * A batch (lot) of a stocked item.
 *
 * Optional dimension on the stock key: an item with `batchTracked: false` never
 * gets one, and its balances carry `batchId: null`. Introduced alongside
 * per-warehouse stock so the balance key gains both dimensions in a single
 * migration rather than two passes over the same rows.
 *
 * A batch is also a cost layer, which is what makes FIFO implementable later.
 */
export interface IBatch extends Document {
  organizationId: Types.ObjectId;
  itemId: Types.ObjectId;
  batchNumber: string;
  expiryDate?: Date | null;
  manufactureDate?: Date | null;
  /** Drives FIFO ordering when no expiry is present. */
  receivedAt: Date;
  initialQuantity: number;
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<IBatch>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    batchNumber: { type: String, required: true, trim: true },
    expiryDate: { type: Date, default: null },
    manufactureDate: { type: Date, default: null },
    receivedAt: { type: Date, default: () => new Date() },
    initialQuantity: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

batchSchema.plugin(auditTrailPlugin);
batchSchema.plugin(softDeletePlugin);

// One batch number per item per org.
batchSchema.index(
  { organizationId: 1, itemId: 1, batchNumber: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
// Expiry reporting and FEFO issue selection.
batchSchema.index({ organizationId: 1, expiryDate: 1 });

const Batch = model<IBatch>("Batch", batchSchema);
export default Batch;
