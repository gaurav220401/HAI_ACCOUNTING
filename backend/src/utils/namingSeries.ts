import { model, Schema, Model } from "mongoose";
import { INamingSeries } from "../types";

const namingSeriesSchema = new Schema<INamingSeries>(
  {
    doctype: { type: String, required: true },
    prefix: { type: String, required: true },
    currentValue: { type: Number, default: 0 },
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  },
  { timestamps: true },
);

namingSeriesSchema.index(
  { doctype: 1, prefix: 1, company: 1 },
  { unique: true },
);

const NamingSeriesModel: Model<INamingSeries> = model<INamingSeries>(
  "NamingSeries",
  namingSeriesSchema,
);

/**
 * Naming Series Engine
 * Generates auto-incrementing document names like SI-2026-00001
 *
 * Pattern tokens:
 *   {prefix}  - literal prefix (e.g., "SI", "PI", "JV")
 *   {YYYY}    - 4-digit year
 *   {YY}      - 2-digit year
 *   {MM}      - month (01-12)
 *   {#####}   - zero-padded counter (length = number of #'s)
 *
 * Example: "SI-{YYYY}-{#####}" → "SI-2026-00001"
 */
export async function generateName(
  doctype: string,
  pattern: string,
  companyId: string,
): Promise<string> {
  const now = new Date();
  const year4 = now.getFullYear().toString();
  const year2 = year4.slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");

  // Extract the prefix (everything before the counter pattern)
  // The prefix for the naming series record is the pattern with date tokens resolved
  const resolvedPrefix = pattern
    .replace("{YYYY}", year4)
    .replace("{YY}", year2)
    .replace("{MM}", month)
    .replace(/\{#+\}/, ""); // Remove counter placeholder for prefix storage

  // Atomically increment the counter
  const series = await NamingSeriesModel.findOneAndUpdate(
    {
      doctype,
      prefix: resolvedPrefix,
      company: companyId,
    },
    { $inc: { currentValue: 1 } },
    { upsert: true, new: true },
  );

  // Determine counter padding from pattern
  const counterMatch = pattern.match(/\{(#+)\}/);
  const padLength = counterMatch ? counterMatch[1].length : 5;

  const counter = series.currentValue.toString().padStart(padLength, "0");

  // Build the final name
  const name = pattern
    .replace("{YYYY}", year4)
    .replace("{YY}", year2)
    .replace("{MM}", month)
    .replace(/\{#+\}/, counter);

  return name;
}

/**
 * Get the current counter value for a naming series.
 */
export async function getCurrentCounter(
  doctype: string,
  prefix: string,
  companyId: string,
): Promise<number> {
  const series = await NamingSeriesModel.findOne({
    doctype,
    prefix,
    company: companyId,
  });
  return series?.currentValue ?? 0;
}

export { NamingSeriesModel };
