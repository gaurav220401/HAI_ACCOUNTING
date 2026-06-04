import { Types } from "mongoose";
import Invoice from "../models/invoice.model";
import RecurringInvoice from "../models/recurring-invoice.model";
import Item from "../models/item.model";
import PaymentTerms from "../models/payment-terms.model";
import Organization from "../models/organization.model";
import Contact from "../models/contact.model";
import {
  IInvoiceItem,
  IRecurringInvoice,
  RecurringInvoiceActivityType,
  RecurringInvoiceFrequency,
} from "../types";
import { sendInvoiceEmail } from "./email.service";
import { generateInvoicePdf } from "./invoice-pdf.service";
import { applyItemTaxLinkageToItems } from "./item-tax-linkage.service";
import {
  multiplyMoney,
  percentMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
} from "../utils/money";

const SCHEDULER_INTERVAL_MS = 60_000;

let schedulerStarted = false;
let processingDueProfiles = false;

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function refId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "object") {
    const maybe = value as {
      _id?: unknown;
      id?: unknown;
      toString?: () => string;
    };
    if (maybe._id) return refId(maybe._id);
    if (maybe.id) return refId(maybe.id);
    if (typeof maybe.toString === "function") {
      const rendered = maybe.toString();
      if (rendered && rendered !== "[object Object]") return rendered;
    }
  }
  return "";
}

function resolveInvoiceItemName(item: Partial<IInvoiceItem> & Record<string, any>): string {
  return (
    textValue(item.name) ||
    textValue(item.itemName) ||
    textValue(item.label) ||
    textValue(item.item?.name) ||
    textValue((item.itemId as any)?.name) ||
    ""
  );
}

function startOfDay(value: Date | string): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number): Date {
  const next = startOfDay(value);
  next.setDate(next.getDate() + days);
  return next;
}

function endOfMonth(value: Date): Date {
  const next = startOfDay(value);
  next.setMonth(next.getMonth() + 1, 0);
  return next;
}

function addMonthsClamped(
  value: Date,
  months: number,
  preferredDay: number,
): Date {
  const next = startOfDay(value);
  const targetMonth = next.getMonth() + months;
  const targetYear = next.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(preferredDay, lastDay));
}

export function calculateNextRunDate(
  fromDate: Date,
  frequency: RecurringInvoiceFrequency,
  anchorDate: Date = fromDate,
): Date {
  const base = startOfDay(fromDate);
  switch (frequency) {
    case "weekly":
      return addDays(base, 7);
    case "every_10_days":
      return addDays(base, 10);
    case "every_15_days":
      return addDays(base, 15);
    case "monthly":
      return addMonthsClamped(base, 1, startOfDay(anchorDate).getDate());
    default:
      return addDays(base, 7);
  }
}

export function alignRecurringNextRunDate(
  startDate: Date | string,
  frequency: RecurringInvoiceFrequency,
  referenceDate: Date = new Date(),
): Date {
  let next = startOfDay(startDate);
  const reference = startOfDay(referenceDate);
  let safety = 0;

  while (next < reference && safety < 400) {
    next = calculateNextRunDate(next, frequency, startOfDay(startDate));
    safety += 1;
  }

  return next;
}

export function normalizeInvoiceItems(items: Partial<IInvoiceItem>[] = []) {
  return items.map((item, index) => {
    const quantity = Number(item.quantity) || 1;
    const rate = roundMoney(Number(item.rate) || 0);
    const lineTotal = multiplyMoney(quantity, rate);
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount =
      item.discountAmount !== undefined && item.discountAmount !== null ?
        roundMoney(Number(item.discountAmount))
      : percentMoney(lineTotal, discountPercent);
    const afterDiscount = Math.max(0, subtractMoney(lineTotal, discountAmount));
    const taxPercent = Number(item.taxPercent) || 0;
    const taxAmount =
      item.taxAmount !== undefined && item.taxAmount !== null ?
        roundMoney(Number(item.taxAmount))
      : percentMoney(afterDiscount, taxPercent);

    return {
      itemId: item.itemId || null,
      name: resolveInvoiceItemName(item as Partial<IInvoiceItem> & Record<string, any>) || `Line Item ${index + 1}`,
      description: item.description || "",
      hsnSacCode: item.hsnSacCode || "",
      quantity,
      rate,
      discountPercent,
      discountAmount,
      taxId: item.taxId || null,
      taxPercent,
      taxAmount,
      amount: sumMoney([afterDiscount, taxAmount]),
      accountId: item.accountId || null,
      projectId: item.projectId || null,
    };
  });
}

export async function hydrateMissingInvoiceItemNames(
  organizationId: Types.ObjectId | string,
  items: Partial<IInvoiceItem>[] = [],
): Promise<Partial<IInvoiceItem>[]> {
  if (!Array.isArray(items) || items.length === 0) return [];

  const hydrated = items.map((item) => ({ ...(item as Record<string, unknown>) }));
  const itemIdsToResolve = Array.from(
    new Set(
      hydrated
        .filter(
          (item) =>
            !resolveInvoiceItemName(item as Partial<IInvoiceItem> & Record<string, any>),
        )
        .map((item) => refId((item as any).itemId))
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  );

  const nameByItemId = new Map<string, string>();
  if (itemIdsToResolve.length > 0) {
    const itemDocs = await Item.find({
      organizationId,
      _id: { $in: itemIdsToResolve },
      isDeleted: { $ne: true },
    })
      .select("name")
      .lean();

    for (const itemDoc of itemDocs) {
      const id = refId((itemDoc as any)._id);
      const name = textValue((itemDoc as any).name);
      if (id && name) {
        nameByItemId.set(id, name);
      }
    }
  }

  return hydrated.map((item, index) => {
    const existingName = resolveInvoiceItemName(
      item as Partial<IInvoiceItem> & Record<string, any>,
    );
    if (existingName) {
      return {
        ...item,
        name: existingName,
      };
    }

    const fallbackFromItem = nameByItemId.get(refId((item as any).itemId)) || "";
    return {
      ...item,
      name: fallbackFromItem || `Line Item ${index + 1}`,
    };
  }) as Partial<IInvoiceItem>[];
}

export function summarizeInvoiceTotals(
  items: Array<{ quantity: number; rate: number }>,
  discountType: string,
  discountValue: number,
  taxType: string,
  taxAmount: number,
  adjustmentAmount: number,
) {
  const subTotal = sumMoney(items.map((item) => multiplyMoney(item.quantity, item.rate)));
  const discountAmount =
    discountType === "percent" ?
      percentMoney(subTotal, discountValue)
    : roundMoney(discountValue);
  const normalizedTaxAmount = roundMoney(Number(taxAmount) || 0);
  const taxImpact =
    taxType === "TCS" ? normalizedTaxAmount
    : taxType === "TDS" ? -normalizedTaxAmount
    : 0;
  const total = sumMoney([subTotal, -discountAmount, taxImpact, adjustmentAmount]);

  return {
    subTotal,
    discountAmount,
    total,
  };
}

async function nextInvoiceNumber(
  organizationId: string | Types.ObjectId,
): Promise<string> {
  const last = await Invoice.findOne({ organizationId })
    .sort({ invoiceNumber: -1 })
    .select("invoiceNumber")
    .lean();

  if (!last) return "INV-000001";

  const match = last.invoiceNumber.match(/INV-(\d+)/);
  if (!match) return "INV-000001";
  const next = parseInt(match[1], 10) + 1;
  return `INV-${String(next).padStart(6, "0")}`;
}

async function resolveDueDate(
  invoiceDate: Date,
  paymentTermsId?: Types.ObjectId | null,
): Promise<Date | null> {
  if (!paymentTermsId) {
    return startOfDay(invoiceDate);
  }

  const terms = await PaymentTerms.findById(paymentTermsId).lean();
  if (!terms) {
    return startOfDay(invoiceDate);
  }

  if (terms.termType === "end_of_month") {
    return endOfMonth(invoiceDate);
  }

  if (terms.termType === "end_of_next_month") {
    return endOfMonth(
      addMonthsClamped(invoiceDate, 1, startOfDay(invoiceDate).getDate()),
    );
  }

  return addDays(invoiceDate, terms.netDays || 0);
}

function uniqueEmails(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function appendActivity(
  profile: IRecurringInvoice,
  type: RecurringInvoiceActivityType,
  message: string,
  invoiceId?: Types.ObjectId | null,
) {
  const activities =
    Array.isArray(profile.recentActivities) ?
      [...profile.recentActivities]
    : [];

  activities.push({
    type,
    message,
    invoiceId: invoiceId || null,
    createdAt: new Date(),
  } as any);

  profile.recentActivities = activities.slice(-50) as any;
}

async function tryAutoSendRecurringInvoice(
  profile: IRecurringInvoice,
  invoice: any,
): Promise<{ sent: boolean; failureMessage?: string }> {
  try {
    const [organization, customer, paymentTerms] = await Promise.all([
      Organization.findById(profile.organizationId).lean(),
      Contact.findById(profile.customerId).lean(),
      profile.paymentTermsId ?
        PaymentTerms.findById(profile.paymentTermsId).lean()
      : null,
    ]);

    const recipients = uniqueEmails([
      ...(profile.emailContacts || []),
      customer?.email,
    ]);

    if (!organization) {
      return {
        sent: false,
        failureMessage: "Organization not found for auto-send.",
      };
    }

    if (recipients.length === 0) {
      return {
        sent: false,
        failureMessage:
          "No email recipients available, invoice was created as a draft.",
      };
    }

    if (
      !organization.smtpSettings?.host ||
      !organization.smtpSettings?.user ||
      !organization.smtpSettings?.pass
    ) {
      return {
        sent: false,
        failureMessage:
          "SMTP is not configured, invoice was created as a draft.",
      };
    }

    const customerAddress = [
      customer?.billingAddress?.street,
      customer?.billingAddress?.city,
      customer?.billingAddress?.state,
      customer?.billingAddress?.country,
    ]
      .filter(Boolean)
      .join(", ");

    const pdfBuffer = await generateInvoicePdf({
      orgName: organization.name,
      orgAddress: organization.address as any,
      orgEmail:
        organization.smtpSettings?.fromEmail ||
        organization.smtpSettings?.user ||
        undefined,
      orgTaxId: organization.taxId,
      orgLogoUrl: (organization as any).logo,
      orgPhone: (organization as any).phone,
      templateConfig: (invoice as any).templateConfig || {},
      customerName:
        customer?.displayName || customer?.companyName || "Customer",
      customerAddress: customerAddress || undefined,
      customerEmail: customer?.email,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : undefined,
      paymentTerms: paymentTerms?.name || undefined,
      orderNumber: invoice.orderNumber,
      subject: invoice.subject,
      items: (invoice.items || []).map((item: any) => ({
        name: item.name,
        description: item.description,
        hsnSacCode: item.hsnSacCode,
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        discountAmount: item.discountAmount,
        taxPercent: item.taxPercent,
        taxAmount: item.taxAmount,
        amount: item.amount,
      })),
      subTotal: invoice.subTotal ?? 0,
      discountType: invoice.discountType,
      discountValue: invoice.discountValue,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      adjustmentLabel: invoice.adjustmentLabel,
      adjustmentAmount: invoice.adjustmentAmount,
      total: invoice.total,
      balanceDue: invoice.balanceDue,
      customerNotes: invoice.customerNotes,
      termsAndConditions: invoice.termsAndConditions,
      currencySymbol:
        organization.baseCurrency === "INR" ? "₹" : organization.baseCurrency,
    });

    await sendInvoiceEmail({
      organizationId: profile.organizationId.toString(),
      to: recipients,
      subject: profile.subject || `Invoice ${invoice.invoiceNumber}`,
      body: "",
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: invoice.total,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : undefined,
      customerName:
        customer?.displayName || customer?.companyName || "Customer",
      attachments: [
        {
          filename: `Invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return { sent: true };
  } catch (error: any) {
    return {
      sent: false,
      failureMessage:
        error?.message ||
        "Auto-send failed and invoice was created as a draft.",
    };
  }
}

function shouldCompleteProfile(
  profile: IRecurringInvoice,
  candidateDate: Date,
): boolean {
  return Boolean(
    !profile.neverExpires &&
    profile.endDate &&
    startOfDay(candidateDate) > startOfDay(profile.endDate),
  );
}

export async function generateInvoiceFromRecurringProfile(
  profile: IRecurringInvoice,
  options?: {
    runDate?: Date;
    triggeredByUserId?: Types.ObjectId | null;
    advanceSchedule?: boolean;
    manual?: boolean;
  },
) {
  const runDate = startOfDay(
    options?.runDate || profile.nextRunDate || new Date(),
  );
  const invoiceNumber = await nextInvoiceNumber(profile.organizationId);
  const linkedItems = await applyItemTaxLinkageToItems({
    organizationId: profile.organizationId,
    contactId: profile.customerId,
    items: profile.items as any[],
  });
  const hydratedItems = await hydrateMissingInvoiceItemNames(
    profile.organizationId,
    linkedItems as Partial<IInvoiceItem>[],
  );
  const items = normalizeInvoiceItems(hydratedItems as Partial<IInvoiceItem>[]);
  const taxAmount = Number(profile.taxAmount) || 0;
  const adjustmentAmount = Number(profile.adjustmentAmount) || 0;
  const discountValue = Number(profile.discountValue) || 0;
  const { subTotal, discountAmount, total } = summarizeInvoiceTotals(
    items,
    profile.discountType,
    discountValue,
    profile.taxType || "none",
    taxAmount,
    adjustmentAmount,
  );
  const dueDate = await resolveDueDate(runDate, profile.paymentTermsId || null);

  const invoice = new Invoice({
    organizationId: profile.organizationId,
    invoiceNumber,
    referenceNumber: profile.referenceNumber || "",
    orderNumber: profile.orderNumber || "",
    customerId: profile.customerId,
    invoiceDate: runDate,
    dueDate,
    paymentTermsId: profile.paymentTermsId || null,
    salesPersonId: profile.salesPersonId || null,
    subject: profile.subject || "",
    items,
    subTotal,
    discountType: profile.discountType,
    discountValue,
    discountAmount,
    taxType: profile.taxType || "none",
    taxId: profile.taxId || null,
    taxAmount,
    adjustmentLabel: profile.adjustmentLabel || "Adjustment",
    adjustmentAmount,
    total,
    balanceDue: total,
    customerNotes: profile.customerNotes || "",
    termsAndConditions: profile.termsAndConditions || "",
    status: "Draft",
    emailContacts: profile.emailContacts || [],
    attachments: [],
    paymentReceived: false,
    isRecurring: true,
    recurringProfileId: profile._id,
    autoGenerated: true,
    journalEntries: [],
    pdfTemplateId: null,
    createdBy:
      options?.triggeredByUserId || profile.updatedBy || profile.createdBy,
    updatedBy:
      options?.triggeredByUserId || profile.updatedBy || profile.createdBy,
  });

  await invoice.save();

  let autoSendFailureMessage: string | undefined;
  if (profile.deliveryMode === "send") {
    const result = await tryAutoSendRecurringInvoice(profile, invoice);
    if (result.sent) {
      invoice.status = "Sent";
      invoice.sentAt = new Date();
      await invoice.save();
    } else {
      autoSendFailureMessage = result.failureMessage;
    }
  }

  profile.lastRunDate = runDate;
  profile.lastGeneratedInvoiceId = invoice._id;
  profile.generatedInvoiceCount = (profile.generatedInvoiceCount || 0) + 1;
  appendActivity(
    profile,
    "invoice_generated",
    `${options?.manual ? "Manual" : "Scheduled"} invoice ${invoice.invoiceNumber} created as ${invoice.status}.`,
    invoice._id,
  );

  if (autoSendFailureMessage) {
    appendActivity(
      profile,
      "auto_send_failed",
      autoSendFailureMessage,
      invoice._id,
    );
  }

  if (options?.advanceSchedule !== false) {
    const candidateNextRun = calculateNextRunDate(
      runDate,
      profile.frequency,
      profile.startDate,
    );
    profile.nextRunDate = candidateNextRun;

    if (shouldCompleteProfile(profile, candidateNextRun)) {
      profile.status = "completed";
      appendActivity(
        profile,
        "completed",
        "Recurring profile completed after reaching its end date.",
      );
    }
  }

  await profile.save();

  return { invoice, profile };
}

export async function processDueRecurringInvoices(): Promise<void> {
  if (processingDueProfiles) return;

  processingDueProfiles = true;
  try {
    const dueProfiles = await RecurringInvoice.find({
      status: "active",
      nextRunDate: { $lte: new Date() },
      isDeleted: false,
    })
      .sort({ nextRunDate: 1 })
      .limit(25);

    const today = startOfDay(new Date());

    for (const profile of dueProfiles) {
      try {
        let cycles = 0;

        while (
          profile.status === "active" &&
          startOfDay(profile.nextRunDate) <= today &&
          cycles < 24
        ) {
          if (shouldCompleteProfile(profile, profile.nextRunDate)) {
            profile.status = "completed";
            appendActivity(
              profile,
              "completed",
              "Recurring profile completed after reaching its end date.",
            );
            await profile.save();
            break;
          }

          await generateInvoiceFromRecurringProfile(profile, {
            runDate: profile.nextRunDate,
            advanceSchedule: true,
          });
          cycles += 1;
        }
      } catch (profileError) {
        console.error(
          `Recurring profile ${profile._id} failed, skipping to next:`,
          profileError,
        );
      }
    }
  } catch (error) {
    console.error("Recurring invoice scheduler failed:", error);
  } finally {
    processingDueProfiles = false;
  }
}

export function startRecurringInvoiceScheduler(): void {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;

  schedulerStarted = true;
  console.log("Recurring invoice scheduler started");

  void processDueRecurringInvoices();
  setInterval(() => {
    void processDueRecurringInvoices();
  }, SCHEDULER_INTERVAL_MS);
}
