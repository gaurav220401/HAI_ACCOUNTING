import { Schema, model, Document, Types } from "mongoose";
import { Counter } from "./counter.model";
import { auditTrailPlugin } from "../plugins";

export type JournalStatus = "Draft" | "Posted" | "Voided";

export interface IJournalLine {
  accountId: Types.ObjectId;
  debit: number;
  credit: number;
  narration?: string;
}

export interface IJournal extends Document {
  organizationId: Types.ObjectId;
  journalNumber: string;
  date: Date;
  vendorId?: Types.ObjectId | null;
  description?: string;
  referenceNumber?: string;
  lineItems: IJournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: JournalStatus;
  notes?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const journalLineSchema = new Schema<IJournalLine>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    narration: { type: String, default: "" },
  },
  { _id: false },
);

const journalSchema = new Schema<IJournal>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    journalNumber: { type: String, unique: true, sparse: true },
    date: { type: Date, required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null, index: true },
    description: { type: String, default: "" },
    referenceNumber: { type: String, default: "" },
    lineItems: { type: [journalLineSchema], default: [] },
    totalDebit: { type: Number, required: true, default: 0 },
    totalCredit: { type: Number, required: true, default: 0 },
    status: { type: String, enum: ["Draft", "Posted", "Voided"], default: "Draft" },
    notes: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

journalSchema.plugin(auditTrailPlugin);
journalSchema.index({ organizationId: 1, date: -1 });

journalSchema.pre("save", async function () {
  if (this.isNew && !this.journalNumber) {
    const counter = await Counter.findByIdAndUpdate(
      `journal-${this.organizationId}`,
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
    this.journalNumber = `JRN-${String(counter!.seq).padStart(4, "0")}`;
  }
});

const Journal = model<IJournal>("Journal", journalSchema);
export default Journal;
