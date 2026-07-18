import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export type PaymentReceivedStatus = "DRAFT" | "PAID" | "VOID";

export interface IPaymentReceivedAuditLog {
  action: string;
  details?: string;
  amount?: number;
  invoice_id?: Types.ObjectId;
  at: Date;
  by?: string;
}

export interface IPaymentReceived extends Document {
  organization_id: Types.ObjectId;
  payment_id: string;
  payment_number: string;
  customer_id: Types.ObjectId;
  payment_date: Date;
  payment_mode: string;
  deposited_to_account?: Types.ObjectId | null;
  reference_number?: string;
  notes?: string;
  status: PaymentReceivedStatus;
  receipt_type?: "invoice-payment" | "customer-advance" | "previous-payment";

  total_amount_received: number;
  amount_used_for_invoices: number;
  amount_refunded: number;
  amount_in_excess: number;

  audit_log: IPaymentReceivedAuditLog[];

  is_deleted: boolean;
  deleted_at?: Date | null;

  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentAuditLogSchema = new Schema<IPaymentReceivedAuditLog>(
  {
    action: { type: String, required: true },
    details: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    invoice_id: { type: Schema.Types.ObjectId, ref: "Invoice", default: null },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
  },
  { _id: false },
);

const paymentReceivedSchema = new Schema<IPaymentReceived>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    payment_id: { type: String, required: true },
    payment_number: { type: String, required: true },
    customer_id: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    payment_date: { type: Date, required: true, index: true },
    payment_mode: { type: String, required: true, default: "Cash" },
    deposited_to_account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    reference_number: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["DRAFT", "PAID", "VOID"], default: "PAID", index: true },
    receipt_type: {
      type: String,
      enum: ["invoice-payment", "customer-advance", "previous-payment"],
      default: "invoice-payment",
    },

    total_amount_received: { type: Number, required: true, default: 0 },
    amount_used_for_invoices: { type: Number, required: true, default: 0 },
    amount_refunded: { type: Number, required: true, default: 0 },
    amount_in_excess: { type: Number, required: true, default: 0 },

    audit_log: { type: [paymentAuditLogSchema], default: [] },

    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentReceivedSchema.plugin(auditTrailPlugin);
paymentReceivedSchema.index({ organization_id: 1, payment_number: 1 }, { unique: true });

const PaymentReceived = model<IPaymentReceived>("PaymentReceived", paymentReceivedSchema);
export default PaymentReceived;
