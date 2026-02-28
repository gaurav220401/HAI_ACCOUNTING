/**
 * multiCurrency.ts
 *
 * Utility types and helpers for multi-currency amounts throughout HAI Accounting.
 *
 * Every monetary value that may involve foreign currencies is stored as a
 * `MoneyValue` object carrying:
 *   - `amount`        — the value in the transaction currency
 *   - `currency`      — ISO 4217 currency code (e.g. "USD", "INR")
 *   - `exchangeRate`  — rate used to convert to the organisation's base currency
 *   - `baseAmount`    — amount already converted to base currency
 *
 * This matches the Zoho Books multi-currency pattern.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface MoneyValue {
  /** Value in the transaction / foreign currency */
  amount: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Exchange rate: 1 unit of `currency` = `exchangeRate` units of base currency */
  exchangeRate: number;
  /** Converted amount in the organisation's base currency */
  baseAmount: number;
}

/** Mongoose sub-schema definition (use with schema.add or inline) */
export const moneyValueSchemaDef = {
  amount: { type: Number, required: true, default: 0, min: 0 },
  currency: { type: String, required: true, default: "INR", uppercase: true, trim: true },
  exchangeRate: { type: Number, required: true, default: 1, min: 0 },
  baseAmount: { type: Number, required: true, default: 0, min: 0 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a MoneyValue object.
 *
 * @param amount         — amount in transaction currency
 * @param currency       — ISO 4217 code of the transaction currency
 * @param exchangeRate   — rate to convert to base currency (default 1)
 * @param baseCurrency   — organisation base currency (informational only)
 */
export function createMoneyValue(
  amount: number,
  currency: string,
  exchangeRate = 1,
): MoneyValue {
  return {
    amount,
    currency: currency.toUpperCase(),
    exchangeRate,
    baseAmount: roundCurrency(amount * exchangeRate),
  };
}

/**
 * Convert a MoneyValue to a different currency using a new exchange rate.
 */
export function convertMoneyValue(
  money: MoneyValue,
  targetCurrency: string,
  newExchangeRate: number,
): MoneyValue {
  return createMoneyValue(money.amount, targetCurrency, newExchangeRate);
}

/**
 * Add two MoneyValues.  Both must be in the same `currency`; `baseAmount`
 * is summed using their respective base amounts.
 *
 * Throws if currencies differ (caller must convert first).
 */
export function addMoneyValues(a: MoneyValue, b: MoneyValue): MoneyValue {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot add different currencies: ${a.currency} + ${b.currency}`,
    );
  }
  const amount = roundCurrency(a.amount + b.amount);
  return {
    amount,
    currency: a.currency,
    exchangeRate: a.exchangeRate,
    baseAmount: roundCurrency(a.baseAmount + b.baseAmount),
  };
}

/**
 * Round a monetary value to 2 decimal places.
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format a MoneyValue for display.
 *
 * @example formatMoney({ amount: 1234.5, currency: "USD", ... }) → "USD 1,234.50"
 */
export function formatMoney(
  money: MoneyValue,
  locale = "en-IN",
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: 2,
    }).format(money.amount);
  } catch {
    return `${money.currency} ${money.amount.toFixed(2)}`;
  }
}

/**
 * Zero-value MoneyValue in a given currency.
 */
export function zeroMoney(currency = "INR"): MoneyValue {
  return { amount: 0, currency: currency.toUpperCase(), exchangeRate: 1, baseAmount: 0 };
}
