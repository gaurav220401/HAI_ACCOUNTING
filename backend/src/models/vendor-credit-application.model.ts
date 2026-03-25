import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export interface IVendorCreditApplication extends Document {
  organizationId: Types.ObjectId;
  vendorCreditId: Types.ObjectId;
  billId: Types.ObjectId;
  amount: number;
  appliedDate: Date;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorCreditApplicationSchema = new Schema<IVendorCreditApplication>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    vendorCreditId: { type: Schema.Types.ObjectId, ref: "VendorCredit", required: true, index: true },
    billId: { type: Schema.Types.ObjectId, ref: "Bill", required: true, index: true },
    amount: { type: Number, required: true, default: 0 },
    appliedDate: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

vendorCreditApplicationSchema.plugin(auditTrailPlugin);
vendorCreditApplicationSchema.plugin(softDeletePlugin);

vendorCreditApplicationSchema.index(
  { organizationId: 1, vendorCreditId: 1, billId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export default model<IVendorCreditApplication>(
  "VendorCreditApplication",
  vendorCreditApplicationSchema,
);
