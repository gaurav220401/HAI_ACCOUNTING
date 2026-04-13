import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export type GlVoucherType =
  | "Invoice"
  | "CreditNote"
  | "Bill"
  | "Expense"
  | "VendorCredit"
  | "PaymentMade"
  | "PaymentReceived"
  | "Journal"
  | "System";

export interface IGlEntry extends Document {
  organizationId: Types.ObjectId;
  voucherType: GlVoucherType;
  voucherId: string;
  voucherNo: string;
  postingDate: Date;
  accountId: Types.ObjectId;
  debit: number;
  credit: number;
  contactType?: "Customer" | "Vendor" | "None";
  contactId?: Types.ObjectId | null;
  currency: string;
  exchangeRate: number;
  description?: string;
  isReversal: boolean;
  reversalOf?: Types.ObjectId | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const glEntrySchema = new Schema<IGlEntry>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    voucherType: {
      type: String,
      enum: ["Invoice", "CreditNote", "Bill", "Expense", "VendorCredit", "PaymentMade", "PaymentReceived", "Journal", "System"],
      required: true,
      index: true,
    },
    voucherId: { type: String, required: true, trim: true, index: true },
    voucherNo: { type: String, required: true, trim: true },
    postingDate: { type: Date, required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    contactType: { type: String, enum: ["Customer", "Vendor", "None"], default: "None" },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    currency: { type: String, required: true, default: "INR" },
    exchangeRate: { type: Number, required: true, default: 1 },
    description: { type: String, default: "" },
    isReversal: { type: Boolean, default: false, index: true },
    reversalOf: { type: Schema.Types.ObjectId, ref: "GlEntry", default: null },
  },
  { timestamps: true },
);

glEntrySchema.plugin(auditTrailPlugin);

glEntrySchema.index({ organizationId: 1, voucherType: 1, voucherId: 1, isReversal: 1 });
glEntrySchema.index({ organizationId: 1, accountId: 1, postingDate: 1 });

const GlEntry = model<IGlEntry>("GlEntry", glEntrySchema);
export default GlEntry;
