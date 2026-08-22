import { ClientSession, Types } from "mongoose";
import Invoice from "../models/invoice.model";
import SalesOrder from "../models/sales-order.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import {
  applyStockDeltas,
  applyStockAndCommitmentDeltas,
  collectInvoiceStockDeltas,
  computeInvoiceCostLines,
  invertStockDeltas,
} from "./accounting-sync.service";
import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "./gl-posting.service";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function invoiceVoucherId(invoice: any): string {
  return `invoice:${String(invoice._id)}`;
}

export function isPostedInvoiceStatus(status: string): boolean {
  return status !== "Draft" && status !== "Void";
}

export async function shouldApplyInvoiceStockMovement(params: {
  organizationId: any;
  orderNumber: string;
}): Promise<boolean> {
  const orderNumber = String(params.orderNumber || "").trim();
  if (!orderNumber) return true;

  const linkedOrder = await SalesOrder.findOne({
    organizationId: params.organizationId,
    salesOrderNumber: orderNumber,
    isDeleted: false,
  })
    .select("shipmentStatus stockDeducted")
    .lean();

  if (!linkedOrder) return true;
  if (linkedOrder.stockDeducted) return false;
  return String((linkedOrder as any)?.shipmentStatus || "") !== "Delivered";
}

/**
 * Handles the accounting and inventory commitment for an invoice.
 * This should be called when an invoice transitions from Draft to a Posted status.
 */
export async function commitInvoiceAccounting(params: {
  invoice: any;
  req: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { invoice, req, session } = params;
  const organizationId = invoice.organizationId;

  // 1. Stock Movement
  const shouldApplyStock = await shouldApplyInvoiceStockMovement({
    organizationId,
    orderNumber: invoice.orderNumber,
  });

  if (shouldApplyStock) {
    const stockDeltas = collectInvoiceStockDeltas(invoice.items as any[]);
    const orderNumber = String(invoice.orderNumber || "").trim();

    if (orderNumber) {
      // If linked to a Sales Order, we also release the commitment
      await applyStockAndCommitmentDeltas({
        organizationId,
        deltas: stockDeltas,
        req,
        session,
      });

      // Mark the SO as stockDeducted to prevent double deduction by shipment
      await SalesOrder.updateOne(
        { organizationId, salesOrderNumber: orderNumber, isDeleted: false },
        { $set: { stockDeducted: true } },
        { session },
      );
    } else {
      await applyStockDeltas({
        organizationId,
        deltas: stockDeltas,
        req,
        session,
      });
    }
  }

  // 2. Ledger Posting
  const receivableAmount = round2(toNum(invoice.total));
  const recognizedRevenue = round2(toNum(invoice.subTotal) - toNum(invoice.discountAmount));
  
  const lines: any[] = [];

  // Accounts Receivable (Debit)
  const arAccountId = await findAccountIdByName({
    organizationId,
    names: ["Accounts Receivable", "Sundry Debtors", "Customer Receivable"],
    rootType: "Asset",
    accountType: "Accounts Receivable",
    session,
  });
  lines.push({
    accountId: arAccountId,
    debit: receivableAmount,
    description: `Invoice ${invoice.invoiceNumber}`,
    contactType: "Customer",
    contactId: invoice.customerId?._id || invoice.customerId,
  });

  // Sales Revenue (Credit)
  const salesAccountId = await findAccountIdByName({
    organizationId,
    names: ["Sales", "Sales Revenue", "Revenue"],
    rootType: "Revenue",
    accountType: "Income",
    session,
  });
  lines.push({
    accountId: salesAccountId,
    credit: recognizedRevenue,
    description: `Sales Revenue - ${invoice.invoiceNumber}`,
  });

  // Tax (Credit if any)
  const taxDelta = round2(receivableAmount - recognizedRevenue);
  if (Math.abs(taxDelta) > 0.009) {
    // Basic heuristic: if receivable > revenue, it's usually tax payable
    const taxPayableAccountId = await findAccountIdByName({
      organizationId,
      names: ["Output Tax Payable", "GST Payable", "Tax Payable", "Duties & Taxes"],
      rootType: "Liability",
      accountType: "Other Current Liability",
      session,
    });
    lines.push({
      accountId: taxPayableAccountId,
      credit: Math.abs(taxDelta),
      description: `Tax on Invoice ${invoice.invoiceNumber}`,
    });
  }

  // COGS & Inventory Asset
  const costLines = await computeInvoiceCostLines({
    organizationId,
    items: invoice.items || [],
    session,
  });
  const cogsTotal = round2(costLines.reduce((sum, line) => sum + toNum(line.costAmount), 0));

  if (cogsTotal > 0) {
    const cogsAccountId = await findAccountIdByName({
      organizationId,
      names: ["Cost of Goods Sold", "COGS", "Direct Expenses"],
      rootType: "Expense",
      accountType: "Cost of Goods Sold",
      session,
    });
    const stockAccountId = await findAccountIdByName({
      organizationId,
      names: ["Inventory Asset", "Inventory", "Stock", "Stock-in-Hand"],
      rootType: "Asset",
      accountType: "Stock",
      session,
    });

    lines.push({
      accountId: cogsAccountId,
      debit: cogsTotal,
      description: `COGS - ${invoice.invoiceNumber}`,
    });
    lines.push({
      accountId: stockAccountId,
      credit: cogsTotal,
      description: `Inventory issue - ${invoice.invoiceNumber}`,
    });

    // Item.inventoryValue/averageCost are NOT updated here — step 1's stock
    // movement (applyStockDeltas/applyStockAndCommitmentDeltas, via the stock
    // ledger) already recomputed them for this same issue. costLines above is
    // only used to size the GL COGS/Inventory Asset amounts.
  }

  await postVoucher({
    organizationId,
    voucherType: "Invoice",
    voucherId: invoiceVoucherId(invoice),
    voucherNo: invoice.invoiceNumber,
    postingDate: invoice.invoiceDate || new Date(),
    lines,
    description: `Invoice ${invoice.invoiceNumber}`,
    req,
    session,
  });

  // Mark invoice as having journal entries if your model tracks it
  if ((invoice as any).journalEntries) {
    (invoice as any).journalEntries.push(invoiceVoucherId(invoice));
  }
}

/**
 * Reverses the accounting and inventory commitment for an invoice.
 */
export async function reverseInvoiceAccounting(params: {
  invoice: any;
  req: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { invoice, req, session } = params;
  const organizationId = invoice.organizationId;

  // 1. Reverse Stock Movement
  const wasApplied = await shouldApplyInvoiceStockMovement({
    organizationId,
    orderNumber: invoice.orderNumber,
  });

  if (wasApplied) {
    const stockDeltas = collectInvoiceStockDeltas(invoice.items as any[]);
    const inverted = invertStockDeltas(stockDeltas);

    // Note: When reversing, we should probably NOT re-commit to Sales Order automatically 
    // unless the SO is also being re-opened. But for simplicity, we just add back to stockOnHand.
    await applyStockDeltas({
      organizationId,
      deltas: inverted,
      req,
      session,
    });
  }

  // 2. Reverse Ledger
  await reverseVoucher({
    organizationId,
    voucherType: "Invoice",
    voucherId: invoiceVoucherId(invoice),
    reversalVoucherNo: `REV-${invoice.invoiceNumber}`,
    postingDate: new Date(),
    req,
    session,
  });

  // Item.inventoryValue/averageCost are NOT reversed here — step 1's reversed
  // stock movement already recomputed them for this same reversal.
}
