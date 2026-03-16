import { Response } from "express";
import TcsTax from "../models/tcs-tax.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

const DEFAULT_TCS_TAXES = [
  {
    sectionCode: "194A",
    taxName: "194A - Other Interest than securities",
    sectionDescription: "Other Interest than securities",
    rate: 0,
  },
  {
    sectionCode: "194C",
    taxName: "194C - Payment of contractors",
    sectionDescription: "Payment of contractors HUF/Indiv and Payment of contractors for Others",
    rate: 0,
  },
  {
    sectionCode: "194H",
    taxName: "194H - Commission or Brokerage",
    sectionDescription: "Commission or Brokerage",
    rate: 0,
  },
  {
    sectionCode: "194I",
    taxName: "194I - Rent",
    sectionDescription: "Rent on land or furniture etc and Rent on plant and machinery",
    rate: 0,
  },
  {
    sectionCode: "194J",
    taxName: "194J - Professional Fees",
    sectionDescription: "Professional Fees",
    rate: 0,
  },
  {
    sectionCode: "194Q",
    taxName: "194Q - Payment of purchase of goods",
    sectionDescription: "Payment of purchase of goods",
    rate: 0,
  },
  {
    sectionCode: "194R",
    taxName: "194R - Benefit or perquisite",
    sectionDescription: "Benefit or perquisite",
    rate: 0,
  },
  {
    sectionCode: "194O",
    taxName: "194O - e-commerce participant",
    sectionDescription: "e-commerce participant",
    rate: 0,
  },
  {
    sectionCode: "Others",
    taxName: "Others - Others",
    sectionDescription: "Others",
    rate: 0,
  },
];

/** GET /api/tcs-taxes */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search } = req.query;
  const filter: any = { organizationId: orgId(req), isDeleted: false };
  if (search) filter.taxName = { $regex: search, $options: "i" };

  const taxes = await TcsTax.find(filter)
    .populate("tcsPayableAccountId", "name accountType")
    .populate("tcsReceivableAccountId", "name accountType")
    .sort({ taxName: 1 })
    .lean();

  res.json({ success: true, data: taxes });
});

/** GET /api/tcs-taxes/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tax = await TcsTax.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false })
    .populate("tcsPayableAccountId", "name accountType")
    .populate("tcsReceivableAccountId", "name accountType");
  if (!tax) throw new NotFoundError("TCS Tax");
  res.json({ success: true, data: tax });
});

/** POST /api/tcs-taxes */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { taxName, rate, sectionCode, sectionDescription, tcsPayableAccountId, tcsReceivableAccountId, isHigherRate, applicableStartDate, applicableEndDate } = req.body;
  if (!taxName) throw new ValidationError("Tax name is required");
  if (rate === undefined || rate === null) throw new ValidationError("Rate is required");
  if (!sectionCode) throw new ValidationError("Section is required");

  const tax = new TcsTax({
    organizationId: orgId(req),
    taxName,
    rate: Number(rate),
    sectionCode,
    sectionDescription: sectionDescription || "",
    tcsPayableAccountId: tcsPayableAccountId || null,
    tcsReceivableAccountId: tcsReceivableAccountId || null,
    isHigherRate: !!isHigherRate,
    applicableStartDate: applicableStartDate || null,
    applicableEndDate: applicableEndDate || null,
    isActive: true,
  });
  attachUser(tax, req);
  await tax.save();
  res.status(201).json({ success: true, data: tax });
});

/** POST /api/tcs-taxes/seed */
export const seed = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await TcsTax.countDocuments({ organizationId: organization, isDeleted: false });
  if (existing > 0) return res.json({ success: true, message: "TCS taxes already exist" });

  await TcsTax.insertMany(
    DEFAULT_TCS_TAXES.map((t) => ({
      organizationId: organization,
      taxName: t.taxName,
      rate: t.rate,
      sectionCode: t.sectionCode,
      sectionDescription: t.sectionDescription,
      tcsPayableAccountId: null,
      tcsReceivableAccountId: null,
      isHigherRate: false,
      applicableStartDate: null,
      applicableEndDate: null,
      isActive: true,
    }))
  );

  res.status(201).json({ success: true, message: "Default TCS taxes created" });
});

/** PATCH /api/tcs-taxes/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tax = await TcsTax.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!tax) throw new NotFoundError("TCS Tax");

  const fields = ["taxName", "rate", "sectionCode", "sectionDescription", "tcsPayableAccountId", "tcsReceivableAccountId", "isHigherRate", "applicableStartDate", "applicableEndDate", "isActive"] as const;
  for (const f of fields) {
    if (req.body[f] !== undefined) (tax as any)[f] = req.body[f];
  }
  attachUser(tax, req);
  await tax.save();
  res.json({ success: true, data: tax });
});

/** DELETE /api/tcs-taxes/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tax = await TcsTax.findOne({ _id: req.params.id, organizationId: orgId(req), isDeleted: false });
  if (!tax) throw new NotFoundError("TCS Tax");
  tax.isDeleted = true;
  tax.deletedAt = new Date();
  attachUser(tax, req);
  await tax.save();
  res.json({ success: true, message: "TCS Tax deleted" });
});