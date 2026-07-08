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

/**
 * Send a message to the RAG chatbot API.
 */
export async function sendChatMessage(
  question: string,
  sessionId?: string
): Promise<ChatResponse> {
  const res = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question, sessionId }),
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
