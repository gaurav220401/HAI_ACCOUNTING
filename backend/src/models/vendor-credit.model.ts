import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type VendorCreditStatus =
  | "DRAFT"
  | "OPEN"
  | "APPLIED"
  | "PARTIALLY_APPLIED"
  | "CLOSED"
  | "VOID";

export interface IVendorCreditLineItem {
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
  taxPercent?: number;
  amount: number;
  accountId?: Types.ObjectId | null;
}

export interface IVendorCredit extends Document {
  organizationId: Types.ObjectId;
  vendorId: Types.ObjectId;
  vendorCreditNumber: string;
  vendorCreditDate: Date;
  referenceBillId?: Types.ObjectId | null;
  subject?: string;
  sourceOfSupply?: string;
  destinationOfSupply?: string;
  billType?: string;
  orderNumber?: string;
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  discountAmount: number;
  taxType?: "TDS" | "TCS" | "none";
  tdsId?: Types.ObjectId | null;
  tcsId?: Types.ObjectId | null;
  tdsAmount: number;
  tcsAmount: number;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  subTotal: number;
  total: number;
  appliedAmount: number;
  refundedAmount: number;
  balanceAmount: number;
  lineItems: IVendorCreditLineItem[];
  notes?: string;
  termsAndConditions?: string;
  status: VendorCreditStatus;
  attachments?: string[];
  comments: Array<{
    author: string;
    text: string;
    time: Date;
    isSystem: boolean;
  }>;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vendorCreditLineItemSchema = new Schema<IVendorCreditLineItem>(
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
    taxPercent: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { _id: true },
);

const vendorCreditSchema = new Schema<IVendorCredit>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    vendorCreditNumber: { type: String, required: true, trim: true },
    vendorCreditDate: { type: Date, required: true },
    referenceBillId: { type: Schema.Types.ObjectId, ref: "Bill", default: null },
    subject: { type: String, default: "" },
    sourceOfSupply: { type: String, default: "" },
    destinationOfSupply: { type: String, default: "" },
    billType: { type: String, default: "" },
    orderNumber: { type: String, default: "" },
    discountLevel: { type: String, enum: ["transaction", "line_item"], default: "transaction" },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxType: { type: String, enum: ["TDS", "TCS", "none"], default: "none" },
    tdsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    tcsId: { type: Schema.Types.ObjectId, ref: "TcsTax", default: null },
    tdsAmount: { type: Number, default: 0 },
    tcsAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    appliedAmount: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    lineItems: { type: [vendorCreditLineItemSchema], default: [] },
    notes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "APPLIED", "PARTIALLY_APPLIED", "CLOSED", "VOID"],
      default: "DRAFT",
    },
    attachments: { type: [String], default: [] },
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
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

vendorCreditSchema.plugin(auditTrailPlugin);
vendorCreditSchema.plugin(softDeletePlugin);

vendorCreditSchema.index({ organizationId: 1, vendorCreditNumber: 1 }, { unique: true });
vendorCreditSchema.index({ organizationId: 1, vendorId: 1, status: 1 });

export default model<IVendorCredit>("VendorCredit", vendorCreditSchema);
