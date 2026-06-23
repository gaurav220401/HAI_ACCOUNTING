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
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import Account from "../models/account.model";
import Contact from "../models/contact.model";
import { ensureDefaultChartOfAccounts } from "../services/chart-of-accounts.service";

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

// ─── Import Wizard ─────────────────────────────────────────────────────────

function parseJournalDate(val: any): Date {
  if (val instanceof Date) return val;
  if (!val) return new Date();
  
  const str = String(val).trim();
  if (!str) return new Date();

  // Excel serial number
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (num > 25569) {
      return new Date(Math.round((num - 25569) * 86400 * 1000));
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    return new Date(year, month, day);
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return new Date();
}

function getJournalTemplatePath(fileName: string): string {
  const paths = [
    path.join(process.cwd(), "src", "files", "manual_journals", fileName),
    path.join(process.cwd(), "files", "manual_journals", fileName),
    path.join(__dirname, "..", "files", "manual_journals", fileName),
    path.join(__dirname, "..", "..", "src", "files", "manual_journals", fileName),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Template file ${fileName} not found`);
}

async function mapRowsToJournals(
  rows: any[],
  mapping: Record<string, string>,
  organizationId: any,
  duplicateHandling: "skip" | "overwrite",
  caches: {
    accounts: Map<string, Types.ObjectId | null>;
    vendors: Map<string, Types.ObjectId | null>;
  }
): Promise<{
  journals: any[];
  errors: any[];
}> {
  const getVal = (row: any, key: string) => {
    const col = mapping[key];
    if (!col) return "";
    return String(row[col] ?? "").trim();
  };

  const groupsMap = new Map<string, Array<{ row: any; idx: number }>>();
  
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const journalNumber = getVal(row, "journalNumber");
    const referenceNumber = getVal(row, "referenceNumber");
    const date = getVal(row, "date");
    const description = getVal(row, "description");

    const groupKey = journalNumber || referenceNumber || `${date}-${description}`;
    if (!groupKey) continue; // Skip empty rows

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, []);
    }
    groupsMap.get(groupKey)!.push({ row, idx });
  }

  const journals: any[] = [];
  const errors: any[] = [];

  for (const [key, groupRows] of Array.from(groupsMap.entries())) {
    const firstRowNum = groupRows[0].idx + 2;
    const firstRow = groupRows[0].row;
    
    const journalNumber = getVal(firstRow, "journalNumber");
    const description = getVal(firstRow, "description");
    const referenceNumber = getVal(firstRow, "referenceNumber");

    try {
      const dateStr = getVal(firstRow, "date");
      const date = parseJournalDate(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid journal date: "${dateStr}"`);
      }
      const notes = getVal(firstRow, "notes");
      const statusInput = getVal(firstRow, "status").toLowerCase();
      const status = statusInput.includes("post") ? "Posted" : "Draft";

      const vendorInput = getVal(firstRow, "vendorName");
      let vendorId: Types.ObjectId | null = null;
      if (vendorInput) {
        const cacheKey = vendorInput.toLowerCase();
        if (caches.vendors.has(cacheKey)) {
          vendorId = caches.vendors.get(cacheKey)!;
        } else {
          const vendor = await Contact.findOne({
            organizationId,
            isDeleted: false,
            $or: [
              { displayName: { $regex: new RegExp("^" + escapeRegex(vendorInput) + "$", "i") } },
              { companyName: { $regex: new RegExp("^" + escapeRegex(vendorInput) + "$", "i") } },
            ],
          });
          vendorId = vendor ? (vendor._id as Types.ObjectId) : null;
          caches.vendors.set(cacheKey, vendorId);
        }
      }

      // Check duplicates
      let duplicateJournal: any = null;
      if (journalNumber) {
        duplicateJournal = await Journal.findOne({
          organizationId,
          journalNumber: { $regex: new RegExp("^" + escapeRegex(journalNumber) + "$", "i") },
          isDeleted: false,
        });
      }

      let statusFlag: "Ready" | "Overwrite" | "Skip" | "Error" = "Ready";
      if (duplicateJournal) {
        statusFlag = duplicateHandling === "overwrite" ? "Overwrite" : "Skip";
      }

      // Process line items
      const lineItems: any[] = [];
      let totalDebit = 0;
      let totalCredit = 0;

      for (const { row, idx } of groupRows) {
        const rowNum = idx + 2;
        const accountInput = getVal(row, "accountName");
        if (!accountInput) {
          throw new Error(`Row ${rowNum}: Account Name is required`);
        }

        let accountId: Types.ObjectId | null = null;
        const cacheKey = accountInput.toLowerCase();
        if (caches.accounts.has(cacheKey)) {
          accountId = caches.accounts.get(cacheKey)!;
        } else {
          let acc = await Account.findOne({
            organizationId,
            isDeleted: false,
            $or: [
              { name: { $regex: new RegExp("^" + escapeRegex(accountInput) + "$", "i") } },
              { code: accountInput },
              { accountNumber: accountInput },
            ],
          });
          if (!acc) {
            // Fallback 1: starts-with (case-insensitive)
            acc = await Account.findOne({
              organizationId,
              isDeleted: false,
              name: { $regex: new RegExp("^" + escapeRegex(accountInput), "i") },
            });
          }
          if (!acc) {
            // Fallback 2: contains (case-insensitive)
            acc = await Account.findOne({
              organizationId,
              isDeleted: false,
              name: { $regex: new RegExp(escapeRegex(accountInput), "i") },
            });
          }
          if (!acc) {
            // Fallback 3: reverse prefix match (input starts with the account name, or vice-versa)
            const allAccounts = await Account.find({ organizationId, isDeleted: false }).select("name");
            const matched = allAccounts.find(a => {
              const lowerInput = accountInput.toLowerCase();
              const lowerName = a.name.toLowerCase();
              return lowerInput.startsWith(lowerName) || lowerName.startsWith(lowerInput);
            });
            if (matched) {
              acc = await Account.findById(matched._id);
            }
          }
          accountId = acc ? (acc._id as Types.ObjectId) : null;
          caches.accounts.set(cacheKey, accountId);
        }

        if (!accountId) {
          throw new Error(`Row ${rowNum}: Account not found: "${accountInput}"`);
        }

        const debit = round2(toFiniteNumber(getVal(row, "debit")));
        const credit = round2(toFiniteNumber(getVal(row, "credit")));
        const narration = getVal(row, "narration");

        if (debit < 0 || credit < 0) {
          throw new Error(`Row ${rowNum}: Debit and credit must be positive numbers`);
        }
        if (debit === 0 && credit === 0) {
          throw new Error(`Row ${rowNum}: Both debit and credit cannot be zero`);
        }
        if (debit > 0 && credit > 0) {
          throw new Error(`Row ${rowNum}: A single line cannot contain both debit and credit values`);
        }

        lineItems.push({
          accountId,
          accountName: accountInput, // stored for UI reference
          debit,
          credit,
          narration,
        });

        totalDebit = round2(totalDebit + debit);
        totalCredit = round2(totalCredit + credit);
      }

      if (lineItems.length < 2) {
        throw new Error("Journal entry must contain at least 2 lines");
      }

      if (Math.abs(totalDebit - totalCredit) > 0.0001) {
        throw new Error(`Debits and credits are not balanced (total debit: ₹${totalDebit.toFixed(2)}, total credit: ₹${totalCredit.toFixed(2)})`);
      }

      journals.push({
        rowNumber: firstRowNum,
        journalNumber,
        date,
        referenceNumber,
        description,
        notes,
        status,
        vendorId,
        lineItems,
        totalDebit,
        totalCredit,
        isValid: true,
        statusFlag,
        duplicateJournal,
      });
    } catch (err: any) {
      errors.push({
        rowNumber: firstRowNum,
        journalNumber,
        referenceNumber,
        description,
        error: err.message || "Validation failed",
      });
    }
  }

  return { journals, errors };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toFiniteNumber(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const downloadSampleTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const filePath = getJournalTemplatePath("sample_journals.csv");

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=sample_journals.xlsx");
    res.send(buffer);
  } else {
    res.download(filePath, "sample_journals.csv");
  }
});

export const downloadBlankTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const filePath = getJournalTemplatePath("blank_journals.csv");

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=blank_journals.xlsx");
    res.send(buffer);
  } else {
    res.download(filePath, "blank_journals.csv");
  }
});

export const previewImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  // Seed missing default accounts if any (idempotent)
  await ensureDefaultChartOfAccounts({
    organizationId: toOrgObjectId(organizationId),
    actor: req,
  });

  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const caches = {
    accounts: new Map<string, Types.ObjectId | null>(),
    vendors: new Map<string, Types.ObjectId | null>(),
  };

  const { journals, errors } = await mapRowsToJournals(rows, mapping, organizationId, duplicateHandling, caches);

  const previewItems: any[] = [];
  let readyCount = 0;
  let overwriteCount = 0;
  let skipCount = 0;
  let invalidCount = errors.length;

  for (const j of journals) {
    if (j.statusFlag === "Ready") readyCount++;
    else if (j.statusFlag === "Overwrite") overwriteCount++;
    else if (j.statusFlag === "Skip") skipCount++;

    previewItems.push({
      rowNumber: j.rowNumber,
      journalNumber: j.journalNumber,
      date: j.date,
      referenceNumber: j.referenceNumber,
      description: j.description,
      notes: j.notes,
      status: j.status,
      totalDebit: j.totalDebit,
      totalCredit: j.totalCredit,
      lineItems: j.lineItems,
      isValid: true,
      statusFlag: j.statusFlag,
    });
  }

  for (const err of errors) {
    previewItems.push({
      rowNumber: err.rowNumber,
      journalNumber: err.journalNumber || "",
      date: new Date(),
      referenceNumber: err.referenceNumber || "",
      description: err.description || "",
      notes: "",
      status: "Draft",
      totalDebit: 0,
      totalCredit: 0,
      lineItems: [],
      isValid: false,
      statusFlag: "Error",
      error: err.error,
    });
  }

  // Sort by rowNumber to show errors and ready items in sheet order
  previewItems.sort((a, b) => a.rowNumber - b.rowNumber);

  res.json({
    success: true,
    data: {
      totalRows: rows.length,
      readyCount,
      overwriteCount,
      skipCount,
      invalidCount,
      previewItems,
    },
  });
});

export const executeImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  // Seed missing default accounts if any (idempotent)
  await ensureDefaultChartOfAccounts({
    organizationId: toOrgObjectId(organizationId),
    actor: req,
  });

  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const caches = {
    accounts: new Map<string, Types.ObjectId | null>(),
    vendors: new Map<string, Types.ObjectId | null>(),
  };

  const { journals, errors } = await mapRowsToJournals(rows, mapping, organizationId, duplicateHandling, caches);

  let successCount = 0;
  let failCount = errors.length;
  const errorList: Array<{ row: number; error: string }> = errors.map(e => ({
    row: e.rowNumber,
    error: e.error,
  }));

  for (const j of journals) {
    try {
      if (j.statusFlag === "Skip") {
        successCount++;
        continue;
      }

      if (j.statusFlag === "Overwrite") {
        const doc = j.duplicateJournal;
        if (doc.status === "Posted") {
          await reverseJournalLedger(doc, req);
        }

        doc.date = j.date;
        doc.referenceNumber = j.referenceNumber;
        doc.description = j.description;
        doc.notes = j.notes;
        doc.status = j.status;
        doc.vendorId = j.vendorId;
        doc.lineItems = j.lineItems.map((l: any) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          narration: l.narration,
        }));
        doc.totalDebit = j.totalDebit;
        doc.totalCredit = j.totalCredit;

        attachUser(doc as any, req);
        await doc.save();

        if (doc.status === "Posted") {
          await postJournalLedger(doc, req);
        }
      } else {
        // Create new journal
        let resolvedJournalNumber = j.journalNumber;
        if (!resolvedJournalNumber) {
          const prefs = await ensureJournalNumberingPreferences(toOrgObjectId(organizationId));
          resolvedJournalNumber = await allocateAutoJournalNumber(toOrgObjectId(organizationId));
        }

        const doc = new Journal({
          organizationId,
          journalNumber: resolvedJournalNumber,
          date: j.date,
          referenceNumber: j.referenceNumber,
          description: j.description,
          notes: j.notes,
          status: j.status,
          vendorId: j.vendorId,
          lineItems: j.lineItems.map((l: any) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            narration: l.narration,
          })),
          totalDebit: j.totalDebit,
          totalCredit: j.totalCredit,
        });

        attachUser(doc as any, req);
        await doc.save();

        if (doc.status === "Posted") {
          await postJournalLedger(doc, req);
        }
      }

      successCount++;
    } catch (err: any) {
      failCount++;
      errorList.push({
        row: j.rowNumber,
        error: err.message || "Failed to import journal",
      });
    }
  }

  res.json({
    success: true,
    data: {
      successCount,
      failCount,
      errors: errorList.sort((a, b) => a.row - b.row),
    },
  });
});
