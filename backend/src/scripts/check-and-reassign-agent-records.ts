import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import dns from "dns";
import Contact from "../models/contact.model";
import Invoice from "../models/invoice.model";
import Organization from "../models/organization.model";

dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (_) {}

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function fixAgentRecords() {
  await mongoose.connect(process.env.MONGODB_URI!);

  console.log("=== Checking Organizations & Contacts ===");
  const orgs = await Organization.find({}).lean();
  console.log("Organizations in DB:", orgs.map(o => ({ id: o._id, name: o.name })));

  // Haldar Accounting target org
  const targetOrg = orgs.find(o => o.name.toLowerCase().includes("haldar")) || orgs[0];
  console.log(`Target User Active Org: ${targetOrg.name} (${targetOrg._id})`);

  // Move "Starlight Innovations" and "Apex Digital Tech" to the target org if they were assigned to another org
  const updateContactsResult = await Contact.updateMany(
    { displayName: { $in: [/starlight/i, /apex/i] } },
    { $set: { organizationId: targetOrg._id } }
  );

  const updateInvoicesResult = await Invoice.updateMany(
    { customerName: { $in: [/starlight/i, /apex/i] } },
    { $set: { organizationId: targetOrg._id } }
  );

  console.log(`Updated ${updateContactsResult.modifiedCount} contacts and ${updateInvoicesResult.modifiedCount} invoices to Org "${targetOrg.name}".`);

  await mongoose.disconnect();
}

fixAgentRecords().catch(console.error);
