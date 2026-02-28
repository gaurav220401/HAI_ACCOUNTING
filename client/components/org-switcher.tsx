"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
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

export function OrgSwitcher() {
  const router = useRouter();
  const { activeOrganization, organizations, switchOrganization } =
    useOrganization();

  const [open, setOpen] = useState(false);

  const displayName = activeOrganization?.name ?? "Select Organization";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("")
    .toUpperCase();

  async function handleSwitch(org: Organization) {
    setOpen(false);
    await switchOrganization(org);
  }

  function handleCreate() {
    setOpen(false);
    router.push("/org-setup");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {/* Avatar */}
              <div className="flex aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white text-sm font-semibold">
                {initials || "?"}
              </div>

              {/* Name + plan */}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Free Plan
                </span>
              </div>

              <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-60 rounded-lg"
            side="bottom"
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              My Organizations
            </DropdownMenuLabel>

            {organizations.map((org) => {
              const isActive = activeOrganization?._id === org._id;
              const orgInitials = org.name
                .split(" ")
                .slice(0, 2)
                .map((w: string) => w[0])
                .join("")
                .toUpperCase();

              return (
                <DropdownMenuItem
                  key={org._id}
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => handleSwitch(org)}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white text-xs font-semibold">
                    {orgInitials}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium">{org.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Free
                    </p>
                  </div>
                  {isActive && (
                    <Check className="h-4 w-4 text-blue-600 shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer text-muted-foreground"
              onClick={() => {
                setOpen(false);
                router.push("/settings/organizations");
              }}
            >
              <Settings className="h-4 w-4" />
              <span className="text-sm">Manage</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer text-blue-600"
              onClick={handleCreate}
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Create Organization</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
