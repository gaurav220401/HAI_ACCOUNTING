import { Schema, model } from "mongoose";
import { IPaymentTerms } from "../types";

const paymentTermsSchema = new Schema<IPaymentTerms>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    netDays: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    discountDays: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    isSystemTerm: { type: Boolean, default: false },
  },
  { timestamps: true },
);

paymentTermsSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const PaymentTerms = model<IPaymentTerms>("PaymentTerms", paymentTermsSchema);
export default PaymentTerms;
