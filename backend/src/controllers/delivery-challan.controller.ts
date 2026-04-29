import { Response } from "express";
import DeliveryChallan from "../models/delivery-challan.model";
import Invoice from "../models/invoice.model";
import SalesOrder from "../models/sales-order.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { syncSalesOrderStatus } from "../services/status-sync.service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSalesOrderNumber(value: unknown): string {
  return String(value || "").trim();
}

async function normalizeItems(
  organizationId: any,
  customerId: any,
  items: any[] = [],
) {
  const linkedItems = await applyItemTaxLinkageToItems({
    organizationId,
    contactId: customerId,
    items,
  });

  return linkedItems.map((item) => {
    const quantity = Number(item.quantity) || 1;
    const rate = Number(item.rate) || 0;
    const lineTotal = quantity * rate;
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount =
      item.discountAmount !== undefined && item.discountAmount !== null ?
        Number(item.discountAmount)
      : (lineTotal * discountPercent) / 100;
    const afterDiscount = lineTotal - discountAmount;
    const taxPercent = Number(item.taxPercent) || 0;
    const taxAmount =
      item.taxAmount !== undefined && item.taxAmount !== null ?
        Number(item.taxAmount)
      : (afterDiscount * taxPercent) / 100;

    return {
      ...item,
      quantity,
      rate,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      amount: afterDiscount + taxAmount,
    };
  });
}

function summarizeTotals(
  items: any[],
  discountType: string,
  discountValue: number,
  taxAmount: number,
  adjustmentAmount: number,
) {
  const subTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0,
  );
  const discountAmount =
    discountType === "percent" ?
      (subTotal * discountValue) / 100
    : discountValue;
  const total = subTotal - discountAmount + taxAmount + adjustmentAmount;
  return { subTotal, discountAmount, total };
}

async function nextChallanNumber(organizationId: any): Promise<string> {
  const last = await DeliveryChallan.findOne({ organizationId })
    .sort({ challanNumber: -1 })
    .select("challanNumber")
    .lean();

  if (!last) return "DC-00001";

  const match = last.challanNumber.match(/DC-(\d+)/);
  if (!match) return "DC-00001";
  const next = parseInt(match[1], 10) + 1;
  return `DC-${String(next).padStart(5, "0")}`;
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

async function syncLinkedSalesOrderStatus(params: {
  organizationId: any;
  salesOrderNumber: string;
  req: AuthenticatedRequest;
}) {
  await syncSalesOrderStatus({
    organizationId: params.organizationId,
    salesOrderNumber: params.salesOrderNumber,
    req: params.req,
  });
}

// ─── List Delivery Challans ────────────────────────────────────────────
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      customerId,
      customer_id,
      page = 1,
      limit = 25,
      sortBy = "challanDate",
      sortOrder = "desc",
    } = req.query as Record<string, string>;

    const filter: any = { organizationId: orgId(req), isDeleted: false };
    if (status && status !== "All") filter.status = status;
    const customerFilterId = customerId || customer_id;
    if (customerFilterId) filter.customerId = customerFilterId;
    if (search) {
      filter.$or = [
        { challanNumber: { $regex: search, $options: "i" } },
        { salesOrderNumber: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
      ];
    }

    const total = await DeliveryChallan.countDocuments(filter);
    const challans = await DeliveryChallan.find(filter)
      .populate("customerId", "displayName companyName email")
      .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: challans,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

// ─── Get Single Delivery Challan ───────────────────────────────────────
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id as any,
      organizationId: orgId(req),
    } as any)
      .populate("customerId")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate")
      .populate("taxId", "name rate");

    if (!challan) throw new NotFoundError("Delivery Challan");
    res.json({ success: true, data: challan });
  },
);

// ─── Create Delivery Challan ───────────────────────────────────────────
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);

    if (!req.body.customerId) throw new ValidationError("Customer is required");
    if (!req.body.challanDate)
      throw new ValidationError("Challan date is required");
    if (!req.body.challanType)
      throw new ValidationError("Challan type is required");
    if (!req.body.items || req.body.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    const challanNumber =
      req.body.challanNumber || (await nextChallanNumber(oid));
    const items = await normalizeItems(oid, req.body.customerId, req.body.items || []);
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const derivedTaxAmount = items.reduce(
      (sum: number, item: any) => sum + (Number(item.taxAmount) || 0),
      0,
    );
    const taxAmount =
      req.body.taxAmount !== undefined && req.body.taxAmount !== null ?
        Number(req.body.taxAmount) || 0
      : derivedTaxAmount;
    const adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
    const { subTotal, discountAmount, total } = summarizeTotals(
      items,
      discountType,
      discountValue,
      taxAmount,
      adjustmentAmount,
    );

    const challan = new DeliveryChallan({
      organizationId: oid,
      challanNumber,
      salesOrderNumber: normalizeSalesOrderNumber(req.body.salesOrderNumber),
      referenceNumber: req.body.referenceNumber || "",
      customerId: req.body.customerId,
      challanDate: req.body.challanDate,
      challanType: req.body.challanType,
      items,
      subTotal,
      discountType,
      discountValue,
      discountAmount,
      taxId: req.body.taxId || null,
      taxAmount,
      adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
      adjustmentAmount,
      total,
      customerNotes: req.body.customerNotes || "",
      termsAndConditions: req.body.termsAndConditions || "",
      status: req.body.status || "Draft",
    });

    attachUser(challan, req);
    await challan.save();

    if (challan.status === "Delivered") {
       await syncLinkedSalesOrderStatus({
         organizationId: oid,
         salesOrderNumber: challan.salesOrderNumber || "",
         req,
       });
    }

    res.status(201).json({ success: true, data: challan });
  },
);

// ─── Update Delivery Challan ───────────────────────────────────────────
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id as any,
      organizationId: orgId(req),
    } as any);
    if (!challan) throw new NotFoundError("Delivery Challan");

    const allowed = [
      "customerId",
      "challanNumber",
      "salesOrderNumber",
      "referenceNumber",
      "challanDate",
      "challanType",
      "items",
      "discountType",
      "discountValue",
      "taxId",
      "taxAmount",
      "adjustmentLabel",
      "adjustmentAmount",
      "customerNotes",
      "termsAndConditions",
      "status",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined)
        (challan as any)[field] = req.body[field];
    });

    if (req.body.salesOrderNumber !== undefined) {
      (challan as any).salesOrderNumber = normalizeSalesOrderNumber(
        req.body.salesOrderNumber,
      );
    }

    if (req.body.items) {
      const customerId = req.body.customerId ?? challan.customerId;
      challan.items = await normalizeItems(
        challan.organizationId,
        customerId,
        req.body.items,
      );
    } else if (req.body.customerId !== undefined) {
      challan.items = await normalizeItems(
        challan.organizationId,
        req.body.customerId,
        challan.items as any[],
      );
    }

    challan.subTotal = challan.items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.rate,
      0,
    );
    challan.discountAmount =
      challan.discountType === "percent" ?
        (challan.subTotal * challan.discountValue) / 100
      : challan.discountValue;
    if (req.body.items || req.body.customerId !== undefined || req.body.taxAmount !== undefined) {
      const derivedTaxAmount = (challan.items as any[]).reduce(
        (sum: number, item: any) => sum + (Number(item.taxAmount) || 0),
        0,
      );
      challan.taxAmount =
        req.body.taxAmount !== undefined && req.body.taxAmount !== null ?
          Number(req.body.taxAmount) || 0
        : derivedTaxAmount;
    }
    challan.total =
      challan.subTotal -
      challan.discountAmount +
      (challan.taxAmount || 0) +
      (challan.adjustmentAmount || 0);

    attachUser(challan, req);
    await challan.save();

    await syncLinkedSalesOrderStatus({
      organizationId: challan.organizationId,
      salesOrderNumber: challan.salesOrderNumber || "",
      req,
    });

    res.json({ success: true, data: challan });
  },
);

// ─── Delete Delivery Challan ───────────────────────────────────────────
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id as any,
      organizationId: orgId(req),
    } as any);
    if (!challan) throw new NotFoundError("Delivery Challan");

    challan.isDeleted = true;
    (challan as any).deletedAt = new Date();
    attachUser(challan, req);
    await challan.save();

    res.json({ success: true, message: "Delivery Challan deleted" });
  },
);

// ─── Get Next Number ───────────────────────────────────────────────────
export const getNextNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const num = await nextChallanNumber(orgId(req));
    res.json({ success: true, data: { challanNumber: num } });
  },
);

// ─── Status Actions ────────────────────────────────────────────────────
async function requireChallan(req: AuthenticatedRequest) {
  const challan = await DeliveryChallan.findOne({
    _id: req.params.id as any,
    organizationId: orgId(req),
  } as any);
  if (!challan) throw new NotFoundError("Delivery Challan");
  return challan;
}

export const convertToOpen = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await requireChallan(req);
    if (challan.status !== "Draft") {
      throw new ValidationError("Only draft challans can be opened");
    }
    challan.status = "Open";
    attachUser(challan, req);
    await challan.save();
    res.json({ success: true, data: challan, message: "Challan is now Open" });
  },
);

export const markAsDelivered = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await requireChallan(req);
    if (challan.status !== "Open") {
      throw new ValidationError(
        "Only open challans can be marked as delivered",
      );
    }
    challan.status = "Delivered";
    attachUser(challan, req);
    await challan.save();

    await syncLinkedSalesOrderStatus({
      organizationId: challan.organizationId,
      salesOrderNumber: (challan as any).salesOrderNumber,
      req,
    });

    res.json({
      success: true,
      data: challan,
      message: "Challan marked as Delivered",
    });
  },
);

export const markAsReturned = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await requireChallan(req);
    if (challan.status !== "Open") {
      throw new ValidationError("Only open challans can be marked as returned");
    }
    challan.status = "Returned";
    attachUser(challan, req);
    await challan.save();
    res.json({
      success: true,
      data: challan,
      message: "Challan marked as Returned",
    });
  },
);

export const convertToInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id as any,
      organizationId: oid,
      isDeleted: false,
    } as any)
      .populate("items.itemId", "name hsnSacCode")
      .populate("items.taxId", "rate")
      .populate("customerId", "displayName")
      .populate("invoiceId", "invoiceNumber isDeleted");

    if (!challan) throw new NotFoundError("Delivery Challan");

    const existingInvoice = await Invoice.findOne({
      organizationId: oid,
      _id: (challan as any).invoiceId,
      isDeleted: false,
      status: { $ne: "Void" },
    })
      .select("_id invoiceNumber")
      .lean();

    if (existingInvoice) {
      if ((challan as any).invoiceStatus !== "INVOICED") {
        (challan as any).invoiceStatus = "INVOICED";
        attachUser(challan as any, req);
        await challan.save();
      }

      const invoiceId = String(existingInvoice._id);
      res.json({
        success: true,
        data: {
          invoiceId,
          _id: invoiceId,
          invoiceNumber: existingInvoice.invoiceNumber,
        },
        message: "Delivery challan is already linked to an invoice",
      });
      return;
    }

    const challanItems = (challan as any).items || [];
    if (challanItems.length === 0) {
      throw new ValidationError("Delivery challan has no items to convert");
    }

    const invoiceNumber = await nextInvoiceNumber(oid);
    const invoiceItems = challanItems.map((line: any) => {
      const quantity = toNum(line.quantity) || 0;
      const rate = toNum(line.rate) || 0;
      const lineTotal = quantity * rate;
      const discountPercent = toNum(line.discountPercent) || 0;
      const discountAmount =
        line.discountAmount !== undefined && line.discountAmount !== null ?
          toNum(line.discountAmount)
        : round2((lineTotal * discountPercent) / 100);
      const afterDiscount = round2(Math.max(0, lineTotal - discountAmount));

      const taxRef = line.taxId as any;
      const taxPercent = toNum(line.taxPercent) || toNum(taxRef?.rate);
      const taxAmount =
        line.taxAmount !== undefined && line.taxAmount !== null ?
          toNum(line.taxAmount)
        : round2((afterDiscount * taxPercent) / 100);

      const itemRef = line.itemId as any;
      const itemId = itemRef?._id || line.itemId || null;

      return {
        itemId,
        name: line.name || itemRef?.name || "Item",
        description: line.description || "",
        hsnSacCode: line.hsnSacCode || itemRef?.hsnSacCode || "",
        quantity,
        rate,
        discountPercent,
        discountAmount,
        taxId: taxRef?._id || line.taxId || null,
        taxPercent,
        taxAmount,
        amount: round2(afterDiscount + taxAmount),
        accountId: null,
        projectId: null,
        costRate: 0,
        costAmount: 0,
      };
    });

    const subTotal = round2(invoiceItems.reduce(
      (sum: number, line: any) => sum + toNum(line.quantity) * toNum(line.rate),
      0,
    ));
    const discountValue = round2(toNum((challan as any).discountValue));
    const discountType: "percent" | "amount" =
      (challan as any).discountType === "amount" ? "amount" : "percent";
    const discountAmount =
      discountType === "percent" ? round2((subTotal * discountValue) / 100) : discountValue;
    const taxAmount = round2(toNum((challan as any).taxAmount));
    const adjustmentAmount = round2(toNum((challan as any).adjustmentAmount));
    const total = round2(subTotal - discountAmount + taxAmount + adjustmentAmount);

    const dueDateInput = req.body?.dueDate;
    const dueDateCandidate = dueDateInput ? new Date(dueDateInput) : null;
    const dueDate =
      dueDateCandidate && !Number.isNaN(dueDateCandidate.getTime()) ? dueDateCandidate : null;

    const salesOrderNumber = normalizeSalesOrderNumber((challan as any).salesOrderNumber);
    const orderNumber = salesOrderNumber || String((challan as any).challanNumber || "").trim();

    const invoice = new Invoice({
      organizationId: oid,
      invoiceNumber,
      referenceNumber: (challan as any).referenceNumber || "",
      orderNumber,
      customerId: (challan as any).customerId?._id || (challan as any).customerId,
      invoiceDate: (challan as any).challanDate || new Date(),
      dueDate,
      paymentTermsId: null,
      salesPersonId: null,
      subject: `Converted from Delivery Challan ${(challan as any).challanNumber}`,
      items: invoiceItems,
      subTotal,
      discountType,
      discountValue,
      discountAmount,
      taxType: "none",
      taxId: null,
      taxAmount,
      adjustmentLabel: (challan as any).adjustmentLabel || "Adjustment",
      adjustmentAmount,
      total,
      balanceDue: total,
      customerNotes: (challan as any).customerNotes || "",
      termsAndConditions: (challan as any).termsAndConditions || "",
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

    (challan as any).invoiceStatus = "INVOICED";
    (challan as any).invoiceId = (invoice as any)._id;
    attachUser(challan as any, req);
    await challan.save();

    await syncLinkedSalesOrderStatus({
      organizationId: oid,
      salesOrderNumber,
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
  },
);
