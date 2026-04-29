import { Response } from "express";
import { Types } from "mongoose";
import Putaway from "../models/putaway.model";
import PurchaseReceive from "../models/purchase-receive.model";
import Item from "../models/item.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
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

  const putawayNumber = req.body.putawayNumber || (await nextPutawayNumber(oid));

  const newPutaway = new Putaway({
    organizationId: oid,
    putawayNumber,
    purchaseReceiveId: receive._id,
    purchaseReceiveNumber: receive.purchaseReceiveNumber,
    date: date ? new Date(date) : new Date(),
    warehouseId,
    lineItems,
    notes,
    status: "Completed",
  });

  attachUser(newPutaway, req);
  await newPutaway.save();

  // Update Purchase Receive Status
  receive.putawayStatus = "Completed"; // Simplifying to Completed for now
  await receive.save();

  // Optionally update item warehouses if they are not set
  for (const li of lineItems) {
    if (li.itemId) {
       await Item.updateOne(
         { _id: li.itemId, organizationId: oid, warehouseId: null },
         { $set: { warehouseId: warehouseId } }
       );
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
    putawayStatus: "Pending",
    isDeleted: false,
  })
    .populate("vendorId", "displayName")
    .sort({ receivedDate: -1 })
    .lean();

  res.json({ success: true, data: pending });
});
