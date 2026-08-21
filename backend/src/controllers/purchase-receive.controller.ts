import { Response } from "express";
import { Types } from "mongoose";
import PurchaseOrder from "../models/purchase-order.model";
import PurchaseReceive from "../models/purchase-receive.model";
import Bill from "../models/bill.model";
import Item from "../models/item.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { postStockMovement, resolveWarehouseId } from "../services/stock-ledger.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return Number.isNaN(n) ? fallback : n;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function nextReceiveNumber(organizationId: any): Promise<string> {
  const last = await PurchaseReceive.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ purchaseReceiveNumber: -1 })
    .select("purchaseReceiveNumber")
    .lean();

  if (!last) return "PR-00001";
  const match = String(last.purchaseReceiveNumber || "").match(/PR-(\d+)/);
  if (!match) return "PR-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PR-${String(next).padStart(5, "0")}`;
}

/**
 * Records received goods through the stock ledger.
 *
 * Previously wrote `item.stockOnHand` directly, bypassing the ledger entirely —
 * so a receipt left no movement row and, once balances became the source of the
 * rollup, would have been silently overwritten by the next refresh. Receipts now
 * go through the same path as every other stock change.
 */
async function applyReceiveInventory(params: {
  organizationId: any;
  lineItems: Array<{ itemId?: any; quantityReceived: number; rate: number; warehouseId?: any }>;
  warehouseId?: any;
  receiveId?: string;
  receiveNumber?: string;
  req?: AuthenticatedRequest;
}) {
  for (const line of params.lineItems) {
    if (!line.itemId) continue;
    const itemId = typeof line.itemId === "object" ? line.itemId?._id || line.itemId : line.itemId;
    if (!itemId || !Types.ObjectId.isValid(String(itemId))) continue;

    const item = await Item.findOne({
      _id: itemId,
      organizationId: params.organizationId,
      isDeleted: false,
    }).lean();
    if (!item) continue;

    const qty = Math.max(0, toNum(line.quantityReceived));
    if (qty <= 0) continue;

    const warehouseId = await resolveWarehouseId({
      organizationId: params.organizationId,
      explicit: line.warehouseId || params.warehouseId,
      itemId,
    });

    await postStockMovement({
      organizationId: params.organizationId,
      itemId,
      warehouseId,
      quantityDelta: qty,
      unitCost: Math.max(0, toNum(line.rate)),
      sourceType: "PurchaseReceive",
      sourceId: `purchase-receive:${params.receiveId ?? String(itemId)}`,
      sourceNumber: params.receiveNumber ?? "",
      req: params.req,
    });
  }
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const number = await nextReceiveNumber(orgId(req));
  res.json({ success: true, data: { purchaseReceiveNumber: number } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { purchaseOrderId, status, page = 1, limit = 50 } = req.query;

  const filter: any = {
    organizationId: orgId(req),
    isDeleted: false,
  };

  if (purchaseOrderId) filter.purchaseOrderId = purchaseOrderId;
  if (status && status !== "All") filter.status = status;

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(200, Number(limit || 50)));

  const total = await PurchaseReceive.countDocuments(filter);
  const data = await PurchaseReceive.find(filter)
    .populate("vendorId", "displayName companyName")
    .populate("purchaseOrderId", "purchaseOrderNumber status")
    .populate("linkedBillIds", "billNumber status")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  res.json({
    success: true,
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    },
  });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const receive = await PurchaseReceive.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email")
    .populate("purchaseOrderId", "purchaseOrderNumber purchaseOrderDate status")
    .populate("lineItems.itemId", "name sku unit inventoryTracked")
    .populate("linkedBillIds", "billNumber status total")
    .lean();

  if (!receive) throw new NotFoundError("Purchase Receive");
  res.json({ success: true, data: receive });
});

export const getFromPurchaseOrder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const purchaseOrderId = String(req.query.purchaseOrderId || "").trim();
  if (!purchaseOrderId) throw new ValidationError("purchaseOrderId query param is required");

  const po = await PurchaseOrder.findOne({
    _id: purchaseOrderId,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email")
    .populate("lineItems.itemId", "name sku unit inventoryTracked")
    .lean();

  if (!po) throw new NotFoundError("Purchase Order");

  const linkedBills = await Bill.find({
    organizationId: orgId(req),
    isDeleted: false,
    orderNumber: po.purchaseOrderNumber,
  })
    .select("_id billNumber status total")
    .lean();

  const receivedRows = await PurchaseReceive.find({
    organizationId: orgId(req),
    purchaseOrderId: po._id,
    isDeleted: false,
    status: "Received",
  })
    .select("lineItems")
    .lean();

  const receivedMap = new Map<string, number>();
  for (const row of receivedRows) {
    for (const li of row.lineItems || []) {
      const key = String(li.purchaseOrderLineItemId || li.itemId || "");
      if (!key) continue;
      receivedMap.set(key, round2((receivedMap.get(key) || 0) + toNum(li.quantityReceived)));
    }
  }

  const lineItems = (po.lineItems || []).map((li: any) => {
    const key = String(li._id || li.itemId || "");
    const alreadyReceived = round2(receivedMap.get(key) || 0);
    const orderedQty = round2(toNum(li.quantity));
    const pendingQty = round2(Math.max(0, orderedQty - alreadyReceived));

    const itemObj = typeof li.itemId === "object" ? li.itemId : null;
    const itemUnit = itemObj?.unit
      ? (typeof itemObj.unit === "object" ? itemObj.unit.abbreviation || "" : String(itemObj.unit))
      : "";

    return {
      purchaseOrderLineItemId: li._id,
      itemId: itemObj?._id || li.itemId || null,
      name: itemObj?.name || li.name || "",
      description: li.description || "",
      quantityOrdered: orderedQty,
      quantityAlreadyReceived: alreadyReceived,
      quantityToReceive: pendingQty,
      rate: round2(toNum(li.rate)),
      unit: itemUnit,
      isHeader: !!li.isHeader,
      headerText: li.headerText || "",
    };
  });

  res.json({
    success: true,
    data: {
      purchaseOrder: po,
      linkedBills,
      lineItems,
    },
  });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const purchaseOrderId = String(req.body.purchaseOrderId || "").trim();
  if (!purchaseOrderId) throw new ValidationError("purchaseOrderId is required");

  const po = await PurchaseOrder.findOne({
    _id: purchaseOrderId,
    organizationId: oid,
    isDeleted: false,
  })
    .populate("lineItems.itemId", "name unit inventoryTracked")
    .lean();

  if (!po) throw new NotFoundError("Purchase Order");
  if (po.status === "Canceled") throw new ValidationError("Cannot receive a canceled purchase order");

  const receiveNumber = req.body.purchaseReceiveNumber || (await nextReceiveNumber(oid));
  const receivedDate = req.body.receivedDate ? new Date(req.body.receivedDate) : new Date();
  if (Number.isNaN(receivedDate.getTime())) throw new ValidationError("Invalid receivedDate");

  const inputLineItems = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
  if (inputLineItems.length === 0) {
    throw new ValidationError("At least one receive line item is required");
  }

  const normalizedLineItems = inputLineItems
    .map((li: any) => {
      const qtyToReceive = round2(Math.max(0, toNum(li.quantityToReceive)));
      const qtyReceived = round2(Math.max(0, toNum(li.quantityReceived ?? li.quantityToReceive)));
      if (qtyReceived <= 0) return null;

      return {
        purchaseOrderLineItemId: li.purchaseOrderLineItemId || null,
        itemId: li.itemId || null,
        name: String(li.name || "").trim(),
        description: String(li.description || "").trim(),
        quantityToReceive: qtyToReceive,
        quantityReceived: qtyReceived,
        rate: round2(Math.max(0, toNum(li.rate))),
        unit: String(li.unit || "").trim(),
      };
    })
    .filter((li: any): li is Exclude<ReturnType<typeof inputLineItems[number]>, null> => Boolean(li));

  if (normalizedLineItems.length === 0) {
    throw new ValidationError("At least one line must have quantityReceived > 0");
  }

  const status = req.body.status === "Draft" ? "Draft" : "Received";

  const linkedBills = await Bill.find({
    organizationId: oid,
    orderNumber: po.purchaseOrderNumber,
    isDeleted: false,
  })
    .select("_id")
    .lean();

  const totalQty = round2(normalizedLineItems.reduce((sum: number, li: any) => sum + toNum(li.quantityReceived), 0));

  const receiveDoc = new PurchaseReceive({
    organizationId: oid,
    vendorId: po.vendorId || null,
    purchaseOrderId: po._id,
    purchaseOrderNumber: po.purchaseOrderNumber,
    purchaseReceiveNumber: receiveNumber,
    receivedDate,
    notes: String(req.body.notes || ""),
    lineItems: normalizedLineItems,
    totalQuantityReceived: totalQty,
    status,
    linkedBillIds: linkedBills.map((b: any) => b._id),
  });
  attachUser(receiveDoc, req);
  await receiveDoc.save();

  if (status === "Received") {
    await applyReceiveInventory({
      organizationId: oid,
      lineItems: normalizedLineItems,
      receiveId: String(receiveDoc._id),
      receiveNumber: receiveDoc.purchaseReceiveNumber,
      req,
    });

    const poDoc = await PurchaseOrder.findOne({ _id: po._id, organizationId: oid, isDeleted: false });
    if (poDoc && poDoc.status !== "Closed") {
      poDoc.status = "Closed";
      poDoc.comments.push({
        author: req.user?.name || req.user?.email || "System",
        text: `Purchase Receive ${receiveNumber} recorded. Status changed to Closed.`,
        time: new Date(),
        isSystem: true,
      });
      attachUser(poDoc as any, req);
      await poDoc.save();
    }
  }

  res.status(201).json({ success: true, data: receiveDoc });
});
