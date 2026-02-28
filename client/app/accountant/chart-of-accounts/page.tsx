"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronDown, Plus, RefreshCw, TreePine } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accountApi, type Account } from "@/lib/api/accounts";

// ─── Build tree from flat list ───────────────────────────────────────────

function buildTree(accounts: Account[]): Account[] {
  const map = new Map<string, Account>();
  accounts.forEach((a) => {
    map.set(a._id, { ...a, children: [] });
  });

  const roots: Account[] = [];
  map.forEach((a) => {
    if (!a.parentId || typeof a.parentId !== "string") {
      roots.push(a);
    } else {
      const parent = map.get(a.parentId as string);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(a);
      } else {
        roots.push(a);
      }
    }
  });

  return roots;
}

// ─── Account Row ─────────────────────────────────────────────────────────

const rootColors: Record<string, string> = {
  Asset: "text-blue-600",
  Liability: "text-red-600",
  Equity: "text-purple-600",
  Income: "text-green-600",
  Expense: "text-orange-600",
};

function AccountRow({
  account,
  depth,
}: {
  account: Account;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = (account.children?.length ?? 0) > 0;
  const colorClass = rootColors[account.rootType] ?? "text-foreground";

  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2 hover:bg-muted/50 cursor-pointer group"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {/* Expand icon */}
        <span className="w-4 shrink-0 text-muted-foreground">
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : null}
        </span>

        {/* Name */}
        <span className={`flex-1 text-sm font-medium ${account.isGroup ? colorClass : "text-foreground"}`}>
          {account.code && (
            <span className="mr-2 text-xs text-muted-foreground">{account.code}</span>
          )}
          {account.name}
        </span>

        {/* Type badge */}
        {account.accountType && (
          <Badge variant="outline" className="hidden group-hover:inline-flex text-xs">
            {account.accountType}
          </Badge>
        )}

        {/* Opening balance */}
        {account.openingBalance !== 0 && (
          <span className="text-xs text-muted-foreground tabular-nums w-28 text-right">
            ₹{account.openingBalance.toLocaleString("en-IN")}
          </span>
        )}
      </div>

      {/* Children */}
      {open && hasChildren && account.children?.map((child) => (
        <AccountRow key={child._id} account={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, needsOrgSetup, loading: orgLoading } = useOrganization();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fetching, setFetching] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (activeOrganization?._id) fetchAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?._id]);

  async function fetchAccounts() {
    if (!activeOrganization) return;
    setFetching(true);
    try {
      const res = await accountApi.list(activeOrganization._id);
      setAccounts(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function handleSeedTemplate() {
    if (!activeOrganization) return;
    setSeeding(true);
    try {
      await accountApi.seedTemplate(activeOrganization._id);
      await fetchAccounts();
    } finally {
      setSeeding(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const tree = buildTree(accounts);

  // Group roots by rootType
  const rootGroups = ["Asset", "Liability", "Equity", "Income", "Expense"];

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>Accountant</BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Chart of Accounts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAccounts}
              disabled={fetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${fetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {accounts.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeedTemplate}
                disabled={seeding}
              >
                <TreePine className="h-4 w-4 mr-1" />
                {seeding ? "Loading..." : "Load Standard Template"}
              </Button>
            )}
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Account
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 flex-col p-6 gap-4">
          <div>
            <h1 className="text-xl font-bold">Chart of Accounts</h1>
            <p className="text-sm text-muted-foreground">
              {accounts.length} accounts across {rootGroups.length} root types
            </p>
          </div>

          {accounts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <TreePine className="h-12 w-12 opacity-40" />
              <div className="text-center">
                <p className="font-medium">No accounts yet</p>
                <p className="text-sm">Load the standard Indian CoA template or create accounts manually.</p>
              </div>
              <Button onClick={handleSeedTemplate} disabled={seeding}>
                {seeding ? "Loading template..." : "Load Standard Template"}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              {/* Column headers */}
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
                <span className="flex-1">Account Name</span>
                <span className="w-28 text-right">Opening Balance</span>
              </div>

              {/* Root groups */}
              {rootGroups.map((rootType) => {
                const roots = tree.filter((a) => a.rootType === rootType);
                if (roots.length === 0) return null;
                return (
                  <div key={rootType}>
                    <div className={`px-4 py-1.5 bg-muted/30 text-xs font-semibold uppercase tracking-wide ${rootColors[rootType]}`}>
                      {rootType}s
                    </div>
                    {roots.map((a) => (
                      <AccountRow key={a._id} account={a} depth={0} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
