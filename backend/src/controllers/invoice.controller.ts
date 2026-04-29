import { Response } from "express";
import Invoice from "../models/invoice.model";
import Contact from "../models/contact.model";
import SalesOrder from "../models/sales-order.model";
import DeliveryChallan from "../models/delivery-challan.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { sendInvoiceEmail as sendInvoiceEmailService } from "../services/email.service";
import { generateInvoicePdf } from "../services/pdf.service";
import Organization from "../models/organization.model";
import {
  applyInvoiceCostLines,
  applyStockDeltas,
  applyStockAndCommitmentDeltas,
  collectInvoiceStockDeltas,
  computeInvoiceCostLines,
  diffStockDeltas,
  invertStockDeltas,
  recomputeContactOutstanding,
} from "../services/accounting-sync.service";
import {
  syncSalesOrderByInvoice,
} from "../services/status-sync.service";

import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "../services/gl-posting.service";
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";
import { createPaymentReceivedEntry } from "./payment-received.controller";

/** Parse a field that may arrive as a JS array (JSON body) or a JSON string (FormData). */
function parseStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return (val as string[]).filter(Boolean);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed];
    } catch {
      return [val];
    }
  }
  return [];
}

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function normalizeOrderNumber(value: unknown): string {
  return String(value || "").trim();
}

async function shouldApplyInvoiceStockMovement(params: {
  organizationId: any;
  orderNumber: string;
}): Promise<boolean> {
  const orderNumber = normalizeOrderNumber(params.orderNumber);
  if (!orderNumber) return true;

  const linkedOrder = await SalesOrder.findOne({
    organizationId: params.organizationId,
    salesOrderNumber: orderNumber,
    isDeleted: false,
  })
    .select("shipmentStatus")
    .lean();

  return String((linkedOrder as any)?.shipmentStatus || "") !== "Delivered";
}


async function syncDeliveryChallanLinkForInvoice(params: {
  invoice: any;
  req: AuthenticatedRequest;
}) {
  const invoiceId = String(params.invoice?._id || "").trim();
  if (!invoiceId) return;

  const linkedChallans = await DeliveryChallan.find({
    organizationId: params.invoice.organizationId,
    invoiceId: params.invoice._id,
    isDeleted: false,
  } as any);

  for (const linked of linkedChallans) {
    (linked as any).invoiceStatus = "NOT INVOICED";
    (linked as any).invoiceId = null;
    attachUser(linked as any, params.req);
    await linked.save();
  }

  if (params.invoice.isDeleted || String(params.invoice.status || "") === "Void") {
    return;
  }

  const orderNumber = normalizeOrderNumber(params.invoice.orderNumber);
  if (!orderNumber) return;

  const challan = await DeliveryChallan.findOne({
    organizationId: params.invoice.organizationId,
    isDeleted: false,
    invoiceStatus: "NOT INVOICED",
    $or: [
      { challanNumber: orderNumber },
      { salesOrderNumber: orderNumber },
    ],
  } as any).sort({ challanDate: -1, createdAt: -1 });

  if (!challan) return;

  (challan as any).invoiceStatus = "INVOICED";
  (challan as any).invoiceId = params.invoice._id;
  attachUser(challan as any, params.req);
  await challan.save();
}

async function normalizeItems(
  organizationId: any,
  customerId: any,
  items: any[] = [],
) {
  const linkedItems = await applyItemTaxLinkageToItems({
    organizationId,
    contactId: customerId,
    items,
  });

  return linkedItems.map((item) => {
    const quantity = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const lineTotal = quantity * rate;
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount =
      item.discountAmount !== undefined && item.discountAmount !== null ?
        Number(item.discountAmount)
      : (lineTotal * discountPercent) / 100;
    const afterDiscount = lineTotal - discountAmount;
    const taxPercent = Number(item.taxPercent) || 0;
    const taxAmount =
      item.taxAmount !== undefined && item.taxAmount !== null ?
        Number(item.taxAmount)
      : (afterDiscount * taxPercent) / 100;

    return {
      ...item,
      quantity,
      rate,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      amount: afterDiscount + taxAmount,
    };
  });
}

function summarizeTotals(
  items: any[],
  discountType: string,
  discountValue: number,
  taxType: string,
  taxAmount: number,
  adjustmentAmount: number,
) {
  const subTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0,
  );
  const lineItemsTotal = items.reduce(
    (sum, item) =>
      sum +
      (Number.isFinite(Number(item.amount)) ?
        Number(item.amount)
      : Number(item.quantity || 0) * Number(item.rate || 0)),
    0,
  );
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const normalizedTaxAmount = Number(taxAmount) || 0;
  const taxImpact =
    taxType === "TCS" ? normalizedTaxAmount
    : taxType === "TDS" ? -normalizedTaxAmount
    : 0;
  const total =
    lineItemsTotal - discountAmount + taxImpact + adjustmentAmount;
  return { subTotal, discountAmount, total };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasFinancialEdits(payload: Record<string, unknown>): boolean {
  const keys = [
    "items",
    "discountType",
    "discountValue",
    "taxType",
    "taxId",
    "taxAmount",
    "adjustmentAmount",
    "adjustmentLabel",
    "total",
    "balanceDue",
    "paymentReceived",
  ];
  return keys.some((key) => payload[key] !== undefined);
}

function invoiceVoucherId(invoice: any): string {
  return `invoice:${String(invoice._id)}`;
}

function collectStoredInvoiceCostLines(items: any[] = []) {
  return (items || [])
    .map((line) => {
      const itemId = String(line?.itemId || "");
      const quantity = round2(toNum(line?.quantity));
      const costRate = round2(toNum(line?.costRate));
      const costAmount = round2(toNum(line?.costAmount));
      return { itemId, quantity, costRate, costAmount };
    })
    .filter((line) => line.itemId && line.quantity > 0 && line.costAmount > 0);
}

function applyCostLinesToInvoiceItems(items: any[] = [], costLines: any[] = []): boolean {
  const costRateMap = new Map<string, number>();
  for (const line of costLines) {
    if (!line?.itemId) continue;
    costRateMap.set(String(line.itemId), round2(toNum(line.costRate)));
  }

  let changed = false;
  for (const item of items || []) {
    const itemId = String(item?.itemId || "");
    const quantity = round2(toNum(item?.quantity));

    if (itemId && quantity > 0 && costRateMap.has(itemId)) {
      const rate = round2(toNum(costRateMap.get(itemId)));
      const amount = round2(quantity * rate);
      if (round2(toNum(item.costRate)) !== rate) {
        item.costRate = rate;
        changed = true;
      }
      if (round2(toNum(item.costAmount)) !== amount) {
        item.costAmount = amount;
        changed = true;
      }
      continue;
    }

    if (round2(toNum(item?.costRate)) !== 0) {
      item.costRate = 0;
      changed = true;
    }
    if (round2(toNum(item?.costAmount)) !== 0) {
      item.costAmount = 0;
      changed = true;
    }
  }

  return changed;
}

async function postInvoiceLedger(invoice: any, req: AuthenticatedRequest) {
  if (!isPostedInvoiceStatus(String(invoice.status || ""))) return;

  const organizationId = invoice.organizationId;
  const receivableAmount = round2(toNum(invoice.total));
  if (receivableAmount <= 0) return;

  const customerId = String(invoice.customerId || "");
  const customer = customerId
    ? await Contact.findOne({ _id: customerId, organizationId })
        .select("accountsReceivableId")
        .lean()
    : null;

  const arAccountId =
    customer?.accountsReceivableId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
      rootType: "Asset",
      accountType: "Accounts Receivable",
    }));

  const defaultSalesAccountId = await findAccountIdByName({
    organizationId,
    names: ["Sales", "Sales Revenue", "Sales Account"],
    rootType: "Income",
    accountType: "Income",
  });

  const revenueMap = new Map<string, number>();
  for (const line of invoice.items || []) {
    const amount = round2(toNum(line?.amount));
    if (amount <= 0) continue;
    const accountId = String(line?.accountId || defaultSalesAccountId);
    revenueMap.set(accountId, round2((revenueMap.get(accountId) || 0) + amount));
  }

  if (revenueMap.size === 0) {
    revenueMap.set(String(defaultSalesAccountId), receivableAmount);
  }

  const costLines = await computeInvoiceCostLines({
    organizationId,
    items: invoice.items || [],
  });
  const cogsTotal = round2(costLines.reduce((sum, line) => sum + toNum(line.costAmount), 0));

  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Customer";
    contactId?: any;
  }> = [
    {
      accountId: arAccountId,
      debit: receivableAmount,
      description: `Invoice ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    },
  ];

  let recognizedRevenue = 0;
  for (const [accountId, amount] of revenueMap.entries()) {
    const rounded = round2(amount);
    if (rounded <= 0) continue;
    lines.push({
      accountId,
      credit: rounded,
      description: `Revenue - ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    });
    recognizedRevenue = round2(recognizedRevenue + rounded);
  }

  const taxDelta = round2(receivableAmount - recognizedRevenue);
  if (Math.abs(taxDelta) > 0.009) {
    if (taxDelta > 0) {
      const taxPayableAccountId = await findAccountIdByName({
        organizationId,
        names: ["Output Tax Payable", "GST Payable", "Tax Payable"],
        rootType: "Liability",
        accountType: "Other Current Liability",
      });
      lines.push({
        accountId: taxPayableAccountId,
        credit: taxDelta,
        description: `Tax - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      });
    } else {
      const taxAssetAccountId = await findAccountIdByName({
        organizationId,
        names: ["Tax Receivable", "TDS Receivable", "Advance Tax"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      });
      lines.push({
        accountId: taxAssetAccountId,
        debit: Math.abs(taxDelta),
        description: `Tax receivable - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      });
    }
  }

  if (cogsTotal > 0) {
    const cogsAccountId = await findAccountIdByName({
      organizationId,
      names: ["Cost of Goods Sold", "COGS"],
      rootType: "Expense",
      accountType: "Cost Of Goods Sold",
    });
    const stockAccountId = await findAccountIdByName({
      organizationId,
      names: ["Inventory Asset", "Inventory", "Stock"],
      rootType: "Asset",
      accountType: "Stock",
    });
    lines.push({
      accountId: cogsAccountId,
      debit: cogsTotal,
      description: `COGS - ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    });
    lines.push({
      accountId: stockAccountId,
      credit: cogsTotal,
      description: `Inventory issue - ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    });
  }

  const posting = await postVoucher({
    organizationId,
    voucherType: "Invoice",
    voucherId: invoiceVoucherId(invoice),
    voucherNo: String(invoice.invoiceNumber),
    postingDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
    lines,
    description: `Invoice posting ${invoice.invoiceNumber}`,
    req,
  });

  if (!posting.posted) return;

  if (costLines.length > 0) {
    await applyInvoiceCostLines({
      organizationId,
      costLines,
      direction: "issue",
      req,
    });
  }

  if (applyCostLinesToInvoiceItems(invoice.items || [], costLines)) {
    attachUser(invoice, req);
    await invoice.save();
  }
}

async function reverseInvoiceLedger(invoice: any, req: AuthenticatedRequest) {
  const reversal = await reverseVoucher({
    organizationId: invoice.organizationId,
    voucherType: "Invoice",
    voucherId: invoiceVoucherId(invoice),
    reversalVoucherNo: `REV-${invoice.invoiceNumber}`,
    postingDate: new Date(),
    description: `Invoice reversal ${invoice.invoiceNumber}`,
    req,
  });

  if (!reversal.reversed) return;

  const storedCostLines = collectStoredInvoiceCostLines(invoice.items || []);
  if (storedCostLines.length > 0) {
    await applyInvoiceCostLines({
      organizationId: invoice.organizationId,
      costLines: storedCostLines,
      direction: "reverse",
      req,
    });
  }
}

async function nextInvoiceNumber(organizationId: any): Promise<string> {
  const last = await Invoice.findOne({ organizationId })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  if (!last) return "INV-000001";

  const match = last.invoiceNumber.match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

// ─── List Invoices ─────────────────────────────────────────────────────
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      customerId,
      customer_id,
      page = 1,
      limit = 25,
      sortBy = "invoiceDate",
      sortOrder = "desc",
    } = req.query as Record<string, string>;

    const filter: any = { organizationId: orgId(req) };
    if (status && status !== "All") filter.status = status;
    const customerFilterId = customerId || customer_id;
    if (customerFilterId) filter.customerId = customerFilterId;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .populate("customerId", "displayName companyName email")
      .populate("salesPersonId", "name")
      .populate("paymentTermsId", "name netDays")
      .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

// ─── Get Single Invoice ────────────────────────────────────────────────
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    })
      .populate("customerId")
      .populate("salesPersonId")
      .populate("paymentTermsId")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate")
      .populate("taxId", "name rate");

    if (!invoice) throw new NotFoundError("Invoice");
    res.json({ success: true, data: invoice });
  },
);

// ─── Create Invoice ────────────────────────────────────────────────────
// GET /api/invoices/:id/pdf
export const downloadPdf = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    })
      .populate("customerId", "displayName companyName email billingAddress")
      .populate("paymentTermsId", "name netDays")
      .populate("items.itemId", "name sku hsnSacCode")
      .lean();

    if (!invoice) throw new NotFoundError("Invoice");

    const org = await Organization.findById(oid).lean();
    if (!org) throw new NotFoundError("Organization");

    const customer = invoice.customerId as any;
    const customerName =
      (typeof customer === "object" &&
        (customer?.displayName || customer?.companyName)) ||
      "Customer";
    const customerAddress = [
      customer?.billingAddress?.street,
      customer?.billingAddress?.street2,
      customer?.billingAddress?.city,
      customer?.billingAddress?.state,
      customer?.billingAddress?.zip,
      customer?.billingAddress?.country,
    ]
      .filter(Boolean)
      .join(", ");
    const paymentTerms = invoice.paymentTermsId as any;

    const pdfBuffer = await generateInvoicePdf({
      orgName: org.name,
      orgAddress: org.address as any,
      orgEmail:
        (org as any).smtpSettings?.fromEmail ||
        (org as any).smtpSettings?.user ||
        undefined,
      orgTaxId: (org as any).taxId,

      customerName,
      customerAddress: customerAddress || undefined,
      customerEmail: customer?.email,

      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: (invoice.invoiceDate as any)?.toISOString
        ? (invoice.invoiceDate as any).toISOString()
        : String(invoice.invoiceDate),
      dueDate:
        (invoice.dueDate as any)?.toISOString ?
          (invoice.dueDate as any).toISOString()
        : invoice.dueDate ? String(invoice.dueDate)
        : undefined,
      paymentTerms: paymentTerms?.name || undefined,
      orderNumber: invoice.orderNumber,
      subject: invoice.subject,

      items: (invoice.items as any[]).map((item) => ({
        name:
          (typeof item.itemId === "object" && item.itemId?.name) ||
          item.name ||
          "Item",
        description: item.description,
        hsnSacCode:
          item.hsnSacCode ||
          (typeof item.itemId === "object" ? item.itemId?.hsnSacCode : ""),
        quantity: Number(item.quantity || 0),
        rate: Number(item.rate || 0),
        discountPercent: Number(item.discountPercent || 0),
        discountAmount: Number(item.discountAmount || 0),
        taxPercent: Number(item.taxPercent || 0),
        taxAmount: Number(item.taxAmount || 0),
        amount: Number(item.amount || 0),
      })),

      subTotal: Number(invoice.subTotal || 0),
      discountType: invoice.discountType,
      discountValue: Number(invoice.discountValue || 0),
      discountAmount: Number(invoice.discountAmount || 0),
      taxType: invoice.taxType,
      taxAmount: Number(invoice.taxAmount || 0),
      adjustmentLabel: invoice.adjustmentLabel,
      adjustmentAmount: Number(invoice.adjustmentAmount || 0),
      total: Number(invoice.total || 0),
      balanceDue: Number(invoice.balanceDue ?? invoice.total ?? 0),

      customerNotes: invoice.customerNotes,
      termsAndConditions: invoice.termsAndConditions,
      currencySymbol: org.baseCurrency === "INR" ? "₹" : org.baseCurrency,
    });

    const safeInvoiceNumber = String(invoice.invoiceNumber || "invoice")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const isPreview = req.query.preview === "true";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${isPreview ? "inline" : "attachment"}; filename="Invoice-${safeInvoiceNumber}.pdf"`,
    );
    res.send(pdfBuffer);
  },
);

// Create Invoice
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);

    if (!req.body.customerId) throw new ValidationError("Customer is required");
    if (!req.body.invoiceDate)
      throw new ValidationError("Invoice date is required");
    if (!req.body.items || req.body.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    const invoiceNumber =
      req.body.invoiceNumber || (await nextInvoiceNumber(oid));
    const items = await normalizeItems(oid, req.body.customerId, req.body.items || []);
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const taxType = req.body.taxType || "none";
    const taxAmount = Number(req.body.taxAmount) || 0;
    const adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
    const { subTotal, discountAmount, total } = summarizeTotals(
      items,
      discountType,
      discountValue,
      taxType,
      taxAmount,
      adjustmentAmount,
    );

    const paymentReceived = req.body.paymentReceived === true;
    const balanceDueInput =
      req.body.balanceDue !== undefined ? Number(req.body.balanceDue) : total;
    const balanceDue = Math.max(0, paymentReceived ? 0 : balanceDueInput);
    const status = req.body.status || (paymentReceived ? "Paid" : "Draft");

    const invoice = new Invoice({
      organizationId: oid,
      invoiceNumber,
      referenceNumber: req.body.referenceNumber || "",
      orderNumber: req.body.orderNumber || "",
      customerId: req.body.customerId,
      invoiceDate: req.body.invoiceDate,
      dueDate: req.body.dueDate || null,
      paymentTermsId: req.body.paymentTermsId || null,
      salesPersonId: req.body.salesPersonId || null,
      subject: req.body.subject || "",
      items,
      subTotal,
      discountType,
      discountValue,
      discountAmount,
      taxType,
      taxId: req.body.taxId || null,
      taxAmount,
      adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
      adjustmentAmount,
      total,
      balanceDue,
      customerNotes: req.body.customerNotes || "",
      termsAndConditions: req.body.termsAndConditions || "",
      status,
      emailContacts: req.body.emailContacts || [],
      attachments: req.body.attachments || [],
      paymentReceived,
      isRecurring: req.body.isRecurring === true,
      journalEntries: req.body.journalEntries || [],
      pdfTemplateId: req.body.pdfTemplateId || null,
      sentAt: req.body.sentAt || null,
      paidAt: req.body.paidAt || null,
    });

    attachUser(invoice, req);
    await invoice.save();

    const shouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: oid,
      orderNumber: String((invoice as any).orderNumber || ""),
    });

    if (isPostedInvoiceStatus(String(invoice.status || "")) && shouldApplyStock) {
      const deltas = collectInvoiceStockDeltas(invoice.items as any[]);
      const orderNumber = normalizeOrderNumber((invoice as any).orderNumber);
      
      if (orderNumber) {
        await applyStockAndCommitmentDeltas({
          organizationId: oid,
          deltas,
          req,
        });
      } else {
        await applyStockDeltas({
          organizationId: oid,
          deltas,
          req,
        });
      }

      await postInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: oid,
      contactId: invoice.customerId as any,
      req,
    });

    await syncSalesOrderByInvoice({
      organizationId: oid,
      invoice,
      req,
    });

    await syncDeliveryChallanLinkForInvoice({
      invoice,
      req,
    });

    res.status(201).json({ success: true, data: invoice });
  },
);

// ─── Update Invoice ────────────────────────────────────────────────────
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!invoice) throw new NotFoundError("Invoice");

    const previousCustomerId = String(invoice.customerId || "");
    const previousOrderNumber = String((invoice as any).orderNumber || "");
    const previousPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const previousShouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: invoice.organizationId as any,
      orderNumber: previousOrderNumber,
    });
    const previousStockDeltas = previousPosted && previousShouldApplyStock
      ? collectInvoiceStockDeltas(invoice.items as any[])
      : {};

    if (previousPosted && hasFinancialEdits(req.body || {})) {
      throw new ValidationError(
        "Cannot edit financial fields after invoice is posted. Void and recreate for accounting integrity.",
      );
    }

    const allowed = [
      "customerId",
      "invoiceNumber",
      "referenceNumber",
      "orderNumber",
      "invoiceDate",
      "dueDate",
      "paymentTermsId",
      "salesPersonId",
      "subject",
      "items",
      "discountType",
      "discountValue",
      "taxType",
      "taxId",
      "taxAmount",
      "adjustmentLabel",
      "adjustmentAmount",
      "customerNotes",
      "termsAndConditions",
      "emailContacts",
      "attachments",
      "status",
      "paymentReceived",
      "isRecurring",
      "journalEntries",
      "pdfTemplateId",
      "sentAt",
      "paidAt",
      "balanceDue",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined)
        (invoice as any)[field] = req.body[field];
    });

    if (req.body.items) {
      const customerId = req.body.customerId ?? invoice.customerId;
      invoice.items = await normalizeItems(
        invoice.organizationId,
        customerId,
        req.body.items,
      );
    } else if (req.body.customerId !== undefined) {
      invoice.items = await normalizeItems(
        invoice.organizationId,
        req.body.customerId,
        invoice.items as any[],
      );
    }

    const totals = summarizeTotals(
      invoice.items,
      invoice.discountType,
      Number(invoice.discountValue) || 0,
      invoice.taxType,
      Number(invoice.taxAmount) || 0,
      Number(invoice.adjustmentAmount) || 0,
    );
    invoice.subTotal = totals.subTotal;
    invoice.discountAmount = totals.discountAmount;
    invoice.total = totals.total;

    if (req.body.balanceDue !== undefined) {
      invoice.balanceDue = Math.max(0, Number(req.body.balanceDue));
    } else if (
      req.body.items ||
      req.body.taxAmount !== undefined ||
      req.body.taxType !== undefined ||
      req.body.adjustmentAmount !== undefined ||
      req.body.discountValue !== undefined ||
      req.body.discountType !== undefined
    ) {
      invoice.balanceDue = invoice.paymentReceived ? 0 : invoice.total;
    }

    if (invoice.paymentReceived) {
      invoice.balanceDue = 0;
      if (!invoice.paidAt) invoice.paidAt = new Date();
    }

    attachUser(invoice, req);
    await invoice.save();

    const nextPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const nextShouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: invoice.organizationId as any,
      orderNumber: String((invoice as any).orderNumber || ""),
    });
    const nextStockDeltas = nextPosted && nextShouldApplyStock
      ? collectInvoiceStockDeltas(invoice.items as any[])
      : {};
    const stockDeltaDiff = diffStockDeltas(previousStockDeltas, nextStockDeltas);

    if (Object.keys(stockDeltaDiff).length > 0) {
      await applyStockDeltas({
        organizationId: invoice.organizationId as any,
        deltas: stockDeltaDiff,
        req,
      });
    }

    if (!previousPosted && nextPosted) {
      await postInvoiceLedger(invoice, req);
    } else if (previousPosted && !nextPosted) {
      await reverseInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: invoice.organizationId as any,
      contactId: invoice.customerId as any,
      req,
    });

    if (previousCustomerId && previousCustomerId !== String(invoice.customerId || "")) {
      await recomputeContactOutstanding({
        organizationId: invoice.organizationId as any,
        contactId: previousCustomerId,
        req,
      });
    }

    const currentOrderNumber = String((invoice as any).orderNumber || "");
    if (previousOrderNumber && previousOrderNumber !== currentOrderNumber) {
      await syncSalesOrderByInvoice({
        organizationId: invoice.organizationId as any,
        invoice,
        req,
      });
    }

    await syncSalesOrderByInvoice({
      organizationId: invoice.organizationId as any,
      invoice,
      req,
    });

    await syncDeliveryChallanLinkForInvoice({
      invoice,
      req,
    });

    res.json({ success: true, data: invoice });
  },
);

// ─── Delete Invoice ────────────────────────────────────────────────────
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!invoice) throw new NotFoundError("Invoice");

    const wasPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const previousShouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: invoice.organizationId as any,
      orderNumber: String((invoice as any).orderNumber || ""),
    });
    const previousStockDeltas = wasPosted && previousShouldApplyStock
      ? collectInvoiceStockDeltas(invoice.items as any[])
      : {};

    invoice.isDeleted = true;
    (invoice as any).deletedAt = new Date();
    attachUser(invoice, req);
    await invoice.save();

    if (wasPosted) {
      if (Object.keys(previousStockDeltas).length > 0) {
        await applyStockDeltas({
          organizationId: invoice.organizationId as any,
          deltas: invertStockDeltas(previousStockDeltas),
          req,
        });
      }

      await reverseInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: invoice.organizationId as any,
      contactId: invoice.customerId as any,
      req,
    });

    await syncSalesOrderByInvoice({
      organizationId: invoice.organizationId as any,
      invoice,
      req,
    });

    await syncDeliveryChallanLinkForInvoice({
      invoice,
      req,
    });

    res.json({ success: true, message: "Invoice deleted" });
  },
);

// ─── Misc Helpers ─────────────────────────────────────────────────────
export const getNextNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const num = await nextInvoiceNumber(orgId(req));
    res.json({ success: true, data: { invoiceNumber: num } });
  },
);

// ─── Status & Payment Actions ─────────────────────────────────────────
async function requireInvoice(req: AuthenticatedRequest) {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
  });
  if (!invoice) throw new NotFoundError("Invoice");
  return invoice;
}

function markSentState(invoice: any) {
  invoice.status = "Sent";
  if (!invoice.sentAt) invoice.sentAt = new Date();
}

function isPostedInvoiceStatus(status: string): boolean {
  return status !== "Draft" && status !== "Void";
}

export const sendInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    if (invoice.status === "Void") {
      throw new ValidationError("Cannot send a void invoice");
    }

    const wasPosted = isPostedInvoiceStatus(String(invoice.status || ""));

    markSentState(invoice);
    attachUser(invoice, req);
    await invoice.save();

    const nowPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const shouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: invoice.organizationId as any,
      orderNumber: String((invoice as any).orderNumber || ""),
    });
    if (!wasPosted && nowPosted && shouldApplyStock) {
      const stockDiff = collectInvoiceStockDeltas(invoice.items as any[]);
      const orderNumber = normalizeOrderNumber((invoice as any).orderNumber);
      if (orderNumber) {
        await applyStockAndCommitmentDeltas({
          organizationId: invoice.organizationId as any,
          deltas: stockDiff,
          req,
        });
      } else {
        await applyStockDeltas({
          organizationId: invoice.organizationId as any,
          deltas: stockDiff,
          req,
        });
      }

      await postInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: invoice.organizationId as any,
      contactId: invoice.customerId as any,
      req,
    });

    res.json({
      success: true,
      data: invoice,
      message: "Invoice marked as sent",
    });
  },
);

export const markAsSent = sendInvoice;

export const sendInvoiceEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    if (invoice.status === "Void") {
      throw new ValidationError("Cannot email a void invoice");
    }

    const wasPosted = isPostedInvoiceStatus(String(invoice.status || ""));

    // Support both JSON body and multipart/form-data (for file attachments)
    const to = parseStringArray(req.body.to);
    const cc = parseStringArray(req.body.cc);
    const bcc = parseStringArray(req.body.bcc);
    const subject: string = req.body.subject || "";
    const body: string = req.body.body || "";
    const attachInvoicePdf: boolean =
      req.body.attachInvoicePdf === true ||
      req.body.attachInvoicePdf === "true";

    if (to.length === 0) {
      throw new ValidationError("At least one recipient (to) is required");
    }

    // Populate customer and line-item references for name + PDF
    await invoice.populate([
      { path: "customerId" },
      { path: "items.taxId", select: "name rate" },
      { path: "paymentTermsId", select: "name" },
    ]);

    const customer = invoice.customerId as any;
    const customerName =
      typeof customer === "string" ? customer : (
        customer?.displayName || customer?.companyName || "Customer"
      );

    const oid = (invoice as any).organizationId?.toString();

    // Build attachments list: PDF first, then user-uploaded files
    const uploadedFiles =
      (req.files as Express.Multer.File[] | undefined) ?? [];
    const attachments: {
      filename: string;
      content: Buffer;
      contentType: string;
    }[] = [];

    if (attachInvoicePdf) {
      // Fetch org for header details
      const org = await Organization.findById(oid).lean();

      // Build customer address string from contact fields
      const custAddr = [
        customer?.billingAddress?.street,
        customer?.billingAddress?.city,
        customer?.billingAddress?.state,
        customer?.billingAddress?.country,
      ]
        .filter(Boolean)
        .join(", ");

      const paymentTerms = (invoice as any).paymentTermsId;
      const termsLabel = paymentTerms?.name || undefined;

      const pdfBuffer = await generateInvoicePdf({
        orgName: org?.name ?? "",
        orgAddress: org?.address as any,
        orgEmail:
          org?.smtpSettings?.fromEmail || org?.smtpSettings?.user || undefined,
        orgTaxId: org?.taxId,

        customerName,
        customerAddress: custAddr || customer?.address || undefined,
        customerEmail: customer?.email,

        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate?.toISOString(),
        paymentTerms: termsLabel,
        orderNumber: invoice.orderNumber,
        subject: invoice.subject,

        items: (invoice.items as any[]).map((item) => ({
          name: item.name,
          description: item.description,
          hsnSacCode: item.hsnSacCode,
          quantity: item.quantity,
          rate: item.rate,
          discountPercent: item.discountPercent,
          discountAmount: item.discountAmount,
          taxPercent: item.taxPercent,
          taxAmount: item.taxAmount,
          amount: item.amount,
        })),

        subTotal: invoice.subTotal ?? 0,
        discountType: invoice.discountType,
        discountValue: invoice.discountValue,
        discountAmount: invoice.discountAmount,
        taxType: invoice.taxType,
        taxAmount: invoice.taxAmount,
        adjustmentLabel: invoice.adjustmentLabel,
        adjustmentAmount: invoice.adjustmentAmount,
        total: invoice.total,
        balanceDue: invoice.balanceDue,

        customerNotes: invoice.customerNotes,
        termsAndConditions: invoice.termsAndConditions,
        currencySymbol: org?.baseCurrency === "INR" ? "₹" : org?.baseCurrency,
      });

      attachments.push({
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    // Append any user-uploaded file attachments
    uploadedFiles.forEach((f) => {
      attachments.push({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      });
    });

    await sendInvoiceEmailService({
      organizationId: oid,
      to,
      cc,
      bcc,
      subject: subject || `Invoice ${invoice.invoiceNumber}`,
      body,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: invoice.total,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : undefined,
      customerName,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    markSentState(invoice);
    attachUser(invoice, req);
    await invoice.save();

    const nowPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const shouldApplyStock = await shouldApplyInvoiceStockMovement({
      organizationId: invoice.organizationId as any,
      orderNumber: String((invoice as any).orderNumber || ""),
    });
    if (!wasPosted && nowPosted && shouldApplyStock) {
      const stockDiff = collectInvoiceStockDeltas(invoice.items as any[]);
      const orderNumber = normalizeOrderNumber((invoice as any).orderNumber);
      if (orderNumber) {
        await applyStockAndCommitmentDeltas({
          organizationId: invoice.organizationId as any,
          deltas: stockDiff,
          req,
        });
      } else {
        await applyStockDeltas({
          organizationId: invoice.organizationId as any,
          deltas: stockDiff,
          req,
        });
      }

      await postInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: invoice.organizationId as any,
      contactId: invoice.customerId as any,
      req,
    });

    res.json({
      success: true,
      data: invoice,
      message: "Invoice emailed successfully",
    });
  },
);

export const recordPayment = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    if (invoice.status === "Void") {
      throw new ValidationError("Cannot record payment for a void invoice");
    }

    const wasPosted = isPostedInvoiceStatus(String(invoice.status || ""));

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      throw new ValidationError("Payment amount must be greater than zero");
    }

    const currentBalance = Number(invoice.balanceDue ?? invoice.total ?? 0);
    if (amount > currentBalance + 0.0001) {
      throw new ValidationError("Payment amount cannot exceed invoice balance due");
    }

    const payment = await createPaymentReceivedEntry({
      req,
      organization_id: orgId(req) as any,
      payload: {
        customer_id: String(invoice.customerId),
        status: "PAID",
        total_amount_received: amount,
        payment_date: req.body.paymentDate || req.body.payment_date || new Date(),
        payment_mode:
          req.body.paymentMode ||
          req.body.payment_mode ||
          req.body.paymentModeId ||
          "Bank Transfer",
        deposited_to_account:
          req.body.depositedToAccount || req.body.deposited_to_account || null,
        reference_number:
          req.body.referenceNumber || req.body.reference_number || "",
        notes: req.body.notes || "",
        invoice_applications: [
          {
            invoice_id: String(invoice._id),
            applied_amount: amount,
          },
        ],
      },
      idempotencyScope: `invoices:record-payment:${String(invoice._id)}`,
    });

    const refreshedInvoice = await Invoice.findOne({
      _id: invoice._id,
      organizationId: orgId(req),
      isDeleted: false,
    });
    if (!refreshedInvoice) throw new NotFoundError("Invoice");

    const nowPosted = isPostedInvoiceStatus(String(refreshedInvoice.status || ""));
    if (!wasPosted && nowPosted) {
      await applyStockDeltas({
        organizationId: refreshedInvoice.organizationId as any,
        deltas: collectInvoiceStockDeltas(refreshedInvoice.items as any[]),
        req,
      });

      await postInvoiceLedger(refreshedInvoice, req);
    }

    await syncSalesOrderByInvoice({
      organizationId: refreshedInvoice.organizationId as any,
      invoice: refreshedInvoice,
      req,
    });

    res.json({
      success: true,
      data: refreshedInvoice,
      message: "Payment recorded",
      meta: {
        paymentReceivedId: (payment as any)._id,
        paymentNumber: (payment as any).payment_number,
      },
    });
  },
);

export const voidInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    const wasPosted = isPostedInvoiceStatus(String(invoice.status || ""));
    const previousStockDeltas = wasPosted
      ? collectInvoiceStockDeltas(invoice.items as any[])
      : {};

    invoice.status = "Void";
    invoice.balanceDue = 0;
    invoice.paymentReceived = false;
    attachUser(invoice, req);
    await invoice.save();

    if (wasPosted) {
      if (Object.keys(previousStockDeltas).length > 0) {
        await applyStockDeltas({
          organizationId: invoice.organizationId as any,
          deltas: invertStockDeltas(previousStockDeltas),
          req,
        });
      }

      await reverseInvoiceLedger(invoice, req);
    }

    await recomputeContactOutstanding({
      organizationId: invoice.organizationId as any,
      contactId: invoice.customerId as any,
      req,
    });

    await syncSalesOrderByInvoice({
      organizationId: invoice.organizationId as any,
      invoice,
      req,
    });

    await syncDeliveryChallanLinkForInvoice({
      invoice,
      req,
    });

    res.json({ success: true, data: invoice, message: "Invoice voided" });
  },
);

// ─── Clone Invoice ───────────────────────────────────────────────────
export const cloneInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const original = await Invoice.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    }).lean();

    if (!original) throw new NotFoundError("Invoice");

    const invoiceNumber = await nextInvoiceNumber(oid);
    
    // Create a copy of the original invoice data
    const cloneData = {
      ...original,
      _id: undefined,
      id: undefined,
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate: original.dueDate ? new Date(original.dueDate) : null,
      status: "Draft",
      paymentReceived: false,
      balanceDue: original.total,
      sentAt: null,
      paidAt: null,
      journalEntries: [],
      attachments: [],
      createdAt: undefined,
      updatedAt: undefined,
    };

    const clone = new Invoice(cloneData);
    attachUser(clone, req);
    await clone.save();

    res.status(201).json({ success: true, data: clone });
  },
);

// ─── Convert to Recurring ─────────────────────────────────────────────
export const convertToRecurring = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    }).lean();

    if (!invoice) throw new NotFoundError("Invoice");

    // RecurringInvoice profile structure
    const profileData = {
      organizationId: oid,
      profileName: `Recurring Profile for ${invoice.invoiceNumber}`,
      customerId: invoice.customerId,
      startDate: new Date(),
      frequency: "monthly",
      neverExpires: true,
      paymentTermsId: invoice.paymentTermsId,
      salesPersonId: invoice.salesPersonId,
      subject: invoice.subject,
      items: invoice.items,
      subTotal: invoice.subTotal,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      discountAmount: invoice.discountAmount,
      taxType: invoice.taxType,
      taxId: invoice.taxId,
      taxAmount: invoice.taxAmount,
      adjustmentLabel: invoice.adjustmentLabel,
      adjustmentAmount: invoice.adjustmentAmount,
      total: invoice.total,
      customerNotes: invoice.customerNotes,
      termsAndConditions: invoice.termsAndConditions,
      status: "active",
    };

    const RecurringInvoice = require("../models/recurring-invoice.model").default;
    const profile = new RecurringInvoice(profileData);
    attachUser(profile, req);
    await profile.save();

    res.status(201).json({ success: true, data: profile });
  },
);

// ─── Get Journal Entries ──────────────────────────────────────────────
export const getJournalEntries = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const GlEntry = require("../models/gl-entry.model").default;
    
    const entries = await GlEntry.find({
      organizationId: oid,
      voucherId: invoiceVoucherId({ _id: req.params.id }),
    })
      .populate("accountId", "name code")
      .sort({ postingDate: 1, createdAt: 1 })
      .lean();

    res.json({ success: true, data: entries });
  },
);
