"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

interface DateRangePickerProps {
  from?: string;
  to?: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
}

export function DateRangePicker({
  from = "",
  to = "",
  onChange,
  className,
}: DateRangePickerProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <div className="relative">
        <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="pl-8 w-[160px]"
          placeholder="From"
        />
      </div>
      <span className="text-muted-foreground text-sm">to</span>
      <div className="relative">
        <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="pl-8 w-[160px]"
          placeholder="To"
        />
      </div>
    </div>
  );
}

// ─── Quick presets ─────────────────────────────────────────────────────

export function DateRangePresets({
  onChange,
}: {
  onChange: (range: { from: string; to: string }) => void;
}) {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const presets = [
    {
      label: "Today",
      range: { from: fmt(today), to: fmt(today) },
    },
    {
      label: "This Week",
      range: {
        from: fmt(
          new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - today.getDay(),
          ),
        ),
        to: fmt(today),
      },
    },
    {
      label: "This Month",
      range: {
        from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: fmt(today),
      },
    },
    {
      label: "This Quarter",
      range: {
        from: fmt(
          new Date(
            today.getFullYear(),
            Math.floor(today.getMonth() / 3) * 3,
            1,
          ),
        ),
        to: fmt(today),
      },
    },
    {
      label: "This Year",
      range: {
        from: fmt(new Date(today.getFullYear(), 0, 1)),
        to: fmt(today),
      },
    },
    {
      label: "Last Month",
      range: {
        from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <Button
          key={p.label}
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange(p.range)}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
