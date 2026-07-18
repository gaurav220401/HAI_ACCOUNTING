import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import Contact from "../models/contact.model";
import { recomputeContactOutstanding } from "../services/accounting-sync.service";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not defined");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const contacts = await Contact.find({ isDeleted: false });
  console.log(`Found ${contacts.length} contacts. Recomputing outstandings...`);

  for (const contact of contacts) {
    try {
      await recomputeContactOutstanding({
        organizationId: contact.organizationId,
        contactId: contact._id,
      });
      console.log(`Recomputed outstanding for contact: ${contact.displayName} (${contact.contactType})`);
    } catch (err: any) {
      console.error(`Failed for ${contact.displayName}:`, err.message);
    }
  }

  console.log("Done!");
  await mongoose.disconnect();
}

run().catch(console.error);
