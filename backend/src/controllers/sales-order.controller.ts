import { Response } from "express";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import Item from "../models/item.model";
import Contact from "../models/contact.model";
import Organization from "../models/organization.model";
import PurchaseOrder from "../models/purchase-order.model";
import DeliveryChallan from "../models/delivery-challan.model";
import MoveOrder from "../models/move-order.model";
import Package from "../models/package.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";
import { sendSalesOrderEmail as sendSalesOrderEmailService } from "../services/email.service";
import { generateSalesOrderPdf } from "../services/pdf.service";
import { syncSalesOrderByInvoice } from "../services/status-sync.service";
import {
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "../utils/money";
import { Types } from "mongoose";

const VALID_SALES_ORDER_STATUSES = new Set<SalesOrderStatus>([
  "DRAFT",
  "APPROVED",
  "INVOICED",
  "PARTIALLY_INVOICED",
  "CLOSED",
  "OVERDUE",
  "VOID",
]);

const INVOICE_LINKED_STATUSES = new Set<SalesOrderStatus>([
  "INVOICED",
  "PARTIALLY_INVOICED",
]);

const POSTED_INVOICE_STATUSES = [
  "Sent",
  "Viewed",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const SHIPPED_CHALLAN_STATUSES = ["Open", "Delivered"];

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function round2(value: number): number {
  return roundMoney(value);
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSalesOrderStatus(
  value: unknown,
  fallback: SalesOrderStatus = "DRAFT",
): SalesOrderStatus {
  const normalized =
    value === undefined || value === null || value === "" ?
      fallback
    : (String(value).toUpperCase() as SalesOrderStatus);

  if (!VALID_SALES_ORDER_STATUSES.has(normalized)) {
    throw new ValidationError("Invalid sales order status");
  }

  return normalized;
}

function normalizeSalesOrderNumber(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new ValidationError("salesOrderNumber is required");
  }
  return normalized;
}

function normalizeExpectedShipmentDate(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === "" || value === null) return null;
  return value;
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

function buildPostedInvoiceQuantityMap(invoices: any[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const invoice of invoices || []) {
    if (!POSTED_INVOICE_STATUSES.includes(String(invoice.status || ""))) continue;
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

function withLineFulfillmentQuantities(
  lineItems: any[],
  linkedInvoices: any[],
  linkedPackages: any[],
  linkedChallans: any[],
  shipmentStatus?: string,
): any[] {
  const invoiceQtyByItem = buildPostedInvoiceQuantityMap(linkedInvoices);
  const hasShipmentDocuments =
    (linkedPackages || []).some((pkg) => (pkg.lineItems || []).length > 0)
    || (linkedChallans || []).some((challan) =>
      SHIPPED_CHALLAN_STATUSES.includes(String(challan.status || "")) && (challan.items || []).length > 0,
    );
  const useShipmentStatusFallback =
    !hasShipmentDocuments && ["Shipped", "Delivered"].includes(String(shipmentStatus || ""));
  const shippedQtyByItem = maxQuantityMaps(
    buildPackageQuantityMap(linkedPackages),
    buildChallanQuantityMap(linkedChallans),
  );

  return (lineItems || []).map((line) => {
    const itemKey = getObjectIdString(line.itemId);
    const orderedQty = round2(Math.max(0, toNum(line.quantity)));
    const qtyInvoiced = consumeQuantity(invoiceQtyByItem, itemKey, orderedQty);
    const qtyShipped = useShipmentStatusFallback
      ? orderedQty
      : consumeQuantity(shippedQtyByItem, itemKey, orderedQty);

    return {
      ...line,
      qtyInvoiced,
      qtyShipped,
      qtyToBeInvoiced: round2(Math.max(0, orderedQty - qtyInvoiced)),
      qtyToBeShipped: round2(Math.max(0, orderedQty - qtyShipped)),
    };
  });
}

async function hasLinkedInvoice(
  organizationId: any,
  salesOrderNumber: string,
): Promise<boolean> {
  if (!salesOrderNumber) return false;

  const linked = await Invoice.exists({
    organizationId,
    orderNumber: salesOrderNumber,
    isDeleted: false,
    status: { $ne: "Void" },
  });
  return Boolean(linked);
}

async function hasPostedInvoice(
  organizationId: any,
  salesOrderNumber: string,
): Promise<boolean> {
  if (!salesOrderNumber) return false;

  const linked = await Invoice.exists({
    organizationId,
    orderNumber: salesOrderNumber,
    isDeleted: false,
    status: { $in: POSTED_INVOICE_STATUSES },
  });
  return Boolean(linked);
}

async function ensureStatusLinkage(params: {
  organizationId: any;
  salesOrderNumber: string;
  status: SalesOrderStatus;
}) {
  if (!INVOICE_LINKED_STATUSES.has(params.status)) return;

  const linked = await hasLinkedInvoice(
    params.organizationId,
    params.salesOrderNumber,
  );
  if (!linked) {
    throw new ValidationError(
      "Cannot set status to INVOICED or PARTIALLY_INVOICED before an invoice is linked",
    );
  }
}

async function ensureSalesOrderNumberCanChange(params: {
  organizationId: any;
  previousNumber: string;
  nextNumber: string;
}) {
  if (!params.previousNumber || params.previousNumber === params.nextNumber) {
    return;
  }

  const linked = await hasLinkedInvoice(
    params.organizationId,
    params.previousNumber,
  );

  if (linked) {
    throw new ValidationError(
      "Cannot change Sales Order number after invoice linkage",
    );
  }
}

function computeTotals(
  lineItems: any[],
  shippingCharges: number,
  adjustment: number,
  discountLevel: string = "transaction",
  discountPercent: number = 0,
  discountAmountRaw: number = 0,
  taxType: string = "none",
  taxAmountRaw: number = 0,
  tcsAmountRaw: number = 0
) {
  const subTotal = sumMoney(
    (lineItems || []).map((li) =>
      subtractMoney(
        multiplyMoney(toNum(li?.quantity), toNum(li?.rate)),
        toNum(li?.discount),
      ),
    ),
  );

  let globalDiscountAmount = 0;
  let totalDiscountAmount = 0;

  if (discountLevel === "transaction") {
    globalDiscountAmount = toNum(discountAmountRaw) || percentMoney(subTotal, toNum(discountPercent));
    totalDiscountAmount = globalDiscountAmount;
  } else {
    totalDiscountAmount = sumMoney((lineItems || []).map((li) => toNum(li?.discountAmount)));
  }

  const taxAmount = taxType === "TDS" ? round2(toNum(taxAmountRaw)) : 0;
  const tcsAmount = taxType === "TCS" ? round2(toNum(tcsAmountRaw)) : 0;

  let total = subTotal;
  if (discountLevel === "transaction") {
     total = subtractMoney(total, globalDiscountAmount);
  }
  const itemTaxes = sumMoney((lineItems || []).map((li) => toNum(li?.taxAmount)));
  total = sumMoney([total, itemTaxes, -taxAmount, tcsAmount, shippingCharges, adjustment]);

  return { subTotal, discountAmount: totalDiscountAmount, total };
}

function normalizeLineItems(items: any[] = [], discountLevel: string = "transaction") {
  return (items || [])
    .map((line) => {
      const { ...rest } = line || {};
      const rawTaxId = String(rest.taxId || "").trim();
      const taxId = rawTaxId && rawTaxId.toLowerCase() !== "none" ? rest.taxId : null;
      
      if (rest.isHeader) {
        return {
          ...rest,
          quantity: 0,
          rate: 0,
          discountPercent: 0,
          discountAmount: 0,
          discount: 0,
          taxPercent: 0,
          taxAmount: 0,
          amount: 0,
        };
      }

      const quantity = Math.max(0, toNum(rest.quantity));
      const rate = round2(Math.max(0, toNum(rest.rate)));
      const lineTotal = multiplyMoney(quantity, rate);

      let discountAmount = 0;
      let discountPercent = 0;
      
      if (discountLevel === "line_item") {
        discountPercent = toNum(rest.discountPercent);
        discountAmount = round2(toNum(rest.discountAmount) || percentMoney(lineTotal, discountPercent));
        discountAmount = Math.min(discountAmount, lineTotal);
      }
      
      const afterDiscount = Math.max(0, subtractMoney(lineTotal, discountAmount));
      const taxPercent = toNum(rest.taxPercent);
      const taxAmount = percentMoney(afterDiscount, taxPercent);
      const amount = sumMoney([afterDiscount, taxAmount]);

      return {
        ...rest,
        name: String(rest.name || "").trim(),
        description: String(rest.description || "").trim(),
        hsnSacCode: String(rest.hsnSacCode || "").trim(),
        accountId: rest.accountId || null,
        quantity,
        rate,
        discountPercent,
        discountAmount,
        discount: discountAmount,
        taxId,
        taxPercent,
        taxAmount,
        amount,
      };
    })
    .filter((line) => {
      if (line.isHeader) return Boolean(String(line.headerText || "").trim());
      const itemId = String(line?.itemId || "").trim();
      return Boolean(itemId) && line.quantity > 0;
    });
}

async function nextInvoiceNumber(organizationId: any): Promise<string> {
  const last = await Invoice.findOne({ organizationId })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  if (!last) return "INV-000001";

  const match = String(last.invoiceNumber || "").match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

async function nextSalesOrderNumber(organizationId: any): Promise<string> {
  const last = await SalesOrder.findOne({
    organizationId,
    isDeleted: { $in: [true, false] },
  })
    .sort({ salesOrderNumber: -1 })
    .select("salesOrderNumber")
    .lean();

  if (!last) return "SO-00001";
  const match = String(last.salesOrderNumber || "").match(/SO-(\d+)/);
  if (!match) return "SO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `SO-${String(next).padStart(5, "0")}`;
}

async function nextPurchaseOrderNumber(organizationId: any): Promise<string> {
  const last = await PurchaseOrder.findOne({
    organizationId,
    isDeleted: { $in: [true, false] },
  })
    .sort({ purchaseOrderNumber: -1 })
    .select("purchaseOrderNumber")
    .lean();

  if (!last) return "PO-00001";
  const match = String(last.purchaseOrderNumber || "").match(/PO-(\d+)/);
  if (!match) return "PO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PO-${String(next).padStart(5, "0")}`;
}

function isVendorContactType(contactType: string): boolean {
  return contactType === "Vendor" || contactType === "Both";
}

function normalizeLegacyOrderForResponse(order: any) {
  if (!order) return order;
  const normalized = { ...order };

  if (!normalized.status) {
    normalized.status = "DRAFT";
  }

  if (!normalized.invoiceStatus) {
    normalized.invoiceStatus = normalized.invoiceId ? "Invoiced" : "Not Invoiced";
  }

  if (!normalized.shipmentStatus) {
    normalized.shipmentStatus = "Pending";
  }

  if (order.invoiceId && typeof order.invoiceId === 'object') {
    normalized.invoicePaymentReceived = !!order.invoiceId.paymentReceived;
    normalized.invoicePaymentStatus = order.invoiceId.status;
  }

  return normalized;
}

async function autoCreateVendorFromCustomer(params: {
  organizationId: any;
  customer: any;
  req: AuthenticatedRequest;
}) {
  const { organizationId, customer, req } = params;

  const source =
    customer && typeof customer === "object" ? customer : ({} as Record<string, unknown>);

  const fallbackName = `Vendor-${Date.now()}`;
  const displayName = String(
    (source as any).displayName || (source as any).companyName || fallbackName,
  ).trim();

  const linkedContactId = Types.ObjectId.isValid(String((source as any)._id || ""))
    ? (source as any)._id
    : null;

  const vendor = new Contact({
    organizationId,
    contactType: "Vendor",
    displayName: displayName || fallbackName,
    companyName: String((source as any).companyName || displayName || ""),
    email: String((source as any).email || ""),
    phone: String((source as any).phone || ""),
    mobile: String((source as any).mobile || ""),
    currency: String((source as any).currency || "INR"),
    billingAddress: (source as any).billingAddress || {},
    shippingAddress: (source as any).shippingAddress || {},
    linkedContactId,
    notes: `Auto-created from Sales Order conversion`,
  });

  attachUser(vendor as any, req);
  await vendor.save();

  if (linkedContactId && !Types.ObjectId.isValid(String((source as any).linkedContactId || ""))) {
    await Contact.updateOne(
      {
        _id: linkedContactId,
        organizationId,
        isDeleted: false,
      },
      { $set: { linkedContactId: vendor._id } },
    );
  }

  return vendor._id;
}

async function resolveVendorForPurchaseOrder(params: {
  organizationId: any;
  requestedVendorId?: unknown;
  customer: any;
  req: AuthenticatedRequest;
}) {
  const { organizationId, requestedVendorId, customer, req } = params;
  const reqVendorId = String(requestedVendorId || "").trim();

  if (Types.ObjectId.isValid(reqVendorId)) {
    const vendor = await Contact.findOne({
      _id: reqVendorId,
      organizationId,
      isDeleted: false,
    })
      .select("_id contactType")
      .lean();

    if (!vendor) throw new ValidationError("Provided vendorId was not found");
    if (!isVendorContactType(String(vendor.contactType || ""))) {
      throw new ValidationError("Provided vendor contact is not of type Vendor/Both");
    }
    return vendor._id;
  }

  const customerId = String(customer?._id || "");
  const customerContactType = String(customer?.contactType || "");
  if (Types.ObjectId.isValid(customerId) && isVendorContactType(customerContactType)) {
    return customer._id;
  }

  if (Types.ObjectId.isValid(customerId)) {
    const existingVendor = await Contact.findOne({
      organizationId,
      isDeleted: false,
      contactType: { $in: ["Vendor", "Both"] },
      linkedContactId: customer._id,
    })
      .select("_id")
      .lean();

    if (existingVendor) {
      return existingVendor._id;
    }
  }

  const linkedContactId = String(customer?.linkedContactId || "");
  if (Types.ObjectId.isValid(linkedContactId)) {
    const linkedVendor = await Contact.findOne({
      _id: linkedContactId,
      organizationId,
      isDeleted: false,
    })
      .select("_id contactType")
      .lean();

    if (linkedVendor && isVendorContactType(String(linkedVendor.contactType || ""))) {
      return linkedVendor._id;
    }
  }

  // Auto-create vendor from customer details when no explicit vendor mapping exists.
  return autoCreateVendorFromCustomer({
    organizationId,
    customer,
    req,
  });
}

async function buildPurchaseOrderDraftFromSalesOrder(params: {
  organizationId: any;
  salesOrderId: string;
  requestedVendorId?: unknown;
  copyDescriptions?: boolean;
  req: AuthenticatedRequest;
}) {
  const { organizationId, salesOrderId, requestedVendorId, req } = params;
  const order = await SalesOrder.findOne({
    _id: salesOrderId,
    organizationId,
    isDeleted: false,
  } as any)
    .populate("customerId", "_id displayName companyName contactType linkedContactId email phone mobile currency billingAddress shippingAddress")
    .populate("lineItems.itemId", "name purchaseAccountId unit")
    .lean();

  if (!order) throw new NotFoundError("Sales Order");
  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot convert a void sales order to purchase order");
  }

  let customer = (order as any).customerId;
  if (!customer || typeof customer !== "object") {
    const customerId = String(customer || "");
    if (Types.ObjectId.isValid(customerId)) {
      customer = await Contact.findOne({
        _id: customerId,
        organizationId,
        isDeleted: false,
      })
        .select("_id displayName companyName contactType linkedContactId email phone mobile currency billingAddress shippingAddress")
        .lean();
    }
  }

  const vendorId = await resolveVendorForPurchaseOrder({
    organizationId,
    requestedVendorId,
    customer,
    req,
  });

  const vendor = await Contact.findOne({
    _id: vendorId,
    organizationId,
    isDeleted: false,
  })
    .select("_id displayName companyName email phone mobile billingAddress shippingAddress")
    .lean();

  const purchaseOrderNumber = await nextPurchaseOrderNumber(organizationId);
  const copyDescriptions = params.copyDescriptions !== false;
  const lineItems = ((order as any).lineItems || [])
    .map((li: any) => {
      const qty = toNum(li.quantity);
      const rate = toNum(li.rate);
      const lineTotal = multiplyMoney(qty, rate);
      const discountAmount = Math.min(round2(toNum(li.discount)), lineTotal);
      const amount = Math.max(0, subtractMoney(lineTotal, discountAmount));
      const item = typeof li.itemId === "object" ? li.itemId : null;

      return {
        itemId: item?._id || li.itemId,
        name:
          item?.name ||
          li.name ||
          li.description ||
          "Item",
        accountId: item?.purchaseAccountId || null,
        description: copyDescriptions ? li.description || "" : "",
        quantity: qty,
        rate,
        discountPercent: lineTotal > 0 ? round2((discountAmount / lineTotal) * 100) : 0,
        discountAmount,
        amount,
      };
    })
    .filter((li: any) => li.itemId && li.quantity > 0);

  if (lineItems.length === 0) {
    throw new ValidationError("Sales order has no line items to convert");
  }

  const subTotal = sumMoney(lineItems.map((li: any) => multiplyMoney(li.quantity, li.rate)));
  const discountAmount = sumMoney(lineItems.map((li: any) => li.discountAmount || 0));
  const adjustmentAmount = sumMoney([toNum((order as any).shippingCharges), toNum((order as any).adjustment)]);
  const total = sumMoney([subTotal, -discountAmount, adjustmentAmount]);

  return {
    order,
    draft: {
      vendorId: String(vendorId),
      vendor,
      deliveryAddressType: "Organization",
      deliveryCustomerId: null,
      purchaseOrderNumber,
      referenceNumber: String((order as any).reference || (order as any).salesOrderNumber || ""),
      purchaseOrderDate: new Date().toISOString(),
      deliveryDate: (order as any).expectedShipmentDate || null,
      paymentTermsId: (order as any).paymentTermsId || null,
      shipmentPreference: String((order as any).deliveryMethod || ""),
      discountLevel: "line_item",
      discountAccountId: null,
      lineItems,
      subTotal,
      discountPercent: 0,
      discountAmount,
      taxType: "none",
      tdsId: null,
      tcsId: null,
      taxAmount: 0,
      tcsAmount: 0,
      adjustmentLabel: "Adjustment",
      adjustmentAmount,
      total,
      notes: String((order as any).notes || ""),
      termsAndConditions: String((order as any).terms || ""),
      attachments: [],
      status: "Draft",
      sourceSalesOrderId: String((order as any)._id),
      sourceSalesOrderNumber: String((order as any).salesOrderNumber || ""),
    },
  };
}

/** Update committed stock for items on SO creation/approval */
async function updateCommittedStock(
  lineItems: any[],
  direction: "commit" | "release",
) {
  for (const li of lineItems || []) {
    const itemId = typeof li.itemId === "object" ? li.itemId?._id : li.itemId;
    if (!itemId) continue;
    const qty = toNum(li.quantity);
    if (qty <= 0) continue;

    const item = await Item.findById(itemId);
    if (!item || !item.inventoryTracked) continue;

    if (direction === "commit") {
      (item as any).committedStock = round2(toNum((item as any).committedStock) + qty);
    } else {
      (item as any).committedStock = round2(
        Math.max(0, toNum((item as any).committedStock) - qty),
      );
    }
    await item.save();
  }
}

async function transitionShipmentStatus(params: {
  order: any;
  shipmentStatus: "Pending" | "Shipped" | "Delivered";
  req: AuthenticatedRequest;
}) {
  const { order, shipmentStatus, req } = params;

  if (!["Pending", "Shipped", "Delivered"].includes(shipmentStatus)) {
    throw new ValidationError("Invalid shipment status");
  }

  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot update shipment for a void sales order");
  }

  const oldStatus = String((order as any).shipmentStatus || "");
  if (oldStatus === shipmentStatus) {
    return false;
  }

  (order as any).shipmentStatus = shipmentStatus;

  const postedInvoiceExists = await hasPostedInvoice(
    (order as any).organizationId,
    String((order as any).salesOrderNumber || ""),
  );

  // Delivered transition moves stock only when a posted invoice has not already moved it.
  if (!postedInvoiceExists && oldStatus !== "Delivered" && shipmentStatus === "Delivered") {
    const lineItems = (order as any).lineItems || [];
    for (const li of lineItems) {
      const itemId = typeof li.itemId === "object" ? li.itemId?._id : li.itemId;
      if (!itemId) continue;
      const qty = Number(li.quantity) || 0;
      if (qty <= 0) continue;

      const item = await Item.findById(itemId);
      if (!item || !item.inventoryTracked) continue;

      item.stockOnHand = Math.max(0, (item.stockOnHand || 0) - qty);
      item.committedStock = Math.max(0, (item.committedStock || 0) - qty);
      await item.save();
    }
  } else if (!postedInvoiceExists && oldStatus === "Delivered" && shipmentStatus !== "Delivered") {
    const lineItems = (order as any).lineItems || [];
    for (const li of lineItems) {
      const itemId = typeof li.itemId === "object" ? li.itemId?._id : li.itemId;
      if (!itemId) continue;
      const qty = Number(li.quantity) || 0;
      if (qty <= 0) continue;

      const item = await Item.findById(itemId);
      if (!item || !item.inventoryTracked) continue;

      item.stockOnHand = round2((item.stockOnHand || 0) + qty);
      item.committedStock = round2((item.committedStock || 0) + qty);
      await item.save();
    }
  }

  const invoiceStatus = String((order as any).invoiceStatus || "");
  if (shipmentStatus === "Delivered") {
    if (invoiceStatus === "Invoiced") {
      (order as any).status = "CLOSED";
    } else if (String((order as any).status || "") === "DRAFT") {
      (order as any).status = "APPROVED";
    }
  } else if (String((order as any).status || "") === "CLOSED") {
    (order as any).status =
      invoiceStatus === "Invoiced" ? "INVOICED" : "APPROVED";
  }

  attachUser(order as any, req);
  await order.save();
  return true;
}

/** GET /api/sales-orders?search=...&status=...&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    search,
    status,
    customerId,
    customer_id,
    page = 1,
    limit = 25,
  } = req.query as Record<string, string>;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status.toUpperCase() !== "ALL") {
    filter.status = normalizeSalesOrderStatus(status);
  }
  const customerFilterId = customerId || customer_id;
  if (customerFilterId) filter.customerId = customerFilterId;
  if (search) {
    filter.$or = [
      { salesOrderNumber: { $regex: search, $options: "i" } },
      { reference: { $regex: search, $options: "i" } },
    ];
  }

  const total = await SalesOrder.countDocuments(filter);
  const orders = await SalesOrder.find(filter)
    .populate("customerId paymentTermsId salesPersonId invoiceId")
    .sort({ orderDate: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  const normalizedOrders = (orders || []).map((order) =>
    normalizeLegacyOrderForResponse(order),
  );

  res.json({
    success: true,
    data: normalizedOrders,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/sales-orders/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any)
    .populate("customerId paymentTermsId salesPersonId lineItems.itemId lineItems.taxId invoiceId");
  if (!order) throw new NotFoundError("Sales Order");
  
  const orderData = (order as any).toObject ? (order as any).toObject() : order;
  const normalizedOrder = normalizeLegacyOrderForResponse(orderData);

  // Find linked documents
  const salesOrderNumber = normalizedOrder.salesOrderNumber;
  const [linkedInvoices, linkedPackages, linkedChallans, linkedMoveOrders] = await Promise.all([
    Invoice.find({ organizationId: oid, orderNumber: salesOrderNumber, isDeleted: false } as any)
      .select("invoiceNumber status total balanceDue invoiceDate items.itemId items.quantity createdAt")
      .lean(),
    Package.find({ organizationId: oid, salesOrderId: order._id, isDeleted: false } as any)
      .select("packageSlipNumber date lineItems.itemId lineItems.quantityToPack")
      .lean(),
    DeliveryChallan.find({ organizationId: oid, salesOrderNumber: salesOrderNumber, isDeleted: false } as any)
      .select("challanNumber challanDate status items.itemId items.quantity")
      .lean(),
    MoveOrder.find({ organizationId: oid, salesOrderId: order._id, isDeleted: false } as any)
      .select("orderNumber date status")
      .lean(),
  ]);

  const lineItems = withLineFulfillmentQuantities(
    normalizedOrder.lineItems || [],
    linkedInvoices,
    linkedPackages,
    linkedChallans,
    normalizedOrder.shipmentStatus,
  );

  res.json({ 
    success: true, 
    data: { 
      ...normalizedOrder,
      lineItems,
      linkedDocuments: {
        invoices: linkedInvoices,
        packages: linkedPackages,
        deliveryChallans: linkedChallans,
        moveOrders: linkedMoveOrders,
      }
    } 
  });
});

/** POST /api/sales-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const body = (req.body || {}) as Record<string, unknown>;
  const customerId = body.customerId;
  const salesOrderNumber = normalizeSalesOrderNumber(body.salesOrderNumber);
  const orderDate = body.orderDate;
  const status = normalizeSalesOrderStatus(body.status, "DRAFT");

  if (!customerId) throw new ValidationError("customerId is required");
  if (!orderDate) throw new ValidationError("orderDate is required");
  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    throw new ValidationError("At least one line item is required");
  }

  await ensureStatusLinkage({
    organizationId: oid,
    salesOrderNumber,
    status,
  });

  const discountLevel = String(body.discountLevel || "transaction");
  const linkedLineItems = normalizeLineItems(
    await applyItemTaxLinkageToItems({
      organizationId: oid,
      contactId: customerId,
      items: body.lineItems,
      placeOfSupply: body.placeOfSupply as string | undefined,
    }),
    discountLevel
  );

  if (linkedLineItems.length === 0) {
    throw new ValidationError("At least one valid line item is required");
  }

  const shippingCharges = round2(toNum(body.shippingCharges));
  const adjustment = round2(toNum(body.adjustment));
  
  const discountPercent = discountLevel === "transaction" ? toNum(body.discountPercent) : 0;
  const taxType = String(body.taxType || "none");
  const tdsId = taxType === "TDS" ? (body.tdsId || null) : null;
  const tcsId = taxType === "TCS" ? (body.tcsId || null) : null;
  const taxAmountRaw = taxType === "TDS" ? toNum(body.taxAmount) : 0;
  const tcsAmountRaw = taxType === "TCS" ? toNum(body.tcsAmount) : 0;

  const { subTotal, discountAmount, total } = computeTotals(
    linkedLineItems,
    shippingCharges,
    adjustment,
    discountLevel,
    discountPercent,
    toNum(body.discountAmount),
    taxType,
    taxAmountRaw,
    tcsAmountRaw
  );

  const order = new SalesOrder({
    organizationId: oid,
    ...body,
    salesOrderNumber,
    expectedShipmentDate: normalizeExpectedShipmentDate(body.expectedShipmentDate),
    lineItems: linkedLineItems,
    discountLevel,
    discountAccountId: body.discountAccountId || null,
    discountPercent,
    discountAmount,
    taxType,
    tdsId,
    tcsId,
    taxAmount: taxAmountRaw,
    tcsAmount: tcsAmountRaw,
    adjustmentLabel: body.adjustmentLabel || "Adjustment",
    shippingCharges,
    adjustment,
    subTotal,
    total,
    status,
    invoiceStatus: "Not Invoiced",
    shipmentStatus: "Pending",
  });
  attachUser(order as any, req);
  await order.save();

  // Commit stock if status is APPROVED
  if (status === "APPROVED") {
    await updateCommittedStock(linkedLineItems, "commit");
  }

  res.status(201).json({ success: true, data: order });
});

/** PATCH /api/sales-orders/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  const body = (req.body || {}) as Record<string, unknown>;

  if (body.lineItems !== undefined && !Array.isArray(body.lineItems)) {
    throw new ValidationError("lineItems must be an array");
  }

  const currentOrderNumber = String((order as any).salesOrderNumber || "").trim();
  const nextOrderNumber =
    body.salesOrderNumber !== undefined ?
      normalizeSalesOrderNumber(body.salesOrderNumber)
    : currentOrderNumber;

  await ensureSalesOrderNumberCanChange({
    organizationId: oid,
    previousNumber: currentOrderNumber,
    nextNumber: nextOrderNumber,
  });

  if (body.status !== undefined) {
    const nextStatus = normalizeSalesOrderStatus(body.status);
    await ensureStatusLinkage({
      organizationId: oid,
      salesOrderNumber: nextOrderNumber,
      status: nextStatus,
    });
  }

  const prevStatus = String((order as any).status || "");
  const previousLineItems = JSON.parse(
    JSON.stringify((order as any).lineItems || []),
  );

  const allowed = [
    "customerId",
    "reference",
    "orderDate",
    "paymentTermsId",
    "deliveryMethod",
    "salesPersonId",
    "notes",
    "terms",
    "isActive",
  ];

  allowed.forEach((f) => {
    if (body[f] !== undefined) (order as any)[f] = body[f];
  });

  if (body.salesOrderNumber !== undefined) {
    (order as any).salesOrderNumber = nextOrderNumber;
  }

  if (body.expectedShipmentDate !== undefined) {
    (order as any).expectedShipmentDate = normalizeExpectedShipmentDate(
      body.expectedShipmentDate,
    );
  }

  if (body.shippingCharges !== undefined) {
    (order as any).shippingCharges = round2(toNum(body.shippingCharges));
  }

  if (body.adjustment !== undefined) {
    (order as any).adjustment = round2(toNum(body.adjustment));
  }

  if (body.status !== undefined) {
    (order as any).status = normalizeSalesOrderStatus(body.status);
  }

  let lineItemsChanged = false;
  const discountLevel = body.discountLevel !== undefined ? String(body.discountLevel) : String((order as any).discountLevel || "transaction");
  
  if (body.lineItems !== undefined || body.customerId !== undefined || body.placeOfSupply !== undefined) {
    const customerId = body.customerId ?? (order as any).customerId;
    const placeOfSupply = body.placeOfSupply !== undefined ? (body.placeOfSupply as string) : (order as any).placeOfSupply;
    const sourceLineItems =
      body.lineItems !== undefined ?
        (body.lineItems as any[])
      : ((order as any).lineItems || []);

    const linkedLineItems = normalizeLineItems(
      await applyItemTaxLinkageToItems({
        organizationId: oid,
        contactId: customerId,
        items: sourceLineItems,
        placeOfSupply,
      }),
      discountLevel
    );

    if (linkedLineItems.length === 0) {
      throw new ValidationError("At least one valid line item is required");
    }

    (order as any).lineItems = linkedLineItems;
    lineItemsChanged = true;
  }
  
  const additionalFields = [
    "discountLevel",
    "discountAccountId",
    "taxType",
    "tdsId",
    "tcsId",
    "adjustmentLabel",
    "placeOfSupply"
  ];
  additionalFields.forEach((f) => {
    if (body[f] !== undefined) (order as any)[f] = body[f];
  });
  
  if (body.discountPercent !== undefined) {
    (order as any).discountPercent = toNum(body.discountPercent);
  }
  if (body.taxAmount !== undefined) {
    (order as any).taxAmount = toNum(body.taxAmount);
  }
  if (body.tcsAmount !== undefined) {
    (order as any).tcsAmount = toNum(body.tcsAmount);
  }

  if (
    lineItemsChanged ||
    body.customerId !== undefined ||
    body.shippingCharges !== undefined ||
    body.adjustment !== undefined ||
    body.discountLevel !== undefined ||
    body.discountPercent !== undefined ||
    body.discountAmount !== undefined ||
    body.taxType !== undefined ||
    body.taxAmount !== undefined ||
    body.tcsAmount !== undefined
  ) {
    const discountAmountRaw = body.discountAmount !== undefined ? toNum(body.discountAmount) : toNum((order as any).discountAmount);
    
    const { subTotal, discountAmount, total } = computeTotals(
      (order as any).lineItems || [],
      (order as any).shippingCharges,
      (order as any).adjustment,
      (order as any).discountLevel,
      toNum((order as any).discountPercent),
      discountAmountRaw,
      (order as any).taxType,
      toNum((order as any).taxAmount),
      toNum((order as any).tcsAmount)
    );
    (order as any).subTotal = subTotal;
    (order as any).discountAmount = discountAmount;
    (order as any).total = total;
  }

  // Keep committed stock aligned with approval state and line-item edits.
  const newStatus = String((order as any).status || "");
  const wasApproved = prevStatus === "APPROVED";
  const isApproved = newStatus === "APPROVED";

  if (wasApproved && !isApproved) {
    await updateCommittedStock(previousLineItems, "release");
  } else if (!wasApproved && isApproved) {
    await updateCommittedStock((order as any).lineItems, "commit");
  } else if (wasApproved && isApproved && lineItemsChanged) {
    await updateCommittedStock(previousLineItems, "release");
    await updateCommittedStock((order as any).lineItems, "commit");
  }

  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order });
});

/** DELETE /api/sales-orders/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) } as any);
  if (!order) throw new NotFoundError("Sales Order");

  // Release committed stock
  const status = String((order as any).status || "");
  if (status === "APPROVED") {
    await updateCommittedStock((order as any).lineItems, "release");
  }

  (order as any).isDeleted = true;
  (order as any).deletedAt = new Date();
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, message: "Sales Order deleted" });
});

/** POST /api/sales-orders/:id/convert-to-invoice */
export const convertToInvoice = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any)
    .populate("lineItems.itemId", "name hsnSacCode")
    .populate("lineItems.taxId", "rate")
    .populate("customerId", "displayName")
    .populate("paymentTermsId", "name netDays")
    .populate("salesPersonId", "name");

  if (!order) throw new NotFoundError("Sales Order");

  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot convert a void sales order to invoice");
  }

  const existingInvoice = await Invoice.findOne({
    organizationId: oid,
    orderNumber: (order as any).salesOrderNumber,
    isDeleted: false,
  })
    .select("_id invoiceNumber")
    .lean();

  if (existingInvoice) {
    await syncSalesOrderByInvoice({
      organizationId: oid,
      invoice: {
        _id: existingInvoice._id,
        orderNumber: (order as any).salesOrderNumber,
      },
      req,
    });
    const invoiceId = String(existingInvoice._id);
    res.json({
      success: true,
      data: {
        invoiceId,
        _id: invoiceId,
        invoiceNumber: existingInvoice.invoiceNumber,
      },
      message: "Sales order is already linked to an invoice",
    });
    return;
  }

  if (["INVOICED", "PARTIALLY_INVOICED"].includes(String((order as any).status || ""))) {
    throw new ValidationError("Sales order is already invoiced");
  }

  const invoiceNumber = await nextInvoiceNumber(oid);
  const invoiceItems = ((order as any).lineItems || []).map((line: any) => {
    const quantity = Number(line.quantity) || 0;
    const rate = round2(Number(line.rate) || 0);
    const lineTotal = multiplyMoney(quantity, rate);
    const lineDiscountAmount = Math.max(0, Number(line.discount) || 0);
    const discountPercent = lineTotal > 0 ? (lineDiscountAmount / lineTotal) * 100 : 0;
    const afterDiscount = Math.max(0, subtractMoney(lineTotal, lineDiscountAmount));

    const taxRef = line.taxId && String(line.taxId) !== "none" ? (line.taxId as any) : null;
    const taxPercent = Number(taxRef?.rate) || Number(line.taxPercent) || 0;
    const itemTaxAmount = percentMoney(afterDiscount, taxPercent);

    const itemRef = line.itemId as any;
    const itemId = itemRef?._id || line.itemId || null;

    return {
      itemId,
      name: itemRef?.name || line.name || line.description || "Item",
      description: line.description || "",
      hsnSacCode: itemRef?.hsnSacCode || line.hsnSacCode || "",
      quantity,
      rate,
      discountPercent,
      discountAmount: lineDiscountAmount,
      taxId: taxRef?._id || line.taxId || null,
      taxPercent,
      taxAmount: itemTaxAmount,
      amount: sumMoney([afterDiscount, itemTaxAmount]),
      accountId: null,
      projectId: null,
      costRate: 0,
      costAmount: 0,
    };
  });

  if (invoiceItems.length === 0) {
    throw new ValidationError("Sales order has no line items to convert");
  }

  const subTotal = sumMoney(
    invoiceItems.map((line: any) => multiplyMoney(Number(line.quantity) || 0, Number(line.rate) || 0)),
  );
  const lineDiscountAmount = sumMoney(((order as any).lineItems || []).map((line: any) => Number(line.discount) || 0));
  const discountType: "amount" = "amount";
  const discountValue = 0;
  const discountAmount = 0;
  const adjustmentAmount = sumMoney([Number((order as any).shippingCharges) || 0, Number((order as any).adjustment) || 0]);
  const totalTaxAmount = sumMoney(invoiceItems.map((line: any) => Number(line.taxAmount) || 0));
  const tdsAmount = (order as any).taxType === "TDS" ? round2(Number((order as any).taxAmount || 0)) : 0;
  const tcsAmount = (order as any).taxType === "TCS" ? round2(Number((order as any).tcsAmount || 0)) : 0;
  const total = sumMoney([subTotal, -lineDiscountAmount, totalTaxAmount, adjustmentAmount, -tdsAmount, tcsAmount]);

  const dueDateInput = req.body?.dueDate;
  const dueDateCandidate = dueDateInput ? new Date(dueDateInput) : null;
  const dueDate = dueDateCandidate && !Number.isNaN(dueDateCandidate.getTime()) ? dueDateCandidate : null;

  const invoice = new Invoice({
    organizationId: oid,
    invoiceNumber,
    referenceNumber: (order as any).reference || "",
    orderNumber: (order as any).salesOrderNumber || "",
    customerId: (order as any).customerId?._id || (order as any).customerId,
    invoiceDate: new Date(),
    dueDate,
    paymentTermsId: (order as any).paymentTermsId?._id || (order as any).paymentTermsId || null,
    salesPersonId: (order as any).salesPersonId?._id || (order as any).salesPersonId || null,
    subject: `Converted from Sales Order ${(order as any).salesOrderNumber}`,
    items: invoiceItems,
    subTotal,
    discountType,
    discountValue,
    discountAmount,
    taxType: (order as any).taxType || "none",
    tdsId: (order as any).tdsId || null,
    tcsId: (order as any).tcsId || null,
    taxAmount: (order as any).taxAmount || 0,
    tcsAmount: (order as any).tcsAmount || 0,
    adjustmentLabel: "Shipping & Adjustment",
    adjustmentAmount,
    total,
    balanceDue: total,
    customerNotes: (order as any).notes || "",
    termsAndConditions: (order as any).terms || "",
    status: "Draft",
    emailContacts: [],
    attachments: [],
    paymentReceived: false,
    isRecurring: false,
    journalEntries: [],
    pdfTemplateId: null,
    sentAt: null,
    paidAt: null,
  });

  attachUser(invoice as any, req);
  await invoice.save();

  await syncSalesOrderByInvoice({
    organizationId: oid,
    invoice,
    req,
  });

  res.status(201).json({
    success: true,
    data: {
      invoiceId: String((invoice as any)._id),
      _id: String((invoice as any)._id),
      invoiceNumber: (invoice as any).invoiceNumber,
    },
  });
});

/** POST /api/sales-orders/:id/send-email */
export const sendEmail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any)
    .populate("customerId", "displayName email companyName")
    .populate("lineItems.itemId", "name hsnSacCode")
    .populate("lineItems.taxId", "name rate taxAuthority taxType");

  if (!order) throw new NotFoundError("Sales Order");
  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot email a void sales order");
  }

  const body = req.body || {};
  const toEmails: string[] = body.to || [];
  const ccEmails: string[] = body.cc || [];
  const bccEmails: string[] = body.bcc || [];
  const subject: string = body.subject || `Sales Order - ${(order as any).salesOrderNumber}`;
  const emailBody: string = body.body || "";
  const attachPdf: boolean = body.attachPdf !== false;

  if (toEmails.length === 0) {
    // Try to get customer email
    const customerRef = (order as any).customerId as any;
    const custEmail = customerRef?.email || "";
    if (!custEmail) {
      throw new ValidationError("No recipient email address provided");
    }
    toEmails.push(custEmail);
  }

  // Get organization info
  const org = await Organization.findById(oid).lean();

  let pdfBuffer: Buffer | null = null;
  if (attachPdf) {
    try {
      pdfBuffer = await generateSalesOrderPdf({
        order: order as any,
        organization: org,
      });
    } catch {
      // PDF generation failed, send without attachment
    }
  }

  try {
    await sendSalesOrderEmailService({
      organizationId: String(oid),
      to: toEmails,
      cc: ccEmails,
      bcc: bccEmails,
      subject,
      body: emailBody,
      order: order as any,
      organization: org,
      pdfBuffer,
    });
  } catch (err: any) {
    throw new ValidationError(err.message || "Failed to send email");
  }

  // Update order status to APPROVED if it was DRAFT
  if ((order as any).status === "DRAFT") {
    (order as any).status = "APPROVED";
    await updateCommittedStock((order as any).lineItems, "commit");
    attachUser(order as any, req);
    await order.save();
  }

  res.json({ success: true, message: "Sales order email sent successfully" });
});

/** GET /api/sales-orders/:id/pdf */
export const downloadPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({
    _id: req.params.id,
    organizationId: oid,
    isDeleted: false,
  } as any)
    .populate("customerId", "displayName companyName email billingAddress")
    .populate("lineItems.itemId", "name hsnSacCode")
    .populate("lineItems.taxId", "name rate taxAuthority taxType")
    .lean();

  if (!order) throw new NotFoundError("Sales Order");

  const org = await Organization.findById(oid).lean();
  if (!org) throw new NotFoundError("Organization");

  const pdfBuffer = await generateSalesOrderPdf({
    order,
    organization: org,
  });

  const isPreview = req.query.preview === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isPreview ? "inline" : "attachment"}; filename="Sales-Order-${(order as any).salesOrderNumber}.pdf"`,
  );
  res.send(pdfBuffer);
});

/** POST /api/sales-orders/:id/update-shipment */
export const updateShipment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  const { shipmentStatus } = req.body;
  await transitionShipmentStatus({
    order,
    shipmentStatus,
    req,
  });

  res.json({ success: true, data: order });
});

export const instantInvoice = convertToInvoice;

/** POST /api/sales-orders/:id/mark-shipment-fulfilled */
export const markShipmentFulfilled = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot fulfill shipment for a void sales order");
  }

  const existingPackages = await Package.find({
    organizationId: oid,
    salesOrderId: (order as any)._id,
    isDeleted: false,
  } as any)
    .select("lineItems")
    .lean();

  const packedQtyMap = new Map<string, number>();
  for (const pkg of existingPackages as any[]) {
    for (const li of pkg.lineItems || []) {
      const itemKey = String((li as any).itemId || "");
      const packed = toNum((li as any).quantityToPack);
      packedQtyMap.set(itemKey, toNum(packedQtyMap.get(itemKey), 0) + packed);
    }
  }

  const lineItemsToPack = ((order as any).lineItems || [])
    .map((li: any) => {
      const itemId = typeof li.itemId === "object" ? li.itemId?._id : li.itemId;
      const itemKey = String(itemId || "");
      const ordered = toNum(li.quantity);
      const packed = toNum(packedQtyMap.get(itemKey), 0);
      const quantityToPack = Math.max(0, ordered - packed);

      return {
        itemId,
        name: li.name || li.description || "Item",
        ordered,
        packed,
        quantityToPack,
      };
    })
    .filter((li: any) => li.itemId && li.quantityToPack > 0);

  if (lineItemsToPack.length > 0) {
    const pkg = new Package({
      organizationId: oid,
      salesOrderId: (order as any)._id,
      packageSlipNumber: `PKG-${String((order as any).salesOrderNumber)}-${existingPackages.length + 1}`,
      date: new Date(),
      lineItems: lineItemsToPack,
      internalNotes: "Auto-created while marking shipment as fulfilled",
    });
    attachUser(pkg as any, req);
    await pkg.save();
  }

  await transitionShipmentStatus({
    order,
    shipmentStatus: "Delivered",
    req,
  });

  res.json({ success: true, data: order });
});

/** POST /api/sales-orders/:id/dropship */
export const dropship = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  if (String((order as any).status || "") === "VOID") {
    throw new ValidationError("Cannot set dropship on a void sales order");
  }

  (order as any).deliveryMethod = "Dropship";
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order, message: "Order marked for dropship" });
});

/** POST /api/sales-orders/:id/void */
export const voidOrder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  if (String((order as any).invoiceStatus || "") === "Invoiced" || (order as any).invoiceId) {
    throw new ValidationError("Cannot void a sales order after invoice linkage");
  }

  if (String((order as any).status || "") === "APPROVED") {
    await updateCommittedStock((order as any).lineItems || [], "release");
  }

  (order as any).status = "VOID";
  (order as any).isActive = false;
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order, message: "Sales order voided" });
});

/** POST /api/sales-orders/:id/cancel-items */
export const cancelItems = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  if (String((order as any).invoiceStatus || "") === "Invoiced" || (order as any).invoiceId) {
    throw new ValidationError("Cannot cancel items after invoice linkage");
  }

  if (String((order as any).status || "") === "APPROVED") {
    await updateCommittedStock((order as any).lineItems || [], "release");
  }

  (order as any).lineItems = [];
  (order as any).subTotal = 0;
  (order as any).shippingCharges = 0;
  (order as any).adjustment = 0;
  (order as any).total = 0;
  (order as any).invoiceStatus = "Not Invoiced";
  (order as any).invoiceId = null;
  (order as any).shipmentStatus = "Pending";
  (order as any).status = "VOID";
  (order as any).isActive = false;
  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order, message: "All sales order items cancelled" });
});

/** POST /api/sales-orders/:id/clone */
export const cloneOrder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const source = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid, isDeleted: false } as any).lean();
  if (!source) throw new NotFoundError("Sales Order");

  const salesOrderNumber = await nextSalesOrderNumber(oid);

  const clone = new SalesOrder({
    organizationId: source.organizationId,
    customerId: source.customerId,
    salesOrderNumber,
    reference: source.reference || "",
    orderDate: new Date(),
    expectedShipmentDate: source.expectedShipmentDate || null,
    paymentTermsId: source.paymentTermsId || null,
    deliveryMethod: source.deliveryMethod || "",
    salesPersonId: source.salesPersonId || null,
    lineItems: (source.lineItems || []).map((li: any) => ({
      itemId: li.itemId,
      name: li.name || "",
      description: li.description || "",
      hsnSacCode: li.hsnSacCode || "",
      quantity: toNum(li.quantity),
      rate: toNum(li.rate),
      discount: toNum(li.discount),
      taxId: li.taxId || null,
      taxPercent: toNum(li.taxPercent),
      taxAmount: toNum(li.taxAmount),
      amount: toNum(li.amount),
    })),
    subTotal: toNum(source.subTotal),
    shippingCharges: toNum(source.shippingCharges),
    adjustment: toNum(source.adjustment),
    total: toNum(source.total),
    notes: source.notes || "",
    terms: source.terms || "",
    status: "DRAFT",
    invoiceStatus: "Not Invoiced",
    shipmentStatus: "Pending",
    invoiceId: null,
    isActive: true,
  });

  attachUser(clone as any, req);
  await clone.save();

  res.status(201).json({ success: true, data: clone, message: "Sales order cloned" });
});

/** GET /api/sales-orders/:id/purchase-order-draft */
export const getPurchaseOrderDraft = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { draft } = await buildPurchaseOrderDraftFromSalesOrder({
    organizationId: oid,
    salesOrderId: String(req.params.id),
    requestedVendorId: req.query?.vendorId,
    copyDescriptions: req.query?.copyDescriptions !== "false",
    req,
  });

  res.json({ success: true, data: draft });
});

/** POST /api/sales-orders/:id/convert-to-purchase-order */
export const convertToPurchaseOrder = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const { order, draft } = await buildPurchaseOrderDraftFromSalesOrder({
    organizationId: oid,
    salesOrderId: String(req.params.id),
    requestedVendorId: req.body?.vendorId,
    copyDescriptions: req.body?.copyDescriptions !== false,
    req,
  });

  const po = new PurchaseOrder({
    organizationId: oid,
    vendorId: draft.vendorId,
    deliveryAddressType: draft.deliveryAddressType,
    deliveryCustomerId: draft.deliveryCustomerId,
    purchaseOrderNumber: draft.purchaseOrderNumber,
    referenceNumber: draft.referenceNumber,
    purchaseOrderDate: draft.purchaseOrderDate,
    deliveryDate: draft.deliveryDate,
    paymentTermsId: draft.paymentTermsId,
    shipmentPreference: draft.shipmentPreference,
    discountLevel: draft.discountLevel,
    discountAccountId: draft.discountAccountId,
    lineItems: draft.lineItems,
    subTotal: draft.subTotal,
    discountPercent: draft.discountPercent,
    discountAmount: draft.discountAmount,
    taxType: draft.taxType,
    tdsId: draft.tdsId,
    tcsId: draft.tcsId,
    taxAmount: draft.taxAmount,
    tcsAmount: draft.tcsAmount,
    adjustmentLabel: draft.adjustmentLabel,
    adjustmentAmount: draft.adjustmentAmount,
    total: draft.total,
    notes: draft.notes,
    termsAndConditions: draft.termsAndConditions,
    attachments: draft.attachments,
    comments: [
      {
        author: "System",
        text: `Converted from Sales Order ${(order as any).salesOrderNumber}`,
        time: new Date(),
        isSystem: true,
      },
    ],
    status: "Draft",
  });

  attachUser(po as any, req);
  await po.save();

  res.status(201).json({
    success: true,
    data: {
      purchaseOrderId: String((po as any)._id),
      purchaseOrderNumber: (po as any).purchaseOrderNumber,
      _id: String((po as any)._id),
    },
    message: "Sales order converted to purchase order",
  });
});

export const getNextNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = orgId(req);
    const nextNumber = await nextSalesOrderNumber(organizationId);
    res.json({ success: true, data: { salesOrderNumber: nextNumber } });
  }
);
