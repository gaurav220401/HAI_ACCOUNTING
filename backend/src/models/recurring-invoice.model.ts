import { Schema, model } from "mongoose";
import { IRecurringInvoice } from "../types";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

const recurringInvoiceItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    hsnSacCode: { type: String, default: "" },
    quantity: { type: Number, required: true, default: 1 },
    rate: { type: Number, required: true, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
  },
  { _id: true },
);

const recurringActivitySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "created",
        "updated",
        "paused",
        "resumed",
        "stopped",
        "completed",
        "invoice_generated",
        "auto_send_failed",
      ],
      required: true,
    },
    message: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const recurringInvoiceSchema = new Schema<IRecurringInvoice>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    profileName: { type: String, required: true, trim: true },
    referenceNumber: { type: String, default: "" },
    orderNumber: { type: String, default: "" },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    neverExpires: { type: Boolean, default: true },
    frequency: {
      type: String,
      enum: ["weekly", "every_10_days", "every_15_days", "monthly"],
      required: true,
    },
    nextRunDate: { type: Date, required: true, index: true },
    lastRunDate: { type: Date, default: null },
    paymentTermsId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTerms",
      default: null,
    },
    salesPersonId: {
      type: Schema.Types.ObjectId,
      ref: "SalesPerson",
      default: null,
    },
    subject: { type: String, default: "" },
    items: { type: [recurringInvoiceItemSchema], required: true, default: [] },
    subTotal: { type: Number, default: 0 },
    discountType: {
      type: String,
      enum: ["percent", "amount"],
      default: "percent",
    },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxType: {
      type: String,
      enum: ["TDS", "TCS", "none"],
      default: "none",
    },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    taxAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    customerNotes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    emailContacts: [{ type: String }],
    deliveryMode: {
      type: String,
      enum: ["draft", "send"],
      default: "draft",
    },
    status: {
      type: String,
      enum: ["active", "paused", "stopped", "completed"],
      default: "active",
      index: true,
    },
    generatedInvoiceCount: { type: Number, default: 0 },
    lastGeneratedInvoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    recentActivities: { type: [recurringActivitySchema], default: [] },
  },
  { timestamps: true },
);

recurringInvoiceSchema.plugin(auditTrailPlugin);
recurringInvoiceSchema.plugin(softDeletePlugin);

recurringInvoiceSchema.index({ organizationId: 1, profileName: 1 });
recurringInvoiceSchema.index({ organizationId: 1, customerId: 1, status: 1 });
recurringInvoiceSchema.index({ organizationId: 1, nextRunDate: 1, status: 1 });

const RecurringInvoice = model<IRecurringInvoice>(
  "RecurringInvoice",
  recurringInvoiceSchema,
);

export default RecurringInvoice;
