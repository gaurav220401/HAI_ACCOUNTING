import mongoose, { ClientSession, Types } from "mongoose";
import { Response } from "express";
import Bill from "../models/bill.model";
import { Counter } from "../models/counter.model";
import PaymentBillMap from "../models/payment-bill-map.model";
import PaymentMade, { IPaymentMade } from "../models/payment-made.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { reserveIdempotencyKey } from "../utils/idempotency";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

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

function deriveBillStatus(
  total: number,
  amountPaid: number,
  dueDate?: Date | null,
): "Open" | "Overdue" | "Partially Paid" | "Paid" {
  const paid = round2(Math.max(0, amountPaid));
  const due = round2(Math.max(0, total - paid));
  if (paid <= 0) {
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return "Overdue";
    return "Open";
  }
  if (due <= 0) return "Paid";
  return "Partially Paid";
}

function recomputeExcess(payment: IPaymentMade): void {
  payment.total_amount_paid = round2(Math.max(0, toNum(payment.total_amount_paid)));
  payment.amount_used_for_bills = round2(Math.max(0, toNum(payment.amount_used_for_bills)));
  payment.amount_refunded = round2(Math.max(0, toNum(payment.amount_refunded)));

  const excess = round2(
    payment.total_amount_paid - payment.amount_used_for_bills - payment.amount_refunded,
  );
  if (excess < -0.009) {
    throw new ValidationError("Invalid payment balance: used/refunded exceeds total amount paid");
  }
  payment.amount_in_excess = round2(Math.max(0, excess));
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
  const counterKey = `payment_made:${String(organization_id)}`;
  const counter = await Counter.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  ).lean();

  const seq = Number(counter?.seq || 1);
  return String(seq);
}

type ApplyItem = {
  bill_id: string;
  applied_amount: number;
};

function parseApplyItems(body: Record<string, unknown>): ApplyItem[] {
  const itemsRaw = (body.bill_applications || body.applications || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(itemsRaw)) return [];

  const out: ApplyItem[] = itemsRaw.map((item) => ({
    bill_id: String(item.bill_id || item.billId || ""),
    applied_amount: toNum(item.applied_amount ?? item.appliedAmount ?? item.amount, 0),
  }));

  return out.filter((i) => i.bill_id && i.applied_amount > 0);
}

async function applyAgainstBill(
  payment: IPaymentMade,
  bill_id: string,
  requestedAmount: number,
  req: AuthenticatedRequest,
  session?: ClientSession,
): Promise<number> {
  if (payment.status !== "PAID") {
    throw new ValidationError("Only PAID payments can be applied to bills");
  }

  const amount = round2(toNum(requestedAmount));
  if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");

  const billQuery = Bill.findOne({
    _id: bill_id,
    organizationId: payment.organization_id,
    vendorId: payment.vendor_id,
    isDeleted: false,
  });
  if (session) billQuery.session(session);
  const bill = await billQuery;
  if (!bill) throw new NotFoundError("Bill");

  if (["Paid", "Void"].includes(bill.status)) {
    throw new ValidationError("Cannot apply payment to a paid or void bill");
  }

  const billBalance = round2(toNum(bill.balanceDue));
  if (billBalance <= 0) throw new ValidationError("Bill has no due amount");
  if (amount > billBalance) throw new ValidationError("applied_amount exceeds bill balance_due");

  recomputeExcess(payment);
  if (amount > payment.amount_in_excess) {
    throw new ValidationError("applied_amount exceeds payment amount_in_excess");
  }

  bill.amountPaid = round2(toNum(bill.amountPaid) + amount);
  bill.balanceDue = round2(Math.max(0, toNum(bill.total) - toNum(bill.amountPaid)));
  bill.status = deriveBillStatus(toNum(bill.total), toNum(bill.amountPaid), bill.dueDate);
  bill.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Payment ${payment.payment_number} applied for ${amount.toLocaleString("en-IN")}`,
    time: new Date(),
    isSystem: true,
  });
  if (session) {
    await bill.save({ session });
  } else {
    await bill.save();
  }

  const mapQuery = PaymentBillMap.findOne({
    organization_id: payment.organization_id,
    payment_id: payment._id,
    bill_id: bill._id,
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
    const newMap = new PaymentBillMap({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      bill_id: bill._id,
      applied_amount: amount,
      applied_date: new Date(),
      is_deleted: false,
      deleted_at: null,
    });
    attachUser(newMap, req);
    if (session) await newMap.save({ session });
    else await newMap.save();
  }

  payment.amount_used_for_bills = round2(toNum(payment.amount_used_for_bills) + amount);
  recomputeExcess(payment);
  payment.audit_log.push({
    action: "APPLY_TO_BILL",
    details: `Applied ${amount.toLocaleString("en-IN")} to bill ${bill.billNumber}`,
    amount,
    bill_id: bill._id,
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
    vendor_id,
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
  if (vendor_id) filter.vendor_id = vendor_id;
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

  const total = await PaymentMade.countDocuments(filter);
  const data = await PaymentMade.find(filter)
    .populate("vendor_id", "displayName companyName")
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
  const payment = await PaymentMade.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  }).populate("vendor_id", "displayName companyName email billingAddress");

  if (!payment) throw new NotFoundError("Payment made");

  const maps = await PaymentBillMap.find({
    organization_id: orgId(req),
    payment_id: payment._id,
    is_deleted: false,
  })
    .populate("bill_id", "billNumber billDate total amountPaid balanceDue status")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: { payment, bill_applications: maps } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization_id = orgId(req);
  const vendor_id = String(req.body.vendor_id || req.body.vendorId || "");
  if (!vendor_id) throw new ValidationError("vendor_id is required");

  const status = (String(req.body.status || "PAID").toUpperCase() as "DRAFT" | "PAID" | "VOID");
  if (!["DRAFT", "PAID", "VOID"].includes(status)) {
    throw new ValidationError("Invalid status");
  }
  if (status === "VOID") throw new ValidationError("Cannot create a payment directly in VOID status");

  const total_amount_paid = round2(toNum(req.body.total_amount_paid ?? req.body.totalAmountPaid));
  if (total_amount_paid <= 0) throw new ValidationError("total_amount_paid must be greater than zero");

  const requestedNumber = String(req.body.payment_number || req.body.paymentNumber || "").trim();
  const payment_number = requestedNumber || (await nextPaymentNumber(organization_id));
  const payment_id = String(req.body.payment_id || req.body.paymentId || `PM-${payment_number.padStart(5, "0")}`);
  const payment_date = new Date(req.body.payment_date || req.body.paymentDate || new Date());
  if (Number.isNaN(payment_date.getTime())) throw new ValidationError("Invalid payment_date");

  const billItems = parseApplyItems(req.body as Record<string, unknown>);
  if (status === "DRAFT" && billItems.length > 0) {
    throw new ValidationError("Cannot apply bills while payment status is DRAFT");
  }
  const uniqueBillIds = new Set(billItems.map((i) => i.bill_id));
  if (uniqueBillIds.size !== billItems.length) {
    throw new ValidationError("Duplicate bill application in request");
  }

  const result = await runRequiredTransaction(async (session: ClientSession) => {
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: "payments-made:create",
      session,
    });

    const payment = new PaymentMade({
      organization_id,
      payment_id,
      payment_number,
      vendor_id,
      payment_date,
      payment_mode: String(req.body.payment_mode || req.body.paymentMode || "Cash"),
      paid_through_account: req.body.paid_through_account || req.body.paidThroughAccount || null,
      deposit_to_account: req.body.deposit_to_account || req.body.depositToAccount || null,
      reference_number: String(req.body.reference_number || req.body.referenceNumber || ""),
      notes: String(req.body.notes || ""),
      status,
      total_amount_paid,
      amount_used_for_bills: 0,
      amount_refunded: 0,
      amount_in_excess: total_amount_paid,
      audit_log: [
        {
          action: "CREATE",
          details: `Payment created with amount ${total_amount_paid.toLocaleString("en-IN")}`,
          amount: total_amount_paid,
          at: new Date(),
          by: req.user?.email || req.user?.name || "System",
        },
      ],
      is_deleted: false,
      deleted_at: null,
    });

    attachUser(payment, req);
    await payment.save({ session });

    if (status === "PAID" && billItems.length > 0) {
      for (const item of billItems) {
        await applyAgainstBill(payment, item.bill_id, item.applied_amount, req, session);
      }
    }

    recomputeExcess(payment);
    attachUser(payment, req);
    await payment.save({ session });

    return payment;
  });

  res.status(201).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await reserveIdempotencyKey({
    req,
    organization_id: orgId(req),
    scope: `payments-made:update:${req.params.id}`,
  });

  const payment = await PaymentMade.findOne({
    _id: req.params.id,
    organization_id: orgId(req),
    is_deleted: false,
  });
  if (!payment) throw new NotFoundError("Payment made");
  if (payment.status === "VOID") throw new ValidationError("Cannot edit a VOID payment");

  const nextVendorId = String(req.body.vendor_id || req.body.vendorId || payment.vendor_id);
  if (String(payment.vendor_id) !== nextVendorId) {
    throw new ValidationError("Changing vendor is not allowed while editing payment");
  }

  if (req.body.total_amount_paid !== undefined || req.body.totalAmountPaid !== undefined) {
    const nextTotal = round2(toNum(req.body.total_amount_paid ?? req.body.totalAmountPaid));
    if (nextTotal !== round2(toNum(payment.total_amount_paid))) {
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

  if (req.body.paid_through_account !== undefined || req.body.paidThroughAccount !== undefined) {
    payment.paid_through_account = req.body.paid_through_account || req.body.paidThroughAccount || null;
  }

  if (req.body.deposit_to_account !== undefined || req.body.depositToAccount !== undefined) {
    payment.deposit_to_account = req.body.deposit_to_account || req.body.depositToAccount || null;
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

export const applyToBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-made:apply:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentMade.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment made");
    if (payment.status === "VOID") throw new ValidationError("Cannot apply a VOID payment");

    const bill_id = String(req.body.bill_id || req.body.billId || "");
    const applied_amount = toNum(req.body.applied_amount ?? req.body.appliedAmount ?? req.body.amount, 0);
    if (!bill_id) throw new ValidationError("bill_id is required");

    const applied = await applyAgainstBill(payment, bill_id, applied_amount, req, session);
    attachUser(payment, req);
    await payment.save({ session });

    return { payment, applied_amount: applied };
  });

  res.json({ success: true, data: result });
});

export const unapplyFromBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-made:unapply:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentMade.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment made");
    if (payment.status === "VOID") throw new ValidationError("Cannot unapply from a VOID payment");

    const bill_id = String(req.body.bill_id || req.body.billId || "");
    if (!bill_id) throw new ValidationError("bill_id is required");

    const mapQuery = PaymentBillMap.findOne({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      bill_id,
      is_deleted: false,
    });
    mapQuery.session(session);
    const map = await mapQuery;
    if (!map) throw new NotFoundError("Payment bill mapping");

    const maxApplied = round2(toNum(map.applied_amount));
    const amount = round2(toNum(req.body.applied_amount ?? req.body.appliedAmount ?? maxApplied));
    if (amount <= 0) throw new ValidationError("applied_amount must be greater than zero");
    if (amount > maxApplied) throw new ValidationError("applied_amount exceeds mapped amount");

    const billQuery = Bill.findOne({
      _id: bill_id,
      organizationId: payment.organization_id,
      isDeleted: false,
    });
    billQuery.session(session);
    const bill = await billQuery;
    if (!bill) throw new NotFoundError("Bill");
    if (bill.status === "Void") throw new ValidationError("Cannot unapply from a void bill");

    bill.amountPaid = round2(Math.max(0, toNum(bill.amountPaid) - amount));
    bill.balanceDue = round2(Math.max(0, toNum(bill.total) - toNum(bill.amountPaid)));
    bill.status = deriveBillStatus(toNum(bill.total), toNum(bill.amountPaid), bill.dueDate);
    bill.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Payment ${payment.payment_number} unapplied for ${amount.toLocaleString("en-IN")}`,
      time: new Date(),
      isSystem: true,
    });

    await bill.save({ session });

    map.applied_amount = round2(maxApplied - amount);
    if (map.applied_amount <= 0) {
      map.is_deleted = true;
      map.deleted_at = new Date();
      map.applied_amount = 0;
    }
    attachUser(map, req);
    await map.save({ session });

    payment.amount_used_for_bills = round2(Math.max(0, toNum(payment.amount_used_for_bills) - amount));
    recomputeExcess(payment);
    payment.audit_log.push({
      action: "UNAPPLY_FROM_BILL",
      details: `Unapplied ${amount.toLocaleString("en-IN")} from bill ${bill.billNumber}`,
      amount,
      bill_id: bill._id,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });
    attachUser(payment, req);
    await payment.save({ session });

    return { payment, unapplied_amount: amount };
  });

  res.json({ success: true, data: result });
});

export const recordRefund = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-made:refund:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentMade.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment made");
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
      details: `Vendor refund recorded for ${amount.toLocaleString("en-IN")}`,
      amount,
      at: new Date(),
      by: req.user?.email || req.user?.name || "System",
    });

    attachUser(payment, req);
    await payment.save({ session });

    return payment;
  });

  res.json({ success: true, data: result });
});

export const voidPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await runRequiredTransaction(async (session: ClientSession) => {
    const organization_id = orgId(req);
    await reserveIdempotencyKey({
      req,
      organization_id,
      scope: `payments-made:void:${req.params.id}`,
      session,
    });

    const paymentQuery = PaymentMade.findOne({
      _id: req.params.id,
      organization_id,
      is_deleted: false,
    });
    paymentQuery.session(session);
    const payment = await paymentQuery;
    if (!payment) throw new NotFoundError("Payment made");
    if (payment.status === "VOID") throw new ValidationError("Payment is already VOID");
    if (round2(toNum(payment.amount_refunded)) > 0) {
      throw new ValidationError("Cannot void a payment after refund is recorded");
    }

    const mapsQuery = PaymentBillMap.find({
      organization_id: payment.organization_id,
      payment_id: payment._id,
      is_deleted: false,
      applied_amount: { $gt: 0 },
    });
    mapsQuery.session(session);
    const maps = await mapsQuery;

    for (const map of maps) {
      const billQuery = Bill.findOne({
        _id: map.bill_id,
        organizationId: payment.organization_id,
        isDeleted: false,
      });
      billQuery.session(session);
      const bill = await billQuery;

      if (bill) {
        const amount = round2(toNum(map.applied_amount));
        if (amount > 0) {
          bill.amountPaid = round2(Math.max(0, toNum(bill.amountPaid) - amount));
          bill.balanceDue = round2(Math.max(0, toNum(bill.total) - toNum(bill.amountPaid)));
          bill.status = deriveBillStatus(toNum(bill.total), toNum(bill.amountPaid), bill.dueDate);
          bill.comments.push({
            author: req.user?.name || req.user?.email || "System",
            text: `Payment ${payment.payment_number} voided and reversed by ${amount.toLocaleString("en-IN")}`,
            time: new Date(),
            isSystem: true,
          });
          await bill.save({ session });
        }
      }

      map.is_deleted = true;
      map.deleted_at = new Date();
      map.applied_amount = 0;
      attachUser(map, req);
      await map.save({ session });
    }

    payment.status = "VOID";
    payment.amount_used_for_bills = 0;
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

  res.json({ success: true, data: result });
});
