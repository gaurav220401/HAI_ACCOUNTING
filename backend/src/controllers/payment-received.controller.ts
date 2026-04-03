import mongoose, { ClientSession, Types } from "mongoose";
import { Response } from "express";
import { Counter } from "../models/counter.model";
import Invoice from "../models/invoice.model";
import PaymentInvoiceMap from "../models/payment-invoice-map.model";
import PaymentReceived, { IPaymentReceived } from "../models/payment-received.model";
import GlEntry from "../models/gl-entry.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { reserveIdempotencyKey } from "../utils/idempotency";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { recomputeContactOutstanding } from "../services/accounting-sync.service";
import { findAccountIdByName, postVoucher, reverseVoucher } from "../services/gl-posting.service";

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

function recomputeExcess(payment: IPaymentReceived): void {
  payment.total_amount_received = round2(Math.max(0, toNum(payment.total_amount_received)));
  payment.amount_used_for_invoices = round2(Math.max(0, toNum(payment.amount_used_for_invoices)));
  payment.amount_refunded = round2(Math.max(0, toNum(payment.amount_refunded)));

  const excess = round2(
    payment.total_amount_received - payment.amount_used_for_invoices - payment.amount_refunded,
  );
  if (excess < -0.009) {
    throw new ValidationError("Invalid payment balance: used/refunded exceeds total amount received");
  }
  payment.amount_in_excess = round2(Math.max(0, excess));
}

function paymentReceivedVoucherPrefix(payment: IPaymentReceived): string {
  return `payment-received:${String(payment._id)}`;
}

function paymentReceivedVoucherId(payment: IPaymentReceived, event: string, key?: string): string {
  return `${paymentReceivedVoucherPrefix(payment)}:${event}${key ? `:${key}` : ""}`;
}

async function resolvePaymentReceivedAccounts(payment: IPaymentReceived) {
  const organizationId = payment.organization_id;

  const bankAccountId =
    payment.deposited_to_account ||
    (await findAccountIdByName({
      organizationId,
      names: ["Bank", "Cash", "Cash In Hand", "Undeposited Funds"],
      rootType: "Asset",
    }));

  const accountsReceivableId = await findAccountIdByName({
    organizationId,
    names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
    rootType: "Asset",
    accountType: "Accounts Receivable",
  });

  const customerAdvanceId = await findAccountIdByName({
    organizationId,
    names: ["Customer Advances", "Advances from Customers", "Unearned Revenue"],
    rootType: "Liability",
    accountType: "Other Current Liability",
  });

  return { bankAccountId, accountsReceivableId, customerAdvanceId };
}

async function postPaymentReceivedEvent(params: {
  payment: IPaymentReceived;
  req: AuthenticatedRequest;
  event: "create" | "apply" | "unapply" | "refund";
  amount?: number;
  eventKey?: string;
}): Promise<void> {
  const { payment, req, event, amount = 0, eventKey } = params;
  if (payment.status !== "PAID") return;

  const total = round2(toNum(payment.total_amount_received));
  const used = round2(toNum(payment.amount_used_for_invoices));
  const excess = round2(toNum(payment.amount_in_excess));
  const movement = round2(toNum(amount));

  const { bankAccountId, accountsReceivableId, customerAdvanceId } =
    await resolvePaymentReceivedAccounts(payment);

  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Customer";
    contactId?: any;
  }> = [];

  if (event === "create") {
    if (total > 0) {
      lines.push({
        accountId: bankAccountId,
        debit: total,
        description: `Payment received ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      });
    }
    if (used > 0) {
      lines.push({
        accountId: accountsReceivableId,
        credit: used,
        description: `Invoice settlement ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      });
    }
    if (excess > 0) {
      lines.push({
        accountId: customerAdvanceId,
        credit: excess,
        description: `Customer advance ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      });
    }
  }

  if (event === "apply" && movement > 0) {
    lines.push(
      {
        accountId: customerAdvanceId,
        debit: movement,
        description: `Apply customer advance ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
      {
        accountId: accountsReceivableId,
        credit: movement,
        description: `Apply customer advance ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
    );
  }

  if (event === "unapply" && movement > 0) {
    lines.push(
      {
        accountId: accountsReceivableId,
        debit: movement,
        description: `Unapply customer advance ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
      {
        accountId: customerAdvanceId,
        credit: movement,
        description: `Unapply customer advance ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
    );
  }

  if (event === "refund" && movement > 0) {
    lines.push(
      {
        accountId: customerAdvanceId,
        debit: movement,
        description: `Refund to customer ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
      {
        accountId: bankAccountId,
        credit: movement,
        description: `Refund to customer ${payment.payment_number}`,
        contactType: "Customer",
        contactId: payment.customer_id,
      },
    );
  }

  if (lines.length === 0) return;

  await postVoucher({
    organizationId: payment.organization_id,
    voucherType: "PaymentReceived",
    voucherId: paymentReceivedVoucherId(payment, event, eventKey),
    voucherNo: payment.payment_number,
    postingDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
    lines,
    description: `Payment received ${event} ${payment.payment_number}`,
    req,
  });
}

async function reverseAllPaymentReceivedVouchers(payment: IPaymentReceived, req: AuthenticatedRequest) {
  const prefix = paymentReceivedVoucherPrefix(payment);
  const rows = await GlEntry.find({
    organizationId: payment.organization_id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^${prefix}:` },
    isReversal: false,
  })
    .select("voucherId")
    .lean();

  const voucherIds = Array.from(new Set(rows.map((row: any) => String(row.voucherId || "")).filter(Boolean)));
  for (const voucherId of voucherIds) {
    await reverseVoucher({
      organizationId: payment.organization_id,
      voucherType: "PaymentReceived",
      voucherId,
      reversalVoucherNo: `REV-${payment.payment_number}`,
      postingDate: new Date(),
      description: `Payment received reversal ${payment.payment_number}`,
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

async function nextPaymentNumber(organization_id: Types.ObjectId): Promise<string> {
  const counterKey = `payment_received:${String(organization_id)}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();

  const seq = Number(counter?.seq || 1);
  return String(seq);
}

type ApplyItem = {
  invoice_id: string;
  applied_amount: number;
};

function parseApplyItems(body: Record<string, unknown>): ApplyItem[] {
  const itemsRaw = (body.invoice_applications || body.applications || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(itemsRaw)) return [];

  const out: ApplyItem[] = itemsRaw.map((item) => ({
    invoice_id: String(item.invoice_id || item.invoiceId || ""),
    applied_amount: toNum(item.applied_amount ?? item.appliedAmount ?? item.amount, 0),
  }));

  return out.filter((i) => i.invoice_id && i.applied_amount > 0);
}

async function applyAgainstInvoice(
  payment: IPaymentReceived,
  invoice_id: string,
  requestedAmount: number,
  req: AuthenticatedRequest,
  session?: ClientSession,
): Promise<number> {
  if (payment.status !== "PAID") {
    throw new ValidationError("Only PAID payments can be applied to invoices");
  }

  const amount = round2(toNum(requestedAmount));
  if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");

  const invoiceQuery = Invoice.findOne({
    _id: invoice_id,
    organizationId: payment.organization_id,
    customerId: payment.customer_id,
    isDeleted: false,
  });
  if (session) invoiceQuery.session(session);
  const invoice = await invoiceQuery;
  if (!invoice) throw new NotFoundError("Invoice");

  if (["Paid", "Void"].includes(invoice.status)) {
    throw new ValidationError("Cannot apply payment to a paid or void invoice");
  }

  const invoiceBalance = round2(toNum(invoice.balanceDue));
  if (invoiceBalance <= 0) throw new ValidationError("Invoice has no due amount");
  if (amount > invoiceBalance) throw new ValidationError("applied_amount exceeds invoice balance_due");

  recomputeExcess(payment);
  if (amount > payment.amount_in_excess) {
    throw new ValidationError("applied_amount exceeds payment amount_in_excess");
  }

  const nextPaid = round2(Math.max(0, toNum(invoice.total) - toNum(invoice.balanceDue)) + amount);
  invoice.balanceDue = round2(Math.max(0, toNum(invoice.total) - nextPaid));
  invoice.paymentReceived = invoice.balanceDue <= 0;
  invoice.status = deriveInvoiceStatus(toNum(invoice.total), nextPaid, invoice.dueDate);
  if (invoice.paymentReceived && !invoice.paidAt) {
    invoice.paidAt = new Date();
  }
  attachUser(invoice as any, req);

  if (session) await invoice.save({ session });
  else await invoice.save();

  const mapQuery = PaymentInvoiceMap.findOne({
    organization_id: payment.organization_id,
    payment_id: payment._id,
    invoice_id: invoice._id,
    is_deleted: false,
  });
  if (session) mapQuery.session(session);
  const currentMap = await mapQuery;

  if (currentMap) {
    currentMap.applied_amount = round2(toNum(currentMap.applied_amount) + amount);
    currentMap.applied_date = new Date();
    attachUser(currentMap, req);
    if (session) await currentMap.save({ session });
    else await currentMap.save();
  } else {
    const newMap = new PaymentInvoiceMap({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      invoice_id: invoice._id,
      applied_amount: amount,
      applied_date: new Date(),
      is_deleted: false,
      deleted_at: null,
    });
    attachUser(newMap, req);
    if (session) await newMap.save({ session });
    else await newMap.save();
  }

  payment.amount_used_for_invoices = round2(toNum(payment.amount_used_for_invoices) + amount);
  recomputeExcess(payment);
  payment.audit_log.push({
    action: "APPLY_TO_INVOICE",
    details: `Applied ${amount.toLocaleString("en-IN")} to invoice ${invoice.invoiceNumber}`,
    amount,
    invoice_id: invoice._id,
    at: new Date(),
    by: req.user?.email || req.user?.name || "System",
  });

  return amount;
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payment_number = await nextPaymentNumber(orgId(req));
  res.json({ success: true, data: { payment_number } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    customer_id,
    status,
    search,
    page = 1,
    limit = 25,
    sortBy = "payment_date",
    sortOrder = "desc",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {
    organization_id: orgId(req),
    is_deleted: false,
  };
  if (customer_id) filter.customer_id = customer_id;
  if (status && status !== "All") filter.status = status;
  if (search) {
    filter.$or = [
      { payment_number: { $regex: search, $options: "i" } },
      { payment_id: { $regex: search, $options: "i" } },
      { reference_number: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(200, Number(limit || 25)));

  const total = await PaymentReceived.countDocuments(filter);
  const data = await PaymentReceived.find(filter)
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
  const payment = await PaymentReceived.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  }).populate("customer_id", "displayName companyName email billingAddress");

  if (!payment) throw new NotFoundError("Payment received");

  const maps = await PaymentInvoiceMap.find({
    organization_id: orgId(req),
    payment_id: payment._id,
    is_deleted: false,
  })
    .populate("invoice_id", "invoiceNumber invoiceDate total balanceDue status")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: { payment, invoice_applications: maps } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization_id = orgId(req);
  const customer_id = String(req.body.customer_id || req.body.customerId || "");
  if (!customer_id) throw new ValidationError("customer_id is required");

  const status = (String(req.body.status || "PAID").toUpperCase() as "DRAFT" | "PAID" | "VOID");
  if (!["DRAFT", "PAID", "VOID"].includes(status)) {
    throw new ValidationError("Invalid status");
  }
  if (status === "VOID") throw new ValidationError("Cannot create a payment directly in VOID status");

  const total_amount_received = round2(toNum(req.body.total_amount_received ?? req.body.totalAmountReceived));
  if (total_amount_received <= 0) throw new ValidationError("total_amount_received must be greater than zero");

  const requestedNumber = String(req.body.payment_number || req.body.paymentNumber || "").trim();
  const payment_number = requestedNumber || (await nextPaymentNumber(organization_id));
  const payment_id = String(req.body.payment_id || req.body.paymentId || `PR-${payment_number.padStart(5, "0")}`);
  const payment_date = new Date(req.body.payment_date || req.body.paymentDate || new Date());
  if (Number.isNaN(payment_date.getTime())) throw new ValidationError("Invalid payment_date");

  const invoiceItems = parseApplyItems(req.body as Record<string, unknown>);
  if (status === "DRAFT" && invoiceItems.length > 0) {
    throw new ValidationError("Cannot apply invoices while payment status is DRAFT");
  }
  const uniqueInvoiceIds = new Set(invoiceItems.map((i) => i.invoice_id));
  if (uniqueInvoiceIds.size !== invoiceItems.length) {
    throw new ValidationError("Duplicate invoice application in request");
  }

  const result = await runRequiredTransaction(async (session: ClientSession) => {
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: "payments-received:create",
      session,
    });

    const payment = new PaymentReceived({
      organization_id,
      payment_id,
      payment_number,
      customer_id,
      payment_date,
      payment_mode: String(req.body.payment_mode || req.body.paymentMode || "Cash"),
      deposited_to_account: req.body.deposited_to_account || req.body.depositedToAccount || null,
      reference_number: String(req.body.reference_number || req.body.referenceNumber || ""),
      notes: String(req.body.notes || ""),
      status,
      total_amount_received,
      amount_used_for_invoices: 0,
      amount_refunded: 0,
      amount_in_excess: total_amount_received,
      audit_log: [
        {
          action: "CREATE",
          details: `Payment received with amount ${total_amount_received.toLocaleString("en-IN")}`,
          amount: total_amount_received,
          at: new Date(),
          by: req.user?.email || req.user?.name || "System",
        },
      ],
      is_deleted: false,
      deleted_at: null,
    });

    attachUser(payment, req);
    await payment.save({ session });

    if (status === "PAID" && invoiceItems.length > 0) {
      for (const item of invoiceItems) {
        await applyAgainstInvoice(payment, item.invoice_id, item.applied_amount, req, session);
      }
    }

    recomputeExcess(payment);
    attachUser(payment, req);
    await payment.save({ session });

    return payment;
  });

  await recomputeContactOutstanding({
    organizationId: (result as any).organization_id,
    contactId: (result as any).customer_id,
    req,
  });

  if (String((result as any).status) === "PAID") {
    await postPaymentReceivedEvent({
      payment: result as any,
      req,
      event: "create",
    });
  }

  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `payments-received:update:${req.params.id}`,
  });

  const payment = await PaymentReceived.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  });
  if (!payment) throw new NotFoundError("Payment received");
  if (payment.status === "VOID") throw new ValidationError("Cannot edit a VOID payment");

  const nextCustomerId = String(req.body.customer_id || req.body.customerId || payment.customer_id);
  if (String(payment.customer_id) !== nextCustomerId) {
    throw new ValidationError("Changing customer is not allowed while editing payment");
  }

  if (req.body.total_amount_received !== undefined || req.body.totalAmountReceived !== undefined) {
    const nextTotal = round2(toNum(req.body.total_amount_received ?? req.body.totalAmountReceived));
    if (nextTotal !== round2(toNum(payment.total_amount_received))) {
      throw new ValidationError("Changing total amount is not allowed in edit");
    }
  }

  if (req.body.payment_date || req.body.paymentDate) {
    const parsedDate = new Date(req.body.payment_date || req.body.paymentDate);
    if (Number.isNaN(parsedDate.getTime())) throw new ValidationError("Invalid payment_date");
    payment.payment_date = parsedDate;
  }

  if (req.body.payment_mode !== undefined || req.body.paymentMode !== undefined) {
    payment.payment_mode = String(req.body.payment_mode || req.body.paymentMode || payment.payment_mode);
  }

  if (req.body.deposited_to_account !== undefined || req.body.depositedToAccount !== undefined) {
    payment.deposited_to_account = req.body.deposited_to_account || req.body.depositedToAccount || null;
  }

  if (req.body.reference_number !== undefined || req.body.referenceNumber !== undefined) {
    payment.reference_number = String(req.body.reference_number || req.body.referenceNumber || "");
  }

  if (req.body.notes !== undefined) {
    payment.notes = String(req.body.notes || "");
  }

  payment.audit_log.push({
    action: "UPDATE",
    details: "Payment details updated",
    at: new Date(),
    by: req.user?.email || req.user?.name || "System",
  });

  attachUser(payment, req);
  await payment.save();

  res.json({ success: true, data: payment });
});

export const applyToInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-received:apply:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentReceived.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment received");
    if (payment.status === "VOID") throw new ValidationError("Cannot apply a VOID payment");

    const invoice_id = String(req.body.invoice_id || req.body.invoiceId || "");
    const applied_amount = toNum(req.body.applied_amount ?? req.body.appliedAmount ?? req.body.amount, 0);
    if (!invoice_id) throw new ValidationError("invoice_id is required");

    const applied = await applyAgainstInvoice(payment, invoice_id, applied_amount, req, session);
    attachUser(payment, req);
    await payment.save({ session });

    return { payment, applied_amount: applied };
  });

  await recomputeContactOutstanding({
    organizationId: (result.payment as any).organization_id,
    contactId: (result.payment as any).customer_id,
    req,
  });

  await postPaymentReceivedEvent({
    payment: result.payment as any,
    req,
    event: "apply",
    amount: result.applied_amount,
    eventKey: String((result.payment as any).audit_log?.length || Date.now()),
  });

  res.json({ success: true, data: result });
});

export const unapplyFromInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-received:unapply:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentReceived.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment received");
    if (payment.status === "VOID") throw new ValidationError("Cannot unapply from a VOID payment");

    const invoice_id = String(req.body.invoice_id || req.body.invoiceId || "");
    if (!invoice_id) throw new ValidationError("invoice_id is required");

    const mapQuery = PaymentInvoiceMap.findOne({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      invoice_id,
      is_deleted: false,
    });
    mapQuery.session(session);
    const map = await mapQuery;
    if (!map) throw new NotFoundError("Payment invoice mapping");

    const maxApplied = round2(toNum(map.applied_amount));
    const amount = round2(toNum(req.body.applied_amount ?? req.body.appliedAmount ?? maxApplied));
    if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");
    if (amount > maxApplied) throw new ValidationError("applied_amount exceeds mapped amount");

    const invoiceQuery = Invoice.findOne({
      _id: invoice_id,
      organizationId: payment.organization_id,
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

    map.applied_amount = round2(maxApplied - amount);
    if (map.applied_amount <= 0) {
      map.is_deleted = true;
      map.deleted_at = new Date();
      map.applied_amount = 0;
    }
    attachUser(map, req);
    await map.save({ session });

    payment.amount_used_for_invoices = round2(Math.max(0, toNum(payment.amount_used_for_invoices) - amount));
    recomputeExcess(payment);
    payment.audit_log.push({
      action: "UNAPPLY_FROM_INVOICE",
      details: `Unapplied ${amount.toLocaleString("en-IN")} from invoice ${invoice.invoiceNumber}`,
      amount,
      invoice_id: invoice._id,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });
    attachUser(payment, req);
    await payment.save({ session });

    return { payment, unapplied_amount: amount };
  });

  await recomputeContactOutstanding({
    organizationId: (result.payment as any).organization_id,
    contactId: (result.payment as any).customer_id,
    req,
  });

  await postPaymentReceivedEvent({
    payment: result.payment as any,
    req,
    event: "unapply",
    amount: result.unapplied_amount,
    eventKey: String((result.payment as any).audit_log?.length || Date.now()),
  });

  res.json({ success: true, data: result });
});

export const recordRefund = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-received:refund:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentReceived.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment received");
    if (payment.status !== "PAID") throw new ValidationError("Only PAID payments can be refunded");

    recomputeExcess(payment);
    const amount = round2(toNum(req.body.amount));
    if (amount <= 0) throw new ValidationError("Refund amount must be greater than zero");
    if (amount > payment.amount_in_excess) {
      throw new ValidationError("Refund amount exceeds amount_in_excess");
    }

    payment.amount_refunded = round2(toNum(payment.amount_refunded) + amount);
    recomputeExcess(payment);
    payment.audit_log.push({
      action: "REFUND",
      details: `Customer refund recorded for ${amount.toLocaleString("en-IN")}`,
      amount,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    attachUser(payment, req);
    await payment.save({ session });

    return payment;
  });

  await reverseAllPaymentReceivedVouchers(result as any, req);

  await recomputeContactOutstanding({
    organizationId: (result as any).organization_id,
    contactId: (result as any).customer_id,
    req,
  });

  await postPaymentReceivedEvent({
    payment: result as any,
    req,
    event: "refund",
    amount: req.body.amount,
    eventKey: String((result as any).audit_log?.length || Date.now()),
  });

  res.json({ success: true, data: result });
});

export const voidPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-received:void:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentReceived.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment received");
    if (payment.status === "VOID") throw new ValidationError("Payment is already VOID");
    if (round2(toNum(payment.amount_refunded)) > 0) {
      throw new ValidationError("Cannot void a payment after refund is recorded");
    }

    const mapsQuery = PaymentInvoiceMap.find({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      is_deleted: false,
      applied_amount: { $gt: 0 },
    });
    mapsQuery.session(session);
    const maps = await mapsQuery;

    for (const map of maps) {
      const invoiceQuery = Invoice.findOne({
        _id: map.invoice_id,
        organizationId: payment.organization_id,
        isDeleted: false,
      });
      invoiceQuery.session(session);
      const invoice = await invoiceQuery;

      if (invoice) {
        const amount = round2(toNum(map.applied_amount));
        if (amount > 0) {
          const currentPaid = round2(Math.max(0, toNum(invoice.total) - toNum(invoice.balanceDue)));
          const nextPaid = round2(Math.max(0, currentPaid - amount));
          invoice.balanceDue = round2(Math.max(0, toNum(invoice.total) - nextPaid));
          invoice.paymentReceived = invoice.balanceDue <= 0;
          invoice.status = deriveInvoiceStatus(toNum(invoice.total), nextPaid, invoice.dueDate);
          if (!invoice.paymentReceived) invoice.paidAt = null;
          attachUser(invoice as any, req);
          await invoice.save({ session });
        }
      }

      map.is_deleted = true;
      map.deleted_at = new Date();
      map.applied_amount = 0;
      attachUser(map, req);
      await map.save({ session });
    }

    payment.status = "VOID";
    payment.amount_used_for_invoices = 0;
    payment.amount_in_excess = 0;
    payment.audit_log.push({
      action: "VOID",
      details: `Payment voided. Reason: ${String(req.body.reason || "No reason provided")}`,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });
    attachUser(payment, req);
    await payment.save({ session });

    return payment;
  });

  await recomputeContactOutstanding({
    organizationId: (result as any).organization_id,
    contactId: (result as any).customer_id,
    req,
  });

  res.json({ success: true, data: result });
});
