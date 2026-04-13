import { Response } from "express";
import SalesOrder, { SalesOrderStatus } from "../models/sales-order.model";
import Invoice from "../models/invoice.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function computeTotals(lineItems: any[], shippingCharges: number, adjustment: number) {
  const subTotal = (lineItems || []).reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
  const total = subTotal + (Number(shippingCharges) || 0) + (Number(adjustment) || 0);
  return { subTotal, total };
}

function normalizeLineItems(items: any[] = []) {
  return (items || []).map((line) => {
    const { taxPercent, ...rest } = line || {};
    return {
      ...rest,
      taxId: rest.taxId || null,
    };
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
  if (status) filter.status = status;
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
    .populate("customerId paymentTermsId salesPersonId")
    .sort({ orderDate: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data: orders,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/sales-orders/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) } as any)
    .populate("customerId paymentTermsId salesPersonId lineItems.itemId lineItems.taxId");
  if (!order) throw new NotFoundError("Sales Order");
  res.json({ success: true, data: order });
});

/** POST /api/sales-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const {
    customerId,
    salesOrderNumber,
    orderDate,
    lineItems,
    shippingCharges = 0,
    adjustment = 0,
    status = "DRAFT" as SalesOrderStatus,
  } = req.body;

  if (!customerId) throw new ValidationError("customerId is required");
  if (!salesOrderNumber) throw new ValidationError("salesOrderNumber is required");
  if (!orderDate) throw new ValidationError("orderDate is required");
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ValidationError("At least one line item is required");
  }

  const linkedLineItems = normalizeLineItems(
    await applyItemTaxLinkageToItems({
      organizationId: oid,
      contactId: customerId,
      items: lineItems,
    }),
  );

  const { subTotal, total } = computeTotals(linkedLineItems, shippingCharges, adjustment);

  const order = new SalesOrder({
    organizationId: oid,
    ...req.body,
    lineItems: linkedLineItems,
    subTotal,
    total,
    status,
  });
  attachUser(order as any, req);
  await order.save();

  res.status(201).json({ success: true, data: order });
});

/** PATCH /api/sales-orders/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: oid } as any);
  if (!order) throw new NotFoundError("Sales Order");

  const allowed = [
    "customerId",
    "salesOrderNumber",
    "reference",
    "orderDate",
    "expectedShipmentDate",
    "paymentTermsId",
    "deliveryMethod",
    "salesPersonId",
    "lineItems",
    "shippingCharges",
    "adjustment",
    "notes",
    "terms",
    "status",
    "isActive",
  ];

  allowed.forEach((f) => {
    if (req.body[f] !== undefined) (order as any)[f] = req.body[f];
  });

  if (req.body.lineItems || req.body.customerId !== undefined) {
    const customerId = req.body.customerId ?? (order as any).customerId;
    const sourceLineItems = req.body.lineItems || (order as any).lineItems || [];
    const linkedLineItems = normalizeLineItems(
      await applyItemTaxLinkageToItems({
        organizationId: oid,
        contactId: customerId,
        items: sourceLineItems,
      }),
    );
    (order as any).lineItems = linkedLineItems;
  }

  if (
    req.body.lineItems ||
    req.body.customerId !== undefined ||
    req.body.shippingCharges !== undefined ||
    req.body.adjustment !== undefined
  ) {
    const { subTotal, total } = computeTotals(
      (order as any).lineItems,
      (order as any).shippingCharges,
      (order as any).adjustment,
    );
    (order as any).subTotal = subTotal;
    (order as any).total = total;
  }

  attachUser(order as any, req);
  await order.save();

  res.json({ success: true, data: order });
});

/** DELETE /api/sales-orders/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, organizationId: orgId(req) } as any);
  if (!order) throw new NotFoundError("Sales Order");

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

  const existingInvoice = await Invoice.findOne({
    organizationId: oid,
    orderNumber: (order as any).salesOrderNumber,
    isDeleted: false,
  })
    .select("_id invoiceNumber")
    .lean();

  if (existingInvoice) {
    if ((order as any).status !== "INVOICED") {
      (order as any).status = "INVOICED";
      attachUser(order as any, req);
      await order.save();
    }
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
    const rate = Number(line.rate) || 0;
    const lineTotal = quantity * rate;
    const lineDiscountAmount = Math.max(0, Number(line.discount) || 0);
    const discountPercent = lineTotal > 0 ? (lineDiscountAmount / lineTotal) * 100 : 0;
    const afterDiscount = Math.max(0, lineTotal - lineDiscountAmount);

    const taxRef = line.taxId as any;
    const taxPercent = Number(taxRef?.rate) || 0;
    const itemTaxAmount = (afterDiscount * taxPercent) / 100;

    const itemRef = line.itemId as any;
    const itemId = itemRef?._id || line.itemId || null;

    return {
      itemId,
      name: itemRef?.name || line.description || "Item",
      description: line.description || "",
      hsnSacCode: itemRef?.hsnSacCode || "",
      quantity,
      rate,
      discountPercent,
      discountAmount: lineDiscountAmount,
      taxId: taxRef?._id || line.taxId || null,
      taxPercent,
      taxAmount: itemTaxAmount,
      amount: afterDiscount + itemTaxAmount,
      accountId: null,
      projectId: null,
      costRate: 0,
      costAmount: 0,
    };
  });

  if (invoiceItems.length === 0) {
    throw new ValidationError("Sales order has no line items to convert");
  }

  const subTotal = invoiceItems.reduce(
    (sum: number, line: any) => sum + (Number(line.quantity) || 0) * (Number(line.rate) || 0),
    0,
  );
  const discountValue = ((order as any).lineItems || []).reduce(
    (sum: number, line: any) => sum + (Number(line.discount) || 0),
    0,
  );
  const discountType: "amount" = "amount";
  const discountAmount = discountValue;
  const adjustmentAmount = (Number((order as any).shippingCharges) || 0) + (Number((order as any).adjustment) || 0);
  const total = subTotal - discountAmount + adjustmentAmount;

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
    taxType: "none",
    taxId: null,
    taxAmount: 0,
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

  (order as any).status = "INVOICED";
  attachUser(order as any, req);
  await order.save();

  res.status(201).json({
    success: true,
    data: {
      invoiceId: String((invoice as any)._id),
      _id: String((invoice as any)._id),
      invoiceNumber: (invoice as any).invoiceNumber,
    },
  });
});
