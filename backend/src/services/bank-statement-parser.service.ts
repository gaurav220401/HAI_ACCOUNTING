import * as XLSX from "xlsx";

/**
 * Deterministic bank statement parser for CSV / XLS / XLSX exports.
 *
 * This exists to keep the common case away from the AI extractor entirely.
 * Every Indian bank offers a spreadsheet download of the same statement it
 * renders as a PDF, and a spreadsheet is already structured — parsing it is
 * exact, instant, free, and keeps account data on your own server. It also
 * makes invented transactions structurally impossible: this code either reads a
 * cell or reports that it could not.
 *
 * Layouts differ per bank, so columns are matched by header synonyms rather
 * than position, and amounts/dates are normalised for Indian conventions
 * (lakh grouping, "Cr"/"Dr" suffixes, day-first dates).
 */

export interface ParsedStatementTxn {
  txnDate: Date;
  description: string;
  debit: number;
  credit: number;
  balance?: number;
}

export interface ParsedStatement {
  transactions: ParsedStatementTxn[];
  accountNumber?: string;
  openingBalance?: number;
  closingBalance?: number;
  /** Non-fatal notes worth showing the user (skipped rows, missing columns). */
  warnings: string[];
  /** Which sheet columns were matched, for troubleshooting a bad import. */
  columnMap: Record<string, number>;
}

export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementParseError";
  }
}

const SPREADSHEET_EXTENSIONS = ["csv", "xls", "xlsx", "xlsm", "tsv"];

export function isSpreadsheetStatement(extension?: string, mimeType?: string): boolean {
  const ext = String(extension || "").toLowerCase().replace(".", "").trim();
  if (SPREADSHEET_EXTENSIONS.includes(ext)) return true;

  const mime = String(mimeType || "").toLowerCase();
  return (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    mime === "application/csv" ||
    mime === "text/tab-separated-values"
  );
}

// ─── Header synonyms ────────────────────────────────────────────────────────
// Longest/most specific first — "value date" must not win over "tran date".

const DATE_HEADERS = [
  "transaction date", "txn date", "tran date", "posting date", "date of transaction",
  "trandate", "txndate", "date",
];
const VALUE_DATE_HEADERS = ["value date", "valuedate", "value dt"];
const DESCRIPTION_HEADERS = [
  "transaction remarks", "transaction particulars", "narration", "particulars",
  "description", "remarks", "details", "transaction details", "narrative",
];
const DEBIT_HEADERS = [
  "withdrawal amt", "withdrawal amount", "withdrawal(dr)", "withdrawal (dr)",
  "debit amount", "withdrawals", "withdrawal", "debit", "dr amount", "paid out", "dr",
];
const CREDIT_HEADERS = [
  "deposit amt", "deposit amount", "deposit(cr)", "deposit (cr)",
  "credit amount", "deposits", "deposit", "credit", "cr amount", "paid in", "cr",
];
const BALANCE_HEADERS = [
  "closing balance", "running balance", "balance(inr)", "balance (inr)",
  "balance amount", "balance", "bal",
];
const AMOUNT_HEADERS = ["amount(inr)", "amount (inr)", "amount", "txn amount", "transaction amount"];
const DRCR_HEADERS = ["dr / cr", "dr/cr", "cr/dr", "type", "txn type", "transaction type", "indicator"];
const REF_HEADERS = [
  "cheque no", "chq.no", "chq.no.", "chq no", "ref no", "reference no",
  "reference number", "chq./ref.no.",
];

function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[ ]/g, " ")
    .replace(/[^a-z0-9()/. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches a header cell against a synonym list, preferring the longest hit. */
function matchHeader(cell: string, synonyms: string[]): boolean {
  if (!cell) return false;
  return synonyms.some((s) => cell === s || cell.replace(/\s/g, "") === s.replace(/\s/g, ""));
}

/**
 * Substring matching for headers padded with extra words, e.g. "Withdrawal
 * Amount (INR)".
 *
 * Matching is word-bounded and skips very short synonyms, because naive
 * `includes` is actively dangerous here: "Description" contains "cr" and
 * "Dr / Cr" contains "dr", which silently bound the narration column to credit
 * and the indicator column to debit.
 */
function matchHeaderLoose(cell: string, synonyms: string[]): boolean {
  if (!cell) return false;
  return synonyms.some((s) => {
    if (s.length < 5) return false;
    const escaped = s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(cell);
  });
}

// ─── Value coercion ─────────────────────────────────────────────────────────

/**
 * Parses an Indian-formatted money cell.
 * Handles: 1,52,513.14 · ₹1,234 · (500) · 5,000.00Cr · "-" · blank
 * Returns { value, marker } where marker is "cr" | "dr" | null.
 */
function parseAmountCell(raw: unknown): { value: number; marker: "cr" | "dr" | null } {
  if (raw === null || raw === undefined) return { value: 0, marker: null };

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { value: raw, marker: null } : { value: 0, marker: null };
  }

  let text = String(raw).trim();
  if (!text || text === "-" || text === "--" || text === "NA" || text === "N/A") {
    return { value: 0, marker: null };
  }

  let marker: "cr" | "dr" | null = null;
  const suffix = text.match(/(cr|dr)\.?$/i);
  if (suffix) {
    marker = suffix[1].toLowerCase() as "cr" | "dr";
    text = text.slice(0, suffix.index).trim();
  }

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  // Strip currency symbols, thousands separators (incl. lakh grouping) and spaces.
  text = text.replace(/[₹$€£]/g, "").replace(/(inr|rs\.?)/gi, "").replace(/[,\s]/g, "").trim();
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!text) return { value: 0, marker };

  const value = Number(text);
  if (!Number.isFinite(value)) return { value: 0, marker };
  return { value: negative ? -value : value, marker };
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses a statement date cell.
 *
 * Indian statements are day-first, so 03/04/2025 is 3 April — reading it as
 * 3 March would silently move transactions between months and quarters.
 */
function parseDateCell(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  // Excel serial date (days since 1899-12-30).
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 1 || raw > 60000) return null;
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const text = String(raw).trim();
  if (!text) return null;

  // DD-MMM-YYYY / DD MMM YY
  const alpha = text.match(/^(\d{1,2})[\-\/\s]([a-zA-Z]{3,9})[\-\/\s](\d{2,4})$/);
  if (alpha) {
    const month = MONTHS[alpha[2].slice(0, 4).toLowerCase()] ?? MONTHS[alpha[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = Number(alpha[3].length === 2 ? `20${alpha[3]}` : alpha[3]);
      return buildDate(year, month, Number(alpha[1]));
    }
  }

  // ISO: YYYY-MM-DD
  const iso = text.match(/^(\d{4})[\-\/.](\d{1,2})[\-\/.](\d{1,2})/);
  if (iso) {
    return buildDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // DD/MM/YYYY — day-first.
  const dmy = text.match(/^(\d{1,2})[\-\/.](\d{1,2})[\-\/.](\d{2,4})/);
  if (dmy) {
    let day = Number(dmy[1]);
    let month = Number(dmy[2]);
    // Only reinterpret when the first field cannot be a day.
    if (day > 12 && month <= 12) {
      // already day-first
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const rawYear = dmy[3];
    const year = Number(rawYear.length === 2 ? `20${rawYear}` : rawYear);
    return buildDate(year, month - 1, day);
  }

  return null;
}

function buildDate(year: number, monthIndex: number, day: number): Date | null {
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  // Midday avoids any timezone rollover shifting the calendar date.
  const d = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Sheet scanning ─────────────────────────────────────────────────────────

export type Row = unknown[];

interface ColumnMap {
  date: number;
  valueDate: number;
  description: number;
  debit: number;
  credit: number;
  balance: number;
  amount: number;
  drcr: number;
  ref: number;
}

function emptyColumnMap(): ColumnMap {
  return { date: -1, valueDate: -1, description: -1, debit: -1, credit: -1, balance: -1, amount: -1, drcr: -1, ref: -1 };
}

/**
 * Finds the header row and maps its columns.
 *
 * Statements carry several preamble rows (bank name, account holder, address,
 * period) before the table, so the header cannot be assumed to be row 0.
 */
function locateHeader(rows: Row[]): { index: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 60);

  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map(norm);
    if (cells.filter(Boolean).length < 2) continue;

    const map = emptyColumnMap();

    cells.forEach((cell, col) => {
      if (!cell) return;
      if (map.valueDate === -1 && matchHeader(cell, VALUE_DATE_HEADERS)) { map.valueDate = col; return; }
      if (map.date === -1 && matchHeader(cell, DATE_HEADERS)) { map.date = col; return; }
      if (map.description === -1 && matchHeader(cell, DESCRIPTION_HEADERS)) { map.description = col; return; }
      if (map.debit === -1 && matchHeader(cell, DEBIT_HEADERS)) { map.debit = col; return; }
      if (map.credit === -1 && matchHeader(cell, CREDIT_HEADERS)) { map.credit = col; return; }
      if (map.balance === -1 && matchHeader(cell, BALANCE_HEADERS)) { map.balance = col; return; }
      if (map.drcr === -1 && matchHeader(cell, DRCR_HEADERS)) { map.drcr = col; return; }
      if (map.amount === -1 && matchHeader(cell, AMOUNT_HEADERS)) { map.amount = col; return; }
      if (map.ref === -1 && matchHeader(cell, REF_HEADERS)) { map.ref = col; return; }
    });

    // Second pass with substring matching for headers wrapped in extra words,
    // e.g. "Withdrawal Amount (INR)". Columns already bound by the exact pass
    // are off-limits, so an indicator column like "Dr / Cr" cannot be stolen
    // by the debit matcher.
    const claimed = new Set(Object.values(map).filter((col) => col !== -1));
    cells.forEach((cell, col) => {
      if (!cell || claimed.has(col)) return;
      if (map.date === -1 && matchHeaderLoose(cell, DATE_HEADERS)) { map.date = col; claimed.add(col); }
      else if (map.description === -1 && matchHeaderLoose(cell, DESCRIPTION_HEADERS)) { map.description = col; claimed.add(col); }
      else if (map.debit === -1 && matchHeaderLoose(cell, DEBIT_HEADERS)) { map.debit = col; claimed.add(col); }
      else if (map.credit === -1 && matchHeaderLoose(cell, CREDIT_HEADERS)) { map.credit = col; claimed.add(col); }
      else if (map.balance === -1 && matchHeaderLoose(cell, BALANCE_HEADERS)) { map.balance = col; claimed.add(col); }
      else if (map.amount === -1 && matchHeaderLoose(cell, AMOUNT_HEADERS)) { map.amount = col; claimed.add(col); }
    });

    if (map.date === -1 && map.valueDate !== -1) map.date = map.valueDate;

    const hasMoneyColumn = map.debit !== -1 || map.credit !== -1 || map.amount !== -1;
    if (map.date !== -1 && hasMoneyColumn) {
      return { index: i, map };
    }
  }

  return null;
}

const FOOTER_MARKERS = [
  "computer-generated", "computer generated", "no signature is required",
  "page ", " of ", "contact-us", "end of statement", "total", "opening balance",
  "closing balance", "statement summary", "this is a system",
];

function looksLikeNoise(cells: string[]): boolean {
  const joined = cells.join(" ").trim();
  if (!joined) return true;
  const lower = joined.toLowerCase();
  return FOOTER_MARKERS.some((m) => lower.includes(m)) && cells.filter(Boolean).length <= 3;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

function scanMetadata(rows: Row[], headerIndex: number): {
  accountNumber?: string;
  openingBalance?: number;
  closingBalance?: number;
} {
  const out: { accountNumber?: string; openingBalance?: number; closingBalance?: number } = {};
  const limit = Math.min(headerIndex, 60);

  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map((c) => String(c ?? "").trim());
    const joined = cells.join(" ");
    const lower = joined.toLowerCase();

    if (!out.accountNumber) {
      const m = joined.match(/(?:account\s*(?:no|number|#)\s*[:\-]?\s*)([A-Za-z0-9X*\-]{6,})/i);
      if (m) out.accountNumber = m[1].trim();
    }
    if (out.openingBalance === undefined && lower.includes("opening balance")) {
      const amounts = cells.map(parseAmountCell).filter((a) => a.value !== 0);
      if (amounts.length) out.openingBalance = Math.abs(amounts[amounts.length - 1].value);
    }
    if (out.closingBalance === undefined && lower.includes("closing balance")) {
      const amounts = cells.map(parseAmountCell).filter((a) => a.value !== 0);
      if (amounts.length) out.closingBalance = Math.abs(amounts[amounts.length - 1].value);
    }
  }

  return out;
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function parseStatementWorkbook(buffer: Buffer, fileName = "statement"): ParsedStatement {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  } catch (error: any) {
    throw new StatementParseError(
      `Could not open "${fileName}" as a spreadsheet: ${error?.message || error}`,
    );
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new StatementParseError(`"${fileName}" contains no sheets`);

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  if (!rows.length) throw new StatementParseError(`"${fileName}" is empty`);

  return parseStatementRows(rows, fileName);
}

/**
 * Core row-grid parser shared by every statement source.
 *
 * This is everything `parseStatementWorkbook` used to do after turning a
 * spreadsheet buffer into a `Row[]` grid (each `Row` being one row's cells)
 * — header detection, amount/date coercion, noise filtering, all of it.
 * Pulling it out into its own function, operating purely on that grid, means
 * a PDF statement can be reconstructed into the same grid shape (see
 * `parseStatementPdf` below) and handed to exactly this logic — one trusted
 * implementation of "what a bank statement column means", not a second,
 * weaker one for the format that most needs a reliable one.
 */
export function parseStatementRows(rows: Row[], fileName = "statement"): ParsedStatement {
  const header = locateHeader(rows);
  if (!header) {
    throw new StatementParseError(
      `Could not find a transaction table in "${fileName}". ` +
      "Expected columns for date and withdrawal/deposit (or amount). " +
      "Please upload the statement exactly as downloaded from your bank.",
    );
  }

  const { index: headerIndex, map } = header;
  const warnings: string[] = [];

  if (map.balance === -1) {
    warnings.push(
      "No running balance column was found, so rows cannot be cross-checked against the statement.",
    );
  }
  if (map.description === -1) {
    warnings.push("No narration column was found; descriptions will be blank.");
  }

  const transactions: ParsedStatementTxn[] = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const cells = row.map((c) => String(c ?? "").trim());

    if (looksLikeNoise(cells)) continue;

    const txnDate = parseDateCell(row[map.date]) ??
      (map.valueDate !== -1 ? parseDateCell(row[map.valueDate]) : null);

    const description = map.description !== -1 ? String(row[map.description] ?? "").trim() : "";

    let debit = 0;
    let credit = 0;

    if (map.debit !== -1 || map.credit !== -1) {
      debit = Math.abs(parseAmountCell(map.debit !== -1 ? row[map.debit] : null).value);
      credit = Math.abs(parseAmountCell(map.credit !== -1 ? row[map.credit] : null).value);
    } else if (map.amount !== -1) {
      const parsed = parseAmountCell(row[map.amount]);
      const indicator = map.drcr !== -1 ? norm(row[map.drcr]) : "";
      const isCredit = indicator.startsWith("cr") || indicator.includes("credit") ||
        (!indicator && parsed.value > 0) || parsed.marker === "cr";
      if (isCredit) credit = Math.abs(parsed.value);
      else debit = Math.abs(parsed.value);
    }

    // Continuation line: narration wrapped onto the next row with no date/amount.
    if (!txnDate && debit === 0 && credit === 0) {
      if (description && transactions.length > 0) {
        const last = transactions[transactions.length - 1];
        last.description = `${last.description} ${description}`.trim();
      }
      continue;
    }

    if (!txnDate) {
      skipped += 1;
      continue;
    }
    if (debit === 0 && credit === 0) {
      skipped += 1;
      continue;
    }

    let balance: number | undefined;
    if (map.balance !== -1) {
      const parsed = parseAmountCell(row[map.balance]);
      if (parsed.value !== 0 || String(row[map.balance] ?? "").trim() !== "") {
        // A "Dr" balance means the account is overdrawn.
        balance = parsed.marker === "dr" ? -Math.abs(parsed.value) : parsed.value;
      }
    }

    transactions.push({ txnDate, description, debit, credit, balance });
  }

  if (transactions.length === 0) {
    throw new StatementParseError(
      `No transaction rows could be read from "${fileName}". ` +
      "The table was found but every row was empty or unparseable.",
    );
  }

  if (skipped > 0) {
    warnings.push(`${skipped} row(s) were skipped because they had no usable date or amount.`);
  }

  const meta = scanMetadata(rows, headerIndex);

  return {
    transactions,
    accountNumber: meta.accountNumber,
    openingBalance: meta.openingBalance,
    closingBalance: meta.closingBalance,
    warnings,
    columnMap: {
      date: map.date,
      description: map.description,
      debit: map.debit,
      credit: map.credit,
      balance: map.balance,
      amount: map.amount,
    },
  };
}

// ─── PDF parsing ────────────────────────────────────────────────────────────
//
// A PDF has no cell grid — pdf.js hands back a flat list of text fragments
// per page, each with an (x, y) position. The table is rebuilt by treating
// the header row's x-positions as column anchors (found with the exact same
// locateHeader() used above, fed a synthetic "row" per line of text) and then
// assigning every later fragment to whichever anchor it sits closest to.
// Once that grid exists it is handed to parseStatementRows() unchanged, so a
// PDF gets exactly the same trusted, deterministic parsing a CSV does — no
// second, weaker implementation for the format that most needs a reliable
// one, and no possibility of inventing a row that was never printed.

interface PdfTextFragment {
  str: string;
  x: number;
  y: number;
}

interface PdfTextLine {
  y: number;
  items: PdfTextFragment[];
}

/** Fragments within this many points of each other are the same visual row.
 * Real statement PDFs jitter sub-pixel between columns on one printed line
 * (observed: ~0.25pt on a genuine Bank of Baroda export) — this is well
 * clear of that while staying far short of the gap to the next line. */
const LINE_Y_TOLERANCE = 1.5;

/**
 * A single row band cannot legitimately be taller than a handful of wrapped
 * narration lines. Without this cap, the last row on a page (which has no
 * following row to bound it) would keep absorbing everything printed below
 * it, including the page footer/disclaimer — silently appending footer text
 * onto that row's balance cell and breaking its reconciliation. 80pt is
 * generous (wrapped narration here runs ~11pt across two lines) while being
 * far short of the >500pt gap down to a footer.
 */
const MAX_ROW_SPAN_PT = 80;

/** Groups a page's text fragments into visual lines, top-to-bottom, each
 * line's fragments sorted left-to-right. */
function groupIntoLines(items: PdfTextFragment[]): PdfTextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfTextLine[] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    // Compared against the bucket's first fragment (not the previous one) so
    // a line's total span can never drift past the tolerance.
    if (last && Math.abs(last.y - item.y) <= LINE_Y_TOLERANCE) {
      last.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

interface PdfColumn {
  key: keyof ColumnMap;
  x: number;
  label: string;
}

/** Nearest-anchor column assignment: a fragment belongs to whichever header
 * x-position it sits closest to, which is equivalent to using the midpoints
 * between adjacent headers as column boundaries. */
function nearestColumnKey(x: number, columns: PdfColumn[]): keyof ColumnMap {
  let best = columns[0];
  let bestDist = Math.abs(x - best.x);
  for (let i = 1; i < columns.length; i += 1) {
    const dist = Math.abs(x - columns[i].x);
    if (dist < bestDist) {
      best = columns[i];
      bestDist = dist;
    }
  }
  return best.key;
}

/**
 * Groups a page's text lines into transaction row bands and reads off each
 * band's per-column text.
 *
 * A band starts wherever a line carries a real date in the date column — on
 * every layout seen so far that column is never wrapped onto a second line,
 * so it is the one reliable row boundary. Everything up to MAX_ROW_SPAN_PT
 * below that point (wrapped narration, a debit/credit figure vertically
 * centred against a two-line narration) is folded into the same row.
 * Anything further off — or appearing before the first anchor on a
 * continuation page — is dropped rather than guessed at: it is either a
 * repeated header/page-number or a footer disclaimer, never a transaction.
 */
function reconstructPageRows(lines: PdfTextLine[], columns: PdfColumn[], startIndex: number): Row[] {
  const rows: Row[] = [];
  let bandAnchorY: number | null = null;
  let bandLines: PdfTextLine[] = [];

  const flush = () => {
    if (bandLines.length === 0) return;

    const buckets = new Map<keyof ColumnMap, { y: number; x: number; str: string }[]>();
    for (const line of bandLines) {
      for (const item of line.items) {
        const key = nearestColumnKey(item.x, columns);
        const bucket = buckets.get(key) || [];
        bucket.push({ y: line.y, x: item.x, str: item.str });
        buckets.set(key, bucket);
      }
    }

    // Reading order within a cell: top line before bottom line, left before
    // right — this is what joins a wrapped narration back into one string.
    rows.push(
      columns.map((col) => {
        const bucket = buckets.get(col.key) || [];
        bucket.sort((a, b) => b.y - a.y || a.x - b.x);
        return bucket.map((b) => b.str).join(" ").trim();
      }),
    );

    bandLines = [];
    bandAnchorY = null;
  };

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    const isAnchor = line.items.some(
      (item) => nearestColumnKey(item.x, columns) === "date" && parseDateCell(item.str) !== null,
    );

    if (isAnchor) {
      flush();
      bandAnchorY = line.y;
      bandLines.push(line);
    } else if (
      bandLines.length > 0 &&
      bandAnchorY !== null &&
      bandAnchorY - line.y <= MAX_ROW_SPAN_PT &&
      // The page footer (page number, disclaimer, "Contact-Us") sits close
      // enough below the last row on a page to pass the span check above —
      // real statements were seen doing exactly this. looksLikeNoise() is
      // the same content check the spreadsheet path already trusts to tell
      // a footer from a data row, so it is reused here rather than widening
      // the geometry further and risking real continuation lines instead.
      !looksLikeNoise(line.items.map((it) => it.str))
    ) {
      bandLines.push(line);
    }
    // else: orphan text before the first anchor on this page, or noise
    // stranded far below the last real row on it — dropped.
  }
  flush();

  return rows;
}

// The reconstructed header row is fed back through locateHeader() (inside
// parseStatementRows), so each matched column needs real label text it will
// recognise — the first, most literal synonym for each is enough.
const PDF_COLUMN_LABELS: Record<keyof ColumnMap, string> = {
  date: DATE_HEADERS[0],
  valueDate: VALUE_DATE_HEADERS[0],
  description: DESCRIPTION_HEADERS[0],
  debit: DEBIT_HEADERS[0],
  credit: CREDIT_HEADERS[0],
  balance: BALANCE_HEADERS[0],
  amount: AMOUNT_HEADERS[0],
  drcr: DRCR_HEADERS[0],
  ref: REF_HEADERS[0],
};

/**
 * Deterministic PDF statement parser.
 *
 * A text-based bank statement PDF carries a real text layer with exact
 * positions, which pdf.js reads directly — nothing here is guessed the way
 * an AI vision model guesses. The table's column x-positions are found once
 * from the header row, every later text fragment is assigned to its nearest
 * column, and the reconstructed grid is parsed by the exact same
 * locateHeader() / parseAmountCell() / parseDateCell() logic a CSV export
 * goes through.
 *
 * Throws StatementParseError when no text layer/table can be found at all
 * (a scanned image PDF, for instance) so the caller can fall back to AI
 * extraction as a last resort — the one case this function cannot help with.
 */
export async function parseStatementPdf(buffer: Buffer, fileName = "statement"): Promise<ParsedStatement> {
  // Loaded lazily: pdfjs-dist ships ESM-only, and a spreadsheet import has no
  // reason to pull in a PDF engine at module load time.
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
  try {
    doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      // Untrusted upload — never evaluate embedded PDF functions/scripts.
      isEvalSupported: false,
      verbosity: pdfjsLib.VerbosityLevel.ERRORS,
    }).promise;
  } catch (error: any) {
    throw new StatementParseError(`Could not open "${fileName}" as a PDF: ${error?.message || error}`);
  }

  const pageLines: PdfTextLine[][] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const fragments: PdfTextFragment[] = [];
    for (const item of content.items) {
      const str = (item as { str?: unknown }).str;
      if (typeof str !== "string" || !str.trim()) continue;
      const transform = (item as { transform?: number[] }).transform;
      if (!Array.isArray(transform) || transform.length < 6) continue;
      // transform[4]/[5] are the fragment's x/y in PDF user space (y up).
      fragments.push({ str, x: transform[4], y: transform[5] });
    }
    pageLines.push(groupIntoLines(fragments));
  }

  // Headers are expected near the top of the document, so search only as far
  // as locateHeader() itself would scan a spreadsheet (60 rows) — this also
  // bounds the work done when a PDF's text layer turns out to be unusable.
  const searchRows: Row[] = [];
  const searchPositions: { page: number; line: number }[] = [];
  outer: for (let page = 0; page < pageLines.length; page += 1) {
    for (let line = 0; line < pageLines[page].length; line += 1) {
      if (searchRows.length >= 60) break outer;
      searchRows.push(pageLines[page][line].items.map((it) => it.str));
      searchPositions.push({ page, line });
    }
  }

  const header = locateHeader(searchRows);
  if (!header) {
    throw new StatementParseError(
      `Could not find a transaction table in "${fileName}". ` +
      "This PDF may be a scanned image with no extractable text layer.",
    );
  }

  const { page: headerPage, line: headerLine } = searchPositions[header.index];
  const headerItems = pageLines[headerPage][headerLine].items;

  const columns: PdfColumn[] = [];
  (Object.keys(header.map) as (keyof ColumnMap)[]).forEach((key) => {
    const itemIndex = header.map[key];
    if (itemIndex === -1) return;
    const item = headerItems[itemIndex];
    if (!item) return;
    columns.push({ key, x: item.x, label: PDF_COLUMN_LABELS[key] });
  });

  const dataRows: Row[] = [];
  pageLines.forEach((lines, pageIndex) => {
    const startIndex = pageIndex === headerPage ? headerLine + 1 : 0;
    dataRows.push(...reconstructPageRows(lines, columns, startIndex));
  });

  // Whatever printed above the header (bank name, account holder, statement
  // period) is carried through as preamble rows so scanMetadata() gets the
  // same chance to pick up an account number it has for a spreadsheet.
  const preambleRows: Row[] = pageLines[headerPage]
    .slice(0, headerLine)
    .map((line) => line.items.map((it) => it.str));

  const headerRow: Row = columns.map((col) => col.label);

  return parseStatementRows([...preambleRows, headerRow, ...dataRows], fileName);
}
