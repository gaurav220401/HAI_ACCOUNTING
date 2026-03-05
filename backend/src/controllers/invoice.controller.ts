import { Response } from "express";
import Invoice from "../models/invoice.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { sendInvoiceEmail as sendInvoiceEmailService } from "../services/email.service";
import { generateInvoicePdf } from "../services/pdf.service";
import Organization from "../models/organization.model";

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

async function nextInvoiceNumber(organizationId: any): Promise<string> {
  const last = await Invoice.findOne({ organizationId })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  if (!last) return "INV-000001";

  const match = last.invoiceNumber.match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

// ─── List Invoices ─────────────────────────────────────────────────────
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      status,
      search,
      page = 1,
      limit = 25,
      sortBy = "invoiceDate",
      sortOrder = "desc",
    } = req.query;

    const filter: any = { organizationId: orgId(req) };
    if (status && status !== "All") filter.status = status;
    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { referenceNumber: { $regex: search, $options: "i" } },
        { orderNumber: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .populate("customerId", "displayName companyName email")
      .populate("salesPersonId", "name")
      .populate("paymentTermsId", "name netDays")
      .sort({ [sortBy as string]: sortOrder === "asc" ? 1 : -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    res.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: +page,
        limit: +limit,
        pages: Math.ceil(total / +limit),
      },
    });
  },
);

// ─── Get Single Invoice ────────────────────────────────────────────────
export const getOne = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    })
      .populate("customerId")
      .populate("salesPersonId")
      .populate("paymentTermsId")
      .populate("items.itemId", "name sku")
      .populate("items.taxId", "name rate")
      .populate("taxId", "name rate");

    if (!invoice) throw new NotFoundError("Invoice");
    res.json({ success: true, data: invoice });
  },
);

// ─── Create Invoice ────────────────────────────────────────────────────
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const oid = orgId(req);

    if (!req.body.customerId) throw new ValidationError("Customer is required");
    if (!req.body.invoiceDate)
      throw new ValidationError("Invoice date is required");
    if (!req.body.items || req.body.items.length === 0) {
      throw new ValidationError("At least one item is required");
    }

    const invoiceNumber =
      req.body.invoiceNumber || (await nextInvoiceNumber(oid));
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

    const paymentReceived = req.body.paymentReceived === true;
    const balanceDueInput =
      req.body.balanceDue !== undefined ? Number(req.body.balanceDue) : total;
    const balanceDue = Math.max(0, paymentReceived ? 0 : balanceDueInput);
    const status = req.body.status || (paymentReceived ? "Paid" : "Draft");

    const invoice = new Invoice({
      organizationId: oid,
      invoiceNumber,
      referenceNumber: req.body.referenceNumber || "",
      orderNumber: req.body.orderNumber || "",
      customerId: req.body.customerId,
      invoiceDate: req.body.invoiceDate,
      dueDate: req.body.dueDate || null,
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
      balanceDue,
      customerNotes: req.body.customerNotes || "",
      termsAndConditions: req.body.termsAndConditions || "",
      status,
      emailContacts: req.body.emailContacts || [],
      attachments: req.body.attachments || [],
      paymentReceived,
      isRecurring: req.body.isRecurring === true,
      journalEntries: req.body.journalEntries || [],
      pdfTemplateId: req.body.pdfTemplateId || null,
      sentAt: req.body.sentAt || null,
      paidAt: req.body.paidAt || null,
    });

    attachUser(invoice, req);
    await invoice.save();

    res.status(201).json({ success: true, data: invoice });
  },
);

// ─── Update Invoice ────────────────────────────────────────────────────
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!invoice) throw new NotFoundError("Invoice");

    const allowed = [
      "customerId",
      "invoiceNumber",
      "referenceNumber",
      "orderNumber",
      "invoiceDate",
      "dueDate",
      "paymentTermsId",
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
      "status",
      "paymentReceived",
      "isRecurring",
      "journalEntries",
      "pdfTemplateId",
      "sentAt",
      "paidAt",
      "balanceDue",
    ];

    allowed.forEach((field) => {
      if (req.body[field] !== undefined)
        (invoice as any)[field] = req.body[field];
    });

    if (req.body.items) {
      invoice.items = normalizeItems(req.body.items);
    }

    invoice.subTotal = invoice.items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.rate,
      0,
    );
    invoice.discountAmount =
      invoice.discountType === "percent" ?
        (invoice.subTotal * invoice.discountValue) / 100
      : invoice.discountValue;
    invoice.total =
      invoice.subTotal -
      invoice.discountAmount -
      (invoice.taxAmount || 0) +
      (invoice.adjustmentAmount || 0);

    if (req.body.balanceDue !== undefined) {
      invoice.balanceDue = Math.max(0, Number(req.body.balanceDue));
    } else if (
      req.body.items ||
      req.body.taxAmount !== undefined ||
      req.body.adjustmentAmount !== undefined ||
      req.body.discountValue !== undefined ||
      req.body.discountType !== undefined
    ) {
      invoice.balanceDue = invoice.paymentReceived ? 0 : invoice.total;
    }

    if (invoice.paymentReceived) {
      invoice.balanceDue = 0;
      if (!invoice.paidAt) invoice.paidAt = new Date();
    }

    attachUser(invoice, req);
    await invoice.save();

    res.json({ success: true, data: invoice });
  },
);

// ─── Delete Invoice ────────────────────────────────────────────────────
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      organizationId: orgId(req),
    });
    if (!invoice) throw new NotFoundError("Invoice");

    invoice.isDeleted = true;
    (invoice as any).deletedAt = new Date();
    attachUser(invoice, req);
    await invoice.save();

    res.json({ success: true, message: "Invoice deleted" });
  },
);

// ─── Misc Helpers ─────────────────────────────────────────────────────
export const getNextNumber = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const num = await nextInvoiceNumber(orgId(req));
    res.json({ success: true, data: { invoiceNumber: num } });
  },
);

// ─── Status & Payment Actions ─────────────────────────────────────────
async function requireInvoice(req: AuthenticatedRequest) {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
  });
  if (!invoice) throw new NotFoundError("Invoice");
  return invoice;
}

function markSentState(invoice: any) {
  invoice.status = "Sent";
  if (!invoice.sentAt) invoice.sentAt = new Date();
}

export const sendInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    if (invoice.status === "Void") {
      throw new ValidationError("Cannot send a void invoice");
    }
    markSentState(invoice);
    attachUser(invoice, req);
    await invoice.save();
    res.json({
      success: true,
      data: invoice,
      message: "Invoice marked as sent",
    });
  },
);

export const markAsSent = sendInvoice;

export const sendInvoiceEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    if (invoice.status === "Void") {
      throw new ValidationError("Cannot email a void invoice");
    }

    // Support both JSON body and multipart/form-data (for file attachments)
    const to = parseStringArray(req.body.to);
    const cc = parseStringArray(req.body.cc);
    const bcc = parseStringArray(req.body.bcc);
    const subject: string = req.body.subject || "";
    const body: string = req.body.body || "";
    const attachInvoicePdf: boolean =
      req.body.attachInvoicePdf === true ||
      req.body.attachInvoicePdf === "true";

    if (to.length === 0) {
      throw new ValidationError("At least one recipient (to) is required");
    }

    // Populate customer and line-item references for name + PDF
    await invoice.populate([
      { path: "customerId" },
      { path: "items.taxId", select: "name rate" },
    ]);

    const customer = invoice.customerId as any;
    const customerName =
      typeof customer === "string" ? customer : (
        customer?.displayName || customer?.companyName || "Customer"
      );

    const oid = (invoice as any).organizationId?.toString();

    // Build attachments list: PDF first, then user-uploaded files
    const uploadedFiles =
      (req.files as Express.Multer.File[] | undefined) ?? [];
    const attachments: {
      filename: string;
      content: Buffer;
      contentType: string;
    }[] = [];

    if (attachInvoicePdf) {
      // Fetch org for header details
      const org = await Organization.findById(oid).lean();

      // Build customer address string from contact fields
      const custAddr = [
        customer?.billingAddress?.street,
        customer?.billingAddress?.city,
        customer?.billingAddress?.state,
        customer?.billingAddress?.country,
      ]
        .filter(Boolean)
        .join(", ");

      const pdfBuffer = await generateInvoicePdf({
        orgName: org?.name ?? "",
        orgAddress: org?.address as any,
        orgTaxId: org?.taxId,

        customerName,
        customerAddress: custAddr || customer?.address || undefined,
        customerEmail: customer?.email,

        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate?.toISOString(),
        orderNumber: invoice.orderNumber,
        subject: invoice.subject,

        items: (invoice.items as any[]).map((item) => ({
          name: item.name,
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

        subTotal: invoice.subTotal ?? 0,
        discountType: invoice.discountType,
        discountValue: invoice.discountValue,
        discountAmount: invoice.discountAmount,
        taxAmount: invoice.taxAmount,
        adjustmentLabel: invoice.adjustmentLabel,
        adjustmentAmount: invoice.adjustmentAmount,
        total: invoice.total,
        balanceDue: invoice.balanceDue,

        customerNotes: invoice.customerNotes,
        termsAndConditions: invoice.termsAndConditions,
        currencySymbol: org?.baseCurrency === "INR" ? "₹" : org?.baseCurrency,
      });

      attachments.push({
        filename: `Invoice-${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    // Append any user-uploaded file attachments
    uploadedFiles.forEach((f) => {
      attachments.push({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      });
    });

    await sendInvoiceEmailService({
      organizationId: oid,
      to,
      cc,
      bcc,
      subject: subject || `Invoice ${invoice.invoiceNumber}`,
      body,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: invoice.total,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : undefined,
      customerName,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    markSentState(invoice);
    attachUser(invoice, req);
    await invoice.save();

    res.json({
      success: true,
      data: invoice,
      message: "Invoice emailed successfully",
    });
  },
);

export const recordPayment = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) {
      throw new ValidationError("Payment amount must be greater than zero");
    }

    const currentBalance = invoice.balanceDue ?? invoice.total;
    invoice.balanceDue = Math.max(0, currentBalance - amount);
    if (invoice.balanceDue === 0) {
      invoice.paymentReceived = true;
      invoice.status = "Paid";
      invoice.paidAt =
        req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
    } else {
      invoice.paymentReceived = false;
      invoice.status = "Partially Paid";
    }

    attachUser(invoice, req);
    await invoice.save();
    res.json({ success: true, data: invoice, message: "Payment recorded" });
  },
);

export const voidInvoice = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const invoice = await requireInvoice(req);
    invoice.status = "Void";
    invoice.balanceDue = 0;
    invoice.paymentReceived = false;
    attachUser(invoice, req);
    await invoice.save();
    res.json({ success: true, data: invoice, message: "Invoice voided" });
  },
);
