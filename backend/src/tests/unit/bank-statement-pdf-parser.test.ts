import assert from "node:assert/strict";
import { test } from "node:test";
import PDFDocument from "pdfkit";
import { parseStatementPdf, StatementParseError } from "../../services/bank-statement-parser.service";

/**
 * parseStatementPdf() has no cell grid to read — it rebuilds one from text
 * fragments positioned by (x, y), the same way pdf.js reports them for a
 * real bank statement. Rather than mock that shape (and risk testing a
 * fiction of pdf.js's output instead of the real thing), these fixtures are
 * genuine PDFs built with pdfkit and fed through the real pdf.js extraction
 * path — the same one a real statement upload goes through.
 *
 * The layout deliberately reproduces two things a real 32-page Bank of
 * Baroda statement was found to do that a naive "one line = one row"
 * reconstruction gets wrong:
 *   - a debit/credit figure printed vertically centred between two wrapped
 *     narration lines, rather than aligned with either one;
 *   - a page footer (page number / contact line / disclaimer) sitting close
 *     enough below the last row that a purely geometric cutoff would still
 *     merge it into that row's cells.
 */

interface TextAt {
  text: string;
  x: number;
  y: number;
}

/** Places each fragment at an exact (x, y) — pdfkit's default word-wrap and
 * flowing cursor would otherwise obscure the positions this module reads. */
function buildPdf(fragments: TextAt[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica").fontSize(9);
    for (const { text, x, y } of fragments) {
      doc.text(text, x, y, { lineBreak: false });
    }
    doc.end();
  });
}

// Column x-positions, chosen to mirror a real statement's layout: a wide
// narration column, a narrow reference-number column between it and the
// amount columns, and right-ish-aligned amount/balance columns.
const COL = {
  date: 50,
  valueDate: 120,
  description: 190,
  ref: 340,
  debit: 400,
  credit: 460,
  balance: 520,
};

function buildStatementPdf(): Promise<Buffer> {
  return buildPdf([
    // Preamble — above the header, scanned for an account number.
    { text: "Statement of Account", x: COL.date, y: 40 },
    { text: "Account No: 123456789012", x: COL.date, y: 55 },

    // Header row (BOB's own labels, including the trailing-period
    // "CHQ.NO." spelling that only an exact synonym match — not a naive
    // substring one — will recognise as a reference-number column).
    { text: "TRAN DATE", x: COL.date, y: 100 },
    { text: "VALUE DATE", x: COL.valueDate, y: 100 },
    { text: "NARRATION", x: COL.description, y: 100 },
    { text: "CHQ.NO.", x: COL.ref, y: 100 },
    { text: "WITHDRAWAL(DR)", x: COL.debit, y: 100 },
    { text: "DEPOSIT(CR)", x: COL.credit, y: 100 },
    { text: "BALANCE(INR)", x: COL.balance, y: 100 },

    // Row 1 — plain single-line row, a credit.
    { text: "01/04/2025", x: COL.date, y: 130 },
    { text: "01/04/2025", x: COL.valueDate, y: 130 },
    { text: "Opening credit", x: COL.description, y: 130 },
    { text: "50,000.00", x: COL.credit, y: 130 },
    { text: "50,000.00Cr", x: COL.balance, y: 130 },

    // Row 2 — two-line wrapped narration, with the debit figure vertically
    // centred between the two lines (not aligned with either), and a stray
    // reference number sitting at the ref column's x — both reproduce the
    // exact layout that corrupted a debit figure on the real statement
    // before the reference column was recognised and the row-band anchor
    // logic accounted for centred amounts.
    { text: "02/04/2025", x: COL.date, y: 160 },
    { text: "02/04/2025", x: COL.valueDate, y: 160 },
    { text: "NEFT PAYMENT TO", x: COL.description, y: 160 },
    { text: "45,000.00Cr", x: COL.balance, y: 160 },
    { text: "5,000.00", x: COL.debit, y: 167 }, // vertically centred
    { text: "778899", x: COL.ref, y: 167 }, // stray reference number
    { text: "SUPPLIES VENDOR", x: COL.description, y: 174 },

    // Row 3 — plain single-line row, a debit.
    { text: "03/04/2025", x: COL.date, y: 190 },
    { text: "03/04/2025", x: COL.valueDate, y: 190 },
    { text: "ATM Withdrawal", x: COL.description, y: 190 },
    { text: "2,000.00", x: COL.debit, y: 190 },
    { text: "43,000.00Cr", x: COL.balance, y: 190 },

    // Page footer, close enough below the last row to land within any
    // reasonable geometric row-height cap — only content-based noise
    // filtering (looksLikeNoise) keeps this out of row 3's cells.
    { text: "27/07/2026 17:34", x: COL.valueDate, y: 205 },
    { text: "Contact-Us@18005700", x: COL.description, y: 205 },
    { text: "Page 1 of 1", x: COL.debit, y: 205 },
    { text: "*This is computer-generated statement.No signature is required.", x: COL.description, y: 218 },
  ]);
}

test("reconstructs a text-based PDF statement's table exactly, including a vertically-centred amount", async () => {
  const buffer = await buildStatementPdf();
  const parsed = await parseStatementPdf(buffer, "synthetic-statement.pdf");

  assert.equal(parsed.transactions.length, 3);
  assert.equal(parsed.accountNumber, "123456789012");

  const [row1, row2, row3] = parsed.transactions;

  assert.equal(row1.credit, 50000);
  assert.equal(row1.debit, 0);
  assert.equal(row1.balance, 50000);
  assert.equal(row1.txnDate.toISOString().slice(0, 10), "2025-04-01");

  // The two wrapped narration lines must be joined, and the vertically
  // centred debit figure must land on this row rather than the next one.
  assert.match(row2.description, /NEFT PAYMENT TO SUPPLIES VENDOR/);
  assert.equal(row2.debit, 5000);
  assert.equal(row2.credit, 0);
  assert.equal(row2.balance, 45000);

  assert.equal(row3.debit, 2000);
  assert.equal(row3.balance, 43000);
  assert.equal(row3.txnDate.toISOString().slice(0, 10), "2025-04-03");
});

test("keeps a reference-number column from bleeding into the withdrawal amount", async () => {
  const buffer = await buildStatementPdf();
  const parsed = await parseStatementPdf(buffer, "synthetic-statement.pdf");

  // Without the CHQ.NO. column being recognised, "778899" (positioned at the
  // reference column's x) would be the nearest unclaimed column to the
  // withdrawal figure and get concatenated onto it — turning a 5,000.00
  // debit into something like 7788995000.
  assert.equal(parsed.transactions[1].debit, 5000);
});

test("does not merge the page footer into the last transaction's cells", async () => {
  const buffer = await buildStatementPdf();
  const parsed = await parseStatementPdf(buffer, "synthetic-statement.pdf");

  assert.equal(parsed.transactions.length, 3);
  const last = parsed.transactions[parsed.transactions.length - 1];
  // A leaked "Page 1 of 1" appended to the balance cell would make this
  // fail to parse as a clean number.
  assert.equal(last.balance, 43000);
  assert.equal(last.debit, 2000);
});

test("every row of the reconstructed PDF reconciles against its own running balance", async () => {
  const buffer = await buildStatementPdf();
  const { transactions } = await parseStatementPdf(buffer, "synthetic-statement.pdf");

  // Rows print oldest-first here (ascending date), so each row's balance is
  // the previous row's balance plus this row's credit minus its debit.
  let checked = 0;
  for (let i = 1; i < transactions.length; i += 1) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    const expected = Number(prev.balance) + curr.credit - curr.debit;
    assert.ok(Math.abs(expected - Number(curr.balance)) < 0.02, `row ${i} does not reconcile`);
    checked += 1;
  }
  assert.equal(checked, 2);
});

test("throws StatementParseError for a PDF with no extractable transaction table", async () => {
  const buffer = await buildPdf([
    { text: "This is just a cover letter, not a statement.", x: 50, y: 100 },
    { text: "Please contact your relationship manager for details.", x: 50, y: 120 },
  ]);

  await assert.rejects(
    () => parseStatementPdf(buffer, "not-a-statement.pdf"),
    (error: unknown) => error instanceof StatementParseError,
  );
});
