export interface ServerStatusSnapshot {
  isServerUnavailable: boolean;
  reason: string | null;
  lastChangedAt: number | null;
}

type ServerStatusListener = (snapshot: ServerStatusSnapshot) => void;

const UNAVAILABLE_STATUS_CODES = new Set([502, 503, 504]);
const UNAVAILABLE_MESSAGE_PATTERNS = [
  /econnrefused/i,
  /failed to proxy/i,
  /aggregateerror/i,
  /connect econnrefused/i,
  /upstream connect error/i,
  /proxy error/i,
  /socket hang up/i,
  /fetch failed/i,
  /network error/i,
  /service unavailable/i,
];

const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

function getHealthProbeUrl(): string {
  const trimmed = PUBLIC_API_URL.replace(/\/$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.endsWith("/api")) {
      return `${trimmed.slice(0, -4)}/health`;
    }
    return `${trimmed}/health`;
  }

  if (trimmed.endsWith("/api")) {
    return `${trimmed}/health`;
  }

  return "/api/health";
}

function isLikelyProxyTransportFailure(
  status: number,
  message?: string | null,
): boolean {
  if (status !== 500 || !message) return false;

  const normalized = message.toLowerCase();

  // Next.js proxy failures frequently surface as 500 + plain text "Internal Server Error"
  // without backend JSON payload when upstream is unreachable.
  if (normalized.includes("non_json_response")) return true;
  if (normalized.trim() === "internal server error") return true;
  if (normalized.includes("internal server error non_json_response")) return true;

  return false;
}

let snapshot: ServerStatusSnapshot = {
  isServerUnavailable: false,
  reason: null,
  lastChangedAt: null,
};

const listeners = new Set<ServerStatusListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function normalizeMessage(input: unknown): string | null {
  if (typeof input === "string") {
    const message = input.trim();
    return message ? message : null;
  }

  if (input instanceof Error) {
    const message = input.message.trim();
    return message ? message : null;
  }

  return null;
}

function setSnapshot(isServerUnavailable: boolean, reason: string | null) {
  if (
    snapshot.isServerUnavailable === isServerUnavailable &&
    snapshot.reason === reason
  ) {
    return;
  }

  snapshot = {
    isServerUnavailable,
    reason,
    lastChangedAt: Date.now(),
  };

  notifyListeners();
}

export function subscribeServerStatus(listener: ServerStatusListener): () => void {
  listeners.add(listener);
  listener(snapshot);

  return () => {
    listeners.delete(listener);
  };
}

export function getServerStatusSnapshot(): ServerStatusSnapshot {
  return snapshot;
}

export function isServerUnavailableMessage(
  message?: string | null,
): boolean {
  if (!message) return false;
  return UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isServerUnavailableResponse(
  status: number,
  message?: string | null,
): boolean {
  if (UNAVAILABLE_STATUS_CODES.has(status)) return true;
  if (isLikelyProxyTransportFailure(status, message)) return true;
  if (status >= 500 && isServerUnavailableMessage(message)) return true;
  return false;
}

export function isServerUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError") return false;
    if (isServerUnavailableMessage(error.message)) return true;
    return error.name === "TypeError";
  }

  if (typeof error === "string") {
    return isServerUnavailableMessage(error);
  }

  return false;
}

export function markServerUnavailable(reason?: unknown): void {
  setSnapshot(true, normalizeMessage(reason));
}

export function markServerAvailable(): void {
  setSnapshot(false, null);
}

export async function probeServerAvailability(): Promise<boolean> {
  if (typeof window === "undefined") return true;

  try {
    const response = await fetch(getHealthProbeUrl(), {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    const bodyText = await response
      .clone()
      .text()
      .catch(() => "");

    const contentType = response.headers.get("content-type") || "";
    const diagnostics = contentType.includes("application/json")
      ? bodyText
      : `${bodyText} NON_JSON_RESPONSE`;

    if (isServerUnavailableResponse(response.status, diagnostics)) {
      markServerUnavailable(
        bodyText || `Server probe failed with status ${response.status}`,
      );
      return false;
    }

    markServerAvailable();
    return true;
  } catch (error) {
    if (isServerUnavailableError(error)) {
      markServerUnavailable(error);
      return false;
    }

    throw error;
  }
}
