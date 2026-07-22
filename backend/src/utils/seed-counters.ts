/**
 * seed-counters.ts
 *
 * On startup, scan Invoice and Expense collections to find the highest
 * existing sequence numbers per organization and ensure the Counter
 * documents are at least that high.  This prevents the new atomic
 * Counter-based number generators from re-issuing numbers that already
 * exist in the database.
 */

import Invoice from "../models/invoice.model";
import Expense from "../models/expense.model";
import { Counter } from "../models/counter.model";

export async function seedCountersFromExistingData(): Promise<void> {
  // ── Invoice counters ─────────────────────────────────────────────────
  const invoiceOrgs = await Invoice.aggregate<{ _id: string; maxSeq: number }>([
    { $match: { invoiceNumber: { $regex: /^INV-\d+$/i } } },
    {
      $group: {
        _id: { $toString: "$organizationId" },
        maxSeq: {
          $max: {
            $toInt: {
              $arrayElemAt: [{ $split: ["$invoiceNumber", "-"] }, 1],
            },
          },
        },
      },
    },
  ]).catch(() => []); // Non-fatal: fall back to no-op on aggregation error

  for (const { _id: orgId, maxSeq } of invoiceOrgs) {
    if (!orgId || !maxSeq || maxSeq <= 0) continue;
    const counterId = `invoice-${orgId}`;
    // Only set the counter if it is currently below the DB max.
    // $max is used as a plain operator (not pipeline) — no array wrapper needed.
    await Counter.findByIdAndUpdate(
      counterId,
      { $max: { seq: maxSeq } },
      { upsert: true },
    );
  }

  // ── Expense counters ─────────────────────────────────────────────────
  const expenseOrgs = await Expense.aggregate<{ _id: string; maxSeq: number }>([
    { $match: { expenseNumber: { $regex: /^EXP-\d+$/i } } },
    {
      $group: {
        _id: { $toString: "$organizationId" },
        maxSeq: {
          $max: {
            $toInt: {
              $arrayElemAt: [{ $split: ["$expenseNumber", "-"] }, 1],
            },
          },
        },
      },
    },
  ]).catch(() => []);

  for (const { _id: orgId, maxSeq } of expenseOrgs) {
    if (!orgId || !maxSeq || maxSeq <= 0) continue;
    const counterId = `expense-${orgId}`;
    await Counter.findByIdAndUpdate(
      counterId,
      { $max: { seq: maxSeq } },
      { upsert: true },
    );
  }

  console.log(
    `[seed-counters] Invoice counters seeded for ${invoiceOrgs.length} org(s). ` +
    `Expense counters seeded for ${expenseOrgs.length} org(s).`,
  );
}
