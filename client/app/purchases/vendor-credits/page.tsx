"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { billApi, type Bill } from "@/lib/api/bills";
import {
  vendorCreditApi,
  type VendorCredit,
  type VendorCreditApplication,
} from "@/lib/api/vendor-credits";

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(v?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(v || 0);
}

function getName(field: any): string {
  if (!field) return "";
  if (typeof field === "object") {
    return field.displayName || field.companyName || field.name || "";
  }
  return String(field);
}

export default function VendorCreditsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [credits, setCredits] = useState<VendorCredit[]>([]);
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<VendorCredit | null>(null);
  const [applications, setApplications] = useState<VendorCreditApplication[]>([]);
  const [candidateBills, setCandidateBills] = useState<Bill[]>([]);
  const [applyBillId, setApplyBillId] = useState("");
  const [applyAmount, setApplyAmount] = useState(0);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  async function loadCredits() {
    setFetching(true);
    try {
      const res = await vendorCreditApi.list({ page: 1, limit: 200 });
      setCredits(res.data || []);
    } catch {
      toast.error("Failed to load vendor credits");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (firebaseUser && !loading) void loadCredits();
  }, [firebaseUser, loading]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    try {
      const res = await vendorCreditApi.getOne(id);
      setSelectedCredit(res.data.credit);
      setApplications(res.data.applications || []);

      const vid =
        typeof res.data.credit.vendorId === "object"
          ? res.data.credit.vendorId._id
          : String(res.data.credit.vendorId || "");
      if (vid) {
        const bills = await billApi.list({ vendorId: vid, page: 1, limit: 200 });
        setCandidateBills((bills.data || []).filter((b) => !["Paid", "Void"].includes(b.status)));
      } else {
        setCandidateBills([]);
      }
      setApplyBillId("");
      setApplyAmount(0);
    } catch {
      toast.error("Failed to load vendor credit details");
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return credits;
    const q = search.toLowerCase();
    return credits.filter((c) => {
      return (
        (c.vendorCreditNumber || "").toLowerCase().includes(q) ||
        getName(c.vendorId).toLowerCase().includes(q) ||
        (c.orderNumber || "").toLowerCase().includes(q)
      );
    });
  }, [credits, search]);

  async function handleApply() {
    if (!selectedCredit?._id || !applyBillId || applyAmount <= 0) {
      toast.error("Select bill and amount");
      return;
    }
    try {
      await vendorCreditApi.applyToBill(selectedCredit._id, applyBillId, applyAmount);
      toast.success("Credit applied to bill");
      await loadDetail(selectedCredit._id);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply credit");
    }
  }

  async function handleVoid() {
    if (!selectedCredit?._id) return;
    try {
      await vendorCreditApi.void(selectedCredit._id, "Voided from vendor credit module");
      toast.success("Vendor credit voided");
      await loadDetail(selectedCredit._id);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to void vendor credit");
    }
  }

  async function handleDelete() {
    if (!selectedCredit?._id) return;
    try {
      await vendorCreditApi.remove(selectedCredit._id);
      toast.success("Vendor credit deleted");
      setSelectedId(null);
      setSelectedCredit(null);
      setApplications([]);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete vendor credit");
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-gray-50/40">
        <PageHeader
          breadcrumb={<span className="text-sm font-semibold">All Vendor Credits</span>}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
              </div>
              <Button onClick={() => router.push("/purchases/vendor-credits/new")}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
          }
        />

        {selectedId ? (
          <div className="h-[calc(100vh-120px)] border-t flex">
            <div className="w-[320px] border-r bg-white overflow-y-auto">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center justify-between">
                <span>{fetching ? "Loading..." : `${filtered.length} credits`}</span>
                <button type="button" onClick={() => setSelectedId(null)} className="hover:underline">Close</button>
              </div>
              <div className="divide-y">
                {filtered.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    className={`w-full text-left px-3 py-3 hover:bg-muted/40 ${selectedId === c._id ? "bg-blue-50" : ""}`}
                    onClick={() => loadDetail(c._id)}
                  >
                    <div className="font-medium text-sm truncate">{getName(c.vendorId) || "Vendor"}</div>
                    <div className="text-xs text-blue-600">{c.vendorCreditNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{fmtDate(c.vendorCreditDate)}</div>
                    <div className="text-sm font-semibold mt-1">{fmtCurrency(c.total)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              {!selectedCredit ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a vendor credit</div>
              ) : (
                <div className="p-5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{selectedCredit.vendorCreditNumber}</h2>
                      <p className="text-sm text-muted-foreground">{getName(selectedCredit.vendorId)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => router.push(`/purchases/vendor-credits/${selectedCredit._id}/edit`)}>Edit</Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="gap-1">
                            More <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleVoid}>Void</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={handleDelete}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="font-semibold mt-1">{selectedCredit.status}</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Credit Amount</div>
                      <div className="font-semibold mt-1">{fmtCurrency(selectedCredit.total)}</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-xs text-muted-foreground">Credits Remaining</div>
                      <div className="font-semibold mt-1">{fmtCurrency(selectedCredit.balanceAmount)}</div>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-2 text-sm font-semibold border-b">Items</div>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Rate</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedCredit.lineItems.map((line, idx) => (
                          <tr key={line._id || idx}>
                            <td className="px-3 py-2">{line.name}</td>
                            <td className="px-3 py-2 text-right">{line.quantity}</td>
                            <td className="px-3 py-2 text-right">{fmtCurrency(line.rate)}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmtCurrency(line.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-4 py-3 border-t bg-muted/20 text-sm grid grid-cols-2 gap-2">
                      <div className="flex justify-between"><span>Sub Total</span><span>{fmtCurrency(selectedCredit.subTotal)}</span></div>
                      <div className="flex justify-between"><span>Discount</span><span>{fmtCurrency(selectedCredit.discountAmount)}</span></div>
                      <div className="flex justify-between"><span>Tax</span><span>{fmtCurrency(selectedCredit.taxAmount)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Total</span><span>{fmtCurrency(selectedCredit.total)}</span></div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold">Apply to Bills</div>
                    <div className="grid grid-cols-3 gap-3">
                      <select className="border rounded-md h-9 px-2 text-sm" value={applyBillId} onChange={(e) => setApplyBillId(e.target.value)}>
                        <option value="">Select Bill</option>
                        {candidateBills.map((bill) => (
                          <option key={bill._id} value={bill._id}>
                            {bill.billNumber} ({fmtCurrency(bill.balanceDue)})
                          </option>
                        ))}
                      </select>
                      <Input type="number" placeholder="Amount" value={applyAmount || ""} onChange={(e) => setApplyAmount(Number(e.target.value || 0))} />
                      <Button onClick={handleApply}>Apply to Bills</Button>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="text-sm font-semibold mb-2">Journal</div>
                    <div className="text-xs text-muted-foreground mb-3">Amount is displayed in your base currency INR</div>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left py-1">Account</th>
                          <th className="text-right py-1">Debit</th>
                          <th className="text-right py-1">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1">Accounts Payable</td>
                          <td className="text-right py-1">{fmtCurrency(selectedCredit.total)}</td>
                          <td className="text-right py-1">{fmtCurrency(0)}</td>
                        </tr>
                        <tr>
                          <td className="py-1">Vendor Credits</td>
                          <td className="text-right py-1">{fmtCurrency(0)}</td>
                          <td className="text-right py-1">{fmtCurrency(selectedCredit.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {applications.length > 0 && (
                    <div className="border rounded-lg p-4">
                      <div className="text-sm font-semibold mb-2">Applied Bills</div>
                      <div className="space-y-2 text-sm">
                        {applications.map((ap) => (
                          <div key={ap._id} className="flex items-center justify-between border rounded p-2">
                            <span>{typeof ap.billId === "object" ? ap.billId.billNumber : ap.billId}</span>
                            <span className="font-medium">{fmtCurrency(ap.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-[calc(100vh-120px)] border-t bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{fetching ? "Loading..." : `${filtered.length} vendor credits`}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-[1.1fr_1fr_1.5fr_1fr_1fr_1fr] px-4 py-2 text-xs uppercase text-muted-foreground bg-muted/30">
              <div>Date</div>
              <div>Credit Note#</div>
              <div>Vendor Name</div>
              <div>Status</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Balance</div>
            </div>
            <div className="divide-y">
              {filtered.map((credit) => (
                <button key={credit._id} type="button" className="w-full text-left px-4 py-3 hover:bg-muted/30" onClick={() => loadDetail(credit._id)}>
                  <div className="grid grid-cols-[1.1fr_1fr_1.5fr_1fr_1fr_1fr] items-center text-sm gap-2">
                    <div>{fmtDate(credit.vendorCreditDate)}</div>
                    <div className="text-blue-600">{credit.vendorCreditNumber}</div>
                    <div>{getName(credit.vendorId)}</div>
                    <div>{credit.status}</div>
                    <div className="text-right font-medium">{fmtCurrency(credit.total)}</div>
                    <div className="text-right">{fmtCurrency(credit.balanceAmount)}</div>
                  </div>
                </button>
              ))}
              {!fetching && filtered.length === 0 && (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No vendor credits yet. Create your first vendor credit.
                </div>
              )}
              {fetching && (
                <div className="py-16 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
