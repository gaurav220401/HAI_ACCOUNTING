import assert from "node:assert/strict";
import { test } from "node:test";
import { isDateLocked, isTransactionBlocked } from "../../services/transaction-lock.service";

/**
 * Date-comparison rules for Transaction Locking (Accountant > Transaction
 * Locking). The UI copy is explicit: "Transactions on or before this date
 * will be locked and cannot be modified" — so the comparison is inclusive of
 * the lock date itself, and by calendar day rather than exact timestamp.
 */

const LOCK_DATE = "2026-06-15"; // parsed as UTC midnight

test("a transaction dated exactly on the lock date is blocked", () => {
  assert.equal(isDateLocked("2026-06-15", LOCK_DATE), true);
});

test("a transaction dated the day after the lock date is allowed", () => {
  assert.equal(isDateLocked("2026-06-16", LOCK_DATE), false);
});

test("a transaction dated the day before the lock date is blocked", () => {
  assert.equal(isDateLocked("2026-06-14", LOCK_DATE), true);
});

test("comparison is by calendar day, not exact timestamp", () => {
  // Same calendar day as the lock date, but with a late time-of-day — must
  // still be blocked, since the lock is inclusive of the whole lock day.
  assert.equal(isDateLocked("2026-06-15T23:59:59.999Z", LOCK_DATE), true);
  // A date well within the lock date's day, just past midnight.
  assert.equal(isDateLocked(new Date("2026-06-15T00:00:00.000Z"), LOCK_DATE), true);
});

test("a date far before the lock date is blocked", () => {
  assert.equal(isDateLocked("2020-01-01", LOCK_DATE), true);
});

test("a date far after the lock date is allowed", () => {
  assert.equal(isDateLocked("2030-01-01", LOCK_DATE), false);
});

test("no lock date at all never blocks", () => {
  assert.equal(isDateLocked("2020-01-01", null), false);
  assert.equal(isDateLocked("2020-01-01", undefined), false);
});

// ─── isTransactionBlocked — the full per-module decision ──────────────────

test("an unlocked module allows anything, even with a lockedDate on file", () => {
  // e.g. a module that was locked and then unlocked — lockedDate may still
  // be stored, but isLocked:false means nothing is blocked.
  const blocked = isTransactionBlocked("2020-01-01", {
    isLocked: false,
    lockedDate: LOCK_DATE,
  });
  assert.equal(blocked, false);
});

test("a module with no lock row yet allows anything", () => {
  assert.equal(isTransactionBlocked("2020-01-01", null), false);
  assert.equal(isTransactionBlocked("2020-01-01", undefined), false);
});

test("a locked module blocks on-or-before and allows after", () => {
  const lock = { isLocked: true, lockedDate: LOCK_DATE };
  assert.equal(isTransactionBlocked("2026-06-15", lock), true, "on the lock date");
  assert.equal(isTransactionBlocked("2026-06-14", lock), true, "before the lock date");
  assert.equal(isTransactionBlocked("2026-06-16", lock), false, "after the lock date");
});

test("a locked module with a null lockedDate never blocks (defensive: shouldn't happen in practice)", () => {
  assert.equal(isTransactionBlocked("2020-01-01", { isLocked: true, lockedDate: null }), false);
});
