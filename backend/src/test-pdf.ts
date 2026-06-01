import dotenv from "dotenv";
import mongoose from "mongoose";
import "./models/contact.model";
import "./models/user.model";
import "./models/sales-person.model";
import Quote from "./models/quote.model";
import Organization from "./models/organization.model";
import { generateQuotePdf } from "./services/quote-pdf.service";

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const quoteId = "6a1689951b3427b2f382fd29";
  const quote = await Quote.findById(quoteId).populate("customerId").populate("salesPersonId").lean();
  if (!quote) {
    console.error("Quote not found:", quoteId);
    process.exit(1);
  }

  const oid = quote.organizationId || (quote as any).orgId;
  const org = await Organization.findById(oid).lean();
  if (!org) {
    console.error("Organization not found for quote");
    process.exit(1);
  }

  const customer = quote.customerId as any;
  const customerName = (customer?.displayName || customer?.companyName) || "Customer";

  console.log("Running generateQuotePdf for quote:", quote.quoteNumber);
  try {
    const buffer = await generateQuotePdf({
      orgName: org.name,
      orgAddress: org.address as any,
      orgEmail: org.smtpSettings?.fromEmail || org.smtpSettings?.user || undefined,
      orgTaxId: org.taxId,
      orgLogoUrl: (org as any).logo,
      orgPhone: (org as any)?.phone || (org as any)?.address?.phone,
      templateConfig: (quote as any).templateConfig,

      customerName,
      customerAddress: [
        customer?.billingAddress?.street,
        customer?.billingAddress?.city,
        customer?.billingAddress?.state,
        customer?.billingAddress?.zip,
        customer?.billingAddress?.country,
      ].filter(Boolean).join(", "),
      customerEmail: customer?.email,

      quoteNumber: quote.quoteNumber,
      quoteDate: quote.quoteDate.toISOString(),
      expiryDate: quote.expiryDate ? quote.expiryDate.toISOString() : undefined,
      salesPersonName: (quote.salesPersonId as any)?.name,
      subject: quote.subject,
      items: quote.items as any,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      taxAmount: quote.taxAmount,
      subTotal: quote.subTotal,
      adjustmentLabel: quote.adjustmentLabel,
      adjustmentAmount: quote.adjustmentAmount,
      total: quote.total,
      termsAndConditions: quote.termsAndConditions,
      customerNotes: quote.customerNotes,
    });
    console.log("SUCCESS! PDF Buffer generated. Length:", buffer.length);
  } catch (err: any) {
    console.error("FAILED WITH ERROR:", err.message);
    console.error(err.stack);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(console.error);
