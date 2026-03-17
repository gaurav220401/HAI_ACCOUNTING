"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, MoreHorizontal, PauseCircle, PlayCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { recurringBillApi, type RecurringBill } from "@/lib/api/recurring-bills";
import type { Bill } from "@/lib/api/bills";
import { cn } from "@/lib/utils";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount || 0);
}
function freqLabel(rec: RecurringBill) {
  if (rec.repeatEvery === 1) return rec.frequency;
  return `Every ${rec.repeatEvery} ${rec.frequency === "Daily" ? "Days" : rec.frequency === "Weekly" ? "Weeks" : rec.frequency === "Monthly" ? "Months" : "Years"}`;
}
function statusStyle(status: RecurringBill["status"]) {
  if (status === "Active") return "text-green-600";
  if (status === "Stopped") return "text-orange-600";
  return "text-gray-500";
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("") || "V";
}
function getName(field: unknown): string {
  if (!field) return "";
  if (typeof field === "object" && field !== null) {
    const f = field as Record<string, string>;
    return f.displayName || f.companyName || f.name || "";
  }
  return "";
}

export default function RecurringBillsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [recs, setRecs] = useState<RecurringBill[]>([]);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [childBills, setChildBills] = useState<Bill[]>([]);
  const [loadingChildBills, setLoadingChildBills] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "activities">("overview");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchRecs = useCallback(async () => {
    setFetching(true);
    try {
      const res = await recurringBillApi.list({ page: 1, limit: 200 });
      setRecs(res.data ?? []);
    } catch {
      /* noop */
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading) fetchRecs();
  }, [firebaseUser, loading, fetchRecs]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  const selectedRec = useMemo(
    () => recs.find((r) => r._id === selectedId) ?? null,
    [recs, selectedId]
  );

  const loadChildBills = useCallback(async (id: string) => {
    setLoadingChildBills(true);
    try {
      const res = await recurringBillApi.getBills(id);
      setChildBills(res.data || []);
    } catch {
      setChildBills([]);
    } finally {
      setLoadingChildBills(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadChildBills(selectedId);
  }, [selectedId, loadChildBills]);

  async function handleCreateBill(rec: RecurringBill) {
    try {
      await recurringBillApi.createBillNow(rec._id);
      toast.success("Bill created");
      fetchRecs();
      loadChildBills(rec._id);
    } catch {
      toast.error("Failed to create bill");
    }
  }

  async function handleStop(rec: RecurringBill) {
    try {
      const res = await recurringBillApi.stop(rec._id);
      setRecs((prev) => prev.map((r) => (r._id === rec._id ? res.data : r)));
      toast.success("Recurring bill stopped");
    } catch {
      toast.error("Failed to stop");
    }
  }

  async function handleResume(rec: RecurringBill) {
    try {
      const res = await recurringBillApi.resume(rec._id);
      setRecs((prev) => prev.map((r) => (r._id === rec._id ? res.data : r)));
      toast.success("Recurring bill resumed");
    } catch {
      toast.error("Failed to resume");
    }
  }

  async function handleDelete(rec: RecurringBill) {
    try {
      await recurringBillApi.remove(rec._id);
      setRecs((prev) => prev.filter((r) => r._id !== rec._id));
      if (selectedId === rec._id) setSelectedId(null);
      toast.success("Recurring bill deleted");
    } catch {
      toast.error("Failed to delete");
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-gray-50/50">
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">All Recurring Bills</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1"
                onClick={() => router.push("/purchases/recurring-bills/new")}
              >
                <Plus className="h-4 w-4" /> New
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
          }
        />

        {selectedId ? (
        <div className="flex h-[calc(100vh-120px)] border-t">
          <div className="w-[360px] border-r bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{fetching ? "Loading..." : `${recs.length} Profiles`}</span>
            </div>
            <div className="divide-y">
              {recs.map((rec) => (
                <button
                  key={rec._id}
                  type="button"
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-gray-50",
                    selectedId === rec._id && "bg-blue-50/60"
                  )}
                  onClick={() => setSelectedId(rec._id)}
                >
                  <div className="flex items-start gap-3">
                    <input type="checkbox" aria-label={`Select ${rec.profileName}`} onClick={(e) => e.stopPropagation()} className="mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-gray-900 truncate">{getName(rec.vendorId) || "Vendor"}</div>
                        <div className="text-sm font-semibold">{fmtCurrency(rec.total || 0)}</div>
                      </div>
                      <div className="text-xs text-blue-600 truncate">{rec.profileName}</div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>{freqLabel(rec)}</span>
                        <span>Next Bill on {fmtDate(rec.nextBillDate)}</span>
                      </div>
                      <div className={cn("text-[10px] uppercase font-semibold mt-1", statusStyle(rec.status))}>{rec.status}</div>
                    </div>
                  </div>
                </button>
              ))}
              {recs.length === 0 && !fetching && (
                <div className="px-6 py-8 text-sm text-muted-foreground">No recurring bills</div>
              )}
            </div>
          </div>

          <div className="flex-1 bg-white overflow-y-auto">
            {!selectedRec ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a recurring bill to view details.
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedRec.profileName}</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/purchases/recurring-bills/${selectedRec._id}/edit`)}>
                      Edit
                    </Button>
                    <Button size="sm" onClick={() => handleCreateBill(selectedRec)}>
                      Create Bill
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          More <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {selectedRec.status === "Active" ? (
                          <DropdownMenuItem onClick={() => handleStop(selectedRec)}>
                            <PauseCircle className="h-3.5 w-3.5 mr-2" /> Stop
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleResume(selectedRec)}>
                            <PlayCircle className="h-3.5 w-3.5 mr-2" /> Resume
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(selectedRec)}>
                          <X className="h-3.5 w-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-4 border-b">
                  <div className="flex gap-6 text-sm">
                    <button
                      className={cn("pb-2", activeTab === "overview" && "border-b-2 border-primary text-primary")}
                      onClick={() => setActiveTab("overview")}
                    >
                      Overview
                    </button>
                    <button
                      className={cn("pb-2", activeTab === "activities" && "border-b-2 border-primary text-primary")}
                      onClick={() => setActiveTab("activities")}
                    >
                      Recent Activities
                    </button>
                  </div>
                </div>

                {activeTab === "overview" ? (
                  <div className="mt-4 space-y-6">
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="col-span-1 border rounded-lg p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
                          {initials(getName(selectedRec.vendorId))}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Vendor</div>
                          <div className="font-semibold text-blue-600 truncate max-w-[160px]">{getName(selectedRec.vendorId)}</div>
                        </div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Bill Amount</div>
                        <div className="font-semibold">{fmtCurrency(selectedRec.total || 0)}</div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Next Bill Date</div>
                        <div className="font-semibold">{fmtDate(selectedRec.nextBillDate)}</div>
                      </div>
                      <div className="col-span-1 border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Recurring Period</div>
                        <div className="font-semibold">{freqLabel(selectedRec)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 text-sm">
                      <div className="border rounded-lg p-4">
                        <div className="text-xs text-muted-foreground">Details</div>
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Profile Status</span>
                            <Badge className={cn(
                              selectedRec.status === "Active" ? "bg-green-100 text-green-700" : selectedRec.status === "Stopped" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"
                            )}>
                              {selectedRec.status}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Start Date</span>
                            <span>{fmtDate(selectedRec.startDate)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">End Date</span>
                            <span>{selectedRec.neverExpires ? "Never Expires" : fmtDate(selectedRec.endsOn)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Payment Terms</span>
                            <span>{(selectedRec.paymentTermsId as any)?.name || "—"}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">All Child Bills</div>
                          <Button variant="ghost" size="sm" className="text-xs gap-1">
                            All Child Bills <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="border rounded-lg mt-2 overflow-hidden">
                          {loadingChildBills ? (
                            <div className="flex items-center justify-center h-24">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : childBills.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No child bills yet</div>
                          ) : (
                            <div className="divide-y">
                              {childBills.map((b) => (
                                <div key={b._id} className="flex items-center justify-between px-4 py-3">
                                  <div className="text-sm">
                                    <button
                                      className="text-blue-600 hover:underline"
                                      onClick={() => router.push(`/purchases/bills?billId=${b._id}`)}
                                    >
                                      {b.billNumber}
                                    </button>
                                    <span className="text-muted-foreground ml-2">{fmtDate(b.billDate)}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold">{fmtCurrency(b.total || 0)}</div>
                                    <div className={cn(
                                      "text-[10px] uppercase font-bold",
                                      b.status === "Paid" ? "text-green-600" : b.status === "Void" ? "text-gray-500" : "text-orange-600"
                                    )}>
                                      {b.status}
                                    </div>
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => router.push(`/purchases/bills?billId=${b._id}`)}>
                                    Record Payment
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                    There are no Recent Activities
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        ) : (
        <div className="h-[calc(100vh-120px)] border-t bg-white overflow-y-auto">
          <div className="sticky top-0 bg-white border-b">
            <div className="px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{fetching ? "Loading..." : `${recs.length} Profiles`}</span>
            </div>
            <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-gray-50">
              <div className="flex items-center justify-center">
                <input type="checkbox" aria-label="Select all" />
              </div>
              <div>Vendor Name</div>
              <div>Profile Name</div>
              <div>Frequency</div>
              <div>Last Bill Date</div>
              <div>Next Bill Date</div>
              <div>Status</div>
              <div className="text-right">Amount</div>
            </div>
          </div>
          <div className="divide-y">
            {recs.map((rec) => (
              <button
                key={rec._id}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
                onClick={() => setSelectedId(rec._id)}
              >
                <div className="grid grid-cols-[28px_2fr_1.5fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-3 items-center text-sm">
                  <div className="flex items-center justify-center">
                    <input type="checkbox" aria-label={`Select ${rec.profileName}`} onClick={(e) => e.stopPropagation()} />
                  </div>
                  <div className="font-medium text-gray-900 truncate">{getName(rec.vendorId) || "Vendor"}</div>
                  <div className="text-blue-600 truncate">{rec.profileName}</div>
                  <div className="text-gray-700">{freqLabel(rec)}</div>
                  <div className="text-gray-600">{fmtDate(rec.lastBillDate)}</div>
                  <div className="text-gray-600">{fmtDate(rec.nextBillDate)}</div>
                  <div className={cn("text-xs font-semibold uppercase", statusStyle(rec.status))}>{rec.status}</div>
                  <div className="text-right font-semibold">{fmtCurrency(rec.total || 0)}</div>
                </div>
              </button>
            ))}
            {recs.length === 0 && !fetching && (
              <div className="px-6 py-8 text-sm text-muted-foreground">No recurring bills</div>
            )}
          </div>
        </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
