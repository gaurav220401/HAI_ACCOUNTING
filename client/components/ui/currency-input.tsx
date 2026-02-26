"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value"
> {
  value: number | string;
  onChange: (value: number) => void;
  currency?: string;
  locale?: string;
  decimals?: number;
}

export function CurrencyInput({
  value,
  onChange,
  currency = "INR",
  locale = "en-IN",
  decimals = 2,
  className,
  ...props
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = React.useState("");
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Format number for display
  const formatCurrency = React.useCallback(
    (num: number) => {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(num);
    },
    [locale, currency, decimals],
  );

  // Update display when value changes externally
  React.useEffect(() => {
    if (!isFocused) {
      const num = typeof value === "string" ? parseFloat(value) || 0 : value;
      setDisplayValue(formatCurrency(num));
    }
  }, [value, isFocused, formatCurrency]);

  const handleFocus = () => {
    setIsFocused(true);
    const num = typeof value === "string" ? parseFloat(value) || 0 : value;
    setDisplayValue(num === 0 ? "" : num.toString());
  };

  const handleBlur = () => {
    setIsFocused(false);
    const num = parseFloat(displayValue) || 0;
    const rounded =
      Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    onChange(rounded);
    setDisplayValue(formatCurrency(rounded));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow only numbers, decimal point, and minus sign
    if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
      setDisplayValue(raw);
    }
  };

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`text-right ${className ?? ""}`}
      {...props}
    />
  );
}
