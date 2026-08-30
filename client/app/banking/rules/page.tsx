"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { categorizationRuleApi, type CategorizationRule } from "@/lib/api/categorization-rules";
import { accountApi, type Account } from "@/lib/api/accounts";

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function matchTypeLabel(type: CategorizationRule["matchType"]): string {
  return type === "upi_vpa" ? "UPI ID" : "Payee name";
}

export default function CategorizationRulesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategorizationRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const load = useCallback(async () => {
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        categorizationRuleApi.list(),
        accountApi.list({ rootType: "Expense,Income", excludeGroups: true }),
      ]);
      setRules(rulesRes.data || []);
      setAccounts(accountsRes.data || []);
    } catch (error) {
      console.error(error);
      toast.error("Could not load your categorization rules");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (rule) =>
        rule.matchValue.toLowerCase().includes(q) ||
        rule.accountName.toLowerCase().includes(q) ||
        (rule.contactName || "").toLowerCase().includes(q),
    );
  }, [rules, search]);

  const onChangeAccount = async (rule: CategorizationRule, accountId: string) => {
    if (accountId === rule.accountId) return;
    setSavingId(rule._id);
    try {
      const res = await categorizationRuleApi.update(rule._id, accountId);
      setRules((prev) =>
        prev.map((r) =>
          r._id === rule._id ? { ...r, accountId: res.data.accountId, accountName: res.data.accountName } : r,
        ),
      );
      toast.success(`Future "${rule.matchValue}" transactions will suggest ${res.data.accountName}`);
    } catch (error) {
      console.error(error);
      toast.error("Could not update this rule");
    } finally {
      setSavingId(null);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await categorizationRuleApi.remove(deleteTarget._id);
      setRules((prev) => prev.filter((r) => r._id !== deleteTarget._id));
      toast.success(`Forgot "${deleteTarget.matchValue}" — it'll go to Suspense until re-taught`);
      setDeleteTarget(null);
    } catch (error) {
      console.error(error);
      toast.error("Could not delete this rule");
    } finally {
      setDeleting(false);
    }
  };

  if (loading || orgLoading || !firebaseUser || (firebaseUser && needsOrgSetup)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2 text-sm font-medium">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => router.push("/banking")}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              Banking / Categorization rules
            </div>
          }
        />

        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              What we've learned
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Every time you categorize a bank transaction against a real account, we remember the
              counterparty so it's suggested automatically next time. This is everything currently
              learned for your organization — fix a mistake here, or forget one entirely if it no
              longer applies.
            </p>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b p-4">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by counterparty or account…"
                  className="h-8 max-w-sm border-0 px-0 shadow-none focus-visible:ring-0"
                />
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {filteredRules.length} of {rules.length}
                </span>
              </div>

              {loadingData ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : rules.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  Nothing learned yet. Categorize a few bank transactions and they'll show up here.
                </div>
              ) : filteredRules.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No rule matches &ldquo;{search}&rdquo;.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Counterparty</TableHead>
                        <TableHead className="w-28">Identified by</TableHead>
                        <TableHead className="w-64">Maps to account</TableHead>
                        <TableHead className="w-20 text-right">Used</TableHead>
                        <TableHead className="w-32">Last applied</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRules.map((rule) => (
                        <TableRow key={rule._id}>
                          <TableCell className="text-sm">
                            <div className="font-medium">{rule.matchValue}</div>
                            {rule.contactName && (
                              <div className="text-xs text-muted-foreground">
                                {rule.contactName}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {matchTypeLabel(rule.matchType)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={rule.accountId ?? undefined}
                                onValueChange={(value) => onChangeAccount(rule, value)}
                                disabled={savingId === rule._id}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {accounts.map((account) => (
                                    <SelectItem key={account._id} value={account._id}>
                                      {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {savingId === rule._id && (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                            {rule.timesApplied}×
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(rule.lastAppliedAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="Forget this rule"
                              onClick={() => setDeleteTarget(rule)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Future transactions from <strong className="text-foreground">{deleteTarget.matchValue}</strong> will
                  stop being auto-suggested as {deleteTarget.accountName} — they'll default to
                  Suspense until you categorize (and teach) it again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Forget rule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
