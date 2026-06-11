import { Schema, model, Document } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type SalesOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "INVOICED"
  | "PARTIALLY_INVOICED"
  | "CLOSED"
  | "OVERDUE"
  | "VOID";

export type SalesOrderInvoiceStatus = "Not Invoiced" | "Invoiced";
export type SalesOrderShipmentStatus = "Pending" | "Shipped" | "Delivered";

export interface ISalesOrderLineItem {
  itemId: Schema.Types.ObjectId;
  name?: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discount?: number;
  taxId?: Schema.Types.ObjectId | null;
  taxPercent?: number;
  taxAmount?: number;
  amount: number;
}

export interface ISalesOrder extends Document {
  organizationId: Schema.Types.ObjectId;
  customerId: Schema.Types.ObjectId;
  salesOrderNumber: string;
  reference?: string;
  orderDate: Date;
  expectedShipmentDate?: Date | null;
  paymentTermsId?: Schema.Types.ObjectId | null;
  deliveryMethod?: string;
  salesPersonId?: Schema.Types.ObjectId | null;
  lineItems: ISalesOrderLineItem[];
  subTotal: number;
  shippingCharges: number;
  adjustment: number;
  total: number;
  notes?: string;
  terms?: string;
  status: SalesOrderStatus;
  invoiceStatus: SalesOrderInvoiceStatus;
  shipmentStatus: SalesOrderShipmentStatus;
  taxType: "TDS" | "TCS" | "none";
  tdsId?: Schema.Types.ObjectId | null;
  tcsId?: Schema.Types.ObjectId | null;
  taxAmount?: number;
  tcsAmount?: number;
  invoiceId?: Schema.Types.ObjectId | null;
  stockDeducted?: boolean;
  placeOfSupply?: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

const lineItemSchema = new Schema<ISalesOrderLineItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    name: { type: String, default: "" },
    description: { type: String, default: "" },
    hsnSacCode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const salesOrderSchema = new Schema<ISalesOrder>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    salesOrderNumber: { type: String, required: true, trim: true },
    reference: { type: String, default: "" },
    orderDate: { type: Date, required: true },
    expectedShipmentDate: { type: Date, default: null },
    paymentTermsId: { type: Schema.Types.ObjectId, ref: "PaymentTerms", default: null },
    deliveryMethod: { type: String, default: "" },
    salesPersonId: { type: Schema.Types.ObjectId, ref: "SalesPerson", default: null },
    lineItems: { type: [lineItemSchema], default: [] },
    subTotal: { type: Number, default: 0 },
    shippingCharges: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    terms: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "APPROVED",
        "INVOICED",
        "PARTIALLY_INVOICED",
        "CLOSED",
        "OVERDUE",
        "VOID",
      ],
      default: "DRAFT",
    },
    invoiceStatus: {
      type: String,
      enum: ["Not Invoiced", "Invoiced"],
      default: "Not Invoiced",
    },
    shipmentStatus: {
      type: String,
      enum: ["Pending", "Shipped", "Delivered"],
      default: "Pending",
    },
    taxType: {
      type: String,
      enum: ["TDS", "TCS", "none"],
      default: "none",
    },
    tdsId: { type: Schema.Types.ObjectId, ref: "TdsTax", default: null },
    tcsId: { type: Schema.Types.ObjectId, ref: "TcsTax", default: null },
    taxAmount: { type: Number, default: 0 },
    tcsAmount: { type: Number, default: 0 },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    stockDeducted: { type: Boolean, default: false },
    placeOfSupply: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

salesOrderSchema.plugin(auditTrailPlugin);
salesOrderSchema.plugin(softDeletePlugin);
salesOrderSchema.index({ organizationId: 1, salesOrderNumber: 1 }, { unique: true });
salesOrderSchema.index({ organizationId: 1, orderDate: -1 });

const SalesOrder = model<ISalesOrder>("SalesOrder", salesOrderSchema);
export default SalesOrder;
