"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Building2, ChevronDown, RefreshCw, Loader2, Mail, Phone } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactApi, type Contact } from "@/lib/api/contacts";
import { VendorDetailView } from "./[id]/vendor-detail-view";

type ViewMode = "table" | "split";

const fmt = (v?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v ?? 0);

export default function VendorsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Contact | null>(null);
  const [loadingVendor, setLoadingVendor] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading && activeOrganization?._id) fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, activeOrganization?._id]);

  async function fetchContacts() {
    setFetching(true);
    try {
      const res = await contactApi.list({ type: "Vendor", page: 1, limit: 100 });
      setContacts(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function selectVendor(id: string) {
    setSelectedId(id);
    setViewMode("split");
    const quick = contacts.find((c) => c._id === id);
    if (quick) setSelectedVendor(quick);
    setLoadingVendor(true);
    try {
      const res = await contactApi.getById(id);
      const full = (res as any).data ?? res;
      setSelectedVendor(full);
    } catch {
      // leave quick version
    } finally {
      setLoadingVendor(false);
    }
  }

  function handleClose() {
    setSelectedId(null);
    setSelectedVendor(null);
    setViewMode("table");
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filtered = contacts.filter(
    (c) =>
      !search ||
      c.displayName.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  // ── TABLE VIEW ───────────────────────────────────────────────────────────
  if (viewMode === "table") {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col overflow-hidden h-svh">
          <PageHeader
            breadcrumb={
              <span className="text-sm text-muted-foreground">
                Purchases <span className="mx-1">/</span>
                <span className="font-medium text-foreground">Vendors</span>
              </span>
            }
            actions={
              <>
                <div className="relative w-52">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search vendors…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={fetchContacts} disabled={fetching} className="px-2">
                  <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
                </Button>
                <Button size="sm" onClick={() => router.push("/purchases/vendors/new")}>
                  <Plus className="h-4 w-4 mr-1" /> New Vendor
                </Button>
              </>
            }
          />

          <div className="flex-1 overflow-auto px-6 py-4">
            {/* Table header: status + count */}
            <div className="flex items-center justify-between mb-3">
              <button className="flex items-center gap-1.5 text-sm font-medium">
                Active Vendors
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-xs text-muted-foreground">{filtered.length} vendor{filtered.length !== 1 ? "s" : ""}</span>
            </div>

            {fetching && contacts.length === 0 ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground border-2 border-dashed rounded-xl">
                <Building2 className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">{search ? "No vendors match your search" : "No vendors yet"}</p>
                {!search && (
                  <Button size="sm" onClick={() => router.push("/purchases/vendors/new")}>
                    <Plus className="h-4 w-4 mr-1" /> New Vendor
                  </Button>
                )}
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden bg-white dark:bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Work Phone</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payables (BCY)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unused Credits (BCY)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const primary = c.contactPersons?.find((p) => p.isPrimary) ?? c.contactPersons?.[0];
                      const email = c.email ?? primary?.email ?? "";
                      const phone = c.phone ?? primary?.workPhone ?? primary?.mobile ?? "";
                      return (
                        <tr
                          key={c._id}
                          className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                          onClick={() => selectVendor(c._id)}
                        >
                          <td className="px-4 py-3">
                            <span className="text-primary font-medium hover:underline">{c.displayName}</span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{c.companyName ?? "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {email ? (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" />
                                {email}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {phone ? (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3.5 w-3.5" />
                                {phone}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">
                            {c.openingBalance ? fmt(c.openingBalance, c.currency ?? "INR") : fmt(0, c.currency ?? "INR")}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {fmt(0, c.currency ?? "INR")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // ── SPLIT PANEL VIEW ─────────────────────────────────────────────────────
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <div className="flex h-screen overflow-hidden">
          {/* LEFT PANEL */}
          <div className="w-72 border-r flex flex-col bg-background shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <button className="flex items-center gap-1 text-sm font-semibold text-foreground">
                Active Vendors
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={fetchContacts} disabled={fetching} title="Refresh">
                  <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => router.push("/purchases/vendors/new")} title="New Vendor">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="px-3 py-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  className="pl-7 h-7 text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {fetching && filtered.length === 0 && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!fetching && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                  <Building2 className="h-8 w-8 opacity-30" />
                  <p className="text-xs">{search ? "No vendors match your search" : "No vendors yet"}</p>
                  {!search && (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => router.push("/purchases/vendors/new")}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> New Vendor
                    </Button>
                  )}
                </div>
              )}
              {filtered.map((c) => (
                <button
                  key={c._id}
                  className={`w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/40 ${
                    selectedId === c._id ? "bg-primary/8 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                  }`}
                  onClick={() => selectVendor(c._id)}
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${selectedId === c._id ? "text-primary" : ""}`}>
                        {c.displayName}
                      </p>
                      {c.companyName && c.companyName !== c.displayName && (
                        <p className="text-xs text-muted-foreground truncate">{c.companyName}</p>
                      )}
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                      {fmt(c.openingBalance ?? 0, c.currency ?? "INR")}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2 border-t shrink-0">
              <p className="text-xs text-muted-foreground">{filtered.length} vendor{filtered.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
                <Building2 className="h-14 w-14 opacity-20" />
                <div className="text-center">
                  <p className="font-medium text-sm">Select a vendor</p>
                  <p className="text-xs mt-1">Choose a vendor from the list to view details</p>
                </div>
              </div>
            ) : loadingVendor && !selectedVendor ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedVendor ? (
              <VendorDetailView
                vendor={selectedVendor}
                onVendorUpdate={(v) => {
                  setSelectedVendor(v);
                  setContacts((cs) =>
                    cs.map((c) =>
                      c._id === v._id
                        ? { ...c, displayName: v.displayName, companyName: v.companyName }
                        : c,
                    ),
                  );
                }}
                onClose={handleClose}
              />
            ) : null}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
