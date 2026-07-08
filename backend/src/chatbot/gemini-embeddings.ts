/**
 * Gemini Embedding Utility — Production-Grade
 *
 * Uses @google/genai SDK to generate embeddings via the Gemini Embedding API.
 * Supports task-type differentiation:
 *   - RETRIEVAL_DOCUMENT: Used when embedding content for storage (ingestion)
 *   - RETRIEVAL_QUERY:    Used when embedding user queries at search time
 *
 * Includes exponential backoff retry logic for rate-limit resilience.
 */

import { GoogleGenAI } from "@google/genai";

let geminiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. Embedding service requires a Gemini API key."
      );
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

/**
 * Exponential backoff sleep helper.
 * Waits for `baseMs * 2^attempt` with a small jitter to avoid thundering herd.
 */
function backoffSleep(attempt: number, baseMs = 1000): Promise<void> {
  const delay = baseMs * Math.pow(2, attempt) + Math.random() * 500;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Generates an embedding vector for a single text input with task-type awareness.
 *
 * @param text       The text to embed
 * @param taskType   RETRIEVAL_DOCUMENT for ingestion, RETRIEVAL_QUERY for search
 * @returns          768-dimensional number array (configurable via env)
 */
export async function getEmbedding(
  text: string,
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[]> {
  const client = getClient();
  const model = process.env.CHATBOT_EMBEDDING_MODEL || "gemini-embedding-001";
  const dimensions = parseInt(process.env.CHATBOT_EMBEDDING_DIMENSIONS || "768", 10);
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.models.embedContent({
        model,
        contents: text,
        config: {
          outputDimensionality: dimensions,
          taskType,
        },
      });

      // Handle different SDK response shapes
      if (
        response.embeddings &&
        Array.isArray(response.embeddings) &&
        response.embeddings[0]?.values
      ) {
        return response.embeddings[0].values;
      }
      if ((response as any).embedding?.values) {
        return (response as any).embedding.values;
      }

      throw new Error("No embedding values returned in response.");
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.message?.includes("429") ||
        error?.message?.toLowerCase().includes("rate");

      if (isRateLimit && attempt < maxRetries) {
        console.warn(
          `⚠️ Rate limited on embedding attempt ${attempt + 1}/${maxRetries + 1}. Backing off...`
        );
        await backoffSleep(attempt);
        continue;
      }

      console.error(
        `❌ Failed to generate embedding (attempt ${attempt + 1}): "${text.substring(0, 60)}..."`,
        error.message || error
      );
      throw error;
    }
  }

  throw new Error("Exhausted all retry attempts for embedding generation.");
}

/**
 * Generates embedding vectors for a batch of text inputs.
 * Processes in sub-batches of 20, with per-batch retry logic.
 */
export async function getEmbeddingsBatch(
  texts: string[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getClient();
  const model = process.env.CHATBOT_EMBEDDING_MODEL || "gemini-embedding-001";
  const dimensions = parseInt(process.env.CHATBOT_EMBEDDING_DIMENSIONS || "768", 10);

  const batchSize = 20;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const subBatch = texts.slice(i, i + batchSize);
    const batchLabel = `[batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}]`;

    try {
      const response = await client.models.embedContent({
        model,
        contents: subBatch,
        config: {
          outputDimensionality: dimensions,
          taskType,
        },
      });

      if (response.embeddings && Array.isArray(response.embeddings)) {
        for (const emb of response.embeddings) {
          if (emb.values) {
            results.push(emb.values);
          }
        }
      } else {
        throw new Error(`Batch embedding response format unrecognized ${batchLabel}`);
      }
    } catch (error) {
      console.warn(
        `⚠️ Batch embedding failed ${batchLabel}, falling back to sequential:`,
        (error as Error).message
      );
      // Fall back to individual calls with full retry logic
      for (const text of subBatch) {
        const values = await getEmbedding(text, taskType);
        results.push(values);
      }
    }
  }

  return results;
}
