import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Organization from "../../models/organization.model";
import Account from "../../models/account.model";
import PaymentTerms from "../../models/payment-terms.model";
import SalesPerson from "../../models/sales-person.model";
import Contact from "../../models/contact.model";
import { mapRowToContact } from "../../controllers/contact.controller";

let replSet: MongoMemoryReplSet;

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  await mongoose.connect(replSet.getUri(), {
    dbName: "integration-tests-import",
  });
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

test("mapRowToContact maps and resolves all form fields including bank, contact person, and entity names", async () => {
  const org = await Organization.create({ name: "Import Test Org" });
  const orgId = org._id;

  // Seed reference entities
  const receivableAccount = await Account.create({
    organizationId: orgId,
    name: "Trade Receivables Test",
    rootType: "Asset",
    accountType: "Accounts Receivable",
  });

  const payableAccount = await Account.create({
    organizationId: orgId,
    name: "Trade Payables Test",
    rootType: "Liability",
    accountType: "Accounts Payable",
  });

  const term = await PaymentTerms.create({
    organizationId: orgId,
    name: "Net 30 Days Test",
    termType: "net_days",
    netDays: 30,
  });

  const salesperson = await SalesPerson.create({
    organizationId: orgId,
    name: "Sales Agent Test",
  });

  // Sample CSV row data mapping input
  const row = {
    "Display Name": "MegaCorp Industries",
    "Company Name": "MegaCorp Inc",
    "Email": "contact@megacorp.com",
    "Phone": "1234567890",
    "Mobile": "9876543210",
    "PAN": "ABCDE1234F",
    "GSTIN": "27ABCDE1234F1Z5",
    "GST Treatment": "Registered Business - Regular",
    "Currency": "INR",
    "Opening Balance": "1500.50",
    "Billing Attention": "Billing Dept",
    "Billing Street": "123 Business Rd",
    "Billing Street 2": "Suite 500",
    "Billing City": "Mumbai",
    "Billing State": "Maharashtra",
    "Billing Zip": "400001",
    "Billing Country": "India",
    "Billing Phone": "1112223333",
    "Billing Fax": "4445556666",
    "Shipping Attention": "Shipping Dept",
    "Shipping Street": "456 Logistics Way",
    "Shipping Street 2": "Dock 4",
    "Shipping City": "Pune",
    "Shipping State": "Maharashtra",
    "Shipping Zip": "411001",
    "Shipping Country": "India",
    "Shipping Phone": "7778889999",
    "Shipping Fax": "2223334444",
    "Salutation": "Mr.",
    "First Name": "Arthur",
    "Last Name": "Dent",
    "Language": "English",
    "Place of Supply": "Maharashtra",
    "Business Legal Name": "MegaCorp Industries Private Limited",
    "Business Trade Name": "MegaCorp Trade",
    "Tax Preference": "Taxable",
    "Exemption Reason": "",
    "Credit Limit": "100000",
    "Portal Enabled": "Yes",
    "Notes": "Primary wholesale supplier",
    "Contact Person Salutation": "Dr.",
    "Contact Person First Name": "Ford",
    "Contact Person Last Name": "Prefect",
    "Contact Person Email": "ford@megacorp.com",
    "Contact Person Phone": "5556667777",
    "Contact Person Mobile": "8889990000",
    "Accounts Receivable Account": "Trade Receivables Test",
    "Accounts Payable Account": "Trade Payables Test",
    "Payment Terms": "Net 30 Days Test",
    "Sales Person": "Sales Agent Test",
    "MSME Registered": "Yes",
    "TDS Category": "Professional Fees",
    "Website URL": "https://megacorp.com",
    "Department": "IT",
    "Designation": "Architect",
    "Twitter Handle": "@megacorp",
    "Skype Name": "megacorp.skype",
    "Facebook URL": "https://facebook.com/megacorp",
    "Bank Name": "HDFC Bank",
    "Account Number": "50200012345678",
    "Account Holder Name": "MegaCorp Inc",
    "IFSC Code": "HDFC0000123",
    "Branch Name": "Mumbai Branch",
    "UPI ID": "megacorp@upi",
  };

  const mapping = {
    displayName: "Display Name",
    companyName: "Company Name",
    email: "Email",
    phone: "Phone",
    mobile: "Mobile",
    pan: "PAN",
    gstin: "GSTIN",
    taxTreatment: "GST Treatment",
    currency: "Currency",
    openingBalance: "Opening Balance",
    billingAttention: "Billing Attention",
    billingStreet: "Billing Street",
    billingStreet2: "Billing Street 2",
    billingCity: "Billing City",
    billingState: "Billing State",
    billingZip: "Billing Zip",
    billingCountry: "Billing Country",
    billingPhone: "Billing Phone",
    billingFax: "Billing Fax",
    shippingAttention: "Shipping Attention",
    shippingStreet: "Shipping Street",
    shippingStreet2: "Shipping Street 2",
    shippingCity: "Shipping City",
    shippingState: "Shipping State",
    shippingZip: "Shipping Zip",
    shippingCountry: "Shipping Country",
    shippingPhone: "Shipping Phone",
    shippingFax: "Shipping Fax",
    salutation: "Salutation",
    firstName: "First Name",
    lastName: "Last Name",
    language: "Language",
    placeOfSupply: "Place of Supply",
    businessLegalName: "Business Legal Name",
    businessTradeName: "Business Trade Name",
    taxPreference: "Tax Preference",
    exemptionReason: "Exemption Reason",
    creditLimit: "Credit Limit",
    salesPerson: "Sales Person",
    paymentTerms: "Payment Terms",
    portalEnabled: "Portal Enabled",
    notes: "Notes",
    contactPersonSalutation: "Contact Person Salutation",
    contactPersonFirstName: "Contact Person First Name",
    contactPersonLastName: "Contact Person Last Name",
    contactPersonEmail: "Contact Person Email",
    contactPersonPhone: "Contact Person Phone",
    contactPersonMobile: "Contact Person Mobile",
    accountsReceivableAccount: "Accounts Receivable Account",
    accountsPayableAccount: "Accounts Payable Account",
    msmeRegistered: "MSME Registered",
    tdsCategory: "TDS Category",
    websiteUrl: "Website URL",
    department: "Department",
    designation: "Designation",
    twitterHandle: "Twitter Handle",
    skypeName: "Skype Name",
    facebookUrl: "Facebook URL",
    bankName: "Bank Name",
    bankAccountNumber: "Account Number",
    bankAccountHolderName: "Account Holder Name",
    bankIfscCode: "IFSC Code",
    bankBranchName: "Branch Name",
    bankUpiId: "UPI ID",
  };

  const result = await mapRowToContact(row, mapping, orgId, "skip", "Customer");

  assert.equal(result.isValid, true);
  assert.equal(result.status, "Ready");

  const data = result.contactData;

  // Verify core fields
  assert.equal(data.displayName, "MegaCorp Industries");
  assert.equal(data.companyName, "MegaCorp Inc");
  assert.equal(data.email, "contact@megacorp.com");
  assert.equal(data.phone, "1234567890");
  assert.equal(data.mobile, "9876543210");
  assert.equal(data.pan, "ABCDE1234F");
  assert.equal(data.gstin, "27ABCDE1234F1Z5");
  assert.equal(data.taxTreatment, "Registered Business - Regular");
  assert.equal(data.currency, "INR");
  assert.equal(data.openingBalance, 1500.50);
  assert.equal(data.salutation, "Mr.");
  assert.equal(data.firstName, "Arthur");
  assert.equal(data.lastName, "Dent");
  assert.equal(data.language, "en");
  assert.equal(data.placeOfSupply, "MH");
  assert.equal(data.businessLegalName, "MegaCorp Industries Private Limited");
  assert.equal(data.businessTradeName, "MegaCorp Trade");
  assert.equal(data.taxPreference, "Taxable");
  assert.equal(data.creditLimit, 100000);
  assert.equal(data.portalEnabled, true);
  assert.equal(data.notes, "Primary wholesale supplier");
  assert.equal(data.msmeRegistered, true);
  assert.equal(data.tdsCategory, "prof-10");
  assert.equal(data.websiteUrl, "https://megacorp.com");
  assert.equal(data.department, "IT");
  assert.equal(data.designation, "Architect");
  assert.equal(data.twitterHandle, "@megacorp");
  assert.equal(data.skypeName, "megacorp.skype");
  assert.equal(data.facebookUrl, "https://facebook.com/megacorp");

  // Verify relation resolutions
  assert.equal(String(data.accountsReceivableId), String(receivableAccount._id));
  assert.equal(String(data.accountsPayableId), String(payableAccount._id));
  assert.equal(String(data.paymentTermsId), String(term._id));
  assert.equal(String(data.salesPersonId), String(salesperson._id));

  // Verify Billing Address
  assert.equal(data.billingAddress.attention, "Billing Dept");
  assert.equal(data.billingAddress.street, "123 Business Rd");
  assert.equal(data.billingAddress.street2, "Suite 500");
  assert.equal(data.billingAddress.city, "Mumbai");
  assert.equal(data.billingAddress.state, "Maharashtra");
  assert.equal(data.billingAddress.zip, "400001");
  assert.equal(data.billingAddress.country, "India");
  assert.equal(data.billingAddress.phone, "1112223333");
  assert.equal(data.billingAddress.fax, "4445556666");

  // Verify Shipping Address
  assert.equal(data.shippingAddress.attention, "Shipping Dept");
  assert.equal(data.shippingAddress.street, "456 Logistics Way");
  assert.equal(data.shippingAddress.street2, "Dock 4");
  assert.equal(data.shippingAddress.city, "Pune");
  assert.equal(data.shippingAddress.state, "Maharashtra");
  assert.equal(data.shippingAddress.zip, "411001");
  assert.equal(data.shippingAddress.country, "India");
  assert.equal(data.shippingAddress.phone, "7778889999");
  assert.equal(data.shippingAddress.fax, "2223334444");

  // Verify Contact Person
  assert.equal(data.contactPersons.length, 1);
  assert.equal(data.contactPersons[0].salutation, "Dr.");
  assert.equal(data.contactPersons[0].firstName, "Ford");
  assert.equal(data.contactPersons[0].lastName, "Prefect");
  assert.equal(data.contactPersons[0].name, "Ford Prefect");
  assert.equal(data.contactPersons[0].email, "ford@megacorp.com");
  assert.equal(data.contactPersons[0].workPhone, "5556667777");
  assert.equal(data.contactPersons[0].mobile, "8889990000");
  assert.equal(data.contactPersons[0].isPrimary, true);

  // Verify Bank Details
  assert.equal(data.bankDetails.length, 1);
  assert.equal(data.bankDetails[0].bankName, "HDFC Bank");
  assert.equal(data.bankDetails[0].accountNumber, "50200012345678");
  assert.equal(data.bankDetails[0].accountHolderName, "MegaCorp Inc");
  assert.equal(data.bankDetails[0].ifscCode, "HDFC0000123");
  assert.equal(data.bankDetails[0].branchName, "Mumbai Branch");
  assert.equal(data.bankDetails[0].upiId, "megacorp@upi");
  assert.equal(data.bankDetails[0].isPrimary, true);
});
