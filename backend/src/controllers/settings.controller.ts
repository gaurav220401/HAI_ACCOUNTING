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
import Invoice from "../models/invoice.model";
import Bill from "../models/bill.model";
import SalesOrder from "../models/sales-order.model";
import PurchaseOrder from "../models/purchase-order.model";
import Quote from "../models/quote.model";
import DeliveryChallan from "../models/delivery-challan.model";
import CreditNote from "../models/credit-note.model";
import VendorCredit from "../models/vendor-credit.model";
import PaymentReceived from "../models/payment-received.model";
import PaymentMade from "../models/payment-made.model";
import Expense from "../models/expense.model";
import GlEntry from "../models/gl-entry.model";
import Item from "../models/item.model";
import Contact from "../models/contact.model";
import Account from "../models/account.model";
import { Counter } from "../models/counter.model";
import Package from "../models/package.model";
import PurchaseReceive from "../models/purchase-receive.model";
import InventoryAdjustment from "../models/inventory-adjustment.model";
import Journal from "../models/journal.model";
import RetainerInvoice from "../models/retainer-invoice.model";
import RecurringInvoice from "../models/recurring-invoice.model";
import RecurringBill from "../models/recurring-bill.model";
import RecurringExpense from "../models/recurring-expense.model";
import FixedAsset from "../models/fixed-asset.model";
import Putaway from "../models/putaway.model";
import MoveOrder from "../models/move-order.model";
import PaymentInvoiceMap from "../models/payment-invoice-map.model";
import PaymentBillMap from "../models/payment-bill-map.model";
import CreditNoteApplication from "../models/credit-note-application.model";
import VendorCreditApplication from "../models/vendor-credit-application.model";
import Project from "../models/Project";
import TimeLog from "../models/TimeLog";
import TimesheetEntry from "../models/TimesheetEntry";
import Document from "../models/document.model";
import DocumentFolder from "../models/document-folder.model";
import CurrencyAdjustment from "../models/currency-adjustment.model";
import Unit from "../models/unit.model";
import TdsTax from "../models/tds-tax.model";
import TcsTax from "../models/tcs-tax.model";
import ItemGroup from "../models/item-group.model";
import FixedAssetType from "../models/fixed-asset-type.model";
import ExchangeRate from "../models/exchange-rate.model";
import JournalNumberingPreference from "../models/journal-numbering-preference.model";
import IdempotencyKey from "../models/idempotency-key.model";

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

async function ensureDefaultTaxes(organization: any) {
  let insertedCount = 0;

  // ── Step 1: Ensure individual base taxes exist ──────────────────────────
  const baseTaxes = [
    // Zero-rated
    { name: "CGST 0%", taxType: "Tax", rate: 0, description: "Central GST 0%", taxAuthority: "CGST" },
    { name: "SGST 0%", taxType: "Tax", rate: 0, description: "State GST 0%", taxAuthority: "SGST" },
    { name: "IGST0", taxType: "Tax", rate: 0, description: "Integrated GST 0%", taxAuthority: "IGST" },
    // 5% slab
    { name: "CGST 2.5%", taxType: "Tax", rate: 2.5, description: "Central GST 2.5% (for 5% slab)", taxAuthority: "CGST" },
    { name: "SGST 2.5%", taxType: "Tax", rate: 2.5, description: "State GST 2.5% (for 5% slab)", taxAuthority: "SGST" },
    { name: "IGST5", taxType: "Tax", rate: 5, description: "Integrated GST 5%", taxAuthority: "IGST" },
    // 12% slab
    { name: "CGST 6%", taxType: "Tax", rate: 6, description: "Central GST 6% (for 12% slab)", taxAuthority: "CGST" },
    { name: "SGST 6%", taxType: "Tax", rate: 6, description: "State GST 6% (for 12% slab)", taxAuthority: "SGST" },
    { name: "IGST12", taxType: "Tax", rate: 12, description: "Integrated GST 12%", taxAuthority: "IGST" },
    // 18% slab
    { name: "CGST 9%", taxType: "Tax", rate: 9, description: "Central GST 9% (for 18% slab)", taxAuthority: "CGST" },
    { name: "SGST 9%", taxType: "Tax", rate: 9, description: "State GST 9% (for 18% slab)", taxAuthority: "SGST" },
    { name: "IGST18", taxType: "Tax", rate: 18, description: "Integrated GST 18%", taxAuthority: "IGST" },
    // 28% slab
    { name: "CGST 14%", taxType: "Tax", rate: 14, description: "Central GST 14% (for 28% slab)", taxAuthority: "CGST" },
    { name: "SGST 14%", taxType: "Tax", rate: 14, description: "State GST 14% (for 28% slab)", taxAuthority: "SGST" },
    { name: "IGST28", taxType: "Tax", rate: 28, description: "Integrated GST 28%", taxAuthority: "IGST" },
  ];

  for (const tax of baseTaxes) {
    const result = await Tax.updateOne(
      { organizationId: organization, name: tax.name },
      {
        $setOnInsert: {
          organizationId: organization,
          ...tax,
          isSystemTax: true,
          isActive: true,
        },
      },
      { upsert: true },
    );
    insertedCount += result.upsertedCount || 0;
  }

  // ── Step 2: Build lookup map for tax-group components ──────────────────
  const componentNames = [
    "CGST 0%", "SGST 0%",
    "CGST 2.5%", "SGST 2.5%",
    "CGST 6%", "SGST 6%",
    "CGST 9%", "SGST 9%",
    "CGST 14%", "SGST 14%",
  ];

  const componentDocs = await Tax.find({
    organizationId: organization,
    name: { $in: componentNames },
  })
    .select("_id name")
    .lean();

  const componentIdByName: Record<string, any> = {};
  for (const doc of componentDocs) {
    componentIdByName[(doc as any).name] = (doc as any)._id;
  }

  // ── Step 3: Ensure GST tax groups exist (for intra-state selection) ─────
  const taxGroups = [
    { name: "GST0", rate: 0, cgst: "CGST 0%", sgst: "SGST 0%" },
    { name: "GST5", rate: 5, cgst: "CGST 2.5%", sgst: "SGST 2.5%" },
    { name: "GST12", rate: 12, cgst: "CGST 6%", sgst: "SGST 6%" },
    { name: "GST18", rate: 18, cgst: "CGST 9%", sgst: "SGST 9%" },
    { name: "GST28", rate: 28, cgst: "CGST 14%", sgst: "SGST 14%" },
  ];

  for (const group of taxGroups) {
    const cgstId = componentIdByName[group.cgst];
    const sgstId = componentIdByName[group.sgst];
    if (!cgstId || !sgstId) continue;

    const result = await Tax.updateOne(
      { organizationId: organization, name: group.name },
      {
        $setOnInsert: {
          organizationId: organization,
          name: group.name,
          taxType: "TaxGroup",
          rate: group.rate,
          components: [
            { taxId: cgstId, rate: group.rate / 2 },
            { taxId: sgstId, rate: group.rate / 2 },
          ],
          description: `${group.name} [${group.rate}%] - Intra-state supply`,
          taxAuthority: "GST",
          isSystemTax: true,
          isActive: true,
        },
      },
      { upsert: true },
    );
    insertedCount += result.upsertedCount || 0;
  }

  return insertedCount > 0;
}

async function ensureDefaultPaymentTerms(organization: any) {
  const permanentTerms = [
    { name: "Due end of next month", termType: "end_of_next_month", netDays: 0, discountPercentage: 0, discountDays: 0, isSystemTerm: true, isPermanent: true },
    { name: "Due end of the month", termType: "end_of_month", netDays: 0, discountPercentage: 0, discountDays: 0, isSystemTerm: true, isPermanent: true },
  ];

  for (const t of permanentTerms) {
    await PaymentTerms.updateOne(
      { organizationId: organization, name: t.name },
      { $setOnInsert: { organizationId: organization, ...t } },
      { upsert: true },
    );
  }

  const nonPermanentCount = await PaymentTerms.countDocuments({ organizationId: organization, isPermanent: false });
  if (nonPermanentCount > 0) return false;

  const editableTerms = [
    { name: "Due on Receipt", termType: "net_days", netDays: 0, isDefault: true, isSystemTerm: true, isPermanent: false, discountPercentage: 0, discountDays: 0 },
    { name: "Net 15", termType: "net_days", netDays: 15, isDefault: false, isSystemTerm: true, isPermanent: false, discountPercentage: 0, discountDays: 0 },
    { name: "Net 30", termType: "net_days", netDays: 30, isDefault: false, isSystemTerm: true, isPermanent: false, discountPercentage: 0, discountDays: 0 },
    { name: "Net 45", termType: "net_days", netDays: 45, isDefault: false, isSystemTerm: true, isPermanent: false, discountPercentage: 0, discountDays: 0 },
    { name: "Net 60", termType: "net_days", netDays: 60, isDefault: false, isSystemTerm: true, isPermanent: false, discountPercentage: 0, discountDays: 0 },
  ];

  await PaymentTerms.insertMany(editableTerms.map((t) => ({ organizationId: organization, ...t })));
  return true;
}

async function ensureDefaultPaymentModes(organization: any) {
  const existing = await PaymentMode.countDocuments({ organizationId: organization });
  if (existing > 0) return false;

  const modes = [
    "Cash", "Bank Transfer", "Credit Card", "Debit Card",
    "UPI", "NEFT", "RTGS", "IMPS", "Cheque", "Demand Draft",
  ];

  await PaymentMode.insertMany(
    modes.map((name) => ({ organizationId: organization, name, isSystemMode: true })),
  );
  return true;
}

async function ensureDefaultExpenseCategories(organization: any) {
  const existing = await ExpenseCategory.countDocuments({ organizationId: organization });
  if (existing > 0) return false;

  const categories = [
    "Travel", "Meals & Entertainment", "Office Supplies", "Utilities",
    "Communication", "Advertising & Marketing", "Professional Services",
    "Rent", "Repairs & Maintenance", "Insurance", "Vehicle", "Technology",
  ];

  await ExpenseCategory.insertMany(
    categories.map((name) => ({ organizationId: organization, name })),
  );
  return true;
}

// ─── Tax ──────────────────────────────────────────────────────────────────

const baseTaxCRUD = makeCRUD(Tax, "Tax", [
  "name", "taxType", "rate", "taxAuthority", "components", "isCompound", "description", "isActive",
]);

export const taxCRUD = {
  ...baseTaxCRUD,
  list: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const organization = orgId(req);
    await ensureDefaultTaxes(organization);
    const items = await Tax.find({ organizationId: organization }).sort({ name: 1 }).lean();
    res.json({ success: true, data: items });
  }),
};

export const seedTaxes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const seeded = await ensureDefaultTaxes(organization);
  if (!seeded) return res.json({ success: true, message: "Default GST taxes already present" });
  res.status(201).json({ success: true, message: "Default GST taxes ensured" });
});

// ─── Payment Terms ─────────────────────────────────────────────────────────

export const paymentTermsCRUD = {
  list: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const organization = orgId(req);
    await ensureDefaultPaymentTerms(organization);
    const terms = await PaymentTerms.find({ organizationId: organization }).sort({ createdAt: 1 }).lean();
    res.json({ success: true, data: terms });
  }),
  getOne: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const item = await PaymentTerms.findOne({ _id: req.params.id, organizationId: orgId(req) });
    if (!item) throw new NotFoundError("Payment Terms");
    res.json({ success: true, data: item });
  }),
  create: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.body.name) throw new ValidationError("name is required");
    const item = await PaymentTerms.create({ organizationId: orgId(req), ...req.body, isPermanent: false });
    res.status(201).json({ success: true, data: item });
  }),
  update: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const item = await PaymentTerms.findOne({ _id: req.params.id, organizationId: orgId(req) });
    if (!item) throw new NotFoundError("Payment Terms");
    if (item.isPermanent) throw new ForbiddenError("This term is locked and cannot be edited");
    const allowed = ["name", "termType", "netDays", "discountPercentage", "discountDays", "isDefault"];
    allowed.forEach((f) => { if (req.body[f] !== undefined) (item as any)[f] = req.body[f]; });
    await item.save();
    res.json({ success: true, data: item });
  }),
  remove: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const item = await PaymentTerms.findOne({ _id: req.params.id, organizationId: orgId(req) });
    if (!item) throw new NotFoundError("Payment Terms");
    if (item.isPermanent) throw new ForbiddenError("This term is locked and cannot be deleted");
    await item.deleteOne();
    res.json({ success: true, message: "Payment term deleted" });
  }),
};

export const seedPaymentTerms = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);

  const seeded = await ensureDefaultPaymentTerms(organization);
  if (!seeded) return res.json({ success: true, message: "Payment terms already exist" });
  res.status(201).json({ success: true, message: "Payment terms seeded" });
});

export const setDefaultPaymentTerm = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const { id } = req.params;
  await PaymentTerms.updateMany({ organizationId: organization }, { isDefault: false });
  const updated = await PaymentTerms.findOneAndUpdate(
    { _id: id, organizationId: organization },
    { isDefault: true },
    { returnDocument: 'after' }
  );
  if (!updated) return res.status(404).json({ success: false, message: "Term not found" });
  res.json({ success: true, data: updated });
});

export const unsetDefaultPaymentTerm = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  await PaymentTerms.updateMany({ organizationId: organization }, { isDefault: false });
  res.json({ success: true, message: "Default cleared" });
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

const basePaymentModeCRUD = makeCRUD(PaymentMode, "Payment Mode", [
  "name", "accountId", "isActive",
]);

export const paymentModeCRUD = {
  ...basePaymentModeCRUD,
  list: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const organization = orgId(req);
    await ensureDefaultPaymentModes(organization);
    const items = await PaymentMode.find({ organizationId: organization }).sort({ name: 1 }).lean();
    res.json({ success: true, data: items });
  }),
};

export const seedPaymentModes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const seeded = await ensureDefaultPaymentModes(organization);
  if (!seeded) return res.json({ success: true, message: "Payment modes already exist" });
  res.status(201).json({ success: true, message: "Default payment modes created" });
});

// ─── Expense Category ──────────────────────────────────────────────────────

const baseExpenseCategoryCRUD = makeCRUD(ExpenseCategory, "Expense Category", [
  "name", "accountId", "description", "isActive",
]);

export const expenseCategoryCRUD = {
  ...baseExpenseCategoryCRUD,
  list: asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const organization = orgId(req);
    await ensureDefaultExpenseCategories(organization);
    const items = await ExpenseCategory.find({ organizationId: organization }).sort({ name: 1 }).lean();
    res.json({ success: true, data: items });
  }),
};

export const seedExpenseCategories = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const seeded = await ensureDefaultExpenseCategories(organization);
  if (!seeded) return res.json({ success: true, message: "Expense categories already exist" });
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

// ─── Reset Organization Data ───────────────────────────────────────────────

export const resetOrganizationData = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  // Security Check: Only allow if explicitly requested with a 'confirm' flag
  // or if in a development-like environment (check for a header or similar if needed)
  if (req.body.confirmReset !== "RESET_ALL_DATA") {
    throw new ValidationError("Please provide the correct confirmation code to reset all data.");
  }

  const query = { organizationId } as any;

  // 1. Transactions & Operational Data
  await Promise.all([
    Invoice.deleteMany(query),
    Bill.deleteMany(query),
    SalesOrder.deleteMany(query),
    PurchaseOrder.deleteMany(query),
    Quote.deleteMany(query),
    DeliveryChallan.deleteMany(query),
    CreditNote.deleteMany(query),
    VendorCredit.deleteMany(query),
    PaymentReceived.deleteMany(query),
    PaymentMade.deleteMany(query),
    Expense.deleteMany(query),
    RetainerInvoice.deleteMany(query),
    RecurringInvoice.deleteMany(query),
    RecurringBill.deleteMany(query),
    RecurringExpense.deleteMany(query),
    Journal.deleteMany(query),
    InventoryAdjustment.deleteMany(query),
    FixedAsset.deleteMany(query),
    Package.deleteMany(query),
    PurchaseReceive.deleteMany(query),
    Putaway.deleteMany(query),
    MoveOrder.deleteMany(query),
    PaymentInvoiceMap.deleteMany({ organization_id: organizationId } as any),
    PaymentBillMap.deleteMany({ organization_id: organizationId } as any),
    CreditNoteApplication.deleteMany(query),
    VendorCreditApplication.deleteMany(query),
    GlEntry.deleteMany(query),
    Project.deleteMany(query),
    TimeLog.deleteMany(query),
    TimesheetEntry.deleteMany(query),
    Document.deleteMany(query),
    DocumentFolder.deleteMany(query),
    CurrencyAdjustment.deleteMany(query),
    Unit.deleteMany(query),
    TdsTax.deleteMany(query),
    TcsTax.deleteMany(query),
    ItemGroup.deleteMany(query),
    FixedAssetType.deleteMany(query),
    ExchangeRate.deleteMany(query),
    JournalNumberingPreference.deleteMany(query),
    IdempotencyKey.deleteMany({ organization_id: organizationId } as any),
  ]);

  // 2. Master Data & Settings (The "Delete All" part)
  await Promise.all([
    Item.deleteMany(query),
    Contact.deleteMany(query),
    Account.deleteMany(query), // Deleting the entire Chart of Accounts
    Tax.deleteMany(query),
    PaymentTerms.deleteMany(query),
    Warehouse.deleteMany(query),
    SalesPerson.deleteMany(query),
    PaymentMode.deleteMany(query),
    ExpenseCategory.deleteMany(query),
    ReportingTag.deleteMany(query),
    PriceList.deleteMany(query),
    Counter.deleteMany(query), // Reset all document numbering
  ]);

  res.json({
    success: true,
    message: "Organization data has been fully reset to initial state.",
  });
});
