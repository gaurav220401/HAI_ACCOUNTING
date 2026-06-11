import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model";
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
  const users = await User.find({});
  console.log("Users count:", users.length);
  for (const user of users) {
    console.log(`User ID: ${user._id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Active Org ID: ${user.activeOrganization}`);
    if (user.activeOrganization) {
      const org = await Organization.findById(user.activeOrganization);
      if (org) {
        console.log(`  Active Org Name: ${org.name}`);
        console.log(`  Active Org Country: ${org.country}`);
        console.log(`  Active Org Address:`, JSON.stringify(org.address));
      }
    }
  }
  await mongoose.disconnect();
}

run().catch(console.error);
