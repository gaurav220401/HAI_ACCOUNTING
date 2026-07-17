"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, PencilLine, RefreshCw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import SetupConfigShell from "@/components/settings/setup-config-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [confirmAdjustmentOpen, setConfirmAdjustmentOpen] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!orgLoading && needsOrgSetup) router.push("/org-setup");
  }, [orgLoading, needsOrgSetup, router]);

  async function loadOpeningBalances(options?: { forceEdit?: boolean }) {
    setFetching(true);
    try {
      const res = await accountApi.getOpeningBalances();
      const data = res.data;
      setMigrationDate(toDateInputValue(data.migrationDate));
      setIsConfigured(Boolean(data.isConfigured));
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

      if (options?.forceEdit !== undefined) {
        setIsEditing(options.forceEdit);
      } else {
        setIsEditing((prev) => (prev ? true : !Boolean(data.isConfigured)));
      }
    } catch {
      toast.error("Failed to load opening balances");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void loadOpeningBalances();
  }, []);

  const visibleGroups = useMemo(() => {
    if (isEditing) return groups;

    return groups
      .map((group) => ({
        ...group,
        accounts: group.accounts.filter((account) => {
          const debit = parseAmount(account.debitInput);
          const credit = parseAmount(account.creditInput);
          return debit > 0 || credit > 0;
        }),
      }))
      .filter((group) => group.accounts.length > 0);
  }, [groups, isEditing]);

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

  async function persistOpeningBalances() {
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
      await loadOpeningBalances({ forceEdit: false });
    } catch {
      toast.error("Failed to save opening balances");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (totals.difference > 0) {
      setConfirmAdjustmentOpen(true);
      return;
    }
    void persistOpeningBalances();
  }

  async function handleEditClick() {
    await loadOpeningBalances({ forceEdit: true });
  }

  return (
    <SetupConfigShell
      title="Opening Balances"
      subtitle="Set debit and credit opening values for each chart account. New accounts created in Chart of Accounts appear here automatically."
      actions={(
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled className="border-slate-100 text-slate-350 bg-slate-50 cursor-not-allowed rounded-md font-medium text-xs py-1 px-3 h-8">
            <Upload className="h-3.5 w-3.5" />
            <span>Import Opening Balances</span>
          </Button>
          <Button type="button" variant="outline" onClick={() => void loadOpeningBalances()} disabled={fetching || saving} className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md font-medium text-xs py-1 px-3 h-8">
            {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span>Refresh</span>
          </Button>
          {isEditing ? (
            <Button onClick={handleSaveClick} disabled={saving || fetching} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5 h-8 text-xs py-1 px-3">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save</span>
            </Button>
          ) : (
            <Button onClick={() => void handleEditClick()} disabled={saving || fetching} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm gap-1.5 h-8 text-xs py-1 px-3">
              <PencilLine className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-6">
        {isConfigured && !isEditing && (
          <div className="rounded-xl border border-teal-150 bg-teal-50/40 p-4 text-xs text-teal-800 leading-relaxed font-medium">
            Opening balances are in view mode. Click <span className="font-semibold text-teal-900">Edit</span> to open all fields and update values.
          </div>
        )}

        <div className="border border-slate-200 bg-white shadow-sm p-6 rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-center">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700">Migration Date</div>
              <Input
                type="date"
                value={migrationDate}
                onChange={(e) => setMigrationDate(e.target.value)}
                disabled={!isEditing}
                className="max-w-[180px] h-9 text-xs"
              />
            </div>
            <div className="text-xs text-slate-500 leading-relaxed max-w-lg">
              This date should match the trial balance date from your previous system. Opening balances are posted as of this date.
            </div>
          </div>
        </div>

        {visibleGroups.map((group, groupIndex) => (
          <section key={group.rootType} className="border border-slate-200 bg-white shadow-sm rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">{ROOT_LABELS[group.rootType] || group.rootType}</h2>
              <Link href="/accountant/chart-of-accounts" className="text-xs text-teal-700 hover:text-teal-800 font-semibold hover:underline">
                New Account
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2 text-left">Accounts</th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2 w-48 text-left">Available Balance</th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2 w-44 text-left">Debit (INR)</th>
                    <th className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2 w-44 text-left">Credit (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.accounts.map((account, accountIndex) => (
                    <tr key={account.accountId} className="border-b border-slate-100 last:border-0 hover:bg-teal-50/20 transition-colors">
                      <td className="px-4 py-2 text-xs font-medium text-slate-750">{account.name}</td>
                      <td className="px-4 py-2 text-xs text-slate-500 font-mono">
                        {account.availableAmount > 0 ? (
                          <span>
                            INR {fmtCurrency(account.availableAmount)}
                            {" "}
                            <span className="text-[10px] uppercase font-semibold">{account.availableSide === "Debit" ? "Dr" : "Cr"}</span>
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={account.debitInput}
                            onChange={(e) => updateDebit(groupIndex, accountIndex, e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        ) : (
                          <span className="font-mono text-xs text-slate-700">{parseAmount(account.debitInput) > 0 ? fmtCurrency(parseAmount(account.debitInput)) : "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={account.creditInput}
                            onChange={(e) => updateCredit(groupIndex, accountIndex, e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        ) : (
                          <span className="font-mono text-xs text-slate-700">{parseAmount(account.creditInput) > 0 ? fmtCurrency(parseAmount(account.creditInput)) : "-"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="border border-slate-200 bg-slate-50/50 p-6 rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between text-slate-600"><span>Total Debit</span><span className="font-mono">{fmtCurrency(totals.totalDebit)}</span></div>
              <div className="flex justify-between text-slate-600"><span>Total Credit</span><span className="font-mono">{fmtCurrency(totals.totalCredit)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-2 border-slate-200 text-slate-800">
                <span>Opening Balance Adjustment</span>
                <span className={cn("font-mono", totals.difference > 0 ? "text-amber-700" : "text-slate-500")}>
                  {totals.difference > 0
                    ? `${fmtCurrency(totals.difference)} ${totals.differenceSide === "Debit" ? "Dr" : "Cr"}`
                    : "0.00"}
                </span>
              </div>
            </div>

            <div className="space-y-2 md:border-l md:pl-8 border-slate-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Final Totals (after adjustment)</div>
              <div className="flex justify-between font-semibold text-slate-700"><span>Debit</span><span className="font-mono">{fmtCurrency(totals.finalDebit)}</span></div>
              <div className="flex justify-between font-semibold text-slate-700"><span>Credit</span><span className="font-mono">{fmtCurrency(totals.finalCredit)}</span></div>
              <div className={cn("text-[11px] font-medium mt-1.5", totals.finalDebit === totals.finalCredit ? "text-emerald-700" : "text-amber-700")}>
                {totals.finalDebit === totals.finalCredit
                  ? "Books are balanced."
                  : "Books are not balanced. Save to post adjustment account automatically."}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={confirmAdjustmentOpen} onOpenChange={setConfirmAdjustmentOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2 text-slate-850">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              Adjustment Required
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed pt-2">
              The total debits and credits differ by {fmtCurrency(totals.difference)} INR.
              You can go back and adjust the balances to remove the difference,
              or continue and the difference will be transferred to the Opening Balance Adjustment account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end gap-2 pt-4">
            <Button
              type="button"
              onClick={() => {
                setConfirmAdjustmentOpen(false);
                void persistOpeningBalances();
              }}
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-sm"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              <span>Continue</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmAdjustmentOpen(false)} disabled={saving} className="border-slate-200 text-slate-650 hover:bg-slate-50 hover:text-slate-900 rounded-md">
              Go Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SetupConfigShell>
  );
}
