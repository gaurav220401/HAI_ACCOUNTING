"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";

import { HeaderOrgSwitcher } from "@/components/header-org-switcher";

interface PageHeaderProps {
  /** Breadcrumb / title area rendered on the left */
  breadcrumb?: React.ReactNode;
  /** Optional extra controls (search, buttons) shown in the right of breadcrumb */
  actions?: React.ReactNode;
}

/**
 * Shared top header bar used by every page.
 * Layout: [SidebarTrigger] [breadcrumb?]  →  [actions?]  →  [OrgSwitcher] | [chat][bell]
 * User name/role and avatar live in the sidebar footer.
 */
export function PageHeader({ breadcrumb, actions }: PageHeaderProps) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white px-4">
        {/* Left: sidebar toggle + optional breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="-ml-1 h-7 w-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" />
          {breadcrumb && (
            <>
              <Separator orientation="vertical" className="h-4 bg-slate-200 shrink-0" />
              <div className="flex items-center min-w-0 text-slate-700">
                {breadcrumb}
              </div>
            </>
          )}
        </div>

        {/* Page-specific actions (search inputs, filter pills, buttons) */}
        {actions && (
          <div className="flex flex-1 items-center gap-2 justify-end">
            {actions}
          </div>
        )}

        {/* Right: Org switcher + bell */}
        <div className={`flex items-center gap-1.5 ${actions ? "" : "ml-auto"}`}>
          <HeaderOrgSwitcher />

          <Separator orientation="vertical" className="h-4 bg-slate-200 mx-1 shrink-0" />

          <button
            type="button"
            className="relative flex items-center justify-center h-8 w-8 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-1 ring-white" />
          </button>
        </div>
      </header>
    </>
  );
}

