import RecurringBill from "../models/recurring-bill.model";
import { executeRecurringRun } from "./recurring-bill.execution";

const MAX_RECOVERY_RUNS_PER_PROFILE = 12;

export async function runRecurringBillCycle() {
  const now = new Date();
  const due = await RecurringBill.find({
    isDeleted: false,
    status: "Active",
    nextBillDate: { $ne: null, $lte: now },
  }).limit(200);

  for (const rec of due) {
    let generated = 0;
    while (rec.nextBillDate && rec.nextBillDate <= now && generated < MAX_RECOVERY_RUNS_PER_PROFILE) {
      if (!rec.neverExpires && rec.endsOn && rec.nextBillDate > rec.endsOn) {
        rec.status = "Expired";
        rec.nextBillDate = null;
        await rec.save();
        break;
      }
      try {
        await executeRecurringRun(rec, new Date(rec.nextBillDate));
      } catch (err) {
        console.error("Recurring bill generation failed", rec._id, err);
        break;
      }
      generated += 1;
    }
  }
}

export function startRecurringBillScheduler() {
  const intervalMs = Number(process.env.RECURRING_BILL_INTERVAL_MS || 300000);
  runRecurringBillCycle().catch((err) => console.error("Recurring bill cycle failed", err));
  setInterval(() => {
    runRecurringBillCycle().catch((err) => console.error("Recurring bill cycle failed", err));
  }, intervalMs);
}
