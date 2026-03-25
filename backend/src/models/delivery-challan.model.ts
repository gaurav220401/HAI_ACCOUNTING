import { Schema, model, Document } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type DeliveryChallanStatus = "Draft" | "Open" | "Delivered" | "Returned";

export type ChallanType =
  | "Supply of Liquid Gas"
  | "Job Work"
  | "Supply on Approval"
  | "Others";

export interface IDeliveryChallanItem {
  itemId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  discountAmount: number;
  taxId?: Schema.Types.ObjectId | null;
  taxPercent: number;
  taxAmount: number;
  amount: number;
}

export interface IDeliveryChallan extends Document {
  organizationId: Schema.Types.ObjectId;
  challanNumber: string;
  referenceNumber?: string;
  customerId: Schema.Types.ObjectId;
  challanDate: Date;
  challanType: ChallanType;
  items: IDeliveryChallanItem[];
  subTotal: number;
  discountType: "percent" | "amount";
  discountValue: number;
  discountAmount: number;
  taxId?: Schema.Types.ObjectId | null;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentAmount: number;
  total: number;
  customerNotes?: string;
  termsAndConditions?: string;
  status: DeliveryChallanStatus;
  invoiceStatus: "NOT INVOICED" | "INVOICED";
  invoiceId?: Schema.Types.ObjectId | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

const challanItemSchema = new Schema<IDeliveryChallanItem>(
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

const deliveryChallanSchema = new Schema<IDeliveryChallan>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    challanNumber: { type: String, required: true },
    referenceNumber: { type: String, default: "" },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    challanDate: { type: Date, required: true },
    challanType: {
      type: String,
      enum: [
        "Supply of Liquid Gas",
        "Job Work",
        "Supply on Approval",
        "Others",
      ],
      required: true,
    },
    items: { type: [challanItemSchema], required: true, default: [] },
    subTotal: { type: Number, default: 0 },
    discountType: {
      type: String,
      enum: ["percent", "amount"],
      default: "percent",
    },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    taxAmount: { type: Number, default: 0 },
    adjustmentLabel: { type: String, default: "Adjustment" },
    adjustmentAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    customerNotes: { type: String, default: "" },
    termsAndConditions: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Draft", "Open", "Delivered", "Returned"],
      default: "Draft",
    },
    invoiceStatus: {
      type: String,
      enum: ["NOT INVOICED", "INVOICED"],
      default: "NOT INVOICED",
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

deliveryChallanSchema.plugin(auditTrailPlugin);
deliveryChallanSchema.plugin(softDeletePlugin);
deliveryChallanSchema.index(
  { organizationId: 1, challanNumber: 1 },
  { unique: true },
);
deliveryChallanSchema.index({ organizationId: 1, customerId: 1 });
deliveryChallanSchema.index({ organizationId: 1, status: 1 });

const DeliveryChallan = model<IDeliveryChallan>(
  "DeliveryChallan",
  deliveryChallanSchema,
);
export default DeliveryChallan;
