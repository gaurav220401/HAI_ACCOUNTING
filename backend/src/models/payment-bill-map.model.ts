import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export interface IPaymentBillMap extends Document {
  organization_id: Types.ObjectId;
  payment_id: Types.ObjectId;
  bill_id: Types.ObjectId;
  applied_amount: number;
  applied_date: Date;
  is_deleted: boolean;
  deleted_at?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentBillMapSchema = new Schema<IPaymentBillMap>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    payment_id: { type: Schema.Types.ObjectId, ref: "PaymentMade", required: true, index: true },
    bill_id: { type: Schema.Types.ObjectId, ref: "Bill", required: true, index: true },
    applied_amount: { type: Number, required: true, default: 0 },
    applied_date: { type: Date, default: Date.now },
    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

paymentBillMapSchema.plugin(auditTrailPlugin);

paymentBillMapSchema.index(
  { organization_id: 1, payment_id: 1, bill_id: 1, is_deleted: 1 },
  { unique: true, partialFilterExpression: { is_deleted: false } },
);

const PaymentBillMap = model<IPaymentBillMap>("PaymentBillMap", paymentBillMapSchema);
export default PaymentBillMap;
