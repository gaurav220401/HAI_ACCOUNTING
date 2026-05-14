import { Types } from "mongoose";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import DeliveryChallan from "../models/delivery-challan.model";
import Package from "../models/package.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import { fulfillSalesOrderStock } from "./accounting-sync.service";

/**
 * Centrally manages the linkage and status transitions between Sales Orders,
 * Invoices, Shipments (Challans), and Packages.
 */

function normalizeOrderNumber(val: unknown): string {
  return String(val || "").trim();
}

const POSTED_INVOICE_STATUSES = [
  "Sent",
  "Viewed",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const SHIPPED_CHALLAN_STATUSES = ["Open", "Delivered"];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function getObjectIdString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value || "");
}

function addQuantity(map: Map<string, number>, key: string, quantity: unknown): void {
  if (!key) return;
  const qty = round2(Math.max(0, toNum(quantity)));
  if (qty <= 0) return;
  map.set(key, round2((map.get(key) || 0) + qty));
}

function consumeQuantity(map: Map<string, number>, key: string, requested: unknown): number {
  if (!key) return 0;
  const needed = round2(Math.max(0, toNum(requested)));
  if (needed <= 0) return 0;
  const available = round2(Math.max(0, map.get(key) || 0));
  const used = round2(Math.min(needed, available));
  map.set(key, round2(Math.max(0, available - used)));
  return used;
}

function buildInvoiceQuantityMap(invoices: any[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const invoice of invoices || []) {
    for (const line of invoice.items || []) {
      addQuantity(out, getObjectIdString(line.itemId), line.quantity);
    }
  }
  return out;
}

function buildPackageQuantityMap(packages: any[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const pkg of packages || []) {
    for (const line of pkg.lineItems || []) {
      addQuantity(out, getObjectIdString(line.itemId), line.quantityToPack);
    }
  }
  return out;
}

function buildChallanQuantityMap(challans: any[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const challan of challans || []) {
    if (!SHIPPED_CHALLAN_STATUSES.includes(String(challan.status || ""))) continue;
    for (const line of challan.items || []) {
      addQuantity(out, getObjectIdString(line.itemId), line.quantity);
    }
  }
  return out;
}

function maxQuantityMaps(left: Map<string, number>, right: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    out.set(key, round2(Math.max(left.get(key) || 0, right.get(key) || 0)));
  }
  return out;
}

function summarizeProgress(params: {
  lineItems: any[];
  invoices: any[];
  challans: any[];
  packages: any[];
}) {
  const invoiceQtyByItem = buildInvoiceQuantityMap(params.invoices);
  const shippedQtyByItem = maxQuantityMaps(
    buildPackageQuantityMap(params.packages),
    buildChallanQuantityMap(params.challans),
  );

  let orderedQty = 0;
  let invoicedQty = 0;
  let shippedQty = 0;

  for (const line of params.lineItems || []) {
    const itemKey = getObjectIdString(line.itemId);
    const qty = round2(Math.max(0, toNum(line.quantity)));
    orderedQty = round2(orderedQty + qty);
    invoicedQty = round2(invoicedQty + consumeQuantity(invoiceQtyByItem, itemKey, qty));
    shippedQty = round2(shippedQty + consumeQuantity(shippedQtyByItem, itemKey, qty));
  }

  return { orderedQty, invoicedQty, shippedQty };
}

/**
 * Re-evaluates and synchronizes the status of a Sales Order based on its linked documents.
 */
export async function syncSalesOrderStatus(params: {
  organizationId: any;
  salesOrderId?: string | Types.ObjectId;
  salesOrderNumber?: string;
  req: AuthenticatedRequest;
}) {
  const { organizationId, req } = params;
  let order;

  if (params.salesOrderId) {
    order = await SalesOrder.findOne({ _id: params.salesOrderId, organizationId, isDeleted: false });
  } else if (params.salesOrderNumber) {
    order = await SalesOrder.findOne({ salesOrderNumber: params.salesOrderNumber, organizationId, isDeleted: false });
  }

  if (!order) return;

  const orderNumber = order.salesOrderNumber;

  // 1. Fetch all linked documents
  const [invoices, challans, packages] = await Promise.all([
    Invoice.find({
      organizationId,
      orderNumber,
      isDeleted: false,
      status: { $in: POSTED_INVOICE_STATUSES },
    } as any)
      .select("_id status total balanceDue items.itemId items.quantity createdAt")
      .lean(),
    DeliveryChallan.find({ organizationId, salesOrderNumber: orderNumber, isDeleted: false } as any)
      .select("status items.itemId items.quantity")
      .lean(),
    Package.find({ organizationId, salesOrderId: order._id, isDeleted: false } as any)
      .select("lineItems.itemId lineItems.quantityToPack")
      .lean(),
  ]);

  // 2. Evaluate Invoice Status
  const progress = summarizeProgress({
    lineItems: (order as any).lineItems || [],
    invoices,
    challans,
    packages,
  });
  if (progress.shippedQty <= 0 && ["Shipped", "Delivered"].includes(String(order.shipmentStatus || ""))) {
    progress.shippedQty = progress.orderedQty;
  }
  const invoiceCount = invoices.length;
  const allPaid = invoiceCount > 0 && invoices.every(inv => inv.status === "Paid");
  
  let invoiceStatus: "Not Invoiced" | "Invoiced" = progress.invoicedQty > 0 ? "Invoiced" : "Not Invoiced";
  
  // 3. Evaluate Shipment Status
  const fullyShipped = progress.orderedQty > 0 && progress.shippedQty >= progress.orderedQty;
  const anyDelivered = challans.some(dc => dc.status === "Delivered");
  const anyShipped = progress.shippedQty > 0 || packages.length > 0 || challans.some(dc => dc.status === "Open");
  
  let shipmentStatus: "Pending" | "Shipped" | "Delivered" = "Pending";
  if (anyDelivered || (fullyShipped && String(order.shipmentStatus || "") === "Delivered")) shipmentStatus = "Delivered";
  else if (anyShipped) shipmentStatus = "Shipped";

  // 4. Determine overall status
  let targetStatus: SalesOrderStatus = order.status;

  if (order.status === "VOID") {
    // Void stays void
  } else if (allPaid && shipmentStatus === "Delivered") {
    targetStatus = "CLOSED";
  } else if (progress.invoicedQty > 0) {
    targetStatus = progress.orderedQty > 0 && progress.invoicedQty >= progress.orderedQty
      ? "INVOICED"
      : "PARTIALLY_INVOICED";
  } else if (shipmentStatus !== "Pending") {
    targetStatus = "APPROVED"; 
  } else if (order.status === "DRAFT") {
    if (invoiceCount > 0 || shipmentStatus !== "Pending") {
      targetStatus = "APPROVED";
    }
  } else if (["INVOICED", "PARTIALLY_INVOICED", "CLOSED"].includes(String(order.status || ""))) {
    targetStatus = "APPROVED";
  }

  // 5. Update if changed
  let changed = false;
  if (order.status !== targetStatus) {
    order.status = targetStatus;
    changed = true;
  }
  if (order.invoiceStatus !== invoiceStatus) {
    order.invoiceStatus = invoiceStatus;
    changed = true;
  }
  if (order.shipmentStatus !== shipmentStatus) {
    order.shipmentStatus = shipmentStatus;
    changed = true;
  }

  // Link latest invoice if exists
  if (invoices.length > 0) {
    const latestInv = (invoices as any[]).sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    if (String(order.invoiceId || "") !== String(latestInv._id)) {
      order.invoiceId = latestInv._id as any;
      changed = true;
    }
  } else if (order.invoiceId) {
    order.invoiceId = null as any;
    changed = true;
  }

  if (changed) {
    attachUser(order, req);
    await order.save();
    
    if (shipmentStatus === "Delivered" && !order.stockDeducted) {
      await fulfillSalesOrderStock({
        organizationId,
        order,
        req,
      });
    }
  }
}

/**
 * Syncs Sales Order when an invoice is created or updated.
 */
export async function syncSalesOrderByInvoice(params: {
  organizationId: any;
  invoice: any;
  req: AuthenticatedRequest;
}) {
  const orderNumber = normalizeOrderNumber(params.invoice.orderNumber);
  if (!orderNumber) return;

  await syncSalesOrderStatus({
    organizationId: params.organizationId,
    salesOrderNumber: orderNumber,
    req: params.req
  });
}
