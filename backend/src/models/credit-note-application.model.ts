import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export interface ICreditNoteApplication extends Document {
  organizationId: Types.ObjectId;
  creditNoteId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  amount: number;
  appliedDate: Date;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const creditNoteApplicationSchema = new Schema<ICreditNoteApplication>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    creditNoteId: { type: Schema.Types.ObjectId, ref: "CreditNote", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    amount: { type: Number, required: true, default: 0 },
    appliedDate: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

creditNoteApplicationSchema.plugin(auditTrailPlugin);
creditNoteApplicationSchema.plugin(softDeletePlugin);

creditNoteApplicationSchema.index(
  { organizationId: 1, creditNoteId: 1, invoiceId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export default model<ICreditNoteApplication>(
  "CreditNoteApplication",
  creditNoteApplicationSchema,
);
