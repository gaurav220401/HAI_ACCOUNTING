"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { accountApi } from "@/lib/api";
import type { OpeningBalanceAccountRow, OpeningBalanceGroup } from "@/lib/api/accounts";
import { cn } from "@/lib/utils";

type UiRow = OpeningBalanceAccountRow & {
  debitInput: string;
  creditInput: string;
};

type UiGroup = Omit<OpeningBalanceGroup, "accounts"> & {
  accounts: UiRow[];
};

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const n = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const ROOT_LABELS: Record<string, string> = {
  Asset: "Asset",
  Liability: "Liability",
  Equity: "Equity",
  Income: "Income",
  Expense: "Expense",
};

export default function OpeningBalancesSettingsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { loading: orgLoading, needsOrgSetup } = useOrganization();

  const [groups, setGroups] = useState<UiGroup[]>([]);
  const [migrationDate, setMigrationDate] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  async function loadOpeningBalances() {
    setFetching(true);
    try {
      const res = await accountApi.getOpeningBalances();
      const data = res.data;
      setMigrationDate(toDateInputValue(data.migrationDate));
      setGroups(
        (data.groups || []).map((group) => ({
          ...group,
          accounts: group.accounts.map((account) => ({
            ...account,
            debitInput: account.debit > 0 ? String(account.debit) : "",
            creditInput: account.credit > 0 ? String(account.credit) : "",
          })),
        })),
      );
    } catch {
      toast.error("Failed to load opening balances");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void loadOpeningBalances();
  }, []);

  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    for (const group of groups) {
      for (const account of group.accounts) {
        totalDebit += parseAmount(account.debitInput);
        totalCredit += parseAmount(account.creditInput);
      }
    }

    totalDebit = Math.round((totalDebit + Number.EPSILON) * 100) / 100;
    totalCredit = Math.round((totalCredit + Number.EPSILON) * 100) / 100;

    const difference = Math.round((Math.abs(totalDebit - totalCredit) + Number.EPSILON) * 100) / 100;
    const differenceSide =
      difference === 0 ? null : (totalDebit > totalCredit ? "Credit" : "Debit");

    const finalDebit = totalDebit + (differenceSide === "Debit" ? difference : 0);
    const finalCredit = totalCredit + (differenceSide === "Credit" ? difference : 0);

    return {
      totalDebit,
      totalCredit,
      difference,
      differenceSide,
      finalDebit,
      finalCredit,
    };
  }, [groups]);

  function updateDebit(groupIndex: number, accountIndex: number, value: string) {
    setGroups((prev) =>
      prev.map((group, gi) => {
        if (gi !== groupIndex) return group;
        return {
          ...group,
          accounts: group.accounts.map((account, ai) => {
            if (ai !== accountIndex) return account;
            return {
              ...account,
              debitInput: value,
              creditInput: value ? "" : account.creditInput,
            };
          }),
        };
      }),
    );
  }

  function updateCredit(groupIndex: number, accountIndex: number, value: string) {
    setGroups((prev) =>
      prev.map((group, gi) => {
        if (gi !== groupIndex) return group;
        return {
          ...group,
          accounts: group.accounts.map((account, ai) => {
            if (ai !== accountIndex) return account;
            return {
              ...account,
              creditInput: value,
              debitInput: value ? "" : account.debitInput,
            };
          }),
        };
      }),
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = groups.flatMap((group) =>
        group.accounts.map((account) => ({
          accountId: account.accountId,
          debit: parseAmount(account.debitInput),
          credit: parseAmount(account.creditInput),
        })),
      );

      await accountApi.saveOpeningBalances({
        migrationDate: migrationDate || undefined,
        entries,
      });

      toast.success("Opening balances saved");
      await loadOpeningBalances();
    } catch {
      toast.error("Failed to save opening balances");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SetupConfigShell
      title="Opening Balances"
      subtitle="Set debit and credit opening values for each chart account. New accounts created in Chart of Accounts appear here automatically."
      actions={(
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled>
            <Upload className="h-4 w-4" />
            <span className="ml-2">Import Opening Balances</span>
          </Button>
          <Button type="button" variant="outline" onClick={() => void loadOpeningBalances()} disabled={fetching || saving}>
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
          <Button onClick={handleSave} disabled={saving || fetching}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">Save</span>
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-lg border p-4">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-center">
            <div className="space-y-1">
              <div className="text-sm font-medium">Migration Date</div>
              <Input
                type="date"
                value={migrationDate}
                onChange={(e) => setMigrationDate(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              This date should match the trial balance date from your previous system. Opening balances are posted as of this date.
            </div>
          </div>
        </div>

        {groups.map((group, groupIndex) => (
          <section key={group.rootType} className="rounded-lg border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
              <h2 className="font-medium">{ROOT_LABELS[group.rootType] || group.rootType}</h2>
              <Link href="/accountant/chart-of-accounts" className="text-sm text-primary hover:underline">
                New Account
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-4 py-2">Accounts</th>
                    <th className="text-left px-4 py-2 w-48">Available Balance</th>
                    <th className="text-left px-4 py-2 w-44">Debit (INR)</th>
                    <th className="text-left px-4 py-2 w-44">Credit (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {group.accounts.map((account, accountIndex) => (
                    <tr key={account.accountId} className="border-t">
                      <td className="px-4 py-2">{account.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {account.availableAmount > 0 ? (
                          <span>
                            INR {fmtCurrency(account.availableAmount)}
                            {" "}
                            <span className="text-xs uppercase">{account.availableSide === "Debit" ? "Dr" : "Cr"}</span>
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={account.debitInput}
                          onChange={(e) => updateDebit(groupIndex, accountIndex, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={account.creditInput}
                          onChange={(e) => updateCredit(groupIndex, accountIndex, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="rounded-lg border p-5 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between"><span>Total Debit</span><span>{fmtCurrency(totals.totalDebit)}</span></div>
              <div className="flex justify-between"><span>Total Credit</span><span>{fmtCurrency(totals.totalCredit)}</span></div>
              <div className="flex justify-between font-medium">
                <span>Opening Balance Adjustment</span>
                <span className={cn("", totals.difference > 0 ? "text-amber-600" : "text-muted-foreground")}>
                  {totals.difference > 0
                    ? `${fmtCurrency(totals.difference)} ${totals.differenceSide === "Debit" ? "Dr" : "Cr"}`
                    : "0.00"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Final Totals (after adjustment)</div>
              <div className="flex justify-between font-semibold"><span>Debit</span><span>{fmtCurrency(totals.finalDebit)}</span></div>
              <div className="flex justify-between font-semibold"><span>Credit</span><span>{fmtCurrency(totals.finalCredit)}</span></div>
              <div className={cn("text-xs", totals.finalDebit === totals.finalCredit ? "text-emerald-600" : "text-amber-600")}>
                {totals.finalDebit === totals.finalCredit
                  ? "Books are balanced."
                  : "Books are not balanced. Save to post adjustment account automatically."}
              </div>
            </div>
          </div>
        </section>
      </div>
    </SetupConfigShell>
  );
}
