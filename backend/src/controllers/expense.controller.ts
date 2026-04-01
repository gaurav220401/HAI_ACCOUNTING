import { Response } from "express";
import Expense from "../models/expense.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
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
  res.status(201).json({ success: true, data: saved });
});

/** PATCH /api/expenses/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const param = String(req.params.id);
  const isExpNum = /^EXP-\d{4,}$/i.test(param);
  const query = isExpNum
    ? { expenseNumber: param.toUpperCase(), organizationId: orgId(req) }
    : { _id: param, organizationId: orgId(req) };

  const expense = await Expense.findOne(query);
  if (!expense) throw new NotFoundError("Expense");

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

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) (expense as any)[f] = req.body[f];
  });

  attachUser(expense as any, req);
  await expense.save();
  res.json({ success: true, data: expense });
});

/** DELETE /api/expenses/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const param = String(req.params.id);
  const isExpNum = /^EXP-\d{4,}$/i.test(param);
  const query = isExpNum
    ? { expenseNumber: param.toUpperCase(), organizationId: orgId(req) }
    : { _id: param, organizationId: orgId(req) };

  const expense = await Expense.findOne(query);
  if (!expense) throw new NotFoundError("Expense");

  expense.isDeleted = true;
  expense.deletedAt = new Date();
  attachUser(expense as any, req);
  await expense.save();
  res.json({ success: true, message: "Expense deleted" });
});
