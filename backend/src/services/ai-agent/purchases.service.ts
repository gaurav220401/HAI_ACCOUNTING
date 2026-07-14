import PurchaseOrder from "../../models/purchase-order.model";
import PurchaseReceive from "../../models/purchase-receive.model";
import Bill from "../../models/bill.model";
import RecurringBill from "../../models/recurring-bill.model";
import Expense from "../../models/expense.model";
import RecurringExpense from "../../models/recurring-expense.model";
import PaymentMade from "../../models/payment-made.model";
import VendorCredit from "../../models/vendor-credit.model";
import ExpenseCategory from "../../models/expense-category.model";
import { Types } from "mongoose";

// --- Serial Number Helpers ---
export async function getNextPONumber(organizationId: any): Promise<string> {
  const last = await PurchaseOrder.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ purchaseOrderNumber: -1 })
    .select("purchaseOrderNumber")
    .lean();
  if (!last) return "PO-00001";
  const match = String(last.purchaseOrderNumber || "").match(/PO-(\d+)/);
  if (!match) return "PO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PO-${String(next).padStart(5, "0")}`;
}

export async function getNextBillNumber(organizationId: any): Promise<string> {
  const last = await Bill.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ billNumber: -1 })
    .select("billNumber")
    .lean();
  if (!last) return "BILL-000001";
  const match = String(last.billNumber || "").match(/BILL-(\d+)/);
  if (!match) return "BILL-000001";
  const next = parseInt(match[1], 10) + 1;
  return `BILL-${String(next).padStart(6, "0")}`;
}

export async function getNextPaymentMadeNumber(organizationId: any): Promise<string> {
  const last = await PaymentMade.findOne({ organization_id: organizationId } as any)
    .sort({ payment_number: -1 })
    .select("payment_number")
    .lean() as any;
  if (!last) return "PMT-00001";
  const match = String(last.payment_number || "").match(/PMT-(\d+)/);
  if (!match) return "PMT-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PMT-${String(next).padStart(5, "0")}`;
}

export async function getNextVendorCreditNumber(organizationId: any): Promise<string> {
  const last = await VendorCredit.findOne({ organizationId })
    .sort({ vendorCreditNumber: -1 })
    .select("vendorCreditNumber")
    .lean();
  if (!last) return "VC-00001";
  const match = String(last.vendorCreditNumber || "").match(/VC-(\d+)/);
  if (!match) return "VC-00001";
  const next = parseInt(match[1], 10) + 1;
  return `VC-${String(next).padStart(5, "0")}`;
}

// --- Service Implementations ---

export async function createPurchaseOrder(organizationId: any, data: any) {
  const purchaseOrderNumber = data.purchaseOrderNumber || (await getNextPONumber(organizationId));
  return PurchaseOrder.create({
    organizationId,
    vendorId: new Types.ObjectId(data.vendorId),
    purchaseOrderNumber,
    // PO model uses purchaseOrderDate, not orderDate
    purchaseOrderDate: data.purchaseOrderDate || data.orderDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    // PO status enum: "Draft" | "Open" | "Received" | "Billed" | "Closed" | "Canceled"
    status: "Open",
    isActive: true,
  } as any);
}

export async function receivePurchaseOrder(organizationId: any, poId: any, data: any) {
  const po = await PurchaseOrder.findOne({ _id: poId, organizationId });
  if (!po) throw new Error("Purchase Order not found");

  const receive = await PurchaseReceive.create({
    organizationId,
    vendorId: po.vendorId,
    purchaseOrderId: po._id,
    purchaseOrderNumber: po.purchaseOrderNumber,
    // PurchaseReceive uses purchaseReceiveNumber, not receiveNumber
    purchaseReceiveNumber: data.receiveNumber || `REC-${Date.now()}`,
    receivedDate: data.receiveDate || new Date(),
    notes: data.notes || "",
    lineItems: po.lineItems.map((li: any) => ({
      itemId: li.itemId,
      name: li.name,
      quantityToReceive: li.quantity,
      quantityReceived: li.quantity,
      rate: li.rate,
    })),
    totalQuantityReceived: po.lineItems.reduce((acc: number, li: any) => acc + li.quantity, 0),
    status: "Received",
    putawayStatus: "Pending",
  });

  // Update PO status to Received
  await PurchaseOrder.findByIdAndUpdate(poId, { status: "Received" });

  return receive;
}

export async function convertPOToBill(organizationId: any, poId: any) {
  const po = await PurchaseOrder.findOne({ _id: poId, organizationId });
  if (!po) throw new Error("Purchase Order not found");

  const billNumber = await getNextBillNumber(organizationId);
  const bill = await Bill.create({
    organizationId,
    billNumber,
    orderNumber: po.purchaseOrderNumber,
    vendorId: po.vendorId,
    billDate: new Date(),
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    // Bill uses lineItems, not items
    lineItems: po.lineItems.map((li: any) => ({
      itemId: li.itemId,
      name: li.name || "Item",
      quantity: li.quantity,
      rate: li.rate,
      amount: li.amount,
    })),
    subTotal: po.subTotal,
    total: po.total,
    balanceDue: po.total,
    status: "Open",
    isActive: true,
  } as any);

  // Update PO status to Billed
  await PurchaseOrder.findByIdAndUpdate(poId, { status: "Billed" });

  return bill;
}

export async function createBill(organizationId: any, data: any) {
  // Duplicate check: warn if same vendor + amount within last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const billNumber = data.billNumber || (await getNextBillNumber(organizationId));

  const duplicate = await Bill.findOne({
    organizationId,
    vendorId: new Types.ObjectId(data.vendorId),
    total: Number(data.total) || 0,
    billDate: { $gte: ninetyDaysAgo },
    isDeleted: false,
  });

  if (duplicate) {
    console.warn(
      `[AI Purchase Service] Warning: Possible duplicate bill found. Match: Bill ${duplicate.billNumber} for vendor ${data.vendorId} with amount ${duplicate.total}`
    );
  }

  return Bill.create({
    organizationId,
    billNumber,
    vendorId: new Types.ObjectId(data.vendorId),
    billDate: data.billDate || new Date(),
    dueDate: data.dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    lineItems: data.lineItems || data.items || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    balanceDue: Number(data.total) || 0,
    status: data.status || "Open",
    isActive: true,
  } as any);
}

export async function createRecurringBill(organizationId: any, data: any) {
  return RecurringBill.create({
    organizationId,
    profileName: data.profileName || "Recurring Bill Profile",
    vendorId: new Types.ObjectId(data.vendorId),
    startDate: data.startDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    isActive: true,
  } as any);
}

export async function recordPaymentMade(organizationId: any, data: any) {
  const paymentNumber = data.paymentNumber || (await getNextPaymentMadeNumber(organizationId));
  // PaymentMade uses snake_case field names
  const payment = await PaymentMade.create({
    organization_id: organizationId,
    payment_id: `PMT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    payment_number: paymentNumber,
    vendor_id: new Types.ObjectId(data.vendorId),
    payment_date: data.paymentDate || new Date(),
    payment_mode: data.paymentMode || "Bank Transfer",
    reference_number: data.referenceNumber || "",
    notes: data.notes || "",
    status: "PAID",
    total_amount_paid: Number(data.amount) || 0,
    amount_used_for_bills: Number(data.amount) || 0,
    amount_refunded: 0,
    amount_in_excess: 0,
    audit_log: [
      {
        action: "Payment Recorded",
        amount: Number(data.amount),
        bill_id: data.billId ? new Types.ObjectId(data.billId) : undefined,
        at: new Date(),
      },
    ],
    is_deleted: false,
  } as any);

  if (data.billId) {
    const bill = await Bill.findOne({ _id: data.billId, organizationId });
    if (bill) {
      bill.status = "Paid";
      bill.balanceDue = 0;
      await bill.save();
    }
  }

  return payment;
}

export async function createExpense(organizationId: any, data: any) {
  // Expense model uses: expenseAccountId, amount, date, expenseType, currency
  // No expenseCategory or totalAmount fields — use notes for category description
  const match = await Expense.findOne({
    organizationId,
    amount: Number(data.totalAmount || data.amount) || 0,
    date: data.date ? new Date(data.date) : { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    isDeleted: false,
  });

  if (match) {
    console.warn(
      `[AI Purchase Service] Warning: Possible duplicate expense found for amount ${match.amount} on ${match.date}`
    );
  }

  return Expense.create({
    organizationId,
    expenseType: "Regular",
    amount: Number(data.totalAmount || data.amount) || 0,
    currency: data.currency || "INR",
    date: data.date || new Date(),
    notes: data.notes || data.expenseCategory || "",
    isItemized: false,
    isActive: true,
  } as any);
}

export async function createRecurringExpense(organizationId: any, data: any) {
  return RecurringExpense.create({
    organizationId,
    profileName: data.profileName || "Recurring Expense Profile",
    amount: Number(data.totalAmount || data.amount) || 0,
    startDate: data.startDate || new Date(),
    isActive: true,
  } as any);
}

export async function createVendorCredit(organizationId: any, data: any) {
  const vendorCreditNumber = data.vendorCreditNumber || (await getNextVendorCreditNumber(organizationId));
  return VendorCredit.create({
    organizationId,
    vendorId: new Types.ObjectId(data.vendorId),
    vendorCreditNumber,
    vendorCreditDate: data.vendorCreditDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    // VendorCredit uses balanceAmount, not balance
    balanceAmount: Number(data.total) || 0,
    appliedAmount: 0,
    refundedAmount: 0,
    discountLevel: "transaction",
    discountPercent: 0,
    discountAmount: 0,
    tdsAmount: 0,
    tcsAmount: 0,
    taxAmount: 0,
    adjustmentLabel: "Adjustment",
    adjustmentAmount: 0,
    // VendorCreditStatus: "DRAFT" | "OPEN" | "APPLIED" | "PARTIALLY_APPLIED" | "CLOSED" | "VOID"
    status: "OPEN",
    isActive: true,
  } as any);
}

export async function applyVendorCreditToBill(organizationId: any, vendorCreditId: any, billId: any, amount: number) {
  const vc = await VendorCredit.findOne({ _id: vendorCreditId, organizationId });
  const bill = await Bill.findOne({ _id: billId, organizationId });

  if (!vc || !bill) throw new Error("Vendor Credit or Bill not found");
  if (vc.balanceAmount < amount) throw new Error("Insufficient vendor credit balance");
  if (bill.balanceDue < amount) throw new Error("Amount exceeds bill balance due");

  vc.balanceAmount -= amount;
  vc.appliedAmount += amount;
  if (vc.balanceAmount <= 0) vc.status = "CLOSED";
  await vc.save();

  bill.balanceDue -= amount;
  if (bill.balanceDue <= 0) bill.status = "Paid";
  await bill.save();

  return { vendorCredit: vc, bill };
}

export async function listUnpaidBills(organizationId: any) {
  return Bill.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).lean();
}

export async function listOverdueBills(organizationId: any) {
  return Bill.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
    dueDate: { $lt: new Date() },
  }).lean();
}

export async function getVendorOutstanding(organizationId: any, vendorId: any): Promise<number> {
  const bills = await Bill.find({
    organizationId,
    vendorId: new Types.ObjectId(vendorId),
    isDeleted: false,
    balanceDue: { $gt: 0 },
  })
    .select("balanceDue")
    .lean();

  return bills.reduce((acc, curr) => acc + (curr.balanceDue || 0), 0);
}

export async function listExpenseCategories(organizationId: any) {
  return ExpenseCategory.find({ organizationId }).lean();
}
