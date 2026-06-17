import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { upload } from "../middlewares/upload";
import * as ocrController from "../controllers/ocr.controller";

const router = Router();

// All OCR routes require authentication
router.use(authenticate);

// POST /api/ocr/extract — Upload file for OCR extraction
router.post("/extract", upload.single("file"), ocrController.extract);

// POST /api/ocr/extract-url — Extract from a public URL
router.post("/extract-url", ocrController.extractFromUrl);

// GET /api/ocr/supported-types — List supported document types
router.get("/supported-types", ocrController.getSupportedTypes);

export default router;
