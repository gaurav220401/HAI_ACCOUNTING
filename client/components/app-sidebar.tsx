"use client"

import * as React from "react"
import {
  BookOpen,
  ChartBar,
  CreditCard,
  DollarSign,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings2,
  Users,
} from "lucide-react"
import Image from "next/image"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

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
      url: "#",
      icon: DollarSign,
      items: [
        { title: "Chart of Accounts", url: "#" },
        { title: "Journal Entries", url: "#" },
        { title: "Ledger", url: "#" },
      ],
    },
    {
      title: "Transactions",
      url: "#",
      icon: Receipt,
      items: [
        { title: "Income", url: "#" },
        { title: "Expenses", url: "#" },
        { title: "Transfers", url: "#" },
      ],
    },
    {
      title: "Invoices",
      url: "#",
      icon: FileText,
      items: [
        { title: "Create Invoice", url: "#" },
        { title: "All Invoices", url: "#" },
        { title: "Payments", url: "#" },
      ],
    },
    {
      title: "Reports",
      url: "#",
      icon: ChartBar,
      items: [
        { title: "Profit & Loss", url: "#" },
        { title: "Balance Sheet", url: "#" },
        { title: "Cash Flow", url: "#" },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
      items: [
        { title: "General", url: "#" },
        { title: "Team", url: "#" },
        { title: "Billing", url: "#" },
      ],
    },
  ],
  projects: [
    { name: "Clients", url: "#", icon: Users },
    { name: "Subscriptions", url: "#", icon: CreditCard },
    { name: "Reports", url: "#", icon: BookOpen },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard" className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
                  <Image src="/hailogo.png" alt="HAI" width={32} height={32} className="object-cover" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">HAI ACCOUNTING</span>
                  <span className="truncate text-xs text-muted-foreground">Accounting System</span>
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
  )
}
