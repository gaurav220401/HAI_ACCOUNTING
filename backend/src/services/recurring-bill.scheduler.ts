import Bill from "../models/bill.model";
import PaymentTerms from "../models/payment-terms.model";
import RecurringBill from "../models/recurring-bill.model";
import { calcLineItems, computeDueDate, computeNextDate, nextBillNumber, toNum } from "../utils/recurring-bills";

async function generateBillFromRecurring(rec: any) {
  const creatorId = rec.updatedBy || rec.createdBy;
  if (!creatorId) {
    console.warn("Skipping recurring bill without creator", rec._id);
    return;
  }

  const billNumber = await nextBillNumber(rec.organizationId);
  const billDate = rec.nextBillDate ? new Date(rec.nextBillDate) : new Date();

  const paymentTerms = rec.paymentTermsId
    ? await PaymentTerms.findById(rec.paymentTermsId).lean()
    : null;
  const dueDate = computeDueDate(billDate, paymentTerms ? { termType: paymentTerms.termType, netDays: paymentTerms.netDays } : null);

  const lineItems = calcLineItems(rec.lineItems || [], rec.discountLevel || "transaction");
  const subTotal = lineItems.filter((i: any) => !i.isHeader).reduce((s: number, i: any) => s + i.quantity * i.rate, 0);
  const discountPercent = rec.discountLevel === "transaction" ? toNum(rec.discountPercent) : 0;
  const discountAmount = rec.discountLevel === "transaction"
    ? (subTotal * discountPercent) / 100
    : lineItems.reduce((s: number, i: any) => s + (i.discountAmount || 0), 0);
  const taxAmount = rec.taxType === "TDS" ? toNum(rec.taxAmount) : 0;
  const tcsAmount = rec.taxType === "TCS" ? toNum(rec.tcsAmount) : 0;
  const adjustmentAmount = toNum(rec.adjustmentAmount);
  const total = subTotal - discountAmount - taxAmount + tcsAmount + adjustmentAmount;

  const bill = new Bill({
    organizationId: rec.organizationId,
    vendorId: rec.vendorId,
    billNumber,
    billDate,
    dueDate,
    paymentTermsId: rec.paymentTermsId || null,
    sourceOfSupply: rec.sourceOfSupply || "",
    destinationOfSupply: rec.destinationOfSupply || "",
    subject: rec.subject || "",
    orderNumber: rec.orderNumber || "",
    discountLevel: rec.discountLevel,
    discountAccountId: rec.discountAccountId || null,
    lineItems,
    subTotal,
    discountPercent,
    discountAmount,
    taxType: rec.taxType,
    tdsId: rec.tdsId || null,
    tcsId: rec.tcsId || null,
    taxAmount,
    tcsAmount,
    adjustmentLabel: rec.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    balanceDue: total,
    notes: rec.notes || "",
    termsAndConditions: rec.termsAndConditions || "",
    status: "Open",
    comments: [{
      author: "System",
      text: `Bill created from recurring profile ${rec.profileName}`,
      time: new Date(),
      isSystem: true,
    }],
    createdBy: creatorId,
    updatedBy: creatorId,
  });

  await bill.save();

  rec.lastBillDate = billDate;
  const nextDate = computeNextDate(billDate, rec.frequency, rec.repeatEvery);
  if (rec.neverExpires || !rec.endsOn || nextDate <= rec.endsOn) {
    rec.nextBillDate = nextDate;
  } else {
    rec.nextBillDate = null;
    rec.status = "Expired";
  }
  rec.generatedBillIds.push(bill._id);
  rec.updatedBy = creatorId;
  await rec.save();
}

export async function runRecurringBillCycle() {
  const now = new Date();
  const due = await RecurringBill.find({
    isDeleted: false,
    status: "Active",
    nextBillDate: { $ne: null, $lte: now },
  }).limit(200);

  for (const rec of due) {
    if (!rec.neverExpires && rec.endsOn && rec.nextBillDate && rec.nextBillDate > rec.endsOn) {
      rec.status = "Expired";
      rec.nextBillDate = null;
      await rec.save();
      continue;
    }
    try {
      await generateBillFromRecurring(rec);
    } catch (err) {
      console.error("Recurring bill generation failed", rec._id, err);
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
