"use client";

import { type ReactNode } from "react";
import { useOrganization } from "@/contexts/organization-context";

function ScopedTree({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Remount org-scoped client trees on active organization changes.
 * This ensures pages with one-time effects reload data for the selected org.
 */
export function OrganizationChangeBoundary({ children }: { children: ReactNode }) {
  const { activeOrganization } = useOrganization();
  const orgKey = activeOrganization?._id || "no-org";

  return <ScopedTree key={orgKey}>{children}</ScopedTree>;
}
