import dotenv from "dotenv";
import path from "path";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function testApiKey() {
  console.log("=== Testing Gemini API Key ===");
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("API Key loaded:", apiKey ? `${apiKey.substring(0, 8)}...` : "NONE");

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing from environment!");
    process.exit(1);
  }

  const client = new GoogleGenAI({ apiKey });

  const textModelsToTest = [
    "gemini-3.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ];

  console.log("\n1. Testing Text Generation Models:");
  for (const model of textModelsToTest) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: "Hello! Respond with: 'API Key is working fine with " + model + "'",
      });
      console.log(`✅ [${model}] SUCCESS:`, res.text?.trim());
    } catch (err: any) {
      console.error(`❌ [${model}] FAILED: Status ${err.status || err.code} - ${err.message}`);
    }
  }

  console.log("\n2. Testing Embedding Models:");
  for (const model of ["gemini-embedding-001", "gemini-embedding-2"]) {
    try {
      const res = await client.models.embedContent({
        model,
        contents: "Test embedding string",
      });
      const values = res.embeddings?.[0]?.values || (res as any).embedding?.values;
      console.log(`✅ [${model}] SUCCESS: Received ${values?.length} dimensional vector`);
    } catch (err: any) {
      console.error(`❌ [${model}] FAILED: Status ${err.status || err.code} - ${err.message}`);
    }
  }
}

testApiKey().catch((err) => {
  console.error("Fatal error running API Key test script:", err);
  process.exit(1);
});
