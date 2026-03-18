import { Response } from "express";
import Bill from "../models/bill.model";
import PurchaseOrder from "../models/purchase-order.model";
import PaymentBillMap from "../models/payment-bill-map.model";
import VendorCreditApplication from "../models/vendor-credit-application.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

async function nextBillNumber(organizationId: any): Promise<string> {
  const last = await Bill.findOne({ 
    organizationId,
    isDeleted: { $in: [true, false] }
  })
    .sort({ billNumber: -1 })
    .select("billNumber")
    .lean();
  if (!last) return "BILL-00001";
  const match = last.billNumber.match(/BILL-(\d+)/);
  if (!match) return "BILL-00001";
  const next = parseInt(match[1], 10) + 1;
  return `BILL-${String(next).padStart(5, "0")}`;
}

function calcLineItems(items: any[], discountLevel: string) {
  return (items || []).map((item: any) => {
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const lineTotal = qty * rate;
    if (discountLevel === "line_item") {
      const discPct = Number(item.discountPercent) || 0;
      const discAmt = Number(item.discountAmount) || (lineTotal * discPct) / 100;
      return { ...item, quantity: qty, rate, discountPercent: discPct, discountAmount: discAmt, amount: lineTotal - discAmt };
    }
    return { ...item, quantity: qty, rate, discountPercent: 0, discountAmount: 0, amount: lineTotal };
  });
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function computeBillTotals(input: {
  lineItems: any[];
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  taxAmount: number;
  tcsAmount: number;
  adjustmentAmount: number;
}) {
  const subTotal = input.lineItems
    .filter((i: any) => !i.isHeader)
    .reduce((s: number, i: any) => s + (i.quantity * i.rate), 0);
  const discountAmount = input.discountLevel === "transaction"
    ? (subTotal * input.discountPercent) / 100
    : input.lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxableAmount = subTotal - discountAmount;
  const taxTotal = input.taxAmount + input.tcsAmount;
  const total = taxableAmount + taxTotal + input.adjustmentAmount;
  return { subTotal, discountAmount, taxableAmount, taxTotal, total };
}

function canTransitionStatus(current: string, next: string): boolean {
  if (current === next) return true;
  const map: Record<string, string[]> = {
    Draft: ["Open", "Void"],
    Open: ["Partially Paid", "Paid", "Overdue", "Void"],
    "Partially Paid": ["Paid", "Overdue", "Void"],
    Overdue: ["Partially Paid", "Paid", "Void"],
    Paid: [],
    Void: [],
  };
  return (map[current] || []).includes(next);
}

function hasFinancialEdits(payload: any): boolean {
  const keys = [
    "lineItems", "discountLevel", "discountPercent", "taxType", "taxAmount", "tcsAmount",
    "adjustmentAmount", "tdsId", "tcsId", "discountAccountId", "subTotal", "total",
  ];
  return keys.some((k) => payload[k] !== undefined);
}

function applyOverdueState(bill: any) {
  if (bill.status === "Open" && bill.dueDate && bill.balanceDue > 0) {
    const now = new Date();
    if (new Date(bill.dueDate) < now) bill.status = "Overdue";
  }
}

/** GET /api/bills/next-number */
export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const num = await nextBillNumber(orgId(req));
  res.json({ success: true, data: { billNumber: num } });
});

/** GET /api/bills/open-purchase-orders?vendorId=... */
export const listOpenPurchaseOrders = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const vendorId = String(req.query.vendorId || "").trim();
  if (!vendorId) throw new ValidationError("vendorId query param is required");

  const orders = await PurchaseOrder.find({
    organizationId: orgId(req),
    vendorId,
    status: "Open",
    isDeleted: false,
  })
    .select("purchaseOrderNumber purchaseOrderDate total lineItems")
    .populate("lineItems.itemId", "name costPrice purchaseAccountId")
    .populate("lineItems.accountId", "name accountType")
    .sort({ purchaseOrderDate: -1 })
    .lean();

  res.json({ success: true, data: orders });
});

/** GET /api/bills */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    status, search, vendorId, billNumber, referenceNumber, 
    dateStart, dateEnd, dueStart, dueEnd, 
    amountMin, amountMax, itemNameId, accountId,
    page = 1, limit = 25, sortBy = "createdAt", sortOrder = "desc" 
  } = req.query;
  
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  if (billNumber) filter.billNumber = { $regex: billNumber, $options: "i" };
  if (referenceNumber) filter.referenceNumber = { $regex: referenceNumber, $options: "i" };
  if (itemNameId) filter["lineItems.itemId"] = itemNameId;
  if (accountId) filter["lineItems.accountId"] = accountId;

  if (dateStart || dateEnd) {
    filter.billDate = {};
    if (dateStart) filter.billDate.$gte = new Date(dateStart as string);
    if (dateEnd) filter.billDate.$lte = new Date(dateEnd as string);
  }

  if (dueStart || dueEnd) {
    filter.dueDate = {};
    if (dueStart) filter.dueDate.$gte = new Date(dueStart as string);
    if (dueEnd) filter.dueDate.$lte = new Date(dueEnd as string);
  }

  if (amountMin || amountMax) {
    filter.total = {};
    if (amountMin) filter.total.$gte = toNum(amountMin);
    if (amountMax) filter.total.$lte = toNum(amountMax);
  }

  if (search) {
    filter.$or = [
      { billNumber: { $regex: search, $options: "i" } },
      { referenceNumber: { $regex: search, $options: "i" } },
      { orderNumber: { $regex: search, $options: "i" } },
    ];
  }

  await Bill.updateMany(
    {
      organizationId: orgId(req),
      isDeleted: false,
      status: "Open",
      dueDate: { $ne: null, $lt: new Date() },
      balanceDue: { $gt: 0 },
    },
    { $set: { status: "Overdue" } }
  );

  const total = await Bill.countDocuments(filter);
  const bills = await Bill.find(filter)
    .populate("vendorId", "displayName companyName email")
    .populate("paymentTermsId", "name")
    .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({ success: true, data: bills, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
});

/** GET /api/bills/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: oid, isDeleted: false })
    .populate("vendorId", "displayName companyName email billingAddress phone")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("accountsPayableId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("tcsId", "taxName rate sectionCode")
    .populate("discountAccountId", "name");
  if (!bill) throw new NotFoundError("Bill");
  applyOverdueState(bill);
  await bill.save();

  const [paymentMaps, vendorCreditApplications] = await Promise.all([
    PaymentBillMap.find({
      organization_id: oid,
      bill_id: bill._id,
      is_deleted: false,
      applied_amount: { $gt: 0 },
    })
      .populate("payment_id", "payment_number payment_date payment_mode status")
      .sort({ applied_date: -1, createdAt: -1 })
      .lean(),
    VendorCreditApplication.find({
      organizationId: oid,
      billId: bill._id,
      isDeleted: false,
      amount: { $gt: 0 },
    })
      .populate("vendorCreditId", "vendorCreditNumber vendorCreditDate status")
      .sort({ appliedDate: -1, createdAt: -1 })
      .lean(),
  ]);

  const payment_applications = paymentMaps.map((m: any) => ({
    _id: String(m._id),
    amount: toNum(m.applied_amount),
    applied_date: m.applied_date,
    payment: m.payment_id && typeof m.payment_id === "object"
      ? {
          _id: String(m.payment_id._id),
          payment_number: m.payment_id.payment_number,
          payment_date: m.payment_id.payment_date,
          payment_mode: m.payment_id.payment_mode,
          status: m.payment_id.status,
        }
      : null,
  }));

  const vendor_credit_applications = vendorCreditApplications.map((a: any) => ({
    _id: String(a._id),
    amount: toNum(a.amount),
    applied_date: a.appliedDate,
    vendor_credit: a.vendorCreditId && typeof a.vendorCreditId === "object"
      ? {
          _id: String(a.vendorCreditId._id),
          vendorCreditNumber: a.vendorCreditId.vendorCreditNumber,
          vendorCreditDate: a.vendorCreditId.vendorCreditDate,
          status: a.vendorCreditId.status,
        }
      : null,
  }));

  res.json({
    success: true,
    data: {
      ...bill.toObject(),
      payment_applications,
      vendor_credit_applications,
    },
  });
});

/** POST /api/bills */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  if (!req.body.billDate) throw new ValidationError("Bill date is required");

  const billNumber = req.body.billNumber || (await nextBillNumber(oid));
  const discountLevel = req.body.discountLevel || "transaction";
  const taxType = req.body.taxType || "none";
  const tdsId = taxType === "TDS" ? (req.body.tdsId || null) : null;
  const tcsId = taxType === "TCS" ? (req.body.tcsId || null) : null;
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent) : 0;
  if (discountPercent < 0) throw new ValidationError("Discount percent cannot be negative");
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount) : 0;
  if (taxAmount < 0 || tcsAmount < 0) throw new ValidationError("Tax cannot be negative");
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const totals = computeBillTotals({
    lineItems,
    discountLevel,
    discountPercent,
    taxAmount,
    tcsAmount,
    adjustmentAmount,
  });
  if (totals.total < 0) throw new ValidationError("Total cannot be negative");

  const requestedStatus = req.body.status || "Open";
  if (!["Draft", "Open"].includes(requestedStatus)) {
    throw new ValidationError("New bill status must be Draft or Open");
  }

  const bill = new Bill({
    organizationId: oid,
    vendorId: req.body.vendorId,
    billNumber,
    referenceNumber: req.body.referenceNumber || "",
    orderNumber: req.body.orderNumber || "",
    billDate: req.body.billDate,
    dueDate: req.body.dueDate || null,
    paymentTermsId: req.body.paymentTermsId || null,
    sourceOfSupply: req.body.sourceOfSupply || "",
    destinationOfSupply: req.body.destinationOfSupply || "",
    accountsPayableId: req.body.accountsPayableId || null,
    subject: req.body.subject || "",
    discountLevel,
    discountAccountId: req.body.discountAccountId || null,
    lineItems,
    subTotal: totals.subTotal,
    discountPercent,
    discountAmount: totals.discountAmount,
    taxType,
    tdsId,
    tcsId,
    tcsAmount,
    taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    amountPaid: 0,
    total: totals.total,
    balanceDue: totals.total,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: requestedStatus,
    comments: [{
      author: "System",
      text: `Bill created for ${totals.total.toLocaleString("en-IN")}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(bill, req);
  applyOverdueState(bill);
  await bill.save();
  res.status(201).json({ success: true, data: bill });
});

/** POST /api/bills/:id/void */
export const voidBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status === "Void") throw new ValidationError("Bill is already voided");
  if (bill.amountPaid > 0) throw new ValidationError("Cannot void a bill with recorded payments");

  bill.status = "Void";
  const reason = req.body.reason || "No reason provided";
  bill.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Bill voided. Reason: ${reason}`,
    time: new Date(),
    isSystem: true,
  });

  await bill.save();
  res.json({ success: true, data: bill });
});

/** POST /api/bills/:id/payments */
export const recordPayment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  throw new ValidationError(
    "Direct bill payments are disabled. Use Payments Made flow (/api/payments-made) to keep ledger mappings consistent.",
  );
});

/** POST /api/bills/:id/clone */
export const clone = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const source = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false }).lean();
  if (!source) throw new NotFoundError("Bill");

  const billNumber = await nextBillNumber(source.organizationId);
  const { _id, __v, ...cloneData } = source as any;

  const bill = new Bill({
    ...cloneData,
    billNumber,
    billDate: new Date(),
    status: "Open",
    amountPaid: 0,
    balanceDue: source.total || 0,
    isDeleted: false,
    deletedAt: null,
    comments: [{
      author: "System",
      text: `Bill cloned from ${source.billNumber}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(bill, req);
  await bill.save();
  res.status(201).json({ success: true, data: bill });
});

/** PATCH /api/bills/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status === "Void") throw new ValidationError("Cannot edit a void bill");

  if (bill.amountPaid > 0 && hasFinancialEdits(req.body)) {
    throw new ValidationError("Cannot edit financial fields after payment is recorded");
  }

  const prevStatus = bill.status;

  const discountLevel = req.body.discountLevel || bill.discountLevel;
  const lineItems = req.body.lineItems ? calcLineItems(req.body.lineItems, discountLevel) : bill.lineItems;
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent ?? bill.discountPercent) : 0;
  if (discountPercent < 0) throw new ValidationError("Discount percent cannot be negative");
  const taxType = req.body.taxType ?? bill.taxType;
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount ?? bill.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount ?? bill.tcsAmount) : 0;
  if (taxAmount < 0 || tcsAmount < 0) throw new ValidationError("Tax cannot be negative");
  const adjustmentAmount = toNum(req.body.adjustmentAmount ?? bill.adjustmentAmount);
  const totals = computeBillTotals({
    lineItems,
    discountLevel,
    discountPercent,
    taxAmount,
    tcsAmount,
    adjustmentAmount,
  });
  if (totals.total < 0) throw new ValidationError("Total cannot be negative");
  const nextTdsId = taxType === "TDS"
    ? (req.body.tdsId !== undefined ? req.body.tdsId : bill.tdsId)
    : null;
  const nextTcsId = taxType === "TCS"
    ? (req.body.tcsId !== undefined ? req.body.tcsId : bill.tcsId)
    : null;

  Object.assign(bill, req.body, { 
    lineItems, 
    subTotal: totals.subTotal,
    discountPercent, 
    discountAmount: totals.discountAmount,
    taxType,
    tdsId: nextTdsId,
    tcsId: nextTcsId,
    taxAmount,
    tcsAmount,
    adjustmentAmount, 
    total: totals.total,
    balanceDue: totals.total - toNum(bill.amountPaid),
    amountPaid: toNum(bill.amountPaid),
  });

  if (bill.balanceDue < 0) {
    throw new ValidationError("Invalid balance due after update");
  }

  if (bill.amountPaid === 0 && bill.status !== "Draft") {
    bill.status = bill.balanceDue > 0 ? "Open" : "Paid";
  } else if (bill.amountPaid > 0 && bill.balanceDue > 0) {
    bill.status = "Partially Paid";
  } else if (bill.balanceDue === 0) {
    bill.status = "Paid";
  }

  if (req.body.status && req.body.status !== prevStatus) {
    if (!canTransitionStatus(prevStatus, req.body.status)) {
      throw new ValidationError(`Invalid status transition from ${prevStatus} to ${req.body.status}`);
    }
    bill.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Status changed to ${req.body.status}`,
      time: new Date(),
      isSystem: true,
    });
  }
  
  applyOverdueState(bill);
  attachUser(bill, req);
  await bill.save();
  res.json({ success: true, data: bill });
});

/** POST /api/bills/:id/comments */
export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");

  bill.comments.push({
    author: req.user?.name || req.user?.email || "User",
    text: req.body.text,
    time: new Date(),
    isSystem: req.body.isSystem === true,
  });

  await bill.save();
  res.json({ success: true, data: bill.comments[bill.comments.length - 1] });
});

/** DELETE /api/bills/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status !== "Draft") throw new ValidationError("Only draft bills can be deleted. Void other bills.");
  bill.isDeleted = true;
  bill.deletedAt = new Date();
  await bill.save();
  res.json({ success: true, message: "Bill deleted successfully" });
});
