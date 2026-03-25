import { Response } from "express";
import Journal from "../models/journal.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { attachUser } from "../plugins";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function normalizeLineItems(lineItems: any[]) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ValidationError("lineItems is required");
  }

  const normalized = lineItems.map((l) => ({
    accountId: l.accountId,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    narration: String(l.narration || ""),
  }));

  const hasInvalid = normalized.some(
    (l) => !l.accountId || l.debit < 0 || l.credit < 0 || (l.debit === 0 && l.credit === 0),
  );
  if (hasInvalid) {
    throw new ValidationError("Each line item needs accountId and non-zero debit or credit");
  }

  const totalDebit = normalized.reduce((s, l) => s + l.debit, 0);
  const totalCredit = normalized.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new ValidationError("Journal must be balanced (total debit equals total credit)");
  }

  return { normalized, totalDebit, totalCredit };
}

/** GET /api/journals */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, vendorId, dateStart, dateEnd, page = 1, limit = 25 } = req.query;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status) filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  if (search) {
    filter.$or = [
      { journalNumber: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { referenceNumber: { $regex: search, $options: "i" } },
    ];
  }
  if (dateStart || dateEnd) {
    filter.date = {};
    if (dateStart) filter.date.$gte = new Date(String(dateStart));
    if (dateEnd) filter.date.$lte = new Date(String(dateEnd));
  }

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(200, Number(limit || 25)));

  const total = await Journal.countDocuments(filter);
  const data = await Journal.find(filter)
    .populate("vendorId", "displayName companyName")
    .populate("lineItems.accountId", "name accountType")
    .sort({ date: -1, createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/** GET /api/journals/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const journal = await Journal.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email")
    .populate("lineItems.accountId", "name accountType");

  if (!journal) throw new NotFoundError("Journal");
  res.json({ success: true, data: journal });
});

/** POST /api/journals */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { normalized, totalDebit, totalCredit } = normalizeLineItems(req.body.lineItems);

  const journal = new Journal({
    organizationId: orgId(req),
    date: req.body.date ? new Date(req.body.date) : new Date(),
    vendorId: req.body.vendorId || null,
    description: String(req.body.description || ""),
    referenceNumber: String(req.body.referenceNumber || ""),
    lineItems: normalized,
    totalDebit,
    totalCredit,
    status: req.body.status || "Draft",
    notes: String(req.body.notes || ""),
  });

  attachUser(journal as any, req);
  await journal.save();
  await journal.populate("vendorId", "displayName companyName");
  await journal.populate("lineItems.accountId", "name accountType");

  res.status(201).json({ success: true, data: journal });
});

/** PATCH /api/journals/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const journal = await Journal.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!journal) throw new NotFoundError("Journal");

  if (journal.status === "Voided") {
    throw new ValidationError("Cannot update a voided journal");
  }

  if (req.body.lineItems !== undefined) {
    const { normalized, totalDebit, totalCredit } = normalizeLineItems(req.body.lineItems);
    journal.lineItems = normalized as any;
    journal.totalDebit = totalDebit;
    journal.totalCredit = totalCredit;
  }

  if (req.body.date !== undefined) journal.date = new Date(req.body.date);
  if (req.body.vendorId !== undefined) journal.vendorId = req.body.vendorId || null;
  if (req.body.description !== undefined) journal.description = String(req.body.description || "");
  if (req.body.referenceNumber !== undefined) journal.referenceNumber = String(req.body.referenceNumber || "");
  if (req.body.notes !== undefined) journal.notes = String(req.body.notes || "");
  if (req.body.status !== undefined) journal.status = req.body.status;

  attachUser(journal as any, req);
  await journal.save();
  await journal.populate("vendorId", "displayName companyName");
  await journal.populate("lineItems.accountId", "name accountType");

  res.json({ success: true, data: journal });
});

/** POST /api/journals/:id/post */
export const postJournal = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const journal = await Journal.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!journal) throw new NotFoundError("Journal");
  if (journal.status === "Voided") throw new ValidationError("Voided journal cannot be posted");
  journal.status = "Posted";
  attachUser(journal as any, req);
  await journal.save();
  res.json({ success: true, data: journal });
});

/** POST /api/journals/:id/void */
export const voidJournal = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const journal = await Journal.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!journal) throw new NotFoundError("Journal");
  journal.status = "Voided";
  attachUser(journal as any, req);
  await journal.save();
  res.json({ success: true, data: journal });
});

/** DELETE /api/journals/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const journal = await Journal.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!journal) throw new NotFoundError("Journal");

  journal.isDeleted = true;
  journal.deletedAt = new Date();
  attachUser(journal as any, req);
  await journal.save();

  res.json({ success: true, message: "Journal deleted" });
});
