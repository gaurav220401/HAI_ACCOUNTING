import { Response } from "express";
import { Types } from "mongoose";
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
import Account from "../models/account.model";
import PaymentTerms from "../models/payment-terms.model";
import SalesPerson from "../models/sales-person.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "../services/gl-posting.service";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const GST_TREATMENT_CANONICAL = {
  regular: "Registered Business - Regular",
  composition: "Registered Business - Composition",
  unregistered: "Unregistered Business",
  consumer: "Consumer",
  overseas: "Overseas",
  sezUnit: "Special Economic Zone",
  deemedExport: "Deemed Export",
  taxDeductor: "Tax Deductor",
  sezDeveloper: "SEZ Developer",
  isd: "Input Service Distributor",
} as const;

const GST_TREATMENT_ALIASES: Record<string, string> = {
  Taxable: GST_TREATMENT_CANONICAL.regular,
  TaxExempt: GST_TREATMENT_CANONICAL.consumer,
  ReverseCharge: GST_TREATMENT_CANONICAL.taxDeductor,
  SEZ: GST_TREATMENT_CANONICAL.sezUnit,
  Composition: GST_TREATMENT_CANONICAL.composition,
  UIN: GST_TREATMENT_CANONICAL.isd,
};

const GST_TREATMENTS_REQUIRING_GSTIN = new Set<string>([
  GST_TREATMENT_CANONICAL.regular,
  GST_TREATMENT_CANONICAL.composition,
  GST_TREATMENT_CANONICAL.sezUnit,
  GST_TREATMENT_CANONICAL.deemedExport,
  GST_TREATMENT_CANONICAL.taxDeductor,
  GST_TREATMENT_CANONICAL.sezDeveloper,
  GST_TREATMENT_CANONICAL.isd,
]);

function normalizeTaxTreatment(value: unknown, fallback = GST_TREATMENT_CANONICAL.regular): string {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return GST_TREATMENT_ALIASES[raw] || raw;
}

function normalizeTaxPreference(value: unknown, taxTreatment: string): "Taxable" | "Tax Exempt" {
  if (taxTreatment === GST_TREATMENT_CANONICAL.overseas) return "Taxable";
  return String(value || "").trim() === "Tax Exempt" ? "Tax Exempt" : "Taxable";
}

function sanitizeContactPayload(body: Record<string, any>, currentTaxTreatment?: unknown) {
  const effectiveTreatment =
    body.taxTreatment !== undefined
      ? normalizeTaxTreatment(body.taxTreatment)
      : normalizeTaxTreatment(currentTaxTreatment);

  if (body.taxTreatment !== undefined) {
    body.taxTreatment = effectiveTreatment;
  }

  if (body.taxPreference !== undefined || body.taxTreatment !== undefined) {
    body.taxPreference = normalizeTaxPreference(body.taxPreference, effectiveTreatment);
  }

  if (body.taxPreference === "Taxable") {
    body.exemptionReason = "";
  }

  if (body.gstin !== undefined) body.gstin = String(body.gstin || "").trim().toUpperCase();
  if (body.pan !== undefined) body.pan = String(body.pan || "").trim().toUpperCase();
  if (body.placeOfSupply !== undefined) body.placeOfSupply = String(body.placeOfSupply || "").trim();

  if (!GST_TREATMENTS_REQUIRING_GSTIN.has(effectiveTreatment)) {
    if (body.gstin !== undefined) body.gstin = "";
    if (body.businessLegalName !== undefined) body.businessLegalName = "";
    if (body.businessTradeName !== undefined) body.businessTradeName = "";
  }

  if (effectiveTreatment === GST_TREATMENT_CANONICAL.overseas) {
    if (body.placeOfSupply !== undefined) body.placeOfSupply = "FC";
    if (body.taxPreference !== undefined) body.taxPreference = "Taxable";
    if (body.exemptionReason !== undefined) body.exemptionReason = "";
  }
}

/**
 * Sync a vendor's opening balance to the Accounts Payable account.
 * Opening balance for a vendor means the business owes the vendor that amount.
 *  DEBIT  Opening Balance Adjustments (Equity/Liability) → amount
 *  CREDIT Accounts Payable                               → amount
 * (opposite if opening balance is negative)
 */
async function syncVendorOpeningBalance(
  contact: any,
  openingBalance: number,
  previousOpeningBalance: number,
  req: AuthenticatedRequest,
  force = false,
) {
  const organizationId = contact.organizationId;
  const delta = round2(openingBalance - previousOpeningBalance);
  if (!force && Math.abs(delta) < 0.01) return;

  // Reverse any previous opening balance GL entries for this contact
  const voucherId = `contact-opening:${String(contact._id)}`;
  await reverseVoucher({
    organizationId,
    voucherType: "System",
    voucherId,
    reversalVoucherNo: `REV-OB-${contact.displayName}`,
    postingDate: new Date(),
    description: `Reverse opening balance for ${contact.displayName}`,
    req,
  });

  // If new opening balance is 0, we're done after reversal
  if (Math.abs(openingBalance) < 0.01) return;

  const accountsPayableId = contact.accountsPayableId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Accounts Payable", "Trade Payables", "Creditors"],
      rootType: "Liability",
      accountType: "Accounts Payable",
    }));

  const adjustmentId = await findAccountIdByName({
    organizationId,
    names: ["Opening Balance Adjustments", "Opening Balance Offset"],
    rootType: "Liability",
  });

  const absAmount = round2(Math.abs(openingBalance));
  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Vendor";
    contactId?: any;
  }> = [];

  if (openingBalance > 0) {
    // Vendor is owed money → Credit AP (increase liability), Debit adjustment
    lines.push({
      accountId: adjustmentId,
      debit: absAmount,
      description: `Opening balance for vendor ${contact.displayName}`,
    });
    lines.push({
      accountId: accountsPayableId,
      credit: absAmount,
      description: `Opening balance payable to ${contact.displayName}`,
      contactType: "Vendor",
      contactId: contact._id,
    });
  } else {
    // Negative opening balance → Debit AP (reduce liability), Credit adjustment
    lines.push({
      accountId: accountsPayableId,
      debit: absAmount,
      description: `Opening balance advance from ${contact.displayName}`,
      contactType: "Vendor",
      contactId: contact._id,
    });
    lines.push({
      accountId: adjustmentId,
      credit: absAmount,
      description: `Opening balance adj for vendor ${contact.displayName}`,
    });
  }

  await postVoucher({
    organizationId,
    voucherType: "System",
    voucherId,
    voucherNo: `OB-${contact.displayName}`,
    postingDate: new Date(),
    lines,
    description: `Opening balance for vendor ${contact.displayName}`,
    req,
  });
}

/**
 * Sync a customer's opening balance to the Accounts Receivable account.
 * Positive opening balance means customer owes the business.
 *  DEBIT  Accounts Receivable                              → amount
 *  CREDIT Opening Balance Adjustments (Equity/Liability)  → amount
 * (opposite if opening balance is negative)
 */
async function syncCustomerOpeningBalance(
  contact: any,
  openingBalance: number,
  previousOpeningBalance: number,
  req: AuthenticatedRequest,
  force = false,
) {
  const organizationId = contact.organizationId;
  const delta = round2(openingBalance - previousOpeningBalance);
  if (!force && Math.abs(delta) < 0.01) return;

  const voucherId = `contact-opening-customer:${String(contact._id)}`;
  await reverseVoucher({
    organizationId,
    voucherType: "System",
    voucherId,
    reversalVoucherNo: `REV-OB-CUST-${contact.displayName}`,
    postingDate: new Date(),
    description: `Reverse customer opening balance for ${contact.displayName}`,
    req,
  });

  if (Math.abs(openingBalance) < 0.01) return;

  const accountsReceivableId = contact.accountsReceivableId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
      rootType: "Asset",
      accountType: "Accounts Receivable",
    }));

  const adjustmentId = await findAccountIdByName({
    organizationId,
    names: ["Opening Balance Adjustments", "Opening Balance Offset"],
    rootType: "Liability",
  });

  const absAmount = round2(Math.abs(openingBalance));
  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Customer";
    contactId?: any;
  }> = [];

  if (openingBalance > 0) {
    lines.push({
      accountId: accountsReceivableId,
      debit: absAmount,
      description: `Opening receivable from ${contact.displayName}`,
      contactType: "Customer",
      contactId: contact._id,
    });
    lines.push({
      accountId: adjustmentId,
      credit: absAmount,
      description: `Opening balance adjustment for customer ${contact.displayName}`,
    });
  } else {
    lines.push({
      accountId: adjustmentId,
      debit: absAmount,
      description: `Opening balance adjustment for customer ${contact.displayName}`,
    });
    lines.push({
      accountId: accountsReceivableId,
      credit: absAmount,
      description: `Opening customer advance from ${contact.displayName}`,
      contactType: "Customer",
      contactId: contact._id,
    });
  }

  await postVoucher({
    organizationId,
    voucherType: "System",
    voucherId,
    voucherNo: `OB-CUST-${contact.displayName}`,
    postingDate: new Date(),
    lines,
    description: `Opening balance for customer ${contact.displayName}`,
    req,
  });
}

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
  const body = { ...(req.body || {}) };
  sanitizeContactPayload(body);

  const { displayName, contactType } = body;
  if (!displayName) throw new ValidationError("displayName is required");
  if (!contactType) throw new ValidationError("contactType is required");

  const contact = new Contact({ organizationId: await orgId(req), ...body });
  attachUser(contact, req);
  await contact.save();

  const ob = Number(body.openingBalance || 0);
  if (Math.abs(ob) >= 0.01 && contactType === "Customer") {
    await syncCustomerOpeningBalance(contact, ob, 0, req);
  } else if (Math.abs(ob) >= 0.01 && (contactType === "Vendor" || contactType === "Both")) {
    await syncVendorOpeningBalance(contact, ob, 0, req);
  }

  res.status(201).json({ success: true, data: contact });
});

/** PATCH /api/contacts/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const contact = await Contact.findOne({ _id: req.params.id, organizationId: await orgId(req) });
  if (!contact) throw new NotFoundError("Contact");

  const body = { ...(req.body || {}) };
  sanitizeContactPayload(body, contact.taxTreatment);

  const previousOpeningBalance = Number(contact.openingBalance || 0);
  const previousContactType = String(contact.contactType || "");

  const allowed = [
    "displayName", "companyName", "email", "phone", "mobile", "currency",
    "salutation", "firstName", "lastName", "language",
    "paymentTermsId", "accountsPayableId", "accountsReceivableId", "openingBalance",
    "taxTreatment", "taxPreference", "exemptionReason", "placeOfSupply",
    "businessLegalName", "businessTradeName",
    "taxId", "gstin", "pan", "tdsCategory", "msmeRegistered",
    "billingAddress", "shippingAddress",
    "contactPersons", "bankDetails",
    "notes", "portalEnabled",
    "reportingTags", "creditLimit", "salesPersonId",
    "isActive", "contactType",
    "websiteUrl", "department", "designation", "twitterHandle", "skypeName", "facebookUrl",
    "linkedContactId", "statementTemplate", "documents",
  ];
  allowed.forEach((f) => { if (body[f] !== undefined) (contact as any)[f] = body[f]; });
  attachUser(contact, req);
  await contact.save();

  const shouldResyncOpening =
    body.openingBalance !== undefined ||
    body.contactType !== undefined ||
    body.accountsPayableId !== undefined ||
    body.accountsReceivableId !== undefined;

  if (shouldResyncOpening) {
    const nextOpeningBalance = Number(contact.openingBalance || 0);
    const nextContactType = String(contact.contactType || "");
    const force =
      body.contactType !== undefined ||
      body.accountsPayableId !== undefined ||
      body.accountsReceivableId !== undefined;

    if (nextContactType === "Customer") {
      await syncVendorOpeningBalance(contact, 0, previousOpeningBalance, req, force || previousContactType !== "Customer");
      await syncCustomerOpeningBalance(contact, nextOpeningBalance, previousOpeningBalance, req, force);
    } else if (nextContactType === "Vendor" || nextContactType === "Both") {
      await syncCustomerOpeningBalance(contact, 0, previousOpeningBalance, req, force || previousContactType === "Customer");
      await syncVendorOpeningBalance(contact, nextOpeningBalance, previousOpeningBalance, req, force);
    } else {
      await syncVendorOpeningBalance(contact, 0, previousOpeningBalance, req, true);
      await syncCustomerOpeningBalance(contact, 0, previousOpeningBalance, req, true);
    }
  }

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

// ─── Import Wizard ─────────────────────────────────────────────────────────

function toFiniteNumber(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getContactTemplatePath(fileName: string): string {
  const isVendor = fileName.includes("vendor");
  const isCustomer = fileName.includes("customer");
  const subFolder = isVendor ? "vendors" : (isCustomer ? "customers" : "contacts");

  const paths = [
    path.join(process.cwd(), "src", "files", subFolder, fileName),
    path.join(process.cwd(), "files", subFolder, fileName),
    path.join(__dirname, "..", "files", subFolder, fileName),
    path.join(__dirname, "..", "..", "src", "files", subFolder, fileName),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Template file ${fileName} not found in ${subFolder}`);
}

const PLACE_OF_SUPPLY_OPTIONS = [
  { code: "AN", label: "Andaman and Nicobar Islands" },
  { code: "AD", label: "Andhra Pradesh" },
  { code: "AR", label: "Arunachal Pradesh" },
  { code: "AS", label: "Assam" },
  { code: "BR", label: "Bihar" },
  { code: "CH", label: "Chandigarh" },
  { code: "CG", label: "Chhattisgarh" },
  { code: "DN", label: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DD", label: "Daman and Diu" },
  { code: "DL", label: "Delhi" },
  { code: "FC", label: "Foreign Country" },
  { code: "GA", label: "Goa" },
  { code: "GJ", label: "Gujarat" },
  { code: "HR", label: "Haryana" },
  { code: "HP", label: "Himachal Pradesh" },
  { code: "JK", label: "Jammu and Kashmir" },
  { code: "JH", label: "Jharkhand" },
  { code: "KA", label: "Karnataka" },
  { code: "KL", label: "Kerala" },
  { code: "LA", label: "Ladakh" },
  { code: "LD", label: "Lakshadweep" },
  { code: "MP", label: "Madhya Pradesh" },
  { code: "MH", label: "Maharashtra" },
  { code: "MN", label: "Manipur" },
  { code: "ML", label: "Meghalaya" },
  { code: "MZ", label: "Mizoram" },
  { code: "NL", label: "Nagaland" },
  { code: "OD", label: "Odisha" },
  { code: "OT", label: "Other Territory" },
  { code: "PY", label: "Puducherry" },
  { code: "PB", label: "Punjab" },
  { code: "RJ", label: "Rajasthan" },
  { code: "SK", label: "Sikkim" },
  { code: "TN", label: "Tamil Nadu" },
  { code: "TS", label: "Telangana" },
  { code: "TR", label: "Tripura" },
  { code: "UP", label: "Uttar Pradesh" },
  { code: "UK", label: "Uttarakhand" },
  { code: "WB", label: "West Bengal" },
];

function normalizePlaceOfSupply(value: unknown): string {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  const foundByCode = PLACE_OF_SUPPLY_OPTIONS.find(opt => opt.code === raw);
  if (foundByCode) return foundByCode.code;

  const bracketMatch = raw.match(/^\[([A-Z]{2})\]/);
  if (bracketMatch && bracketMatch[1]) {
    const code = bracketMatch[1];
    const found = PLACE_OF_SUPPLY_OPTIONS.find(opt => opt.code === code);
    if (found) return found.code;
  }

  const foundByLabel = PLACE_OF_SUPPLY_OPTIONS.find(opt => opt.label.toUpperCase() === raw || opt.label.toUpperCase().includes(raw));
  if (foundByLabel) return foundByLabel.code;

  return "";
}

function normalizeLanguage(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "english" || raw === "en") return "en";
  if (raw === "hindi" || raw === "hi") return "hi";
  if (raw === "bengali" || raw === "bn") return "bn";
  if (raw === "tamil" || raw === "ta") return "ta";
  if (raw === "telugu" || raw === "te") return "te";
  if (raw === "marathi" || raw === "mr") return "mr";
  if (raw === "gujarati" || raw === "gu") return "gu";
  return "en";
}

function toBoolean(value: unknown): boolean {
  if (!value) return false;
  const str = String(value).trim().toLowerCase();
  return str === "yes" || str === "true" || str === "1";
}

const TDS_CATEGORIES = [
  { id: "comm-2", label: "Commission or Brokerage" },
  { id: "comm-r-3.75", label: "Commission or Brokerage (Reduced)" },
  { id: "div-10", label: "Dividend" },
  { id: "div-r-7.5", label: "Dividend (Reduced)" },
  { id: "int-10", label: "Other Interest than securities" },
  { id: "int-r-7.5", label: "Other Interest than securities (Reduced)" },
  { id: "con-oth-2", label: "Payment of contractors for Others" },
  { id: "con-oth-r-1.5", label: "Payment of contractors for Others (Reduced)" },
  { id: "con-ind-1", label: "Payment of contractors HUF/Indiv" },
  { id: "con-ind-r-0.75", label: "Payment of contractors HUF/Indiv (Reduced)" },
  { id: "prof-10", label: "Professional Fees" },
  { id: "prof-r-7.5", label: "Professional Fees (Reduced)" },
  { id: "rent-10", label: "Rent on land or furniture etc" },
  { id: "rent-r-7.5", label: "Rent on land or furniture etc (Reduced)" },
  { id: "tech-2", label: "Technical Fees (2%)" },
];

function normalizeTdsCategory(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const found = TDS_CATEGORIES.find(
    (tc) => tc.id.toLowerCase() === raw || tc.label.toLowerCase() === raw || tc.label.toLowerCase().includes(raw)
  );
  return found ? found.id : "";
}

export async function mapRowToContact(
  row: Record<string, any>,
  mapping: Record<string, string>,
  organizationId: any,
  duplicateHandling: "skip" | "overwrite",
  defaultContactType: "Customer" | "Vendor" = "Customer"
): Promise<{ contactData: any; isValid: boolean; status: "Ready" | "Overwrite" | "Skip" | "Error"; error?: string; duplicateContact?: any }> {
  const getMappedValue = (key: string): string => {
    const colName = mapping[key];
    if (!colName) return "";
    return String(row[colName] ?? "").trim();
  };

  const displayName = getMappedValue("displayName");
  if (!displayName) {
    return {
      contactData: {},
      isValid: false,
      status: "Error",
      error: "Display Name is required",
    };
  }

  // contactType validation: Customer, Vendor, Both
  let contactType = getMappedValue("contactType");
  if (!contactType) {
    contactType = defaultContactType; // fallback default
  }
  const typeLower = contactType.toLowerCase();
  if (typeLower.includes("vendor")) contactType = "Vendor";
  else if (typeLower.includes("both")) contactType = "Both";
  else contactType = "Customer";

  // Check duplicate
  let duplicateContact = await Contact.findOne({
    organizationId,
    displayName: { $regex: new RegExp("^" + escapeRegex(displayName) + "$", "i") },
    isDeleted: false,
  });

  let status: "Ready" | "Overwrite" | "Skip" | "Error" = "Ready";
  if (duplicateContact) {
    status = duplicateHandling === "overwrite" ? "Overwrite" : "Skip";
  }

  const taxTreatment = normalizeTaxTreatment(getMappedValue("taxTreatment"));
  const taxPreference = normalizeTaxPreference(getMappedValue("taxPreference"), taxTreatment);

  // Resolve references by name
  let accountsReceivableId: any = undefined;
  const accountsReceivableName = getMappedValue("accountsReceivableAccount");
  if (accountsReceivableName) {
    const acc = await Account.findOne({
      organizationId,
      name: { $regex: new RegExp("^" + escapeRegex(accountsReceivableName) + "$", "i") },
      isDeleted: false
    });
    if (acc) accountsReceivableId = acc._id;
  }

  let accountsPayableId: any = undefined;
  const accountsPayableName = getMappedValue("accountsPayableAccount");
  if (accountsPayableName) {
    const acc = await Account.findOne({
      organizationId,
      name: { $regex: new RegExp("^" + escapeRegex(accountsPayableName) + "$", "i") },
      isDeleted: false
    });
    if (acc) accountsPayableId = acc._id;
  }

  let paymentTermsId: any = undefined;
  const paymentTermsName = getMappedValue("paymentTerms");
  if (paymentTermsName) {
    const pt = await PaymentTerms.findOne({
      organizationId,
      name: { $regex: new RegExp("^" + escapeRegex(paymentTermsName) + "$", "i") }
    });
    if (pt) paymentTermsId = pt._id;
  }

  let salesPersonId: any = undefined;
  const salesPersonName = getMappedValue("salesPerson");
  if (salesPersonName) {
    const sp = await SalesPerson.findOne({
      organizationId,
      name: { $regex: new RegExp("^" + escapeRegex(salesPersonName) + "$", "i") }
    });
    if (sp) salesPersonId = sp._id;
  }

  const contactData: any = {
    organizationId,
    contactType,
    displayName,
    salutation: getMappedValue("salutation"),
    firstName: getMappedValue("firstName"),
    lastName: getMappedValue("lastName"),
    companyName: getMappedValue("companyName"),
    email: getMappedValue("email"),
    phone: getMappedValue("phone"),
    mobile: getMappedValue("mobile"),
    language: normalizeLanguage(getMappedValue("language")),
    pan: getMappedValue("pan"),
    gstin: getMappedValue("gstin"),
    businessLegalName: getMappedValue("businessLegalName"),
    businessTradeName: getMappedValue("businessTradeName"),
    taxTreatment,
    taxPreference,
    exemptionReason: getMappedValue("exemptionReason"),
    placeOfSupply: normalizePlaceOfSupply(getMappedValue("placeOfSupply")),
    currency: getMappedValue("currency") || "INR",
    openingBalance: toFiniteNumber(getMappedValue("openingBalance")),
    accountsReceivableId,
    accountsPayableId,
    paymentTermsId,
    salesPersonId,
    portalEnabled: toBoolean(getMappedValue("portalEnabled")),
    creditLimit: toFiniteNumber(getMappedValue("creditLimit")),
    msmeRegistered: toBoolean(getMappedValue("msmeRegistered")),
    tdsCategory: normalizeTdsCategory(getMappedValue("tdsCategory")),
    websiteUrl: getMappedValue("websiteUrl"),
    department: getMappedValue("department"),
    designation: getMappedValue("designation"),
    twitterHandle: getMappedValue("twitterHandle"),
    skypeName: getMappedValue("skypeName"),
    facebookUrl: getMappedValue("facebookUrl"),
    notes: getMappedValue("notes"),
    billingAddress: {
      attention: getMappedValue("billingAttention"),
      street: getMappedValue("billingStreet"),
      street2: getMappedValue("billingStreet2"),
      city: getMappedValue("billingCity"),
      state: getMappedValue("billingState"),
      zip: getMappedValue("billingZip"),
      country: getMappedValue("billingCountry"),
      phone: getMappedValue("billingPhone"),
      fax: getMappedValue("billingFax"),
    },
    shippingAddress: {
      attention: getMappedValue("shippingAttention"),
      street: getMappedValue("shippingStreet"),
      street2: getMappedValue("shippingStreet2"),
      city: getMappedValue("shippingCity"),
      state: getMappedValue("shippingState"),
      zip: getMappedValue("shippingZip"),
      country: getMappedValue("shippingCountry"),
      phone: getMappedValue("shippingPhone"),
      fax: getMappedValue("shippingFax"),
    },
    isActive: true,
  };

  const cpSalutation = getMappedValue("contactPersonSalutation");
  const cpFirstName = getMappedValue("contactPersonFirstName");
  const cpLastName = getMappedValue("contactPersonLastName");
  const cpEmail = getMappedValue("contactPersonEmail");
  const cpPhone = getMappedValue("contactPersonPhone");
  const cpMobile = getMappedValue("contactPersonMobile");

  if (cpSalutation || cpFirstName || cpLastName || cpEmail || cpPhone || cpMobile) {
    const name = [cpFirstName, cpLastName].filter(Boolean).join(" ") || "Contact";
    contactData.contactPersons = [{
      salutation: cpSalutation,
      firstName: cpFirstName,
      lastName: cpLastName,
      name,
      email: cpEmail,
      workPhone: cpPhone,
      mobile: cpMobile,
      isPrimary: true
    }];
  }

  const bankName = getMappedValue("bankName");
  const accountNumber = getMappedValue("bankAccountNumber") || getMappedValue("accountNumber");
  const accountHolderName = getMappedValue("bankAccountHolderName") || getMappedValue("accountHolderName");
  const ifscCode = getMappedValue("bankIfscCode") || getMappedValue("ifscCode");
  const branchName = getMappedValue("bankBranchName") || getMappedValue("branchName");
  const upiId = getMappedValue("bankUpiId") || getMappedValue("upiId");

  if (bankName || accountNumber || accountHolderName || ifscCode || branchName || upiId) {
    contactData.bankDetails = [{
      bankName,
      accountNumber,
      accountHolderName,
      ifscCode,
      branchName,
      upiId,
      isPrimary: true
    }];
  }

  sanitizeContactPayload(contactData);

  return {
    contactData,
    isValid: true,
    status,
    duplicateContact,
  };
}

export const downloadSampleTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const type = (req.query.type as string || "customer").toLowerCase();
  const templateName = type === "vendor" ? "sample_vendors.csv" : "sample_customers.csv";
  const filePath = getContactTemplatePath(templateName);

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${type === "vendor" ? "sample_vendors.xlsx" : "sample_customers.xlsx"}`);
    res.send(buffer);
  } else {
    res.download(filePath, type === "vendor" ? "sample_vendors.csv" : "sample_customers.csv");
  }
});

export const downloadBlankTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const format = req.query.format;
  const type = (req.query.type as string || "customer").toLowerCase();
  const templateName = type === "vendor" ? "blank_vendors.csv" : "blank_customers.csv";
  const filePath = getContactTemplatePath(templateName);

  if (format === "excel" || format === "xlsx") {
    const workbook = XLSX.readFile(filePath);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${type === "vendor" ? "blank_vendors.xlsx" : "blank_customers.xlsx"}`);
    res.send(buffer);
  } else {
    res.download(filePath, type === "vendor" ? "blank_vendors.csv" : "blank_customers.csv");
  }
});

export const previewImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = await orgId(req);
  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";
  const defaultContactType = (req.body.defaultContactType || "Customer") as "Customer" | "Vendor";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  const previewItems: any[] = [];
  let readyCount = 0;
  let overwriteCount = 0;
  let skipCount = 0;
  let invalidCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const result = await mapRowToContact(row, mapping, organizationId, duplicateHandling, defaultContactType);
    if (!result.isValid) {
      invalidCount++;
      previewItems.push({
        rowNumber: rowNum,
        displayName: "",
        companyName: "",
        contactType: "Customer",
        email: "",
        openingBalance: 0,
        isValid: false,
        status: "Error",
        error: result.error,
      });
    } else {
      if (result.status === "Ready") readyCount++;
      else if (result.status === "Overwrite") overwriteCount++;
      else if (result.status === "Skip") skipCount++;

      previewItems.push({
        rowNumber: rowNum,
        displayName: result.contactData.displayName,
        companyName: result.contactData.companyName,
        contactType: result.contactData.contactType,
        email: result.contactData.email,
        openingBalance: result.contactData.openingBalance,
        isValid: true,
        status: result.status,
      });
    }
  }

  res.json({
    success: true,
    data: {
      totalRows: rows.length,
      readyCount,
      overwriteCount,
      skipCount,
      invalidCount,
      previewItems,
    },
  });
});

export const executeImport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = await orgId(req);
  if (!req.file) throw new ValidationError("No file uploaded");

  let mapping: Record<string, string>;
  try {
    mapping = typeof req.body.mapping === "string" ? JSON.parse(req.body.mapping) : req.body.mapping;
    if (!mapping || typeof mapping !== "object") throw new Error();
  } catch {
    throw new ValidationError("Mapping is required and must be a valid JSON object");
  }

  const duplicateHandling = (req.body.duplicateHandling || "skip") as "skip" | "overwrite";
  const defaultContactType = (req.body.defaultContactType || "Customer") as "Customer" | "Vendor";

  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  let successCount = 0;
  let failCount = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    try {
      const result = await mapRowToContact(row, mapping, organizationId, duplicateHandling, defaultContactType);
      if (!result.isValid) {
        throw new Error(result.error);
      }

      if (result.status === "Skip") {
        successCount++;
        continue;
      }

      if (result.status === "Overwrite") {
        const contact = result.duplicateContact;
        const previousOpeningBalance = Number(contact.openingBalance || 0);
        const previousContactType = String(contact.contactType || "");

        // Merge properties
        Object.assign(contact, result.contactData);
        attachUser(contact, req);
        await contact.save();

        // Resync opening balance
        const nextOpeningBalance = Number(contact.openingBalance || 0);
        const nextContactType = String(contact.contactType || "");
        if (nextContactType === "Customer") {
          await syncVendorOpeningBalance(contact, 0, previousOpeningBalance, req, true);
          await syncCustomerOpeningBalance(contact, nextOpeningBalance, previousOpeningBalance, req, true);
        } else if (nextContactType === "Vendor" || nextContactType === "Both") {
          await syncCustomerOpeningBalance(contact, 0, previousOpeningBalance, req, true);
          await syncVendorOpeningBalance(contact, nextOpeningBalance, previousOpeningBalance, req, true);
        }
      } else {
        // Create new contact
        const contact = new Contact(result.contactData);
        attachUser(contact, req);
        await contact.save();

        const ob = Number(contact.openingBalance || 0);
        if (Math.abs(ob) >= 0.01 && contact.contactType === "Customer") {
          await syncCustomerOpeningBalance(contact, ob, 0, req);
        } else if (Math.abs(ob) >= 0.01 && (contact.contactType === "Vendor" || contact.contactType === "Both")) {
          await syncVendorOpeningBalance(contact, ob, 0, req);
        }
      }

      successCount++;
    } catch (err: any) {
      failCount++;
      errors.push({ row: rowNum, error: err.message || "Failed to process row" });
    }
  }

  res.json({
    success: true,
    data: {
      successCount,
      failCount,
      errors,
    },
  });
});
