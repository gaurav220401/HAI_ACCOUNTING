import { Response } from "express";
import Contact from "../models/contact.model";
import Expense from "../models/expense.model";
import Organization from "../models/organization.model";
import Bill from "../models/bill.model";
import PurchaseOrder from "../models/purchase-order.model";
import RecurringBill from "../models/recurring-bill.model";
import RecurringExpense from "../models/recurring-expense.model";
import VendorCredit from "../models/vendor-credit.model";
import Journal from "../models/journal.model";
import PaymentMade from "../models/payment-made.model";
import Item from "../models/item.model";
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
  const { type, search, page = 1, limit = 25, includeInactive } = req.query;
  const filter: any = { organizationId: await orgId(req), isDeleted: false };

  const includeInactiveBool = String(includeInactive ?? "false").toLowerCase() === "true";
  if (!includeInactiveBool) filter.isActive = true;

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

/** POST /api/contacts/:id/clone */
export const clone = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = await orgId(req);
  const source = await Contact.findOne({ _id: req.params.id, organizationId: oid, isDeleted: false });
  if (!source) throw new NotFoundError("Contact");

  const sourceObj = source.toObject();
  const baseName = source.displayName || source.companyName || "Vendor";
  let candidateName = `Copy of ${baseName}`;
  let suffix = 2;

  while (await Contact.exists({ organizationId: oid, displayName: candidateName, isDeleted: false })) {
    candidateName = `Copy (${suffix}) of ${baseName}`;
    suffix += 1;
  }

  const clonePayload: any = {
    ...sourceObj,
    _id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    deletedAt: null,
    isDeleted: false,
    isActive: true,
    displayName: candidateName,
    linkedContactId: sourceObj.linkedContactId ?? null,
  };

  const cloned = new Contact(clonePayload);
  attachUser(cloned, req);
  await cloned.save();

  res.status(201).json({ success: true, data: cloned });
});

/** POST /api/contacts/:id/merge */
export const merge = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = await orgId(req);
  const sourceId = req.params.id;
  const targetVendorId = String(req.body?.targetVendorId || "").trim();

  if (!targetVendorId) throw new ValidationError("targetVendorId is required");
  if (targetVendorId === sourceId) throw new ValidationError("Cannot merge a vendor into itself");

  const [source, target] = await Promise.all([
    Contact.findOne({ _id: sourceId, organizationId: oid, isDeleted: false }),
    Contact.findOne({ _id: targetVendorId, organizationId: oid, isDeleted: false }),
  ]);

  if (!source) throw new NotFoundError("Source vendor");
  if (!target) throw new NotFoundError("Target vendor");

  if (source.legalComplianceLocked) {
    throw new ValidationError("Cannot merge vendor while legal compliance lock is active on source vendor");
  }

  if (source.contactType !== "Vendor" && source.contactType !== "Both") {
    throw new ValidationError("Source contact is not a vendor");
  }
  if (target.contactType !== "Vendor" && target.contactType !== "Both") {
    throw new ValidationError("Target contact is not a vendor");
  }

  const [
    bills,
    expenses,
    purchaseOrders,
    recurringBills,
    recurringExpenses,
    vendorCredits,
    journals,
    payments,
    items,
    linkedContacts,
  ] = await Promise.all([
    Bill.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    Expense.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    PurchaseOrder.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    RecurringBill.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    RecurringExpense.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    VendorCredit.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    Journal.updateMany({ organizationId: oid, vendorId: source._id }, { $set: { vendorId: target._id } }),
    PaymentMade.updateMany({ organization_id: oid, vendor_id: source._id }, { $set: { vendor_id: target._id } }),
    Item.updateMany({ organizationId: oid, preferredVendorId: source._id }, { $set: { preferredVendorId: target._id } }),
    Contact.updateMany({ organizationId: oid, linkedContactId: source._id }, { $set: { linkedContactId: target._id } }),
  ]);

  source.isActive = false;
  source.deletedAt = undefined;
  source.isDeleted = false;
  source.notes = [source.notes || "", `Merged into ${target.displayName} on ${new Date().toISOString()}`]
    .filter(Boolean)
    .join("\n");

  const actorName = req.user?.name ?? req.user?.email ?? "System";
  const sourceMergeComment = {
    text: `Vendor merged into ${target.displayName} by ${actorName}`,
    userId: req.user?._id ?? null,
    userName: actorName,
    createdAt: new Date(),
  };
  (source as any).comments = [...(source as any).comments, sourceMergeComment];
  (target as any).comments = [...(target as any).comments, {
    text: `Vendor ${source.displayName} merged into this vendor by ${actorName}`,
    userId: req.user?._id ?? null,
    userName: actorName,
    createdAt: new Date(),
  }];

  attachUser(source, req);
  attachUser(target, req);
  await Promise.all([source.save(), target.save()]);

  res.json({
    success: true,
    data: {
      sourceVendorId: source._id,
      targetVendorId: target._id,
      reassignedCounts: {
        bills: bills.modifiedCount,
        expenses: expenses.modifiedCount,
        purchaseOrders: purchaseOrders.modifiedCount,
        recurringBills: recurringBills.modifiedCount,
        recurringExpenses: recurringExpenses.modifiedCount,
        vendorCredits: vendorCredits.modifiedCount,
        journals: journals.modifiedCount,
        paymentsMade: payments.modifiedCount,
        itemsPreferredVendor: items.modifiedCount,
        linkedContacts: linkedContacts.modifiedCount,
      },
    },
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

/** POST /api/contacts/:id/comments */
export const addComment = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: await orgId(req) });
  if (!contact) throw new NotFoundError("Contact");
  const { text } = req.body;
  if (!text?.trim()) throw new ValidationError("Comment text is required");

  const userName = req.user?.name ?? req.user?.email ?? "Unknown";
  const userId = req.user?._id ?? null;

  (contact as any).comments.push({ text: text.trim(), userId, userName, createdAt: new Date() });
  await contact.save();
  res.status(201).json({ success: true, data: (contact as any).comments });
});

/** GET /api/contacts/:id/activity */
export const getActivity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const oid = await orgId(req);
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: oid })
    .populate("createdBy", "name email");
  if (!contact) throw new NotFoundError("Contact");

  const expenses = await Expense.find({
    vendorId: contact._id,
    organizationId: oid,
    isDeleted: { $ne: true },
  })
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  type ActivityEvent = {
    type: string;
    timestamp: string;
    description: string;
    amount?: number;
    currency?: string;
    ref?: string;
    userName?: string;
  };

  const events: ActivityEvent[] = [];

  const contactCreator = (contact as any).createdBy;
  const contactCreatorName: string = contactCreator?.name ?? contactCreator?.email ?? "Unknown";

  events.push({
    type: "contact_created",
    timestamp: (contact as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
    description: `Vendor "${contact.displayName}" was created`,
    userName: contactCreatorName,
  });

  for (const cmt of (contact as any).comments ?? []) {
    events.push({
      type: cmt.text?.includes("merged") ? "vendor_merged" : "comment",
      timestamp: (cmt as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
      description: cmt.text,
      userName: (cmt as any).userName ?? "System",
    });
  }

  for (const exp of expenses) {
    const creator = (exp as any).createdBy;
    const creatorName: string = creator?.name ?? creator?.email ?? "Unknown";
    events.push({
      type: "expense_added",
      timestamp: (exp as any).createdAt?.toISOString?.() ?? exp.date,
      description: `Expense ${(exp as any).expenseNumber} added`,
      amount: exp.amount,
      currency: (exp as any).currency,
      ref: (exp as any).expenseNumber,
      userName: creatorName,
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json({ success: true, data: events });
});
