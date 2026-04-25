import { auth } from "../firebase";
import {
  isServerUnavailableError,
  isServerUnavailableResponse,
  markServerAvailable,
  markServerUnavailable,
} from "../server-status";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

// ─── Types ──────────────────────────────────────────────────────────────

export interface UploadResult {
  url: string;
  originalName: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.clone().json();
      return data?.message || "Request failed";
    }

    const text = await response.clone().text();
    return text || "Request failed";
  } catch {
    return "Request failed";
  }
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

    let res: Response;
    try {
      res = await fetch(`${API_URL}/upload?folder=${encodeURIComponent(folder)}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData, // do NOT set Content-Type — browser sets multipart boundary
      });
    } catch (error) {
      if (isServerUnavailableError(error)) {
        markServerUnavailable(error);
      }
      throw error;
    }

    const data = await res.json();
    if (!res.ok) {
      const message = data?.message || "Upload failed";
      if (isServerUnavailableResponse(res.status, message)) {
        markServerUnavailable(message);
      } else if (res.status < 500) {
        markServerAvailable();
      }
      throw new Error(message);
    }

    markServerAvailable();
    return data.data as UploadResult;
  },

  /**
   * Delete an uploaded asset from Cloudinary.
   * @param publicId - the Cloudinary public_id returned from upload
   */
  async remove(publicId: string): Promise<void> {
    const token = await auth.currentUser?.getIdToken();

    let res: Response;
    try {
      res = await fetch(
        `${API_URL}/upload?publicId=${encodeURIComponent(publicId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      );
    } catch (error) {
      if (isServerUnavailableError(error)) {
        markServerUnavailable(error);
      }
      throw error;
    }

    if (!res.ok) {
      const message = await readResponseError(res);
      if (isServerUnavailableResponse(res.status, message)) {
        markServerUnavailable(message);
      } else if (res.status < 500) {
        markServerAvailable();
      }
      throw new Error(message || "Delete failed");
    }

    markServerAvailable();
  },
};
