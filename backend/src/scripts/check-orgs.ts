import mongoose from "mongoose";
import dotenv from "dotenv";
import Organization from "../models/organization.model";

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  const orgs = await Organization.find({});
  console.log("Organizations count:", orgs.length);
  for (const org of orgs) {
    console.log(`Org ID: ${org._id}`);
    console.log(`Name: ${org.name}`);
    console.log(`Country: ${org.country}`);
    console.log(`Address:`, JSON.stringify(org.address));
  }
  await mongoose.disconnect();
}

run().catch(console.error);
