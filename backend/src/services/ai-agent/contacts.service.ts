import Contact from "../../models/contact.model";
import Invoice from "../../models/invoice.model";
import Bill from "../../models/bill.model";
import { Types } from "mongoose";

export async function listCustomers(organizationId: any, limit = 100) {
  return Contact.find({
    organizationId,
    contactType: { $in: ["Customer", "Both"] },
    isDeleted: false,
  })
    .sort({ displayName: 1 })
    .limit(limit)
    .lean();
}

export async function listVendors(organizationId: any, limit = 100) {
  return Contact.find({
    organizationId,
    contactType: { $in: ["Vendor", "Both"] },
    isDeleted: false,
  })
    .sort({ displayName: 1 })
    .limit(limit)
    .lean();
}

export async function getContactById(organizationId: any, id: any) {
  return Contact.findOne({ _id: id, organizationId, isDeleted: false }).lean();
}

export async function searchContacts(organizationId: any, query: string, type?: "Customer" | "Vendor") {
  const cleanQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const filter: any = {
    organizationId,
    isDeleted: false,
    $or: [
      { displayName: { $regex: cleanQuery, $options: "i" } },
      { companyName: { $regex: cleanQuery, $options: "i" } },
    ],
  };

  if (type) {
    filter.contactType = { $in: [type, "Both"] };
  }

  return Contact.find(filter).limit(10).lean();
}

export async function createContact(organizationId: any, data: any) {
  return Contact.create({
    organizationId,
    contactType: data.contactType || "Customer",
    displayName: data.displayName,
    companyName: data.companyName || "",
    email: data.email || "",
    phone: data.phone || "",
    mobile: data.mobile || "",
    taxTreatment: data.taxTreatment || data.gstTreatment || "Consumer",
    gstin: data.gstin ? String(data.gstin).trim().toUpperCase() : "",
    pan: data.pan ? String(data.pan).trim().toUpperCase() : "",
    billingAddress: data.billingAddress || null,
    shippingAddress: data.shippingAddress || null,
    isActive: true,
  });
}

export async function updateContact(organizationId: any, id: any, data: any) {
  const updates: any = {};
  if (data.contactType !== undefined) updates.contactType = data.contactType;
  if (data.displayName !== undefined) updates.displayName = data.displayName;
  if (data.companyName !== undefined) updates.companyName = data.companyName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.mobile !== undefined) updates.mobile = data.mobile;
  if (data.gstTreatment !== undefined) updates.gstTreatment = data.gstTreatment;
  if (data.gstin !== undefined) updates.gstin = String(data.gstin).trim().toUpperCase();
  if (data.pan !== undefined) updates.pan = String(data.pan).trim().toUpperCase();
  if (data.billingAddress !== undefined) updates.billingAddress = data.billingAddress;
  if (data.shippingAddress !== undefined) updates.shippingAddress = data.shippingAddress;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  return Contact.findOneAndUpdate(
    { _id: id, organizationId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

export async function getContactBalance(organizationId: any, contactId: any): Promise<{ receivables: number; payables: number }> {
  const invoices = await Invoice.find({
    organizationId,
    customerId: new Types.ObjectId(contactId),
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).select("balanceDue").lean();

  const bills = await Bill.find({
    organizationId,
    vendorId: new Types.ObjectId(contactId),
    isDeleted: false,
    balanceDue: { $gt: 0 },
  }).select("balanceDue").lean();

  const receivables = invoices.reduce((acc, curr) => acc + (curr.balanceDue || 0), 0);
  const payables = bills.reduce((acc, curr) => acc + (curr.balanceDue || 0), 0);

  return { receivables, payables };
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export function verifyGSTIN(gstin: string) {
  const upper = gstin.trim().toUpperCase();
  if (!GSTIN_REGEX.test(upper)) {
    return { isValid: false, message: "Invalid GSTIN format." };
  }
  return {
    isValid: true,
    gstin: upper,
    pan: upper.substring(2, 12),
    stateCode: upper.substring(0, 2),
    legalName: "Valid Taxpayer Checked",
  };
}

export function getContactFormSchema() {
  return {
    type: "object",
    properties: {
      displayName: { type: "string", description: "Display name or main contact reference", required: true },
      companyName: { type: "string", description: "Legal entity or company name" },
      contactType: { type: "string", enum: ["Customer", "Vendor", "Both"], default: "Customer", required: true },
      email: { type: "string", description: "Primary email address" },
      phone: { type: "string", description: "Landline phone number" },
      mobile: { type: "string", description: "Mobile phone number" },
      gstTreatment: { type: "string", enum: ["registered_business", "unregistered_business", "consumer", "overseas"], default: "consumer" },
      gstin: { type: "string", description: "15-digit GST identification number" },
      pan: { type: "string", description: "10-digit Permanent Account Number" },
    },
  };
}
