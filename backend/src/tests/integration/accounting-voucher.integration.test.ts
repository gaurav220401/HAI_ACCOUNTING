import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Bill from "../../models/bill.model";
import Contact from "../../models/contact.model";
import GlEntry from "../../models/gl-entry.model";
import Invoice from "../../models/invoice.model";
import Organization from "../../models/organization.model";
import PaymentMade from "../../models/payment-made.model";
import PaymentReceived from "../../models/payment-received.model";
import PurchaseOrder from "../../models/purchase-order.model";
import RecurringBill from "../../models/recurring-bill.model";
import * as paymentMadeController from "../../controllers/payment-made.controller";
import * as paymentReceivedController from "../../controllers/payment-received.controller";
import * as purchaseOrderController from "../../controllers/purchase-order.controller";
import * as accountController from "../../controllers/account.controller";
import { executeRecurringRun } from "../../services/recurring-bill.execution";

let replSet: MongoMemoryReplSet;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function invokeHandler(handler: any, req: any): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ statusCode: this.statusCode || 200, body: payload });
        return this;
      },
    };

    const next = (error?: any) => {
      if (error) reject(error);
    };

    handler(req, res, next);
  });
}

function makeReq(options: {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  body?: Record<string, any>;
  params?: Record<string, string>;
  query?: Record<string, any>;
  headers?: Record<string, string>;
}) {
  const headersLower = Object.fromEntries(
    Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    user: {
      _id: options.userId,
      email: "integration@test.local",
      name: "Integration Tester",
      activeOrganization: options.organizationId,
    },
    header(name: string) {
      return headersLower[name.toLowerCase()];
    },
  } as any;
}

async function seedCoreFixture() {
  const userId = new Types.ObjectId();

  const org = await Organization.create({
    name: `Org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  const customer = await Contact.create({
    organizationId: org._id,
    contactType: "Customer",
    displayName: "Customer One",
    currency: "INR",
  });

  const vendor = await Contact.create({
    organizationId: org._id,
    contactType: "Vendor",
    displayName: "Vendor One",
    currency: "INR",
  });

  const accountSeeds = [
    { name: "Bank", rootType: "Asset", accountType: "Bank" },
    {
      name: "Accounts Receivable",
      rootType: "Asset",
      accountType: "Accounts Receivable",
    },
    {
      name: "Accounts Payable",
      rootType: "Liability",
      accountType: "Accounts Payable",
    },
    {
      name: "Customer Advances",
      rootType: "Liability",
      accountType: "Other Current Liability",
    },
    {
      name: "Advances to Suppliers",
      rootType: "Asset",
      accountType: "Other Current Asset",
    },
    { name: "Sales", rootType: "Income", accountType: "Income" },
    { name: "Purchases", rootType: "Expense", accountType: "Expense" },
  ] as const;

  for (const row of accountSeeds) {
    await mongoose.model("Account").create({
      organizationId: org._id,
      name: row.name,
      rootType: row.rootType,
      accountType: row.accountType,
      isGroup: false,
      isDeleted: false,
      isActive: true,
      balance: 0,
      openingBalance: 0,
    });
  }

  const invoice = await Invoice.create({
    organizationId: org._id,
    invoiceNumber: "INV-100001",
    customerId: customer._id,
    invoiceDate: new Date("2026-01-15T00:00:00.000Z"),
    dueDate: new Date("2026-02-15T00:00:00.000Z"),
    items: [
      {
        name: "Consulting Service",
        quantity: 1,
        rate: 1000,
        amount: 1000,
      },
    ],
    subTotal: 1000,
    total: 1000,
    balanceDue: 1000,
    status: "Sent",
    paymentReceived: false,
  });

  const bill = await Bill.create({
    organizationId: org._id,
    vendorId: vendor._id,
    billNumber: "BILL-10001",
    billDate: new Date("2026-01-18T00:00:00.000Z"),
    lineItems: [
      {
        name: "Raw Material",
        quantity: 1,
        rate: 1000,
        amount: 1000,
      },
    ],
    subTotal: 1000,
    total: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    status: "Open",
    createdBy: userId,
    updatedBy: userId,
  });

  return {
    userId,
    org,
    customer,
    vendor,
    invoice,
    bill,
  };
}

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(replSet.getUri(), {
    dbName: "integration-tests",
  });
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test("payment received create enforces idempotency and avoids duplicate voucher posting", async () => {
  const fx = await seedCoreFixture();

  const idempotencyKey = "pr-idempotency-001";
  const req1 = makeReq({
    organizationId: fx.org._id,
    userId: fx.userId,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      customer_id: String(fx.customer._id),
      payment_date: "2026-01-20",
      payment_mode: "Bank Transfer",
      status: "PAID",
      total_amount_received: 300,
      invoice_applications: [{ invoice_id: String(fx.invoice._id), applied_amount: 100 }],
    },
  });

  const first = await invokeHandler(paymentReceivedController.create, req1);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.success, true);

  const req2 = makeReq({
    organizationId: fx.org._id,
    userId: fx.userId,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      customer_id: String(fx.customer._id),
      payment_date: "2026-01-20",
      payment_mode: "Bank Transfer",
      status: "PAID",
      total_amount_received: 300,
      invoice_applications: [{ invoice_id: String(fx.invoice._id), applied_amount: 100 }],
    },
  });

  await assert.rejects(
    invokeHandler(paymentReceivedController.create, req2),
    (error: any) => error?.statusCode === 409,
  );

  const payments = await PaymentReceived.find({ organization_id: fx.org._id });
  assert.equal(payments.length, 1);

  const voucherEntries = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherNo: payments[0].payment_number,
    isReversal: false,
  });

  assert.equal(voucherEntries.length, 3);
});

test("payment made create enforces idempotency and avoids duplicate voucher posting", async () => {
  const fx = await seedCoreFixture();

  const idempotencyKey = "pm-idempotency-001";
  const req1 = makeReq({
    organizationId: fx.org._id,
    userId: fx.userId,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      vendor_id: String(fx.vendor._id),
      payment_date: "2026-01-21",
      payment_mode: "Bank Transfer",
      status: "PAID",
      total_amount_paid: 300,
      bill_applications: [{ bill_id: String(fx.bill._id), applied_amount: 100 }],
    },
  });

  const first = await invokeHandler(paymentMadeController.create, req1);
  assert.equal(first.statusCode, 201);
  assert.equal(first.body.success, true);

  const req2 = makeReq({
    organizationId: fx.org._id,
    userId: fx.userId,
    headers: { "Idempotency-Key": idempotencyKey },
    body: {
      vendor_id: String(fx.vendor._id),
      payment_date: "2026-01-21",
      payment_mode: "Bank Transfer",
      status: "PAID",
      total_amount_paid: 300,
      bill_applications: [{ bill_id: String(fx.bill._id), applied_amount: 100 }],
    },
  });

  await assert.rejects(
    invokeHandler(paymentMadeController.create, req2),
    (error: any) => error?.statusCode === 409,
  );

  const payments = await PaymentMade.find({ organization_id: fx.org._id });
  assert.equal(payments.length, 1);

  const voucherEntries = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentMade",
    voucherNo: payments[0].payment_number,
    isReversal: false,
  });

  assert.equal(voucherEntries.length, 3);
});

test("payment received unapply keeps voucher movement consistent and restores invoice due", async () => {
  const fx = await seedCoreFixture();

  const createRes = await invokeHandler(
    paymentReceivedController.create,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      headers: { "Idempotency-Key": "pr-unapply-create-001" },
      body: {
        customer_id: String(fx.customer._id),
        payment_date: "2026-01-22",
        payment_mode: "Cash",
        status: "PAID",
        total_amount_received: 500,
        invoice_applications: [{ invoice_id: String(fx.invoice._id), applied_amount: 500 }],
      },
    }),
  );

  const paymentId = String(createRes.body.data._id);

  const invoiceAfterCreate = await Invoice.findById(fx.invoice._id).lean();
  assert.equal(round2(Number(invoiceAfterCreate?.balanceDue || 0)), 500);

  const unapplyRes = await invokeHandler(
    paymentReceivedController.unapplyFromInvoice,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      params: { id: paymentId },
      headers: { "Idempotency-Key": "pr-unapply-op-001" },
      body: {
        invoice_id: String(fx.invoice._id),
        applied_amount: 500,
      },
    }),
  );

  assert.equal(unapplyRes.statusCode, 200);

  const invoiceAfterUnapply = await Invoice.findById(fx.invoice._id).lean();
  assert.equal(round2(Number(invoiceAfterUnapply?.balanceDue || 0)), 1000);

  const entries = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: false,
  }).lean();

  const arAccount = await mongoose.model("Account").findOne({
    organizationId: fx.org._id,
    name: "Accounts Receivable",
  });
  const customerAdvanceAccount = await mongoose.model("Account").findOne({
    organizationId: fx.org._id,
    name: "Customer Advances",
  });

  assert.ok(arAccount);
  assert.ok(customerAdvanceAccount);

  const arNet = entries
    .filter((e: any) => String(e.accountId) === String(arAccount!._id))
    .reduce((sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0);
  const caNet = entries
    .filter((e: any) => String(e.accountId) === String(customerAdvanceAccount!._id))
    .reduce((sum: number, e: any) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0);

  assert.equal(round2(arNet), 0);
  assert.equal(round2(caNet), -500);
});

test("payment made void creates reversing vouchers and restores bill balances", async () => {
  const fx = await seedCoreFixture();

  const createRes = await invokeHandler(
    paymentMadeController.create,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      headers: { "Idempotency-Key": "pm-void-create-001" },
      body: {
        vendor_id: String(fx.vendor._id),
        payment_date: "2026-01-23",
        payment_mode: "Cash",
        status: "PAID",
        total_amount_paid: 600,
        bill_applications: [{ bill_id: String(fx.bill._id), applied_amount: 600 }],
      },
    }),
  );

  const paymentId = String(createRes.body.data._id);

  const billAfterCreate = await Bill.findById(fx.bill._id).lean();
  assert.equal(round2(Number(billAfterCreate?.amountPaid || 0)), 600);
  assert.equal(round2(Number(billAfterCreate?.balanceDue || 0)), 400);

  const voidRes = await invokeHandler(
    paymentMadeController.voidPayment,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      params: { id: paymentId },
      headers: { "Idempotency-Key": "pm-void-op-001" },
      body: {
        reason: "integration test void",
      },
    }),
  );

  assert.equal(voidRes.statusCode, 200);

  const billAfterVoid = await Bill.findById(fx.bill._id).lean();
  assert.equal(round2(Number(billAfterVoid?.amountPaid || 0)), 0);
  assert.equal(round2(Number(billAfterVoid?.balanceDue || 0)), 1000);

  const originals = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentMade",
    voucherId: { $regex: `^payment-made:${paymentId}:` },
    isReversal: false,
  }).lean();
  const reversals = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentMade",
    voucherId: { $regex: `^payment-made:${paymentId}:` },
    isReversal: true,
  }).lean();

  assert.equal(originals.length, reversals.length);
  assert.ok(originals.length > 0);

  const net = [...originals, ...reversals].reduce(
    (acc, row: any) => {
      const key = String(row.accountId);
      const delta = Number(row.debit || 0) - Number(row.credit || 0);
      acc.set(key, round2((acc.get(key) || 0) + delta));
      return acc;
    },
    new Map<string, number>(),
  );

  for (const value of net.values()) {
    assert.equal(round2(value), 0);
  }
});

test("payment received refund posts refund event without reversing original vouchers", async () => {
  const fx = await seedCoreFixture();

  const createRes = await invokeHandler(
    paymentReceivedController.create,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      headers: { "Idempotency-Key": "pr-refund-create-001" },
      body: {
        customer_id: String(fx.customer._id),
        payment_date: "2026-01-24",
        payment_mode: "Cash",
        status: "PAID",
        total_amount_received: 500,
        invoice_applications: [{ invoice_id: String(fx.invoice._id), applied_amount: 200 }],
      },
    }),
  );

  const paymentId = String(createRes.body.data._id);

  const beforeOriginal = await GlEntry.countDocuments({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: false,
  });
  const beforeReversal = await GlEntry.countDocuments({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: true,
  });

  const refundRes = await invokeHandler(
    paymentReceivedController.recordRefund,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      params: { id: paymentId },
      headers: { "Idempotency-Key": "pr-refund-op-001" },
      body: {
        amount: 100,
      },
    }),
  );

  assert.equal(refundRes.statusCode, 200);

  const afterOriginal = await GlEntry.countDocuments({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: false,
  });
  const afterReversal = await GlEntry.countDocuments({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: true,
  });

  assert.equal(beforeReversal, 0);
  assert.equal(afterReversal, 0);
  assert.equal(afterOriginal, beforeOriginal + 2);
});

test("payment received void creates reversing vouchers and restores invoice balances", async () => {
  const fx = await seedCoreFixture();

  const createRes = await invokeHandler(
    paymentReceivedController.create,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      headers: { "Idempotency-Key": "pr-void-create-001" },
      body: {
        customer_id: String(fx.customer._id),
        payment_date: "2026-01-25",
        payment_mode: "Cash",
        status: "PAID",
        total_amount_received: 600,
        invoice_applications: [{ invoice_id: String(fx.invoice._id), applied_amount: 600 }],
      },
    }),
  );

  const paymentId = String(createRes.body.data._id);

  const invoiceAfterCreate = await Invoice.findById(fx.invoice._id).lean();
  assert.equal(round2(Number(invoiceAfterCreate?.balanceDue || 0)), 400);

  const voidRes = await invokeHandler(
    paymentReceivedController.voidPayment,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      params: { id: paymentId },
      headers: { "Idempotency-Key": "pr-void-op-001" },
      body: {
        reason: "integration test void",
      },
    }),
  );

  assert.equal(voidRes.statusCode, 200);

  const invoiceAfterVoid = await Invoice.findById(fx.invoice._id).lean();
  assert.equal(round2(Number(invoiceAfterVoid?.balanceDue || 0)), 1000);

  const originals = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: false,
  }).lean();
  const reversals = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "PaymentReceived",
    voucherId: { $regex: `^payment-received:${paymentId}:` },
    isReversal: true,
  }).lean();

  assert.equal(originals.length, reversals.length);
  assert.ok(originals.length > 0);

  const net = [...originals, ...reversals].reduce(
    (acc, row: any) => {
      const key = String(row.accountId);
      const delta = Number(row.debit || 0) - Number(row.credit || 0);
      acc.set(key, round2((acc.get(key) || 0) + delta));
      return acc;
    },
    new Map<string, number>(),
  );

  for (const value of net.values()) {
    assert.equal(round2(value), 0);
  }
});

test("purchase order conversion posts bill vouchers and syncs vendor outstanding", async () => {
  const fx = await seedCoreFixture();

  const purchasesAccount = await mongoose.model("Account").findOne({
    organizationId: fx.org._id,
    name: "Purchases",
  });
  assert.ok(purchasesAccount);

  const po = await PurchaseOrder.create({
    organizationId: fx.org._id,
    vendorId: fx.vendor._id,
    purchaseOrderNumber: "PO-100001",
    referenceNumber: "PO-REF-001",
    purchaseOrderDate: new Date("2026-01-26T00:00:00.000Z"),
    lineItems: [
      {
        name: "Raw Material",
        quantity: 1,
        rate: 500,
        amount: 500,
        accountId: purchasesAccount!._id,
      },
    ],
    subTotal: 500,
    total: 500,
    status: "Open",
  });

  const convertRes = await invokeHandler(
    purchaseOrderController.convertToBill,
    makeReq({
      organizationId: fx.org._id,
      userId: fx.userId,
      params: { id: String(po._id) },
    }),
  );

  assert.equal(convertRes.statusCode, 200);
  assert.equal(convertRes.body.success, true);

  const billId = String(convertRes.body.data.billId);

  const billEntries = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "Bill",
    voucherId: `bill:${billId}`,
    isReversal: false,
  }).lean();
  assert.equal(billEntries.length, 2);

  const convertedPo = await PurchaseOrder.findById(po._id).lean();
  assert.equal(convertedPo?.status, "Billed");

  const vendorAfter = await Contact.findById(fx.vendor._id).lean();
  const payableRows = await Bill.aggregate([
    {
      $match: {
        organizationId: fx.org._id,
        vendorId: fx.vendor._id,
        isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$balanceDue", 0] } },
      },
    },
  ]);
  const expectedOutstanding = round2(Number(payableRows[0]?.total || 0));
  assert.equal(round2(Number(vendorAfter?.outstandingPayable || 0)), expectedOutstanding);
});

test("recurring bill execution posts vouchers and advances profile state", async () => {
  const fx = await seedCoreFixture();

  const purchasesAccount = await mongoose.model("Account").findOne({
    organizationId: fx.org._id,
    name: "Purchases",
  });
  assert.ok(purchasesAccount);

  const runDate = new Date("2026-01-27T00:00:00.000Z");
  const recurring = await RecurringBill.create({
    organizationId: fx.org._id,
    profileName: "Weekly Materials",
    vendorId: fx.vendor._id,
    frequency: "Weekly",
    repeatEvery: 1,
    startDate: runDate,
    nextBillDate: runDate,
    neverExpires: true,
    discountLevel: "transaction",
    taxType: "none",
    lineItems: [
      {
        name: "Raw Material",
        quantity: 1,
        rate: 750,
        amount: 750,
        accountId: purchasesAccount!._id,
      },
    ],
    subTotal: 750,
    total: 750,
    generatedBillIds: [],
    status: "Active",
    createdBy: fx.userId,
    updatedBy: fx.userId,
  });

  const runResult = await executeRecurringRun(recurring, runDate, fx.userId);
  assert.equal(runResult.skipped, false);

  const billId = String(runResult.bill._id);

  const billEntries = await GlEntry.find({
    organizationId: fx.org._id,
    voucherType: "Bill",
    voucherId: `bill:${billId}`,
    isReversal: false,
  }).lean();
  assert.equal(billEntries.length, 2);

  const recurringAfter = await RecurringBill.findById(recurring._id).lean();
  assert.ok(recurringAfter);
  assert.equal(String(recurringAfter!.generatedBillIds[0]), billId);
  assert.ok(recurringAfter!.lastBillDate);
  assert.ok(recurringAfter!.nextBillDate);

  const vendorAfter = await Contact.findById(fx.vendor._id).lean();
  const payableRows = await Bill.aggregate([
    {
      $match: {
        organizationId: fx.org._id,
        vendorId: fx.vendor._id,
        isDeleted: false,
        status: { $nin: ["Draft", "Void"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$balanceDue", 0] } },
      },
    },
  ]);
  const expectedOutstanding = round2(Number(payableRows[0]?.total || 0));
  assert.equal(round2(Number(vendorAfter?.outstandingPayable || 0)), expectedOutstanding);
});

test("predefined accounts cannot be deleted but remain editable", async () => {
  const fx = await seedCoreFixture();

  const account = await mongoose.model("Account").create({
    organizationId: fx.org._id,
    name: "Locked Receivable",
    code: "1151",
    rootType: "Asset",
    accountType: "Accounts Receivable",
    isGroup: false,
    isSystemAccount: true,
    isDeleted: false,
    isActive: true,
    openingBalance: 0,
    balance: 0,
  });

  await assert.rejects(
    invokeHandler(
      accountController.remove,
      makeReq({
        organizationId: fx.org._id,
        userId: fx.userId,
        params: { id: String(account._id) },
      }),
    ),
    (error: any) =>
      error?.statusCode === 400 &&
      String(error?.message || "").includes("Predefined accounts cannot be deleted"),
  );

  const stillThere = await mongoose.model("Account").findById(account._id).lean();
  assert.equal(Boolean((stillThere as any)?.isDeleted), false);
});

test("accounts referenced in ledger cannot be deleted", async () => {
  const fx = await seedCoreFixture();

  const account = await mongoose.model("Account").create({
    organizationId: fx.org._id,
    name: "Linked Account",
    code: "1152",
    rootType: "Asset",
    accountType: "Other Current Asset",
    isGroup: false,
    isSystemAccount: false,
    isDeleted: false,
    isActive: true,
    openingBalance: 0,
    balance: 0,
  });

  await GlEntry.create({
    organizationId: fx.org._id,
    voucherType: "System",
    voucherId: "acc-del-guard-1",
    voucherNo: "ACC-DEL-1",
    postingDate: new Date("2026-01-28T00:00:00.000Z"),
    accountId: account._id,
    debit: 10,
    credit: 0,
    contactType: "None",
    contactId: null,
    currency: "INR",
    exchangeRate: 1,
    description: "Deletion guard test",
    isReversal: false,
    reversalOf: null,
  });

  await assert.rejects(
    invokeHandler(
      accountController.remove,
      makeReq({
        organizationId: fx.org._id,
        userId: fx.userId,
        params: { id: String(account._id) },
      }),
    ),
    (error: any) =>
      error?.statusCode === 400 &&
      String(error?.message || "").includes("General Ledger entries"),
  );

  const stillThere = await mongoose.model("Account").findById(account._id).lean();
  assert.equal(Boolean((stillThere as any)?.isDeleted), false);
});
