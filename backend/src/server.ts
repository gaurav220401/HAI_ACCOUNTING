import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB, syncIndexes } from "./config/db";
// Reload for bound user activeOrganization & model fallback support
import { seedDefaultRoles } from "./models/role.model";
import { startRecurringBillScheduler } from "./services/recurring-bill.scheduler";
import {
  dedupeRecurringRunExpenses,
  startRecurringExpenseScheduler,
} from "./services/recurring-expense.service";
import { startRecurringInvoiceScheduler } from "./services/recurring-invoice.service";
import {
  startDocumentProcessingWorker,
  startDocumentScanRecoveryCron,
} from "./services/document-processing.service";
import { startDocumentEmailIngestionWorker } from "./services/document-email-ingest.service";
import { seedCountersFromExistingData } from "./utils/seed-counters";

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

    // One-time cleanup: archive legacy duplicate recurring expense runs
    // before syncing unique recurring run indexes.
    await dedupeRecurringRunExpenses();

    // Sync indexes (drops stale non-sparse indexes, etc.)
    await syncIndexes();

    // Seed Counter documents from existing INV-/EXP- sequences so that
    // the atomic counter generator won't re-issue already-used numbers.
    await seedCountersFromExistingData();

    // Seed default roles on startup
    await seedDefaultRoles();

    // Start recurring bill scheduler
    startRecurringBillScheduler();
    // Start recurring expense scheduler
    startRecurringExpenseScheduler();
    // Start recurring invoice processing after the database is ready.
    startRecurringInvoiceScheduler();
    // Start documents worker if Redis is configured.
    startDocumentProcessingWorker();
    // Recover and queue stuck scans in the background.
    startDocumentScanRecoveryCron();
    // Poll inbound mailbox using existing SMTP configuration (no SES/Lambda).
    startDocumentEmailIngestionWorker();

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
