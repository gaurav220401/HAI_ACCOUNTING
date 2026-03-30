import { Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import mongoose from "mongoose";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import admin from "../config/firebase";
import { buildSignedAssetUrl, uploadBuffer } from "../utils/cloudinary";
import { upload } from "../middlewares/upload";
import { attachUser } from "../plugins";
import DocumentModel from "../models/document.model";
import DocumentFolder from "../models/document-folder.model";
import DocumentMailbox from "../models/document-mailbox.model";
import User from "../models/user.model";
import Contact from "../models/contact.model";
import Expense from "../models/expense.model";
import Bill from "../models/bill.model";
import PurchaseOrder from "../models/purchase-order.model";
import Invoice from "../models/invoice.model";
import Journal from "../models/journal.model";
import Account from "../models/account.model";
import { enqueueDocumentProcessing } from "../services/document-processing.service";

function orgId(req: AuthenticatedRequest): mongoose.Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mailboxDomain() {
  return process.env.DOCUMENTS_MAILBOX_DOMAIN || "inbox.myapp.com";
}

function generateMailboxAddress(organizationId: string) {
  const shortHash = crypto.createHash("sha1").update(organizationId).digest("hex").slice(0, 12);
  return `org-${shortHash}@${mailboxDomain()}`;
}

async function getOrCreateMailbox(req: AuthenticatedRequest) {
  const organizationId = orgId(req);
  let mailbox = await DocumentMailbox.findOne({ organizationId });
  if (!mailbox) {
    const mailboxAddress = generateMailboxAddress(String(organizationId));
    const mailboxToken = crypto.randomBytes(24).toString("hex");
    mailbox = await DocumentMailbox.create({
      organizationId,
      mailboxAddress,
      mailboxToken,
      isActive: true,
    });
  }
  return mailbox;
}

async function resolveOrCreateContact(
  organizationId: mongoose.Types.ObjectId,
  displayName: string,
  type: "Vendor" | "Customer",
) {
  if (!displayName.trim()) return null;

  const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let existing = await Contact.findOne({
    organizationId,
    isDeleted: false,
    displayName: { $regex: `^${escaped}$`, $options: "i" },
  });

  if (!existing) {
    existing = new Contact({
      organizationId,
      displayName,
      companyName: displayName,
      contactType: type,
      currency: "INR",
      email: "",
    });
    await existing.save();
  }

  return existing;
}

async function canAccessFolder(
  req: AuthenticatedRequest,
  folderId: mongoose.Types.ObjectId | null | undefined,
  mode: "read" | "write",
): Promise<boolean> {
  // Keep folder access simple/open unless explicitly locked down.
  if (process.env.DOCUMENTS_FOLDER_OPEN_ACCESS !== "false") return true;
  if (!folderId) return true;
  const folder = await DocumentFolder.findById(folderId).lean();
  if (!folder || folder.isDeleted) return false;

  if (folder.visibilityType === "all_users") return true;
  if (req.user?.roles?.includes("Admin")) return true;

  const userId = String(req.user?._id || "");
  const roles = new Set(req.user?.roles || []);

  return (folder.permissions || []).some((p) => {
    const principalMatch =
      (p.principalType === "user" && p.principalId === userId) ||
      (p.principalType === "role" && roles.has(p.principalId));
    if (!principalMatch) return false;
    if (mode === "read") return p.accessLevel === "read" || p.accessLevel === "write";
    return p.accessLevel === "write";
  });
}

async function ensureDocumentAccess(
  req: AuthenticatedRequest,
  document: { folderId?: mongoose.Types.ObjectId | null },
  mode: "read" | "write",
) {
  const allowed = await canAccessFolder(req, document.folderId || null, mode);
  if (!allowed) {
    throw new ForbiddenError("You do not have permission for this folder");
  }
}

async function nextBillNumber(organizationId: mongoose.Types.ObjectId): Promise<string> {
  const last = await Bill.findOne({ organizationId }).sort({ billNumber: -1 }).select("billNumber").lean();
  if (!last?.billNumber) return "BILL-00001";
  const match = String(last.billNumber).match(/BILL-(\d+)/i);
  if (!match) return "BILL-00001";
  return `BILL-${String(Number(match[1]) + 1).padStart(5, "0")}`;
}

async function nextPONumber(organizationId: mongoose.Types.ObjectId): Promise<string> {
  const last = await PurchaseOrder.findOne({ organizationId })
    .sort({ purchaseOrderNumber: -1 })
    .select("purchaseOrderNumber")
    .lean();
  if (!last?.purchaseOrderNumber) return "PO-00001";
  const match = String(last.purchaseOrderNumber).match(/PO-(\d+)/i);
  if (!match) return "PO-00001";
  return `PO-${String(Number(match[1]) + 1).padStart(5, "0")}`;
}

async function nextInvoiceNumber(organizationId: mongoose.Types.ObjectId): Promise<string> {
  const last = await Invoice.findOne({ organizationId }).sort({ invoiceNumber: -1 }).select("invoiceNumber").lean();
  if (!last?.invoiceNumber) return "INV-000001";
  const match = String(last.invoiceNumber).match(/INV-(\d+)/i);
  if (!match) return "INV-000001";
  return `INV-${String(Number(match[1]) + 1).padStart(6, "0")}`;
}

function guessImapHost(smtpHost: string): string {
  if (!smtpHost) return "";
  if (smtpHost.startsWith("smtp.")) return smtpHost.replace(/^smtp\./, "imap.");
  return smtpHost;
}

// Reusable multer middleware for this module.
export const uploadDocumentFile = upload.single("file");

/** POST /api/documents/upload */
export const uploadDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) throw new ValidationError("No file uploaded");

  const organizationId = orgId(req);
  const source = (req.body.source as string) || "manual";
  const inboxType = (req.body.inboxType as string) || "files";
  const processingMode = (req.body.processingMode as string) || "standard";

  const folder = `documents/${organizationId}`;
  const cloud = await uploadBuffer(req.file.buffer, folder, undefined, "auto", "authenticated");

  const extension = path.extname(req.file.originalname || "").replace(".", "").toLowerCase();
  const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");

  const document = new DocumentModel({
    organizationId,
    uploadedBy: req.user?._id,
    source,
    inboxType,
    fileName: req.file.originalname,
    mimeType: req.file.mimetype || "application/octet-stream",
    extension,
    sizeBytes: req.file.size,
    cloudinaryPublicId: cloud.publicId,
    url: cloud.url,
    checksum,
    processingMode,
    processingStatus: "SCAN_IN_PROGRESS",
    activityLogs: [
      {
        eventType: "uploaded",
        message: `Uploaded via ${source}`,
        actorId: req.user?._id,
        payload: { source, inboxType, size: req.file.size },
      },
    ],
    processingLogs: [
      {
        stage: "upload",
        status: "ok",
        message: "File uploaded and queued for autoscan",
      },
    ],
  });

  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();
  await enqueueDocumentProcessing(String(document._id));

  res.status(201).json({ success: true, data: document });
});

/** GET /api/documents */
export const listDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const {
    inbox = "all",
    status,
    fileType,
    q,
    folderId,
    fromDate,
    toDate,
    page = "1",
    limit = "25",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {
    organizationId,
    isDeleted: false,
  };
  const andClauses: Record<string, unknown>[] = [];

  const allFolders = await DocumentFolder.find({ organizationId, isDeleted: false })
    .select("_id visibilityType permissions")
    .lean();
  const visibleFolderIds: mongoose.Types.ObjectId[] = [];
  for (const folder of allFolders) {
    if (await canAccessFolder(req, folder._id, "read")) {
      visibleFolderIds.push(folder._id as mongoose.Types.ObjectId);
    }
  }
  andClauses.push({
    $or: [
    { folderId: null },
    { folderId: { $exists: false } },
    { folderId: { $in: visibleFolderIds } },
    ],
  });

  if (inbox === "files") filter.documentType = { $ne: "bank_statement" };
  if (inbox === "bank_statements") filter.documentType = "bank_statement";
  if (status) filter.processingStatus = status;
  if (fileType) filter.extension = fileType.toLowerCase();
  if (folderId) {
    const folderObjectId = new mongoose.Types.ObjectId(folderId);
    const allowed = await canAccessFolder(req, folderObjectId, "read");
    if (!allowed) throw new ForbiddenError("You do not have access to this folder");
    filter.folderId = folderObjectId;
  }
  if (q) {
    andClauses.push({
      $or: [
        { fileName: { $regex: q, $options: "i" } },
        { "extraction.vendorName": { $regex: q, $options: "i" } },
        { "extraction.invoiceNumber": { $regex: q, $options: "i" } },
        { emailSubject: { $regex: q, $options: "i" } },
      ],
    });
  }

  const from = parseDateValue(fromDate);
  const to = parseDateValue(toDate);
  if (from || to) {
    filter.uploadedAt = {};
    if (from) (filter.uploadedAt as Record<string, unknown>).$gte = from;
    if (to) (filter.uploadedAt as Record<string, unknown>).$lte = to;
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(100, Number(limit || 25)));

  const [total, data] = await Promise.all([
    DocumentModel.countDocuments(filter),
    DocumentModel.find(filter)
      .populate("uploadedBy", "name email")
      .populate("folderId", "name visibilityType")
      .sort({ uploadedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
  ]);

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/** GET /api/documents/stats */
export const getDocumentStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  const allFolders = await DocumentFolder.find({ organizationId, isDeleted: false })
    .select("_id")
    .lean();
  const visibleFolderIds: mongoose.Types.ObjectId[] = [];
  for (const folder of allFolders) {
    if (await canAccessFolder(req, folder._id as mongoose.Types.ObjectId, "read")) {
      visibleFolderIds.push(folder._id as mongoose.Types.ObjectId);
    }
  }

  const baseFilter: Record<string, unknown> = {
    organizationId,
    isDeleted: false,
    $or: [
      { folderId: null },
      { folderId: { $exists: false } },
      { folderId: { $in: visibleFolderIds } },
    ],
  };

  const [allCount, filesCount, bankCount] = await Promise.all([
    DocumentModel.countDocuments(baseFilter),
    DocumentModel.countDocuments({ ...baseFilter, documentType: { $ne: "bank_statement" } }),
    DocumentModel.countDocuments({ ...baseFilter, documentType: "bank_statement" }),
  ]);

  res.json({
    success: true,
    data: {
      all: allCount,
      files: filesCount,
      bank: bankCount,
    },
  });
});

/** GET /api/documents/:id */
export const getDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({
    _id: req.params.id,
    organizationId,
    isDeleted: false,
  })
    .populate("uploadedBy", "name email")
    .populate("folderId", "name visibilityType")
    .lean();

  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "read");
  res.json({ success: true, data: document });
});

/** DELETE /api/documents/:id */
export const deleteDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({
    _id: req.params.id,
    organizationId,
    isDeleted: false,
  });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "write");

  document.isDeleted = true;
  document.deletedAt = new Date();
  document.activityLogs.push({
    eventType: "deleted",
    message: "Document moved to trash",
    actorId: req.user?._id,
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({ success: true, message: "Document deleted" });
});

/** GET /api/documents/trash */
export const listTrashDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const { q, page = "1", limit = "25" } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {
    organizationId,
    isDeleted: true,
  };

  if (q) {
    filter.$or = [
      { fileName: { $regex: q, $options: "i" } },
      { emailSubject: { $regex: q, $options: "i" } },
      { emailSender: { $regex: q, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(100, Number(limit || 25)));

  const [total, data] = await Promise.all([
    DocumentModel.countDocuments(filter),
    DocumentModel.find(filter)
      .populate("uploadedBy", "name email")
      .populate("folderId", "name visibilityType")
      .sort({ deletedAt: -1, updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
  ]);

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

/** POST /api/documents/:id/restore */
export const restoreDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({
    _id: req.params.id,
    organizationId,
    isDeleted: true,
  });
  if (!document) throw new NotFoundError("Document");

  // For restore we only need folder read access to avoid restoring to inaccessible folder.
  const canRestore = await canAccessFolder(req, document.folderId || null, "read");
  if (!canRestore) {
    throw new ForbiddenError("You do not have permission to restore this document");
  }

  document.isDeleted = false;
  document.deletedAt = null;
  document.activityLogs.push({
    eventType: "restored",
    message: "Document restored from trash",
    actorId: req.user?._id,
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({ success: true, data: document });
});

/** GET /api/documents/folders */
export const listFolders = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const folders = await DocumentFolder.find({ organizationId, isDeleted: false })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data: folders });
});

/** POST /api/documents/folders */
export const createFolder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const name = String(req.body.name || "").trim();
  const visibilityType = "all_users";
  const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];

  if (!name) throw new ValidationError("Folder name is required");

  const folder = new DocumentFolder({
    organizationId,
    name,
    visibilityType,
    permissions,
  });
  attachUser(folder as unknown as { $locals?: Record<string, unknown> }, req);
  await folder.save();

  res.status(201).json({ success: true, data: folder });
});

/** PATCH /api/documents/:id/move-folder */
export const moveToFolder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const { folderId } = req.body as { folderId?: string | null };

  const document = await DocumentModel.findOne({
    _id: req.params.id,
    organizationId,
    isDeleted: false,
  });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "write");

  if (folderId) {
    const folder = await DocumentFolder.findOne({ _id: folderId, organizationId, isDeleted: false });
    if (!folder) throw new NotFoundError("Folder");
    const canWriteToTarget = await canAccessFolder(req, folder._id, "write");
    if (!canWriteToTarget) throw new ForbiddenError("You do not have write access to target folder");
  }

  await ensureDocumentAccess(req, document, "write");

  document.folderId = folderId ? new mongoose.Types.ObjectId(folderId) : null;
  document.activityLogs.push({
    eventType: "folder_changed",
    message: folderId ? "Document moved to folder" : "Document removed from folder",
    actorId: req.user?._id,
    payload: { folderId: folderId || null },
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({ success: true, data: document });
});

/** GET /api/documents/mailbox */
export const getMailbox = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const mailbox = await getOrCreateMailbox(req);
  const smtp = (req.user?.activeOrganization
    ? (await (await import("../models/organization.model")).default
        .findById(req.user.activeOrganization)
        .select("smtpSettings.host smtpSettings.user smtpSettings.pass")
        .lean())
    : null) as { smtpSettings?: { host?: string; user?: string; pass?: string } } | null;

  const smtpHost = smtp?.smtpSettings?.host || "";
  const imapHost = guessImapHost(smtpHost);
  const smtpConfigured = Boolean(
    smtp?.smtpSettings?.host && smtp?.smtpSettings?.user && smtp?.smtpSettings?.pass,
  );
  const pollingEnabled = process.env.DOCUMENTS_EMAIL_POLLING_ENABLED === "true";
  const inboundReady = smtpConfigured && pollingEnabled && Boolean(imapHost);

  res.json({
    success: true,
    data: {
      mailboxAddress: mailbox.mailboxAddress,
      isActive: mailbox.isActive,
      smtpConfigured,
      pollingEnabled,
      inferredImapHost: imapHost,
      inboundReady,
      forwardingInstructions: [
        "Use Settings > Email (SMTP) credentials for inbound polling",
        imapHost
          ? `Inbound mailbox host is inferred as ${imapHost}`
          : "Inbound mailbox host is inferred from your SMTP host",
        "Enable forwarding from your provider to your configured SMTP inbox",
        "Emails without attachments are ignored and logged automatically",
      ],
    },
  });
});

/** POST /api/documents/mailbox/regenerate */
export const regenerateMailbox = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const mailbox = await getOrCreateMailbox(req);
  mailbox.mailboxToken = crypto.randomBytes(24).toString("hex");
  mailbox.mailboxAddress = generateMailboxAddress(`${mailbox.organizationId}-${Date.now()}`);
  attachUser(mailbox as unknown as { $locals?: Record<string, unknown> }, req);
  await mailbox.save();

  res.json({
    success: true,
    data: {
      mailboxAddress: mailbox.mailboxAddress,
      isActive: mailbox.isActive,
    },
  });
});

/** POST /api/documents/:id/reprocess */
export const reprocessDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "write");

  const pdfPassword = typeof req.body?.pdfPassword === "string" ? req.body.pdfPassword.trim() : "";

  document.processingStatus = "PROCESSING";
  document.processingLogs.push({
    stage: "manual_reprocess",
    status: "ok",
    message: pdfPassword ? "Manual reprocess requested with PDF password" : "Manual reprocess requested",
    createdAt: new Date(),
  });
  document.activityLogs.push({
    eventType: "reprocess_requested",
    message: pdfPassword ? "Document queued for reprocessing with PDF password" : "Document queued for reprocessing",
    actorId: req.user?._id,
    payload: { hasPdfPassword: Boolean(pdfPassword) },
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();
  await enqueueDocumentProcessing(String(document._id), pdfPassword || undefined);

  res.json({ success: true, data: document });
});

/** POST /api/documents/:id/link */
export const linkDocument = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const { entityType, entityId, linkSource = "manual" } = req.body as {
    entityType?: string;
    entityId?: string;
    linkSource?: "manual" | "suggestion" | "auto";
  };

  if (!entityType || !entityId) throw new ValidationError("entityType and entityId are required");

  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "read");

  const exists = document.links.some((l) => l.entityType === entityType && l.entityId === entityId);
  if (!exists) {
    document.links.push({
      entityType: entityType as typeof document.links[number]["entityType"],
      entityId,
      linkedBy: req.user?._id,
      linkedAt: new Date(),
      linkSource,
    });
  }

  document.activityLogs.push({
    eventType: "linked",
    message: `Linked to ${entityType}`,
    actorId: req.user?._id,
    payload: { entityType, entityId, linkSource },
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({ success: true, data: document });
});

/** GET /api/documents/:id/link-suggestions */
export const getLinkSuggestions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false }).lean();
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "write");

  const vendorName = document.extraction?.vendorName || "";
  const suggestions: Record<string, unknown> = {
    vendors: [],
    customers: [],
    quickActions: ["expense", "bill", "sales_invoice", "vendor", "customer", "account"],
  };

  if (vendorName) {
    const contacts = await Contact.find({
      organizationId,
      isDeleted: false,
      displayName: { $regex: vendorName, $options: "i" },
    })
      .limit(5)
      .select("_id displayName companyName contactType")
      .lean();

    suggestions.vendors = contacts.filter((c) => c.contactType === "Vendor" || c.contactType === "Both");
    suggestions.customers = contacts.filter((c) => c.contactType === "Customer" || c.contactType === "Both");
  }

  res.json({ success: true, data: suggestions });
});

/** POST /api/documents/:id/add-to */
export const addToEntity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const { entityType, create = false } = req.body as {
    entityType?: "expense" | "bill" | "purchase_order" | "sales_invoice" | "vendor" | "customer" | "account";
    create?: boolean;
  };

  if (!entityType) throw new ValidationError("entityType is required");

  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "write");

  const amount = Number(document.extraction?.amount || 0);
  const date = document.extraction?.invoiceDate || new Date();
  const vendorName = document.extraction?.vendorName || "Document Party";

  const prefill = {
    amount,
    date,
    invoiceNumber: document.extraction?.invoiceNumber || "",
    vendorName,
    currency: document.extraction?.currency || "INR",
    sourceDocumentId: document._id,
  };

  if (!create) {
    return res.json({ success: true, data: { prefill, created: null } });
  }

  let created: Record<string, unknown> | null = null;

  if (entityType === "expense") {
    const vendor = await resolveOrCreateContact(organizationId, vendorName, "Vendor");
    const expense = new Expense({
      organizationId,
      expenseType: "Regular",
      date,
      amount,
      currency: prefill.currency,
      vendorId: vendor?._id || null,
      invoiceNumber: prefill.invoiceNumber,
      notes: `Created from document ${document.fileName}`,
      status: "Draft",
    });
    attachUser(expense as unknown as { $locals?: Record<string, unknown> }, req);
    await expense.save();
    created = { type: "expense", id: String(expense._id), number: expense.expenseNumber };
    document.links.push({
      entityType: "expense",
      entityId: String(expense._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "vendor") {
    const vendor = await resolveOrCreateContact(organizationId, vendorName, "Vendor");
    if (!vendor) throw new ValidationError("Could not create vendor");
    created = { type: "vendor", id: String(vendor._id), name: vendor.displayName };
    document.links.push({
      entityType: "vendor",
      entityId: String(vendor._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "customer") {
    const customer = await resolveOrCreateContact(organizationId, vendorName, "Customer");
    if (!customer) throw new ValidationError("Could not create customer");
    created = { type: "customer", id: String(customer._id), name: customer.displayName };
    document.links.push({
      entityType: "customer",
      entityId: String(customer._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "bill") {
    const vendor = await resolveOrCreateContact(organizationId, vendorName, "Vendor");
    if (!vendor) throw new ValidationError("Could not resolve vendor for bill");
    const billNumber = await nextBillNumber(organizationId);
    const bill = new Bill({
      organizationId,
      vendorId: vendor._id,
      billNumber,
      billDate: date,
      dueDate: date,
      lineItems: [
        {
          name: document.fileName,
          description: `Created from document ${document.fileName}`,
          quantity: 1,
          rate: amount || 0,
          amount: amount || 0,
        },
      ],
      subTotal: amount || 0,
      discountLevel: "transaction",
      discountPercent: 0,
      discountAmount: 0,
      taxType: "none",
      taxAmount: 0,
      tcsAmount: 0,
      adjustmentLabel: "Adjustment",
      adjustmentAmount: 0,
      amountPaid: 0,
      total: amount || 0,
      balanceDue: amount || 0,
      notes: `Auto-created from document ${document.fileName}`,
      status: "Draft",
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    attachUser(bill as unknown as { $locals?: Record<string, unknown> }, req);
    await bill.save();
    created = { type: "bill", id: String(bill._id), number: bill.billNumber };
    document.links.push({
      entityType: "bill",
      entityId: String(bill._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "purchase_order") {
    const vendor = await resolveOrCreateContact(organizationId, vendorName, "Vendor");
    if (!vendor) throw new ValidationError("Could not resolve vendor for purchase order");
    const purchaseOrderNumber = await nextPONumber(organizationId);
    const po = new PurchaseOrder({
      organizationId,
      vendorId: vendor._id,
      purchaseOrderNumber,
      purchaseOrderDate: date,
      deliveryDate: date,
      discountLevel: "transaction",
      lineItems: [
        {
          name: document.fileName,
          description: `Created from document ${document.fileName}`,
          quantity: 1,
          rate: amount || 0,
          amount: amount || 0,
        },
      ],
      subTotal: amount || 0,
      discountPercent: 0,
      discountAmount: 0,
      taxType: "none",
      taxAmount: 0,
      tcsAmount: 0,
      adjustmentLabel: "Adjustment",
      adjustmentAmount: 0,
      total: amount || 0,
      notes: `Auto-created from document ${document.fileName}`,
      status: "Draft",
    });
    attachUser(po as unknown as { $locals?: Record<string, unknown> }, req);
    await po.save();
    created = { type: "purchase_order", id: String(po._id), number: po.purchaseOrderNumber };
    document.links.push({
      entityType: "purchase_order",
      entityId: String(po._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "sales_invoice") {
    const customer = await resolveOrCreateContact(organizationId, vendorName, "Customer");
    if (!customer) throw new ValidationError("Could not resolve customer for invoice");
    const invoiceNumber = await nextInvoiceNumber(organizationId);
    const invoice = new Invoice({
      organizationId,
      customerId: customer._id,
      invoiceNumber,
      invoiceDate: date,
      dueDate: date,
      items: [
        {
          name: document.fileName,
          description: `Created from document ${document.fileName}`,
          quantity: 1,
          rate: amount || 0,
          amount: amount || 0,
        },
      ],
      subTotal: amount || 0,
      discountType: "percent",
      discountValue: 0,
      discountAmount: 0,
      taxType: "none",
      taxAmount: 0,
      adjustmentLabel: "Adjustment",
      adjustmentAmount: 0,
      total: amount || 0,
      balanceDue: amount || 0,
      customerNotes: `Auto-created from document ${document.fileName}`,
      status: "Draft",
      paymentReceived: false,
    });
    attachUser(invoice as unknown as { $locals?: Record<string, unknown> }, req);
    await invoice.save();
    created = { type: "sales_invoice", id: String(invoice._id), number: invoice.invoiceNumber };
    document.links.push({
      entityType: "sales_invoice",
      entityId: String(invoice._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  if (entityType === "account") {
    const account = new Account({
      organizationId,
      name: vendorName || `Document Account ${document._id}`,
      rootType: "Expense",
      accountType: "Expense",
      isGroup: false,
      currency: prefill.currency || "INR",
      description: `Auto-created from document ${document.fileName}`,
    });
    attachUser(account as unknown as { $locals?: Record<string, unknown> }, req);
    await account.save();
    created = { type: "account", id: String(account._id), name: account.name };
    document.links.push({
      entityType: "account",
      entityId: String(account._id),
      linkedAt: new Date(),
      linkedBy: req.user?._id,
      linkSource: "auto",
    });
  }

  document.activityLogs.push({
    eventType: "add_to_entity",
    message: create
      ? `Entity ${entityType} created from document`
      : `Prefill generated for ${entityType}`,
    actorId: req.user?._id,
    payload: { entityType, create },
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({
    success: true,
    data: {
      prefill,
      created,
      message:
        !created && create
          ? "Prefill generated. Full auto-create for this entity type is pending and can be completed from the target module form."
          : undefined,
    },
  });
});

/** POST /api/documents/:id/add-to-bank */
export const addStatementToBank = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false });
  if (!document) throw new NotFoundError("Document");
  if (document.documentType !== "bank_statement") {
    throw new ValidationError("This document is not a bank statement");
  }

  const selectedIds = Array.isArray(req.body.transactionIds)
    ? (req.body.transactionIds as string[])
    : [];

  const bankAccount = await Account.findOne({
    organizationId,
    isDeleted: false,
    accountType: "Bank",
  });
  if (!bankAccount) {
    throw new ValidationError("No bank account found. Create a bank account first.");
  }

  let clearingAccount = await Account.findOne({
    organizationId,
    isDeleted: false,
    name: "Documents Clearing",
  });

  if (!clearingAccount) {
    clearingAccount = new Account({
      organizationId,
      name: "Documents Clearing",
      rootType: "Expense",
      accountType: "Expense",
      isGroup: false,
      currency: "INR",
    });
    await clearingAccount.save();
  }

  const picked = document.bankTransactions.filter((txn) => {
    if (txn.addedToBank) return false;
    if (selectedIds.length === 0) return true;
    return selectedIds.includes(String((txn as unknown as { _id?: unknown })._id));
  });

  if (picked.length === 0) {
    return res.json({ success: true, data: { journalsCreated: 0, message: "No transactions selected" } });
  }

  let createdCount = 0;
  for (const txn of picked) {
    const debit = Number(txn.debit || 0);
    const credit = Number(txn.credit || 0);
    const amount = credit > 0 ? credit : debit;
    if (!amount || amount <= 0) continue;

    const lines =
      credit > 0
        ? [
            { accountId: bankAccount._id, debit: amount, credit: 0, narration: txn.description },
            { accountId: clearingAccount._id, debit: 0, credit: amount, narration: txn.description },
          ]
        : [
            { accountId: clearingAccount._id, debit: amount, credit: 0, narration: txn.description },
            { accountId: bankAccount._id, debit: 0, credit: amount, narration: txn.description },
          ];

    const journal = new Journal({
      organizationId,
      date: txn.txnDate || document.extraction?.statementDate || new Date(),
      description: txn.description,
      referenceNumber: `DOC-${document._id}`,
      lineItems: lines,
      totalDebit: amount,
      totalCredit: amount,
      status: "Posted",
      notes: `Created from bank statement document ${document.fileName}`,
    });
    attachUser(journal as unknown as { $locals?: Record<string, unknown> }, req);
    await journal.save();

    txn.addedToBank = true;
    txn.ledgerJournalId = journal._id;
    createdCount += 1;
  }

  document.activityLogs.push({
    eventType: "add_to_bank",
    message: `${createdCount} transaction(s) converted to journal entries`,
    actorId: req.user?._id,
    createdAt: new Date(),
  });
  attachUser(document as unknown as { $locals?: Record<string, unknown> }, req);
  await document.save();

  res.json({ success: true, data: { journalsCreated: createdCount } });
});

/** GET /api/documents/:id/signed-url */
export const getSignedPreviewUrl = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const ttl = Math.max(30, Math.min(900, Number(req.query.ttl || 300)));
  const document = await DocumentModel.findOne({ _id: req.params.id, organizationId, isDeleted: false });
  if (!document) throw new NotFoundError("Document");
  await ensureDocumentAccess(req, document, "read");

  if (!document.cloudinaryPublicId && document.url) {
    return res.json({ success: true, data: { url: document.url, ttl } });
  }

  if (!document.cloudinaryPublicId) {
    throw new ValidationError("Preview is unavailable for this document");
  }

  const resourceType = document.mimeType?.startsWith("image/") ? "image" : "raw";
  const signedUrl = buildSignedAssetUrl(document.cloudinaryPublicId, resourceType, ttl);
  res.json({ success: true, data: { url: signedUrl, ttl } });
});

/** GET /api/documents/events?token=... */
export const streamEvents = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.query.token || "");
  if (!token) throw new ValidationError("token query param is required");

  const decoded = await admin.auth().verifyIdToken(token);
  const user = await User.findOne({ firebaseUid: decoded.uid });
  if (!user?.activeOrganization) throw new ForbiddenError("No active organization");

  const organizationId = user.activeOrganization;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const writeEvent = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  writeEvent("ready", { ok: true, ts: Date.now() });

  const sendSnapshot = async () => {
    const [counts, latest] = await Promise.all([
      DocumentModel.aggregate([
        { $match: { organizationId, isDeleted: false } },
        { $group: { _id: "$processingStatus", count: { $sum: 1 } } },
      ]),
      DocumentModel.find({ organizationId, isDeleted: false })
        .sort({ updatedAt: -1 })
        .limit(8)
        .select("_id fileName processingStatus updatedAt")
        .lean(),
    ]);

    writeEvent("documents:update", {
      counts,
      latest,
      ts: Date.now(),
    });
  };

  await sendSnapshot();
  const interval = setInterval(() => {
    sendSnapshot().catch(() => undefined);
  }, 5000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

export async function ingestEmailPayload(payload: {
  mailbox: string;
  sender?: string;
  subject?: string;
  messageId?: string;
  attachments?: Array<{
    name: string;
    url: string;
    publicId: string;
    mimeType?: string;
    sizeBytes?: number;
    contentDisposition?: string;
    inline?: boolean;
  }>;
}) {
  const { mailbox, sender, subject, messageId, attachments } = payload;
  if (!mailbox) throw new ValidationError("mailbox is required");

  const mailboxDoc = await DocumentMailbox.findOne({ mailboxAddress: mailbox, isActive: true });
  if (!mailboxDoc) throw new NotFoundError("Mailbox");

  const isBankContext = (() => {
    const text = `${sender || ""} ${subject || ""}`.toLowerCase();
    const keywords = [
      "bank statement",
      "statement",
      "e-statement",
      "accountstatement",
      "account summary",
      "mini statement",
      "passbook",
      "hdfc",
      "icici",
      "sbi",
      "axis",
      "kotak",
      "indusind",
      "yes bank",
      "transaction summary",
    ];
    return keywords.some((k) => text.includes(k));
  })();

  const minAttachmentBytes = Math.max(0, Number(process.env.DOCUMENTS_EMAIL_MIN_ATTACHMENT_BYTES || 2048));
  const onlyBankStatements = process.env.DOCUMENTS_EMAIL_ONLY_BANK_STATEMENTS === "true";
  const allowedExtensions = new Set(["pdf", "csv", "xls", "xlsx", "jpg", "jpeg", "png", "webp", "tif", "tiff"]);
  const allowedMimePrefixes = [
    "application/pdf",
    "image/",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml",
  ];

  const usableAttachments = (attachments || []).filter((item) => {
    if (!item.url || !item.publicId) return false;
    if ((item.sizeBytes || 0) < minAttachmentBytes) return false;
    if (item.inline || String(item.contentDisposition || "").toLowerCase() === "inline") return false;

    const extension = path.extname(item.name || "").replace(".", "").toLowerCase();
    const mime = String(item.mimeType || "").toLowerCase();
    const extAllowed = extension ? allowedExtensions.has(extension) : false;
    const mimeAllowed = allowedMimePrefixes.some((prefix) => mime.startsWith(prefix));
    return extAllowed || mimeAllowed;
  });

  if (usableAttachments.length === 0) {
    return {
      ingested: 0,
      ignoredNoAttachment: !attachments || attachments.length === 0,
      ignoredUnsupported: Boolean(attachments && attachments.length > 0),
    };
  }

  const createdIds: string[] = [];
  for (const item of usableAttachments) {
    const extension = path.extname(item.name || "").replace(".", "").toLowerCase();
    const lowerName = `${item.name || ""} ${item.mimeType || ""}`.toLowerCase();
    const bankByName =
      lowerName.includes("bank") ||
      lowerName.includes("statement") ||
      lowerName.includes("e-statement") ||
      lowerName.includes("accountstatement") ||
      lowerName.includes("txn") ||
      lowerName.includes("transaction");
    const isBankStatement = isBankContext || bankByName;
    if (onlyBankStatements && !isBankStatement) continue;

    const document = await DocumentModel.create({
      organizationId: mailboxDoc.organizationId,
      source: "email",
      inboxType: isBankStatement ? "bank_statements" : "files",
      fileName: item.name,
      mimeType: item.mimeType || "application/octet-stream",
      extension,
      sizeBytes: item.sizeBytes || 0,
      cloudinaryPublicId: item.publicId,
      url: item.url,
      uploadStatus: "uploaded",
      processingStatus: "SCAN_IN_PROGRESS",
      emailSender: sender || "",
      emailSubject: subject || "",
      emailMessageId: messageId || "",
      activityLogs: [
        {
          eventType: "email_ingested",
          message: "Attachment ingested from email",
          payload: { sender, subject, messageId, routedTo: isBankStatement ? "bank_statements" : "files" },
        },
      ],
      processingLogs: [
        {
          stage: "email_ingestion",
          status: "ok",
          message: "Attachment received and queued",
        },
      ],
    });
    createdIds.push(String(document._id));
    await enqueueDocumentProcessing(String(document._id));
  }

  if (createdIds.length === 0) {
    return {
      ingested: 0,
      ignoredNoAttachment: false,
      ignoredUnsupported: true,
      ignoredByRule: onlyBankStatements,
    };
  }

  return { ingested: createdIds.length, documentIds: createdIds };
}

/**
 * POST /api/documents/email-ingest
 * Header: x-doc-ingest-key must match DOCUMENTS_INGEST_KEY.
 */
export const emailIngest = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const ingestKey = req.header("x-doc-ingest-key");
  if (!process.env.DOCUMENTS_INGEST_KEY || ingestKey !== process.env.DOCUMENTS_INGEST_KEY) {
    throw new ForbiddenError("Invalid ingest key");
  }

  const result = await ingestEmailPayload(req.body);
  res.json({ success: true, data: result });
});
