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
  const customers = await db.collection("contacts").find({ contactType: "Customer" }).toArray();
  console.log("Customers count:", customers.length);
  for (const c of customers) {
    console.log({
      _id: c._id,
      displayName: c.displayName,
      placeOfSupply: c.placeOfSupply,
      billingState: c.billingAddress?.state,
      shippingState: c.shippingAddress?.state,
    });
  }
  await mongoose.disconnect();
}

run().catch(console.error);
