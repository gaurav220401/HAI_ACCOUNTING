import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import Expense from "../models/expense.model";
import GlEntry from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import Item from "../models/item.model";
import PaymentMade from "../models/payment-made.model";
import PaymentReceived from "../models/payment-received.model";
import PurchaseOrder from "../models/purchase-order.model";
import VendorCredit from "../models/vendor-credit.model";
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

// ─── FINANCIAL STATEMENT REPORTS ─────────────────────────────────────

export const trialBalance = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf");

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
      assets.push({ accountId, code: account.code || "", name: account.name, amount });
    } else if (account.rootType === "Liability") {
      const amount = round2(-signed);
      if (Math.abs(amount) < 0.009) continue;
      liabilities.push({ accountId, code: account.code || "", name: account.name, amount });
    } else if (account.rootType === "Equity") {
      const amount = round2(-signed);
      if (Math.abs(amount) < 0.009) continue;
      equity.push({ accountId, code: account.code || "", name: account.name, amount });
    } else if (account.rootType === "Income") {
      incomeTotal = round2(incomeTotal + (-signed));
    } else if (account.rootType === "Expense") {
      expenseTotal = round2(expenseTotal + signed);
    }
  }

  const currentEarnings = round2(incomeTotal - expenseTotal);
  if (Math.abs(currentEarnings) >= 0.009) {
    equity.push({ accountId: "__current_earnings__", code: "", name: "Current Earnings", amount: currentEarnings });
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

// ─── PAYABLE REPORTS ─────────────────────────────────────────────────

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

  const filter: any = {
    organizationId, isDeleted: false,
    purchaseOrderDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  if (status && status !== "All") filter.status = status;

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
    balanceDue: { $gt: 0 },
  })
    .populate("vendorId", "displayName companyName")
    .sort({ dueDate: 1 })
    .lean();

  const now = new Date();
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

// ─── RECEIVABLE REPORTS ──────────────────────────────────────────────

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

  const filter: any = {
    organizationId, isDeleted: false,
    invoiceDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
  };
  if (status && status !== "All") filter.status = status;

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

  const invoices = await Invoice.find({
    organizationId, isDeleted: false,
    status: { $nin: ["Draft", "Void"] },
    balanceDue: { $gt: 0 },
  })
    .populate("customerId", "displayName companyName")
    .sort({ dueDate: 1 })
    .lean();

  const now = new Date();
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

// ─── PURCHASES & EXPENSES REPORTS ────────────────────────────────────

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

// ─── SALES REPORTS ───────────────────────────────────────────────────

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
        totalWithTax: { $sum: { $add: [{ $ifNull: ["$total", 0] }, { $ifNull: ["$taxAmount", 0] }] } },
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

// ─── PAYMENTS RECEIVED REPORT ────────────────────────────────────────

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

  const rows = payments.map((p: any) => ({
    paymentId: String(p._id),
    paymentNumber: p.payment_number,
    paymentDate: p.payment_date,
    customerName: p.customer_id?.displayName || p.customer_id?.companyName || "Unknown",
    paymentMode: p.payment_mode,
    totalReceived: round2(toNum(p.total_amount_received)),
    usedForInvoices: round2(toNum(p.amount_used_for_invoices)),
    excess: round2(toNum(p.amount_in_excess)),
    status: p.status,
  }));

  const totals = {
    totalReceived: round2(rows.reduce((s, r) => s + r.totalReceived, 0)),
    totalUsed: round2(rows.reduce((s, r) => s + r.usedForInvoices, 0)),
    totalExcess: round2(rows.reduce((s, r) => s + r.excess, 0)),
  };

  res.json({ success: true, data: { from, to, rows, totals, count: rows.length } });
});
