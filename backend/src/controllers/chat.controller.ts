/**
 * Chat Controller — Enhanced RAG Query Pipeline with Org-Scoped Live Data
 *
 * Handles the complete Retrieval-Augmented Generation flow:
 *   1. Validate & sanitize user question
 *   2. Detect intent — does the question need live business data?
 *   3. If yes, fetch org-scoped business data (invoices, customers, balances, etc.)
 *   4. Embed the question using Gemini (RETRIEVAL_QUERY task type)
 *   5. Run $vectorSearch on MongoDB Atlas to find relevant knowledge base chunks
 *   6. Apply relevance threshold to avoid hallucination
 *   7. Build combined prompt: knowledge base context + live business data
 *   8. Call Gemini LLM to generate grounded answer
 *   9. Log the interaction for analytics
 *  10. Return answer + source references
 *
 * SECURITY: Every live data query is hard-scoped to req.user.activeOrganization.
 * No cross-org data leakage is possible.
 */

import { Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { Types } from "mongoose";
import { getKBChunkModel, getChatbotConnection } from "../models/kb-chunk.model";
import { getEmbedding } from "../chatbot/gemini-embeddings";
import ChatLog from "../models/chat-log.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";

// ─── Models for live data queries ──────────────────────────────────────
import Contact from "../models/contact.model";
import Invoice from "../models/invoice.model";
import Bill from "../models/bill.model";
import Item from "../models/item.model";
import Account from "../models/account.model";
import Organization from "../models/organization.model";

// ─── Configuration ─────────────────────────────────────────────────────

const RELEVANCE_THRESHOLD = 0.60;
const TOP_K = 5;
const NUM_CANDIDATES = 150;
const MAX_QUESTION_LENGTH = 500;
const MAX_CONTEXT_TOKENS = 3000;

// ─── Gemini LLM Client ────────────────────────────────────────────────

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

// ─── Intent Detection ──────────────────────────────────────────────────

/**
 * Determines whether the user's question requires live business data
 * from the main database (invoices, customers, balances, etc.)
 * vs. purely knowledge-base answers (how-to, feature explanations).
 */
interface DataIntent {
  needsLiveData: boolean;
  categories: Set<string>; // Which data categories to fetch
}

const INTENT_KEYWORDS: Record<string, string[]> = {
  contacts: [
    "customer", "customers", "vendor", "vendors", "supplier", "suppliers",
    "client", "clients", "contact", "contacts", "who owes", "who owe",
    "receivable from", "payable to", "top customer", "top vendor",
  ],
  invoices: [
    "invoice", "invoices", "receivable", "receivables", "overdue invoice",
    "unpaid invoice", "paid invoice", "draft invoice", "due amount",
    "outstanding", "owed to me", "money coming", "sales",
  ],
  bills: [
    "bill", "bills", "payable", "payables", "overdue bill", "unpaid bill",
    "vendor bill", "money i owe", "purchases", "supplier bill",
  ],
  items: [
    "item", "items", "product", "products", "inventory", "stock",
    "low stock", "out of stock", "reorder", "sku", "goods", "service",
  ],
  accounts: [
    "balance", "bank balance", "cash balance", "account balance",
    "bank account", "cash account", "bank", "how much money",
    "funds", "account", "accounts",
  ],
  expenses: [
    "expense", "expenses", "spending", "expenditure", "cost",
  ],
  organization: [
    "my organization", "my company", "my business", "org details",
    "company name", "organization name", "fiscal year",
  ],
  sales_orders: [
    "sales order", "sales orders", "so", "order from customer"
  ],
  purchase_orders: [
    "purchase order", "purchase orders", "po", "order to vendor"
  ],
  quotes: [
    "quote", "estimate", "quotes", "estimates"
  ],
  payments_received: [
    "payment received", "customer payment", "money received"
  ],
  payments_made: [
    "payment made", "vendor payment", "bill payment", "money sent"
  ],
  credit_notes: [
    "credit note", "customer credit", "refund"
  ],
  vendor_credits: [
    "vendor credit", "supplier credit"
  ],
  journals: [
    "journal", "manual journal", "gl entry"
  ],
  trialbalance: [
    "trial balance", "trialbalance", "debit and credit total", "debit and credit sum",
    "ledger summary", "ledger balance", "accounting summary", "debit balance", "credit balance",
    "closing balance", "opening balance",
  ],
  summary: [
    "summary", "overview", "dashboard", "report", "snapshot",
    "how is my business", "business health", "financial summary",
    "tell me about my", "show me my", "everything",
  ],
};

function detectIntent(question: string): DataIntent {
  const lower = question.toLowerCase();
  const categories = new Set<string>();

  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        categories.add(category);
        break;
      }
    }
  }

  // "summary" / "overview" type questions should pull everything
  if (categories.has("summary")) {
    categories.add("contacts");
    categories.add("invoices");
    categories.add("bills");
    categories.add("items");
    categories.add("accounts");
    categories.add("expenses");
    categories.add("organization");
    categories.add("trialbalance");
    categories.add("sales_orders");
    categories.add("purchase_orders");
    categories.add("quotes");
    categories.add("payments_received");
    categories.add("payments_made");
    categories.add("credit_notes");
    categories.add("vendor_credits");
    categories.add("journals");
  }

  return {
    needsLiveData: categories.size > 0,
    categories,
  };
}

// ─── Org-Scoped Business Data Fetcher ──────────────────────────────────

/**
 * Fetches live business data from the main MongoDB, strictly scoped
 * to the user's active organization. Returns a structured text snapshot
 * that gets injected into the LLM prompt.
 *
 * SECURITY: Every query uses { organizationId } — no cross-org leakage.
 */
async function fetchOrgBusinessContext(
  organizationId: Types.ObjectId,
  categories: Set<string>
): Promise<string> {
  const sections: string[] = [];

  try {
    // ── Organization Details ──
    if (categories.has("organization") || categories.has("summary")) {
      const org = await Organization.findById(organizationId)
        .select("name baseCurrency fiscalYearStart country industry")
        .lean();
      if (org) {
        sections.push(
          `ORGANIZATION DETAILS:\n` +
          `- Name: ${org.name}\n` +
          `- Base Currency: ${org.baseCurrency || "INR"}\n` +
          `- Industry: ${(org as any).industry || "Not specified"}\n` +
          `- Country: ${(org as any).country || "India"}\n` +
          `- Fiscal Year Starts: Month ${(org as any).fiscalYearStart || 4}`
        );
      }
    }

    // ── Contacts Summary ──
    if (categories.has("contacts") || categories.has("summary")) {
      const [customerCount, vendorCount] = await Promise.all([
        Contact.countDocuments({ organizationId, contactType: { $in: ["Customer", "Both"] }, isDeleted: false }),
        Contact.countDocuments({ organizationId, contactType: { $in: ["Vendor", "Both"] }, isDeleted: false }),
      ]);

      const topCustomers = await Contact.find({
        organizationId,
        contactType: { $in: ["Customer", "Both"] },
        isDeleted: false,
        outstandingReceivable: { $gt: 0 },
      })
        .sort({ outstandingReceivable: -1 })
        .limit(10)
        .select("displayName outstandingReceivable")
        .lean();

      const topVendors = await Contact.find({
        organizationId,
        contactType: { $in: ["Vendor", "Both"] },
        isDeleted: false,
        outstandingPayable: { $gt: 0 },
      })
        .sort({ outstandingPayable: -1 })
        .limit(10)
        .select("displayName outstandingPayable")
        .lean();

      // Query names of all active customers and vendors to assist the LLM when outstanding balance is zero
      const allCustomers = await Contact.find({
        organizationId,
        contactType: { $in: ["Customer", "Both"] },
        isDeleted: false,
      })
        .sort({ displayName: 1 })
        .limit(30)
        .select("displayName")
        .lean();

      const allVendors = await Contact.find({
        organizationId,
        contactType: { $in: ["Vendor", "Both"] },
        isDeleted: false,
      })
        .sort({ displayName: 1 })
        .limit(30)
        .select("displayName")
        .lean();

      let contactSection = `CONTACTS SUMMARY:\n` +
        `- Total Customers: ${customerCount}\n` +
        `- Total Vendors: ${vendorCount}`;

      if (topCustomers.length > 0) {
        contactSection += `\n\nTop Customers by Outstanding Receivable:`;
        for (const c of topCustomers) {
          contactSection += `\n  - ${c.displayName}: ₹${(c.outstandingReceivable || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
      }

      if (allCustomers.length > 0) {
        contactSection += `\n\nActive Customer Names: ` + allCustomers.map((c) => c.displayName).join(", ");
        if (customerCount > 30) {
          contactSection += ` (and ${customerCount - 30} more...)`;
        }
      }

      if (topVendors.length > 0) {
        contactSection += `\n\nTop Vendors by Outstanding Payable:`;
        for (const v of topVendors) {
          contactSection += `\n  - ${v.displayName}: ₹${(v.outstandingPayable || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
      }

      const topCustomersBySales = await Invoice.aggregate([
        { $match: { organizationId: new Types.ObjectId(organizationId.toString()), isDeleted: { $ne: true } } },
        {
          $group: {
            _id: "$customerId",
            totalSales: { $sum: "$total" },
          },
        },
        { $sort: { totalSales: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "contacts",
            localField: "_id",
            foreignField: "_id",
            as: "customer",
          },
        },
        { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            displayName: "$customer.displayName",
            totalSales: 1,
          },
        },
      ]);

      if (topCustomersBySales.length > 0) {
        contactSection += `\n\nTop Customers by Total Sales Volume:`;
        for (const c of topCustomersBySales) {
          const name = c.displayName || "Unknown";
          contactSection += `\n  - ${name}: ₹${(c.totalSales || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
      }

      if (allVendors.length > 0) {
        contactSection += `\n\nActive Vendor Names: ` + allVendors.map((v) => v.displayName).join(", ");
        if (vendorCount > 30) {
          contactSection += ` (and ${vendorCount - 30} more...)`;
        }
      }

      sections.push(contactSection);
    }

    // ── Invoice Summary ──
    if (categories.has("invoices") || categories.has("summary")) {
      const invoiceAgg = await Invoice.aggregate([
        { $match: { organizationId: new Types.ObjectId(organizationId), isDeleted: { $ne: true } } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$total" },
            totalBalance: { $sum: "$balanceDue" },
          },
        },
      ]);

      let totalReceivable = 0;
      let invoiceSection = `INVOICES SUMMARY:`;
      for (const row of invoiceAgg) {
        invoiceSection += `\n  - ${row._id}: ${row.count} invoices, Total: ₹${row.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Balance Due: ₹${row.totalBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        if (["Sent", "Overdue", "Partially Paid", "Viewed"].includes(row._id)) {
          totalReceivable += row.totalBalance;
        }
      }
      invoiceSection += `\n- Total Outstanding Receivable: ₹${totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

      // Overdue invoices detail
      const overdueInvoices = await Invoice.find({
        organizationId,
        status: "Overdue",
        isDeleted: { $ne: true },
      })
        .sort({ balanceDue: -1 })
        .limit(10)
        .select("invoiceNumber total balanceDue dueDate customerId")
        .populate("customerId", "displayName")
        .lean();

      if (overdueInvoices.length > 0) {
        invoiceSection += `\n\nOverdue Invoices (top 10):`;
        for (const inv of overdueInvoices) {
          const customerName = (inv.customerId as any)?.displayName || "Unknown";
          invoiceSection += `\n  - ${inv.invoiceNumber} | ${customerName} | Due: ₹${(inv.balanceDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} | Due Date: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "N/A"}`;
        }
      }

      sections.push(invoiceSection);
    }

    // ── Bill Summary ──
    if (categories.has("bills") || categories.has("summary")) {
      const billAgg = await Bill.aggregate([
        { $match: { organizationId: new Types.ObjectId(organizationId), isDeleted: { $ne: true } } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$total" },
            totalBalance: { $sum: "$balanceDue" },
          },
        },
      ]);

      let totalPayable = 0;
      let billSection = `BILLS SUMMARY:`;
      for (const row of billAgg) {
        billSection += `\n  - ${row._id}: ${row.count} bills, Total: ₹${row.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Balance Due: ₹${row.totalBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        if (["Open", "Overdue", "Partially Paid"].includes(row._id)) {
          totalPayable += row.totalBalance;
        }
      }
      billSection += `\n- Total Outstanding Payable: ₹${totalPayable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

      // Overdue bills detail
      const overdueBills = await Bill.find({
        organizationId,
        status: "Overdue",
        isDeleted: { $ne: true },
      })
        .sort({ balanceDue: -1 })
        .limit(10)
        .select("billNumber total balanceDue dueDate vendorId")
        .populate("vendorId", "displayName")
        .lean();

      if (overdueBills.length > 0) {
        billSection += `\n\nOverdue Bills (top 10):`;
        for (const bill of overdueBills) {
          const vendorName = (bill.vendorId as any)?.displayName || "Unknown";
          billSection += `\n  - ${bill.billNumber} | ${vendorName} | Due: ₹${(bill.balanceDue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} | Due Date: ${bill.dueDate ? new Date(bill.dueDate).toLocaleDateString("en-IN") : "N/A"}`;
        }
      }

      sections.push(billSection);
    }

    // ── Items / Inventory Summary ──
    if (categories.has("items") || categories.has("summary")) {
      const [totalItems, totalGoods, totalServices] = await Promise.all([
        Item.countDocuments({ organizationId, isDeleted: false }),
        Item.countDocuments({ organizationId, isDeleted: false, itemType: "Goods" }),
        Item.countDocuments({ organizationId, isDeleted: false, itemType: "Service" }),
      ]);

      // Low stock items (stock on hand <= reorder point, only for tracked goods)
      const lowStockItems = await Item.find({
        organizationId,
        isDeleted: false,
        inventoryTracked: true,
        $expr: { $lte: ["$stockOnHand", "$reorderPoint"] },
      })
        .sort({ stockOnHand: 1 })
        .limit(15)
        .select("name sku stockOnHand reorderPoint")
        .lean();

      let itemSection = `ITEMS / INVENTORY SUMMARY:\n` +
        `- Total Items: ${totalItems} (${totalGoods} Goods, ${totalServices} Services)`;

      if (lowStockItems.length > 0) {
        itemSection += `\n- Low Stock Alerts (${lowStockItems.length} items):`;
        for (const item of lowStockItems) {
          itemSection += `\n  - ${item.name}${item.sku ? ` (SKU: ${item.sku})` : ""}: Stock: ${item.stockOnHand}, Reorder Point: ${item.reorderPoint || 0}`;
        }
      } else {
        itemSection += `\n- No low stock alerts`;
      }

      sections.push(itemSection);
    }

    // ── Account Balances ──
    if (categories.has("accounts") || categories.has("summary")) {
      const bankCashAccounts = await Account.find({
        organizationId,
        accountType: { $in: ["Bank", "Cash"] },
        isDeleted: false,
        isGroup: false,
      })
        .sort({ balance: -1 })
        .limit(15)
        .select("name accountType balance currency")
        .lean();

      if (bankCashAccounts.length > 0) {
        let accountSection = `BANK & CASH ACCOUNT BALANCES:`;
        let totalBalance = 0;
        for (const acc of bankCashAccounts) {
          totalBalance += acc.balance || 0;
          accountSection += `\n  - ${acc.name} (${acc.accountType}): ₹${(acc.balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        accountSection += `\n- Total Cash & Bank Balance: ₹${totalBalance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        sections.push(accountSection);
      }
    }

    // ── Expenses Summary (current month) ──
    if (categories.has("expenses") || categories.has("summary")) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const Expense = (await import("../models/expense.model")).default;

      const expenseAgg = await Expense.aggregate([
        {
          $match: {
            organizationId: new Types.ObjectId(organizationId),
            isDeleted: { $ne: true },
            date: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]);

      const expData = expenseAgg[0] || { totalAmount: 0, count: 0 };
      sections.push(
        `EXPENSES SUMMARY (${now.toLocaleString("en-IN", { month: "long", year: "numeric" })}):\n` +
        `- Total Expenses This Month: ₹${expData.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n` +
        `- Number of Expense Entries: ${expData.count}`
      );
    }

    // ── Trial Balance Summary ──
    if (categories.has("trialbalance") || categories.has("summary")) {
      const GlEntry = (await import("../models/gl-entry.model")).default;

      const [accounts, movements] = await Promise.all([
        Account.find({ organizationId, isDeleted: false, isGroup: false })
          .select("name code rootType accountType openingBalance")
          .lean(),
        GlEntry.aggregate([
          { $match: { organizationId: new Types.ObjectId(organizationId) } },
          {
            $group: {
              _id: "$accountId",
              debit: { $sum: { $ifNull: ["$debit", 0] } },
              credit: { $sum: { $ifNull: ["$credit", 0] } },
            },
          },
        ]),
      ]);

      const movementMap = new Map(movements.map((m) => [String(m._id), m]));
      const tbRows = [];
      let totalDebit = 0;
      let totalCredit = 0;

      for (const account of accounts) {
        const accId = String(account._id);
        const m = movementMap.get(accId) || { debit: 0, credit: 0 };
        const opening = Number(account.openingBalance || 0);

        const openingDebit = opening > 0 ? opening : 0;
        const openingCredit = opening < 0 ? Math.abs(opening) : 0;

        const totalDebitAcc = openingDebit + m.debit;
        const totalCreditAcc = openingCredit + m.credit;

        const closing = totalDebitAcc - totalCreditAcc;
        if (Math.abs(closing) < 0.009) continue;

        const closingDebit = closing > 0 ? closing : 0;
        const closingCredit = closing < 0 ? Math.abs(closing) : 0;

        totalDebit += closingDebit;
        totalCredit += closingCredit;

        tbRows.push({
          name: account.name,
          code: account.code || "",
          rootType: account.rootType,
          closingDebit,
          closingCredit,
        });
      }

      if (tbRows.length > 0) {
        let tbSection = `TRIAL BALANCE SNAPSHOT:\n`;
        tbRows.sort((a, b) =>
          a.rootType === b.rootType
            ? a.name.localeCompare(b.name)
            : a.rootType.localeCompare(b.rootType)
        );
        for (const row of tbRows) {
          const balanceStr = row.closingDebit > 0
            ? `Debit: ₹${row.closingDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
            : `Credit: ₹${row.closingCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          tbSection += `- ${row.name} (${row.code || "no code"}) | Type: ${row.rootType} | ${balanceStr}\n`;
        }
        tbSection += `\n- Total Debits: ₹${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}\n`;
        tbSection += `- Total Credits: ₹${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        sections.push(tbSection);
      } else {
        sections.push("TRIAL BALANCE SNAPSHOT:\n- No active balances found in Trial Balance.");
      }
    }

    // ── Sales Orders ──
    if (categories.has("sales_orders") || categories.has("summary")) {
      const SalesOrder = (await import("../models/sales-order.model")).default;
      const sos = await SalesOrder.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("customerId", "displayName")
        .select("salesOrderNumber status total customerId")
        .lean();
      
      if (sos.length > 0) {
        let section = `RECENT SALES ORDERS (top 10):`;
        for (const so of sos) {
          const customerName = (so.customerId as any)?.displayName || "Unknown";
          section += `\n  - ${so.salesOrderNumber} | ${customerName} | Status: ${so.status} | Total: ₹${((so as any).total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Purchase Orders ──
    if (categories.has("purchase_orders") || categories.has("summary")) {
      const PurchaseOrder = (await import("../models/purchase-order.model")).default;
      const pos = await PurchaseOrder.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("vendorId", "displayName")
        .select("purchaseOrderNumber status total vendorId")
        .lean();
      
      if (pos.length > 0) {
        let section = `RECENT PURCHASE ORDERS (top 10):`;
        for (const po of pos) {
          const vendorName = (po.vendorId as any)?.displayName || "Unknown";
          section += `\n  - ${po.purchaseOrderNumber} | ${vendorName} | Status: ${po.status} | Total: ₹${((po as any).total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Quotes ──
    if (categories.has("quotes") || categories.has("summary")) {
      const Quote = (await import("../models/quote.model")).default;
      const quotes = await Quote.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("customerId", "displayName")
        .select("quoteNumber status total customerId")
        .lean();
      
      if (quotes.length > 0) {
        let section = `RECENT QUOTES (top 10):`;
        for (const q of quotes) {
          const customerName = (q.customerId as any)?.displayName || "Unknown";
          section += `\n  - ${q.quoteNumber} | ${customerName} | Status: ${q.status} | Total: ₹${((q as any).total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Payments Received ──
    if (categories.has("payments_received") || categories.has("summary")) {
      const PaymentReceived = (await import("../models/payment-received.model")).default;
      const prs = await PaymentReceived.find({ organization_id: organizationId, is_deleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("customer_id", "displayName")
        .select("payment_number total_amount_received payment_date customer_id payment_mode")
        .lean();
      
      if (prs.length > 0) {
        let section = `RECENT PAYMENTS RECEIVED (top 10):`;
        for (const pr of prs) {
          const customerName = (pr.customer_id as any)?.displayName || "Unknown";
          const date = pr.payment_date ? new Date(pr.payment_date).toLocaleDateString("en-IN") : "N/A";
          section += `\n  - ${pr.payment_number} | ${customerName} | Date: ${date} | Mode: ${pr.payment_mode || 'N/A'} | Amount: ₹${((pr as any).total_amount_received || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Payments Made ──
    if (categories.has("payments_made") || categories.has("summary")) {
      const PaymentMade = (await import("../models/payment-made.model")).default;
      const pms = await PaymentMade.find({ organization_id: organizationId, is_deleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("vendor_id", "displayName")
        .select("payment_number total_amount_paid payment_date vendor_id payment_mode")
        .lean();
      
      if (pms.length > 0) {
        let section = `RECENT PAYMENTS MADE (top 10):`;
        for (const pm of pms) {
          const vendorName = (pm.vendor_id as any)?.displayName || "Unknown";
          const date = pm.payment_date ? new Date(pm.payment_date).toLocaleDateString("en-IN") : "N/A";
          section += `\n  - ${pm.payment_number} | ${vendorName} | Date: ${date} | Mode: ${pm.payment_mode || 'N/A'} | Amount: ₹${((pm as any).total_amount_paid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Credit Notes ──
    if (categories.has("credit_notes") || categories.has("summary")) {
      const CreditNote = (await import("../models/credit-note.model")).default;
      const cns = await CreditNote.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("customerId", "displayName")
        .select("creditNoteNumber status total customerId")
        .lean();
      
      if (cns.length > 0) {
        let section = `RECENT CREDIT NOTES (top 10):`;
        for (const cn of cns) {
          const customerName = (cn.customerId as any)?.displayName || "Unknown";
          section += `\n  - ${cn.creditNoteNumber} | ${customerName} | Status: ${cn.status} | Total: ₹${((cn as any).total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Vendor Credits ──
    if (categories.has("vendor_credits") || categories.has("summary")) {
      const VendorCredit = (await import("../models/vendor-credit.model")).default;
      const vcs = await VendorCredit.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("vendorId", "displayName")
        .select("vendorCreditNumber status total vendorId")
        .lean();
      
      if (vcs.length > 0) {
        let section = `RECENT VENDOR CREDITS (top 10):`;
        for (const vc of vcs) {
          const vendorName = (vc.vendorId as any)?.displayName || "Unknown";
          section += `\n  - ${vc.vendorCreditNumber} | ${vendorName} | Status: ${vc.status} | Total: ₹${((vc as any).total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }

    // ── Journals ──
    if (categories.has("journals") || categories.has("summary")) {
      const Journal = (await import("../models/journal.model")).default;
      const journals = await Journal.find({ organizationId, isDeleted: { $ne: true } } as any)
        .sort({ createdAt: -1 })
        .limit(10)
        .select("journalNumber status totalDebit date")
        .lean();
      
      if (journals.length > 0) {
        let section = `RECENT MANUAL JOURNALS (top 10):`;
        for (const j of journals) {
          const date = j.date ? new Date(j.date).toLocaleDateString("en-IN") : "N/A";
          section += `\n  - ${j.journalNumber} | Date: ${date} | Status: ${j.status} | Total Debit: ₹${((j as any).totalDebit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
        }
        sections.push(section);
      }
    }
  } catch (error: any) {
    console.error("Error fetching org business context:", error.message);
    sections.push("(Some business data could not be retrieved at this time.)");
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\n═══ LIVE BUSINESS DATA (Organization-Scoped) ═══\n\n${sections.join("\n\n---\n\n")}\n\n═══ END LIVE BUSINESS DATA ═══`;
}

// ─── App Routing Map (injected into Nemo's system prompt) ──────────────

const APP_ROUTING_MAP = `
APP NAVIGATION MAP — Use these exact URLs when suggesting page navigation:

== HOME ==
- Dashboard: /dashboard

== ITEMS ==
- All Items: /items
- Create New Item: /items/new

== INVENTORY ==
- Inventory Overview: /inventory
- Inventory Adjustments: /inventory/adjustments
- Packages: /inventory/packages
- Shipments: /inventory/shipments
- Move Orders: /inventory/move-orders
- Putaways: /inventory/putaways

== SALES ==
- All Customers: /sales/customers
- Create New Customer: /sales/customers/new
- All Quotes / Estimates: /sales/quotes
- Create New Quote: /sales/quotes/new
- All Sales Orders: /sales/orders
- Create New Sales Order: /sales/orders/new
- All Invoices: /sales/invoices
- Create New Invoice: /sales/invoices/new
- Retainer Invoices: /sales/retainer-invoices
- Create New Retainer Invoice: /sales/retainer-invoices/new
- Recurring Invoices: /sales/recurring-invoices
- Delivery Challans: /sales/delivery-challans
- Create New Delivery Challan: /sales/delivery-challans/new
- Payments Received: /sales/payments-received
- Record New Payment Received: /sales/payments-received/new
- Credit Notes: /sales/credit-notes
- Create New Credit Note: /sales/credit-notes/new

== PURCHASES ==
- All Vendors: /purchases/vendors
- Create New Vendor: /purchases/vendors/new
- All Expenses: /purchases/expenses
- Record New Expense: /purchases/expenses/new
- Recurring Expenses: /purchases/recurring-expenses
- All Purchase Orders: /purchases/orders
- Create New Purchase Order: /purchases/orders/new
- Purchase Receives: /purchases/receives
- All Bills: /purchases/bills
- Create New Bill: /purchases/bills/new
- Recurring Bills: /purchases/recurring-bills
- Payments Made: /purchases/payments-made
- Record New Payment Made: /purchases/payments-made/new
- Vendor Credits: /purchases/vendor-credits
- Create New Vendor Credit: /purchases/vendor-credits/new

== TIME TRACKING ==
- Projects: /time-tracking/projects
- Timesheet: /time-tracking/timesheet

== BANKING ==
- Banking Overview: /banking

== ACCOUNTANT ==
- Manual Journals: /accountant/journal-entries
- Create New Journal Entry: /accountant/journal-entries/new
- Bulk Update: /accountant/bulk-update
- Currency Adjustments: /accountant/currency-adjustments
- Chart of Accounts: /accountant/chart-of-accounts
- Fixed Assets: /accountant/fixed-assets
- Transaction Locking: /accountant/transaction-locking

== REPORTS ==
- All Reports: /reports

== DOCUMENTS ==
- Documents Hub: /documents

== SETTINGS ==
- General Settings: /settings/general
`;

// ─── Parse [ACTION:url|label] markers from LLM response ────────────────

interface NavigationAction {
  label: string;
  url: string;
}

function parseNavigationActions(text: string): { cleanedText: string; actions: NavigationAction[] } {
  const actions: NavigationAction[] = [];
  const actionRegex = /\[ACTION:([^|\]]+)\|([^\]]+)\]/g;
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    const url = match[1].trim();
    const label = match[2].trim();
    // Deduplicate by url
    if (!actions.some((a) => a.url === url)) {
      actions.push({ label, url });
    }
  }

  // Remove the [ACTION:...] markers from the visible text
  const cleanedText = text.replace(actionRegex, "").replace(/\n{3,}/g, "\n\n").trim();

  return { cleanedText, actions };
}

// ─── System Prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(orgName?: string): string {
  return `You are Nemo, a powerful and intelligent AI assistant for HAI Accounting — a professional accounting and business management software for Indian businesses.${orgName ? `\n\nYou are currently assisting the user with their organization: "${orgName}".` : ""}

CRITICAL RULES:
- You have FULL ACCESS to the user's live business data. It is provided to you below under "LIVE BUSINESS DATA".
- ALWAYS use this data to answer questions. NEVER say "I don't have access to your data" or "I don't have specific sales data" — you DO have it, it is right in your context.
- When asked about customers, vendors, invoices, payments, balances, sales, purchases, or ANY business data — look at the LIVE BUSINESS DATA section and answer directly with real numbers and names.
- For "greatest/best/top customer" questions, analyze the "Top Customers by Total Sales Volume" section and also cross-reference with outstanding receivables and recent invoices to give a comprehensive answer.
- For any question about the user's business, always provide specific data points (amounts, counts, names) from the LIVE BUSINESS DATA.
- When answering questions about how features work or how to do something, use the KNOWLEDGE BASE CONTEXT section and explain the steps instead of performing the action yourself.
- Keep answers concise, accurate, and professional.
- Use markdown formatting: **bold** for emphasis, bullet lists for data, and clean structure. Do NOT use raw markdown symbols like #, *, or ** in visible text — they should render as formatting.
- When presenting monetary amounts, always use the ₹ symbol and Indian number format (e.g., ₹1,23,456.00).
- When referencing features, be specific about navigation paths (e.g., "Go to Sales → Invoices → New Invoice").
- If a relevant page exists for the user's question, include a navigation action so they can jump directly to that page.
- Do not make up data. Only present numbers and names that appear in the context.
- Never expose raw database IDs — use human-readable names and numbers instead.
- Do not reveal information about other organizations or other users' data.
- If the user greets you, respond warmly and mention you can help with both feature questions and their business data.
- If asked about data that is not present in the LIVE BUSINESS DATA section, tell the user what data you CAN see and offer to help with that instead.

NAVIGATION ACTIONS:
- You can help users navigate to any page in the application.
- When the user asks HOW to do something (e.g., "how do I create an invoice?"), explain the process briefly AND include one or more navigation action markers so the user can jump directly to the relevant page.
- When the user asks to GO somewhere or TAKE them to a page (e.g., "take me to expenses", "go to invoices"), provide a short acknowledgment AND include the navigation action marker.
- For create, add, update, record, or similar requests, never claim you completed the operation; instead explain the steps and add the best matching navigation action(s).
- When explaining a workflow that involves multiple pages, include action markers for each relevant page.
- To include a navigation action, use this EXACT format at the END of your response (after all text): [ACTION:url|label]
- You may include MULTIPLE action markers, one per line.
- ONLY use URLs from the APP NAVIGATION MAP below. NEVER invent URLs.
- The label should be a short, friendly call-to-action (e.g., "Create New Invoice", "View All Customers", "Go to Reports").
- For general informational questions that don't involve an action (e.g., "what is my bank balance?"), do NOT include action markers unless the user would benefit from visiting a related page.

Example:
User: "How do I create an invoice?"
Assistant: "To create a new invoice, go to **Sales → Invoices** and click the **+ New Invoice** button. You'll need to select a customer, add line items, and set the due date. Here's a quick link to get started:

[ACTION:/sales/invoices/new|Create New Invoice]
[ACTION:/sales/invoices|View All Invoices]"

${APP_ROUTING_MAP}`;
}

// ─── Helper: Build Context from Chunks ─────────────────────────────────

function buildKBContext(chunks: any[]): { context: string; sources: Array<{ title: string; url: string; score: number }> } {
  const sources: Array<{ title: string; url: string; score: number }> = [];
  const contextParts: string[] = [];
  let totalTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = chunk.tokenEstimate || Math.ceil((chunk.rawText || chunk.text || "").length / 4);

    if (totalTokens + chunkTokens > MAX_CONTEXT_TOKENS) {
      break;
    }

    totalTokens += chunkTokens;
    contextParts.push(chunk.rawText || chunk.text);

    const sourceUrl = chunk.sourceUrl || "";
    if (!sources.some((s) => s.url === sourceUrl)) {
      sources.push({
        title: chunk.title || "Unknown",
        url: sourceUrl,
        score: chunk.score || 0,
      });
    }
  }

  return {
    context: contextParts.join("\n---\n"),
    sources,
  };
}

// ─── Main Chat Handler ────────────────────────────────────────────────

export const handleChat = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const startTime = Date.now();
    const { question, sessionId: clientSessionId } = req.body;

    // ── Input Validation ──
    if (!question || typeof question !== "string") {
      res.status(400).json({ success: false, message: "A question is required." });
      return;
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      res.status(400).json({ success: false, message: "Question cannot be empty." });
      return;
    }

    if (trimmedQuestion.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        success: false,
        message: `Question is too long. Maximum ${MAX_QUESTION_LENGTH} characters allowed.`,
      });
      return;
    }

    const sessionId = clientSessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const userId = req.user?._id?.toString() || req.firebaseUser?.uid || "anonymous";
    const organizationId = req.user?.activeOrganization;

    try {
      // ── Step 1: Always fetch ALL live business data ──
      // We always fetch everything so the LLM has full context for any question.
      // The keyword-based intent detection was too narrow and missed valid questions.
      let businessDataContext = "";
      let orgName: string | undefined;

      if (organizationId) {
        // Get org name for the system prompt
        const org = await Organization.findById(organizationId).select("name").lean();
        orgName = org?.name;

        // Build a full set of all categories
        const allCategories = new Set<string>([
          "contacts", "invoices", "bills", "items", "accounts", "expenses",
          "organization", "trialbalance", "sales_orders", "purchase_orders",
          "quotes", "payments_received", "payments_made", "credit_notes",
          "vendor_credits", "journals", "summary",
        ]);

        businessDataContext = await fetchOrgBusinessContext(
          organizationId as Types.ObjectId,
          allCategories
        );
      }

      // ── Step 3: Ensure chatbot DB connection ──
      const conn = getChatbotConnection();
      if (conn.readyState !== 1) {
        await new Promise<void>((resolve, reject) => {
          if (conn.readyState === 1) { resolve(); return; }
          conn.once("connected", resolve);
          conn.once("error", reject);
          setTimeout(() => reject(new Error("Chatbot DB connection timeout")), 10000);
        });
      }

      const KBChunk = getKBChunkModel();

      // ── Step 4: Embed the question ──
      const queryVector = await getEmbedding(trimmedQuestion, "RETRIEVAL_QUERY");

      // ── Step 5: Vector Search ──
      const searchResults = await KBChunk.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector,
            numCandidates: NUM_CANDIDATES,
            limit: TOP_K,
          },
        },
        {
          $project: {
            text: 1,
            rawText: 1,
            sourceFile: 1,
            sourceUrl: 1,
            title: 1,
            headings: 1,
            chunkIndex: 1,
            totalChunks: 1,
            tokenEstimate: 1,
            keywords: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ]);

      // ── Step 6: Relevance Filtering ──
      const relevantChunks = searchResults.filter(
        (chunk: any) => chunk.score >= RELEVANCE_THRESHOLD
      );

      let answer: string;
      let sources: Array<{ title: string; url: string; score: number }> = [];
      let isFallback = false;

      // If we have neither KB chunks nor live data, return fallback
      if (relevantChunks.length === 0 && !businessDataContext) {
        isFallback = true;
        answer =
          "I couldn't find specific information for that question right now. You can try asking me things like:\n\n" +
          "- Who is my top customer?\n" +
          "- What are my overdue invoices?\n" +
          "- Show me my bank balance\n" +
          "- Give me a business summary";
      } else {
        // ── Step 7: Build combined context ──
        let kbContext = "";
        if (relevantChunks.length > 0) {
          const { context, sources: extractedSources } = buildKBContext(relevantChunks);
          kbContext = context;
          sources = extractedSources;
        }

        // Combine KB context + live business data
        let fullContext = "";
        if (kbContext) {
          fullContext += `KNOWLEDGE BASE CONTEXT:\n---\n${kbContext}\n---`;
        }
        if (businessDataContext) {
          fullContext += businessDataContext;
        }

        // ── Step 8: Call Gemini LLM ──
        const client = getGenAIClient();
        const llmModel = process.env.CHATBOT_LLM_MODEL || "gemini-3.5-flash";

        const userPrompt = `${fullContext}\n\nUSER QUESTION: ${trimmedQuestion}`;

        const response = await client.models.generateContent({
          model: llmModel,
          contents: userPrompt,
          config: {
            systemInstruction: buildSystemPrompt(orgName),
            temperature: 0.3,
            maxOutputTokens: 1500,
            topP: 0.8,
          },
        });

        answer = response.text || "I'm sorry, I couldn't generate a response. Please try again.";

        // Also check for navigation actions in fallback text
        // (actions will be parsed below after the if-else block)
      }

      // ── Parse navigation actions from the LLM response ──
      const { cleanedText: cleanAnswer, actions } = parseNavigationActions(answer);
      answer = cleanAnswer;

      const responseTimeMs = Date.now() - startTime;

      // ── Step 9: Log the interaction ──
      try {
        await ChatLog.create({
          userId,
          sessionId,
          question: trimmedQuestion,
          answer,
          sources,
          chunksRetrieved: relevantChunks.length,
          topScore: relevantChunks[0]?.score || 0,
          responseTimeMs,
          fallback: isFallback,
        });
      } catch (logError) {
        console.error("Failed to log chat interaction:", logError);
      }

      // ── Step 10: Return response ──
      res.json({
        success: true,
        data: {
          answer,
          sources: sources.map((s) => ({ title: s.title, url: s.url })),
          actions: actions.length > 0 ? actions : undefined,
          sessionId,
          responseTimeMs,
        },
      });
    } catch (error: any) {
      console.error("Chat pipeline error:", error);

      if (error.message?.includes("vector_index") || error.codeName === "InvalidPipelineOperator") {
        res.status(503).json({
          success: false,
          message: "The knowledge base search index is not ready. Please try again later.",
        });
        return;
      }

      if (error.message?.includes("GEMINI_API_KEY") || error.message?.includes("API key")) {
        res.status(503).json({
          success: false,
          message: "AI service is temporarily unavailable. Please try again later.",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "An error occurred while processing your question. Please try again.",
      });
    }
  }
);
