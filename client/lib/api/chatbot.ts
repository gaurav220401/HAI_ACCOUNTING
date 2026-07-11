import { apiFetch } from "../api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; url: string }>;
  timestamp: number;
  isError?: boolean;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    answer: string;
    sources: Array<{ title: string; url: string }>;
    sessionId: string;
    responseTimeMs: number;
  };
  message?: string;
}

export interface ChatSession {
  _id: string;
  title: string;
  lastActivity: number;
  createdAt: number;
  updatedAt?: number;
  messages?: ChatMessage[];
}

/**
 * Send a message to the RAG chatbot API with optional session and history.
 */
export async function sendChatMessage(
  question: string,
  sessionId?: string,
  history?: ChatMessage[],
  attachments?: Array<{ url: string; originalName: string; publicId: string }>
): Promise<ChatResponse> {
  const res = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question, sessionId, history, attachments }),
  });

  const data = await res.json();

  if (!res.ok) {
    return {
      success: false,
      message: data.message || "Something went wrong. Please try again.",
    };
  }

  return data;
}

/**
 * Retrieve all recent chat sessions.
 */
export async function getSessions(): Promise<{ success: boolean; data?: ChatSession[]; message?: string }> {
  const res = await apiFetch("/chat-sessions", { method: "GET" });
  const data = await res.json();
  return res.ok ? data : { success: false, message: data.message };
}

/**
 * Retrieve a specific session and its full message history.
 */
export async function getSession(sessionId: string): Promise<{ success: boolean; data?: ChatSession; message?: string }> {
  const res = await apiFetch(`/chat-sessions/${sessionId}`, { method: "GET" });
  const data = await res.json();
  return res.ok ? data : { success: false, message: data.message };
}

/**
 * Create a new empty session.
 */
export async function createSession(title?: string): Promise<{ success: boolean; data?: ChatSession; message?: string }> {
  const res = await apiFetch("/chat-sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  const data = await res.json();
  return res.ok ? data : { success: false, message: data.message };
}

/**
 * Append a single message manually to a session.
 */
export async function appendMessage(
  sessionId: string,
  message: Omit<ChatMessage, "timestamp">
): Promise<{ success: boolean; data?: ChatSession; message?: string }> {
  const res = await apiFetch(`/chat-sessions/${sessionId}/append`, {
    method: "PATCH",
    body: JSON.stringify(message),
  });
  const data = await res.json();
  return res.ok ? data : { success: false, message: data.message };
}

/**
 * Delete a session.
 */
export async function deleteSession(sessionId: string): Promise<{ success: boolean; message?: string }> {
  const res = await apiFetch(`/chat-sessions/${sessionId}`, { method: "DELETE" });
  const data = await res.json();
  return res.ok ? data : { success: false, message: data.message };
}
