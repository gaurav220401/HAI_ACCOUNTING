import { Response } from "express";
import { Types } from "mongoose";
import Item from "../models/item.model";
import InventoryAdjustment, {
  type InventoryAdjustmentReason,
} from "../models/inventory-adjustment.model";
import SalesOrder from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import Bill from "../models/bill.model";
import Package from "../models/package.model";
import PurchaseOrder from "../models/purchase-order.model";
import PurchaseReceive from "../models/purchase-receive.model";
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
  const period = String(req.query.period || "month").toLowerCase();

  // 1. Calculate Date Range
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Default: Month

  if (period === "day") {
    startDate = startOfToday;
  } else if (period === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.getFullYear(), now.getMonth(), diff);
    startDate.setHours(0, 0, 0, 0);
  } else if (period === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  const baseFilter = {
    organizationId,
    isDeleted: false,
    inventoryTracked: true,
  } as const;

  const dateFilter = {
    organizationId,
    isDeleted: false,
    createdAt: { $gte: startDate },
  };

  // 2. Fetch Metrics in Parallel
  const [
    trackedItemsCount,
    outOfStockCount,
    lowStockCount,
    stockValueAgg,
    pendingActions,
    topSellingItems,
    salesByChannel,
    salesOrderSummary,
    topVendors,
    receiveHistory,
    lowStockItems,
    categoryDistribution,
  ] = await Promise.all([
    // A. Basic Counts
    Item.countDocuments(baseFilter),
    Item.countDocuments({ ...baseFilter, stockOnHand: { $lte: 0 } }),
    Item.countDocuments({
      ...baseFilter,
      reorderPoint: { $gt: 0 },
      $expr: { $lte: ["$stockOnHand", "$reorderPoint"] },
    }),

    // B. Total Stock Value & Quantity
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

    // C. Pending Actions (Sidebar)
    (async () => {
      const [
        toPack,
        toShip,
        toDeliver,
        toInvoice,
        toBeReceived,
        receiveInProgress,
        pendingPutaways,
        belowReorder,
      ] = await Promise.all([
        SalesOrder.countDocuments({ organizationId: organizationId as any, isDeleted: false, status: "APPROVED", shipmentStatus: "Pending" }),
        Package.countDocuments({ organizationId: organizationId as any, isDeleted: false }), // Simplification: count all active packages for now
        SalesOrder.countDocuments({ organizationId: organizationId as any, isDeleted: false, shipmentStatus: "Shipped" }),
        SalesOrder.countDocuments({ organizationId: organizationId as any, isDeleted: false, status: "PARTIALLY_INVOICED" }),
        PurchaseOrder.countDocuments({ organizationId: organizationId as any, isDeleted: false, status: "Open" }),
        PurchaseReceive.countDocuments({ organizationId: organizationId as any, isDeleted: false, status: "Draft" }), 
        PurchaseReceive.countDocuments({ organizationId: organizationId as any, isDeleted: false, status: "Received", putawayStatus: "Pending" }),
        Item.countDocuments({
          ...baseFilter,
          organizationId: organizationId as any,
          reorderPoint: { $gt: 0 },
          $expr: { $lte: ["$stockOnHand", "$reorderPoint"] },
        } as any),
      ]);
      return {
        sales: { toPack, toShip, toDeliver, toInvoice },
        purchases: { toBeReceived, receiveInProgress, pendingPutaways },
        inventory: { belowReorder },
      };
    })(),

    // D. Top Selling Items
    Invoice.aggregate([
      { $match: { organizationId: organizationId as any, isDeleted: false, createdAt: { $gte: startDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.itemId",
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.amount" },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $project: {
          name: "$item.name",
          sku: "$item.sku",
          quantity: 1,
          revenue: 1,
        },
      },
    ]),

    // E. Sales By Channel
    SalesOrder.aggregate([
      { $match: { organizationId: organizationId as any, isDeleted: false, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $ifNull: ["$deliveryMethod", "Direct Sales"] },
          totalSales: { $sum: "$total" },
        },
      },
      { $sort: { totalSales: -1 } },
    ]),

    // F. Sales Order Summary (Chart Data)
    SalesOrder.aggregate([
      { $match: { organizationId: organizationId as any, isDeleted: false, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === "year" ? "%Y-%m" : "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          quantity: { $sum: { $reduce: { input: "$lineItems", initialValue: 0, in: { $add: ["$$value", "$$this.quantity"] } } } },
          value: { $sum: "$total" },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // G. Top Vendors
    Bill.aggregate([
      { $match: { organizationId: organizationId as any, isDeleted: false, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: "$vendorId",
          totalPurchases: { $sum: "$total" },
          quantity: { $sum: { $reduce: { input: "$lineItems", initialValue: 0, in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] } } } },
        },
      },
      { $sort: { totalPurchases: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "contacts",
          localField: "_id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ["$vendor.displayName", "Unknown Vendor"] },
          totalPurchases: 1,
          quantity: 1,
        },
      },
    ]),

    // H. Receive History
    PurchaseReceive.find({ organizationId: organizationId as any, isDeleted: false })
      .populate("vendorId", "displayName")
      .sort({ receivedDate: -1 })
      .limit(5)
      .lean(),

    // I. Low Stock Items (for widget)
    Item.find({
      ...baseFilter,
      reorderPoint: { $gt: 0 },
      $expr: { $lte: ["$stockOnHand", "$reorderPoint"] },
    })
      .select("name sku stockOnHand reorderPoint inventoryValue")
      .sort({ stockOnHand: 1 })
      .limit(5)
      .lean(),

    // J. Category Distribution
    Item.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: { $ifNull: ["$category", "Uncategorized"] },
          count: { $sum: 1 },
          value: { $sum: { $ifNull: ["$inventoryValue", 0] } },
        },
      },
      { $sort: { value: -1 } },
    ]),
  ]);

  const stockValueTotals = stockValueAgg[0] || { totalQuantity: 0, totalValue: 0 };

  // Calculate Top Stocked Items (Quantity & Value)
  const topStockedItemsByQuantity = await Item.find(baseFilter)
    .sort({ stockOnHand: -1 })
    .limit(5)
    .select("name stockOnHand inventoryValue")
    .lean();

  const topStockedItemsByValue = await Item.find(baseFilter)
    .sort({ inventoryValue: -1 })
    .limit(5)
    .select("name stockOnHand inventoryValue")
    .lean();

  res.json({
    success: true,
    data: {
      period,
      summary: {
        trackedItems: trackedItemsCount,
        outOfStockItems: outOfStockCount,
        lowStockItems: lowStockCount,
        totalQuantity: round2(stockValueTotals.totalQuantity),
        totalValue: round2(stockValueTotals.totalValue),
      },
      pendingActions,
      topSellingItems,
      salesByChannel: salesByChannel.map(c => ({
        channel: c._id || "Direct Sales",
        amount: round2(c.totalSales),
      })),
      salesOrderSummary,
      topStockedItems: {
        byQuantity: topStockedItemsByQuantity,
        byValue: topStockedItemsByValue,
      },
      topVendors,
      receiveHistory: receiveHistory.map((r: any) => ({
        date: r.receivedDate,
        receiveNumber: r.purchaseReceiveNumber,
        vendor: r.vendorId?.displayName || "Unknown",
        quantity: r.totalQuantityReceived,
      })),
      lowStockItems,
      categoryDistribution: categoryDistribution.map((c: any) => ({
        category: c._id,
        count: c.count,
        value: round2(c.value),
      })),
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

