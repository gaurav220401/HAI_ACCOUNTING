import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Organization from "../models/organization.model";
import { AuthenticatedRequest, AccountType } from "../types";
import { attachUser } from "../plugins";
import asyncHandler from "../utils/asyncHandler";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";

// ─── Utilities ─────────────────────────────────────────────────────────────

function orgId(req: AuthenticatedRequest) {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id;
}

type BalanceSide = "Debit" | "Credit";

const ROOT_ORDER = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
const OPENING_BALANCE_ADJUSTMENT_ACCOUNT = "Opening Balance Adjustments";
const OPENING_BALANCE_OFFSET_ACCOUNT = "Opening Balance Offset";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toAmount(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new ValidationError("Debit/Credit values must be valid numbers");
  if (n < 0) throw new ValidationError("Debit/Credit values cannot be negative");
  return round2(n);
}

function calculateTotals(entries: Array<{ debit: number; credit: number }>) {
  const totalDebit = round2(entries.reduce((sum, e) => sum + e.debit, 0));
  const totalCredit = round2(entries.reduce((sum, e) => sum + e.credit, 0));
  const difference = round2(Math.abs(totalDebit - totalCredit));

  let differenceSide: BalanceSide | null = null;
  if (difference > 0) {
    differenceSide = totalDebit > totalCredit ? "Credit" : "Debit";
  }

  return {
    totalDebit,
    totalCredit,
    difference,
    differenceSide,
  };
}

// ─── Controllers ───────────────────────────────────────────────────────────

/** GET /api/accounts  — return flat list for the active org (supports ?rootType=Income,Expense) */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const filter: Record<string, unknown> = { organizationId: orgId(req), isDeleted: false };
  if (req.query.rootType) {
    const types = (req.query.rootType as string).split(",").map((t) => t.trim());
    filter.rootType = { $in: types };
  }
  if (req.query.accountType) {
    const types = (req.query.accountType as string).split(",").map((t) => t.trim());
    filter.accountType = { $in: types };
  }
  if (req.query.excludeGroups === "true") filter.isGroup = false;
  const accounts = await Account.find(filter).sort({ name: 1 }).lean();
  res.json({ success: true, data: accounts });
});

/**
 * GET /api/accounts/for-item?section=sales|purchase
 * Returns accounts grouped by accountType for use in item form dropdowns.
 * sales   → rootType Income
 * purchase → rootType Expense (Cost Of Goods Sold + Expense)
 */
export const listForItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const section = (req.query.section as string) ?? "sales";
  const rootTypes = section === "purchase" ? ["Expense"] : ["Income"];
  const accounts = await Account.find({
    organizationId: orgId(req),
    isDeleted: false,
    isGroup: false,
    rootType: { $in: rootTypes },
  })
    .sort({ accountType: 1, name: 1 })
    .lean();

  // Group by accountType for frontend grouped dropdowns
  const grouped: Record<string, typeof accounts> = {};
  for (const acc of accounts) {
    const key = acc.accountType;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(acc);
  }

  res.json({ success: true, data: grouped });
});

/** GET /api/accounts/opening-balances */
export const getOpeningBalances = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  const [accounts, organization] = await Promise.all([
    Account.find({
      organizationId,
      isDeleted: false,
      isGroup: false,
    })
      .sort({ rootType: 1, name: 1 })
      .lean(),
    Organization.findById(organizationId).select("openingBalanceSettings").lean(),
  ]);

  const grouped = new Map<string, Array<{
    accountId: string;
    name: string;
    rootType: string;
    accountType: string;
    availableAmount: number;
    availableSide: BalanceSide | null;
    debit: number;
    credit: number;
  }>>();

  const totalEntries: Array<{ debit: number; credit: number }> = [];

  for (const account of accounts) {
    if (
      account.name === OPENING_BALANCE_ADJUSTMENT_ACCOUNT ||
      account.name === OPENING_BALANCE_OFFSET_ACCOUNT
    ) {
      continue;
    }

    const signed = round2(Number(account.openingBalance ?? account.balance ?? 0));
    const debit = signed > 0 ? signed : 0;
    const credit = signed < 0 ? Math.abs(signed) : 0;
    const availableSide: BalanceSide | null = signed === 0 ? null : (signed > 0 ? "Debit" : "Credit");

    totalEntries.push({ debit, credit });

    const row = {
      accountId: String(account._id),
      name: account.name,
      rootType: account.rootType,
      accountType: account.accountType,
      availableAmount: Math.abs(signed),
      availableSide,
      debit,
      credit,
    };

    const key = account.rootType;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const groups = ROOT_ORDER
    .map((rootType) => ({ rootType, accounts: grouped.get(rootType) || [] }))
    .filter((group) => group.accounts.length > 0);

  const totals = calculateTotals(totalEntries);

  res.json({
    success: true,
    data: {
      migrationDate: organization?.openingBalanceSettings?.migrationDate || null,
      isConfigured: Boolean(organization?.openingBalanceSettings?.isConfigured),
      groups,
      totals,
    },
  });
});

/** PUT /api/accounts/opening-balances */
export const saveOpeningBalances = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const entriesInput = Array.isArray(req.body.entries) ? req.body.entries : [];

  if (entriesInput.length === 0) {
    throw new ValidationError("entries must be a non-empty array");
  }

  const sanitizedEntries: Array<{ accountId: string; debit: number; credit: number }> = entriesInput.map((entry: any) => {
    const accountId = String(entry?.accountId || "").trim();
    if (!accountId || !Types.ObjectId.isValid(accountId)) {
      throw new ValidationError("Each entry must include a valid accountId");
    }

    const debit = toAmount(entry?.debit);
    const credit = toAmount(entry?.credit);
    if (debit > 0 && credit > 0) {
      throw new ValidationError("An account cannot have both debit and credit opening balances");
    }

    return { accountId, debit, credit };
  });

  const seen = new Set<string>();
  for (const entry of sanitizedEntries) {
    if (seen.has(entry.accountId)) {
      throw new ValidationError(`Duplicate account entry found for ${entry.accountId}`);
    }
    seen.add(entry.accountId);
  }

  const accounts = await Account.find({
    _id: { $in: sanitizedEntries.map((e) => e.accountId) },
    organizationId,
    isDeleted: false,
    isGroup: false,
  });

  if (accounts.length !== sanitizedEntries.length) {
    throw new ValidationError("One or more accounts are invalid for this organization");
  }

  const accountMap = new Map(accounts.map((account) => [String(account._id), account]));
  const appliedEntries: Array<{ debit: number; credit: number }> = [];

  for (const entry of sanitizedEntries) {
    const account = accountMap.get(entry.accountId);
    if (!account) continue;

    if (
      account.name === OPENING_BALANCE_ADJUSTMENT_ACCOUNT ||
      account.name === OPENING_BALANCE_OFFSET_ACCOUNT
    ) {
      continue;
    }

    const signed = round2(entry.debit - entry.credit);
    account.openingBalance = signed;
    account.balance = signed;
    attachUser(account, req);
    await account.save();

    appliedEntries.push({ debit: entry.debit, credit: entry.credit });
  }

  const totals = calculateTotals(appliedEntries);
  const adjustmentSigned = round2(totals.totalCredit - totals.totalDebit);
  const adjustmentAmount = Math.abs(adjustmentSigned);

  const adjustmentAccount = await Account.findOne({
    organizationId,
    name: OPENING_BALANCE_ADJUSTMENT_ACCOUNT,
    isDeleted: false,
    isGroup: false,
  });

  if (adjustmentAccount) {
    adjustmentAccount.openingBalance = adjustmentSigned;
    adjustmentAccount.balance = adjustmentSigned;
    attachUser(adjustmentAccount, req);
    await adjustmentAccount.save();
  }

  const organization = await Organization.findById(organizationId);
  if (!organization) throw new NotFoundError("Organization");

  let migrationDate = organization.openingBalanceSettings?.migrationDate || null;
  if (req.body.migrationDate !== undefined && req.body.migrationDate !== null && req.body.migrationDate !== "") {
    const parsed = new Date(String(req.body.migrationDate));
    if (Number.isNaN(parsed.getTime())) throw new ValidationError("migrationDate must be a valid date");
    migrationDate = parsed;
  }

  organization.openingBalanceSettings = {
    ...(organization.openingBalanceSettings || {}),
    migrationDate,
    isConfigured: true,
    lastUpdatedAt: new Date(),
  } as any;
  attachUser(organization, req);
  await organization.save();

  const finalTotals = {
    totalDebit: round2(totals.totalDebit + (adjustmentSigned > 0 ? adjustmentSigned : 0)),
    totalCredit: round2(totals.totalCredit + (adjustmentSigned < 0 ? Math.abs(adjustmentSigned) : 0)),
  };

  res.json({
    success: true,
    message: "Opening balances saved",
    data: {
      totals,
      adjustment: {
        amount: adjustmentAmount,
        side: adjustmentAmount === 0 ? null : (adjustmentSigned > 0 ? "Debit" : "Credit"),
        accountId: adjustmentAccount ? String(adjustmentAccount._id) : null,
      },
      finalTotals,
      migrationDate,
    },
  });
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

  const fields = ["name", "code", "description", "currency", "isActive", "isGroup", "parentId", "accountType", "rootType"];
  fields.forEach((f) => { if (req.body[f] !== undefined) (account as any)[f] = req.body[f]; });

  attachUser(account, req);
  await account.save();
  res.json({ success: true, data: account });
});

/** DELETE /api/accounts/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const account = await Account.findOne({ _id: req.params.id, organizationId: orgId(req) });
  if (!account) throw new NotFoundError("Account");

  // Check for child accounts
  const hasChildren = await Account.exists({ parentId: account._id, isDeleted: false });
  if (hasChildren) throw new ValidationError("Cannot delete an account that has sub-accounts");

  account.isDeleted = true;
  account.deletedAt = new Date();
  attachUser(account, req);
  await account.save();
  res.json({ success: true, message: "Account deleted" });
});

/** POST /api/accounts/seed-template — seed standard Indian CoA (Zoho Books style) */
export const seedTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req);
  const existing = await Account.countDocuments({ organizationId: organization });
  if (existing > 0) throw new ValidationError("Chart of Accounts already exists for this organization");

  const template = getIndianCoATemplate();

  for (const node of template) {
    const account = new Account({
      organizationId: organization,
      name: node.name,
      rootType: node.rootType,
      accountType: node.accountType,
      isGroup: false,
      isSystemAccount: true,
      parentId: null,
      description: node.description ?? "",
    });
    attachUser(account, req);
    await account.save();
  }

  res.status(201).json({ success: true, message: "Chart of Accounts seeded with Indian Standard template" });
});

// ─── Indian Standard CoA Template (Zoho Books style — flat, no parent groups) ──

function getIndianCoATemplate() {
  type TemplateNode = {
    name: string;
    rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
    accountType: AccountType;
    description?: string;
  };

  const t: TemplateNode[] = [
    // ── ASSETS ────────────────────────────────────────────────────────
    { name: "Employee Advance",         rootType: "Asset", accountType: "Other Current Asset",      description: "Advances paid to employees for business purposes." },
    { name: "Prepaid Expenses",         rootType: "Asset", accountType: "Other Current Asset",      description: "Expenses paid in advance for future periods." },
    { name: "TDS Receivable",           rootType: "Asset", accountType: "Other Current Asset",      description: "Tax deducted at source receivable from the government." },
    { name: "Advance Tax",              rootType: "Asset", accountType: "Other Current Asset",      description: "Any tax which is paid in advance is recorded into the advance tax account. This advance tax payment could be a quarterly, half yearly or yearly payment." },
    { name: "Petty Cash",               rootType: "Asset", accountType: "Cash",                     description: "Small amount of cash kept for minor expenses." },
    { name: "Undeposited Funds",        rootType: "Asset", accountType: "Cash",                     description: "Payments received but not yet deposited to the bank." },
    { name: "Accounts Receivable",      rootType: "Asset", accountType: "Accounts Receivable",      description: "The amount of money your customers owe you for goods or services rendered." },
    { name: "Furniture and Equipment",  rootType: "Asset", accountType: "Fixed Asset",              description: "Furniture, fixtures, and equipment owned by the business." },
    { name: "Inventory Asset",          rootType: "Asset", accountType: "Stock",                    description: "Value of goods held in inventory/stock." },

    // ── LIABILITIES ────────────────────────────────────────────────────
    { name: "Tax Payable",                  rootType: "Liability", accountType: "Other Current Liability", description: "Taxes owed to the government that are due within a year." },
    { name: "Employee Reimbursements",      rootType: "Liability", accountType: "Other Current Liability", description: "Amounts owed to employees for expenses they incurred on behalf of the business." },
    { name: "Opening Balance Adjustments",  rootType: "Liability", accountType: "Other Current Liability", description: "Adjustments made to opening balances during migration." },
    { name: "Unearned Revenue",             rootType: "Liability", accountType: "Other Current Liability", description: "Revenue received in advance for goods or services not yet delivered." },
    { name: "TDS Payable",                  rootType: "Liability", accountType: "Other Current Liability", description: "Tax deducted at source payable to the government." },
    { name: "Accounts Payable",             rootType: "Liability", accountType: "Accounts Payable",       description: "The amount of money you owe to your vendors for goods or services received." },
    { name: "Mortgages",                    rootType: "Liability", accountType: "Non Current Liability",  description: "Long-term loans secured by property or real estate." },
    { name: "Construction Loans",           rootType: "Liability", accountType: "Non Current Liability",  description: "Short-term or interim loans to finance construction projects." },
    { name: "Dimension Adjustments",        rootType: "Liability", accountType: "Other Liability",        description: "Adjustments related to reporting dimensions." },

    // ── EQUITY ─────────────────────────────────────────────────────────
    { name: "Retained Earnings",        rootType: "Equity", accountType: "Equity", description: "Accumulated net income retained in the business after dividends." },
    { name: "Drawings",                 rootType: "Equity", accountType: "Equity", description: "Amounts withdrawn by the owner for personal use." },
    { name: "Investments",              rootType: "Equity", accountType: "Equity", description: "Capital invested into the business by owners or partners." },
    { name: "Distributions",            rootType: "Equity", accountType: "Equity", description: "Payments or distributions made to shareholders or partners." },
    { name: "Dividends Paid",           rootType: "Equity", accountType: "Equity", description: "Dividends distributed to shareholders." },
    { name: "Owner's Equity",           rootType: "Equity", accountType: "Equity", description: "The owner's total investment and earnings in the business." },
    { name: "Opening Balance Offset",   rootType: "Equity", accountType: "Equity", description: "Used to offset opening balance differences during setup." },
    { name: "Capital Stock",            rootType: "Equity", accountType: "Equity", description: "Shares of stock issued to shareholders representing ownership." },

    // ── INCOME ─────────────────────────────────────────────────────────
    { name: "Shipping Charge",          rootType: "Income", accountType: "Income", description: "Revenue from shipping and delivery charges." },
    { name: "Sales",                    rootType: "Income", accountType: "Income", description: "Revenue from sale of goods or services." },
    { name: "General Income",           rootType: "Income", accountType: "Income", description: "General income from primary business activities." },
    { name: "Interest Income",          rootType: "Income", accountType: "Income", description: "Income earned from interest on deposits or investments." },
    { name: "Other Charges",            rootType: "Income", accountType: "Income", description: "Miscellaneous charges and fees collected." },
    { name: "Late Fee Income",          rootType: "Income", accountType: "Income", description: "Income from late payment fees charged to customers." },
    { name: "Discount",                 rootType: "Income", accountType: "Income", description: "Discounts given on sales." },

    // ── EXPENSE ────────────────────────────────────────────────────────
    { name: "Purchase Discounts",              rootType: "Expense", accountType: "Expense", description: "Discounts received on purchases from vendors." },
    { name: "Depreciation And Amortisation",   rootType: "Expense", accountType: "Expense", description: "Reduction in value of tangible and intangible assets over time." },
    { name: "Transportation Expense",          rootType: "Expense", accountType: "Expense", description: "Costs of transporting goods or employees." },
    { name: "Merchandise",                     rootType: "Expense", accountType: "Expense", description: "Cost of goods purchased for resale." },
    { name: "Uncategorized",                   rootType: "Expense", accountType: "Expense", description: "Expenses that have not been classified yet." },
    { name: "Raw Materials And Consumables",   rootType: "Expense", accountType: "Expense", description: "Cost of raw materials and consumable supplies." },
    { name: "Contract Assets",                 rootType: "Expense", accountType: "Expense", description: "Expenses incurred on contract-based assets." },
    { name: "Rent Expense",                    rootType: "Expense", accountType: "Expense", description: "Rent paid for office, warehouse, or other business premises." },
    { name: "Office Supplies",                 rootType: "Expense", accountType: "Expense", description: "Cost of stationery, office supplies, and consumables." },
    { name: "Advertising And Marketing",       rootType: "Expense", accountType: "Expense", description: "Costs related to advertising, promotions, and marketing campaigns." },
    { name: "Bank Fees and Charges",           rootType: "Expense", accountType: "Expense", description: "Fees charged by banks for account maintenance and transactions." },
    { name: "Credit Card Charges",             rootType: "Expense", accountType: "Expense", description: "Fees charged for credit card processing and transactions." },
    { name: "Travel Expense",                  rootType: "Expense", accountType: "Expense", description: "Costs for business travel including airfare, lodging, and transport." },
    { name: "Telephone Expense",               rootType: "Expense", accountType: "Expense", description: "Costs for telephone and mobile communication." },
    { name: "Automobile Expense",              rootType: "Expense", accountType: "Expense", description: "Costs related to company vehicles including fuel, insurance, and maintenance." },
    { name: "IT and Internet Expenses",        rootType: "Expense", accountType: "Expense", description: "Costs for internet services, software subscriptions, and IT support." },
    { name: "Janitorial Expense",              rootType: "Expense", accountType: "Expense", description: "Costs for cleaning and janitorial services." },
    { name: "Postage",                         rootType: "Expense", accountType: "Expense", description: "Costs of mailing and courier services." },
    { name: "Bad Debt",                        rootType: "Expense", accountType: "Expense", description: "Amounts owed by customers that are unlikely to be collected." },
    { name: "Printing and Stationery",         rootType: "Expense", accountType: "Expense", description: "Costs of printing, stationery, and office supplies." },
    { name: "Salaries and Employee Wages",     rootType: "Expense", accountType: "Expense", description: "Wages and salaries paid to employees." },
    { name: "Meals and Entertainment",         rootType: "Expense", accountType: "Expense", description: "Costs for business meals and entertainment." },
    { name: "Depreciation Expense",            rootType: "Expense", accountType: "Expense", description: "Periodic reduction in value of fixed assets." },
    { name: "Consultant Expense",              rootType: "Expense", accountType: "Expense", description: "Fees paid to external consultants and advisors." },
    { name: "Repairs and Maintenance",         rootType: "Expense", accountType: "Expense", description: "Costs of repairing and maintaining business assets." },
    { name: "Other Expenses",                  rootType: "Expense", accountType: "Expense", description: "Miscellaneous business expenses." },
    { name: "Lodging",                         rootType: "Expense", accountType: "Expense", description: "Costs for hotel and accommodation during business trips." },
    { name: "Fuel/Mileage Expenses",           rootType: "Expense", accountType: "Expense", description: "Fuel costs and mileage-based expenses for business travel." },
    // Cost Of Goods Sold
    { name: "Cost of Goods Sold",              rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Direct costs attributable to the production of goods sold." },
    { name: "Labor",                           rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Labor costs directly related to production." },
    { name: "Materials",                       rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Cost of raw materials used in production." },
    { name: "Subcontractor",                   rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Payments to subcontractors for production work." },
    { name: "Job Costing",                     rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Costs allocated to specific jobs or projects." },
    // Other Expense
    { name: "Exchange Gain or Loss",           rootType: "Expense", accountType: "Other Expense",      description: "Gains or losses due to foreign currency exchange rate fluctuations." },
  ];

  return t;
}
