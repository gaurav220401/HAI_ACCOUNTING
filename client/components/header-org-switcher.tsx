"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganization } from "@/contexts/organization-context";
import type { Organization } from "@/lib/api/organizations";

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

/**
 * Compact org switcher for the top page header bar.
 * Shows org name + chevron; dropdown lists all orgs + add new.
 */
export function HeaderOrgSwitcher() {
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
    await switchOrganization(org);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex h-8 items-center gap-2 px-2 text-sm font-normal"
        >
          {/* Org avatar */}
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${avatarCls}`}
          >
            {activeOrganization ? (
              initials(activeOrganization.name)
            ) : (
              <Building2 className="h-3 w-3" />
            )}
          </div>

          <span className="max-w-[160px] truncate font-medium">{name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-64 rounded-lg shadow-md"
        align="end"
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
                  {org.baseCurrency ?? "—"}
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
  );
}
