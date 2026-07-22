import { apiFetch } from "../api";

export type ChatModelProvider = "gemini" | "groq";

export interface ChatNavigationAction {
  label: string;
  url: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{ title: string; url: string }>;
  actions?: ChatNavigationAction[];
  timestamp: number;
  isError?: boolean;
}

export interface ChatResponse {
  success: boolean;
  data?: {
    answer: string;
    sources: Array<{ title: string; url: string }>;
    actions?: ChatNavigationAction[];
    sessionId: string;
    responseTimeMs: number;
    provider?: ChatModelProvider;
    model?: string;
  };
  message?: string;
}

/**
 * Send a message to the RAG chatbot API.
 */
export async function sendChatMessage(
  question: string,
  sessionId?: string,
  provider?: ChatModelProvider
): Promise<ChatResponse> {
  const res = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question, sessionId, provider }),
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

