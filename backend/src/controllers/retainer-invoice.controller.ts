import mongoose, { ClientSession, Types } from "mongoose";
import { Response } from "express";
import Contact from "../models/contact.model";
import { Counter } from "../models/counter.model";
import GlEntry from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import RetainerInvoice, { IRetainerInvoice } from "../models/retainer-invoice.model";
import { attachUser } from "../plugins";
import { recomputeContactOutstanding } from "../services/accounting-sync.service";
import { findAccountIdByName, postVoucher, reverseVoucher } from "../services/gl-posting.service";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { reserveIdempotencyKey } from "../utils/idempotency";

function orgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deriveInvoiceStatus(total: number, amountPaid: number, dueDate?: Date | null): "Sent" | "Overdue" | "Partially Paid" | "Paid" {
  const paid = round2(Math.max(0, amountPaid));
  const due = round2(Math.max(0, total - paid));
  if (due <= 0) return "Paid";
  if (paid > 0) return "Partially Paid";
  if (dueDate && new Date(dueDate).getTime() < Date.now()) return "Overdue";
  return "Sent";
}

function scalarId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value);
}

function retainerVoucherPrefix(retainer: IRetainerInvoice): string {
  return `retainer-invoice:${String(retainer._id)}`;
}

function retainerVoucherId(retainer: IRetainerInvoice, event: string, key?: string): string {
  return `${retainerVoucherPrefix(retainer)}:${event}${key ? `:${key}` : ""}`;
}

function recomputeStatus(retainer: IRetainerInvoice): void {
  const total = round2(Math.max(0, toNum(retainer.total_amount)));
  const received = round2(Math.max(0, toNum(retainer.amount_received)));
  const applied = round2(Math.max(0, toNum(retainer.amount_applied)));
  const refunded = round2(Math.max(0, toNum(retainer.amount_refunded)));

  if (applied > received + 0.009) {
    throw new ValidationError("Invalid retainer invoice: applied amount exceeds received amount");
  }

  const refundableCapacity = round2(Math.max(0, received - applied));
  if (refunded > refundableCapacity + 0.009) {
    throw new ValidationError("Invalid retainer invoice: refunded amount exceeds unapplied received amount");
  }

  const unapplied = round2(Math.max(0, received - applied - refunded));
  const due = round2(Math.max(0, total - received));

  retainer.total_amount = total;
  retainer.amount_received = received;
  retainer.amount_applied = applied;
  retainer.amount_refunded = refunded;
  retainer.amount_unapplied = unapplied;
  retainer.balance_due = due;

  if (retainer.status === "Void") {
    retainer.amount_unapplied = 0;
    retainer.balance_due = 0;
    return;
  }

  if (received <= 0) {
    retainer.status = retainer.sent_at ? "Sent" : "Draft";
    return;
  }

  if (refunded > 0) {
    retainer.status = refunded >= refundableCapacity - 0.009 ? "Refunded" : "Partially Refunded";
    return;
  }

  if (applied > 0) {
    retainer.status = unapplied <= 0.009 ? "Applied" : "Partially Applied";
    return;
  }

  retainer.status = due <= 0.009 ? "Paid" : "Partially Paid";
}

function parseDate(input: unknown, field: string, required = false): Date | null {
  if (input === undefined || input === null || input === "") {
    if (required) throw new ValidationError(`${field} is required`);
    return null;
  }

  const date = new Date(String(input));
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return date;
}

async function resolveRetainerAccounts(retainer: IRetainerInvoice) {
  const organizationId = retainer.organization_id;

  const bankAccountId =
    retainer.deposited_to_account ||
    (await findAccountIdByName({
      organizationId,
      names: ["Bank", "Cash", "Cash In Hand", "Undeposited Funds"],
      rootType: "Asset",
    }));

  const customerId = scalarId(retainer.customer_id);
  const customer = customerId
    ? await Contact.findOne({ _id: customerId, organizationId })
        .select("accountsReceivableId")
        .lean()
    : null;

  const accountsReceivableId =
    customer?.accountsReceivableId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
      rootType: "Asset",
      accountType: "Accounts Receivable",
    }));

  const customerAdvanceId = await findAccountIdByName({
    organizationId,
    names: ["Customer Advances", "Advances from Customers", "Unearned Revenue"],
    rootType: "Liability",
    accountType: "Other Current Liability",
  });

  return { bankAccountId, accountsReceivableId, customerAdvanceId };
}

async function postRetainerEvent(params: {
  retainer: IRetainerInvoice;
  req: AuthenticatedRequest;
  event: "payment" | "apply" | "unapply" | "refund";
  amount: number;
  postingDate?: Date;
  eventKey?: string;
}): Promise<void> {
  const { retainer, req, event, amount, postingDate, eventKey } = params;
  const movement = round2(Math.max(0, toNum(amount)));
  if (movement <= 0) return;

  const { bankAccountId, accountsReceivableId, customerAdvanceId } =
    await resolveRetainerAccounts(retainer);

  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Customer";
    contactId?: any;
  }> = [];

  if (event === "payment") {
    lines.push(
      {
        accountId: bankAccountId,
        debit: movement,
        description: `Retainer payment ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
      {
        accountId: customerAdvanceId,
        credit: movement,
        description: `Customer advance ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
    );
  }

  if (event === "apply") {
    lines.push(
      {
        accountId: customerAdvanceId,
        debit: movement,
        description: `Apply retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
      {
        accountId: accountsReceivableId,
        credit: movement,
        description: `Apply retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
    );
  }

  if (event === "unapply") {
    lines.push(
      {
        accountId: accountsReceivableId,
        debit: movement,
        description: `Unapply retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
      {
        accountId: customerAdvanceId,
        credit: movement,
        description: `Unapply retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
    );
  }

  if (event === "refund") {
    lines.push(
      {
        accountId: customerAdvanceId,
        debit: movement,
        description: `Refund retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
      {
        accountId: bankAccountId,
        credit: movement,
        description: `Refund retainer ${retainer.retainer_number}`,
        contactType: "Customer",
        contactId: retainer.customer_id,
      },
    );
  }

  await postVoucher({
    organizationId: retainer.organization_id,
    voucherType: "RetainerInvoice",
    voucherId: retainerVoucherId(retainer, event, eventKey),
    voucherNo: retainer.retainer_number,
    postingDate: postingDate || new Date(),
    lines,
    description: `Retainer invoice ${event} ${retainer.retainer_number}`,
    req,
  });
}

async function reverseAllRetainerVouchers(retainer: IRetainerInvoice, req: AuthenticatedRequest) {
  const prefix = retainerVoucherPrefix(retainer);
  const rows = await GlEntry.find({
    organizationId: retainer.organization_id,
    voucherType: "RetainerInvoice",
    voucherId: { $regex: `^${prefix}:` },
    isReversal: false,
  })
    .select("voucherId")
    .lean();

  const voucherIds = Array.from(new Set(rows.map((row: any) => String(row.voucherId || "")).filter(Boolean)));
  for (const voucherId of voucherIds) {
    await reverseVoucher({
      organizationId: retainer.organization_id,
      voucherType: "RetainerInvoice",
      voucherId,
      reversalVoucherNo: `REV-${retainer.retainer_number}`,
      postingDate: new Date(),
      description: `Retainer invoice reversal ${retainer.retainer_number}`,
      req,
    });
  }
}

async function runRequiredTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
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

    if (!txNotSupported) throw error;
    throw new ValidationError(
      "This accounting operation requires MongoDB transactions. Configure a replica set and retry.",
    );
  } finally {
    await session.endSession();
  }
}

async function nextRetainerNumber(organization_id: Types.ObjectId): Promise<string> {
  const counterKey = `retainer_invoice:${String(organization_id)}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();

  const seq = Number(counter?.seq || 1);
  return String(seq);
}

function assertNoFinancialActivity(retainer: IRetainerInvoice, action: string): void {
  if (toNum(retainer.amount_received) > 0 || toNum(retainer.amount_applied) > 0 || toNum(retainer.amount_refunded) > 0) {
    throw new ValidationError(`Cannot ${action} a retainer invoice with payment/apply/refund activity`);
  }
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const retainer_number = await nextRetainerNumber(orgId(req));
  res.json({ success: true, data: { retainer_number } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    customer_id,
    customerId,
    status,
    search,
    page = 1,
    limit = 25,
    sortBy = "retainer_date",
    sortOrder = "desc",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {
    organization_id: orgId(req),
    is_deleted: false,
  };

  if (customer_id || customerId) filter.customer_id = customer_id || customerId;
  if (status && status !== "All") filter.status = status;
  if (search) {
    filter.$or = [
      { retainer_number: { $regex: search, $options: "i" } },
      { retainer_id: { $regex: search, $options: "i" } },
      { reference_number: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(200, Number(limit || 25)));

  const total = await RetainerInvoice.countDocuments(filter);
  const data = await RetainerInvoice.find(filter)
    .populate("customer_id", "displayName companyName")
    .sort({ [String(sortBy)]: sortOrder === "asc" ? 1 : -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const retainer = await RetainerInvoice.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  })
    .populate("customer_id", "displayName companyName email billingAddress")
    .populate("applications.invoice_id", "invoiceNumber invoiceDate total balanceDue status");

  if (!retainer) throw new NotFoundError("Retainer invoice");

  res.json({ success: true, data: retainer });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization_id = orgId(req);
  const customer_id = String(req.body.customer_id || req.body.customerId || "");
  if (!customer_id) throw new ValidationError("customer_id is required");

  const total_amount = round2(toNum(req.body.total_amount ?? req.body.totalAmount));
  if (total_amount <= 0) throw new ValidationError("total_amount must be greater than zero");

  const requestedNumber = String(req.body.retainer_number || req.body.retainerNumber || "").trim();
  const retainer_number = requestedNumber || (await nextRetainerNumber(organization_id));
  const retainer_id = String(req.body.retainer_id || req.body.retainerId || `RI-${retainer_number.padStart(5, "0")}`);

  const retainer_date = parseDate(req.body.retainer_date || req.body.retainerDate || new Date(), "retainer_date", true);
  const due_date = parseDate(req.body.due_date || req.body.dueDate, "due_date");

  const initialStatus = String(req.body.status || "Draft");
  if (!["Draft", "Sent"].includes(initialStatus)) {
    throw new ValidationError("status must be Draft or Sent while creating retainer invoice");
  }

  const retainer = new RetainerInvoice({
    organization_id,
    retainer_id,
    retainer_number,
    customer_id,
    retainer_date,
    due_date,
    reference_number: String(req.body.reference_number || req.body.referenceNumber || ""),
    description: String(req.body.description || ""),
    payment_mode: String(req.body.payment_mode || req.body.paymentMode || "Cash"),
    deposited_to_account: req.body.deposited_to_account || req.body.depositedToAccount || null,
    notes: String(req.body.notes || ""),
    total_amount,
    amount_received: 0,
    amount_applied: 0,
    amount_refunded: 0,
    amount_unapplied: 0,
    balance_due: total_amount,
    status: initialStatus,
    sent_at: initialStatus === "Sent" ? new Date() : null,
    applications: [],
    audit_log: [
      {
        action: "CREATE",
        details: `Retainer invoice created for ${total_amount.toLocaleString("en-IN")}`,
        amount: total_amount,
        at: new Date(),
        by: req.user?.email || req.user?.name || "System",
      },
    ],
    is_deleted: false,
    deleted_at: null,
  });

  recomputeStatus(retainer);
  attachUser(retainer, req);
  await retainer.save();

  res.status(201).json({ success: true, data: retainer });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `retainer-invoices:update:${req.params.id}`,
  });

  const retainer = await RetainerInvoice.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  });
  if (!retainer) throw new NotFoundError("Retainer invoice");
  if (retainer.status === "Void") throw new ValidationError("Cannot edit a void retainer invoice");

  if (req.body.customer_id || req.body.customerId) {
    const nextCustomerId = String(req.body.customer_id || req.body.customerId || "");
    if (!nextCustomerId) throw new ValidationError("customer_id is invalid");
    if (String(retainer.customer_id) !== nextCustomerId) {
      if (toNum(retainer.amount_received) > 0 || toNum(retainer.amount_applied) > 0 || toNum(retainer.amount_refunded) > 0) {
        throw new ValidationError("Cannot change customer after financial activity");
      }
      retainer.customer_id = new Types.ObjectId(nextCustomerId);
    }
  }

  if (req.body.total_amount !== undefined || req.body.totalAmount !== undefined) {
    const nextTotal = round2(toNum(req.body.total_amount ?? req.body.totalAmount));
    if (nextTotal <= 0) throw new ValidationError("total_amount must be greater than zero");
    if (nextTotal < round2(toNum(retainer.amount_received))) {
      throw new ValidationError("total_amount cannot be less than amount_received");
    }
    retainer.total_amount = nextTotal;
  }

  if (req.body.retainer_date || req.body.retainerDate) {
    retainer.retainer_date = parseDate(req.body.retainer_date || req.body.retainerDate, "retainer_date", true) as Date;
  }

  if (req.body.due_date !== undefined || req.body.dueDate !== undefined) {
    retainer.due_date = parseDate(req.body.due_date ?? req.body.dueDate, "due_date");
  }

  if (req.body.reference_number !== undefined || req.body.referenceNumber !== undefined) {
    retainer.reference_number = String(req.body.reference_number || req.body.referenceNumber || "");
  }

  if (req.body.description !== undefined) {
    retainer.description = String(req.body.description || "");
  }

  if (req.body.notes !== undefined) {
    retainer.notes = String(req.body.notes || "");
  }

  if (req.body.payment_mode !== undefined || req.body.paymentMode !== undefined) {
    retainer.payment_mode = String(req.body.payment_mode || req.body.paymentMode || retainer.payment_mode || "Cash");
  }

  if (req.body.deposited_to_account !== undefined || req.body.depositedToAccount !== undefined) {
    retainer.deposited_to_account = req.body.deposited_to_account || req.body.depositedToAccount || null;
  }

  retainer.audit_log.push({
    action: "UPDATE",
    details: "Retainer invoice details updated",
    at: new Date(),
    by: req.user?.email || req.user?.name || "System",
  });

  recomputeStatus(retainer);
  attachUser(retainer, req);
  await retainer.save();

  res.json({ success: true, data: retainer });
});

export const send = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `retainer-invoices:send:${req.params.id}`,
  });

  const retainer = await RetainerInvoice.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  });
  if (!retainer) throw new NotFoundError("Retainer invoice");
  if (retainer.status === "Void") throw new ValidationError("Cannot send a void retainer invoice");

  if (!retainer.sent_at) {
    retainer.sent_at = new Date();
  }

  retainer.audit_log.push({
    action: "SEND",
    details: "Retainer invoice marked as sent",
    at: new Date(),
    by: req.user?.email || req.user?.name || "System",
  });

  recomputeStatus(retainer);
  attachUser(retainer, req);
  await retainer.save();

  res.json({ success: true, data: retainer });
});

export const recordPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `retainer-invoices:record-payment:${req.params.id}`,
      session,
    });

    const query = RetainerInvoice.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    query.session(session);
    const retainer = await query;
    if (!retainer) throw new NotFoundError("Retainer invoice");
    if (retainer.status === "Void") throw new ValidationError("Cannot record payment on a void retainer invoice");

    const amount = round2(toNum(req.body.amount));
    if (amount <= 0) throw new ValidationError("amount must be greater than zero");
    if (amount > round2(toNum(retainer.balance_due))) {
      throw new ValidationError("Payment amount exceeds retainer balance due");
    }

    const paymentDate = parseDate(req.body.payment_date || req.body.paymentDate || new Date(), "payment_date", true) as Date;

    retainer.amount_received = round2(toNum(retainer.amount_received) + amount);

    if (req.body.payment_mode !== undefined || req.body.paymentMode !== undefined) {
      retainer.payment_mode = String(req.body.payment_mode || req.body.paymentMode || retainer.payment_mode || "Cash");
    }

    if (req.body.deposited_to_account !== undefined || req.body.depositedToAccount !== undefined) {
      retainer.deposited_to_account = req.body.deposited_to_account || req.body.depositedToAccount || retainer.deposited_to_account;
    }

    retainer.audit_log.push({
      action: "RECORD_PAYMENT",
      details: `Payment recorded for ${amount.toLocaleString("en-IN")}`,
      amount,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    recomputeStatus(retainer);
    attachUser(retainer, req);
    await retainer.save({ session });

    return { retainer, amount, paymentDate };
  });

  await postRetainerEvent({
    retainer: result.retainer,
    req,
    event: "payment",
    amount: result.amount,
    postingDate: result.paymentDate,
    eventKey: String((result.retainer as any).audit_log?.length || Date.now()),
  });

  await recomputeContactOutstanding({
    organizationId: (result.retainer as any).organization_id,
    contactId: (result.retainer as any).customer_id,
    req,
  });

  res.json({ success: true, data: result.retainer });
});

export const applyToInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `retainer-invoices:apply:${req.params.id}`,
      session,
    });

    const retainerQuery = RetainerInvoice.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    retainerQuery.session(session);
    const retainer = await retainerQuery;
    if (!retainer) throw new NotFoundError("Retainer invoice");
    if (retainer.status === "Void") throw new ValidationError("Cannot apply a void retainer invoice");

    const invoice_id = String(req.body.invoice_id || req.body.invoiceId || "");
    if (!invoice_id) throw new ValidationError("invoice_id is required");

    const amount = round2(toNum(req.body.applied_amount ?? req.body.appliedAmount ?? req.body.amount));
    if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");

    recomputeStatus(retainer);
    if (amount > round2(toNum(retainer.amount_unapplied))) {
      throw new ValidationError("applied_amount exceeds available unapplied retainer balance");
    }

    const invoiceQuery = Invoice.findOne({
      _id: invoice_id,
      organizationId: retainer.organization_id,
      customerId: retainer.customer_id,
      isDeleted: false,
    });
    invoiceQuery.session(session);
    const invoice = await invoiceQuery;
    if (!invoice) throw new NotFoundError("Invoice");
    if (["Paid", "Void"].includes(invoice.status)) {
      throw new ValidationError("Cannot apply retainer to a paid or void invoice");
    }

    const invoiceBalance = round2(toNum(invoice.balanceDue));
    if (amount > invoiceBalance) throw new ValidationError("applied_amount exceeds invoice balance due");

    const currentPaid = round2(Math.max(0, toNum(invoice.total) - toNum(invoice.balanceDue)));
    const nextPaid = round2(currentPaid + amount);
    invoice.balanceDue = round2(Math.max(0, toNum(invoice.total) - nextPaid));
    invoice.paymentReceived = invoice.balanceDue <= 0;
    invoice.status = deriveInvoiceStatus(toNum(invoice.total), nextPaid, invoice.dueDate);
    if (invoice.paymentReceived && !invoice.paidAt) invoice.paidAt = new Date();

    attachUser(invoice as any, req);
    await invoice.save({ session });

    const appIndex = retainer.applications.findIndex(
      (entry) => String(entry.invoice_id) === String(invoice._id),
    );
    if (appIndex >= 0) {
      retainer.applications[appIndex].applied_amount =
        round2(toNum(retainer.applications[appIndex].applied_amount) + amount);
      retainer.applications[appIndex].applied_date = new Date();
    } else {
      retainer.applications.push({
        invoice_id: invoice._id as any,
        applied_amount: amount,
        applied_date: new Date(),
      });
    }

    retainer.amount_applied = round2(toNum(retainer.amount_applied) + amount);
    retainer.audit_log.push({
      action: "APPLY_TO_INVOICE",
      details: `Applied ${amount.toLocaleString("en-IN")} to invoice ${invoice.invoiceNumber}`,
      amount,
      invoice_id: invoice._id,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    recomputeStatus(retainer);
    attachUser(retainer, req);
    await retainer.save({ session });

    return { retainer, amount };
  });

  await postRetainerEvent({
    retainer: result.retainer,
    req,
    event: "apply",
    amount: result.amount,
    eventKey: String((result.retainer as any).audit_log?.length || Date.now()),
  });

  await recomputeContactOutstanding({
    organizationId: (result.retainer as any).organization_id,
    contactId: (result.retainer as any).customer_id,
    req,
  });

  res.json({ success: true, data: result.retainer });
});

export const unapplyFromInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `retainer-invoices:unapply:${req.params.id}`,
      session,
    });

    const retainerQuery = RetainerInvoice.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    retainerQuery.session(session);
    const retainer = await retainerQuery;
    if (!retainer) throw new NotFoundError("Retainer invoice");
    if (retainer.status === "Void") throw new ValidationError("Cannot unapply from a void retainer invoice");

    const invoice_id = String(req.body.invoice_id || req.body.invoiceId || "");
    if (!invoice_id) throw new ValidationError("invoice_id is required");

    const appIndex = retainer.applications.findIndex(
      (entry) => String(entry.invoice_id) === invoice_id,
    );
    if (appIndex < 0) {
      throw new ValidationError("No applied balance found for this invoice on retainer invoice");
    }

    const mapped = round2(toNum(retainer.applications[appIndex].applied_amount));
    const amount = round2(toNum(req.body.applied_amount ?? req.body.appliedAmount ?? mapped));
    if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");
    if (amount > mapped) throw new ValidationError("applied_amount exceeds mapped amount");

    const invoiceQuery = Invoice.findOne({
      _id: invoice_id,
      organizationId: retainer.organization_id,
      customerId: retainer.customer_id,
      isDeleted: false,
    });
    invoiceQuery.session(session);
    const invoice = await invoiceQuery;
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "Void") throw new ValidationError("Cannot unapply from a void invoice");

    const currentPaid = round2(Math.max(0, toNum(invoice.total) - toNum(invoice.balanceDue)));
    const nextPaid = round2(Math.max(0, currentPaid - amount));
    invoice.balanceDue = round2(Math.max(0, toNum(invoice.total) - nextPaid));
    invoice.paymentReceived = invoice.balanceDue <= 0;
    invoice.status = deriveInvoiceStatus(toNum(invoice.total), nextPaid, invoice.dueDate);
    if (!invoice.paymentReceived) invoice.paidAt = null;

    attachUser(invoice as any, req);
    await invoice.save({ session });

    const nextMapped = round2(mapped - amount);
    if (nextMapped <= 0) {
      retainer.applications.splice(appIndex, 1);
    } else {
      retainer.applications[appIndex].applied_amount = nextMapped;
      retainer.applications[appIndex].applied_date = new Date();
    }

    retainer.amount_applied = round2(Math.max(0, toNum(retainer.amount_applied) - amount));
    retainer.audit_log.push({
      action: "UNAPPLY_FROM_INVOICE",
      details: `Unapplied ${amount.toLocaleString("en-IN")} from invoice ${invoice.invoiceNumber}`,
      amount,
      invoice_id: invoice._id,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    recomputeStatus(retainer);
    attachUser(retainer, req);
    await retainer.save({ session });

    return { retainer, amount };
  });

  await postRetainerEvent({
    retainer: result.retainer,
    req,
    event: "unapply",
    amount: result.amount,
    eventKey: String((result.retainer as any).audit_log?.length || Date.now()),
  });

  await recomputeContactOutstanding({
    organizationId: (result.retainer as any).organization_id,
    contactId: (result.retainer as any).customer_id,
    req,
  });

  res.json({ success: true, data: result.retainer });
});

export const recordRefund = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `retainer-invoices:refund:${req.params.id}`,
      session,
    });

    const query = RetainerInvoice.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    query.session(session);
    const retainer = await query;
    if (!retainer) throw new NotFoundError("Retainer invoice");
    if (retainer.status === "Void") throw new ValidationError("Cannot refund a void retainer invoice");

    recomputeStatus(retainer);

    const amount = round2(toNum(req.body.amount));
    if (amount <= 0) throw new ValidationError("Refund amount must be greater than zero");
    if (amount > round2(toNum(retainer.amount_unapplied))) {
      throw new ValidationError("Refund amount exceeds unapplied retainer balance");
    }

    const refundDate = parseDate(req.body.refund_date || req.body.refundDate || new Date(), "refund_date", true) as Date;

    if (req.body.deposited_to_account !== undefined || req.body.depositedToAccount !== undefined) {
      retainer.deposited_to_account = req.body.deposited_to_account || req.body.depositedToAccount || retainer.deposited_to_account;
    }

    retainer.amount_refunded = round2(toNum(retainer.amount_refunded) + amount);
    retainer.audit_log.push({
      action: "REFUND",
      details: `Refund recorded for ${amount.toLocaleString("en-IN")}`,
      amount,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    recomputeStatus(retainer);
    attachUser(retainer, req);
    await retainer.save({ session });

    return { retainer, amount, refundDate };
  });

  await postRetainerEvent({
    retainer: result.retainer,
    req,
    event: "refund",
    amount: result.amount,
    postingDate: result.refundDate,
    eventKey: String((result.retainer as any).audit_log?.length || Date.now()),
  });

  await recomputeContactOutstanding({
    organizationId: (result.retainer as any).organization_id,
    contactId: (result.retainer as any).customer_id,
    req,
  });

  res.json({ success: true, data: result.retainer });
});

export const voidRetainerInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `retainer-invoices:void:${req.params.id}`,
      session,
    });

    const query = RetainerInvoice.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    query.session(session);
    const retainer = await query;
    if (!retainer) throw new NotFoundError("Retainer invoice");
    if (retainer.status === "Void") throw new ValidationError("Retainer invoice is already void");

    assertNoFinancialActivity(retainer, "void");

    retainer.status = "Void";
    retainer.amount_unapplied = 0;
    retainer.balance_due = 0;
    retainer.audit_log.push({
      action: "VOID",
      details: `Retainer invoice voided. Reason: ${String(req.body.reason || "No reason provided")}`,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    attachUser(retainer, req);
    await retainer.save({ session });

    return retainer;
  });

  await reverseAllRetainerVouchers(result as any, req);

  res.json({ success: true, data: result });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `retainer-invoices:delete:${req.params.id}`,
  });

  const retainer = await RetainerInvoice.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  });
  if (!retainer) throw new NotFoundError("Retainer invoice");

  assertNoFinancialActivity(retainer, "delete");

  retainer.is_deleted = true;
  retainer.deleted_at = new Date();
  retainer.audit_log.push({
    action: "DELETE",
    details: "Retainer invoice deleted",
    at: new Date(),
    by: req.user?.email || req.user?.name || "System",
  });

  attachUser(retainer, req);
  await retainer.save();

  res.json({ success: true });
});
