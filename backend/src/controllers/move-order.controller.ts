import { Response } from "express";
import MoveOrder from "../models/move-order.model";
import Item from "../models/item.model";
import InventoryAdjustment from "../models/inventory-adjustment.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { attachUser } from "../plugins";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { status, search } = req.query as Record<string, string>;

  const filter: any = { organizationId: oid, isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (search) {
    filter.orderNumber = { $regex: search, $options: "i" };
  }

  const orders = await MoveOrder.find(filter)
    .populate("fromWarehouseId", "name")
    .populate("toWarehouseId", "name")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  res.json({ success: true, data: orders });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await MoveOrder.findOne({
    _id: req.params.id as any,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("fromWarehouseId")
    .populate("toWarehouseId")
    .populate("items.itemId", "name sku");

  if (!order) throw new NotFoundError("Move Order");
  res.json({ success: true, data: order });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  
  if (!req.body.fromWarehouseId || !req.body.toWarehouseId) {
    throw new ValidationError("From and To warehouses are required");
  }
  if (String(req.body.fromWarehouseId) === String(req.body.toWarehouseId)) {
    throw new ValidationError("Source and destination warehouses cannot be the same");
  }
  if (!req.body.items || req.body.items.length === 0) {
    throw new ValidationError("At least one item is required");
  }

  const lastOrder = await MoveOrder.findOne({ organizationId: oid }).sort({ orderNumber: -1 });
  let nextNumber = "MO-00001";
  if (lastOrder) {
    const match = lastOrder.orderNumber.match(/MO-(\d+)/);
    if (match) {
      nextNumber = `MO-${String(parseInt(match[1], 10) + 1).padStart(5, "0")}`;
    }
  }

  const order = new MoveOrder({
    ...req.body,
    organizationId: oid,
    orderNumber: req.body.orderNumber || nextNumber,
  });

  attachUser(order, req);
  await order.save();

  res.status(201).json({ success: true, data: order });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await MoveOrder.findOne({
    _id: req.params.id as any,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!order) throw new NotFoundError("Move Order");
  if (order.status !== "Draft") {
    throw new ValidationError("Only draft move orders can be updated");
  }

  const allowed = ["date", "fromWarehouseId", "toWarehouseId", "items", "referenceNumber", "notes", "status"];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) (order as any)[field] = req.body[field];
  });

  attachUser(order, req);
  await order.save();

  res.json({ success: true, data: order });
});

export const updateStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await MoveOrder.findOne({
    _id: req.params.id as any,
    organizationId: oid,
    isDeleted: false,
  }).populate("items.itemId");

  if (!order) throw new NotFoundError("Move Order");

  const oldStatus = order.status;
  const newStatus = req.body.status;

  if (oldStatus === newStatus) {
    return res.json({ success: true, data: order });
  }

  // Logic: When moving to 'Received', we create two inventory adjustments (audit records)
  // One for 'From Warehouse' (Decrease) and one for 'To Warehouse' (Increase)
  // Since stockOnHand is global, the net effect on global stock is 0,
  // but it creates the necessary audit lineage.
  if (newStatus === "Received" && oldStatus !== "Received") {
    for (const line of order.items) {
      const item = await Item.findOne({ _id: line.itemId, organizationId: oid });
      if (!item || !item.inventoryTracked) continue;

      // 1. Audit Decrease at Source
      const adjOut = new InventoryAdjustment({
        organizationId: oid,
        itemId: item._id,
        warehouseId: order.fromWarehouseId,
        direction: "Decrease",
        quantityDelta: -line.quantity,
        reason: "Other",
        referenceNumber: order.orderNumber,
        notes: `Transfer Out to ${order.orderNumber}`,
        resultingStockOnHand: item.stockOnHand, // Stock doesn't change globally
        resultingInventoryValue: item.inventoryValue,
      });
      attachUser(adjOut, req);
      await adjOut.save();

      // 2. Audit Increase at Destination
      const adjIn = new InventoryAdjustment({
        organizationId: oid,
        itemId: item._id,
        warehouseId: order.toWarehouseId,
        direction: "Increase",
        quantityDelta: line.quantity,
        reason: "Other",
        referenceNumber: order.orderNumber,
        notes: `Transfer In from ${order.orderNumber}`,
        resultingStockOnHand: item.stockOnHand,
        resultingInventoryValue: item.inventoryValue,
      });
      attachUser(adjIn, req);
      await adjIn.save();
    }
  }

  order.status = newStatus;
  attachUser(order, req);
  await order.save();

  res.json({ success: true, data: order, message: `Move order status updated to ${order.status}` });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await MoveOrder.findOne({
    _id: req.params.id as any,
    organizationId: orgId(req),
  });

  if (!order) throw new NotFoundError("Move Order");

  order.isDeleted = true;
  attachUser(order, req);
  await order.save();

  res.json({ success: true, message: "Move order deleted" });
});
