import { Response } from "express";
import { Types } from "mongoose";
import Item from "../models/item.model";
import InventoryAdjustment, {
  type InventoryAdjustmentReason,
} from "../models/inventory-adjustment.model";
import SalesOrder from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import Bill from "../models/bill.model";
import { attachUser } from "../plugins";

import {
  applyInventoryValueDeltas,
  applyStockDeltas,
} from "../services/accounting-sync.service";
import { findAccountIdByName, postVoucher } from "../services/gl-posting.service";
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

const SALES_ORDER_COMMITTED_STATUSES = [
  "APPROVED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
];

const SALES_ORDER_OPEN_STATUSES = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
];

function getOrgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function resolveInventoryAssetAccountId(params: {
  organizationId: Types.ObjectId;
  item: any;
}): Promise<Types.ObjectId> {
  const explicit = String(params.item?.inventoryAccountId || "");
  if (Types.ObjectId.isValid(explicit)) return new Types.ObjectId(explicit);

  return findAccountIdByName({
    organizationId: params.organizationId,
    names: ["Inventory Asset (Stock)", "Inventory Asset", "Inventory", "Stock"],
    rootType: "Asset",
  });
}

async function resolveAdjustmentOffsetAccountId(params: {
  organizationId: Types.ObjectId;
  item: any;
  reqAccountId?: string;
}): Promise<Types.ObjectId> {
  const reqAccountId = String(params.reqAccountId || "").trim();
  if (Types.ObjectId.isValid(reqAccountId)) return new Types.ObjectId(reqAccountId);

  const purchaseAccountId = String(params.item?.purchaseAccountId || "");
  if (Types.ObjectId.isValid(purchaseAccountId)) return new Types.ObjectId(purchaseAccountId);

  return findAccountIdByName({
    organizationId: params.organizationId,
    names: ["Cost of Goods Sold", "COGS", "Purchases", "Inventory Adjustments", "Inventory Adjustment"],
    rootType: "Expense",
  });
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

  const [
    trackedItems,
    outOfStockItems,
    lowStockItemsCount,
    stockTotals,
    committedStockTotals,
    openSalesOrders,
    lowStockItems,
    recentAdjustments,
  ] = await Promise.all([
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
    SalesOrder.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: SALES_ORDER_COMMITTED_STATUSES },
        },
      },
      { $unwind: "$lineItems" },
      {
        $lookup: {
          from: "items",
          let: { itemId: "$lineItems.itemId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$itemId"] },
                    { $eq: ["$organizationId", organizationId] },
                    { $eq: ["$isDeleted", false] },
                    { $eq: ["$inventoryTracked", true] },
                  ],
                },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: "inventoryItem",
        },
      },
      { $match: { "inventoryItem.0": { $exists: true } } },
      {
        $group: {
          _id: null,
          committedQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),
    SalesOrder.countDocuments({
      organizationId,
      isDeleted: false,
      status: { $in: SALES_ORDER_OPEN_STATUSES },
    } as any),
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
  const committedRow = committedStockTotals[0] || { committedQuantity: 0 };
  const totalQuantity = round2(Number(totalsRow.totalQuantity || 0));
  const committedQuantity = round2(Number(committedRow.committedQuantity || 0));
  const availableQuantity = round2(Math.max(totalQuantity - committedQuantity, 0));

  res.json({
    success: true,
    data: {
      summary: {
        trackedItems,
        outOfStockItems,
        lowStockItems: lowStockItemsCount,
        totalQuantity,
        committedQuantity,
        availableQuantity,
        openSalesOrders,
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

  const adjustmentTypeRaw = String(req.body.adjustmentType || "Quantity").trim().toLowerCase();
  const isValueAdjustment = adjustmentTypeRaw === "value";

  const direction = req.body.direction === "Decrease" ? "Decrease" : "Increase";

  const quantityRaw = req.body.quantityDelta ?? req.body.quantity;
  const hasQuantity = quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== "";
  const quantityInput = hasQuantity ? Number(quantityRaw) : 0;

  if (!isValueAdjustment && (!Number.isFinite(quantityInput) || quantityInput <= 0)) {
    throw new ValidationError("quantityDelta must be a positive number");
  }

  const quantity = hasQuantity ? round2(Math.abs(quantityInput)) : 0;
  const signedQuantity = hasQuantity ? (direction === "Decrease" ? -quantity : quantity) : 0;

  const item = await Item.findOne({
    _id: itemId,
    organizationId,
    isDeleted: false,
    inventoryTracked: true,
  }).select("stockOnHand inventoryValue averageCost costPrice inventoryAccountId purchaseAccountId");

  if (!item) {
    throw new NotFoundError("Inventory tracked item");
  }

  const projectedStock = round2(Number(item.stockOnHand || 0) + signedQuantity);
  if (signedQuantity < 0 && projectedStock < 0) {
    throw new ValidationError("Insufficient stock for this adjustment");
  }

  const hasValueDelta = req.body.valueDelta !== undefined && req.body.valueDelta !== null && req.body.valueDelta !== "";

  let valueDelta = 0;
  if (hasValueDelta) {
    const parsedValue = Number(req.body.valueDelta);
    if (!Number.isFinite(parsedValue)) {
      throw new ValidationError("valueDelta must be numeric");
    }
    valueDelta = round2(parsedValue);
  } else {
    if (isValueAdjustment) {
      throw new ValidationError("valueDelta is required for value adjustment");
    }
    const unitCostInput = Number(req.body.unitCost ?? item.averageCost ?? item.costPrice ?? 0);
    const unitCost = Number.isFinite(unitCostInput) ? unitCostInput : 0;
    valueDelta = round2(signedQuantity * unitCost);
  }

  if (signedQuantity !== 0) {
    if (direction === "Decrease" && valueDelta > 0) valueDelta = -valueDelta;
    if (direction === "Increase" && valueDelta < 0) valueDelta = Math.abs(valueDelta);
  }

  if (isValueAdjustment && signedQuantity === 0 && Math.abs(valueDelta) <= 0.0001) {
    throw new ValidationError("valueDelta cannot be zero for value adjustment");
  }

  const warehouseInput = String(req.body.warehouseId || "").trim();
  if (warehouseInput && !Types.ObjectId.isValid(warehouseInput)) {
    throw new ValidationError("warehouseId is invalid");
  }

  const reasonInput = String(req.body.reason || "Manual");
  const reason: InventoryAdjustmentReason = ADJUSTMENT_REASONS.includes(reasonInput as InventoryAdjustmentReason)
    ? (reasonInput as InventoryAdjustmentReason)
    : "Other";

  if (Math.abs(signedQuantity) > 0.0001) {
    await applyStockDeltas({
      organizationId,
      deltas: { [itemId]: signedQuantity },
      req,
    });
  }

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

  const adjustedAt = req.body.adjustedAt ? new Date(req.body.adjustedAt) : new Date();
  const adjustmentId = new Types.ObjectId();

  const adjustment = new InventoryAdjustment({
    _id: adjustmentId,
    organizationId,
    itemId,
    warehouseId: warehouseInput || null,
    direction,
    quantityDelta: signedQuantity,
    valueDelta,
    reason,
    referenceNumber: String(req.body.referenceNumber || "").trim(),
    notes: String(req.body.notes || "").trim(),
    adjustedAt,
    resultingStockOnHand: round2(Number(updatedItem.stockOnHand || 0)),
    resultingInventoryValue: round2(Number((updatedItem as any).inventoryValue || 0)),
  });

  attachUser(adjustment, req);
  await adjustment.save();

  if (Math.abs(valueDelta) > 0.0001) {
    try {
      const [inventoryAccountId, offsetAccountId] = await Promise.all([
        resolveInventoryAssetAccountId({ organizationId, item }),
        resolveAdjustmentOffsetAccountId({
          organizationId,
          item,
          reqAccountId: req.body.accountId,
        }),
      ]);

      if (String(inventoryAccountId) !== String(offsetAccountId)) {
        const amount = round2(Math.abs(valueDelta));
        const inventoryDebit = valueDelta > 0 ? amount : 0;
        const inventoryCredit = valueDelta < 0 ? amount : 0;
        const offsetDebit = valueDelta < 0 ? amount : 0;
        const offsetCredit = valueDelta > 0 ? amount : 0;

        await postVoucher({
          organizationId,
          voucherType: "System",
          voucherId: `inventory-adjustment:${String(adjustmentId)}`,
          voucherNo: `INV-ADJ-${String(adjustmentId).slice(-6).toUpperCase()}`,
          postingDate: adjustedAt,
          description: `Inventory adjustment - ${reason}`,
          req,
          lines: [
            {
              accountId: inventoryAccountId,
              debit: inventoryDebit,
              credit: inventoryCredit,
              description: `Inventory value adjustment for item ${itemId}`,
            },
            {
              accountId: offsetAccountId,
              debit: offsetDebit,
              credit: offsetCredit,
              description: `Inventory adjustment offset for item ${itemId}`,
            },
          ],
        });
      }
    } catch {
      // Non-blocking: stock adjustments should still persist even if GL posting fallback fails.
    }
  }

  await adjustment.populate("itemId", "name sku");
  await adjustment.populate("warehouseId", "name");

  res.status(201).json({ success: true, data: adjustment });
});

export const syncItemStock = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = getOrgId(req);
  const itemId = req.params.id;

  if (!Types.ObjectId.isValid(itemId as any)) {
    throw new ValidationError("Invalid Item ID");
  }

  const [item, invoices, bills, adjustments, salesOrders] = await Promise.all([
    Item.findOne({ _id: itemId, organizationId } as any),
    Invoice.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      "items.itemId": itemId,
    } as any).select("items.itemId items.quantity orderNumber").lean(),
    
    Bill.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      "lineItems.itemId": itemId,
    } as any).select("lineItems.itemId lineItems.quantity lineItems.isHeader").lean(),
    
    InventoryAdjustment.find({
      organizationId,
      itemId,
    } as any).select("quantityDelta").lean(),

    SalesOrder.find({
      organizationId,
      isDeleted: false,
      status: { $in: SALES_ORDER_COMMITTED_STATUSES },
      "lineItems.itemId": itemId,
    } as any).select("lineItems.itemId lineItems.quantity shipmentStatus").lean(),
  ]);

  if (!item) throw new NotFoundError("Item");

  let totalStock = 0;

  // 1. Add Purchases
  for (const bill of bills as any[]) {
    for (const line of bill.lineItems || []) {
      if (String(line.itemId) === itemId && !line.isHeader) {
        totalStock += Number(line.quantity || 0);
      }
    }
  }

  // 2. Add Adjustments
  for (const adj of adjustments as any[]) {
    totalStock += Number(adj.quantityDelta || 0);
  }

  // 3. Subtract Sales (Only those that moved stock)
  // Logic: Invoices move stock IF they are NOT linked to a Delivered SO.
  // Actually, for a simple repair, we subtract ALL invoices that are not "Draft/Void"
  // BUT we must be careful with SO linkage.
  // Standard logic: Subtract all posted invoices. 
  for (const inv of invoices as any[]) {
    for (const line of inv.items || []) {
      if (String(line.itemId) === itemId) {
        totalStock -= Number(line.quantity || 0);
      }
    }
  }

  // 4. Calculate Committed Stock
  // Approved SOs that are NOT delivered.
  let committedStock = 0;
  for (const so of salesOrders as any[]) {
    if (so.shipmentStatus !== "Delivered") {
      for (const line of so.lineItems || []) {
        if (String(line.itemId) === itemId) {
          committedStock += Number(line.quantity || 0);
        }
      }
    }
  }

  const roundedStock = round2(totalStock);
  const roundedCommitted = round2(committedStock);
  
  let changed = false;
  if (item.stockOnHand !== roundedStock) {
    item.stockOnHand = roundedStock;
    changed = true;
  }
  if ((item as any).committedStock !== roundedCommitted) {
    (item as any).committedStock = roundedCommitted;
    changed = true;
  }

  if (changed) {
    attachUser(item as any, req);
    await item.save();
  }

  res.json({ 
    success: true, 
    data: { 
      stockOnHand: item.stockOnHand,
      committedStock: (item as any).committedStock
    } 
  });
});

