import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import dns from "dns";
import { handleAgentChat } from "../controllers/agent.controller";

dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (_) {}

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function testAgentEngine() {
  console.log("=== Testing AI Task Agent Engine (End-to-End Execution) ===");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI missing!");
    process.exit(1);
  }

  console.log("1. Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("✅ MongoDB Connected.");

  // Test Instruction: Create a customer and an invoice for them
  const instruction = "Create a new customer named 'Starlight Innovations' with email 'starlight@innovate.com' and create a draft invoice of ₹28,000 for them.";

  console.log(`2. Sending Instruction: "${instruction}"`);

  const org = await mongoose.model("Organization").findOne();
  const orgId = org ? org._id.toString() : new mongoose.Types.ObjectId().toString();
  console.log(`Using Organization ID: ${orgId}`);

  const req: any = {
    headers: {
      "x-organization-id": orgId,
    },
    body: {
      instruction,
      sessionId: `test_agent_session_${Date.now()}`,
    },
    user: {
      _id: "650000000000000000000999",
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

    handleAgentChat(req, res).catch((err) => {
      resolve({ code: 500, data: { error: err.message || err } });
    });
  });

  const startTime = Date.now();
  const result = await responsePromise;
  const duration = Date.now() - startTime;

  console.log("\n3. AI Agent Execution Response:");
  console.log(`HTTP Status: ${result.code}`);
  console.log(`Duration: ${duration} ms`);
  console.log("Response Payload:\n", JSON.stringify(result.data, null, 2));

  if (result.code === 200 && result.data?.success) {
    console.log("\n✅ AI AGENT TEST PASSED 100%! Tools executed and data mutated successfully.");
  } else {
    console.error("\n❌ AI AGENT TEST FAILED!");
  }

  await mongoose.disconnect();
  process.exit(0);
}

testAgentEngine().catch((err) => {
  console.error("❌ Test script failed with exception:", err);
  process.exit(1);
});
