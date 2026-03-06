import { Types } from "mongoose";
import UnitOfMeasurement from "../models/unit.model";

// ─── 13 GST-standard units — always seeded for every org ─────────────────────
//   BOX-box | CMS-cm | DOZ-dz | FTS-ft | GMS-g  | INC-in
//   KGS-kg  | KME-km | LBS-lb | MGS-mg | MLT-ml | MTR-m | PCS-pcs

export const GST_UNIT_DEFAULTS: { name: string; abbreviation: string }[] = [
  { name: "Box",        abbreviation: "box" }, // BOX
  { name: "Centimetre", abbreviation: "cm"  }, // CMS
  { name: "Dozen",      abbreviation: "dz"  }, // DOZ
  { name: "Feet",       abbreviation: "ft"  }, // FTS
  { name: "Gram",       abbreviation: "g"   }, // GMS
  { name: "Inch",       abbreviation: "in"  }, // INC
  { name: "Kilogram",   abbreviation: "kg"  }, // KGS
  { name: "Kilometre",  abbreviation: "km"  }, // KME
  { name: "Pound",      abbreviation: "lb"  }, // LBS
  { name: "Milligram",  abbreviation: "mg"  }, // MGS
  { name: "Millilitre", abbreviation: "ml"  }, // MLT
  { name: "Metre",      abbreviation: "m"   }, // MTR
  { name: "Pieces",     abbreviation: "pcs" }, // PCS
];

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
        { organizationId, abbreviation: u.abbreviation },
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
