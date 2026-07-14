import Account from "../../models/account.model";
import GLEntry from "../../models/gl-entry.model";
import { Types } from "mongoose";

export async function listAccounts(organizationId: any) {
  return Account.find({ organizationId, isActive: true })
    .sort({ name: 1 })
    .lean();
}

export async function getAccountById(organizationId: any, id: any) {
  return Account.findOne({ _id: id, organizationId, isActive: true }).lean();
}

export async function searchAccounts(organizationId: any, query: string) {
  const cleanQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  return Account.find({
    organizationId,
    isActive: true,
    $or: [
      { name: { $regex: cleanQuery, $options: "i" } },
      { code: { $regex: cleanQuery, $options: "i" } },
      { type: { $regex: cleanQuery, $options: "i" } },
    ],
  })
    .limit(15)
    .lean();
}

export async function getAccountBalance(organizationId: any, accountId: any, startDate?: Date, endDate?: Date): Promise<number> {
  const filter: any = { organizationId, accountId: new Types.ObjectId(accountId) };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = startDate;
    if (endDate) filter.date.$lte = endDate;
  }

  const entries = await GLEntry.find(filter).select("debit credit").lean();
  return entries.reduce((acc, curr) => acc + ((curr.debit || 0) - (curr.credit || 0)), 0);
}

export async function createAccount(organizationId: any, data: any) {
  return Account.create({
    organizationId,
    name: data.name,
    code: data.code || "",
    rootType: data.rootType || data.type || "Expense",
    accountType: data.accountType || "Expense",
    description: data.description || "",
    isActive: true,
  } as any);
}

export async function getTrialBalance(organizationId: any, asOfDate = new Date()) {
  const accounts = await Account.find({ organizationId, isActive: true }).lean();
  const result = [];

  for (const account of accounts) {
    const filter: any = {
      organizationId,
      accountId: account._id,
      date: { $lte: asOfDate },
    };
    const entries = await GLEntry.find(filter).select("debit credit").lean();
    const balance = entries.reduce((acc, curr) => acc + ((curr.debit || 0) - (curr.credit || 0)), 0);

    result.push({
      accountId: account._id,
      name: account.name,
      code: account.code,
      type: account.accountType,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
    });
  }

  return result;
}

export function getAccountFormSchema() {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Account name", required: true },
      code: { type: "string", description: "Account code identifier (e.g. 10001)", required: true },
      type: { type: "string", enum: ["Asset", "Liability", "Equity", "Revenue", "Expense"], required: true },
      description: { type: "string", description: "Account purpose description" },
    },
  };
}
