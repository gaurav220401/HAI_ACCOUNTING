import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in your .env file");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("MongoDB connected");
};

/**
 * Sync indexes for all registered Mongoose models.
 * Drops stale indexes and creates missing ones so schema-level changes
 * (e.g. adding `sparse: true`) are reflected in MongoDB.
 */
const syncIndexes = async (): Promise<void> => {
  const models = mongoose.modelNames();
  for (const name of models) {
    await mongoose.model(name).syncIndexes();
  }
  console.log("Indexes synced");
};

export { connectDB, syncIndexes };
