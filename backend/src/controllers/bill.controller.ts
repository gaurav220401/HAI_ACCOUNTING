import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import FixedAsset from "../models/fixed-asset.model";
import PaymentMade from "../models/payment-made.model";
import PurchaseOrder from "../models/purchase-order.model";
import PaymentBillMap from "../models/payment-bill-map.model";
import VendorCredit from "../models/vendor-credit.model";
import VendorCreditApplication from "../models/vendor-credit-application.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import {
  applyStockDeltas,
  collectBillStockDeltas,
  diffStockDeltas,
  invertStockDeltas,
  recomputeContactOutstanding,
} from "../services/accounting-sync.service";
import {
  isPostedBillStatus,
  postBillLedger,
  reverseBillLedger,
  syncBillCreationAccounting,
} from "../services/bill-accounting.service";
import { findAccountIdByName, postVoucher } from "../services/gl-posting.service";

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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calcLineItems(items: any[], discountLevel: string) {
  return (items || []).map((item: any) => {
    const taxRate = toNum(item.taxRate);
    const taxName = String(item.taxName || "").trim();
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const lineTotal = qty * rate;
    if (discountLevel === "line_item") {
      const discPct = Number(item.discountPercent) || 0;
      const discAmt = Number(item.discountAmount) || (lineTotal * discPct) / 100;
      return {
        ...item,
        quantity: qty,
        rate,
        taxRate,
        taxName,
        discountPercent: discPct,
        discountAmount: discAmt,
        amount: lineTotal - discAmt,
      };
    }
    return {
      ...item,
      quantity: qty,
      rate,
      taxRate,
      taxName,
      discountPercent: 0,
      discountAmount: 0,
      amount: lineTotal,
    };
  });
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function normalizeObjectId(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Types.ObjectId) {
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return Types.ObjectId.isValid(trimmed) ? trimmed : null;
  }

  if (typeof value === "object") {
    const candidate = (value as any)._id;
    if (candidate instanceof Types.ObjectId) {
      return String(candidate);
    }
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return Types.ObjectId.isValid(trimmed) ? trimmed : null;
    }
  }

  return null;
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

function deriveVendorCreditStatus(appliedAmount: number, total: number): "OPEN" | "PARTIALLY_APPLIED" | "CLOSED" {
  if (appliedAmount <= 0) return "OPEN";
  if (round2(appliedAmount) >= round2(total)) return "CLOSED";
  return "PARTIALLY_APPLIED";
}

function recomputePaymentExcess(payment: any): void {
  payment.total_amount_paid = round2(Math.max(0, toNum(payment.total_amount_paid)));
  payment.amount_used_for_bills = round2(Math.max(0, toNum(payment.amount_used_for_bills)));
  payment.amount_refunded = round2(Math.max(0, toNum(payment.amount_refunded)));

  const excess = round2(
    toNum(payment.total_amount_paid) -
      toNum(payment.amount_used_for_bills) -
      toNum(payment.amount_refunded),
  );
  payment.amount_in_excess = round2(Math.max(0, excess));
}

function paymentMadeVoucherPrefix(payment: any): string {
  return `payment-made:${String(payment._id)}`;
}

function paymentMadeVoucherId(payment: any, event: string, key?: string): string {
  return `${paymentMadeVoucherPrefix(payment)}:${event}${key ? `:${key}` : ""}`;
}

async function postPaymentUnapplyOnBillDelete(params: {
  payment: any;
  amount: number;
  bill: any;
  req: AuthenticatedRequest;
}): Promise<void> {
  const { payment, amount, bill, req } = params;
  if (String(payment.status || "") !== "PAID") return;
  if (amount <= 0) return;

  const vendor = await Contact.findOne({
    _id: payment.vendor_id,
    organizationId: payment.organization_id,
    isDeleted: false,
  })
    .select("accountsPayableId")
    .lean();

  const accountsPayableId =
    vendor?.accountsPayableId ||
    (await findAccountIdByName({
      organizationId: payment.organization_id,
      names: ["Accounts Payable", "Trade Payables", "Creditors"],
      rootType: "Liability",
      accountType: "Accounts Payable",
    }));

  const vendorAdvanceId = await findAccountIdByName({
    organizationId: payment.organization_id,
    names: ["Advances to Suppliers", "Vendor Advances", "Advances to Vendors"],
    rootType: "Asset",
    accountType: "Other Current Asset",
  });

  await postVoucher({
    organizationId: payment.organization_id,
    voucherType: "PaymentMade",
    voucherId: paymentMadeVoucherId(payment, "unapply", `bill-delete-${String(bill._id)}-${String(payment._id)}`),
    voucherNo: String(payment.payment_number || ""),
    postingDate: new Date(),
    lines: [
      {
        accountId: vendorAdvanceId,
        debit: amount,
        description: `Bill delete unapply ${payment.payment_number}`,
        contactType: "Vendor",
        contactId: payment.vendor_id,
      },
      {
        accountId: accountsPayableId,
        credit: amount,
        description: `Bill delete unapply ${payment.payment_number}`,
        contactType: "Vendor",
        contactId: payment.vendor_id,
      },
    ],
    description: `Bill deleted unapply ${String(payment.payment_number || "")}`,
    req,
  });
}

async function unapplyPaymentMappingsForBill(bill: any, req: AuthenticatedRequest): Promise<void> {
  const maps = await PaymentBillMap.find({
    organization_id: bill.organizationId,
    bill_id: bill._id,
    is_deleted: false,
    applied_amount: { $gt: 0 },
  });

  for (const map of maps) {
    const amount = round2(toNum(map.applied_amount));
    if (amount <= 0) continue;

    const payment = await PaymentMade.findOne({
      _id: map.payment_id,
      organization_id: bill.organizationId,
      is_deleted: false,
    });

    if (payment) {
      await postPaymentUnapplyOnBillDelete({
        payment,
        amount,
        bill,
        req,
      });

      payment.amount_used_for_bills = round2(
        Math.max(0, toNum(payment.amount_used_for_bills) - amount),
      );
      recomputePaymentExcess(payment);
      payment.audit_log.push({
        action: "UNAPPLY_FROM_BILL",
        details: `Bill ${bill.billNumber} deleted. Unapplied ${amount.toLocaleString("en-IN")}`,
        amount,
        bill_id: bill._id,
        at: new Date(),
        by: req.user?.email || req.user?.name || "System",
      });
      attachUser(payment, req);
      await payment.save();
    }

    map.applied_amount = 0;
    map.is_deleted = true;
    map.deleted_at = new Date();
    attachUser(map, req);
    await map.save();
  }
}

async function unapplyVendorCreditApplicationsForBill(bill: any, req: AuthenticatedRequest): Promise<void> {
  const apps = await VendorCreditApplication.find({
    organizationId: bill.organizationId,
    billId: bill._id,
    isDeleted: false,
    amount: { $gt: 0 },
  });

  for (const app of apps) {
    const amount = round2(toNum(app.amount));
    if (amount <= 0) continue;

    const credit = await VendorCredit.findOne({
      _id: app.vendorCreditId,
      organizationId: bill.organizationId,
      isDeleted: false,
    });

    if (credit) {
      credit.appliedAmount = round2(Math.max(0, toNum(credit.appliedAmount) - amount));
      const refundedAmount = toNum((credit as any).refundedAmount);
      credit.balanceAmount = round2(
        Math.max(0, toNum(credit.total) - toNum(credit.appliedAmount) - refundedAmount),
      );
      if (credit.status !== "VOID") {
        credit.status = deriveVendorCreditStatus(toNum(credit.appliedAmount), toNum(credit.total));
      }
      credit.comments.push({
        author: req.user?.name || req.user?.email || "System",
        text: `Bill ${bill.billNumber} deleted. Unapplied ${amount.toLocaleString("en-IN")}`,
        time: new Date(),
        isSystem: true,
      });
      attachUser(credit, req);
      await credit.save();
    }

    app.amount = 0;
    app.isDeleted = true;
    app.deletedAt = new Date();
    attachUser(app, req);
    await app.save();
  }
}

async function resolveVendorPayableAccount(
  organizationId: any,
  vendorId: any,
  requestedAccountId: any,
) {
  if (requestedAccountId) return requestedAccountId;
  if (!vendorId) return null;

  const vendor = await Contact.findOne({
    _id: vendorId,
    organizationId,
    isDeleted: false,
  })
    .select("accountsPayableId")
    .lean();

  return vendor?.accountsPayableId || null;
}

async function createDraftFixedAssetsForBill(bill: any, req: AuthenticatedRequest): Promise<string[]> {
  const lineItems: any[] = Array.isArray(bill.lineItems) ? bill.lineItems : [];
  const accountIds = Array.from(new Set(
    lineItems
      .filter((li: any) => li && !li.isHeader)
      .map((li: any) => normalizeObjectId(li.accountId))
      .filter((id: string | null): id is string => Boolean(id)),
  ));

  if (accountIds.length === 0) return [];

  const accounts = await Account.find({
    _id: { $in: accountIds.map((id) => new Types.ObjectId(id)) },
    organizationId: bill.organizationId,
    accountType: "Fixed Asset",
    createItemAsFixedAsset: true,
    fixedAssetTypeId: { $ne: null },
  }).populate("fixedAssetTypeId");

  if (accounts.length === 0) return [];

  const accountMap = new Map<string, any>(accounts.map((account: any) => [String(account._id), account]));
  const createdIds: string[] = [];

  for (const line of lineItems) {
    if (!line || line.isHeader) continue;
    const lineAccountId = normalizeObjectId(line.accountId);
    if (!lineAccountId) continue;

    const account = accountMap.get(lineAccountId);
    if (!account || !account.fixedAssetTypeId) continue;

    const fixedAssetType: any = account.fixedAssetTypeId;
    if (!fixedAssetType || fixedAssetType.isDeleted || fixedAssetType.isActive === false) continue;

    const amount = round2(Number(line.amount || 0));
    if (amount <= 0) continue;

    const quantity = Math.max(1, Number(line.quantity || 1) || 1);
    const assetName = String(line.name || line.description || `Fixed Asset from ${bill.billNumber}`).trim() || `Fixed Asset ${bill.billNumber}`;

    const asset = new FixedAsset({
      organizationId: bill.organizationId,
      assetName,
      sourceBillId: bill._id,
      sourceBillNumber: String(bill.billNumber || "").trim(),
      purchaseValue: amount,
      purchaseQuantity: quantity,
      currentQuantity: quantity,
      currentValue: amount,
      disposalValue: 0,
      fixedAssetTypeId: fixedAssetType._id,
      purchaseDate: bill.billDate ? new Date(bill.billDate) : new Date(),
      warrantyExpirationDate: null,
      description: String(line.description || `Created from bill ${bill.billNumber}`).trim(),
      depreciationMethod: fixedAssetType.depreciationMethod,
      depreciationPercentage: fixedAssetType.depreciationPercentage ?? null,
      depreciationFrequency: fixedAssetType.depreciationFrequency,
      assetLifeValue: fixedAssetType.assetLifeValue,
      assetLifeUnit: fixedAssetType.assetLifeUnit,
      computationType: fixedAssetType.computationType,
      depreciationStartDate: bill.billDate ? new Date(bill.billDate) : new Date(),
      fixedAssetAccountId: fixedAssetType.fixedAssetAccountId,
      accumulatedDepreciationAccountId: fixedAssetType.accumulatedDepreciationAccountId,
      depreciationExpenseAccountId: fixedAssetType.depreciationExpenseAccountId,
      status: "DRAFT",
    });
    attachUser(asset, req);
    await asset.save();
    createdIds.push(String(asset._id));
  }

  return createdIds;
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
    .populate("lineItems.customerId", "displayName companyName")
    .populate("lineItems.taxId", "name rate taxType")
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
  if (!req.body.vendorId) throw new ValidationError("Vendor is required");
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

  const accountsPayableId = await resolveVendorPayableAccount(
    oid,
    req.body.vendorId,
    req.body.accountsPayableId,
  );

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
    accountsPayableId,
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

  try {
    const fixedAssetIds = await createDraftFixedAssetsForBill(bill, req);
    if (fixedAssetIds.length > 0) {
      bill.fixedAssetIds = fixedAssetIds.map((id) => new Types.ObjectId(id));
      await bill.save();
    }
  } catch (error) {
    console.error("Auto-create fixed assets failed", error);
  }

  await syncBillCreationAccounting({ bill, req });

  res.status(201).json({ success: true, data: bill });
});

/** POST /api/bills/:id/void */
export const voidBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status === "Void") throw new ValidationError("Bill is already voided");
  if (bill.amountPaid > 0) throw new ValidationError("Cannot void a bill with recorded payments");

  const wasPosted = isPostedBillStatus(String(bill.status || ""));
  const previousStockDeltas = wasPosted
    ? collectBillStockDeltas(bill.lineItems as any[])
    : {};

  bill.status = "Void";
  const reason = req.body.reason || "No reason provided";
  bill.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Bill voided. Reason: ${reason}`,
    time: new Date(),
    isSystem: true,
  });

  await bill.save();

  if (wasPosted) {
    if (Object.keys(previousStockDeltas).length > 0) {
      await applyStockDeltas({
        organizationId: bill.organizationId as any,
        deltas: invertStockDeltas(previousStockDeltas),
        req,
      });
    }

    await reverseBillLedger(bill, req);
  }

  await recomputeContactOutstanding({
    organizationId: bill.organizationId as any,
    contactId: bill.vendorId as any,
    req,
  });

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
  const { _id, __v, fixedAssetIds, ...cloneData } = source as any;

  const bill = new Bill({
    ...cloneData,
    billNumber,
    billDate: new Date(),
    fixedAssetIds: [],
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

  try {
    const clonedFixedAssetIds = await createDraftFixedAssetsForBill(bill, req);
    if (clonedFixedAssetIds.length > 0) {
      bill.fixedAssetIds = clonedFixedAssetIds.map((id) => new Types.ObjectId(id));
      await bill.save();
    }
  } catch (error) {
    console.error("Auto-create fixed assets failed for cloned bill", error);
  }

  await syncBillCreationAccounting({ bill, req });

  res.status(201).json({ success: true, data: bill });
});

/** PATCH /api/bills/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const bill = await Bill.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!bill) throw new NotFoundError("Bill");
  if (bill.status === "Void") throw new ValidationError("Cannot edit a void bill");

  const previousVendorId = String(bill.vendorId || "");
  const previousPosted = isPostedBillStatus(String(bill.status || ""));
  const previousStockDeltas = previousPosted
    ? collectBillStockDeltas(bill.lineItems as any[])
    : {};

  if (previousPosted && hasFinancialEdits(req.body || {})) {
    throw new ValidationError(
      "Cannot edit financial fields after bill is posted. Void and recreate for accounting integrity.",
    );
  }

  if (bill.amountPaid > 0 && hasFinancialEdits(req.body)) {
    throw new ValidationError("Cannot edit financial fields after payment is recorded");
  }

  const prevStatus = bill.status;

  const discountLevel = req.body.discountLevel || bill.discountLevel;
  const nextVendorId = req.body.vendorId !== undefined ? req.body.vendorId : bill.vendorId;
  let nextAccountsPayableId =
    req.body.accountsPayableId !== undefined
      ? req.body.accountsPayableId
      : bill.accountsPayableId;

  if (req.body.accountsPayableId === undefined && (req.body.vendorId !== undefined || !nextAccountsPayableId)) {
    nextAccountsPayableId = await resolveVendorPayableAccount(
      bill.organizationId,
      nextVendorId,
      nextAccountsPayableId,
    );
  }

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
    vendorId: nextVendorId,
    accountsPayableId: nextAccountsPayableId,
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

  const nextPosted = isPostedBillStatus(String(bill.status || ""));
  const nextStockDeltas = nextPosted
    ? collectBillStockDeltas(bill.lineItems as any[])
    : {};
  const stockDeltaDiff = diffStockDeltas(previousStockDeltas, nextStockDeltas);

  if (Object.keys(stockDeltaDiff).length > 0) {
    await applyStockDeltas({
      organizationId: bill.organizationId as any,
      deltas: stockDeltaDiff,
      req,
    });
  }

  if (!previousPosted && nextPosted) {
    await postBillLedger(bill, req);
  } else if (previousPosted && !nextPosted) {
    await reverseBillLedger(bill, req);
  }

  if ((!bill.fixedAssetIds || bill.fixedAssetIds.length === 0) && req.body.lineItems) {
    try {
      const fixedAssetIds = await createDraftFixedAssetsForBill(bill, req);
      if (fixedAssetIds.length > 0) {
        bill.fixedAssetIds = fixedAssetIds.map((id) => new Types.ObjectId(id));
        await bill.save();
      }
    } catch (error) {
      console.error("Auto-create fixed assets failed", error);
    }
  }

  await recomputeContactOutstanding({
    organizationId: bill.organizationId as any,
    contactId: bill.vendorId as any,
    req,
  });

  if (previousVendorId && previousVendorId !== String(bill.vendorId || "")) {
    await recomputeContactOutstanding({
      organizationId: bill.organizationId as any,
      contactId: previousVendorId,
      req,
    });
  }

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

  const vendorId = bill.vendorId;
  const wasPosted = isPostedBillStatus(String(bill.status || ""));
  const previousStockDeltas = wasPosted
    ? collectBillStockDeltas(bill.lineItems as any[])
    : {};

  await unapplyPaymentMappingsForBill(bill, req);
  await unapplyVendorCreditApplicationsForBill(bill, req);

  if (wasPosted) {
    if (Object.keys(previousStockDeltas).length > 0) {
      await applyStockDeltas({
        organizationId: bill.organizationId as any,
        deltas: invertStockDeltas(previousStockDeltas),
        req,
      });
    }

    await reverseBillLedger(bill, req);
  }

  bill.isDeleted = true;
  bill.deletedAt = new Date();
  bill.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: "Bill deleted",
    time: new Date(),
    isSystem: true,
  });
  attachUser(bill, req);
  await bill.save();

  await recomputeContactOutstanding({
    organizationId: bill.organizationId as any,
    contactId: vendorId as any,
    req,
  });

  res.json({ success: true, message: "Bill deleted successfully" });
});
