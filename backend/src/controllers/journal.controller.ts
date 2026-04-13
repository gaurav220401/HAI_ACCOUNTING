import { Response } from "express";
import { Types } from "mongoose";
import Journal from "../models/journal.model";
import JournalNumberingPreference from "../models/journal-numbering-preference.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { attachUser } from "../plugins";
import { postVoucher, reverseVoucher } from "../services/gl-posting.service";

const JOURNAL_NUMBER_DEFAULT_PREFIX = "JRN-";
const JOURNAL_NUMBER_DEFAULT_NEXT = 1;

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
    (l) =>
      !l.accountId ||
      l.debit < 0 ||
      l.credit < 0 ||
      (l.debit === 0 && l.credit === 0),
  );
  if (hasInvalid) {
    throw new ValidationError(
      "Each line item needs accountId and non-zero debit or credit",
    );
  }

  const totalDebit = normalized.reduce((s, l) => s + l.debit, 0);
  const totalCredit = normalized.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new ValidationError(
      "Journal must be balanced (total debit equals total credit)",
    );
  }

  return { normalized, totalDebit, totalCredit };
}

function journalVoucherId(journal: any): string {
  return `journal:${String(journal._id)}`;
}

function normalizeJournalNumber(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) {
    throw new ValidationError("journalNumber cannot be empty");
  }
  return trimmed;
}

function toOrgObjectId(value: unknown): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
}

function hasJournalFinancialEdits(payload: Record<string, unknown>): boolean {
  const keys = [
    "lineItems",
    "date",
    "vendorId",
    "referenceNumber",
    "description",
    "journalNumber",
  ];
  return keys.some((key) => payload[key] !== undefined);
}

function normalizeNumberingMode(value: unknown): "auto" | "manual" | undefined {
  if (value === undefined || value === null) return undefined;
  const mode = String(value).trim().toLowerCase();
  if (!mode) return undefined;
  if (mode !== "auto" && mode !== "manual") {
    throw new ValidationError("mode must be either auto or manual");
  }
  return mode;
}

function normalizePrefix(value: unknown): string {
  const prefix = String(value ?? JOURNAL_NUMBER_DEFAULT_PREFIX).trim();
  if (!prefix) throw new ValidationError("prefix is required");
  return prefix;
}

function normalizeNextNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError(
      "nextNumber must be a number greater than or equal to 1",
    );
  }
  return Math.trunc(parsed);
}

function formatJournalNumber(prefix: string, nextNumber: number): string {
  const safePrefix = String(prefix || JOURNAL_NUMBER_DEFAULT_PREFIX);
  const safeNext = Math.max(
    1,
    Math.trunc(nextNumber || JOURNAL_NUMBER_DEFAULT_NEXT),
  );
  return `${safePrefix}${String(safeNext).padStart(4, "0")}`;
}

async function ensureJournalNumberingPreferences(
  organizationId: Types.ObjectId,
) {
  let prefs = await JournalNumberingPreference.findOne({
    organizationId,
  } as any);
  if (!prefs) {
    prefs = await JournalNumberingPreference.create({
      organizationId,
      mode: "auto",
      prefix: JOURNAL_NUMBER_DEFAULT_PREFIX,
      nextNumber: JOURNAL_NUMBER_DEFAULT_NEXT,
    });
  }
  return prefs;
}

async function allocateAutoJournalNumber(
  organizationId: Types.ObjectId,
): Promise<string> {
  // Ensure preference exists first, then atomically increment while reading the previous value.
  const prefs = await ensureJournalNumberingPreferences(organizationId);

  const previous = await JournalNumberingPreference.findOneAndUpdate(
    { _id: prefs._id },
    { $inc: { nextNumber: 1 } },
    { new: false },
  );

  const allocatedValue = Math.max(
    1,
    Number(
      previous?.nextNumber ?? prefs.nextNumber ?? JOURNAL_NUMBER_DEFAULT_NEXT,
    ),
  );
  const prefix = String(
    previous?.prefix || prefs.prefix || JOURNAL_NUMBER_DEFAULT_PREFIX,
  );
  return formatJournalNumber(prefix, allocatedValue);
}

async function postJournalLedger(journal: any, req: AuthenticatedRequest) {
  if (journal.status !== "Posted") return;

  const lines = (journal.lineItems || []).map((line: any) => ({
    accountId: line.accountId,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    description:
      line.narration ||
      journal.description ||
      `Journal ${journal.journalNumber}`,
  }));

  await postVoucher({
    organizationId: journal.organizationId,
    voucherType: "Journal",
    voucherId: journalVoucherId(journal),
    voucherNo: String(journal.journalNumber || journal._id),
    postingDate: journal.date ? new Date(journal.date) : new Date(),
    lines,
    description:
      journal.description || `Journal posting ${journal.journalNumber}`,
    req,
  });
}

async function reverseJournalLedger(journal: any, req: AuthenticatedRequest) {
  await reverseVoucher({
    organizationId: journal.organizationId,
    voucherType: "Journal",
    voucherId: journalVoucherId(journal),
    reversalVoucherNo: `REV-${String(journal.journalNumber || journal._id)}`,
    postingDate: new Date(),
    description: `Journal reversal ${journal.journalNumber || journal._id}`,
    req,
  });
}

/** GET /api/journals/numbering-preferences */
export const getNumberingPreferences = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = toOrgObjectId(orgId(req));
    const prefs = await ensureJournalNumberingPreferences(organizationId);

    res.json({
      success: true,
      data: {
        mode: prefs.mode,
        prefix: prefs.prefix,
        nextNumber: prefs.nextNumber,
        previewJournalNumber: formatJournalNumber(
          prefs.prefix,
          prefs.nextNumber,
        ),
      },
    });
  },
);

/** PUT /api/journals/numbering-preferences */
export const updateNumberingPreferences = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = toOrgObjectId(orgId(req));

    const prefs = await ensureJournalNumberingPreferences(organizationId);

    const mode = normalizeNumberingMode(req.body.mode);
    const prefix =
      req.body.prefix !== undefined ?
        normalizePrefix(req.body.prefix)
      : undefined;
    const nextNumber =
      req.body.nextNumber !== undefined ?
        normalizeNextNumber(req.body.nextNumber)
      : undefined;

    if (mode !== undefined) prefs.mode = mode;
    if (prefix !== undefined) prefs.prefix = prefix;
    if (nextNumber !== undefined) prefs.nextNumber = nextNumber;

    await prefs.save();

    res.json({
      success: true,
      data: {
        mode: prefs.mode,
        prefix: prefs.prefix,
        nextNumber: prefs.nextNumber,
        previewJournalNumber: formatJournalNumber(
          prefs.prefix,
          prefs.nextNumber,
        ),
      },
    });
  },
);

/** GET /api/journals */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      vendorId,
      dateStart,
      dateEnd,
      page = 1,
      limit = 25,
    } = req.query;

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
  },
);

/** GET /api/journals/:id */
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    })
      .populate("vendorId", "displayName companyName email")
      .populate("lineItems.accountId", "name accountType");

    if (!journal) throw new NotFoundError("Journal");
    res.json({ success: true, data: journal });
  },
);

/** POST /api/journals */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { normalized, totalDebit, totalCredit } = normalizeLineItems(
      req.body.lineItems,
    );
    const organizationId = toOrgObjectId(orgId(req));

    const customJournalNumber = normalizeJournalNumber(req.body.journalNumber);
    let resolvedJournalNumber = customJournalNumber;

    if (!resolvedJournalNumber) {
      const prefs = await ensureJournalNumberingPreferences(organizationId);
      if (prefs.mode === "manual") {
        throw new ValidationError(
          "Journal# is required because manual numbering is enabled",
        );
      }
      resolvedJournalNumber = await allocateAutoJournalNumber(organizationId);
    }

    const journal = new Journal({
      organizationId,
      journalNumber: resolvedJournalNumber,
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

    if (journal.status === "Posted") {
      await postJournalLedger(journal, req);
    }

    await journal.populate("vendorId", "displayName companyName");
    await journal.populate("lineItems.accountId", "name accountType");

    res.status(201).json({ success: true, data: journal });
  },
);

/** PATCH /api/journals/:id */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });
    if (!journal) throw new NotFoundError("Journal");

    if (journal.status === "Voided") {
      throw new ValidationError("Cannot update a voided journal");
    }

    const previousStatus = journal.status;
    if (
      previousStatus === "Posted" &&
      hasJournalFinancialEdits(req.body || {})
    ) {
      throw new ValidationError(
        "Cannot edit financial fields after journal is posted. Void and recreate for accounting integrity.",
      );
    }

    if (req.body.lineItems !== undefined) {
      const { normalized, totalDebit, totalCredit } = normalizeLineItems(
        req.body.lineItems,
      );
      journal.lineItems = normalized as any;
      journal.totalDebit = totalDebit;
      journal.totalCredit = totalCredit;
    }

    if (req.body.date !== undefined) journal.date = new Date(req.body.date);
    if (req.body.journalNumber !== undefined) {
      const nextJournalNumber = normalizeJournalNumber(req.body.journalNumber);
      if (!nextJournalNumber) {
        throw new ValidationError("journalNumber cannot be empty");
      }
      journal.journalNumber = nextJournalNumber;
    }
    if (req.body.vendorId !== undefined)
      journal.vendorId = req.body.vendorId || null;
    if (req.body.description !== undefined)
      journal.description = String(req.body.description || "");
    if (req.body.referenceNumber !== undefined)
      journal.referenceNumber = String(req.body.referenceNumber || "");
    if (req.body.notes !== undefined)
      journal.notes = String(req.body.notes || "");
    if (req.body.status !== undefined) journal.status = req.body.status;

    attachUser(journal as any, req);
    await journal.save();

    if (previousStatus !== "Posted" && journal.status === "Posted") {
      await postJournalLedger(journal, req);
    } else if (previousStatus === "Posted" && journal.status !== "Posted") {
      await reverseJournalLedger(journal, req);
    }

    await journal.populate("vendorId", "displayName companyName");
    await journal.populate("lineItems.accountId", "name accountType");

    res.json({ success: true, data: journal });
  },
);

/** POST /api/journals/:id/post */
export const postJournal = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });
    if (!journal) throw new NotFoundError("Journal");
    if (journal.status === "Voided")
      throw new ValidationError("Voided journal cannot be posted");

    if (journal.status === "Posted") {
      res.json({ success: true, data: journal });
      return;
    }

    journal.status = "Posted";
    attachUser(journal as any, req);
    await journal.save();
    await postJournalLedger(journal, req);
    res.json({ success: true, data: journal });
  },
);

/** POST /api/journals/:id/void */
export const voidJournal = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });
    if (!journal) throw new NotFoundError("Journal");

    const wasPosted = journal.status === "Posted";
    journal.status = "Voided";
    attachUser(journal as any, req);
    await journal.save();

    if (wasPosted) {
      await reverseJournalLedger(journal, req);
    }

    res.json({ success: true, data: journal });
  },
);

/** DELETE /api/journals/:id */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const journal = await Journal.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });
    if (!journal) throw new NotFoundError("Journal");

    const wasPosted = journal.status === "Posted";

    journal.isDeleted = true;
    journal.deletedAt = new Date();
    attachUser(journal as any, req);
    await journal.save();

    if (wasPosted) {
      await reverseJournalLedger(journal, req);
    }

    res.json({ success: true, message: "Journal deleted" });
  },
);
