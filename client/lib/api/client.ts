import { auth } from "../firebase";

const API_URL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
    : "/api";

/**
 * Get the current user's Firebase ID token.
 */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
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

/**
 * Authenticated fetch wrapper — automatically attaches Firebase ID token.
 * Throws ApiError on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getIdToken();
  const headers = buildAuthHeaders(token, options, true);

  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers,
  });

  let data;
  const contentType = res.headers.get("content-type");
  
  try {
    // Only parse as JSON if the content-type indicates JSON
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      // For non-JSON responses, create a generic error object
      const text = await res.text();
      data = { 
        message: text || "Request failed", 
        code: "NON_JSON_RESPONSE",
        status: res.status 
      };
    }
  } catch (error) {
    // If JSON parsing fails, create a generic error object
    data = { 
      message: "Failed to parse response", 
      code: "PARSE_ERROR",
      status: res.status 
    };
  }

  if (!res.ok) {
    throw new ApiError(
      data.message || "Request failed",
      res.status,
      data.code,
      data.errors,
    );
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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const json = await res.json();
      message = json.message || message;
    } catch {
      // Ignore JSON parse error for non-JSON error responses.
    }
    throw new ApiError(message, res.status);
  }

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
