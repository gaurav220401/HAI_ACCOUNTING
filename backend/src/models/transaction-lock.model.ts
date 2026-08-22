import { Schema, model } from "mongoose";
import { ITransactionLock, TransactionLockModule } from "../types";
import { auditTrailPlugin } from "../plugins";

/** The 4 lockable modules, in the order the Transaction Locking UI displays them. */
export const TRANSACTION_LOCK_MODULES: TransactionLockModule[] = [
  "Sales",
  "Purchases",
  "Banking",
  "Accountant",
];

const transactionLockSchema = new Schema<ITransactionLock>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    module: {
      type: String,
      enum: TRANSACTION_LOCK_MODULES,
      required: true,
    },
    isLocked: { type: Boolean, default: false },
    lockedDate: { type: Date, default: null },
  },
  { timestamps: true },
);

transactionLockSchema.plugin(auditTrailPlugin);
transactionLockSchema.index({ organizationId: 1, module: 1 }, { unique: true });

const TransactionLock = model<ITransactionLock>("TransactionLock", transactionLockSchema);
export default TransactionLock;
