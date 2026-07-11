import { Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { Types } from "mongoose";
import AIAgentTask from "../models/ai-agent-task.model";
import Item from "../models/item.model";
import SalesOrder from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import PaymentReceived from "../models/payment-received.model";
import Organization from "../models/organization.model";
import Contact from "../models/contact.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";

// ─── Gemini Client Setup ───────────────────────────────────────────────

let genaiClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (!genaiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set.");
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}

// ─── Sequential Number Generators ──────────────────────────────────────

async function getNextSalesOrderNumber(organizationId: any): Promise<string> {
  const last = await SalesOrder.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ salesOrderNumber: -1 })
    .select("salesOrderNumber")
    .lean();
  if (!last) return "SO-00001";
  const match = String(last.salesOrderNumber || "").match(/SO-(\d+)/);
  if (!match) return "SO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `SO-${String(next).padStart(5, "0")}`;
}

async function getNextInvoiceNumber(organizationId: any): Promise<string> {
  const last = await Invoice.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();
  if (!last) return "INV-000001";
  const match = String(last.invoiceNumber || "").match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

async function getNextPaymentNumber(organizationId: any): Promise<string> {
  const last = await PaymentReceived.findOne({ organization_id: organizationId, is_deleted: { $in: [true, false] } })
    .sort({ payment_number: -1 })
    .select("payment_number")
    .lean();
  if (!last) return "PAY-00001";
  const match = String(last.payment_number || "").match(/PAY-(\d+)/);
  if (!match) return "PAY-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PAY-${String(next).padStart(5, "0")}`;
}

// ─── Controller Handlers ──────────────────────────────────────────────

// GET /api/ai-agent/tasks - List agent tasks
export const listTasks = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const tasks = await AIAgentTask.find({ organizationId, userId })
    .select("-phases.result -output -input") // Exclude heavy payloads for list views
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({ success: true, data: tasks });
});

// GET /api/ai-agent/tasks/:id - Retrieve specific task
export const getTask = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { id } = req.params;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  const task = await AIAgentTask.findOne({ _id: id, organizationId, userId });

  if (!task) {
    res.status(404).json({ success: false, message: "Task not found." });
    return;
  }

  res.json({ success: true, data: task });
});

// POST /api/ai-agent/workflow/create-item - Guide and execute item creation
export const createItemWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { collectedData } = req.body;

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  // Create initial in-progress task in DB
  const task = await AIAgentTask.create({
    organizationId,
    userId,
    taskType: "create_item",
    title: "AI Guided Item Creation",
    description: `Create item: ${collectedData?.name || "Pending"}`,
    status: "in_progress",
    input: collectedData,
    phases: [
      { phaseIndex: 1, name: "Validate Data", description: "Validate form field constraints", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Create Item", description: "Save item in organization catalogue", status: "pending" },
      { phaseIndex: 3, name: "Confirm", description: "Return created item details", status: "pending" },
    ],
  });

  // Phase 1: Validate
  const name = collectedData?.name?.trim();
  if (!name) {
    task.status = "failed";
    task.phases[0].status = "failed";
    task.phases[0].completedAt = new Date();
    task.phases[0].errorMessage = "Missing required field: name";
    task.phases[0].manualSteps = ["Enter an item name to proceed", "Verify itemType fits Goods or Service"];
    task.errorMessage = "Item name is required for validation.";
    await task.save();

    res.json({
      success: true,
      data: {
        taskId: task._id,
        status: task.status,
        phases: task.phases,
        missingFields: ["name"],
      },
    });
    return;
  }

  task.phases[0].status = "completed";
  task.phases[0].completedAt = new Date();
  task.phases[0].result = { name };

  // Phase 2: Create Item
  task.phases[1].status = "in_progress";
  task.phases[1].startedAt = new Date();
  await task.save();

  try {
    const item = await Item.create({
      organizationId,
      name,
      itemType: collectedData.itemType || "Goods",
      sku: collectedData.sku || "",
      sellingPrice: Number(collectedData.sellingPrice) || 0,
      costPrice: Number(collectedData.costPrice) || 0,
      description: collectedData.description || "",
      unit: collectedData.unit || null,
      isActive: true,
    });

    task.phases[1].status = "completed";
    task.phases[1].completedAt = new Date();
    task.phases[1].result = { itemId: item._id };

    // Phase 3: Confirm
    task.phases[2].status = "completed";
    task.phases[2].startedAt = new Date();
    task.phases[2].completedAt = new Date();
    task.phases[2].result = item.toJSON();

    task.status = "completed";
    task.output = item.toJSON();
    await task.save();

    res.json({
      success: true,
      data: {
        taskId: task._id,
        status: task.status,
        phases: task.phases,
        createdItem: item,
      },
    });
  } catch (error: any) {
    task.status = "failed";
    task.phases[1].status = "failed";
    task.phases[1].completedAt = new Date();
    task.phases[1].errorMessage = error.message || "Database write failed.";
    task.phases[1].manualSteps = ["Go to Items > New Item", "Fill in the item details and click Save"];
    task.errorMessage = error.message || "Failed to create item in database.";
    await task.save();

    res.json({
      success: true,
      data: {
        taskId: task._id,
        status: task.status,
        phases: task.phases,
        errorMessage: task.errorMessage,
      },
    });
  }
});

// POST /api/ai-agent/workflow/sales-to-payment - Sales order to invoice payment workflow chain
export const salesToPaymentWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  const { customerId, items } = req.body.input || {};

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, message: "Customer ID and line items array are required." });
    return;
  }

  // Create initial task in progress
  const task = await AIAgentTask.create({
    organizationId,
    userId,
    taskType: "document_workflow",
    title: "Sales to Payment Chain",
    description: `Sales flow for customer: ${customerId}`,
    status: "in_progress",
    input: { customerId, items },
    phases: [
      { phaseIndex: 1, name: "Create Sales Order", description: "Generate and approve sales order document", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Convert to Invoice", description: "Convert sales order items to a customer invoice", status: "pending" },
      { phaseIndex: 3, name: "Record Payment", description: "Record cash/bank settlement for the invoice", status: "pending" },
    ],
  });

  try {
    // 1. Calculate totals
    let subTotal = 0;
    const orderLineItems = items.map((itm: any) => {
      const amount = (Number(itm.quantity) || 1) * (Number(itm.rate) || 0);
      subTotal += amount;
      return {
        itemId: new Types.ObjectId(itm.itemId),
        name: itm.name || "Item",
        quantity: Number(itm.quantity) || 1,
        rate: Number(itm.rate) || 0,
        amount,
      };
    });
    const total = subTotal; // adjustment and taxes default 0

    // 2. Phase 1 - Create Sales Order
    const salesOrderNumber = await getNextSalesOrderNumber(organizationId);
    const salesOrder = (await SalesOrder.create({
      organizationId,
      customerId,
      salesOrderNumber,
      orderDate: new Date(),
      lineItems: orderLineItems,
      subTotal,
      total,
      status: "APPROVED",
      invoiceStatus: "Not Invoiced",
      shipmentStatus: "Pending",
      taxType: "none",
      isActive: true,
    } as any)) as any;

    task.phases[0].status = "completed";
    task.phases[0].completedAt = new Date();
    task.phases[0].result = { salesOrderId: salesOrder._id, salesOrderNumber };

    // 3. Phase 2 - Convert to Invoice
    task.phases[1].status = "in_progress";
    task.phases[1].startedAt = new Date();
    await task.save();

    const invoiceNumber = await getNextInvoiceNumber(organizationId);
    const invoice = (await Invoice.create({
      organizationId,
      invoiceNumber,
      orderNumber: salesOrderNumber,
      customerId,
      invoiceDate: new Date(),
      dueDate: new Date(),
      items: orderLineItems.map((li) => ({
        itemId: li.itemId,
        name: li.name,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
      })),
      subTotal,
      total,
      balanceDue: total,
      status: "Sent",
      discountType: "amount",
      discountAmount: 0,
      taxType: "none",
      isActive: true,
    } as any)) as any;

    // Link Sales Order to Invoice
    salesOrder.invoiceStatus = "Invoiced";
    salesOrder.invoiceId = invoice._id;
    await salesOrder.save();

    task.phases[1].status = "completed";
    task.phases[1].completedAt = new Date();
    task.phases[1].result = { invoiceId: invoice._id, invoiceNumber };

    // 4. Phase 3 - Record Payment
    task.phases[2].status = "in_progress";
    task.phases[2].startedAt = new Date();
    await task.save();

    const paymentNumber = await getNextPaymentNumber(organizationId);
    const payment = (await PaymentReceived.create({
      organization_id: organizationId,
      payment_id: `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      payment_number: paymentNumber,
      customer_id: new Types.ObjectId(customerId),
      payment_date: new Date(),
      payment_mode: "Cash",
      status: "PAID",
      total_amount_received: total,
      amount_used_for_invoices: total,
      amount_refunded: 0,
      amount_in_excess: 0,
      audit_log: [{ action: "Record Payment", amount: total, invoice_id: invoice._id, at: new Date() }],
    } as any)) as any;

    // Mark invoice as paid
    invoice.status = "Paid";
    invoice.balanceDue = 0;
    await invoice.save();

    task.phases[2].status = "completed";
    task.phases[2].completedAt = new Date();
    task.phases[2].result = { paymentId: payment._id, paymentNumber };

    // Mark task completed
    task.status = "completed";
    task.output = {
      salesOrderId: salesOrder._id,
      salesOrderNumber,
      invoiceId: invoice._id,
      invoiceNumber,
      paymentId: payment._id,
      paymentNumber,
    };
    await task.save();

    res.json({
      success: true,
      data: {
        taskId: task._id,
        status: task.status,
        phases: task.phases,
        output: task.output,
      },
    });
  } catch (error: any) {
    // Phase error tracking
    const failedPhaseIdx = task.phases.findIndex((p) => p.status === "in_progress");
    if (failedPhaseIdx !== -1) {
      task.phases[failedPhaseIdx].status = "failed";
      task.phases[failedPhaseIdx].completedAt = new Date();
      task.phases[failedPhaseIdx].errorMessage = error.message || "Workflow step failed.";
      task.phases[failedPhaseIdx].manualSteps = [
        "Check that customerId and itemIds exist",
        "Perform remaining conversions manually under Invoices or Payments Received menu",
      ];
    }
    task.status = "partial";
    task.errorMessage = error.message || "Failed to execute complete document workflow.";
    await task.save();

    res.json({
      success: true,
      data: {
        taskId: task._id,
        status: task.status,
        phases: task.phases,
        errorMessage: task.errorMessage,
      },
    });
  }
});

// GET /api/ai-agent/items/analysis - Run inventory level analysis and report back with AI insights
export const analyzeItems = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;

  if (!organizationId) {
    res.status(400).json({ success: false, message: "Organization required." });
    return;
  }

  // Fetch organization context
  const org = await Organization.findById(organizationId).select("name").lean();
  const orgName = org?.name || "HAI Company";

  // Fetch items
  const items = await Item.find({ organizationId, isActive: true }).lean();

  // Compile calculations
  const totalItems = items.length;
  let totalInventoryValue = 0;
  const lowStockItems: any[] = [];
  const zeroStockItems: any[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const item of items) {
    const value = (item.stockOnHand || 0) * (item.averageCost || item.costPrice || 0);
    totalInventoryValue += value;

    if ((item.stockOnHand || 0) === 0) {
      zeroStockItems.push(item);
    } else if ((item.stockOnHand || 0) < (item.reorderPoint || 0)) {
      lowStockItems.push(item);
    }

    // Group items by itemType (Goods vs. Service)
    const category = item.itemType || "Goods";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }

  // Top 10 items sorted by value descending
  const sortedItems = [...items].sort((a, b) => {
    const valA = (a.stockOnHand || 0) * (a.averageCost || a.costPrice || 0);
    const valB = (b.stockOnHand || 0) * (b.averageCost || b.costPrice || 0);
    return valB - valA;
  });
  const topValueItems = sortedItems.slice(0, 10);

  const analysisData = {
    totalItems,
    totalInventoryValue,
    lowStockItemsCount: lowStockItems.length,
    zeroStockItemsCount: zeroStockItems.length,
    topValueItems: topValueItems.map((itm) => ({
      name: itm.name,
      sku: itm.sku,
      stock: itm.stockOnHand,
      value: (itm.stockOnHand || 0) * (itm.averageCost || itm.costPrice || 0),
    })),
    categorySummary: categoryCounts,
  };

  try {
    const client = getGenAIClient();
    const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-2.5-flash";

    const prompt = `You are a professional inventory and financial analyst working for ${orgName}.
Below is the live inventory summary:
${JSON.stringify(analysisData, null, 2)}

Provide a detailed 3-paragraph business summary of these inventory metrics, including:
1. An overall assessment of stock levels, inventory value, and core strengths.
2. Highlight areas of risk (low/zero stock items, items locking capital).
3. Actionable insights and purchase advice for optimization.

Be structured, write in a professional and clear tone. Do not use generic filler words.`;

    const result = await client.models.generateContent({
      model: llmModel,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
    });

    const aiSummary = result.text || "AI insight generation failed. Please try again.";

    res.json({
      success: true,
      data: {
        analysis: analysisData,
        aiSummary,
        items: lowStockItems,
      },
    });
  } catch (error: any) {
    console.error("AI Inventory Analysis failed:", error);
    res.json({
      success: true,
      data: {
        analysis: analysisData,
        aiSummary: "The AI insight generator is currently offline. Review the raw metrics dashboard below.",
        items: lowStockItems,
      },
    });
  }
});

// POST /api/ai-agent/ask - Ask Agent direct workflow questions
export const askAgentQuestion = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { question, context, taskType } = req.body;

  if (!question || typeof question !== "string") {
    res.status(400).json({ success: false, message: "A question is required." });
    return;
  }

  try {
    const client = getGenAIClient();
    const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-2.5-flash";

    let systemPrompt = `You are HAI Accounting's AI Assistant Agent (Nemo).
You guide users through completing tasks inside the HAI Accounting platform.
Be concise, structured, and helpful. Focus on answering direct workflow questions step by step.`;

    if (taskType === "create_item") {
      systemPrompt = `You are HAI Accounting's AI Assistant Agent (Nemo).
Your goal is to collect details for a new inventory item.
The fields are:
1. 'name' (required string, name of product/service)
2. 'itemType' (enum: 'Goods' or 'Service', defaults to 'Goods')
3. 'sku' (string SKU code)
4. 'sellingPrice' (number, price charged to customers)
5. 'costPrice' (number, cost paid to vendors)
6. 'unit' (string measurement unit, e.g. pcs, box, kg)
7. 'description' (string short description)

Current collected fields context:
${context || "{}"}

Analyze the user's message and:
1. Extract any values matching the fields list from their message.
2. Update the fields list accordingly (merging with existing values in context).
3. Draft a conversational response asking for missing details or confirming success.

Return a JSON object ONLY in the following format (no other text, do not prefix with markdown tags like \`\`\`json):
{
  "message": "AI message replying to user",
  "fields": {
    "name": "string",
    "itemType": "Goods" | "Service",
    "sku": "string",
    "sellingPrice": number,
    "costPrice": number,
    "unit": "string",
    "description": "string"
  }
}`;
    } else if (taskType === "document_workflow") {
      systemPrompt = `You are HAI Accounting's AI Assistant Agent (Nemo).
Your goal is to collect inputs to execute a sales document workflow chain (Sales Order -> Invoice -> Payment received).
The fields are:
1. 'customerName' (string, name of the customer)
2. 'itemName' (string, name of the inventory item they are buying)
3. 'quantity' (number, quantity purchased, defaults to 1)
4. 'rate' (number, rate/price per unit)

Current collected fields context:
${context || "{}"}

Analyze the user's message and:
1. Extract any values matching the fields list from their message.
2. Update the fields list accordingly (merging with existing values in context).
3. Draft a conversational response asking for missing details, confirming, or prompting them to click 'Run Document Chain'.

Return a JSON object ONLY in the following format (no other text, do not prefix with markdown tags like \`\`\`json):
{
  "message": "AI message replying to user",
  "fields": {
    "customerName": "string",
    "itemName": "string",
    "quantity": number,
    "rate": number
  }
}`;
    }

    const userPrompt = `CONTEXT:
${context || "No workspace context provided."}

TASK TYPE:
${taskType || "General Question"}

USER QUESTION:
${question.trim()}`;

    const result = await client.models.generateContent({
      model: llmModel,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.3,
        maxOutputTokens: 1000,
      },
    });

    let text = result.text || "";
    // Clean up markdown code blocks if AI outputs them
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (taskType === "create_item" || taskType === "document_workflow") {
      try {
        const jsonOutput = JSON.parse(text);
        res.json({
          success: true,
          data: jsonOutput,
        });
        return;
      } catch (err) {
        // Fallback for malformed JSON
        res.json({
          success: true,
          data: {
            message: text,
            fields: JSON.parse(context || "{}"),
          },
        });
        return;
      }
    }

    res.json({
      success: true,
      data: {
        answer: text,
        suggestedAction: taskType ? `${taskType} guided task` : undefined,
      },
    });
  } catch (error: any) {
    console.error("Agent ask question pipeline failed:", error);
    res.status(500).json({
      success: false,
      message: "AI Agent is temporarily offline. Please try again.",
    });
  }
});
