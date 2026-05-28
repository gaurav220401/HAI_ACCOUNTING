import { Types } from "mongoose";
import Contact from "../models/contact.model";
import Item from "../models/item.model";
import Organization from "../models/organization.model";
import Tax from "../models/tax.model";

interface ApplyItemTaxLinkageArgs {
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
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const PLACE_OF_SUPPLY_STATE_BY_CODE: Record<string, string> = {
  AN: "Andaman and Nicobar Islands",
  AD: "Andhra Pradesh",
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
  WB: "West Bengal",
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

  const cleaned = raw.replace(/^\[[A-Za-z]{2}\]\s*-\s*/, "").trim();
  return cleaned;
}

function contactState(contact: any): string {
  return (
    contact?.shippingAddress?.state ||
    contact?.billingAddress?.state ||
    placeOfSupplyState(contact?.placeOfSupply) ||
    ""
  );
}

function resolveItemDefaultTaxId(item: any, interState: boolean): string {
  const legacyTaxId = refId(item?.taxId);
  const intraTaxId = refId(item?.intraStateTaxId);
  const interTaxId = refId(item?.interStateTaxId);
  return interState ? interTaxId || legacyTaxId : intraTaxId || legacyTaxId;
}

export async function applyItemTaxLinkageToItems(
  args: ApplyItemTaxLinkageArgs,
): Promise<any[]> {
  const { organizationId, contactId, items } = args;
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
  const customerState = normalizeState(contactState(contact));
  const interState = Boolean(orgState && customerState && orgState !== customerState);

  const itemById = new Map<string, any>();
  for (const item of itemDocs) {
    itemById.set(refId((item as any)?._id), item);
  }

  const allTaxIds = new Set<string>();
  for (const line of linkedItems) {
    const lineTaxId = normalizeTaxSelection((line as any)?.taxId);
    if (lineTaxId) allTaxIds.add(lineTaxId);

    const item = itemById.get(refId((line as any)?.itemId));
    if (!item) continue;

    const defaultTaxId = resolveItemDefaultTaxId(item, interState);
    if (defaultTaxId) allTaxIds.add(defaultTaxId);
  }

  const taxDocs =
    allTaxIds.size > 0
      ? await Tax.find({
          organizationId: oid,
          _id: { $in: Array.from(allTaxIds) },
          isDeleted: { $ne: true },
        })
          .select("rate")
          .lean()
      : [];

  const taxRateById = new Map<string, number>();
  for (const tax of taxDocs) {
    taxRateById.set(refId((tax as any)?._id), Number((tax as any)?.rate || 0));
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

    const defaultTaxId = resolveItemDefaultTaxId(item, interState);
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
