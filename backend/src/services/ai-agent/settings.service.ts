import Organization from "../../models/organization.model";
import Currency from "../../models/currency.model";
import ExchangeRate from "../../models/exchange-rate.model";
import PaymentTerms from "../../models/payment-terms.model";
import PaymentMode from "../../models/payment-mode.model";
import PriceList from "../../models/price-list.model";
import ReportingTag from "../../models/reporting-tag.model";
import SalesPerson from "../../models/sales-person.model";
import Account from "../../models/account.model";
import GlEntry from "../../models/gl-entry.model";
import { Types } from "mongoose";

export async function getOrgSettings(organizationId: any) {
  return Organization.findById(organizationId).lean();
}

export async function updateOrgSettings(organizationId: any, data: any) {
  return Organization.findByIdAndUpdate(organizationId, { $set: data }, { new: true }).lean();
}

export async function listCurrencies(organizationId: any) {
  return Currency.find({}).lean();
}

export async function createCurrency(organizationId: any, data: any) {
  return Currency.create({
    code: String(data.code).toUpperCase(),
    symbol: data.symbol || "",
    name: data.name || "",
  });
}

export async function getExchangeRate(organizationId: any, fromCurrency: string, toCurrency: string) {
  return ExchangeRate.findOne({
    organizationId,
    fromCurrency: fromCurrency.toUpperCase(),
    toCurrency: toCurrency.toUpperCase(),
  })
    .sort({ date: -1 })
    .lean();
}

export async function setExchangeRate(organizationId: any, data: any) {
  return ExchangeRate.create({
    organizationId,
    fromCurrency: String(data.fromCurrency).toUpperCase(),
    toCurrency: String(data.toCurrency).toUpperCase(),
    date: data.date || new Date(),
    rate: Number(data.rate) || 1,
    source: data.source || "Manual",
  });
}

export async function listPaymentTerms(organizationId: any) {
  return PaymentTerms.find({ organizationId }).lean();
}

export async function createPaymentTerm(organizationId: any, data: any) {
  return PaymentTerms.create({
    organizationId,
    name: data.name,
    termType: "net_days",
    netDays: Number(data.netDays || data.numberOfDays) || 0,
    isDefault: false,
    isSystemTerm: false,
    isPermanent: false,
  });
}

export async function listPaymentModes(organizationId: any) {
  return PaymentMode.find({ organizationId }).lean();
}

export async function createPaymentMode(organizationId: any, data: any) {
  return PaymentMode.create({
    organizationId,
    name: data.name,
    isActive: true,
  });
}

export async function getOpeningBalances(organizationId: any) {
  return Account.find({ organizationId, isActive: true })
    .select("name code type accountType openingBalance")
    .lean();
}

export async function setOpeningBalance(organizationId: any, accountId: any, amount: number) {
  const account = await Account.findOne({ _id: accountId, organizationId });
  if (!account) throw new Error("Account not found");

  account.openingBalance = amount;
  await account.save();

  // Create/update general ledger opening entry
  const voucherId = `opening_${accountId}`;
  await GlEntry.deleteMany({ organizationId, voucherType: "System", voucherId });

  if (amount !== 0) {
    await GlEntry.create({
      organizationId,
      voucherType: "System" as const,
      voucherId,
      voucherNo: "OPENING",
      postingDate: new Date(),
      accountId: account._id,
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? Math.abs(amount) : 0,
      description: "Opening Balance Setup",
      currency: "INR",
      exchangeRate: 1,
      isReversal: false,
    });
  }

  return account;
}

export async function bulkSetOpeningBalances(organizationId: any, data: Array<{ accountId: string; amount: number }>) {
  const result = [];
  for (const entry of data) {
    const updated = await setOpeningBalance(organizationId, entry.accountId, entry.amount);
    result.push(updated);
  }
  return result;
}

export async function getReminderSettings(organizationId: any) {
  const org = await Organization.findById(organizationId).select("reminderSettings").lean();
  return org?.reminderSettings || null;
}

export async function updateReminderSettings(organizationId: any, data: any) {
  const org = await Organization.findById(organizationId);
  if (!org) throw new Error("Organization not found");
  org.reminderSettings = { ...org.reminderSettings, ...data };
  await org.save();
  return org.reminderSettings;
}

export async function getCustomerPortalSettings(organizationId: any) {
  const org = await Organization.findById(organizationId).select("portalSettings").lean();
  return org?.portalSettings || null;
}

export async function updateCustomerPortalSettings(organizationId: any, data: any) {
  const org = await Organization.findById(organizationId);
  if (!org) throw new Error("Organization not found");
  org.portalSettings = { ...org.portalSettings, ...data };
  await org.save();
  return org.portalSettings;
}

export async function getGatewaySettings(organizationId: any) {
  const org = await Organization.findById(organizationId).select("paymentGatewaySettings" as any).lean() as any;
  return org?.paymentGatewaySettings || null;
}

export async function updateGatewaySettings(organizationId: any, data: any) {
  return Organization.findByIdAndUpdate(
    organizationId,
    { $set: { paymentGatewaySettings: data } } as any,
    { new: true }
  ).lean();
}

export async function getEmailSettings(organizationId: any) {
  const org = await Organization.findById(organizationId).select("smtpSettings").lean();
  return org?.smtpSettings || null;
}

export async function updateEmailSettings(organizationId: any, data: any) {
  const org = await Organization.findById(organizationId);
  if (!org) throw new Error("Organization not found");
  org.smtpSettings = { ...org.smtpSettings, ...data };
  await org.save();
  return org.smtpSettings;
}

export async function listSalesPersons(organizationId: any) {
  return SalesPerson.find({ organizationId }).lean();
}

export async function listPriceLists(organizationId: any) {
  return PriceList.find({ organizationId }).lean();
}

export async function listReportingTags(organizationId: any) {
  return ReportingTag.find({ organizationId }).lean();
}
