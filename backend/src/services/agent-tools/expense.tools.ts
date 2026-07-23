import mongoose from "mongoose";
import Expense from "../../models/expense.model";
import Contact from "../../models/contact.model";

export async function createExpenseTool(
  organizationId: string,
  args: {
    amount: number;
    category?: string;
    notes?: string;
    vendorName?: string;
    paidThrough?: string;
    date?: string;
  }
) {
  if (!args.amount || args.amount <= 0) {
    throw new Error("A valid expense amount is required.");
  }

  let vendorId: mongoose.Types.ObjectId | null = null;
  if (args.vendorName) {
    const vendor = await Contact.findOne({
      organizationId,
      displayName: new RegExp(args.vendorName.trim(), "i"),
      isDeleted: false,
    });
    if (vendor) {
      vendorId = vendor._id as mongoose.Types.ObjectId;
    }
  }

  const expDate = args.date ? new Date(args.date) : new Date();

  const newExpense = await Expense.create({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    expenseType: "Regular",
    amount: args.amount,
    currency: "INR",
    date: expDate,
    vendorId,
    notes: args.notes || args.category || "Logged via AI Agent",
    status: "Approved",
  });

  return {
    success: true,
    expenseId: newExpense._id,
    expenseNumber: newExpense.expenseNumber,
    amount: newExpense.amount,
    date: newExpense.date,
    message: `Expense of ₹${newExpense.amount.toLocaleString("en-IN")} logged successfully (${newExpense.expenseNumber || "Recorded"}).`,
  };
}
