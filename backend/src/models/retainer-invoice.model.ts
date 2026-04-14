import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

export type RetainerInvoiceStatus =
  | "Draft"
  | "Sent"
  | "Partially Paid"
  | "Paid"
  | "Partially Applied"
  | "Applied"
  | "Partially Refunded"
  | "Refunded"
  | "Void";

export interface IRetainerInvoiceApplication {
  invoice_id: Types.ObjectId;
  applied_amount: number;
  applied_date: Date;
}

export interface IRetainerInvoiceAuditLog {
  action: string;
  details?: string;
  amount?: number;
  invoice_id?: Types.ObjectId;
  at: Date;
  by?: string;
}

export interface IRetainerInvoice extends Document {
  organization_id: Types.ObjectId;
  retainer_id: string;
  retainer_number: string;
  customer_id: Types.ObjectId;
  retainer_date: Date;
  due_date?: Date | null;
  reference_number?: string;
  description?: string;
  payment_mode?: string;
  deposited_to_account?: Types.ObjectId | null;
  notes?: string;

  total_amount: number;
  amount_received: number;
  amount_applied: number;
  amount_refunded: number;
  amount_unapplied: number;
  balance_due: number;

  status: RetainerInvoiceStatus;
  sent_at?: Date | null;

  applications: IRetainerInvoiceApplication[];
  audit_log: IRetainerInvoiceAuditLog[];

  is_deleted: boolean;
  deleted_at?: Date | null;

  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const retainerInvoiceApplicationSchema = new Schema<IRetainerInvoiceApplication>(
  {
    invoice_id: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
    applied_amount: { type: Number, required: true, default: 0 },
    applied_date: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const retainerInvoiceAuditLogSchema = new Schema<IRetainerInvoiceAuditLog>(
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

const retainerInvoiceSchema = new Schema<IRetainerInvoice>(
  {
    organization_id: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    retainer_id: { type: String, required: true, trim: true },
    retainer_number: { type: String, required: true, trim: true },
    customer_id: { type: Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    retainer_date: { type: Date, required: true, index: true },
    due_date: { type: Date, default: null },
    reference_number: { type: String, default: "" },
    description: { type: String, default: "" },
    payment_mode: { type: String, default: "Cash" },
    deposited_to_account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    notes: { type: String, default: "" },

    total_amount: { type: Number, required: true, default: 0 },
    amount_received: { type: Number, required: true, default: 0 },
    amount_applied: { type: Number, required: true, default: 0 },
    amount_refunded: { type: Number, required: true, default: 0 },
    amount_unapplied: { type: Number, required: true, default: 0 },
    balance_due: { type: Number, required: true, default: 0 },

    status: {
      type: String,
      enum: [
        "Draft",
        "Sent",
        "Partially Paid",
        "Paid",
        "Partially Applied",
        "Applied",
        "Partially Refunded",
        "Refunded",
        "Void",
      ],
      default: "Draft",
      index: true,
    },
    sent_at: { type: Date, default: null },

    applications: { type: [retainerInvoiceApplicationSchema], default: [] },
    audit_log: { type: [retainerInvoiceAuditLogSchema], default: [] },

    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: true },
);

retainerInvoiceSchema.plugin(auditTrailPlugin);

retainerInvoiceSchema.index({ organization_id: 1, retainer_number: 1 }, { unique: true });
retainerInvoiceSchema.index({ organization_id: 1, retainer_id: 1 }, { unique: true });
retainerInvoiceSchema.index({ organization_id: 1, customer_id: 1, retainer_date: -1 });

const RetainerInvoice = model<IRetainerInvoice>("RetainerInvoice", retainerInvoiceSchema);
export default RetainerInvoice;
