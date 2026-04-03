import { Response } from "express";
import { Types } from "mongoose";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import GlEntry from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import { AuthenticatedRequest } from "../types";
import asyncHandler from "../utils/asyncHandler";
import { ForbiddenError, ValidationError } from "../utils/errors";

type AccountRow = {
  _id: Types.ObjectId;
  name: string;
  code?: string;
  rootType: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  accountType: string;
};

function orgId(req: AuthenticatedRequest): Types.ObjectId {
  const id = req.user?.activeOrganization;
  if (!id) throw new ForbiddenError("No active organization");
  return id as Types.ObjectId;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

async function loadAccounts(organizationId: Types.ObjectId): Promise<Map<string, AccountRow>> {
  const rows = (await Account.find({
    organizationId,
    isDeleted: false,
    isGroup: false,
  })
    .select("name code rootType accountType")
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

export const trialBalance = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf");

  const [accountMap, movementMap] = await Promise.all([
    loadAccounts(organizationId),
    loadMovementMap({ organizationId, asOf }),
  ]);

  const rows = Array.from(movementMap.entries())
    .map(([accountId, movement]) => {
      const account = accountMap.get(accountId);
      if (!account) return null;

      const balance = round2(movement.debit - movement.credit);
      if (Math.abs(balance) < 0.009) return null;

      return {
        accountId,
        code: account.code || "",
        name: account.name,
        rootType: account.rootType,
        accountType: account.accountType,
        totalDebit: movement.debit,
        totalCredit: movement.credit,
        closingDebit: balance > 0 ? balance : 0,
        closingCredit: balance < 0 ? Math.abs(balance) : 0,
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

  if (!from || !to) {
    throw new ValidationError("from and to are required for profit-loss report");
  }

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
      income.push({
        accountId,
        code: account.code || "",
        name: account.name,
        amount,
      });
      continue;
    }

    if (account.rootType === "Expense") {
      const amount = round2(movement.debit - movement.credit);
      if (Math.abs(amount) < 0.009) continue;
      expenses.push({
        accountId,
        code: account.code || "",
        name: account.name,
        amount,
      });
    }
  }

  income.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  expenses.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const totalIncome = round2(income.reduce((sum, row) => sum + row.amount, 0));
  const totalExpense = round2(expenses.reduce((sum, row) => sum + row.amount, 0));
  const netProfit = round2(totalIncome - totalExpense);

  res.json({
    success: true,
    data: {
      from,
      to,
      income,
      expenses,
      totals: {
        totalIncome,
        totalExpense,
        netProfit,
      },
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

  for (const [accountId, movement] of movementMap.entries()) {
    const account = accountMap.get(accountId);
    if (!account) continue;

    const debit = round2(movement.debit);
    const credit = round2(movement.credit);

    if (account.rootType === "Asset") {
      const amount = round2(debit - credit);
      if (Math.abs(amount) < 0.009) continue;
      assets.push({ accountId, code: account.code || "", name: account.name, amount });
      continue;
    }

    if (account.rootType === "Liability") {
      const amount = round2(credit - debit);
      if (Math.abs(amount) < 0.009) continue;
      liabilities.push({ accountId, code: account.code || "", name: account.name, amount });
      continue;
    }

    if (account.rootType === "Equity") {
      const amount = round2(credit - debit);
      if (Math.abs(amount) < 0.009) continue;
      equity.push({ accountId, code: account.code || "", name: account.name, amount });
      continue;
    }

    if (account.rootType === "Income") {
      incomeTotal = round2(incomeTotal + (credit - debit));
      continue;
    }

    if (account.rootType === "Expense") {
      expenseTotal = round2(expenseTotal + (debit - credit));
    }
  }

  const currentEarnings = round2(incomeTotal - expenseTotal);
  if (Math.abs(currentEarnings) >= 0.009) {
    equity.push({
      accountId: "__current_earnings__",
      code: "",
      name: "Current Earnings",
      amount: currentEarnings,
    });
  }

  assets.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  liabilities.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  equity.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const totalAssets = round2(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + row.amount, 0));
  const totalEquity = round2(equity.reduce((sum, row) => sum + row.amount, 0));
  const equationDifference = round2(totalAssets - (totalLiabilities + totalEquity));

  res.json({
    success: true,
    data: {
      asOf,
      assets,
      liabilities,
      equity,
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        equationDifference,
      },
    },
  });
});

export const controlReconciliation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = orgId(req);
  const asOf = parseDate(req.query.asOf, "asOf");

  const [arAccounts, apAccounts] = await Promise.all([
    Account.find({
      organizationId,
      isDeleted: false,
      isGroup: false,
      accountType: "Accounts Receivable",
    })
      .select("name code")
      .lean(),
    Account.find({
      organizationId,
      isDeleted: false,
      isGroup: false,
      accountType: "Accounts Payable",
    })
      .select("name code")
      .lean(),
  ]);

  const [arMovement, apMovement, receivableRows, payableRows] = await Promise.all([
    loadMovementMap({
      organizationId,
      asOf,
      accountIds: arAccounts.map((a: any) => a._id),
    }),
    loadMovementMap({
      organizationId,
      asOf,
      accountIds: apAccounts.map((a: any) => a._id),
    }),
    Invoice.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$balanceDue", 0] } },
        },
      },
    ]),
    Bill.aggregate([
      {
        $match: {
          organizationId,
          isDeleted: false,
          status: { $nin: ["Draft", "Void"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$balanceDue", 0] } },
        },
      },
    ]),
  ]);

  const glReceivable = round2(
    Array.from(arMovement.values()).reduce((sum, movement) => sum + movement.debit - movement.credit, 0),
  );
  const glPayable = round2(
    Array.from(apMovement.values()).reduce((sum, movement) => sum + movement.credit - movement.debit, 0),
  );

  const subledgerReceivable = round2(Number(receivableRows[0]?.total || 0));
  const subledgerPayable = round2(Number(payableRows[0]?.total || 0));

  res.json({
    success: true,
    data: {
      asOf: asOf || new Date(),
      receivables: {
        glBalance: glReceivable,
        subledgerBalance: subledgerReceivable,
        difference: round2(glReceivable - subledgerReceivable),
        controlAccounts: arAccounts,
      },
      payables: {
        glBalance: glPayable,
        subledgerBalance: subledgerPayable,
        difference: round2(glPayable - subledgerPayable),
        controlAccounts: apAccounts,
      },
    },
  });
});
