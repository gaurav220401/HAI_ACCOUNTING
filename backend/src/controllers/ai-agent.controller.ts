import { Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { Types } from "mongoose";
import AIAgentTask from "../models/ai-agent-task.model";
import Organization from "../models/organization.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";

// Import Modular AI-Agent Services
import * as itemsService from "../services/ai-agent/items.service";
import * as salesService from "../services/ai-agent/sales.service";
import * as purchasesService from "../services/ai-agent/purchases.service";
import * as contactsService from "../services/ai-agent/contacts.service";
import * as accountsService from "../services/ai-agent/accounts.service";
import * as journalsService from "../services/ai-agent/journals.service";
import * as accountantService from "../services/ai-agent/accountant.service";
import * as fixedAssetsService from "../services/ai-agent/fixed-assets.service";
import * as taxesService from "../services/ai-agent/taxes.service";
import * as inventoryService from "../services/ai-agent/inventory.service";
import * as settingsService from "../services/ai-agent/settings.service";
import * as documentsService from "../services/ai-agent/documents.service";
import * as reportsService from "../services/ai-agent/reports.service";

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
    // Orchestrated via Items Service
    const item = await itemsService.createItem(organizationId, collectedData);

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

// POST /api/ai-agent/workflow/sales-to-payment - Sales order to invoice payment workflow chain (Extensible workflow runner)
export const salesToPaymentWorkflow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.user?.activeOrganization;
  const userId = req.user?._id?.toString() || req.firebaseUser?.uid;
  
  // Read chain type from request body (defaults to "sales_full" for backward compatibility)
  const chainType = req.body.chainType || req.body.workflowType || "sales_full";
  const input = req.body.input || {};

  if (!organizationId || !userId) {
    res.status(400).json({ success: false, message: "Organization and User required." });
    return;
  }

  // 1. Configure Phases based on Chain Type
  let phases: any[] = [];
  let title = "AI Automated Workflow";

  if (chainType === "sales_full") {
    title = "Sales to Payment Chain";
    phases = [
      { phaseIndex: 1, name: "Create Sales Order", description: "Generate and approve sales order document", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Convert to Invoice", description: "Convert sales order items to a customer invoice", status: "pending" },
      { phaseIndex: 3, name: "Record Payment", description: "Record cash/bank settlement for the invoice", status: "pending" },
    ];
  } else if (chainType === "purchase_full") {
    title = "Purchase to Payment Chain";
    phases = [
      { phaseIndex: 1, name: "Create Purchase Order", description: "Generate purchase order document", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Receive Purchase Order", description: "Generate purchase receive document", status: "pending" },
      { phaseIndex: 3, name: "Convert to Bill", description: "Convert PO items into a bill invoice", status: "pending" },
      { phaseIndex: 4, name: "Record Payment Made", description: "Record vendor cash/bank settlement", status: "pending" },
    ];
  } else if (chainType === "expense_quick") {
    title = "Quick Expense Chain";
    phases = [
      { phaseIndex: 1, name: "Create Expense", description: "Save business expense categories", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Record Payment", description: "Settle cash/bank entry", status: "pending" },
    ];
  } else if (chainType === "journal_entry") {
    title = "Journal Ledger Settle";
    phases = [
      { phaseIndex: 1, name: "Create Manual Journal", description: "Compile draft journal lines", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Post to General Ledger", description: "Publish journal transactions in general ledger", status: "pending" },
    ];
  } else if (chainType === "inventory_adjust") {
    title = "Inventory Adjust Chain";
    phases = [
      { phaseIndex: 1, name: "Analyze Stock", description: "Identify inventory stock counts", status: "in_progress", startedAt: new Date() },
      { phaseIndex: 2, name: "Create Adjustment", description: "Save inventory adjustment values", status: "pending" },
    ];
  } else {
    // Fallback default
    title = "AI Accounting Chain";
    phases = [
      { phaseIndex: 1, name: "Execute Step 1", description: "Initial automation step", status: "in_progress", startedAt: new Date() },
    ];
  }

  const task = await AIAgentTask.create({
    organizationId,
    userId,
    taskType: "document_workflow",
    title,
    description: `Workflow Type: ${chainType}`,
    status: "in_progress",
    input,
    phases,
  });

  try {
    // 2. Executing Workflow Chains
    if (chainType === "sales_full") {
      const { customerId, items } = input;
      if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
        throw new Error("Customer ID and items array are required.");
      }

      // Calculate totals
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
      const total = subTotal;

      // Phase 1: Create Sales Order
      const salesOrder = await salesService.createSalesOrder(organizationId, {
        customerId,
        lineItems: orderLineItems,
        subTotal,
        total,
      });

      task.phases[0].status = "completed";
      task.phases[0].completedAt = new Date();
      task.phases[0].result = { salesOrderId: salesOrder._id, salesOrderNumber: salesOrder.salesOrderNumber };

      // Phase 2: Convert to Invoice
      task.phases[1].status = "in_progress";
      task.phases[1].startedAt = new Date();
      await task.save();

      const invoice = await salesService.convertSalesOrderToInvoice(organizationId, salesOrder._id);

      task.phases[1].status = "completed";
      task.phases[1].completedAt = new Date();
      task.phases[1].result = { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber };

      // Phase 3: Record Payment
      task.phases[2].status = "in_progress";
      task.phases[2].startedAt = new Date();
      await task.save();

      const payment = await salesService.recordPaymentReceived(organizationId, {
        customerId,
        amount: total,
        invoiceId: invoice._id,
        paymentMode: "Cash",
      });

      task.phases[2].status = "completed";
      task.phases[2].completedAt = new Date();
      task.phases[2].result = { paymentId: payment._id, paymentNumber: payment.payment_number };

      // Finish Task
      task.status = "completed";
      task.output = {
        salesOrderId: salesOrder._id,
        salesOrderNumber: salesOrder.salesOrderNumber,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        paymentId: payment._id,
        paymentNumber: payment.payment_number,
      };
      await task.save();

    } else if (chainType === "purchase_full") {
      const { vendorId, items } = input;
      if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
        throw new Error("Vendor ID and items array are required.");
      }

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
      const total = subTotal;

      // Phase 1: Create Purchase Order
      const po = await purchasesService.createPurchaseOrder(organizationId, {
        vendorId,
        lineItems: orderLineItems,
        subTotal,
        total,
      });

      task.phases[0].status = "completed";
      task.phases[0].completedAt = new Date();
      task.phases[0].result = { purchaseOrderId: po._id, purchaseOrderNumber: po.purchaseOrderNumber };

      // Phase 2: Receive PO
      task.phases[1].status = "in_progress";
      task.phases[1].startedAt = new Date();
      await task.save();

      const receive = await purchasesService.receivePurchaseOrder(organizationId, po._id, {});

      task.phases[1].status = "completed";
      task.phases[1].completedAt = new Date();
      task.phases[1].result = { receiveId: receive._id, receiveNumber: receive.purchaseReceiveNumber };

      // Phase 3: Convert PO to Bill
      task.phases[2].status = "in_progress";
      task.phases[2].startedAt = new Date();
      await task.save();

      const bill = await purchasesService.convertPOToBill(organizationId, po._id);

      task.phases[2].status = "completed";
      task.phases[2].completedAt = new Date();
      task.phases[2].result = { billId: bill._id, billNumber: bill.billNumber };

      // Phase 4: Record Payment Made
      task.phases[3].status = "in_progress";
      task.phases[3].startedAt = new Date();
      await task.save();

      const payment = await purchasesService.recordPaymentMade(organizationId, {
        vendorId,
        amount: total,
        billId: bill._id,
        paymentMode: "Bank Transfer",
      });

      task.phases[3].status = "completed";
      task.phases[3].completedAt = new Date();
      task.phases[3].result = { paymentId: payment._id, paymentNumber: (payment as any).payment_number };

      // Complete
      task.status = "completed";
      task.output = {
        purchaseOrderId: po._id,
        purchaseOrderNumber: po.purchaseOrderNumber,
        receiveId: receive._id,
        receiveNumber: receive.purchaseReceiveNumber,
        billId: bill._id,
        billNumber: bill.billNumber,
        paymentId: payment._id,
        paymentNumber: (payment as any).payment_number,
      };
      await task.save();

    } else if (chainType === "expense_quick") {
      const { expenseCategory, totalAmount } = input;
      if (!expenseCategory || !totalAmount) {
        throw new Error("Expense category and total amount are required.");
      }

      // Phase 1: Create Expense
      const expense = await purchasesService.createExpense(organizationId, {
        expenseCategory,
        totalAmount,
      });

      task.phases[0].status = "completed";
      task.phases[0].completedAt = new Date();
      task.phases[0].result = { expenseId: expense._id };

      // Phase 2: Settle / Settle via Bank Account
      task.phases[1].status = "in_progress";
      task.phases[1].startedAt = new Date();
      await task.save();

      // Expense settlement mock payment made record
      const payment = await purchasesService.recordPaymentMade(organizationId, {
        vendorId: new Types.ObjectId(),
        amount: totalAmount,
        notes: `Settled quick expense: ${expenseCategory}`,
      });

      task.phases[1].status = "completed";
      task.phases[1].completedAt = new Date();
      task.phases[1].result = { paymentId: payment._id };

      task.status = "completed";
      task.output = { expenseId: expense._id, paymentId: payment._id };
      await task.save();

    } else if (chainType === "journal_entry") {
      const { lineItems, description } = input;
      if (!lineItems || !Array.isArray(lineItems) || lineItems.length < 2) {
        throw new Error("Journal requires a list of at least 2 line items.");
      }

      // Phase 1: Create Manual Journal
      const journal = await journalsService.createJournal(organizationId, {
        lineItems,
        description,
      });

      task.phases[0].status = "completed";
      task.phases[0].completedAt = new Date();
      task.phases[0].result = { journalId: journal._id, journalNumber: journal.journalNumber };

      // Phase 2: Post to General Ledger
      task.phases[1].status = "in_progress";
      task.phases[1].startedAt = new Date();
      await task.save();

      const posted = await journalsService.postJournalToGL(organizationId, journal._id);

      task.phases[1].status = "completed";
      task.phases[1].completedAt = new Date();
      task.phases[1].result = { status: posted.status };

      task.status = "completed";
      task.output = { journalId: journal._id, journalNumber: journal.journalNumber, status: posted.status };
      await task.save();

    } else if (chainType === "inventory_adjust") {
      const { items: adjustItems, reason } = input;
      if (!adjustItems || !Array.isArray(adjustItems) || adjustItems.length === 0) {
        throw new Error("Adjustment items list is required.");
      }

      // Phase 1: Analyze Stock
      task.phases[0].status = "completed";
      task.phases[0].completedAt = new Date();
      task.phases[0].result = { itemsCheckedCount: adjustItems.length };

      // Phase 2: Create Adjustment
      task.phases[1].status = "in_progress";
      task.phases[1].startedAt = new Date();
      await task.save();

      const adjustment = await inventoryService.createInventoryAdjustment(organizationId, {
        lineItems: adjustItems.map((itm: any) => ({
          itemId: new Types.ObjectId(itm.itemId),
          name: itm.name || "Item",
          quantity: Number(itm.quantity) || 0,
        })),
        reason,
      });

      const adjustments = adjustment as any[];
      task.phases[1].status = "completed";
      task.phases[1].completedAt = new Date();
      task.phases[1].result = { adjustmentCount: adjustments.length, firstId: adjustments[0]?._id };

      task.status = "completed";
      task.output = { adjustmentCount: adjustments.length };
      await task.save();

    } else {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }

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
    const failedPhaseIdx = task.phases.findIndex((p) => p.status === "in_progress");
    if (failedPhaseIdx !== -1) {
      task.phases[failedPhaseIdx].status = "failed";
      task.phases[failedPhaseIdx].completedAt = new Date();
      task.phases[failedPhaseIdx].errorMessage = error.message || "Workflow step failed.";
      task.phases[failedPhaseIdx].manualSteps = [
        "Review entered parameters for validation constraints",
        "Check connection state and DB models integrity",
        "Perform remaining conversions manually under the corresponding module pages",
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

  // Query via orchestrated itemsService
  const items = await itemsService.listItems(organizationId);

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

    // Group items by itemType
    const category = item.itemType || "Goods";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }

  // Top 10 items sorted by value descending
  const sortedItems = [...items].sort((a: any, b: any) => {
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

    const config: any = {
      systemInstruction: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: 1000,
    };

    if (taskType === "create_item" || taskType === "document_workflow") {
      config.responseMimeType = "application/json";
    }

    const result = await client.models.generateContent({
      model: llmModel,
      contents: userPrompt,
      config,
    });

    let text = result.text || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    if (taskType === "create_item" || taskType === "document_workflow") {
      try {
        const jsonOutput = JSON.parse(text);

        // --- Agentic Name-to-ID DB Resolution ---
        const organizationId = req.user?.activeOrganization;
        if (organizationId && jsonOutput.fields) {
          const fields = jsonOutput.fields;

          // 1. Resolve Customer Name via Contacts Service
          if (fields.customerName && !fields.customerId) {
            const contacts = await contactsService.searchContacts(organizationId, fields.customerName, "Customer");
            if (contacts && contacts.length > 0) {
              fields.customerId = contacts[0]._id.toString();
              fields.customerName = contacts[0].displayName;
            }
          }

          // 2. Resolve Item Name via Items Service
          if (fields.itemName && !fields.itemId) {
            const items = await itemsService.searchItems(organizationId, fields.itemName);
            if (items && items.length > 0) {
              fields.itemId = items[0]._id.toString();
              fields.itemName = items[0].name;
              if (!fields.rate || fields.rate === 0) {
                fields.rate = items[0].sellingPrice || 0;
              }
            }
          }
        }

        res.json({
          success: true,
          data: jsonOutput,
        });
        return;
      } catch (err) {
        console.warn("[askAgentQuestion] JSON output parsing failed:", err);
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
