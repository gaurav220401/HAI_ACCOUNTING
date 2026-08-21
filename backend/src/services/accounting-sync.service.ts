import { ClientSession, Types } from "mongoose";
import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import Invoice from "../models/invoice.model";
import Item from "../models/item.model";
import PaymentReceived from "../models/payment-received.model";
import PaymentMade from "../models/payment-made.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import { multiplyMoney, roundMoney } from "../utils/money";
import {
  postCommitmentChange,
  postStockMovement,
  resolveWarehouseId,
} from "./stock-ledger.service";
import type { StockMovementSource } from "../models/stock-movement.model";

export type StockDeltaMap = Record<string, number>;
export type ValueDeltaMap = Record<string, number>;

export interface InvoiceCostLine {
  itemId: string;
  quantity: number;
  costRate: number;
  costAmount: number;
}

function round2(value: number): number {
  return roundMoney(value);
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;
  return new Types.ObjectId(String(value));
}

function normalizeQuantity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return round2(n);
}

function addDelta(map: StockDeltaMap, itemId: string, quantity: number): void {
  if (!itemId || !Types.ObjectId.isValid(itemId)) return;
  const next = round2((map[itemId] || 0) + quantity);
  if (Math.abs(next) < 0.0001) {
    delete map[itemId];
    return;
  }
  map[itemId] = next;
}

function addValueDelta(map: ValueDeltaMap, itemId: string, value: number): void {
  if (!itemId || !Types.ObjectId.isValid(itemId)) return;
  const next = round2((map[itemId] || 0) + value);
  if (Math.abs(next) < 0.0001) {
    delete map[itemId];
    return;
  }
  map[itemId] = next;
}

export function collectBillStockDeltas(lineItems: any[] = []): StockDeltaMap {
  const deltas: StockDeltaMap = {};
  for (const line of lineItems || []) {
    if (!line || line.isHeader) continue;
    const itemId = String(line.itemId || "");
    const qty = normalizeQuantity(line.quantity);
    if (qty <= 0) continue;
    addDelta(deltas, itemId, qty);
  }
  return deltas;
}

export function collectInvoiceStockDeltas(items: any[] = []): StockDeltaMap {
  const deltas: StockDeltaMap = {};
  for (const line of items || []) {
    if (!line) continue;
    const itemId = String(line.itemId || "");
    const qty = normalizeQuantity(line.quantity);
    if (qty <= 0) continue;
    addDelta(deltas, itemId, -qty);
  }
  return deltas;
}

export function diffStockDeltas(previous: StockDeltaMap, next: StockDeltaMap): StockDeltaMap {
  const diff: StockDeltaMap = {};
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);

  for (const key of keys) {
    const delta = round2((next?.[key] || 0) - (previous?.[key] || 0));
    if (Math.abs(delta) < 0.0001) continue;
    diff[key] = delta;
  }

  return diff;
}

export function invertStockDeltas(deltas: StockDeltaMap): StockDeltaMap {
  const out: StockDeltaMap = {};
  for (const [itemId, qty] of Object.entries(deltas || {})) {
    if (Math.abs(qty) < 0.0001) continue;
    out[itemId] = round2(-qty);
  }
  return out;
}

export function collectBillValueDeltas(lineItems: any[] = []): ValueDeltaMap {
  const deltas: ValueDeltaMap = {};
  for (const line of lineItems || []) {
    if (!line || line.isHeader) continue;
    const itemId = String(line.itemId || "");
    const qty = normalizeQuantity(line.quantity);
    if (qty <= 0) continue;
    const amount = round2(Number(line.amount || qty * Number(line.rate || 0)) || 0);
    if (amount === 0) continue;
    addValueDelta(deltas, itemId, amount);
  }
  return deltas;
}

export function diffValueDeltas(previous: ValueDeltaMap, next: ValueDeltaMap): ValueDeltaMap {
  const diff: ValueDeltaMap = {};
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);

  for (const key of keys) {
    const delta = round2((next?.[key] || 0) - (previous?.[key] || 0));
    if (Math.abs(delta) < 0.0001) continue;
    diff[key] = delta;
  }

  return diff;
}

export function invertValueDeltas(deltas: ValueDeltaMap): ValueDeltaMap {
  const out: ValueDeltaMap = {};
  for (const [itemId, value] of Object.entries(deltas || {})) {
    if (Math.abs(value) < 0.0001) continue;
    out[itemId] = round2(-value);
  }
  return out;
}

/**
 * Applies quantity changes through the stock ledger.
 *
 * Signature is unchanged so the ~35 existing call sites keep working, but the
 * write now goes to `StockBalance` + `StockMovement` and `Item.stockOnHand` is
 * refreshed as a rollup rather than incremented in place. Callers that know
 * their warehouse should pass it; the rest fall back per
 * docs/STOCK_LEDGER_SPEC.md §6.2.
 *
 * This is also what finally gives invoices and bills a movement row — until now
 * only manual adjustments, move orders, putaway and shipments left any trace.
 */
export async function applyStockDeltas(params: {
  organizationId: Types.ObjectId | string;
  deltas: StockDeltaMap;
  warehouseId?: Types.ObjectId | string | null;
  source?: { type: StockMovementSource; id: string; number?: string };
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, deltas, warehouseId, source, req, session } = params;
  const oid = toObjectId(organizationId);

  for (const [itemId, delta] of Object.entries(deltas || {})) {
    if (Math.abs(delta) < 0.0001 || !Types.ObjectId.isValid(itemId)) continue;

    const query = Item.findOne({
      _id: itemId,
      organizationId: oid,
      isDeleted: false,
      inventoryTracked: true,
    });
    if (session) query.session(session);

    const item = await query.lean();
    if (!item) continue;

    const wid = await resolveWarehouseId({
      organizationId: oid,
      explicit: warehouseId,
      itemId,
      session,
    });

    await postStockMovement({
      organizationId: oid,
      itemId,
      warehouseId: wid,
      quantityDelta: delta,
      unitCost: Number((item as { averageCost?: number }).averageCost || 0),
      sourceType: source?.type ?? "Adjustment",
      sourceId: source?.id ?? `stock-delta:${itemId}`,
      sourceNumber: source?.number ?? "",
      req,
      session,
    });
  }
}

/** Reserves or releases stock without moving it. Routed through the ledger. */
export async function applyCommittedStockDeltas(params: {
  organizationId: Types.ObjectId | string;
  deltas: StockDeltaMap;
  warehouseId?: Types.ObjectId | string | null;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, deltas, warehouseId, req, session } = params;
  const oid = toObjectId(organizationId);

  for (const [itemId, delta] of Object.entries(deltas || {})) {
    if (Math.abs(delta) < 0.0001 || !Types.ObjectId.isValid(itemId)) continue;

    const query = Item.findOne({
      _id: itemId,
      organizationId: oid,
      isDeleted: false,
      inventoryTracked: true,
    });
    if (session) query.session(session);

    const item = await query.lean();
    if (!item) continue;

    const wid = await resolveWarehouseId({
      organizationId: oid,
      explicit: warehouseId,
      itemId,
      session,
    });

    await postCommitmentChange({
      organizationId: oid,
      itemId,
      warehouseId: wid,
      delta,
      req,
      session,
    });
  }
}

/**
 * Decreases stock on hand and committed stock simultaneously. 
 * Used during shipments or invoicing from a Sales Order.
 */
export async function applyStockAndCommitmentDeltas(params: {
  organizationId: Types.ObjectId | string;
  deltas: StockDeltaMap; // These should be negative for decreases
  warehouseId?: Types.ObjectId | string | null;
  source?: { type: StockMovementSource; id: string; number?: string };
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, deltas, warehouseId, source, req, session } = params;
  const oid = toObjectId(organizationId);

  for (const [itemId, delta] of Object.entries(deltas || {})) {
    if (Math.abs(delta) < 0.0001 || !Types.ObjectId.isValid(itemId)) continue;

    const query = Item.findOne({
      _id: itemId,
      organizationId: oid,
      isDeleted: false,
      inventoryTracked: true,
    });
    if (session) query.session(session);

    const item = await query.lean();
    if (!item) continue;

    const wid = await resolveWarehouseId({
      organizationId: oid,
      explicit: warehouseId,
      itemId,
      session,
    });

    // Shipping against a reserved order both issues the stock and releases the
    // reservation, so the same delta is applied to each.
    await postStockMovement({
      organizationId: oid,
      itemId,
      warehouseId: wid,
      quantityDelta: delta,
      unitCost: Number((item as { averageCost?: number }).averageCost || 0),
      sourceType: source?.type ?? "Shipment",
      sourceId: source?.id ?? `shipment:${itemId}`,
      sourceNumber: source?.number ?? "",
      req,
      session,
    });
    await postCommitmentChange({
      organizationId: oid,
      itemId,
      warehouseId: wid,
      delta,
      req,
      session,
    });
  }
}


export async function applyInventoryValueDeltas(params: {
  organizationId: Types.ObjectId | string;
  deltas: ValueDeltaMap;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, deltas, req, session } = params;
  const oid = toObjectId(organizationId);

  for (const [itemId, delta] of Object.entries(deltas || {})) {
    if (Math.abs(delta) < 0.0001 || !Types.ObjectId.isValid(itemId)) continue;

    const query = Item.findOne({
      _id: itemId,
      organizationId: oid,
      isDeleted: false,
      inventoryTracked: true,
    });
    if (session) query.session(session);

    const item = await query;
    if (!item) continue;

    const currentValue = round2(Number((item as any).inventoryValue || 0));
    let nextValue = round2(currentValue + delta);
    if (nextValue < 0 && Math.abs(nextValue) < 0.01) nextValue = 0;

    (item as any).inventoryValue = nextValue;

    const qty = round2(Number(item.stockOnHand || 0));
    if (qty > 0) {
      (item as any).averageCost = round2(nextValue / qty);
    }

    if (req) attachUser(item, req);

    if (session) await item.save({ session });
    else await item.save();
  }
}

export async function computeInvoiceCostLines(params: {
  organizationId: Types.ObjectId | string;
  items: any[];
  session?: ClientSession;
}): Promise<InvoiceCostLine[]> {
  const { organizationId, items, session } = params;
  const oid = toObjectId(organizationId);
  const itemIds = Array.from(
    new Set(
      (items || [])
        .map((line) => String(line?.itemId || ""))
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  if (itemIds.length === 0) return [];

  const query = Item.find({
    _id: { $in: itemIds },
    organizationId: oid,
    isDeleted: false,
    inventoryTracked: true,
  }).select("averageCost costPrice");
  if (session) query.session(session);
  const trackedItems = await query.lean();

  const costMap = new Map(
    trackedItems.map((item: any) => {
      const avg = Number(item.averageCost || item.costPrice || 0);
      return [String(item._id), round2(avg)];
    }),
  );

  const costs: InvoiceCostLine[] = [];
  for (const line of items || []) {
    const itemId = String(line?.itemId || "");
    if (!costMap.has(itemId)) continue;
    const quantity = normalizeQuantity(line?.quantity);
    if (quantity <= 0) continue;
    const costRate = round2(costMap.get(itemId) || 0);
    const costAmount = multiplyMoney(quantity, costRate);
    costs.push({ itemId, quantity, costRate, costAmount });
  }

  return costs;
}

export async function applyInvoiceCostLines(params: {
  organizationId: Types.ObjectId | string;
  costLines: InvoiceCostLine[];
  direction: "issue" | "reverse";
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<number> {
  const deltas: ValueDeltaMap = {};
  let total = 0;

  for (const line of params.costLines || []) {
    const signed = params.direction === "issue" ? -line.costAmount : line.costAmount;
    addValueDelta(deltas, line.itemId, signed);
    total = round2(total + line.costAmount);
  }

  if (Object.keys(deltas).length > 0) {
    await applyInventoryValueDeltas({
      organizationId: params.organizationId,
      deltas,
      req: params.req,
      session: params.session,
    });
  }

  return total;
}

export async function recomputeContactOutstanding(params: {
  organizationId: Types.ObjectId | string;
  contactId: Types.ObjectId | string;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, contactId, req, session } = params;
  if (!contactId || !Types.ObjectId.isValid(String(contactId))) return;

  const oid = toObjectId(organizationId);
  const cid = toObjectId(contactId);

  const receivableAgg = Invoice.aggregate([
    {
      $match: {
        organizationId: oid,
        customerId: cid,
        isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$balanceDue", 0] } },
      },
    },
  ]);
  if (session) receivableAgg.session(session);

  const payableAgg = Bill.aggregate([
    {
      $match: {
        organizationId: oid,
        vendorId: cid,
        isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$balanceDue", 0] } },
      },
    },
  ]);
  if (session) payableAgg.session(session);

  const excessReceivableAgg = PaymentReceived.aggregate([
    {
      $match: {
        organization_id: oid,
        customer_id: cid,
        status: "PAID",
        is_deleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$amount_in_excess", 0] } },
      },
    },
  ]);
  if (session) excessReceivableAgg.session(session);

  const excessPayableAgg = PaymentMade.aggregate([
    {
      $match: {
        organization_id: oid,
        vendor_id: cid,
        status: "PAID",
        is_deleted: { $ne: true },
        // Only bill-payments and vendor-payable contribute to reducing payable
        payment_type: { $in: ["bill-payment", "vendor-payable"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$amount_in_excess", 0] } },
      },
    },
  ]);
  if (session) excessPayableAgg.session(session);

  // Sum of all active vendor advances (not yet applied to bills)
  const vendorAdvancesAgg = PaymentMade.aggregate([
    {
      $match: {
        organization_id: oid,
        vendor_id: cid,
        status: "PAID",
        is_deleted: { $ne: true },
        payment_type: "vendor-advance",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$amount_in_excess", 0] } },
      },
    },
  ]);
  if (session) vendorAdvancesAgg.session(session);

  const [receivableRows, payableRows, excessReceivableRows, excessPayableRows, vendorAdvancesRows] = await Promise.all([
    receivableAgg,
    payableAgg,
    excessReceivableAgg,
    excessPayableAgg,
    vendorAdvancesAgg,
  ]);

  const totalExcessReceivable = round2(Number(excessReceivableRows[0]?.total || 0));
  const totalExcessPayable = round2(Number(excessPayableRows[0]?.total || 0));
  const totalVendorAdvances = round2(Number(vendorAdvancesRows[0]?.total || 0));

  const contactQuery = Contact.findOne({
    _id: cid,
    organizationId: oid,
    isDeleted: false,
  });
  if (session) contactQuery.session(session);

  const contact = await contactQuery;
  if (!contact) return;

  const ob = Number(contact.openingBalance || 0);
  const isCust = ["Customer", "Both"].includes(contact.contactType);
  const isVend = ["Vendor", "Both"].includes(contact.contactType);

  // receivable = sum of invoice balances - overpayments received
  const receivable = round2((isCust ? ob : 0) + Number(receivableRows[0]?.total || 0) - totalExcessReceivable);
  // payable = opening balance + sum of bill balances (vendor advances are an asset, NOT subtracted from payable)
  const payable = round2((isVend ? ob : 0) + Number(payableRows[0]?.total || 0) - totalExcessPayable);

  contact.outstandingReceivable = receivable;
  contact.outstandingPayable = payable;
  // unusedCredits = unapplied advance amounts (vendor advances in the Advances to Suppliers asset account)
  (contact as any).unusedCredits = isCust ? totalExcessReceivable : (isVend ? totalVendorAdvances : 0);

  if (req) attachUser(contact, req);

  if (session) await contact.save({ session });
  else await contact.save();
}

/**
 * Deducts stock for a Sales Order when it is fully shipped/delivered.
 * Releases committed stock and decreases stock on hand.
 */
export async function fulfillSalesOrderStock(params: {
  organizationId: Types.ObjectId | string;
  order: any;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, order, req, session } = params;
  if (order.stockDeducted) return;

  const stockDeltas: StockDeltaMap = {};
  const valueDeltas: ValueDeltaMap = {};

  for (const line of order.lineItems || []) {
    const itemId = String(line.itemId?._id || line.itemId || "");
    const qty = normalizeQuantity(line.quantity);
    if (qty <= 0 || !itemId) continue;

    // Get current item to find average cost
    const itemQuery = Item.findOne({ _id: itemId, organizationId: toObjectId(organizationId) });
    if (session) itemQuery.session(session);
    const item = await itemQuery;
    
    if (item && item.inventoryTracked) {
      const avgCost = round2(Number((item as any).averageCost || 0));
      const costAmount = round2(qty * avgCost);
      
      addDelta(stockDeltas, itemId, -qty);
      addValueDelta(valueDeltas, itemId, -costAmount);
    }
  }

  if (Object.keys(stockDeltas).length > 0) {
    await applyStockAndCommitmentDeltas({
      organizationId,
      deltas: stockDeltas,
      req,
      session,
    });
  }
  
  if (Object.keys(valueDeltas).length > 0) {
    await applyInventoryValueDeltas({
      organizationId,
      deltas: valueDeltas,
      req,
      session,
    });
  }

  order.stockDeducted = true;
  if (req) attachUser(order, req);
  if (session) await order.save({ session });
  else await order.save();
}
