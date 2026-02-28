import { Schema, model } from "mongoose";
import { IPaymentMode } from "../types";

const paymentModeSchema = new Schema<IPaymentMode>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    isSystemMode: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

paymentModeSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const PaymentMode = model<IPaymentMode>("PaymentMode", paymentModeSchema);
export default PaymentMode;
