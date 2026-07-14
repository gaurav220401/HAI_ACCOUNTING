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
import { GoogleGenAI } from "@google/genai";

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

// ─── Gemini LLM Client ────────────────────────────────────────────────

let genaiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (!genaiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}

interface AIEnrichmentResult {
  summary: string;
  questions: string[];
}

/**
 * Uses Gemini LLM to generate a summary and hypothetical questions for a chunk of text.
 */
async function generateAIEnrichment(
  rawText: string,
  title: string,
  section: string
): Promise<AIEnrichmentResult> {
  const client = getGenAIClient();
  const model = process.env.CHATBOT_LLM_MODEL || "gemini-2.5-flash";
  const maxRetries = 3;

  const prompt = `Analyze the following markdown content chunk from the "${title}" document (Section: "${section}") of the HAI Accounting software.
Extract and generate:
1. A concise, one-sentence summary of the main points in the content.
2. A list of 3 to 5 realistic, natural user search queries or questions that are directly and clearly answered by this content.

You MUST respond with a valid JSON object matching the following TypeScript interface, with no markdown formatting tags other than the JSON itself. Do not put markdown code fences around the JSON.

Interface:
{
  "summary": string,
  "questions": string[]
}

Content to analyze:
${rawText}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const responseText = response.text?.trim() || "";
      const cleanedJson = responseText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      const result = JSON.parse(cleanedJson) as AIEnrichmentResult;

      if (typeof result.summary !== "string") {
        result.summary = "";
      }
      if (!Array.isArray(result.questions)) {
        result.questions = [];
      }
      return result;
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.toLowerCase().includes("quota") ||
        err?.message?.toLowerCase().includes("rate limit") ||
        err?.status === "RESOURCE_EXHAUSTED" ||
        err?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < maxRetries) {
        let delayMs = 62000; // Default to 1 minute + buffer to clear sliding window
        
        // Attempt to parse explicit retry delay from error message (e.g. "Please retry in 58.64s")
        const delayMatch = err.message?.match(/Please retry in ([\d.]+)s/);
        if (delayMatch?.[1]) {
          const seconds = parseFloat(delayMatch[1]);
          delayMs = Math.ceil((seconds + 1.5) * 1000); // Add 1.5s buffer
        }

        console.warn(
          `  ⚠️ Rate limited on LLM enrichment (attempt ${attempt + 1}/${maxRetries + 1}). Sleeping for ${(delayMs / 1000).toFixed(1)}s before retry...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      console.error(
        `  ❌ AI enrichment failed (attempt ${attempt + 1}/${maxRetries + 1}): ${err.message}`
      );
      if (attempt === maxRetries) {
        return {
          summary: "",
          questions: [],
        };
      }
    }
  }

  return {
    summary: "",
    questions: [],
  };
}

// ─── Main Ingestion Logic ──────────────────────────────────────────────

export async function runIngestion(options?: { force?: boolean; closeConnection?: boolean }): Promise<IngestionStats> {
  const force = options?.force ?? false;
  const closeConnection = options?.closeConnection ?? false;

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
  console.log("  HAI Accounting — Chatbot Knowledge Base Ingestion (AI-Enriched)");
  console.log("  LLM Model:  " + (process.env.CHATBOT_LLM_MODEL || "gemini-2.5-flash"));
  console.log("  Embed Model: " + (process.env.CHATBOT_EMBEDDING_MODEL || "gemini-embedding-001"));
  console.log("  Dimensions:  " + (process.env.CHATBOT_EMBEDDING_DIMENSIONS || "768"));
  console.log("  Task Type:   RETRIEVAL_DOCUMENT");
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
    if (require.main === module) {
      process.exit(1);
    } else {
      throw new Error(`Content directory not found: ${CONTENT_DIR}`);
    }
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

    console.log(`  Chunks: ${docChunks.length}  |  Est. tokens (raw): ${docChunks.reduce((s, c) => s + c.tokenEstimate, 0)}`);

    const activeChunkIndices: number[] = [];

    for (const chunk of docChunks) {
      activeChunkIndices.push(chunk.chunkIndex);
      stats.totalChunks++;

      // Check idempotency: skip if content hash matches AND already has AI enrichment
      let skipChunk = false;
      let existingEnrichment: AIEnrichmentResult | null = null;
      try {
        const existing = await KBChunk.findOne({
          sourceFile: file,
          chunkIndex: chunk.chunkIndex,
        }).select("contentHash summary questions").lean();

        if (
          !force &&
          existing &&
          existing.contentHash === chunk.contentHash &&
          existing.summary &&
          existing.questions &&
          existing.questions.length > 0
        ) {
          skipChunk = true;
          existingEnrichment = {
            summary: existing.summary,
            questions: existing.questions,
          };
        }
      } catch (err: any) {
        console.warn(`  ⚠️ Hash check failed for chunk #${chunk.chunkIndex}: ${err.message}`);
      }

      if (skipChunk) {
        stats.chunksSkipped++;
        stats.totalTokens += chunk.tokenEstimate; 
        continue;
      }

      // Generate AI enrichment (summary & questions)
      console.log(`  🤖 Generating AI enrichment for chunk #${chunk.chunkIndex}...`);
      const headingPath = chunk.headings.join(" > ") || "Overview";
      const enrichment = await generateAIEnrichment(chunk.rawText, chunk.title, headingPath);

      // Re-build text with AI enrichment to optimize vector search matching
      const enrichedText = [
        `Document: ${chunk.title}`,
        `Section: ${headingPath}`,
        `Source: ${chunk.sourceUrl}`,
        `Summary: ${enrichment.summary || "N/A"}`,
        `Questions:`,
        ...(enrichment.questions.length > 0
          ? enrichment.questions.map((q) => `- ${q}`)
          : ["- N/A"]),
        `---`,
        chunk.rawText,
      ].join("\n");

      // Estimate tokens for the fully enriched text
      const tokenEstimate = Math.ceil(enrichedText.length / 4);
      stats.totalTokens += tokenEstimate;

      // Generate embedding with RETRIEVAL_DOCUMENT task type
      let embedding: number[];
      try {
        embedding = await getEmbedding(enrichedText, "RETRIEVAL_DOCUMENT");
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
            text: enrichedText,
            rawText: chunk.rawText,
            embedding,
            sourceFile: chunk.sourceFile,
            sourceUrl: chunk.sourceUrl,
            title: chunk.title,
            headings: chunk.headings,
            sectionDepth: chunk.sectionDepth,
            totalChunks: docChunks.length,
            tokenEstimate,
            contentHash: chunk.contentHash,
            keywords: chunk.keywords,
            summary: enrichment.summary,
            questions: enrichment.questions,
          },
          { upsert: true, returnDocument: "after" }
        );
        stats.chunksUpserted++;
        console.log(`  ✅ Chunk #${chunk.chunkIndex} enriched & embedded (${tokenEstimate} tokens, ${chunk.keywords.length} keywords)`);
      } catch (err: any) {
        const msg = `DB upsert failed for ${file}#${chunk.chunkIndex}: ${err.message}`;
        console.error(`  ❌ ${msg}`);
        stats.errors.push(msg);
      }

      // Respect the Gemini Free Tier 15 RPM rate limit by introducing a short 4.5s request delay
      await new Promise((resolve) => setTimeout(resolve, 4500));
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

  if (closeConnection) {
    await conn.close();
    console.log("Connection closed.");
  }

  return stats;
}

// ─── CLI / Script Mode Support ──────────────────────────────────────────

if (require.main === module) {
  runIngestion({ closeConnection: true })
    .then((stats) => {
      process.exit(stats.errors.length > 0 ? 1 : 0);
    })
    .catch(async (error) => {
      console.error("❌ Ingestion pipeline crashed:", error);
      try {
        const conn = getChatbotConnection();
        await conn.close();
      } catch {
        // Ignore
      }
      process.exit(1);
    });
}
