import Bill from "../models/bill.model";
import PaymentTerms from "../models/payment-terms.model";
import { computeDueDate, computeNextDate, calcLineItems, computeRecurringTotals, nextBillNumber, toNum } from "../utils/recurring-bills";

export async function executeRecurringRun(rec: any, scheduledRunDate: Date, actorId?: any) {
  const normalizedRunDate = new Date(scheduledRunDate);

  const existing = await Bill.findOne({
    organizationId: rec.organizationId,
    recurringId: rec._id,
    recurringRunDate: normalizedRunDate,
    isDeleted: false,
  });
  if (existing) return { bill: existing, skipped: true };

  const creatorId = actorId || rec.updatedBy || rec.createdBy;
  if (!creatorId) throw new Error("Recurring profile missing creator");

  const paymentTerms = rec.paymentTermsId
    ? await PaymentTerms.findById(rec.paymentTermsId).lean()
    : null;

  const lineItems = calcLineItems(rec.lineItems || [], rec.discountLevel || "transaction");
  const discountPercent = rec.discountLevel === "transaction" ? toNum(rec.discountPercent) : 0;
  const totals = computeRecurringTotals({
    lineItems,
    discountLevel: rec.discountLevel || "transaction",
    discountPercent,
    taxAmount: rec.taxType === "TDS" ? toNum(rec.taxAmount) : 0,
    tcsAmount: rec.taxType === "TCS" ? toNum(rec.tcsAmount) : 0,
    adjustmentAmount: toNum(rec.adjustmentAmount),
  });

  const lastSequenceBill = await Bill.findOne({
    organizationId: rec.organizationId,
    recurringId: rec._id,
  })
    .sort({ recurringRunSequence: -1 })
    .select("recurringRunSequence")
    .lean();
  const runSequence = ((lastSequenceBill as any)?.recurringRunSequence || 0) + 1;

  const billDate = new Date(normalizedRunDate);
  const dueDate = computeDueDate(
    billDate,
    paymentTerms ? { termType: paymentTerms.termType, netDays: paymentTerms.netDays } : null,
  );

  const bill = new Bill({
    organizationId: rec.organizationId,
    vendorId: rec.vendorId,
    billNumber: await nextBillNumber(rec.organizationId),
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
    subTotal: totals.subTotal,
    discountPercent,
    discountAmount: totals.discountTotal,
    taxType: rec.taxType,
    tdsId: rec.tdsId || null,
    tcsId: rec.tcsId || null,
    taxAmount: rec.taxType === "TDS" ? toNum(rec.taxAmount) : 0,
    tcsAmount: rec.taxType === "TCS" ? toNum(rec.tcsAmount) : 0,
    adjustmentLabel: rec.adjustmentLabel || "Adjustment",
    adjustmentAmount: toNum(rec.adjustmentAmount),
    total: totals.totalAmount,
    amountPaid: 0,
    balanceDue: totals.totalAmount,
    notes: rec.notes || "",
    termsAndConditions: rec.termsAndConditions || "",
    attachments: rec.attachments || [],
    status: "Open",
    recurringId: rec._id,
    recurringRunDate: normalizedRunDate,
    recurringRunSequence: runSequence,
    comments: [{
      author: "System",
      text: `Bill created from recurring profile ${rec.profileName}`,
      time: new Date(),
      isSystem: true,
    }],
    createdBy: creatorId,
    updatedBy: creatorId,
  });
  try {
    await bill.save();
  } catch (err: any) {
    if (err?.code === 11000) {
      const duplicate = await Bill.findOne({
        organizationId: rec.organizationId,
        recurringId: rec._id,
        recurringRunDate: normalizedRunDate,
        isDeleted: false,
      });
      if (duplicate) return { bill: duplicate, skipped: true };
    }
    throw err;
  }

  rec.lastBillDate = normalizedRunDate;
  const nextDate = computeNextDate(normalizedRunDate, rec.frequency, rec.repeatEvery);
  if (rec.neverExpires || !rec.endsOn || nextDate <= rec.endsOn) {
    rec.nextBillDate = nextDate;
  } else {
    rec.nextBillDate = null;
    rec.status = "Expired";
  }
  rec.generatedBillIds.push(bill._id);
  rec.updatedBy = creatorId;
  await rec.save();

  return { bill, skipped: false };
}
