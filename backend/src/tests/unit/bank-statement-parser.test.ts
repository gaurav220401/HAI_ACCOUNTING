import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSpreadsheetStatement,
  parseStatementWorkbook,
  StatementParseError,
} from "../../services/bank-statement-parser.service";

/**
 * Layout taken from a real Bank of Baroda current-account export: a six-row
 * preamble before the header, Indian lakh grouping, "Cr" suffixes on the
 * balance column, day-first dates, separate withdrawal/deposit columns, and a
 * page-footer row after the data.
 */
const BOB_CSV = [
  `Main Account Holder Name :SUMIT ROAD CARRIER,,,,,,`,
  `AUTHORISED SIGNATORY:SUMIT KUMAR BAITHA S/O-PRABHUNATH BAITHA,,,,,,`,
  `Customer Id: LV5063939,,,,Account No:,876XXXXXXXX122,`,
  `Branch Name: BHILAI-3,,,,MICR Code:,490012012,`,
  `IFSC Code: BARB0DBBHIL,,,,Nominee Reg:,Yes,`,
  `Statement Period from 01/04/2025 to 31/03/2026,,,,,,`,
  `,,,,,,`,
  `TRAN DATE,VALUE DATE,NARRATION,CHQ.NO.,WITHDRAWAL(DR),DEPOSIT(CR),BALANCE(INR)`,
  `31/03/2026,31/03/2026,EBANK:SELF/1501826630/,,,"5,00,000.00","6,52,513.14Cr"`,
  `31/03/2026,31/03/2026,CHARGES FOR :IMPS/P2A/609013826627/XXXXXXXX,,17.70,,"1,52,513.14Cr"`,
  `31/03/2026,31/03/2026,IMPS/P2A/609013826627/XXXXXXXXXX2512/BHADA,,"2,00,000.00",,"1,52,530.84Cr"`,
  `31/03/2026,31/03/2026,EBANK:SELF/1501777875/,,,"2,00,000.00","3,52,530.84Cr"`,
  `30/03/2026,30/03/2026,EBANK:SELF/1501557738/,,,"1,50,000.00","1,52,530.84Cr"`,
  `29/03/2026,29/03/2026,UPI/202871963329/14:31:11/UPI/9200003477@ptyes/NA,,"4,000.00",,"2,530.84Cr"`,
  `,,,,,,`,
  `27/07/2026 17:34,Contact-Us@18005700,Page 1 of 32,,,,`,
].join("\n");

function buf(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

test("identifies spreadsheet statements by extension and mime type", () => {
  assert.equal(isSpreadsheetStatement("csv", "text/csv"), true);
  assert.equal(isSpreadsheetStatement("xlsx", ""), true);
  assert.equal(isSpreadsheetStatement("xls", ""), true);
  assert.equal(isSpreadsheetStatement("", "application/vnd.ms-excel"), true);
  assert.equal(isSpreadsheetStatement("pdf", "application/pdf"), false);
  assert.equal(isSpreadsheetStatement("png", "image/png"), false);
});

test("parses a Bank of Baroda export, skipping preamble and footer rows", () => {
  const parsed = parseStatementWorkbook(buf(BOB_CSV), "SUMIT BOB 122.csv");

  assert.equal(parsed.transactions.length, 6);
  assert.equal(parsed.accountNumber, "876XXXXXXXX122");
});

test("reads Indian lakh grouping, Cr suffixes and day-first dates", () => {
  const { transactions } = parseStatementWorkbook(buf(BOB_CSV), "bob.csv");

  const first = transactions[0];
  // 31/03/2026 must be 31 March, not 3 March — day-first is not optional here.
  assert.equal(first.txnDate.toISOString().slice(0, 10), "2026-03-31");
  assert.equal(first.credit, 500000);
  assert.equal(first.debit, 0);
  assert.equal(first.balance, 652513.14);

  // Small debit with no thousands separator.
  assert.equal(transactions[1].debit, 17.7);
  assert.equal(transactions[1].credit, 0);

  const last = transactions[5];
  assert.equal(last.debit, 4000);
  assert.equal(last.txnDate.toISOString().slice(0, 10), "2026-03-29");
  assert.match(last.description, /UPI\/202871963329/);
});

test("every parsed row reconciles against the statement's running balance", () => {
  const { transactions } = parseStatementWorkbook(buf(BOB_CSV), "bob.csv");

  // Rows print newest-first, so each row's balance derives from the row below.
  let checked = 0;
  for (let i = 1; i < transactions.length; i += 1) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (typeof prev.balance !== "number" || typeof curr.balance !== "number") continue;
    const expected = curr.balance - prev.debit + prev.credit;
    assert.ok(
      Math.abs(expected - prev.balance) < 0.02,
      `row ${i - 1} does not reconcile: expected ${expected}, printed ${prev.balance}`,
    );
    checked += 1;
  }
  assert.equal(checked, 5);
});

test("handles a single amount column with a Dr/Cr indicator", () => {
  const csv = [
    `Date,Narration,Amount,Dr / Cr,Balance`,
    `01-Apr-2025,Opening purchase,"1,200.50",Dr,"8,799.50"`,
    `02-Apr-2025,Customer receipt,"5,000.00",Cr,"13,799.50"`,
  ].join("\n");

  const { transactions } = parseStatementWorkbook(buf(csv), "single-column.csv");

  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].debit, 1200.5);
  assert.equal(transactions[0].credit, 0);
  assert.equal(transactions[0].txnDate.toISOString().slice(0, 10), "2025-04-01");
  assert.equal(transactions[1].credit, 5000);
  assert.equal(transactions[1].debit, 0);
});

test("treats a signed amount column as debit when negative", () => {
  const csv = [
    `Transaction Date,Description,Amount,Balance`,
    `2025-04-01,Fuel,-2500.00,47500.00`,
    `2025-04-02,Refund,1500.00,49000.00`,
  ].join("\n");

  const { transactions } = parseStatementWorkbook(buf(csv), "signed.csv");

  assert.equal(transactions[0].debit, 2500);
  assert.equal(transactions[0].credit, 0);
  assert.equal(transactions[1].credit, 1500);
  assert.equal(transactions[1].debit, 0);
});

test("appends wrapped narration lines to the preceding transaction", () => {
  const csv = [
    `Date,Narration,Withdrawal,Deposit,Balance`,
    `05/04/2025,NEFT-HDFCR520250405-CHHATTISGARH,,"10,000.00","60,000.00"`,
    `,AGRO FOOD PRIVATE LIMITED,,,`,
    `06/04/2025,Bank charges,25.00,,"59,975.00"`,
  ].join("\n");

  const { transactions } = parseStatementWorkbook(buf(csv), "wrapped.csv");

  assert.equal(transactions.length, 2);
  assert.match(transactions[0].description, /CHHATTISGARH AGRO FOOD PRIVATE LIMITED/);
});

test("reports an overdrawn balance as negative", () => {
  const csv = [
    `Date,Narration,Withdrawal,Deposit,Balance`,
    `10/04/2025,Large payment,"90,000.00",,"5,000.00Dr"`,
  ].join("\n");

  const { transactions } = parseStatementWorkbook(buf(csv), "overdrawn.csv");
  assert.equal(transactions[0].balance, -5000);
});

test("fails loudly when no transaction table can be found", () => {
  const csv = [`Some bank marketing header`, `Nothing useful here`, `Call us on 1800`].join("\n");

  assert.throws(
    () => parseStatementWorkbook(buf(csv), "junk.csv"),
    (error: unknown) =>
      error instanceof StatementParseError && /Could not find a transaction table/.test((error as Error).message),
  );
});

test("fails loudly when the table exists but holds no usable rows", () => {
  const csv = [`Date,Narration,Withdrawal,Deposit,Balance`, `,,,,`, `,,,,`].join("\n");

  assert.throws(
    () => parseStatementWorkbook(buf(csv), "empty.csv"),
    (error: unknown) => error instanceof StatementParseError,
  );
});
