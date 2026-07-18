import { Response } from "express";
import Putaway from "../models/putaway.model";
import PurchaseReceive from "../models/purchase-receive.model";
import Item from "../models/item.model";
import InventoryAdjustment from "../models/inventory-adjustment.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
}

async function nextPutawayNumber(organizationId: any): Promise<string> {
  const last = await Putaway.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ putawayNumber: -1 })
    .select("putawayNumber")
    .lean();

  if (!last) return "PA-00001";
  const match = String(last.putawayNumber || "").match(/PA-(\d+)/);
  if (!match) return "PA-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PA-${String(next).padStart(5, "0")}`;
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const number = await nextPutawayNumber(orgId(req));
  res.json({ success: true, data: { putawayNumber: number } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { page = 1, limit = 50 } = req.query;

  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.max(1, Math.min(200, Number(limit)));

  const total = await Putaway.countDocuments({ organizationId: oid, isDeleted: false });
  const data = await Putaway.find({ organizationId: oid, isDeleted: false })
    .populate("warehouseId", "name")
    .sort({ createdAt: -1 })
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

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { purchaseReceiveId, warehouseId, lineItems, notes, date } = req.body;

  if (!purchaseReceiveId) throw new ValidationError("purchaseReceiveId is required");
  if (!warehouseId) throw new ValidationError("warehouseId is required");

  const receive = await PurchaseReceive.findOne({ _id: purchaseReceiveId, organizationId: oid, isDeleted: false });
  if (!receive) throw new NotFoundError("Purchase Receive");

  if (receive.status !== "Received") {
    throw new ValidationError("Putaway can only be done for received purchase receives");
  }

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ValidationError("At least one putaway line item is required");
  }

  const existingPutaways = await Putaway.find({
    organizationId: oid,
    purchaseReceiveId: receive._id,
    isDeleted: false,
    status: { $ne: "Cancelled" },
  })
    .select("lineItems")
    .lean();

  const alreadyPutawayByKey = new Map<string, number>();
  for (const pa of existingPutaways) {
    for (const li of pa.lineItems || []) {
      const key = String(li.itemId || li.name || "");
      if (!key) continue;
      alreadyPutawayByKey.set(key, (alreadyPutawayByKey.get(key) || 0) + toNum(li.quantityPutaway));
    }
  }

  const receiveByKey = new Map<string, { quantityReceived: number; name: string; itemId?: any }>();
  for (const li of receive.lineItems || []) {
    const key = String(li.itemId || li.name || "");
    if (!key) continue;
    receiveByKey.set(key, {
      quantityReceived: toNum(li.quantityReceived),
      name: String(li.name || ""),
      itemId: li.itemId,
    });
  }

  let hasAnyPutawayQty = false;
  const normalizedLineItems = lineItems.map((li: any) => {
    const key = String(li.itemId || li.name || "");
    if (!key) {
      throw new ValidationError("Each putaway line must have itemId or name");
    }

    const receiveLine = receiveByKey.get(key);
    if (!receiveLine) {
      throw new ValidationError(`Item not found in purchase receive: ${String(li.name || key)}`);
    }

    const alreadyPutaway = toNum(alreadyPutawayByKey.get(key) || 0);
    const remaining = Math.max(0, toNum(receiveLine.quantityReceived) - alreadyPutaway);
    const requestedPutaway = Math.max(0, toNum(li.quantityPutaway));

    if (requestedPutaway > remaining) {
      throw new ValidationError(`Putaway quantity exceeds remaining quantity for item ${receiveLine.name || key}`);
    }

    if (requestedPutaway > 0) hasAnyPutawayQty = true;

    return {
      itemId: li.itemId || receiveLine.itemId || null,
      name: String(li.name || receiveLine.name || "").trim(),
      quantityReceived: toNum(li.quantityReceived, receiveLine.quantityReceived),
      quantityPutaway: requestedPutaway,
      remainingQuantity: Math.max(0, remaining - requestedPutaway),
      warehouseId: li.warehouseId || warehouseId,
    };
  });

  if (!hasAnyPutawayQty) {
    throw new ValidationError("At least one line must have quantityPutaway > 0");
  }

  const putawayNumber = req.body.putawayNumber || (await nextPutawayNumber(oid));

  const newPutaway = new Putaway({
    organizationId: oid,
    putawayNumber,
    purchaseReceiveId: receive._id,
    purchaseReceiveNumber: receive.purchaseReceiveNumber,
    date: date ? new Date(date) : new Date(),
    warehouseId,
    lineItems: normalizedLineItems,
    notes,
    status: "Completed",
  });

  attachUser(newPutaway, req);
  await newPutaway.save();

  // Update Purchase Receive putaway status based on cumulative putaway quantities.
  const allPutaways = await Putaway.find({
    organizationId: oid,
    purchaseReceiveId: receive._id,
    isDeleted: false,
    status: { $ne: "Cancelled" },
  })
    .select("lineItems")
    .lean();

  const totalPutawayByKey = new Map<string, number>();
  for (const pa of allPutaways) {
    for (const li of pa.lineItems || []) {
      const key = String(li.itemId || li.name || "");
      if (!key) continue;
      totalPutawayByKey.set(key, (totalPutawayByKey.get(key) || 0) + toNum(li.quantityPutaway));
    }
  }

  let totalReceivedQty = 0;
  let totalPutawayQty = 0;
  for (const li of receive.lineItems || []) {
    const key = String(li.itemId || li.name || "");
    const receivedQty = Math.max(0, toNum(li.quantityReceived));
    totalReceivedQty += receivedQty;
    if (key) totalPutawayQty += Math.max(0, toNum(totalPutawayByKey.get(key) || 0));
  }

  if (totalPutawayQty <= 0) {
    receive.putawayStatus = "Pending";
  } else if (totalPutawayQty + 0.0001 >= totalReceivedQty) {
    receive.putawayStatus = "Completed";
  } else {
    receive.putawayStatus = "Partially Putaway";
  }
  await receive.save();

  // Update Item default warehouse and create InventoryAdjustment for each putaway item
  for (const li of normalizedLineItems) {
    if (li.itemId && toNum(li.quantityPutaway) > 0) {
      const item = await Item.findOne({ _id: li.itemId, organizationId: oid, isDeleted: false });
      if (item) {
        // Update item's default warehouse if it is currently null
        if (!item.warehouseId) {
          item.warehouseId = li.warehouseId || warehouseId;
          await item.save();
        }

        // Create an InventoryAdjustment audit record for this warehouse putaway
        const adj = new InventoryAdjustment({
          organizationId: oid,
          itemId: item._id,
          warehouseId: li.warehouseId || warehouseId,
          direction: "Increase",
          quantityDelta: toNum(li.quantityPutaway),
          valueDelta: round2(toNum(li.quantityPutaway) * toNum(item.averageCost || item.costPrice || 0)),
          reason: "Other",
          referenceNumber: putawayNumber,
          notes: `Putaway from Purchase Receive ${receive.purchaseReceiveNumber}`,
          resultingStockOnHand: item.stockOnHand,
          resultingInventoryValue: item.inventoryValue,
        });
        attachUser(adj, req);
        await adj.save();
      }
    }
  }

  res.status(201).json({ success: true, data: newPutaway });
});

export const getPending = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  // Returns purchase receives that are Received but not yet Putaway
  const pending = await PurchaseReceive.find({
    organizationId: oid,
    status: "Received",
    putawayStatus: { $in: ["Pending", "Partially Putaway"] },
    isDeleted: false,
  })
    .populate("vendorId", "displayName")
    .sort({ receivedDate: -1 })
    .lean();

  res.json({ success: true, data: pending });
});
