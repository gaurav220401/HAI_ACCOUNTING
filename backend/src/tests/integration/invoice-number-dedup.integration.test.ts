/**
 * invoice-number-dedup.integration.test.ts
 *
 * Verifies that concurrent calls to the invoice and expense number generators
 * produce unique numbers and do not hit E11000 duplicate key errors.
 *
 * Run with:
 *   node --import tsx --test src/tests/integration/invoice-number-dedup.integration.test.ts
 */

import { test, describe, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Counter } from "../../models/counter.model";

// ── helpers ──────────────────────────────────────────────────────────────────

async function nextInvoiceNumberAtomic(organizationId: string): Promise<string> {
  const counter = await Counter.findByIdAndUpdate(
    `invoice-${organizationId}`,
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return `INV-${String(counter!.seq).padStart(6, "0")}`;
}

// ── setup / teardown ─────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Counter.deleteMany({});
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Atomic invoice number generator", () => {
  test("produces unique numbers under concurrent load", async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const CONCURRENT = 20;

    const numbers = await Promise.all(
      Array.from({ length: CONCURRENT }, () => nextInvoiceNumberAtomic(orgId)),
    );

    const unique = new Set(numbers);
    assert.equal(unique.size, CONCURRENT, `Expected ${CONCURRENT} unique numbers, got ${unique.size}`);

    const sorted = [...numbers].sort();
    const expected = Array.from({ length: CONCURRENT }, (_, i) =>
      `INV-${String(i + 1).padStart(6, "0")}`,
    ).sort();
    assert.deepEqual(sorted, expected);
  });

  test("returns INV-000001 for a fresh org", async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    const num = await nextInvoiceNumberAtomic(orgId);
    assert.equal(num, "INV-000001");
  });

  test("continues from where the seeded counter left off", async () => {
    const orgId = new mongoose.Types.ObjectId().toString();
    // Simulate an existing counter seeded to 5 (i.e., INV-000001 to INV-000005 already exist)
    await Counter.create({ _id: `invoice-${orgId}`, seq: 5 });

    const num = await nextInvoiceNumberAtomic(orgId);
    assert.equal(num, "INV-000006");
  });

  test("independent orgs get independent sequences", async () => {
    const orgA = new mongoose.Types.ObjectId().toString();
    const orgB = new mongoose.Types.ObjectId().toString();

    const [a1, b1, a2, b2] = await Promise.all([
      nextInvoiceNumberAtomic(orgA),
      nextInvoiceNumberAtomic(orgB),
      nextInvoiceNumberAtomic(orgA),
      nextInvoiceNumberAtomic(orgB),
    ]);

    assert.equal(a1, "INV-000001");
    assert.equal(b1, "INV-000001");
    assert.equal(a2, "INV-000002");
    assert.equal(b2, "INV-000002");
  });
});

describe("Expense atomic counter", () => {
  test("concurrent $inc calls produce unique sequence numbers", async () => {
    const orgId = new mongoose.Types.ObjectId().toString();

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        Counter.findByIdAndUpdate(
          `expense-${orgId}`,
          { $inc: { seq: 1 } },
          { returnDocument: "after", upsert: true },
        ),
      ),
    );

    const seqs = results.map((r) => r!.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
