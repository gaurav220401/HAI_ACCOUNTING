import { apiFetch } from "../api";

export type ChatModelProvider = "gemini" | "groq";

export interface ChatModelOption {
  id: string;
  name: string;
  provider: ChatModelProvider;
  description: string;
  badge?: string;
  isDefault?: boolean;
}

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
  provider?: ChatModelProvider,
  model?: string
): Promise<ChatResponse> {
  const res = await apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ question, sessionId, provider, model }),
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

export interface ChatModelsResponse {
  success: boolean;
  data?: {
    activeProvider: ChatModelProvider;
    activeModel: string;
    models: ChatModelOption[];
  };
  message?: string;
}

/**
 * Fetch available chat models from the backend.
 */
export async function getChatModels(): Promise<ChatModelsResponse> {
  const res = await apiFetch("/chat/models");
  const data = await res.json();
  return data;
}



