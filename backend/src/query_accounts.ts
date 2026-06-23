import mongoose from "mongoose";
import dotenv from "dotenv";
import Account from "./models/account.model";
import Journal from "./models/journal.model";

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in env");
    process.exit(1);
  }
  await mongoose.connect(uri);

  // 1. Get the last 10 journals created to identify the active organization
  console.log("=== Recent Journals ===");
  const journals = await Journal.find({}).sort({ createdAt: -1 }).limit(10);
  console.log(`Found ${journals.length} journals.`);
  const activeOrgIds = new Set<string>();
  for (const j of journals) {
    console.log(`Journal: ${j.journalNumber}, Date: ${j.date}, OrgId: ${j.organizationId}`);
    activeOrgIds.add(String(j.organizationId));
  }

  // 2. If no journals exist, check the users to see what activeOrganization they have
  if (activeOrgIds.size === 0) {
    console.log("\n=== Checking Users ===");
    const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }));
    const users = await User.find({});
    for (const u of users) {
      const uDoc = u as any;
      console.log(`User: ${uDoc.name || uDoc.email}, ActiveOrg: ${uDoc.activeOrganization}`);
      if (uDoc.activeOrganization) {
        activeOrgIds.add(String(uDoc.activeOrganization));
      }
    }
  }

  // 3. For each candidate active organization, print its name and ALL accounts
  const Organization = mongoose.model("Organization", new mongoose.Schema({}, { strict: false }));
  for (const orgIdStr of activeOrgIds) {
    const org = await Organization.findById(orgIdStr);
    const orgName = org ? ((org as any).name || (org as any).displayName || (org as any).companyName) : "Unknown";
    console.log(`\n=== Organization: ${orgName} (${orgIdStr}) ===`);
    const accounts = await Account.find({ organizationId: new mongoose.Types.ObjectId(orgIdStr) as any, isDeleted: false });
    console.log(`Total Accounts for this Org: ${accounts.length}`);
    console.log("Account Names:");
    console.log(accounts.map(a => `- "${a.name}" (Code: ${a.code || 'none'}, AcNum: ${a.accountNumber || 'none'})`));
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
