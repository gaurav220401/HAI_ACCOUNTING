/**
 * Centralized OCR Service
 *
 * Provides a single, reusable Gemini AI-powered OCR pipeline that can be
 * used across any module (invoices, bills, expenses, purchase orders, etc.).
 *
 * Usage:
 *   import { ocrService } from "../services/ocr.service";
 *   const result = await ocrService.extract({ fileBuffer, mimeType, documentType: "invoice" });
 */

import { GoogleGenAI } from "@google/genai";
import { OCR_PROMPTS, AUTO_DETECT_PROMPT, type OcrDocumentType } from "../prompts";

// ─── Types ─────────────────────────────────────────────────────────────

export interface OcrExtractRequest {
  /** Raw file buffer (image or PDF) */
  fileBuffer: Buffer;
  /** MIME type of the file (e.g. "image/png", "application/pdf") */
  mimeType: string;
  /** Original file name (for context hints) */
  fileName?: string;
  /** Which document type prompt to use. "auto" will auto-detect. */
  documentType: OcrDocumentType;
  /** Optional PDF password if the file is encrypted */
  pdfPassword?: string;
}

export interface OcrExtractFromUrlRequest {
  /** Public URL of the file to process */
  fileUrl: string;
  /** MIME type override (auto-detected from response if omitted) */
  mimeType?: string;
  /** Original file name */
  fileName?: string;
  /** Which document type prompt to use */
  documentType: OcrDocumentType;
  /** Optional PDF password */
  pdfPassword?: string;
}

export interface OcrResult {
  success: boolean;
  /** Detected or specified document type */
  documentType: string;
  /** Overall confidence 0–1 */
  confidence: number;
  /** Extracted structured data (shape depends on documentType) */
  extractedData: Record<string, unknown>;
  /** Full raw OCR text */
  rawText: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Gemini model used */
  model: string;
  /** Error message if extraction failed */
  error?: string;
}

// ─── Singleton Gemini Client ───────────────────────────────────────────

let geminiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. OCR service requires a Gemini API key.",
      );
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function getModel(): string {
  return (
    process.env.OCR_GEMINI_MODEL ||
    process.env.DOCUMENTS_GEMINI_MODEL ||
    "gemini-2.0-flash"
  );
}

// ─── JSON Parsing Helpers ──────────────────────────────────────────────

function parseJsonResponse(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // noop
  }

  // Try fenced code block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) {
    try {
      return JSON.parse(fenced.trim());
    } catch {
      // noop
    }
  }

  return null;
}

// ─── Core Extraction Logic ────────────────────────────────────────────

async function runGeminiExtraction(params: {
  prompt: string;
  inlineData: { mimeType: string; data: string };
  model: string;
}): Promise<{ text: string; model: string }> {
  const ai = getClient();

  const parts: Array<Record<string, unknown>> = [
    { text: params.prompt },
    { inlineData: params.inlineData },
  ];

  const response = await ai.models.generateContent({
    model: params.model,
    contents: [{ role: "user", parts }],
    config: { responseMimeType: "application/json" },
  });

  const textField = (response as unknown as { text?: string | (() => string) }).text;
  const text =
    typeof textField === "function"
      ? textField()
      : typeof textField === "string"
        ? textField
        : "";

  return { text, model: params.model };
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Extract structured data from a file buffer using Gemini AI OCR.
 */
async function extract(request: OcrExtractRequest): Promise<OcrResult> {
  const startTime = Date.now();
  const modelName = getModel();

  try {
    // Build the prompt
    let prompt: string;
    if (request.documentType === "auto") {
      prompt = AUTO_DETECT_PROMPT;
    } else {
      prompt = OCR_PROMPTS[request.documentType];
      if (!prompt) {
        return {
          success: false,
          documentType: request.documentType,
          confidence: 0,
          extractedData: {},
          rawText: "",
          processingTimeMs: Date.now() - startTime,
          model: modelName,
          error: `Unknown document type: ${request.documentType}. Supported types: ${Object.keys(OCR_PROMPTS).join(", ")}, auto`,
        };
      }
    }

    // Add file context hints to the prompt
    const contextLines: string[] = [];
    if (request.fileName) contextLines.push(`fileName: ${request.fileName}`);
    contextLines.push(`mimeType: ${request.mimeType}`);
    if (request.pdfPassword) contextLines.push(`pdfPassword: ${request.pdfPassword}`);

    const fullPrompt = `${prompt}\n\n## FILE CONTEXT\n${contextLines.join("\n")}`;

    // Convert buffer to base64 inline data
    const inlineData = {
      mimeType: request.mimeType,
      data: request.fileBuffer.toString("base64"),
    };

    // Run extraction
    const { text, model } = await runGeminiExtraction({
      prompt: fullPrompt,
      inlineData,
      model: modelName,
    });

    const parsed = parseJsonResponse(text);
    if (!parsed) {
      return {
        success: false,
        documentType: request.documentType,
        confidence: 0,
        extractedData: {},
        rawText: text,
        processingTimeMs: Date.now() - startTime,
        model,
        error: "Failed to parse Gemini response as JSON",
      };
    }

    // Normalize the response
    const documentType =
      (parsed.detectedType as string) ||
      (parsed.documentType as string) ||
      request.documentType;
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    const extractedData = (parsed.extractedData as Record<string, unknown>) || parsed;
    const rawText = (parsed.rawText as string) || "";

    return {
      success: true,
      documentType,
      confidence,
      extractedData,
      rawText,
      processingTimeMs: Date.now() - startTime,
      model,
    };
  } catch (error: any) {
    const message = error?.message || "Unknown OCR error";

    // Handle quota exhaustion gracefully
    if (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.toLowerCase().includes("quota") ||
      message.includes("429")
    ) {
      return {
        success: false,
        documentType: request.documentType,
        confidence: 0,
        extractedData: {},
        rawText: "",
        processingTimeMs: Date.now() - startTime,
        model: modelName,
        error: "Gemini API quota exhausted. Please try again later.",
      };
    }

    return {
      success: false,
      documentType: request.documentType,
      confidence: 0,
      extractedData: {},
      rawText: "",
      processingTimeMs: Date.now() - startTime,
      model: modelName,
      error: `OCR extraction failed: ${message}`,
    };
  }
}

/**
 * Extract structured data from a file URL using Gemini AI OCR.
 * Downloads the file first, then processes it.
 */
async function extractFromUrl(request: OcrExtractFromUrlRequest): Promise<OcrResult> {
  const startTime = Date.now();
  const modelName = getModel();

  try {
    // Download the file
    const response = await fetch(request.fileUrl);
    if (!response.ok) {
      return {
        success: false,
        documentType: request.documentType,
        confidence: 0,
        extractedData: {},
        rawText: "",
        processingTimeMs: Date.now() - startTime,
        model: modelName,
        error: `Failed to download file from URL: HTTP ${response.status}`,
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType =
      request.mimeType ||
      response.headers.get("content-type") ||
      "application/octet-stream";

    return extract({
      fileBuffer: buffer,
      mimeType,
      fileName: request.fileName,
      documentType: request.documentType,
      pdfPassword: request.pdfPassword,
    });
  } catch (error: any) {
    return {
      success: false,
      documentType: request.documentType,
      confidence: 0,
      extractedData: {},
      rawText: "",
      processingTimeMs: Date.now() - startTime,
      model: modelName,
      error: `Failed to process URL: ${error?.message || "Unknown error"}`,
    };
  }
}

/**
 * Get list of supported document types.
 */
function getSupportedTypes(): string[] {
  return [...Object.keys(OCR_PROMPTS), "auto"];
}

// ─── Export as singleton service ───────────────────────────────────────

export const ocrService = {
  extract,
  extractFromUrl,
  getSupportedTypes,
};

export default ocrService;
