import { Schema, model, Document, Types } from "mongoose";
import { auditTrailPlugin, softDeletePlugin } from "../plugins";

export type DocumentSource = "manual" | "drag_drop" | "email" | "api";
export type DocumentInbox = "all" | "files" | "bank_statements";
export type ProcessingStatus =
  | "PROCESSING"
  | "PROCESSED"
  | "UNREADABLE"
  | "SCAN_IN_PROGRESS";
export type ProcessingMode = "standard" | "advanced";
export type DocumentType = "generic" | "invoice" | "receipt" | "bank_statement" | "other";

export interface IDocumentLink {
  entityType:
    | "expense"
    | "bill"
    | "purchase_order"
    | "sales_invoice"
    | "vendor"
    | "customer"
    | "account";
  entityId: string;
  linkedBy?: Types.ObjectId;
  linkedAt: Date;
  linkSource: "manual" | "suggestion" | "auto";
}

export interface IDocumentBankTransaction {
  txnDate?: Date | null;
  description: string;
  debit: number;
  credit: number;
  balance?: number | null;
  confidence: number;
  addedToBank: boolean;
  ledgerJournalId?: Types.ObjectId | null;
}

export interface IDocumentActivity {
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
  actorId?: Types.ObjectId;
  createdAt: Date;
}

export interface IDocumentProcessingLog {
  stage: string;
  status: "ok" | "warn" | "error";
  message: string;
  createdAt: Date;
}

export interface IDocumentExtraction {
  vendorName?: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  invoiceDate?: Date | null;
  statementDate?: Date | null;
  confidenceScore: number;
  rawOcrText?: string;
  aiJson?: Record<string, unknown>;
}

export interface IDocument extends Document {
  organizationId: Types.ObjectId;
  uploadedBy?: Types.ObjectId;
  source: DocumentSource;
  inboxType: DocumentInbox;
  fileName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  cloudinaryPublicId: string;
  url: string;
  checksum?: string;
  uploadStatus: "uploaded" | "failed";
  processingStatus: ProcessingStatus;
  processingMode: ProcessingMode;
  documentType: DocumentType;
  uploadedAt: Date;
  processedAt?: Date | null;
  folderId?: Types.ObjectId | null;
  emailMessageId?: string;
  emailSender?: string;
  emailSubject?: string;
  extraction: IDocumentExtraction;
  bankTransactions: IDocumentBankTransaction[];
  links: IDocumentLink[];
  activityLogs: IDocumentActivity[];
  processingLogs: IDocumentProcessingLog[];
  errorMessage?: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const documentLinkSchema = new Schema<IDocumentLink>(
  {
    entityType: {
      type: String,
      enum: [
        "expense",
        "bill",
        "purchase_order",
        "sales_invoice",
        "vendor",
        "customer",
        "account",
      ],
      required: true,
    },
    entityId: { type: String, required: true },
    linkedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    linkedAt: { type: Date, default: () => new Date() },
    linkSource: {
      type: String,
      enum: ["manual", "suggestion", "auto"],
      default: "manual",
    },
  },
  { _id: false },
);

const transactionSchema = new Schema<IDocumentBankTransaction>(
  {
    txnDate: { type: Date, default: null },
    description: { type: String, default: "" },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    balance: { type: Number, default: null },
    confidence: { type: Number, default: 0 },
    addedToBank: { type: Boolean, default: false },
    ledgerJournalId: { type: Schema.Types.ObjectId, ref: "Journal", default: null },
  },
  { _id: true },
);

const extractionSchema = new Schema<IDocumentExtraction>(
  {
    vendorName: { type: String, default: "" },
    amount: { type: Number, default: null },
    currency: { type: String, default: "INR" },
    invoiceNumber: { type: String, default: "" },
    invoiceDate: { type: Date, default: null },
    statementDate: { type: Date, default: null },
    confidenceScore: { type: Number, default: 0 },
    rawOcrText: { type: String, default: "" },
    aiJson: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const activitySchema = new Schema<IDocumentActivity>(
  {
    eventType: { type: String, required: true },
    message: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const processingLogSchema = new Schema<IDocumentProcessingLog>(
  {
    stage: { type: String, required: true },
    status: { type: String, enum: ["ok", "warn", "error"], required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const documentSchema = new Schema<IDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    source: {
      type: String,
      enum: ["manual", "drag_drop", "email", "api"],
      default: "manual",
      index: true,
    },
    inboxType: {
      type: String,
      enum: ["all", "files", "bank_statements"],
      default: "files",
      index: true,
    },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, default: "application/octet-stream", index: true },
    extension: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    cloudinaryPublicId: { type: String, required: true },
    url: { type: String, required: true },
    checksum: { type: String, default: "" },
    uploadStatus: { type: String, enum: ["uploaded", "failed"], default: "uploaded" },
    processingStatus: {
      type: String,
      enum: ["PROCESSING", "PROCESSED", "UNREADABLE", "SCAN_IN_PROGRESS"],
      default: "PROCESSING",
      index: true,
    },
    processingMode: { type: String, enum: ["standard", "advanced"], default: "standard" },
    documentType: {
      type: String,
      enum: ["generic", "invoice", "receipt", "bank_statement", "other"],
      default: "generic",
      index: true,
    },
    uploadedAt: { type: Date, default: () => new Date(), index: true },
    processedAt: { type: Date, default: null },
    folderId: { type: Schema.Types.ObjectId, ref: "DocumentFolder", default: null, index: true },
    emailMessageId: { type: String, default: "" },
    emailSender: { type: String, default: "" },
    emailSubject: { type: String, default: "" },
    extraction: { type: extractionSchema, default: () => ({}) },
    bankTransactions: { type: [transactionSchema], default: [] },
    links: { type: [documentLinkSchema], default: [] },
    activityLogs: { type: [activitySchema], default: [] },
    processingLogs: { type: [processingLogSchema], default: [] },
    errorMessage: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentSchema.plugin(auditTrailPlugin);
documentSchema.plugin(softDeletePlugin);
documentSchema.index({ organizationId: 1, uploadedAt: -1 });
documentSchema.index({ organizationId: 1, fileName: 1 });

const DocumentModel = model<IDocument>("DocumentInbox", documentSchema);
export default DocumentModel;
