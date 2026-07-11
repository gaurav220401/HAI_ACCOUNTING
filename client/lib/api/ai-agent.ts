import { apiFetch } from "../api";

export interface AgentPhase {
  phaseIndex: number;
  name: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  result?: any;
  errorMessage?: string;
  manualSteps?: string[];
}

export interface AgentTask {
  _id: string;
  taskType: "create_item" | "document_workflow" | "item_analysis" | "data_export" | "report_generation";
  status: "pending" | "in_progress" | "completed" | "failed" | "partial";
  title: string;
  description: string;
  phases: AgentPhase[];
  input?: any;
  output?: any;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTaskListResponse {
  success: boolean;
  data: AgentTask[];
}

export interface AgentTaskResponse {
  success: boolean;
  data: AgentTask;
}

export interface CreateItemWorkflowInput {
  collectedData: {
    name?: string;
    itemType?: "Goods" | "Service";
    sku?: string;
    sellingPrice?: number;
    costPrice?: number;
    description?: string;
    unit?: string;
  };
}

export interface SalesWorkflowInput {
  input: {
    customerId: string;
    items: Array<{
      itemId: string;
      name?: string;
      quantity: number;
      rate: number;
    }>;
  };
}

export interface WorkflowResponse {
  success: boolean;
  data: {
    taskId: string;
    status: AgentTask["status"];
    phases: AgentPhase[];
    createdItem?: any;
    output?: any;
    missingFields?: string[];
    errorMessage?: string;
  };
}

export interface ItemsAnalysisResponse {
  success: boolean;
  data: {
    analysis: {
      totalItems: number;
      totalInventoryValue: number;
      lowStockItemsCount: number;
      zeroStockItemsCount: number;
      topValueItems: Array<{
        name: string;
        sku: string;
        stock: number;
        value: number;
      }>;
      categorySummary: Record<string, number>;
    };
    aiSummary: string;
    items: any[];
  };
}

export interface AgentAnswerResponse {
  success: boolean;
  data: {
    answer: string;
    suggestedAction?: string;
  };
}

/**
 * Fetch last 50 tasks for active organization + user
 */
export async function listAgentTasks(): Promise<AgentTaskListResponse> {
  const res = await apiFetch("/ai-agent/tasks", { method: "GET" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to retrieve tasks.");
  return data;
}

/**
 * Fetch detailed task phase and output statuses
 */
export async function getAgentTask(taskId: string): Promise<AgentTaskResponse> {
  const res = await apiFetch(`/ai-agent/tasks/${taskId}`, { method: "GET" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to retrieve task details.");
  return data;
}

/**
 * Execute AIGuided item creation form validation and writing pipeline
 */
export async function createItemWorkflow(data: CreateItemWorkflowInput): Promise<WorkflowResponse> {
  const res = await apiFetch("/ai-agent/workflow/create-item", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Item creation workflow failed.");
  return body;
}

/**
 * Convert Sales Order through Customer Invoice down to Payment settlement documents
 */
export async function salesToPaymentWorkflow(data: SalesWorkflowInput): Promise<WorkflowResponse> {
  const res = await apiFetch("/ai-agent/workflow/sales-to-payment", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Sales to Payment conversion workflow failed.");
  return body;
}

/**
 * Fetch raw inventory counts grouped with Gemini analytics report
 */
export async function getItemsAnalysis(): Promise<ItemsAnalysisResponse> {
  const res = await apiFetch("/ai-agent/items/analysis", { method: "GET" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to compile inventory metrics analysis.");
  return data;
}

/**
 * Query AI Agent directly for structured guided instructions
 */
export async function askAgent(question: string, context?: string, taskType?: string): Promise<AgentAnswerResponse> {
  const res = await apiFetch("/ai-agent/ask", {
    method: "POST",
    body: JSON.stringify({ question, context, taskType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to query the AI Agent.");
  return data;
}
