/**
 * One-time migration: backfill `owner` and `members` on all existing
 * organizations that were created before the multi-tenancy isolation fix.
 *
 * Strategy:
 *   For each org without an owner, find every User whose `activeOrganization`
 *   points to that org. The first such user becomes the owner; all of them
 *   become members.  If no user is found, the org is left orphaned (admin
 *   can deal with it manually).
 *
 * Run once:
 *   cd backend
 *   npx ts-node -e "require('./src/scripts/migrate-org-members')"
 *   – or –
 *   npx tsx src/scripts/migrate-org-members.ts
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const db = mongoose.connection.db!;
  const orgsCol = db.collection("organizations");
  const usersCol = db.collection("users");

  // Find orgs that are missing `owner` or have an empty `members` array
  const orphanOrgs = await orgsCol
    .find({ $or: [{ owner: { $exists: false } }, { owner: null }, { members: { $size: 0 } }] })
    .toArray();

  console.log(`Found ${orphanOrgs.length} org(s) to migrate`);

  for (const org of orphanOrgs) {
    // Find all users whose activeOrganization points here
    const users = await usersCol
      .find({ activeOrganization: org._id })
      .toArray();

    if (users.length === 0) {
      console.warn(`  ⚠️  No users claim org "${org.name}" (${org._id}) — skipping`);
      continue;
    }

    const ownerDoc = users[0];
    const memberIds = users.map((u) => u._id);

    await orgsCol.updateOne(
      { _id: org._id },
      { $set: { owner: ownerDoc._id, members: memberIds } },
    );

    console.log(
      `  ✅  "${org.name}" → owner: ${ownerDoc.email ?? ownerDoc._id}, members: ${memberIds.length}`,
    );
  }

  console.log("Migration complete");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
