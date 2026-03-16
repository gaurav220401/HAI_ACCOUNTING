"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Loader2, MoreHorizontal, Trash2,
  ChevronDown, Pencil, Mail, Printer, CheckCircle,
  X, FileText, Download, ArrowUpDown, Upload, History, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { billApi, type Bill, type BillStatus } from "@/lib/api/bills";
import { contactApi } from "@/lib/api/contacts";
import { itemApi } from "@/lib/api/items";
import { accountApi } from "@/lib/api/accounts";
import { cn } from "@/lib/utils";

const fmtCur = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const statusColor: Record<BillStatus, string> = {
  Draft: "text-gray-500",
  Open: "text-blue-600",
  Overdue: "text-red-600",
  "Partially Paid": "text-orange-600",
  Paid: "text-green-600",
  Void: "text-slate-500",
};

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

export default function BillsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [bills, setBills] = useState<Bill[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | BillStatus>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Bill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showFilterDD, setShowFilterDD] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  const fetchBills = useCallback(async () => {
    setFetching(true);
    try {
      const res = await billApi.list({ 
        page: 1, 
        limit: 100,
      });
      setBills(res.data ?? []);
    } catch { /* noop */ } finally { setFetching(false); }
  }, []);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchBills();
  }, [firebaseUser, loading, activeOrganization?._id, fetchBills]);

  const filtered = bills.filter((b) => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [b.billNumber, b.referenceNumber || "", getName(b.vendorId)].some((v) => v.toLowerCase().includes(s));
  });

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await billApi.remove(toDelete._id);
      toast.success("Bill deleted");
      setBills((prev) => prev.filter((b) => b._id !== toDelete._id));
      if (selectedId === toDelete._id) setSelectedId(null);
    } catch { toast.error("Failed to delete"); } finally { setDeleting(false); setToDelete(null); }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={(
              <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-1 text-base font-semibold hover:text-primary">
                    {filterStatus ? `${filterStatus} Bills` : "All Bills"} <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => { setFilterStatus(""); setShowFilterDD(false); }}>All Bills</DropdownMenuItem>
                  {["Draft", "Open", "Overdue", "Partially Paid", "Paid", "Void"].map(s => (
                    <DropdownMenuItem key={s} onClick={() => { setFilterStatus(s as BillStatus); setShowFilterDD(false); }}>{s}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            actions={(
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-8 gap-1 text-sm bg-blue-600 hover:bg-blue-700" onClick={() => router.push("/purchases/bills/new")}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-gray-200">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[200px] p-0 overflow-hidden">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-blue-600 hover:text-white group">
                        <ArrowUpDown className="h-4 w-4 text-blue-600 group-hover:text-white" />
                        <span className="flex-1">Sort by</span>
                        <ChevronRight className="h-4 w-4" />
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-[180px] p-0">
                        {["Created Time", "Date", "Bill#", "Vendor Name", "Amount", "Due Date"].map((s) => (
                          <DropdownMenuItem key={s} className="px-3 py-2 text-[13px] hover:bg-gray-100">{s}</DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator className="m-0" />
                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Download className="h-4 w-4 text-blue-600" />
                      <span>Import Bills</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-gray-50">
                      <Upload className="h-4 w-4 text-blue-600" />
                      <span>Export Bills</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />

          <div className="flex flex-1 overflow-hidden">
            {/* List side */}
            <div className={cn("flex-1 flex flex-col bg-white border-r", selectedId && "hidden lg:flex w-[400px] max-w-[400px]")}>
              <div className="p-4 border-b space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search Bills"
                    className="pl-9 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {fetching ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm">Fetching bills...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4 px-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
                      <FileText className="h-8 w-8 text-gray-300" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">No bills found</h3>
                      <p className="text-sm text-gray-500 mt-1">Try changing your filters or create a new bill.</p>
                    </div>
                    <Button onClick={() => router.push("/purchases/bills/new")} className="bg-blue-600">Create New Bill</Button>
                  </div>
                ) : (
                  <div className="divide-y overflow-hidden">
                    {filtered.map((b) => (
                      <div
                        key={b._id}
                        className={cn(
                          "p-4 cursor-pointer hover:bg-blue-50/50 transition-colors relative group",
                          selectedId === b._id && "bg-blue-50 shadow-inner"
                        )}
                        onClick={() => setSelectedId(b._id)}
                      >
                        {selectedId === b._id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600" />}
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-primary">{getName(b.vendorId)}</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">₹{fmtCur(b.total)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                            <span>{b.billNumber}</span>
                            <span>•</span>
                            <span>{new Date(b.billDate).toLocaleDateString("en-IN")}</span>
                          </div>
                          <span className={cn("text-[11px] font-bold uppercase tracking-wider", statusColor[b.status])}>{b.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Detail side */}
            <div className={cn("flex-1 bg-white overflow-hidden flex flex-col", !selectedId && "hidden lg:flex items-center justify-center")}>
              {selectedId ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-bold">Bill Details</h2>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="p-8 flex-1 overflow-y-auto space-y-6">
                    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                       <div className="flex justify-between items-start">
                          <div>
                             <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Vendor</p>
                             <p className="text-xl font-bold mt-1">{getName(bills.find(b => b._id === selectedId)?.vendorId)}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-sm text-muted-foreground">Bill Amount</p>
                             <p className="text-3xl font-bold text-blue-600">₹{fmtCur(bills.find(b => b._id === selectedId)?.total || 0)}</p>
                          </div>
                       </div>
                       <div className="grid grid-cols-2 gap-8 pt-4 border-t">
                          <div>
                             <p className="text-xs text-muted-foreground font-bold uppercase">Bill#</p>
                             <p className="text-sm font-medium">{bills.find(b => b._id === selectedId)?.billNumber}</p>
                          </div>
                          <div>
                             <p className="text-xs text-muted-foreground font-bold uppercase">Bill Date</p>
                             <p className="text-sm font-medium">{new Date(bills.find(b => b._id === selectedId)?.billDate || "").toLocaleDateString("en-IN")}</p>
                          </div>
                          <div>
                             <p className="text-xs text-muted-foreground font-bold uppercase">Status</p>
                             <p className={cn("text-sm font-bold", statusColor[bills.find(b => b._id === selectedId)?.status || "Draft"])}>{bills.find(b => b._id === selectedId)?.status}</p>
                          </div>
                          <div>
                             <p className="text-xs text-muted-foreground font-bold uppercase">Due Date</p>
                             <p className="text-sm font-medium">{bills.find(b => b._id === selectedId)?.dueDate ? new Date(bills.find(b => b._id === selectedId)!.dueDate!).toLocaleDateString("en-IN") : "No due date"}</p>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="font-bold border-b pb-2">Actions</h3>
                       <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => router.push(`/purchases/bills/${selectedId}/edit`)}>
                             <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/5" onClick={() => {
                             const bill = bills.find(b => b._id === selectedId);
                             if (bill) setToDelete(bill);
                          }}>
                             <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                       </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4 max-w-sm px-8">
                  <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                    <FileText className="h-12 w-12 text-blue-200" />
                  </div>
                  <h3 className="text-xl font-bold">Select a bill to view details</h3>
                  <p className="text-muted-foreground">Choose a bill from the left list to see its details, line items, and manage its lifecycle.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete bill {toDelete?.billNumber}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Delete Bill
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
