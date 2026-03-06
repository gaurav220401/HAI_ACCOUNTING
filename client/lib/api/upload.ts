import { auth } from "../firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// ─── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

// ─── API ────────────────────────────────────────────────────────────────

export const uploadApi = {
  /**
   * Upload an image file to Cloudinary via the backend.
   * @param file   - the File object from an input or drop event
   * @param folder - the Cloudinary sub-folder, e.g. "items", "contacts"
   */
  async upload(file: File, folder: string = "general"): Promise<UploadResult> {
    const token = await auth.currentUser?.getIdToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/upload?folder=${encodeURIComponent(folder)}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData, // do NOT set Content-Type — browser sets multipart boundary
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Upload failed");
    return data.data as UploadResult;
  },

  /**
   * Delete an uploaded asset from Cloudinary.
   * @param publicId - the Cloudinary public_id returned from upload
   */
  async remove(publicId: string): Promise<void> {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(
      `${API_URL}/upload?publicId=${encodeURIComponent(publicId)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Delete failed");
    }
  },
};
