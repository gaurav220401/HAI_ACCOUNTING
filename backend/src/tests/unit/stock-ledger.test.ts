import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * Pure-arithmetic tests for the stock ledger's costing rules.
 *
 * postStockMovement() needs a database, so the valuation maths it performs is
 * mirrored here exactly and exercised directly. These are the rules that decide
 * COGS and closing stock value, so getting them wrong is an accounting error,
 * not a display bug.
 */

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Mirrors the receipt/issue branch inside postStockMovement(). */
function applyMovement(
  prior: { quantity: number; value: number; averageCost: number },
  delta: number,
  unitCost?: number,
): { quantity: number; value: number; averageCost: number; valueDelta: number } {
  const priorQty = round2(prior.quantity);
  const priorValue = round2(prior.value);
  const nextQty = round2(priorQty + delta);

  let valueDelta: number;
  if (delta > 0) {
    const cost = Number.isFinite(Number(unitCost)) ? Number(unitCost) : prior.averageCost;
    valueDelta = round2(delta * cost);
  } else {
    const rate = priorQty > 0 ? priorValue / priorQty : prior.averageCost;
    valueDelta = round2(delta * rate);
  }

  const nextValue = round2(priorValue + valueDelta);
  return {
    quantity: nextQty,
    value: nextValue,
    averageCost: nextQty > 0 ? round2(nextValue / nextQty) : prior.averageCost,
    valueDelta,
  };
}

const EMPTY = { quantity: 0, value: 0, averageCost: 0 };

test("a first receipt sets quantity, value and unit cost", () => {
  const r = applyMovement(EMPTY, 100, 50);
  assert.equal(r.quantity, 100);
  assert.equal(r.value, 5000);
  assert.equal(r.averageCost, 50);
});

test("a second receipt at a different price blends the weighted average", () => {
  const first = applyMovement(EMPTY, 100, 50);      // 100 @ 50 = 5000
  const second = applyMovement(first, 100, 70);     // +100 @ 70 = 7000

  assert.equal(second.quantity, 200);
  assert.equal(second.value, 12000);
  assert.equal(second.averageCost, 60); // 12000 / 200
});

test("an issue consumes at the weighted average, not at the last purchase price", () => {
  const stocked = applyMovement(applyMovement(EMPTY, 100, 50), 100, 70); // avg 60
  const issued = applyMovement(stocked, -50);

  // COGS for 50 units must be 50 x 60, not 50 x 70.
  assert.equal(issued.valueDelta, -3000);
  assert.equal(issued.quantity, 150);
  assert.equal(issued.value, 9000);
  assert.equal(issued.averageCost, 60, "issuing must not move the average cost");
});

test("issuing the entire balance leaves zero value, not a rounding remainder", () => {
  const stocked = applyMovement(EMPTY, 3, 33.33); // 99.99
  const issued = applyMovement(stocked, -3);

  assert.equal(issued.quantity, 0);
  assert.equal(issued.value, 0);
});

test("a receipt with no unit cost inherits the row's average", () => {
  const stocked = applyMovement(EMPTY, 10, 25);
  const free = applyMovement(stocked, 5); // no cost supplied

  assert.equal(free.quantity, 15);
  assert.equal(free.averageCost, 25);
  assert.equal(free.value, 375);
});

test("negative stock is permitted and values at the last known cost", () => {
  // Invoices are routinely posted before the matching receipt lands; blocking
  // this would break existing flows (spec §6.4).
  const stocked = applyMovement(EMPTY, 10, 40);
  const oversold = applyMovement(stocked, -15);

  assert.equal(oversold.quantity, -5);
  assert.equal(oversold.valueDelta, -600); // 15 x 40
  assert.equal(oversold.value, -200);
});

test("issuing from an empty row falls back to the stored average cost", () => {
  const empty = { quantity: 0, value: 0, averageCost: 12.5 };
  const issued = applyMovement(empty, -4);

  assert.equal(issued.valueDelta, -50); // 4 x 12.5
  assert.equal(issued.quantity, -4);
});

test("money rounds to two places at every step", () => {
  const r = applyMovement(EMPTY, 3, 10.005);
  assert.equal(r.value, 30.02);
  assert.equal(r.quantity, 3);
});

test("a full receive/issue cycle returns the row to zero", () => {
  let row = applyMovement(EMPTY, 40, 12);
  row = applyMovement(row, 60, 18);       // 100 units, value 1800, avg 18? no:
  // 40x12 = 480, 60x18 = 1080 -> 1560 over 100 = 15.60
  assert.equal(row.averageCost, 15.6);

  row = applyMovement(row, -100);
  assert.equal(row.quantity, 0);
  assert.equal(row.value, 0);
});

test("commitment clamps at zero so over-release cannot corrupt availability", () => {
  // Mirrors postCommitmentChange().
  const clamp = (current: number, delta: number) => Math.max(0, round2(current + delta));

  assert.equal(clamp(10, -4), 6);
  assert.equal(clamp(10, -25), 0, "releasing more than reserved must floor at zero");
  assert.equal(clamp(0, 5), 5);
});
