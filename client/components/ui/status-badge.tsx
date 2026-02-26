"use client";

import { Badge } from "@/components/ui/badge";

type StatusVariant =
  | "draft"
  | "submitted"
  | "cancelled"
  | "paid"
  | "unpaid"
  | "overdue"
  | "partial"
  | "completed"
  | "active"
  | "inactive"
  | "pending"
  | "closed"
  | "open"
  | "error";

const variantStyles: Record<
  StatusVariant,
  { className: string; label?: string }
> = {
  draft: { className: "bg-gray-100 text-gray-700 border-gray-300" },
  submitted: { className: "bg-blue-100 text-blue-700 border-blue-300" },
  cancelled: { className: "bg-red-100 text-red-700 border-red-300" },
  paid: { className: "bg-green-100 text-green-700 border-green-300" },
  unpaid: { className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  overdue: { className: "bg-red-100 text-red-700 border-red-300" },
  partial: { className: "bg-orange-100 text-orange-700 border-orange-300" },
  completed: { className: "bg-green-100 text-green-700 border-green-300" },
  active: { className: "bg-green-100 text-green-700 border-green-300" },
  inactive: { className: "bg-gray-100 text-gray-500 border-gray-300" },
  pending: { className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  closed: { className: "bg-gray-100 text-gray-600 border-gray-300" },
  open: { className: "bg-blue-100 text-blue-700 border-blue-300" },
  error: { className: "bg-red-100 text-red-700 border-red-300" },
};

// Maps docstatus numbers to variant
const docStatusMap: Record<number, StatusVariant> = {
  0: "draft",
  1: "submitted",
  2: "cancelled",
};

interface StatusBadgeProps {
  /** Named status variant */
  status?: StatusVariant | string;
  /** Or use docstatus number (0=Draft, 1=Submitted, 2=Cancelled) */
  docstatus?: number;
  /** Override the display label */
  label?: string;
  /** Additional class names */
  className?: string;
}

export function StatusBadge({
  status,
  docstatus,
  label,
  className,
}: StatusBadgeProps) {
  let variant: StatusVariant = "draft";

  if (docstatus !== undefined) {
    variant = docStatusMap[docstatus] ?? "draft";
  } else if (status) {
    variant =
      status.toLowerCase().replace(/\s+/g, "") in variantStyles ?
        (status.toLowerCase().replace(/\s+/g, "") as StatusVariant)
      : "draft";
  }

  const displayLabel =
    label ?? (docstatus !== undefined ? variant : (status ?? "Draft"));

  const style = variantStyles[variant] ?? variantStyles.draft;

  return (
    <Badge
      variant="outline"
      className={`capitalize text-xs font-medium ${style.className} ${className ?? ""}`}
    >
      {displayLabel}
    </Badge>
  );
}
