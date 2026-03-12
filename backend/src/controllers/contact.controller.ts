import { Response } from "express";
import Contact from "../models/contact.model";
import Organization from "../models/organization.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

async function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (id) return id;

  if (!req.user) throw new ForbiddenError("User not found");

  const firstOrg = await Organization.findOne().select("_id").lean();
  if (!firstOrg?._id) throw new ForbiddenError("No active organization");

  req.user.activeOrganization = firstOrg._id as any;
  await req.user.save();
  return firstOrg._id;
}

/** GET /api/contacts?type=Customer|Vendor|Both&search=...&page=1&limit=25 */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { type, search, page = 1, limit = 25 } = req.query;
  const filter: any = { organizationId: await orgId(req), isDeleted: false, isActive: true };

  if (type) {
    if (type === "Customer") {
      filter.contactType = { $in: ["Customer", "Both"] };
    } else if (type === "Vendor") {
      filter.contactType = { $in: ["Vendor", "Both"] };
    } else {
      filter.contactType = type;
    }
  }

  if (search) filter.$or = [
    { displayName: { $regex: search, $options: "i" } },
    { companyName: { $regex: search, $options: "i" } },
    { email: { $regex: search, $options: "i" } },
  ];

  const total = await Contact.countDocuments(filter);
  const contacts = await Contact.find(filter)
    .sort({ displayName: 1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  res.json({
    success: true,
    data: contacts,
    pagination: { total, page: +page, limit: +limit, pages: Math.ceil(total / +limit) },
  });
});

/** GET /api/contacts/:id */
export const getOne = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: await orgId(req) })
    .populate("paymentTermsId salesPersonId reportingTags");
  if (!contact) throw new NotFoundError("Contact");
  res.json({ success: true, data: contact });
});

/** POST /api/contacts */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { displayName, contactType } = req.body;
  if (!displayName) throw new ValidationError("displayName is required");
  if (!contactType) throw new ValidationError("contactType is required");

  const contact = new Contact({ organizationId: await orgId(req), ...req.body });
  attachUser(contact, req);
  await contact.save();
  res.status(201).json({ success: true, data: contact });
});

/** PATCH /api/contacts/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: await orgId(req) });
  if (!contact) throw new NotFoundError("Contact");

  const allowed = [
    "displayName", "companyName", "email", "phone", "mobile", "currency",
    "salutation", "firstName", "lastName", "language",
    "paymentTermsId", "accountsPayableId", "openingBalance",
    "taxTreatment", "taxId", "gstin", "pan", "tdsCategory", "msmeRegistered",
    "billingAddress", "shippingAddress",
    "contactPersons", "bankDetails",
    "notes", "portalEnabled",
    "reportingTags", "creditLimit", "salesPersonId",
    "isActive", "contactType",
    "websiteUrl", "department", "designation", "twitterHandle", "skypeName", "facebookUrl",
    "documents",
  ];
  allowed.forEach((f) => { if (req.body[f] !== undefined) (contact as any)[f] = req.body[f]; });
  attachUser(contact, req);
  await contact.save();
  res.json({ success: true, data: contact });
});

/** DELETE /api/contacts/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: await orgId(req) });
  if (!contact) throw new NotFoundError("Contact");
  contact.isDeleted = true;
  contact.deletedAt = new Date();
  attachUser(contact, req);
  await contact.save();
  res.json({ success: true, message: "Contact deleted" });
});
