import { Response } from "express";
import Expense from "../models/expense.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "../services/gl-posting.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function expenseVoucherId(expense: any): string {
  return `expense:${String(expense._id)}`;
}

function isPostedStatus(status: string): boolean {
  return status === "Approved" || status === "Reimbursed";
}

/**
 * Post GL entries for an expense:
 *  DEBIT  expense account(s)  → amount
 *  CREDIT paid-through account → amount
 */
async function postExpenseLedger(expense: any, req: AuthenticatedRequest) {
  if (!isPostedStatus(String(expense.status || ""))) return;

  const organizationId = expense.organizationId;
  const total = round2(toNum(expense.amount));
  if (total <= 0) return;

  // Resolve paid-through account (Cash/Bank)
  const paidThroughId =
    expense.paidThroughAccountId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Petty Cash", "Cash", "Cash In Hand", "Undeposited Funds"],
      rootType: "Asset",
    }));

  // Build debit lines from expense accounts
  const debitMap = new Map<string, number>();
  let expenseTaxSum = 0;

  if (expense.isItemized && Array.isArray(expense.lineItems) && expense.lineItems.length > 0) {
    // Itemized expense — each line item has its own expense account
    for (const li of expense.lineItems) {
      if (!li) continue;
      const accountId = String(li.expenseAccountId?._id || li.expenseAccountId || li.accountId || "");
      if (!accountId) continue;
      const amount = round2(toNum(li.amount));
      if (amount <= 0) continue;

      const lineTaxRate = toNum(li.taxRate || expense.taxRate || 0);
      const lineTax = lineTaxRate > 0 ? round2((amount * lineTaxRate) / (100 + lineTaxRate)) : 0;
      const netAmount = round2(amount - lineTax);
      expenseTaxSum = round2(expenseTaxSum + lineTax);

      debitMap.set(accountId, round2((debitMap.get(accountId) || 0) + netAmount));
    }
  } else if (expense.expenseAccountId) {
    // Single expense account
    const accountId = String((expense.expenseAccountId as any)?._id || expense.expenseAccountId);
    const taxRate = toNum(expense.taxRate || 0);
    const totalTax = taxRate > 0 ? round2((total * taxRate) / (100 + taxRate)) : toNum(expense.taxAmount || 0);
    const netAmount = round2(total - totalTax);
    expenseTaxSum = totalTax;

    debitMap.set(accountId, netAmount);
  }

  // Fallback: if no expense accounts found, find a default one
  if (debitMap.size === 0) {
    const defaultExpenseId = await findAccountIdByName({
      organizationId,
      names: ["Other Expenses", "Expenses", "Uncategorized"],
      rootType: "Expense",
      accountType: "Expense",
    });
    debitMap.set(String(defaultExpenseId), total);
  }

  // Post Input GST if tax present
  let inputCgstId: string | null = null;
  let inputSgstId: string | null = null;
  let inputIgstId: string | null = null;

  if (expenseTaxSum > 0.009) {
    try {
      inputCgstId = await findAccountIdByName({
        organizationId,
        names: ["Input CGST", "Input GST", "Input Tax Receivable"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      }).then(id => String(id));
    } catch {}

    try {
      inputSgstId = await findAccountIdByName({
        organizationId,
        names: ["Input SGST", "Input GST", "Input Tax Receivable"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      }).then(id => String(id));
    } catch {}

    try {
      inputIgstId = await findAccountIdByName({
        organizationId,
        names: ["Input IGST", "Input GST", "Input Tax Receivable"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      }).then(id => String(id));
    } catch {}

    const cgstAmount = round2(expenseTaxSum / 2);
    const sgstAmount = round2(expenseTaxSum - cgstAmount);

    if (inputCgstId && inputSgstId) {
      debitMap.set(inputCgstId, round2((debitMap.get(inputCgstId) || 0) + cgstAmount));
      debitMap.set(inputSgstId, round2((debitMap.get(inputSgstId) || 0) + sgstAmount));
    } else if (inputIgstId) {
      debitMap.set(inputIgstId, round2((debitMap.get(inputIgstId) || 0) + expenseTaxSum));
    }
  }

  // Balance debits against total
  let totalDebits = round2(
    Array.from(debitMap.values()).reduce((sum, amount) => sum + amount, 0),
  );
  const balancingDelta = round2(total - totalDebits);
  if (Math.abs(balancingDelta) > 0.009) {
    const firstKey = debitMap.keys().next().value!;
    debitMap.set(firstKey, round2((debitMap.get(firstKey) || 0) + balancingDelta));
  }

  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Vendor";
    contactId?: any;
  }> = [];

  // Debit expense account(s) and tax account(s)
  for (const [accountId, amount] of debitMap.entries()) {
    const rounded = round2(amount);
    if (rounded <= 0) continue;
    lines.push({
      accountId,
      debit: rounded,
      description: `Expense ${expense.expenseNumber || ""}`,
      ...(expense.vendorId ? { contactType: "Vendor" as const, contactId: expense.vendorId } : {}),
    });
  }

  // Credit paid-through account (money going out)
  lines.push({
    accountId: paidThroughId,
    credit: total,
    description: `Expense payment ${expense.expenseNumber || ""}`,
    ...(expense.vendorId ? { contactType: "Vendor" as const, contactId: expense.vendorId } : {}),
  });

  await postVoucher({
    organizationId,
    voucherType: "Expense",
    voucherId: expenseVoucherId(expense),
    voucherNo: String(expense.expenseNumber || expense._id),
    postingDate: expense.date ? new Date(expense.date) : new Date(),
    lines,
    description: `Expense posting ${expense.expenseNumber || ""}`,
    req,
  });
}

async function reverseExpenseLedger(expense: any, req: AuthenticatedRequest) {
  await reverseVoucher({
    organizationId: expense.organizationId,
    voucherType: "Expense",
    voucherId: expenseVoucherId(expense),
    reversalVoucherNo: `REV-${expense.expenseNumber || expense._id}`,
    postingDate: new Date(),
    description: `Expense reversal ${expense.expenseNumber || ""}`,
    req,
  });
}

/** GET /api/expenses?type=Regular|Mileage&status=...&vendorId=...&search=...&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, status, search, vendorId, page = 1, limit = 25 } = req.query;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (type) filter.expenseType = type;
  if (status) filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  if (search) {
    filter.$or = [
      { invoiceNumber: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
    ];
  }

  const total = await Expense.countDocuments(filter);
  const expenses = await Expense.find(filter)
    .populate("expenseAccountId paidThroughAccountId vendorId customerId taxId")
    .sort({ date: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data: expenses,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/expenses/:id  — accepts both expenseNumber (EXP-0001) and MongoDB _id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const param = String(req.params.id);
  // Detect expenseNumber pattern vs ObjectId
  const isExpNum = /^EXP-\d{4,}$/i.test(param);
  const query = isExpNum
    ? { expenseNumber: param.toUpperCase(), organizationId: orgId(req) }
    : { _id: param, organizationId: orgId(req) };

  const expense = await Expense.findOne(query)
    .select("+activityLog")
    .populate("expenseAccountId paidThroughAccountId vendorId customerId taxId lineItems.expenseAccountId");
  if (!expense) throw new NotFoundError("Expense");
  res.json({ success: true, data: expense });
});

/** POST /api/expenses */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { date, amount, expenseType, isItemized, lineItems, expenseAccountId, mileageRate, mileageUnit, distance } = req.body;
  if (!date) throw new ValidationError("date is required");
  if (amount == null) throw new ValidationError("amount is required");

  const type = expenseType ?? "Regular";

  if (type === "Regular") {
    if (isItemized) {
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new ValidationError("lineItems are required for itemized expenses");
      }
      for (const li of lineItems) {
        if (!li.expenseAccountId) throw new ValidationError("lineItems must have expenseAccountId");
        if (li.amount == null || +li.amount <= 0) throw new ValidationError("lineItem amount must be greater than 0");
      }
    } else {
      if (!expenseAccountId) throw new ValidationError("expenseAccountId is required for regular expenses");
      if (+amount <= 0) throw new ValidationError("amount must be greater than 0");
    }
  }

  if (type === "Mileage") {
    if (!mileageRate || +mileageRate <= 0) throw new ValidationError("mileageRate is required for mileage expenses");
    if (!distance || +distance <= 0) throw new ValidationError("distance is required for mileage expenses");
    if (!expenseAccountId) throw new ValidationError("expenseAccountId is required for mileage expenses");
  }

  const expense = new Expense({
    organizationId: orgId(req),
    ...req.body,
    expenseType: type,
  });
  attachUser(expense as any, req);
  await expense.save();

  // Post GL entries for non-draft expenses
  await postExpenseLedger(expense, req);

  res.status(201).json({ success: true, data: expense });
});

/** POST /api/expenses/bulk - create multiple expenses at once */
export const bulkCreate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { expenses } = req.body;
  if (!Array.isArray(expenses) || expenses.length === 0) {
    throw new ValidationError("expenses array is required");
  }

  const org = orgId(req);
  const docs = expenses.map((e: any) =>
    new Expense({ organizationId: org, ...e, expenseType: e.expenseType ?? "Regular" }),
  );

  // Attach audit user to each
  for (const doc of docs) attachUser(doc as any, req);

  const saved = await Expense.insertMany(docs);

  // Post GL entries for each saved expense
  for (const expense of saved) {
    await postExpenseLedger(expense, req);
  }

  res.status(201).json({ success: true, data: saved });
});

/** PATCH /api/expenses/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const param = String(req.params.id);
  const isExpNum = /^EXP-\d{4,}$/i.test(param);
  const query = isExpNum
    ? { expenseNumber: param.toUpperCase(), organizationId: orgId(req) }
    : { _id: param, organizationId: orgId(req) };

  const expense = await Expense.findOne(query).select("+activityLog");
  if (!expense) throw new NotFoundError("Expense");

  const previousPosted = isPostedStatus(String(expense.status || ""));

  const allowed = [
    "date", "amount", "currency", "expenseAccountId", "paidThroughAccountId",
    "vendorId", "customerId", "invoiceNumber", "notes", "isBillable",
    "taxId", "isItemized", "lineItems", "status", "receiptUrls",
    "expenseType", "mileageCalcMethod", "distance", "mileageUnit", "mileageRate",
    "employeeId", "projectId", "reportingTagIds",
  ];

  const { expenseType, isItemized, lineItems, expenseAccountId, mileageRate, distance } = req.body;
  const type = expenseType ?? expense.expenseType;

  if (type === "Regular") {
    if (isItemized) {
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new ValidationError("lineItems are required for itemized expenses");
      }
      for (const li of lineItems) {
        if (!li.expenseAccountId) throw new ValidationError("lineItems must have expenseAccountId");
        if (li.amount == null || +li.amount <= 0) throw new ValidationError("lineItem amount must be greater than 0");
      }
    } else {
      if (!expenseAccountId && !expense.expenseAccountId) throw new ValidationError("expenseAccountId is required for regular expenses");
    }
  }

  if (type === "Mileage") {
    if (!mileageRate && !expense.mileageRate) throw new ValidationError("mileageRate is required for mileage expenses");
    if (!(distance || expense.distance)) throw new ValidationError("distance is required for mileage expenses");
    if (!expenseAccountId && !expense.expenseAccountId) throw new ValidationError("expenseAccountId is required for mileage expenses");
  }

  // Reverse previous GL entries if expense was already posted
  if (previousPosted) {
    await reverseExpenseLedger(expense, req);
  }

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) (expense as any)[f] = req.body[f];
  });

  attachUser(expense as any, req);
  await expense.save();

  // Post new GL entries if expense is in a posted status
  const nextPosted = isPostedStatus(String(expense.status || ""));
  if (nextPosted) {
    await postExpenseLedger(expense, req);
  }

  res.json({ success: true, data: expense });
});

/** DELETE /api/expenses/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const param = String(req.params.id);
  const isExpNum = /^EXP-\d{4,}$/i.test(param);
  const query = isExpNum
    ? { expenseNumber: param.toUpperCase(), organizationId: orgId(req) }
    : { _id: param, organizationId: orgId(req) };

  const expense = await Expense.findOne(query).select("+activityLog");
  if (!expense) throw new NotFoundError("Expense");

  // Reverse GL entries before soft-deleting
  if (isPostedStatus(String(expense.status || ""))) {
    await reverseExpenseLedger(expense, req);
  }

  expense.isDeleted = true;
  expense.deletedAt = new Date();
  attachUser(expense as any, req);
  await expense.save();
  res.json({ success: true, message: "Expense deleted" });
});
