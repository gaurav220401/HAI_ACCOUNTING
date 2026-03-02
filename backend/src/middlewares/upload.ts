import multer from "multer";

/**
 * Multer middleware using memory storage (buffer).
 * Max 5 MB per file — suitable for product images, logos, etc.
 * Reusable across all routes that need file uploads.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});
