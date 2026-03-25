import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export type PaymentMadeStatus = "DRAFT" | "PAID" | "VOID";

export interface IPaymentAuditLog {
  action: string;
  details?: string;
  amount?: number;
  bill_id?: Types.ObjectId;
  at: Date;
  by?: string;
}

export interface IPaymentMade extends Document {
  organization_id: Types.ObjectId;
  payment_id: string;
  payment_number: string;
  vendor_id: Types.ObjectId;
  payment_date: Date;
  payment_mode: string;
  paid_through_account?: Types.ObjectId | null;
  deposit_to_account?: Types.ObjectId | null;
  reference_number?: string;
  notes?: string;
  status: PaymentMadeStatus;

  total_amount_paid: number;
  amount_used_for_bills: number;
  amount_refunded: number;
  amount_in_excess: number;

  audit_log: IPaymentAuditLog[];

  is_deleted: boolean;
  deleted_at?: Date | null;

  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentAuditLogSchema = new Schema<IPaymentAuditLog>(
  {
    action: { type: String, required: true },
    details: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    bill_id: { type: Schema.Types.ObjectId, ref: "Bill", default: null },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "" },
  },
  { _id: false },
);

const paymentMadeSchema = new Schema<IPaymentMade>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    payment_id: { type: String, required: true },
    payment_number: { type: String, required: true },
    vendor_id: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    payment_date: { type: Date, required: true },
    payment_mode: { type: String, required: true, default: "Cash" },
    paid_through_account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    deposit_to_account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    reference_number: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["DRAFT", "PAID", "VOID"], default: "PAID", index: true },

    total_amount_paid: { type: Number, required: true, default: 0 },
    amount_used_for_bills: { type: Number, default: 0 },
    amount_refunded: { type: Number, default: 0 },
    amount_in_excess: { type: Number, default: 0 },

    audit_log: { type: [paymentAuditLogSchema], default: [] },

    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

paymentMadeSchema.plugin(auditTrailPlugin);

paymentMadeSchema.index({ organization_id: 1, payment_number: 1 }, { unique: true });
paymentMadeSchema.index({ organization_id: 1, payment_id: 1 }, { unique: true });
paymentMadeSchema.index({ organization_id: 1, vendor_id: 1, payment_date: -1 });

const PaymentMade = model<IPaymentMade>("PaymentMade", paymentMadeSchema);
export default PaymentMade;
