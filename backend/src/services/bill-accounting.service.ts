import { AuthenticatedRequest } from "../types";
import PurchaseOrder from "../models/purchase-order.model";
import Item from "../models/item.model";
import {
  applyInventoryValueDeltas,
  applyStockDeltas,
  collectBillStockDeltas,
  collectBillValueDeltas,
  invertValueDeltas,
  recomputeContactOutstanding,
} from "./accounting-sync.service";
import {
  findAccountIdByName,
  postVoucher,
  reverseVoucher,
} from "./gl-posting.service";

function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function billVoucherId(bill: any): string {
  return `bill:${String(bill._id)}`;
}

async function shouldApplyBillStockSync(bill: any): Promise<boolean> {
  const orderNumber = String(bill?.orderNumber || "").trim();
  if (!orderNumber) return true;

  const filter: any = {
    organizationId: bill.organizationId,
    purchaseOrderNumber: orderNumber,
    isDeleted: false,
  };

  if (bill.vendorId) {
    filter.vendorId = bill.vendorId;
  }

  const linkedPurchaseOrder = await PurchaseOrder.findOne(filter).select("_id").lean();
  return !linkedPurchaseOrder;
}

export function isPostedBillStatus(status: string): boolean {
  return status !== "Draft" && status !== "Void";
}

export async function postBillLedger(bill: any, req?: AuthenticatedRequest) {
  if (!isPostedBillStatus(String(bill.status || ""))) return;

  const organizationId = bill.organizationId;
  const total = round2(toNum(bill.total));
  if (total <= 0) return;

  const accountsPayableId =
    bill.accountsPayableId ||
    (await findAccountIdByName({
      organizationId,
      names: ["Accounts Payable", "Trade Payables", "Creditors"],
      rootType: "Liability",
      accountType: "Accounts Payable",
    }));

  const defaultExpenseId = await findAccountIdByName({
    organizationId,
    names: ["Purchases", "Purchase Account", "Expenses"],
    rootType: "Expense",
    accountType: "Expense",
  });

  const inventoryAssetId = await findAccountIdByName({
    organizationId,
    names: ["Inventory Asset", "Inventory", "Stock", "Stock-in-Hand"],
    rootType: "Asset",
    accountType: "Stock",
  }).catch(() => defaultExpenseId);

  const itemIds = (bill.lineItems || []).map((l: any) => l.itemId).filter(Boolean);
  const items = itemIds.length > 0 ? await Item.find({ _id: { $in: itemIds }, organizationId }).select("inventoryTracked").lean() : [];
  const inventoryTrackedItemIds = new Set(items.filter((i: any) => i.inventoryTracked).map((i: any) => String(i._id)));

  const debitMap = new Map<string, number>();
  for (const line of bill.lineItems || []) {
    if (!line || line.isHeader) continue;
    const amount = round2(toNum(line.amount));
    if (amount <= 0) continue;
    
    let accountId = String(line.accountId || defaultExpenseId);
    if (line.itemId && inventoryTrackedItemIds.has(String(line.itemId))) {
      accountId = String(inventoryAssetId);
    }
    
    debitMap.set(accountId, round2((debitMap.get(accountId) || 0) + amount));
  }

  // Sum up line-level taxes and debit them to an asset tax account
  let lineTaxesSum = 0;
  for (const line of bill.lineItems || []) {
    if (!line || line.isHeader) continue;
    const lineAmount = toNum(line.amount);
    const lineTax = round2((lineAmount * toNum(line.taxRate)) / 100);
    lineTaxesSum = round2(lineTaxesSum + lineTax);
  }

  let inputTaxAccountId: string | null = null;
  if (lineTaxesSum > 0.009) {
    try {
      inputTaxAccountId = await findAccountIdByName({
        organizationId,
        names: ["Input Tax Receivable", "Input GST", "GST Input Tax", "Duties & Taxes", "Tax Payable"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      }).then(id => String(id));
    } catch {
      try {
        inputTaxAccountId = await findAccountIdByName({
          organizationId,
          names: ["Duties & Taxes", "Tax Payable"],
          rootType: "Liability",
          accountType: "Other Current Liability",
        }).then(id => String(id));
      } catch {
        inputTaxAccountId = String(defaultExpenseId);
      }
    }
    
    if (inputTaxAccountId) {
      debitMap.set(
        inputTaxAccountId,
        round2((debitMap.get(inputTaxAccountId) || 0) + lineTaxesSum),
      );
    }
  }

  if (debitMap.size === 0) {
    debitMap.set(String(defaultExpenseId), total);
  }

  let totalDebits = round2(
    Array.from(debitMap.values()).reduce((sum, amount) => sum + toNum(amount), 0),
  );
  const balancingDelta = round2(total - totalDebits);
  if (Math.abs(balancingDelta) > 0.009) {
    debitMap.set(
      String(defaultExpenseId),
      round2((debitMap.get(String(defaultExpenseId)) || 0) + balancingDelta),
    );
    totalDebits = round2(totalDebits + balancingDelta);
  }

  const lines: Array<{
    accountId: any;
    debit?: number;
    credit?: number;
    description?: string;
    contactType?: "Vendor";
    contactId?: any;
  }> = [];

  for (const [accountId, amount] of debitMap.entries()) {
    const rounded = round2(amount);
    if (Math.abs(rounded) < 0.009) continue;
    if (rounded > 0) {
      lines.push({
        accountId,
        debit: rounded,
        description: inputTaxAccountId && accountId === String(inputTaxAccountId)
          ? `Tax on Bill ${bill.billNumber}`
          : `Bill expense ${bill.billNumber}`,
        contactType: "Vendor",
        contactId: bill.vendorId,
      });
    } else {
      lines.push({
        accountId,
        credit: Math.abs(rounded),
        description: `Bill adjustment ${bill.billNumber}`,
        contactType: "Vendor",
        contactId: bill.vendorId,
      });
    }
  }

  lines.push({
    accountId: accountsPayableId,
    credit: total,
    description: `Bill payable ${bill.billNumber}`,
    contactType: "Vendor",
    contactId: bill.vendorId,
  });

  const posting = await postVoucher({
    organizationId,
    voucherType: "Bill",
    voucherId: billVoucherId(bill),
    voucherNo: String(bill.billNumber),
    postingDate: bill.billDate ? new Date(bill.billDate) : new Date(),
    lines,
    description: `Bill posting ${bill.billNumber}`,
    req,
  });

  if (!posting.posted) return;

  const valueDeltas = collectBillValueDeltas(bill.lineItems as any[]);
  if (Object.keys(valueDeltas).length > 0) {
    await applyInventoryValueDeltas({
      organizationId,
      deltas: valueDeltas,
      req,
    });
  }
}

export async function reverseBillLedger(bill: any, req?: AuthenticatedRequest) {
  const reversal = await reverseVoucher({
    organizationId: bill.organizationId,
    voucherType: "Bill",
    voucherId: billVoucherId(bill),
    reversalVoucherNo: `REV-${bill.billNumber}`,
    postingDate: new Date(),
    description: `Bill reversal ${bill.billNumber}`,
    req,
  });

  if (!reversal.reversed) return;

  const valueDeltas = collectBillValueDeltas(bill.lineItems as any[]);
  if (Object.keys(valueDeltas).length > 0) {
    await applyInventoryValueDeltas({
      organizationId: bill.organizationId,
      deltas: invertValueDeltas(valueDeltas),
      req,
    });
  }
}

export async function syncBillCreationAccounting(params: {
  bill: any;
  req?: AuthenticatedRequest;
}): Promise<void> {
  const { bill, req } = params;

  if (isPostedBillStatus(String(bill.status || ""))) {
    const shouldApplyStock = await shouldApplyBillStockSync(bill);
    if (shouldApplyStock) {
      await applyStockDeltas({
        organizationId: bill.organizationId as any,
        deltas: collectBillStockDeltas(bill.lineItems as any[]),
        req,
      });
    }

    await postBillLedger(bill, req);
  }

  await recomputeContactOutstanding({
    organizationId: bill.organizationId as any,
    contactId: bill.vendorId as any,
    req,
  });
}