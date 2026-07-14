import Item from "../../models/item.model";
import Contact from "../../models/contact.model";
import Invoice from "../../models/invoice.model";
import Organization from "../../models/organization.model";
import CurrencyAdjustment from "../../models/currency-adjustment.model";
import { Types } from "mongoose";

export async function bulkUpdateRecords(organizationId: any, modelType: string, updates: Array<{ id: string; changes: any }>) {
  let ModelClass: any;
  if (modelType.toLowerCase() === "item" || modelType.toLowerCase() === "items") {
    ModelClass = Item;
  } else if (modelType.toLowerCase() === "contact" || modelType.toLowerCase() === "contacts") {
    ModelClass = Contact;
  } else if (modelType.toLowerCase() === "invoice" || modelType.toLowerCase() === "invoices") {
    ModelClass = Invoice;
  } else {
    throw new Error(`Unsupported model type for bulk update: ${modelType}`);
  }

  const bulkOps = updates.map((update) => ({
    updateOne: {
      filter: { _id: new Types.ObjectId(update.id), organizationId },
      update: { $set: update.changes },
    },
  }));

  if (bulkOps.length === 0) return { modifiedCount: 0 };
  const result = await ModelClass.bulkWrite(bulkOps);
  return { modifiedCount: result.modifiedCount };
}

export async function createCurrencyAdjustment(organizationId: any, data: any) {
  return CurrencyAdjustment.create({
    organizationId,
    date: data.date || new Date(),
    currency: data.currency,
    exchangeRate: Number(data.exchangeRate) || 1,
    notes: data.notes || "",
    status: data.status || "Open",
    lines: data.lines || [],
  });
}

export async function listCurrencyAdjustments(organizationId: any) {
  return CurrencyAdjustment.find({ organizationId, isDeleted: false })
    .sort({ date: -1 })
    .lean();
}

export async function getTransactionLockDate(organizationId: any): Promise<Date | null> {
  const org = await Organization.findById(organizationId).select("transactionLockDate" as any).lean() as any;
  return org?.transactionLockDate ? new Date(org.transactionLockDate) : null;
}

export async function isDateLocked(organizationId: any, date: Date | string): Promise<boolean> {
  const lockDate = await getTransactionLockDate(organizationId);
  if (!lockDate) return false;
  return new Date(date) <= lockDate;
}

export async function setTransactionLockDate(organizationId: any, date: Date | null) {
  return Organization.findByIdAndUpdate(
    organizationId,
    { $set: { transactionLockDate: date } } as any,
    { new: true }
  ).lean();
}
