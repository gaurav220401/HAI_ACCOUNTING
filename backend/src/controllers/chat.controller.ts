/**
 * Chat Controller — RAG Query Pipeline
 *
 * Handles the complete Retrieval-Augmented Generation flow:
 *   1. Validate & sanitize user question
 *   2. Embed the question using Gemini (RETRIEVAL_QUERY task type)
 *   3. Run $vectorSearch on MongoDB Atlas to find relevant chunks
 *   4. Apply relevance threshold to avoid hallucination
 *   5. Build grounded prompt with retrieved context
 *   6. Call Gemini LLM to generate answer
 *   7. Log the interaction for analytics
 *   8. Return answer + source references
 */

import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { getKBChunkModel, getChatbotConnection } from "../models/kb-chunk.model";
import { getEmbedding } from "../chatbot/gemini-embeddings";
import ChatLog from "../models/chat-log.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";

// ─── Configuration ─────────────────────────────────────────────────────

const RELEVANCE_THRESHOLD = 0.60;      // Minimum vector search score
const TOP_K = 5;                        // Number of chunks to retrieve
const NUM_CANDIDATES = 150;             // Candidates for vector search
const MAX_QUESTION_LENGTH = 500;        // Input length limit
const MAX_CONTEXT_TOKENS = 3000;        // Token budget for context chunks

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

// ─── System Prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are HAI Assistant, a helpful AI support agent for HAI Accounting — a professional accounting and business management software for Indian businesses.

RULES:
- Answer the user's question using ONLY the context provided below.
- If the context doesn't contain relevant information, say: "I don't have specific information about that in my knowledge base. Could you rephrase your question or ask about a different topic?"
- Keep answers concise, accurate, and professional.
- Use markdown formatting (bold, lists, code blocks) when it improves readability.
- When referencing features, be specific about navigation paths (e.g., "Go to Sales → Invoices → New Invoice").
- Do not make up features, prices, or capabilities that aren't in the context.
- If the user greets you, respond warmly and mention you can help with questions about HAI Accounting.`;

// ─── Helper: Build Context from Chunks ─────────────────────────────────

function buildContext(chunks: any[]): { context: string; sources: Array<{ title: string; url: string; score: number }> } {
  const sources: Array<{ title: string; url: string; score: number }> = [];
  const contextParts: string[] = [];
  let totalTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = chunk.tokenEstimate || Math.ceil((chunk.rawText || chunk.text || "").length / 4);

    if (totalTokens + chunkTokens > MAX_CONTEXT_TOKENS) {
      break; // Stay within token budget
    }

    totalTokens += chunkTokens;
    contextParts.push(chunk.rawText || chunk.text);

    // Deduplicate sources by URL
    const sourceUrl = chunk.sourceUrl || "";
    if (!sources.some((s) => s.url === sourceUrl)) {
      sources.push({
        title: chunk.title || "Unknown",
        url: sourceUrl,
        score: chunk.score || 0,
      });
    }
  }

  return {
    context: contextParts.join("\n---\n"),
    sources,
  };
}

// ─── Main Chat Handler ────────────────────────────────────────────────

export const handleChat = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    const { question, sessionId: clientSessionId } = req.body;

    // ── Input Validation ──
    if (!question || typeof question !== "string") {
      res.status(400).json({
        success: false,
        message: "A question is required.",
      });
      return;
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      res.status(400).json({
        success: false,
        message: "Question cannot be empty.",
      });
      return;
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        success: false,
        message: `Question is too long. Maximum ${MAX_QUESTION_LENGTH} characters allowed.`,
      });
      return;
    }

    const sessionId = clientSessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const userId = req.user?._id?.toString() || req.firebaseUser?.uid || "anonymous";

    try {
      // ── Step 1: Ensure chatbot DB connection ──
      const conn = getChatbotConnection();
      if (conn.readyState !== 1) {
        await new Promise<void>((resolve, reject) => {
          if (conn.readyState === 1) { resolve(); return; }
          conn.once("connected", resolve);
          conn.once("error", reject);
          setTimeout(() => reject(new Error("Chatbot DB connection timeout")), 10000);
        });
      }

      const KBChunk = getKBChunkModel();

      // ── Step 2: Embed the question ──
      const queryVector = await getEmbedding(trimmedQuestion, "RETRIEVAL_QUERY");

      // ── Step 3: Vector Search ──
      const searchResults = await KBChunk.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector,
            numCandidates: NUM_CANDIDATES,
            limit: TOP_K,
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
            chunkIndex: 1,
            totalChunks: 1,
            tokenEstimate: 1,
            keywords: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ]);

      // ── Step 4: Relevance Filtering ──
      const relevantChunks = searchResults.filter(
        (chunk: any) => chunk.score >= RELEVANCE_THRESHOLD
      );

      let answer: string;
      let sources: Array<{ title: string; url: string; score: number }> = [];
      let isFallback = false;

      if (relevantChunks.length === 0) {
        // No relevant content found — return fallback
        isFallback = true;
        answer =
          "I don't have specific information about that in my knowledge base. Could you try rephrasing your question or ask about a feature of HAI Accounting? For example:\n\n" +
          "- How do I create an invoice?\n" +
          "- What is the purchase order workflow?\n" +
          "- How do recurring invoices work?";
      } else {
        // ── Step 5: Build Context ──
        const { context, sources: extractedSources } = buildContext(relevantChunks);
        sources = extractedSources;

        // ── Step 6: Call Gemini LLM ──
        const client = getGenAIClient();
        const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-2.5-flash";

        const userPrompt = `CONTEXT:\n---\n${context}\n---\n\nUSER QUESTION: ${trimmedQuestion}`;

        const response = await client.models.generateContent({
          model: llmModel,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.3,
            maxOutputTokens: 1024,
            topP: 0.8,
          },
        });

        answer = response.text || "I'm sorry, I couldn't generate a response. Please try again.";
      }

      const responseTimeMs = Date.now() - startTime;

      // ── Step 7: Log the interaction ──
      try {
        await ChatLog.create({
          userId,
          sessionId,
          question: trimmedQuestion,
          answer,
          sources,
          chunksRetrieved: relevantChunks.length,
          topScore: relevantChunks[0]?.score || 0,
          responseTimeMs,
          fallback: isFallback,
        });
      } catch (logError) {
        // Logging failure should not block the response
        console.error("Failed to log chat interaction:", logError);
      }

      // ── Step 8: Return response ──
      res.json({
        success: true,
        data: {
          answer,
          sources: sources.map((s) => ({ title: s.title, url: s.url })),
          sessionId,
          responseTimeMs,
        },
      });
    } catch (error: any) {
      console.error("Chat pipeline error:", error);

      // Check for specific error types
      if (error.message?.includes("vector_index") || error.codeName === "InvalidPipelineOperator") {
        res.status(503).json({
          success: false,
          message: "The knowledge base search index is not ready. Please try again later.",
        });
        return;
      }

      if (error.message?.includes("GEMINI_API_KEY") || error.message?.includes("API key")) {
        res.status(503).json({
          success: false,
          message: "AI service is temporarily unavailable. Please try again later.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "An error occurred while processing your question. Please try again.",
      });
    }
  }
);
