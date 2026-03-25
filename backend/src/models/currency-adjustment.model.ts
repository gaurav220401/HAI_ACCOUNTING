import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin } from "../plugins";
import { Counter } from "./counter.model";

export interface ICurrencyAdjustmentLine {
  account: string;          // account name / id reference (string label for now)
  accountId?: Types.ObjectId | null;
  balanceForeign: number;   // Balance in foreign currency
  balanceBase: number;      // Balance in base currency (INR)
  revaluedBalance: number;  // Balance × new exchange rate
  gainOrLoss: number;       // revaluedBalance − balanceBase
}

export interface ICurrencyAdjustment extends Document {
  organizationId: Types.ObjectId;
  adjustmentNumber: string;
  date: Date;
  currency: string;           // Foreign currency code, e.g. "JPY"
  exchangeRate: number;       // How many base-currency units per 1 foreign unit
  notes: string;
  status: "Open" | "Reconciled";
  lines: ICurrencyAdjustmentLine[];
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lineSchema = new Schema<ICurrencyAdjustmentLine>(
  {
    account:         { type: String, default: "" },
    accountId:       { type: Schema.Types.ObjectId, ref: "Account", default: null },
    balanceForeign:  { type: Number, default: 0 },
    balanceBase:     { type: Number, default: 0 },
    revaluedBalance: { type: Number, default: 0 },
    gainOrLoss:      { type: Number, default: 0 },
  },
  { _id: false }
);

const currencyAdjustmentSchema = new Schema<ICurrencyAdjustment>(
  {
    organizationId:   { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    adjustmentNumber: { type: String, unique: true, sparse: true },
    date:             { type: Date, required: true },
    currency:         { type: String, required: true },
    exchangeRate:     { type: Number, required: true },
    notes:            { type: String, default: "" },
    status:           { type: String, enum: ["Open", "Reconciled"], default: "Open" },
    lines:            { type: [lineSchema], default: [] },
    isDeleted:        { type: Boolean, default: false },
    deletedAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

currencyAdjustmentSchema.plugin(auditTrailPlugin);
currencyAdjustmentSchema.index({ organizationId: 1, date: -1 });

// Auto-generate adjustmentNumber
currencyAdjustmentSchema.pre("save", async function () {
  if (this.isNew && !this.adjustmentNumber) {
    const counter = await Counter.findByIdAndUpdate(
      `currency-adj-${this.organizationId}`,
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true }
    );
    this.adjustmentNumber = `CA-${String(counter!.seq).padStart(4, "0")}`;
  }
});

const CurrencyAdjustment = model<ICurrencyAdjustment>(
  "CurrencyAdjustment",
  currencyAdjustmentSchema
);
export default CurrencyAdjustment;
