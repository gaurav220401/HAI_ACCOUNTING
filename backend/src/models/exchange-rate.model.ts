import { Schema, model } from "mongoose";
import { IExchangeRate } from "../types";

const exchangeRateSchema = new Schema<IExchangeRate>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    fromCurrency: { type: String, required: true, uppercase: true },
    toCurrency: { type: String, required: true, uppercase: true },
    date: { type: Date, required: true },
    rate: { type: Number, required: true },
    source: { type: String, enum: ["Manual", "Auto"], default: "Manual" },
  },
  { timestamps: true },
);

exchangeRateSchema.index({ organizationId: 1, fromCurrency: 1, toCurrency: 1, date: -1 });

const ExchangeRate = model<IExchangeRate>("ExchangeRate", exchangeRateSchema);
export default ExchangeRate;
