import { Types } from "mongoose";
import Account from "../models/account.model";
import { attachUser } from "../plugins";
import { AccountRootType, AccountType, AuthenticatedRequest } from "../types";
import { ValidationError } from "../utils/errors";

type CodeRange = {
  start: number;
  end: number;
};

export type ChartTemplateNode = {
  name: string;
  rootType: AccountRootType;
  accountType: AccountType;
  description?: string;
};

const ACCOUNT_TYPES_BY_ROOT: Record<AccountRootType, AccountType[]> = {
  Asset: [
    "Other Asset",
    "Other Current Asset",
    "Cash",
    "Bank",
    "Fixed Asset",
    "Accounts Receivable",
    "Stock",
    "Payment Clearing Account",
    "Intangible Asset",
    "Non Current Asset",
    "Deferred Tax Asset",
  ],
  Liability: [
    "Other Current Liability",
    "Credit Card",
    "Non Current Liability",
    "Other Liability",
    "Accounts Payable",
    "Overseas Tax Payable",
    "Deferred Tax Liability",
  ],
  Equity: ["Equity"],
  Income: ["Income", "Other Income"],
  Expense: ["Expense", "Cost Of Goods Sold", "Other Expense"],
};

const ROOT_CODE_RANGES: Record<Exclude<AccountRootType, "Expense">, CodeRange> = {
  Asset: { start: 1000, end: 1999 },
  Liability: { start: 2000, end: 2999 },
  Equity: { start: 3000, end: 3999 },
  Income: { start: 4000, end: 4999 },
};

function normalizeAccountName(name: string): string {
  return name.trim().toLowerCase();
}

function toCodeNumber(code: string): number {
  return Number(code);
}

function normalizeRequestedCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const code = String(value).trim();
  if (!code) return null;

  if (!/^\d{4}$/.test(code)) {
    throw new ValidationError("Account code must be a 4-digit number (for example: 1001)");
  }

  return code;
}

function collectUsedCodesFromRows(rows: Array<{ code?: string }>): Set<number> {
  const used = new Set<number>();
  for (const row of rows) {
    const code = String(row.code || "").trim();
    if (!/^\d{4}$/.test(code)) continue;
    used.add(Number(code));
  }
  return used;
}

function pickNextAvailableCode(usedCodes: Set<number>, range: CodeRange): string {
  for (let candidate = range.start; candidate <= range.end; candidate += 1) {
    if (!usedCodes.has(candidate)) return String(candidate);
  }

  throw new ValidationError(
    `No account codes are available in the allowed range ${range.start}-${range.end}`,
  );
}

export function validateAccountTypeForRootType(rootType: AccountRootType, accountType: AccountType) {
  const allowedTypes = ACCOUNT_TYPES_BY_ROOT[rootType] || [];
  if (!allowedTypes.includes(accountType)) {
    throw new ValidationError(
      `Account type \"${accountType}\" is not valid for root type \"${rootType}\"`,
    );
  }
}

export function getAccountCodeRange(rootType: AccountRootType, accountType: AccountType): CodeRange {
  validateAccountTypeForRootType(rootType, accountType);

  if (rootType !== "Expense") {
    return ROOT_CODE_RANGES[rootType as Exclude<AccountRootType, "Expense">];
  }

  if (accountType === "Cost Of Goods Sold") return { start: 5000, end: 5999 };
  if (accountType === "Expense") return { start: 6000, end: 6999 };
  return { start: 7000, end: 7999 };
}

function validateCodeRangeForAccount(code: string, rootType: AccountRootType, accountType: AccountType) {
  const range = getAccountCodeRange(rootType, accountType);
  const numericCode = toCodeNumber(code);

  if (numericCode < range.start || numericCode > range.end) {
    throw new ValidationError(
      `Account code for ${rootType}${rootType === "Expense" ? ` (${accountType})` : ""} must be between ${range.start} and ${range.end}`,
    );
  }
}

export async function resolveAccountCodeForAccount(params: {
  organizationId: Types.ObjectId;
  rootType: AccountRootType;
  accountType: AccountType;
  requestedCode?: unknown;
  excludeAccountId?: Types.ObjectId | string;
}): Promise<string> {
  validateAccountTypeForRootType(params.rootType, params.accountType);

  const requestedCode = normalizeRequestedCode(params.requestedCode);

  if (requestedCode) {
    validateCodeRangeForAccount(requestedCode, params.rootType, params.accountType);

    const duplicate = await Account.exists({
      organizationId: params.organizationId,
      code: requestedCode,
      ...(params.excludeAccountId ? { _id: { $ne: params.excludeAccountId } } : {}),
    });

    if (duplicate) {
      throw new ValidationError(`Account code ${requestedCode} already exists in this organization`);
    }

    return requestedCode;
  }

  const rows = await Account.find({
    organizationId: params.organizationId,
    ...(params.excludeAccountId ? { _id: { $ne: params.excludeAccountId } } : {}),
  })
    .select("code")
    .lean();

  const usedCodes = collectUsedCodesFromRows(rows as Array<{ code?: string }>);
  const range = getAccountCodeRange(params.rootType, params.accountType);
  return pickNextAvailableCode(usedCodes, range);
}

export async function ensureDefaultChartOfAccounts(params: {
  organizationId: Types.ObjectId;
  actor?: AuthenticatedRequest;
}): Promise<{ created: number; totalTemplateAccounts: number }> {
  const template = getIndianCoATemplate();

  const templateCountByTypeSignature = new Map<string, number>();
  for (const node of template) {
    const typeSignature = `${node.rootType}|${node.accountType}`;
    templateCountByTypeSignature.set(
      typeSignature,
      (templateCountByTypeSignature.get(typeSignature) || 0) + 1,
    );
  }

  const existingAccounts = await Account.find({ organizationId: params.organizationId })
    .select("name code rootType accountType parentId isSystemAccount")
    .lean();

  const rootAccounts = (existingAccounts as Array<{
    name: string;
    rootType: AccountRootType;
    accountType: AccountType;
    parentId?: Types.ObjectId | null;
    isSystemAccount?: boolean;
  }>).filter((account) => !account.parentId);

  const existingRootNames = new Set(
    rootAccounts.map((account) => normalizeAccountName(account.name)),
  );

  const existingTemplateSignatures = new Set(
    rootAccounts.map((account) =>
      `${normalizeAccountName(account.name)}|${account.rootType}|${account.accountType}`,
    ),
  );

  const existingSystemCountByTypeSignature = new Map<string, number>();
  for (const account of rootAccounts) {
    const isSystem = Boolean(account.isSystemAccount);
    if (!isSystem) continue;
    const typeSignature = `${account.rootType}|${account.accountType}`;
    existingSystemCountByTypeSignature.set(
      typeSignature,
      (existingSystemCountByTypeSignature.get(typeSignature) || 0) + 1,
    );
  }

  const createdCountByTypeSignature = new Map<string, number>();

  const usedCodes = collectUsedCodesFromRows(existingAccounts as Array<{ code?: string }>);

  let created = 0;

  for (const node of template) {
    const nameKey = normalizeAccountName(node.name);
    const signature = `${nameKey}|${node.rootType}|${node.accountType}`;
    const typeSignature = `${node.rootType}|${node.accountType}`;

    // Exact template account already exists.
    if (existingTemplateSignatures.has(signature)) continue;

    // A root account with the same name already exists (possibly user-created or customized).
    // Skip to avoid duplicate-name conflicts on (organizationId, name, parentId:null).
    if (existingRootNames.has(nameKey)) continue;

    // Respect renamed predefined accounts: if the org already has enough system accounts
    // for this rootType/accountType bucket, don't recreate this template name.
    const existingSystemCount = existingSystemCountByTypeSignature.get(typeSignature) || 0;
    const createdInThisRun = createdCountByTypeSignature.get(typeSignature) || 0;
    const requiredCount = templateCountByTypeSignature.get(typeSignature) || 0;
    if (existingSystemCount + createdInThisRun >= requiredCount) continue;

    const range = getAccountCodeRange(node.rootType, node.accountType);
    const code = pickNextAvailableCode(usedCodes, range);
    usedCodes.add(Number(code));

    const account = new Account({
      organizationId: params.organizationId,
      name: node.name,
      code,
      rootType: node.rootType,
      accountType: node.accountType,
      isGroup: false,
      isSystemAccount: true,
      parentId: null,
      description: node.description || "",
    });

    try {
      if (params.actor) attachUser(account, params.actor);
      await account.save();
    } catch (error: any) {
      // Parallel requests can race while inserting the same template account.
      // Ignore duplicate-key conflict and continue syncing the rest.
      if (error?.code === 11000) {
        existingRootNames.add(nameKey);
        existingTemplateSignatures.add(signature);
        continue;
      }
      throw error;
    }

    existingRootNames.add(nameKey);
    existingTemplateSignatures.add(signature);
    createdCountByTypeSignature.set(
      typeSignature,
      (createdCountByTypeSignature.get(typeSignature) || 0) + 1,
    );
    created += 1;
  }

  return { created, totalTemplateAccounts: template.length };
}

export async function ensureTemplateSystemAccounts(params: {
  organizationId: Types.ObjectId;
}): Promise<{ locked: number }> {
  const template = getIndianCoATemplate();
  const allowedByName = new Map<string, Set<string>>();

  for (const row of template) {
    const key = normalizeAccountName(row.name);
    const signature = `${row.rootType}:${row.accountType}`;
    if (!allowedByName.has(key)) allowedByName.set(key, new Set<string>());
    allowedByName.get(key)!.add(signature);
  }

  const candidates = await Account.find({
    organizationId: params.organizationId,
    isDeleted: false,
    parentId: null,
    isSystemAccount: { $ne: true },
  })
    .select("_id name rootType accountType")
    .lean();

  const idsToLock = candidates
    .filter((account) => {
      const key = normalizeAccountName(String(account.name || ""));
      const signature = `${account.rootType}:${account.accountType}`;
      return allowedByName.get(key)?.has(signature) || false;
    })
    .map((account) => account._id);

  if (idsToLock.length === 0) return { locked: 0 };

  const result = await Account.updateMany(
    { _id: { $in: idsToLock } },
    { $set: { isSystemAccount: true } },
  );

  return { locked: result.modifiedCount || 0 };
}

export function getIndianCoATemplate(): ChartTemplateNode[] {
  const template: ChartTemplateNode[] = [
    // Assets
    { name: "Employee Advance", rootType: "Asset", accountType: "Other Current Asset", description: "Advances paid to employees for business purposes." },
    { name: "Prepaid Expenses", rootType: "Asset", accountType: "Other Current Asset", description: "Expenses paid in advance for future periods." },
    { name: "TDS Receivable", rootType: "Asset", accountType: "Other Current Asset", description: "Tax deducted at source receivable from the government." },
    { name: "Advance Tax", rootType: "Asset", accountType: "Other Current Asset", description: "Any tax paid in advance, such as quarterly, half-yearly, or yearly advance tax." },
    { name: "Petty Cash", rootType: "Asset", accountType: "Cash", description: "Small amount of cash kept for minor expenses." },
    { name: "Undeposited Funds", rootType: "Asset", accountType: "Cash", description: "Payments received but not yet deposited to the bank." },
    { name: "Accounts Receivable", rootType: "Asset", accountType: "Accounts Receivable", description: "Money customers owe for goods or services rendered." },
    { name: "Furniture and Equipment", rootType: "Asset", accountType: "Fixed Asset", description: "Furniture, fixtures, and equipment owned by the business." },
    { name: "Inventory Asset", rootType: "Asset", accountType: "Stock", description: "Value of goods held in inventory." },

    // Liabilities
    { name: "Tax Payable", rootType: "Liability", accountType: "Other Current Liability", description: "Taxes owed to the government that are due within a year." },
    { name: "Employee Reimbursements", rootType: "Liability", accountType: "Other Current Liability", description: "Amounts owed to employees for business expenses." },
    { name: "Opening Balance Adjustments", rootType: "Liability", accountType: "Other Current Liability", description: "Adjustments made to opening balances during migration." },
    { name: "Unearned Revenue", rootType: "Liability", accountType: "Other Current Liability", description: "Revenue received in advance for undelivered goods or services." },
    { name: "TDS Payable", rootType: "Liability", accountType: "Other Current Liability", description: "Tax deducted at source payable to the government." },
    { name: "Accounts Payable", rootType: "Liability", accountType: "Accounts Payable", description: "Money owed to vendors for goods or services received." },
    { name: "Mortgages", rootType: "Liability", accountType: "Non Current Liability", description: "Long-term loans secured by property." },
    { name: "Construction Loans", rootType: "Liability", accountType: "Non Current Liability", description: "Loans used to finance construction projects." },
    { name: "Dimension Adjustments", rootType: "Liability", accountType: "Other Liability", description: "Adjustments related to reporting dimensions." },

    // Equity
    { name: "Retained Earnings", rootType: "Equity", accountType: "Equity", description: "Accumulated net income retained in the business." },
    { name: "Drawings", rootType: "Equity", accountType: "Equity", description: "Amounts withdrawn by the owner for personal use." },
    { name: "Investments", rootType: "Equity", accountType: "Equity", description: "Capital invested into the business by owners or partners." },
    { name: "Distributions", rootType: "Equity", accountType: "Equity", description: "Payments made to shareholders or partners." },
    { name: "Dividends Paid", rootType: "Equity", accountType: "Equity", description: "Dividends distributed to shareholders." },
    { name: "Owner's Equity", rootType: "Equity", accountType: "Equity", description: "Owner's total investment and earnings in the business." },
    { name: "Opening Balance Offset", rootType: "Equity", accountType: "Equity", description: "Used to offset opening balance differences during setup." },
    { name: "Capital Stock", rootType: "Equity", accountType: "Equity", description: "Shares issued to shareholders representing ownership." },

    // Income
    { name: "Shipping Charge", rootType: "Income", accountType: "Income", description: "Revenue from shipping and delivery charges." },
    { name: "Sales", rootType: "Income", accountType: "Income", description: "Revenue from sale of goods or services." },
    { name: "General Income", rootType: "Income", accountType: "Income", description: "General income from primary business activities." },
    { name: "Interest Income", rootType: "Income", accountType: "Income", description: "Income earned from interest on deposits or investments." },
    { name: "Other Charges", rootType: "Income", accountType: "Income", description: "Miscellaneous charges and fees collected." },
    { name: "Late Fee Income", rootType: "Income", accountType: "Income", description: "Income from late payment fees charged to customers." },
    { name: "Discount", rootType: "Income", accountType: "Income", description: "Discounts given on sales." },

    // Expenses
    { name: "Purchase Discounts", rootType: "Expense", accountType: "Expense", description: "Discounts received on purchases from vendors." },
    { name: "Depreciation And Amortisation", rootType: "Expense", accountType: "Expense", description: "Reduction in value of tangible and intangible assets over time." },
    { name: "Transportation Expense", rootType: "Expense", accountType: "Expense", description: "Costs of transporting goods or employees." },
    { name: "Merchandise", rootType: "Expense", accountType: "Expense", description: "Cost of goods purchased for resale." },
    { name: "Uncategorized", rootType: "Expense", accountType: "Expense", description: "Expenses that have not been classified yet." },
    { name: "Raw Materials And Consumables", rootType: "Expense", accountType: "Expense", description: "Cost of raw materials and consumable supplies." },
    { name: "Contract Assets", rootType: "Expense", accountType: "Expense", description: "Expenses incurred on contract-based assets." },
    { name: "Rent Expense", rootType: "Expense", accountType: "Expense", description: "Rent paid for office, warehouse, or other business premises." },
    { name: "Office Supplies", rootType: "Expense", accountType: "Expense", description: "Cost of stationery, office supplies, and consumables." },
    { name: "Advertising And Marketing", rootType: "Expense", accountType: "Expense", description: "Costs related to advertising, promotions, and marketing campaigns." },
    { name: "Bank Fees and Charges", rootType: "Expense", accountType: "Expense", description: "Fees charged by banks for account maintenance and transactions." },
    { name: "Credit Card Charges", rootType: "Expense", accountType: "Expense", description: "Fees charged for credit card processing and transactions." },
    { name: "Travel Expense", rootType: "Expense", accountType: "Expense", description: "Costs for business travel including airfare, lodging, and transport." },
    { name: "Telephone Expense", rootType: "Expense", accountType: "Expense", description: "Costs for telephone and mobile communication." },
    { name: "Automobile Expense", rootType: "Expense", accountType: "Expense", description: "Costs related to company vehicles including fuel, insurance, and maintenance." },
    { name: "IT and Internet Expenses", rootType: "Expense", accountType: "Expense", description: "Costs for internet services, software subscriptions, and IT support." },
    { name: "Janitorial Expense", rootType: "Expense", accountType: "Expense", description: "Costs for cleaning and janitorial services." },
    { name: "Postage", rootType: "Expense", accountType: "Expense", description: "Costs of mailing and courier services." },
    { name: "Bad Debt", rootType: "Expense", accountType: "Expense", description: "Amounts owed by customers that are unlikely to be collected." },
    { name: "Printing and Stationery", rootType: "Expense", accountType: "Expense", description: "Costs of printing, stationery, and office supplies." },
    { name: "Salaries and Employee Wages", rootType: "Expense", accountType: "Expense", description: "Wages and salaries paid to employees." },
    { name: "Meals and Entertainment", rootType: "Expense", accountType: "Expense", description: "Costs for business meals and entertainment." },
    { name: "Depreciation Expense", rootType: "Expense", accountType: "Expense", description: "Periodic reduction in value of fixed assets." },
    { name: "Consultant Expense", rootType: "Expense", accountType: "Expense", description: "Fees paid to external consultants and advisors." },
    { name: "Repairs and Maintenance", rootType: "Expense", accountType: "Expense", description: "Costs of repairing and maintaining business assets." },
    { name: "Other Expenses", rootType: "Expense", accountType: "Expense", description: "Miscellaneous business expenses." },
    { name: "Lodging", rootType: "Expense", accountType: "Expense", description: "Costs for hotel and accommodation during business trips." },
    { name: "Fuel/Mileage Expenses", rootType: "Expense", accountType: "Expense", description: "Fuel costs and mileage-based expenses for business travel." },

    // Cost of Goods Sold
    { name: "Cost of Goods Sold", rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Direct costs attributable to the production of goods sold." },
    { name: "Labor", rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Labor costs directly related to production." },
    { name: "Materials", rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Cost of raw materials used in production." },
    { name: "Subcontractor", rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Payments to subcontractors for production work." },
    { name: "Job Costing", rootType: "Expense", accountType: "Cost Of Goods Sold", description: "Costs allocated to specific jobs or projects." },

    // Other Expense
    { name: "Exchange Gain or Loss", rootType: "Expense", accountType: "Other Expense", description: "Gains or losses due to foreign currency exchange rate fluctuations." },
  ];

  return template;
}