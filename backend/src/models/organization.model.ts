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

const reminderSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    sendInvoiceDueReminder: { type: Boolean, default: true },
    invoiceDueDaysBefore: { type: Number, default: 3, min: 0, max: 365 },
    sendPaymentDueReminder: { type: Boolean, default: true },
    paymentDueFrequencyDays: { type: Number, default: 7, min: 1, max: 365 },
  },
  { _id: false },
);

const openingBalanceSettingsSchema = new Schema(
  {
    migrationDate: { type: Date, default: null },
    isConfigured: { type: Boolean, default: false },
    lastUpdatedAt: { type: Date, default: null },
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

const smtpSettingsSchema = new Schema(
  {
    host: { type: String, default: "" },
    port: { type: Number, default: 587 },
    secure: { type: Boolean, default: false },
    user: { type: String, default: "" },
    pass: { type: String, default: "" },
    fromName: { type: String, default: "" },
    fromEmail: { type: String, default: "" },
  },
  { _id: false },
);

const organizationSchema = new Schema<IOrganization>(
  {
    // ── Ownership / Membership ─────────────────────────────────────────
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    members: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
      index: true,
    },

    // ── Core ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: true,
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

    reminderSettings: {
      type: reminderSettingsSchema,
      default: () => ({
        enabled: false,
        sendInvoiceDueReminder: true,
        invoiceDueDaysBefore: 3,
        sendPaymentDueReminder: true,
        paymentDueFrequencyDays: 7,
      }),
    },

    openingBalanceSettings: {
      type: openingBalanceSettingsSchema,
      default: () => ({
        migrationDate: null,
        isConfigured: false,
        lastUpdatedAt: null,
      }),
    },

    // ── Chart of Accounts (populated by Phase 2) ───────────────────────
    defaultAccounts: {
      type: defaultAccountsSchema,
      default: () => ({}),
    },

    // ── Invoice Template ───────────────────────────────────────────────
    templateConfig: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },

    // ── SMTP Settings ─────────────────────────────────────────────────
    smtpSettings: {
      type: smtpSettingsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

// ─── Plugins ─────────────────────────────────────────────────────────────
organizationSchema.plugin(auditTrailPlugin);
organizationSchema.plugin(softDeletePlugin);

// Organization names must be unique per owner (case-insensitive), not globally.
organizationSchema.index(
  { owner: 1, name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
    partialFilterExpression: { owner: { $type: "objectId" }, isDeleted: false },
  },
);

const Organization: Model<IOrganization> = model<IOrganization>(
  "Organization",
  organizationSchema,
);

export default Organization;
