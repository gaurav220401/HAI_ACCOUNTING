import { Schema, model } from "mongoose";
import { IExpenseCategory } from "../types";
import { auditTrailPlugin } from "../plugins";

const expenseCategorySchema = new Schema<IExpenseCategory>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

expenseCategorySchema.plugin(auditTrailPlugin);
expenseCategorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

const ExpenseCategory = model<IExpenseCategory>("ExpenseCategory", expenseCategorySchema);
export default ExpenseCategory;
