import Expense from "../models/expense.model";
import RecurringExpense from "../models/recurring-expense.model";

const MAX_RECOVERY_RUNS_PER_PROFILE = 12;

export function computeNextExpenseDate(from: Date, frequency: string, repeatEvery: number): Date {
  const d = new Date(from);
  switch (frequency) {
    case "Daily":
      d.setDate(d.getDate() + repeatEvery);
      break;
    case "Weekly":
      d.setDate(d.getDate() + repeatEvery * 7);
      break;
    case "Monthly":
      d.setMonth(d.getMonth() + repeatEvery);
      break;
    case "Yearly":
      d.setFullYear(d.getFullYear() + repeatEvery);
      break;
  }
  return d;
}

function normalizeRunDate(runDate: Date): Date {
  const d = new Date(runDate);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isRunAfterEndDate(runDate: Date, endsOn: Date): boolean {
  return runDate > endOfDay(new Date(endsOn));
}

async function advanceRecurringStateAfterRun(rec: any, runDate: Date, expenseId: any, actorId?: any) {
  rec.lastExpenseDate = runDate;
  const nextDate = computeNextExpenseDate(runDate, rec.frequency, rec.repeatEvery);

  if (rec.neverExpires || !rec.endsOn || !isRunAfterEndDate(nextDate, rec.endsOn)) {
    rec.nextExpenseDate = nextDate;
  } else {
    rec.nextExpenseDate = null;
    rec.status = "Expired";
  }

  const alreadyLinked = (rec.generatedExpenseIds || []).some((id: any) => String(id) === String(expenseId));
  if (!alreadyLinked) rec.generatedExpenseIds.push(expenseId);

  if (actorId) rec.updatedBy = actorId;
  await rec.save();
}

export async function executeRecurringExpenseRun(rec: any, scheduledRunDate: Date, actorId?: any) {
  if (rec.status !== "Active") {
    throw new Error("Recurring expense is not active");
  }

  const normalizedRunDate = normalizeRunDate(scheduledRunDate);

  const existingRunExpense = await Expense.findOne({
    organizationId: rec.organizationId,
    recurringId: rec._id,
    recurringRunDate: normalizedRunDate,
    isDeleted: false,
  });
  if (existingRunExpense) {
    const fallbackActorId = actorId || rec.updatedBy || rec.createdBy;
    await advanceRecurringStateAfterRun(rec, normalizedRunDate, existingRunExpense._id, fallbackActorId);
    return { expense: existingRunExpense, skipped: true };
  }

  if (!rec.neverExpires && rec.endsOn && isRunAfterEndDate(normalizedRunDate, rec.endsOn)) {
    rec.status = "Expired";
    rec.nextExpenseDate = null;
    await rec.save();
    return { expense: null, skipped: true };
  }

  const creatorId = actorId || rec.updatedBy || rec.createdBy;
  if (!creatorId) throw new Error("Recurring profile missing creator");

  const expense = new Expense({
    organizationId: rec.organizationId,
    expenseAccountId: rec.expenseAccountId,
    amount: rec.amount,
    currency: rec.currency,
    paidThroughAccountId: rec.paidThroughAccountId,
    vendorId: rec.vendorId,
    customerId: rec.customerId,
    isBillable: rec.isBillable,
    projectId: rec.projectId,
    notes: rec.notes ? `[Recurring: ${rec.profileName}] ${rec.notes}` : `[Recurring: ${rec.profileName}]`,
    date: normalizedRunDate,
    recurringId: rec._id,
    recurringRunDate: normalizedRunDate,
    status: "Draft",
    isItemized: false,
    createdBy: creatorId,
    updatedBy: creatorId,
  });

  try {
    await expense.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      const duplicateRunExpense = await Expense.findOne({
        organizationId: rec.organizationId,
        recurringId: rec._id,
        recurringRunDate: normalizedRunDate,
        isDeleted: false,
      });
      if (duplicateRunExpense) {
        await advanceRecurringStateAfterRun(rec, normalizedRunDate, duplicateRunExpense._id, creatorId);
        return { expense: duplicateRunExpense, skipped: true };
      }
    }
    throw err;
  }

  await advanceRecurringStateAfterRun(rec, normalizedRunDate, expense._id, creatorId);

  return { expense, skipped: false };
}

export async function runRecurringExpenseCycle() {
  const now = new Date();
  const todayStart = startOfDay(now);

  await RecurringExpense.updateMany(
    {
      isDeleted: false,
      status: "Active",
      neverExpires: false,
      endsOn: { $ne: null, $lt: todayStart },
    },
    {
      $set: {
        status: "Expired",
        nextExpenseDate: null,
      },
    },
  );

  const due = await RecurringExpense.find({
    isDeleted: false,
    status: "Active",
    nextExpenseDate: { $ne: null, $lte: now },
  }).limit(200);

  for (const rec of due) {
    let generated = 0;
    while (rec.nextExpenseDate && rec.nextExpenseDate <= now && generated < MAX_RECOVERY_RUNS_PER_PROFILE) {
      if (!rec.neverExpires && rec.endsOn && isRunAfterEndDate(new Date(rec.nextExpenseDate), rec.endsOn)) {
        rec.status = "Expired";
        rec.nextExpenseDate = null;
        await rec.save();
        break;
      }

      try {
        await executeRecurringExpenseRun(rec, new Date(rec.nextExpenseDate));
      } catch (err) {
        console.error("Recurring expense generation failed", rec._id, err);
        break;
      }
      generated += 1;
    }
  }
}

export function startRecurringExpenseScheduler() {
  const intervalMs = Number(process.env.RECURRING_EXPENSE_INTERVAL_MS || 300000);
  runRecurringExpenseCycle().catch((err) => console.error("Recurring expense cycle failed", err));
  setInterval(() => {
    runRecurringExpenseCycle().catch((err) => console.error("Recurring expense cycle failed", err));
  }, intervalMs);
}

export async function dedupeRecurringRunExpenses() {
  const duplicateGroups = await Expense.aggregate([
    {
      $match: {
        recurringId: { $ne: null },
        recurringRunDate: { $ne: null },
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: {
          organizationId: "$organizationId",
          recurringId: "$recurringId",
          recurringRunDate: "$recurringRunDate",
        },
        docs: {
          $push: {
            _id: "$_id",
            createdAt: "$createdAt",
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
  ]);

  if (duplicateGroups.length === 0) return;

  let dedupedCount = 0;
  for (const group of duplicateGroups) {
    const sortedDocs = [...group.docs].sort((a: any, b: any) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      if (at !== bt) return at - bt;
      return String(a._id).localeCompare(String(b._id));
    });

    const duplicateIds = sortedDocs.slice(1).map((d: any) => d._id);
    if (duplicateIds.length === 0) continue;

    await Expense.updateMany(
      { _id: { $in: duplicateIds } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      },
    );

    dedupedCount += duplicateIds.length;
  }

  if (dedupedCount > 0) {
    console.warn(`Recurring expense dedupe archived ${dedupedCount} duplicate expense run(s).`);
  }
}
