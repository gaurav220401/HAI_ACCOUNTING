import { auth } from "../firebase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/**
 * Get the current user's Firebase ID token.
 */
async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

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
