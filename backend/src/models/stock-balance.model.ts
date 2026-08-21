import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

/**
 * Current stock for one (item, warehouse, batch) combination.
 *
 * This is the hot-path read. It replaces `Item.stockOnHand` as the *truth* about
 * where stock is, while `Item.stockOnHand` continues to be maintained as a
 * rollup so the ~100 existing readers keep working unchanged.
 *
 * Balances are derived state: `StockMovement` is the append-only record they are
 * built from, and a reconcile job asserts the two agree. Same relationship as
 * `Account.balance` to `GlEntry` elsewhere in this codebase.
 */
export interface IStockBalance extends Document {
  organizationId: Types.ObjectId;
  itemId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  /** null for items that are not batch-tracked. */
  batchId?: Types.ObjectId | null;
  quantity: number;
  committedQuantity: number;
  /** Per-unit cost for this row — a batch is its own cost layer. */
  averageCost: number;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const stockBalanceSchema = new Schema<IStockBalance>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null },
    quantity: { type: Number, required: true, default: 0 },
    committedQuantity: { type: Number, required: true, default: 0 },
    averageCost: { type: Number, required: true, default: 0 },
    value: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

stockBalanceSchema.plugin(auditTrailPlugin);

/**
 * The concurrency guard. Upserts key on this, so two simultaneous movements
 * against the same location cannot create duplicate rows.
 *
 * batchId participates as null for non-batch items, which MongoDB indexes as a
 * distinct value — exactly the behaviour wanted here.
 */
stockBalanceSchema.index(
  { organizationId: 1, itemId: 1, warehouseId: 1, batchId: 1 },
  { unique: true },
);
// "What is in this warehouse" and "where is this item".
stockBalanceSchema.index({ organizationId: 1, warehouseId: 1, quantity: 1 });

const StockBalance = model<IStockBalance>("StockBalance", stockBalanceSchema);
export default StockBalance;
