import Bill from "../models/bill.model";
import {
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "./money";

export function toNum(val: unknown, fallback = 0): number {
  if (val === undefined || val === null || val === "") return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

export function calcLineItems(items: any[], discountLevel: string) {
  return (items || []).map((item: any) => {
    if (item.isHeader) return { ...item, quantity: 0, rate: 0, amount: 0 };
    const qty = Number(item.quantity);
    const rate = roundMoney(Number(item.rate));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantity must be greater than zero");
    if (!Number.isFinite(rate) || rate < 0) throw new Error("Rate cannot be negative");
    const lineTotal = multiplyMoney(qty, rate);
    if (discountLevel === "line_item") {
      const discPct = Number(item.discountPercent) || 0;
      if (discPct < 0) throw new Error("Discount percent cannot be negative");
      const discAmt = roundMoney(Number(item.discountAmount) || percentMoney(lineTotal, discPct));
      if (discAmt < 0) throw new Error("Discount amount cannot be negative");
      return { ...item, quantity: qty, rate, discountPercent: discPct, discountAmount: discAmt, amount: Math.max(0, subtractMoney(lineTotal, discAmt)) };
    }
    return { ...item, quantity: qty, rate, discountPercent: 0, discountAmount: 0, amount: lineTotal };
  });
}

function isLastDayOfMonth(date: Date): boolean {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return date.getDate() === end;
}

export function computeNextDate(from: Date, frequency: string, repeatEvery: number): Date {
  const d = new Date(from);
  switch (frequency) {
    case "Daily":
      d.setDate(d.getDate() + repeatEvery);
      break;
    case "Weekly":
      d.setDate(d.getDate() + repeatEvery * 7);
      break;
    case "Monthly":
      if (isLastDayOfMonth(from)) {
        d.setMonth(d.getMonth() + repeatEvery + 1, 0);
      } else {
        const targetDay = from.getDate();
        d.setMonth(d.getMonth() + repeatEvery, 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(targetDay, end));
      }
      break;
    case "Yearly":
      d.setFullYear(d.getFullYear() + repeatEvery);
      break;
  }
  return d;
}

export function computeRecurringTotals(input: {
  lineItems: any[];
  discountLevel: "transaction" | "line_item";
  discountPercent: number;
  taxAmount: number;
  tcsAmount: number;
  adjustmentAmount: number;
}) {
  const subTotal = sumMoney(
    input.lineItems
      .filter((i: any) => !i.isHeader)
      .map((i: any) => multiplyMoney(i.quantity, i.rate)),
  );
  const discountTotal = input.discountLevel === "transaction"
    ? percentMoney(subTotal, input.discountPercent)
    : sumMoney(input.lineItems.map((i: any) => i.discountAmount || 0));
  const taxableAmount = subtractMoney(subTotal, discountTotal);
  const taxTotal = sumMoney([input.taxAmount, input.tcsAmount]);
  const totalAmount = sumMoney([taxableAmount, taxTotal, input.adjustmentAmount]);
  return {
    subTotal,
    discountTotal,
    taxableAmount,
    taxTotal,
    totalAmount,
  };
}

export function computeDueDate(
  billDate: Date,
  terms?: { termType?: string; netDays?: number } | null,
): Date | null {
  if (!terms || !terms.termType) return null;
  const d = new Date(billDate);
  switch (terms.termType) {
    case "net_days":
      d.setDate(d.getDate() + (terms.netDays || 0));
      return d;
    case "end_of_month":
      return new Date(d.getFullYear(), d.getMonth() + 1, 0);
    case "end_of_next_month":
      return new Date(d.getFullYear(), d.getMonth() + 2, 0);
    default:
      return null;
  }
}

export async function nextBillNumber(organizationId: any): Promise<string> {
  const last = await Bill.findOne({
    organizationId,
    isDeleted: { $in: [true, false] },
  })
    .sort({ billNumber: -1 })
    .select("billNumber")
    .lean();
  if (!last) return "BILL-00001";
  const match = last.billNumber.match(/BILL-(\d+)/);
  if (!match) return "BILL-00001";
  const next = parseInt(match[1], 10) + 1;
  return `BILL-${String(next).padStart(5, "0")}`;
}
