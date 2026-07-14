import Quote from "../../models/quote.model";
import SalesOrder from "../../models/sales-order.model";
import Invoice from "../../models/invoice.model";
import RecurringInvoice from "../../models/recurring-invoice.model";
import RetainerInvoice from "../../models/retainer-invoice.model";
import DeliveryChallan from "../../models/delivery-challan.model";
import PaymentReceived from "../../models/payment-received.model";
import CreditNote from "../../models/credit-note.model";
import { Types } from "mongoose";

// --- Serial Number Helpers ---
export async function getNextSalesOrderNumber(organizationId: any): Promise<string> {
  const last = await SalesOrder.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ salesOrderNumber: -1 })
    .select("salesOrderNumber")
    .lean();
  if (!last) return "SO-00001";
  const match = String(last.salesOrderNumber || "").match(/SO-(\d+)/);
  if (!match) return "SO-00001";
  const next = parseInt(match[1], 10) + 1;
  return `SO-${String(next).padStart(5, "0")}`;
}

export async function getNextInvoiceNumber(organizationId: any): Promise<string> {
  const last = await Invoice.findOne({ organizationId, isDeleted: { $in: [true, false] } })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();
  if (!last) return "INV-000001";
  const match = String(last.invoiceNumber || "").match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

export async function getNextPaymentNumber(organizationId: any): Promise<string> {
  const last = await PaymentReceived.findOne({ organization_id: organizationId, is_deleted: { $in: [true, false] } } as any)
    .sort({ payment_number: -1 })
    .select("payment_number")
    .lean() as any;
  if (!last) return "PAY-00001";
  const match = String(last.payment_number || "").match(/PAY-(\d+)/);
  if (!match) return "PAY-00001";
  const next = parseInt(match[1], 10) + 1;
  return `PAY-${String(next).padStart(5, "0")}`;
}

export async function getNextQuoteNumber(organizationId: any): Promise<string> {
  const last = await Quote.findOne({ organizationId })
    .sort({ quoteNumber: -1 })
    .select("quoteNumber")
    .lean();
  if (!last) return "QT-00001";
  const match = String(last.quoteNumber || "").match(/QT-(\d+)/);
  if (!match) return "QT-00001";
  const next = parseInt(match[1], 10) + 1;
  return `QT-${String(next).padStart(5, "0")}`;
}

export async function getNextCreditNoteNumber(organizationId: any): Promise<string> {
  const last = await CreditNote.findOne({ organizationId })
    .sort({ creditNoteNumber: -1 })
    .select("creditNoteNumber")
    .lean();
  if (!last) return "CN-00001";
  const match = String(last.creditNoteNumber || "").match(/CN-(\d+)/);
  if (!match) return "CN-00001";
  const next = parseInt(match[1], 10) + 1;
  return `CN-${String(next).padStart(5, "0")}`;
}

// --- Service Implementations ---

export async function createQuote(organizationId: any, data: any) {
  const quoteNumber = data.quoteNumber || (await getNextQuoteNumber(organizationId));
  return Quote.create({
    organizationId,
    customerId: new Types.ObjectId(data.customerId),
    quoteNumber,
    quoteDate: data.quoteDate || new Date(),
    expiryDate: data.expiryDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    status: data.status || "Draft",
    isActive: true,
  } as any);
}

export async function createSalesOrder(organizationId: any, data: any) {
  const salesOrderNumber = data.salesOrderNumber || (await getNextSalesOrderNumber(organizationId));
  return SalesOrder.create({
    organizationId,
    customerId: new Types.ObjectId(data.customerId),
    salesOrderNumber,
    orderDate: data.orderDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    status: data.status || "APPROVED",
    invoiceStatus: "Not Invoiced",
    shipmentStatus: "Pending",
    isActive: true,
  } as any);
}

export async function convertSalesOrderToInvoice(organizationId: any, salesOrderId: any) {
  const so = await SalesOrder.findOne({ _id: salesOrderId, organizationId }) as any;
  if (!so) throw new Error("Sales Order not found");

  const invoiceNumber = await getNextInvoiceNumber(organizationId);
  const invoice = (await Invoice.create({
    organizationId,
    invoiceNumber,
    orderNumber: so.salesOrderNumber,
    customerId: so.customerId,
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    items: so.lineItems.map((li: any) => ({
      itemId: li.itemId,
      name: li.name,
      quantity: li.quantity,
      rate: li.rate,
      amount: li.amount,
    })),
    subTotal: so.subTotal,
    total: so.total,
    balanceDue: so.total,
    status: "Sent",
    isActive: true,
  } as any)) as any;

  so.invoiceStatus = "Invoiced";
  so.invoiceId = invoice._id;
  await so.save();

  return invoice;
}

export async function createInvoice(organizationId: any, data: any) {
  const invoiceNumber = data.invoiceNumber || (await getNextInvoiceNumber(organizationId));
  return Invoice.create({
    organizationId,
    invoiceNumber,
    customerId: new Types.ObjectId(data.customerId),
    invoiceDate: data.invoiceDate || new Date(),
    dueDate: data.dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    items: data.items || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    balanceDue: Number(data.total) || 0,
    status: data.status || "Sent",
    isActive: true,
  } as any);
}

export async function recordPaymentReceived(organizationId: any, data: any) {
  const paymentNumber = data.paymentNumber || (await getNextPaymentNumber(organizationId));
  const payment = await PaymentReceived.create({
    organization_id: organizationId,
    payment_id: `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    payment_number: paymentNumber,
    customer_id: new Types.ObjectId(data.customerId),
    payment_date: data.paymentDate || new Date(),
    payment_mode: data.paymentMode || "Cash",
    status: "PAID",
    total_amount_received: Number(data.amount) || 0,
    amount_used_for_invoices: Number(data.amount) || 0,
    amount_refunded: 0,
    amount_in_excess: 0,
    reference_number: data.referenceNumber || "",
    bank_charges: Number(data.bankCharges) || 0,
    notes: data.notes || "",
    audit_log: [{ action: "Record Payment", amount: Number(data.amount), invoice_id: data.invoiceId ? new Types.ObjectId(data.invoiceId) : null, at: new Date() }],
  } as any);

  if (data.invoiceId) {
    const invoice = await Invoice.findOne({ _id: data.invoiceId, organizationId });
    if (invoice) {
      invoice.status = "Paid";
      invoice.balanceDue = 0;
      await invoice.save();
    }
  }

  return payment;
}

export async function createCreditNote(organizationId: any, data: any) {
  const creditNoteNumber = data.creditNoteNumber || (await getNextCreditNoteNumber(organizationId));
  return CreditNote.create({
    organizationId,
    customerId: new Types.ObjectId(data.customerId),
    creditNoteNumber,
    creditNoteDate: data.creditNoteDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    balanceAmount: Number(data.total) || 0,
    status: "OPEN",
    isActive: true,
  } as any);
}

export async function applyCreditNoteToInvoice(organizationId: any, creditNoteId: any, invoiceId: any, amount: number) {
  const cn = await CreditNote.findOne({ _id: creditNoteId, organizationId }) as any;
  const inv = await Invoice.findOne({ _id: invoiceId, organizationId }) as any;

  if (!cn || !inv) throw new Error("Credit Note or Invoice not found");
  if (cn.balanceAmount < amount) throw new Error("Insufficient credit note balance");
  if (inv.balanceDue < amount) throw new Error("Amount exceeds invoice balance due");

  cn.balanceAmount -= amount;
  if (cn.balanceAmount <= 0) cn.status = "CLOSED";
  await cn.save();

  inv.balanceDue -= amount;
  if (inv.balanceDue <= 0) inv.status = "Paid";
  await inv.save();

  return { creditNote: cn, invoice: inv };
}

export async function createDeliveryChallan(organizationId: any, data: any) {
  return DeliveryChallan.create({
    organizationId,
    customerId: new Types.ObjectId(data.customerId),
    challanNumber: data.challanNumber || `DC-${Date.now()}`,
    challanDate: data.challanDate || new Date(),
    lineItems: data.lineItems || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    status: "Draft",
    isActive: true,
  } as any);
}

export async function createRetainerInvoice(organizationId: any, data: any) {
  return RetainerInvoice.create({
    organization_id: organizationId,
    customer_id: new Types.ObjectId(data.customerId),
    retainer_invoice_number: data.retainerNumber || `RET-${Date.now()}`,
    retainer_invoice_date: data.retainerDate || new Date(),
    total_amount: Number(data.total) || 0,
    balance: Number(data.total) || 0,
    status: "Sent",
    isActive: true,
  } as any);
}

export async function createRecurringInvoice(organizationId: any, data: any) {
  return RecurringInvoice.create({
    organizationId,
    profileName: data.profileName || "Recurring Profile",
    customerId: new Types.ObjectId(data.customerId),
    recurrenceInterval: data.recurrenceInterval || "Monthly",
    items: data.items || [],
    subTotal: Number(data.subTotal) || 0,
    total: Number(data.total) || 0,
    startDate: data.startDate || new Date(),
    isActive: true,
  } as any);
}

export async function listOverdueInvoices(organizationId: any) {
  return Invoice.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
    dueDate: { $lt: new Date() },
  }).lean();
}

export async function listUnpaidInvoices(organizationId: any) {
  return Invoice.find({
    organizationId,
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).lean();
}

export async function getCustomerOutstanding(organizationId: any, customerId: any): Promise<number> {
  const invoices = await Invoice.find({
    organizationId,
    customerId: new Types.ObjectId(customerId),
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).select("balanceDue").lean();

  return invoices.reduce((acc, curr) => acc + (curr.balanceDue || 0), 0);
}
