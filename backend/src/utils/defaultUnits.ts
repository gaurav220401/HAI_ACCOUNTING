import { Types } from "mongoose";
import UnitOfMeasurement from "../models/unit.model";

export interface UnitOption {
  name: string;
  abbreviation: string;
}

export const UNIT_OPTIONS: UnitOption[] = [
  { abbreviation: "BAG", name: "Bag" },
  { abbreviation: "BGS", name: "Bags" },
  { abbreviation: "BKL", name: "Buckles" },
  { abbreviation: "BOU", name: "Billion Of Units" },
  { abbreviation: "BOX", name: "Box" },
  { abbreviation: "BTL", name: "Bottles" },
  { abbreviation: "BUN", name: "Bunches" },
  { abbreviation: "CBM", name: "Cubic Meter" },
  { abbreviation: "CCM", name: "Cubic Centimeter" },
  { abbreviation: "CIN", name: "Cubic Inches" },
  { abbreviation: "CMS", name: "Centimeter" },
  { abbreviation: "CQM", name: "Cubic Meters" },
  { abbreviation: "CTN", name: "Carton" },
  { abbreviation: "DOZ", name: "Dozen" },
  { abbreviation: "DRM", name: "Drum" },
  { abbreviation: "FTS", name: "Feet" },
  { abbreviation: "GGR", name: "Great Gross" },
  { abbreviation: "GMS", name: "Grams" },
  { abbreviation: "GRS", name: "Gross" },
  { abbreviation: "GYD", name: "Gross Yards" },
  { abbreviation: "HKS", name: "Hanks" },
  { abbreviation: "INC", name: "Inches" },
  { abbreviation: "KGS", name: "Kilograms" },
  { abbreviation: "KLR", name: "Kiloliter" },
  { abbreviation: "KME", name: "Kilometers" },
  { abbreviation: "LBS", name: "Pounds" },
  { abbreviation: "LOT", name: "Lots" },
  { abbreviation: "LTR", name: "Liters" },
  { abbreviation: "MGS", name: "Milli Grams" },
  { abbreviation: "MLT", name: "Milli Litre" },
  { abbreviation: "MTR", name: "Meter" },
  { abbreviation: "MTS", name: "Metric Ton" },
  { abbreviation: "NOS", name: "Numbers" },
  { abbreviation: "ODD", name: "Odds" },
  { abbreviation: "PAC", name: "Packs" },
  { abbreviation: "PCS", name: "Pieces" },
  { abbreviation: "PRS", name: "Pairs" },
  { abbreviation: "QTL", name: "Quintal" },
  { abbreviation: "ROL", name: "Rolls" },
  { abbreviation: "SDM", name: "Decameter Square" },
  { abbreviation: "SET", name: "Sets" },
  { abbreviation: "SHT", name: "Sheets" },
  { abbreviation: "SQF", name: "Square Feet" },
  { abbreviation: "SQI", name: "Square Inches" },
  { abbreviation: "SQM", name: "Square Meter" },
  { abbreviation: "SQY", name: "Square Yards" },
  { abbreviation: "TBS", name: "Tablets" },
  { abbreviation: "THD", name: "Thousands" },
  { abbreviation: "TOL", name: "Tola" },
  { abbreviation: "TON", name: "Great Britain Ton" },
  { abbreviation: "TUB", name: "Tubes" },
  { abbreviation: "UGS", name: "Us Gallons" },
  { abbreviation: "UNT", name: "Units" },
  { abbreviation: "VLS", name: "Vials" },
  { abbreviation: "YDS", name: "Yards" },
  { abbreviation: "CAN", name: "Cans" },
  { abbreviation: "BDL", name: "Bundles" },
  { abbreviation: "BAL", name: "Bale" },
  { abbreviation: "TGM", name: "Ten Gross" },
  { abbreviation: "HRS", name: "Hours" },
  { abbreviation: "OTH", name: "Others" },
];

const UNIT_OPTIONS_BY_ABBREVIATION = new Map(
  UNIT_OPTIONS.map((unit) => [unit.abbreviation, unit] as const),
);

const GST_DEFAULT_CODES = new Set([
  "BOX",
  "CMS",
  "DOZ",
  "FTS",
  "GMS",
  "INC",
  "KGS",
  "KME",
  "LBS",
  "MGS",
  "MLT",
  "MTR",
  "PCS",
  "NOS",
  "HRS",
  "OTH",
]);

export const GST_UNIT_DEFAULTS: UnitOption[] = UNIT_OPTIONS.filter((unit) =>
  GST_DEFAULT_CODES.has(unit.abbreviation),
);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeUnitAbbreviation(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

export function getUnitOptionByAbbreviation(value: unknown): UnitOption | undefined {
  return UNIT_OPTIONS_BY_ABBREVIATION.get(normalizeUnitAbbreviation(value));
}

/**
 * Upsert the 13 GST default units for a given org.
 * Safe to call multiple times — uses $setOnInsert so existing units are untouched.
 */
export async function upsertDefaultUnits(
  organizationId: string | Types.ObjectId
): Promise<void> {
  await Promise.all(
    GST_UNIT_DEFAULTS.map((u) =>
      UnitOfMeasurement.updateOne(
        {
          organizationId,
          abbreviation: { $regex: `^${escapeRegex(u.abbreviation)}$`, $options: "i" },
        },
        {
          $setOnInsert: {
            organizationId,
            name: u.name,
            abbreviation: u.abbreviation,
            isSystemUnit: true,
            isActive: true,
          },
        },
        { upsert: true }
      )
    )
  );
}
