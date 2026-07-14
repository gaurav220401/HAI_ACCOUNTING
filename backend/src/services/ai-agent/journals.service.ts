import Journal from "../../models/journal.model";
import GlEntry from "../../models/gl-entry.model";
import { Types } from "mongoose";

export async function createJournal(organizationId: any, data: any) {
  const lines = data.lineItems || [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    totalDebit += Number(line.debit) || 0;
    totalCredit += Number(line.credit) || 0;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Double-entry balance mismatch: Total Debit (${totalDebit.toFixed(2)}) does not equal Total Credit (${totalCredit.toFixed(2)})`);
  }

  if (lines.length < 2) {
    throw new Error("A manual journal must have at least 2 lines.");
  }

  const journal = await Journal.create({
    organizationId,
    date: data.date || new Date(),
    vendorId: data.vendorId ? new Types.ObjectId(data.vendorId) : null,
    description: data.description || "",
    referenceNumber: data.referenceNumber || "",
    lineItems: lines.map((li: any) => ({
      accountId: new Types.ObjectId(li.accountId),
      debit: Number(li.debit) || 0,
      credit: Number(li.credit) || 0,
      narration: li.narration || "",
    })),
    totalDebit,
    totalCredit,
    status: data.status || "Draft",
    notes: data.notes || "",
  });

  if (journal.status === "Posted") {
    await postJournalToGL(organizationId, journal._id);
  }

  return journal;
}

export async function listJournals(organizationId: any, limit = 50) {
  return Journal.find({ organizationId, isDeleted: false })
    .sort({ date: -1 })
    .limit(limit)
    .lean();
}

export async function postJournalToGL(organizationId: any, journalId: any) {
  const journal = await Journal.findOne({ _id: journalId, organizationId });
  if (!journal) throw new Error("Journal not found");

  // Clean existing GlEntry for this journal if any to avoid double postings
  await GlEntry.deleteMany({ organizationId, voucherType: "Journal", voucherId: String(journalId) });

  const glEntries = journal.lineItems.map((line: any) => ({
    organizationId,
    voucherType: "Journal" as const,
    voucherId: String(journal._id),
    voucherNo: journal.journalNumber,
    postingDate: journal.date,
    accountId: line.accountId,
    debit: line.debit,
    credit: line.credit,
    description: line.narration || journal.description || "Manual Journal Posting",
    currency: "INR",
    exchangeRate: 1,
    isReversal: false,
  }));

  await GlEntry.insertMany(glEntries);
  journal.status = "Posted";
  await journal.save();

  return journal;
}

export async function reverseJournal(organizationId: any, journalId: any) {
  const journal = await Journal.findOne({ _id: journalId, organizationId });
  if (!journal) throw new Error("Journal not found");

  // Find non-reversal entries
  const postedEntries = await GlEntry.find({
    organizationId,
    voucherType: "Journal",
    voucherId: String(journalId),
    isReversal: false,
  });

  const reversalEntries = postedEntries.map((entry) => ({
    organizationId,
    voucherType: "Journal" as const,
    voucherId: String(journalId),
    voucherNo: journal.journalNumber,
    postingDate: new Date(),
    accountId: entry.accountId,
    debit: entry.credit, // swap debit and credit
    credit: entry.debit,
    description: `Reversal of ${journal.journalNumber}`,
    currency: entry.currency,
    exchangeRate: entry.exchangeRate,
    isReversal: true,
    reversalOf: entry._id,
  }));

  if (reversalEntries.length > 0) {
    await GlEntry.insertMany(reversalEntries);
  }

  journal.status = "Voided";
  await journal.save();

  return journal;
}

export function validateDoubleEntry(lines: any[]) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    totalDebit += Number(line.debit) || 0;
    totalCredit += Number(line.credit) || 0;
  }

  return {
    isValid: Math.abs(totalDebit - totalCredit) <= 0.01 && lines.length >= 2,
    totalDebit,
    totalCredit,
    difference: Math.abs(totalDebit - totalCredit),
  };
}

export function getJournalFormSchema() {
  return {
    type: "object",
    properties: {
      date: { type: "string", description: "Journal entry date", required: true },
      referenceNumber: { type: "string", description: "Audit trail reference or source document number" },
      description: { type: "string", description: "General journal overview context" },
      lineItems: {
        type: "array",
        description: "List of double entry lines",
        required: true,
        items: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "Account ObjectId", required: true },
            debit: { type: "number", description: "Debit amount" },
            credit: { type: "number", description: "Credit amount" },
            narration: { type: "string", description: "Line specific description notes" },
          },
        },
      },
    },
  };
}
