import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type CreditNoteStatus =
  | "DRAFT"
  | "OPEN"
  | "APPLIED"
  | "PARTIALLY_APPLIED"
  | "CLOSED"
  | "VOID";

export interface ICreditNoteLineItem {
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
  taxId?: Types.ObjectId | null;
  taxPercent?: number;
  amount: number;
  accountId?: Types.ObjectId | null;
}

export interface ICreditNote extends Document {
  organizationId: Types.ObjectId;
  customerId: Types.ObjectId;
  creditNoteNumber: string;
  creditNoteDate: Date;
  referenceNumber?: string;
  reason?: string;
  referenceInvoiceId?: Types.ObjectId | null;
  referenceOrderNumber?: string;
  accountsReceivableId?: Types.ObjectId | null;
  salesPersonId?: Types.ObjectId | null;
  subject?: string;
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
  lineItems: ICreditNoteLineItem[];
  customerNotes?: string;
  termsAndConditions?: string;
  attachments?: string[];
  status: CreditNoteStatus;
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

const creditNoteLineItemSchema = new Schema<ICreditNoteLineItem>(
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
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    taxPercent: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { _id: true },
);

const creditNoteSchema = new Schema<ICreditNote>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    creditNoteNumber: { type: String, required: true, trim: true },
    creditNoteDate: { type: Date, required: true },
    referenceNumber: { type: String, default: "" },
    reason: { type: String, default: "" },
    referenceInvoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    referenceOrderNumber: { type: String, default: "" },
    accountsReceivableId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    salesPersonId: { type: Schema.Types.ObjectId, ref: "SalesPerson", default: null },
    subject: { type: String, default: "" },
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
    lineItems: { type: [creditNoteLineItemSchema], default: [] },
    customerNotes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    attachments: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "OPEN", "APPLIED", "PARTIALLY_APPLIED", "CLOSED", "VOID"],
      default: "DRAFT",
    },
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

creditNoteSchema.plugin(auditTrailPlugin);
creditNoteSchema.plugin(softDeletePlugin);

creditNoteSchema.index({ organizationId: 1, creditNoteNumber: 1 }, { unique: true });
creditNoteSchema.index({ organizationId: 1, customerId: 1, status: 1 });

export default model<ICreditNote>("CreditNote", creditNoteSchema);
