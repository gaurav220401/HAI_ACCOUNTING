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
    accountNumber: { type: String, trim: true, default: "" },
    ifsc: { type: String, trim: true, default: "" },
    parentId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    rootType: {
      type: String,
      enum: ["Asset", "Liability", "Equity", "Income", "Expense"] as AccountRootType[],
      required: true,
    },
    accountType: {
      type: String,
      enum: [
        // Asset
        "Other Asset", "Other Current Asset", "Cash", "Bank",
        "Fixed Asset", "Accounts Receivable", "Stock",
        "Payment Clearing Account", "Intangible Asset",
        "Non Current Asset", "Deferred Tax Asset",
        // Liability
        "Other Current Liability", "Credit Card", "Non Current Liability",
        "Other Liability", "Accounts Payable", "Overseas Tax Payable",
        "Deferred Tax Liability",
        // Equity
        "Equity",
        // Income
        "Income", "Other Income",
        // Expense
        "Expense", "Cost Of Goods Sold", "Other Expense",
      ] as AccountType[],
      required: true,
    },
    isGroup: { type: Boolean, default: false },
    currency: { type: String, default: "" },
    description: { type: String, default: "" },
    createItemAsFixedAsset: { type: Boolean, default: false },
    fixedAssetTypeId: {
      type: Schema.Types.ObjectId,
      ref: "FixedAssetType",
      default: null,
    },
    isSystemAccount: { type: Boolean, default: false },
    openingBalance: { type: Number, default: 0 },
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
