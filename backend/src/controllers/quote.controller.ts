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
import { applyItemTaxLinkageToItems } from "../services/item-tax-linkage.service";
import { generateQuotePdf } from "../services/quote-pdf.service";
import { sendQuoteEmail as sendQuoteEmailService } from "../services/email.service";
import Organization from "../models/organization.model";
import Invoice from "../models/invoice.model";
import {
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "../utils/money";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

async function normalizeQuoteItems(
  organizationId: any,
  customerId: any,
  items: any[] = [],
) {
  const linkedItems = await applyItemTaxLinkageToItems({
    organizationId,
    contactId: customerId,
    items,
  });

  return linkedItems.map((item: any) => {
    const qty = Number(item.quantity) || 1;
    const rate = roundMoney(Number(item.rate) || 0);
    const lineTotal = multiplyMoney(qty, rate);
    const discPct = Number(item.discountPercent) || 0;
    const discAmt =
      roundMoney(Number(item.discountAmount) || percentMoney(lineTotal, discPct));
    const afterDiscount = Math.max(0, subtractMoney(lineTotal, discAmt));
    const taxPct = Number(item.taxPercent) || 0;
    const taxAmt = roundMoney(Number(item.taxAmount) || percentMoney(afterDiscount, taxPct));
    return {
      ...item,
      quantity: qty,
      rate,
      discountPercent: discPct,
      discountAmount: discAmt,
      taxPercent: taxPct,
      taxAmount: taxAmt,
      amount: sumMoney([afterDiscount, taxAmt]),
    };
  });
}

/** Parse a field that may arrive as a JS array (JSON body) or a JSON string (FormData). */
function parseStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return (val as string[]).filter(Boolean);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed];
    } catch {
      return [val];
    }
  }
  return [];
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

function resolveTaxImpact(taxType: string, taxAmount: number): number {
  const normalizedTaxAmount = roundMoney(Number(taxAmount) || 0);
  if (taxType === "TCS") return normalizedTaxAmount;
  if (taxType === "TDS") return -normalizedTaxAmount;
  return 0;
}

function taxRefText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "object") {
    const maybe = value as { _id?: unknown; toString?: () => string };
    if (maybe._id) return taxRefText(maybe._id);
    if (typeof maybe.toString === "function") {
      const text = maybe.toString();
      return text === "[object Object]" ? "" : text;
    }
  }
  return String(value);
}

function normalizeTaxRef(value: unknown): string | null {
  const text = taxRefText(value).trim();
  const normalized = text.toLowerCase();
  if (!text || normalized === "none" || normalized === "__none") return null;
  return text;
}

function normalizeHeaderTax(
  taxTypeRaw: unknown,
  taxIdRaw: unknown,
  taxAmountRaw: unknown,
): {
  taxType: "TDS" | "TCS" | "none";
  taxId: string | null;
    taxAmount: number;
} {
  const taxType =
    taxTypeRaw === "TDS" || taxTypeRaw === "TCS" ? taxTypeRaw : "none";
  const taxId = normalizeTaxRef(taxIdRaw);

  if (taxType === "none" || !taxId) {
    return { taxType: "none", taxId: null, taxAmount: 0 };
  }

  return {
    taxType,
    taxId,
    taxAmount: roundMoney(Number(taxAmountRaw) || 0),
  };
}

function normalizeTaxLabel(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function resolveTaxModeFromName(
  value?: string,
): "igst" | "cgst" | "sgst" | "gst" | "unknown" {
  const name = normalizeTaxLabel(value);
  if (!name) return "unknown";
  if (name.startsWith("IGST")) return "igst";
  if (name.startsWith("CGST")) return "cgst";
  if (name.startsWith("SGST")) return "sgst";
  if (name.startsWith("GST")) return "gst";
  return "unknown";
}

function inferIsIntraState(quote: any, org: any): boolean {
  const items = (quote?.items || []) as any[];
  let hasIgst = false;
  let hasSplit = false;

  for (const item of items) {
    const taxName =
      typeof item.taxId === "object" ? item.taxId?.name : item.taxName || "";
    const mode = resolveTaxModeFromName(taxName);
    if (mode === "igst") hasIgst = true;
    if (mode === "cgst" || mode === "sgst" || mode === "gst") hasSplit = true;
  }

  if (hasSplit && !hasIgst) return true;
  if (hasIgst && !hasSplit) return false;

  const quoteState = (
    (quote as any).placeOfSupply || (quote.customerId as any)?.billingAddress?.state || ""
  )
    .trim()
    .toLowerCase();
  const orgState = ((org as any).address?.state || "").trim().toLowerCase();
  return quoteState.length > 0 && orgState.length > 0 && quoteState === orgState;
}

// ─── List Quotes ───────────────────────────────────────────────────────

/** GET /api/quotes?status=Draft&search=...&page=1&limit=25 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      customerId,
      customer_id,
      page = 1,
      limit = 25,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query as Record<string, string>;
    const filter: any = { organizationId: orgId(req) };
    if (status && status !== "All") filter.status = status;
    const customerFilterId = customerId || customer_id;
    if (customerFilterId) filter.customerId = customerFilterId;
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
      .populate("taxId", "name rate")
      .select("+activityLog")
      .populate("activityLog.userId", "displayName email");

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

    const items = await normalizeQuoteItems(
      oid,
      req.body.customerId,
      req.body.items || [],
    );

    const subTotal = sumMoney(items.map((i: any) => multiplyMoney(i.quantity, i.rate)));

    const lineItemsTotal = sumMoney(items.map((i: any) => Number(i.amount) || 0));

    // Discount on total
    const discountType = req.body.discountType || "percent";
    const discountValue = Number(req.body.discountValue) || 0;
    const discountAmount =
      discountType === "percent" ?
        percentMoney(subTotal, discountValue)
      : roundMoney(discountValue);

    // Tax on total
    const headerTax = normalizeHeaderTax(
      req.body.taxType,
      req.body.taxId,
      req.body.taxAmount,
    );

    // Adjustment
    const adjustmentAmount = roundMoney(Number(req.body.adjustmentAmount) || 0);

    const total = sumMoney([
      lineItemsTotal,
      -discountAmount,
      resolveTaxImpact(headerTax.taxType, headerTax.taxAmount),
      adjustmentAmount,
    ]);

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
      taxType: headerTax.taxType,
      taxId: headerTax.taxId,
      taxAmount: headerTax.taxAmount,
      adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
      adjustmentAmount,
      total,
      customerNotes: req.body.customerNotes || "",
      termsAndConditions: req.body.termsAndConditions || "",
      status: req.body.status || "Draft",
      emailContacts: req.body.emailContacts || [],
      attachments: req.body.attachments || [],
      placeOfSupply: req.body.placeOfSupply || "",
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
      "templateConfig",
      "placeOfSupply",
    ];

    const headerTaxFields = new Set(["taxType", "taxId", "taxAmount"]);
    allowed.forEach((f) => {
      if (req.body[f] !== undefined && !headerTaxFields.has(f)) {
        (quote as any)[f] = req.body[f];
      }
    });

    const headerTax = normalizeHeaderTax(
      req.body.taxType !== undefined ? req.body.taxType : quote.taxType,
      req.body.taxId !== undefined ? req.body.taxId : quote.taxId,
      req.body.taxAmount !== undefined ? req.body.taxAmount : quote.taxAmount,
    );
    quote.taxType = headerTax.taxType;
    (quote as any).taxId = headerTax.taxId;
    quote.taxAmount = headerTax.taxAmount;

    // Recalculate totals
    if (req.body.items) {
      const customerId = req.body.customerId ?? quote.customerId;
      quote.items = await normalizeQuoteItems(
        quote.organizationId,
        customerId,
        req.body.items,
      );
    } else if (req.body.customerId !== undefined) {
      quote.items = await normalizeQuoteItems(
        quote.organizationId,
        req.body.customerId,
        quote.items as any[],
      );
    }

    quote.subTotal = sumMoney((quote.items as any[]).map((i: any) => multiplyMoney(i.quantity, i.rate)));
    const lineItemsTotal = sumMoney((quote.items as any[]).map((i: any) => Number(i.amount) || 0));
    quote.discountAmount =
      quote.discountType === "percent" ?
        percentMoney(quote.subTotal, quote.discountValue)
      : roundMoney(quote.discountValue);
    const taxImpact = resolveTaxImpact(
      String(quote.taxType || "none"),
      Number(quote.taxAmount) || 0,
    );
    quote.adjustmentAmount = roundMoney(quote.adjustmentAmount);
    quote.total = sumMoney([
      lineItemsTotal,
      -quote.discountAmount,
      taxImpact,
      quote.adjustmentAmount,
    ]);

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

/** GET /api/quotes/:id/pdf */
export const downloadPdf = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    })
      .populate("customerId")
      .populate("salesPersonId", "name")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate")
      .lean();

    if (!quote) throw new NotFoundError("Quote");

    const org = await Organization.findById(oid).lean();
    if (!org) throw new NotFoundError("Organization");

    const customer = quote.customerId as any;
    const customerName =
      (typeof customer === "object" &&
        (customer?.displayName || customer?.companyName)) ||
      "Customer";

    const pdfBuffer = await generateQuotePdf({
      orgName: org.name,
      orgAddress: org.address as any,
      orgEmail:
        org.smtpSettings?.fromEmail || org.smtpSettings?.user || undefined,
      orgTaxId: org.taxId,
      orgLogoUrl: (org as any).logo,
      orgPhone: (org as any)?.phone || (org as any)?.address?.phone,
      templateConfig: (quote as any).templateConfig,

      customerName,
      customerAddress: [
        customer?.billingAddress?.street,
        customer?.billingAddress?.city,
        customer?.billingAddress?.state,
        customer?.billingAddress?.zip,
        customer?.billingAddress?.country,
      ]
        .filter(Boolean)
        .join(", "),
      customerEmail: customer?.email,

      quoteNumber: quote.quoteNumber,
      quoteDate: quote.quoteDate.toISOString(),
      expiryDate: quote.expiryDate ? quote.expiryDate.toISOString() : undefined,
      salesPersonName: (quote.salesPersonId as any)?.name,
      subject: quote.subject,

      items: (quote.items as any[]).map((item) => ({
        name: item.name || (item.itemId as any)?.name || "Item",
        description: item.description,
        hsnSacCode: item.hsnSacCode,
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        taxPercent: item.taxPercent,
        taxAmount: item.taxAmount,
        amount: item.amount,
      })),

      subTotal: quote.subTotal,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      taxType: quote.taxType,
      taxAmount: quote.taxAmount,
      adjustmentLabel: quote.adjustmentLabel,
      adjustmentAmount: quote.adjustmentAmount,
      total: quote.total,

      customerNotes: quote.customerNotes,
      termsAndConditions: quote.termsAndConditions,
      currencySymbol: org?.baseCurrency === "INR" ? "₹" : org?.baseCurrency,
      placeOfSupply: (quote as any).placeOfSupply || (quote.customerId as any)?.billingAddress?.state,
      isIntraState: inferIsIntraState(quote, org),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Quote-${quote.quoteNumber}.pdf`,
    );
    res.send(pdfBuffer);
  },
);

/** POST /api/quotes/:id/send-email */
export const sendQuoteEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    })
      .populate("customerId")
      .populate("salesPersonId", "name")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate");

    if (!quote) throw new NotFoundError("Quote");

    const to = parseStringArray(req.body.to);
    const cc = parseStringArray(req.body.cc);
    const bcc = parseStringArray(req.body.bcc);
    const subject = req.body.subject || `Quote ${quote.quoteNumber}`;
    const body = req.body.body || "";
    const attachQuotePdf =
      req.body.attachQuotePdf === true || req.body.attachQuotePdf === "true";

    if (to.length === 0) {
      throw new ValidationError("At least one recipient (to) is required");
    }

    const attachments: any[] = [];
    if (attachQuotePdf) {
      const org = await Organization.findById(oid).lean();
      const customer = quote.customerId as any;
      const customerName =
        (typeof customer === "object" &&
          (customer?.displayName || customer?.companyName)) ||
        "Customer";

      const pdfBuffer = await generateQuotePdf({
        orgName: org?.name || "HAI",
        orgAddress: org?.address as any,
        orgEmail: org?.smtpSettings?.fromEmail || org?.smtpSettings?.user || undefined,
        orgTaxId: org?.taxId,
        orgLogoUrl: (org as any)?.logo,
        orgPhone: (org as any)?.phone || (org as any)?.address?.phone,
        templateConfig: (quote as any).templateConfig,

        customerName,
        customerAddress: [
          customer?.billingAddress?.street,
          customer?.billingAddress?.city,
          customer?.billingAddress?.state,
          customer?.billingAddress?.zip,
          customer?.billingAddress?.country,
        ]
          .filter(Boolean)
          .join(", "),
        customerEmail: customer?.email,

        quoteNumber: quote.quoteNumber,
        quoteDate: quote.quoteDate.toISOString(),
        expiryDate: quote.expiryDate ? quote.expiryDate.toISOString() : undefined,
        salesPersonName: (quote.salesPersonId as any)?.name,
        subject: quote.subject,

        items: (quote.items as any[]).map((item) => ({
          name: item.name || (item.itemId as any)?.name || "Item",
          description: item.description,
          hsnSacCode: item.hsnSacCode,
          quantity: item.quantity,
          rate: item.rate,
          discountPercent: item.discountPercent,
          discountAmount: item.discountAmount,
          taxPercent: item.taxPercent,
          taxAmount: item.taxAmount,
          amount: item.amount,
        })),

        subTotal: quote.subTotal,
        discountType: quote.discountType,
        discountValue: quote.discountValue,
        discountAmount: quote.discountAmount,
        taxType: quote.taxType,
        taxAmount: quote.taxAmount,
        adjustmentLabel: quote.adjustmentLabel,
        adjustmentAmount: quote.adjustmentAmount,
        total: quote.total,

        customerNotes: quote.customerNotes,
        termsAndConditions: quote.termsAndConditions,
        currencySymbol: org?.baseCurrency === "INR" ? "₹" : org?.baseCurrency,
        placeOfSupply: quote.placeOfSupply || (quote.customerId as any)?.billingAddress?.state,
        isIntraState: inferIsIntraState(quote, org),
      });

      attachments.push({
        filename: `Quote-${quote.quoteNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    // Support user uploaded files
    const uploadedFiles =
      (req.files as Express.Multer.File[] | undefined) ?? [];
    uploadedFiles.forEach((f) => {
      attachments.push({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      });
    });

    await sendQuoteEmailService({
      organizationId: oid.toString(),
      to,
      cc,
      bcc,
      subject,
      body,
      quoteNumber: quote.quoteNumber,
      quoteTotal: quote.total,
      quoteDate: quote.quoteDate.toISOString(),
      expiryDate: quote.expiryDate ? quote.expiryDate.toISOString() : undefined,
      customerName: (quote.customerId as any)?.displayName || "Customer",
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    quote.status = "Sent";
    attachUser(quote, req);
    await quote.save();

    res.json({ success: true, message: "Quote emailed successfully" });
  },
);

/** POST /api/quotes/:id/convert-to-invoice */
export const convertToInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);
    const quote = await Quote.findOne({
      _id: req.params.id,
      organizationId: oid,
      isDeleted: false,
    });

    if (!quote) throw new NotFoundError("Quote");

    // Check if already converted? (optional: you could add a field `invoiceId` to Quote)

    const InvoiceModel = require("../models/invoice.model").default;
    const nextNum = await require("./invoice.controller").nextInvoiceNumber(
      oid,
    );

    const invoice = new InvoiceModel({
      organizationId: oid,
      invoiceNumber: nextNum,
      customerId: quote.customerId,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // Default 15 days
      subject: quote.subject,
      items: quote.items,
      subTotal: quote.subTotal,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      taxType: quote.taxType,
      taxId: quote.taxId,
      taxAmount: quote.taxAmount,
      adjustmentLabel: quote.adjustmentLabel,
      adjustmentAmount: quote.adjustmentAmount,
      total: quote.total,
      balanceDue: quote.total,
      customerNotes: quote.customerNotes,
      termsAndConditions: quote.termsAndConditions,
      status: "Draft",
      quoteId: quote._id,
    });

    attachUser(invoice, req);
    await invoice.save();

    quote.status = "Invoiced"; // Mark as Invoiced specifically
    quote.invoiceId = invoice._id;
    await quote.save();

    res.status(201).json({
      success: true,
      data: invoice,
      message: "Quote converted to invoice",
    });
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
