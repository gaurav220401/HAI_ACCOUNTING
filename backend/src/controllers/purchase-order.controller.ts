import { Response } from "express";
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

async function nextPONumber(organizationId: any): Promise<string> {
  const last = await PurchaseOrder.findOne({ organizationId })
    .sort({ purchaseOrderNumber: -1 })
    .select("purchaseOrderNumber")
    .lean();
  if (!last) return "PO-00001";
  const match = last.purchaseOrderNumber.match(/PO-(\d+)/);
  if (!match) return "PO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PO-${String(next).padStart(5, "0")}`;
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

/** GET /api/purchase-orders/next-number */
export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const num = await nextPONumber(orgId(req));
  res.json({ success: true, data: { purchaseOrderNumber: num } });
});

/** GET /api/purchase-orders */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { status, search, vendorId, page = 1, limit = 25, sortBy = "createdAt", sortOrder = "desc" } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  if (search) {
    filter.$or = [
      { purchaseOrderNumber: { $regex: search, $options: "i" } },
      { referenceNumber: { $regex: search, $options: "i" } },
    ];
  }

  const total = await PurchaseOrder.countDocuments(filter);
  const orders = await PurchaseOrder.find(filter)
    .populate("vendorId", "displayName companyName email")
    .populate("paymentTermsId", "name")
    .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({ success: true, data: orders, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
});

/** GET /api/purchase-orders/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("vendorId", "displayName companyName email billingAddress phone")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("discountAccountId", "name");
  if (!po) throw new NotFoundError("Purchase Order");
  res.json({ success: true, data: po });
});

/** POST /api/purchase-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  if (!req.body.purchaseOrderDate) throw new ValidationError("Purchase order date is required");

  const purchaseOrderNumber = req.body.purchaseOrderNumber || (await nextPONumber(oid));
  const discountLevel = req.body.discountLevel || "transaction";
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? (Number(req.body.discountPercent) || 0) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = Number(req.body.taxAmount) || 0;
  const adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
  const total = subTotal - discountAmount - taxAmount + adjustmentAmount;

  const po = new PurchaseOrder({
    organizationId: oid,
    vendorId: req.body.vendorId || null,
    deliveryAddressType: req.body.deliveryAddressType || "Organization",
    deliveryCustomerId: req.body.deliveryCustomerId || null,
    purchaseOrderNumber,
    referenceNumber: req.body.referenceNumber || "",
    purchaseOrderDate: req.body.purchaseOrderDate,
    deliveryDate: req.body.deliveryDate || null,
    paymentTermsId: req.body.paymentTermsId || null,
    shipmentPreference: req.body.shipmentPreference || "",
    discountLevel,
    discountAccountId: req.body.discountAccountId || null,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType: req.body.taxType || "none",
    tdsId: req.body.tdsId || null,
    taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: req.body.status || "Draft",
  });
  attachUser(po, req);
  await po.save();
  res.status(201).json({ success: true, data: po });
});

/** PATCH /api/purchase-orders/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");

  const discountLevel = req.body.discountLevel || po.discountLevel;
  const lineItems = req.body.lineItems ? calcLineItems(req.body.lineItems, discountLevel) : po.lineItems;
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? (Number(req.body.discountPercent) ?? po.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = Number(req.body.taxAmount) ?? po.taxAmount;
  const adjustmentAmount = Number(req.body.adjustmentAmount) ?? po.adjustmentAmount;
  const total = subTotal - discountAmount - taxAmount + adjustmentAmount;

  Object.assign(po, {
    vendorId: req.body.vendorId !== undefined ? req.body.vendorId : po.vendorId,
    deliveryAddressType: req.body.deliveryAddressType || po.deliveryAddressType,
    deliveryCustomerId: req.body.deliveryCustomerId !== undefined ? req.body.deliveryCustomerId : po.deliveryCustomerId,
    referenceNumber: req.body.referenceNumber !== undefined ? req.body.referenceNumber : po.referenceNumber,
    purchaseOrderDate: req.body.purchaseOrderDate || po.purchaseOrderDate,
    deliveryDate: req.body.deliveryDate !== undefined ? req.body.deliveryDate : po.deliveryDate,
    paymentTermsId: req.body.paymentTermsId !== undefined ? req.body.paymentTermsId : po.paymentTermsId,
    shipmentPreference: req.body.shipmentPreference !== undefined ? req.body.shipmentPreference : po.shipmentPreference,
    discountLevel,
    discountAccountId: req.body.discountAccountId !== undefined ? req.body.discountAccountId : po.discountAccountId,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType: req.body.taxType || po.taxType,
    tdsId: req.body.tdsId !== undefined ? req.body.tdsId : po.tdsId,
    taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || po.adjustmentLabel,
    adjustmentAmount,
    total,
    notes: req.body.notes !== undefined ? req.body.notes : po.notes,
    termsAndConditions: req.body.termsAndConditions !== undefined ? req.body.termsAndConditions : po.termsAndConditions,
    attachments: req.body.attachments || po.attachments,
    status: req.body.status || po.status,
  });
  attachUser(po, req);
  await po.save();
  res.json({ success: true, data: po });
});

/** DELETE /api/purchase-orders/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");
  po.isDeleted = true;
  po.deletedAt = new Date();
  attachUser(po, req);
  await po.save();
  res.json({ success: true, message: "Purchase Order deleted" });
});
