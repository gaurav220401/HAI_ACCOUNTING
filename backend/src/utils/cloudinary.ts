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
export async function deleteAsset(
  publicId: string,
  resourceType: "image" | "raw" | "video" | "auto" = "image",
): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Build a short-lived URL for an `authenticated`-type Cloudinary asset, via
 * the Admin API's private-download endpoint (api.cloudinary.com).
 *
 * This is the only delivery mechanism that reliably works for `authenticated`
 * assets on this account. The CDN-side alternative (`cloudinary.url()` with
 * `sign_url: true`, see buildSignedAssetUrl below) requires "Token-based
 * authentication" to be turned on in Cloudinary's account security settings —
 * it is not, so that path 401s unconditionally regardless of how correct the
 * signing code is. Confirmed directly: signing an existing, correctly-stored
 * `image/authenticated` asset with buildSignedAssetUrl 401s, while the exact
 * same asset fetched through this function returns 200 with the real bytes.
 *
 * @param forceAttachment - true (default) sends `Content-Disposition:
 *   attachment`, for an explicit download action. false omits it, so a
 *   browser renders a PDF/image inline — use this for in-app previews.
 */
export function buildDownloadUrl(
  publicId: string,
  resourceType: "image" | "raw" | "video" | "auto" = "image",
  ttlSeconds = 300,
  downloadFilename?: string,
  format?: string,
  forceAttachment = true,
): string {
  const safeTtl = Math.max(30, Math.min(3600, Number(ttlSeconds) || 300));
  const expiresAt = Math.floor(Date.now() / 1000) + safeTtl;

  const opts: Record<string, unknown> = {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: expiresAt,
    ...(forceAttachment ? { flags: "attachment" } : {}),
  };

  if (format) {
    opts.format = format.replace(/^\./, "").trim();
  }

  return cloudinary.utils.private_download_url(publicId, format?.replace(/^\./, "").trim() ?? "", opts);
}

/**
 * Build a short-lived signed URL for secure previews/downloads.
 *
 * NOT CURRENTLY USABLE for `type: "authenticated"` assets on this account —
 * confirmed by direct testing that it 401s even against a correctly-stored
 * asset with valid credentials. Cloudinary's CDN only honors a `sign_url`
 * signature for authenticated delivery when "Token-based authentication" is
 * enabled in the account's security settings; it is not enabled here. Use
 * buildDownloadUrl() instead (with forceAttachment: false for inline
 * preview) — it goes through the Admin API instead of the CDN and works
 * regardless of that account setting. Kept for the day token-based auth is
 * turned on, at which point this becomes the lighter-weight option again.
 */
export function buildSignedAssetUrl(
  publicId: string,
  resourceType: "image" | "raw" | "video" | "auto" = "raw",
  ttlSeconds = 300,
  downloadFilename?: string,
  format?: string,
): string {
  const safeTtl = Math.max(30, Math.min(900, Number(ttlSeconds) || 300));
  const expiresAt = Math.floor(Date.now() / 1000) + safeTtl;

  const opts: Record<string, unknown> = {
    secure: true,
    sign_url: true,
    type: "authenticated",
    resource_type: resourceType,
    expires_at: expiresAt,
  };

  if (format && resourceType !== "raw") {
    opts.format = format.replace(/^\./, "").trim();
  }

  // Note: fl_attachment is NOT added here — signed URLs are for preview only.
  // For forced downloads, use buildDownloadUrl() instead.

  return cloudinary.url(publicId, opts);
}

/**
 * Determine the Cloudinary resource type based on file extension and mime type.
 */
export function getCloudinaryResourceType(extension: string, mimeType?: string): "image" | "video" | "raw" {
  const ext = String(extension || "").toLowerCase().replace(".", "").trim();
  const mime = String(mimeType || "").toLowerCase().trim();

  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp", "svg", "ico", "pdf"];
  if (imageExtensions.includes(ext) || mime.startsWith("image/") || mime === "application/pdf") {
    return "image";
  }

  const videoExtensions = ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "3gp", "mp3", "wav", "aac", "ogg", "m4a"];
  if (videoExtensions.includes(ext) || mime.startsWith("video/") || mime.startsWith("audio/")) {
    return "video";
  }

  return "raw";
}

