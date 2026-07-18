import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import dns from "dns";
import { GoogleGenAI } from "@google/genai";
import { getEmbedding } from "../chatbot/gemini-embeddings";

dns.setDefaultResultOrder("ipv4first");
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (_) {}

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function testRagPipeline() {
  console.log("=== Testing RAG Chat Pipeline ===");

  const mongoUri = process.env.CHATBOT_MONGODB_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MongoDB URI missing!");
    process.exit(1);
  }

  console.log("Connecting to MongoDB Atlas...");
  const conn = await mongoose.createConnection(mongoUri).asPromise();
  console.log("✅ Connected to MongoDB.");

  // Define KB schema
  const kbSchema = new mongoose.Schema({
    text: String,
    rawText: String,
    embedding: [Number],
    sourceFile: String,
    title: String,
  });

  const KBChunk = conn.model("KBChunk", kbSchema, "kb_chunks");

  const testQuestion = "What is HAI Accounting and how do I create an invoice?";
  console.log(`\nQuestion: "${testQuestion}"`);

  // 1. Embed query
  console.log("1. Generating query embedding...");
  const queryVector = await getEmbedding(testQuestion, "RETRIEVAL_QUERY");
  console.log(`✅ Embedding generated (${queryVector.length} dimensions).`);

  // 2. Vector Search
  console.log("2. Performing vector search on MongoDB...");
  let relevantChunks: any[] = [];
  try {
    relevantChunks = await KBChunk.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 20,
          limit: 3,
        },
      },
      {
        $project: {
          text: 1,
          rawText: 1,
          title: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);
    console.log(`✅ Retrieved ${relevantChunks.length} chunks from vector index.`);
    relevantChunks.forEach((c, idx) => {
      console.log(`   Chunk ${idx + 1}: ${c.title || "Untitled"} (score: ${c.score?.toFixed(4)})`);
    });
  } catch (err: any) {
    console.warn("⚠️ Vector search failed or index not available:", err.message);
  }

  // 3. Generate content with Gemini LLM
  console.log("\n3. Calling Gemini LLM (gemini-3.5-flash)...");
  const apiKey = process.env.GEMINI_API_KEY;
  const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-3.5-flash";
  const client = new GoogleGenAI({ apiKey: apiKey! });

  const context = relevantChunks.map(c => c.rawText || c.text).join("\n---\n");
  const prompt = `KNOWLEDGE BASE CONTEXT:\n${context}\n\nUSER QUESTION: ${testQuestion}`;

  const response = await client.models.generateContent({
    model: llmModel,
    contents: prompt,
    config: {
      systemInstruction: "You are Nemo, AI assistant for HAI Accounting. Provide clear and helpful responses.",
      temperature: 0.3,
      maxOutputTokens: 500,
    },
  });

  console.log("\n✅ RAG LLM Response:");
  console.log("-----------------------------------------");
  console.log(response.text);
  console.log("-----------------------------------------");

  await conn.close();
  console.log("\n✅ RAG Pipeline test completed successfully!");
}

testRagPipeline().catch((err) => {
  console.error("❌ RAG Pipeline test failed:", err);
  process.exit(1);
});
