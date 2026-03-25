import { Response } from "express";
import CurrencyAdjustment from "../models/currency-adjustment.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

/** GET /api/currency-adjustments?status=Open|Reconciled&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, page = 1, limit = 50 } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;

  const total = await CurrencyAdjustment.countDocuments(filter);
  const data = await CurrencyAdjustment.find(filter)
    .sort({ date: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/currency-adjustments/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adj = await CurrencyAdjustment.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!adj) throw new NotFoundError("Currency Adjustment");
  res.json({ success: true, data: adj });
});

/** POST /api/currency-adjustments */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { date, currency, exchangeRate, notes, lines } = req.body;
  if (!date) throw new ValidationError("date is required");
  if (!currency) throw new ValidationError("currency is required");
  if (exchangeRate == null) throw new ValidationError("exchangeRate is required");

  const adj = new CurrencyAdjustment({
    organizationId: orgId(req),
    date,
    currency,
    exchangeRate,
    notes: notes ?? "",
    lines: lines ?? [],
    status: "Open",
  });
  attachUser(adj as any, req);
  await adj.save();
  res.status(201).json({ success: true, data: adj });
});

/** PATCH /api/currency-adjustments/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adj = await CurrencyAdjustment.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!adj) throw new NotFoundError("Currency Adjustment");

  const allowed = ["date", "currency", "exchangeRate", "notes", "lines", "status"];
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) (adj as any)[f] = req.body[f];
  });

  attachUser(adj as any, req);
  await adj.save();
  res.json({ success: true, data: adj });
});

/** DELETE /api/currency-adjustments/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const adj = await CurrencyAdjustment.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
  });
  if (!adj) throw new NotFoundError("Currency Adjustment");

  adj.isDeleted = true;
  adj.deletedAt = new Date();
  attachUser(adj as any, req);
  await adj.save();
  res.json({ success: true, message: "Currency adjustment deleted" });
});
