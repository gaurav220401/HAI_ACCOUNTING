import { Response } from "express";
import Item from "../models/item.model";
import ItemGroup from "../models/item-group.model";
import UnitOfMeasurement from "../models/unit.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
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

  const item = new Item({ organizationId: orgId(req), ...req.body });
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
    "inventoryTracked", "stockOnHand", "reorderPoint", "preferredVendorId",
    "warehouseId", "image", "isActive", "itemType",
  ];
  allowed.forEach((f) => { if (req.body[f] !== undefined) (item as any)[f] = req.body[f]; });
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

/** Seed standard units for a new org */
export const seedUnits = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await UnitOfMeasurement.countDocuments({ organizationId: organization });
  if (existing > 0) return res.json({ success: true, message: "Units already exist" });

  const defaults = [
    { name: "Numbers", abbreviation: "nos" },
    { name: "Kilogram", abbreviation: "kg" },
    { name: "Gram", abbreviation: "g" },
    { name: "Litre", abbreviation: "L" },
    { name: "Millilitre", abbreviation: "mL" },
    { name: "Metre", abbreviation: "m" },
    { name: "Centimetre", abbreviation: "cm" },
    { name: "Hour", abbreviation: "hr" },
    { name: "Minute", abbreviation: "min" },
    { name: "Day", abbreviation: "day" },
    { name: "Box", abbreviation: "box" },
    { name: "Pair", abbreviation: "pair" },
    { name: "Pack", abbreviation: "pack" },
  ];
  await UnitOfMeasurement.insertMany(
    defaults.map((u) => ({ organizationId: organization, ...u, isSystemUnit: true }))
  );
  res.status(201).json({ success: true, message: "Default units created" });
});
