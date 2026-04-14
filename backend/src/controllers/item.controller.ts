import { Response } from "express";
import { Types } from "mongoose";
import Item from "../models/item.model";
import ItemGroup from "../models/item-group.model";
import SalesOrder from "../models/sales-order.model";
import PurchaseOrder from "../models/purchase-order.model";
import Invoice from "../models/invoice.model";
import UnitOfMeasurement from "../models/unit.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { applyInventoryOpeningDeltas } from "../services/inventory-opening.service";
import { findAccountIdByName } from "../services/gl-posting.service";
import {
  upsertDefaultUnits,
  getUnitOptionByAbbreviation,
  normalizeUnitAbbreviation,
} from "../utils/defaultUnits";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toFiniteNumber(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

type QuantityAggregateRow = {
  _id: null;
  totalQty?: number;
};

type SalesSeriesAggregateRow = {
  _id: string;
  totalAmount?: number;
};

function getAggregateQuantity(rows: QuantityAggregateRow[]): number {
  if (rows.length === 0) return 0;
  return round2(Math.max(0, toFiniteNumber(rows[0].totalQty)));
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthRange(referenceDate: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    1,
    0,
    0,
    0,
    0,
  ));

  const end = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  ));

  return { start, end };
}

function buildDateSeries(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endTime = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  while (cursor.getTime() <= endTime) {
    keys.push(formatDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

const SALES_ORDER_COMMITTED_STATUSES: ReadonlyArray<string> = [
  "APPROVED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
];

const SALES_ORDER_TO_INVOICE_STATUSES: ReadonlyArray<string> = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
];

const PURCHASE_ORDER_PENDING_STATUSES: ReadonlyArray<string> = [
  "Draft",
  "Open",
];

type InventoryAccountSnapshot = {
  inventoryTracked: boolean;
  inventoryAccountId?: unknown;
  inventoryValue?: unknown;
};

type ItemBulkAction = "activate" | "deactivate" | "delete";

const INVENTORY_ASSET_ACCOUNT_NAMES = [
  "Inventory Asset (Stock)",
  "Inventory Asset",
  "Inventory",
  "Stock",
];

function toObjectIdString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return Types.ObjectId.isValid(value) ? value : "";
  if (typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)) {
    const id = String((value as { _id?: unknown })._id || "");
    return Types.ObjectId.isValid(id) ? id : "";
  }
  const raw = String(value);
  return Types.ObjectId.isValid(raw) ? raw : "";
}

function toInventoryValue(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return round2(n);
}

function uniqueValidObjectIdStrings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    const raw = String(value || "").trim();
    if (!Types.ObjectId.isValid(raw)) continue;
    unique.add(raw);
  }
  return Array.from(unique);
}

function computeInventoryAccountDelta(
  previous: InventoryAccountSnapshot | null,
  next: InventoryAccountSnapshot | null,
): Map<string, number> {
  const out = new Map<string, number>();

  const apply = (accountId: string, delta: number) => {
    if (!accountId || Math.abs(delta) < 0.0001) return;
    out.set(accountId, round2((out.get(accountId) || 0) + delta));
  };

  if (previous?.inventoryTracked) {
    const accountId = toObjectIdString(previous.inventoryAccountId);
    const value = toInventoryValue(previous.inventoryValue);
    apply(accountId, -value);
  }

  if (next?.inventoryTracked) {
    const accountId = toObjectIdString(next.inventoryAccountId);
    const value = toInventoryValue(next.inventoryValue);
    apply(accountId, value);
  }

  for (const [key, value] of Array.from(out.entries())) {
    if (Math.abs(value) < 0.0001) out.delete(key);
  }

  return out;
}

async function resolveDefaultInventoryAccountId(
  organizationId: Types.ObjectId | string,
): Promise<string> {
  try {
    const accountId = await findAccountIdByName({
      organizationId,
      names: INVENTORY_ASSET_ACCOUNT_NAMES,
      rootType: "Asset",
      accountType: "Stock",
    });
    return String(accountId);
  } catch {
    return "";
  }
}

async function syncInventoryAccountOpening(params: {
  organizationId: Types.ObjectId | string;
  previous: InventoryAccountSnapshot | null;
  next: InventoryAccountSnapshot | null;
}): Promise<void> {
  const needsFallbackAccount =
    (params.previous?.inventoryTracked && !toObjectIdString(params.previous.inventoryAccountId))
    || (params.next?.inventoryTracked && !toObjectIdString(params.next.inventoryAccountId));

  const fallbackInventoryAccountId = needsFallbackAccount
    ? await resolveDefaultInventoryAccountId(params.organizationId)
    : "";

  const normalizedPrevious: InventoryAccountSnapshot | null = params.previous
    ? {
      ...params.previous,
      inventoryAccountId: params.previous.inventoryTracked
        ? (toObjectIdString(params.previous.inventoryAccountId) || fallbackInventoryAccountId || null)
        : params.previous.inventoryAccountId,
    }
    : null;

  const normalizedNext: InventoryAccountSnapshot | null = params.next
    ? {
      ...params.next,
      inventoryAccountId: params.next.inventoryTracked
        ? (toObjectIdString(params.next.inventoryAccountId) || fallbackInventoryAccountId || null)
        : params.next.inventoryAccountId,
    }
    : null;

  const deltas = computeInventoryAccountDelta(normalizedPrevious, normalizedNext);
  if (deltas.size === 0) return;

  const payload: Record<string, number> = {};
  for (const [accountId, delta] of deltas.entries()) {
    payload[accountId] = delta;
  }

  await applyInventoryOpeningDeltas({
    organizationId: params.organizationId,
    deltas: payload,
  });
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
    { brand: { $regex: search, $options: "i" } },
    { manufacturer: { $regex: search, $options: "i" } },
  ];

  const total = await Item.countDocuments(filter);
  const items = await Item.find(filter)
    .populate("unit itemGroupId taxId intraStateTaxId interStateTaxId")
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
    .populate("unit itemGroupId taxId intraStateTaxId interStateTaxId salesAccountId purchaseAccountId inventoryAccountId preferredVendorId warehouseId");
  if (!item) throw new NotFoundError("Item");
  res.json({ success: true, data: item });
});

/** GET /api/items/:id/inventory-metrics */
export const getInventoryMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const rawItemId = String(req.params.id || "").trim();
  if (!Types.ObjectId.isValid(rawItemId)) {
    throw new ValidationError("Invalid item id");
  }
  const itemId = new Types.ObjectId(rawItemId);

  const item = await Item.findOne({
    _id: itemId,
    organizationId,
    isDeleted: false,
  })
    .select("inventoryTracked stockOnHand")
    .lean();

  if (!item) throw new NotFoundError("Item");

  const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

  const [
    committedQtyRows,
    toBeInvoicedQtyRows,
    purchasePendingQtyRows,
    salesSeriesRows,
  ] = await Promise.all([
    SalesOrder.aggregate<QuantityAggregateRow>([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: SALES_ORDER_COMMITTED_STATUSES },
        },
      },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.itemId": itemId } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),
    SalesOrder.aggregate<QuantityAggregateRow>([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: SALES_ORDER_TO_INVOICE_STATUSES },
        },
      },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.itemId": itemId } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),
    PurchaseOrder.aggregate<QuantityAggregateRow>([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: PURCHASE_ORDER_PENDING_STATUSES },
        },
      },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.isHeader": { $ne: true },
          "lineItems.itemId": itemId,
        },
      },
      {
        $group: {
          _id: null,
          totalQty: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),
    Invoice.aggregate<SalesSeriesAggregateRow>([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $ne: "Void" },
          invoiceDate: {
            $gte: monthStart,
            $lte: monthEnd,
          },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": itemId } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$invoiceDate",
              timezone: "UTC",
            },
          },
          totalAmount: { $sum: { $ifNull: ["$items.amount", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const stockOnHand = round2(toFiniteNumber((item as { stockOnHand?: unknown }).stockOnHand));
  const committedStock = getAggregateQuantity(committedQtyRows);
  const availableForSale = round2(Math.max(stockOnHand - committedStock, 0));
  const toBeInvoiced = getAggregateQuantity(toBeInvoicedQtyRows);
  const purchasePending = getAggregateQuantity(purchasePendingQtyRows);

  const salesByDate = new Map<string, number>();
  for (const row of salesSeriesRows) {
    salesByDate.set(String(row._id), round2(toFiniteNumber(row.totalAmount)));
  }

  const salesPoints = buildDateSeries(monthStart, monthEnd).map((date) => ({
    date,
    amount: round2(salesByDate.get(date) || 0),
  }));
  const totalSalesAmount = round2(salesPoints.reduce((sum, row) => sum + row.amount, 0));

  res.json({
    success: true,
    data: {
      inventoryTracked: Boolean((item as { inventoryTracked?: unknown }).inventoryTracked),
      openingStock: stockOnHand,
      accountingStock: {
        stockOnHand,
        committedStock,
        availableForSale,
      },
      physicalStock: {
        stockOnHand,
        committedStock,
        availableForSale,
      },
      fulfillment: {
        toBeShipped: committedStock,
        toBeReceived: purchasePending,
        toBeInvoiced,
        toBeBilled: purchasePending,
      },
      salesSummary: {
        period: "THIS_MONTH",
        startDate: formatDateKey(monthStart),
        endDate: formatDateKey(monthEnd),
        totalAmount: totalSalesAmount,
        points: salesPoints,
      },
      syncedAt: new Date().toISOString(),
    },
  });
});

/** POST /api/items */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  if (!req.body.name) throw new ValidationError("Item name is required");
  if (!req.body.itemType) throw new ValidationError("itemType is required (Goods or Service)");

  const payload: any = { ...req.body };
  payload.itemMode = payload.itemMode || "SingleItem";
  payload.identifiers = Array.isArray(payload.identifiers)
    ? payload.identifiers.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  if (payload.returnableItem === undefined) payload.returnableItem = true;
  if (payload.inventoryTracked) {
    const stockOnHand = Number(payload.stockOnHand || 0);
    const averageCost = Number(payload.averageCost ?? payload.costPrice ?? 0);
    payload.valuationMethod = payload.valuationMethod || "MovingAverage";
    payload.stockOnHand = round2(stockOnHand);
    payload.averageCost = round2(Math.max(0, averageCost));
    payload.inventoryValue = round2(
      Number(payload.inventoryValue ?? payload.stockOnHand * payload.averageCost) || 0,
    );
  } else {
    payload.inventoryAccountId = null;
    payload.valuationMethod = "MovingAverage";
    payload.stockOnHand = 0;
    payload.averageCost = 0;
    payload.inventoryValue = 0;
  }

  payload.taxId = payload.taxId || null;
  payload.intraStateTaxId = payload.intraStateTaxId || null;
  payload.interStateTaxId = payload.interStateTaxId || null;
  if (payload.taxPreference !== "Taxable") {
    payload.taxId = null;
    payload.intraStateTaxId = null;
    payload.interStateTaxId = null;
  } else if (!payload.taxId) {
    payload.taxId = payload.intraStateTaxId || payload.interStateTaxId || null;
  }

  const item = new Item({ organizationId, ...payload });
  attachUser(item, req);
  await item.save();

  await syncInventoryAccountOpening({
    organizationId,
    previous: null,
    next: {
      inventoryTracked: Boolean(item.inventoryTracked),
      inventoryAccountId: (item as any).inventoryAccountId,
      inventoryValue: (item as any).inventoryValue,
    },
  });

  res.status(201).json({ success: true, data: item });
});

/** PATCH /api/items/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const item = await Item.findOne({ _id: req.params.id, organizationId });
  if (!item) throw new NotFoundError("Item");

  const previousInventorySnapshot: InventoryAccountSnapshot = {
    inventoryTracked: Boolean((item as any).inventoryTracked),
    inventoryAccountId: (item as any).inventoryAccountId,
    inventoryValue: (item as any).inventoryValue,
  };

  const allowed = [
    "name", "sku", "identifiers", "unit", "itemGroupId", "description", "itemMode", "brand", "manufacturer",
    "sellingPrice", "sellingDescription", "costPrice", "purchaseDescription",
    "taxPreference", "taxId", "intraStateTaxId", "interStateTaxId", "hsnSacCode", "salesAccountId", "purchaseAccountId", "inventoryAccountId",
    "inventoryTracked", "stockOnHand", "inventoryValue", "averageCost", "reorderPoint", "returnableItem",
    "dimensions", "weight", "preferredVendorId", "warehouseId", "valuationMethod", "image", "rearImage",
    "otherImages", "isActive", "itemType",
  ];
  allowed.forEach((f) => { if (req.body[f] !== undefined) (item as any)[f] = req.body[f]; });
  if (req.body.identifiers !== undefined) {
    (item as any).identifiers = Array.isArray(req.body.identifiers)
      ? req.body.identifiers.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [];
  }

  (item as any).taxId = (item as any).taxId || null;
  (item as any).intraStateTaxId = (item as any).intraStateTaxId || null;
  (item as any).interStateTaxId = (item as any).interStateTaxId || null;
  if ((item as any).taxPreference !== "Taxable") {
    (item as any).taxId = null;
    (item as any).intraStateTaxId = null;
    (item as any).interStateTaxId = null;
  } else if (!(item as any).taxId) {
    (item as any).taxId = (item as any).intraStateTaxId || (item as any).interStateTaxId || null;
  }

  if (!(item as any).inventoryTracked) {
    (item as any).inventoryAccountId = null;
    (item as any).valuationMethod = "MovingAverage";
    item.stockOnHand = 0;
    (item as any).averageCost = 0;
    (item as any).inventoryValue = 0;
  } else {
    item.stockOnHand = round2(Number(item.stockOnHand || 0));
    (item as any).valuationMethod = (item as any).valuationMethod || "MovingAverage";
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

  await syncInventoryAccountOpening({
    organizationId,
    previous: previousInventorySnapshot,
    next: {
      inventoryTracked: Boolean((item as any).inventoryTracked),
      inventoryAccountId: (item as any).inventoryAccountId,
      inventoryValue: (item as any).inventoryValue,
    },
  });

  res.json({ success: true, data: item });
});

/** POST /api/items/bulk-actions */
export const bulkAction = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const action = String(req.body.action || "").trim().toLowerCase() as ItemBulkAction;
  if (!["activate", "deactivate", "delete"].includes(action)) {
    throw new ValidationError("action must be one of: activate, deactivate, delete");
  }

  const itemIds = uniqueValidObjectIdStrings(req.body.itemIds);
  if (itemIds.length === 0) {
    throw new ValidationError("At least one valid item id is required");
  }

  const objectIds = itemIds.map((id) => new Types.ObjectId(id));
  const baseFilter = {
    organizationId,
    isDeleted: false,
    _id: { $in: objectIds },
  };

  const actorUpdate = req.user?._id ? { updatedBy: req.user._id } : {};

  if (action === "delete") {
    const rows = await Item.find(baseFilter)
      .select("_id inventoryTracked inventoryAccountId inventoryValue")
      .lean();

    if (rows.length === 0) {
      res.json({
        success: true,
        data: {
          action,
          matchedCount: 0,
          modifiedCount: 0,
          itemIds: [],
        },
      });
      return;
    }

    const needsFallbackAccount = rows.some((row: any) => (
      Boolean(row?.inventoryTracked) && !toObjectIdString(row?.inventoryAccountId)
    ));
    const fallbackInventoryAccountId = needsFallbackAccount
      ? await resolveDefaultInventoryAccountId(organizationId)
      : "";

    const deltasByAccount = new Map<string, number>();
    for (const row of rows as any[]) {
      if (!row?.inventoryTracked) continue;
      const accountId = toObjectIdString(row?.inventoryAccountId) || fallbackInventoryAccountId;
      const inventoryValue = toInventoryValue(row?.inventoryValue);
      if (!accountId || Math.abs(inventoryValue) < 0.0001) continue;
      const nextDelta = round2((deltasByAccount.get(accountId) || 0) - inventoryValue);
      deltasByAccount.set(accountId, nextDelta);
    }

    const deleteUpdate = {
      ...actorUpdate,
      isDeleted: true,
      deletedAt: new Date(),
    };

    const updateResult = await Item.updateMany(
      {
        ...baseFilter,
        _id: { $in: rows.map((row: any) => row._id) },
      },
      { $set: deleteUpdate },
    );

    if (deltasByAccount.size > 0) {
      const deltasPayload: Record<string, number> = {};
      for (const [accountId, delta] of deltasByAccount.entries()) {
        if (Math.abs(delta) < 0.0001) continue;
        deltasPayload[accountId] = round2(delta);
      }
      if (Object.keys(deltasPayload).length > 0) {
        await applyInventoryOpeningDeltas({
          organizationId,
          deltas: deltasPayload,
        });
      }
    }

    res.json({
      success: true,
      data: {
        action,
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        itemIds: rows.map((row: any) => String(row._id)),
      },
    });
    return;
  }

  const setIsActive = action === "activate";
  const updateResult = await Item.updateMany(baseFilter, {
    $set: {
      ...actorUpdate,
      isActive: setIsActive,
    },
  });

  res.json({
    success: true,
    data: {
      action,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      itemIds,
    },
  });
});

/** DELETE /api/items/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const item = await Item.findOne({ _id: req.params.id, organizationId });
  if (!item) throw new NotFoundError("Item");

  const previousInventorySnapshot: InventoryAccountSnapshot = {
    inventoryTracked: Boolean((item as any).inventoryTracked),
    inventoryAccountId: (item as any).inventoryAccountId,
    inventoryValue: (item as any).inventoryValue,
  };

  item.isDeleted = true;
  item.deletedAt = new Date();
  attachUser(item, req);
  await item.save();

  await syncInventoryAccountOpening({
    organizationId,
    previous: previousInventorySnapshot,
    next: null,
  });

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
  const organizationId = orgId(req);
  const abbreviation = normalizeUnitAbbreviation(req.body.abbreviation);
  const option = getUnitOptionByAbbreviation(abbreviation);

  if (!abbreviation || !option) {
    throw new ValidationError("Please select a valid unit abbreviation from the standard list");
  }

  const existing = await UnitOfMeasurement.findOne({
    organizationId,
    abbreviation: { $regex: `^${escapeRegex(abbreviation)}$`, $options: "i" },
  }).lean();
  if (existing) {
    throw new ValidationError("A unit with this abbreviation already exists");
  }

  const name = String(req.body.name || "").trim() || option.name;
  if (!name) throw new ValidationError("name is required");

  const unit = new UnitOfMeasurement({ organizationId, name, abbreviation });
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
