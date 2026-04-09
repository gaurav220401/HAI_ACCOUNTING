import { Response } from "express";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";

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

function normalizeLineItems(items: any[] = []) {
  return (items || []).map((line) => {
    const { taxPercent, ...rest } = line || {};
    return {
      ...rest,
      taxId: rest.taxId || null,
    };
  });
}

/** GET /api/sales-orders?search=...&status=...&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    search,
    status,
    customerId,
    customer_id,
    page = 1,
    limit = 25,
  } = req.query as Record<string, string>;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status) filter.status = status;
  const customerFilterId = customerId || customer_id;
  if (customerFilterId) filter.customerId = customerFilterId;
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
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) } as any)
    .populate("customerId paymentTermsId salesPersonId lineItems.itemId lineItems.taxId");
  if (!order) throw new NotFoundError("Sales Order");
  res.json({ success: true, data: order });
});

/** POST /api/sales-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
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

  const linkedLineItems = normalizeLineItems(
    await applyItemTaxLinkageToItems({
      organizationId: oid,
      contactId: customerId,
      items: lineItems,
    }),
  );

  const { subTotal, total } = computeTotals(linkedLineItems, shippingCharges, adjustment);

  const order = new SalesOrder({
    organizationId: oid,
    ...req.body,
    lineItems: linkedLineItems,
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
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
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

  if (req.body.lineItems || req.body.customerId !== undefined) {
    const customerId = req.body.customerId ?? (order as any).customerId;
    const sourceLineItems = req.body.lineItems || (order as any).lineItems || [];
    const linkedLineItems = normalizeLineItems(
      await applyItemTaxLinkageToItems({
        organizationId: oid,
        contactId: customerId,
        items: sourceLineItems,
      }),
    );
    (order as any).lineItems = linkedLineItems;
  }

  if (
    req.body.lineItems ||
    req.body.customerId !== undefined ||
    req.body.shippingCharges !== undefined ||
    req.body.adjustment !== undefined
  ) {
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
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) } as any);
  if (!order) throw new NotFoundError("Sales Order");

  (order as any).isDeleted = true;
  (order as any).deletedAt = new Date();
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, message: "Sales Order deleted" });
});
