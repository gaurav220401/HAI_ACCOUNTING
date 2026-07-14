import { apiFetch } from "../api";

export interface AgentToolStep {
  toolName: string;
  args: Record<string, any>;
  status: "executing" | "completed" | "failed";
  result?: any;
  error?: string;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolSteps?: AgentToolStep[];
  formAutofill?: {
    formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
    data: Record<string, any>;
    navigationUrl?: string;
  };
  timestamp: number;
  isError?: boolean;
}

export interface AgentResponse {
  success: boolean;
  data?: {
    answer: string;
    toolSteps?: AgentToolStep[];
    formAutofill?: {
      formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
      data: Record<string, any>;
      navigationUrl?: string;
    };
    sessionId: string;
    responseTimeMs: number;
  };
  message?: string;
}

/**
 * Send an instruction to the AI Task Agent API.
 */
export async function sendAgentInstruction(
  instruction: string,
  sessionId?: string
): Promise<AgentResponse> {
  try {
    const res = await apiFetch("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ instruction, sessionId }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: data.message || "AI Agent request failed. Please try again.",
      };
    }

    return data;
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to reach AI Agent service.",
    };
  }
}
