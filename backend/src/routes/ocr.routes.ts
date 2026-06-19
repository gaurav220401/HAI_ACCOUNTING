import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middlewares/auth";
import { upload } from "../middlewares/upload";
import * as ocrController from "../controllers/ocr.controller";

const router = Router();

// All OCR routes require authentication
router.use(authenticate);

/**
 * Extend the response timeout for OCR routes.
 * Gemini Vision/PDF processing can take 60-120 seconds for complex documents.
 * Default Express timeout is usually 30s in some environments.
 */
const ocrTimeout = (req: Request, res: Response, next: NextFunction) => {
  // Set a 5-minute timeout on the socket for OCR operations
  req.socket.setTimeout(300_000); // 5 minutes
  res.setTimeout(300_000, () => {
    res.status(408).json({
      success: false,
      error: "OCR request timed out. Please try a smaller file or fewer pages.",
    });
  });
  next();
};

// POST /api/ocr/extract — Upload file for OCR extraction
router.post("/extract", ocrTimeout, upload.single("file"), ocrController.extract);

// POST /api/ocr/extract-url — Extract from a public URL
router.post("/extract-url", ocrTimeout, ocrController.extractFromUrl);

// GET /api/ocr/supported-types — List supported document types
router.get("/supported-types", ocrController.getSupportedTypes);

export default router;
