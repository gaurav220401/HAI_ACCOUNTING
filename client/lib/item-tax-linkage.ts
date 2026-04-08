import type { Contact } from "@/lib/api/contacts";
import type { Item } from "@/lib/api/items";
import type { Tax as SettingsTax } from "@/lib/api/settings";

interface TaxRef {
  _id: string;
  rate?: number;
}

type ItemTaxRef = string | TaxRef | null | undefined;

function getRefId(ref: ItemTaxRef): string {
  if (!ref) return "";
  return typeof ref === "string" ? ref : ref._id || "";
}

function getRefRate(ref: ItemTaxRef): number {
  if (!ref || typeof ref === "string") return 0;
  return Number(ref.rate || 0);
}

function normalizeState(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
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

  const selectedTaxId = interState
    ? interTaxId || legacyTaxId
    : intraTaxId || legacyTaxId;

  if (!selectedTaxId) {
    return { taxId: "", taxPercent: 0 };
  }

  const rateFromSettings = resolveTaxRateById(selectedTaxId, taxes);
  const rateFromItem = getRefRate(selectedTaxRef) || getRefRate(item.taxId as ItemTaxRef);

  return {
    taxId: selectedTaxId,
    taxPercent: rateFromSettings || rateFromItem || 0,
  };
}
