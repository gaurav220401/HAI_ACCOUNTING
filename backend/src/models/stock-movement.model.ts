import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

/**
 * Append-only record of every stock change.
 *
 * Never updated, never deleted — a correction is a new opposing row, exactly as
 * `GlEntry` reversals work. This is what `StockBalance` is derived from, and
 * what makes a balance explainable.
 *
 * It exists because `InventoryAdjustment` only ever covered four paths (manual
 * adjustments, move orders, putaway, shipments). Invoices and bills — the two
 * highest-volume paths — changed stock with no trace at all.
 */
export type StockMovementSource =
  | "Invoice"
  | "CreditNote"
  | "Bill"
  | "VendorCredit"
  | "PurchaseReceive"
  | "Putaway"
  | "MoveOrder"
  | "Adjustment"
  | "Shipment"
  | "Opening";

export interface IStockMovement extends Document {
  organizationId: Types.ObjectId;
  itemId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  batchId?: Types.ObjectId | null;
  /** Signed: negative issues stock, positive receives it. */
  quantityDelta: number;
  valueDelta: number;
  /** Balance after this movement — makes each row self-describing. */
  resultingQuantity: number;
  resultingValue: number;
  sourceType: StockMovementSource;
  /** "<type>:<objectId>", matching the GlEntry.voucherId convention. */
  sourceId: string;
  sourceNumber?: string;
  notes?: string;
  movedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true, index: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: "Batch", default: null },
    quantityDelta: { type: Number, required: true },
    valueDelta: { type: Number, required: true, default: 0 },
    resultingQuantity: { type: Number, required: true },
    resultingValue: { type: Number, required: true, default: 0 },
    sourceType: {
      type: String,
      required: true,
      enum: [
        "Invoice", "CreditNote", "Bill", "VendorCredit", "PurchaseReceive",
        "Putaway", "MoveOrder", "Adjustment", "Shipment", "Opening",
      ],
      index: true,
    },
    sourceId: { type: String, required: true, trim: true, index: true },
    sourceNumber: { type: String, default: "" },
    notes: { type: String, default: "" },
    movedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

stockMovementSchema.plugin(auditTrailPlugin);

// Item history, and "what moved in this period".
stockMovementSchema.index({ organizationId: 1, itemId: 1, movedAt: -1 });
stockMovementSchema.index({ organizationId: 1, movedAt: -1 });
// Drill back from a document to what it moved.
stockMovementSchema.index({ organizationId: 1, sourceType: 1, sourceId: 1 });

const StockMovement = model<IStockMovement>("StockMovement", stockMovementSchema);
export default StockMovement;
