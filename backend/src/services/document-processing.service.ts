import crypto from "crypto";
import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { GoogleGenAI } from "@google/genai";
import DocumentModel, { IDocument, DocumentType, ProcessingMode } from "../models/document.model";

interface ProcessJobPayload {
  documentId: string;
  pdfPassword?: string;
}

interface GeminiExtraction {
  vendorName?: string;
  amount?: number;
  invoiceNumber?: string;
  date?: string;
  confidence?: number;
  transactions?: Array<{
    date?: string;
    description?: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }>;
  rawText?: string;
}

let queue: Queue<ProcessJobPayload> | null = null;
let workerStarted = false;
let geminiClient: GoogleGenAI | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;

function nowLog(stage: string, status: "ok" | "warn" | "error", message: string) {
  return { stage, status, message, createdAt: new Date() };
}

function inferDocumentType(fileName: string, mimeType: string, inboxType: string): DocumentType {
  const lower = `${fileName} ${mimeType}`.toLowerCase();
  if (inboxType === "bank_statements") return "bank_statement";
  if (lower.includes("bank") || lower.includes("statement")) return "bank_statement";
  if (lower.includes("invoice") || lower.includes("inv")) return "invoice";
  if (lower.includes("receipt") || lower.includes("bill")) return "receipt";
  return "generic";
}

function fallbackExtractFromHints(fileName: string, hintText = "") {
  const text = `${fileName} ${hintText}`;
  const amountMatch = text.match(/(?:rs\.?|inr|amount)\s*[:\-]?\s*(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)/i);
  const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const invMatch = text.match(/(?:invoice|inv)\s*#?\s*[:\-]?\s*([A-Za-z0-9\-\/]+)/i);

  return {
    amount: amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : undefined,
    invoiceNumber: invMatch?.[1],
    invoiceDate: dateMatch ? new Date(dateMatch[1]) : undefined,
  };
}

function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (process.env.DOCUMENTS_DISABLE_GEMINI === "true") return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

async function loadInlineDocumentPart(document: IDocument): Promise<{
  mimeType: string;
  data: string;
} | null> {
  if (!document.url) return null;

  const maxInlineBytes = Math.max(
    1024 * 512,
    Number(process.env.DOCUMENTS_GEMINI_MAX_INLINE_BYTES || 8 * 1024 * 1024),
  );

  try {
    const response = await fetch(document.url);
    if (!response.ok) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxInlineBytes) return null;

    const mimeType =
      response.headers.get("content-type") ||
      document.mimeType ||
      "application/octet-stream";

    return {
      mimeType,
      data: bytes.toString("base64"),
    };
  } catch (error: any) {
    console.warn("Gemini inline document load failed:", error?.message || error);
    return null;
  }
}

function parseGeminiJsonPayload(text: string): GeminiExtraction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as GeminiExtraction;
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced.trim()) as GeminiExtraction;
    } catch {
      return null;
    }
  }
}

async function extractWithGemini(
  document: IDocument,
  mode: ProcessingMode,
  pdfPassword?: string,
): Promise<GeminiExtraction | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const model =
    mode === "advanced"
      ? process.env.DOCUMENTS_GEMINI_MODEL_ADVANCED ||
        process.env.DOCUMENTS_GEMINI_MODEL ||
        "gemini-3-flash-preview"
      : process.env.DOCUMENTS_GEMINI_MODEL_BASIC ||
        process.env.DOCUMENTS_GEMINI_MODEL ||
        "gemini-3-flash-preview";

  const prompt = [
    "Extract accounting document metadata and OCR text as strict JSON only.",
    "Return only JSON with fields: vendorName, amount, invoiceNumber, date, confidence, rawText, transactions[]",
    "transactions fields: date, description, debit, credit, balance",
    `fileName: ${document.fileName}`,
    `mimeType: ${document.mimeType}`,
    `documentType: ${document.documentType}`,
    `emailSubject: ${document.emailSubject || ""}`,
    pdfPassword ? `pdfPassword: ${pdfPassword}` : "",
  ].join("\n");

  const inlineDoc = await loadInlineDocumentPart(document);
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (inlineDoc) {
    parts.push({ inlineData: inlineDoc });
  }

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json" },
    });
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.toLowerCase().includes("quota") ||
      message.includes("429")
    ) {
      console.warn("Gemini quota exhausted; continuing with fallback extraction only.");
      return null;
    }
    console.warn("Gemini extraction failed; continuing with fallback extraction:", message);
    return null;
  }

  const textField = (response as unknown as { text?: string | (() => string) }).text;
  const text =
    typeof textField === "function"
      ? textField()
      : typeof textField === "string"
        ? textField
        : "";
  if (!text) return null;

  return parseGeminiJsonPayload(text);
}

function parseTransactionsFromText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const txns: Array<{
    txnDate?: Date;
    description: string;
    debit: number;
    credit: number;
    balance?: number;
    confidence: number;
    addedToBank: boolean;
  }> = [];

  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/);
    const amountMatches = line.match(/-?\d+(?:,\d{2,3})*(?:\.\d{1,2})?/g);
    if (!dateMatch || !amountMatches || amountMatches.length === 0) continue;

    const parsed = amountMatches
      .map((v) => Number(v.replace(/,/g, "")))
      .filter((n) => Number.isFinite(n));
    if (parsed.length === 0) continue;

    const debit = parsed.length > 1 ? Math.max(parsed[0], 0) : Math.max(parsed[0], 0);
    const credit = parsed.length > 1 ? Math.max(parsed[1], 0) : 0;
    const balance = parsed.length > 2 ? parsed[2] : undefined;

    txns.push({
      txnDate: new Date(dateMatch[1]),
      description: line,
      debit,
      credit,
      balance,
      confidence: 0.62,
      addedToBank: false,
    });
  }

  return txns;
}

async function markProcessingFailure(doc: IDocument, error: any): Promise<void> {
  doc.processingStatus = "UNREADABLE";
  doc.errorMessage = "Simple failed: scan could not be completed";
  doc.processingLogs.push(
    nowLog("pipeline", "error", `Simple failed: ${error?.message || "Unknown processing error"}`),
  );
  doc.activityLogs.push({
    eventType: "processing_failed",
    message: "Simple failed",
    payload: { reason: error?.message || "Unknown processing error" },
    createdAt: new Date(),
  });
  await doc.save();
}

async function processDocument(document: IDocument, pdfPassword?: string): Promise<void> {
  document.processingStatus = "SCAN_IN_PROGRESS";
  document.processingLogs.push(nowLog("pipeline", "ok", "Scan started"));
  document.documentType = inferDocumentType(
    document.fileName,
    document.mimeType,
    document.inboxType,
  );
  await document.save();

  const fallback = fallbackExtractFromHints(
    document.fileName,
    `${document.emailSubject || ""} ${document.emailSender || ""}`,
  );

  const gemini = await extractWithGemini(document, document.processingMode, pdfPassword);
  if (gemini?.rawText) {
    document.processingLogs.push(nowLog("ocr", "ok", "Gemini extracted OCR text"));
  } else {
    document.processingLogs.push(nowLog("ocr", "warn", "Gemini unavailable or no OCR text"));
  }

  const amount = gemini?.amount ?? fallback.amount;
  const vendorName = gemini?.vendorName || "";
  const invoiceNumber = gemini?.invoiceNumber ?? fallback.invoiceNumber ?? "";
  const invoiceDate = gemini?.date
    ? new Date(gemini.date)
    : fallback.invoiceDate ?? null;

  const rawText = gemini?.rawText || "";
  const txnsFromRaw = document.documentType === "bank_statement" ? parseTransactionsFromText(rawText) : [];
  const txnsFromGemini =
    document.documentType === "bank_statement"
      ? (gemini?.transactions || []).map((t) => ({
          txnDate: t.date ? new Date(t.date) : undefined,
          description: t.description || "",
          debit: Number(t.debit || 0),
          credit: Number(t.credit || 0),
          balance: t.balance == null ? undefined : Number(t.balance),
          confidence: gemini?.confidence ?? 0.7,
          addedToBank: false,
        }))
      : [];

  const bankTransactions = txnsFromGemini.length > 0 ? txnsFromGemini : txnsFromRaw;
  const confidence = Math.max(
    0,
    Math.min(1, Number(gemini?.confidence ?? (amount || vendorName ? 0.68 : 0.22))),
  );

  document.extraction = {
    ...document.extraction,
    vendorName,
    amount,
    invoiceNumber,
    invoiceDate,
    confidenceScore: confidence,
    rawOcrText: rawText,
    aiJson: gemini ? (gemini as unknown as Record<string, unknown>) : {},
  };
  document.bankTransactions = bankTransactions as IDocument["bankTransactions"];
  document.processedAt = new Date();

  if (confidence < 0.35 && !amount && !vendorName && !invoiceNumber) {
    document.processingStatus = "UNREADABLE";
    if (document.extension?.toLowerCase() === "pdf" && !pdfPassword) {
      document.errorMessage = "Could not extract fields. If this PDF is password-protected, submit password and reprocess.";
    } else {
      document.errorMessage = "Could not extract structured fields from this file";
    }
    document.processingLogs.push(nowLog("ai_extract", "warn", "Low confidence extraction"));
  } else {
    document.processingStatus = "PROCESSED";
    document.processingLogs.push(nowLog("ai_extract", "ok", "Document extracted successfully"));
  }

  document.activityLogs.push({
    eventType: "processed",
    message: `Document ${document.processingStatus.toLowerCase()}`,
    payload: {
      confidence,
      documentType: document.documentType,
      bankTransactions: document.bankTransactions.length,
      extractionHash: crypto
        .createHash("sha1")
        .update(JSON.stringify(document.extraction || {}))
        .digest("hex"),
    },
    createdAt: new Date(),
  });

  await document.save();
}

async function processDocumentJob(job: Job<ProcessJobPayload>) {
  const doc = await DocumentModel.findById(job.data.documentId);
  if (!doc || doc.isDeleted) return;
  try {
    await processDocument(doc, job.data.pdfPassword);
  } catch (error: any) {
    await markProcessingFailure(doc, error);
  }
}

function ensureQueue() {
  if (!process.env.REDIS_URL) return;
  if (!queue) {
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue<ProcessJobPayload>("documents-processing", { connection });
  }
  if (!workerStarted) {
    workerStarted = true;
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    const worker = new Worker<ProcessJobPayload>("documents-processing", processDocumentJob, {
      connection,
      concurrency: 3,
    });
    worker.on("error", (err) => {
      console.error("Document worker error:", err.message);
    });
  }
}

export function startDocumentProcessingWorker() {
  ensureQueue();
}

async function recoverStaleDocuments(): Promise<void> {
  const staleMinutes = Math.max(2, Number(process.env.DOCUMENTS_SCAN_STALE_MINUTES || 10));
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000);

  const candidates = await DocumentModel.find({
    isDeleted: false,
    $or: [
      { processingStatus: "PROCESSING" },
      { processingStatus: "SCAN_IN_PROGRESS", updatedAt: { $lt: staleBefore } },
    ],
  })
    .select("_id processingStatus")
    .limit(50)
    .lean();

  if (candidates.length === 0) return;

  for (const candidate of candidates) {
    const updated = await DocumentModel.findOneAndUpdate(
      {
        _id: candidate._id,
        isDeleted: false,
        $or: [
          { processingStatus: "PROCESSING" },
          { processingStatus: "SCAN_IN_PROGRESS", updatedAt: { $lt: staleBefore } },
        ],
      },
      {
        $set: { processingStatus: "SCAN_IN_PROGRESS" },
        $push: {
          processingLogs: nowLog("cron", "ok", "Queued by background recovery"),
        },
      },
      { new: true },
    );

    if (!updated) continue;
    await enqueueDocumentProcessing(String(updated._id));
  }
}

export function startDocumentScanRecoveryCron() {
  const enabled = process.env.DOCUMENTS_SCAN_CRON_ENABLED !== "false";
  if (!enabled) return;

  const intervalMs = Math.max(15000, Number(process.env.DOCUMENTS_SCAN_CRON_INTERVAL_MS || 45000));
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
  }

  recoverStaleDocuments().catch((error) => {
    console.warn("Document scan recovery cron failed:", error?.message || error);
  });

  recoveryTimer = setInterval(() => {
    recoverStaleDocuments().catch((error) => {
      console.warn("Document scan recovery cron failed:", error?.message || error);
    });
  }, intervalMs);
}

export async function enqueueDocumentProcessing(documentId: string, pdfPassword?: string): Promise<void> {
  ensureQueue();

  if (queue) {
    await queue.add("process", { documentId, pdfPassword }, { removeOnComplete: 100, removeOnFail: 200 });
    return;
  }

  const doc = await DocumentModel.findById(documentId);
  if (!doc || doc.isDeleted) return;
  try {
    await processDocument(doc, pdfPassword);
  } catch (error: any) {
    await markProcessingFailure(doc, error);
  }
}
