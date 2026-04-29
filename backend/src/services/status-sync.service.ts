import { Types } from "mongoose";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import DeliveryChallan from "../models/delivery-challan.model";
import Package from "../models/package.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";

/**
 * Centrally manages the linkage and status transitions between Sales Orders,
 * Invoices, Shipments (Challans), and Packages.
 */

function normalizeOrderNumber(val: unknown): string {
  return String(val || "").trim();
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
    Invoice.find({ organizationId, orderNumber, isDeleted: false, status: { $ne: "Void" } } as any).lean(),
    DeliveryChallan.find({ organizationId, salesOrderNumber: orderNumber, isDeleted: false } as any).lean(),
    Package.find({ organizationId, salesOrderId: order._id, isDeleted: false } as any).lean(),
  ]);

  // 2. Evaluate Invoice Status
  const invoiceCount = invoices.length;
  const allPaid = invoiceCount > 0 && invoices.every(inv => inv.status === "Paid");
  const anyPaid = invoices.some(inv => inv.status === "Paid" || (inv.balanceDue ?? 0) < (inv.total || 0));
  
  let invoiceStatus: "Not Invoiced" | "Invoiced" = invoiceCount > 0 ? "Invoiced" : "Not Invoiced";
  
  // 3. Evaluate Shipment Status
  const anyDelivered = challans.some(dc => dc.status === "Delivered");
  const anyShipped = packages.length > 0 || challans.some(dc => dc.status === "Open");
  
  let shipmentStatus: "Pending" | "Shipped" | "Delivered" = "Pending";
  if (anyDelivered) shipmentStatus = "Delivered";
  else if (anyShipped) shipmentStatus = "Shipped";

  // 4. Determine overall status
  let targetStatus: SalesOrderStatus = order.status;

  if (order.status === "VOID") {
    // Void stays void
  } else if (allPaid && shipmentStatus === "Delivered") {
    targetStatus = "CLOSED";
  } else if (invoiceCount > 0) {
    targetStatus = "INVOICED"; 
    if (invoiceCount > 1) targetStatus = "PARTIALLY_INVOICED";
  } else if (shipmentStatus !== "Pending") {
    targetStatus = "APPROVED"; 
  } else if (order.status === "DRAFT") {
    if (invoiceCount > 0 || shipmentStatus !== "Pending") {
      targetStatus = "APPROVED";
    }
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
  }

  if (changed) {
    attachUser(order, req);
    await order.save();
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
