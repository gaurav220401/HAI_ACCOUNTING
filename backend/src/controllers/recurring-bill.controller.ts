import { Response } from "express";
import RecurringBill from "../models/recurring-bill.model";
import Bill from "../models/bill.model";
import PaymentTerms from "../models/payment-terms.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { calcLineItems, computeDueDate, computeNextDate, nextBillNumber, toNum } from "../utils/recurring-bills";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}


function applyExpiry(rec: any) {
  if (!rec.neverExpires && rec.endsOn) {
    const now = new Date();
    if (now > rec.endsOn) {
      rec.status = "Expired";
      rec.nextBillDate = null;
    }
  }
}

/** GET /api/recurring-bills */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, vendorId, page = 1, limit = 50 } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status) filter.status = status;
  if (search) filter.profileName = { $regex: search, $options: "i" };
  if (vendorId) filter.vendorId = vendorId;

  const total = await RecurringBill.countDocuments(filter);
  const data = await RecurringBill.find(filter)
    .populate("vendorId", "displayName companyName")
    .populate("paymentTermsId", "name")
    .sort({ createdAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit);

  data.forEach(applyExpiry);

  res.json({
    success: true,
    data,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/recurring-bills/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("vendorId", "displayName companyName email")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("discountAccountId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("tcsId", "taxName rate sectionCode");
  if (!rec) throw new NotFoundError("Recurring bill");
  applyExpiry(rec);
  res.json({ success: true, data: rec });
});

/** GET /api/recurring-bills/:id/bills */
export const getGeneratedBills = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring bill");

  const bills = await Bill.find({ _id: { $in: rec.generatedBillIds }, isDeleted: false })
    .populate("vendorId", "displayName companyName")
    .sort({ billDate: -1 })
    .lean();

  res.json({ success: true, data: bills });
});

/** POST /api/recurring-bills */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { profileName, vendorId, startDate } = req.body;
  if (!profileName) throw new ValidationError("profileName is required");
  if (!vendorId) throw new ValidationError("vendorId is required");
  if (!startDate) throw new ValidationError("startDate is required");

  const discountLevel = req.body.discountLevel || "transaction";
  const taxType = req.body.taxType || "none";
  const tdsId = taxType === "TDS" ? (req.body.tdsId || null) : null;
  const tcsId = taxType === "TCS" ? (req.body.tcsId || null) : null;
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction"
    ? (subTotal * discountPercent) / 100
    : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  const recurringBill = new RecurringBill({
    organizationId: orgId(req),
    profileName,
    vendorId,
    frequency: req.body.frequency || "Weekly",
    repeatEvery: req.body.repeatEvery || 1,
    startDate: req.body.startDate,
    neverExpires: req.body.neverExpires !== false,
    endsOn: req.body.neverExpires === false ? (req.body.endsOn || null) : null,
    paymentTermsId: req.body.paymentTermsId || null,
    sourceOfSupply: req.body.sourceOfSupply || "",
    destinationOfSupply: req.body.destinationOfSupply || "",
    subject: req.body.subject || "",
    orderNumber: req.body.orderNumber || "",
    isReverseCharge: req.body.isReverseCharge === true,
    discountLevel,
    discountAccountId: req.body.discountAccountId || null,
    discountPercent,
    discountAmount,
    taxType,
    tdsId,
    tcsId,
    taxAmount,
    tcsAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    subTotal,
    total,
    lineItems,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    nextBillDate: new Date(req.body.startDate),
    status: "Active",
  });

  applyExpiry(recurringBill);
  attachUser(recurringBill as any, req);
  await recurringBill.save();
  await recurringBill.populate("vendorId", "displayName companyName");
  res.status(201).json({ success: true, data: recurringBill });
});

/** PATCH /api/recurring-bills/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring bill");

  const allowed = [
    "profileName", "vendorId", "frequency", "repeatEvery", "startDate",
    "neverExpires", "endsOn", "paymentTermsId", "subject", "orderNumber",
    "isReverseCharge", "discountLevel", "discountAccountId", "discountPercent", "taxType",
    "tdsId", "tcsId", "adjustmentLabel", "adjustmentAmount", "notes",
    "termsAndConditions", "lineItems", "attachments", "sourceOfSupply", "destinationOfSupply",
  ];
  for (const key of allowed) {
    if (key in req.body) (rec as any)[key] = req.body[key];
  }

  const discountLevel = rec.discountLevel || "transaction";
  const lineItems = calcLineItems(rec.lineItems || [], discountLevel);
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(rec.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction"
    ? (subTotal * discountPercent) / 100
    : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxType = rec.taxType || "none";
  const taxAmount = taxType === "TDS" ? toNum((rec as any).taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum((rec as any).tcsAmount) : 0;
  const adjustmentAmount = toNum(rec.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  rec.lineItems = lineItems as any;
  rec.subTotal = subTotal;
  rec.discountAmount = discountAmount;
  rec.taxAmount = taxAmount;
  rec.tcsAmount = tcsAmount;
  rec.total = total;

  if (req.body.startDate && !rec.lastBillDate) {
    rec.nextBillDate = new Date(req.body.startDate);
  }

  applyExpiry(rec);
  attachUser(rec as any, req);
  await rec.save();
  await rec.populate("vendorId", "displayName companyName");
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-bills/:id/stop */
export const stop = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring bill");
  rec.status = "Stopped";
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-bills/:id/resume */
export const resume = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring bill");
  rec.status = "Active";
  if (!rec.nextBillDate) {
    const base = rec.lastBillDate || new Date();
    rec.nextBillDate = computeNextDate(base, rec.frequency, rec.repeatEvery);
  }
  applyExpiry(rec);
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true, data: rec });
});

/** POST /api/recurring-bills/:id/create-bill */
export const createBillNow = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("vendorId", "displayName companyName email")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("tcsId", "taxName rate sectionCode");
  if (!rec) throw new NotFoundError("Recurring bill");
  if (rec.status !== "Active") throw new ValidationError("Recurring bill is not active");

  const billNumber = await nextBillNumber(rec.organizationId);
  const billDate = new Date();
  const paymentTerms = rec.paymentTermsId
    ? await PaymentTerms.findById(rec.paymentTermsId).lean()
    : null;
  const dueDate = computeDueDate(billDate, paymentTerms ? { termType: paymentTerms.termType, netDays: paymentTerms.netDays } : null);
  const lineItems = calcLineItems((rec as any).lineItems || [], rec.discountLevel || "transaction");
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = rec.discountLevel === "transaction" ? toNum(rec.discountPercent) : 0;
  const discountAmount = rec.discountLevel === "transaction"
    ? (subTotal * discountPercent) / 100
    : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = rec.taxType === "TDS" ? toNum(rec.taxAmount) : 0;
  const tcsAmount = rec.taxType === "TCS" ? toNum(rec.tcsAmount) : 0;
  const adjustmentAmount = toNum(rec.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  const bill = new Bill({
    organizationId: rec.organizationId,
    vendorId: rec.vendorId,
    billNumber,
    billDate,
    dueDate,
    paymentTermsId: rec.paymentTermsId || null,
    sourceOfSupply: rec.sourceOfSupply || "",
    destinationOfSupply: rec.destinationOfSupply || "",
    subject: rec.subject || "",
    orderNumber: rec.orderNumber || "",
    discountLevel: rec.discountLevel,
    discountAccountId: rec.discountAccountId || null,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType: rec.taxType,
    tdsId: rec.tdsId || null,
    tcsId: rec.tcsId || null,
    taxAmount,
    tcsAmount,
    adjustmentLabel: rec.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    balanceDue: total,
    notes: rec.notes || "",
    termsAndConditions: rec.termsAndConditions || "",
    status: "Open",
    comments: [{
      author: "System",
      text: `Bill created from recurring profile ${rec.profileName}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(bill as any, req);
  await bill.save();

  rec.lastBillDate = billDate;
  const nextDate = computeNextDate(billDate, rec.frequency, rec.repeatEvery);
  if (rec.neverExpires || !rec.endsOn || nextDate <= rec.endsOn) {
    rec.nextBillDate = nextDate;
  } else {
    rec.nextBillDate = null;
    rec.status = "Expired";
  }
  rec.generatedBillIds.push(bill._id as any);
  await rec.save();

  res.status(201).json({ success: true, data: bill });
});

/** DELETE /api/recurring-bills/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const rec = await RecurringBill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!rec) throw new NotFoundError("Recurring bill");
  rec.isDeleted = true;
  rec.deletedAt = new Date();
  attachUser(rec as any, req);
  await rec.save();
  res.json({ success: true });
});
