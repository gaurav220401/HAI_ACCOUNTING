import { Schema, model } from "mongoose";
import { IAccount, AccountRootType, AccountType } from "../types";
import { auditTrailPlugin } from "../plugins";
import { softDeletePlugin } from "../plugins";

const accountSchema = new Schema<IAccount>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    parentId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    rootType: {
      type: String,
      enum: ["Asset", "Liability", "Equity", "Income", "Expense"] as AccountRootType[],
      required: true,
    },
    accountType: {
      type: String,
      enum: [
        "Receivable", "Payable", "Bank", "Cash", "Fixed Asset",
        "Current Asset", "Current Liability", "Long Term Liability",
        "Equity", "Income", "Cost of Goods Sold", "Expense",
        "Tax", "Round Off", "Other",
      ] as AccountType[],
      required: true,
    },
    isGroup: { type: Boolean, default: false },
    currency: { type: String, default: "" },
    description: { type: String, default: "" },
    isSystemAccount: { type: Boolean, default: false },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

accountSchema.plugin(auditTrailPlugin);
accountSchema.plugin(softDeletePlugin);

// Compound index: unique name per org per parent
accountSchema.index({ organizationId: 1, name: 1, parentId: 1 }, { unique: true });
accountSchema.index({ organizationId: 1, code: 1 }, { sparse: true });

const Account = model<IAccount>("Account", accountSchema);
export default Account;
