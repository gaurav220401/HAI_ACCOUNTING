import assert from "node:assert/strict";
import { test } from "node:test";
import { narrationTypeToMatchType, parseNarration } from "../../services/narration-parser.service";

// Real narration lines from the Bank of Baroda statement ("SUMIT BOB 122.pdf")
// already imported for org "PikaG energy", plus a couple more realistic ones
// in the same styles.

test("extracts a UPI VPA regardless of surrounding slash segments", () => {
  const parsed = parseNarration("UPI/202871963329/14:31:11/UPI/9200003477@ptyes/NA");
  assert.equal(parsed.type, "UPI");
  assert.equal(parsed.counterpartyKey, "9200003477@ptyes");
  assert.equal(parsed.counterpartyDisplay, "9200003477@ptyes");
});

test("extracts a repeating VPA counterparty (saurabhagrawal00091@ybl)", () => {
  const a = parseNarration("UPI/301827364512/09:12:44/UPI/saurabhagrawal00091@ybl/Payment");
  const b = parseNarration("UPI/301999812234/18:02:11/UPI/saurabhagrawal00091@ybl/NA");
  assert.equal(a.type, "UPI");
  assert.equal(b.type, "UPI");
  assert.equal(a.counterpartyKey, "saurabhagrawal00091@ybl");
  // Two different occurrences of the same VPA must normalize to the same key
  // — this is exactly what lets the second occurrence be auto-suggested.
  assert.equal(a.counterpartyKey, b.counterpartyKey);
});

test("normalizes VPA case so the same counterparty always keys identically", () => {
  const lower = parseNarration("UPI/1/1/UPI/vinodshwatal26@oksb/NA");
  const upper = parseNarration("UPI/2/2/UPI/VINODSHWATAL26@OKSB/NA");
  assert.equal(lower.counterpartyKey, "vinodshwatal26@oksb");
  assert.equal(lower.counterpartyKey, upper.counterpartyKey);
});

test("extracts an RTGS beneficiary name after the second hyphen segment", () => {
  const parsed = parseNarration("RTGS-HDFCR52026031782860960-CHHATTISGARH AGRO FOOD");
  assert.equal(parsed.type, "RTGS");
  assert.equal(parsed.counterpartyDisplay, "CHHATTISGARH AGRO FOOD");
  assert.equal(parsed.counterpartyKey, "chhattisgarh agro food");
});

test("extracts an NEFT beneficiary name, including one rejoined from a wrapped narration line", () => {
  // bank-statement-parser.service.ts joins a wrapped continuation line back
  // onto the row above with a space, producing exactly this shape.
  const parsed = parseNarration("NEFT-HDFCR520250405-CHHATTISGARH AGRO FOOD PRIVATE LIMITED");
  assert.equal(parsed.type, "NEFT");
  assert.equal(parsed.counterpartyDisplay, "CHHATTISGARH AGRO FOOD PRIVATE LIMITED");
});

test("extracts an IMPS-with-name beneficiary", () => {
  const parsed = parseNarration("IMPS/P2A/605012620622/SHREE NCC LOGIS/Fund Transf");
  assert.equal(parsed.type, "IMPS");
  assert.equal(parsed.counterpartyDisplay, "SHREE NCC LOGIS");
  assert.equal(parsed.counterpartyKey, "shree ncc logis");
});

test("extracts an IMPS beneficiary even without a trailing purpose segment", () => {
  const parsed = parseNarration("IMPS/P2A/609013826627/XXXXXXXXXX2512");
  assert.equal(parsed.type, "IMPS");
  assert.equal(parsed.counterpartyDisplay, "XXXXXXXXXX2512");
});

test('recognises "CHARGES FOR" as a bank charge with no counterparty', () => {
  const parsed = parseNarration("CHARGES FOR :IMPS/P2A/609013826627/XXXXXXXX");
  assert.equal(parsed.type, "BANK_CHARGE");
  assert.equal(parsed.counterpartyKey, undefined);
  assert.equal(parsed.counterpartyDisplay, undefined);
});

test('recognises "SMS Charges for" anywhere in the narration as a bank charge', () => {
  const parsed = parseNarration("SMS Charges for Mar 2026 GST Inclusive");
  assert.equal(parsed.type, "BANK_CHARGE");
});

test("bank charge detection wins over VPA/IMPS pattern matching", () => {
  // This line would otherwise match the IMPS pattern — CHARGES FOR must win.
  const parsed = parseNarration("CHARGES FOR :IMPS/P2A/609013826627/XXXXXXXX");
  assert.notEqual(parsed.type, "IMPS");
});

test("self-transfers fall through as unrecognised, with no special-casing", () => {
  const parsed = parseNarration("EBANK:SELF/1501826630/");
  assert.equal(parsed.type, "OTHER");
  assert.equal(parsed.counterpartyKey, undefined);
});

test("blank or missing narrations are unrecognised", () => {
  assert.equal(parseNarration("").type, "OTHER");
  assert.equal(parseNarration(undefined).type, "OTHER");
  assert.equal(parseNarration(null).type, "OTHER");
});

test("an NEFT/RTGS narration with no name segment is typed but carries no counterparty", () => {
  const parsed = parseNarration("NEFT-HDFCR520250405-");
  assert.equal(parsed.type, "NEFT");
  assert.equal(parsed.counterpartyKey, undefined);
});

test("maps parsed narration types to the matching CategorizationRule matchType", () => {
  assert.equal(narrationTypeToMatchType("UPI"), "upi_vpa");
  assert.equal(narrationTypeToMatchType("NEFT"), "counterparty_name");
  assert.equal(narrationTypeToMatchType("RTGS"), "counterparty_name");
  assert.equal(narrationTypeToMatchType("IMPS"), "counterparty_name");
  assert.equal(narrationTypeToMatchType("BANK_CHARGE"), null);
  assert.equal(narrationTypeToMatchType("OTHER"), null);
});
