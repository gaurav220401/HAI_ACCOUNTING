import { Schema, model } from "mongoose";
import { IBill } from "../types";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

const billLineItemSchema = new Schema(
  {
    isHeader: { type: Boolean, default: false },
    headerText: { type: String, default: "" },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    quantity: { type: Number, required: true, default: 1 },
    rate: { type: Number, required: true, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
  },
  { _id: true },
);

const billSchema = new Schema<IBill>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    billNumber: { type: String, required: true },
    referenceNumber: { type: String, default: "" },
    orderNumber: { type: String, default: "" },
    billDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    paymentTermsId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentTerms",
      default: null,
    },
    accountsPayableId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    subject: { type: String, default: "" },
    lineItems: { type: [billLineItemSchema], required: true, default: [] },
    subTotal: { type: Number, default: 0 },
    discountLevel: {
      type: String,
      enum: ["transaction", "line_item"],
      default: "transaction",
    },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxType: {
      type: String,
      enum: ["TDS", "TCS", "none"],
      default: "none",
    },
    tdsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    tcsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    taxAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Draft", "Open", "Overdue", "Partially Paid", "Paid", "Void"],
      default: "Draft",
    },
    attachments: [{ type: String }],
    comments: [
      {
        author: { type: String, required: true },
        text: { type: String, required: true },
        time: { type: Date, default: Date.now },
        isSystem: { type: Boolean, default: false },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

billSchema.plugin(auditTrailPlugin);
billSchema.plugin(softDeletePlugin);
billSchema.index({ organizationId: 1, billNumber: 1 }, { unique: true });
billSchema.index({ organizationId: 1, vendorId: 1 });
billSchema.index({ organizationId: 1, status: 1 });

const Bill = model<IBill>("Bill", billSchema);
export default Bill;
