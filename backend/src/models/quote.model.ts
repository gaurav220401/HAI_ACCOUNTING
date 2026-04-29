import { Schema, model } from "mongoose";
import { IQuote } from "../types";
import { auditTrailPlugin, softDeletePlugin, activityLogPlugin } from "../plugins";

const quoteItemSchema = new Schema(
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
  },
  { _id: true },
);

const quoteSchema = new Schema<IQuote>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    quoteNumber: { type: String, required: true },
    referenceNumber: { type: String, default: "" },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    quoteDate: { type: Date, required: true },
    expiryDate: { type: Date, default: null },
    salesPersonId: {
      type: Schema.Types.ObjectId,
      ref: "SalesPerson",
      default: null,
    },
    subject: { type: String, default: "" },
    items: { type: [quoteItemSchema], required: true, default: [] },
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
    status: {
      type: String,
      enum: ["Draft", "Sent", "Accepted", "Rejected", "Invoiced", "Expired"],
      default: "Draft",
    },
    placeOfSupply: { type: String, default: "" },
    // Email communications
    emailContacts: [{ type: String }],
    attachments: [{ type: String }],
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
  },
  { timestamps: true },
);

quoteSchema.plugin(auditTrailPlugin);
quoteSchema.plugin(softDeletePlugin);
quoteSchema.plugin(activityLogPlugin);
quoteSchema.index({ organizationId: 1, quoteNumber: 1 }, { unique: true });
quoteSchema.index({ organizationId: 1, customerId: 1 });
quoteSchema.index({ organizationId: 1, status: 1 });

const Quote = model<IQuote>("Quote", quoteSchema);
export default Quote;
