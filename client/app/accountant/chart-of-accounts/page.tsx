"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Settings2, ChevronDown, TreePine, RefreshCw, MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { AccountDialog } from "@/components/account-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountApi, type Account, type UpdateAccountInput } from "@/lib/api/accounts";

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewFilter = "Active" | "Inactive" | "All";

function parentName(account: Account, map: Map<string, Account>) {
  if (!account.parentId) return "—";
  const p = map.get(account.parentId as string);
  return p ? p.name : "—";
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmDelete({
  account,
  onConfirm,
  onCancel,
}: {
  account: Account;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4 border">
        <h2 className="text-base font-semibold">Delete Account</h2>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete&nbsp;
          <strong className="text-foreground">{account.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function AccountRow({
  account,
  accountMap,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  account: Account;
  accountMap: Map<string, Account>;
  onEdit: (a: Account) => void;
  onDelete: (a: Account) => void;
  onToggleActive: (a: Account) => void;
}) {
  return (
    <tr className="group border-b last:border-0 hover:bg-muted/40 transition-colors">
      {/* Checkbox */}
      <td className="w-9 px-3 py-2.5 text-center">
        <input type="checkbox" className="rounded border-muted" />
      </td>

      {/* Account Name */}
      <td className="px-3 py-2.5">
        <span
          className="text-sm text-primary cursor-pointer hover:underline font-medium"
          onClick={() => onEdit(account)}
        >
          {account.name}
        </span>
        {!account.isActive && (
          <span className="ml-2 text-xs text-muted-foreground">(Inactive)</span>
        )}
      </td>

      {/* Account Code */}
      <td className="px-3 py-2.5 text-sm text-muted-foreground">{account.code || "—"}</td>

      {/* Account Type */}
      <td className="px-3 py-2.5 text-sm text-foreground">{account.accountType}</td>

      {/* Documents placeholder */}
      <td className="px-3 py-2.5 text-sm text-muted-foreground">—</td>

      {/* Parent Account */}
      <td className="px-3 py-2.5 text-sm text-muted-foreground">
        {parentName(account, accountMap)}
      </td>

      {/* Gear icon */}
      <td className="w-12 px-2 py-2.5 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-muted text-muted-foreground">
              <Settings2 className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(account)}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(account)}>
              {account.isActive ? "Mark as Inactive" : "Mark as Active"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(account)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChartOfAccountsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { activeOrganization, needsOrgSetup, loading: orgLoading } = useOrganization();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fetching, setFetching] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("Active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (activeOrganization?._id) fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?._id]);

  async function fetchAccounts() {
    setFetching(true);
    try {
      const res = await accountApi.list();
      setAccounts(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function handleSeedTemplate() {
    setSeeding(true);
    try {
      await accountApi.seedTemplate();
      await fetchAccounts();
    } finally {
      setSeeding(false);
    }
  }

  async function handleToggleActive(account: Account) {
    try {
      const payload: UpdateAccountInput = { isActive: !account.isActive };
      await accountApi.update(account._id, payload);
      await fetchAccounts();
    } catch { /* noop */ }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await accountApi.remove(deleteTarget._id);
    } catch { /* noop */ } finally {
      setDeleteTarget(null);
      await fetchAccounts();
    }
  }

  function openCreate() { setEditTarget(null); setDialogOpen(true); }
  function openEdit(account: Account) { setEditTarget(account); setDialogOpen(true); }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const accountMap = new Map(accounts.map((a) => [a._id, a]));
  const displayed = accounts.filter((a) => {
    if (viewFilter === "Active") return a.isActive !== false;
    if (viewFilter === "Inactive") return a.isActive === false;
    return true;
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Accountant <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Chart of Accounts</span>
            </span>
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={fetchAccounts} disabled={fetching} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {accounts.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleSeedTemplate} disabled={seeding} className="gap-1.5">
                  <TreePine className="h-3.5 w-3.5" />
                  {seeding ? "Loading..." : "Load Template"}
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          {accounts.length === 0 ? (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
              <TreePine className="h-12 w-12 opacity-30" />
              <div className="text-center">
                <p className="font-medium text-foreground">No accounts yet</p>
                <p className="text-sm">Load the standard template or create accounts manually.</p>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleSeedTemplate} disabled={seeding} variant="outline">
                  {seeding ? "Loading..." : "Load Standard Template"}
                </Button>
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Account
                </Button>
              </div>
            </div>
          ) : (
            /* Table */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Sub-header */}
              <div className="flex items-center justify-between px-6 py-3 border-b bg-background">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 font-semibold text-base hover:text-primary transition-colors">
                      {viewFilter} Accounts
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-44">
                    {(["Active", "Inactive", "All"] as ViewFilter[]).map((f) => (
                      <DropdownMenuItem
                        key={f}
                        className={viewFilter === f ? "font-semibold" : ""}
                        onClick={() => setViewFilter(f)}
                      >
                        {f} Accounts
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={openCreate} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    New
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem>Sort by</DropdownMenuItem>
                      <DropdownMenuItem>Import Chart of Accounts</DropdownMenuItem>
                      <DropdownMenuItem>Export</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Scrollable table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                    <tr className="border-b">
                      <th className="w-9 px-3 py-2.5" />
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Account Name
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Account Code
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Account Type
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Documents
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Parent Account Name
                      </th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center text-muted-foreground text-sm">
                          No {viewFilter.toLowerCase()} accounts found.
                        </td>
                      </tr>
                    ) : (
                      displayed.map((account) => (
                        <AccountRow
                          key={account._id}
                          account={account}
                          accountMap={accountMap}
                          onEdit={openEdit}
                          onDelete={setDeleteTarget}
                          onToggleActive={handleToggleActive}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer count */}
              <div className="px-6 py-2.5 border-t text-xs text-muted-foreground">
                {displayed.length} account{displayed.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>
      </SidebarInset>

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={fetchAccounts}
        editAccount={editTarget}
        allAccounts={accounts}
      />

      {deleteTarget && (
        <ConfirmDelete
          account={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </SidebarProvider>
  );
}
