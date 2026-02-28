"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HeaderOrgSwitcher } from "@/components/header-org-switcher";

interface PageHeaderProps {
  /** Breadcrumb / title area rendered on the left */
  breadcrumb: React.ReactNode;
  /** Optional extra controls (search, buttons) shown between breadcrumb and org switcher */
  actions?: React.ReactNode;
}

/**
 * Shared top header bar used by every page.
 * Always renders: sidebar trigger | breadcrumb ... [actions] | org switcher
 */
export function PageHeader({ breadcrumb, actions }: PageHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Left: breadcrumb */}
      <div className="flex flex-1 items-center gap-2">
        {breadcrumb}
      </div>

      {/* Right: optional actions + always-visible org switcher */}
      <div className="flex items-center gap-2">
        {actions}
        <Separator orientation="vertical" className="h-4" />
        <HeaderOrgSwitcher />
      </div>
    </header>
  );
}
