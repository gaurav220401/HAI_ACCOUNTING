import { Types } from "mongoose";
import Contact from "../models/contact.model";
import Item from "../models/item.model";
import Organization from "../models/organization.model";
import Tax from "../models/tax.model";

interface ApplyItemTaxLinkageArgs {
  placeOfSupply?: string;
  organizationId: any;
  contactId?: any;
  items: any[];
}

function refId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "object") {
    const maybe = value as { _id?: unknown; toString?: () => string };
    if (maybe._id) return refId(maybe._id);
    if (typeof maybe.toString === "function") {
      const text = maybe.toString();
      if (text && text !== "[object Object]") return text;
    }
  }
  return "";
}

function normalizeTaxSelection(value: unknown): string {
  if (isExplicitNoTaxSelection(value)) return "";
  const taxId = refId(value);
  return taxId ? taxId : "";
}

function isExplicitNoTaxSelection(value: unknown): boolean {
  const taxId = refId(value).trim().toLowerCase();
  return taxId === "none" || taxId === "__none";
}

function clearLineTax(line: any): void {
  line.taxId = null;
  line.taxPercent = 0;
  line.taxAmount = 0;
}

function normalizeState(value: unknown): string {
  return placeOfSupplyState(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}








const PLACE_OF_SUPPLY_STATE_BY_CODE: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AD: "Andhra Pradesh",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CG: "Chhattisgarh",
  DN: "Dadra and Nagar Haveli and Daman and Diu",
  DD: "Daman and Diu",
  DL: "Delhi",
  FC: "Foreign Country",
  GA: "Goa",
  GJ: "Gujarat",
  HR: "Haryana",
  HP: "Himachal Pradesh",
  JK: "Jammu and Kashmir",
  JH: "Jharkhand",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MP: "Madhya Pradesh",
  MH: "Maharashtra",
  MN: "Manipur",
  ML: "Meghalaya",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha",
  OT: "Other Territory",
  PY: "Puducherry",
  PB: "Punjab",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TS: "Telangana",
  TR: "Tripura",
  UP: "Uttar Pradesh",
  UK: "Uttarakhand",
  UA: "Uttarakhand",
  WB: "West Bengal",
};

const STATE_BY_GST_CODE: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Foreign Country",
};

function placeOfSupplyState(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const bracketCode = raw.match(/^\[([A-Za-z]{2})\]/)?.[1];
  const directCode = /^[A-Za-z]{2}$/.test(raw) ? raw : "";
  const code = (bracketCode || directCode || "").toUpperCase();
  if (code && PLACE_OF_SUPPLY_STATE_BY_CODE[code]) {
    return PLACE_OF_SUPPLY_STATE_BY_CODE[code];
  }

  const numericCode =
    raw.match(/\((\d{2})\)/)?.[1] ||
    (/^\d{2}$/.test(raw) ? raw : "");
  if (numericCode && STATE_BY_GST_CODE[numericCode]) {
    return STATE_BY_GST_CODE[numericCode];
  }

  const cleaned = raw
    .replace(/^\[[A-Za-z]{2}\]\s*-\s*/, "")
    .replace(/\(\d{2}\)/g, "")
    .trim();
  return cleaned;
}

function contactState(contact: any): string {
  return (
    placeOfSupplyState(contact?.placeOfSupply) ||
    contact?.shippingAddress?.state ||
    contact?.billingAddress?.state ||
    ""
  );
}

function normalizeTaxLabel(value?: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function taxMode(tax: any): "igst" | "gst" | "component" | "unknown" {
  if (!tax) return "unknown";
  const name = normalizeTaxLabel(tax.name);
  const authority = normalizeTaxLabel(tax.taxAuthority);

  if (authority === "IGST" || name.startsWith("IGST")) return "igst";
  if (tax.taxType === "TaxGroup" || authority === "GST" || name.startsWith("GST")) return "gst";
  if (authority === "CGST" || authority === "SGST" || name.startsWith("CGST") || name.startsWith("SGST")) {
    return "component";
  }

  return "unknown";
}

function taxMatchesSupply(tax: any, interState: boolean): boolean {
  const mode = taxMode(tax);
  return interState ? mode === "igst" : mode === "gst";
}

function resolveItemDefaultTaxIdForSupply(args: {
  item: any;
  interState: boolean;
  taxById: Map<string, any>;
  taxRateById: Map<string, number>;
  allTaxes: any[];
}): string {
  const { item, interState, taxById, taxRateById, allTaxes } = args;
  const legacyTaxId = refId(item?.taxId);
  const intraTaxId = refId(item?.intraStateTaxId);
  const interTaxId = refId(item?.interStateTaxId);
  const specificTaxId = interState ? interTaxId : intraTaxId;

  if (specificTaxId) return specificTaxId;

  const legacyTax = taxById.get(legacyTaxId);
  if (legacyTaxId && taxMatchesSupply(legacyTax, interState)) {
    return legacyTaxId;
  }

  const legacyRate = Number(taxRateById.get(legacyTaxId) || 0);
  if (legacyRate) {
    const desiredMode = interState ? "igst" : "gst";
    const compatibleTax = allTaxes.find(
      (tax) =>
        tax?.isActive !== false &&
        Number(tax?.rate || 0) === legacyRate &&
        taxMode(tax) === desiredMode,
    );
    if (compatibleTax) return refId(compatibleTax._id);
  }

  return legacyTaxId;
}

export async function applyItemTaxLinkageToItems(
  args: ApplyItemTaxLinkageArgs,
): Promise<any[]> {
  const { organizationId, contactId, items, placeOfSupply } = args;
  const oid: any = organizationId;
  if (!Array.isArray(items) || items.length === 0) return [];

  const linkedItems = items.map((line) => ({ ...line }));
  const validItemIds = Array.from(
    new Set(
      linkedItems
        .map((line) => refId((line as any)?.itemId))
        .filter((id) => id && Types.ObjectId.isValid(id)),
    ),
  );

  const contactRefId = refId(contactId);

  const [organization, contact, itemDocs] = await Promise.all([
    Organization.findById(oid).select("address.state").lean(),
    contactRefId && Types.ObjectId.isValid(contactRefId)
      ? Contact.findOne({
          _id: contactRefId as any,
          organizationId: oid,
          isDeleted: { $ne: true },
        })
          .select("billingAddress.state shippingAddress.state placeOfSupply")
          .lean()
      : Promise.resolve(null),
    validItemIds.length > 0
      ? Item.find({
          organizationId: oid,
          _id: { $in: validItemIds },
          isDeleted: { $ne: true },
        })
          .select("taxPreference taxId intraStateTaxId interStateTaxId")
          .lean()
      : Promise.resolve([]),
  ]);

  const orgState = normalizeState((organization as any)?.address?.state);
  const customerState = normalizeState(placeOfSupply || contactState(contact));
  const interState = Boolean(orgState && customerState && orgState !== customerState);

  const itemById = new Map<string, any>();
  for (const item of itemDocs) {
    itemById.set(refId((item as any)?._id), item);
  }

  const taxDocs = await Tax.find({
    organizationId: oid,
    isDeleted: { $ne: true },
  })
    .select("name rate taxAuthority taxType isActive")
    .lean();

  const taxById = new Map<string, any>();
  const taxRateById = new Map<string, number>();
  for (const tax of taxDocs) {
    const taxId = refId((tax as any)?._id);
    taxById.set(taxId, tax);
    taxRateById.set(taxId, Number((tax as any)?.rate || 0));
  }

  return linkedItems.map((line) => {
    const item = itemById.get(refId((line as any)?.itemId));
    const lineTaxId = normalizeTaxSelection((line as any)?.taxId);
    const lineTaxPercent = Number((line as any)?.taxPercent || 0);

    if (!item) {
      if (lineTaxId) {
        (line as any).taxId = lineTaxId;
        if (!lineTaxPercent) {
          (line as any).taxPercent = Number(taxRateById.get(lineTaxId) || 0);
        }
      } else if (isExplicitNoTaxSelection((line as any)?.taxId)) {
        clearLineTax(line);
      }
      return line;
    }

    if ((item as any).taxPreference && (item as any).taxPreference !== "Taxable") {
      clearLineTax(line);
      return line;
    }

    if (isExplicitNoTaxSelection((line as any)?.taxId)) {
      clearLineTax(line);
      return line;
    }

    const defaultTaxId = resolveItemDefaultTaxIdForSupply({
      item,
      interState,
      taxById,
      taxRateById,
      allTaxes: taxDocs,
    });
    const selectedTaxId = lineTaxId || defaultTaxId;
    (line as any).taxId = selectedTaxId || null;

    if ((line as any).taxPercent !== undefined) {
      if (lineTaxId && lineTaxPercent > 0) {
        (line as any).taxPercent = lineTaxPercent;
      } else if (selectedTaxId) {
        (line as any).taxPercent = Number(taxRateById.get(selectedTaxId) || 0);
      } else {
        (line as any).taxPercent = 0;
      }
    }

    return line;
  });
}
