import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase";
import {
  isServerUnavailableError,
  isServerUnavailableResponse,
  markServerAvailable,
  markServerUnavailable,
} from "../server-status";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined" ? "http://localhost:5000/api" : "/api");

/**
 * For OCR operations (Gemini can take 60-120s on large PDFs), always hit the
 * backend directly to bypass the 30-second Next.js dev proxy timeout.
 */
const OCR_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000/api";

/**
 * Get the current user's Firebase ID token.
 */
async function waitForCurrentUser(timeoutMs = 3000) {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<User | null>((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}

async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser ?? (await waitForCurrentUser());
  if (!user) return null;
  return user.getIdToken();
}

function buildAuthHeaders(
  token: string | null,
  options: RequestInit,
  includeJsonHeader = true,
): Record<string, string> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(includeJsonHeader && !isFormData ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Custom error class for API responses.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  errors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    code: string = "API_ERROR",
    errors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

interface ApiPayload {
  message?: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

/**
 * Authenticated fetch wrapper — automatically attaches Firebase ID token.
 * Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  retryCount = 0,
): Promise<T> {
  const token = await getIdToken();
  const headers = buildAuthHeaders(token, options, true);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...options,
      headers,
    });
  } catch (error) {
    if (isServerUnavailableError(error)) {
      markServerUnavailable(error);
      throw new ApiError(
        "Unable to reach the server. Please ensure backend service is running.",
        503,
        "SERVER_UNAVAILABLE",
      );
    }

    throw error;
  }

  let data: ApiPayload = {};
  const contentType = res.headers.get("content-type");

  try {
    // Only parse as JSON if the content-type indicates JSON
    if (contentType && contentType.includes("application/json")) {
      data = (await res.json()) as ApiPayload;
    } else {
      // For non-JSON responses, create a generic error object
      const text = await res.text();
      data = {
        message: text || "Request failed",
        code: "NON_JSON_RESPONSE",
        status: res.status
      };
    }
  } catch {
    // If JSON parsing fails, create a generic error object
    data = {
      message: "Failed to parse response",
      code: "PARSE_ERROR",
      status: res.status
    };
  }

  // Handle rate limiting with exponential backoff
  if (res.status === 429 && retryCount < 3) {
    const retryAfter = res.headers.get("retry-after");
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    return apiFetch<T>(path, options, retryCount + 1);
  }

  const message =
    (typeof data?.message === "string" && data.message.trim()) ||
    "Request failed";
  const errorCode =
    (typeof data?.code === "string" && data.code.trim()) || "API_ERROR";
  const diagnostics = `${message} ${errorCode}`;

  if (!res.ok) {
    if (isServerUnavailableResponse(res.status, diagnostics)) {
      markServerUnavailable(message);
      throw new ApiError(
        "Server is unavailable right now. Please try again in a moment.",
        503,
        "SERVER_UNAVAILABLE",
      );
    }

    if (res.status < 500) {
      markServerAvailable();
    }
    throw new ApiError(message, res.status, errorCode, data?.errors);
  }

  markServerAvailable();

  return data as T;
}

/**
 * OCR-specific fetch — bypasses Next.js proxy for long-running Gemini calls.
 * Uses a 3-minute AbortController timeout instead of the proxy's 30s limit.
 */
export async function apiFetchOcr<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  // 3-minute timeout for large PDFs/multi-page documents
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  let res: Response;
  try {
    res = await fetch(`${OCR_API_URL}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new ApiError(
        "OCR request timed out (3 minutes). Try a smaller file or single page PDF.",
        408,
        "TIMEOUT",
      );
    }
    if (isServerUnavailableError(error)) {
      markServerUnavailable(error);
      throw new ApiError(
        "Unable to reach the server. Please ensure backend service is running.",
        503,
        "SERVER_UNAVAILABLE",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let data: ApiPayload = {};
  const contentType = res.headers.get("content-type");
  try {
    if (contentType && contentType.includes("application/json")) {
      data = (await res.json()) as ApiPayload;
    } else {
      const text = await res.text();
      data = { message: text || "Request failed", code: "NON_JSON_RESPONSE" };
    }
  } catch {
    data = { message: "Failed to parse response", code: "PARSE_ERROR" };
  }

  if (!res.ok) {
    const message =
      (typeof data?.message === "string" && data.message.trim()) || "OCR request failed";
    const errorCode = (typeof data?.code === "string" && data.code) || "API_ERROR";
    throw new ApiError(message, res.status, errorCode, data?.errors);
  }

  return data as T;
}

/**
 * Authenticated fetch wrapper for binary responses like PDF/CSV.
 */
export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
): Promise<Blob> {
  const token = await getIdToken();
  const headers = buildAuthHeaders(token, options, false);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      ...options,
      headers,
    });
  } catch (error) {
    if (isServerUnavailableError(error)) {
      markServerUnavailable(error);
      throw new ApiError(
        "Unable to reach the server. Please ensure backend service is running.",
        503,
        "SERVER_UNAVAILABLE",
      );
    }

    throw error;
  }

  if (!res.ok) {
    let message = "Request failed";
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.clone().json();
        message = json.message || message;
      } else {
        const text = await res.clone().text();
        message = text || message;
      }
    } catch {
      // Ignore JSON parse error for non-JSON error responses.
    }

    if (isServerUnavailableResponse(res.status, message)) {
      markServerUnavailable(message);
      throw new ApiError(
        "Server is unavailable right now. Please try again in a moment.",
        503,
        "SERVER_UNAVAILABLE",
      );
    }

    if (res.status < 500) {
      markServerAvailable();
    }
    throw new ApiError(message, res.status, "API_ERROR");
  }

  markServerAvailable();

  return res.blob();
}

/**
 * Build query string from an object, filtering out undefined/null.
 */
export function buildQuery(
  params:
    | Record<string, string | number | boolean | undefined | null>
    | ListParams,
): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  return (
    "?" +
    new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
  );
}

// ─── Common response types ─────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface ListParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}
