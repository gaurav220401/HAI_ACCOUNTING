import Tax from "../../models/tax.model";
import TDSTax from "../../models/tds-tax.model";
import TCSTax from "../../models/tcs-tax.model";
import { Types } from "mongoose";

export async function listTaxes(organizationId: any) {
  return Tax.find({ organizationId, isActive: true })
    .sort({ name: 1 })
    .lean();
}

export async function listTDSTaxes(organizationId: any) {
  return TDSTax.find({ organizationId, isActive: true })
    .sort({ taxName: 1 })
    .lean();
}

export async function listTCSTaxes(organizationId: any) {
  return TCSTax.find({ organizationId, isActive: true })
    .sort({ taxName: 1 })
    .lean();
}

export async function getTaxById(organizationId: any, id: any) {
  return Tax.findOne({ _id: id, organizationId, isActive: true }).lean();
}

export async function createTax(organizationId: any, data: any) {
  return Tax.create({
    organizationId,
    name: data.name,
    rate: Number(data.rate) || 0,
    isActive: true,
  });
}

export async function createTDSTax(organizationId: any, data: any) {
  return TDSTax.create({
    organizationId,
    taxName: data.name || data.taxName,
    rate: Number(data.rate) || 0,
    sectionCode: data.sectionCode || "194C",
    sectionDescription: data.sectionDescription || "",
    isActive: true,
  });
}

export async function createTCSTax(organizationId: any, data: any) {
  return TCSTax.create({
    organizationId,
    taxName: data.name || data.taxName,
    rate: Number(data.rate) || 0,
    sectionCode: data.sectionCode || "206C",
    sectionDescription: data.sectionDescription || "",
    isActive: true,
  });
}

export async function searchTaxes(organizationId: any, query: string) {
  const cleanQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  return Tax.find({
    organizationId,
    isActive: true,
    name: { $regex: cleanQuery, $options: "i" },
  })
    .limit(10)
    .lean();
}

export function getTaxFormSchema() {
  return {
    type: "object",
    properties: {
      name: { type: "string", description: "Tax code name (e.g. GST 18)", required: true },
      rate: { type: "number", description: "Tax percentage rate", required: true },
    },
  };
}
