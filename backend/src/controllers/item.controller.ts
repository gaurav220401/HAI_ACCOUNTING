import { Response } from "express";
import Item from "../models/item.model";
import ItemGroup from "../models/item-group.model";
import UnitOfMeasurement from "../models/unit.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { upsertDefaultUnits } from "../utils/defaultUnits"; // GST defaults

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ─── Items ─────────────────────────────────────────────────────────────────

/** GET /api/items?search=...&type=Goods|Service&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, search, page = 1, limit = 25 } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (type) filter.itemType = type;
  if (search) filter.$or = [
    { name: { $regex: search, $options: "i" } },
    { sku: { $regex: search, $options: "i" } },
    { description: { $regex: search, $options: "i" } },
  ];

  const total = await Item.countDocuments(filter);
  const items = await Item.find(filter)
    .populate("unit itemGroupId taxId")
    .sort({ name: 1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data: items,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/items/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await Item.findOne({ _id: req.params.id, organizationId: orgId(req) })
    .populate("unit itemGroupId taxId salesAccountId purchaseAccountId preferredVendorId warehouseId");
  if (!item) throw new NotFoundError("Item");
  res.json({ success: true, data: item });
});

/** POST /api/items */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.body.name) throw new ValidationError("Item name is required");
  if (!req.body.itemType) throw new ValidationError("itemType is required (Goods or Service)");

  const payload: any = { ...req.body };
  if (payload.inventoryTracked) {
    const stockOnHand = Number(payload.stockOnHand || 0);
    const averageCost = Number(payload.averageCost ?? payload.costPrice ?? 0);
    payload.stockOnHand = round2(stockOnHand);
    payload.averageCost = round2(Math.max(0, averageCost));
    payload.inventoryValue = round2(
      Number(payload.inventoryValue ?? payload.stockOnHand * payload.averageCost) || 0,
    );
  } else {
    payload.stockOnHand = 0;
    payload.averageCost = 0;
    payload.inventoryValue = 0;
  }

  const item = new Item({ organizationId: orgId(req), ...payload });
  attachUser(item, req);
  await item.save();
  res.status(201).json({ success: true, data: item });
});

/** PATCH /api/items/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await Item.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!item) throw new NotFoundError("Item");

  const allowed = [
    "name", "sku", "unit", "itemGroupId", "description",
    "sellingPrice", "sellingDescription", "costPrice", "purchaseDescription",
    "taxPreference", "taxId", "hsnSacCode", "salesAccountId", "purchaseAccountId",
    "inventoryTracked", "stockOnHand", "inventoryValue", "averageCost", "reorderPoint", "preferredVendorId",
    "warehouseId", "image", "isActive", "itemType",
  ];
  allowed.forEach((f) => { if (req.body[f] !== undefined) (item as any)[f] = req.body[f]; });

  if (!(item as any).inventoryTracked) {
    item.stockOnHand = 0;
    (item as any).averageCost = 0;
    (item as any).inventoryValue = 0;
  } else {
    item.stockOnHand = round2(Number(item.stockOnHand || 0));
    (item as any).averageCost = round2(Number((item as any).averageCost || item.costPrice || 0));
    (item as any).inventoryValue = round2(Number((item as any).inventoryValue || 0));

    if (req.body.averageCost !== undefined && req.body.inventoryValue === undefined) {
      (item as any).inventoryValue = round2(item.stockOnHand * (item as any).averageCost);
    } else if (req.body.inventoryValue !== undefined && req.body.averageCost === undefined && item.stockOnHand > 0) {
      (item as any).averageCost = round2((item as any).inventoryValue / item.stockOnHand);
    } else if (
      req.body.stockOnHand !== undefined &&
      req.body.averageCost === undefined &&
      req.body.inventoryValue === undefined
    ) {
      (item as any).inventoryValue = round2(item.stockOnHand * (item as any).averageCost);
    }
  }

  attachUser(item, req);
  await item.save();
  res.json({ success: true, data: item });
});

/** DELETE /api/items/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const item = await Item.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!item) throw new NotFoundError("Item");
  item.isDeleted = true;
  item.deletedAt = new Date();
  attachUser(item, req);
  await item.save();
  res.json({ success: true, message: "Item deleted" });
});

// ─── Item Groups ────────────────────────────────────────────────────────────

export const listItemGroups = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const groups = await ItemGroup.find({ organizationId: orgId(req), isActive: true }).sort({ name: 1 }).lean();
  res.json({ success: true, data: groups });
});

export const createItemGroup = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.body.name) throw new ValidationError("Group name is required");
  const group = new ItemGroup({ organizationId: orgId(req), ...req.body });
  await group.save();
  res.status(201).json({ success: true, data: group });
});

export const updateItemGroup = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const group = await ItemGroup.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!group) throw new NotFoundError("Item Group");
  ["name", "description", "parentId", "isActive"].forEach((f) => {
    if (req.body[f] !== undefined) (group as any)[f] = req.body[f];
  });
  await group.save();
  res.json({ success: true, data: group });
});

export const deleteItemGroup = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const group = await ItemGroup.findOneAndDelete({ _id: req.params.id, organizationId: orgId(req) });
  if (!group) throw new NotFoundError("Item Group");
  res.json({ success: true, message: "Item group deleted" });
});

// ─── Units of Measurement ────────────────────────────────────────────────────

export const listUnits = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const units = await UnitOfMeasurement.find({ organizationId: orgId(req) }).sort({ name: 1 }).lean();
  res.json({ success: true, data: units });
});

export const createUnit = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.body.name || !req.body.abbreviation) throw new ValidationError("name and abbreviation are required");
  const unit = new UnitOfMeasurement({ organizationId: orgId(req), ...req.body });
  await unit.save();
  res.status(201).json({ success: true, data: unit });
});

export const deleteUnit = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const unit = await UnitOfMeasurement.findOneAndDelete({ _id: req.params.id, organizationId: orgId(req), isSystemUnit: false });
  if (!unit) throw new NotFoundError("Unit (or system unit cannot be deleted)");
  res.json({ success: true, message: "Unit deleted" });
});

/** Seed the 13 GST-standard units for an org (safe to call repeatedly — uses upsert) */
export const seedUnits = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await upsertDefaultUnits(orgId(req));
  res.status(201).json({ success: true, message: "Default units seeded" });
});
