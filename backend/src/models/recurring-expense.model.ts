import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type RecurringFrequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type RecurringStatus = "Active" | "Stopped" | "Expired";

export interface IRecurringExpense extends Document {
  organizationId: Types.ObjectId;
  profileName: string;
  frequency: RecurringFrequency;
  repeatEvery: number;
  startDate: Date;
  neverExpires: boolean;
  endsOn?: Date | null;
  expenseAccountId?: Types.ObjectId | null;
  amount: number;
  currency: string;
  paidThroughAccountId?: Types.ObjectId | null;
  vendorId?: Types.ObjectId | null;
  customerId?: Types.ObjectId | null;
  isBillable: boolean;
  projectId?: Types.ObjectId | null;
  notes?: string;
  status: RecurringStatus;
  lastExpenseDate?: Date | null;
  nextExpenseDate?: Date | null;
  generatedExpenseIds: Types.ObjectId[];
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const recurringExpenseSchema = new Schema<IRecurringExpense>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    profileName: { type: String, required: true, trim: true },
    frequency: { type: String, enum: ["Daily", "Weekly", "Monthly", "Yearly"], default: "Weekly" },
    repeatEvery: { type: Number, default: 1, min: 1 },
    startDate: { type: Date, required: true },
    neverExpires: { type: Boolean, default: true },
    endsOn: { type: Date, default: null },
    expenseAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "INR" },
    paidThroughAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    isBillable: { type: Boolean, default: false },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["Active", "Stopped", "Expired"], default: "Active" },
    lastExpenseDate: { type: Date, default: null },
    nextExpenseDate: { type: Date, default: null },
    generatedExpenseIds: [{ type: Schema.Types.ObjectId, ref: "Expense" }],
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

recurringExpenseSchema.plugin(auditTrailPlugin);
recurringExpenseSchema.plugin(softDeletePlugin);

export default model<IRecurringExpense>("RecurringExpense", recurringExpenseSchema);
