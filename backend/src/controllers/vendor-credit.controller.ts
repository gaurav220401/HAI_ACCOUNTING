import mongoose, { ClientSession } from "mongoose";
import { Response } from "express";
import Bill from "../models/bill.model";
import Organization from "../models/organization.model";
import VendorCredit from "../models/vendor-credit.model";
import VendorCreditApplication from "../models/vendor-credit-application.model";
import { generateVendorCreditPdf } from "../services/pdf.service";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calcLineItems(items: any[], discountLevel: "transaction" | "line_item") {
  return (items || []).map((item: any) => {
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };

    const qty = Math.max(0, toNum(item.quantity, 1));
    const rate = Math.max(0, toNum(item.rate, 0));
    const gross = round2(qty * rate);

    if (discountLevel === "line_item") {
      const discountPercent = Math.max(0, toNum(item.discountPercent, 0));
      const computedDiscount = round2((gross * discountPercent) / 100);
      const discountAmount = round2(Math.min(gross, toNum(item.discountAmount, computedDiscount)));
      return {
        ...item,
        quantity: qty,
        rate,
        discountPercent,
        discountAmount,
        taxPercent: Math.max(0, toNum(item.taxPercent, 0)),
        amount: round2(gross - discountAmount),
      };
    }

    return {
      ...item,
      quantity: qty,
      rate,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: Math.max(0, toNum(item.taxPercent, 0)),
      amount: gross,
    };
  });
}

function computeTotals(input: {
  lineItems: any[];
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  tdsAmount: number;
  tcsAmount: number;
  adjustmentAmount: number;
}) {
  const rowItems = input.lineItems.filter((line: any) => !line.isHeader);
  const subTotal = round2(
    rowItems.reduce((sum: number, line: any) => sum + round2(toNum(line.quantity) * toNum(line.rate)), 0),
  );

  const discountAmount =
    input.discountLevel === "transaction"
      ? round2((subTotal * input.discountPercent) / 100)
      : round2(rowItems.reduce((sum: number, line: any) => sum + toNum(line.discountAmount), 0));

  const safeDiscountAmount = Math.min(subTotal, Math.max(0, discountAmount));
  const taxableBase = round2(subTotal - safeDiscountAmount);

  const transactionScale = subTotal > 0 ? taxableBase / subTotal : 1;
  const taxAmount = round2(
    rowItems.reduce((sum: number, line: any) => {
      const gross = round2(toNum(line.quantity) * toNum(line.rate));
      const lineBase =
        input.discountLevel === "line_item"
          ? round2(Math.max(0, gross - toNum(line.discountAmount)))
          : round2(Math.max(0, gross * transactionScale));
      return sum + round2((lineBase * toNum(line.taxPercent)) / 100);
    }, 0),
  );

  const total = round2(taxableBase + taxAmount - input.tdsAmount + input.tcsAmount + input.adjustmentAmount);
  return {
    subTotal,
    discountAmount: safeDiscountAmount,
    taxAmount,
    total,
  };
}

function deriveStatus(appliedAmount: number, total: number) {
  if (appliedAmount <= 0) return "OPEN";
  if (round2(appliedAmount) >= round2(total)) return "CLOSED";
  return "PARTIALLY_APPLIED";
}

function billStatusAfterCredit(
  balanceDue: number,
  amountPaid: number,
  dueDate: Date | null,
): "Open" | "Partially Paid" | "Paid" | "Overdue" {
  if (balanceDue <= 0) return "Paid";
  if (amountPaid > 0) return "Partially Paid";
  if (dueDate && new Date(dueDate) < new Date()) return "Overdue";
  return "Open";
}

function hasFinancialEdits(payload: any): boolean {
  const fields = [
    "lineItems",
    "vendorId",
    "referenceBillId",
    "discountLevel",
    "discountPercent",
    "taxType",
    "tdsId",
    "tcsId",
    "tdsAmount",
    "tcsAmount",
    "adjustmentAmount",
    "subTotal",
    "discountAmount",
    "taxAmount",
    "total",
  ];
  return fields.some((field) => payload[field] !== undefined);
}

async function nextVendorCreditNumber(organizationId: any): Promise<string> {
  const last = await VendorCredit.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ vendorCreditNumber: -1 })
    .select("vendorCreditNumber")
    .lean();

  if (!last) return "VCR-00001";
  const match = last.vendorCreditNumber.match(/VCR-(\d+)/);
  if (!match) return "VCR-00001";
  const next = Number(match[1]) + 1;
  return `VCR-${String(next).padStart(5, "0")}`;
}

async function runOptionalTransaction<T>(work: (session?: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new ValidationError("Transaction did not produce a result");
    return result;
  } catch (error: any) {
    const message = String(error?.message || "");
    const txNotSupported =
      message.includes("Transaction numbers are only allowed") ||
      message.includes("does not support retryable writes") ||
      message.includes("replica set");

    if (!txNotSupported) {
      throw error;
    }

    return work(undefined);
  } finally {
    await session.endSession();
  }
}

export const getNextNumber = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const next = await nextVendorCreditNumber(orgId(req));
  res.json({ success: true, data: { vendorCreditNumber: next } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    status,
    vendorId,
    search,
    dateStart,
    dateEnd,
    page = 1,
    limit = 25,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;

  if (search) {
    filter.$or = [
      { vendorCreditNumber: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }

  if (dateStart || dateEnd) {
    filter.vendorCreditDate = {};
    if (dateStart) filter.vendorCreditDate.$gte = new Date(String(dateStart));
    if (dateEnd) filter.vendorCreditDate.$lte = new Date(String(dateEnd));
  }

  const total = await VendorCredit.countDocuments(filter);
  const credits = await VendorCredit.find(filter)
    .populate("vendorId", "displayName companyName email")
    .populate("referenceBillId", "billNumber total balanceDue status")
    .sort({ [String(sortBy)]: sortOrder === "asc" ? 1 : -1 })
    .skip((Number(page) - 1) * Number(limit))
    .limit(Number(limit))
    .lean();

  res.json({
    success: true,
    data: credits,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  });
});

export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email billingAddress")
    .populate("referenceBillId", "billNumber total balanceDue status")
    .populate("lineItems.itemId", "name sku")
    .populate("lineItems.accountId", "name accountType");

  if (!credit) throw new NotFoundError("Vendor credit");

  const applications = await VendorCreditApplication.find({
    organizationId: orgId(req),
    vendorCreditId: credit._id,
    isDeleted: false,
  })
    .populate("billId", "billNumber total balanceDue status amountPaid")
    .sort({ appliedDate: -1 })
    .lean();

  res.json({ success: true, data: { credit, applications } });
});

/** GET /api/vendor-credits/:id/pdf */
export const downloadPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  })
    .populate("vendorId", "displayName companyName email billingAddress")
    .populate("referenceBillId", "billNumber")
    .populate("lineItems.itemId", "name")
    .lean();

  if (!credit) throw new NotFoundError("Vendor credit");

  const org = await Organization.findById(credit.organizationId).lean();
  if (!org) throw new NotFoundError("Organization");

  const vendor = credit.vendorId as any;
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

  const pdfBuffer = await generateVendorCreditPdf({
    orgName: org.name,
    orgAddress: org.address as any,
    orgTaxId: (org as any).taxId,
    vendorName,
    vendorAddress,
    vendorEmail: vendor?.email,
    vendorCreditNumber: credit.vendorCreditNumber,
    vendorCreditDate: (credit.vendorCreditDate as any)?.toISOString
      ? (credit.vendorCreditDate as any).toISOString()
      : String(credit.vendorCreditDate),
    referenceNumber: (credit.referenceBillId as any)?.billNumber || credit.orderNumber || "-",
    items: (credit.lineItems || [])
      .filter((li: any) => !li.isHeader)
      .map((li: any) => ({
        name: (typeof li.itemId === "object" && li.itemId?.name) || li.name || "Item",
        description: li.description,
        quantity: Number(li.quantity || 0),
        rate: Number(li.rate || 0),
        amount: Number(li.amount || 0),
      })),
    subTotal: Number(credit.subTotal || 0),
    discountAmount: Number(credit.discountAmount || 0),
    taxAmount: Number(credit.taxAmount || 0),
    tdsAmount: Number((credit as any).tdsAmount || 0),
    tcsAmount: Number((credit as any).tcsAmount || 0),
    total: Number(credit.total || 0),
    creditsRemaining: Number(credit.balanceAmount || 0),
    notes: credit.notes,
    termsAndConditions: credit.termsAndConditions,
    currencySymbol: org.baseCurrency === "INR" ? "₹" : org.baseCurrency,
  });

  const isPreview = req.query.preview === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isPreview ? "inline" : "attachment"}; filename="Vendor-Credit-${credit.vendorCreditNumber}.pdf"`,
  );
  res.send(pdfBuffer);
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  if (!req.body.vendorId) throw new ValidationError("Vendor is required");
  if (!req.body.vendorCreditDate) throw new ValidationError("Vendor credit date is required");

  const discountLevel: "transaction" | "line_item" =
    req.body.discountLevel === "line_item" ? "line_item" : "transaction";
  const lineItems = calcLineItems(req.body.lineItems || [], discountLevel);
  const discountPercent =
    discountLevel === "transaction" ? Math.max(0, toNum(req.body.discountPercent)) : 0;
  const taxType = req.body.taxType || "none";
  const tdsAmount = taxType === "TDS" ? Math.max(0, toNum(req.body.tdsAmount)) : 0;
  const tcsAmount = taxType === "TCS" ? Math.max(0, toNum(req.body.tcsAmount)) : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount);
  const totals = computeTotals({
    lineItems,
    discountLevel,
    discountPercent,
    tdsAmount,
    tcsAmount,
    adjustmentAmount,
  });

  if (totals.total < 0) {
    throw new ValidationError("Total cannot be negative");
  }

  const requestedStatus = req.body.status || "OPEN";
  if (!["DRAFT", "OPEN"].includes(requestedStatus)) {
    throw new ValidationError("New vendor credit status must be DRAFT or OPEN");
  }

  const vendorCreditNumber = req.body.vendorCreditNumber || (await nextVendorCreditNumber(oid));

  const credit = new VendorCredit({
    organizationId: oid,
    vendorId: req.body.vendorId,
    vendorCreditNumber,
    vendorCreditDate: req.body.vendorCreditDate,
    referenceBillId: req.body.referenceBillId || null,
    subject: req.body.subject || "",
    sourceOfSupply: req.body.sourceOfSupply || "",
    destinationOfSupply: req.body.destinationOfSupply || "",
    billType: req.body.billType || "",
    orderNumber: req.body.orderNumber || "",
    lineItems,
    discountLevel,
    discountPercent,
    discountAmount: totals.discountAmount,
    taxType,
    tdsId: taxType === "TDS" ? req.body.tdsId || null : null,
    tcsId: taxType === "TCS" ? req.body.tcsId || null : null,
    tdsAmount,
    tcsAmount,
    taxAmount: totals.taxAmount,
    adjustmentLabel: req.body.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    subTotal: totals.subTotal,
    total: totals.total,
    appliedAmount: 0,
    refundedAmount: 0,
    balanceAmount: totals.total,
    notes: req.body.notes || "",
    termsAndConditions: req.body.termsAndConditions || "",
    attachments: req.body.attachments || [],
    status: requestedStatus,
    comments: [
      {
        author: "System",
        text: `Vendor credit created for ${totals.total.toLocaleString("en-IN")}`,
        time: new Date(),
        isSystem: true,
      },
    ],
  });

  attachUser(credit, req);
  await credit.save();

  res.status(201).json({ success: true, data: credit });
});

export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!credit) throw new NotFoundError("Vendor credit");
  if (credit.status === "VOID") throw new ValidationError("Cannot edit a void vendor credit");

  if (toNum(credit.appliedAmount) > 0 && hasFinancialEdits(req.body)) {
    throw new ValidationError("Cannot edit financial fields after applying credit");
  }

  const discountLevel: "transaction" | "line_item" =
    req.body.discountLevel || credit.discountLevel;
  const lineItems = req.body.lineItems
    ? calcLineItems(req.body.lineItems, discountLevel)
    : credit.lineItems;
  const discountPercent =
    discountLevel === "transaction"
      ? Math.max(0, toNum(req.body.discountPercent ?? credit.discountPercent))
      : 0;
  const taxType = req.body.taxType ?? (credit as any).taxType ?? "none";
  const tdsAmount =
    taxType === "TDS"
      ? Math.max(0, toNum(req.body.tdsAmount ?? (credit as any).tdsAmount))
      : 0;
  const tcsAmount =
    taxType === "TCS"
      ? Math.max(0, toNum(req.body.tcsAmount ?? (credit as any).tcsAmount))
      : 0;
  const adjustmentAmount = toNum(req.body.adjustmentAmount ?? credit.adjustmentAmount);
  const totals = computeTotals({
    lineItems,
    discountLevel,
    discountPercent,
    tdsAmount,
    tcsAmount,
    adjustmentAmount,
  });

  if (totals.total < 0) {
    throw new ValidationError("Total cannot be negative");
  }

  const newBalance = round2(totals.total - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  if (newBalance < 0) {
    throw new ValidationError("Total cannot be less than already applied amount");
  }

  Object.assign(credit, req.body, {
    lineItems,
    discountLevel,
    discountPercent,
    discountAmount: totals.discountAmount,
    taxType,
    tdsId: taxType === "TDS" ? (req.body.tdsId ?? (credit as any).tdsId ?? null) : null,
    tcsId: taxType === "TCS" ? (req.body.tcsId ?? (credit as any).tcsId ?? null) : null,
    tdsAmount,
    tcsAmount,
    taxAmount: totals.taxAmount,
    adjustmentAmount,
    subTotal: totals.subTotal,
    total: totals.total,
    balanceAmount: newBalance,
  });

  if (credit.status !== "DRAFT") {
    credit.status = deriveStatus(toNum(credit.appliedAmount), totals.total);
  }

  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, data: credit });
});

export const applyToBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const billId = String(req.body.billId || "").trim();
  if (!billId) throw new ValidationError("billId is required");

  const amountInput = toNum(req.body.amount);
  if (amountInput <= 0) throw new ValidationError("Amount must be greater than zero");

  const result = await runOptionalTransaction(async (session) => {
    const credit = await VendorCredit.findOne(
      { _id: req.params.id, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!credit) throw new NotFoundError("Vendor credit");
    if (credit.status === "VOID") throw new ValidationError("Cannot apply a void vendor credit");
    if (credit.status === "CLOSED") throw new ValidationError("Vendor credit is already fully applied");

    const bill = await Bill.findOne(
      { _id: billId, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!bill) throw new NotFoundError("Bill");

    if (String(bill.vendorId) !== String(credit.vendorId)) {
      throw new ValidationError("Vendor credit can only be applied to bills of the same vendor");
    }

    if (["Paid", "Void"].includes(String(bill.status))) {
      throw new ValidationError("Cannot apply vendor credit to a paid or void bill");
    }

    const billBalance = round2(toNum(bill.balanceDue));
    const creditBalance = round2(toNum(credit.balanceAmount));

    if (billBalance <= 0) throw new ValidationError("Bill has no outstanding balance");
    if (creditBalance <= 0) throw new ValidationError("Vendor credit has no available balance");

    const amount = round2(amountInput);
    const maxAllowed = round2(Math.min(billBalance, creditBalance));
    if (amount > maxAllowed) {
      throw new ValidationError(`Amount exceeds available limit (${maxAllowed.toFixed(2)})`);
    }

    credit.appliedAmount = round2(toNum(credit.appliedAmount) + amount);
    credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount));
    credit.status = deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
    credit.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Applied ${amount.toLocaleString("en-IN")} to bill ${bill.billNumber}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(credit, req);

    bill.amountPaid = round2(toNum(bill.amountPaid) + amount);
    bill.balanceDue = round2(toNum(bill.total) - toNum(bill.amountPaid));
    bill.status = billStatusAfterCredit(bill.balanceDue, bill.amountPaid, bill.dueDate || null);
    bill.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Vendor credit ${credit.vendorCreditNumber} applied: ${amount.toLocaleString("en-IN")}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(bill, req);

    const existingApplication = await VendorCreditApplication.findOne(
      {
        organizationId: oid,
        vendorCreditId: credit._id,
        billId: bill._id,
        isDeleted: false,
      },
      null,
      session ? { session } : undefined,
    );

    if (existingApplication) {
      existingApplication.amount = round2(toNum(existingApplication.amount) + amount);
      existingApplication.appliedDate = new Date();
      existingApplication.notes = req.body.notes || existingApplication.notes || "";
      attachUser(existingApplication, req);
      if (session) await existingApplication.save({ session });
      else await existingApplication.save();
    } else {
      const application = new VendorCreditApplication({
        organizationId: oid,
        vendorCreditId: credit._id,
        billId: bill._id,
        amount,
        appliedDate: new Date(),
        notes: req.body.notes || "",
      });
      attachUser(application, req);
      if (session) await application.save({ session });
      else await application.save();
    }

    if (session) {
      await bill.save({ session });
      await credit.save({ session });
    } else {
      await bill.save();
      await credit.save();
    }

    return { credit, bill, amount };
  });

  res.json({ success: true, data: result });
});

export const unapplyFromBill = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = orgId(req);
  const billId = String(req.body.billId || "").trim();
  if (!billId) throw new ValidationError("billId is required");

  const result = await runOptionalTransaction(async (session) => {
    const credit = await VendorCredit.findOne(
      { _id: req.params.id, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!credit) throw new NotFoundError("Vendor credit");
    if (credit.status === "VOID") throw new ValidationError("Cannot unapply a void vendor credit");

    const bill = await Bill.findOne(
      { _id: billId, organizationId: oid, isDeleted: false },
      null,
      session ? { session } : undefined,
    );
    if (!bill) throw new NotFoundError("Bill");
    if (bill.status === "Void") throw new ValidationError("Cannot unapply credit from a void bill");

    const application = await VendorCreditApplication.findOne(
      {
        organizationId: oid,
        vendorCreditId: credit._id,
        billId: bill._id,
        isDeleted: false,
      },
      null,
      session ? { session } : undefined,
    );

    if (!application) {
      throw new ValidationError("No applied credit found for this bill");
    }

    const requestedAmount = toNum(req.body.amount, toNum(application.amount));
    if (requestedAmount <= 0) throw new ValidationError("Amount must be greater than zero");

    const amount = round2(Math.min(requestedAmount, toNum(application.amount)));
    if (amount <= 0) throw new ValidationError("Invalid unapply amount");

    application.amount = round2(toNum(application.amount) - amount);
    application.appliedDate = new Date();
    attachUser(application, req);

    if (application.amount <= 0) {
      application.isDeleted = true;
      application.deletedAt = new Date();
    }

    credit.appliedAmount = round2(Math.max(0, toNum(credit.appliedAmount) - amount));
    credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount));
    credit.status =
      toNum(credit.appliedAmount) === 0
        ? "OPEN"
        : deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
    credit.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Unapplied ${amount.toLocaleString("en-IN")} from bill ${bill.billNumber}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(credit, req);

    bill.amountPaid = round2(Math.max(0, toNum(bill.amountPaid) - amount));
    bill.balanceDue = round2(Math.max(0, toNum(bill.total) - toNum(bill.amountPaid)));
    bill.status = billStatusAfterCredit(bill.balanceDue, bill.amountPaid, bill.dueDate || null);
    bill.comments.push({
      author: req.user?.name || req.user?.email || "System",
      text: `Vendor credit ${credit.vendorCreditNumber} unapplied: ${amount.toLocaleString("en-IN")}`,
      time: new Date(),
      isSystem: true,
    });
    attachUser(bill, req);

    if (session) {
      await application.save({ session });
      await bill.save({ session });
      await credit.save({ session });
    } else {
      await application.save();
      await bill.save();
      await credit.save();
    }

    return { credit, bill, amount };
  });

  res.json({ success: true, data: result });
});

export const voidVendorCredit = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Vendor credit");
  if (credit.status === "VOID") throw new ValidationError("Vendor credit is already void");
  if (toNum(credit.appliedAmount) > 0) {
    throw new ValidationError("Cannot void vendor credit after it has been applied");
  }
  if (toNum((credit as any).refundedAmount) > 0) {
    throw new ValidationError("Cannot void vendor credit after refund is recorded");
  }

  credit.status = "VOID";
  credit.balanceAmount = 0;
  credit.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Vendor credit voided. Reason: ${req.body.reason || "No reason provided"}`,
    time: new Date(),
    isSystem: true,
  });
  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, data: credit });
});

export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });

  if (!credit) throw new NotFoundError("Vendor credit");
  if (toNum(credit.appliedAmount) > 0) {
    throw new ValidationError("Cannot delete a vendor credit that has been applied");
  }
  if (toNum((credit as any).refundedAmount) > 0) {
    throw new ValidationError("Cannot delete a vendor credit after refund is recorded");
  }
  if (!["DRAFT", "OPEN"].includes(String(credit.status))) {
    throw new ValidationError("Only DRAFT or OPEN vendor credits can be deleted");
  }

  credit.isDeleted = true;
  credit.deletedAt = new Date();
  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, message: "Vendor credit deleted successfully" });
});

export const cloneVendorCredit = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const source = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  }).lean();
  if (!source) throw new NotFoundError("Vendor credit");

  const vendorCreditNumber = await nextVendorCreditNumber((source as any).organizationId);
  const { _id, __v, ...cloneData } = source as any;

  const credit = new VendorCredit({
    ...cloneData,
    vendorCreditNumber,
    vendorCreditDate: new Date(),
    status: "OPEN",
    appliedAmount: 0,
    refundedAmount: 0,
    balanceAmount: cloneData.total || 0,
    comments: [
      {
        author: "System",
        text: `Vendor credit cloned from ${source.vendorCreditNumber}`,
        time: new Date(),
        isSystem: true,
      },
    ],
  });

  attachUser(credit, req);
  await credit.save();
  res.status(201).json({ success: true, data: credit });
});

export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Vendor credit");

  const text = String(req.body.text || "").trim();
  if (!text) throw new ValidationError("Comment text is required");

  credit.comments.push({
    author: req.user?.name || req.user?.email || "User",
    text,
    time: new Date(),
    isSystem: false,
  });
  attachUser(credit, req);
  await credit.save();

  res.json({ success: true, data: credit.comments[credit.comments.length - 1] });
});

export const recordRefund = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const credit = await VendorCredit.findOne({
    _id: req.params.id,
    organizationId: orgId(req),
    isDeleted: false,
  });
  if (!credit) throw new NotFoundError("Vendor credit");
  if (credit.status === "VOID") throw new ValidationError("Cannot record refund for a void vendor credit");

  const amount = round2(toNum(req.body.amount));
  if (amount <= 0) throw new ValidationError("Refund amount must be greater than zero");

  const remaining = round2(toNum(credit.total) - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  if (amount > remaining) {
    throw new ValidationError(`Refund amount exceeds available balance (${remaining.toFixed(2)})`);
  }

  (credit as any).refundedAmount = round2(toNum((credit as any).refundedAmount) + amount);
  credit.balanceAmount = round2(toNum(credit.total) - toNum(credit.appliedAmount) - toNum((credit as any).refundedAmount));
  credit.status = credit.balanceAmount <= 0 ? "CLOSED" : deriveStatus(toNum(credit.appliedAmount), toNum(credit.total));
  credit.comments.push({
    author: req.user?.name || req.user?.email || "System",
    text: `Refund recorded: ${amount.toLocaleString("en-IN")}`,
    time: new Date(),
    isSystem: true,
  });

  attachUser(credit, req);
  await credit.save();
  res.json({ success: true, data: credit });
});
