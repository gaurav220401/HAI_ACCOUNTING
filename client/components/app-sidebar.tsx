"use client";

import * as React from "react";
import {
  BookOpen,
  Building2,
  ChartBar,
  ClipboardList,
  CreditCard,
  DollarSign,
  Factory,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";
import Image from "next/image";

import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      isActive: true,
      items: [],
    },
    {
      title: "Accounts",
      url: "/accounts",
      icon: DollarSign,
      items: [
        { title: "Chart of Accounts", url: "/accounts/chart-of-accounts" },
        { title: "Journal Entry", url: "/accounts/journal-entry" },
        { title: "General Ledger", url: "/accounts/general-ledger" },
        { title: "Payment Entry", url: "/accounts/payment-entry" },
        { title: "Cost Center", url: "/accounts/cost-center" },
        { title: "Budget", url: "/accounts/budget" },
        { title: "Fiscal Year", url: "/accounts/fiscal-year" },
      ],
    },
    {
      title: "Selling",
      url: "/selling",
      icon: ShoppingCart,
      items: [
        { title: "Customer", url: "/selling/customer" },
        { title: "Quotation", url: "/selling/quotation" },
        { title: "Sales Order", url: "/selling/sales-order" },
        { title: "Sales Invoice", url: "/selling/sales-invoice" },
        { title: "Delivery Note", url: "/selling/delivery-note" },
        { title: "Sales Analytics", url: "/selling/analytics" },
      ],
    },
    {
      title: "Buying",
      url: "/buying",
      icon: Truck,
      items: [
        { title: "Supplier", url: "/buying/supplier" },
        { title: "Purchase Order", url: "/buying/purchase-order" },
        { title: "Purchase Invoice", url: "/buying/purchase-invoice" },
        { title: "Purchase Receipt", url: "/buying/purchase-receipt" },
        { title: "Supplier Quotation", url: "/buying/supplier-quotation" },
      ],
    },
    {
      title: "Stock",
      url: "/stock",
      icon: Warehouse,
      items: [
        { title: "Item", url: "/stock/item" },
        { title: "Warehouse", url: "/stock/warehouse" },
        { title: "Stock Entry", url: "/stock/stock-entry" },
        { title: "Stock Ledger", url: "/stock/stock-ledger" },
        { title: "Stock Reconciliation", url: "/stock/stock-reconciliation" },
        { title: "Item Price", url: "/stock/item-price" },
      ],
    },
    {
      title: "Manufacturing",
      url: "/manufacturing",
      icon: Factory,
      items: [
        { title: "BOM", url: "/manufacturing/bom" },
        { title: "Work Order", url: "/manufacturing/work-order" },
        { title: "Job Card", url: "/manufacturing/job-card" },
        { title: "Production Plan", url: "/manufacturing/production-plan" },
      ],
    },
    {
      title: "Reports",
      url: "/reports",
      icon: ChartBar,
      items: [
        { title: "Profit & Loss", url: "/reports/profit-and-loss" },
        { title: "Balance Sheet", url: "/reports/balance-sheet" },
        { title: "Cash Flow", url: "/reports/cash-flow" },
        { title: "Trial Balance", url: "/reports/trial-balance" },
        { title: "Accounts Receivable", url: "/reports/accounts-receivable" },
        { title: "Accounts Payable", url: "/reports/accounts-payable" },
      ],
    },
    {
      title: "Setup",
      url: "/setup",
      icon: Settings2,
      items: [
        { title: "Company", url: "/setup/company" },
        { title: "Currency", url: "/setup/currency" },
        { title: "Roles & Permissions", url: "/setup/roles" },
        { title: "Users", url: "/setup/users" },
        { title: "Print Format", url: "/setup/print-format" },
        { title: "Naming Series", url: "/setup/naming-series" },
      ],
    },
  ],
  projects: [
    { name: "Assets", url: "/assets", icon: Building2 },
    { name: "Projects", url: "/projects", icon: ClipboardList },
    { name: "Support", url: "/support", icon: Wrench },
    { name: "Quality", url: "/quality", icon: ShieldCheck },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard" className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
                  <Image
                    src="/hailogo.png"
                    alt="HAI"
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">HAI ACCOUNTING</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Accounting System
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
