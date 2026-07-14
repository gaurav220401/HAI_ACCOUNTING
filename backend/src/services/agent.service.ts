import { GoogleGenAI } from "@google/genai";
import { AGENT_FUNCTION_DECLARATIONS, executeAgentTool } from "./agent-tools";

let geminiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured.");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export interface IAgentExecutionResult {
  answer: string;
  toolSteps: Array<{
    toolName: string;
    args: Record<string, any>;
    status: "executing" | "completed" | "failed";
    result?: any;
    error?: string;
  }>;
  formAutofill?: {
    formType: "invoice" | "bill" | "customer" | "vendor" | "item" | "expense";
    data: Record<string, any>;
    navigationUrl?: string;
  };
}

const AGENT_SYSTEM_PROMPT = `You are the Autonomous AI Task Agent for HAI Accounting software.
Your primary role is to execute business actions and mutate/query data on behalf of the user.

RULES:
- When the user asks you to perform an action (e.g. create a customer, invoice, expense, item, or search records), ALWAYS use the available tool functions.
- You can execute multiple tools in sequence if needed to complete a request (e.g., search or create a customer first, then create an invoice for them).
- If the user asks to prepare or draft a form without immediate creation, use the 'generate_form_autofill' tool.
- Provide a clear, professional summary of all actions executed. Mention relevant details like created IDs, names, amounts, and invoice numbers.
- Always present monetary values with ₹ formatting.`;

/**
 * Execute multi-turn AI Agent task workflow using Gemini function calling.
 */
export async function runAgentWorkflow(
  instruction: string,
  organizationId: string,
  sessionHistory: any[] = []
): Promise<IAgentExecutionResult> {
  const client = getGenAIClient();
  const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-3.5-flash";

  const toolSteps: IAgentExecutionResult["toolSteps"] = [];
  let formAutofill: IAgentExecutionResult["formAutofill"] = undefined;

  // 1. Initial Prompt Assembly
  const contents: any[] = [
    { role: "user", parts: [{ text: `INSTRUCTION: ${instruction}` }] },
  ];

  const maxTurns = 5;
  let currentTurn = 0;
  let finalAnswer = "";

  while (currentTurn < maxTurns) {
    currentTurn++;

    const response = await client.models.generateContent({
      model: llmModel,
      contents,
      config: {
        systemInstruction: AGENT_SYSTEM_PROMPT,
        temperature: 0.2,
        tools: [
          {
            functionDeclarations: AGENT_FUNCTION_DECLARATIONS as any,
          },
        ],
      },
    });

    const candidates = response.candidates || [];
    const firstCandidate = candidates[0];
    const parts = firstCandidate?.content?.parts || [];

    // Extract function calls if present
    const functionCalls: any[] = [];
    let textParts = "";

    for (const part of parts) {
      if ((part as any).functionCall) {
        functionCalls.push((part as any).functionCall);
      } else if (part.text) {
        textParts += part.text;
      }
    }

    // If no tool function calls, LLM completed execution
    if (functionCalls.length === 0) {
      finalAnswer = response.text || textParts || "Task completed successfully.";
      break;
    }

    // Execute tool calls
    contents.push(firstCandidate.content);

    const functionResponses: any[] = [];

    for (const call of functionCalls) {
      const toolName = call.name;
      const toolArgs = call.args || {};

      console.log(`⚡ [AI Agent Tool Executing]: ${toolName}`, toolArgs);

      toolSteps.push({
        toolName,
        args: toolArgs,
        status: "executing",
      });

      try {
        const result = await executeAgentTool(toolName, toolArgs, organizationId);

        // Capture form autofill payload if returned
        if (result?.formAutofill) {
          formAutofill = result.formAutofill;
        }

        // Update step status
        const stepIdx = toolSteps.length - 1;
        toolSteps[stepIdx].status = "completed";
        toolSteps[stepIdx].result = result;

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: result,
          },
        });
      } catch (err: any) {
        console.error(`❌ [AI Agent Tool Failed]: ${toolName}`, err.message);

        const stepIdx = toolSteps.length - 1;
        toolSteps[stepIdx].status = "failed";
        toolSteps[stepIdx].error = err.message;

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { error: err.message },
          },
        });
      }
    }

    // Pass tool execution results back into contents array for next LLM turn
    contents.push({
      role: "user",
      parts: functionResponses,
    });
  }

  return {
    answer: finalAnswer,
    toolSteps,
    formAutofill,
  };
}
