import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

// ─── Configure once ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

// ─── Upload helpers (reusable across all modules) ────────────────────────────

export interface UploadResult {
  url: string;          // optimised delivery URL
  publicId: string;     // used for delete / replace
  originalName?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

/**
 * Upload a file buffer to Cloudinary.
 * @param buffer       - the raw file bytes (from multer memoryStorage)
 * @param folder       - e.g. "items", "contacts", "organization-logos"
 * @param publicId     - optional — set to overwrite an existing asset
 * @param resourceType - "image" | "raw" | "video" | "auto" (default: "image")
 */
export function uploadBuffer(
  buffer: Buffer,
  folder: string,
  publicId?: string,
  resourceType: "image" | "raw" | "video" | "auto" = "image",
  deliveryType: "upload" | "authenticated" | "private" = "upload",
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const opts: Record<string, unknown> = {
      folder: `hai/${folder}`,
      resource_type: resourceType,
      type: deliveryType,
      ...(resourceType === "image"
        ? { transformation: [{ quality: "auto", fetch_format: "auto" }] }
        : {}),
    };
    if (publicId) {
      opts.public_id = publicId;
      opts.overwrite = true;
    }
    const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err || !result) return reject(err ?? new Error("Upload failed"));
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      });
    });
    stream.end(buffer);
  });
}

/**
 * Delete an asset by its public_id.
 */
export async function deleteAsset(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}

/**
 * Build a short-lived signed URL for secure previews/downloads.
 */
export function buildSignedAssetUrl(
  publicId: string,
  resourceType: "image" | "raw" | "video" | "auto" = "raw",
  ttlSeconds = 300,
): string {
  const safeTtl = Math.max(30, Math.min(900, Number(ttlSeconds) || 300));
  const expiresAt = Math.floor(Date.now() / 1000) + safeTtl;

  return cloudinary.url(publicId, {
    secure: true,
    sign_url: true,
    type: "authenticated",
    resource_type: resourceType,
    expires_at: expiresAt,
  });
}
