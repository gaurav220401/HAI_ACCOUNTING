import { Response } from "express";
import { Types } from "mongoose";
import Item from "../models/item.model";
import ItemGroup from "../models/item-group.model";
import SalesOrder from "../models/sales-order.model";
import PurchaseOrder from "../models/purchase-order.model";
import Invoice from "../models/invoice.model";
import Bill from "../models/bill.model";
import DeliveryChallan from "../models/delivery-challan.model";
import Package from "../models/package.model";
import PurchaseReceive from "../models/purchase-receive.model";
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
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import Account from "../models/account.model";
import Tax from "../models/tax.model";
import Contact from "../models/contact.model";
import Warehouse from "../models/warehouse.model";

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

type SalesSeriesAggregateRow = {
  _id: string;
  totalAmount?: number;
};

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

const SALES_ORDER_TO_INVOICE_STATUSES: ReadonlyArray<string> = [
  "APPROVED",
  "INVOICED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
  "CLOSED",
];

const PURCHASE_ORDER_PENDING_STATUSES: ReadonlyArray<string> = [
  "Draft",
  "Open",
  "Billed",
  "Closed",
];

const POSTED_INVOICE_STATUSES: ReadonlyArray<string> = [
  "Sent",
  "Viewed",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const POSTED_BILL_STATUSES: ReadonlyArray<string> = [
  "Open",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const SHIPPED_CHALLAN_STATUSES: ReadonlyArray<string> = ["Open", "Delivered"];

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

function addQuantity(map: Map<string, number>, key: string, quantity: unknown): void {
  if (!key) return;
  const qty = round2(Math.max(0, toFiniteNumber(quantity)));
  if (qty <= 0) return;
  map.set(key, round2((map.get(key) || 0) + qty));
}

function getOrderScopedKey(orderKey: string, itemId: string): string {
  return `${orderKey}::${itemId}`;
}

function getLineItemId(value: unknown): string {
  return toObjectIdString(value);
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
    salesOrders,
    purchaseOrders,
    salesSeriesRows,
  ] = await Promise.all([
    SalesOrder.find({
      organizationId,
      isDeleted: false,
      status: { $in: SALES_ORDER_TO_INVOICE_STATUSES },
      "lineItems.itemId": itemId,
    } as any)
      .select("_id salesOrderNumber status shipmentStatus lineItems.itemId lineItems.quantity")
      .lean(),
    PurchaseOrder.find({
      organizationId,
      isDeleted: false,
      status: { $in: PURCHASE_ORDER_PENDING_STATUSES },
      "lineItems.itemId": itemId,
    } as any)
      .select("_id purchaseOrderNumber status lineItems._id lineItems.itemId lineItems.quantity lineItems.isHeader")
      .lean(),
    Invoice.aggregate<SalesSeriesAggregateRow>([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: POSTED_INVOICE_STATUSES },
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

  const salesOrderNumbers = (salesOrders as any[])
    .map((order) => String(order.salesOrderNumber || "").trim())
    .filter(Boolean);
  const salesOrderIds = (salesOrders as any[]).map((order) => order._id);
  const purchaseOrderNumbers = (purchaseOrders as any[])
    .map((order) => String(order.purchaseOrderNumber || "").trim())
    .filter(Boolean);
  const purchaseOrderIds = (purchaseOrders as any[]).map((order) => order._id);
  const itemIdString = String(itemId);

  const [
    postedInvoices,
    packages,
    challans,
    purchaseReceives,
    postedBills,
  ] = await Promise.all([
    Invoice.find({
      organizationId,
      isDeleted: false,
      status: { $in: POSTED_INVOICE_STATUSES },
      orderNumber: { $in: salesOrderNumbers },
      "items.itemId": itemId,
    } as any)
      .select("orderNumber items.itemId items.quantity")
      .lean(),
    Package.find({
      organizationId,
      isDeleted: false,
      salesOrderId: { $in: salesOrderIds },
      "lineItems.itemId": itemId,
    } as any)
      .select("salesOrderId lineItems.itemId lineItems.quantityToPack")
      .lean(),
    DeliveryChallan.find({
      organizationId,
      isDeleted: false,
      salesOrderNumber: { $in: salesOrderNumbers },
      status: { $in: SHIPPED_CHALLAN_STATUSES },
      "items.itemId": itemId,
    } as any)
      .select("salesOrderNumber items.itemId items.quantity")
      .lean(),
    PurchaseReceive.find({
      organizationId,
      isDeleted: false,
      status: "Received",
      purchaseOrderId: { $in: purchaseOrderIds },
      "lineItems.itemId": itemId,
    } as any)
      .select("purchaseOrderId lineItems.itemId lineItems.quantityReceived")
      .lean(),
    Bill.find({
      organizationId,
      isDeleted: false,
      status: { $in: POSTED_BILL_STATUSES },
      orderNumber: { $in: purchaseOrderNumbers },
      "lineItems.itemId": itemId,
    } as any)
      .select("orderNumber lineItems.itemId lineItems.quantity lineItems.isHeader")
      .lean(),
  ]);

  const invoicedByOrderItem = new Map<string, number>();
  for (const invoice of postedInvoices as any[]) {
    const orderNumber = String(invoice.orderNumber || "").trim();
    for (const line of invoice.items || []) {
      if (getLineItemId(line.itemId) !== itemIdString) continue;
      addQuantity(invoicedByOrderItem, getOrderScopedKey(orderNumber, itemIdString), line.quantity);
    }
  }

  const packedByOrderItem = new Map<string, number>();
  for (const pkg of packages as any[]) {
    const orderId = String(pkg.salesOrderId || "");
    for (const line of pkg.lineItems || []) {
      if (getLineItemId(line.itemId) !== itemIdString) continue;
      addQuantity(packedByOrderItem, getOrderScopedKey(orderId, itemIdString), line.quantityToPack);
    }
  }

  const challanShippedByOrderItem = new Map<string, number>();
  for (const challan of challans as any[]) {
    const orderNumber = String(challan.salesOrderNumber || "").trim();
    for (const line of challan.items || []) {
      if (getLineItemId(line.itemId) !== itemIdString) continue;
      addQuantity(challanShippedByOrderItem, getOrderScopedKey(orderNumber, itemIdString), line.quantity);
    }
  }

  let toBeInvoiced = 0;
  let toBeShipped = 0;
  let accountingCommittedStock = 0;
  let physicalCommittedStock = 0;
  let invoicedNotShipped = 0;

  for (const order of salesOrders as any[]) {
    const orderNumber = String(order.salesOrderNumber || "").trim();
    const orderId = String(order._id || "");
    const orderedQty = round2((order.lineItems || []).reduce((sum: number, line: any) => {
      if (getLineItemId(line.itemId) !== itemIdString) return sum;
      return sum + toFiniteNumber(line.quantity);
    }, 0));

    if (orderedQty <= 0) continue;

    const invoicedQty = round2(Math.min(
      orderedQty,
      invoicedByOrderItem.get(getOrderScopedKey(orderNumber, itemIdString)) || 0,
    ));
    const packedQty = packedByOrderItem.get(getOrderScopedKey(orderId, itemIdString)) || 0;
    const challanQty = challanShippedByOrderItem.get(getOrderScopedKey(orderNumber, itemIdString)) || 0;
    let shippedQty = round2(Math.min(orderedQty, Math.max(packedQty, challanQty)));
    if (shippedQty <= 0 && ["Shipped", "Delivered"].includes(String(order.shipmentStatus || ""))) {
      shippedQty = orderedQty;
    }

    toBeInvoiced = round2(toBeInvoiced + Math.max(0, orderedQty - invoicedQty));
    toBeShipped = round2(toBeShipped + Math.max(0, orderedQty - shippedQty));
    accountingCommittedStock = round2(accountingCommittedStock + Math.max(0, orderedQty - Math.max(invoicedQty, shippedQty)));
    physicalCommittedStock = round2(physicalCommittedStock + Math.max(0, orderedQty - shippedQty));
    invoicedNotShipped = round2(invoicedNotShipped + Math.max(0, Math.min(orderedQty, invoicedQty) - shippedQty));
  }

  const receivedByOrderItem = new Map<string, number>();
  for (const receive of purchaseReceives as any[]) {
    const purchaseOrderId = String(receive.purchaseOrderId || "");
    for (const line of receive.lineItems || []) {
      if (getLineItemId(line.itemId) !== itemIdString) continue;
      addQuantity(receivedByOrderItem, getOrderScopedKey(purchaseOrderId, itemIdString), line.quantityReceived);
    }
  }

  const billedByOrderItem = new Map<string, number>();
  for (const bill of postedBills as any[]) {
    const orderNumber = String(bill.orderNumber || "").trim();
    for (const line of bill.lineItems || []) {
      if (line.isHeader || getLineItemId(line.itemId) !== itemIdString) continue;
      addQuantity(billedByOrderItem, getOrderScopedKey(orderNumber, itemIdString), line.quantity);
    }
  }

  let purchasePending = 0;
  let toBeBilled = 0;
  for (const order of purchaseOrders as any[]) {
    const purchaseOrderId = String(order._id || "");
    const purchaseOrderNumber = String(order.purchaseOrderNumber || "").trim();
    const orderedQty = round2((order.lineItems || []).reduce((sum: number, line: any) => {
      if (line.isHeader || getLineItemId(line.itemId) !== itemIdString) return sum;
      return sum + toFiniteNumber(line.quantity);
    }, 0));

    if (orderedQty <= 0) continue;

    const receivedQty = round2(Math.min(
      orderedQty,
      receivedByOrderItem.get(getOrderScopedKey(purchaseOrderId, itemIdString)) || 0,
    ));
    const billedQty = round2(Math.min(
      orderedQty,
      billedByOrderItem.get(getOrderScopedKey(purchaseOrderNumber, itemIdString)) || 0,
    ));

    purchasePending = round2(purchasePending + Math.max(0, orderedQty - receivedQty));
    toBeBilled = round2(toBeBilled + Math.max(0, orderedQty - billedQty));
  }

  const stockOnHand = round2(toFiniteNumber((item as { stockOnHand?: unknown }).stockOnHand));
  const physicalStockOnHand = round2(stockOnHand + invoicedNotShipped);
  const availableForSale = round2(Math.max(stockOnHand - accountingCommittedStock, 0));
  const physicalAvailableForSale = round2(Math.max(physicalStockOnHand - physicalCommittedStock, 0));

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
        committedStock: accountingCommittedStock,
        availableForSale,
      },
      physicalStock: {
        stockOnHand: physicalStockOnHand,
        committedStock: physicalCommittedStock,
        availableForSale: physicalAvailableForSale,
      },
      fulfillment: {
        toBeShipped,
        toBeReceived: purchasePending,
        toBeInvoiced,
        toBeBilled,
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

async function resolveUnitId(organizationId: any, unitInput: any): Promise<Types.ObjectId | null> {
  if (!unitInput) return null;
  const raw = String(unitInput).trim();
  if (!raw) return null;

  // If it's already a valid ObjectId string, return it as ObjectId
  if (Types.ObjectId.isValid(raw)) {
    return new Types.ObjectId(raw);
  }

  // Otherwise, it's a string name/abbreviation. Look it up or create it.
  const escapeRegex = (val: string) => val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  
  let unitDoc = await UnitOfMeasurement.findOne({
    organizationId,
    abbreviation: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
  });

  if (!unitDoc) {
    unitDoc = await UnitOfMeasurement.findOne({
      organizationId,
      name: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
    });
  }

  if (!unitDoc) {
    // Generate a reasonable abbreviation (uppercase, max 10 chars)
    const abbreviation = raw.toUpperCase().replace(/\s+/g, "").substring(0, 10) || "UNIT";
    
    // Check if the generated abbreviation already exists
    const abbreviationExists = await UnitOfMeasurement.findOne({
      organizationId,
      abbreviation: { $regex: `^${escapeRegex(abbreviation)}$`, $options: "i" },
    });
    
    if (abbreviationExists) {
      return abbreviationExists._id as Types.ObjectId;
    }

    unitDoc = new UnitOfMeasurement({
      organizationId,
      name: raw,
      abbreviation,
      isSystemUnit: false,
      isActive: true,
    });
    await unitDoc.save();
  }

  return unitDoc._id as Types.ObjectId;
}

/** POST /api/items */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  if (!req.body.name) throw new ValidationError("Item name is required");
  if (!req.body.itemType) throw new ValidationError("itemType is required (Goods or Service)");

  const payload: any = { ...req.body };
  payload.unit = await resolveUnitId(organizationId, payload.unit);
  payload.itemMode = payload.itemMode || "SingleItem";
  payload.identifiers = Array.isArray(payload.identifiers)
    ? payload.identifiers.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];
  if (payload.returnableItem === undefined) payload.returnableItem = true;
  if (payload.inventoryTracked) {
    const stockOnHand = Number(payload.stockOnHand || 0);
    const averageCost = Number(payload.averageCost || payload.costPrice || 0);
    payload.valuationMethod = payload.valuationMethod || "MovingAverage";
    payload.stockOnHand = round2(stockOnHand);
    payload.averageCost = round2(Math.max(0, averageCost));
    payload.inventoryValue = round2(
      payload.stockOnHand * payload.averageCost,
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

  if (req.body.unit !== undefined) {
    req.body.unit = await resolveUnitId(organizationId, req.body.unit);
  }

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
    (item as any).inventoryValue = round2(Number((item as any).inventoryValue || item.stockOnHand * (item as any).averageCost || 0));

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

  const name = String(req.body.name || "").trim() || option.name;
  if (!name) throw new ValidationError("name is required");

  const existing = await UnitOfMeasurement.findOne({
    organizationId,
    $or: [
      { abbreviation: { $regex: `^${escapeRegex(abbreviation)}$`, $options: "i" } },
      { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
    ],
  }).lean();
  if (existing) {
    throw new ValidationError("Unit already exists");
  }

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

// ─── Import Wizard ─────────────────────────────────────────────────────────

function getTemplatePath(fileName: string): string {
  const paths = [
    path.join(process.cwd(), "src", "files", "items", fileName),
    path.join(process.cwd(), "files", "items", fileName),
    path.join(__dirname, "..", "files", "items", fileName),
    path.join(__dirname, "..", "..", "src", "files", "items", fileName),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Template file ${fileName} not found`);
}

async function mapRowToItem(
  row: Record<string, any>,
  mapping: Record<string, string>,
  organizationId: any,
  duplicateHandling: "skip" | "overwrite",
  caches: {
    units: Map<string, Types.ObjectId | null>;
    accounts: Map<string, Types.ObjectId | null>;
    taxes: Map<string, Types.ObjectId | null>;
    vendors: Map<string, Types.ObjectId | null>;
    warehouses: Map<string, Types.ObjectId | null>;
    groups: Map<string, Types.ObjectId | null>;
  }
): Promise<{ itemData: any; isValid: boolean; status: "Ready" | "Overwrite" | "Skip" | "Error"; error?: string; duplicateItem?: any }> {
  const getMappedValue = (key: string): string => {
    const colName = mapping[key];
    if (!colName) return "";
    return String(row[colName] ?? "").trim();
  };

  const name = getMappedValue("name");
  if (!name) {
    return {
      itemData: {},
      isValid: false,
      status: "Error",
      error: "Item Name is required",
    };
  }

  const sku = getMappedValue("sku");
  const itemTypeInput = getMappedValue("itemType").toLowerCase();
  const itemType = itemTypeInput.includes("service") ? "Service" : "Goods";

  // Check duplicate
  let duplicateItem: any = null;
  if (sku) {
    duplicateItem = await Item.findOne({
      organizationId,
      sku: { $regex: new RegExp("^" + escapeRegex(sku) + "$", "i") },
      isDeleted: false,
    });
  } else {
    duplicateItem = await Item.findOne({
      organizationId,
      name: { $regex: new RegExp("^" + escapeRegex(name) + "$", "i") },
      isDeleted: false,
    });
  }

  let status: "Ready" | "Overwrite" | "Skip" | "Error" = "Ready";
  if (duplicateItem) {
    status = duplicateHandling === "overwrite" ? "Overwrite" : "Skip";
  }

  // Resolve unit
  const unitInput = getMappedValue("unit");
  let unitId: Types.ObjectId | null = null;
  if (unitInput) {
    const cacheKey = unitInput.toLowerCase();
    if (caches.units.has(cacheKey)) {
      unitId = caches.units.get(cacheKey)!;
    } else {
      unitId = await resolveUnitId(organizationId, unitInput);
      caches.units.set(cacheKey, unitId);
    }
  }

  // Resolve accounts
  const resolveAccount = async (val: string): Promise<Types.ObjectId | null> => {
    if (!val) return null;
    const cacheKey = val.toLowerCase();
    if (caches.accounts.has(cacheKey)) return caches.accounts.get(cacheKey)!;
    const acc = await Account.findOne({
      organizationId,
      isDeleted: false,
      $or: [
        { name: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") } },
        { code: val },
        { accountNumber: val },
      ],
    });
    const id = acc ? (acc._id as Types.ObjectId) : null;
    caches.accounts.set(cacheKey, id);
    return id;
  };

  const salesAccountId = await resolveAccount(getMappedValue("salesAccount"));
  const purchaseAccountId = await resolveAccount(getMappedValue("purchaseAccount"));
  const inventoryAccountId = await resolveAccount(getMappedValue("inventoryAccount"));

  // Resolve tax
  const resolveTax = async (val: string): Promise<Types.ObjectId | null> => {
    if (!val) return null;
    const cacheKey = val.toLowerCase();
    if (caches.taxes.has(cacheKey)) return caches.taxes.get(cacheKey)!;
    let tax = await Tax.findOne({
      organizationId,
      isDeleted: false,
      name: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") },
    });
    if (!tax) {
      const rateNum = Number(val.replace(/%/, "").trim());
      if (!isNaN(rateNum)) {
        tax = await Tax.findOne({
          organizationId,
          isDeleted: false,
          rate: rateNum,
        });
      }
    }
    const id = tax ? (tax._id as Types.ObjectId) : null;
    caches.taxes.set(cacheKey, id);
    return id;
  };

  const interStateTaxId = await resolveTax(getMappedValue("interStateTax"));
  const intraStateTaxId = await resolveTax(getMappedValue("intraStateTax"));
  const taxNameId = await resolveTax(getMappedValue("taxName") || getMappedValue("taxPercentage"));
  const taxId = intraStateTaxId || interStateTaxId || taxNameId || null;

  // Resolve warehouse
  const resolveWarehouse = async (val: string): Promise<Types.ObjectId | null> => {
    if (!val) return null;
    const cacheKey = val.toLowerCase();
    if (caches.warehouses.has(cacheKey)) return caches.warehouses.get(cacheKey)!;
    const wh = await Warehouse.findOne({
      organizationId,
      isActive: true,
      name: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") },
    });
    const id = wh ? (wh._id as Types.ObjectId) : null;
    caches.warehouses.set(cacheKey, id);
    return id;
  };

  const warehouseId = await resolveWarehouse(getMappedValue("warehouseName"));

  // Resolve vendor
  const resolveVendor = async (val: string): Promise<Types.ObjectId | null> => {
    if (!val) return null;
    const cacheKey = val.toLowerCase();
    if (caches.vendors.has(cacheKey)) return caches.vendors.get(cacheKey)!;
    const vendor = await Contact.findOne({
      organizationId,
      isDeleted: false,
      contactType: { $in: ["Vendor", "Both"] },
      $or: [
        { displayName: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") } },
        { companyName: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") } },
      ],
    });
    const id = vendor ? (vendor._id as Types.ObjectId) : null;
    caches.vendors.set(cacheKey, id);
    return id;
  };

  const preferredVendorId = await resolveVendor(getMappedValue("preferredVendor"));

  // Resolve item group
  const resolveGroup = async (val: string): Promise<Types.ObjectId | null> => {
    if (!val) return null;
    const cacheKey = val.toLowerCase();
    if (caches.groups.has(cacheKey)) return caches.groups.get(cacheKey)!;
    let group = await ItemGroup.findOne({
      organizationId,
      isActive: true,
      name: { $regex: new RegExp("^" + escapeRegex(val) + "$", "i") },
    });
    if (!group) {
      group = new ItemGroup({
        organizationId,
        name: val,
        isActive: true,
      });
      await group.save();
    }
    caches.groups.set(cacheKey, group._id as Types.ObjectId);
    return group._id as Types.ObjectId;
  };

  const itemGroupId = await resolveGroup(getMappedValue("groupName") || getMappedValue("productType"));

  // Numbers and Boolean conversions
  const sellingPrice = toFiniteNumber(getMappedValue("sellingPrice"));
  const costPrice = toFiniteNumber(getMappedValue("costPrice"));
  const stockOnHand = toFiniteNumber(getMappedValue("stockOnHand"));
  const openingStockValue = toFiniteNumber(getMappedValue("openingStockValue"));
  let averageCost = toFiniteNumber(getMappedValue("averageCost"));
  
  if (!averageCost && openingStockValue && stockOnHand > 0) {
    averageCost = round2(openingStockValue / stockOnHand);
  }
  if (!averageCost) {
    averageCost = costPrice;
  }
  
  const reorderPoint = toFiniteNumber(getMappedValue("reorderPoint"));

  let returnableItem = true;
  const returnableInput = getMappedValue("returnableItem").toLowerCase();
  if (returnableInput === "false" || returnableInput === "no" || returnableInput === "0") {
    returnableItem = false;
  }

  // Identifiers list
  const identifiers = [
    getMappedValue("upc"),
    getMappedValue("ean"),
    getMappedValue("isbn"),
    getMappedValue("partNumber"),
  ].filter(Boolean);

  // Dimensions & Weight
  const packageLength = toFiniteNumber(getMappedValue("packageLength"));
  const packageWidth = toFiniteNumber(getMappedValue("packageWidth"));
  const packageHeight = toFiniteNumber(getMappedValue("packageHeight"));
  const dimensionUnitInput = getMappedValue("dimensionUnit").toLowerCase();
  const dimensionUnit = ["cm", "m", "in", "ft"].includes(dimensionUnitInput)
    ? dimensionUnitInput
    : "cm";

  const dimensions = {
    length: packageLength,
    width: packageWidth,
    height: packageHeight,
    unit: dimensionUnit,
  };

  const packageWeight = toFiniteNumber(getMappedValue("packageWeight"));
  const weightUnitInput = getMappedValue("weightUnit").toLowerCase();
  const weightUnit = ["kg", "g", "lb", "oz"].includes(weightUnitInput) ? weightUnitInput : "kg";

  const weight = {
    value: packageWeight,
    unit: weightUnit,
  };

  // Tax preference
  let taxPreference: "Taxable" | "NonTaxable" | "Exempt" = "Taxable";
  const taxability = getMappedValue("taxability").toLowerCase();
  if (taxability.includes("non") || taxability.includes("untaxable")) {
    taxPreference = "NonTaxable";
  } else if (taxability.includes("exempt")) {
    taxPreference = "Exempt";
  }
  const exemptionReason = getMappedValue("exemptionReason");

  // Track inventory
  const inventoryTracked = stockOnHand > 0;
  const inventoryValue = inventoryTracked ? round2(stockOnHand * averageCost) : 0;

  // Inventory valuation method
  let valuationMethod = "MovingAverage";
  const valMethodInput = getMappedValue("valuationMethod").toLowerCase();
  if (valMethodInput.includes("fifo")) {
    valuationMethod = "FIFO";
  }

  const itemData: any = {
    organizationId,
    name,
    sku,
    itemType,
    itemMode: "SingleItem",
    identifiers,
    brand: getMappedValue("brand"),
    manufacturer: getMappedValue("manufacturer"),
    unit: unitId,
    itemGroupId,
    description: getMappedValue("sellingDescription") || getMappedValue("description"),
    sellingPrice,
    sellingDescription: getMappedValue("sellingDescription"),
    costPrice,
    purchaseDescription: getMappedValue("purchaseDescription"),
    salesAccountId,
    purchaseAccountId,
    inventoryAccountId,
    valuationMethod,
    taxPreference,
    taxId,
    intraStateTaxId,
    interStateTaxId,
    hsnSacCode: getMappedValue("hsnSacCode"),
    inventoryTracked,
    stockOnHand,
    averageCost,
    inventoryValue,
    reorderPoint,
    returnableItem,
    dimensions,
    weight,
    preferredVendorId,
    warehouseId,
    exemptionReason,
    isActive: true,
  };

  return {
    itemData,
    isValid: true,
    status,
    duplicateItem,
  };
}

export const downloadSampleTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const filePath = getTemplatePath("sample_items.csv");

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=sample_items.xlsx");
    res.send(buffer);
  } else {
    res.download(filePath, "sample_items.csv");
  }
});

export const downloadBlankTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const filePath = getTemplatePath("blank_items.csv");

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=blank_items.xlsx");
    res.send(buffer);
  } else {
    res.download(filePath, "blank_items.csv");
  }
});

export const previewImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const caches = {
    units: new Map<string, Types.ObjectId | null>(),
    accounts: new Map<string, Types.ObjectId | null>(),
    taxes: new Map<string, Types.ObjectId | null>(),
    vendors: new Map<string, Types.ObjectId | null>(),
    warehouses: new Map<string, Types.ObjectId | null>(),
    groups: new Map<string, Types.ObjectId | null>(),
  };

  const previewItems: any[] = [];
  let readyCount = 0;
  let overwriteCount = 0;
  let skipCount = 0;
  let invalidCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const result = await mapRowToItem(row, mapping, organizationId, duplicateHandling, caches);
    if (!result.isValid) {
      invalidCount++;
      previewItems.push({
        rowNumber: rowNum,
        name: "",
        sku: "",
        itemType: "Goods",
        sellingPrice: 0,
        costPrice: 0,
        stockOnHand: 0,
        isValid: false,
        status: "Error",
        error: result.error,
      });
    } else {
      if (result.status === "Ready") readyCount++;
      else if (result.status === "Overwrite") overwriteCount++;
      else if (result.status === "Skip") skipCount++;

      previewItems.push({
        rowNumber: rowNum,
        name: result.itemData.name,
        sku: result.itemData.sku,
        itemType: result.itemData.itemType,
        sellingPrice: result.itemData.sellingPrice,
        costPrice: result.itemData.costPrice,
        stockOnHand: result.itemData.stockOnHand,
        isValid: true,
        status: result.status,
      });
    }
  }

  res.json({
    success: true,
    data: {
      totalRows: rows.length,
      readyCount,
      overwriteCount,
      skipCount,
      invalidCount,
      previewItems,
    },
  });
});

export const executeImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const caches = {
    units: new Map<string, Types.ObjectId | null>(),
    accounts: new Map<string, Types.ObjectId | null>(),
    taxes: new Map<string, Types.ObjectId | null>(),
    vendors: new Map<string, Types.ObjectId | null>(),
    warehouses: new Map<string, Types.ObjectId | null>(),
    groups: new Map<string, Types.ObjectId | null>(),
  };

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2; // Row number in spreadsheet (header is row 1)
    try {
      const result = await mapRowToItem(row, mapping, organizationId, duplicateHandling, caches);
      if (!result.isValid) {
        throw new Error(result.error);
      }

      if (result.status === "Skip") {
        successCount++; // Counted as skipped (no DB insertion)
        continue;
      }

      if (result.status === "Overwrite") {
        const item = result.duplicateItem;
        const previousInventorySnapshot: InventoryAccountSnapshot = {
          inventoryTracked: Boolean((item as any).inventoryTracked),
          inventoryAccountId: (item as any).inventoryAccountId,
          inventoryValue: (item as any).inventoryValue,
        };

        // Merge properties
        Object.assign(item, result.itemData);
        attachUser(item, req);
        await item.save();

        await syncInventoryAccountOpening({
          organizationId,
          previous: previousInventorySnapshot,
          next: {
            inventoryTracked: Boolean(item.inventoryTracked),
            inventoryAccountId: (item as any).inventoryAccountId,
            inventoryValue: (item as any).inventoryValue,
          },
        });
      } else {
        // Create new item
        const item = new Item(result.itemData);
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
      }

      successCount++;
    } catch (err: any) {
      failCount++;
      errors.push({ row: rowNum, error: err.message || "Failed to process row" });
    }
  }

  res.json({
    success: true,
    data: {
      successCount,
      failCount,
      errors,
    },
  });
});

const archiverModule = require("archiver");
const archiver = typeof archiverModule === "function" ? archiverModule : archiverModule.default;
const zipEncryptedModule = require("archiver-zip-encrypted");
const zipEncrypted = typeof zipEncryptedModule === "function" ? zipEncryptedModule : zipEncryptedModule.default;

try {
  archiver.registerFormat("zip-encrypted", zipEncrypted);
} catch (e) {
  // Already registered or error
}

export const exportProtectedItems = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { fileName, fileFormat, password, headers, rows } = req.body;

  console.log("DEBUG: archiverModule =", archiverModule);
  console.log("DEBUG: archiver =", archiver);
  console.log("DEBUG: typeof archiver =", typeof archiver);

  if (!password) {
    throw new ValidationError("Password is required for protected export");
  }
  if (!headers || !Array.isArray(headers) || !rows || !Array.isArray(rows)) {
    throw new ValidationError("Headers and rows are required");
  }

  // Create sheet & workbook
  const wsData = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Items");

  const fileExt = (fileFormat || "xlsx").toLowerCase();
  const innerFileName = `items_export_${new Date().toISOString().split('T')[0]}.${fileExt}`;

  // Write workbook to a buffer
  let fileBuffer: Buffer;
  if (fileExt === "csv") {
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    fileBuffer = Buffer.from(csvContent, "utf-8");
  } else {
    fileBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: fileExt === "xls" ? "biff8" : "xlsx"
    });
  }

  // Create an encrypted ZIP using zip20 for standard Windows extractor compatibility
  const archive = archiver("zip-encrypted", {
    zlib: { level: 8 },
    encryptionMethod: "zip20",
    password
  });

  const outputZipName = `${fileName || "items_export"}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${outputZipName}"`);

  archive.pipe(res);
  archive.append(fileBuffer, { name: innerFileName });
  await archive.finalize();
});

