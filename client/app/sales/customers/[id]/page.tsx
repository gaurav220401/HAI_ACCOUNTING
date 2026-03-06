"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, Plus, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { contactApi, type Contact } from "@/lib/api/contacts";

type TabKey = "overview" | "comments" | "transactions" | "mails" | "statement";

export default function CustomerDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      void fetchContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  useEffect(() => {
    if (!id) return;
    if (contacts.length === 0) return;
    const found = contacts.find((c) => c._id === id) || null;
    setActive(found);
  }, [id, contacts]);

  async function fetchContacts() {
    setFetching(true);
    try {
      const res = await contactApi.list({ type: "Customer", page: 1, limit: 200 });
      setContacts(res.data ?? []);
    } catch {
      setContacts([]);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        c.displayName.toLowerCase().includes(q) ||
        (c.companyName || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      );
    });
  }, [contacts, search]);

  function openCustomer(c: Contact) {
    router.push(`/sales/customers/${c._id}`);
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
              Sales <span className="mx-1">/</span>
              Customers <span className="mx-1">/</span>
              <span className="font-medium text-foreground">{active?.displayName || "Customer"}</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Customers..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchContacts} disabled={fetching}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => router.push("/sales/customers/new")}> 
                <Plus className="h-4 w-4 mr-1" />
                New Customer
              </Button>
            </>
          }
        />

        <div className="flex flex-1 min-h-[calc(100svh-3.5rem)]">
          <aside className="w-80 border-r bg-background">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">All Customers</div>
                <Button size="icon-sm" variant="outline" onClick={() => router.push("/sales/customers/new")}
                  aria-label="Add customer">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(100svh-3.5rem-3rem)] overflow-auto">
              {filtered.map((c) => {
                const isActive = c._id === active?._id;
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => openCustomer(c)}
                    className={
                      "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors " +
                      (isActive ? "bg-muted" : "")
                    }
                  >
                    <div className="text-sm font-medium truncate">{c.displayName}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {c.openingBalance != null && c.openingBalance !== 0
                        ? `₹${c.openingBalance.toLocaleString("en-IN")}`
                        : "—"}
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No customers found.</div>
              ) : null}
            </div>
          </aside>

          <main className="flex-1 p-6">
            {!active ? (
              <div className="text-sm text-muted-foreground">Select a customer to view details.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold">{active.displayName}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {active.companyName ? <span>{active.companyName}</span> : null}
                      {active.email ? <span>{active.email}</span> : null}
                      {active.phone || active.mobile ? <span>{active.phone || active.mobile}</span> : null}
                      {active.gstin ? <Badge variant="outline">GSTIN {active.gstin}</Badge> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/sales/customers/${active._id}/edit`)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm">New Transaction</Button>
                    <Button variant="outline" size="icon-sm" aria-label="More">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                    <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="comments">Comments</TabsTrigger>
                      <TabsTrigger value="transactions">Transactions</TabsTrigger>
                      <TabsTrigger value="mails">Mails</TabsTrigger>
                      <TabsTrigger value="statement">Statement</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="pt-6">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Remarks</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-sm text-muted-foreground">{active.notes || "—"}</div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Address</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-sm">
                                <div className="font-medium">Billing Address</div>
                                <div className="mt-1 text-muted-foreground">
                                  {formatAddress(active.billingAddress) || "—"}
                                </div>
                              </div>
                              <div className="mt-4 text-sm">
                                <div className="font-medium">Shipping Address</div>
                                <div className="mt-1 text-muted-foreground">
                                  {formatAddress(active.shippingAddress) || "—"}
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Other Details</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div className="text-muted-foreground">Customer Type</div>
                                <div>{active.contactType}</div>

                                <div className="text-muted-foreground">Default Currency</div>
                                <div>{active.currency || "INR"}</div>

                                <div className="text-muted-foreground">Payment Terms</div>
                                <div>{active.paymentTermsId || "—"}</div>

                                <div className="text-muted-foreground">GST Treatment</div>
                                <div>{active.taxTreatment || "—"}</div>

                                <div className="text-muted-foreground">GSTIN</div>
                                <div className="font-mono">{active.gstin || "—"}</div>

                                <div className="text-muted-foreground">PAN</div>
                                <div className="font-mono">{active.pan || "—"}</div>

                                <div className="text-muted-foreground">Place Of Supply</div>
                                <div>{active.placeOfSupply || "—"}</div>

                                <div className="text-muted-foreground">Portal Status</div>
                                <div>{active.portalEnabled ? "Enabled" : "Disabled"}</div>

                                <div className="text-muted-foreground">Portal Language</div>
                                <div>{active.language || "en"}</div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Receivables</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <div className="text-xs text-muted-foreground">Outstanding Receivables</div>
                                  <div className="text-lg font-semibold tabular-nums">₹0.00</div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Unused Credits</div>
                                  <div className="text-lg font-semibold tabular-nums">₹0.00</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Income</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-sm text-muted-foreground">No data found.</div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="comments" className="pt-6">
                      <div className="text-sm text-muted-foreground">Coming soon.</div>
                    </TabsContent>
                    <TabsContent value="transactions" className="pt-6">
                      <div className="text-sm text-muted-foreground">Coming soon.</div>
                    </TabsContent>
                    <TabsContent value="mails" className="pt-6">
                      <div className="text-sm text-muted-foreground">Coming soon.</div>
                    </TabsContent>
                    <TabsContent value="statement" className="pt-6">
                      <div className="text-sm text-muted-foreground">Coming soon.</div>
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function formatAddress(a?: any) {
  if (!a) return "";
  const parts = [a.street, a.city, a.state, a.zip, a.country]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}
