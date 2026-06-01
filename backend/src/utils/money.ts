export type MoneyInput = number | string | bigint | null | undefined;

type DecimalParts = {
  units: bigint;
  scale: number;
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

function pow10(exp: number): bigint {
  let out = ONE;
  for (let i = 0; i < Math.max(0, exp); i += 1) out *= TEN;
  return out;
}

function expandExponential(value: string): string {
  const match = value.match(/^([+-]?)(\d*\.?\d+)[eE]([+-]?\d+)$/);
  if (!match) return value;

  const [, sign, coefficient, exponentText] = match;
  const exponent = Number(exponentText);
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function normalizeInput(value: MoneyInput): string {
  if (value === undefined || value === null || value === "") return "0";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : "0";
  const text = String(value)
    .trim()
    .replace(/,/g, "")
    .replace(/[^\d.+\-eE]/g, "");
  return text || "0";
}

function parseDecimal(value: MoneyInput): DecimalParts {
  let text = normalizeInput(value);
  if (!text || text === "." || text === "-" || text === "+") return { units: ZERO, scale: 0 };
  if (/[eE]/.test(text)) text = expandExponential(text);

  const negative = text.startsWith("-");
  text = text.replace(/^[+-]/, "");

  const [wholeRaw = "0", fractionRaw = ""] = text.split(".");
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const fraction = fractionRaw.replace(/\D/g, "");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const unsignedUnits = BigInt(digits);

  return {
    units: negative ? -unsignedUnits : unsignedUnits,
    scale: fraction.length,
  };
}

function roundDecimal(value: DecimalParts, scale = 2): DecimalParts {
  if (value.scale <= scale) {
    return {
      units: value.units * pow10(scale - value.scale),
      scale,
    };
  }

  const divisor = pow10(value.scale - scale);
  const negative = value.units < ZERO;
  const absUnits = negative ? -value.units : value.units;
  let rounded = absUnits / divisor;
  const remainder = absUnits % divisor;

  if (remainder * TWO >= divisor) rounded += ONE;
  if (negative) rounded = -rounded;

  return { units: rounded, scale };
}

function formatDecimal(value: DecimalParts): string {
  const negative = value.units < ZERO;
  const absText = (negative ? -value.units : value.units).toString();

  if (value.scale <= 0) {
    return `${negative && value.units !== ZERO ? "-" : ""}${absText}`;
  }

  const padded = absText.padStart(value.scale + 1, "0");
  const whole = padded.slice(0, -value.scale) || "0";
  const fraction = padded.slice(-value.scale);
  const sign = negative && value.units !== ZERO ? "-" : "";
  return `${sign}${whole}.${fraction}`;
}

function divideParts(left: DecimalParts, right: DecimalParts, scale = 2): DecimalParts {
  if (right.units === ZERO) return { units: ZERO, scale };

  const negative = (left.units < ZERO) !== (right.units < ZERO);
  const numerator = (left.units < ZERO ? -left.units : left.units) * pow10(right.scale + scale);
  const denominator = (right.units < ZERO ? -right.units : right.units) * pow10(left.scale);

  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * TWO >= denominator) quotient += ONE;
  if (negative) quotient = -quotient;

  return { units: quotient, scale };
}

export function decimalToFixed(value: MoneyInput, scale = 2): string {
  return formatDecimal(roundDecimal(parseDecimal(value), scale));
}

export function roundMoney(value: MoneyInput, scale = 2): number {
  return Number(decimalToFixed(value, scale));
}

export function sumMoney(values: MoneyInput[], scale = 2): number {
  const parts = values.map(parseDecimal);
  const maxScale = parts.reduce((max, item) => Math.max(max, item.scale), 0);
  const units = parts.reduce(
    (sum, item) => sum + item.units * pow10(maxScale - item.scale),
    ZERO,
  );
  return Number(formatDecimal(roundDecimal({ units, scale: maxScale }, scale)));
}

export function subtractMoney(left: MoneyInput, right: MoneyInput, scale = 2): number {
  const parsedRight = parseDecimal(right);
  return sumMoney([left, formatDecimal({ units: -parsedRight.units, scale: parsedRight.scale })], scale);
}

export function multiplyMoney(left: MoneyInput, right: MoneyInput, scale = 2): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return Number(formatDecimal(roundDecimal({ units: a.units * b.units, scale: a.scale + b.scale }, scale)));
}

export function divideMoney(left: MoneyInput, right: MoneyInput, scale = 2): number {
  return Number(formatDecimal(divideParts(parseDecimal(left), parseDecimal(right), scale)));
}

export function percentMoney(base: MoneyInput, percent: MoneyInput, scale = 2): number {
  const value = parseDecimal(base);
  const rate = parseDecimal(percent);
  return Number(formatDecimal(divideParts({ units: value.units * rate.units, scale: value.scale + rate.scale }, parseDecimal(100), scale)));
}

export function formatMoney(value: MoneyInput, locale = "en-IN", scale = 2): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(roundMoney(value, scale));
}
