"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronDown,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  FileUp,
  Upload,
  Download,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { CustomerDetailView } from "./[id]/customer-detail-view";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

const fmt = (value?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);

export default function CustomersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | "All">("All");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Contact | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("No customers to export");
      return;
    }
    const headers = ["Display Name", "Company Name", "Email", "Phone", "GST Treatment", "Currency", "Opening Balance"];
    const csvContent = [
      headers.join(","),
      ...filtered.map(c => [
        `"${c.displayName || ""}"`,
        `"${c.companyName || ""}"`,
        `"${c.email || ""}"`,
        `"${c.phone || ""}"`,
        `"${c.taxTreatment || ""}"`,
        `"${c.currency || "INR"}"`,
        `"${c.openingBalance || 0}"`,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "customers.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Customers exported successfully");
  };

  const panelOpen = !!selectedId;

  const fetchContacts = useCallback(async () => {
    setFetching(true);
    try {
      const includeInactive = statusFilter !== "Active";
      const res = await contactApi.list({
        type: "Customer",
        page: 1,
        limit: 200,
        includeInactive,
      });
      setContacts(res.data ?? []);
    } catch {
      setContacts([]);
    } finally {
      setFetching(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) {
      void fetchContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id, statusFilter]);

  useEffect(() => {
    if (selectedId && !fetching && !contacts.find((c) => c._id === selectedId)) {
      void fetchContacts();
    }
  }, [selectedId, contacts, fetching, fetchContacts]);

  async function selectCustomer(id: string, tabOverride?: string) {
    setSelectedId(id);
    if (tabOverride !== undefined) {
      setSelectedTab(tabOverride || null);
    }
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search);
      const tabToUse = tabOverride ?? query.get("tab") ?? selectedTab ?? "overview";
      const currentSelectedId = query.get("selectedId") || "";
      const currentTab = query.get("tab") || "";

      if (currentSelectedId !== id || currentTab !== tabToUse) {
        query.set("selectedId", id);
        if (tabToUse) query.set("tab", tabToUse);
        router.replace(`/sales/customers?${query.toString()}`, { scroll: false });
      }
    }

    const quick = contacts.find((row) => row._id === id);
    if (quick) setSelectedCustomer(quick);

    setLoadingCustomer(true);
    try {
      const res = await contactApi.getById(id);
      setSelectedCustomer(res.data);
    } catch {
      // keep quick data
    } finally {
      setLoadingCustomer(false);
    }
  }

  function closePanel() {
    setSelectedId(null);
    setSelectedTab(null);
    setSelectedCustomer(null);
    router.push("/sales/customers");
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filtered = contacts
    .filter((row) => {
      if (statusFilter === "Active") return row.isActive !== false;
      if (statusFilter === "Inactive") return row.isActive === false;
      return true;
    })
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        row.displayName.toLowerCase().includes(q) ||
        (row.companyName || "").toLowerCase().includes(q) ||
        (row.email || "").toLowerCase().includes(q)
      );
    });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex h-svh min-h-0 flex-col overflow-hidden">
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">Customers</span>
            </span>
          }
          actions={
            !panelOpen ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative w-52">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 pl-8 text-sm"
                      placeholder="Search customers..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as "Active" | "Inactive" | "All")
                    }
                    className="h-8 rounded border border-muted px-2 text-xs"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="All">All</option>
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchContacts()}
                  disabled={fetching}
                  className="px-2"
                >
                  <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                </Button>

                <Button size="sm" className="gap-1.5" onClick={() => router.push("/sales/customers/new")}>
                  <Plus className="mr-1 h-4 w-4" />
                  New Customer
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white">
                    <DropdownMenuItem onClick={() => router.push("/batch-import?section=sales&type=Customers&back=/sales/customers")} className="cursor-pointer">
                      <span className="flex items-center gap-2 text-xs">
                        <FileUp className="h-4 w-4 text-slate-500" />
                        Batch Import
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <span className="flex items-center gap-2 text-xs">
                          <Upload className="h-4 w-4 text-slate-500" />
                          Import
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={() => router.push("/sales/customers/import")} className="cursor-pointer">
                            <span className="text-xs">Import Customers</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="cursor-pointer">
                        <span className="flex items-center gap-2 text-xs">
                          <Download className="h-4 w-4 text-slate-500" />
                          Export
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent className="w-48 bg-white">
                          <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                            <span className="text-xs">Export Customers</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null
          }
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex flex-col overflow-hidden border-r transition-all duration-200",
              panelOpen ? "w-[320px] shrink-0" : "flex-1",
            )}
          >
            <div
              className={cn(
                "flex shrink-0 items-center border-b",
                panelOpen ? "justify-between px-3 py-2" : "justify-between px-4 py-3",
              )}
            >
              {panelOpen ? (
                <>
                  <button className="flex items-center gap-1.5 text-sm font-semibold">
                    All Customers
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => void fetchContacts()}
                      disabled={fetching}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                    </Button>
                    <Button
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => router.push("/sales/customers/new")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <button className="flex items-center gap-1.5 text-sm font-medium">
                    All Customers
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            {panelOpen ? (
              <div className="border-b px-2 py-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    className="h-7 pl-7 text-xs"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {fetching && contacts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : panelOpen ? (
              <div className="flex-1 divide-y overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                    <Building2 className="h-8 w-8 opacity-30" />
                    <p className="text-xs">{search ? "No customers match your search" : "No customers yet"}</p>
                  </div>
                ) : null}

                {filtered.map((row) => (
                  <button
                    key={row._id}
                    className={cn(
                      "w-full border-l-2 px-3 py-3 text-left transition-colors hover:bg-muted/20",
                      row.isActive === false && "bg-muted/60 text-muted-foreground",
                      selectedId === row._id ? "border-l-primary bg-blue-50" : "border-l-transparent",
                    )}
                    onClick={() => void selectCustomer(row._id)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{row.displayName}</p>
                        {row.companyName && row.companyName !== row.displayName ? (
                          <p className="truncate text-[10px] text-muted-foreground">{row.companyName}</p>
                        ) : null}
                        {row.isActive === false ? <p className="text-[10px] text-muted-foreground">Inactive</p> : null}
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmt((row.outstandingReceivable ?? 0) + (row.openingBalance ?? 0), row.currency || "INR")}
                      </span>
                    </div>
                  </button>
                ))}

                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  {filtered.length} customer{filtered.length !== 1 ? "s" : ""}
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="mx-6 my-4 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-20 text-muted-foreground">
                <Building2 className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">
                  {search ? "No customers match your search" : "No customers yet"}
                </p>
                {!search ? (
                  <Button size="sm" onClick={() => router.push("/sales/customers/new")}>
                    <Plus className="mr-1 h-4 w-4" /> New Customer
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex-1 overflow-auto px-6 py-4">
                <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">GST Treatment</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receivables (BCY)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => {
                        const primary = row.contactPersons?.find((person) => person.isPrimary) ?? row.contactPersons?.[0];
                        const email = row.email || primary?.email || "";
                        const phone = row.phone || primary?.workPhone || primary?.mobile || row.mobile || "";
                        return (
                          <tr
                            key={row._id}
                            className={cn(
                              "cursor-pointer border-b transition-colors hover:bg-muted/40 last:border-0",
                              row.isActive === false && "bg-muted/60 text-muted-foreground",
                            )}
                            onClick={() => void selectCustomer(row._id)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-medium text-primary hover:underline">{row.displayName}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.companyName || "-"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {email ? (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3.5 w-3.5" /> {email}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" /> {phone}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.taxTreatment || "-"}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              {fmt((row.outstandingReceivable ?? 0) + (row.openingBalance ?? 0), row.currency || "INR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {panelOpen ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {loadingCustomer && !selectedCustomer ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : selectedCustomer ? (
                <CustomerDetailView
                  customer={selectedCustomer}
                  initialTab={selectedTab || undefined}
                  onClose={closePanel}
                  onCustomerUpdate={(updated) => {
                    setSelectedCustomer(updated);
                    setContacts((prev) =>
                      prev.map((row) => (row._id === updated._id ? { ...row, ...updated } : row)),
                    );
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
