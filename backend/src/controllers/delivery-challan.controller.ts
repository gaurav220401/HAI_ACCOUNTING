import { Response } from "express";
import DeliveryChallan from "../models/delivery-challan.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function normalizeItems(items: any[] = []) {
  return items.map((item) => {
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
  const total = subTotal - discountAmount - taxAmount + adjustmentAmount;
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

// ─── List Delivery Challans ────────────────────────────────────────────
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      page = 1,
      limit = 25,
      sortBy = "challanDate",
      sortOrder = "desc",
    } = req.query;

    const filter: any = { organizationId: orgId(req), isDeleted: false };
    if (status && status !== "All") filter.status = status;
    if (search) {
      filter.$or = [
        { challanNumber: { $regex: search, $options: "i" } },
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
      _id: req.params.id,
      organizationId: orgId(req),
    })
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
    const items = normalizeItems(req.body.items || []);
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const taxAmount = Number(req.body.taxAmount) || 0;
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

    res.status(201).json({ success: true, data: challan });
  },
);

// ─── Update Delivery Challan ───────────────────────────────────────────
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!challan) throw new NotFoundError("Delivery Challan");

    const allowed = [
      "customerId",
      "challanNumber",
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

    if (req.body.items) {
      challan.items = normalizeItems(req.body.items);
    }

    challan.subTotal = challan.items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.rate,
      0,
    );
    challan.discountAmount =
      challan.discountType === "percent" ?
        (challan.subTotal * challan.discountValue) / 100
      : challan.discountValue;
    challan.total =
      challan.subTotal -
      challan.discountAmount -
      (challan.taxAmount || 0) +
      (challan.adjustmentAmount || 0);

    attachUser(challan, req);
    await challan.save();

    res.json({ success: true, data: challan });
  },
);

// ─── Delete Delivery Challan ───────────────────────────────────────────
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const challan = await DeliveryChallan.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
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
    _id: req.params.id,
    organizationId: orgId(req),
  });
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
