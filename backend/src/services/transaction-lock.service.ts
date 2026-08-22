import { Types } from "mongoose";
import TransactionLock from "../models/transaction-lock.model";
import { TransactionLockModule } from "../types";
import { ForbiddenError } from "../utils/errors";

/**
 * Converts a date to a UTC calendar-day stamp (midnight UTC of that day).
 *
 * Transaction locking compares by calendar day, not exact timestamp — a
 * transaction dated anywhere on the lock date itself must be blocked. Using
 * UTC components (rather than the server/client's local timezone) keeps that
 * comparison stable regardless of where this code runs, and matches how
 * date-only strings (e.g. "2026-01-15") are parsed by JS as UTC midnight.
 */
function toUtcDayStamp(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date passed to transaction-lock comparison: ${String(value)}`);
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Pure comparison: is `date` on or before `lockedDate` (by calendar day)?
 * A module with no lock date (null/undefined) never blocks anything.
 *
 * Exported standalone so it can be unit-tested without a database.
 */
export function isDateLocked(
  date: Date | string,
  lockedDate: Date | string | null | undefined,
): boolean {
  if (!lockedDate) return false;
  return toUtcDayStamp(date) <= toUtcDayStamp(lockedDate);
}

function formatLockedDate(lockedDate: Date | string): string {
  const d = lockedDate instanceof Date ? lockedDate : new Date(lockedDate);
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Shape of a transaction-lock row, trimmed to the fields the decision needs. */
export interface LockRow {
  isLocked: boolean;
  lockedDate: Date | string | null;
}

/**
 * Pure decision: given a module's lock row (or null/undefined when no row
 * exists yet for this org+module), would `date` be blocked?
 *
 * A module with no lock row, or one that is unlocked, or one whose
 * lockedDate is null, never blocks anything. Exported standalone — together
 * with isDateLocked — so this logic can be unit-tested without a database.
 */
export function isTransactionBlocked(
  date: Date | string,
  lock: LockRow | null | undefined,
): boolean {
  if (!lock || !lock.isLocked || !lock.lockedDate) return false;
  return isDateLocked(date, lock.lockedDate);
}

/**
 * Throws if `date` falls on or before the active lock date for `module` in
 * this organization. No-op when the module has never been locked, has since
 * been unlocked, or has no rows at all (a fresh org with no lock activity
 * yet — everything is allowed by default).
 *
 * Call this early in every create/update/void/delete write path for a
 * locked module, before any DB mutation.
 */
export async function assertNotLocked(params: {
  organizationId: Types.ObjectId | string;
  module: TransactionLockModule;
  date: Date | string;
}): Promise<void> {
  const { organizationId, module, date } = params;

  const lock = await TransactionLock.findOne({ organizationId, module }).lean();

  if (isTransactionBlocked(date, lock)) {
    throw new ForbiddenError(
      `This module is locked for transactions on or before ${formatLockedDate(lock!.lockedDate!)}. ` +
        `Unlock it in Accountant > Transaction Locking to make changes.`,
    );
  }
}
