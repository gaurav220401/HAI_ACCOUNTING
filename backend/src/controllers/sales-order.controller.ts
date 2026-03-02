import { Response } from "express";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function computeTotals(lineItems: any[], shippingCharges: number, adjustment: number) {
  const subTotal = (lineItems || []).reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const total = subTotal + (Number(shippingCharges) || 0) + (Number(adjustment) || 0);
  return { subTotal, total };
}

/** GET /api/sales-orders?search=...&status=...&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search, status, page = 1, limit = 25 } = req.query;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { salesOrderNumber: { $regex: search, $options: "i" } },
      { reference: { $regex: search, $options: "i" } },
    ];
  }

  const total = await SalesOrder.countDocuments(filter);
  const orders = await SalesOrder.find(filter)
    .populate("customerId paymentTermsId salesPersonId")
    .sort({ orderDate: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data: orders,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/sales-orders/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) })
    .populate("customerId paymentTermsId salesPersonId lineItems.itemId lineItems.taxId");
  if (!order) throw new NotFoundError("Sales Order");
  res.json({ success: true, data: order });
});

/** POST /api/sales-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    customerId,
    salesOrderNumber,
    orderDate,
    lineItems,
    shippingCharges = 0,
    adjustment = 0,
    status = "DRAFT" as SalesOrderStatus,
  } = req.body;

  if (!customerId) throw new ValidationError("customerId is required");
  if (!salesOrderNumber) throw new ValidationError("salesOrderNumber is required");
  if (!orderDate) throw new ValidationError("orderDate is required");
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ValidationError("At least one line item is required");
  }

  const { subTotal, total } = computeTotals(lineItems, shippingCharges, adjustment);

  const order = new SalesOrder({
    organizationId: orgId(req),
    ...req.body,
    subTotal,
    total,
    status,
  });
  attachUser(order as any, req);
  await order.save();

  res.status(201).json({ success: true, data: order });
});

/** PATCH /api/sales-orders/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!order) throw new NotFoundError("Sales Order");

  const allowed = [
    "customerId",
    "salesOrderNumber",
    "reference",
    "orderDate",
    "expectedShipmentDate",
    "paymentTermsId",
    "deliveryMethod",
    "salesPersonId",
    "lineItems",
    "shippingCharges",
    "adjustment",
    "notes",
    "terms",
    "status",
    "isActive",
  ];

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) (order as any)[f] = req.body[f];
  });

  if (req.body.lineItems || req.body.shippingCharges !== undefined || req.body.adjustment !== undefined) {
    const { subTotal, total } = computeTotals(
      (order as any).lineItems,
      (order as any).shippingCharges,
      (order as any).adjustment,
    );
    (order as any).subTotal = subTotal;
    (order as any).total = total;
  }

  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order });
});

/** DELETE /api/sales-orders/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!order) throw new NotFoundError("Sales Order");

  (order as any).isDeleted = true;
  (order as any).deletedAt = new Date();
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, message: "Sales Order deleted" });
});
