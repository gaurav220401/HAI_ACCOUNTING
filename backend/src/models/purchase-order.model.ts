import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type PurchaseOrderStatus = "Draft" | "Open" | "Received" | "Billed" | "Closed" | "Canceled";
export type DiscountLevel = "transaction" | "line_item";

export interface IPurchaseOrderLineItem {
  _id?: Types.ObjectId;
  isHeader?: boolean;
  headerText?: string;
  itemId?: Types.ObjectId | null;
  name: string;
  accountId?: Types.ObjectId | null;
  description?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  amount: number;
  qtyReceived?: number;
  receivedDate?: Date | null;
}

export interface IPurchaseOrderComment {
  author: string;
  text: string;
  time: Date;
  isSystem: boolean;
}

export interface IPurchaseOrder extends Document {
  organizationId: Types.ObjectId;
  vendorId: Types.ObjectId | null;
  deliveryAddressType: "Organization" | "Customer";
  deliveryCustomerId: Types.ObjectId | null;
  purchaseOrderNumber: string;
  referenceNumber: string;
  purchaseOrderDate: Date;
  deliveryDate: Date | null;
  paymentTermsId: Types.ObjectId | null;
  shipmentPreference: string;
  discountLevel: DiscountLevel;
  discountAccountId: Types.ObjectId | null;
  lineItems: IPurchaseOrderLineItem[];
  subTotal: number;
  discountPercent: number;
  discountAmount: number;
  taxType: "TDS" | "TCS" | "none";
  tdsId: Types.ObjectId | null;
  tcsId: Types.ObjectId | null;
  taxAmount: number;
  tcsAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  notes: string;
  termsAndConditions: string;
  attachments: string[];
  comments: IPurchaseOrderComment[];
  status: PurchaseOrderStatus;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: Date | null;
}

const lineItemSchema = new Schema<IPurchaseOrderLineItem>(
  {
    isHeader: { type: Boolean, default: false },
    headerText: { type: String, default: "" },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", default: null },
    name: { type: String, default: "" },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    description: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    qtyReceived: { type: Number, default: 0 },
    receivedDate: { type: Date, default: null },
  },
  { _id: true },
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    deliveryAddressType: {
      type: String,
      enum: ["Organization", "Customer"],
      default: "Organization",
    },
    deliveryCustomerId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    purchaseOrderNumber: { type: String, required: true, trim: true },
    referenceNumber: { type: String, default: "" },
    purchaseOrderDate: { type: Date, required: true },
    deliveryDate: { type: Date, default: null },
    paymentTermsId: { type: Schema.Types.ObjectId, ref: "PaymentTerms", default: null },
    shipmentPreference: { type: String, default: "" },
    discountLevel: {
      type: String,
      enum: ["transaction", "line_item"],
      default: "transaction",
    },
    discountAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    subTotal: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxType: {
      type: String,
      enum: ["TDS", "TCS", "none"],
      default: "none",
    },
    tdsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    tcsId: { type: Schema.Types.ObjectId, ref: "TcsTax", default: null },
    taxAmount: { type: Number, default: 0 },
    tcsAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    attachments: [{ type: String }],
    comments: [
      {
        author: { type: String, required: true },
        text: { type: String, required: true },
        time: { type: Date, default: Date.now },
        isSystem: { type: Boolean, default: false },
      },
    ],
    status: {
      type: String,
      enum: ["Draft", "Open", "Received", "Billed", "Closed", "Canceled"],
      default: "Draft",
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

purchaseOrderSchema.plugin(auditTrailPlugin);
purchaseOrderSchema.plugin(softDeletePlugin);
purchaseOrderSchema.index({ organizationId: 1, purchaseOrderNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ organizationId: 1, vendorId: 1 });
purchaseOrderSchema.index({ organizationId: 1, status: 1 });

const PurchaseOrder = model<IPurchaseOrder>("PurchaseOrder", purchaseOrderSchema);
export default PurchaseOrder;
