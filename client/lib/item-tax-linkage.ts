import type { Contact } from "@/lib/api/contacts";
import type { Item } from "@/lib/api/items";
import type { Tax as SettingsTax } from "@/lib/api/settings";

interface TaxRef {
  _id: string;
  rate?: number;
}

type ItemTaxRef = string | TaxRef | null | undefined;

const STATE_BY_ALPHA_CODE: Record<string, string> = {
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

function getRefId(ref: ItemTaxRef): string {
  if (!ref) return "";
  return typeof ref === "string" ? ref : ref._id || "";
}

function getRefRate(ref: ItemTaxRef): number {
  if (!ref || typeof ref === "string") return 0;
  return Number(ref.rate || 0);
}

export function normalizeState(value: string | undefined | null): string {
  const raw = (value || "").trim();
  if (!raw) return "";

  const bracketCode = raw.match(/^\[([A-Za-z]{2})\]/)?.[1];
  const directAlphaCode = /^[A-Za-z]{2}$/.test(raw) ? raw : "";
  const alphaCode = (bracketCode || directAlphaCode || "").toUpperCase();
  if (alphaCode && STATE_BY_ALPHA_CODE[alphaCode]) {
    return normalizeStateKey(STATE_BY_ALPHA_CODE[alphaCode]);
  }

  const numericCode =
    raw.match(/\((\d{2})\)/)?.[1] ||
    (/^\d{2}$/.test(raw) ? raw : "");
  if (numericCode && STATE_BY_GST_CODE[numericCode]) {
    return normalizeStateKey(STATE_BY_GST_CODE[numericCode]);
  }

  return normalizeStateKey(
    raw
      .replace(/^\[[A-Za-z]{2}\]\s*-\s*/, "")
      .replace(/\(\d{2}\)/g, ""),
  );
}

function normalizeStateKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCustomerState(contact: Contact | undefined): string {
  return (
    contact?.placeOfSupply ||
    contact?.shippingAddress?.state ||
    contact?.billingAddress?.state ||
    ""
  );
}

function isInterStateSupply(contact: Contact | undefined, organizationState?: string): boolean {
  const customerState = normalizeState(getCustomerState(contact));
  const orgState = normalizeState(organizationState);
  if (!customerState || !orgState) return false;
  return customerState !== orgState;
}

function resolveTaxRateById(taxId: string, taxes: SettingsTax[]): number {
  if (!taxId) return 0;
  const matched = taxes.find((tax) => tax._id === taxId);
  return Number(matched?.rate || 0);
}

function normalizeTaxLabel(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function resolveTaxMode(tax?: SettingsTax): "igst" | "gst" | "component" | "unknown" {
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

function findTaxById(taxId: string, taxes: SettingsTax[]): SettingsTax | undefined {
  return taxes.find((tax) => tax._id === taxId);
}

function taxMatchesSupply(tax: SettingsTax | undefined, interState: boolean): boolean {
  const mode = resolveTaxMode(tax);
  return interState ? mode === "igst" : mode === "gst";
}

function findCompatibleTax(taxes: SettingsTax[], rate: number, interState: boolean): SettingsTax | undefined {
  if (!rate) return undefined;
  const desiredMode = interState ? "igst" : "gst";
  return taxes.find(
    (tax) =>
      tax.isActive !== false &&
      Number(tax.rate || 0) === Number(rate) &&
      resolveTaxMode(tax) === desiredMode,
  );
}

function resolveTaxIdForSupply(args: {
  interState: boolean;
  specificTaxId: string;
  legacyTaxId: string;
  selectedTaxRef: ItemTaxRef;
  legacyTaxRef: ItemTaxRef;
  taxes: SettingsTax[];
}): { taxId: string; taxPercent: number } {
  const { interState, specificTaxId, legacyTaxId, selectedTaxRef, legacyTaxRef, taxes } = args;

  if (specificTaxId) {
    return {
      taxId: specificTaxId,
      taxPercent: resolveTaxRateById(specificTaxId, taxes) || getRefRate(selectedTaxRef),
    };
  }

  const legacyTax = findTaxById(legacyTaxId, taxes);
  const legacyRate = resolveTaxRateById(legacyTaxId, taxes) || getRefRate(legacyTaxRef);

  if (legacyTaxId && taxMatchesSupply(legacyTax, interState)) {
    return { taxId: legacyTaxId, taxPercent: legacyRate };
  }

  const compatibleTax = findCompatibleTax(taxes, legacyRate, interState);
  if (compatibleTax) {
    return { taxId: compatibleTax._id, taxPercent: Number(compatibleTax.rate || 0) };
  }

  return { taxId: legacyTaxId, taxPercent: legacyRate };
}

export function getItemTaxForTransaction(args: {
  item: Item;
  contact?: Contact;
  organizationState?: string;
  taxes: SettingsTax[];
}): { taxId: string; taxPercent: number } {
  const { item, contact, organizationState, taxes } = args;

  if (item.taxPreference && item.taxPreference !== "Taxable") {
    return { taxId: "", taxPercent: 0 };
  }

  const interState = isInterStateSupply(contact, organizationState);
  const intraTaxId = getRefId(item.intraStateTaxId as ItemTaxRef);
  const interTaxId = getRefId(item.interStateTaxId as ItemTaxRef);
  const legacyTaxId = getRefId(item.taxId as ItemTaxRef);

  const selectedTaxRef = interState
    ? (item.interStateTaxId as ItemTaxRef)
    : (item.intraStateTaxId as ItemTaxRef);

  const resolvedTax = resolveTaxIdForSupply({
    interState,
    specificTaxId: interState ? interTaxId : intraTaxId,
    legacyTaxId,
    selectedTaxRef,
    legacyTaxRef: item.taxId as ItemTaxRef,
    taxes,
  });

  if (!resolvedTax.taxId) {
    return { taxId: "", taxPercent: 0 };
  }

  return {
    taxId: resolvedTax.taxId,
    taxPercent: resolvedTax.taxPercent || 0,
  };
}
