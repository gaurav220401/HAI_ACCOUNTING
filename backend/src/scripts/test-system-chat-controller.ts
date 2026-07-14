import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import dns from "dns";
import { handleChat } from "../controllers/chat.controller";

dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (_) {}

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function testSystemChatController() {
  console.log("=== Testing System Chat Controller (End-to-End System Check) ===");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI missing!");
    process.exit(1);
  }

  console.log("1. Connecting main Mongoose connection...");
  await mongoose.connect(mongoUri);
  console.log("✅ Main Mongoose connected.");

  // Mock Request & Response with Promise resolution
  const req: any = {
    body: {
      question: "How do I create a new invoice in HAI Accounting?",
      sessionId: "test_session_system_check",
    },
    user: {
      _id: "650000000000000000000123", // valid ObjectId format string
      activeOrganization: undefined,
    },
  };

  let responseData: any = null;
  let statusCode = 200;

  const responsePromise = new Promise<{ code: number; data: any }>((resolve) => {
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        responseData = data;
        resolve({ code: statusCode, data });
        return res;
      },
    };

    handleChat(req, res, (err?: any) => {
      if (err) {
        console.error("Express next() error captured:", err);
        resolve({ code: 500, data: { error: err.message || err } });
      }
    });
  });

  console.log("2. Invoking handleChat controller function and awaiting response...");
  const startTime = Date.now();

  const result = await responsePromise;
  const duration = Date.now() - startTime;

  console.log("\n3. Controller Response Results:");
  console.log(`HTTP Status: ${result.code}`);
  console.log(`Response Time: ${duration} ms`);
  console.log("Data Payload:", JSON.stringify(result.data, null, 2));

  if (result.code === 200 && result.data?.success) {
    console.log("\n✅ SYSTEM TEST PASSED: Chat controller is working 100% cleanly!");
  } else {
    console.error("\n❌ SYSTEM TEST FAILED!");
  }

  await mongoose.disconnect();
  process.exit(0);
}

testSystemChatController().catch((err) => {
  console.error("❌ System Chat Controller test failed with exception:", err);
  process.exit(1);
});
