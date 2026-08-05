import crypto from "crypto";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Journal from "../models/journal.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import { ValidationError } from "../utils/errors";
import { postVoucher } from "./gl-posting.service";

/**
 * Posting engine for bank statement imports.
 *
 * Each statement line becomes one balanced two-line journal:
 *
 *   money in  (statement credit) → Dr Bank        Cr contra account
 *   money out (statement debit)  → Dr contra      Cr Bank
 *
 * The contra account is chosen by the user during review. Anything left
 * unclassified falls back to a suspense account (see resolveSuspenseAccount)
 * so the line still reaches the ledger and stays visible for an accountant to
 * reclassify, rather than silently landing in a real expense head.
 */

export const BANK_SUSPENSE_ACCOUNT_NAME = "Documents Clearing";

/** Account types that can legitimately be the "bank side" of a statement. */
const BANK_SIDE_ACCOUNT_TYPES = ["Bank", "Credit Card"];

export interface StatementLineInput {
  /** Subdocument _id of the transaction on the document. */
  transactionId: string;
  txnDate?: Date | null;
  description?: string;
  debit?: number;
  credit?: number;
  /** Contra account chosen during review. Falls back to suspense when absent. */
  accountId?: string | null;
}

export interface PostedStatementLine {
  transactionId: string;
  journalId: Types.ObjectId;
  journalNumber: string;
  accountId: Types.ObjectId;
  amount: number;
  direction: "in" | "out";
}

export interface SkippedStatementLine {
  transactionId: string;
  reason: "duplicate" | "zero_amount" | "invalid_account";
  message: string;
}

export interface PostStatementResult {
  posted: PostedStatementLine[];
  skipped: SkippedStatementLine[];
}

function round2(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Collapses casing, whitespace and punctuation so the same transaction described
 * slightly differently across two statement exports still hashes identically.
 */
function normalizeDescription(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dateKey(value?: Date | null): string {
  if (!value) return "nodate";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "nodate";
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic identity for a statement line. Two imports of the same
 * underlying bank transaction produce the same key regardless of which file,
 * document or upload they arrived on.
 */
export function buildBankImportKey(params: {
  organizationId: Types.ObjectId | string;
  bankAccountId: Types.ObjectId | string;
  txnDate?: Date | null;
  debit?: number;
  credit?: number;
  description?: string;
}): string {
  const parts = [
    String(params.organizationId),
    String(params.bankAccountId),
    dateKey(params.txnDate),
    round2(Number(params.debit || 0)).toFixed(2),
    round2(Number(params.credit || 0)).toFixed(2),
    normalizeDescription(params.description),
  ].join("|");

  return crypto.createHash("sha1").update(parts).digest("hex");
}

/**
 * Validates that the caller-supplied bank account really is a bank-side account
 * belonging to this org. Prevents a statement being posted against an arbitrary
 * account, and replaces the previous behaviour of grabbing whichever Bank
 * account happened to be returned first.
 */
export async function resolveBankAccount(params: {
  organizationId: Types.ObjectId;
  bankAccountId: string;
}) {
  if (!params.bankAccountId || !Types.ObjectId.isValid(params.bankAccountId)) {
    throw new ValidationError("A valid bankAccountId is required");
  }

  const account = await Account.findOne({
    _id: params.bankAccountId,
    organizationId: params.organizationId,
    isDeleted: false,
    isGroup: false,
  });

  if (!account) {
    throw new ValidationError("Selected bank account was not found in this organization");
  }
  if (!BANK_SIDE_ACCOUNT_TYPES.includes(String(account.accountType))) {
    throw new ValidationError(
      `Account "${account.name}" is not a Bank or Credit Card account and cannot receive a statement import`,
    );
  }

  return account;
}

/**
 * Suspense account for lines the user did not classify. Created on demand so a
 * fresh org can import immediately without chart-of-accounts setup.
 */
export async function resolveSuspenseAccount(organizationId: Types.ObjectId) {
  let account = await Account.findOne({
    organizationId,
    isDeleted: false,
    name: BANK_SUSPENSE_ACCOUNT_NAME,
  });

  if (!account) {
    account = new Account({
      organizationId,
      name: BANK_SUSPENSE_ACCOUNT_NAME,
      rootType: "Expense",
      accountType: "Expense",
      isGroup: false,
      currency: "INR",
      description:
        "Holding account for imported bank transactions that have not been categorised yet.",
    });
    await account.save();
  }

  return account;
}

/** Loads and validates every contra account referenced by the batch in one query. */
async function loadContraAccounts(
  organizationId: Types.ObjectId,
  lines: StatementLineInput[],
): Promise<Map<string, Types.ObjectId>> {
  const ids = Array.from(
    new Set(
      lines
        .map((line) => String(line.accountId || ""))
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  );

  if (ids.length === 0) return new Map();

  const accounts = await Account.find({
    _id: { $in: ids },
    organizationId,
    isDeleted: false,
    isGroup: false,
  }).select("_id");

  return new Map(accounts.map((a) => [String(a._id), a._id as Types.ObjectId]));
}

/**
 * Posts the selected statement lines.
 *
 * Every created journal is written to the general ledger via postVoucher using
 * the same voucherType/voucherId convention as journal.controller, so imported
 * entries behave identically to hand-keyed ones (they appear in trial balance,
 * P&L and balance sheet, and can be voided/reversed from the journals screen).
 */
export async function postStatementLines(params: {
  organizationId: Types.ObjectId;
  bankAccountId: Types.ObjectId;
  lines: StatementLineInput[];
  sourceLabel: string;
  req: AuthenticatedRequest;
}): Promise<PostStatementResult> {
  const { organizationId, bankAccountId, lines, sourceLabel, req } = params;

  const suspense = await resolveSuspenseAccount(organizationId);
  const contraAccounts = await loadContraAccounts(organizationId, lines);

  const posted: PostedStatementLine[] = [];
  const skipped: SkippedStatementLine[] = [];

  for (const line of lines) {
    const debit = round2(Number(line.debit || 0));
    const credit = round2(Number(line.credit || 0));
    const amount = credit > 0 ? credit : debit;

    if (!amount || amount <= 0) {
      skipped.push({
        transactionId: line.transactionId,
        reason: "zero_amount",
        message: "Transaction has no amount",
      });
      continue;
    }

    let contraId: Types.ObjectId;
    if (line.accountId) {
      const resolved = contraAccounts.get(String(line.accountId));
      if (!resolved) {
        skipped.push({
          transactionId: line.transactionId,
          reason: "invalid_account",
          message: "Selected category account was not found",
        });
        continue;
      }
      contraId = resolved;
    } else {
      contraId = suspense._id as Types.ObjectId;
    }

    const bankImportKey = buildBankImportKey({
      organizationId,
      bankAccountId,
      txnDate: line.txnDate,
      debit,
      credit,
      description: line.description,
    });

    // Cheap pre-check so the common case reports cleanly; the partial unique
    // index below is what actually guarantees it under concurrency.
    const existing = await Journal.findOne({
      organizationId,
      bankImportKey,
    }).select("_id");

    if (existing) {
      skipped.push({
        transactionId: line.transactionId,
        reason: "duplicate",
        message: "This transaction was already imported",
      });
      continue;
    }

    const isMoneyIn = credit > 0;
    const narration = String(line.description || "").slice(0, 500);

    const lineItems = isMoneyIn
      ? [
          { accountId: bankAccountId, debit: amount, credit: 0, narration },
          { accountId: contraId, debit: 0, credit: amount, narration },
        ]
      : [
          { accountId: contraId, debit: amount, credit: 0, narration },
          { accountId: bankAccountId, debit: 0, credit: amount, narration },
        ];

    const journal = new Journal({
      organizationId,
      date: line.txnDate || new Date(),
      description: narration,
      referenceNumber: sourceLabel,
      lineItems,
      totalDebit: amount,
      totalCredit: amount,
      status: "Posted",
      bankImportKey,
      notes: `Imported from bank statement: ${sourceLabel}`,
    });
    attachUser(journal as unknown as { $locals?: Record<string, unknown> }, req);

    try {
      await journal.save();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // Either a concurrent import claimed this line (bankImportKey), or the
        // journalNumber counter collided with the numbering-preference series
        // used by journal.controller. Re-check which one it was.
        const clash = await Journal.findOne({
          organizationId,
          bankImportKey,
        }).select("_id");

        if (clash) {
          skipped.push({
            transactionId: line.transactionId,
            reason: "duplicate",
            message: "This transaction was already imported",
          });
          continue;
        }

        // journalNumber collision — clear it and let the counter allocate again.
        journal.journalNumber = undefined as unknown as string;
        await journal.save();
      } else {
        throw error;
      }
    }

    // The step that was missing entirely: without this the journal exists but
    // never reaches the ledger, so it is invisible to every financial report.
    await postVoucher({
      organizationId,
      voucherType: "Journal",
      voucherId: `journal:${String(journal._id)}`,
      voucherNo: String(journal.journalNumber || journal._id),
      postingDate: journal.date,
      lines: lineItems.map((item) => ({
        accountId: item.accountId,
        debit: item.debit,
        credit: item.credit,
        description: item.narration || narration,
      })),
      description: `Bank statement import — ${narration}`,
      req,
    });

    posted.push({
      transactionId: line.transactionId,
      journalId: journal._id as Types.ObjectId,
      journalNumber: String(journal.journalNumber),
      accountId: contraId,
      amount,
      direction: isMoneyIn ? "in" : "out",
    });
  }

  return { posted, skipped };
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number };
  return maybeError.code === 11000;
}
