import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import CurrencyAdjustment from "../models/currency-adjustment.model";
import DocumentModel from "../models/document.model";
import Expense from "../models/expense.model";
import ExpenseCategory from "../models/expense-category.model";
import FixedAssetType from "../models/fixed-asset-type.model";
import GlEntry from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import Item from "../models/item.model";
import Journal from "../models/journal.model";
import Organization from "../models/organization.model";
import PaymentMade from "../models/payment-made.model";
import PaymentMode from "../models/payment-mode.model";
import PaymentReceived from "../models/payment-received.model";
import PurchaseOrder from "../models/purchase-order.model";
import RecurringBill from "../models/recurring-bill.model";
import RecurringExpense from "../models/recurring-expense.model";
import RecurringInvoice from "../models/recurring-invoice.model";
import RetainerInvoice from "../models/retainer-invoice.model";
import TcsTax from "../models/tcs-tax.model";
import TdsTax from "../models/tds-tax.model";
import VendorCredit from "../models/vendor-credit.model";
import { AuthenticatedRequest, AccountRootType, AccountType } from "../types";
import { attachUser } from "../plugins";
import {
  ensureDefaultChartOfAccounts,
  ensureTemplateSystemAccounts,
  resolveAccountCodeForAccount,
  validateAccountTypeForRootType,
} from "../services/chart-of-accounts.service";
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

function toTrimmedString(value: unknown): string {
  return String(value ?? "").trim();
}

async function resolveFixedAssetItemMapping(params: {
  organizationId: Types.ObjectId;
  accountType: AccountType;
  createItemAsFixedAssetRaw: unknown;
  fixedAssetTypeIdRaw: unknown;
}): Promise<{ createItemAsFixedAsset: boolean; fixedAssetTypeId: Types.ObjectId | null }> {
  const createItemAsFixedAsset = Boolean(params.createItemAsFixedAssetRaw);

  if (!createItemAsFixedAsset) {
    return { createItemAsFixedAsset: false, fixedAssetTypeId: null };
  }

  if (params.accountType !== "Fixed Asset") {
    throw new ValidationError(
      "Create Item as Fixed Asset can only be enabled for Fixed Asset accounts",
    );
  }

  const fixedAssetTypeId = String(params.fixedAssetTypeIdRaw || "").trim();
  if (!fixedAssetTypeId || !Types.ObjectId.isValid(fixedAssetTypeId)) {
    throw new ValidationError("fixedAssetTypeId is required when Create Item as Fixed Asset is enabled");
  }

  const exists = await FixedAssetType.exists({
    _id: new Types.ObjectId(fixedAssetTypeId),
    organizationId: params.organizationId,
    isDeleted: false,
    isActive: true,
  });

  if (!exists) {
    throw new ValidationError("Selected Fixed Asset Type was not found");
  }

  return {
    createItemAsFixedAsset: true,
    fixedAssetTypeId: new Types.ObjectId(fixedAssetTypeId),
  };
}

function parseDateParam(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return parsed;
}

function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toPositiveInt(value: unknown, fallback: number, min = 1, max = 500): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const parsed = Math.trunc(n);
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
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

async function ensureOrgChartInitialized(req: AuthenticatedRequest, organizationId: Types.ObjectId) {
  await ensureDefaultChartOfAccounts({ organizationId, actor: req });
  await ensureTemplateSystemAccounts({ organizationId });
}

async function findAccountUsageArea(accountId: Types.ObjectId, organizationId: Types.ObjectId): Promise<string | null> {
  const checks: Array<{ area: string; exists: () => Promise<unknown> }> = [
    {
      area: "General Ledger entries",
      exists: () => GlEntry.exists({ organizationId, accountId }),
    },
    {
      area: "Bills",
      exists: () => Bill.exists({
        organizationId,
        $or: [
          { "lineItems.accountId": accountId },
          { accountsPayableId: accountId },
          { discountAccountId: accountId },
        ],
      }),
    },
    {
      area: "Invoices",
      exists: () => Invoice.exists({ organizationId, "items.accountId": accountId }),
    },
    {
      area: "Expenses",
      exists: () => Expense.exists({
        organizationId,
        $or: [
          { expenseAccountId: accountId },
          { "lineItems.expenseAccountId": accountId },
          { paidThroughAccountId: accountId },
        ],
      }),
    },
    {
      area: "Purchase Orders",
      exists: () => PurchaseOrder.exists({
        organizationId,
        $or: [{ "lineItems.accountId": accountId }, { discountAccountId: accountId }],
      }),
    },
    {
      area: "Recurring Bills",
      exists: () => RecurringBill.exists({
        organizationId,
        $or: [{ "lineItems.accountId": accountId }, { discountAccountId: accountId }],
      }),
    },
    {
      area: "Recurring Invoices",
      exists: () => RecurringInvoice.exists({ organizationId, "items.accountId": accountId }),
    },
    {
      area: "Retainer Invoices",
      exists: () =>
        RetainerInvoice.exists({
          organization_id: organizationId,
          $or: [{ deposited_to_account: accountId }],
        }),
    },
    {
      area: "Recurring Expenses",
      exists: () => RecurringExpense.exists({
        organizationId,
        $or: [{ expenseAccountId: accountId }, { paidThroughAccountId: accountId }],
      }),
    },
    {
      area: "Vendor Credits",
      exists: () => VendorCredit.exists({ organizationId, "lineItems.accountId": accountId }),
    },
    {
      area: "Contacts",
      exists: () =>
        Contact.exists({
          organizationId,
          $or: [{ accountsPayableId: accountId }, { accountsReceivableId: accountId }],
        }),
    },
    {
      area: "Items",
      exists: () => Item.exists({
        organizationId,
        $or: [
          { salesAccountId: accountId },
          { purchaseAccountId: accountId },
          { inventoryAccountId: accountId },
        ],
      }),
    },
    {
      area: "Organization default accounts",
      exists: () => Organization.exists({
        _id: organizationId,
        $or: [
          { "defaultAccounts.bankAccount": accountId },
          { "defaultAccounts.cashAccount": accountId },
          { "defaultAccounts.receivableAccount": accountId },
          { "defaultAccounts.payableAccount": accountId },
          { "defaultAccounts.incomeAccount": accountId },
          { "defaultAccounts.expenseAccount": accountId },
          { "defaultAccounts.roundOffAccount": accountId },
          { "defaultAccounts.exchangeGainLossAccount": accountId },
          { "defaultAccounts.retainedEarningsAccount": accountId },
        ],
      }),
    },
    {
      area: "Payment Made records",
      exists: () => PaymentMade.exists({
        organization_id: organizationId,
        $or: [{ paid_through_account: accountId }, { deposit_to_account: accountId }],
      }),
    },
    {
      area: "Payment Received records",
      exists: () => PaymentReceived.exists({ organization_id: organizationId, deposited_to_account: accountId }),
    },
    {
      area: "Payment Modes",
      exists: () => PaymentMode.exists({ organizationId, accountId }),
    },
    {
      area: "Expense Categories",
      exists: () => ExpenseCategory.exists({ organizationId, accountId }),
    },
    {
      area: "Currency Adjustments",
      exists: () => CurrencyAdjustment.exists({ organizationId, "lines.accountId": accountId }),
    },
    {
      area: "Journals",
      exists: () => Journal.exists({ organizationId, "lineItems.accountId": accountId }),
    },
    {
      area: "TDS Taxes",
      exists: () => TdsTax.exists({
        organizationId,
        $or: [{ tdsPayableAccountId: accountId }, { tdsReceivableAccountId: accountId }],
      }),
    },
    {
      area: "TCS Taxes",
      exists: () => TcsTax.exists({
        organizationId,
        $or: [{ tcsPayableAccountId: accountId }, { tcsReceivableAccountId: accountId }],
      }),
    },
  ];

  for (const check of checks) {
    if (await check.exists()) return check.area;
  }

  return null;
}

// ─── Controllers ───────────────────────────────────────────────────────────

/** GET /api/accounts  — return flat list for the active org (supports ?rootType=Income,Expense) */
export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req) as Types.ObjectId;
  await ensureOrgChartInitialized(req, organizationId);

  const filter: Record<string, unknown> = { organizationId, isDeleted: false };
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

/** GET /api/accounts/:id/details */
export const details = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req) as Types.ObjectId;
  const accountId = String(req.params.id || "").trim();
  if (!Types.ObjectId.isValid(accountId)) {
    throw new ValidationError("Invalid account id");
  }

  const accountObjectId = new Types.ObjectId(accountId);
  const page = toPositiveInt(req.query.page, 1, 1, 100000);
  const limit = toPositiveInt(req.query.limit, 12, 1, 200);
  const from = parseDateParam(req.query.from, "from");
  const to = parseDateParam(req.query.to, "to");

  if (from && to && startOfDay(from) > endOfDay(to)) {
    throw new ValidationError("from must be before or equal to to");
  }

  const account = await Account.findOne({
    _id: accountObjectId,
    organizationId,
    isDeleted: false,
  }).lean();

  if (!account) throw new NotFoundError("Account");

  const glMatch: Record<string, unknown> = {
    organizationId,
    accountId: accountObjectId,
  };

  const postingDateFilter: Record<string, Date> = {};
  if (from) postingDateFilter.$gte = startOfDay(from);
  if (to) postingDateFilter.$lte = endOfDay(to);
  if (Object.keys(postingDateFilter).length > 0) {
    glMatch.postingDate = postingDateFilter;
  }

  const skip = (page - 1) * limit;

  const [
    aggregateRows,
    transactionCount,
    transactionRows,
    voucherRows,
    currencyRows,
    firstEntry,
    lastEntry,
    billsCount,
    invoicesCount,
    expensesCount,
    purchaseOrdersCount,
    recurringBillsCount,
    recurringInvoicesCount,
    recurringExpensesCount,
    vendorCreditsCount,
    journalsCount,
    paymentMadeCount,
    paymentReceivedCount,
    contactsCount,
    itemsCount,
    paymentModesCount,
    expenseCategoriesCount,
    currencyAdjustmentsCount,
    tdsTaxesCount,
    tcsTaxesCount,
    attachmentsCount,
    attachmentRows,
  ] = await Promise.all([
    GlEntry.aggregate([
      { $match: glMatch },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: { $ifNull: ["$debit", 0] } },
          totalCredit: { $sum: { $ifNull: ["$credit", 0] } },
        },
      },
    ]),
    GlEntry.countDocuments(glMatch),
    GlEntry.find(glMatch)
      .populate("contactId", "displayName companyName")
      .sort({ postingDate: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GlEntry.aggregate([
      { $match: glMatch },
      { $group: { _id: "$voucherType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    GlEntry.aggregate([
      { $match: glMatch },
      { $group: { _id: "$currency" } },
      { $sort: { _id: 1 } },
    ]),
    GlEntry.findOne(glMatch).select("postingDate").sort({ postingDate: 1, _id: 1 }).lean(),
    GlEntry.findOne(glMatch).select("postingDate").sort({ postingDate: -1, _id: -1 }).lean(),
    Bill.countDocuments({
      organizationId,
      $or: [
        { "lineItems.accountId": accountObjectId },
        { accountsPayableId: accountObjectId },
        { discountAccountId: accountObjectId },
      ],
    }),
    Invoice.countDocuments({ organizationId, "items.accountId": accountObjectId }),
    Expense.countDocuments({
      organizationId,
      $or: [
        { expenseAccountId: accountObjectId },
        { "lineItems.expenseAccountId": accountObjectId },
        { paidThroughAccountId: accountObjectId },
      ],
    }),
    PurchaseOrder.countDocuments({
      organizationId,
      $or: [{ "lineItems.accountId": accountObjectId }, { discountAccountId: accountObjectId }],
    }),
    RecurringBill.countDocuments({
      organizationId,
      $or: [{ "lineItems.accountId": accountObjectId }, { discountAccountId: accountObjectId }],
    }),
    RecurringInvoice.countDocuments({ organizationId, "items.accountId": accountObjectId }),
    RecurringExpense.countDocuments({
      organizationId,
      $or: [{ expenseAccountId: accountObjectId }, { paidThroughAccountId: accountObjectId }],
    }),
    VendorCredit.countDocuments({ organizationId, "lineItems.accountId": accountObjectId }),
    Journal.countDocuments({ organizationId, "lineItems.accountId": accountObjectId }),
    PaymentMade.countDocuments({
      organization_id: organizationId,
      $or: [{ paid_through_account: accountObjectId }, { deposit_to_account: accountObjectId }],
    }),
    PaymentReceived.countDocuments({
      organization_id: organizationId,
      deposited_to_account: accountObjectId,
    }),
    Contact.countDocuments({
      organizationId,
      $or: [{ accountsPayableId: accountObjectId }, { accountsReceivableId: accountObjectId }],
    }),
    Item.countDocuments({
      organizationId,
      $or: [
        { salesAccountId: accountObjectId },
        { purchaseAccountId: accountObjectId },
        { inventoryAccountId: accountObjectId },
      ],
    }),
    PaymentMode.countDocuments({ organizationId, accountId: accountObjectId }),
    ExpenseCategory.countDocuments({ organizationId, accountId: accountObjectId }),
    CurrencyAdjustment.countDocuments({ organizationId, "lines.accountId": accountObjectId }),
    TdsTax.countDocuments({
      organizationId,
      $or: [
        { tdsPayableAccountId: accountObjectId },
        { tdsReceivableAccountId: accountObjectId },
      ],
    }),
    TcsTax.countDocuments({
      organizationId,
      $or: [
        { tcsPayableAccountId: accountObjectId },
        { tcsReceivableAccountId: accountObjectId },
      ],
    }),
    DocumentModel.countDocuments({
      organizationId,
      isDeleted: false,
      links: { $elemMatch: { entityType: "account", entityId: accountId } },
    }),
    DocumentModel.find({
      organizationId,
      isDeleted: false,
      links: { $elemMatch: { entityType: "account", entityId: accountId } },
    })
      .select("fileName mimeType extension sizeBytes url uploadedAt processingStatus")
      .sort({ uploadedAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const aggregate = (aggregateRows?.[0] || {}) as { totalDebit?: number; totalCredit?: number };
  const totalDebitBCY = round2(Number(aggregate.totalDebit || 0));
  const totalCreditBCY = round2(Number(aggregate.totalCredit || 0));
  const movementBCY = round2(totalDebitBCY - totalCreditBCY);
  const openingBalanceBCY = round2(Number(account.openingBalance || 0));
  const closingBalanceBCY = round2(openingBalanceBCY + movementBCY);

  type PopulatedContact = { displayName?: string; companyName?: string } | null;
  type TransactionRow = {
    _id: Types.ObjectId;
    postingDate: Date;
    voucherType: string;
    voucherId: string;
    voucherNo: string;
    description?: string;
    contactType?: string;
    contactId?: PopulatedContact;
    currency?: string;
    exchangeRate?: number;
    debit?: number;
    credit?: number;
    isReversal?: boolean;
    createdAt?: Date;
  };

  const transactions = (transactionRows as TransactionRow[]).map((entry) => {
    const debitBCY = round2(Number(entry.debit || 0));
    const creditBCY = round2(Number(entry.credit || 0));
    const exchangeRate = Number(entry.exchangeRate || 1);
    const safeRate = exchangeRate > 0 ? exchangeRate : 1;
    const debitFCY = round2(debitBCY / safeRate);
    const creditFCY = round2(creditBCY / safeRate);
    const contactName = entry.contactId
      ? entry.contactId.displayName || entry.contactId.companyName || null
      : null;

    return {
      id: String(entry._id),
      postingDate: entry.postingDate,
      voucherType: entry.voucherType,
      voucherId: entry.voucherId,
      voucherNo: entry.voucherNo,
      description: entry.description || "",
      contactType: entry.contactType || "None",
      contactName,
      currency: entry.currency || "",
      exchangeRate: round2(safeRate),
      debitBCY,
      creditBCY,
      amountBCY: round2(debitBCY - creditBCY),
      debitFCY,
      creditFCY,
      amountFCY: round2(debitFCY - creditFCY),
      isReversal: Boolean(entry.isReversal),
      createdAt: entry.createdAt || entry.postingDate,
    };
  });

  const vouchersByType: Record<string, number> = {};
  for (const row of voucherRows as Array<{ _id: string; count: number }>) {
    const key = String(row._id || "");
    if (!key) continue;
    vouchersByType[key] = Number(row.count || 0);
  }

  const currencies = (currencyRows as Array<{ _id: string | null }>)
    .map((row) => String(row._id || "").trim())
    .filter(Boolean);

  type AttachmentRow = {
    _id: Types.ObjectId;
    fileName?: string;
    mimeType?: string;
    extension?: string;
    sizeBytes?: number;
    url?: string;
    uploadedAt?: Date;
    processingStatus?: string;
  };

  const attachments = (attachmentRows as AttachmentRow[]).map((row) => ({
    id: String(row._id),
    fileName: row.fileName || "Untitled",
    mimeType: row.mimeType || "application/octet-stream",
    extension: row.extension || "",
    sizeBytes: Number(row.sizeBytes || 0),
    url: row.url || "",
    uploadedAt: row.uploadedAt || null,
    processingStatus: row.processingStatus || "PROCESSING",
  }));

  const pages = transactionCount === 0 ? 1 : Math.ceil(transactionCount / limit);

  res.json({
    success: true,
    data: {
      account,
      summary: {
        openingBalanceBCY,
        totalDebitBCY,
        totalCreditBCY,
        movementBCY,
        closingBalanceBCY,
        closingBalanceSide:
          closingBalanceBCY > 0 ? "Debit" : closingBalanceBCY < 0 ? "Credit" : "Zero",
        transactionCount,
        currencies,
        firstPostingDate: firstEntry?.postingDate || null,
        lastPostingDate: lastEntry?.postingDate || null,
      },
      vouchersByType,
      linkage: {
        glEntries: transactionCount,
        bills: billsCount,
        invoices: invoicesCount,
        expenses: expensesCount,
        purchaseOrders: purchaseOrdersCount,
        recurringBills: recurringBillsCount,
        recurringInvoices: recurringInvoicesCount,
        recurringExpenses: recurringExpensesCount,
        vendorCredits: vendorCreditsCount,
        journals: journalsCount,
        paymentMade: paymentMadeCount,
        paymentReceived: paymentReceivedCount,
        contacts: contactsCount,
        items: itemsCount,
        paymentModes: paymentModesCount,
        expenseCategories: expenseCategoriesCount,
        currencyAdjustments: currencyAdjustmentsCount,
        tdsTaxes: tdsTaxesCount,
        tcsTaxes: tcsTaxesCount,
        documents: attachmentsCount,
      },
      attachments,
      transactions,
      pagination: {
        page,
        limit,
        total: transactionCount,
        pages,
        hasMore: page < pages,
      },
      filters: {
        from,
        to,
      },
    },
  });
});

/**
 * GET /api/accounts/for-item?section=sales|purchase
 * Returns accounts grouped by accountType for use in item form dropdowns.
 * sales   → rootType Income
 * purchase → rootType Expense (Cost Of Goods Sold + Expense)
 */
export const listForItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req) as Types.ObjectId;
  await ensureOrgChartInitialized(req, organizationId);

  const section = (req.query.section as string) ?? "sales";
  const rootTypes = section === "purchase" ? ["Expense"] : ["Income"];
  const accounts = await Account.find({
    organizationId,
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
  const organizationId = orgId(req) as Types.ObjectId;
  await ensureOrgChartInitialized(req, organizationId);

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
  const organizationId = orgId(req) as Types.ObjectId;

  const name = String(req.body.name || "").trim();
  if (!name) throw new ValidationError("Account name is required");

  const rootType = req.body.rootType as AccountRootType;
  const accountType = req.body.accountType as AccountType;
  if (!rootType) throw new ValidationError("rootType is required");
  if (!accountType) throw new ValidationError("accountType is required");
  validateAccountTypeForRootType(rootType, accountType);

  const fixedAssetItemMapping = await resolveFixedAssetItemMapping({
    organizationId,
    accountType,
    createItemAsFixedAssetRaw: req.body.createItemAsFixedAsset,
    fixedAssetTypeIdRaw: req.body.fixedAssetTypeId,
  });

  const parentIdInput = req.body.parentId;
  let parentId: Types.ObjectId | null = null;
  if (parentIdInput !== undefined && parentIdInput !== null && parentIdInput !== "") {
    if (!Types.ObjectId.isValid(String(parentIdInput))) {
      throw new ValidationError("parentId must be a valid account id");
    }
    parentId = new Types.ObjectId(String(parentIdInput));
  }

  const code = await resolveAccountCodeForAccount({
    organizationId,
    rootType,
    accountType,
    requestedCode: req.body.code,
  });

  // Duplicate check within same org + parent
  const dup = await Account.findOne({ organizationId, name, parentId: parentId ?? null });
  if (dup) throw new ValidationError(`Account "${name}" already exists here`);

  const account = new Account({
    organizationId,
    name,
    code,
    accountNumber: accountType === "Bank" ? toTrimmedString(req.body.accountNumber) : "",
    ifsc: accountType === "Bank" ? toTrimmedString(req.body.ifsc) : "",
    parentId,
    rootType, accountType,
    isGroup: Boolean(req.body.isGroup),
    currency: toTrimmedString(req.body.currency),
    description: toTrimmedString(req.body.description),
    createItemAsFixedAsset: fixedAssetItemMapping.createItemAsFixedAsset,
    fixedAssetTypeId: fixedAssetItemMapping.fixedAssetTypeId,
  });
  attachUser(account, req);
  await account.save();
  res.status(201).json({ success: true, data: account });
});

/** PATCH /api/accounts/:id */
export const update = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req) as Types.ObjectId;
  await ensureTemplateSystemAccounts({ organizationId });

  const account = await Account.findOne({ _id: req.params.id, organizationId });
  if (!account) throw new NotFoundError("Account");

  if (account.isSystemAccount) {
    if (req.body.rootType !== undefined && req.body.rootType !== account.rootType) {
      throw new ValidationError("Predefined accounts cannot change root type");
    }
    if (req.body.accountType !== undefined && req.body.accountType !== account.accountType) {
      throw new ValidationError("Predefined accounts cannot change account type");
    }
  }

  const nextRootType = (req.body.rootType ?? account.rootType) as AccountRootType;
  const nextAccountType = (req.body.accountType ?? account.accountType) as AccountType;
  validateAccountTypeForRootType(nextRootType, nextAccountType);

  if (req.body.name !== undefined) {
    const nextName = String(req.body.name).trim();
    if (!nextName) throw new ValidationError("Account name cannot be empty");
    account.name = nextName;
  }

  if (req.body.description !== undefined) account.description = toTrimmedString(req.body.description);
  if (req.body.currency !== undefined) account.currency = toTrimmedString(req.body.currency);
  if (req.body.accountNumber !== undefined) account.accountNumber = toTrimmedString(req.body.accountNumber);
  if (req.body.ifsc !== undefined) account.ifsc = toTrimmedString(req.body.ifsc);
  if (req.body.isActive !== undefined) account.isActive = Boolean(req.body.isActive);
  if (req.body.isGroup !== undefined) account.isGroup = Boolean(req.body.isGroup);

  if (req.body.parentId !== undefined) {
    const parentIdInput = req.body.parentId;
    if (parentIdInput === null || parentIdInput === "") {
      account.parentId = null;
    } else {
      if (!Types.ObjectId.isValid(String(parentIdInput))) {
        throw new ValidationError("parentId must be a valid account id");
      }
      account.parentId = new Types.ObjectId(String(parentIdInput));
    }
  }

  if (account.parentId && String(account.parentId) === String(account._id)) {
    throw new ValidationError("An account cannot be a parent of itself");
  }

  account.rootType = nextRootType;
  account.accountType = nextAccountType;

  const fixedAssetItemMapping = await resolveFixedAssetItemMapping({
    organizationId,
    accountType: nextAccountType,
    createItemAsFixedAssetRaw:
      req.body.createItemAsFixedAsset !== undefined
        ? req.body.createItemAsFixedAsset
        : nextAccountType === "Fixed Asset"
          ? (account as any).createItemAsFixedAsset
          : false,
    fixedAssetTypeIdRaw:
      req.body.fixedAssetTypeId !== undefined
        ? req.body.fixedAssetTypeId
        : nextAccountType === "Fixed Asset"
          ? (account as any).fixedAssetTypeId
          : null,
  });

  (account as any).createItemAsFixedAsset = fixedAssetItemMapping.createItemAsFixedAsset;
  (account as any).fixedAssetTypeId = fixedAssetItemMapping.fixedAssetTypeId;

  if (account.accountType !== "Bank") {
    account.accountNumber = "";
    account.ifsc = "";
  }

  const shouldResolveCode =
    req.body.code !== undefined ||
    req.body.rootType !== undefined ||
    req.body.accountType !== undefined ||
    !String(account.code || "").trim();

  if (shouldResolveCode) {
    account.code = await resolveAccountCodeForAccount({
      organizationId,
      rootType: nextRootType,
      accountType: nextAccountType,
      requestedCode: req.body.code !== undefined ? req.body.code : account.code,
      excludeAccountId: account._id,
    });
  }

  if (req.body.name !== undefined || req.body.parentId !== undefined) {
    const duplicate = await Account.findOne({
      organizationId,
      name: account.name,
      parentId: account.parentId ?? null,
      _id: { $ne: account._id },
    });

    if (duplicate) {
      throw new ValidationError(`Account "${account.name}" already exists here`);
    }
  }

  attachUser(account, req);
  await account.save();
  res.json({ success: true, data: account });
});

/** DELETE /api/accounts/:id */
export const remove = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req) as Types.ObjectId;
  await ensureTemplateSystemAccounts({ organizationId });

  const account = await Account.findOne({ _id: req.params.id, organizationId });
  if (!account) throw new NotFoundError("Account");

  if (account.isSystemAccount) {
    throw new ValidationError("Predefined accounts cannot be deleted");
  }

  const opening = Number(account.openingBalance || 0);
  const running = Number(account.balance || 0);
  if (Math.abs(opening) > 0.009 || Math.abs(running) > 0.009) {
    throw new ValidationError("Cannot delete account with non-zero balance. Mark it inactive instead.");
  }

  // Check for child accounts
  const hasChildren = await Account.exists({ parentId: account._id, isDeleted: false });
  if (hasChildren) throw new ValidationError("Cannot delete an account that has sub-accounts");

  const usageArea = await findAccountUsageArea(account._id as Types.ObjectId, organizationId);
  if (usageArea) {
    throw new ValidationError(`Cannot delete account because it is used in ${usageArea}. Mark it inactive instead.`);
  }

  account.isDeleted = true;
  account.deletedAt = new Date();
  attachUser(account, req);
  await account.save();
  res.json({ success: true, message: "Account deleted" });
});

/** POST /api/accounts/seed-template — seed standard Indian CoA (Zoho Books style) */
export const seedTemplate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organization = orgId(req) as Types.ObjectId;
  const seeded = await ensureDefaultChartOfAccounts({ organizationId: organization, actor: req });
  const { locked } = await ensureTemplateSystemAccounts({ organizationId: organization });

  res.status(201).json({
    success: true,
    message:
      seeded.created > 0 ?
        "Chart of Accounts template synchronized"
      : "Chart of Accounts template already up to date",
    data: {
      ...seeded,
      locked,
    },
  });
});
