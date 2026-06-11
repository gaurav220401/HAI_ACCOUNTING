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
  const taxes = await db.collection("taxes").find({}).toArray();
  console.log("Taxes count:", taxes.length);
  for (const tax of taxes) {
    console.log({
      _id: tax._id,
      name: tax.name,
      rate: tax.rate,
      taxAuthority: tax.taxAuthority,
      taxType: tax.taxType,
      isActive: tax.isActive,
    });
  }
  await mongoose.disconnect();
}

run().catch(console.error);
