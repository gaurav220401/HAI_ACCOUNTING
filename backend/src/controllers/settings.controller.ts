import { Response } from "express";
import Tax from "../models/tax.model";
import PaymentTerms from "../models/payment-terms.model";
import Warehouse from "../models/warehouse.model";
import SalesPerson from "../models/sales-person.model";
import PaymentMode from "../models/payment-mode.model";
import ExpenseCategory from "../models/expense-category.model";
import ReportingTag from "../models/reporting-tag.model";
import PriceList from "../models/price-list.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

// ─── Generic CRUD factory ─────────────────────────────────────────────────

function makeCRUD<T extends any>(Model: any, label: string, allowedFields: string[]) {
  return {
    list: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const items = await Model.find({ organizationId: orgId(req) }).sort({ name: 1 }).lean();
      res.json({ success: true, data: items });
    }),
    getOne: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const item = await Model.findOne({ _id: req.params.id, organizationId: orgId(req) });
      if (!item) throw new NotFoundError(label);
      res.json({ success: true, data: item });
    }),
    create: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (!req.body.name) throw new ValidationError("name is required");
      const item = new Model({ organizationId: orgId(req), ...req.body });
      if (item.attachUser) attachUser(item, req);
      else if (typeof (item as any).createdBy !== "undefined") {
        try { attachUser(item, req); } catch { /* no audit plugin */ }
      }
      await item.save();
      res.status(201).json({ success: true, data: item });
    }),
    update: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const item = await Model.findOne({ _id: req.params.id, organizationId: orgId(req) });
      if (!item) throw new NotFoundError(label);
      allowedFields.forEach((f) => { if (req.body[f] !== undefined) (item as any)[f] = req.body[f]; });
      try { attachUser(item, req); } catch { /* no audit plugin */ }
      await item.save();
      res.json({ success: true, data: item });
    }),
    remove: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const item = await Model.findOne({ _id: req.params.id, organizationId: orgId(req) });
      if (!item) throw new NotFoundError(label);
      // soft delete if field exists, else hard delete
      if ((item as any).isDeleted !== undefined) {
        (item as any).isDeleted = true;
        (item as any).deletedAt = new Date();
        await item.save();
      } else {
        await item.deleteOne();
      }
      res.json({ success: true, message: `${label} deleted` });
    }),
  };
}

// ─── Tax ──────────────────────────────────────────────────────────────────

export const taxCRUD = makeCRUD(Tax, "Tax", [
  "name", "taxType", "rate", "taxAuthority", "components", "isCompound", "description", "isActive",
]);

export const seedTaxes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await Tax.countDocuments({ organizationId: organization });
  if (existing > 0) return res.json({ success: true, message: "Taxes already exist" });

  const taxes = [
    // Simple taxes
    { name: "CGST 2.5%", taxType: "Tax", rate: 2.5, description: "Central GST 2.5% (for 5% slab)" },
    { name: "SGST 2.5%", taxType: "Tax", rate: 2.5, description: "State GST 2.5% (for 5% slab)" },
    { name: "IGST 5%", taxType: "Tax", rate: 5, description: "Integrated GST 5%" },
    { name: "CGST 6%", taxType: "Tax", rate: 6, description: "Central GST 6% (for 12% slab)" },
    { name: "SGST 6%", taxType: "Tax", rate: 6, description: "State GST 6% (for 12% slab)" },
    { name: "IGST 12%", taxType: "Tax", rate: 12, description: "Integrated GST 12%" },
    { name: "CGST 9%", taxType: "Tax", rate: 9, description: "Central GST 9% (for 18% slab)" },
    { name: "SGST 9%", taxType: "Tax", rate: 9, description: "State GST 9% (for 18% slab)" },
    { name: "IGST 18%", taxType: "Tax", rate: 18, description: "Integrated GST 18%" },
    { name: "CGST 14%", taxType: "Tax", rate: 14, description: "Central GST 14% (for 28% slab)" },
    { name: "SGST 14%", taxType: "Tax", rate: 14, description: "State GST 14% (for 28% slab)" },
    { name: "IGST 28%", taxType: "Tax", rate: 28, description: "Integrated GST 28%" },
    { name: "Exempt (0%)", taxType: "Tax", rate: 0, description: "Tax exempt" },
  ];

  await Tax.insertMany(
    taxes.map((t) => ({ organizationId: organization, ...t, isSystemTax: true, isActive: true }))
  );
  res.status(201).json({ success: true, message: "Default GST taxes created" });
});

// ─── Payment Terms ─────────────────────────────────────────────────────────

export const paymentTermsCRUD = makeCRUD(PaymentTerms, "Payment Terms", [
  "name", "netDays", "discountPercentage", "discountDays", "isDefault",
]);

export const seedPaymentTerms = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await PaymentTerms.countDocuments({ organizationId: organization });
  if (existing > 0) return res.json({ success: true, message: "Payment terms already exist" });

  const terms = [
    { name: "Due on Receipt", netDays: 0, discountPercentage: 0, discountDays: 0, isDefault: true },
    { name: "Net 15", netDays: 15, discountPercentage: 0, discountDays: 0 },
    { name: "Net 30", netDays: 30, discountPercentage: 0, discountDays: 0 },
    { name: "Net 45", netDays: 45, discountPercentage: 0, discountDays: 0 },
    { name: "Net 60", netDays: 60, discountPercentage: 0, discountDays: 0 },
    { name: "Net 90", netDays: 90, discountPercentage: 0, discountDays: 0 },
    { name: "2/10 Net 30", netDays: 30, discountPercentage: 2, discountDays: 10 },
  ];

  await PaymentTerms.insertMany(
    terms.map((t) => ({ organizationId: organization, ...t, isSystemTerm: true }))
  );
  res.status(201).json({ success: true, message: "Default payment terms created" });
});

// ─── Warehouse ─────────────────────────────────────────────────────────────

export const warehouseCRUD = makeCRUD(Warehouse, "Warehouse", [
  "name", "address", "isPrimary", "isActive",
]);

// ─── Sales Person ──────────────────────────────────────────────────────────

export const salesPersonCRUD = makeCRUD(SalesPerson, "Sales Person", [
  "name", "email", "phone", "commissionRate", "isActive",
]);

// ─── Payment Mode ──────────────────────────────────────────────────────────

export const paymentModeCRUD = makeCRUD(PaymentMode, "Payment Mode", [
  "name", "accountId", "isActive",
]);

export const seedPaymentModes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await PaymentMode.countDocuments({ organizationId: organization });
  if (existing > 0) return res.json({ success: true, message: "Payment modes already exist" });

  const modes = [
    "Cash", "Bank Transfer", "Credit Card", "Debit Card",
    "UPI", "NEFT", "RTGS", "IMPS", "Cheque", "Demand Draft",
  ];
  await PaymentMode.insertMany(
    modes.map((name) => ({ organizationId: organization, name, isSystemMode: true }))
  );
  res.status(201).json({ success: true, message: "Default payment modes created" });
});

// ─── Expense Category ──────────────────────────────────────────────────────

export const expenseCategoryCRUD = makeCRUD(ExpenseCategory, "Expense Category", [
  "name", "accountId", "description", "isActive",
]);

export const seedExpenseCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await ExpenseCategory.countDocuments({ organizationId: organization });
  if (existing > 0) return res.json({ success: true, message: "Expense categories already exist" });

  const cats = [
    "Travel", "Meals & Entertainment", "Office Supplies", "Utilities",
    "Communication", "Advertising & Marketing", "Professional Services",
    "Rent", "Repairs & Maintenance", "Insurance", "Vehicle", "Technology",
  ];
  await ExpenseCategory.insertMany(
    cats.map((name) => ({ organizationId: organization, name }))
  );
  res.status(201).json({ success: true, message: "Default expense categories created" });
});

// ─── Reporting Tag ─────────────────────────────────────────────────────────

export const reportingTagCRUD = makeCRUD(ReportingTag, "Reporting Tag", [
  "name", "description", "color", "isActive",
]);

// ─── Price List ────────────────────────────────────────────────────────────

export const priceListCRUD = makeCRUD(PriceList, "Price List", [
  "name", "priceListType", "currency", "items", "effectiveFrom", "effectiveTo", "isActive",
]);
