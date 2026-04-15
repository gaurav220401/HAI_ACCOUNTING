import { Response } from "express";
import PurchaseOrder from "../models/purchase-order.model";
import Organization from "../models/organization.model";
import Contact from "../models/contact.model";
import { AuthenticatedRequest } from "../types";
import Bill from "../models/bill.model";

import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import { sendPurchaseOrderEmail as sendPurchaseOrderEmailService } from "../services/email.service";
import { generatePurchaseOrderPdf } from "../services/pdf.service";
import { findAccountIdByName } from "../services/gl-posting.service";
import { syncBillCreationAccounting } from "../services/bill-accounting.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

async function nextPONumber(organizationId: any): Promise<string> {
  const last = await PurchaseOrder.findOne({ 
    organizationId,
    isDeleted: { $in: [true, false] } // Bypass soft-delete filter to find absolute last number
  })
    .sort({ purchaseOrderNumber: -1 })
    .select("purchaseOrderNumber")
    .lean();
  if (!last) return "PO-00001";
  const match = last.purchaseOrderNumber.match(/PO-(\d+)/);
  if (!match) return "PO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PO-${String(next).padStart(5, "0")}`;
}

async function nextBillNumber(organizationId: any): Promise<string> {
  const last = await Bill.findOne({ 
    organizationId,
    isDeleted: { $in: [true, false] }
  })
    .sort({ billNumber: -1 })
    .select("billNumber")
    .lean();
  if (!last) return "BILL-00001";
  const match = last.billNumber.match(/BILL-(\d+)/);
  if (!match) return "BILL-00001";
  const next = parseInt(match[1], 10) + 1;
  return `BILL-${String(next).padStart(5, "0")}`;
}


function calcLineItems(items: any[], discountLevel: string) {
  return (items || []).map((item: any) => {
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const lineTotal = qty * rate;
    if (discountLevel === "line_item") {
      const discPct = Number(item.discountPercent) || 0;
      const discAmt = Number(item.discountAmount) || (lineTotal * discPct) / 100;
      return { ...item, quantity: qty, rate, discountPercent: discPct, discountAmount: discAmt, amount: lineTotal - discAmt };
    }
    return { ...item, quantity: qty, rate, discountPercent: 0, discountAmount: 0, amount: lineTotal };
  });
}

function parseStringArray(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function parseUploadedAttachments(input: unknown): { filename: string; path: string }[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((att) => {
      const filename = String((att as any)?.filename || "").trim();
      const path = String((att as any)?.path || "").trim();
      if (!filename || !path) return null;
      return { filename, path };
    })
    .filter((att): att is { filename: string; path: string } => Boolean(att));
}

const fmtCur = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

/** GET /api/purchase-orders/next-number */
export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const num = await nextPONumber(orgId(req));
  res.json({ success: true, data: { purchaseOrderNumber: num } });
});

/** GET /api/purchase-orders */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    status, search, vendorId, poNumber, referenceNumber, 
    dateStart, dateEnd, deliveryStart, deliveryEnd, 
    amountMin, amountMax, itemNameId, accountId,
    page = 1, limit = 25, sortBy = "createdAt", sortOrder = "desc" 
  } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;
  if (poNumber) filter.purchaseOrderNumber = { $regex: poNumber, $options: "i" };
  if (referenceNumber) filter.referenceNumber = { $regex: referenceNumber, $options: "i" };
  if (itemNameId) filter["lineItems.itemId"] = itemNameId;
  if (accountId) filter["lineItems.accountId"] = accountId;

  if (dateStart || dateEnd) {
    filter.purchaseOrderDate = {};
    if (dateStart) filter.purchaseOrderDate.$gte = new Date(dateStart as string);
    if (dateEnd) filter.purchaseOrderDate.$lte = new Date(dateEnd as string);
  }

  if (deliveryStart || deliveryEnd) {
    filter.deliveryDate = {};
    if (deliveryStart) filter.deliveryDate.$gte = new Date(deliveryStart as string);
    if (deliveryEnd) filter.deliveryDate.$lte = new Date(deliveryEnd as string);
  }

  if (amountMin || amountMax) {
    filter.total = {};
    if (amountMin) filter.total.$gte = toNum(amountMin);
    if (amountMax) filter.total.$lte = toNum(amountMax);
  }

  if (search) {
    filter.$or = [
      { purchaseOrderNumber: { $regex: search, $options: "i" } },
      { referenceNumber: { $regex: search, $options: "i" } },
    ];
  }

  const total = await PurchaseOrder.countDocuments(filter);
  const orders = await PurchaseOrder.find(filter)
    .populate("vendorId", "displayName companyName email")
    .populate("paymentTermsId", "name")
    .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({ success: true, data: orders, pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) } });
});

/** GET /api/purchase-orders/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("vendorId", "displayName companyName email billingAddress phone")
    .populate("paymentTermsId", "name days")
    .populate("lineItems.itemId", "name sku costPrice")
    .populate("lineItems.accountId", "name accountType")
    .populate("tdsId", "taxName rate sectionCode")
    .populate("discountAccountId", "name");
  if (!po) throw new NotFoundError("Purchase Order");
  res.json({ success: true, data: po });
});

/** POST /api/purchase-orders */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  if (!req.body.purchaseOrderDate) throw new ValidationError("Purchase order date is required");

  const purchaseOrderNumber = req.body.purchaseOrderNumber || (await nextPONumber(oid));
  const discountLevel = req.body.discountLevel || "transaction";
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxType = req.body.taxType || "none";
  const tdsId = taxType === "TDS" ? (req.body.tdsId || null) : null;
  const tcsId = taxType === "TCS" ? (req.body.tcsId || null) : null;
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  const po = new PurchaseOrder({
    organizationId: oid,
    vendorId: req.body.vendorId || null,
    deliveryAddressType: req.body.deliveryAddressType || "Organization",
    deliveryCustomerId: req.body.deliveryCustomerId || null,
    purchaseOrderNumber,
    referenceNumber: req.body.referenceNumber || "",
    purchaseOrderDate: req.body.purchaseOrderDate,
    deliveryDate: req.body.deliveryDate || null,
    paymentTermsId: req.body.paymentTermsId || null,
    shipmentPreference: req.body.shipmentPreference || "",
    discountLevel,
    discountAccountId: req.body.discountAccountId || null,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType,
    tdsId,
    tcsId,
    taxAmount,
    tcsAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: req.body.status || "Draft",
    comments: [{
      author: "System",
      text: `Purchase Order created for ${fmtCur(total)}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(po, req);
  await po.save();
  res.status(201).json({ success: true, data: po });
});

/** PATCH /api/purchase-orders/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");

  const discountLevel = req.body.discountLevel || po.discountLevel;
  const lineItems = req.body.lineItems ? calcLineItems(req.body.lineItems, discountLevel) : po.lineItems;
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = discountLevel === "transaction" ? toNum(req.body.discountPercent, po.discountPercent) : 0;
  const discountAmount = discountLevel === "transaction" ? (subTotal * discountPercent) / 100 : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxType = req.body.taxType ?? po.taxType;
  const taxAmount = taxType === "TDS" ? toNum(req.body.taxAmount, po.taxAmount) : 0;
  const tcsAmount = taxType === "TCS" ? toNum(req.body.tcsAmount, (po as any).tcsAmount) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount, po.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;
  const nextTdsId = taxType === "TDS"
    ? (req.body.tdsId !== undefined ? req.body.tdsId : po.tdsId)
    : null;
  const nextTcsId = taxType === "TCS"
    ? (req.body.tcsId !== undefined ? req.body.tcsId : (po as any).tcsId)
    : null;

  if (req.body.status && req.body.status !== po.status) {
    po.comments.push({
      author: "System",
      text: `Status changed from ${po.status} to ${req.body.status}`,
      time: new Date(),
      isSystem: true,
    });
  }
  
  Object.assign(po, {
    vendorId: req.body.vendorId !== undefined ? req.body.vendorId : po.vendorId,
    deliveryAddressType: req.body.deliveryAddressType || po.deliveryAddressType,
    deliveryCustomerId: req.body.deliveryCustomerId !== undefined ? req.body.deliveryCustomerId : po.deliveryCustomerId,
    referenceNumber: req.body.referenceNumber !== undefined ? req.body.referenceNumber : po.referenceNumber,
    purchaseOrderDate: req.body.purchaseOrderDate || po.purchaseOrderDate,
    deliveryDate: req.body.deliveryDate !== undefined ? req.body.deliveryDate : po.deliveryDate,
    paymentTermsId: req.body.paymentTermsId !== undefined ? req.body.paymentTermsId : po.paymentTermsId,
    shipmentPreference: req.body.shipmentPreference !== undefined ? req.body.shipmentPreference : po.shipmentPreference,
    discountLevel,
    discountAccountId: req.body.discountAccountId !== undefined ? req.body.discountAccountId : po.discountAccountId,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType,
    tdsId: nextTdsId,
    tcsId: nextTcsId,
    taxAmount,
    tcsAmount,
    adjustmentLabel: req.body.adjustmentLabel || po.adjustmentLabel,
    adjustmentAmount,
    total,
    notes: req.body.notes !== undefined ? req.body.notes : po.notes,
    termsAndConditions: req.body.termsAndConditions !== undefined ? req.body.termsAndConditions : po.termsAndConditions,
    attachments: req.body.attachments || po.attachments,
    status: req.body.status || po.status,
  });
  attachUser(po, req);
  await po.save();
  res.json({ success: true, data: po });
});

/** POST /api/purchase-orders/:id/comments */
export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");
  
  po.comments.push({
    author: (req.user as any)?.displayName || req.user?.email || "User",
    text: req.body.text,
    time: new Date(),
    isSystem: req.body.isSystem === true,
  });
  
  await po.save();
  res.json({ success: true, data: po.comments[po.comments.length - 1] });
});

/** DELETE /api/purchase-orders/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");
  po.isDeleted = true;
  po.deletedAt = new Date();
  attachUser(po, req);
  await po.save();
  res.json({ success: true, message: "Purchase Order deleted" });
});

/** GET /api/purchase-orders/:id/pdf */
export const downloadPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email billingAddress statementTemplate")
    .populate("lineItems.itemId", "name")
    .lean();

  if (!po) throw new NotFoundError("Purchase Order");

  const org = await Organization.findById(po.organizationId).lean();
  if (!org) throw new NotFoundError("Organization");

  const vendor = po.vendorId as any;
  const vendorName =
    (typeof vendor === "object" && (vendor?.displayName || vendor?.companyName)) ||
    "Vendor";

  const vendorAddress = [
    vendor?.billingAddress?.street,
    vendor?.billingAddress?.city,
    vendor?.billingAddress?.state,
    vendor?.billingAddress?.zip,
    vendor?.billingAddress?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const pdfBuffer = await generatePurchaseOrderPdf({
    orgName: org.name,
    orgLogoUrl: (org as any).logo,
    orgAddress: org.address as any,
    orgTaxId: (org as any).taxId,
    vendorName,
    vendorAddress,
    vendorEmail: vendor?.email,
    templateConfig: vendor?.statementTemplate,
    purchaseOrderNumber: po.purchaseOrderNumber,
    purchaseOrderDate: po.purchaseOrderDate.toISOString(),
    deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : undefined,
    referenceNumber: po.referenceNumber,
    items: (po.lineItems || [])
      .filter((li: any) => !li.isHeader)
      .map((li: any) => ({
        name:
          (typeof li.itemId === "object" && li.itemId?.name) ||
          li.name ||
          "Item",
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
      })),
    subTotal: po.subTotal,
    discountAmount: po.discountAmount,
    taxLabel: po.taxType !== "none" ? `${po.taxType} Tax` : undefined,
    taxAmount: po.taxAmount,
    adjustmentLabel: po.adjustmentLabel,
    adjustmentAmount: po.adjustmentAmount,
    total: po.total,
    notes: po.notes,
    termsAndConditions: po.termsAndConditions,
    currencySymbol: org.baseCurrency === "INR" ? "₹" : org.baseCurrency,
  });

  const isPreview = req.query.preview === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isPreview ? "inline" : "attachment"}; filename="Purchase-Order-${po.purchaseOrderNumber}.pdf"`,
  );
  res.send(pdfBuffer);
});

/** POST /api/purchase-orders/:id/send-email */
export const sendPurchaseOrderEmail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const po = await PurchaseOrder.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email billingAddress statementTemplate")
    .populate("lineItems.itemId", "name")
    .lean();

  if (!po) throw new NotFoundError("Purchase Order");

  const to = parseStringArray(req.body.to);
  const cc = parseStringArray(req.body.cc);
  const bcc = parseStringArray(req.body.bcc);
  const subject: string = req.body.subject || `Purchase Order ${po.purchaseOrderNumber}`;
  const body: string = req.body.body || "";
  const attachPurchaseOrderPdf: boolean =
    req.body.attachPurchaseOrderPdf === true ||
    req.body.attachPurchaseOrderPdf === "true";
  const uploadedAttachments = parseUploadedAttachments(req.body.attachments);

  const vendor = po.vendorId as any;
  const vendorName =
    (typeof vendor === "object" && (vendor?.displayName || vendor?.companyName)) ||
    "Vendor";

  const defaultTo = vendor?.email ? [vendor.email] : [];
  const recipients = to.length > 0 ? to : defaultTo;
  if (recipients.length === 0) {
    throw new ValidationError("At least one recipient (to) is required");
  }

  const org = await Organization.findById(po.organizationId).lean();
  if (!org) throw new NotFoundError("Organization");

  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[] = [];

  if (attachPurchaseOrderPdf) {
    const vendorAddress = [
      vendor?.billingAddress?.street,
      vendor?.billingAddress?.city,
      vendor?.billingAddress?.state,
      vendor?.billingAddress?.zip,
      vendor?.billingAddress?.country,
    ]
      .filter(Boolean)
      .join(", ");

    const pdfBuffer = await generatePurchaseOrderPdf({
      orgName: org.name,
      orgLogoUrl: (org as any).logo,
      orgAddress: org.address as any,
      orgTaxId: (org as any).taxId,
      vendorName,
      vendorAddress,
      vendorEmail: vendor?.email,
      templateConfig: vendor?.statementTemplate,
      purchaseOrderNumber: po.purchaseOrderNumber,
      purchaseOrderDate: po.purchaseOrderDate.toISOString(),
      deliveryDate: po.deliveryDate ? po.deliveryDate.toISOString() : undefined,
      referenceNumber: po.referenceNumber,
      items: (po.lineItems || [])
        .filter((li: any) => !li.isHeader)
        .map((li: any) => ({
          name:
            (typeof li.itemId === "object" && li.itemId?.name) ||
            li.name ||
            "Item",
          description: li.description,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
        })),
      subTotal: po.subTotal,
      discountAmount: po.discountAmount,
      taxLabel: po.taxType !== "none" ? `${po.taxType} Tax` : undefined,
      taxAmount: po.taxAmount,
      adjustmentLabel: po.adjustmentLabel,
      adjustmentAmount: po.adjustmentAmount,
      total: po.total,
      notes: po.notes,
      termsAndConditions: po.termsAndConditions,
      currencySymbol: org.baseCurrency === "INR" ? "₹" : org.baseCurrency,
    });

    attachments.push({
      filename: `Purchase-Order-${po.purchaseOrderNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    });
  }

  if (uploadedAttachments.length > 0) {
    for (const att of uploadedAttachments) {
      attachments.push(att as any);
    }
  }

  await sendPurchaseOrderEmailService({
    organizationId: po.organizationId.toString(),
    to: recipients,
    cc,
    bcc,
    subject,
    body,
    purchaseOrderNumber: po.purchaseOrderNumber,
    purchaseOrderTotal: po.total,
    purchaseOrderDate: po.purchaseOrderDate.toISOString(),
    vendorName,
    attachments: attachments.length > 0 ? attachments : undefined,
    rawBody: true, // Use the body exactly as sent from the rich text editor
  });

  res.json({
    success: true,
    message: "Purchase order email sent successfully",
  });
});

/** POST /api/purchase-orders/:id/clone */
export const clone = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const source = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false }).lean();
  if (!source) throw new NotFoundError("Purchase Order");

  const purchaseOrderNumber = await nextPONumber(source.organizationId);
  const { _id, __v, ...cloneData } = source as any;
  
  const po = new PurchaseOrder({
    ...cloneData,
    purchaseOrderNumber,
    purchaseOrderDate: new Date(),
    status: "Draft",
    comments: [{
      author: "System",
      text: `Purchase Order cloned from ${source.purchaseOrderNumber}`,
      time: new Date(),
      isSystem: true,
    }],
  });
  attachUser(po, req);
  await po.save();
  res.status(201).json({ success: true, data: po });
});

/** POST /api/purchase-orders/:id/convert-to-bill */
export const convertToBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const po = await PurchaseOrder.findOne({ _id: req.params.id, organizationId: oid, isDeleted: false });
  if (!po) throw new NotFoundError("Purchase Order");
  
  if (po.status === "Billed") {
    throw new ValidationError("This purchase order has already been converted to a bill.");
  }

  const billNumber = await nextBillNumber(oid);

  // Resolve Accounts Payable from vendor contact or default
  let resolvedAPId = null;
  if (po.vendorId) {
    const vendor = await Contact.findOne({
      _id: po.vendorId,
      organizationId: oid,
      isDeleted: false,
    }).select("accountsPayableId").lean();
    resolvedAPId = vendor?.accountsPayableId || null;
  }
  if (!resolvedAPId) {
    try {
      resolvedAPId = await findAccountIdByName({
        organizationId: oid,
        names: ["Accounts Payable", "Trade Payables", "Creditors"],
        rootType: "Liability",
        accountType: "Accounts Payable",
      });
    } catch {
      resolvedAPId = null;
    }
  }

  // Create the Bill
  const bill = new Bill({
    organizationId: oid,
    vendorId: po.vendorId,
    billNumber,
    referenceNumber: po.referenceNumber || "",
    orderNumber: po.purchaseOrderNumber,
    billDate: new Date(),
    dueDate: po.deliveryDate || null,
    paymentTermsId: po.paymentTermsId,
    accountsPayableId: resolvedAPId,
    subject: po.referenceNumber ? `Bill for PO: ${po.purchaseOrderNumber} (Ref: ${po.referenceNumber})` : `Bill for PO: ${po.purchaseOrderNumber}`,
    lineItems: po.lineItems.map(li => ({
      isHeader: li.isHeader,
      headerText: li.headerText,
      itemId: li.itemId,
      name: li.name,
      description: li.description,
      quantity: li.quantity,
      rate: li.rate,
      discountPercent: li.discountPercent,
      amount: li.amount,
      accountId: li.accountId,
    })),
    subTotal: po.subTotal,
    discountLevel: po.discountLevel,
    discountAccountId: po.discountAccountId,
    discountPercent: po.discountPercent,
    discountAmount: po.discountAmount,
    taxType: po.taxType,
    tdsId: po.tdsId,
    tcsId: po.tcsId,
    taxAmount: po.taxAmount,
    tcsAmount: po.tcsAmount,
    adjustmentLabel: po.adjustmentLabel,
    adjustmentAmount: po.adjustmentAmount,
    total: po.total,
    balanceDue: po.total,
    notes: po.notes,
    termsAndConditions: po.termsAndConditions,
    attachments: po.attachments,
    status: "Open",
    comments: [{
      author: "System",
      text: `Bill created from Purchase Order ${po.purchaseOrderNumber}`,
      time: new Date(),
      isSystem: true,
    }],
  });

  attachUser(bill, req);
  await bill.save();

  // Update PO status
  po.status = "Billed";
  po.comments.push({
    author: "System",
    text: `Converted to Bill ${billNumber}`,
    time: new Date(),
    isSystem: true,
  });
  await po.save();

  await syncBillCreationAccounting({ bill, req });
  
  res.json({ 
    success: true, 
    message: "Purchase order converted to bill successfully", 
    data: { po, billId: bill._id } 
  });
});


