import { Document, Schema, Types, model } from "mongoose";
import { auditTrailPlugin } from "../plugins";

/**
 * A learned mapping from a bank-statement counterparty to the account it was
 * last categorized against.
 *
 * There is no schema change on `Document.bankTransactions` itself — a
 * suggestion is computed live at read time by joining a statement line's
 * parsed counterparty (see narration-parser.service.ts) against this
 * collection (see categorization-suggestion.service.ts). Rows here are
 * written invisibly, as a side effect of the user's existing workflow: every
 * time a statement line posts against a real (non-suspense) account,
 * bank-statement.service.ts upserts the corresponding rule so the same
 * counterparty is recognised automatically next time.
 */
export type CategorizationMatchType = "upi_vpa" | "counterparty_name";

export interface ICategorizationRule extends Document {
  organizationId: Types.ObjectId;
  matchType: CategorizationMatchType;
  /** Normalized counterparty identity — see normalizeDescription() in bank-statement.service.ts. */
  matchValue: string;
  accountId: Types.ObjectId;
  contactId?: Types.ObjectId | null;
  timesApplied: number;
  lastAppliedAt: Date;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const categorizationRuleSchema = new Schema<ICategorizationRule>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    matchType: {
      type: String,
      enum: ["upi_vpa", "counterparty_name"] as CategorizationMatchType[],
      required: true,
    },
    matchValue: { type: String, required: true, trim: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    timesApplied: { type: Number, default: 1 },
    lastAppliedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

categorizationRuleSchema.plugin(auditTrailPlugin);

// The identity of a learned rule — one account per counterparty per org.
// Also the index the suggestion service's batched lookup runs against.
categorizationRuleSchema.index(
  { organizationId: 1, matchType: 1, matchValue: 1 },
  { unique: true },
);

const CategorizationRule = model<ICategorizationRule>("CategorizationRule", categorizationRuleSchema);
export default CategorizationRule;
