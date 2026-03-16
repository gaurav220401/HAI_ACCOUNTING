import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type RecurringStatus = "Active" | "Stopped" | "Expired";

export interface IRecurringBillLineItem {
  _id?: Types.ObjectId;
  isHeader?: boolean;
  headerText?: string;
  itemId?: Types.ObjectId | null;
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  amount: number;
  accountId?: Types.ObjectId | null;
  customerId?: Types.ObjectId | null;
}

export interface IRecurringBill extends Document {
  organizationId: Types.ObjectId;
  profileName: string;
  vendorId: Types.ObjectId;
  frequency: RecurringFrequency;
  repeatEvery: number;
  startDate: Date;
  neverExpires: boolean;
  endsOn?: Date | null;
  paymentTermsId?: Types.ObjectId | null;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  subject?: string;
  orderNumber?: string;
  isReverseCharge: boolean;
  discountLevel: "transaction" | "line_item";
  discountAccountId?: Types.ObjectId | null;
  discountPercent: number;
  discountAmount: number;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: Types.ObjectId | null;
  tcsId?: Types.ObjectId | null;
  taxAmount: number;
  tcsAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  subTotal: number;
  total: number;
  lineItems: IRecurringBillLineItem[];
  notes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status: RecurringStatus;
  lastBillDate?: Date | null;
  nextBillDate?: Date | null;
  generatedBillIds: Types.ObjectId[];
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const recurringBillLineItemSchema = new Schema<IRecurringBillLineItem>(
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

const recurringBillSchema = new Schema<IRecurringBill>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    profileName: { type: String, required: true, trim: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    frequency: { type: String, enum: ["Daily", "Weekly", "Monthly", "Yearly"], default: "Weekly" },
    repeatEvery: { type: Number, default: 1, min: 1 },
    startDate: { type: Date, required: true },
    neverExpires: { type: Boolean, default: true },
    endsOn: { type: Date, default: null },
    paymentTermsId: { type: Schema.Types.ObjectId, ref: "PaymentTerms", default: null },
    sourceOfSupply: { type: String, default: "" },
    destinationOfSupply: { type: String, default: "" },
    subject: { type: String, default: "" },
    orderNumber: { type: String, default: "" },
    isReverseCharge: { type: Boolean, default: false },
    discountLevel: { type: String, enum: ["transaction", "line_item"], default: "transaction" },
    discountAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxType: { type: String, enum: ["TDS", "TCS", "none"], default: "none" },
    tdsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    tcsId: { type: Schema.Types.ObjectId, ref: "TcsTax", default: null },
    taxAmount: { type: Number, default: 0 },
    tcsAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    lineItems: { type: [recurringBillLineItemSchema], default: [] },
    notes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    attachments: { type: [String], default: [] },
    status: { type: String, enum: ["Active", "Stopped", "Expired"], default: "Active" },
    lastBillDate: { type: Date, default: null },
    nextBillDate: { type: Date, default: null },
    generatedBillIds: [{ type: Schema.Types.ObjectId, ref: "Bill" }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

recurringBillSchema.plugin(auditTrailPlugin);
recurringBillSchema.plugin(softDeletePlugin);

export default model<IRecurringBill>("RecurringBill", recurringBillSchema);
