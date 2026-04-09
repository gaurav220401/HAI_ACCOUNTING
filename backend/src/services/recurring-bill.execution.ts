import Bill from "../models/bill.model";
import Contact from "../models/contact.model";
import PaymentTerms from "../models/payment-terms.model";
import { syncBillCreationAccounting } from "./bill-accounting.service";
import { findAccountIdByName } from "./gl-posting.service";
import { computeDueDate, computeNextDate, calcLineItems, computeRecurringTotals, nextBillNumber, toNum } from "../utils/recurring-bills";

async function advanceRecurringStateAfterRun(rec: any, runDate: Date, billId: any, actorId?: any) {
  rec.lastBillDate = runDate;
  const nextDate = computeNextDate(runDate, rec.frequency, rec.repeatEvery);

  if (rec.neverExpires || !rec.endsOn || nextDate <= rec.endsOn) {
    rec.nextBillDate = nextDate;
  } else {
    rec.nextBillDate = null;
    rec.status = "Expired";
  }

  const alreadyLinked = (rec.generatedBillIds || []).some((id: any) => String(id) === String(billId));
  if (!alreadyLinked) rec.generatedBillIds.push(billId);

  if (actorId) rec.updatedBy = actorId;
  await rec.save();
}

export async function executeRecurringRun(rec: any, scheduledRunDate: Date, actorId?: any) {
  const normalizedRunDate = new Date(scheduledRunDate);

  const effectiveActorId = actorId || rec.updatedBy || rec.createdBy;
  if (!effectiveActorId) throw new Error("Recurring profile missing creator");

  const existing = await Bill.findOne({
    organizationId: rec.organizationId,
    recurringId: rec._id,
    recurringRunDate: normalizedRunDate,
    isDeleted: false,
  });
  if (existing) {
    await advanceRecurringStateAfterRun(rec, normalizedRunDate, existing._id, effectiveActorId);
    return { bill: existing, skipped: true };
  }

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

  let accountsPayableId = null;
  if (rec.vendorId) {
    const vendor = await Contact.findOne({
      _id: rec.vendorId,
      organizationId: rec.organizationId,
      isDeleted: false,
    })
      .select("accountsPayableId")
      .lean();
    accountsPayableId = vendor?.accountsPayableId || null;
  }

  if (!accountsPayableId) {
    try {
      accountsPayableId = await findAccountIdByName({
        organizationId: rec.organizationId,
        names: ["Accounts Payable", "Trade Payables", "Creditors"],
        rootType: "Liability",
        accountType: "Accounts Payable",
      });
    } catch {
      accountsPayableId = null;
    }
  }

  const bill = new Bill({
    organizationId: rec.organizationId,
    vendorId: rec.vendorId,
    billNumber: await nextBillNumber(rec.organizationId),
    billDate,
    dueDate,
    paymentTermsId: rec.paymentTermsId || null,
    sourceOfSupply: rec.sourceOfSupply || "",
    destinationOfSupply: rec.destinationOfSupply || "",
    accountsPayableId,
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
    createdBy: effectiveActorId,
    updatedBy: effectiveActorId,
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
      if (duplicate) {
        await advanceRecurringStateAfterRun(rec, normalizedRunDate, duplicate._id, effectiveActorId);
        return { bill: duplicate, skipped: true };
      }
    }
    throw err;
  }

  await syncBillCreationAccounting({ bill });

  await advanceRecurringStateAfterRun(rec, normalizedRunDate, bill._id, effectiveActorId);

  return { bill, skipped: false };
}
