/**
 * OCR Controller
 *
 * Exposes centralized OCR endpoints for extracting structured data from
 * uploaded documents (images, PDFs) using Gemini AI.
 *
 * Endpoints:
 *   POST /api/ocr/extract         — Upload a file for OCR extraction
 *   POST /api/ocr/extract-url     — Extract from a public file URL
 *   GET  /api/ocr/supported-types — List supported document types
 */

import { Response } from "express";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ValidationError, ForbiddenError } from "../utils/errors";
import { ocrService } from "../services/ocr.service";
import type { OcrDocumentType } from "../prompts";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/ocr/extract
 *
 * Multipart form upload — field name "file".
 * Query params:
 *   - documentType (required): invoice | bill | expense | purchase_order | credit_note | quote | delivery_challan | bank_statement | auto
 *   - pdfPassword (optional): password for encrypted PDFs
 */
export const extract = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    orgId(req); // Ensure user has an active org

    if (!req.file) {
      throw new ValidationError("No file uploaded. Use multipart form with field name 'file'.");
    }

    if (req.file.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`);
    }

    const mimeType = req.file.mimetype || "application/octet-stream";
    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new ValidationError(
        `Unsupported file type: ${mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(", ")}`,
      );
    }

    const documentType = (req.body.documentType || req.query.documentType || "auto") as OcrDocumentType;
    const supportedTypes = ocrService.getSupportedTypes();
    if (!supportedTypes.includes(documentType)) {
      throw new ValidationError(
        `Invalid documentType: ${documentType}. Supported: ${supportedTypes.join(", ")}`,
      );
    }

    const pdfPassword = req.body.pdfPassword || (req.query.pdfPassword as string) || undefined;

    const result = await ocrService.extract({
      fileBuffer: req.file.buffer,
      mimeType,
      fileName: req.file.originalname,
      documentType,
      pdfPassword,
    });

    res.json({
      success: result.success,
      data: result,
    });
  },
);

/**
 * POST /api/ocr/extract-url
 *
 * JSON body:
 *   - fileUrl (required): public URL of the file
 *   - documentType (required): invoice | bill | expense | ... | auto
 *   - fileName (optional): original file name
 *   - mimeType (optional): MIME type override
 *   - pdfPassword (optional): password for encrypted PDFs
 */
export const extractFromUrl = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    orgId(req);

    const { fileUrl, documentType, fileName, mimeType, pdfPassword } = req.body;

    if (!fileUrl || typeof fileUrl !== "string") {
      throw new ValidationError("fileUrl is required and must be a string.");
    }

    const docType = (documentType || "auto") as OcrDocumentType;
    const supportedTypes = ocrService.getSupportedTypes();
    if (!supportedTypes.includes(docType)) {
      throw new ValidationError(
        `Invalid documentType: ${docType}. Supported: ${supportedTypes.join(", ")}`,
      );
    }

    const result = await ocrService.extractFromUrl({
      fileUrl,
      mimeType,
      fileName,
      documentType: docType,
      pdfPassword,
    });

    res.json({
      success: result.success,
      data: result,
    });
  },
);

/**
 * GET /api/ocr/supported-types
 *
 * Returns the list of supported document types for OCR extraction.
 */
export const getSupportedTypes = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        types: ocrService.getSupportedTypes(),
        description: {
          invoice: "Sales invoice / Tax invoice",
          bill: "Purchase invoice / Vendor bill",
          expense: "Expense receipt / Cash memo",
          purchase_order: "Purchase order document",
          credit_note: "Credit note / Credit memo",
          quote: "Quotation / Estimate / Proforma invoice",
          delivery_challan: "Delivery challan / Delivery note",
          bank_statement: "Bank account statement",
          auto: "Auto-detect document type",
        },
      },
    });
  },
);
