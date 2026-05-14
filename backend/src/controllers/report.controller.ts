import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import Expense from "../models/expense.model";
import GlEntry from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import InventoryAdjustment from "../models/inventory-adjustment.model";
import Item from "../models/item.model";
import PaymentMade from "../models/payment-made.model";
import PaymentInvoiceMap from "../models/payment-invoice-map.model";
import PaymentReceived from "../models/payment-received.model";
import PurchaseOrder from "../models/purchase-order.model";
import SalesOrder from "../models/sales-order.model";
import DeliveryChallan from "../models/delivery-challan.model";
import VendorCredit from "../models/vendor-credit.model";
import { reconcileInventoryOpeningBalances } from "../services/inventory-opening.service";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, ValidationError } from "../utils/errors";

type AccountRow = {
  _id: Types.ObjectId;
  name: string;
  code?: string;
  rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  accountType: string;
  openingBalance?: number;
};

type DashboardBasis = "accrual" | "cash";

type DashboardAccountRow = {
  _id: Types.ObjectId;
  name: string;
  accountType: string;
  rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  openingBalance?: number;
};

type AgingBuckets = {
  current: number;
  "1-15": number;
  "16-30": number;
  "31-45": number;
  "above-45": number;
};

const SALES_ORDER_COMMITTED_STATUSES: ReadonlyArray<string> = [
  "APPROVED",
  "PARTIALLY_INVOICED",
  "OVERDUE",
];

const PURCHASE_ORDER_PENDING_STATUSES: ReadonlyArray<string> = [
  "Draft",
  "Open",
];

const INVENTORY_RELATED_INVOICE_STATUSES: ReadonlyArray<string> = [
  "Sent",
  "Viewed",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const INVENTORY_RELATED_BILL_STATUSES: ReadonlyArray<string> = [
  "Open",
  "Overdue",
  "Partially Paid",
  "Paid",
];

const MILLIS_IN_DAY = 1000 * 60 * 60 * 24;

function orgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function parseDate(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} must be a valid date`);
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

function defaultFrom(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function defaultTo(): Date {
  return endOfDay(new Date());
}

function ensureFromBeforeTo(from: Date, to: Date, fromLabel = "from", toLabel = "to"): void {
  if (startOfDay(from).getTime() > endOfDay(to).getTime()) {
    throw new ValidationError(`${fromLabel} must be before or equal to ${toLabel}`);
  }
}

function toBoundedInt(value: unknown, fallback: number, min = 1, max = 100): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const parsed = Math.trunc(n);
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseDashboardBasis(value: unknown, label: string, fallback: DashboardBasis = "accrual"): DashboardBasis {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "accrual" || raw === "cash") return raw;
  throw new ValidationError(`${label} must be either accrual or cash`);
}

function monthKeyFromDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string): string {
  const [year, month] = key.split("-").map((v) => Number(v));
  const d = new Date(year, Math.max(0, month - 1), 1);
  return d.toLocaleDateString("en-IN", { month: "short" });
}

function enumerateMonthKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  while (cursor <= end) {
    keys.push(monthKeyFromDate(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return keys;
}

function addToNumberMap(map: Map<string, number>, key: string, amount: number): void {
  const current = map.get(key) || 0;
  map.set(key, round2(current + amount));
}

function isWithinDateRange(value: Date, from: Date, to: Date): boolean {
  const time = value.getTime();
  return time >= startOfDay(from).getTime() && time <= endOfDay(to).getTime();
}

function normalizeObjectId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return Types.ObjectId.isValid(value) ? value : "";
  if (typeof value === "object" && value !== null && "_id" in (value as Record<string, unknown>)) {
    const nested = String((value as { _id?: unknown })._id || "");
    return Types.ObjectId.isValid(nested) ? nested : "";
  }
  const raw = String(value);
  return Types.ObjectId.isValid(raw) ? raw : "";
}

function ageInDays(from: Date, to: Date): number {
  const diff = endOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(diff / MILLIS_IN_DAY));
}

function inventoryAgeBucket(days: number): "0-30 Days" | "31-60 Days" | "61-90 Days" | "Above 90 Days" {
  if (days <= 30) return "0-30 Days";
  if (days <= 60) return "31-60 Days";
  if (days <= 90) return "61-90 Days";
  return "Above 90 Days";
}

function computeStockStatus(params: {
  stockOnHand: number;
  reorderPoint: number;
  availableForSale: number;
}): "Out of Stock" | "Low Stock" | "Fully Committed" | "In Stock" {
  if (params.stockOnHand <= 0) return "Out of Stock";
  if (params.reorderPoint > 0 && params.stockOnHand <= params.reorderPoint) return "Low Stock";
  if (params.availableForSale <= 0) return "Fully Committed";
  return "In Stock";
}

function percent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return round2((part / total) * 100);
}

function createAgingBuckets(): AgingBuckets {
  return {
    current: 0,
    "1-15": 0,
    "16-30": 0,
    "31-45": 0,
    "above-45": 0,
  };
}

function sumAgingBuckets(buckets: AgingBuckets): number {
  return round2(
    buckets.current +
    buckets["1-15"] +
    buckets["16-30"] +
    buckets["31-45"] +
    buckets["above-45"],
  );
}

function closingBalanceForAccount(
  account: DashboardAccountRow,
  movement: { debit: number; credit: number },
): number {
  const signed = round2(Number(account.openingBalance || 0) + movement.debit - movement.credit);
  if (account.rootType === "Liability" || account.rootType === "Equity" || account.rootType === "Income") {
    return round2(-signed);
  }
  return signed;
}

async function loadAccounts(organizationId: Types.ObjectId): Promise<Map<string, AccountRow>> {
  const rows = (await Account.find({
    organizationId,
    isDeleted: false,
    isGroup: false,
  })
    .select("name code rootType accountType openingBalance")
    .lean()) as AccountRow[];

  return new Map(rows.map((row) => [String(row._id), row]));
}

async function loadMovementMap(params: {
  organizationId: Types.ObjectId;
  from?: Date | null;
  to?: Date | null;
  asOf?: Date | null;
  accountIds?: Types.ObjectId[];
}): Promise<Map<string, { debit: number; credit: number }>> {
  const match: any = { organizationId: params.organizationId };

  if (params.accountIds && params.accountIds.length > 0) {
    match.accountId = { $in: params.accountIds };
  }

  if (params.asOf) {
    match.postingDate = { $lte: endOfDay(params.asOf) };
  } else if (params.from || params.to) {
    match.postingDate = {};
    if (params.from) match.postingDate.$gte = startOfDay(params.from);
    if (params.to) match.postingDate.$lte = endOfDay(params.to);
  }

  const rows = await GlEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$accountId",
        debit: { $sum: { $ifNull: ["$debit", 0] } },
        credit: { $sum: { $ifNull: ["$credit", 0] } },
      },
    },
  ]);

  const out = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    out.set(String(row._id), {
      debit: round2(Number(row.debit || 0)),
      credit: round2(Number(row.credit || 0)),
    });
  }

  return out;
}

async function reconcileInventoryOpeningsSafely(organizationId: Types.ObjectId): Promise<void> {
  try {
    await reconcileInventoryOpeningBalances({ organizationId });
  } catch {
    // Report rendering should still work even if reconciliation cannot run.
  }
}

// --- FINANCIAL STATEMENT REPORTS ---

export const trialBalance = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf");

  // Removed automatic reconciliation to prevent double-deduction after transactions.

  const [accountMap, movementMap] = await Promise.all([
    loadAccounts(organizationId),
    loadMovementMap({ organizationId, asOf }),
  ]);

  const rows = Array.from(accountMap.entries())
    .map(([accountId, account]) => {
      const movement = movementMap.get(accountId) || { debit: 0, credit: 0 };
      const openingSigned = round2(Number(account.openingBalance || 0));
      const openingDebit = openingSigned > 0 ? openingSigned : 0;
      const openingCredit = openingSigned < 0 ? Math.abs(openingSigned) : 0;

      const totalDebit = round2(openingDebit + movement.debit);
      const totalCredit = round2(openingCredit + movement.credit);
      const closingSigned = round2(totalDebit - totalCredit);
      if (Math.abs(closingSigned) < 0.009) return null;

      return {
        accountId,
        code: account.code || "",
        name: account.name,
        rootType: account.rootType,
        accountType: account.accountType,
        openingDebit,
        openingCredit,
        totalDebit,
        totalCredit,
        closingDebit: closingSigned > 0 ? closingSigned : 0,
        closingCredit: closingSigned < 0 ? Math.abs(closingSigned) : 0,
      };
    })
    .filter(Boolean) as any[];

  rows.sort((a, b) =>
    a.rootType === b.rootType
      ? String(a.name).localeCompare(String(b.name))
      : String(a.rootType).localeCompare(String(b.rootType)),
  );

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalDebit = round2(acc.totalDebit + row.closingDebit);
      acc.totalCredit = round2(acc.totalCredit + row.closingCredit);
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 },
  );

  res.json({
    success: true,
    data: {
      asOf: asOf || new Date(),
      rows,
      totals: {
        ...totals,
        difference: round2(Math.abs(totals.totalDebit - totals.totalCredit)),
      },
    },
  });
});

export const profitAndLoss = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from");
  const to = parseDate(req.query.to, "to");
  if (!from || !to) throw new ValidationError("from and to are required for profit-loss report");

  const [accountMap, movementMap] = await Promise.all([
    loadAccounts(organizationId),
    loadMovementMap({ organizationId, from, to }),
  ]);

  const income: any[] = [];
  const expenses: any[] = [];

  for (const [accountId, movement] of movementMap.entries()) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.rootType === "Income") {
      const amount = round2(movement.credit - movement.debit);
      if (Math.abs(amount) < 0.009) continue;
      income.push({ accountId, code: account.code || "", name: account.name, amount });
    } else if (account.rootType === "Expense") {
      const amount = round2(movement.debit - movement.credit);
      if (Math.abs(amount) < 0.009) continue;
      expenses.push({ accountId, code: account.code || "", name: account.name, amount });
    }
  }

  income.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  expenses.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const totalIncome = round2(income.reduce((sum, row) => sum + row.amount, 0));
  const totalExpense = round2(expenses.reduce((sum, row) => sum + row.amount, 0));

  res.json({
    success: true,
    data: {
      from, to, income, expenses,
      totals: { totalIncome, totalExpense, netProfit: round2(totalIncome - totalExpense) },
    },
  });
});

export const balanceSheet = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();

  // Removed automatic reconciliation to prevent double-deduction after transactions.

  const [accountMap, movementMap] = await Promise.all([
    loadAccounts(organizationId),
    loadMovementMap({ organizationId, asOf }),
  ]);

  const assets: any[] = [];
  const liabilities: any[] = [];
  const equity: any[] = [];
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const [accountId, account] of accountMap.entries()) {
    const movement = movementMap.get(accountId) || { debit: 0, credit: 0 };
    const signed = round2(Number(account.openingBalance || 0) + movement.debit - movement.credit);

    if (account.rootType === "Asset") {
      const amount = signed;
      if (Math.abs(amount) < 0.009) continue;
      assets.push({ accountId, code: account.code || "", name: account.name, accountType: account.accountType, amount });
    } else if (account.rootType === "Liability") {
      const amount = round2(-signed);
      if (Math.abs(amount) < 0.009) continue;
      liabilities.push({ accountId, code: account.code || "", name: account.name, accountType: account.accountType, amount });
    } else if (account.rootType === "Equity") {
      const amount = round2(-signed);
      if (Math.abs(amount) < 0.009) continue;
      equity.push({ accountId, code: account.code || "", name: account.name, accountType: account.accountType, amount });
    } else if (account.rootType === "Income") {
      incomeTotal = round2(incomeTotal + (-signed));
    } else if (account.rootType === "Expense") {
      expenseTotal = round2(expenseTotal + signed);
    }
  }

  const currentEarnings = round2(incomeTotal - expenseTotal);
  if (Math.abs(currentEarnings) >= 0.009) {
    equity.push({ accountId: "__current_earnings__", code: "", name: "Current Earnings", accountType: "Equity", amount: currentEarnings });
  }

  [assets, liabilities, equity].forEach((arr) => arr.sort((a, b) => String(a.name).localeCompare(String(b.name))));

  const totalAssets = round2(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalEquity = round2(equity.reduce((sum, row) => sum + row.amount, 0));

  res.json({
    success: true,
    data: {
      asOf, assets, liabilities, equity,
      totals: { totalAssets, totalLiabilities, totalEquity, equationDifference: round2(totalAssets - (totalLiabilities + totalEquity)) },
    },
  });
});

export const controlReconciliation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf");

  const [arAccounts, apAccounts] = await Promise.all([
    Account.find({ organizationId, isDeleted: false, isGroup: false, accountType: "Accounts Receivable" }).select("name code openingBalance").lean(),
    Account.find({ organizationId, isDeleted: false, isGroup: false, accountType: "Accounts Payable" }).select("name code openingBalance").lean(),
  ]);

  const [arMovement, apMovement, receivableRows, payableRows] = await Promise.all([
    loadMovementMap({ organizationId, asOf, accountIds: arAccounts.map((a: any) => a._id) }),
    loadMovementMap({ organizationId, asOf, accountIds: apAccounts.map((a: any) => a._id) }),
    Invoice.aggregate([
      { $match: { organizationId, isDeleted: false, status: { $nin: ["Draft", "Void"] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$balanceDue", 0] } } } },
    ]),
    Bill.aggregate([
      { $match: { organizationId, isDeleted: false, status: { $nin: ["Draft", "Void"] } } },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$balanceDue", 0] } } } },
    ]),
  ]);

  const glReceivable = round2(
    arAccounts.reduce((sum, account: any) => {
      const movement = arMovement.get(String(account._id)) || { debit: 0, credit: 0 };
      const signed = round2(Number(account.openingBalance || 0) + movement.debit - movement.credit);
      return sum + signed;
    }, 0),
  );
  const glPayable = round2(
    apAccounts.reduce((sum, account: any) => {
      const movement = apMovement.get(String(account._id)) || { debit: 0, credit: 0 };
      const signed = round2(Number(account.openingBalance || 0) + movement.debit - movement.credit);
      return sum + (-signed);
    }, 0),
  );
  const subledgerReceivable = round2(Number(receivableRows[0]?.total || 0));
  const subledgerPayable = round2(Number(payableRows[0]?.total || 0));

  res.json({
    success: true,
    data: {
      asOf: asOf || new Date(),
      receivables: { glBalance: glReceivable, subledgerBalance: subledgerReceivable, difference: round2(glReceivable - subledgerReceivable), controlAccounts: arAccounts },
      payables: { glBalance: glPayable, subledgerBalance: subledgerPayable, difference: round2(glPayable - subledgerPayable), controlAccounts: apAccounts },
    },
  });
});

// --- ACCOUNTING ACTIVITY REPORTS ---

export const accountTransactionsReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const accountId = String(req.query.accountId || "").trim();
  const voucherType = String(req.query.voucherType || "").trim();

  if (startOfDay(from) > endOfDay(to)) {
    throw new ValidationError("from must be before or equal to to");
  }

  const filter: any = {
    organizationId,
    postingDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };

  if (accountId) {
    if (!Types.ObjectId.isValid(accountId)) {
      throw new ValidationError("accountId must be a valid id");
    }
    filter.accountId = new Types.ObjectId(accountId);
  }

  if (voucherType && voucherType !== "All") {
    filter.voucherType = voucherType;
  }

  const entries = await GlEntry.find(filter)
    .populate("accountId", "name code")
    .populate("contactId", "displayName companyName")
    .sort({ postingDate: 1, _id: 1 })
    .lean();

  const rows = (entries as any[]).map((entry) => {
    const account = entry.accountId as any;
    const contact = entry.contactId as any;
    const debit = round2(toNum(entry.debit));
    const credit = round2(toNum(entry.credit));
    const signedAmount = round2(debit - credit);
    const rawType = String(entry.voucherType || "System");
    const description = String(entry.description || "").trim();
    const isOpening = rawType === "System" && description.toLowerCase().includes("opening");
    const transactionType = isOpening
      ? "Opening Balance"
      : entry.isReversal
        ? `${rawType} (Reversal)`
        : rawType;
    const contactName = contact?.displayName || contact?.companyName || "";

    return {
      postingDate: entry.postingDate,
      accountId: account?._id ? String(account._id) : String(entry.accountId || ""),
      accountCode: account?.code || "",
      accountName: account?.name || "Unknown Account",
      transactionDetails: description || contactName || "--",
      transactionType,
      transactionNo: entry.voucherNo || "-",
      referenceNo: entry.voucherId || "-",
      voucherType: rawType,
      voucherId: entry.voucherId || "",
      voucherNo: entry.voucherNo || "",
      contactName: contactName || null,
      debit,
      credit,
      amount: Math.abs(signedAmount),
      amountSide: signedAmount >= 0 ? "Dr" : "Cr",
      isReversal: Boolean(entry.isReversal),
    };
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalDebit = round2(acc.totalDebit + row.debit);
      acc.totalCredit = round2(acc.totalCredit + row.credit);
      return acc;
    },
    { totalDebit: 0, totalCredit: 0 },
  );

  res.json({
    success: true,
    data: {
      from,
      to,
      rows,
      totals: {
        ...totals,
        netMovement: round2(totals.totalDebit - totals.totalCredit),
      },
      count: rows.length,
    },
  });
});

// --- PAYABLE REPORTS ---

export const vendorBalanceSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const vendors = await Contact.find({
    organizationId,
    isDeleted: false,
    contactType: { $in: ["Vendor", "Both"] },
  }).select("displayName companyName outstandingPayable openingBalance").lean();

  const rows = vendors.map((v: any) => ({
    vendorId: String(v._id),
    vendorName: v.displayName || v.companyName || "Unknown",
    openingBalance: round2(toNum(v.openingBalance)),
    outstandingPayable: round2(toNum(v.outstandingPayable)),
  })).filter(r => Math.abs(r.outstandingPayable) >= 0.01 || Math.abs(r.openingBalance) >= 0.01)
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  const totals = rows.reduce((acc, r) => ({
    totalOpeningBalance: round2(acc.totalOpeningBalance + r.openingBalance),
    totalOutstanding: round2(acc.totalOutstanding + r.outstandingPayable),
  }), { totalOpeningBalance: 0, totalOutstanding: 0 });

  res.json({ success: true, data: { from, to, rows, totals } });
});

export const billDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const status = req.query.status as string | undefined;
  const vendorId = req.query.vendorId as string | undefined;

  const filter: any = {
    organizationId, isDeleted: false,
    billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;

  const bills = await Bill.find(filter)
    .populate("vendorId", "displayName companyName")
    .sort({ billDate: -1 })
    .lean();

  const rows = bills.map((b: any) => ({
    billId: String(b._id),
    billNumber: b.billNumber,
    billDate: b.billDate,
    dueDate: b.dueDate,
    vendorName: b.vendorId?.displayName || b.vendorId?.companyName || "Unknown",
    status: b.status,
    total: round2(toNum(b.total)),
    amountPaid: round2(toNum(b.amountPaid)),
    balanceDue: round2(toNum(b.balanceDue)),
  }));

  const totals = rows.reduce((acc, r) => ({
    totalAmount: round2(acc.totalAmount + r.total),
    totalPaid: round2(acc.totalPaid + r.amountPaid),
    totalDue: round2(acc.totalDue + r.balanceDue),
  }), { totalAmount: 0, totalPaid: 0, totalDue: 0 });

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const paymentsMadeReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const payments = await PaymentMade.find({
    organization_id: organizationId,
    is_deleted: false,
    payment_date: { $gte: startOfDay(from), $lte: endOfDay(to) },
    status: { $ne: "VOID" },
  })
    .populate("vendor_id", "displayName companyName")
    .sort({ payment_date: -1 })
    .lean();

  const rows = payments.map((p: any) => ({
    paymentId: String(p._id),
    paymentNumber: p.payment_number,
    paymentDate: p.payment_date,
    vendorName: p.vendor_id?.displayName || p.vendor_id?.companyName || "Unknown",
    paymentMode: p.payment_mode,
    totalPaid: round2(toNum(p.total_amount_paid)),
    usedForBills: round2(toNum(p.amount_used_for_bills)),
    excess: round2(toNum(p.amount_in_excess)),
    status: p.status,
  }));

  const totals = rows.reduce((acc, r) => ({
    totalPaid: round2(acc.totalPaid + r.totalPaid),
    totalUsed: round2(acc.totalUsed + r.usedForBills),
    totalExcess: round2(acc.totalExcess + r.excess),
  }), { totalPaid: 0, totalUsed: 0, totalExcess: 0 });

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const vendorCreditDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const credits = await VendorCredit.find({
    organizationId, isDeleted: false,
    vendorCreditDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
    status: { $ne: "VOID" },
  })
    .populate("vendorId", "displayName companyName")
    .sort({ vendorCreditDate: -1 })
    .lean();

  const rows = credits.map((c: any) => ({
    creditId: String(c._id),
    creditNumber: c.vendorCreditNumber,
    creditDate: c.vendorCreditDate,
    vendorName: c.vendorId?.displayName || c.vendorId?.companyName || "Unknown",
    total: round2(toNum(c.total)),
    applied: round2(toNum(c.appliedAmount)),
    balance: round2(toNum(c.balanceAmount)),
    status: c.status,
  }));

  const totals = rows.reduce((acc, r) => ({
    totalAmount: round2(acc.totalAmount + r.total),
    totalApplied: round2(acc.totalApplied + r.applied),
    totalBalance: round2(acc.totalBalance + r.balance),
  }), { totalAmount: 0, totalApplied: 0, totalBalance: 0 });

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const purchaseOrderDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const status = req.query.status as string | undefined;
  const vendorId = req.query.vendorId as string | undefined;

  const filter: any = {
    organizationId, isDeleted: false,
    purchaseOrderDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  if (status && status !== "All") filter.status = status;
  if (vendorId) filter.vendorId = vendorId;

  const pos = await PurchaseOrder.find(filter)
    .populate("vendorId", "displayName companyName")
    .sort({ purchaseOrderDate: -1 })
    .lean();

  const rows = pos.map((po: any) => ({
    poId: String(po._id),
    poNumber: po.purchaseOrderNumber,
    poDate: po.purchaseOrderDate,
    deliveryDate: po.deliveryDate,
    vendorName: po.vendorId?.displayName || po.vendorId?.companyName || "Unknown",
    status: po.status,
    total: round2(toNum(po.total)),
  }));

  const totals = { totalAmount: round2(rows.reduce((s, r) => s + r.total, 0)) };
  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const payableSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();

  const bills = await Bill.find({
    organizationId, isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    billDate: { $lte: endOfDay(asOf) },
    balanceDue: { $gt: 0 },
  })
    .populate("vendorId", "displayName companyName")
    .sort({ dueDate: 1 })
    .lean();

  const now = endOfDay(asOf);
  const current: any[] = [];
  const overdue15: any[] = [];
  const overdue30: any[] = [];
  const overdue45: any[] = [];
  const overdueAbove: any[] = [];

  for (const bill of bills) {
    const b: any = bill;
    const dueDate = b.dueDate ? new Date(b.dueDate) : null;
    const row = {
      billNumber: b.billNumber,
      vendorName: b.vendorId?.displayName || b.vendorId?.companyName || "Unknown",
      billDate: b.billDate,
      dueDate: b.dueDate,
      total: round2(toNum(b.total)),
      balanceDue: round2(toNum(b.balanceDue)),
    };

    if (!dueDate || dueDate >= now) {
      current.push(row);
    } else {
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 15) overdue15.push(row);
      else if (daysOverdue <= 30) overdue30.push(row);
      else if (daysOverdue <= 45) overdue45.push(row);
      else overdueAbove.push(row);
    }
  }

  const sumBucket = (arr: any[]) => round2(arr.reduce((s, r) => s + r.balanceDue, 0));

  res.json({
    success: true,
    data: {
      asOf,
      buckets: {
        current: { rows: current, total: sumBucket(current) },
        "1-15": { rows: overdue15, total: sumBucket(overdue15) },
        "16-30": { rows: overdue30, total: sumBucket(overdue30) },
        "31-45": { rows: overdue45, total: sumBucket(overdue45) },
        "above-45": { rows: overdueAbove, total: sumBucket(overdueAbove) },
      },
      grandTotal: sumBucket([...current, ...overdue15, ...overdue30, ...overdue45, ...overdueAbove]),
    },
  });
});

// --- RECEIVABLE REPORTS ---

export const customerBalanceSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  const customers = await Contact.find({
    organizationId, isDeleted: false,
    contactType: { $in: ["Customer", "Both"] },
  }).select("displayName companyName outstandingReceivable openingBalance").lean();

  const rows = customers.map((c: any) => ({
    customerId: String(c._id),
    customerName: c.displayName || c.companyName || "Unknown",
    openingBalance: round2(toNum(c.openingBalance)),
    outstandingReceivable: round2(toNum(c.outstandingReceivable)),
  })).filter(r => Math.abs(r.outstandingReceivable) >= 0.01 || Math.abs(r.openingBalance) >= 0.01)
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  const totals = rows.reduce((acc, r) => ({
    totalOpeningBalance: round2(acc.totalOpeningBalance + r.openingBalance),
    totalOutstanding: round2(acc.totalOutstanding + r.outstandingReceivable),
  }), { totalOpeningBalance: 0, totalOutstanding: 0 });

  res.json({ success: true, data: { rows, totals } });
});

export const invoiceDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const status = req.query.status as string | undefined;
  const customerId = req.query.customerId as string | undefined;

  const filter: any = {
    organizationId, isDeleted: false,
    invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  if (status && status !== "All") filter.status = status;
  if (customerId) filter.customerId = customerId;

  const invoices = await Invoice.find(filter)
    .populate("customerId", "displayName companyName")
    .sort({ invoiceDate: -1 })
    .lean();

  const rows = invoices.map((inv: any) => ({
    invoiceId: String(inv._id),
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    customerName: inv.customerId?.displayName || inv.customerId?.companyName || "Unknown",
    status: inv.status,
    total: round2(toNum(inv.total)),
    amountPaid: round2(toNum(inv.amountPaid)),
    balanceDue: round2(toNum(inv.balanceDue)),
  }));

  const totals = rows.reduce((acc, r) => ({
    totalAmount: round2(acc.totalAmount + r.total),
    totalPaid: round2(acc.totalPaid + r.amountPaid),
    totalDue: round2(acc.totalDue + r.balanceDue),
  }), { totalAmount: 0, totalPaid: 0, totalDue: 0 });

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const receivableSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();

  const invoices = await Invoice.find({
    organizationId, isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    invoiceDate: { $lte: endOfDay(asOf) },
    balanceDue: { $gt: 0 },
  })
    .populate("customerId", "displayName companyName")
    .sort({ dueDate: 1 })
    .lean();

  const now = endOfDay(asOf);
  const current: any[] = [];
  const overdue15: any[] = [];
  const overdue30: any[] = [];
  const overdue45: any[] = [];
  const overdueAbove: any[] = [];

  for (const inv of invoices) {
    const i: any = inv;
    const dueDate = i.dueDate ? new Date(i.dueDate) : null;
    const row = {
      invoiceNumber: i.invoiceNumber,
      customerName: i.customerId?.displayName || i.customerId?.companyName || "Unknown",
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      total: round2(toNum(i.total)),
      balanceDue: round2(toNum(i.balanceDue)),
    };

    if (!dueDate || dueDate >= now) current.push(row);
    else {
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 15) overdue15.push(row);
      else if (daysOverdue <= 30) overdue30.push(row);
      else if (daysOverdue <= 45) overdue45.push(row);
      else overdueAbove.push(row);
    }
  }

  const sumBucket = (arr: any[]) => round2(arr.reduce((s, r) => s + r.balanceDue, 0));

  res.json({
    success: true,
    data: {
      asOf,
      buckets: {
        current: { rows: current, total: sumBucket(current) },
        "1-15": { rows: overdue15, total: sumBucket(overdue15) },
        "16-30": { rows: overdue30, total: sumBucket(overdue30) },
        "31-45": { rows: overdue45, total: sumBucket(overdue45) },
        "above-45": { rows: overdueAbove, total: sumBucket(overdueAbove) },
      },
      grandTotal: sumBucket([...current, ...overdue15, ...overdue30, ...overdue45, ...overdueAbove]),
    },
  });
});

// --- PURCHASES & EXPENSES REPORTS ---

export const expenseDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const expenses = await Expense.find({
    organizationId, isDeleted: false,
    date: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("expenseAccountId", "name")
    .populate("paidThroughAccountId", "name")
    .populate("vendorId", "displayName companyName")
    .sort({ date: -1 })
    .lean();

  const rows = expenses.map((e: any) => ({
    expenseId: String(e._id),
    expenseNumber: e.expenseNumber,
    date: e.date,
    vendorName: e.vendorId?.displayName || e.vendorId?.companyName || "-",
    accountName: e.expenseAccountId?.name || "Uncategorized",
    paidThrough: e.paidThroughAccountId?.name || "-",
    amount: round2(toNum(e.amount)),
    status: e.status,
    expenseType: e.expenseType,
  }));

  const totals = { totalAmount: round2(rows.reduce((s, r) => s + r.amount, 0)) };
  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const expensesByCategory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const results = await Expense.aggregate([
    {
      $match: {
        organizationId,
        isDeleted: false,
        date: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    {
      $group: {
        _id: "$expenseAccountId",
        totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  // Resolve account names
  const accountIds = results.map((r: any) => r._id).filter(Boolean);
  const accounts = await Account.find({ _id: { $in: accountIds } }).select("name").lean();
  const nameMap = new Map(accounts.map((a: any) => [String(a._id), a.name]));

  const rows = results.map((r: any) => ({
    accountId: String(r._id || ""),
    categoryName: nameMap.get(String(r._id)) || "Uncategorized",
    totalAmount: round2(toNum(r.totalAmount)),
    count: r.count,
  }));

  const totals = { totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)) };
  res.json({ success: true, data: { from, to, rows, totals } });
});

export const purchasesByItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const results = await Bill.aggregate([
    {
      $match: {
        organizationId, isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
        billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    { $unwind: "$lineItems" },
    { $match: { "lineItems.isHeader": { $ne: true } } },
    {
      $group: {
        _id: "$lineItems.itemId",
        itemName: { $first: "$lineItems.name" },
        totalQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        totalAmount: { $sum: { $ifNull: ["$lineItems.amount", 0] } },
        billCount: { $addToSet: "$_id" },
      },
    },
    { $addFields: { billCount: { $size: "$billCount" } } },
    { $sort: { totalAmount: -1 } },
  ]);

  // Resolve item names
  const itemIds = results.map((r: any) => r._id).filter(Boolean);
  const items = await Item.find({ _id: { $in: itemIds } }).select("name").lean();
  const nameMap = new Map(items.map((i: any) => [String(i._id), i.name]));

  const rows = results.map((r: any) => ({
    itemId: String(r._id || ""),
    itemName: nameMap.get(String(r._id)) || r.itemName || "Unknown Item",
    totalQuantity: round2(toNum(r.totalQuantity)),
    totalAmount: round2(toNum(r.totalAmount)),
    billCount: r.billCount,
  }));

  const totals = {
    totalQuantity: round2(rows.reduce((s, r) => s + r.totalQuantity, 0)),
    totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals } });
});

// --- INVENTORY REPORTS ---

export const inventorySummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();
  const asOfEnd = endOfDay(asOf);

  // Removed automatic reconciliation to prevent double-deduction after transactions.

  const [items, committedRows, orderedRows, outgoingRows] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
    })
      .select("name sku stockOnHand inventoryValue averageCost reorderPoint valuationMethod isActive unit")
      .populate("unit", "abbreviation name")
      .lean(),

    SalesOrder.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: SALES_ORDER_COMMITTED_STATUSES },
          orderDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$lineItems" },
      {
        $group: {
          _id: "$lineItems.itemId",
          totalQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),

    PurchaseOrder.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: PURCHASE_ORDER_PENDING_STATUSES },
          purchaseOrderDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.isHeader": { $ne: true },
          "lineItems.itemId": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$lineItems.itemId",
          totalQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),

    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          invoiceDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": { $ne: null } } },
      {
        $group: {
          _id: "$items.itemId",
          totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
        },
      },
    ]),
  ]);

  const committedByItem = new Map<string, number>();
  for (const row of committedRows as Array<{ _id?: unknown; totalQuantity?: number }>) {
    const key = normalizeObjectId(row._id);
    if (!key) continue;
    committedByItem.set(key, round2(toNum(row.totalQuantity)));
  }

  const orderedByItem = new Map<string, number>();
  for (const row of orderedRows as Array<{ _id?: unknown; totalQuantity?: number }>) {
    const key = normalizeObjectId(row._id);
    if (!key) continue;
    orderedByItem.set(key, round2(toNum(row.totalQuantity)));
  }

  const outgoingByItem = new Map<string, number>();
  for (const row of outgoingRows as Array<{ _id?: unknown; totalQuantity?: number }>) {
    const key = normalizeObjectId(row._id);
    if (!key) continue;
    outgoingByItem.set(key, round2(toNum(row.totalQuantity)));
  }

  const rows = (items as any[])
    .map((item) => {
      const itemId = String(item._id);
      const stockOnHand = round2(toNum(item.stockOnHand));
      const committedStock = round2(committedByItem.get(itemId) || 0);
      const quantityOrdered = round2(orderedByItem.get(itemId) || 0);
      const quantityOut = round2(outgoingByItem.get(itemId) || 0);
      const quantityIn = round2(stockOnHand + quantityOut);
      const availableForSale = round2(Math.max(stockOnHand - committedStock, 0));
      const inventoryValue = round2(toNum(item.inventoryValue));
      const averageCost = stockOnHand > 0
        ? round2(inventoryValue / stockOnHand)
        : round2(toNum(item.averageCost));
      const reorderPoint = round2(toNum(item.reorderPoint));
      const usageUnit = item.unit?.abbreviation || item.unit?.name || "";

      return {
        itemId,
        itemName: String(item.name || "Unnamed Item"),
        sku: String(item.sku || ""),
        reorderLevel: reorderPoint,
        quantityOrdered,
        quantityIn,
        quantityOut,
        stockOnHand,
        committedStock,
        availableForSale,
        incomingStock: quantityOrdered,
        usageUnit,
        reorderPoint,
        averageCost,
        inventoryValue,
        valuationMethod: String(item.valuationMethod || "MovingAverage"),
        stockStatus: computeStockStatus({ stockOnHand, reorderPoint, availableForSale }),
        isActive: Boolean(item.isActive),
      };
    })
    .sort((a, b) => b.inventoryValue - a.inventoryValue);

  const totals = {
    totalItems: rows.length,
    totalReorderLevel: round2(rows.reduce((sum, row) => sum + row.reorderLevel, 0)),
    totalQuantityOrdered: round2(rows.reduce((sum, row) => sum + row.quantityOrdered, 0)),
    totalQuantityIn: round2(rows.reduce((sum, row) => sum + row.quantityIn, 0)),
    totalQuantityOut: round2(rows.reduce((sum, row) => sum + row.quantityOut, 0)),
    totalStockOnHand: round2(rows.reduce((sum, row) => sum + row.stockOnHand, 0)),
    totalCommittedStock: round2(rows.reduce((sum, row) => sum + row.committedStock, 0)),
    totalAvailableStock: round2(rows.reduce((sum, row) => sum + row.availableForSale, 0)),
    totalIncomingStock: round2(rows.reduce((sum, row) => sum + row.quantityOrdered, 0)),
    totalInventoryValue: round2(rows.reduce((sum, row) => sum + row.inventoryValue, 0)),
  };

  res.json({ success: true, data: { asOf, rows, totals, count: rows.length } });
});

export const committedStockDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const orders = await (SalesOrder as any).find({
    organizationId,
    isDeleted: false,
    status: { $in: SALES_ORDER_COMMITTED_STATUSES },
    orderDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("customerId", "displayName companyName")
    .sort({ orderDate: -1 })
    .lean();

  const itemIds = new Set<string>();
  for (const order of orders as any[]) {
    const lines = (order.lineItems || []) as any[];
    for (const line of lines) {
      const itemId = normalizeObjectId(line.itemId);
      if (itemId) itemIds.add(itemId);
    }
  }

  const itemRows = await Item.find({ _id: { $in: Array.from(itemIds) } })
    .select("name sku")
    .lean();

  const itemNameById = new Map(
    itemRows.map((item: any) => [String(item._id), item.name || "Unknown Item"]),
  );
  const itemSkuById = new Map(
    itemRows.map((item: any) => [String(item._id), item.sku || ""]),
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const order of orders as Array<Record<string, any>>) {
    const customerName = order.customerId?.displayName || order.customerId?.companyName || "Unknown";
    const lineItems = (order.lineItems || []) as any[];

    for (const line of lineItems) {
      const itemId = normalizeObjectId(line.itemId);
      if (!itemId) continue;

      const quantityCommitted = round2(toNum(line.quantity));
      if (quantityCommitted <= 0) continue;

      const rate = round2(toNum(line.rate));
      const committedAmount = round2(toNum(line.amount, quantityCommitted * rate));

      rows.push({
        salesOrderId: String(order._id),
        salesOrderNumber: String(order.salesOrderNumber || ""),
        orderDate: order.orderDate,
        expectedShipmentDate: order.expectedShipmentDate || null,
        customerName,
        itemId,
        itemName: itemNameById.get(itemId) || "Unknown Item",
        sku: itemSkuById.get(itemId) || "",
        quantityCommitted,
        rate,
        committedAmount,
        status: String(order.status || ""),
      });
    }
  }

  rows.sort((a, b) => {
    const aDate = new Date(String(a.orderDate || "")).getTime();
    const bDate = new Date(String(b.orderDate || "")).getTime();
    return bDate - aDate;
  });

  const totals = {
    totalLines: rows.length,
    totalCommittedQuantity: round2(rows.reduce((sum, row) => sum + toNum(row.quantityCommitted), 0)),
    totalCommittedAmount: round2(rows.reduce((sum, row) => sum + toNum(row.committedAmount), 0)),
    distinctOrders: new Set(rows.map((row) => String(row.salesOrderId || ""))).size,
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const inventoryAgingSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();
  const asOfEnd = endOfDay(asOf);

  const [items, invoiceMovements, billMovements, adjustmentMovements] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
      stockOnHand: { $gt: 0 },
    })
      .select("name sku stockOnHand inventoryValue createdAt updatedAt")
      .lean(),

    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: INVENTORY_RELATED_INVOICE_STATUSES },
          invoiceDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": { $ne: null } } },
      { $group: { _id: "$items.itemId", lastDate: { $max: "$invoiceDate" } } },
    ]),

    Bill.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: INVENTORY_RELATED_BILL_STATUSES },
          billDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.isHeader": { $ne: true },
          "lineItems.itemId": { $ne: null },
        },
      },
      { $group: { _id: "$lineItems.itemId", lastDate: { $max: "$billDate" } } },
    ]),

    InventoryAdjustment.aggregate([
      {
        $match: {
          organizationId,
          adjustedAt: { $lte: asOfEnd },
        },
      },
      { $group: { _id: "$itemId", lastDate: { $max: "$adjustedAt" } } },
    ]),
  ]);

  const lastMovementByItem = new Map<string, Date>();

  const absorbLastDates = (rows: Array<{ _id?: unknown; lastDate?: unknown }>) => {
    for (const row of rows) {
      const itemId = normalizeObjectId(row._id);
      if (!itemId) continue;
      const movementDate = row.lastDate ? new Date(String(row.lastDate)) : null;
      if (!movementDate || Number.isNaN(movementDate.getTime())) continue;

      const existing = lastMovementByItem.get(itemId);
      if (!existing || movementDate.getTime() > existing.getTime()) {
        lastMovementByItem.set(itemId, movementDate);
      }
    }
  };

  absorbLastDates(invoiceMovements as Array<{ _id?: unknown; lastDate?: unknown }>);
  absorbLastDates(billMovements as Array<{ _id?: unknown; lastDate?: unknown }>);
  absorbLastDates(adjustmentMovements as Array<{ _id?: unknown; lastDate?: unknown }>);

  const bucketOrder: Array<"0-30 Days" | "31-60 Days" | "61-90 Days" | "Above 90 Days"> = [
    "0-30 Days",
    "31-60 Days",
    "61-90 Days",
    "Above 90 Days",
  ];

  const bucketTotals = new Map<string, {
    bucket: string;
    itemCount: number;
    totalQuantity: number;
    totalValue: number;
    oldestAgeDays: number;
  }>();

  for (const bucket of bucketOrder) {
    bucketTotals.set(bucket, {
      bucket,
      itemCount: 0,
      totalQuantity: 0,
      totalValue: 0,
      oldestAgeDays: 0,
    });
  }

  for (const item of items as any[]) {
    const itemId = String(item._id);
    const stockOnHand = round2(toNum(item.stockOnHand));
    const inventoryValue = round2(toNum(item.inventoryValue));

    const fallbackDate = item.updatedAt || item.createdAt || asOfEnd;
    const movementDate = lastMovementByItem.get(itemId) || new Date(String(fallbackDate));
    const effectiveDate = movementDate.getTime() > asOfEnd.getTime() ? asOfEnd : movementDate;
    const ageDays = ageInDays(effectiveDate, asOfEnd);
    const bucket = inventoryAgeBucket(ageDays);

    const aggregate = bucketTotals.get(bucket);
    if (!aggregate) continue;

    aggregate.itemCount += 1;
    aggregate.totalQuantity = round2(aggregate.totalQuantity + stockOnHand);
    aggregate.totalValue = round2(aggregate.totalValue + inventoryValue);
    aggregate.oldestAgeDays = Math.max(aggregate.oldestAgeDays, ageDays);
  }

  const rows = bucketOrder.map((bucket) => {
    const row = bucketTotals.get(bucket)!;
    return {
      bucket: row.bucket,
      itemCount: row.itemCount,
      totalQuantity: row.totalQuantity,
      totalValue: row.totalValue,
      oldestAgeDays: row.oldestAgeDays,
    };
  });

  const totals = {
    totalItems: rows.reduce((sum, row) => sum + row.itemCount, 0),
    totalQuantity: round2(rows.reduce((sum, row) => sum + row.totalQuantity, 0)),
    totalValue: round2(rows.reduce((sum, row) => sum + row.totalValue, 0)),
  };

  res.json({ success: true, data: { asOf, rows, totals, count: rows.length } });
});

export const stockSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();
  const asOfEnd = endOfDay(asOf);

  const [items, committedRows] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
    })
      .select("stockOnHand inventoryValue reorderPoint")
      .lean(),

    SalesOrder.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $in: SALES_ORDER_COMMITTED_STATUSES },
          orderDate: { $lte: asOfEnd },
        },
      },
      { $unwind: "$lineItems" },
      {
        $group: {
          _id: "$lineItems.itemId",
          totalQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),
  ]);

  const committedByItem = new Map<string, number>();
  for (const row of committedRows as Array<{ _id?: unknown; totalQuantity?: number }>) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    committedByItem.set(itemId, round2(toNum(row.totalQuantity)));
  }

  const statusOrder: Array<"Out of Stock" | "Low Stock" | "Fully Committed" | "In Stock"> = [
    "Out of Stock",
    "Low Stock",
    "Fully Committed",
    "In Stock",
  ];

  const statusMap = new Map<string, {
    stockStatus: string;
    itemCount: number;
    totalQuantity: number;
    totalCommittedStock: number;
    totalAvailableStock: number;
    totalValue: number;
  }>();

  for (const status of statusOrder) {
    statusMap.set(status, {
      stockStatus: status,
      itemCount: 0,
      totalQuantity: 0,
      totalCommittedStock: 0,
      totalAvailableStock: 0,
      totalValue: 0,
    });
  }

  for (const item of items as any[]) {
    const itemId = String(item._id);
    const stockOnHand = round2(toNum(item.stockOnHand));
    const inventoryValue = round2(toNum(item.inventoryValue));
    const reorderPoint = round2(toNum(item.reorderPoint));
    const committedStock = round2(committedByItem.get(itemId) || 0);
    const availableForSale = round2(Math.max(stockOnHand - committedStock, 0));
    const stockStatus = computeStockStatus({ stockOnHand, reorderPoint, availableForSale });

    const aggregate = statusMap.get(stockStatus);
    if (!aggregate) continue;

    aggregate.itemCount += 1;
    aggregate.totalQuantity = round2(aggregate.totalQuantity + stockOnHand);
    aggregate.totalCommittedStock = round2(aggregate.totalCommittedStock + committedStock);
    aggregate.totalAvailableStock = round2(aggregate.totalAvailableStock + availableForSale);
    aggregate.totalValue = round2(aggregate.totalValue + inventoryValue);
  }

  const rows = statusOrder
    .map((status) => statusMap.get(status)!)
    .filter((row) => row.itemCount > 0);

  const totals = {
    totalItems: rows.reduce((sum, row) => sum + row.itemCount, 0),
    totalQuantity: round2(rows.reduce((sum, row) => sum + row.totalQuantity, 0)),
    totalCommittedStock: round2(rows.reduce((sum, row) => sum + row.totalCommittedStock, 0)),
    totalAvailableStock: round2(rows.reduce((sum, row) => sum + row.totalAvailableStock, 0)),
    totalValue: round2(rows.reduce((sum, row) => sum + row.totalValue, 0)),
  };

  res.json({ success: true, data: { asOf, rows, totals, count: rows.length } });
});

export const inventoryAdjustmentSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const summaryRows = await InventoryAdjustment.aggregate([
    {
      $match: {
        organizationId,
        adjustedAt: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    {
      $project: {
        reason: { $ifNull: ["$reason", "Manual"] },
        increaseQty: {
          $cond: [
            { $eq: ["$direction", "Increase"] },
            { $abs: { $ifNull: ["$quantityDelta", 0] } },
            0,
          ],
        },
        decreaseQty: {
          $cond: [
            { $eq: ["$direction", "Decrease"] },
            { $abs: { $ifNull: ["$quantityDelta", 0] } },
            0,
          ],
        },
        increaseValue: {
          $cond: [
            { $eq: ["$direction", "Increase"] },
            { $abs: { $ifNull: ["$valueDelta", 0] } },
            0,
          ],
        },
        decreaseValue: {
          $cond: [
            { $eq: ["$direction", "Decrease"] },
            { $abs: { $ifNull: ["$valueDelta", 0] } },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: "$reason",
        adjustmentCount: { $sum: 1 },
        increaseQty: { $sum: "$increaseQty" },
        decreaseQty: { $sum: "$decreaseQty" },
        increaseValue: { $sum: "$increaseValue" },
        decreaseValue: { $sum: "$decreaseValue" },
      },
    },
    { $sort: { adjustmentCount: -1, _id: 1 } },
  ]);

  const rows = (summaryRows as any[]).map((row) => {
    const increaseQty = round2(toNum(row.increaseQty));
    const decreaseQty = round2(toNum(row.decreaseQty));
    const increaseValue = round2(toNum(row.increaseValue));
    const decreaseValue = round2(toNum(row.decreaseValue));

    return {
      reason: String(row._id || "Manual"),
      adjustmentCount: toNum(row.adjustmentCount),
      increaseQty,
      decreaseQty,
      netQty: round2(increaseQty - decreaseQty),
      increaseValue,
      decreaseValue,
      netValue: round2(increaseValue - decreaseValue),
    };
  });

  const totals = {
    totalAdjustments: rows.reduce((sum, row) => sum + toNum(row.adjustmentCount), 0),
    totalIncreaseQty: round2(rows.reduce((sum, row) => sum + toNum(row.increaseQty), 0)),
    totalDecreaseQty: round2(rows.reduce((sum, row) => sum + toNum(row.decreaseQty), 0)),
    netQty: round2(rows.reduce((sum, row) => sum + toNum(row.netQty), 0)),
    totalIncreaseValue: round2(rows.reduce((sum, row) => sum + toNum(row.increaseValue), 0)),
    totalDecreaseValue: round2(rows.reduce((sum, row) => sum + toNum(row.decreaseValue), 0)),
    netValue: round2(rows.reduce((sum, row) => sum + toNum(row.netValue), 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const inventoryAdjustmentDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const adjustments = await InventoryAdjustment.find({
    organizationId,
    adjustedAt: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("itemId", "name sku")
    .populate("warehouseId", "name")
    .sort({ adjustedAt: -1 })
    .lean();

  const rows = (adjustments as Array<Record<string, any>>).map((adjustment) => ({
    adjustmentId: String(adjustment._id),
    adjustedAt: adjustment.adjustedAt,
    itemId: normalizeObjectId(adjustment.itemId),
    itemName: adjustment.itemId?.name || "Unknown Item",
    sku: adjustment.itemId?.sku || "",
    warehouseName: adjustment.warehouseId?.name || "Main",
    direction: String(adjustment.direction || ""),
    reason: String(adjustment.reason || "Manual"),
    quantityDelta: round2(toNum(adjustment.quantityDelta)),
    valueDelta: round2(toNum(adjustment.valueDelta)),
    resultingStockOnHand: round2(toNum(adjustment.resultingStockOnHand)),
    resultingInventoryValue: round2(toNum(adjustment.resultingInventoryValue)),
    referenceNumber: String(adjustment.referenceNumber || ""),
    notes: String(adjustment.notes || ""),
  }));

  const totals = {
    totalAdjustments: rows.length,
    totalQuantityDelta: round2(rows.reduce((sum, row) => sum + toNum(row.quantityDelta), 0)),
    totalValueDelta: round2(rows.reduce((sum, row) => sum + toNum(row.valueDelta), 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const packingHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const challans = await (DeliveryChallan as any).find({
    organizationId,
    isDeleted: false,
    challanDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("customerId", "displayName companyName")
    .sort({ challanDate: -1 })
    .lean();

  const rows = (challans as Array<Record<string, any>>).map((challan) => {
    const items = (challan.items || []) as any[];
    const totalQuantity = round2(items.reduce((sum, item) => sum + toNum(item.quantity), 0));
    const itemCount = items.length;

    return {
      challanId: String(challan._id),
      challanNumber: String(challan.challanNumber || ""),
      challanDate: challan.challanDate,
      salesOrderNumber: String(challan.salesOrderNumber || ""),
      customerName: challan.customerId?.displayName || challan.customerId?.companyName || "Unknown",
      itemCount,
      totalQuantity,
      totalAmount: round2(toNum(challan.total)),
      status: String(challan.status || ""),
      invoiceStatus: String(challan.invoiceStatus || ""),
    };
  });

  const totals = {
    totalChallans: rows.length,
    totalPackedQuantity: round2(rows.reduce((sum, row) => sum + toNum(row.totalQuantity), 0)),
    totalAmount: round2(rows.reduce((sum, row) => sum + toNum(row.totalAmount), 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const shipmentDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const challans = await (DeliveryChallan as any).find({
    organizationId,
    isDeleted: false,
    challanDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("customerId", "displayName companyName")
    .sort({ challanDate: -1 })
    .lean();

  const rows: Array<Record<string, unknown>> = [];

  for (const challan of challans as Array<Record<string, any>>) {
    const customerName = challan.customerId?.displayName || challan.customerId?.companyName || "Unknown";
    const status = String(challan.status || "");
    const invoiceStatus = String(challan.invoiceStatus || "");

    const shipmentStatus = status === "Delivered"
      ? "Delivered"
      : status === "Returned"
        ? "Returned"
        : status === "Open"
          ? "In Transit"
          : invoiceStatus === "INVOICED"
            ? "Invoiced"
            : "Pending";

    for (const line of (challan.items || []) as any[]) {
      rows.push({
        challanId: String(challan._id),
        challanNumber: String(challan.challanNumber || ""),
        challanDate: challan.challanDate,
        customerName,
        itemId: normalizeObjectId(line.itemId),
        itemName: String(line.name || "Unknown Item"),
        quantity: round2(toNum(line.quantity)),
        rate: round2(toNum(line.rate)),
        amount: round2(toNum(line.amount)),
        challanStatus: status,
        invoiceStatus,
        shipmentStatus,
      });
    }
  }

  const totals = {
    totalLines: rows.length,
    totalQuantity: round2(rows.reduce((sum, row) => sum + toNum(row.quantity), 0)),
    totalAmount: round2(rows.reduce((sum, row) => sum + toNum(row.amount), 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const inventoryTurnoverByQuantity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const [items, soldRows, purchasedRows, adjustmentRows] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
    })
      .select("name sku stockOnHand")
      .lean(),

    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": { $ne: null } } },
      {
        $group: {
          _id: "$items.itemId",
          soldQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
        },
      },
    ]),

    Bill.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.isHeader": { $ne: true },
          "lineItems.itemId": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$lineItems.itemId",
          purchasedQuantity: { $sum: { $ifNull: ["$lineItems.quantity", 0] } },
        },
      },
    ]),

    InventoryAdjustment.aggregate([
      {
        $match: {
          organizationId,
          adjustedAt: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      {
        $group: {
          _id: "$itemId",
          increasedQty: {
            $sum: {
              $cond: [
                { $eq: ["$direction", "Increase"] },
                { $abs: { $ifNull: ["$quantityDelta", 0] } },
                0,
              ],
            },
          },
          decreasedQty: {
            $sum: {
              $cond: [
                { $eq: ["$direction", "Decrease"] },
                { $abs: { $ifNull: ["$quantityDelta", 0] } },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const soldByItem = new Map<string, number>();
  for (const row of soldRows as Array<{ _id?: unknown; soldQuantity?: number }>) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    soldByItem.set(itemId, round2(toNum(row.soldQuantity)));
  }

  const purchasedByItem = new Map<string, number>();
  for (const row of purchasedRows as Array<{ _id?: unknown; purchasedQuantity?: number }>) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    purchasedByItem.set(itemId, round2(toNum(row.purchasedQuantity)));
  }

  const netAdjustmentByItem = new Map<string, number>();
  for (const row of adjustmentRows as Array<{ _id?: unknown; increasedQty?: number; decreasedQty?: number }>) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    const net = round2(toNum(row.increasedQty) - toNum(row.decreasedQty));
    netAdjustmentByItem.set(itemId, net);
  }

  const daysInRange = Math.max(1, ageInDays(from, to) + 1);

  const rows = (items as any[])
    .map((item) => {
      const itemId = String(item._id);
      const closingStockQty = round2(toNum(item.stockOnHand));
      const soldQuantity = round2(soldByItem.get(itemId) || 0);
      const purchasedQuantity = round2(purchasedByItem.get(itemId) || 0);
      const netAdjustmentQty = round2(netAdjustmentByItem.get(itemId) || 0);

      const openingStockQty = round2(
        Math.max(0, closingStockQty - purchasedQuantity - netAdjustmentQty + soldQuantity),
      );
      const averageInventoryQty = round2((openingStockQty + closingStockQty) / 2);
      const turnoverRatio = averageInventoryQty > 0
        ? round2(soldQuantity / averageInventoryQty)
        : 0;

      return {
        itemId,
        itemName: String(item.name || "Unnamed Item"),
        sku: String(item.sku || ""),
        openingStockQty,
        purchasedQuantity,
        soldQuantity,
        netAdjustmentQty,
        closingStockQty,
        averageInventoryQty,
        turnoverRatio,
        dailyIssueQty: round2(soldQuantity / daysInRange),
      };
    })
    .filter((row) => row.soldQuantity > 0 || row.purchasedQuantity > 0 || row.closingStockQty > 0)
    .sort((a, b) => {
      if (b.turnoverRatio !== a.turnoverRatio) return b.turnoverRatio - a.turnoverRatio;
      return b.soldQuantity - a.soldQuantity;
    });

  const totals = {
    totalItems: rows.length,
    totalSoldQuantity: round2(rows.reduce((sum, row) => sum + row.soldQuantity, 0)),
    totalPurchasedQuantity: round2(rows.reduce((sum, row) => sum + row.purchasedQuantity, 0)),
    totalClosingStockQty: round2(rows.reduce((sum, row) => sum + row.closingStockQty, 0)),
    weightedTurnoverRatio: round2(
      rows.reduce((sum, row) => sum + row.turnoverRatio * row.soldQuantity, 0)
        / Math.max(1, rows.reduce((sum, row) => sum + row.soldQuantity, 0)),
    ),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

// --- INVENTORY VALUATION REPORTS ---

export const inventoryValuationSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf") || new Date();

  // Removed automatic reconciliation to prevent double-deduction after transactions.

  const items = await Item.find({
    organizationId,
    isDeleted: false,
    inventoryTracked: true,
  })
    .select("name sku stockOnHand averageCost inventoryValue valuationMethod reorderPoint isActive")
    .lean();

  const totalValue = round2(
    (items as any[]).reduce((sum, item) => sum + toNum(item.inventoryValue), 0),
  );

  const rows = (items as any[])
    .map((item) => {
      const stockOnHand = round2(toNum(item.stockOnHand));
      const inventoryValue = round2(toNum(item.inventoryValue));
      const averageCost = stockOnHand > 0
        ? round2(inventoryValue / stockOnHand)
        : round2(toNum(item.averageCost));

      return {
        itemId: String(item._id),
        itemName: String(item.name || "Unnamed Item"),
        sku: String(item.sku || ""),
        valuationMethod: String(item.valuationMethod || "MovingAverage"),
        stockOnHand,
        reorderPoint: round2(toNum(item.reorderPoint)),
        averageCost,
        inventoryValue,
        valueSharePercent: percent(inventoryValue, totalValue),
        isActive: Boolean(item.isActive),
      };
    })
    .sort((a, b) => b.inventoryValue - a.inventoryValue);

  const totals = {
    totalItems: rows.length,
    totalStockOnHand: round2(rows.reduce((sum, row) => sum + row.stockOnHand, 0)),
    totalInventoryValue: round2(rows.reduce((sum, row) => sum + row.inventoryValue, 0)),
  };

  res.json({ success: true, data: { asOf, rows, totals, count: rows.length } });
});

export const fifoCostLotTracking = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const bills = await Bill.find({
    organizationId,
    isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  })
    .populate("vendorId", "displayName companyName")
    .sort({ billDate: 1 })
    .lean();

  const itemIds = new Set<string>();
  for (const bill of bills as any[]) {
    for (const line of (bill.lineItems || []) as any[]) {
      if (Boolean(line.isHeader)) continue;
      const itemId = normalizeObjectId(line.itemId);
      if (itemId) itemIds.add(itemId);
    }
  }

  const itemRows = await Item.find({ _id: { $in: Array.from(itemIds) } })
    .select("name sku valuationMethod")
    .lean();

  const itemMeta = new Map(
    itemRows.map((item: any) => [
      String(item._id),
      {
        name: item.name || "Unknown Item",
        sku: item.sku || "",
        valuationMethod: item.valuationMethod || "MovingAverage",
      },
    ]),
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const bill of bills as Array<Record<string, any>>) {
    const vendorName = bill.vendorId?.displayName || bill.vendorId?.companyName || "Unknown";

    for (const line of (bill.lineItems || []) as any[]) {
      if (Boolean(line.isHeader)) continue;

      const itemId = normalizeObjectId(line.itemId);
      if (!itemId) continue;

      const meta = itemMeta.get(itemId);
      const billDate = bill.billDate ? new Date(String(bill.billDate)) : null;
      const lotAgeDays = billDate && !Number.isNaN(billDate.getTime()) ? ageInDays(billDate, to) : 0;

      rows.push({
        billId: String(bill._id),
        billNumber: String(bill.billNumber || ""),
        billDate: bill.billDate,
        vendorName,
        itemId,
        itemName: meta?.name || String(line.name || "Unknown Item"),
        sku: meta?.sku || "",
        lotQuantity: round2(toNum(line.quantity)),
        unitCost: round2(toNum(line.rate)),
        lotValue: round2(toNum(line.amount)),
        valuationMethod: String(meta?.valuationMethod || "MovingAverage"),
        lotAgeDays,
      });
    }
  }

  const totals = {
    totalLots: rows.length,
    totalQuantity: round2(rows.reduce((sum, row) => sum + toNum(row.lotQuantity), 0)),
    totalValue: round2(rows.reduce((sum, row) => sum + toNum(row.lotValue), 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const abcClassification = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const [salesRows, itemSnapshots] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": { $ne: null } } },
      {
        $group: {
          _id: "$items.itemId",
          itemName: { $first: "$items.name" },
          salesAmount: { $sum: { $ifNull: ["$items.amount", 0] } },
          salesQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
        },
      },
      { $sort: { salesAmount: -1 } },
    ]),

    Item.find({
      organizationId,
      isDeleted: false,
    })
      .select("name sku stockOnHand inventoryValue")
      .lean(),
  ]);

  const itemMeta = new Map(
    (itemSnapshots as any[]).map((item) => [
      String(item._id),
      {
        name: String(item.name || "Unnamed Item"),
        sku: String(item.sku || ""),
        stockOnHand: round2(toNum(item.stockOnHand)),
        inventoryValue: round2(toNum(item.inventoryValue)),
      },
    ]),
  );

  const normalizedRows = (salesRows as any[]).map((row) => {
    const itemId = normalizeObjectId(row._id);
    const meta = itemMeta.get(itemId);
    return {
      itemId,
      itemName: meta?.name || String(row.itemName || "Unknown Item"),
      sku: meta?.sku || "",
      salesAmount: round2(toNum(row.salesAmount)),
      salesQuantity: round2(toNum(row.salesQuantity)),
      currentStockOnHand: meta?.stockOnHand || 0,
      currentInventoryValue: meta?.inventoryValue || 0,
    };
  });

  const totalSalesAmount = round2(normalizedRows.reduce((sum, row) => sum + row.salesAmount, 0));
  let runningPercent = 0;

  const classStats = {
    A: { itemCount: 0, salesAmount: 0 },
    B: { itemCount: 0, salesAmount: 0 },
    C: { itemCount: 0, salesAmount: 0 },
  };

  const rows = normalizedRows.map((row) => {
    const sharePercent = percent(row.salesAmount, totalSalesAmount);
    runningPercent = round2(runningPercent + sharePercent);

    const classification = runningPercent <= 80
      ? "A"
      : runningPercent <= 95
        ? "B"
        : "C";

    classStats[classification].itemCount += 1;
    classStats[classification].salesAmount = round2(classStats[classification].salesAmount + row.salesAmount);

    return {
      ...row,
      salesSharePercent: sharePercent,
      cumulativeSharePercent: runningPercent,
      classification,
    };
  });

  const totals = {
    totalItems: rows.length,
    totalSalesAmount,
    classAItems: classStats.A.itemCount,
    classASalesAmount: classStats.A.salesAmount,
    classBItems: classStats.B.itemCount,
    classBSalesAmount: classStats.B.salesAmount,
    classCItems: classStats.C.itemCount,
    classCSalesAmount: classStats.C.salesAmount,
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const inventoryTurnoverByAmount = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  ensureFromBeforeTo(from, to);

  const [items, salesRows, purchaseRows, adjustmentRows] = await Promise.all([
    Item.find({
      organizationId,
      isDeleted: false,
      inventoryTracked: true,
    })
      .select("name sku stockOnHand inventoryValue")
      .lean(),

    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      { $unwind: "$items" },
      { $match: { "items.itemId": { $ne: null } } },
      {
        $group: {
          _id: "$items.itemId",
          soldQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
          salesAmount: { $sum: { $ifNull: ["$items.amount", 0] } },
          cogsAmount: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$items.costAmount", 0] }, 0] },
                { $ifNull: ["$items.costAmount", 0] },
                { $ifNull: ["$items.amount", 0] },
              ],
            },
          },
        },
      },
    ]),

    Bill.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
          billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.isHeader": { $ne: true },
          "lineItems.itemId": { $ne: null },
        },
      },
      {
        $group: {
          _id: "$lineItems.itemId",
          purchaseAmount: { $sum: { $ifNull: ["$lineItems.amount", 0] } },
        },
      },
    ]),

    InventoryAdjustment.aggregate([
      {
        $match: {
          organizationId,
          adjustedAt: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
      },
      {
        $group: {
          _id: "$itemId",
          increasedValue: {
            $sum: {
              $cond: [
                { $eq: ["$direction", "Increase"] },
                { $abs: { $ifNull: ["$valueDelta", 0] } },
                0,
              ],
            },
          },
          decreasedValue: {
            $sum: {
              $cond: [
                { $eq: ["$direction", "Decrease"] },
                { $abs: { $ifNull: ["$valueDelta", 0] } },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const soldByItem = new Map<string, { soldQuantity: number; salesAmount: number; cogsAmount: number }>();
  for (const row of salesRows as any[]) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    soldByItem.set(itemId, {
      soldQuantity: round2(toNum(row.soldQuantity)),
      salesAmount: round2(toNum(row.salesAmount)),
      cogsAmount: round2(toNum(row.cogsAmount)),
    });
  }

  const purchaseByItem = new Map<string, number>();
  for (const row of purchaseRows as any[]) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    purchaseByItem.set(itemId, round2(toNum(row.purchaseAmount)));
  }

  const netAdjustmentByItem = new Map<string, number>();
  for (const row of adjustmentRows as any[]) {
    const itemId = normalizeObjectId(row._id);
    if (!itemId) continue;
    netAdjustmentByItem.set(itemId, round2(toNum(row.increasedValue) - toNum(row.decreasedValue)));
  }

  const rows = (items as any[])
    .map((item) => {
      const itemId = String(item._id);
      const salesMeta = soldByItem.get(itemId) || { soldQuantity: 0, salesAmount: 0, cogsAmount: 0 };
      const purchaseAmount = round2(purchaseByItem.get(itemId) || 0);
      const netAdjustmentValue = round2(netAdjustmentByItem.get(itemId) || 0);
      const closingInventoryValue = round2(toNum(item.inventoryValue));

      const openingInventoryValue = round2(
        Math.max(0, closingInventoryValue - purchaseAmount - netAdjustmentValue + salesMeta.cogsAmount),
      );
      const averageInventoryValue = round2((openingInventoryValue + closingInventoryValue) / 2);
      const turnoverRatio = averageInventoryValue > 0
        ? round2(salesMeta.cogsAmount / averageInventoryValue)
        : 0;
      const grossMarginAmount = round2(salesMeta.salesAmount - salesMeta.cogsAmount);

      return {
        itemId,
        itemName: String(item.name || "Unnamed Item"),
        sku: String(item.sku || ""),
        soldQuantity: salesMeta.soldQuantity,
        salesAmount: salesMeta.salesAmount,
        cogsAmount: salesMeta.cogsAmount,
        grossMarginAmount,
        grossMarginPercent: percent(grossMarginAmount, salesMeta.salesAmount),
        openingInventoryValue,
        purchaseAmount,
        netAdjustmentValue,
        closingInventoryValue,
        averageInventoryValue,
        turnoverRatio,
      };
    })
    .filter((row) => row.salesAmount > 0 || row.purchaseAmount > 0 || row.closingInventoryValue > 0)
    .sort((a, b) => {
      if (b.turnoverRatio !== a.turnoverRatio) return b.turnoverRatio - a.turnoverRatio;
      return b.salesAmount - a.salesAmount;
    });

  const totals = {
    totalItems: rows.length,
    totalSalesAmount: round2(rows.reduce((sum, row) => sum + row.salesAmount, 0)),
    totalCogsAmount: round2(rows.reduce((sum, row) => sum + row.cogsAmount, 0)),
    totalGrossMarginAmount: round2(rows.reduce((sum, row) => sum + row.grossMarginAmount, 0)),
    totalClosingInventoryValue: round2(rows.reduce((sum, row) => sum + row.closingInventoryValue, 0)),
    weightedTurnoverRatio: round2(
      rows.reduce((sum, row) => sum + row.turnoverRatio * row.cogsAmount, 0)
        / Math.max(1, rows.reduce((sum, row) => sum + row.cogsAmount, 0)),
    ),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

// --- SALES REPORTS ---

export const salesByCustomer = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const results = await Invoice.aggregate([
    {
      $match: {
        organizationId, isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
        invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    {
      $group: {
        _id: "$customerId",
        invoiceCount: { $sum: 1 },
        totalSales: { $sum: { $ifNull: ["$total", 0] } },
        totalWithTax: { $sum: { $ifNull: ["$total", 0] } },
      },
    },
    { $sort: { totalSales: -1 } },
  ]);

  const customerIds = results.map((r: any) => r._id).filter(Boolean);
  const customers = await Contact.find({ _id: { $in: customerIds } }).select("displayName companyName").lean();
  const nameMap = new Map(customers.map((c: any) => [String(c._id), c.displayName || c.companyName || "Unknown"]));

  const rows = results.map((r: any) => ({
    customerId: String(r._id || ""),
    customerName: nameMap.get(String(r._id)) || "Unknown",
    invoiceCount: r.invoiceCount,
    totalSales: round2(toNum(r.totalSales)),
    totalWithTax: round2(toNum(r.totalWithTax)),
  }));

  const totals = {
    totalSales: round2(rows.reduce((s, r) => s + r.totalSales, 0)),
    totalWithTax: round2(rows.reduce((s, r) => s + r.totalWithTax, 0)),
    totalInvoices: rows.reduce((s, r) => s + r.invoiceCount, 0),
  };

  res.json({ success: true, data: { from, to, rows, totals } });
});

export const salesByItem = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const results = await Invoice.aggregate([
    {
      $match: {
        organizationId, isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
        invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.itemId",
        itemName: { $first: "$items.name" },
        totalQuantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
        totalAmount: { $sum: { $ifNull: ["$items.amount", 0] } },
        invoiceCount: { $addToSet: "$_id" },
      },
    },
    { $addFields: { invoiceCount: { $size: "$invoiceCount" } } },
    { $sort: { totalAmount: -1 } },
  ]);

  const itemIds = results.map((r: any) => r._id).filter(Boolean);
  const items = await Item.find({ _id: { $in: itemIds } }).select("name").lean();
  const nameMap = new Map(items.map((i: any) => [String(i._id), i.name]));

  const rows = results.map((r: any) => ({
    itemId: String(r._id || ""),
    itemName: nameMap.get(String(r._id)) || r.itemName || "Unknown Item",
    totalQuantity: round2(toNum(r.totalQuantity)),
    totalAmount: round2(toNum(r.totalAmount)),
    invoiceCount: r.invoiceCount,
  }));

  const totals = {
    totalQuantity: round2(rows.reduce((s, r) => s + r.totalQuantity, 0)),
    totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals } });
});

// --- PAYMENTS RECEIVED REPORT ---

export const paymentsReceivedReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();

  const payments = await PaymentReceived.find({
    organization_id: organizationId,
    is_deleted: false,
    payment_date: { $gte: startOfDay(from), $lte: endOfDay(to) },
    status: { $ne: "VOID" },
  })
    .populate("customer_id", "displayName companyName")
    .sort({ payment_date: -1 })
    .lean();

  const paymentIds = payments.map((payment: any) => payment._id).filter(Boolean);
  const applications = paymentIds.length > 0
    ? await PaymentInvoiceMap.find({
        organization_id: organizationId,
        payment_id: { $in: paymentIds },
        is_deleted: false,
      })
        .populate("invoice_id", "invoiceNumber invoiceDate total balanceDue status")
        .lean()
    : [];
  const applicationsByPayment = new Map<string, any[]>();
  for (const application of applications as any[]) {
    const key = String(application.payment_id || "");
    if (!applicationsByPayment.has(key)) applicationsByPayment.set(key, []);
    applicationsByPayment.get(key)!.push(application);
  }

  const rows = payments.map((p: any) => {
    const paymentApplications = applicationsByPayment.get(String(p._id)) || [];
    return {
      paymentId: String(p._id),
      paymentNumber: p.payment_number,
      paymentDate: p.payment_date,
      customerName: p.customer_id?.displayName || p.customer_id?.companyName || "Unknown",
      paymentMode: p.payment_mode,
      invoiceNumbers: paymentApplications
        .map((application: any) => application.invoice_id?.invoiceNumber || "")
        .filter(Boolean),
      totalReceived: round2(toNum(p.total_amount_received)),
      usedForInvoices: round2(toNum(p.amount_used_for_invoices)),
      refunded: round2(toNum(p.amount_refunded)),
      excess: round2(toNum(p.amount_in_excess)),
      status: p.status,
    };
  });

  const totals = {
    totalReceived: round2(rows.reduce((s, r) => s + r.totalReceived, 0)),
    totalUsed: round2(rows.reduce((s, r) => s + r.usedForInvoices, 0)),
    totalRefunded: round2(rows.reduce((s, r) => s + r.refunded, 0)),
    totalExcess: round2(rows.reduce((s, r) => s + r.excess, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

// --- DASHBOARD SUMMARY ---

export const dashboardSummary = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);

  const asOf = parseDate(req.query.asOf, "asOf") || new Date();
  const cashFrom = parseDate(req.query.cashFrom, "cashFrom") || defaultFrom();
  const cashTo = parseDate(req.query.cashTo, "cashTo") || defaultTo();
  const incomeFrom = parseDate(req.query.incomeFrom, "incomeFrom") || defaultFrom();
  const incomeTo = parseDate(req.query.incomeTo, "incomeTo") || defaultTo();

  if (startOfDay(cashFrom) > endOfDay(cashTo)) {
    throw new ValidationError("cashFrom must be before or equal to cashTo");
  }
  if (startOfDay(incomeFrom) > endOfDay(incomeTo)) {
    throw new ValidationError("incomeFrom must be before or equal to incomeTo");
  }

  const incomeBasis = parseDashboardBasis(req.query.incomeBasis, "incomeBasis", "accrual");
  const watchlistBasis = parseDashboardBasis(req.query.watchlistBasis, "watchlistBasis", "accrual");
  const topExpensesLimit = toBoundedInt(req.query.topExpensesLimit, 5, 1, 12);

  const asOfEnd = endOfDay(asOf);
  const cashFromStart = startOfDay(cashFrom);
  const cashToEnd = endOfDay(cashTo);
  const incomeFromStart = startOfDay(incomeFrom);
  const incomeToEnd = endOfDay(incomeTo);

  const minRangeFrom = cashFromStart < incomeFromStart ? cashFromStart : incomeFromStart;
  const maxRangeTo = cashToEnd > incomeToEnd ? cashToEnd : incomeToEnd;
  const hasValue = (n: number): boolean => Math.abs(n) >= 0.01;
  const sumMapValues = (map: Map<string, number>): number =>
    round2(Array.from(map.values()).reduce((sum, value) => sum + value, 0));

  const [receivableDocs, payableDocs, paymentInDocs, paymentOutDocs, invoiceIncomeDocs, expenseDocs, allAccountDocs] = await Promise.all([
    Invoice.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      invoiceDate: { $lte: asOfEnd },
      balanceDue: { $gt: 0 },
    })
      .select("dueDate balanceDue")
      .lean(),

    Bill.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      billDate: { $lte: asOfEnd },
      balanceDue: { $gt: 0 },
    })
      .select("dueDate balanceDue")
      .lean(),

    PaymentReceived.find({
      organization_id: organizationId,
      is_deleted: false,
      status: { $ne: "VOID" },
      payment_date: { $gte: minRangeFrom, $lte: maxRangeTo },
    })
      .select("payment_date total_amount_received")
      .lean(),

    PaymentMade.find({
      organization_id: organizationId,
      is_deleted: false,
      status: { $ne: "VOID" },
      payment_date: { $gte: minRangeFrom, $lte: maxRangeTo },
    })
      .select("payment_date total_amount_paid")
      .lean(),

    Invoice.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      invoiceDate: { $gte: incomeFromStart, $lte: incomeToEnd },
    })
      .select("invoiceDate total")
      .lean(),

    Expense.find({
      organizationId,
      isDeleted: false,
      date: { $gte: incomeFromStart, $lte: incomeToEnd },
    })
      .select("date amount expenseAccountId isItemized lineItems")
      .lean(),

    Account.find({
      organizationId,
      isDeleted: false,
      isGroup: false,
    })
      .select("name accountType rootType openingBalance")
      .lean(),
  ]);

  const allAccounts = allAccountDocs as DashboardAccountRow[];
  const accountNameMap = new Map(allAccounts.map((account) => [String(account._id), account.name]));

  const receivableBuckets = createAgingBuckets();
  for (const invoice of receivableDocs as Array<{ dueDate?: Date | null; balanceDue?: number }>) {
    const amount = round2(toNum(invoice.balanceDue));
    if (amount <= 0) continue;

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    if (!dueDate || dueDate >= asOfEnd) {
      receivableBuckets.current = round2(receivableBuckets.current + amount);
      continue;
    }

    const daysOverdue = Math.floor((asOfEnd.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 15) receivableBuckets["1-15"] = round2(receivableBuckets["1-15"] + amount);
    else if (daysOverdue <= 30) receivableBuckets["16-30"] = round2(receivableBuckets["16-30"] + amount);
    else if (daysOverdue <= 45) receivableBuckets["31-45"] = round2(receivableBuckets["31-45"] + amount);
    else receivableBuckets["above-45"] = round2(receivableBuckets["above-45"] + amount);
  }

  const payableBuckets = createAgingBuckets();
  for (const bill of payableDocs as Array<{ dueDate?: Date | null; balanceDue?: number }>) {
    const amount = round2(toNum(bill.balanceDue));
    if (amount <= 0) continue;

    const dueDate = bill.dueDate ? new Date(bill.dueDate) : null;
    if (!dueDate || dueDate >= asOfEnd) {
      payableBuckets.current = round2(payableBuckets.current + amount);
      continue;
    }

    const daysOverdue = Math.floor((asOfEnd.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysOverdue <= 15) payableBuckets["1-15"] = round2(payableBuckets["1-15"] + amount);
    else if (daysOverdue <= 30) payableBuckets["16-30"] = round2(payableBuckets["16-30"] + amount);
    else if (daysOverdue <= 45) payableBuckets["31-45"] = round2(payableBuckets["31-45"] + amount);
    else payableBuckets["above-45"] = round2(payableBuckets["above-45"] + amount);
  }

  const subledgerReceivableTotal = sumAgingBuckets(receivableBuckets);
  const subledgerPayableTotal = sumAgingBuckets(payableBuckets);

  const cashIncomingMap = new Map<string, number>();
  const cashOutgoingMap = new Map<string, number>();
  const incomeCashInMap = new Map<string, number>();
  const incomeCashOutMap = new Map<string, number>();

  for (const payment of paymentInDocs as Array<{ payment_date?: Date; total_amount_received?: number }>) {
    const date = payment.payment_date ? new Date(payment.payment_date) : null;
    if (!date || Number.isNaN(date.getTime())) continue;

    const amount = round2(toNum(payment.total_amount_received));
    const monthKey = monthKeyFromDate(date);

    if (isWithinDateRange(date, cashFrom, cashTo)) {
      addToNumberMap(cashIncomingMap, monthKey, amount);
    }
    if (isWithinDateRange(date, incomeFrom, incomeTo)) {
      addToNumberMap(incomeCashInMap, monthKey, amount);
    }
  }

  for (const payment of paymentOutDocs as Array<{ payment_date?: Date; total_amount_paid?: number }>) {
    const date = payment.payment_date ? new Date(payment.payment_date) : null;
    if (!date || Number.isNaN(date.getTime())) continue;

    const amount = round2(toNum(payment.total_amount_paid));
    const monthKey = monthKeyFromDate(date);

    if (isWithinDateRange(date, cashFrom, cashTo)) {
      addToNumberMap(cashOutgoingMap, monthKey, amount);
    }
    if (isWithinDateRange(date, incomeFrom, incomeTo)) {
      addToNumberMap(incomeCashOutMap, monthKey, amount);
    }
  }

  const docIncomeAccrualMap = new Map<string, number>();
  for (const invoice of invoiceIncomeDocs as Array<{ invoiceDate?: Date; total?: number }>) {
    const date = invoice.invoiceDate ? new Date(invoice.invoiceDate) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    addToNumberMap(docIncomeAccrualMap, monthKeyFromDate(date), round2(toNum(invoice.total)));
  }

  const docExpenseAccrualMap = new Map<string, number>();
  const docExpenseCategoryMap = new Map<string, number>();

  for (const expense of expenseDocs as Array<{
    date?: Date;
    amount?: number;
    expenseAccountId?: Types.ObjectId | null;
    isItemized?: boolean;
    lineItems?: Array<{ expenseAccountId?: Types.ObjectId | null; amount?: number }>;
  }>) {
    const date = expense.date ? new Date(expense.date) : null;
    if (!date || Number.isNaN(date.getTime())) continue;

    let expenseTotal = 0;
    const hasItemizedLines = Boolean(expense.isItemized && Array.isArray(expense.lineItems) && expense.lineItems.length > 0);

    if (hasItemizedLines) {
      for (const line of expense.lineItems || []) {
        const lineAmount = round2(toNum(line?.amount));
        if (lineAmount === 0) continue;
        expenseTotal = round2(expenseTotal + lineAmount);
        const accountId = line?.expenseAccountId ? String(line.expenseAccountId) : "__uncategorized__";
        addToNumberMap(docExpenseCategoryMap, accountId, lineAmount);
      }
    } else {
      expenseTotal = round2(toNum(expense.amount));
      if (expenseTotal !== 0) {
        const accountId = expense.expenseAccountId ? String(expense.expenseAccountId) : "__uncategorized__";
        addToNumberMap(docExpenseCategoryMap, accountId, expenseTotal);
      }
    }

    addToNumberMap(docExpenseAccrualMap, monthKeyFromDate(date), expenseTotal);
  }

  const cashBankAccounts = allAccounts.filter((row) => row.accountType === "Cash" || row.accountType === "Bank");
  const bankCardAccounts = allAccounts.filter((row) => row.accountType === "Bank" || row.accountType === "Credit Card");
  const receivableAccounts = allAccounts.filter((row) => row.accountType === "Accounts Receivable");
  const payableAccounts = allAccounts.filter((row) => row.accountType === "Accounts Payable");
  const incomeExpenseAccounts = allAccounts.filter((row) => row.rootType === "Income" || row.rootType === "Expense");

  const dayBeforeCashFrom = new Date(cashFromStart);
  dayBeforeCashFrom.setDate(dayBeforeCashFrom.getDate() - 1);

  const [
    bankCardMovementMap,
    startMovementMap,
    receivableMovementMap,
    payableMovementMap,
    cashFlowGlRows,
    incomeCashGlRows,
    incomeExpenseGlRows,
  ] = await Promise.all([
    bankCardAccounts.length
      ? loadMovementMap({ organizationId, asOf, accountIds: bankCardAccounts.map((row) => row._id) })
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),

    cashBankAccounts.length
      ? loadMovementMap({ organizationId, asOf: dayBeforeCashFrom, accountIds: cashBankAccounts.map((row) => row._id) })
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),

    receivableAccounts.length
      ? loadMovementMap({ organizationId, asOf, accountIds: receivableAccounts.map((row) => row._id) })
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),

    payableAccounts.length
      ? loadMovementMap({ organizationId, asOf, accountIds: payableAccounts.map((row) => row._id) })
      : Promise.resolve(new Map<string, { debit: number; credit: number }>()),

    cashBankAccounts.length
      ? GlEntry.aggregate([
        {
          $match: {
            organizationId,
            accountId: { $in: cashBankAccounts.map((row) => row._id) },
            postingDate: { $gte: cashFromStart, $lte: cashToEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$postingDate" } },
            incoming: { $sum: { $ifNull: ["$debit", 0] } },
            outgoing: { $sum: { $ifNull: ["$credit", 0] } },
          },
        },
      ])
      : Promise.resolve([]),

    cashBankAccounts.length
      ? GlEntry.aggregate([
        {
          $match: {
            organizationId,
            accountId: { $in: cashBankAccounts.map((row) => row._id) },
            postingDate: { $gte: incomeFromStart, $lte: incomeToEnd },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$postingDate" } },
            incoming: { $sum: { $ifNull: ["$debit", 0] } },
            outgoing: { $sum: { $ifNull: ["$credit", 0] } },
          },
        },
      ])
      : Promise.resolve([]),

    incomeExpenseAccounts.length
      ? GlEntry.aggregate([
        {
          $match: {
            organizationId,
            accountId: { $in: incomeExpenseAccounts.map((row) => row._id) },
            postingDate: { $gte: incomeFromStart, $lte: incomeToEnd },
          },
        },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: "%Y-%m", date: "$postingDate" } },
              accountId: "$accountId",
            },
            debit: { $sum: { $ifNull: ["$debit", 0] } },
            credit: { $sum: { $ifNull: ["$credit", 0] } },
          },
        },
      ])
      : Promise.resolve([]),
  ]);

  const cashGlIncomingMap = new Map<string, number>();
  const cashGlOutgoingMap = new Map<string, number>();
  for (const row of cashFlowGlRows as Array<{ _id: string; incoming: number; outgoing: number }>) {
    addToNumberMap(cashGlIncomingMap, String(row._id), round2(toNum(row.incoming)));
    addToNumberMap(cashGlOutgoingMap, String(row._id), round2(toNum(row.outgoing)));
  }

  const incomeCashGlInMap = new Map<string, number>();
  const incomeCashGlOutMap = new Map<string, number>();
  for (const row of incomeCashGlRows as Array<{ _id: string; incoming: number; outgoing: number }>) {
    addToNumberMap(incomeCashGlInMap, String(row._id), round2(toNum(row.incoming)));
    addToNumberMap(incomeCashGlOutMap, String(row._id), round2(toNum(row.outgoing)));
  }

  const glIncomeAccrualMap = new Map<string, number>();
  const glExpenseAccrualMap = new Map<string, number>();
  const glExpenseCategoryMap = new Map<string, number>();
  const accountById = new Map(allAccounts.map((row) => [String(row._id), row]));

  for (const row of incomeExpenseGlRows as Array<{
    _id: { month: string; accountId: Types.ObjectId };
    debit: number;
    credit: number;
  }>) {
    const account = accountById.get(String(row._id.accountId));
    if (!account) continue;

    if (account.rootType === "Income") {
      addToNumberMap(
        glIncomeAccrualMap,
        String(row._id.month),
        round2(toNum(row.credit) - toNum(row.debit)),
      );
    } else if (account.rootType === "Expense") {
      const expenseAmount = round2(toNum(row.debit) - toNum(row.credit));
      addToNumberMap(glExpenseAccrualMap, String(row._id.month), expenseAmount);
      addToNumberMap(glExpenseCategoryMap, String(account._id), expenseAmount);
    }
  }

  const glReceivableTotal = round2(
    receivableAccounts.reduce((sum, account) => {
      const movement = receivableMovementMap.get(String(account._id)) || { debit: 0, credit: 0 };
      return sum + Math.max(0, closingBalanceForAccount(account, movement));
    }, 0),
  );

  const glPayableTotal = round2(
    payableAccounts.reduce((sum, account) => {
      const movement = payableMovementMap.get(String(account._id)) || { debit: 0, credit: 0 };
      return sum + Math.max(0, closingBalanceForAccount(account, movement));
    }, 0),
  );

  let receivableTotal = subledgerReceivableTotal;
  let receivableCurrent = receivableBuckets.current;
  let receivableOverdue = round2(subledgerReceivableTotal - receivableBuckets.current);
  let effectiveReceivableBuckets = receivableBuckets;

  if (!hasValue(receivableTotal) && hasValue(glReceivableTotal)) {
    receivableTotal = glReceivableTotal;
    receivableCurrent = glReceivableTotal;
    receivableOverdue = 0;
    effectiveReceivableBuckets = {
      current: glReceivableTotal,
      "1-15": 0,
      "16-30": 0,
      "31-45": 0,
      "above-45": 0,
    };
  }

  let payableTotal = subledgerPayableTotal;
  let payableCurrent = payableBuckets.current;
  let payableOverdue = round2(subledgerPayableTotal - payableBuckets.current);
  let effectivePayableBuckets = payableBuckets;

  if (!hasValue(payableTotal) && hasValue(glPayableTotal)) {
    payableTotal = glPayableTotal;
    payableCurrent = glPayableTotal;
    payableOverdue = 0;
    effectivePayableBuckets = {
      current: glPayableTotal,
      "1-15": 0,
      "16-30": 0,
      "31-45": 0,
      "above-45": 0,
    };
  }

  const paymentCashActivity = round2(sumMapValues(cashIncomingMap) + sumMapValues(cashOutgoingMap));
  const effectiveCashIncomingMap = hasValue(paymentCashActivity) ? cashIncomingMap : cashGlIncomingMap;
  const effectiveCashOutgoingMap = hasValue(paymentCashActivity) ? cashOutgoingMap : cashGlOutgoingMap;

  const paymentIncomeCashActivity = round2(sumMapValues(incomeCashInMap) + sumMapValues(incomeCashOutMap));
  const effectiveIncomeCashInMap = hasValue(paymentIncomeCashActivity) ? incomeCashInMap : incomeCashGlInMap;
  const effectiveIncomeCashOutMap = hasValue(paymentIncomeCashActivity) ? incomeCashOutMap : incomeCashGlOutMap;

  const glAccrualActivity = round2(sumMapValues(glIncomeAccrualMap) + sumMapValues(glExpenseAccrualMap));
  const effectiveIncomeAccrualMap = hasValue(glAccrualActivity) ? glIncomeAccrualMap : docIncomeAccrualMap;
  const effectiveExpenseAccrualMap = hasValue(glAccrualActivity) ? glExpenseAccrualMap : docExpenseAccrualMap;

  const glTopExpenseActivity = sumMapValues(glExpenseCategoryMap);
  const effectiveTopExpenseMap = hasValue(glTopExpenseActivity) ? glExpenseCategoryMap : docExpenseCategoryMap;

  const topExpenseRows = Array.from(effectiveTopExpenseMap.entries())
    .map(([accountId, totalAmount]) => ({
      accountId: accountId === "__uncategorized__" ? "" : accountId,
      categoryName:
        accountId === "__uncategorized__"
          ? "Uncategorized"
          : accountNameMap.get(accountId) || "Uncategorized",
      totalAmount: round2(totalAmount),
    }))
    .filter((row) => row.totalAmount >= 0.01)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, topExpensesLimit);

  const bankRows = bankCardAccounts
    .map((account) => {
      const movement = bankCardMovementMap.get(String(account._id)) || { debit: 0, credit: 0 };
      return {
        accountId: String(account._id),
        name: account.name,
        accountType: account.accountType,
        balance: closingBalanceForAccount(account, movement),
      };
    })
    .sort((a, b) => b.balance - a.balance);

  const bankCardsTotal = round2(bankRows.reduce((sum, row) => sum + row.balance, 0));
  const cashAsOnStart = round2(
    cashBankAccounts.reduce((sum, account) => {
      const movement = startMovementMap.get(String(account._id)) || { debit: 0, credit: 0 };
      return sum + closingBalanceForAccount(account, movement);
    }, 0),
  );

  const cashMonthKeys = enumerateMonthKeys(cashFrom, cashTo);
  let runningCash = cashAsOnStart;

  const cashFlowMonths = cashMonthKeys.map((key) => {
    const incoming = round2(effectiveCashIncomingMap.get(key) || 0);
    const outgoing = round2(effectiveCashOutgoingMap.get(key) || 0);
    runningCash = round2(runningCash + incoming - outgoing);

    return {
      key,
      month: monthLabelFromKey(key),
      incoming,
      outgoing,
      closing: runningCash,
    };
  });

  const cashIncomingTotal = round2(cashFlowMonths.reduce((sum, row) => sum + row.incoming, 0));
  const cashOutgoingTotal = round2(cashFlowMonths.reduce((sum, row) => sum + row.outgoing, 0));
  const cashClosingBalance = cashFlowMonths.length > 0
    ? cashFlowMonths[cashFlowMonths.length - 1].closing
    : cashAsOnStart;

  const incomeMonthKeys = enumerateMonthKeys(incomeFrom, incomeTo);

  const accrualIncomeTotal = round2(incomeMonthKeys.reduce((sum, key) => sum + (effectiveIncomeAccrualMap.get(key) || 0), 0));
  const accrualExpenseTotal = round2(incomeMonthKeys.reduce((sum, key) => sum + (effectiveExpenseAccrualMap.get(key) || 0), 0));
  const cashIncomeTotal = round2(incomeMonthKeys.reduce((sum, key) => sum + (effectiveIncomeCashInMap.get(key) || 0), 0));
  const cashExpenseTotal = round2(incomeMonthKeys.reduce((sum, key) => sum + (effectiveIncomeCashOutMap.get(key) || 0), 0));

  const selectedIncomeMap = incomeBasis === "cash" ? effectiveIncomeCashInMap : effectiveIncomeAccrualMap;
  const selectedExpenseMap = incomeBasis === "cash" ? effectiveIncomeCashOutMap : effectiveExpenseAccrualMap;

  const incomeExpenseMonths = incomeMonthKeys.map((key) => ({
    key,
    month: monthLabelFromKey(key),
    income: round2(selectedIncomeMap.get(key) || 0),
    expense: round2(selectedExpenseMap.get(key) || 0),
  }));

  const incomeTotal = round2(incomeExpenseMonths.reduce((sum, row) => sum + row.income, 0));
  const expenseTotal = round2(incomeExpenseMonths.reduce((sum, row) => sum + row.expense, 0));

  const watchlistRows = watchlistBasis === "cash"
    ? [
      { key: "cash-in", label: "Cash In", value: cashIncomeTotal },
      { key: "cash-out", label: "Cash Out", value: cashExpenseTotal },
      { key: "net-cash", label: "Net Cash", value: round2(cashIncomeTotal - cashExpenseTotal) },
      { key: "bank-cards", label: "Bank & Cards", value: bankCardsTotal },
    ]
    : [
      { key: "receivables", label: "Receivables", value: receivableTotal },
      { key: "payables", label: "Payables", value: payableTotal },
      { key: "income", label: "Income", value: accrualIncomeTotal },
      { key: "net-income", label: "Net Income", value: round2(accrualIncomeTotal - accrualExpenseTotal) },
    ];

  res.json({
    success: true,
    data: {
      asOf,
      periods: {
        cashFlow: { from: cashFrom, to: cashTo },
        incomeExpense: { from: incomeFrom, to: incomeTo },
      },
      receivables: {
        total: receivableTotal,
        current: receivableCurrent,
        overdue: receivableOverdue,
        buckets: effectiveReceivableBuckets,
      },
      payables: {
        total: payableTotal,
        current: payableCurrent,
        overdue: payableOverdue,
        buckets: effectivePayableBuckets,
      },
      cashFlow: {
        startBalance: cashAsOnStart,
        incomingTotal: cashIncomingTotal,
        outgoingTotal: cashOutgoingTotal,
        closingBalance: cashClosingBalance,
        months: cashFlowMonths,
      },
      incomeExpense: {
        basis: incomeBasis,
        totalIncome: incomeTotal,
        totalExpense: expenseTotal,
        netAmount: round2(incomeTotal - expenseTotal),
        months: incomeExpenseMonths,
      },
      topExpenses: {
        totalAmount: round2(topExpenseRows.reduce((sum, row) => sum + row.totalAmount, 0)),
        rows: topExpenseRows,
      },
      bankCreditCards: {
        totalBalance: bankCardsTotal,
        rows: bankRows,
      },
      accountWatchlist: {
        basis: watchlistBasis,
        rows: watchlistRows,
      },
    },
  });
});

export const salesByItemDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const itemId = req.query.itemId as string | undefined;

  const filter: any = {
    organizationId, isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  
  if (itemId && Types.ObjectId.isValid(itemId)) {
    filter["items.itemId"] = new Types.ObjectId(itemId);
  }

  const invoices = await Invoice.find(filter)
    .populate("customerId", "displayName companyName")
    .sort({ invoiceDate: -1 })
    .lean();

  const rows: any[] = [];
  for (const inv of invoices as any[]) {
    for (const item of inv.items || []) {
      if (itemId && Types.ObjectId.isValid(itemId) && String(item.itemId) !== itemId) continue;
      
      rows.push({
        invoiceId: String(inv._id),
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customerId?.displayName || inv.customerId?.companyName || "Unknown",
        itemId: String(item.itemId || ""),
        itemName: item.name || "Unknown Item",
        quantity: round2(toNum(item.quantity)),
        rate: round2(toNum(item.rate)),
        amount: round2(toNum(item.amount)),
        status: inv.status,
      });
    }
  }

  const totals = {
    totalQuantity: round2(rows.reduce((s, r) => s + r.quantity, 0)),
    totalAmount: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const purchasesByItemDetails = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const itemId = req.query.itemId as string | undefined;

  const filter: any = {
    organizationId, isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };

  if (itemId && Types.ObjectId.isValid(itemId)) {
    filter["lineItems.itemId"] = new Types.ObjectId(itemId);
  }

  const bills = await Bill.find(filter)
    .populate("vendorId", "displayName companyName")
    .sort({ billDate: -1 })
    .lean();

  const rows: any[] = [];
  for (const bill of bills as any[]) {
    for (const item of bill.lineItems || []) {
      if (item.isHeader) continue;
      if (itemId && Types.ObjectId.isValid(itemId) && String(item.itemId) !== itemId) continue;

      rows.push({
        billId: String(bill._id),
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        vendorName: bill.vendorId?.displayName || bill.vendorId?.companyName || "Unknown",
        itemId: String(item.itemId || ""),
        itemName: item.name || "Unknown Item",
        quantity: round2(toNum(item.quantity)),
        rate: round2(toNum(item.rate)),
        amount: round2(toNum(item.amount)),
        status: bill.status,
      });
    }
  }

  const totals = {
    totalQuantity: round2(rows.reduce((s, r) => s + r.quantity, 0)),
    totalAmount: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});

export const itemTransactionHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const from = parseDate(req.query.from, "from") || defaultFrom();
  const to = parseDate(req.query.to, "to") || defaultTo();
  const itemId = req.query.itemId as string | undefined;

  if (!itemId || !Types.ObjectId.isValid(itemId)) {
    throw new ValidationError("Valid Item ID is required for transaction history");
  }

  const [invoices, bills, adjustments] = await Promise.all([
    Invoice.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      "items.itemId": itemId,
    }).populate("customerId", "displayName companyName").lean(),
    
    Bill.find({
      organizationId,
      isDeleted: false,
      status: { $nin: ["Draft", "Void"] },
      billDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
      "lineItems.itemId": itemId,
    }).populate("vendorId", "displayName companyName").lean(),
    
    InventoryAdjustment.find({
      organizationId,
      itemId,
      adjustedAt: { $gte: startOfDay(from), $lte: endOfDay(to) },
    }).lean(),
  ]);

  const rows: any[] = [];

  // Sales (Quantity Out)
  for (const inv of invoices as any[]) {
    for (const item of inv.items || []) {
      if (String(item.itemId) === itemId) {
        rows.push({
          date: inv.invoiceDate,
          type: "Sale",
          reference: inv.invoiceNumber,
          party: inv.customerId?.displayName || inv.customerId?.companyName || "Unknown",
          quantityIn: 0,
          quantityOut: round2(toNum(item.quantity)),
          rate: round2(toNum(item.rate)),
          amount: round2(toNum(item.amount)),
          docId: String(inv._id),
        });
      }
    }
  }

  // Purchases (Quantity In)
  for (const bill of bills as any[]) {
    for (const item of bill.lineItems || []) {
      if (String(item.itemId) === itemId && !item.isHeader) {
        rows.push({
          date: bill.billDate,
          type: "Purchase",
          reference: bill.billNumber,
          party: bill.vendorId?.displayName || bill.vendorId?.companyName || "Unknown",
          quantityIn: round2(toNum(item.quantity)),
          quantityOut: 0,
          rate: round2(toNum(item.rate)),
          amount: round2(toNum(item.amount)),
          docId: String(bill._id),
        });
      }
    }
  }

  // Adjustments
  for (const adj of adjustments as any[]) {
    const isIncrease = adj.direction === "Increase";
    const qty = Math.abs(round2(toNum(adj.quantityDelta)));
    
    // Check if it's a move order based on reference number or notes
    const isTransfer = String(adj.referenceNumber || "").startsWith("MO-") || 
                       String(adj.notes || "").includes("Transfer");
    
    rows.push({
      date: adj.adjustedAt,
      type: isTransfer ? "Transfer" : "Adjustment",
      reference: adj.referenceNumber || "ADJ",
      party: adj.notes || adj.reason || "Manual Adjustment",
      quantityIn: isIncrease ? qty : 0,
      quantityOut: !isIncrease ? qty : 0,
      rate: round2(toNum(adj.unitCost || 0)),
      amount: round2(toNum(adj.valueDelta || 0)),
      docId: String(adj._id),
    });
  }

  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json({ success: true, data: { from, to, rows, count: rows.length } });
});



