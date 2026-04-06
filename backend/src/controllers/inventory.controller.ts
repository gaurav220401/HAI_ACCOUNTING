import { Response } from "express";
import { Types } from "mongoose";
import Item from "../models/item.model";
import InventoryAdjustment, {
  type InventoryAdjustmentReason,
} from "../models/inventory-adjustment.model";
import { attachUser } from "../plugins";
import {
  applyInventoryValueDeltas,
  applyStockDeltas,
} from "../services/accounting-sync.service";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";

const ADJUSTMENT_REASONS: InventoryAdjustmentReason[] = [
  "Stock Count",
  "Damage",
  "Loss",
  "Found",
  "Return",
  "Manual",
  "Other",
];

function getOrgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const overview = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = getOrgId(req);
  const baseFilter = {
    organizationId,
    isDeleted: false,
    inventoryTracked: true,
  } as const;

  const lowStockFilter: Record<string, unknown> = {
    ...baseFilter,
    reorderPoint: { $gt: 0 },
    $expr: { $lte: ["$stockOnHand", "$reorderPoint"] },
  };

  const [trackedItems, outOfStockItems, lowStockItemsCount, stockTotals, lowStockItems, recentAdjustments] = await Promise.all([
    Item.countDocuments(baseFilter),
    Item.countDocuments({ ...baseFilter, stockOnHand: { $lte: 0 } }),
    Item.countDocuments(lowStockFilter),
    Item.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: { $ifNull: ["$stockOnHand", 0] } },
          totalValue: { $sum: { $ifNull: ["$inventoryValue", 0] } },
        },
      },
    ]),
    Item.find(lowStockFilter)
      .select("name sku stockOnHand reorderPoint averageCost inventoryValue")
      .sort({ stockOnHand: 1, name: 1 })
      .limit(12)
      .lean(),
    InventoryAdjustment.find({ organizationId })
      .populate("itemId", "name sku")
      .populate("warehouseId", "name")
      .sort({ adjustedAt: -1, createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const totalsRow = stockTotals[0] || { totalQuantity: 0, totalValue: 0 };

  res.json({
    success: true,
    data: {
      summary: {
        trackedItems,
        outOfStockItems,
        lowStockItems: lowStockItemsCount,
        totalQuantity: round2(Number(totalsRow.totalQuantity || 0)),
        totalValue: round2(Number(totalsRow.totalValue || 0)),
      },
      lowStock: lowStockItems,
      recentAdjustments,
    },
  });
});

export const listAdjustments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = getOrgId(req);
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 200);

  const filter: Record<string, unknown> = { organizationId };
  if (req.query.itemId) {
    const itemId = String(req.query.itemId);
    if (!Types.ObjectId.isValid(itemId)) {
      throw new ValidationError("itemId is invalid");
    }
    filter.itemId = itemId;
  }

  const total = await InventoryAdjustment.countDocuments(filter);
  const rows = await InventoryAdjustment.find(filter)
    .populate("itemId", "name sku")
    .populate("warehouseId", "name")
    .sort({ adjustedAt: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({
    success: true,
    data: rows,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

export const createAdjustment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = getOrgId(req);
  const itemId = String(req.body.itemId || "");
  if (!Types.ObjectId.isValid(itemId)) {
    throw new ValidationError("Valid itemId is required");
  }

  const direction = req.body.direction === "Decrease" ? "Decrease" : "Increase";

  const quantityInput = Number(req.body.quantityDelta ?? req.body.quantity);
  if (!Number.isFinite(quantityInput) || quantityInput <= 0) {
    throw new ValidationError("quantityDelta must be a positive number");
  }
  const quantity = round2(Math.abs(quantityInput));
  const signedQuantity = direction === "Decrease" ? -quantity : quantity;

  const item = await Item.findOne({
    _id: itemId,
    organizationId,
    isDeleted: false,
    inventoryTracked: true,
  }).select("stockOnHand inventoryValue averageCost costPrice");

  if (!item) {
    throw new NotFoundError("Inventory tracked item");
  }

  const projectedStock = round2(Number(item.stockOnHand || 0) + signedQuantity);
  if (direction === "Decrease" && projectedStock < 0) {
    throw new ValidationError("Insufficient stock for this adjustment");
  }

  let valueDelta = 0;
  if (req.body.valueDelta !== undefined && req.body.valueDelta !== null && req.body.valueDelta !== "") {
    const parsedValue = Number(req.body.valueDelta);
    if (!Number.isFinite(parsedValue)) {
      throw new ValidationError("valueDelta must be numeric");
    }
    valueDelta = round2(parsedValue);
  } else {
    const unitCostInput = Number(req.body.unitCost ?? item.averageCost ?? item.costPrice ?? 0);
    const unitCost = Number.isFinite(unitCostInput) ? unitCostInput : 0;
    valueDelta = round2(signedQuantity * unitCost);
  }

  if (direction === "Decrease" && valueDelta > 0) valueDelta = -valueDelta;
  if (direction === "Increase" && valueDelta < 0) valueDelta = Math.abs(valueDelta);

  const warehouseInput = String(req.body.warehouseId || "").trim();
  if (warehouseInput && !Types.ObjectId.isValid(warehouseInput)) {
    throw new ValidationError("warehouseId is invalid");
  }

  const reasonInput = String(req.body.reason || "Manual");
  const reason: InventoryAdjustmentReason = ADJUSTMENT_REASONS.includes(reasonInput as InventoryAdjustmentReason)
    ? (reasonInput as InventoryAdjustmentReason)
    : "Other";

  await applyStockDeltas({
    organizationId,
    deltas: { [itemId]: signedQuantity },
    req,
  });

  if (Math.abs(valueDelta) > 0.0001) {
    await applyInventoryValueDeltas({
      organizationId,
      deltas: { [itemId]: valueDelta },
      req,
    });
  }

  const updatedItem = await Item.findOne({
    _id: itemId,
    organizationId,
    isDeleted: false,
  }).select("stockOnHand inventoryValue");

  if (!updatedItem) {
    throw new NotFoundError("Item");
  }

  const adjustment = new InventoryAdjustment({
    organizationId,
    itemId,
    warehouseId: warehouseInput || null,
    direction,
    quantityDelta: signedQuantity,
    valueDelta,
    reason,
    referenceNumber: String(req.body.referenceNumber || "").trim(),
    notes: String(req.body.notes || "").trim(),
    adjustedAt: req.body.adjustedAt ? new Date(req.body.adjustedAt) : new Date(),
    resultingStockOnHand: round2(Number(updatedItem.stockOnHand || 0)),
    resultingInventoryValue: round2(Number((updatedItem as any).inventoryValue || 0)),
  });

  attachUser(adjustment, req);
  await adjustment.save();

  await adjustment.populate("itemId", "name sku");
  await adjustment.populate("warehouseId", "name");

  res.status(201).json({ success: true, data: adjustment });
});
