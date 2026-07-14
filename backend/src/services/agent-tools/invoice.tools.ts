import mongoose from "mongoose";
import Invoice from "../../models/invoice.model";
import Contact from "../../models/contact.model";

export async function createInvoiceTool(
  organizationId: string,
  args: {
    customerName: string;
    itemName?: string;
    amount?: number;
    quantity?: number;
    rate?: number;
    description?: string;
    invoiceNumber?: string;
    status?: "Draft" | "Sent" | "Paid";
  }
) {
  if (!args.customerName) {
    throw new Error("Customer name is required to create an invoice.");
  }

  // 1. Find customer by name
  let customer = await Contact.findOne({
    organizationId,
    displayName: new RegExp(`^${args.customerName.trim()}$`, "i"),
    isDeleted: false,
  });

  if (!customer) {
    // Attempt partial search
    customer = await Contact.findOne({
      organizationId,
      displayName: new RegExp(args.customerName.trim(), "i"),
      isDeleted: false,
    });
  }

  if (!customer) {
    // Auto-create customer if missing
    customer = await Contact.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      contactType: "Customer",
      displayName: args.customerName.trim(),
      taxTreatment: "Unregistered Business",
    });
  }

  // 2. Generate invoice number if not provided
  let invoiceNum = args.invoiceNumber;
  if (!invoiceNum) {
    const count = await Invoice.countDocuments({ organizationId });
    invoiceNum = `INV-${String(count + 1).padStart(5, "0")}`;
  }

  const rate = args.rate ?? args.amount ?? 0;
  const quantity = args.quantity ?? 1;
  const itemTotal = rate * quantity;

  const items = [
    {
      name: args.itemName || "General Sales & Services",
      description: args.description || "",
      quantity,
      rate,
      amount: itemTotal,
    },
  ];

  const status = args.status || "Draft";
  const now = new Date();
  const dueDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // +15 days

  const newInvoice = await Invoice.create({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    invoiceNumber: invoiceNum,
    customerId: customer._id,
    invoiceDate: now,
    dueDate,
    items,
    subTotal: itemTotal,
    total: itemTotal,
    balanceDue: status === "Paid" ? 0 : itemTotal,
    status,
    paidAt: status === "Paid" ? now : null,
  });

  // Update customer outstanding balances if applicable
  if (status !== "Paid") {
    await Contact.findByIdAndUpdate(customer._id, {
      $inc: { outstandingReceivable: itemTotal },
    });
  }

  return {
    success: true,
    invoiceId: newInvoice._id,
    invoiceNumber: newInvoice.invoiceNumber,
    customerName: customer.displayName,
    totalAmount: itemTotal,
    status: newInvoice.status,
    message: `Invoice "${newInvoice.invoiceNumber}" for ${customer.displayName} (₹${itemTotal.toLocaleString("en-IN")}) created cleanly.`,
  };
}

export async function searchInvoicesTool(
  organizationId: string,
  args: { query?: string; status?: string }
) {
  const filter: any = { organizationId, isDeleted: false };

  if (args.status) {
    filter.status = args.status;
  }

  if (args.query) {
    filter.$or = [
      { invoiceNumber: { $regex: args.query, $options: "i" } },
      { subject: { $regex: args.query, $options: "i" } },
    ];
  }

  const invoices = await Invoice.find(filter)
    .limit(10)
    .populate("customerId", "displayName")
    .select("invoiceNumber total balanceDue status invoiceDate dueDate customerId")
    .lean();

  return {
    count: invoices.length,
    invoices: invoices.map((inv) => ({
      id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      customerName: (inv.customerId as any)?.displayName || "Unknown",
      total: inv.total,
      balanceDue: inv.balanceDue,
      status: inv.status,
      date: inv.invoiceDate,
    })),
  };
}
