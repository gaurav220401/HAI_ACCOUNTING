import mongoose from "mongoose";
import Contact from "../../models/contact.model";

export async function searchContactsTool(
  organizationId: string,
  args: { query?: string; contactType?: "Customer" | "Vendor" | "Both" }
) {
  const filter: any = { organizationId, isDeleted: false };
  if (args.contactType) {
    filter.contactType = { $in: [args.contactType, "Both"] };
  }
  if (args.query) {
    filter.$or = [
      { displayName: { $regex: args.query, $options: "i" } },
      { companyName: { $regex: args.query, $options: "i" } },
      { email: { $regex: args.query, $options: "i" } },
      { gstin: { $regex: args.query, $options: "i" } },
    ];
  }

  const contacts = await Contact.find(filter)
    .limit(10)
    .select("displayName companyName email phone gstin contactType outstandingReceivable outstandingPayable")
    .lean();

  return {
    count: contacts.length,
    contacts,
  };
}

export async function createCustomerTool(
  organizationId: string,
  args: {
    displayName: string;
    companyName?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    placeOfSupply?: string;
    currency?: string;
  }
) {
  if (!args.displayName) {
    throw new Error("Display Name is required to create a customer.");
  }

  const existing = await Contact.findOne({
    organizationId,
    displayName: new RegExp(`^${args.displayName.trim()}$`, "i"),
    isDeleted: false,
  });

  if (existing) {
    return {
      alreadyExists: true,
      contactId: existing._id,
      displayName: existing.displayName,
      message: `Customer "${existing.displayName}" already exists.`,
    };
  }

  const newContact = await Contact.create({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    contactType: "Customer",
    displayName: args.displayName.trim(),
    companyName: args.companyName || "",
    email: args.email || "",
    phone: args.phone || "",
    gstin: args.gstin ? args.gstin.trim().toUpperCase() : "",
    placeOfSupply: args.placeOfSupply || "",
    currency: args.currency || "INR",
    taxTreatment: args.gstin ? "Registered Business - Regular" : "Unregistered Business",
  });

  return {
    success: true,
    contactId: newContact._id,
    displayName: newContact.displayName,
    email: newContact.email,
    gstin: newContact.gstin,
    message: `Customer "${newContact.displayName}" created successfully.`,
  };
}

export async function createVendorTool(
  organizationId: string,
  args: {
    displayName: string;
    companyName?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    currency?: string;
  }
) {
  if (!args.displayName) {
    throw new Error("Display Name is required to create a vendor.");
  }

  const existing = await Contact.findOne({
    organizationId,
    displayName: new RegExp(`^${args.displayName.trim()}$`, "i"),
    isDeleted: false,
  });

  if (existing) {
    return {
      alreadyExists: true,
      contactId: existing._id,
      displayName: existing.displayName,
      message: `Vendor "${existing.displayName}" already exists.`,
    };
  }

  const newContact = await Contact.create({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    contactType: "Vendor",
    displayName: args.displayName.trim(),
    companyName: args.companyName || "",
    email: args.email || "",
    phone: args.phone || "",
    gstin: args.gstin ? args.gstin.trim().toUpperCase() : "",
    currency: args.currency || "INR",
    taxTreatment: args.gstin ? "Registered Business - Regular" : "Unregistered Business",
  });

  return {
    success: true,
    contactId: newContact._id,
    displayName: newContact.displayName,
    message: `Vendor "${newContact.displayName}" created successfully.`,
  };
}
