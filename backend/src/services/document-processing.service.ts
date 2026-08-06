import crypto from "crypto";
import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { GoogleGenAI } from "@google/genai";
import DocumentModel, { IDocument, DocumentType, ProcessingMode } from "../models/document.model";
import Contact from "../models/contact.model";
import Expense from "../models/expense.model";
import { buildSignedAssetUrl, getCloudinaryResourceType } from "../utils/cloudinary";

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
  /** Set by the model when it cannot actually read the attached file. */
  unreadable?: boolean;
  transactions?: Array<{
    date?: string;
    description?: string;
    debit?: number;
    credit?: number;
    balance?: number;
  }>;
  rawText?: string;
  /** Header details of a bank statement, used to validate completeness. */
  statementMeta?: {
    accountNumber?: string;
    statementPeriodFrom?: string;
    statementPeriodTo?: string;
    openingBalance?: number;
    closingBalance?: number;
    totalPages?: number;
    totalTransactions?: number;
  };
}

type ObjectIdLike = string | { toString(): string } | null | undefined;

let queue: Queue<ProcessJobPayload> | null = null;
let workerStarted = false;
let geminiClient: GoogleGenAI | null = null;
let recoveryTimer: NodeJS.Timeout | null = null;

function nowLog(stage: string, status: "ok" | "warn" | "error", message: string) {
  return { stage, status, message, createdAt: new Date() };
}

function idToString(value: ObjectIdLike): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.toString();
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; name?: string };
  return maybeError.code === 11000 || maybeError.name === "MongoServerError";
}

function parseInvoiceDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

async function resolveOrCreateVendor(
  organizationId: IDocument["organizationId"],
  displayName: string,
  userId?: IDocument["uploadedBy"],
) {
  const trimmed = displayName.trim();
  if (!trimmed) return null;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let existing = await Contact.findOne({
    organizationId,
    isDeleted: false,
    displayName: { $regex: `^${escaped}$`, $options: "i" },
  });

  if (!existing) {
    existing = new Contact({
      organizationId,
      displayName: trimmed,
      companyName: trimmed,
      contactType: "Vendor",
      currency: "INR",
      email: "",
      createdBy: userId || undefined,
      updatedBy: userId || undefined,
    });
    await existing.save();
  }

  return existing;
}

function upsertExpenseDocumentLink(document: IDocument, expenseId: string, linkedBy?: IDocument["uploadedBy"]) {
  const existingIndex = document.links.findIndex((link) => link.entityType === "expense");
  if (existingIndex >= 0) {
    document.links[existingIndex].entityId = expenseId;
    document.links[existingIndex].linkedAt = new Date();
    document.links[existingIndex].linkedBy = linkedBy || undefined;
    document.links[existingIndex].linkSource = "auto";
    return;
  }

  document.links.push({
    entityType: "expense",
    entityId: expenseId,
    linkedAt: new Date(),
    linkedBy: linkedBy || undefined,
    linkSource: "auto",
  });
}

async function autoCreateExpenseFromDocument(document: IDocument): Promise<void> {
  const autoCreateEnabled = process.env.DOCUMENTS_AUTO_CREATE_EXPENSE !== "false";
  if (!autoCreateEnabled) return;
  if (document.processingStatus !== "PROCESSED") return;
  if (document.documentType === "bank_statement") return;

  const linkedExpenseId = document.links.find((link) => link.entityType === "expense")?.entityId;
  if (linkedExpenseId) return;

  const extractedAmount = Number(document.extraction?.amount || 0);
  if (!Number.isFinite(extractedAmount) || extractedAmount <= 0) {
    document.processingLogs.push(
      nowLog("auto_create_expense", "warn", "Skipped auto-create: extracted amount is missing"),
    );
    document.activityLogs.push({
      eventType: "expense_auto_create_skipped",
      message: "Expense auto-create skipped: amount missing",
      payload: {
        documentType: document.documentType,
        amount: document.extraction?.amount ?? null,
      },
      createdAt: new Date(),
    });
    return;
  }

  const existing = await Expense.findOne({
    organizationId: document.organizationId,
    sourceDocumentId: document._id,
    isDeleted: false,
  })
    .select("_id expenseNumber")
    .lean();

  if (existing) {
    upsertExpenseDocumentLink(document, String(existing._id), document.uploadedBy);
    document.processingLogs.push(
      nowLog("auto_create_expense", "ok", `Linked existing expense ${existing.expenseNumber}`),
    );
    return;
  }

  const actorId = document.uploadedBy || document.createdBy || undefined;
  const vendorName = (document.extraction?.vendorName || "").trim();
  const vendor = vendorName
    ? await resolveOrCreateVendor(document.organizationId, vendorName, actorId)
    : null;

  const invoiceDate = parseInvoiceDate(document.extraction?.invoiceDate, document.uploadedAt || new Date());
  const currency = (document.extraction?.currency || "INR").trim().toUpperCase() || "INR";
  const invoiceNumber = (document.extraction?.invoiceNumber || "").trim();

  const expense = new Expense({
    organizationId: document.organizationId,
    expenseType: "Regular",
    date: invoiceDate,
    amount: extractedAmount,
    currency,
    vendorId: vendor?._id || null,
    invoiceNumber,
    notes: `Auto-created from document ${document.fileName}`,
    receiptUrls: document.url ? [document.url] : [],
    sourceDocumentId: document._id,
    status: "Draft",
    createdBy: actorId,
    updatedBy: actorId,
  });

  try {
    await expense.save();
    upsertExpenseDocumentLink(document, idToString(expense._id), document.uploadedBy);
    document.processingLogs.push(
      nowLog("auto_create_expense", "ok", `Expense ${expense.expenseNumber} created automatically`),
    );
    document.activityLogs.push({
      eventType: "expense_auto_created",
      message: `Expense ${expense.expenseNumber} auto-created from document`,
      payload: {
        expenseId: String(expense._id),
        expenseNumber: expense.expenseNumber,
        amount: extractedAmount,
        currency,
      },
      actorId: actorId || undefined,
      createdAt: new Date(),
    });
  } catch (error: unknown) {
    if (isDuplicateKeyError(error)) {
      const duplicateExpense = await Expense.findOne({
        organizationId: document.organizationId,
        sourceDocumentId: document._id,
        isDeleted: false,
      })
        .select("_id expenseNumber")
        .lean();

      if (duplicateExpense) {
        upsertExpenseDocumentLink(document, String(duplicateExpense._id), document.uploadedBy);
        document.processingLogs.push(
          nowLog(
            "auto_create_expense",
            "ok",
            `Linked existing expense ${duplicateExpense.expenseNumber} after duplicate retry`,
          ),
        );
        return;
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    document.processingLogs.push(
      nowLog("auto_create_expense", "error", `Failed to auto-create expense: ${message}`),
    );
    document.activityLogs.push({
      eventType: "expense_auto_create_failed",
      message: "Expense auto-create failed",
      payload: { reason: message },
      actorId: actorId || undefined,
      createdAt: new Date(),
    });
  }
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

/**
 * Raised when the source file cannot be handed to the model.
 *
 * This MUST NOT be swallowed. Files are uploaded to Cloudinary with delivery
 * type "authenticated", so the stored `url` (secure_url) is not publicly
 * fetchable — it needs signing, exactly as the preview endpoint does. When this
 * previously returned null the caller carried on and prompted the model with
 * nothing but a filename, and the model duly invented a plausible bank
 * statement. Fabricated financial data is far worse than a failed import, so
 * every load failure now surfaces as an error.
 */
class DocumentUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentUnreadableError";
  }
}

async function loadInlineDocumentPart(document: IDocument): Promise<{
  mimeType: string;
  data: string;
}> {
  const maxInlineBytes = Math.max(
    1024 * 512,
    Number(process.env.DOCUMENTS_GEMINI_MAX_INLINE_BYTES || 18 * 1024 * 1024),
  );

  // Prefer a signed URL — required for "authenticated" delivery-type assets.
  let fetchUrl = document.url;
  if (document.cloudinaryPublicId) {
    try {
      fetchUrl = buildSignedAssetUrl(
        document.cloudinaryPublicId,
        getCloudinaryResourceType(document.extension, document.mimeType),
        600,
        undefined,
        document.extension,
      );
    } catch (error: any) {
      // Fall back to the stored URL; the fetch below will surface any problem.
      console.warn("Signed URL build failed, falling back to stored URL:", error?.message || error);
    }
  }

  if (!fetchUrl) {
    throw new DocumentUnreadableError("File has no accessible storage URL");
  }

  let response: Response;
  try {
    response = await fetch(fetchUrl);
  } catch (error: any) {
    throw new DocumentUnreadableError(
      `Could not download the file from storage: ${error?.message || error}`,
    );
  }

  if (!response.ok) {
    throw new DocumentUnreadableError(
      `Storage returned ${response.status} ${response.statusText} for this file`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) {
    throw new DocumentUnreadableError("Downloaded file was empty");
  }
  if (bytes.length > maxInlineBytes) {
    throw new DocumentUnreadableError(
      `File is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, larger than the ` +
      `${(maxInlineBytes / 1024 / 1024).toFixed(0)} MB limit. Split the statement into smaller files and upload separately.`,
    );
  }

  const mimeType =
    document.mimeType ||
    response.headers.get("content-type") ||
    "application/octet-stream";

  return { mimeType, data: bytes.toString("base64") };
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

function resolveGeminiModel(mode: ProcessingMode): string {
  return mode === "advanced"
    ? process.env.DOCUMENTS_GEMINI_MODEL_ADVANCED ||
    process.env.DOCUMENTS_GEMINI_MODEL ||
    "gemini-3-flash-preview"
    : process.env.DOCUMENTS_GEMINI_MODEL_BASIC ||
    process.env.DOCUMENTS_GEMINI_MODEL ||
    "gemini-3-flash-preview";
}

const NO_INVENTION_RULE = [
  "CRITICAL: Only report values that are literally visible in the attached document.",
  "Never guess, never fill gaps with plausible examples, never invent transactions.",
  "If the document is unreadable or is not the expected type, return the JSON field",
  '"unreadable": true and an empty transactions array. Do NOT return sample data.',
].join(" ");

async function callGemini(
  ai: GoogleGenAI,
  model: string,
  parts: Array<Record<string, unknown>>,
  maxOutputTokens: number,
): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { responseMimeType: "application/json", maxOutputTokens },
    });
    const textField = (response as unknown as { text?: string | (() => string) }).text;
    return typeof textField === "function"
      ? textField()
      : typeof textField === "string"
        ? textField
        : null;
  } catch (error: any) {
    const message = String(error?.message || error || "");
    if (
      message.includes("RESOURCE_EXHAUSTED") ||
      message.toLowerCase().includes("quota") ||
      message.includes("429")
    ) {
      throw new DocumentUnreadableError(
        "The document AI quota is exhausted. Try again later.",
      );
    }
    throw new DocumentUnreadableError(`Document AI request failed: ${message}`);
  }
}

interface StatementMetadata {
  unreadable?: boolean;
  accountNumber?: string;
  statementPeriodFrom?: string;
  statementPeriodTo?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalPages?: number;
  totalTransactions?: number;
}

/**
 * Pass 1 for bank statements: read the header/summary only.
 *
 * This is cheap, and it gives us the page count and the opening/closing balance
 * that later passes are validated against — a statement that reports 32 pages
 * but yields 7 rows is then provably incomplete rather than silently accepted.
 */
async function extractStatementMetadata(
  ai: GoogleGenAI,
  model: string,
  inlineDoc: { mimeType: string; data: string },
  pdfPassword?: string,
): Promise<StatementMetadata | null> {
  const prompt = [
    "You are reading a bank account statement PDF.",
    NO_INVENTION_RULE,
    "Return strict JSON only with these fields:",
    "unreadable (boolean), accountNumber (string), statementPeriodFrom (YYYY-MM-DD),",
    "statementPeriodTo (YYYY-MM-DD), openingBalance (number), closingBalance (number),",
    "totalPages (number - the printed page count, e.g. 'Page 1 of 32' means 32),",
    "totalTransactions (number - your best count of transaction rows in the whole document).",
    pdfPassword ? `The PDF password is: ${pdfPassword}` : "",
  ].filter(Boolean).join("\n");

  const text = await callGemini(
    ai,
    model,
    [{ text: prompt }, { inlineData: inlineDoc }],
    2048,
  );
  if (!text) return null;
  return parseGeminiJsonPayload(text) as StatementMetadata | null;
}

interface RawTxn {
  date?: string;
  description?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

/**
 * Pass 2 for bank statements: pull transaction rows for a page window.
 *
 * A 32-page statement holds many hundreds of rows — far more than fits in one
 * reliable JSON response, which is why a single-shot extraction silently
 * truncates. Windowing keeps each response small enough to come back complete.
 */
async function extractStatementPage(
  ai: GoogleGenAI,
  model: string,
  inlineDoc: { mimeType: string; data: string },
  fromPage: number,
  toPage: number,
  pdfPassword?: string,
): Promise<RawTxn[]> {
  const prompt = [
    "You are reading a bank account statement PDF.",
    NO_INVENTION_RULE,
    `Extract EVERY transaction row printed on pages ${fromPage} to ${toPage} inclusive.`,
    "Do not skip rows. Do not summarise. Preserve the original row order.",
    "",
    "Return strict JSON only: { \"transactions\": [ ... ] }",
    "Each transaction has:",
    "  date        - the transaction date as YYYY-MM-DD",
    "  description - the full narration text, joined into one line",
    "  debit       - amount withdrawn (money OUT), as a number; 0 if none",
    "  credit      - amount deposited (money IN), as a number; 0 if none",
    "  balance     - the running balance printed on that row, as a number",
    "",
    "A row has EITHER a debit OR a credit, never both. Strip thousands separators",
    "and any Cr/Dr suffix, returning plain numbers (e.g. '1,52,513.14Cr' -> 152513.14).",
    pdfPassword ? `The PDF password is: ${pdfPassword}` : "",
  ].filter(Boolean).join("\n");

  const text = await callGemini(
    ai,
    model,
    [{ text: prompt }, { inlineData: inlineDoc }],
    32768,
  );
  if (!text) return [];

  const payload = parseGeminiJsonPayload(text) as { transactions?: RawTxn[] } | null;
  return Array.isArray(payload?.transactions) ? payload!.transactions! : [];
}

async function extractWithGemini(
  document: IDocument,
  mode: ProcessingMode,
  pdfPassword?: string,
): Promise<GeminiExtraction | null> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new DocumentUnreadableError(
      "Document AI is not configured (GEMINI_API_KEY missing), so this file cannot be read.",
    );
  }

  const model = resolveGeminiModel(mode);

  // Throws DocumentUnreadableError rather than silently returning nothing —
  // the model must never be asked to extract from a file it cannot see.
  const inlineDoc = await loadInlineDocumentPart(document);

  if (document.documentType === "bank_statement") {
    return extractBankStatement(ai, model, document, inlineDoc, pdfPassword);
  }

  const prompt = [
    "Extract accounting document metadata and OCR text as strict JSON only.",
    NO_INVENTION_RULE,
    "Return only JSON with fields: vendorName, amount, invoiceNumber, date, confidence, rawText, unreadable",
    pdfPassword ? `The PDF password is: ${pdfPassword}` : "",
  ].filter(Boolean).join("\n");

  const text = await callGemini(
    ai,
    model,
    [{ text: prompt }, { inlineData: inlineDoc }],
    8192,
  );
  if (!text) return null;
  return parseGeminiJsonPayload(text);
}

// Each window re-sends the whole PDF, so larger windows mean fewer round-trips
// and lower cost; smaller windows mean less risk of a truncated response.
// 8 pages of a dense statement is roughly 280 rows, comfortably inside the
// 32k output-token budget set in extractStatementPage.
const PAGES_PER_WINDOW = Number(process.env.DOCUMENTS_STATEMENT_PAGES_PER_WINDOW || 8);
const MAX_STATEMENT_PAGES = Number(process.env.DOCUMENTS_STATEMENT_MAX_PAGES || 120);

/** Stable identity for a statement row, used to drop overlap between windows. */
function txnKey(txn: RawTxn): string {
  return [
    String(txn.date || ""),
    String(txn.description || "").toLowerCase().replace(/\s+/g, " ").trim(),
    Number(txn.debit || 0).toFixed(2),
    Number(txn.credit || 0).toFixed(2),
    txn.balance == null ? "" : Number(txn.balance).toFixed(2),
  ].join("|");
}

async function extractBankStatement(
  ai: GoogleGenAI,
  model: string,
  document: IDocument,
  inlineDoc: { mimeType: string; data: string },
  pdfPassword?: string,
): Promise<GeminiExtraction> {
  const meta = await extractStatementMetadata(ai, model, inlineDoc, pdfPassword);

  if (meta?.unreadable) {
    throw new DocumentUnreadableError(
      "The document AI could not read this file. If it is password-protected, remove the password and upload again.",
    );
  }

  const totalPages = Math.min(
    Math.max(1, Number(meta?.totalPages || 1)),
    MAX_STATEMENT_PAGES,
  );

  const seen = new Set<string>();
  const collected: RawTxn[] = [];

  for (let from = 1; from <= totalPages; from += PAGES_PER_WINDOW) {
    const to = Math.min(from + PAGES_PER_WINDOW - 1, totalPages);
    const rows = await extractStatementPage(ai, model, inlineDoc, from, to, pdfPassword);
    for (const row of rows) {
      const key = txnKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(row);
    }
  }

  return {
    confidence: collected.length > 0 ? 0.9 : 0.1,
    rawText: "",
    transactions: collected,
    // Carried through for the balance-chain validation performed by the caller.
    statementMeta: meta || undefined,
  } as GeminiExtraction;
}

// parseTransactionsFromText was removed. It regex-scraped amounts out of OCR
// text and guessed which column they belonged to — its debit/credit ternary had
// identical branches, so every row was booked as a debit regardless of
// direction. Statement rows now come from the structured, balance-validated
// extraction path instead.

async function markProcessingFailure(doc: IDocument, error: any): Promise<void> {
  const reason = String(error?.message || "Unknown processing error");
  doc.processingStatus = "UNREADABLE";
  // Surface the actual reason — "scan could not be completed" told nobody
  // anything, and a silent failure here is what let invented data through.
  doc.errorMessage = reason;
  doc.processingLogs.push(nowLog("pipeline", "error", reason));
  doc.activityLogs.push({
    eventType: "processing_failed",
    message: "Simple failed",
    payload: { reason: error?.message || "Unknown processing error" },
    createdAt: new Date(),
  });
  await doc.save();
}

/**
 * Bank statements carry their own checksum: every row prints the running
 * balance after that transaction. If the extraction is faithful and complete,
 * consecutive balances must differ by exactly that row's amount.
 *
 * Rows may be printed newest-first or oldest-first, so both directions are
 * scored and the better one wins. A low score means rows were misread, dropped,
 * or (previously) invented — none of which should reach the ledger unflagged.
 */
function scoreBalanceChain(
  rows: Array<{ debit: number; credit: number; balance?: number }>,
): { checked: number; matched: number; ratio: number } {
  const withBalance = rows.filter((r) => typeof r.balance === "number" && Number.isFinite(r.balance));
  if (withBalance.length < 2) return { checked: 0, matched: 0, ratio: 0 };

  const score = (descending: boolean) => {
    let matched = 0;
    let checked = 0;
    for (let i = 1; i < withBalance.length; i += 1) {
      const prev = withBalance[i - 1];
      const curr = withBalance[i];
      // Newest-first: prev is the later row, so prev.balance derives from curr.balance.
      const [base, applied] = descending ? [curr, prev] : [prev, curr];
      const expected = Number(base.balance) - Number(applied.debit || 0) + Number(applied.credit || 0);
      checked += 1;
      if (Math.abs(expected - Number(applied.balance)) < 0.02) matched += 1;
    }
    return { checked, matched };
  };

  const desc = score(true);
  const asc = score(false);
  const best = desc.matched >= asc.matched ? desc : asc;

  return {
    checked: best.checked,
    matched: best.matched,
    ratio: best.checked === 0 ? 0 : best.matched / best.checked,
  };
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

  // Throws DocumentUnreadableError when the file cannot be read; the caller
  // records that as a real failure instead of substituting invented data.
  const gemini = await extractWithGemini(document, document.processingMode, pdfPassword);

  if (gemini?.unreadable) {
    throw new DocumentUnreadableError(
      "The document AI reported it could not read this file. If it is password-protected, remove the password and upload again.",
    );
  }

  const isStatement = document.documentType === "bank_statement";

  const amount = gemini?.amount ?? fallback.amount;
  const vendorName = gemini?.vendorName || "";
  const invoiceNumber = gemini?.invoiceNumber ?? fallback.invoiceNumber ?? "";
  const invoiceDate = gemini?.date ? new Date(gemini.date) : fallback.invoiceDate ?? null;
  const rawText = gemini?.rawText || "";

  const bankTransactions = isStatement
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

  let confidence = Math.max(
    0,
    Math.min(1, Number(gemini?.confidence ?? (amount || vendorName ? 0.68 : 0.22))),
  );

  if (isStatement) {
    if (bankTransactions.length === 0) {
      throw new DocumentUnreadableError(
        "No transactions could be read from this statement. If it is password-protected, remove the password and upload again.",
      );
    }

    const chain = scoreBalanceChain(bankTransactions);
    const meta = gemini?.statementMeta;
    const expected = Number(meta?.totalTransactions || 0);
    const completeness = expected > 0 ? bankTransactions.length / expected : 1;

    document.processingLogs.push(
      nowLog(
        "validate",
        chain.ratio >= 0.9 ? "ok" : "warn",
        `Balance check: ${chain.matched}/${chain.checked} rows reconcile ` +
        `(${(chain.ratio * 100).toFixed(0)}%). Extracted ${bankTransactions.length} rows` +
        (expected > 0 ? ` of about ${expected} expected.` : "."),
      ),
    );

    // The chain is the strongest signal available; weight confidence on it.
    if (chain.checked > 0) {
      confidence = Math.min(confidence, 0.35 + chain.ratio * 0.6);
    }
    if (completeness < 0.8) {
      confidence = Math.min(confidence, 0.5);
      document.processingLogs.push(
        nowLog("validate", "warn", "Fewer rows extracted than the statement appears to contain."),
      );
    }
  }

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

  if (!isStatement && confidence < 0.35 && !amount && !vendorName && !invoiceNumber) {
    document.processingStatus = "UNREADABLE";
    if (document.extension?.toLowerCase() === "pdf" && !pdfPassword) {
      document.errorMessage = "Could not extract fields. If this PDF is password-protected, submit password and reprocess.";
    } else {
      document.errorMessage = "Could not extract structured fields from this file";
    }
    document.processingLogs.push(nowLog("ai_extract", "warn", "Low confidence extraction"));
  } else {
    document.processingStatus = "PROCESSED";
    document.errorMessage = "";
    document.processingLogs.push(nowLog("ai_extract", "ok", "Document extracted successfully"));
  }

  await autoCreateExpenseFromDocument(document);

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
