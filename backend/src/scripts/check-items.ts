import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
  const db = mongoose.connection.db;
  if (!db) {
    console.error("No database connection");
    process.exit(1);
  }
  const items = await db.collection("items").find({}).toArray();
  console.log("Items count:", items.length);
  for (const item of items) {
    console.log({
      _id: item._id,
      name: item.name,
      taxId: item.taxId,
      intraStateTaxId: item.intraStateTaxId,
      interStateTaxId: item.interStateTaxId,
      taxPreference: item.taxPreference,
    });
  }
  await mongoose.disconnect();
}

run().catch(console.error);
