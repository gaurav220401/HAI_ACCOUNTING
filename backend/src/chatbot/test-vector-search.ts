/**
 * Vector Search Test Script — Production-Grade
 *
 * Embeds a user query using RETRIEVAL_QUERY task type and runs
 * MongoDB Atlas $vectorSearch aggregation to find the most
 * semantically relevant knowledge base chunks.
 *
 * Usage:
 *   npm run chatbot:test-search "how do I create a recurring invoice"
 *   npm run chatbot:test-search "what is the purchase order workflow"
 */

import * as dotenv from "dotenv";
import { getKBChunkModel, getChatbotConnection } from "../models/kb-chunk.model";
import { getEmbedding } from "./gemini-embeddings";

dotenv.config();

async function runTestSearch() {
  const query = process.argv[2] || "how to convert a purchase order to a bill";

  console.log("═".repeat(60));
  console.log("  HAI Accounting — Vector Search Test");
  console.log("═".repeat(60));
  console.log(`  Query: "${query}"`);
  console.log(`  Model: ${process.env.CHATBOT_EMBEDDING_MODEL || "gemini-embedding-001"}`);
  console.log(`  Task:  RETRIEVAL_QUERY`);
  console.log("═".repeat(60));

  const KBChunk = getKBChunkModel();
  const conn = getChatbotConnection();

  // Wait for connection
  await new Promise<void>((resolve, reject) => {
    if (conn.readyState === 1) { resolve(); return; }
    conn.once("connected", resolve);
    conn.once("error", reject);
    setTimeout(() => reject(new Error("Connection timeout")), 15000);
  });

  // Check document count
  const totalDocs = await KBChunk.countDocuments();
  console.log(`\n📊 Total chunks in knowledge base: ${totalDocs}`);

  if (totalDocs === 0) {
    console.log("❌ No chunks found. Run 'npm run chatbot:ingest' first.");
    await conn.close();
    return;
  }

  // Generate query embedding with RETRIEVAL_QUERY task type
  console.log("\n🔍 Generating query embedding...");
  const queryVector = await getEmbedding(query, "RETRIEVAL_QUERY");
  console.log(`✅ Query vector generated (${queryVector.length} dimensions)`);

  // Execute $vectorSearch
  console.log("\n🔎 Executing $vectorSearch...");
  try {
    const results = await KBChunk.aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryVector,
          numCandidates: 150,
          limit: 5,
        },
      },
      {
        $project: {
          text: 1,
          rawText: 1,
          sourceFile: 1,
          sourceUrl: 1,
          title: 1,
          headings: 1,
          sectionDepth: 1,
          chunkIndex: 1,
          totalChunks: 1,
          tokenEstimate: 1,
          keywords: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    console.log("\n" + "═".repeat(60));
    console.log(`  RESULTS: ${results.length} matches`);
    console.log("═".repeat(60));

    if (results.length === 0) {
      console.log("\n❌ No matches found.");
      console.log("   Possible causes:");
      console.log("   1. The Atlas Vector Search index 'vector_index' doesn't exist yet");
      console.log("   2. The index is still building (check Atlas UI)");
      console.log("   3. No relevant content in the knowledge base");
    } else {
      let totalRetrievedTokens = 0;

      results.forEach((row: any, i: number) => {
        totalRetrievedTokens += row.tokenEstimate || 0;
        console.log(
          `\n  Match #${i + 1}  |  Score: ${row.score?.toFixed(4)}  |  Tokens: ~${row.tokenEstimate}`
        );
        console.log(`  File:    ${row.sourceFile} (chunk ${row.chunkIndex + 1}/${row.totalChunks})`);
        console.log(`  Title:   ${row.title}`);
        console.log(`  Section: ${row.headings?.join(" > ") || "Overview"}`);
        console.log(`  URL:     ${row.sourceUrl}`);
        console.log(`  Keywords: [${row.keywords?.slice(0, 8).join(", ")}]`);
        console.log("  " + "─".repeat(56));
        // Print first 300 chars of raw text
        const preview = (row.rawText || "").substring(0, 300);
        console.log(`  ${preview}${preview.length >= 300 ? "..." : ""}`);
      });

      console.log("\n" + "═".repeat(60));
      console.log(`  Total retrieved tokens: ~${totalRetrievedTokens}`);
      console.log("═".repeat(60));
    }
  } catch (error: any) {
    console.error("\n❌ Vector Search failed:", error.message);

    if (
      error.message?.includes("PlanExecutor") ||
      error.message?.includes("vector_index") ||
      error.codeName === "InvalidPipelineOperator"
    ) {
      console.log("\n" + "═".repeat(60));
      console.log("  ⚠️  ATLAS VECTOR SEARCH INDEX NOT FOUND");
      console.log("═".repeat(60));
      console.log("  You need to create the index in MongoDB Atlas:");
      console.log("  1. Go to Atlas → your cluster → Atlas Search");
      console.log("  2. Create Search Index → Atlas Vector Search → JSON Editor");
      console.log("  3. Database: chatbot_db  |  Collection: kb_chunks");
      console.log("  4. Index name: vector_index");
      console.log("  5. Paste this JSON:");
      console.log(
        JSON.stringify(
          {
            fields: [
              {
                type: "vector",
                path: "embedding",
                numDimensions: parseInt(process.env.CHATBOT_EMBEDDING_DIMENSIONS || "768", 10),
                similarity: "cosine",
              },
            ],
          },
          null,
          4
        )
      );
      console.log("  6. Create and wait ~2 minutes for it to build");
      console.log("═".repeat(60));
    }
  } finally {
    await conn.close();
    console.log("\nConnection closed.");
  }
}

runTestSearch().catch((error) => {
  console.error("Script crashed:", error);
  process.exit(1);
});
