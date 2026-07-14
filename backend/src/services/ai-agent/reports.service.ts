import Account from "../../models/account.model";
import GlEntry from "../../models/gl-entry.model";
import Invoice from "../../models/invoice.model";
import Bill from "../../models/bill.model";
import { Types } from "mongoose";

export async function getProfitAndLoss(organizationId: any, startDate: Date, endDate: Date) {
  const accounts = await Account.find({
    organizationId,
    rootType: { $in: ["Income", "Expense"] },
    isActive: true,
  }).lean();

  let totalIncome = 0;
  let totalExpense = 0;
  const lines = [];

  for (const account of accounts) {
    const entries = await GlEntry.find({
      organizationId,
      accountId: account._id,
      postingDate: { $gte: startDate, $lte: endDate },
    }).lean();

    const netAmount = entries.reduce((acc, curr) => acc + ((curr.debit || 0) - (curr.credit || 0)), 0);
    // Income normally credit, Expense normally debit
    const amount = account.rootType === "Income" ? -netAmount : netAmount;

    if (amount !== 0) {
      if (account.rootType === "Income") {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
      lines.push({
        name: account.name,
        code: account.code,
        type: account.accountType,
        rootType: account.rootType,
        amount,
      });
    }
  }

  return {
    totalIncome,
    totalExpense,
    netProfit: totalIncome - totalExpense,
    lines,
  };
}

export async function getBalanceSheet(organizationId: any, asOfDate: Date) {
  const accounts = await Account.find({
    organizationId,
    rootType: { $in: ["Asset", "Liability", "Equity"] },
    isActive: true,
  }).lean();

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  const lines = [];

  for (const account of accounts) {
    const entries = await GlEntry.find({
      organizationId,
      accountId: account._id,
      postingDate: { $lte: asOfDate },
    }).lean();

    const netAmount = entries.reduce((acc, curr) => acc + ((curr.debit || 0) - (curr.credit || 0)), 0);
    let amount = netAmount;

    // Liabilities and Equity normally credit
    if (account.rootType === "Liability" || account.rootType === "Equity") {
      amount = -netAmount;
    }

    if (amount !== 0 || account.openingBalance !== 0) {
      const finalAmount = amount + (account.openingBalance || 0);
      if (account.rootType === "Asset") {
        totalAssets += finalAmount;
      } else if (account.rootType === "Liability") {
        totalLiabilities += finalAmount;
      } else {
        totalEquity += finalAmount;
      }

      lines.push({
        name: account.name,
        code: account.code,
        type: account.accountType,
        rootType: account.rootType,
        amount: finalAmount,
      });
    }
  }

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    netWorth: totalAssets - totalLiabilities,
    lines,
  };
}

export async function getCashFlowStatement(organizationId: any, startDate: Date, endDate: Date) {
  const bankAccounts = await Account.find({
    organizationId,
    accountType: { $in: ["Bank", "Cash"] },
    isActive: true,
  }).lean();

  let operatingInflow = 0;
  let operatingOutflow = 0;

  for (const account of bankAccounts) {
    const entries = await GlEntry.find({
      organizationId,
      accountId: account._id,
      postingDate: { $gte: startDate, $lte: endDate },
    }).lean();

    for (const entry of entries) {
      if (entry.debit > 0) {
        operatingInflow += entry.debit;
      }
      if (entry.credit > 0) {
        operatingOutflow += entry.credit;
      }
    }
  }

  return {
    operatingInflow,
    operatingOutflow,
    netCashFlow: operatingInflow - operatingOutflow,
  };
}

export async function getAgedReceivables(organizationId: any) {
  const invoices = await Invoice.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).populate("customerId", "displayName").lean() as any[];

  const today = new Date();
  let range0_30 = 0;
  let range31_60 = 0;
  let range61_90 = 0;
  let range90Plus = 0;

  for (const invoice of invoices) {
    const diffTime = today.getTime() - new Date(invoice.dueDate).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
      range0_30 += invoice.balanceDue;
    } else if (diffDays <= 60) {
      range31_60 += invoice.balanceDue;
    } else if (diffDays <= 90) {
      range61_90 += invoice.balanceDue;
    } else {
      range90Plus += invoice.balanceDue;
    }
  }

  return {
    range0_30,
    range31_60,
    range61_90,
    range90Plus,
    totalOutstanding: range0_30 + range31_60 + range61_90 + range90Plus,
  };
}

export async function getAgedPayables(organizationId: any) {
  const bills = await Bill.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).populate("vendorId", "displayName").lean() as any[];

  const today = new Date();
  let range0_30 = 0;
  let range31_60 = 0;
  let range61_90 = 0;
  let range90Plus = 0;

  for (const bill of bills) {
    const diffTime = today.getTime() - new Date(bill.dueDate).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
      range0_30 += bill.balanceDue;
    } else if (diffDays <= 60) {
      range31_60 += bill.balanceDue;
    } else if (diffDays <= 90) {
      range61_90 += bill.balanceDue;
    } else {
      range90Plus += bill.balanceDue;
    }
  }

  return {
    range0_30,
    range31_60,
    range61_90,
    range90Plus,
    totalOutstanding: range0_30 + range31_60 + range61_90 + range90Plus,
  };
}

export async function getSalesByCustomer(organizationId: any, startDate?: Date, endDate?: Date) {
  const match: any = { organizationId, isDeleted: false };
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = startDate;
    if (endDate) match.invoiceDate.$lte = endDate;
  }

  const invoices = await Invoice.find(match).populate("customerId", "displayName").lean() as any[];
  const customerMap: Record<string, number> = {};

  for (const invoice of invoices) {
    const name = invoice.customerId?.displayName || "Unknown Customer";
    customerMap[name] = (customerMap[name] || 0) + invoice.total;
  }

  return Object.entries(customerMap).map(([customer, total]) => ({ customer, total }));
}

export async function getPurchasesByVendor(organizationId: any, startDate?: Date, endDate?: Date) {
  const match: any = { organizationId, isDeleted: false };
  if (startDate || endDate) {
    match.billDate = {};
    if (startDate) match.billDate.$gte = startDate;
    if (endDate) match.billDate.$lte = endDate;
  }

  const bills = await Bill.find(match).populate("vendorId", "displayName").lean() as any[];
  const vendorMap: Record<string, number> = {};

  for (const bill of bills) {
    const name = bill.vendorId?.displayName || "Unknown Vendor";
    vendorMap[name] = (vendorMap[name] || 0) + bill.total;
  }

  return Object.entries(vendorMap).map(([vendor, total]) => ({ vendor, total }));
}

export async function getItemSalesSummary(organizationId: any, startDate?: Date, endDate?: Date) {
  const match: any = { organizationId, isDeleted: false };
  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) match.invoiceDate.$gte = startDate;
    if (endDate) match.invoiceDate.$lte = endDate;
  }

  const invoices = await Invoice.find(match).lean() as any[];
  const itemMap: Record<string, { quantity: number; total: number }> = {};

  for (const invoice of invoices) {
    for (const item of invoice.items || []) {
      const name = item.name || "Unknown Item";
      if (!itemMap[name]) itemMap[name] = { quantity: 0, total: 0 };
      itemMap[name].quantity += item.quantity || 0;
      itemMap[name].total += item.amount || 0;
    }
  }

  return Object.entries(itemMap).map(([itemName, data]) => ({
    itemName,
    quantity: data.quantity,
    total: data.total,
  }));
}

export async function getTaxReport(organizationId: any, startDate: Date, endDate: Date) {
  const invoices = await Invoice.find({
    organizationId,
    invoiceDate: { $gte: startDate, $lte: endDate },
    isDeleted: false,
  }).lean();

  const bills = await Bill.find({
    organizationId,
    billDate: { $gte: startDate, $lte: endDate },
    isDeleted: false,
  }).lean();

  let taxCollected = 0; // from invoices
  let taxPaid = 0; // from bills

  // Aggregate taxes if field name matches
  for (const inv of invoices) {
    taxCollected += (inv.total || 0) - (inv.subTotal || 0);
  }
  for (const bill of bills) {
    taxPaid += (bill.total || 0) - (bill.subTotal || 0);
  }

  return {
    taxCollected,
    taxPaid,
    netTaxOwed: taxCollected - taxPaid,
  };
}
