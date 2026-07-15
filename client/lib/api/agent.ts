import { apiFetch } from "../api";

// ─── Execution Plan Step (mirrors backend AgentExecutionStep) ──────────

export interface AgentExecutionStep {
  id: string;
  type: "think" | "navigate" | "fill_field" | "scroll_to" | "click" | "wait" | "complete";
  label: string;
  target?: string;
  value?: string;
  delay?: number;
  fieldKey?: string;
}

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
  executionPlan?: AgentExecutionStep[];
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
    executionPlan?: AgentExecutionStep[];
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
  sessionId?: string,
  executionMode?: "api" | "visual_ui"
): Promise<AgentResponse> {
  try {
    const res = await apiFetch("/agent/chat", {
      method: "POST",
      body: JSON.stringify({ instruction, sessionId, executionMode }),
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
