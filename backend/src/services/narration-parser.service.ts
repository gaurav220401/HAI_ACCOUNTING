/**
 * Extracts a counterparty identity from an Indian bank statement narration.
 *
 * Pure and DB-free by design — this is the one place that knows what a UPI
 * VPA, a NEFT/RTGS beneficiary or an IMPS-with-name narration looks like, so
 * it can be unit tested against real statement lines in isolation, the same
 * way bank-statement-parser.service.ts's cell/date coercion is tested.
 *
 * What comes back is only ever a parsed *identity* — never a category. This
 * module has no opinion on which account a counterparty belongs to; that
 * decision lives in categorization-suggestion.service.ts (rules learned from
 * past user choices) and bank-statement.service.ts (where those rules are
 * learned). A narration this module cannot parse produces type "OTHER" with
 * no counterparty, which is the correct, intentional "doesn't know it" case
 * — it stays defaulted to Suspense exactly like today.
 */

export type NarrationType = "UPI" | "NEFT" | "RTGS" | "IMPS" | "BANK_CHARGE" | "OTHER";

/** Mirrors CategorizationRule.matchType in categorization-rule.model.ts, kept
 * as an independent literal type here so this module stays free of any
 * import that touches mongoose/the DB. */
export type CategorizationMatchType = "upi_vpa" | "counterparty_name";

export interface ParsedNarration {
  type: NarrationType;
  /** Lightly-normalized identity (lower-cased, trimmed) — stable enough to
   *  compare across two occurrences of the same counterparty, but not run
   *  through the coarser matchValue normalization used for rule storage. */
  counterpartyKey?: string;
  /** Original-case text, for showing the user what was recognised. */
  counterpartyDisplay?: string;
}

// A VPA is `handle@bank` — an exact NPCI-standardized identifier. Searched
// for anywhere in the description rather than at a fixed field position,
// because UPI narrations wrap it in a variable number of slash-separated
// segments (reference numbers, timestamps, a literal "UPI" segment) that
// differ bank to bank.
const VPA_PATTERN = /[\w.-]+@[\w]+/;

// "CHARGES FOR :IMPS/..." and "SMS Charges for ..." are bank fees on every
// Indian bank statement, reliably enough to auto-suggest with zero
// configuration (Layer 1 — see categorization-suggestion.service.ts).
const BANK_CHARGE_PREFIX_PATTERN = /^charges\s+for/i;
const SMS_CHARGE_PATTERN = /sms\s+charges\s+for/i;

// NEFT-<bankcode+ref>-<NAME> / RTGS-<bankcode+ref>-<NAME>: the beneficiary
// name is everything after the second hyphen-delimited segment.
const NEFT_RTGS_PATTERN = /^(NEFT|RTGS)-([^-]+)-(.*)$/i;

// IMPS/P2A/<ref>/<NAME>/<purpose>.
const IMPS_NAME_PATTERN = /^IMPS\/P2A\/([^/]+)\/([^/]+)(?:\/(.*))?$/i;

function lightNormalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function parseNarration(description: string | null | undefined): ParsedNarration {
  const text = String(description || "").trim();
  if (!text) return { type: "OTHER" };

  if (BANK_CHARGE_PREFIX_PATTERN.test(text) || SMS_CHARGE_PATTERN.test(text)) {
    return { type: "BANK_CHARGE" };
  }

  // Checked before NEFT/RTGS/IMPS: a VPA is a more precise, NPCI-exact
  // identifier, and some UPI narrations otherwise resemble a slash-delimited
  // IMPS layout closely enough to be ambiguous.
  const vpaMatch = text.match(VPA_PATTERN);
  if (vpaMatch) {
    const vpa = vpaMatch[0];
    return {
      type: "UPI",
      counterpartyKey: lightNormalize(vpa),
      counterpartyDisplay: vpa,
    };
  }

  const neftRtgs = text.match(NEFT_RTGS_PATTERN);
  if (neftRtgs) {
    const kind = neftRtgs[1].toUpperCase() as "NEFT" | "RTGS";
    const name = neftRtgs[3].trim();
    if (name) {
      return {
        type: kind,
        counterpartyKey: lightNormalize(name),
        counterpartyDisplay: name,
      };
    }
    return { type: kind };
  }

  const imps = text.match(IMPS_NAME_PATTERN);
  if (imps) {
    const name = (imps[2] || "").trim();
    if (name) {
      return {
        type: "IMPS",
        counterpartyKey: lightNormalize(name),
        counterpartyDisplay: name,
      };
    }
    return { type: "IMPS" };
  }

  return { type: "OTHER" };
}

/** Maps a parsed narration type to the CategorizationRule match type it can
 * teach/look up, or null when the type carries no learnable counterparty
 * (BANK_CHARGE is handled entirely by the Layer-1 pattern, not a rule; OTHER
 * — including self-transfers like EBANK:SELF/... — carries no identity at
 * all and is intentionally left unrecognised). */
export function narrationTypeToMatchType(type: NarrationType): CategorizationMatchType | null {
  if (type === "UPI") return "upi_vpa";
  if (type === "NEFT" || type === "RTGS" || type === "IMPS") return "counterparty_name";
  return null;
}
