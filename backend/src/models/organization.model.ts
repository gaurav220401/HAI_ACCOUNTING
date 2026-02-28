import { Schema, model, Model } from "mongoose";
import { IOrganization } from "../types";
import { auditTrailPlugin } from "../plugins";
import { softDeletePlugin } from "../plugins";

const addressSchema = new Schema(
  {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    country: { type: String, default: "" },
  },
  { _id: false },
);

const portalSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    subdomain: { type: String, default: "" },
  },
  { _id: false },
);

const defaultAccountsSchema = new Schema(
  {
    bankAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    cashAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    receivableAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    payableAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    incomeAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    expenseAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    roundOffAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    exchangeGainLossAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    retainedEarningsAccount: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
  },
  { _id: false },
);

const organizationSchema = new Schema<IOrganization>(
  {
    // ── Core ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    industry: {
      type: String,
      default: "General",
      trim: true,
    },

    // ── Financial Settings ─────────────────────────────────────────────
    baseCurrency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    fiscalYearStart: {
      type: Number,
      required: true,
      default: 4, // April (common for India / Zoho Books default)
      min: 1,
      max: 12,
    },

    // ── Locale ─────────────────────────────────────────────────────────
    country: {
      type: String,
      required: true,
      default: "India",
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      default: "Asia/Kolkata",
      trim: true,
    },
    dateFormat: {
      type: String,
      default: "DD/MM/YYYY",
      trim: true,
    },
    numberFormat: {
      type: String,
      default: "1,234,567.89",
      trim: true,
    },
    language: {
      type: String,
      default: "en",
      lowercase: true,
      trim: true,
    },

    // ── Identity ───────────────────────────────────────────────────────
    taxId: {
      type: String,
      default: "",
      trim: true,
    },
    logo: {
      type: String,
      default: "",
    },
    address: {
      type: addressSchema,
      default: () => ({}),
    },

    // ── Portal ─────────────────────────────────────────────────────────
    portalSettings: {
      type: portalSettingsSchema,
      default: () => ({ enabled: false }),
    },

    // ── Chart of Accounts (populated by Phase 2) ───────────────────────
    defaultAccounts: {
      type: defaultAccountsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

// ─── Plugins ─────────────────────────────────────────────────────────────
organizationSchema.plugin(auditTrailPlugin);
organizationSchema.plugin(softDeletePlugin);

const Organization: Model<IOrganization> = model<IOrganization>(
  "Organization",
  organizationSchema,
);

export default Organization;
