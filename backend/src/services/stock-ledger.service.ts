import { ClientSession, Types } from "mongoose";
import Item from "../models/item.model";
import Warehouse from "../models/warehouse.model";
import StockBalance from "../models/stock-balance.model";
import StockMovement, { StockMovementSource } from "../models/stock-movement.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest } from "../types";
import { ValidationError } from "../utils/errors";
import { roundMoney } from "../utils/money";

/**
 * The single write path for stock.
 *
 * Every quantity change goes through `postStockMovement`, which does three
 * things in one place: append an immutable `StockMovement`, upsert the
 * `StockBalance` row for that (item, warehouse, batch), and refresh the rollup
 * fields on `Item`.
 *
 * The rollup is deliberate. Roughly a hundred call sites read
 * `Item.stockOnHand` — every report, the item list, low-stock queries, the
 * chatbot context. Maintaining it here means all of them keep working untouched
 * while per-warehouse detail becomes available additively. See
 * docs/STOCK_LEDGER_SPEC.md §4.
 */

function round2(value: number): number {
  return roundMoney(Number(value) || 0);
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

export interface PostMovementParams {
  organizationId: Types.ObjectId | string;
  itemId: Types.ObjectId | string;
  warehouseId: Types.ObjectId | string;
  batchId?: Types.ObjectId | string | null;
  /** Signed. Negative issues stock, positive receives it. */
  quantityDelta: number;
  /** Per-unit cost of a receipt. Ignored on issues, which use the row's average. */
  unitCost?: number;
  sourceType: StockMovementSource;
  sourceId: string;
  sourceNumber?: string;
  notes?: string;
  movedAt?: Date;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}

/**
 * Resolves which warehouse a movement belongs to.
 *
 * Most documents do not carry a warehouse yet, so this falls back in the order
 * set out in the spec: explicit → the item's default → the org's primary → the
 * only warehouse there is. Failing all of those is an error rather than a silent
 * guess, because putting stock in the wrong place is worse than refusing to.
 */
export async function resolveWarehouseId(params: {
  organizationId: Types.ObjectId | string;
  explicit?: Types.ObjectId | string | null;
  itemId?: Types.ObjectId | string | null;
  session?: ClientSession;
}): Promise<Types.ObjectId> {
  const { organizationId, explicit, itemId, session } = params;
  const oid = toObjectId(organizationId);

  if (explicit && Types.ObjectId.isValid(String(explicit))) {
    return toObjectId(explicit);
  }

  if (itemId && Types.ObjectId.isValid(String(itemId))) {
    const q = Item.findOne({ _id: itemId, organizationId: oid }).select("warehouseId");
    if (session) q.session(session);
    const item = await q.lean();
    const wh = (item as { warehouseId?: Types.ObjectId } | null)?.warehouseId;
    if (wh) return toObjectId(wh);
  }

  const primaryQuery = Warehouse.findOne({ organizationId: oid, isDeleted: false, isPrimary: true }).select("_id");
  if (session) primaryQuery.session(session);
  const primary = await primaryQuery.lean();
  if (primary) return toObjectId((primary as { _id: Types.ObjectId })._id);

  const anyQuery = Warehouse.find({ organizationId: oid, isDeleted: false }).select("_id").limit(2);
  if (session) anyQuery.session(session);
  const all = await anyQuery.lean();
  if (all.length === 1) return toObjectId((all[0] as { _id: Types.ObjectId })._id);

  throw new ValidationError(
    all.length === 0
      ? "No warehouse exists for this organization. Create one before recording stock."
      : "Multiple warehouses exist and none is marked primary. Set a primary warehouse or specify one on the document.",
  );
}

/** Recomputes Item rollups from the balance rows. Call inside the same session. */
export async function refreshItemRollup(params: {
  organizationId: Types.ObjectId | string;
  itemId: Types.ObjectId | string;
  session?: ClientSession;
}): Promise<{ stockOnHand: number; inventoryValue: number; averageCost: number }> {
  const { organizationId, itemId, session } = params;
  const oid = toObjectId(organizationId);

  const pipeline = [
    { $match: { organizationId: oid, itemId: toObjectId(itemId) } },
    {
      $group: {
        _id: null,
        quantity: { $sum: "$quantity" },
        committed: { $sum: "$committedQuantity" },
        value: { $sum: "$value" },
      },
    },
  ];

  const agg = session
    ? await StockBalance.aggregate(pipeline).session(session)
    : await StockBalance.aggregate(pipeline);

  const totals = agg[0] || { quantity: 0, committed: 0, value: 0 };
  const stockOnHand = round2(totals.quantity);
  const inventoryValue = round2(totals.value);
  const averageCost = stockOnHand > 0 ? round2(inventoryValue / stockOnHand) : 0;

  await Item.updateOne(
    { _id: itemId, organizationId: oid },
    {
      $set: {
        stockOnHand,
        committedStock: round2(totals.committed),
        inventoryValue,
        averageCost,
      },
    },
    session ? { session } : {},
  );

  return { stockOnHand, inventoryValue, averageCost };
}

/**
 * Seeds an item's opening balance the first time the ledger touches it.
 *
 * The ledger derives `Item.stockOnHand` from balance rows, so an item that has
 * stock but no rows yet would be reset to just the incoming delta. Rather than
 * depend on the backfill having run first, the first movement for an untracked
 * item converts its existing scalar into a real `Opening` row.
 *
 * That makes the cutover safe in either order and the backfill idempotent.
 */
async function ensureSeeded(params: {
  organizationId: Types.ObjectId;
  itemId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, itemId, warehouseId, req, session } = params;

  const countQuery = StockBalance.countDocuments({ organizationId, itemId });
  if (session) countQuery.session(session);
  if ((await countQuery) > 0) return;

  const itemQuery = Item.findOne({ _id: itemId, organizationId }).select("stockOnHand inventoryValue averageCost committedStock");
  if (session) itemQuery.session(session);
  const item = await itemQuery.lean();
  if (!item) return;

  const qty = round2(Number((item as { stockOnHand?: number }).stockOnHand || 0));
  const committed = round2(Number((item as { committedStock?: number }).committedStock || 0));
  const value = round2(Number((item as { inventoryValue?: number }).inventoryValue || 0));
  const cost = round2(Number((item as { averageCost?: number }).averageCost || 0));

  // Nothing to carry over, but still create the row so later movements have a
  // home and the "already seeded" check short-circuits next time.
  const opening = new StockBalance({
    organizationId, itemId, warehouseId, batchId: null,
    quantity: qty,
    committedQuantity: committed,
    averageCost: cost,
    value: value || round2(qty * cost),
  });
  if (req) attachUser(opening, req);
  await (session ? opening.save({ session }) : opening.save());

  if (Math.abs(qty) > 0.0001) {
    const movement = new StockMovement({
      organizationId, itemId, warehouseId, batchId: null,
      quantityDelta: qty,
      valueDelta: opening.value,
      resultingQuantity: qty,
      resultingValue: opening.value,
      sourceType: "Opening",
      sourceId: `opening:${String(itemId)}`,
      sourceNumber: "",
      notes: "Opening balance carried over from Item.stockOnHand",
      movedAt: new Date(),
    });
    if (req) attachUser(movement, req);
    await (session ? movement.save({ session }) : movement.save());
  }
}

/**
 * Applies one stock change: movement row, balance upsert, rollup refresh.
 *
 * Receipts move the row's weighted average cost; issues consume at it. Negative
 * balances are permitted (see spec §6.4) because invoices are routinely posted
 * before the matching receipt lands — blocking them would break existing flows.
 */
export async function postStockMovement(params: PostMovementParams): Promise<void> {
  const {
    organizationId, itemId, warehouseId, batchId = null,
    quantityDelta, unitCost, sourceType, sourceId,
    sourceNumber = "", notes = "", movedAt, req, session,
  } = params;

  const delta = round2(quantityDelta);
  if (Math.abs(delta) < 0.0001) return;

  const oid = toObjectId(organizationId);
  const iid = toObjectId(itemId);
  const wid = toObjectId(warehouseId);
  const bid = batchId ? toObjectId(batchId) : null;

  await ensureSeeded({ organizationId: oid, itemId: iid, warehouseId: wid, req, session });

  const findQuery = StockBalance.findOne({
    organizationId: oid, itemId: iid, warehouseId: wid, batchId: bid,
  });
  if (session) findQuery.session(session);
  let balance = await findQuery;

  if (!balance) {
    balance = new StockBalance({
      organizationId: oid, itemId: iid, warehouseId: wid, batchId: bid,
      quantity: 0, committedQuantity: 0, averageCost: 0, value: 0,
    });
  }

  const priorQty = round2(balance.quantity);
  const priorValue = round2(balance.value);
  const nextQty = round2(priorQty + delta);

  let nextValue: number;
  let valueDelta: number;

  if (delta > 0) {
    // Receipt — blend into the weighted average for this row.
    const cost = Number.isFinite(Number(unitCost)) ? Number(unitCost) : balance.averageCost;
    valueDelta = round2(delta * cost);
    nextValue = round2(priorValue + valueDelta);
  } else {
    // Issue — consume at the row's current average.
    const rate = priorQty > 0 ? priorValue / priorQty : balance.averageCost;
    valueDelta = round2(delta * rate);
    nextValue = round2(priorValue + valueDelta);
  }

  balance.quantity = nextQty;
  balance.value = nextValue;
  balance.averageCost = nextQty > 0 ? round2(nextValue / nextQty) : balance.averageCost;
  if (req) attachUser(balance, req);
  await (session ? balance.save({ session }) : balance.save());

  const movement = new StockMovement({
    organizationId: oid,
    itemId: iid,
    warehouseId: wid,
    batchId: bid,
    quantityDelta: delta,
    valueDelta,
    resultingQuantity: nextQty,
    resultingValue: nextValue,
    sourceType,
    sourceId,
    sourceNumber,
    notes,
    movedAt: movedAt || new Date(),
  });
  if (req) attachUser(movement, req);
  await (session ? movement.save({ session }) : movement.save());

  await refreshItemRollup({ organizationId: oid, itemId: iid, session });
}

/** Adjusts reserved quantity without moving stock. Used by sales-order commitment. */
export async function postCommitmentChange(params: {
  organizationId: Types.ObjectId | string;
  itemId: Types.ObjectId | string;
  warehouseId: Types.ObjectId | string;
  batchId?: Types.ObjectId | string | null;
  delta: number;
  req?: AuthenticatedRequest;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, itemId, warehouseId, batchId = null, delta, req, session } = params;
  if (Math.abs(round2(delta)) < 0.0001) return;

  const oid = toObjectId(organizationId);
  const iid = toObjectId(itemId);
  const wid = toObjectId(warehouseId);
  const bid = batchId ? toObjectId(batchId) : null;

  await ensureSeeded({ organizationId: oid, itemId: iid, warehouseId: wid, req, session });

  const q = StockBalance.findOne({ organizationId: oid, itemId: iid, warehouseId: wid, batchId: bid });
  if (session) q.session(session);
  let balance = await q;

  if (!balance) {
    balance = new StockBalance({
      organizationId: oid, itemId: iid, warehouseId: wid, batchId: bid,
      quantity: 0, committedQuantity: 0, averageCost: 0, value: 0,
    });
  }

  // Commitment cannot go negative — releasing more than was reserved is a bug
  // upstream, and clamping keeps it from corrupting availability figures.
  balance.committedQuantity = Math.max(0, round2(balance.committedQuantity + delta));
  if (req) attachUser(balance, req);
  await (session ? balance.save({ session }) : balance.save());

  await refreshItemRollup({ organizationId: oid, itemId: iid, session });
}

/** Per-location balances for an item, newest-first by quantity. */
export async function getItemBalances(params: {
  organizationId: Types.ObjectId | string;
  itemId: Types.ObjectId | string;
}) {
  return StockBalance.find({
    organizationId: toObjectId(params.organizationId),
    itemId: toObjectId(params.itemId),
  })
    .populate("warehouseId", "name")
    .populate("batchId", "batchNumber expiryDate")
    .sort({ quantity: -1 })
    .lean();
}
