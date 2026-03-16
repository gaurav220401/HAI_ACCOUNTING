import { Router, Response } from "express";
import { authenticate } from "../middlewares/auth";
import { upload } from "../middlewares/upload";
import { uploadBuffer, deleteAsset } from "../utils/cloudinary";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ValidationError } from "../utils/errors";

const router = Router();
router.use(authenticate);

/**
 * POST /api/upload?folder=items
 * Multipart form — field name "file".
 * Returns { url, publicId }.
 */
router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) throw new ValidationError("No file uploaded");
    const folder = (req.query.folder as string) || "general";
    // Use "auto" for document folders so Cloudinary accepts PDFs, XLSX, etc.
    const resourceType =
      (req.query.resourceType as "image" | "raw" | "video" | "auto") ??
      (folder.includes("document") || folder.includes("raw") ? "auto" : "image");
    const result = await uploadBuffer(req.file.buffer, folder, undefined, resourceType);
    result.originalName = req.file.originalname;
    res.status(201).json({ success: true, data: result });
  }),
);

/**
 * DELETE /api/upload?publicId=hai/items/abc123
 * Removes asset from Cloudinary.
 */
router.delete(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const publicId = req.query.publicId as string;
    if (!publicId) throw new ValidationError("publicId query param is required");
    await deleteAsset(publicId);
    res.json({ success: true, message: "Asset deleted" });
  }),
);

export default router;
