import dotenv from "dotenv";
import mongoose from "mongoose";
import Journal from "../models/journal.model";
import { connectDB } from "../config/db";

dotenv.config();

const TARGET_INDEX_NAME = "organizationId_1_journalNumber_1";

type IndexInfo = {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
};

function hasKey(index: IndexInfo, expected: Record<string, number>): boolean {
  const indexKeys = Object.entries(index.key || {});
  const expectedKeys = Object.entries(expected);
  if (indexKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every(([k, v]) => index.key[k] === v);
}

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[journal-index-migration] starting (${dryRun ? "dry-run" : "apply"})`,
  );

  await connectDB();
  console.log(`[journal-index-migration] database=${mongoose.connection.name}`);

  const indexes = (await Journal.collection.indexes()) as IndexInfo[];

  const legacyIndexes = indexes.filter(
    (idx) =>
      idx.name !== TARGET_INDEX_NAME &&
      Boolean(idx.unique) &&
      hasKey(idx, { journalNumber: 1 }),
  );

  if (legacyIndexes.length === 0) {
    console.log(
      "[journal-index-migration] no legacy global journalNumber unique indexes found",
    );
  } else {
    for (const idx of legacyIndexes) {
      if (dryRun) {
        console.log(`[journal-index-migration] would drop index: ${idx.name}`);
      } else {
        console.log(`[journal-index-migration] dropping index: ${idx.name}`);
        await Journal.collection.dropIndex(idx.name);
      }
    }
  }

  const indexesAfterDrop =
    dryRun ? indexes : ((await Journal.collection.indexes()) as IndexInfo[]);

  const hasTarget = indexesAfterDrop.some(
    (idx) =>
      hasKey(idx, { organizationId: 1, journalNumber: 1 }) &&
      Boolean(idx.unique),
  );

  if (hasTarget) {
    console.log(
      "[journal-index-migration] target org-scoped unique index already exists",
    );
  } else if (dryRun) {
    console.log(
      `[journal-index-migration] would create index: ${TARGET_INDEX_NAME}`,
    );
  } else {
    console.log(
      `[journal-index-migration] creating index: ${TARGET_INDEX_NAME}`,
    );
    await Journal.collection.createIndex(
      { organizationId: 1, journalNumber: 1 },
      { unique: true, name: TARGET_INDEX_NAME },
    );
  }

  console.log("[journal-index-migration] completed");
}

run()
  .catch((error) => {
    console.error("[journal-index-migration] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors on shutdown
    }
  });
