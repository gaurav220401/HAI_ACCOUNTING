"use client";

import { useCallback } from "react";
import { useAuthContext } from "@/contexts/auth-context";

/**
 * Zoho Books modules — mirrors the backend ZohoModule union type.
 */
export type ZohoModule =
  | "dashboard"
  | "contacts"
  | "items"
  | "invoices"
  | "bills"
  | "estimates"
  | "purchase_orders"
  | "sales_orders"
  | "credit_notes"
  | "vendor_credits"
  | "expenses"
  | "timesheet"
  | "projects"
  | "banking"
  | "accounts"
  | "journals"
  | "reports"
  | "tax"
  | "settings"
  | "users"
  | "payroll"
  | "inventory"
  | "documents";

export type PermissionAction =
  | "read"
  | "write"
  | "create"
  | "delete"
  | "approve"
  | "export";

/**
 * usePermission(module, action)
 *
 * Returns `true` if the currently logged-in user has the requested
 * permission on the given module.
 *
 * Admin users always return `true`.
 * Users with no roles always return `false`.
 *
 * The permissions are read from the user profile returned by the auth
 * context. For a full permission matrix the auth-context should include
 * the expanded role permissions (populated from the backend).
 *
 * @example
 *   const canCreateInvoice = usePermission("invoices", "create");
 */
export function usePermission(
  module: ZohoModule,
  action: PermissionAction,
): boolean {
  const { user } = useAuthContext();

  if (!user) return false;

  const roles: string[] = (user as any).roles ?? [];

  // Admins bypass all permission checks
  if (roles.includes("Admin")) return true;

  // If the auth context provides expanded role permissions, check them
  const rolePermissions: Array<{
    module: string;
    [key: string]: unknown;
  }> = (user as any).rolePermissions ?? [];

  if (rolePermissions.length > 0) {
    return rolePermissions.some(
      (p) => p.module === module && p[action] === true,
    );
  }

  // Fallback: no permission info available
  return false;
}

/**
 * usePermissions()
 *
 * Returns a `can(module, action)` helper function for inline checks
 * without calling usePermission repeatedly.
 *
 * @example
 *   const { can } = usePermissions();
 *   if (can("invoices", "create")) { ... }
 */
export function usePermissions() {
  const { user } = useAuthContext();

  const can = useCallback(
    (module: ZohoModule, action: PermissionAction): boolean => {
      if (!user) return false;

      const roles: string[] = (user as any).roles ?? [];
      if (roles.includes("Admin")) return true;

      const rolePermissions: Array<{
        module: string;
        [key: string]: unknown;
      }> = (user as any).rolePermissions ?? [];

      return rolePermissions.some(
        (p) => p.module === module && p[action] === true,
      );
    },
    [user],
  );

  return { can };
}
