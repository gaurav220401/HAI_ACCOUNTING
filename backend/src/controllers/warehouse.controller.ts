import { Response } from "express";
import Warehouse from "../models/warehouse.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const includeInactive = String(req.query.includeInactive || "false") === "true";
  const filter: any = {
    organizationId: orgId(req),
  };
  if (!includeInactive) {
    filter.isActive = true;
  }

  const data = await Warehouse.find({
    ...filter,
  }).sort({ name: 1 });
  res.json({ success: true, data });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = await Warehouse.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!data) throw new Error("Warehouse not found");
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, address, isPrimary, isActive } = req.body;
  if (!name) throw new Error("Name is required");

  // If this is set as primary, unset other primaries
  if (isPrimary) {
    await Warehouse.updateMany({ organizationId: orgId(req) }, { isPrimary: false });
  }

  const warehouse = new Warehouse({
    organizationId: orgId(req),
    name,
    address,
    isPrimary: !!isPrimary,
    isActive: isActive !== undefined ? isActive : true,
  });

  await warehouse.save();
  res.status(201).json({ success: true, data: warehouse });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const warehouse = await Warehouse.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!warehouse) throw new Error("Warehouse not found");

  const { name, address, isPrimary, isActive } = req.body;
  
  if (isPrimary && !warehouse.isPrimary) {
    await Warehouse.updateMany({ organizationId: orgId(req) }, { isPrimary: false });
  }

  if (name !== undefined) warehouse.name = name;
  if (address !== undefined) warehouse.address = address;
  if (isPrimary !== undefined) warehouse.isPrimary = isPrimary;
  if (isActive !== undefined) warehouse.isActive = isActive;

  await warehouse.save();
  res.json({ success: true, data: warehouse });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const warehouse = await Warehouse.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!warehouse) throw new Error("Warehouse not found");
  
  // Can't delete primary warehouse if there are others?
  // Not strictly enforced here, but good practice.
  
  await Warehouse.deleteOne({ _id: warehouse._id });
  res.json({ success: true, message: "Warehouse deleted" });
});
