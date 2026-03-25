"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock,
  CreditCard,
  FolderOpen,
  Home,
  Package,
  Settings,
  ShoppingCart,
  Truck,
} from "lucide-react";

import { NavUser } from "@/components/nav-user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// ─── Navigation data ────────────────────────────────────────────────────────

type SubItem = { title: string; url: string };
type NavItem =
  | { title: string; url: string; icon: React.ElementType; items?: never }
  | { title: string; url: string; icon: React.ElementType; items: SubItem[] };

const navItems: NavItem[] = [
  {
    title: "Home",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Items",
    url: "/items",
    icon: Package,
    items: [],
  },
  {
    title: "Sales",
    url: "/sales",
    icon: ShoppingCart,
    items: [
      { title: "Customers", url: "/sales/customers" },
      { title: "Quotes", url: "/sales/quotes" },
      { title: "Sales Orders", url: "/sales/orders" },
      { title: "Invoices", url: "/sales/invoices" },
      { title: "Recurring Invoices", url: "/sales/recurring-invoices" },
      { title: "Delivery Challans", url: "/sales/delivery-challans" },
      { title: "Payments Received", url: "/sales/payments-received" },
      { title: "Credit Notes", url: "/sales/credit-notes" },
    ],
  },
  {
    title: "Purchases",
    url: "/purchases",
    icon: Truck,
    items: [
      { title: "Vendors", url: "/purchases/vendors" },
      { title: "Expenses", url: "/purchases/expenses" },
      { title: "Recurring Expenses", url: "/purchases/recurring-expenses" },
      { title: "Purchase Orders", url: "/purchases/orders" },
      { title: "Bills", url: "/purchases/bills" },
      { title: "Recurring Bills", url: "/purchases/recurring-bills" },
      { title: "Payments Made", url: "/purchases/payments-made" },
      { title: "Vendor Credits", url: "/purchases/vendor-credits" },
    ],
  },
  {
    title: "Time Tracking",
    url: "/time-tracking",
    icon: Clock,
    items: [
      { title: "Projects", url: "/time-tracking/projects" },
      { title: "Timesheet", url: "/time-tracking/timesheet" },
    ],
  },
  {
    title: "Banking",
    url: "/banking",
    icon: CreditCard,
  },
  {
    title: "Accountant",
    url: "/accountant",
    icon: BookOpen,
    items: [
      { title: "Manual Journals", url: "/accountant/journal-entries" },
      { title: "Bulk Update", url: "/accountant/bulk-update" },
      { title: "Currency Adjustments", url: "/accountant/currency-adjustments" },
      { title: "Chart of Accounts", url: "/accountant/chart-of-accounts" },
      { title: "Transaction Locking", url: "/accountant/transaction-locking" },
    ],
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
  },
  {
    title: "Documents",
    url: "/documents",
    icon: FolderOpen,
  },
  {
    title: "Settings",
    url: "/settings/email",
    icon: Settings,
    items: [{ title: "Email / SMTP", url: "/settings/email" }],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar" {...props}>
      {/* ── Header: App brand only ── */}
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-3 group-data-[collapsible=icon]:justify-center">
          {/* Logo mark */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background text-xs font-black tracking-tight select-none">
            H
          </div>
          {/* Logotype — hidden when sidebar is icon-only */}
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            HAI Accounting
          </span>
        </div>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive =
                pathname === item.url ||
                (item.url !== "/dashboard" &&
                  pathname.startsWith(item.url + "/"));

              // Flat item (no sub-menu)
              if (!item.items || item.items.length === 0) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              // Collapsible item with sub-menu
              const hasActiveChild = item.items.some(
                (sub) =>
                  pathname === sub.url || pathname.startsWith(sub.url + "/"),
              );
              const defaultOpen = isActive || hasActiveChild;

              return (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={defaultOpen}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((sub) => {
                          const subActive =
                            pathname === sub.url ||
                            pathname.startsWith(sub.url + "/");
                          return (
                            <SidebarMenuSubItem key={sub.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={subActive}
                              >
                                <Link href={sub.url}>{sub.title}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer: User ── */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
