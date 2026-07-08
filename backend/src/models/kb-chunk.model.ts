import mongoose, { Schema, Model } from "mongoose";
import dns from "dns";

// Configure DNS resolution just like the main db connection to bypass SRV DNS issues
try {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
} catch (e: any) {
  console.warn("⚠️ Failed to set custom DNS servers for chatbot connection:", e.message);
}

export interface IKBChunk {
  text: string;             // Context-enriched text (embedded & sent to LLM)
  rawText: string;          // Original raw text chunk
  embedding: number[];      // 768-dimensional vector from Gemini
  sourceFile: string;       // e.g. "sales-module.md"
  sourceUrl: string;        // e.g. "/sales/invoices"
  title: string;            // Document title
  headings: string[];       // Heading path e.g. ["Invoices", "Payments"]
  sectionDepth: number;     // Heading depth (1 = H1, 2 = H2, etc.)
  chunkIndex: number;
  totalChunks: number;      // Total chunks in this source file
  tokenEstimate: number;    // Approximate token count for LLM context budgeting
  contentHash: string;      // MD5 hash
  keywords: string[];       // Extracted keywords for hybrid search fallback
  createdAt: Date;
  updatedAt: Date;
}

export const kbChunkSchema = new Schema<IKBChunk>(
  {
    text: { type: String, required: true },
    rawText: { type: String, required: true },
    embedding: { type: [Number], required: true },
    sourceFile: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    title: { type: String, required: true },
    headings: { type: [String], default: [] },
    sectionDepth: { type: Number, default: 1 },
    chunkIndex: { type: Number, required: true },
    totalChunks: { type: Number, default: 0 },
    tokenEstimate: { type: Number, default: 0 },
    contentHash: { type: String, required: true },
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Production compound indexes for efficient lookup patterns
kbChunkSchema.index({ sourceFile: 1, chunkIndex: 1 }, { unique: true });
kbChunkSchema.index({ sourceFile: 1, contentHash: 1 });
kbChunkSchema.index({ title: 1 });
kbChunkSchema.index({ keywords: 1 });

let chatbotConnection: mongoose.Connection | null = null;
let KBChunkModel: Model<IKBChunk> | null = null;

export function getChatbotConnection(): mongoose.Connection {
  if (chatbotConnection && chatbotConnection.readyState !== 0) {
    return chatbotConnection;
  }

  const uri = process.env.CHATBOT_MONGODB_URI;
  if (!uri) {
    throw new Error("CHATBOT_MONGODB_URI is missing from environment variables.");
  }

  chatbotConnection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
    retryWrites: true,
    w: "majority",
  });

  chatbotConnection.on("connected", () => {
    console.log("✅ Chatbot MongoDB cluster connected:", uri.replace(/\/\/.*@/, "//***@"));
  });

  chatbotConnection.on("error", (err) => {
    console.error("❌ Chatbot MongoDB connection error:", err.message);
  });

  chatbotConnection.on("disconnected", () => {
    console.log("⚠️ Chatbot MongoDB disconnected.");
  });

  return chatbotConnection;
}

export function getKBChunkModel(): Model<IKBChunk> {
  if (KBChunkModel) return KBChunkModel;
  const conn = getChatbotConnection();
  KBChunkModel = conn.model<IKBChunk>("KBChunk", kbChunkSchema, "kb_chunks");
  return KBChunkModel;
}
