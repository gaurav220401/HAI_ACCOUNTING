import { Schema, model } from "mongoose";
import { IContact } from "../types";
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

const contactPersonSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    designation: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const contactSchema = new Schema<IContact>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    contactType: {
      type: String,
      enum: ["Customer", "Vendor", "Both"],
      required: true,
    },
    displayName: { type: String, required: true, trim: true },
    companyName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    currency: { type: String, required: true, default: "INR" },
    paymentTermsId: { type: Schema.Types.ObjectId, ref: "PaymentTerms", default: null },
    taxTreatment: {
      type: String,
      enum: ["Taxable", "TaxExempt", "ReverseCharge", "SEZ", "Overseas", "Composition", "UIN"],
      default: "Taxable",
    },
    taxId: { type: String, default: "" },
    billingAddress: { type: addressSchema, default: {} },
    shippingAddress: { type: addressSchema, default: {} },
    contactPersons: { type: [contactPersonSchema], default: [] },
    notes: { type: String, default: "" },
    portalEnabled: { type: Boolean, default: false },
    language: { type: String, default: "en" },
    reportingTags: [{ type: Schema.Types.ObjectId, ref: "ReportingTag" }],
    // Customer
    creditLimit: { type: Number, default: 0 },
    salesPersonId: { type: Schema.Types.ObjectId, ref: "SalesPerson", default: null },
    // Vendor
    tdsCategory: { type: String, default: "" },
    // Calculated
    outstandingPayable: { type: Number, default: 0 },
    outstandingReceivable: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

contactSchema.plugin(auditTrailPlugin);
contactSchema.plugin(softDeletePlugin);
contactSchema.index({ organizationId: 1, displayName: 1 });
contactSchema.index({ organizationId: 1, contactType: 1 });
contactSchema.index({ organizationId: 1, email: 1 });

const Contact = model<IContact>("Contact", contactSchema);
export default Contact;
