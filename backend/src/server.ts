import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB, syncIndexes } from "./config/db";
import { seedDefaultRoles } from "./models/role.model";
import { startRecurringBillScheduler } from "./services/recurring-bill.scheduler";
import { startRecurringInvoiceScheduler } from "./services/recurring-invoice.service";

const DEFAULT_PORT = Number(process.env.PORT || 5000);

function listenWithFallback(server: http.Server, startPort: number): void {
  let currentPort = startPort;

  const tryListen = () => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.warn(`Port ${currentPort} is in use. Trying ${currentPort + 1}...`);
        currentPort += 1;
        tryListen();
        return;
      }

      throw error;
    });

    server.listen(currentPort, () => {
      console.log(`Server ready on port ${currentPort}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  };

  tryListen();
}

const startServer = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Sync indexes (drops stale non-sparse indexes, etc.)
    await syncIndexes();

    // Seed default roles on startup
    await seedDefaultRoles();

    // Start recurring bill scheduler
    startRecurringBillScheduler();
    // Start recurring invoice processing after the database is ready.
    startRecurringInvoiceScheduler();

    // Create HTTP server
    const server = http.createServer(app);

    listenWithFallback(server, DEFAULT_PORT);

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
