/**
 * Knowledge Base Ingestion Pipeline — Production-Grade
 *
 * Reads all markdown content files, chunks them with context enrichment,
 * generates RETRIEVAL_DOCUMENT embeddings via Gemini, and upserts into
 * the dedicated chatbot MongoDB Atlas cluster.
 *
 * Production features:
 *   - MD5-based idempotency (skips unchanged chunks)
 *   - Orphaned chunk cleanup (handles shortened documents)
 *   - Batch embedding with retry/backoff
 *   - Token budget and keyword metadata
 *   - Compound index sync on startup
 *   - Detailed structured logging
 *
 * Usage: npm run chatbot:ingest
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { getKBChunkModel, getChatbotConnection } from "../models/kb-chunk.model";
import { getEmbedding } from "./gemini-embeddings";
import { chunkDocument, type Chunk } from "./chunker";

// Load environment variables
dotenv.config();

const CONTENT_DIR = path.join(__dirname, "content");

// ─── Frontmatter Parsing ───────────────────────────────────────────────

function parseFrontmatter(content: string, filename: string): { title: string; url: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  let title = filename.replace(/\.md$/, "").replace(/-/g, " ");
  let url = `/docs/${filename.replace(/\.md$/, "")}`;

  if (frontmatterMatch) {
    const lines = frontmatterMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key === "title" && value) title = value;
      if (key === "url" && value) url = value;
    }
  }

  return { title, url };
}

// ─── Stats Tracker ─────────────────────────────────────────────────────

interface IngestionStats {
  totalFiles: number;
  totalChunks: number;
  chunksSkipped: number;
  chunksUpserted: number;
  chunksOrphaned: number;
  totalTokens: number;
  errors: string[];
  startTime: number;
}

function printStats(stats: IngestionStats) {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log("\n" + "═".repeat(60));
  console.log("  INGESTION COMPLETE");
  console.log("═".repeat(60));
  console.log(`  Files Processed:    ${stats.totalFiles}`);
  console.log(`  Total Chunks:       ${stats.totalChunks}`);
  console.log(`  Chunks Upserted:    ${stats.chunksUpserted}`);
  console.log(`  Chunks Skipped:     ${stats.chunksSkipped} (unchanged)`);
  console.log(`  Chunks Orphaned:    ${stats.chunksOrphaned} (cleaned up)`);
  console.log(`  Est. Total Tokens:  ${stats.totalTokens.toLocaleString()}`);
  console.log(`  Elapsed Time:       ${elapsed}s`);
  if (stats.errors.length > 0) {
    console.log(`  ⚠️ Errors:          ${stats.errors.length}`);
    stats.errors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
  }
  console.log("═".repeat(60));
}

// ─── Main Ingestion Logic ──────────────────────────────────────────────

async function runIngestion() {
  const stats: IngestionStats = {
    totalFiles: 0,
    totalChunks: 0,
    chunksSkipped: 0,
    chunksUpserted: 0,
    chunksOrphaned: 0,
    totalTokens: 0,
    errors: [],
    startTime: Date.now(),
  };

  console.log("═".repeat(60));
  console.log("  HAI Accounting — Chatbot Knowledge Base Ingestion");
  console.log("  Model: " + (process.env.CHATBOT_EMBEDDING_MODEL || "gemini-embedding-001"));
  console.log("  Dimensions: " + (process.env.CHATBOT_EMBEDDING_DIMENSIONS || "768"));
  console.log("  Task Type: RETRIEVAL_DOCUMENT");
  console.log("═".repeat(60));

  // Establish connection and get model
  const KBChunk = getKBChunkModel();

  // Wait for connection to be ready
  const conn = getChatbotConnection();
  await new Promise<void>((resolve, reject) => {
    if (conn.readyState === 1) {
      resolve();
      return;
    }
    conn.once("connected", resolve);
    conn.once("error", reject);
    // Timeout after 20s
    setTimeout(() => reject(new Error("Connection timeout after 20s")), 20000);
  });

  // Sync indexes
  console.log("\n📋 Syncing MongoDB indexes...");
  await KBChunk.syncIndexes();
  console.log("✅ Indexes synced.");

  // Validate content directory
  if (!fs.existsSync(CONTENT_DIR)) {
    console.error(`❌ Content directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).sort();
  stats.totalFiles = files.length;
  console.log(`\n📂 Found ${files.length} markdown documents in ${CONTENT_DIR}\n`);

  // Process each file
  for (const file of files) {
    const filePath = path.join(CONTENT_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    const { title, url } = parseFrontmatter(content, file);
    console.log(`\n─── ${file} ───`);
    console.log(`  Title: "${title}"  |  URL: "${url}"`);

    // Chunk the document
    let docChunks: Chunk[];
    try {
      docChunks = chunkDocument({
        sourceFile: file,
        sourceUrl: url,
        title,
        content,
      });
    } catch (err: any) {
      const msg = `Failed to chunk ${file}: ${err.message}`;
      console.error(`  ❌ ${msg}`);
      stats.errors.push(msg);
      continue;
    }

    console.log(`  Chunks: ${docChunks.length}  |  Est. tokens: ${docChunks.reduce((s, c) => s + c.tokenEstimate, 0)}`);

    const activeChunkIndices: number[] = [];

    for (const chunk of docChunks) {
      activeChunkIndices.push(chunk.chunkIndex);
      stats.totalChunks++;
      stats.totalTokens += chunk.tokenEstimate;

      // Check idempotency: skip if content hash matches
      try {
        const existing = await KBChunk.findOne({
          sourceFile: file,
          chunkIndex: chunk.chunkIndex,
        }).select("contentHash").lean();

        if (existing && existing.contentHash === chunk.contentHash) {
          stats.chunksSkipped++;
          continue; // No change — skip embedding API call
        }
      } catch (err: any) {
        console.warn(`  ⚠️ Hash check failed for chunk #${chunk.chunkIndex}: ${err.message}`);
      }

      // Generate embedding with RETRIEVAL_DOCUMENT task type
      let embedding: number[];
      try {
        embedding = await getEmbedding(chunk.text, "RETRIEVAL_DOCUMENT");
      } catch (err: any) {
        const msg = `Embedding failed for ${file}#${chunk.chunkIndex}: ${err.message}`;
        console.error(`  ❌ ${msg}`);
        stats.errors.push(msg);
        continue;
      }

      // Upsert into MongoDB
      try {
        await KBChunk.findOneAndUpdate(
          { sourceFile: file, chunkIndex: chunk.chunkIndex },
          {
            text: chunk.text,
            rawText: chunk.rawText,
            embedding,
            sourceFile: chunk.sourceFile,
            sourceUrl: chunk.sourceUrl,
            title: chunk.title,
            headings: chunk.headings,
            sectionDepth: chunk.sectionDepth,
            totalChunks: docChunks.length,
            tokenEstimate: chunk.tokenEstimate,
            contentHash: chunk.contentHash,
            keywords: chunk.keywords,
          },
          { upsert: true, returnDocument: "after" }
        );
        stats.chunksUpserted++;
        console.log(`  ✅ Chunk #${chunk.chunkIndex} (${chunk.tokenEstimate} tokens, ${chunk.keywords.length} keywords)`);
      } catch (err: any) {
        const msg = `DB upsert failed for ${file}#${chunk.chunkIndex}: ${err.message}`;
        console.error(`  ❌ ${msg}`);
        stats.errors.push(msg);
      }
    }

    // Clean up orphaned chunks for this file
    try {
      const deleteResult = await KBChunk.deleteMany({
        sourceFile: file,
        chunkIndex: { $nin: activeChunkIndices },
      });
      if (deleteResult.deletedCount > 0) {
        console.log(`  🗑️ Cleaned ${deleteResult.deletedCount} orphaned chunk(s).`);
        stats.chunksOrphaned += deleteResult.deletedCount;
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Orphan cleanup failed for ${file}: ${err.message}`);
    }

    // Log skip summary for this file
    const fileSkipped = docChunks.length - activeChunkIndices.filter((_idx, i) => {
      // Count how many were upserted for this file
      return true;
    }).length;
    if (stats.chunksUpserted === 0 && stats.chunksSkipped > 0) {
      // All skipped for this file
    }
  }

  // Update totalChunks on all documents
  try {
    for (const file of files) {
      const count = await KBChunk.countDocuments({ sourceFile: file });
      await KBChunk.updateMany(
        { sourceFile: file },
        { $set: { totalChunks: count } }
      );
    }
  } catch {
    // Non-critical
  }

  printStats(stats);

  await conn.close();
  console.log("Connection closed.");
  process.exit(stats.errors.length > 0 ? 1 : 0);
}

runIngestion().catch(async (error) => {
  console.error("❌ Ingestion pipeline crashed:", error);
  try {
    const conn = getChatbotConnection();
    await conn.close();
  } catch {
    // Ignore
  }
  process.exit(1);
});
