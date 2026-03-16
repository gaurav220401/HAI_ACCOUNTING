import { Response } from "express";
import Bill from "../models/bill.model";
import PurchaseOrder from "../models/purchase-order.model";
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
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("vendorId", "displayName companyName email billingAddress phone")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("accountsPayableId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("tcsId", "taxName rate sectionCode")
    .populate("discountAccountId", "name");
  if (!bill) throw new NotFoundError("Bill");
  res.json({ success: true, data: bill });
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
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  const bill = new Bill({
    organizationId: oid,
    vendorId: req.body.vendorId,
    billNumber,
    referenceNumber: req.body.referenceNumber || "",
    orderNumber: req.body.orderNumber || "",
    billDate: req.body.billDate,
    dueDate: req.body.dueDate || null,
    paymentTermsId: req.body.paymentTermsId || null,
    accountsPayableId: req.body.accountsPayableId || null,
    subject: req.body.subject || "",
    discountLevel,
    discountAccountId: req.body.discountAccountId || null,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType,
    tdsId,
    tcsId,
    tcsAmount,
    taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    balanceDue: total,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: req.body.status || "Open",
    comments: [{
      author: "System",
      text: `Bill created for ${total.toLocaleString("en-IN")}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(bill, req);
  await bill.save();
  res.status(201).json({ success: true, data: bill });
});

/** POST /api/bills/:id/void */
export const voidBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status === "Void") throw new ValidationError("Bill is already voided");

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
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  
  const paymentAmount = toNum(req.body.amount);
  if (paymentAmount <= 0) throw new ValidationError("Payment amount must be greater than zero");
  if (paymentAmount > bill.balanceDue) throw new ValidationError("Payment amount exceeds balance due");

  bill.balanceDue = (bill.balanceDue || 0) - paymentAmount;
  
  if (bill.balanceDue <= 0) {
    bill.status = "Paid";
    bill.balanceDue = 0;
  } else {
    bill.status = "Partially Paid";
  }

  const mode = req.body.paymentMode || "Cash";
  bill.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Payment of ${paymentAmount.toLocaleString("en-IN")} recorded via ${mode}`,
    time: new Date(),
    isSystem: true,
  });

  await bill.save();
  res.json({ success: true, data: bill });
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

  const prevStatus = bill.status;

  const discountLevel = req.body.discountLevel || bill.discountLevel;
  const lineItems = req.body.lineItems ? calcLineItems(req.body.lineItems, discountLevel) : bill.lineItems;
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent ?? bill.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxType = req.body.taxType ?? bill.taxType;
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount ?? bill.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount ?? bill.tcsAmount) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount ?? bill.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;
  const nextTdsId = taxType === "TDS"
    ? (req.body.tdsId !== undefined ? req.body.tdsId : bill.tdsId)
    : null;
  const nextTcsId = taxType === "TCS"
    ? (req.body.tcsId !== undefined ? req.body.tcsId : bill.tcsId)
    : null;

  Object.assign(bill, req.body, { 
    lineItems, 
    subTotal, 
    discountPercent, 
    discountAmount, 
    taxType,
    tdsId: nextTdsId,
    tcsId: nextTcsId,
    taxAmount,
    tcsAmount,
    adjustmentAmount, 
    total,
    balanceDue: total
  });

  if (req.body.status && req.body.status !== prevStatus) {
    bill.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Status changed to ${req.body.status}`,
      time: new Date(),
      isSystem: true,
    });
  }
  
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
  bill.isDeleted = true;
  bill.deletedAt = new Date();
  await bill.save();
  res.json({ success: true, message: "Bill deleted successfully" });
});
