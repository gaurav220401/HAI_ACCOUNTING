import { Types } from "mongoose";
import Account from "../models/account.model";
import CategorizationRule, { CategorizationMatchType } from "../models/categorization-rule.model";
import Contact from "../models/contact.model";
import { normalizeDescription } from "./bank-statement.service";
import { narrationTypeToMatchType, parseNarration } from "./narration-parser.service";

/**
 * Computes "what would you have called this transaction" for pending bank
 * statement lines, so document.controller.ts's listDocuments can pre-fill the
 * Banking review screen. Nothing here ever posts anything — every suggestion
 * is a hint the user still confirms or overrides, exactly like an unassisted
 * blank line does today.
 *
 * Two layers, combined:
 *  - Layer 1 (pattern): "CHARGES FOR" / "SMS Charges for" narrations are bank
 *    fees on every Indian statement — auto-suggested with zero configuration.
 *  - Layer 2 (learned rule): a counterparty this org has categorized before
 *    (see bank-statement.service.ts, where rules are learned on every real
 *    post) is looked up in one batched query per matchType, not N+1.
 *
 * A third, lower-confidence signal — a Contact whose saved UPI id matches the
 * VPA on the line, but with no rule yet — surfaces as a "contact_hint" that
 * names who this probably is without picking a category for it; the plan
 * intentionally does not let this pre-fill the category dropdown (a contact
 * is a hint at identity, not a categorization decision).
 */

export const BANK_CHARGES_ACCOUNT_NAME = "Bank Charges";

export type SuggestionSource = "rule" | "pattern" | "contact_hint";

export interface CategorizationSuggestion {
  /** Real account id for "rule"/"pattern" sources. Empty for "contact_hint",
   *  which is a pointer at an identity, not a category choice. */
  accountId: string;
  accountName: string;
  source: SuggestionSource;
  contactName?: string;
}

export interface SuggestionInputTxn {
  transactionId: string;
  description?: string | null;
}

/**
 * Suspense-equivalent account for recognised bank fees. Auto-created on
 * first use — same pattern as resolveSuspenseAccount in
 * bank-statement.service.ts — so a fresh org gets the suggestion immediately
 * without any chart-of-accounts setup.
 */
export async function resolveBankChargesAccount(organizationId: Types.ObjectId) {
  let account = await Account.findOne({
    organizationId,
    isDeleted: false,
    name: BANK_CHARGES_ACCOUNT_NAME,
  });

  if (!account) {
    account = new Account({
      organizationId,
      name: BANK_CHARGES_ACCOUNT_NAME,
      rootType: "Expense",
      accountType: "Expense",
      isGroup: false,
      currency: "INR",
      description:
        "Bank fees and charges (transaction charges, SMS alert charges, etc.) automatically recognised from statement narrations.",
    });
    await account.save();
  }

  return account;
}

/**
 * Batch-computes suggestions for a set of pending statement lines belonging
 * to one organization. Runs a bounded number of queries regardless of how
 * many transactions are passed in:
 *   - at most one lookup per CategorizationRule.matchType (currently 2)
 *   - at most one Contact lookup (by UPI id)
 *   - at most one Account lookup for rule-referenced accounts
 *   - a Bank Charges account resolve/create, only if a charge line is present
 */
export async function getSuggestions(
  organizationId: Types.ObjectId,
  transactions: SuggestionInputTxn[],
): Promise<Map<string, CategorizationSuggestion>> {
  const suggestions = new Map<string, CategorizationSuggestion>();
  if (!transactions.length) return suggestions;

  const parsedByTxn = transactions.map((txn) => ({
    txn,
    parsed: parseNarration(txn.description),
  }));

  // ─── Layer 1: bank charges ────────────────────────────────────────────
  const hasBankCharge = parsedByTxn.some(({ parsed }) => parsed.type === "BANK_CHARGE");
  const bankChargesAccount = hasBankCharge ? await resolveBankChargesAccount(organizationId) : null;

  // ─── Layer 2: learned rules — one $in query per matchType ────────────
  const keysByType = new Map<CategorizationMatchType, Set<string>>();
  for (const { parsed } of parsedByTxn) {
    const matchType = narrationTypeToMatchType(parsed.type);
    if (!matchType || !parsed.counterpartyKey) continue;
    const matchValue = normalizeDescription(parsed.counterpartyKey);
    if (!matchValue) continue;
    if (!keysByType.has(matchType)) keysByType.set(matchType, new Set());
    keysByType.get(matchType)!.add(matchValue);
  }

  const ruleByKey = new Map<string, { accountId: Types.ObjectId }>();
  for (const [matchType, values] of keysByType) {
    const rules = await CategorizationRule.find({
      organizationId,
      matchType,
      matchValue: { $in: Array.from(values) },
    })
      .select("matchType matchValue accountId")
      .lean();
    for (const rule of rules) {
      ruleByKey.set(`${rule.matchType}:${rule.matchValue}`, { accountId: rule.accountId as Types.ObjectId });
    }
  }

  const ruleAccountIds = Array.from(new Set(Array.from(ruleByKey.values()).map((r) => String(r.accountId))));
  const accounts = ruleAccountIds.length
    ? await Account.find({ _id: { $in: ruleAccountIds } }).select("_id name").lean()
    : [];
  const accountNameById = new Map(accounts.map((a) => [String(a._id), a.name]));

  // ─── Contact hint: VPA on a bank line matches a saved contact ─────────
  // Only UPI VPAs are looked up here — narration-parser does not extract an
  // account number from NEFT/RTGS/IMPS text (those narrations only ever
  // carry a beneficiary name in the statement this was built against), so
  // Contact.bankDetails.accountNumber has nothing to join against yet.
  const vpaKeys = new Set<string>();
  for (const { parsed } of parsedByTxn) {
    if (parsed.type === "UPI" && parsed.counterpartyKey) vpaKeys.add(parsed.counterpartyKey);
  }

  const contactByVpa = new Map<string, { displayName: string }>();
  if (vpaKeys.size > 0) {
    // Stored UPI ids are assumed lower-case, matching NPCI convention and
    // how narration-parser normalizes counterpartyKey — an exact $in on the
    // indexed field, not a per-row regex scan.
    const contacts = await Contact.find({
      organizationId,
      isDeleted: false,
      "bankDetails.upiId": { $in: Array.from(vpaKeys) },
    })
      .select("displayName bankDetails.upiId")
      .lean();
    for (const contact of contacts) {
      for (const bankDetail of contact.bankDetails || []) {
        const upi = String(bankDetail.upiId || "").toLowerCase().trim();
        if (upi && vpaKeys.has(upi) && !contactByVpa.has(upi)) {
          contactByVpa.set(upi, { displayName: contact.displayName });
        }
      }
    }
  }

  // ─── Assemble ──────────────────────────────────────────────────────────
  for (const { txn, parsed } of parsedByTxn) {
    if (parsed.type === "BANK_CHARGE" && bankChargesAccount) {
      suggestions.set(txn.transactionId, {
        accountId: String(bankChargesAccount._id),
        accountName: bankChargesAccount.name,
        source: "pattern",
      });
      continue;
    }

    const matchType = narrationTypeToMatchType(parsed.type);
    if (matchType && parsed.counterpartyKey) {
      const matchValue = normalizeDescription(parsed.counterpartyKey);
      const rule = ruleByKey.get(`${matchType}:${matchValue}`);
      if (rule) {
        suggestions.set(txn.transactionId, {
          accountId: String(rule.accountId),
          accountName: accountNameById.get(String(rule.accountId)) || "",
          source: "rule",
        });
        continue;
      }
    }

    if (parsed.type === "UPI" && parsed.counterpartyKey) {
      const contact = contactByVpa.get(parsed.counterpartyKey);
      if (contact) {
        suggestions.set(txn.transactionId, {
          accountId: "",
          accountName: "",
          source: "contact_hint",
          contactName: contact.displayName,
        });
      }
    }
  }

  return suggestions;
}
