import { Schema, model, Model } from "mongoose";
import { ICompany } from "../types";
import { auditTrailPlugin } from "../plugins/auditTrail.plugin";
import { softDeletePlugin } from "../plugins/softDelete.plugin";

const companySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    abbr: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 10,
    },
    defaultCurrency: {
      type: String,
      required: true,
      default: "INR",
    },
    country: {
      type: String,
      required: true,
      default: "India",
    },
    chartOfAccounts: {
      type: String,
      default: "Standard",
    },
    domain: {
      type: String,
      enum: ["Distribution", "Manufacturing", "Retail", "Services", ""],
      default: "",
    },
    fiscalYearStart: {
      type: Date,
      required: true,
    },
    fiscalYearEnd: {
      type: Date,
      required: true,
    },
    defaultAccounts: {
      defaultBankAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      defaultCashAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      defaultReceivableAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      defaultPayableAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      defaultIncomeAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      defaultExpenseAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      roundOffAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      writeOffAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      exchangeGainLossAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      costOfGoodsSoldAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      stockReceivedNotBilledAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      stockInHandAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      retainedEarningsAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      depreciationExpenseAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
      accumulatedDepreciationAccount: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        default: null,
      },
    },
  },
  { timestamps: true },
);

companySchema.plugin(auditTrailPlugin);
companySchema.plugin(softDeletePlugin);

const Company: Model<ICompany> = model<ICompany>("Company", companySchema);
export default Company;
