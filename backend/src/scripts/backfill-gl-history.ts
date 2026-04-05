import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import path from "path";
import Account from "../models/account.model";
import Bill from "../models/bill.model";
import GlEntry, { GlVoucherType } from "../models/gl-entry.model";
import Invoice from "../models/invoice.model";
import Journal from "../models/journal.model";
import PaymentMade from "../models/payment-made.model";
import PaymentReceived from "../models/payment-received.model";
import { computeInvoiceCostLines } from "../services/accounting-sync.service";
import {
  findAccountIdByName,
  PostingLine,
  PostVoucherInput,
  postVoucher,
} from "../services/gl-posting.service";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

type SectionStats = {
  scanned: number;
  eligible: number;
  posted: number;
  alreadyPosted: number;
  skipped: number;
  errors: number;
};

const accountCache = new Map<string, Types.ObjectId>();
const accountExistsCache = new Map<string, boolean>();

function toNum(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeStats(): SectionStats {
  return {
    scanned: 0,
    eligible: 0,
    posted: 0,
    alreadyPosted: 0,
    skipped: 0,
    errors: 0,
  };
}

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function inferAccountType(rootType?: string, names: string[] = []): string | null {
  if (!rootType) return null;

  const candidates = names.map((name) => String(name || "").toLowerCase());
  if (candidates.some((name) => name.includes("accounts receivable") || name.includes("receivable") || name.includes("debtor"))) {
    return "Accounts Receivable";
  }
  if (candidates.some((name) => name.includes("accounts payable") || name.includes("payable") || name.includes("creditor"))) {
    return "Accounts Payable";
  }
  if (candidates.some((name) => name.includes("bank"))) return "Bank";
  if (candidates.some((name) => name.includes("cash"))) return "Cash";
  if (candidates.some((name) => name.includes("stock") || name.includes("inventory"))) return "Stock";

  if (rootType === "Asset") return "Other Current Asset";
  if (rootType === "Liability") return "Other Current Liability";
  if (rootType === "Equity") return "Equity";
  if (rootType === "Income") return "Income";
  if (rootType === "Expense") return "Expense";
  return null;
}

async function createFallbackAccount(params: {
  organizationId: Types.ObjectId;
  names: string[];
  rootType: string;
  accountType?: string;
}): Promise<Types.ObjectId> {
  const name = String(params.names?.[0] || `${params.rootType} Backfill Account`).trim();
  const accountType = params.accountType || inferAccountType(params.rootType, params.names || []);
  if (!accountType) {
    throw new Error(`Cannot infer accountType while creating fallback account ${name}`);
  }

  const existing = await Account.findOne({
    organizationId: params.organizationId,
    name,
    parentId: null,
    isDeleted: false,
    isGroup: false,
  }).select("_id");

  if (existing?._id) return existing._id as Types.ObjectId;

  try {
    const created = await Account.create({
      organizationId: params.organizationId,
      name,
      rootType: params.rootType,
      accountType,
      isGroup: false,
      isDeleted: false,
      isActive: true,
      isSystemAccount: true,
      openingBalance: 0,
      balance: 0,
    });
    console.log(`Created fallback account: ${name} (${params.rootType}/${accountType})`);
    return created._id as Types.ObjectId;
  } catch {
    const retry = await Account.findOne({
      organizationId: params.organizationId,
      name,
      parentId: null,
      isDeleted: false,
      isGroup: false,
    }).select("_id");
    if (retry?._id) return retry._id as Types.ObjectId;
    throw new Error(`Unable to create fallback account ${name}`);
  }
}

async function accountExists(organizationId: Types.ObjectId, accountId: unknown): Promise<boolean> {
  if (!accountId || !Types.ObjectId.isValid(String(accountId))) return false;
  const normalizedId = String(accountId);
  const cacheKey = `${String(organizationId)}::${normalizedId}`;
  const cached = accountExistsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const exists = await Account.exists({
    _id: new Types.ObjectId(normalizedId),
    organizationId,
    isDeleted: false,
    isGroup: false,
  });
  const result = !!exists;
  accountExistsCache.set(cacheKey, result);
  return result;
}

async function resolveAccountRef(params: {
  organizationId: Types.ObjectId;
  candidateAccountId?: unknown;
  fallbackKey: string;
  fallbackNames: string[];
  rootType?: string;
  accountType?: string;
}): Promise<Types.ObjectId> {
  if (params.candidateAccountId && (await accountExists(params.organizationId, params.candidateAccountId))) {
    return new Types.ObjectId(String(params.candidateAccountId));
  }

  return accountId({
    organizationId: params.organizationId,
    key: params.fallbackKey,
    names: params.fallbackNames,
    rootType: params.rootType,
    accountType: params.accountType,
  });
}

async function voucherAlreadyPosted(params: {
  organizationId: Types.ObjectId;
  voucherType: GlVoucherType;
  voucherId: string;
}): Promise<boolean> {
  const existing = await GlEntry.exists({
    organizationId: params.organizationId,
    voucherType: params.voucherType,
    voucherId: params.voucherId,
    isReversal: false,
  });
  return !!existing;
}

async function postOrDryRun(input: PostVoucherInput, dryRun: boolean): Promise<"posted" | "already"> {
  if (dryRun) {
    const already = await voucherAlreadyPosted({
      organizationId: new Types.ObjectId(String(input.organizationId)),
      voucherType: input.voucherType,
      voucherId: input.voucherId,
    });
    return already ? "already" : "posted";
  }

  const result = await postVoucher(input);
  return result.posted ? "posted" : "already";
}

async function accountId(params: {
  organizationId: Types.ObjectId;
  key: string;
  names: string[];
  rootType?: string;
  accountType?: string;
}): Promise<Types.ObjectId> {
  const cacheKey = `${String(params.organizationId)}::${params.key}`;
  const cached = accountCache.get(cacheKey);
  if (cached) return cached;

  let resolved: Types.ObjectId;
  try {
    resolved = await findAccountIdByName({
      organizationId: params.organizationId,
      names: params.names,
      rootType: params.rootType,
      accountType: params.accountType,
    });
  } catch (error: any) {
    const notFound = String(error?.code || "") === "NOT_FOUND" || String(error?.statusCode || "") === "404";
    if (!notFound || !params.rootType) throw error;

    resolved = await createFallbackAccount({
      organizationId: params.organizationId,
      names: params.names,
      rootType: params.rootType,
      accountType: params.accountType,
    });
  }

  accountCache.set(cacheKey, resolved);
  accountExistsCache.set(`${String(params.organizationId)}::${String(resolved)}`, true);
  return resolved;
}

function isPostedInvoiceStatus(status: string): boolean {
  return status !== "Draft" && status !== "Void";
}

function isPostedBillStatus(status: string): boolean {
  return status !== "Draft" && status !== "Void";
}

function invoiceVoucherId(invoice: any): string {
  return `invoice:${String(invoice._id)}`;
}

function billVoucherId(bill: any): string {
  return `bill:${String(bill._id)}`;
}

function paymentMadeVoucherId(payment: any, event: string): string {
  return `payment-made:${String(payment._id)}:${event}`;
}

function paymentReceivedVoucherId(payment: any, event: string): string {
  return `payment-received:${String(payment._id)}:${event}`;
}

function journalVoucherId(journal: any): string {
  return `journal:${String(journal._id)}`;
}

async function buildInvoiceLines(invoice: any): Promise<PostingLine[]> {
  const organizationId = invoice.organizationId as Types.ObjectId;
  const receivableAmount = round2(toNum(invoice.total));
  if (receivableAmount <= 0) return [];

  const arAccountId = await accountId({
    organizationId,
    key: "invoice:ar",
    names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
    rootType: "Asset",
    accountType: "Accounts Receivable",
  });

  const defaultSalesAccountId = await accountId({
    organizationId,
    key: "invoice:sales",
    names: ["Sales", "Sales Revenue", "Sales Account"],
    rootType: "Income",
    accountType: "Income",
  });

  const revenueMap = new Map<string, number>();
  for (const row of invoice.items || []) {
    const amount = round2(toNum(row?.amount));
    if (amount <= 0) continue;
    const lineAccountId = String(
      await resolveAccountRef({
        organizationId,
        candidateAccountId: row?.accountId,
        fallbackKey: "invoice:sales",
        fallbackNames: ["Sales", "Sales Revenue", "Sales Account"],
        rootType: "Income",
        accountType: "Income",
      }),
    );
    revenueMap.set(lineAccountId, round2((revenueMap.get(lineAccountId) || 0) + amount));
  }
  if (revenueMap.size === 0) {
    revenueMap.set(String(defaultSalesAccountId), receivableAmount);
  }

  const lines: PostingLine[] = [
    {
      accountId: arAccountId,
      debit: receivableAmount,
      description: `Invoice ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    },
  ];

  let recognizedRevenue = 0;
  for (const [lineAccountId, amount] of revenueMap.entries()) {
    const rounded = round2(amount);
    if (rounded <= 0) continue;
    lines.push({
      accountId: lineAccountId,
      credit: rounded,
      description: `Revenue - ${invoice.invoiceNumber}`,
      contactType: "Customer",
      contactId: invoice.customerId,
    });
    recognizedRevenue = round2(recognizedRevenue + rounded);
  }

  const taxDelta = round2(receivableAmount - recognizedRevenue);
  if (Math.abs(taxDelta) > 0.009) {
    if (taxDelta > 0) {
      const taxPayableAccountId = await accountId({
        organizationId,
        key: "invoice:taxPayable",
        names: ["Output Tax Payable", "GST Payable", "Tax Payable"],
        rootType: "Liability",
        accountType: "Other Current Liability",
      });
      lines.push({
        accountId: taxPayableAccountId,
        credit: taxDelta,
        description: `Tax - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      });
    } else {
      const taxAssetAccountId = await accountId({
        organizationId,
        key: "invoice:taxAsset",
        names: ["Tax Receivable", "TDS Receivable", "Advance Tax"],
        rootType: "Asset",
        accountType: "Other Current Asset",
      });
      lines.push({
        accountId: taxAssetAccountId,
        debit: Math.abs(taxDelta),
        description: `Tax receivable - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      });
    }
  }

  const costLines = await computeInvoiceCostLines({
    organizationId,
    items: invoice.items || [],
  });
  const cogsTotal = round2(
    (costLines || []).reduce((sum, line) => sum + toNum(line?.costAmount), 0),
  );

  if (cogsTotal > 0) {
    const cogsAccountId = await accountId({
      organizationId,
      key: "invoice:cogs",
      names: ["Cost of Goods Sold", "COGS"],
      rootType: "Expense",
      accountType: "Cost Of Goods Sold",
    });
    const stockAccountId = await accountId({
      organizationId,
      key: "invoice:stock",
      names: ["Inventory Asset", "Inventory", "Stock"],
      rootType: "Asset",
      accountType: "Stock",
    });

    lines.push(
      {
        accountId: cogsAccountId,
        debit: cogsTotal,
        description: `COGS - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      },
      {
        accountId: stockAccountId,
        credit: cogsTotal,
        description: `Inventory issue - ${invoice.invoiceNumber}`,
        contactType: "Customer",
        contactId: invoice.customerId,
      },
    );
  }

  return lines;
}

async function buildBillLines(bill: any): Promise<PostingLine[]> {
  const organizationId = bill.organizationId as Types.ObjectId;
  const total = round2(toNum(bill.total));
  if (total <= 0) return [];

  const accountsPayableId =
    await resolveAccountRef({
      organizationId,
      candidateAccountId: bill.accountsPayableId,
      fallbackKey: "bill:ap",
      fallbackNames: ["Accounts Payable", "Trade Payables", "Creditors"],
      rootType: "Liability",
      accountType: "Accounts Payable",
    });

  const defaultExpenseId = await accountId({
    organizationId,
    key: "bill:expense",
    names: ["Purchases", "Purchase Account", "Expenses"],
    rootType: "Expense",
    accountType: "Expense",
  });

  const debitMap = new Map<string, number>();
  for (const line of bill.lineItems || []) {
    if (!line || line.isHeader) continue;
    const amount = round2(toNum(line.amount));
    if (amount <= 0) continue;
    const lineAccountId = String(
      await resolveAccountRef({
        organizationId,
        candidateAccountId: line.accountId,
        fallbackKey: "bill:expense",
        fallbackNames: ["Purchases", "Purchase Account", "Expenses"],
        rootType: "Expense",
        accountType: "Expense",
      }),
    );
    debitMap.set(lineAccountId, round2((debitMap.get(lineAccountId) || 0) + amount));
  }

  if (debitMap.size === 0) {
    debitMap.set(String(defaultExpenseId), total);
  }

  const totalDebits = round2(
    Array.from(debitMap.values()).reduce((sum, amount) => sum + toNum(amount), 0),
  );
  const balancingDelta = round2(total - totalDebits);
  if (Math.abs(balancingDelta) > 0.009) {
    debitMap.set(
      String(defaultExpenseId),
      round2((debitMap.get(String(defaultExpenseId)) || 0) + balancingDelta),
    );
  }

  const lines: PostingLine[] = [];
  for (const [lineAccountId, amount] of debitMap.entries()) {
    const rounded = round2(amount);
    if (Math.abs(rounded) < 0.009) continue;
    if (rounded > 0) {
      lines.push({
        accountId: lineAccountId,
        debit: rounded,
        description: `Bill expense ${bill.billNumber}`,
        contactType: "Vendor",
        contactId: bill.vendorId,
      });
    } else {
      lines.push({
        accountId: lineAccountId,
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

  return lines;
}

async function backfillInvoices(orgFilter: Record<string, unknown>, dryRun: boolean): Promise<SectionStats> {
  const stats = makeStats();
  const cursor = Invoice.find({ ...orgFilter, isDeleted: false }).lean().cursor();

  for await (const invoice of cursor) {
    stats.scanned += 1;
    if (!isPostedInvoiceStatus(String(invoice.status || ""))) {
      stats.skipped += 1;
      continue;
    }

    stats.eligible += 1;
    try {
      const lines = await buildInvoiceLines(invoice);
      if (lines.length === 0) {
        stats.skipped += 1;
        continue;
      }

      const state = await postOrDryRun(
        {
          organizationId: invoice.organizationId,
          voucherType: "Invoice",
          voucherId: invoiceVoucherId(invoice),
          voucherNo: String(invoice.invoiceNumber || invoice._id),
          postingDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
          lines,
          description: `Backfill invoice ${invoice.invoiceNumber}`,
        },
        dryRun,
      );

      if (state === "posted") stats.posted += 1;
      else stats.alreadyPosted += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`Invoice backfill failed for ${String(invoice._id)}:`, error);
    }
  }

  return stats;
}

async function backfillBills(orgFilter: Record<string, unknown>, dryRun: boolean): Promise<SectionStats> {
  const stats = makeStats();
  const cursor = Bill.find({ ...orgFilter, isDeleted: false }).lean().cursor();

  for await (const bill of cursor) {
    stats.scanned += 1;
    if (!isPostedBillStatus(String(bill.status || ""))) {
      stats.skipped += 1;
      continue;
    }

    stats.eligible += 1;
    try {
      const lines = await buildBillLines(bill);
      if (lines.length === 0) {
        stats.skipped += 1;
        continue;
      }

      const state = await postOrDryRun(
        {
          organizationId: bill.organizationId,
          voucherType: "Bill",
          voucherId: billVoucherId(bill),
          voucherNo: String(bill.billNumber || bill._id),
          postingDate: bill.billDate ? new Date(bill.billDate) : new Date(),
          lines,
          description: `Backfill bill ${bill.billNumber}`,
        },
        dryRun,
      );

      if (state === "posted") stats.posted += 1;
      else stats.alreadyPosted += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`Bill backfill failed for ${String(bill._id)}:`, error);
    }
  }

  return stats;
}

async function backfillJournals(orgFilter: Record<string, unknown>, dryRun: boolean): Promise<SectionStats> {
  const stats = makeStats();
  const cursor = Journal.find({ ...orgFilter, isDeleted: false }).lean().cursor();

  for await (const journal of cursor) {
    stats.scanned += 1;
    if (String(journal.status || "") !== "Posted") {
      stats.skipped += 1;
      continue;
    }

    stats.eligible += 1;
    try {
      const lines: PostingLine[] = (journal.lineItems || [])
        .map((line: any) => ({
          accountId: line.accountId,
          debit: round2(toNum(line.debit)),
          credit: round2(toNum(line.credit)),
          description: String(line.narration || journal.description || `Journal ${journal.journalNumber || journal._id}`),
        }))
        .filter((line) => (line.debit || 0) > 0 || (line.credit || 0) > 0);

      if (lines.length === 0) {
        stats.skipped += 1;
        continue;
      }

      const state = await postOrDryRun(
        {
          organizationId: journal.organizationId,
          voucherType: "Journal",
          voucherId: journalVoucherId(journal),
          voucherNo: String(journal.journalNumber || journal._id),
          postingDate: journal.date ? new Date(journal.date) : new Date(),
          lines,
          description: `Backfill journal ${journal.journalNumber || journal._id}`,
        },
        dryRun,
      );

      if (state === "posted") stats.posted += 1;
      else stats.alreadyPosted += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`Journal backfill failed for ${String(journal._id)}:`, error);
    }
  }

  return stats;
}

async function resolvePaymentReceivedAccounts(payment: any) {
  const organizationId = payment.organization_id as Types.ObjectId;

  const bankAccountId = await resolveAccountRef({
    organizationId,
    candidateAccountId: payment.deposited_to_account,
    fallbackKey: "paymentReceived:bank",
    fallbackNames: ["Bank", "Cash", "Cash In Hand", "Undeposited Funds"],
    rootType: "Asset",
    accountType: "Bank",
  });

  const accountsReceivableId = await accountId({
    organizationId,
    key: "paymentReceived:ar",
    names: ["Accounts Receivable", "Trade Receivables", "Debtors"],
    rootType: "Asset",
    accountType: "Accounts Receivable",
  });

  const customerAdvanceId = await accountId({
    organizationId,
    key: "paymentReceived:advance",
    names: ["Customer Advances", "Advances from Customers", "Unearned Revenue"],
    rootType: "Liability",
    accountType: "Other Current Liability",
  });

  return { bankAccountId, accountsReceivableId, customerAdvanceId };
}

async function backfillPaymentReceived(orgFilter: Record<string, unknown>, dryRun: boolean): Promise<SectionStats> {
  const stats = makeStats();
  const cursor = PaymentReceived.find({ ...orgFilter, is_deleted: false }).lean().cursor();

  for await (const payment of cursor) {
    stats.scanned += 1;
    if (String(payment.status || "") !== "PAID") {
      stats.skipped += 1;
      continue;
    }

    stats.eligible += 1;
    try {
      const { bankAccountId, accountsReceivableId, customerAdvanceId } =
        await resolvePaymentReceivedAccounts(payment);

      const total = round2(toNum(payment.total_amount_received));
      const used = round2(toNum(payment.amount_used_for_invoices));
      const refunded = round2(toNum(payment.amount_refunded));
      const openingAdvance = round2(Math.max(0, total - used));

      const createLines: PostingLine[] = [];
      if (total > 0) {
        createLines.push({
          accountId: bankAccountId,
          debit: total,
          description: `Payment received ${payment.payment_number}`,
          contactType: "Customer",
          contactId: payment.customer_id,
        });
      }
      if (used > 0) {
        createLines.push({
          accountId: accountsReceivableId,
          credit: used,
          description: `Invoice settlement ${payment.payment_number}`,
          contactType: "Customer",
          contactId: payment.customer_id,
        });
      }
      if (openingAdvance > 0) {
        createLines.push({
          accountId: customerAdvanceId,
          credit: openingAdvance,
          description: `Customer advance ${payment.payment_number}`,
          contactType: "Customer",
          contactId: payment.customer_id,
        });
      }

      if (createLines.length > 0) {
        const createState = await postOrDryRun(
          {
            organizationId: payment.organization_id,
            voucherType: "PaymentReceived",
            voucherId: paymentReceivedVoucherId(payment, "create"),
            voucherNo: String(payment.payment_number || payment._id),
            postingDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
            lines: createLines,
            description: `Backfill payment received create ${payment.payment_number}`,
          },
          dryRun,
        );

        if (createState === "posted") stats.posted += 1;
        else stats.alreadyPosted += 1;
      }

      if (refunded > 0) {
        const refundState = await postOrDryRun(
          {
            organizationId: payment.organization_id,
            voucherType: "PaymentReceived",
            voucherId: paymentReceivedVoucherId(payment, "refund:backfill"),
            voucherNo: String(payment.payment_number || payment._id),
            postingDate: payment.updatedAt ? new Date(payment.updatedAt) : payment.payment_date ? new Date(payment.payment_date) : new Date(),
            lines: [
              {
                accountId: customerAdvanceId,
                debit: refunded,
                description: `Refund to customer ${payment.payment_number}`,
                contactType: "Customer",
                contactId: payment.customer_id,
              },
              {
                accountId: bankAccountId,
                credit: refunded,
                description: `Refund to customer ${payment.payment_number}`,
                contactType: "Customer",
                contactId: payment.customer_id,
              },
            ],
            description: `Backfill payment received refund ${payment.payment_number}`,
          },
          dryRun,
        );

        if (refundState === "posted") stats.posted += 1;
        else stats.alreadyPosted += 1;
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`Payment received backfill failed for ${String(payment._id)}:`, error);
    }
  }

  return stats;
}

async function resolvePaymentMadeAccounts(payment: any) {
  const organizationId = payment.organization_id as Types.ObjectId;

  const bankAccountId = await resolveAccountRef({
    organizationId,
    candidateAccountId: payment.paid_through_account,
    fallbackKey: "paymentMade:bank",
    fallbackNames: ["Bank", "Cash", "Cash In Hand", "Undeposited Funds"],
    rootType: "Asset",
    accountType: "Bank",
  });

  const accountsPayableId = await accountId({
    organizationId,
    key: "paymentMade:ap",
    names: ["Accounts Payable", "Trade Payables", "Creditors"],
    rootType: "Liability",
    accountType: "Accounts Payable",
  });

  const vendorAdvanceId = await accountId({
    organizationId,
    key: "paymentMade:advance",
    names: ["Advances to Suppliers", "Vendor Advances", "Advances to Vendors"],
    rootType: "Asset",
    accountType: "Other Current Asset",
  });

  return { bankAccountId, accountsPayableId, vendorAdvanceId };
}

async function backfillPaymentMade(orgFilter: Record<string, unknown>, dryRun: boolean): Promise<SectionStats> {
  const stats = makeStats();
  const cursor = PaymentMade.find({ ...orgFilter, is_deleted: false }).lean().cursor();

  for await (const payment of cursor) {
    stats.scanned += 1;
    if (String(payment.status || "") !== "PAID") {
      stats.skipped += 1;
      continue;
    }

    stats.eligible += 1;
    try {
      const { bankAccountId, accountsPayableId, vendorAdvanceId } =
        await resolvePaymentMadeAccounts(payment);

      const total = round2(toNum(payment.total_amount_paid));
      const used = round2(toNum(payment.amount_used_for_bills));
      const refunded = round2(toNum(payment.amount_refunded));
      const openingAdvance = round2(Math.max(0, total - used));

      const createLines: PostingLine[] = [];
      if (used > 0) {
        createLines.push({
          accountId: accountsPayableId,
          debit: used,
          description: `Bill settlement ${payment.payment_number}`,
          contactType: "Vendor",
          contactId: payment.vendor_id,
        });
      }
      if (openingAdvance > 0) {
        createLines.push({
          accountId: vendorAdvanceId,
          debit: openingAdvance,
          description: `Vendor advance ${payment.payment_number}`,
          contactType: "Vendor",
          contactId: payment.vendor_id,
        });
      }
      if (total > 0) {
        createLines.push({
          accountId: bankAccountId,
          credit: total,
          description: `Payment made ${payment.payment_number}`,
          contactType: "Vendor",
          contactId: payment.vendor_id,
        });
      }

      if (createLines.length > 0) {
        const createState = await postOrDryRun(
          {
            organizationId: payment.organization_id,
            voucherType: "PaymentMade",
            voucherId: paymentMadeVoucherId(payment, "create"),
            voucherNo: String(payment.payment_number || payment._id),
            postingDate: payment.payment_date ? new Date(payment.payment_date) : new Date(),
            lines: createLines,
            description: `Backfill payment made create ${payment.payment_number}`,
          },
          dryRun,
        );

        if (createState === "posted") stats.posted += 1;
        else stats.alreadyPosted += 1;
      }

      if (refunded > 0) {
        const refundState = await postOrDryRun(
          {
            organizationId: payment.organization_id,
            voucherType: "PaymentMade",
            voucherId: paymentMadeVoucherId(payment, "refund:backfill"),
            voucherNo: String(payment.payment_number || payment._id),
            postingDate: payment.updatedAt ? new Date(payment.updatedAt) : payment.payment_date ? new Date(payment.payment_date) : new Date(),
            lines: [
              {
                accountId: bankAccountId,
                debit: refunded,
                description: `Refund from vendor ${payment.payment_number}`,
                contactType: "Vendor",
                contactId: payment.vendor_id,
              },
              {
                accountId: vendorAdvanceId,
                credit: refunded,
                description: `Refund from vendor ${payment.payment_number}`,
                contactType: "Vendor",
                contactId: payment.vendor_id,
              },
            ],
            description: `Backfill payment made refund ${payment.payment_number}`,
          },
          dryRun,
        );

        if (refundState === "posted") stats.posted += 1;
        else stats.alreadyPosted += 1;
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`Payment made backfill failed for ${String(payment._id)}:`, error);
    }
  }

  return stats;
}

function printStats(name: string, stats: SectionStats) {
  console.log(`\n[${name}]`);
  console.log(`  scanned: ${stats.scanned}`);
  console.log(`  eligible: ${stats.eligible}`);
  console.log(`  posted: ${stats.posted}`);
  console.log(`  alreadyPosted: ${stats.alreadyPosted}`);
  console.log(`  skipped: ${stats.skipped}`);
  console.log(`  errors: ${stats.errors}`);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to backend/.env before running this script.");
  }

  const dryRun = process.argv.includes("--dry-run");
  const orgArg = parseFlag("org");

  let orgFilter: Record<string, unknown> = {};
  if (orgArg) {
    if (!Types.ObjectId.isValid(orgArg)) {
      throw new Error("Invalid --org value. Expected a MongoDB ObjectId.");
    }
    const orgId = new Types.ObjectId(orgArg);
    orgFilter = { organizationId: orgId };
  }

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB${dryRun ? " (dry-run)" : ""}`);

  const invoiceFilter = { ...orgFilter };
  const billFilter = { ...orgFilter };
  const journalFilter = { ...orgFilter };
  const paymentFilter = orgArg
    ? { organization_id: new Types.ObjectId(orgArg) }
    : {};

  const invoiceStats = await backfillInvoices(invoiceFilter, dryRun);
  const billStats = await backfillBills(billFilter, dryRun);
  const journalStats = await backfillJournals(journalFilter, dryRun);
  const paymentReceivedStats = await backfillPaymentReceived(paymentFilter, dryRun);
  const paymentMadeStats = await backfillPaymentMade(paymentFilter, dryRun);

  printStats("Invoices", invoiceStats);
  printStats("Bills", billStats);
  printStats("Journals", journalStats);
  printStats("Payments Received", paymentReceivedStats);
  printStats("Payments Made", paymentMadeStats);

  const totalErrors =
    invoiceStats.errors +
    billStats.errors +
    journalStats.errors +
    paymentReceivedStats.errors +
    paymentMadeStats.errors;

  await mongoose.disconnect();
  console.log("\nBackfill run complete.");

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

run().catch(async (error) => {
  console.error("Backfill failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
