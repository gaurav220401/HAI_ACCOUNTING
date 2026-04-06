"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useOrganization } from "@/contexts/organization-context";
import type { Organization } from "@/lib/api/organizations";

// Deterministic muted background from org name — no blue
const AVATAR_COLORS = [
  "bg-stone-200 text-stone-700",
  "bg-zinc-200 text-zinc-700",
  "bg-neutral-200 text-neutral-700",
  "bg-slate-200 text-slate-700",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
];

function avatarColor(name: string) {
  let code = 0;
  for (let i = 0; i < name.length; i++) code += name.charCodeAt(i);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function OrgSwitcher() {
  const router = useRouter();
  const { activeOrganization, organizations, switchOrganization } =
    useOrganization();
  const [open, setOpen] = useState(false);

  const name = activeOrganization?.name ?? "Select Organization";
  const avatarCls = activeOrganization
    ? avatarColor(activeOrganization.name)
    : "bg-muted text-muted-foreground";

  async function handleSwitch(org: Organization) {
    setOpen(false);
    try {
      await switchOrganization(org);
      // Ensure current route re-renders with the newly active organization.
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch organization";
      toast.error(message);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-12 data-[state=open]:bg-sidebar-accent"
            >
              {/* Org avatar */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold ${avatarCls}`}
              >
                {activeOrganization ? (
                  initials(activeOrganization.name)
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
              </div>

              {/* Name + currency */}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {activeOrganization?.baseCurrency ?? "No organization"}
                </span>
              </div>

              <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-40" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-64 rounded-lg shadow-md"
            side="bottom"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Organizations
            </DropdownMenuLabel>

            {organizations.map((org) => {
              const isActive = activeOrganization?._id === org._id;
              const cls = avatarColor(org.name);
              return (
                <DropdownMenuItem
                  key={org._id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md py-2"
                  onClick={() => handleSwitch(org)}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${cls}`}
                  >
                    {initials(org.name)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium">{org.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {org.baseCurrency ?? "Free"}
                    </p>
                  </div>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                  )}
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="flex cursor-pointer items-center gap-2.5 rounded-md py-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setOpen(false);
                router.push("/org-setup");
              }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed">
                <Plus className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">Add Organization</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
