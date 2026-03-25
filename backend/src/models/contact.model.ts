import { Schema, model } from "mongoose";
import { IContact } from "../types";
import { auditTrailPlugin } from "../plugins";
import { softDeletePlugin } from "../plugins";

const addressSchema = new Schema(
  {
    attention: { type: String, default: "" },
    street: { type: String, default: "" },
    street2: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    country: { type: String, default: "" },
    phone: { type: String, default: "" },
    fax: { type: String, default: "" },
  },
  { _id: false },
);

const commentSchema = new Schema(
  {
    text: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, default: "" },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const contactPersonSchema = new Schema(
  {
    salutation: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    workPhone: { type: String, default: "" },
    mobile: { type: String, default: "" },
    phone: { type: String, default: "" },   // backward compat alias
    designation: { type: String, default: "" },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false },
);

const bankDetailSchema = new Schema(
  {
    bankName: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountHolderName: { type: String, default: "" },
    ifscCode: { type: String, default: "" },
    branchName: { type: String, default: "" },
    upiId: { type: String, default: "" },
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
    // Primary contact
    salutation: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    displayName: { type: String, required: true, trim: true },
    companyName: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    mobile: { type: String, default: "" },
    currency: { type: String, required: true, default: "INR" },
    language: { type: String, default: "en" },
    // Financial
    paymentTermsId: { type: Schema.Types.ObjectId, ref: "PaymentTerms", default: null },
    accountsPayableId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    openingBalance: { type: Number, default: 0 },
    taxTreatment: {
      type: String,
      enum: ["Taxable", "TaxExempt", "ReverseCharge", "SEZ", "Overseas", "Composition", "UIN"],
      default: "Taxable",
    },
    taxId: { type: String, default: "" },
    gstin: { type: String, default: "", uppercase: true, trim: true },
    pan: { type: String, default: "" },
    tdsCategory: { type: String, default: "" },
    msmeRegistered: { type: Boolean, default: false },
    // Extra / social details
    websiteUrl: { type: String, default: "" },
    department: { type: String, default: "" },
    designation: { type: String, default: "" },
    twitterHandle: { type: String, default: "" },
    skypeName: { type: String, default: "" },
    facebookUrl: { type: String, default: "" },
    // Attached documents (Cloudinary)
    documents: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        size: { type: Number },
        mimeType: { type: String },
      },
    ],
    // Address
    billingAddress: { type: addressSchema, default: {} },
    shippingAddress: { type: addressSchema, default: {} },
    // Relations
    contactPersons: { type: [contactPersonSchema], default: [] },
    bankDetails: { type: [bankDetailSchema], default: [] },
    notes: { type: String, default: "" },
    comments: { type: [commentSchema], default: [] },
    portalEnabled: { type: Boolean, default: false },
    reportingTags: [{ type: Schema.Types.ObjectId, ref: "ReportingTag" }],
    // Customer
    creditLimit: { type: Number, default: 0 },
    salesPersonId: { type: Schema.Types.ObjectId, ref: "SalesPerson", default: null },
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
