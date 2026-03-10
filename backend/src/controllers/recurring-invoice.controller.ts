import { Response } from "express";
import RecurringInvoice from "../models/recurring-invoice.model";
import Invoice from "../models/invoice.model";
import { attachUser } from "../plugins";
import { AuthenticatedRequest, IInvoiceItem } from "../types";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import {
  alignRecurringNextRunDate,
  calculateNextRunDate,
  generateInvoiceFromRecurringProfile,
  normalizeInvoiceItems,
  summarizeInvoiceTotals,
} from "../services/recurring-invoice.service";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function getEmailContacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function validateRecurringInput(req: AuthenticatedRequest) {
  if (!req.body.profileName) {
    throw new ValidationError("Profile name is required");
  }
  if (!req.body.customerId) {
    throw new ValidationError("Customer is required");
  }
  if (!req.body.startDate) {
    throw new ValidationError("Start date is required");
  }
  if (!req.body.frequency) {
    throw new ValidationError("Frequency is required");
  }
  if (!req.body.items || req.body.items.length === 0) {
    throw new ValidationError("At least one item is required");
  }
  if (req.body.endDate && new Date(req.body.endDate) < new Date(req.body.startDate)) {
    throw new ValidationError("End date cannot be before the start date");
  }
}

function applyRecurringMutation(profile: any, body: any) {
  const fields = [
    "profileName",
    "referenceNumber",
    "orderNumber",
    "customerId",
    "startDate",
    "endDate",
    "neverExpires",
    "frequency",
    "paymentTermsId",
    "salesPersonId",
    "subject",
    "discountType",
    "discountValue",
    "taxType",
    "taxId",
    "taxAmount",
    "adjustmentLabel",
    "adjustmentAmount",
    "customerNotes",
    "termsAndConditions",
    "deliveryMode",
    "status",
  ];

  fields.forEach((field) => {
    if (body[field] !== undefined) {
      profile[field] = body[field];
    }
  });

  if (body.emailContacts !== undefined) {
    profile.emailContacts = getEmailContacts(body.emailContacts);
  }

  if (body.items !== undefined) {
    profile.items = normalizeInvoiceItems(body.items as Partial<IInvoiceItem>[]);
  }

  const taxAmount = Number(profile.taxAmount) || 0;
  const adjustmentAmount = Number(profile.adjustmentAmount) || 0;
  const discountValue = Number(profile.discountValue) || 0;
  const totals = summarizeInvoiceTotals(
    profile.items,
    profile.discountType,
    discountValue,
    taxAmount,
    adjustmentAmount,
  );

  profile.subTotal = totals.subTotal;
  profile.discountAmount = totals.discountAmount;
  profile.total = totals.total;
}

function recomputeNextRunDate(profile: any) {
  if (profile.status !== "active") return;

  const anchor = new Date(profile.startDate);
  if (profile.lastRunDate) {
    let nextRunDate = calculateNextRunDate(
      new Date(profile.lastRunDate),
      profile.frequency,
      anchor,
    );

    while (nextRunDate < new Date()) {
      nextRunDate = calculateNextRunDate(nextRunDate, profile.frequency, anchor);
    }

    profile.nextRunDate = nextRunDate;
    return;
  }

  profile.nextRunDate = alignRecurringNextRunDate(
    new Date(profile.startDate),
    profile.frequency,
  );
}

export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      page = 1,
      limit = 25,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter: any = { organizationId: orgId(req), isDeleted: false };
    if (status && status !== "All") filter.status = status;
    if (search) {
      filter.$or = [
        { profileName: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await RecurringInvoice.countDocuments(filter);
    const profiles = await RecurringInvoice.find(filter)
      .populate("customerId", "displayName companyName email")
      .populate("paymentTermsId", "name netDays termType")
      .populate("salesPersonId", "name")
      .populate("lastGeneratedInvoiceId", "invoiceNumber status total invoiceDate")
      .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: profiles,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await RecurringInvoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    })
      .populate("customerId")
      .populate("paymentTermsId")
      .populate("salesPersonId")
      .populate("taxId", "name rate")
      .populate("items.itemId", "name sku sellingPrice")
      .populate("items.taxId", "name rate")
      .populate("lastGeneratedInvoiceId", "invoiceNumber status total invoiceDate");

    if (!profile) throw new NotFoundError("Recurring invoice profile");

    const generatedInvoices = await Invoice.find({
      organizationId: orgId(req),
      recurringProfileId: profile._id,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select(
        "invoiceNumber invoiceDate dueDate total balanceDue status sentAt paidAt createdAt",
      )
      .lean();

    const profileData = profile.toObject();

    res.json({
      success: true,
      data: {
        ...profileData,
        generatedInvoices,
      },
    });
  },
);

export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    validateRecurringInput(req);

    const oid = orgId(req);
    const items = normalizeInvoiceItems(req.body.items as Partial<IInvoiceItem>[]);
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const taxAmount = Number(req.body.taxAmount) || 0;
    const adjustmentAmount = Number(req.body.adjustmentAmount) || 0;
    const { subTotal, discountAmount, total } = summarizeInvoiceTotals(
      items,
      discountType,
      discountValue,
      taxAmount,
      adjustmentAmount,
    );

    const neverExpires = req.body.neverExpires !== false;
    const status = req.body.status || "active";
    const nextRunDate = alignRecurringNextRunDate(
      new Date(req.body.startDate),
      req.body.frequency,
    );

    const profile = new RecurringInvoice({
      organizationId: oid,
      profileName: req.body.profileName,
      referenceNumber: req.body.referenceNumber || "",
      orderNumber: req.body.orderNumber || "",
      customerId: req.body.customerId,
      startDate: req.body.startDate,
      endDate: neverExpires ? null : req.body.endDate || null,
      neverExpires,
      frequency: req.body.frequency,
      nextRunDate,
      paymentTermsId: req.body.paymentTermsId || null,
      salesPersonId: req.body.salesPersonId || null,
      subject: req.body.subject || "",
      items,
      subTotal,
      discountType,
      discountValue,
      discountAmount,
      taxType: req.body.taxType || "none",
      taxId: req.body.taxId || null,
      taxAmount,
      adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
      adjustmentAmount,
      total,
      customerNotes: req.body.customerNotes || "",
      termsAndConditions: req.body.termsAndConditions || "",
      emailContacts: getEmailContacts(req.body.emailContacts),
      deliveryMode: req.body.deliveryMode || "draft",
      status,
      generatedInvoiceCount: 0,
      recentActivities: [
        {
          type: "created",
          message: "Recurring invoice profile created.",
          createdAt: new Date(),
        },
      ],
    });

    attachUser(profile, req);
    await profile.save();

    res.status(201).json({ success: true, data: profile });
  },
);

export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await RecurringInvoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });

    if (!profile) throw new NotFoundError("Recurring invoice profile");

    applyRecurringMutation(profile, req.body);
    recomputeNextRunDate(profile);

    profile.recentActivities = [
      ...(profile.recentActivities || []),
      {
        type: "updated",
        message: "Recurring invoice profile updated.",
        createdAt: new Date(),
      },
    ].slice(-50) as any;

    attachUser(profile, req);
    await profile.save();

    res.json({ success: true, data: profile });
  },
);

export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await RecurringInvoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
      isDeleted: false,
    });

    if (!profile) throw new NotFoundError("Recurring invoice profile");

    profile.isDeleted = true;
    (profile as any).deletedAt = new Date();
    profile.status = "stopped";
    profile.recentActivities = [
      ...(profile.recentActivities || []),
      {
        type: "stopped",
        message: "Recurring invoice profile deleted.",
        createdAt: new Date(),
      },
    ].slice(-50) as any;

    attachUser(profile, req);
    await profile.save();

    res.json({ success: true, message: "Recurring invoice profile deleted" });
  },
);

async function requireProfile(req: AuthenticatedRequest) {
  const profile = await RecurringInvoice.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!profile) throw new NotFoundError("Recurring invoice profile");
  return profile;
}

export const pause = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await requireProfile(req);
    profile.status = "paused";
    profile.recentActivities = [
      ...(profile.recentActivities || []),
      {
        type: "paused",
        message: "Recurring invoice profile paused.",
        createdAt: new Date(),
      },
    ].slice(-50) as any;
    attachUser(profile, req);
    await profile.save();
    res.json({ success: true, data: profile });
  },
);

export const resume = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await requireProfile(req);
    if (!profile.neverExpires && profile.endDate && new Date(profile.endDate) < new Date()) {
      throw new ValidationError("Cannot resume a profile whose end date has already passed");
    }

    profile.status = "active";
    recomputeNextRunDate(profile);
    profile.recentActivities = [
      ...(profile.recentActivities || []),
      {
        type: "resumed",
        message: "Recurring invoice profile resumed.",
        createdAt: new Date(),
      },
    ].slice(-50) as any;
    attachUser(profile, req);
    await profile.save();
    res.json({ success: true, data: profile });
  },
);

export const stop = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await requireProfile(req);
    profile.status = "stopped";
    profile.recentActivities = [
      ...(profile.recentActivities || []),
      {
        type: "stopped",
        message: "Recurring invoice profile stopped.",
        createdAt: new Date(),
      },
    ].slice(-50) as any;
    attachUser(profile, req);
    await profile.save();
    res.json({ success: true, data: profile });
  },
);

export const runNow = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const profile = await requireProfile(req);
    if (!["active", "paused"].includes(profile.status)) {
      throw new ValidationError("Only active or paused profiles can generate an invoice now");
    }

    const result = await generateInvoiceFromRecurringProfile(profile, {
      runDate: new Date(),
      triggeredByUserId: req.user?._id || null,
      advanceSchedule: true,
      manual: true,
    });

    res.json({
      success: true,
      data: {
        profile: result.profile,
        invoice: result.invoice,
      },
      message: `Invoice ${result.invoice.invoiceNumber} created successfully`,
    });
  },
);