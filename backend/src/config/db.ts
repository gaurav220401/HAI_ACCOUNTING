import mongoose from "mongoose";

let connectPromise: Promise<typeof mongoose> | null = null;

const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Set it in your .env file");
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connectPromise) {
    mongoose.set("strictQuery", true);
    connectPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });
  }

  try {
    await connectPromise;
    console.log("MongoDB connected");
  } finally {
    connectPromise = null;
  }
};

const ensureDBConnection = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }
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

export { connectDB, ensureDBConnection, syncIndexes };
