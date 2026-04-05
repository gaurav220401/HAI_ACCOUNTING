import { ClientSession, Types } from "mongoose";
import Account from "../models/account.model";
import GlEntry, { GlVoucherType } from "../models/gl-entry.model";
import Organization from "../models/organization.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import { NotFoundError, ValidationError } from "../utils/errors";

export interface PostingLine {
  accountId: Types.ObjectId | string;
  debit?: number;
  credit?: number;
  description?: string;
  contactType?: "Customer" | "Vendor" | "None";
  contactId?: Types.ObjectId | string | null;
}

export interface PostVoucherInput {
  organizationId: Types.ObjectId | string;
  voucherType: GlVoucherType;
  voucherId: string;
  voucherNo: string;
  postingDate: Date;
  lines: PostingLine[];
  description?: string;
  req?: AuthenticatedRequest;
  session?: ClientSession;
  currency?: string;
  exchangeRate?: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
}

function normalizeAmount(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return round2(Math.max(0, n));
}

function normalizeLines(lines: PostingLine[]): PostingLine[] {
  const out: PostingLine[] = [];
  for (const line of lines || []) {
    if (!line?.accountId) continue;
    const debit = normalizeAmount(line.debit);
    const credit = normalizeAmount(line.credit);
    if (debit === 0 && credit === 0) continue;
    if (debit > 0 && credit > 0) {
      throw new ValidationError("A posting line cannot have both debit and credit");
    }
    out.push({ ...line, debit, credit });
  }
  if (out.length === 0) throw new ValidationError("At least one posting line is required");
  return out;
}

function assertBalanced(lines: PostingLine[]) {
  const debit = round2(lines.reduce((sum, line) => sum + normalizeAmount(line.debit), 0));
  const credit = round2(lines.reduce((sum, line) => sum + normalizeAmount(line.credit), 0));
  if (Math.abs(debit - credit) > 0.009) {
    throw new ValidationError(`Voucher is not balanced (debit ${debit} != credit ${credit})`);
  }
}

async function resolveCurrency(
  organizationId: Types.ObjectId,
  session?: ClientSession,
): Promise<string> {
  const query = Organization.findById(organizationId).select("baseCurrency");
  if (session) query.session(session);
  const org = await query;
  return org?.baseCurrency || "INR";
}

export async function findAccountIdByName(params: {
  organizationId: Types.ObjectId | string;
  names: string[];
  rootType?: string;
  accountType?: string;
  session?: ClientSession;
}): Promise<Types.ObjectId> {
  const organizationId = toObjectId(params.organizationId);

  const names = (params.names || []).filter(Boolean);
  if (names.length > 0) {
    const query = Account.findOne({
      organizationId,
      isDeleted: false,
      isGroup: false,
      name: { $in: names },
    }).sort({ name: 1 });
    if (params.session) query.session(params.session);
    const found = await query;
    if (found) return found._id;
  }

  if (params.rootType) {
    const query = Account.findOne({
      organizationId,
      isDeleted: false,
      isGroup: false,
      rootType: params.rootType,
      ...(params.accountType ? { accountType: params.accountType } : {}),
    }).sort({ name: 1 });
    if (params.session) query.session(params.session);
    const fallback = await query;
    if (fallback) return fallback._id;
  }

  throw new NotFoundError(`Account (${names.join("/") || params.rootType || "unknown"})`);
}

export async function postVoucher(input: PostVoucherInput): Promise<{ posted: boolean; entryIds: string[] }> {
  const organizationId = toObjectId(input.organizationId);
  const lines = normalizeLines(input.lines || []);
  assertBalanced(lines);

  const existingQuery = GlEntry.find({
    organizationId,
    voucherType: input.voucherType,
    voucherId: input.voucherId,
    isReversal: false,
  }).select("_id");
  if (input.session) existingQuery.session(input.session);
  const existing = await existingQuery;
  if (existing.length > 0) {
    return { posted: false, entryIds: existing.map((e) => String(e._id)) };
  }

  const currency = input.currency || (await resolveCurrency(organizationId, input.session));
  const exchangeRate = normalizeAmount(input.exchangeRate || 1) || 1;

  const entries = lines.map((line) => {
    const entry = new GlEntry({
      organizationId,
      voucherType: input.voucherType,
      voucherId: input.voucherId,
      voucherNo: input.voucherNo,
      postingDate: input.postingDate,
      accountId: toObjectId(line.accountId),
      debit: normalizeAmount(line.debit),
      credit: normalizeAmount(line.credit),
      contactType: line.contactType || "None",
      contactId: line.contactId ? toObjectId(line.contactId) : null,
      currency,
      exchangeRate,
      description: line.description || input.description || "",
      isReversal: false,
      reversalOf: null,
    });
    if (input.req) attachUser(entry, input.req);
    return entry;
  });

  for (const entry of entries) {
    if (input.session) await entry.save({ session: input.session });
    else await entry.save();
  }

  const accountBalanceDeltas = new Map<string, number>();
  for (const line of lines) {
    const key = String(line.accountId);
    const delta = round2(normalizeAmount(line.debit) - normalizeAmount(line.credit));
    accountBalanceDeltas.set(key, round2((accountBalanceDeltas.get(key) || 0) + delta));
  }

  const bulkOps = Array.from(accountBalanceDeltas.entries()).map(([accountId, delta]) => ({
    updateOne: {
      filter: { _id: accountId, organizationId, isDeleted: false },
      update: { $inc: { balance: delta } },
    },
  }));

  if (bulkOps.length > 0) {
    if (input.session) await Account.bulkWrite(bulkOps, { session: input.session });
    else await Account.bulkWrite(bulkOps);
  }

  return { posted: true, entryIds: entries.map((e) => String(e._id)) };
}

export async function reverseVoucher(params: {
  organizationId: Types.ObjectId | string;
  voucherType: GlVoucherType;
  voucherId: string;
  reversalVoucherNo: string;
  postingDate: Date;
  description?: string;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<{ reversed: boolean; entryIds: string[] }> {
  const organizationId = toObjectId(params.organizationId);

  const originalQuery = GlEntry.find({
    organizationId,
    voucherType: params.voucherType,
    voucherId: params.voucherId,
    isReversal: false,
  });
  if (params.session) originalQuery.session(params.session);
  const originals = await originalQuery;

  if (originals.length === 0) {
    return { reversed: false, entryIds: [] };
  }

  const alreadyQuery = GlEntry.find({
    organizationId,
    isReversal: true,
    reversalOf: { $in: originals.map((o) => o._id) },
  }).select("reversalOf");
  if (params.session) alreadyQuery.session(params.session);
  const already = await alreadyQuery;
  const reversedSet = new Set(already.map((e) => String(e.reversalOf)));

  const entriesToReverse = originals.filter((entry) => !reversedSet.has(String(entry._id)));
  if (entriesToReverse.length === 0) {
    return { reversed: false, entryIds: already.map((e) => String(e._id)) };
  }

  const reversals = entriesToReverse.map((entry) => {
    const rev = new GlEntry({
      organizationId,
      voucherType: params.voucherType,
      voucherId: params.voucherId,
      voucherNo: params.reversalVoucherNo,
      postingDate: params.postingDate,
      accountId: entry.accountId,
      debit: normalizeAmount(entry.credit),
      credit: normalizeAmount(entry.debit),
      contactType: entry.contactType || "None",
      contactId: entry.contactId || null,
      currency: entry.currency,
      exchangeRate: entry.exchangeRate || 1,
      description: params.description || `Reversal of ${entry.voucherNo}`,
      isReversal: true,
      reversalOf: entry._id,
    });
    if (params.req) attachUser(rev, params.req);
    return rev;
  });

  for (const rev of reversals) {
    if (params.session) await rev.save({ session: params.session });
    else await rev.save();
  }

  const accountBalanceDeltas = new Map<string, number>();
  for (const entry of reversals) {
    const key = String(entry.accountId);
    const delta = round2(normalizeAmount(entry.debit) - normalizeAmount(entry.credit));
    accountBalanceDeltas.set(key, round2((accountBalanceDeltas.get(key) || 0) + delta));
  }

  const bulkOps = Array.from(accountBalanceDeltas.entries()).map(([accountId, delta]) => ({
    updateOne: {
      filter: { _id: accountId, organizationId, isDeleted: false },
      update: { $inc: { balance: delta } },
    },
  }));

  if (bulkOps.length > 0) {
    if (params.session) await Account.bulkWrite(bulkOps, { session: params.session });
    else await Account.bulkWrite(bulkOps);
  }

  return { reversed: true, entryIds: reversals.map((e) => String(e._id)) };
}
