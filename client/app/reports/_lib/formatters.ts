export function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function fmtDate(d?: string | null) {
  if (!d) return "-";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtNumber(n?: number) {
  return new Intl.NumberFormat("en-IN").format(n || 0);
}

export function formatTotalMetricValue(key: string, value: unknown): string {
  const numericValue = Number(value || 0);
  const metric = key.toLowerCase();
  const ratioLike = metric.includes("ratio");
  const percentLike = metric.includes("percent") || metric.includes("share");
  const stockLike = metric.includes("stock") && !metric.includes("value");
  const quantityLike =
    metric.includes("count") ||
    metric.includes("qty") ||
    metric.includes("quantity") ||
    metric.includes("items") ||
    metric.includes("lines") ||
    metric.includes("days") ||
    stockLike;

  if (percentLike) return `${numericValue.toFixed(2)}%`;
  if (ratioLike) return numericValue.toFixed(2);
  if (quantityLike) return fmtNumber(numericValue);
  return fmtCurrency(numericValue);
}

export function formatCell(value: unknown, format?: string): string {
  if (value === undefined || value === null) return "-";
  if (format === "currency") return fmtCurrency(Number(value));
  if (format === "date") return fmtDate(String(value));
  if (format === "number") return fmtNumber(Number(value));
  return String(value);
}
