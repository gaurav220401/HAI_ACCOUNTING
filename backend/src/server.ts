import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB, syncIndexes } from "./config/db";
import { seedDefaultRoles } from "./models/role.model";

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Sync indexes (drops stale non-sparse indexes, etc.)
    await syncIndexes();

    // Seed default roles on startup
    await seedDefaultRoles();

    // Create HTTP server
    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server ready on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled Rejection:", reason);
    });
  } catch (err: any) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
};

startServer();
