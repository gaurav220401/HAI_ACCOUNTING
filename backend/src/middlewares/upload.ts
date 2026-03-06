import multer from "multer";

/**
 * Multer middleware using memory storage (buffer).
 * Max 10 MB per file — supports images, PDFs, documents, etc.
 * Reusable across all routes that need file uploads.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  // Accept all file types — the route/controller decides what is valid
  fileFilter: (_req, _file, cb) => cb(null, true),
});
