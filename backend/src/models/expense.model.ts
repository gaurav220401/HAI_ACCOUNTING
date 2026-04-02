import { Schema, model, Document, Types } from "mongoose";
import { activityLogPlugin, auditTrailPlugin, softDeletePlugin } from "../plugins";
import { Counter } from "./counter.model";

export type ExpenseType = "Regular" | "Mileage";
export type MileageCalcMethod = "DistanceTravelled" | "OdometerReading";

export interface IExpenseLineItem {
  expenseAccountId: Types.ObjectId | null;
  amount: number;
  description?: string;
  taxId?: Types.ObjectId | null;
  isBillable?: boolean;
  customerId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  reportingTagIds?: Types.ObjectId[];
}

export interface IExpense extends Document {
  organizationId: Types.ObjectId;
  expenseNumber: string;
  expenseType: ExpenseType;
  // Regular expense
  expenseAccountId?: Types.ObjectId | null;
  isItemized: boolean;
  lineItems?: IExpenseLineItem[];
  amount: number;
  currency: string;
  // Mileage
  mileageCalcMethod?: MileageCalcMethod;
  distance?: number;
  mileageUnit?: "Km" | "Mile";
  mileageRate?: number;
  // Common
  date: Date;
  paidThroughAccountId?: Types.ObjectId | null;
  vendorId?: Types.ObjectId | null;
  customerId?: Types.ObjectId | null;
  invoiceNumber?: string;
  notes?: string;
  isBillable: boolean;
  taxId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  reportingTagIds?: Types.ObjectId[];
  employeeId?: Types.ObjectId | null;
  recurringId?: Types.ObjectId | null;
  recurringRunDate?: Date | null;
  sourceDocumentId?: Types.ObjectId | null;
  receiptUrls?: string[];
  activityLog?: Array<{
    timestamp: Date;
    userId?: Types.ObjectId | null;
    action: "created" | "updated" | "deleted" | "restored";
    changes: Record<string, { before: unknown; after: unknown }>;
  }>;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Reimbursed";
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<IExpenseLineItem>(
  {
    expenseAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    amount: { type: Number, required: true, default: 0 },
    description: { type: String, default: "" },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    isBillable: { type: Boolean, default: false },
    customerId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    reportingTagIds: [{ type: Schema.Types.ObjectId, ref: "ReportingTag" }],
  },
  { _id: false },
);

const expenseSchema = new Schema<IExpense>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    expenseNumber: { type: String, unique: true, sparse: true },
    expenseType: { type: String, enum: ["Regular", "Mileage"], default: "Regular" },
    // Regular
    expenseAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    isItemized: { type: Boolean, default: false },
    lineItems: { type: [lineItemSchema], default: [] },
    amount: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "INR" },
    // Mileage
    mileageCalcMethod: { type: String, enum: ["DistanceTravelled", "OdometerReading"], default: null },
    distance: { type: Number, default: null },
    mileageUnit: { type: String, enum: ["Km", "Mile"], default: "Km" },
    mileageRate: { type: Number, default: null },
    // Common
    date: { type: Date, required: true },
    paidThroughAccountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    vendorId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    invoiceNumber: { type: String, default: "" },
    notes: { type: String, default: "" },
    isBillable: { type: Boolean, default: false },
    taxId: { type: Schema.Types.ObjectId, ref: "Tax", default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    reportingTagIds: [{ type: Schema.Types.ObjectId, ref: "ReportingTag" }],
    employeeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    recurringId: { type: Schema.Types.ObjectId, ref: "RecurringExpense", default: null },
    recurringRunDate: { type: Date, default: null },
    sourceDocumentId: { type: Schema.Types.ObjectId, ref: "DocumentInbox", default: null },
    receiptUrls: [{ type: String }],
    status: { type: String, enum: ["Draft", "Submitted", "Approved", "Rejected", "Reimbursed"], default: "Draft" },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

expenseSchema.plugin(auditTrailPlugin);
expenseSchema.plugin(activityLogPlugin);
expenseSchema.plugin(softDeletePlugin);
expenseSchema.index({ organizationId: 1, date: -1 });
expenseSchema.index(
  { organizationId: 1, recurringId: 1, recurringRunDate: 1, isDeleted: 1 },
  {
    unique: true,
    partialFilterExpression: {
      recurringId: { $type: "objectId" },
      recurringRunDate: { $type: "date" },
    },
  },
 );
 expenseSchema.index(
   { organizationId: 1, sourceDocumentId: 1, isDeleted: 1 },
   {
     unique: true,
     partialFilterExpression: {
       sourceDocumentId: { $type: "objectId" },
     },
   },
 );

expenseSchema.pre("save", async function () {
  if (this.isNew && !this.expenseNumber) {
    const counter = await Counter.findByIdAndUpdate(
      `expense-${this.organizationId}`,
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    this.expenseNumber = `EXP-${String(counter!.seq).padStart(4, "0")}`;
  }
});

const Expense = model<IExpense>("Expense", expenseSchema);
export default Expense;
