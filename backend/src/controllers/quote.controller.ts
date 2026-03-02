import { Response } from "express";
import Quote from "../models/quote.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

/** Generate next quote number like QT-000001 */
async function nextQuoteNumber(organizationId: any): Promise<string> {
  const last = await Quote.findOne({ organizationId })
    .sort({ quoteNumber: -1 })
    .select("quoteNumber")
    .lean();

  if (!last) return "QT-000001";

  const match = last.quoteNumber.match(/QT-(\d+)/);
  if (!match) return "QT-000001";
  const next = parseInt(match[1], 10) + 1;
  return `QT-${String(next).padStart(6, "0")}`;
}

// ─── List Quotes ───────────────────────────────────────────────────────

/** GET /api/quotes?status=Draft&search=...&page=1&limit=25 */
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
    const filter: any = { organizationId: orgId(req) };
    if (status && status !== "All") filter.status = status;
    if (search) {
      filter.$or = [
        { quoteNumber: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Quote.countDocuments(filter);
    const quotes = await Quote.find(filter)
      .populate("customerId", "displayName companyName email")
      .populate("salesPersonId", "name")
      .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: quotes,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

// ─── Get Single Quote ──────────────────────────────────────────────────

/** GET /api/quotes/:id */
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    })
      .populate("customerId")
      .populate("salesPersonId")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate")
      .populate("taxId", "name rate");

    if (!quote) throw new NotFoundError("Quote");
    res.json({ success: true, data: quote });
  },
);

// ─── Create Quote ──────────────────────────────────────────────────────

/** POST /api/quotes */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);

    if (!req.body.customerId) throw new ValidationError("Customer is required");
    if (!req.body.quoteDate)
      throw new ValidationError("Quote date is required");
    if (!req.body.items || req.body.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    const quoteNumber = req.body.quoteNumber || (await nextQuoteNumber(oid));

    // Calculate item-level amounts
    const items = (req.body.items || []).map((item: any) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.rate) || 0;
      const lineTotal = qty * rate;
      const discPct = Number(item.discountPercent) || 0;
      const discAmt =
        Number(item.discountAmount) || (lineTotal * discPct) / 100;
      const afterDiscount = lineTotal - discAmt;
      const taxPct = Number(item.taxPercent) || 0;
      const taxAmt = Number(item.taxAmount) || (afterDiscount * taxPct) / 100;
      return {
        ...item,
        quantity: qty,
        rate,
        discountPercent: discPct,
        discountAmount: discAmt,
        taxPercent: taxPct,
        taxAmount: taxAmt,
        amount: afterDiscount + taxAmt,
      };
    });

    const subTotal = items.reduce(
      (s: number, i: any) => s + i.quantity * i.rate,
      0,
    );

    // Discount on total
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const discountAmount =
      discountType === "percent" ?
        (subTotal * discountValue) / 100
      : discountValue;

    // Tax on total
    const taxAmount = Number(req.body.taxAmount) || 0;

    // Adjustment
    const adjustmentAmount = Number(req.body.adjustmentAmount) || 0;

    const total = subTotal - discountAmount - taxAmount + adjustmentAmount;

    const quote = new Quote({
      organizationId: oid,
      quoteNumber,
      referenceNumber: req.body.referenceNumber || "",
      customerId: req.body.customerId,
      quoteDate: req.body.quoteDate,
      expiryDate: req.body.expiryDate || null,
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
      status: req.body.status || "Draft",
      emailContacts: req.body.emailContacts || [],
      attachments: req.body.attachments || [],
    });

    attachUser(quote, req);
    await quote.save();

    res.status(201).json({ success: true, data: quote });
  },
);

// ─── Update Quote ──────────────────────────────────────────────────────

/** PATCH /api/quotes/:id */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!quote) throw new NotFoundError("Quote");

    // Only Draft/Sent can be edited
    if (!["Draft", "Sent"].includes(quote.status)) {
      throw new ValidationError(
        `Cannot edit a quote with status "${quote.status}"`,
      );
    }

    const allowed = [
      "referenceNumber",
      "customerId",
      "quoteDate",
      "expiryDate",
      "salesPersonId",
      "subject",
      "items",
      "discountType",
      "discountValue",
      "taxType",
      "taxId",
      "taxAmount",
      "adjustmentLabel",
      "adjustmentAmount",
      "customerNotes",
      "termsAndConditions",
      "emailContacts",
      "attachments",
    ];

    allowed.forEach((f) => {
      if (req.body[f] !== undefined) (quote as any)[f] = req.body[f];
    });

    // Recalculate totals
    if (req.body.items) {
      quote.items = req.body.items.map((item: any) => {
        const qty = Number(item.quantity) || 1;
        const rate = Number(item.rate) || 0;
        const lineTotal = qty * rate;
        const discPct = Number(item.discountPercent) || 0;
        const discAmt =
          Number(item.discountAmount) || (lineTotal * discPct) / 100;
        const afterDiscount = lineTotal - discAmt;
        const taxPct = Number(item.taxPercent) || 0;
        const taxAmt = Number(item.taxAmount) || (afterDiscount * taxPct) / 100;
        return {
          ...item,
          quantity: qty,
          rate,
          discountPercent: discPct,
          discountAmount: discAmt,
          taxPercent: taxPct,
          taxAmount: taxAmt,
          amount: afterDiscount + taxAmt,
        };
      });
    }

    quote.subTotal = quote.items.reduce(
      (s: number, i: any) => s + i.quantity * i.rate,
      0,
    );
    quote.discountAmount =
      quote.discountType === "percent" ?
        (quote.subTotal * quote.discountValue) / 100
      : quote.discountValue;
    quote.total =
      quote.subTotal -
      quote.discountAmount -
      quote.taxAmount +
      quote.adjustmentAmount;

    attachUser(quote, req);
    await quote.save();

    res.json({ success: true, data: quote });
  },
);

// ─── Delete Quote ──────────────────────────────────────────────────────

/** DELETE /api/quotes/:id */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!quote) throw new NotFoundError("Quote");

    quote.isDeleted = true;
    (quote as any).deletedAt = new Date();
    attachUser(quote, req);
    await quote.save();

    res.json({ success: true, message: "Quote deleted" });
  },
);

// ─── Status Transitions ───────────────────────────────────────────────

/** POST /api/quotes/:id/send */
export const sendQuote = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!quote) throw new NotFoundError("Quote");
    if (!["Draft"].includes(quote.status)) {
      throw new ValidationError("Only draft quotes can be sent");
    }
    quote.status = "Sent";
    attachUser(quote, req);
    await quote.save();
    res.json({ success: true, data: quote, message: "Quote marked as sent" });
  },
);

/** POST /api/quotes/:id/accept */
export const acceptQuote = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!quote) throw new NotFoundError("Quote");
    if (!["Sent", "Draft"].includes(quote.status)) {
      throw new ValidationError("Only sent/draft quotes can be accepted");
    }
    quote.status = "Accepted";
    attachUser(quote, req);
    await quote.save();
    res.json({ success: true, data: quote, message: "Quote accepted" });
  },
);

/** POST /api/quotes/:id/reject */
export const rejectQuote = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!quote) throw new NotFoundError("Quote");
    if (!["Sent", "Draft"].includes(quote.status)) {
      throw new ValidationError("Only sent/draft quotes can be rejected");
    }
    quote.status = "Rejected";
    attachUser(quote, req);
    await quote.save();
    res.json({ success: true, data: quote, message: "Quote rejected" });
  },
);

/** GET /api/quotes/next-number */
export const getNextNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const num = await nextQuoteNumber(orgId(req));
    res.json({ success: true, data: { quoteNumber: num } });
  },
);
