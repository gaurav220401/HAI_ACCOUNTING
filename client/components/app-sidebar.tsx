"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  CreditCard,
  FolderOpen,
  Home,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  // Sub-menu icons
  Users,
  FileText,
  FileCheck,
  Receipt,
  Coins,
  RefreshCw,
  Sliders,
  Box,
  ArrowRightLeft,
  Download,
  Briefcase,
  Calendar,
  Lock,
  Upload,
  Undo2,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useSidebar,
} from "@/components/ui/sidebar";
import type { Organization } from "@/lib/api/organizations";

// ─── Navigation data ────────────────────────────────────────────────────────

type SubItem = { title: string; url: string; icon?: React.ElementType };
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
    title: "Inventory",
    url: "/inventory",
    icon: Boxes,
    items: [
      { title: "Overview", url: "/inventory", icon: Home },
      { title: "Inventory Adjustments", url: "/inventory/adjustments", icon: Sliders },
      { title: "Packages", url: "/inventory/packages", icon: Box },
      { title: "Shipments", url: "/inventory/shipments", icon: Truck },
      { title: "Move Orders", url: "/inventory/move-orders", icon: ArrowRightLeft },
      { title: "Putaways", url: "/inventory/putaways", icon: Download },
    ],
  },
  {
    title: "Sales",
    url: "/sales",
    icon: ShoppingCart,
    items: [
      { title: "Customers", url: "/sales/customers", icon: Users },
      { title: "Quotes", url: "/sales/quotes", icon: FileText },
      { title: "Sales Orders", url: "/sales/orders", icon: FileCheck },
      { title: "Invoices", url: "/sales/invoices", icon: Receipt },
      { title: "Retainer Invoices", url: "/sales/retainer-invoices", icon: Coins },
      { title: "Recurring Invoices", url: "/sales/recurring-invoices", icon: RefreshCw },
      { title: "Delivery Challans", url: "/sales/delivery-challans", icon: Truck },
      { title: "Payments Received", url: "/sales/payments-received", icon: Coins },
      { title: "Credit Notes", url: "/sales/credit-notes", icon: Undo2 },
    ],
  },
  {
    title: "Purchases",
    url: "/purchases",
    icon: Truck,
    items: [
      { title: "Vendors", url: "/purchases/vendors", icon: Users },
      { title: "Expenses", url: "/purchases/expenses", icon: Coins },
      { title: "Recurring Expenses", url: "/purchases/recurring-expenses", icon: RefreshCw },
      { title: "Purchase Orders", url: "/purchases/orders", icon: FileCheck },
      { title: "Purchase Receives", url: "/purchases/receives", icon: Download },
      { title: "Bills", url: "/purchases/bills", icon: Receipt },
      { title: "Recurring Bills", url: "/purchases/recurring-bills", icon: RefreshCw },
      { title: "Payments Made", url: "/purchases/payments-made", icon: Coins },
      { title: "Vendor Credits", url: "/purchases/vendor-credits", icon: Undo2 },
    ],
  },
  /*
  {
    title: "Time Tracking",
    url: "/time-tracking",
    icon: Clock,
    items: [
      { title: "Projects", url: "/time-tracking/projects", icon: Briefcase },
      { title: "Timesheet", url: "/time-tracking/timesheet", icon: Calendar },
    ],
  },
  */
  /*
  {
    title: "Banking",
    url: "/banking",
    icon: CreditCard,
  },
  */
  {
    title: "Accountant",
    url: "/accountant",
    icon: BookOpen,
    items: [
      { title: "Manual Journals", url: "/accountant/journal-entries", icon: BookOpen },
      // { title: "Bulk Update", url: "/accountant/bulk-update", icon: Upload },
      // { title: "Currency Adjustments", url: "/accountant/currency-adjustments", icon: Coins },
      { title: "Chart of Accounts", url: "/accountant/chart-of-accounts", icon: FileSpreadsheet },
      { title: "Fixed Assets", url: "/accountant/fixed-assets", icon: Box },
      { title: "Transaction Locking", url: "/accountant/transaction-locking", icon: Lock },
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
];


// ─── Helpers ────────────────────────────────────────────────────────────────

const ORG_AVATAR_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-indigo-100 text-indigo-800",
];

function orgAvatarColor(name: string) {
  let code = 0;
  for (let i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return ORG_AVATAR_COLORS[code % ORG_AVATAR_COLORS.length];
}

function nameInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const { dbUser, firebaseUser, signOut } = useAuth();
  const { activeOrganization, organizations, switchOrganization, loading: orgLoading } = useOrganization();
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Derive user display info — use email if no name in DB
  const displayName = dbUser?.name || firebaseUser?.displayName || "";
  const displayEmail = firebaseUser?.email || "";
  const displayRole = (dbUser as any)?.role || "";
  // Show email prefix if no display name, or full email as subtitle
  const shownName = displayName || displayEmail.split("@")[0] || "Account";
  const initials = shownName
    .split(/[\s@._-]+/)
    .slice(0, 2)
    .map((w: string) => w[0] || "")
    .join("")
    .toUpperCase() || "?";

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/login");
    } catch {
      toast.error("Failed to sign out. Please try again.");
    }
  };

  async function handleSwitchOrg(org: Organization) {
    try {
      await switchOrganization(org);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to switch organization");
    }
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar" className="border-r border-slate-200/70 bg-white" {...props}>
      {/* ── Header: App brand ── */}
      <SidebarHeader className="border-b border-slate-100 bg-white p-0">
        <div className="flex items-center gap-2.5 px-4 py-3.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-3 min-h-[57px]">
          {/* Logo */}
          <Image
            src="/hailogo.png"
            alt="HAI Accounting"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-md object-contain"
          />
          {/* Brand text — lighter, not bold */}
          <span className="text-[15px] font-semibold tracking-tight text-slate-700 group-data-[collapsible=icon]:hidden select-none">
            HAI Accounting
          </span>
          {/* Collapse button */}
          <button
            onClick={toggleSidebar}
            type="button"
            className="ml-auto hidden h-6 w-6 items-center justify-center rounded border border-slate-200 text-slate-400 bg-white hover:bg-slate-50 hover:text-slate-600 cursor-pointer transition-colors duration-150 focus:outline-none group-data-[collapsible=icon]:hidden md:flex shrink-0"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="py-2">
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
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={cn(
                        "transition-all duration-150 font-medium my-[1px] h-9 px-3 rounded-lg",
                        isActive
                          ? "text-teal-700 font-semibold bg-teal-50 hover:bg-teal-50 hover:text-teal-700 [&>svg]:text-teal-600"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 [&>svg]:text-slate-400"
                      )}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="text-[13px]">{item.title}</span>
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
                        isActive={isActive || hasActiveChild}
                        tooltip={item.title}
                        className={cn(
                          "transition-all duration-150 font-medium my-[1px] h-9 px-3 rounded-lg",
                          isActive || hasActiveChild
                            ? "text-teal-700 font-semibold bg-teal-50 hover:bg-teal-50 hover:text-teal-700 [&>svg]:text-teal-600"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 [&>svg]:text-slate-400"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="text-[13px]">{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 text-slate-400 size-3.5" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="ml-4 border-l border-slate-100 pl-2 mt-0.5 space-y-[1px]">
                        {item.items.map((sub) => {
                          const subActive =
                            pathname === sub.url ||
                            pathname.startsWith(sub.url + "/");
                          return (
                            <SidebarMenuSubItem key={sub.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={subActive}
                                className={cn(
                                  "transition-all duration-150 h-8 rounded-md px-2 flex items-center gap-2",
                                  subActive
                                    ? "text-teal-700 font-semibold bg-teal-50/60 hover:bg-teal-50"
                                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"
                                )}
                              >
                                <Link href={sub.url} className="text-[12px] flex items-center gap-1.5 w-full">
                                  {sub.icon && <sub.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                                  <span>{sub.title}</span>
                                </Link>
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

      {/* ── Footer: Settings + User account menu ── */}
      <SidebarFooter className="border-t border-slate-100 bg-white p-2 space-y-[2px]">
        {/* Settings link */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              className="transition-all duration-150 font-medium h-9 px-3 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 [&>svg]:text-slate-400"
            >
              <Link href="/settings/general">
                <Settings className="h-4 w-4 shrink-0" />
                <span className="text-[13px]">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* User account dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 hover:bg-slate-100/70 cursor-pointer focus:outline-none",
                isCollapsed && "justify-center px-2"
              )}
            >
              {/* Avatar circle */}
              <div className="h-7 w-7 shrink-0 rounded-full bg-teal-600 text-white flex items-center justify-center text-[11px] font-bold select-none">
                {initials || "?"}
              </div>
              {/* Name + role (hidden when collapsed) */}
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-[12px] font-semibold text-slate-800 truncate leading-none">{shownName}</p>
                {displayRole && (
                  <p className="text-[10px] text-slate-400 truncate leading-none mt-0.5">{displayRole}</p>
                )}
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 group-data-[collapsible=icon]:hidden" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-64 rounded-xl shadow-lg border border-slate-200 bg-white p-1"
          >
            {/* User info at top */}
            <div className="px-3 py-2.5 mb-1">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-teal-600 text-white flex items-center justify-center text-[12px] font-bold">
                  {initials || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900 truncate">{shownName}</p>
                  {displayEmail && (
                    <p className="text-[11px] text-slate-500 truncate">{displayEmail}</p>
                  )}
                </div>
              </div>
            </div>

            <DropdownMenuSeparator className="bg-slate-100 mx-1" />

            {/* Organisation switcher section */}
            {orgLoading ? (
              <>
                <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Organisation
                </DropdownMenuLabel>
                <div className="px-3 py-1 space-y-2.5 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 bg-slate-200 rounded shrink-0" />
                    <div className="h-3.5 w-32 bg-slate-200 rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 bg-slate-200 rounded shrink-0" />
                    <div className="h-3.5 w-24 bg-slate-200 rounded" />
                  </div>
                </div>
                <DropdownMenuSeparator className="bg-slate-100 mx-1" />
              </>
            ) : (
              organizations.length > 0 && (
                <>
                  <DropdownMenuLabel className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Organisation
                  </DropdownMenuLabel>
                  {organizations.map((org) => {
                    const isActive = activeOrganization?._id === org._id;
                    const cls = orgAvatarColor(org.name);
                    const orgInitials = nameInitials(org.name);
                    return (
                      <DropdownMenuItem
                        key={org._id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50"
                        onClick={() => handleSwitchOrg(org)}
                      >
                        <div className={cn("h-6 w-6 shrink-0 rounded-md flex items-center justify-center text-[10px] font-bold", cls)}>
                          {orgInitials}
                        </div>
                        <span className="flex-1 text-[13px] text-slate-700 truncate">{org.name}</span>
                        {isActive && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator className="bg-slate-100 mx-1" />
                </>
              )
            )}

            {/* Log Out */}
            <DropdownMenuItem
              className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus:text-rose-700 focus:bg-rose-50"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="text-[13px] font-medium">Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
