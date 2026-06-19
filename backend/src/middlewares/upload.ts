import multer from "multer";

/**
 * Multer middleware using memory storage (buffer).
 * Max 25 MB per file — supports images, multi-page PDFs, Excel/Word documents, etc.
 * Reusable across all routes that need file uploads.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — handles multi-page PDFs & Excel
  // Accept all file types — the route/controller decides what is valid
  fileFilter: (_req, _file, cb) => cb(null, true),
});
