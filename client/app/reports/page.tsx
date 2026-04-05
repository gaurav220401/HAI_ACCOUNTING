"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import {
  reportApi,
  type BalanceSheetResponse,
  type ControlReconciliationResponse,
  type ProfitLossResponse,
  type TrialBalanceResponse,
} from "@/lib/api/reports";
import { cn } from "@/lib/utils";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmtCurrency(n?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export default function ReportsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [tab, setTab] = useState("trial-balance");
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [fetching, setFetching] = useState(false);

  const [trialBalance, setTrialBalance] = useState<TrialBalanceResponse | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossResponse | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetResponse | null>(null);
  const [controlRec, setControlRec] = useState<ControlReconciliationResponse | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  async function loadReports() {
    setFetching(true);
    try {
      const [tb, pl, bs, cr] = await Promise.all([
        reportApi.trialBalance({ asOf }),
        reportApi.profitLoss({ from, to }),
        reportApi.balanceSheet({ asOf }),
        reportApi.controlReconciliation({ asOf }),
      ]);

      setTrialBalance(tb.data);
      setProfitLoss(pl.data);
      setBalanceSheet(bs.data);
      setControlRec(cr.data);
    } catch {
      toast.error("Failed to load reports");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (firebaseUser && !loading) {
      void loadReports();
    }
  }, [firebaseUser, loading]);

  const imbalance = useMemo(() => {
    const diff = trialBalance?.totals?.difference || 0;
    return Math.abs(diff) > 0.009;
  }, [trialBalance]);

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Reports <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Financial Statements</span>
            </span>
          }
          actions={
            <>
              <div className="flex items-center gap-2">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8 w-40" />
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadReports()} disabled={fetching}>
                <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              </Button>
            </>
          }
        />

        <div className="p-6 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList variant="line" className="w-full justify-start gap-2 overflow-x-auto">
              <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
              <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
              <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
              <TabsTrigger value="control-reconciliation">Control Reconciliation</TabsTrigger>
            </TabsList>

            <TabsContent value="trial-balance" className="space-y-3">
              <div className={cn("rounded border p-3 text-sm", imbalance ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>
                {imbalance ? "Trial balance is not balanced. Check missing/reversed entries." : "Trial balance is balanced."}
              </div>
              <div className="rounded border overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[920px]">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2">Code</th>
                        <th className="text-left px-3 py-2">Account</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-right px-3 py-2">Debit</th>
                        <th className="text-right px-3 py-2">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(trialBalance?.rows || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.code || "-"}</td>
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2">{row.rootType}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.closingDebit)}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.closingCredit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t font-semibold">
                      <tr>
                        <td className="px-3 py-2" colSpan={3}>Totals</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(trialBalance?.totals.totalDebit)}</td>
                        <td className="px-3 py-2 text-right">{fmtCurrency(trialBalance?.totals.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="profit-loss" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Total Income</div>
                  <div className="text-lg font-semibold">{fmtCurrency(profitLoss?.totals.totalIncome)}</div>
                </div>
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Total Expense</div>
                  <div className="text-lg font-semibold">{fmtCurrency(profitLoss?.totals.totalExpense)}</div>
                </div>
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Net Profit</div>
                  <div className={cn("text-lg font-semibold", (profitLoss?.totals.netProfit || 0) < 0 ? "text-red-600" : "text-emerald-600")}>
                    {fmtCurrency(profitLoss?.totals.netProfit)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded border bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b font-medium">Income</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(profitLoss?.income || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded border bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b font-medium">Expenses</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(profitLoss?.expenses || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="balance-sheet" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Total Assets</div>
                  <div className="text-lg font-semibold">{fmtCurrency(balanceSheet?.totals.totalAssets)}</div>
                </div>
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Liabilities</div>
                  <div className="text-lg font-semibold">{fmtCurrency(balanceSheet?.totals.totalLiabilities)}</div>
                </div>
                <div className="rounded border bg-white p-3">
                  <div className="text-xs text-muted-foreground">Equity</div>
                  <div className="text-lg font-semibold">{fmtCurrency(balanceSheet?.totals.totalEquity)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded border bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b font-medium">Assets</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(balanceSheet?.assets || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded border bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b font-medium">Liabilities</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(balanceSheet?.liabilities || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded border bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b font-medium">Equity</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(balanceSheet?.equity || []).map((row) => (
                        <tr key={row.accountId} className="border-t">
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2 text-right">{fmtCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="control-reconciliation" className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded border bg-white p-4 space-y-2">
                  <div className="font-medium">Receivables Control</div>
                  <div className="flex justify-between text-sm">
                    <span>GL Balance</span>
                    <span>{fmtCurrency(controlRec?.receivables.glBalance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Subledger Balance</span>
                    <span>{fmtCurrency(controlRec?.receivables.subledgerBalance)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Difference</span>
                    <span>{fmtCurrency(controlRec?.receivables.difference)}</span>
                  </div>
                </div>

                <div className="rounded border bg-white p-4 space-y-2">
                  <div className="font-medium">Payables Control</div>
                  <div className="flex justify-between text-sm">
                    <span>GL Balance</span>
                    <span>{fmtCurrency(controlRec?.payables.glBalance)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Subledger Balance</span>
                    <span>{fmtCurrency(controlRec?.payables.subledgerBalance)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Difference</span>
                    <span>{fmtCurrency(controlRec?.payables.difference)}</span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
