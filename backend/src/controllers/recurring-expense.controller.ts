import { Response } from "express";
import RecurringExpense from "../models/recurring-expense.model";
import Expense from "../models/expense.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import {
  computeNextExpenseDate,
  executeRecurringExpenseRun,
} from "../services/recurring-expense.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isPastEndDate(now: Date, endsOn: Date): boolean {
  return now > endOfDay(new Date(endsOn));
}

function isRunAfterEndDate(runDate: Date, endsOn: Date): boolean {
  return runDate > endOfDay(new Date(endsOn));
}

function applyExpiry(rec: any) {
  if (!rec.neverExpires && rec.endsOn) {
    const now = new Date();
    if (isPastEndDate(now, rec.endsOn)) {
      rec.status = "Expired";
      rec.nextExpenseDate = null;
    }
  }
}

/** GET /api/recurring-expenses */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, vendorId, page = 1, limit = 50 } = req.query;
  const organizationId = orgId(req);
  const todayStart = startOfDay(new Date());

  await RecurringExpense.updateMany(
    {
      organizationId,
      isDeleted: false,
      status: "Active",
      neverExpires: false,
      endsOn: { $ne: null, $lt: todayStart },
    },
    {
      $set: {
        status: "Expired",
        nextExpenseDate: null,
      },
    },
  );

  const filter: any = { organizationId, isDeleted: false };
  if (status) filter.status = status;
  if (search) filter.profileName = { $regex: search, $options: "i" };
  if (vendorId) filter.vendorId = vendorId;

  const total = await RecurringExpense.countDocuments(filter);
  const data = await RecurringExpense.find(filter)
    .populate("expenseAccountId paidThroughAccountId vendorId customerId")
    .sort({ createdAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit);

  data.forEach(applyExpiry);

  res.json({ success: true, data, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
});

/** GET /api/recurring-expenses/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("expenseAccountId paidThroughAccountId vendorId customerId");
  if (!rec) throw new NotFoundError("Recurring expense");

  const prevStatus = rec.status;
  const prevNextExpenseDate = rec.nextExpenseDate ? new Date(rec.nextExpenseDate).getTime() : null;
  applyExpiry(rec);

  const nextExpenseDate = rec.nextExpenseDate ? new Date(rec.nextExpenseDate).getTime() : null;
  if (prevStatus !== rec.status || prevNextExpenseDate !== nextExpenseDate) {
    attachUser(rec as any, req);
    await rec.save();
  }

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
  const { profileName, startDate, amount } = req.body;
  if (!profileName) throw new ValidationError("profileName is required");
  if (!startDate) throw new ValidationError("startDate is required");
  if (amount == null) throw new ValidationError("amount is required");

  const recurringExpense = new RecurringExpense({
    organizationId: orgId(req),
    ...req.body,
    nextExpenseDate: new Date(startDate),
    status: "Active",
  });
  applyExpiry(recurringExpense);
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

  const shouldRecomputeNextDate = [
    "startDate",
    "frequency",
    "repeatEvery",
    "neverExpires",
    "endsOn",
  ].some((key) => key in req.body);

  if (shouldRecomputeNextDate) {
    if (rec.lastExpenseDate) {
      rec.nextExpenseDate = computeNextExpenseDate(
        new Date(rec.lastExpenseDate),
        rec.frequency,
        rec.repeatEvery,
      );
    } else {
      rec.nextExpenseDate = rec.startDate ? new Date(rec.startDate) : null;
    }
  }

  if (rec.status === "Expired" && (rec.neverExpires || !rec.endsOn || new Date() <= rec.endsOn)) {
    rec.status = "Active";
    if (!rec.nextExpenseDate) {
      rec.nextExpenseDate = rec.lastExpenseDate
        ? computeNextExpenseDate(new Date(rec.lastExpenseDate), rec.frequency, rec.repeatEvery)
        : new Date(rec.startDate);
    }
  }

  applyExpiry(rec);
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

  if (!rec.neverExpires && rec.endsOn && isPastEndDate(new Date(), rec.endsOn)) {
    rec.status = "Expired";
    rec.nextExpenseDate = null;
    attachUser(rec as any, req);
    await rec.save();
    throw new ValidationError("Recurring expense has expired");
  }

  rec.status = "Active";
  if (!rec.nextExpenseDate) {
    const baseDate = rec.lastExpenseDate ? new Date(rec.lastExpenseDate) : new Date(rec.startDate);
    rec.nextExpenseDate = rec.lastExpenseDate
      ? computeNextExpenseDate(baseDate, rec.frequency, rec.repeatEvery)
      : baseDate;
  }

  if (!rec.neverExpires && rec.endsOn && rec.nextExpenseDate && isRunAfterEndDate(new Date(rec.nextExpenseDate), rec.endsOn)) {
    rec.status = "Expired";
    rec.nextExpenseDate = null;
    attachUser(rec as any, req);
    await rec.save();
    throw new ValidationError("Recurring expense has expired");
  }

  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-expenses/:id/create-expense — manually trigger one expense now */
export const createExpenseNow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringExpense.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("expenseAccountId paidThroughAccountId vendorId customerId");
  if (!rec) throw new NotFoundError("Recurring expense");
  if (rec.status !== "Active") throw new ValidationError("Recurring expense is not active");

  const scheduledRunDate = rec.nextExpenseDate ? new Date(rec.nextExpenseDate) : new Date();
  if (!rec.neverExpires && rec.endsOn && isRunAfterEndDate(scheduledRunDate, rec.endsOn)) {
    rec.status = "Expired";
    rec.nextExpenseDate = null;
    attachUser(rec as any, req);
    await rec.save();
    throw new ValidationError("Recurring expense has expired");
  }

  const result = await executeRecurringExpenseRun(rec, scheduledRunDate, req.user?._id);
  if (!result.expense) throw new ValidationError("No expense was created for this run");

  await result.expense.populate("expenseAccountId paidThroughAccountId vendorId customerId");
  await rec.populate("expenseAccountId paidThroughAccountId vendorId customerId");

  res.status(result.skipped ? 200 : 201).json({
    success: true,
    data: result.expense,
    recurringExpense: rec,
    skipped: result.skipped,
  });
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
