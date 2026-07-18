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
  { title: "Email / SMTP", href: "/settings/email" },
  { title: "PayU Integration", href: "/settings/payu" },
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
      <SidebarInset className="bg-white">
        <div className="flex flex-col h-screen overflow-hidden bg-white">
          <PageHeader
            breadcrumb={(
              <span className="flex flex-col text-left">
                <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wide">Settings</span>
                <span className="text-sm font-semibold text-slate-700 mt-0.5">Setup & Configurations</span>
              </span>
            )}
            actions={actions}
          />

          <div className="flex-1 overflow-hidden">
            <div className="h-full grid grid-cols-1 md:grid-cols-[240px_1fr]">
              <aside className="border-r border-slate-200 bg-slate-50/50 overflow-y-auto">
                <div className="p-4 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-2 mb-2">
                    Setup & Configurations
                  </div>
                  {setupItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-lg px-3 py-2 text-sm transition-all my-[2px] font-medium",
                          active
                            ? "bg-teal-50 text-teal-700 font-semibold"
                            : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900",
                        )}
                      >
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              </aside>

              <main className="overflow-y-auto bg-white flex-1">
                <div className="p-6 md:p-8 max-w-5xl mx-auto w-full">
                  <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900">{title}</h1>
                    {subtitle && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{subtitle}</p>}
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
