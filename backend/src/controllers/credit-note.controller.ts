import mongoose, { ClientSession } from "mongoose";
import { Response } from "express";
import Contact from "../models/contact.model";
import { Counter } from "../models/counter.model";
import CreditNote from "../models/credit-note.model";
import CreditNoteApplication from "../models/credit-note-application.model";
import Invoice from "../models/invoice.model";
import Organization from "../models/organization.model";
import { attachUser } from "../plugins";
import {
  applyInvoiceCostLines,
  computeInvoiceCostLines,
  recomputeContactOutstanding,
} from "../services/accounting-sync.service";
import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "../services/gl-posting.service";
import { generateCreditNotePdf } from "../services/pdf.service";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { reserveIdempotencyKey } from "../utils/idempotency";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scalarId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value);
}

function calcLineItems(items: any[], discountLevel: "transaction" | "line_item") {
  return (items || []).map((item: any) => {
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };

    const qty = Math.max(0, toNum(item.quantity, 1));
    const rate = Math.max(0, toNum(item.rate, 0));
    const gross = round2(qty * rate);

    if (discountLevel === "line_item") {
      const discountPercent = Math.max(0, toNum(item.discountPercent, 0));
      const computedDiscount = round2((gross * discountPercent) / 100);
      const discountAmount = round2(Math.min(gross, toNum(item.discountAmount, computedDiscount)));
      return {
        ...item,
        quantity: qty,
        rate,
        discountPercent,
        discountAmount,
        taxPercent: Math.max(0, toNum(item.taxPercent, 0)),
        amount: round2(gross - discountAmount),
      };
    }

    return {
      ...item,
      quantity: qty,
      rate,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: Math.max(0, toNum(item.taxPercent, 0)),
      amount: gross,
    };
  });
}

function computeTotals(input: {
  lineItems: any[];
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  tdsAmount: number;
  tcsAmount: number;
  adjustmentAmount: number;
}) {
  const rowItems = input.lineItems.filter((line: any) => !line.isHeader);
  const subTotal = round2(
    rowItems.reduce((sum: number, line: any) => sum + round2(toNum(line.quantity) * toNum(line.rate)), 0),
  );

  const discountAmount =
    input.discountLevel === "transaction"
      ? round2((subTotal * input.discountPercent) / 100)
      : round2(rowItems.reduce((sum: number, line: any) => sum + toNum(line.discountAmount), 0));

  const safeDiscountAmount = Math.min(subTotal, Math.max(0, discountAmount));
  const taxableBase = round2(subTotal - safeDiscountAmount);

  const transactionScale = subTotal > 0 ? taxableBase / subTotal : 1;
  const taxAmount = round2(
    rowItems.reduce((sum: number, line: any) => {
      const gross = round2(toNum(line.quantity) * toNum(line.rate));
      const lineBase =
        input.discountLevel === "line_item"
          ? round2(Math.max(0, gross - toNum(line.discountAmount)))
          : round2(Math.max(0, gross * transactionScale));
      return sum + round2((lineBase * toNum(line.taxPercent)) / 100);
    }, 0),
  );

  const total = round2(taxableBase + taxAmount - input.tdsAmount + input.tcsAmount + input.adjustmentAmount);
  return {
    subTotal,
    discountAmount: safeDiscountAmount,
    taxAmount,
    total,
  };
}

function deriveStatus(appliedAmount: number, total: number) {
  if (appliedAmount <= 0) return "OPEN";
  if (round2(appliedAmount) >= round2(total)) return "CLOSED";
  return "PARTIALLY_APPLIED";
}

function invoiceStatusAfterCredit(params: {
  balanceDue: number;
  total: number;
  dueDate: Date | null;
  previousStatus: string;
}): "Sent" | "Viewed" | "Overdue" | "Partially Paid" | "Paid" {
  if (params.balanceDue <= 0) return "Paid";
  if (params.balanceDue < round2(params.total)) return "Partially Paid";
  if (params.dueDate && new Date(params.dueDate) < new Date()) return "Overdue";
  if (params.previousStatus === "Viewed") return "Viewed";
  return "Sent";
}

function hasFinancialEdits(payload: any): boolean {
  const fields = [
    "lineItems",
    "customerId",
    "referenceInvoiceId",
    "accountsReceivableId",
    "discountLevel",
    "discountPercent",
    "taxType",
    "tdsId",
    "tcsId",
    "tdsAmount",
    "tcsAmount",
    "adjustmentAmount",
    "subTotal",
    "discountAmount",
    "taxAmount",
    "total",
  ];
  return fields.some((field) => payload[field] !== undefined);
}

async function nextCreditNoteNumber(organizationId: any): Promise<string> {
  const counterKey = `credit_note:${String(organizationId)}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();

  const seq = Number(counter?.seq || 1);
  return `CN-${String(seq).padStart(5, "0")}`;
}

function creditNoteVoucherId(credit: any): string {
  return `credit-note:${String(credit._id)}`;
}

function isPostedCreditStatus(status: string): boolean {
  return status !== "DRAFT" && status !== "VOID";
}

/**
 * Post GL entries for a sales credit note:
 *  CREDIT Accounts Receivable    → total  (reduce customer receivable)
 *  DEBIT line item account(s)    → amounts (sales reversal)
 */
async function postCreditNoteLedger(credit: any, req: AuthenticatedRequest) {
  if (!isPostedCreditStatus(String(credit.status || ""))) return;

  const organizationId = credit.organizationId;
  const total = round2(toNum(credit.total));
  if (total <= 0) return;

  const customerId = scalarId(credit.customerId);
  const customer = customerId
    ? await Contact.findOne({ _id: customerId, organizationId })
        .select("accountsReceivableId")
        .lean()
    : null;

  const arAccountId =
    credit.accountsReceivableId ||
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

  const debitMap = new Map<string, number>();
  for (const line of credit.lineItems || []) {
    if (!line || line.isHeader) continue;
    const amount = round2(toNum(line.amount));
    if (amount <= 0) continue;
    const accountId = String(line.accountId || defaultSalesAccountId);
    debitMap.set(accountId, round2((debitMap.get(accountId) || 0) + amount));
  }

  if (debitMap.size === 0) {
    debitMap.set(String(defaultSalesAccountId), total);
  }

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
      credit: total,
      description: `Credit Note ${credit.creditNoteNumber}`,
      contactType: "Customer",
      contactId: credit.customerId,
    },
  ];

  let recognizedDebit = 0;
  for (const [accountId, amount] of debitMap.entries()) {
    const rounded = round2(amount);
    if (rounded <= 0) continue;
    lines.push({
      accountId,
      debit: rounded,
      description: `Credit note reversal ${credit.creditNoteNumber}`,
      contactType: "Customer",
      contactId: credit.customerId,
    });
    recognizedDebit = round2(recognizedDebit + rounded);
  }

  const taxDelta = round2(total - recognizedDebit);
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
        debit: taxDelta,
        description: `Tax reversal - ${credit.creditNoteNumber}`,
        contactType: "Customer",
        contactId: credit.customerId,
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
        credit: Math.abs(taxDelta),
        description: `Tax asset reversal - ${credit.creditNoteNumber}`,
        contactType: "Customer",
        contactId: credit.customerId,
      });
    }
  }

  const costLines = await computeInvoiceCostLines({
    organizationId,
    items: (credit.lineItems || []).map((line: any) => ({
      itemId: line.itemId,
      quantity: line.quantity,
    })),
  });
  const cogsTotal = round2(costLines.reduce((sum, line) => sum + toNum(line.costAmount), 0));

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
      accountId: stockAccountId,
      debit: cogsTotal,
      description: `Inventory return - ${credit.creditNoteNumber}`,
      contactType: "Customer",
      contactId: credit.customerId,
    });

    lines.push({
      accountId: cogsAccountId,
      credit: cogsTotal,
      description: `COGS reversal - ${credit.creditNoteNumber}`,
      contactType: "Customer",
      contactId: credit.customerId,
    });
  }

  const posting = await postVoucher({
    organizationId,
    voucherType: "CreditNote",
    voucherId: creditNoteVoucherId(credit),
    voucherNo: String(credit.creditNoteNumber),
    postingDate: credit.creditNoteDate ? new Date(credit.creditNoteDate) : new Date(),
    lines,
    description: `Credit note posting ${credit.creditNoteNumber}`,
    req,
  });

  if (!posting.posted) return;

  if (costLines.length > 0) {
    await applyInvoiceCostLines({
      organizationId,
      costLines,
      direction: "reverse",
      req,
    });
  }
}

async function reverseCreditNoteLedger(credit: any, req: AuthenticatedRequest) {
  const reversal = await reverseVoucher({
    organizationId: credit.organizationId,
    voucherType: "CreditNote",
    voucherId: creditNoteVoucherId(credit),
    reversalVoucherNo: `REV-${credit.creditNoteNumber}`,
    postingDate: new Date(),
    description: `Credit note reversal ${credit.creditNoteNumber}`,
    req,
  });

  if (!reversal.reversed) return;

  const costLines = await computeInvoiceCostLines({
    organizationId: credit.organizationId,
    items: (credit.lineItems || []).map((line: any) => ({
      itemId: line.itemId,
      quantity: line.quantity,
    })),
  });

  if (costLines.length > 0) {
    await applyInvoiceCostLines({
      organizationId: credit.organizationId,
      costLines,
      direction: "issue",
      req,
    });
  }
}

async function runOptionalTransaction<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new ValidationError("Transaction did not produce a result");
    return result;
  } catch (error: any) {
    const message = String(error?.message || "");
    const txNotSupported =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("does not support retryable writes") ||
      message.includes("replica set");

    if (!txNotSupported) {
      throw error;
    }
    throw new ValidationError(
      "This accounting operation requires MongoDB transactions. Configure a replica set and retry.",
    );
  } finally {
    await session.endSession();
  }
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const next = await nextCreditNoteNumber(orgId(req));
  res.json({ success: true, data: { creditNoteNumber: next } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    status,
    customerId,
    search,
    dateStart,
    dateEnd,
    page = 1,
    limit = 25,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (search) {
    filter.$or = [
      { creditNoteNumber: { $regex: search, $options: "i" } },
      { referenceNumber: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }

  if (dateStart || dateEnd) {
    filter.creditNoteDate = {};
    if (dateStart) filter.creditNoteDate.$gte = new Date(String(dateStart));
    if (dateEnd) filter.creditNoteDate.$lte = new Date(String(dateEnd));
  }

  const total = await CreditNote.countDocuments(filter);
  const credits = await CreditNote.find(filter)
    .populate("customerId", "displayName companyName email")
    .populate("referenceInvoiceId", "invoiceNumber total balanceDue status")
    .sort({ [String(sortBy)]: sortOrder === "asc" ? 1 : -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  res.json({
    success: true,
    data: credits,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("customerId", "displayName companyName email billingAddress")
    .populate("referenceInvoiceId", "invoiceNumber total balanceDue status")
    .populate("salesPersonId", "name")
    .populate("lineItems.itemId", "name sku")
    .populate("lineItems.accountId", "name accountType")
    .lean();

  if (!credit) throw new NotFoundError("Credit note");

  const applications = await CreditNoteApplication.find({
    organizationId: orgId(req),
    creditNoteId: credit._id,
    isDeleted: false,
  })
    .populate("invoiceId", "invoiceNumber total balanceDue status")
    .sort({ appliedDate: -1 })
    .lean();

  res.json({ success: true, data: { credit, applications } });
});

/** GET /api/credit-notes/:id/pdf */
export const downloadPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("customerId", "displayName companyName email billingAddress")
    .populate("referenceInvoiceId", "invoiceNumber")
    .populate("lineItems.itemId", "name")
    .lean();

  if (!credit) throw new NotFoundError("Credit note");

  const org = await Organization.findById(credit.organizationId).lean();
  if (!org) throw new NotFoundError("Organization");

  const customer = credit.customerId as any;
  const customerName =
    (typeof customer === "object" && (customer?.displayName || customer?.companyName)) ||
    "Customer";

  const customerAddress = [
    customer?.billingAddress?.street,
    customer?.billingAddress?.city,
    customer?.billingAddress?.state,
    customer?.billingAddress?.zip,
    customer?.billingAddress?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const pdfBuffer = await generateCreditNotePdf({
    orgName: org.name,
    orgAddress: org.address as any,
    orgTaxId: (org as any).taxId,
    customerName,
    customerAddress,
    customerEmail: customer?.email,
    creditNoteNumber: credit.creditNoteNumber,
    creditNoteDate: (credit.creditNoteDate as any)?.toISOString
      ? (credit.creditNoteDate as any).toISOString()
      : String(credit.creditNoteDate),
    referenceNumber: (credit.referenceInvoiceId as any)?.invoiceNumber || credit.referenceNumber || "-",
    items: (credit.lineItems || [])
      .filter((li: any) => !li.isHeader)
      .map((li: any) => ({
        name: (typeof li.itemId === "object" && li.itemId?.name) || li.name || "Item",
        description: li.description,
        quantity: Number(li.quantity || 0),
        rate: Number(li.rate || 0),
        amount: Number(li.amount || 0),
      })),
    subTotal: Number(credit.subTotal || 0),
    discountAmount: Number(credit.discountAmount || 0),
    taxAmount: Number(credit.taxAmount || 0),
    tdsAmount: Number((credit as any).tdsAmount || 0),
    tcsAmount: Number((credit as any).tcsAmount || 0),
    total: Number(credit.total || 0),
    creditsRemaining: Number(credit.balanceAmount || 0),
    customerNotes: (credit as any).customerNotes,
    termsAndConditions: credit.termsAndConditions,
    currencySymbol: org.baseCurrency === "INR" ? "₹" : org.baseCurrency,
  });

  const isPreview = req.query.preview === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isPreview ? "inline" : "attachment"}; filename="Credit-Note-${credit.creditNoteNumber}.pdf"`,
  );
  res.send(pdfBuffer);
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  await reserveIdempotencyKey({ req, organization_id: oid, scope: "credit-notes:create" });

  if (!req.body.customerId) throw new ValidationError("Customer is required");
  if (!req.body.creditNoteDate) throw new ValidationError("Credit note date is required");

  const discountLevel: "transaction" | "line_item" =
    req.body.discountLevel === "line_item" ? "line_item" : "transaction";
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const discountPercent =
    discountLevel === "transaction" ? Math.max(0, toNum(req.body.discountPercent)) : 0;
  const taxType = req.body.taxType || "none";
  const tdsAmount = taxType === "TDS" ? Math.max(0, toNum(req.body.tdsAmount)) : 0;
  const tcsAmount = taxType === "TCS" ? Math.max(0, toNum(req.body.tcsAmount)) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const totals = computeTotals({
    lineItems,
    discountLevel,
    discountPercent,
    tdsAmount,
    tcsAmount,
    adjustmentAmount,
  });

  if (totals.total < 0) {
    throw new ValidationError("Total cannot be negative");
  }

  const requestedStatus = req.body.status || "OPEN";
  if (!["DRAFT", "OPEN"].includes(requestedStatus)) {
    throw new ValidationError("New credit note status must be DRAFT or OPEN");
  }

  const creditNoteNumber = req.body.creditNoteNumber || (await nextCreditNoteNumber(oid));

  const credit = new CreditNote({
    organizationId: oid,
    customerId: req.body.customerId,
    creditNoteNumber,
    creditNoteDate: req.body.creditNoteDate,
    referenceNumber: req.body.referenceNumber || "",
    reason: req.body.reason || "",
    referenceInvoiceId: req.body.referenceInvoiceId || null,
    referenceOrderNumber: String(req.body.referenceOrderNumber || "").trim(),
    accountsReceivableId: req.body.accountsReceivableId || null,
    salesPersonId: req.body.salesPersonId || null,
    subject: req.body.subject || "",
    lineItems,
    discountLevel,
    discountPercent,
    discountAmount: totals.discountAmount,
    taxType,
    tdsId: taxType === "TDS" ? req.body.tdsId || null : null,
    tcsId: taxType === "TCS" ? req.body.tcsId || null : null,
    tdsAmount,
    tcsAmount,
    taxAmount: totals.taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    subTotal: totals.subTotal,
    total: totals.total,
    appliedAmount: 0,
    refundedAmount: 0,
    balanceAmount: totals.total,
    customerNotes: req.body.customerNotes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: requestedStatus,
    comments: [
      {
        author: "System",
        text: `Credit note created for ${totals.total.toLocaleString("en-IN")}`,
        time: new Date(),
        isSystem: true,
      },
    ],
  });

  attachUser(credit, req);
  await credit.save();

  if (isPostedCreditStatus(requestedStatus)) {
    await postCreditNoteLedger(credit, req);
  }

  res.status(201).json({ success: true, data: credit });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `credit-notes:update:${req.params.id}`,
  });

  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!credit) throw new NotFoundError("Credit note");
  if (credit.status === "VOID") throw new ValidationError("Cannot edit a void credit note");

  const prevStatus = String(credit.status || "");

  if (toNum(credit.appliedAmount) > 0 && hasFinancialEdits(req.body)) {
    throw new ValidationError("Cannot edit financial fields after applying credit");
  }

  const discountLevel: "transaction" | "line_item" =
    req.body.discountLevel || credit.discountLevel;
  const lineItems = req.body.lineItems
    ? calcLineItems(req.body.lineItems, discountLevel)
    : credit.lineItems;
  const discountPercent =
    discountLevel === "transaction"
      ? Math.max(0, toNum(req.body.discountPercent ?? credit.discountPercent))
      : 0;
  const taxType = req.body.taxType ?? (credit as any).taxType ?? "none";
  const tdsAmount =
    taxType === "TDS"
      ? Math.max(0, toNum(req.body.tdsAmount ?? (credit as any).tdsAmount))
      : 0;
  const tcsAmount =
    taxType === "TCS"
      ? Math.max(0, toNum(req.body.tcsAmount ?? (credit as any).tcsAmount))
      : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount ?? credit.adjustmentAmount);
  const totals = computeTotals({
    lineItems,
    discountLevel,
    discountPercent,
    tdsAmount,
    tcsAmount,
    adjustmentAmount,
  });

  if (totals.total < 0) {
    throw new ValidationError("Total cannot be negative");
  }

  const newBalance = round2(totals.total - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  if (newBalance < 0) {
    throw new ValidationError("Total cannot be less than already applied amount");
  }

  Object.assign(credit, req.body, {
    lineItems,
    discountLevel,
    discountPercent,
    discountAmount: totals.discountAmount,
    taxType,
    tdsId: taxType === "TDS" ? (req.body.tdsId ?? (credit as any).tdsId ?? null) : null,
    tcsId: taxType === "TCS" ? (req.body.tcsId ?? (credit as any).tcsId ?? null) : null,
    tdsAmount,
    tcsAmount,
    taxAmount: totals.taxAmount,
    adjustmentAmount,
    subTotal: totals.subTotal,
    total: totals.total,
    balanceAmount: newBalance,
  });

  const previousPosted = isPostedCreditStatus(String(prevStatus));

  if (credit.status !== "DRAFT") {
    credit.status = deriveStatus(toNum(credit.appliedAmount), totals.total);
  }

  attachUser(credit, req);
  await credit.save();

  const nextPosted = isPostedCreditStatus(String(credit.status || ""));

  if (previousPosted && !nextPosted) {
    await reverseCreditNoteLedger(credit, req);
  } else if (!previousPosted && nextPosted) {
    await postCreditNoteLedger(credit, req);
  } else if (previousPosted && nextPosted) {
    if (hasFinancialEdits(req.body)) {
      await reverseCreditNoteLedger(credit, req);
      await postCreditNoteLedger(credit, req);
    }
  }

  res.json({ success: true, data: credit });
});

export const applyToInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const invoiceId = String(req.body.invoiceId || "").trim();
  if (!invoiceId) throw new ValidationError("invoiceId is required");

  const amountInput = toNum(req.body.amount);
  if (amountInput <= 0) throw new ValidationError("Amount must be greater than zero");

  const result = await runOptionalTransaction(async (session) => {
    await reserveIdempotencyKey({
      req,
      organization_id: oid,
      scope: `credit-notes:apply:${req.params.id}`,
      session,
    });

    const credit = await CreditNote.findOne(
      { _id: req.params.id, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!credit) throw new NotFoundError("Credit note");
    if (credit.status === "VOID") throw new ValidationError("Cannot apply a void credit note");
    if (credit.status === "CLOSED") throw new ValidationError("Credit note is already fully applied");

    const invoice = await Invoice.findOne(
      { _id: invoiceId, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!invoice) throw new NotFoundError("Invoice");

    if (String(invoice.customerId) !== String(credit.customerId)) {
      throw new ValidationError("Credit note can only be applied to invoices of the same customer");
    }

    if (["Draft", "Void"].includes(String(invoice.status))) {
      throw new ValidationError("Cannot apply credit note to a draft or void invoice");
    }

    const invoiceBalance = round2(toNum(invoice.balanceDue));
    const creditBalance = round2(toNum(credit.balanceAmount));

    if (invoiceBalance <= 0) throw new ValidationError("Invoice has no outstanding balance");
    if (creditBalance <= 0) throw new ValidationError("Credit note has no available balance");

    const amount = round2(amountInput);
    const maxAllowed = round2(Math.min(invoiceBalance, creditBalance));
    if (amount > maxAllowed) {
      throw new ValidationError(`Amount exceeds available limit (${maxAllowed.toFixed(2)})`);
    }

    credit.appliedAmount = round2(toNum(credit.appliedAmount) + amount);
    credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount));
    credit.status = deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
    credit.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Applied ${amount.toLocaleString("en-IN")} to invoice ${invoice.invoiceNumber}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(credit, req);

    const currentBalance = round2(toNum(invoice.balanceDue));
    invoice.balanceDue = round2(Math.max(0, currentBalance - amount));
    invoice.status = invoiceStatusAfterCredit({
      balanceDue: invoice.balanceDue,
      total: round2(toNum(invoice.total)),
      dueDate: invoice.dueDate || null,
      previousStatus: String(invoice.status || "Sent"),
    });
    invoice.paymentReceived = invoice.balanceDue <= 0;
    if (invoice.paymentReceived && !invoice.paidAt) {
      invoice.paidAt = new Date();
    }

    attachUser(invoice, req);

    const existingApplication = await CreditNoteApplication.findOne(
      {
        organizationId: oid,
        creditNoteId: credit._id,
        invoiceId: invoice._id,
        isDeleted: false,
      },
      null,
      session ? { session } : undefined,
    );

    if (existingApplication) {
      existingApplication.amount = round2(toNum(existingApplication.amount) + amount);
      existingApplication.appliedDate = new Date();
      existingApplication.notes = req.body.notes || existingApplication.notes || "";
      attachUser(existingApplication, req);
      if (session) await existingApplication.save({ session });
      else await existingApplication.save();
    } else {
      const application = new CreditNoteApplication({
        organizationId: oid,
        creditNoteId: credit._id,
        invoiceId: invoice._id,
        amount,
        appliedDate: new Date(),
        notes: req.body.notes || "",
      });
      attachUser(application, req);
      if (session) await application.save({ session });
      else await application.save();
    }

    if (session) {
      await invoice.save({ session });
      await credit.save({ session });
    } else {
      await invoice.save();
      await credit.save();
    }

    return { credit, invoice, amount };
  });

  await recomputeContactOutstanding({
    organizationId: (result.invoice as any).organizationId,
    contactId: (result.invoice as any).customerId,
    req,
  });

  res.json({ success: true, data: result });
});

export const unapplyFromInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const invoiceId = String(req.body.invoiceId || "").trim();
  if (!invoiceId) throw new ValidationError("invoiceId is required");

  const result = await runOptionalTransaction(async (session) => {
    await reserveIdempotencyKey({
      req,
      organization_id: oid,
      scope: `credit-notes:unapply:${req.params.id}`,
      session,
    });

    const credit = await CreditNote.findOne(
      { _id: req.params.id, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!credit) throw new NotFoundError("Credit note");
    if (credit.status === "VOID") throw new ValidationError("Cannot unapply a void credit note");

    const invoice = await Invoice.findOne(
      { _id: invoiceId, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "Void") throw new ValidationError("Cannot unapply credit from a void invoice");

    const application = await CreditNoteApplication.findOne(
      {
        organizationId: oid,
        creditNoteId: credit._id,
        invoiceId: invoice._id,
        isDeleted: false,
      },
      null,
      session ? { session } : undefined,
    );

    if (!application) {
      throw new ValidationError("No applied credit found for this invoice");
    }

    const requestedAmount = toNum(req.body.amount, toNum(application.amount));
    if (requestedAmount <= 0) throw new ValidationError("Amount must be greater than zero");

    const amount = round2(Math.min(requestedAmount, toNum(application.amount)));
    if (amount <= 0) throw new ValidationError("Invalid unapply amount");

    application.amount = round2(toNum(application.amount) - amount);
    application.appliedDate = new Date();
    attachUser(application, req);

    if (application.amount <= 0) {
      application.isDeleted = true;
      application.deletedAt = new Date();
    }

    credit.appliedAmount = round2(Math.max(0, toNum(credit.appliedAmount) - amount));
    credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount));
    credit.status =
      toNum(credit.appliedAmount) === 0
        ? "OPEN"
        : deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
    credit.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Unapplied ${amount.toLocaleString("en-IN")} from invoice ${invoice.invoiceNumber}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(credit, req);

    invoice.balanceDue = round2(Math.min(toNum(invoice.total), toNum(invoice.balanceDue) + amount));
    invoice.status = invoiceStatusAfterCredit({
      balanceDue: invoice.balanceDue,
      total: round2(toNum(invoice.total)),
      dueDate: invoice.dueDate || null,
      previousStatus: String(invoice.status || "Sent"),
    });
    invoice.paymentReceived = invoice.balanceDue <= 0;
    if (!invoice.paymentReceived) {
      invoice.paidAt = null;
    }
    attachUser(invoice, req);

    if (session) {
      await application.save({ session });
      await invoice.save({ session });
      await credit.save({ session });
    } else {
      await application.save();
      await invoice.save();
      await credit.save();
    }

    return { credit, invoice, amount };
  });

  await recomputeContactOutstanding({
    organizationId: (result.invoice as any).organizationId,
    contactId: (result.invoice as any).customerId,
    req,
  });

  res.json({ success: true, data: result });
});

export const voidCreditNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `credit-notes:void:${req.params.id}`,
  });

  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Credit note");
  if (credit.status === "VOID") throw new ValidationError("Credit note is already void");
  if (toNum(credit.appliedAmount) > 0) {
    throw new ValidationError("Cannot void credit note after it has been applied");
  }
  if (toNum((credit as any).refundedAmount) > 0) {
    throw new ValidationError("Cannot void credit note after refund is recorded");
  }

  const wasPosted = isPostedCreditStatus(String(credit.status || ""));

  credit.status = "VOID";
  credit.balanceAmount = 0;
  credit.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Credit note voided. Reason: ${req.body.reason || "No reason provided"}`,
    time: new Date(),
    isSystem: true,
  });
  attachUser(credit, req);
  await credit.save();

  if (wasPosted) {
    await reverseCreditNoteLedger(credit, req);
  }

  res.json({ success: true, data: credit });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `credit-notes:remove:${req.params.id}`,
  });

  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!credit) throw new NotFoundError("Credit note");
  if (toNum(credit.appliedAmount) > 0) {
    throw new ValidationError("Cannot delete a credit note that has been applied");
  }
  if (toNum((credit as any).refundedAmount) > 0) {
    throw new ValidationError("Cannot delete a credit note after refund is recorded");
  }
  if (!["DRAFT", "OPEN"].includes(String(credit.status))) {
    throw new ValidationError("Only DRAFT or OPEN credit notes can be deleted");
  }

  if (isPostedCreditStatus(String(credit.status || ""))) {
    await reverseCreditNoteLedger(credit, req);
  }

  credit.isDeleted = true;
  credit.deletedAt = new Date();
  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, message: "Credit note deleted successfully" });
});

export const cloneCreditNote = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const source = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  }).lean();
  if (!source) throw new NotFoundError("Credit note");

  const creditNoteNumber = await nextCreditNoteNumber((source as any).organizationId);
  const { _id, __v, ...cloneData } = source as any;

  const credit = new CreditNote({
    ...cloneData,
    creditNoteNumber,
    creditNoteDate: new Date(),
    status: "OPEN",
    appliedAmount: 0,
    refundedAmount: 0,
    balanceAmount: cloneData.total || 0,
    comments: [
      {
        author: "System",
        text: `Credit note cloned from ${source.creditNoteNumber}`,
        time: new Date(),
        isSystem: true,
      },
    ],
  });

  attachUser(credit, req);
  await credit.save();

  if (isPostedCreditStatus(String(credit.status || ""))) {
    await postCreditNoteLedger(credit, req);
  }

  res.status(201).json({ success: true, data: credit });
});

export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Credit note");

  const text = String(req.body.text || "").trim();
  if (!text) throw new ValidationError("Comment text is required");

  credit.comments.push({
    author: req.user?.name || req.user?.email || "User",
    text,
    time: new Date(),
    isSystem: false,
  });
  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, data: credit.comments[credit.comments.length - 1] });
});

export const recordRefund = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `credit-notes:refund:${req.params.id}`,
  });

  const credit = await CreditNote.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Credit note");
  if (credit.status === "VOID") throw new ValidationError("Cannot record refund for a void credit note");

  const amount = round2(toNum(req.body.amount));
  if (amount <= 0) throw new ValidationError("Refund amount must be greater than zero");

  const remaining = round2(toNum(credit.total) - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  if (amount > remaining) {
    throw new ValidationError(`Refund amount exceeds available balance (${remaining.toFixed(2)})`);
  }

  (credit as any).refundedAmount = round2(toNum((credit as any).refundedAmount) + amount);
  credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  credit.status = credit.balanceAmount <= 0 ? "CLOSED" : deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
  credit.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Refund recorded: ${amount.toLocaleString("en-IN")}`,
    time: new Date(),
    isSystem: true,
  });

  attachUser(credit, req);
  await credit.save();
  res.json({ success: true, data: credit });
});
