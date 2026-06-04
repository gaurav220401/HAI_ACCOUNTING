"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const setupItems = [
  { title: "General", href: "/settings/general" },
  { title: "Taxes", href: "/settings/taxes" },
  { title: "Currencies", href: "/settings/currencies" },
  { title: "Opening Balances", href: "/settings/opening-balances" },
  { title: "Warehouses", href: "/settings/warehouses" },
  { title: "Reminders", href: "/settings/reminders" },
  { title: "Customer Portal", href: "/settings/customer-portal" },
];

export default function SetupConfigShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={(
              <div className="flex items-center justify-between w-full">
                <div>
                  <div className="text-lg font-semibold">All Settings</div>
                  <div className="text-xs text-muted-foreground">Setup and Configurations</div>
                </div>
                {actions}
              </div>
            )}
          />

          <div className="flex-1 overflow-hidden">
            <div className="h-full grid grid-cols-1 md:grid-cols-[240px_1fr]">
              <aside className="border-r bg-muted/30 overflow-y-auto">
                <div className="p-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2">
                    Setup & Configurations
                  </div>
                  {setupItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              </aside>

              <main className="overflow-y-auto bg-background">
                <div className="p-5 md:p-7">
                  <div className="mb-4">
                    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                    {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
                  </div>
                  {children}
                </div>
              </main>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
