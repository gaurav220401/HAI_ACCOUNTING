import { Response } from "express";
import Account from "../models/account.model";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

// ─── Utilities ─────────────────────────────────────────────────────────────

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

// ─── Controllers ───────────────────────────────────────────────────────────

/** GET /api/accounts  — return full tree for the active org */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const accounts = await Account.find({ organizationId: orgId(req), isDeleted: false })
    .sort({ name: 1 })
    .lean();
  res.json({ success: true, data: accounts });
});

/** POST /api/accounts */
export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { name, code, parentId, rootType, accountType, isGroup, currency, description } = req.body;

  // Duplicate check within same org + parent
  const dup = await Account.findOne({ organizationId: orgId(req), name, parentId: parentId ?? null });
  if (dup) throw new ValidationError(`Account "${name}" already exists here`);

  const account = new Account({
    organizationId: orgId(req),
    name, code, parentId: parentId ?? null,
    rootType, accountType,
    isGroup: isGroup ?? false,
    currency, description,
  });
  attachUser(account, req);
  await account.save();
  res.status(201).json({ success: true, data: account });
});

/** PATCH /api/accounts/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const account = await Account.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!account) throw new NotFoundError("Account");
  if (account.isSystemAccount && (req.body.name || req.body.accountType || req.body.rootType))
    throw new ValidationError("Cannot modify core fields of a system account");

  const fields = ["name", "code", "description", "currency", "isActive", "isGroup", "parentId"];
  fields.forEach((f) => { if (req.body[f] !== undefined) (account as any)[f] = req.body[f]; });

  attachUser(account, req);
  await account.save();
  res.json({ success: true, data: account });
});

/** DELETE /api/accounts/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const account = await Account.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!account) throw new NotFoundError("Account");
  if (account.isSystemAccount) throw new ValidationError("Cannot delete a system account");

  // Check for child accounts
  const hasChildren = await Account.exists({ parentId: account._id, isDeleted: false });
  if (hasChildren) throw new ValidationError("Cannot delete an account that has sub-accounts");

  account.isDeleted = true;
  account.deletedAt = new Date();
  attachUser(account, req);
  await account.save();
  res.json({ success: true, message: "Account deleted" });
});

/** POST /api/accounts/seed-template — seed standard Indian CoA */
export const seedTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await Account.countDocuments({ organizationId: organization });
  if (existing > 0) throw new ValidationError("Chart of Accounts already exists for this organization");

  const template = getIndianCoATemplate(organization.toString());
  const accountMap = new Map<string, any>();

  for (const node of template) {
    const parent = node.parentKey ? accountMap.get(node.parentKey) : null;
    const account = new Account({
      organizationId: organization,
      name: node.name,
      code: node.code,
      rootType: node.rootType,
      accountType: node.accountType,
      isGroup: node.isGroup,
      isSystemAccount: true,
      parentId: parent?._id ?? null,
    });
    attachUser(account, req);
    await account.save();
    if (node.key) accountMap.set(node.key, account);
  }

  res.status(201).json({ success: true, message: "Chart of Accounts seeded with Indian Standard template" });
});

// ─── Indian Standard CoA Template ─────────────────────────────────────────

function getIndianCoATemplate(orgId: string) {
  return [
    // Root groups
    { key: "assets", name: "Assets", code: "1000", rootType: "Asset", accountType: "Current Asset", isGroup: true, parentKey: null },
    { key: "liabilities", name: "Liabilities", code: "2000", rootType: "Liability", accountType: "Current Liability", isGroup: true, parentKey: null },
    { key: "equity", name: "Equity", code: "3000", rootType: "Equity", accountType: "Equity", isGroup: true, parentKey: null },
    { key: "income", name: "Income", code: "4000", rootType: "Income", accountType: "Income", isGroup: true, parentKey: null },
    { key: "expenses", name: "Expenses", code: "5000", rootType: "Expense", accountType: "Expense", isGroup: true, parentKey: null },

    // Assets
    { key: "current_assets", name: "Current Assets", code: "1100", rootType: "Asset", accountType: "Current Asset", isGroup: true, parentKey: "assets" },
    { key: "bank", name: "Bank Accounts", code: "1110", rootType: "Asset", accountType: "Bank", isGroup: true, parentKey: "current_assets" },
    { key: "cash", name: "Cash in Hand", code: "1120", rootType: "Asset", accountType: "Cash", isGroup: false, parentKey: "current_assets" },
    { key: "receivable", name: "Accounts Receivable", code: "1130", rootType: "Asset", accountType: "Receivable", isGroup: false, parentKey: "current_assets" },
    { key: "prepaid", name: "Prepaid Expenses", code: "1140", rootType: "Asset", accountType: "Current Asset", isGroup: false, parentKey: "current_assets" },
    { key: "tax_assets", name: "Tax Assets", code: "1150", rootType: "Asset", accountType: "Current Asset", isGroup: true, parentKey: "current_assets" },
    { key: "cgst_input", name: "CGST Input Tax Credit", code: "1151", rootType: "Asset", accountType: "Tax", isGroup: false, parentKey: "tax_assets" },
    { key: "sgst_input", name: "SGST Input Tax Credit", code: "1152", rootType: "Asset", accountType: "Tax", isGroup: false, parentKey: "tax_assets" },
    { key: "igst_input", name: "IGST Input Tax Credit", code: "1153", rootType: "Asset", accountType: "Tax", isGroup: false, parentKey: "tax_assets" },
    { key: "fixed_assets", name: "Fixed Assets", code: "1200", rootType: "Asset", accountType: "Fixed Asset", isGroup: true, parentKey: "assets" },
    { key: "furniture", name: "Furniture & Fixtures", code: "1210", rootType: "Asset", accountType: "Fixed Asset", isGroup: false, parentKey: "fixed_assets" },
    { key: "equipment", name: "Office Equipment", code: "1220", rootType: "Asset", accountType: "Fixed Asset", isGroup: false, parentKey: "fixed_assets" },
    { key: "computers", name: "Computers & Peripherals", code: "1230", rootType: "Asset", accountType: "Fixed Asset", isGroup: false, parentKey: "fixed_assets" },

    // Liabilities
    { key: "current_liab", name: "Current Liabilities", code: "2100", rootType: "Liability", accountType: "Current Liability", isGroup: true, parentKey: "liabilities" },
    { key: "payable", name: "Accounts Payable", code: "2110", rootType: "Liability", accountType: "Payable", isGroup: false, parentKey: "current_liab" },
    { key: "tax_liab", name: "Tax Liabilities", code: "2120", rootType: "Liability", accountType: "Tax", isGroup: true, parentKey: "current_liab" },
    { key: "cgst_output", name: "CGST Payable", code: "2121", rootType: "Liability", accountType: "Tax", isGroup: false, parentKey: "tax_liab" },
    { key: "sgst_output", name: "SGST Payable", code: "2122", rootType: "Liability", accountType: "Tax", isGroup: false, parentKey: "tax_liab" },
    { key: "igst_output", name: "IGST Payable", code: "2123", rootType: "Liability", accountType: "Tax", isGroup: false, parentKey: "tax_liab" },
    { key: "tds_payable", name: "TDS Payable", code: "2124", rootType: "Liability", accountType: "Tax", isGroup: false, parentKey: "tax_liab" },
    { key: "salaries_payable", name: "Salaries Payable", code: "2130", rootType: "Liability", accountType: "Current Liability", isGroup: false, parentKey: "current_liab" },
    { key: "longterm_liab", name: "Long Term Liabilities", code: "2200", rootType: "Liability", accountType: "Long Term Liability", isGroup: true, parentKey: "liabilities" },

    // Equity
    { key: "capital", name: "Capital Account", code: "3100", rootType: "Equity", accountType: "Equity", isGroup: false, parentKey: "equity" },
    { key: "retained", name: "Retained Earnings", code: "3200", rootType: "Equity", accountType: "Equity", isGroup: false, parentKey: "equity" },

    // Income
    { key: "sales_income", name: "Sales Revenue", code: "4100", rootType: "Income", accountType: "Income", isGroup: false, parentKey: "income" },
    { key: "service_income", name: "Service Revenue", code: "4200", rootType: "Income", accountType: "Income", isGroup: false, parentKey: "income" },
    { key: "other_income", name: "Other Income", code: "4300", rootType: "Income", accountType: "Income", isGroup: false, parentKey: "income" },
    { key: "interest_income", name: "Interest Received", code: "4310", rootType: "Income", accountType: "Income", isGroup: false, parentKey: "other_income" },

    // Expenses
    { key: "cogs", name: "Cost of Goods Sold", code: "5100", rootType: "Expense", accountType: "Cost of Goods Sold", isGroup: false, parentKey: "expenses" },
    { key: "salary_exp", name: "Salaries & Wages", code: "5200", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "rent", name: "Rent", code: "5300", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "utilities", name: "Utilities", code: "5400", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "travel", name: "Travel & Conveyance", code: "5500", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "office_supplies", name: "Office Supplies", code: "5600", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "depreciation", name: "Depreciation", code: "5700", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "bank_charges", name: "Bank Charges", code: "5800", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "professional_fees", name: "Professional Fees", code: "5900", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "miscellaneous", name: "Miscellaneous Expenses", code: "5990", rootType: "Expense", accountType: "Expense", isGroup: false, parentKey: "expenses" },
    { key: "roundoff", name: "Round Off", code: "5999", rootType: "Expense", accountType: "Round Off", isGroup: false, parentKey: "expenses" },
  ];
}
