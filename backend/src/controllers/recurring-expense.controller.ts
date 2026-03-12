import { Response } from "express";
import RecurringExpense from "../models/recurring-expense.model";
import Expense from "../models/expense.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

/** Calculate next expense date based on frequency */
function computeNextDate(from: Date, frequency: string, repeatEvery: number): Date {
  const d = new Date(from);
  switch (frequency) {
    case "Daily":
      d.setDate(d.getDate() + repeatEvery);
      break;
    case "Weekly":
      d.setDate(d.getDate() + repeatEvery * 7);
      break;
    case "Monthly":
      d.setMonth(d.getMonth() + repeatEvery);
      break;
    case "Yearly":
      d.setFullYear(d.getFullYear() + repeatEvery);
      break;
  }
  return d;
}

/** GET /api/recurring-expenses */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, vendorId, page = 1, limit = 50 } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status) filter.status = status;
  if (search) filter.profileName = { $regex: search, $options: "i" };
  if (vendorId) filter.vendorId = vendorId;

  const total = await RecurringExpense.countDocuments(filter);
  const data = await RecurringExpense.find(filter)
    .populate("expenseAccountId paidThroughAccountId vendorId customerId")
    .sort({ createdAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({ success: true, data, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
});

/** GET /api/recurring-expenses/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("expenseAccountId paidThroughAccountId vendorId customerId");
  if (!rec) throw new NotFoundError("Recurring expense");
  res.json({ success: true, data: rec });
});

/** GET /api/recurring-expenses/:id/expenses — generated expenses for this profile */
export const getGeneratedExpenses = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring expense");

  const expenses = await Expense.find({ _id: { $in: rec.generatedExpenseIds }, isDeleted: false })
    .populate("expenseAccountId paidThroughAccountId vendorId customerId")
    .sort({ date: -1 })
    .lean();

  res.json({ success: true, data: expenses });
});

/** POST /api/recurring-expenses */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { profileName, startDate, amount, frequency, repeatEvery } = req.body;
  if (!profileName) throw new ValidationError("profileName is required");
  if (!startDate) throw new ValidationError("startDate is required");
  if (amount == null) throw new ValidationError("amount is required");

  const recurringExpense = new RecurringExpense({
    organizationId: orgId(req),
    ...req.body,
    nextExpenseDate: new Date(startDate),
    status: "Active",
  });
  attachUser(recurringExpense as any, req);
  await recurringExpense.save();
  await recurringExpense.populate("expenseAccountId paidThroughAccountId vendorId customerId");
  res.status(201).json({ success: true, data: recurringExpense });
});

/** PATCH /api/recurring-expenses/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring expense");

  const allowed = [
    "profileName", "frequency", "repeatEvery", "startDate", "neverExpires",
    "endsOn", "expenseAccountId", "amount", "currency", "paidThroughAccountId",
    "vendorId", "customerId", "isBillable", "projectId", "notes",
  ];
  for (const key of allowed) {
    if (key in req.body) (rec as any)[key] = req.body[key];
  }
  // Recalculate nextExpenseDate if start date changes and no expenses yet
  if (req.body.startDate && !rec.lastExpenseDate) {
    rec.nextExpenseDate = new Date(req.body.startDate);
  }
  attachUser(rec as any, req);
  await rec.save();
  await rec.populate("expenseAccountId paidThroughAccountId vendorId customerId");
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-expenses/:id/stop */
export const stop = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring expense");
  rec.status = "Stopped";
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-expenses/:id/resume */
export const resume = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring expense");
  rec.status = "Active";
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-expenses/:id/create-expense — manually trigger one expense now */
export const createExpenseNow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("expenseAccountId paidThroughAccountId vendorId customerId");
  if (!rec) throw new NotFoundError("Recurring expense");

  const today = new Date();
  const expense = new Expense({
    organizationId: orgId(req),
    expenseAccountId: rec.expenseAccountId,
    amount: rec.amount,
    currency: rec.currency,
    paidThroughAccountId: rec.paidThroughAccountId,
    vendorId: rec.vendorId,
    customerId: rec.customerId,
    isBillable: rec.isBillable,
    projectId: rec.projectId,
    notes: rec.notes ? `[Recurring: ${rec.profileName}] ${rec.notes}` : `[Recurring: ${rec.profileName}]`,
    date: today,
    status: "Draft",
    isItemized: false,
  });
  attachUser(expense as any, req);
  await expense.save();

  rec.lastExpenseDate = today;
  rec.nextExpenseDate = computeNextDate(today, rec.frequency, rec.repeatEvery);
  rec.generatedExpenseIds.push(expense._id as any);
  await rec.save();

  await expense.populate("expenseAccountId paidThroughAccountId vendorId customerId");
  res.status(201).json({ success: true, data: expense });
});

/** DELETE /api/recurring-expenses/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring expense");
  rec.isDeleted = true;
  rec.deletedAt = new Date();
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true });
});
