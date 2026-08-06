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
const REF_HEADERS = ["cheque no", "chq.no", "chq no", "ref no", "reference no", "reference number", "chq./ref.no."];

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

type Row = unknown[];

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
