import { Schema, model } from "mongoose";
import { ICurrency } from "../types";

const currencySchema = new Schema<ICurrency>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, default: "" },
    decimalPlaces: { type: Number, default: 2 },
    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: false },
);

const Currency = model<ICurrency>("Currency", currencySchema);
export default Currency;
