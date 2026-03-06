"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search, RefreshCw, MoreHorizontal, Pencil, FileText, Trash2, Download } from "lucide-react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { salesOrderApi, type SalesOrder, type SalesOrderStatus } from "@/lib/api/sales-orders";

type TabKey = "overview";

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}

function statusVariant(status: SalesOrderStatus) {
  if (status === "DRAFT") return "secondary" as const;
  if (status === "OVERDUE") return "destructive" as const;
  if (status === "APPROVED") return "outline" as const;
  return "default" as const;
}

export default function SalesOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [active, setActive] = useState<SalesOrder | null>(null);
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
      void fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  useEffect(() => {
    if (!id) return;
    if (orders.length === 0) return;
    const found = orders.find((o) => o._id === id) || null;
    setActive(found);
  }, [id, orders]);

  async function fetchOrders() {
    setFetching(true);
    try {
      const res = await salesOrderApi.list({ page: 1, limit: 200 });
      setOrders(res.data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const custName = String((o as any).customerId?.displayName || "").toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        (o.reference || "").toLowerCase().includes(q) ||
        custName.includes(q)
      );
    });
  }, [orders, search]);

  function openOrder(o: SalesOrder) {
    router.push(`/sales/orders/${o._id}`);
  }

  async function handleConvertToInvoice() {
    if (!active) return;
    try {
      const result = await salesOrderApi.convertToInvoice(active._id);
      alert("Sales order converted to invoice successfully");
      // Navigate to the newly created invoice
      router.push(`/sales/invoices/${result.data._id}`);
    } catch (error) {
      alert("Failed to convert sales order to invoice");
    }
  }

  async function handleDelete() {
    if (!active) return;
    if (!confirm("Are you sure you want to delete this sales order?")) return;
    try {
      await salesOrderApi.remove(active._id);
      alert("Sales order deleted successfully");
      router.push("/sales/orders");
    } catch (error) {
      alert("Failed to delete sales order");
    }
  }

  function handleDownloadPDF() {
    if (!active) return;
    // TODO: Implement PDF download functionality
    alert("PDF download functionality will be available soon");
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
              Sales Orders <span className="mx-1">/</span>
              <span className="font-medium text-foreground">{active?.salesOrderNumber || "Sales Order"}</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Sales Orders..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchOrders} disabled={fetching}>
                <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => router.push("/sales/orders/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 min-h-[calc(100svh-3.5rem)]">
          <aside className="w-80 border-r bg-background">
            <div className="p-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">All Sales Orders</div>
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => router.push("/sales/orders/new")}
                  aria-label="Add sales order"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(100svh-3.5rem-3rem)] overflow-auto">
              {filtered.map((o) => {
                const isActive = o._id === active?._id;
                return (
                  <button
                    key={o._id}
                    type="button"
                    onClick={() => openOrder(o)}
                    className={
                      "w-full text-left px-3 py-2 border-b hover:bg-muted/50 transition-colors " +
                      (isActive ? "bg-muted" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{o.salesOrderNumber}</div>
                      <Badge variant={statusVariant(o.status)} className="shrink-0">
                        {o.status}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {(o as any).customerId?.displayName || "—"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {o.total != null ? `₹${Number(o.total).toLocaleString("en-IN")}` : "—"}
                    </div>
                  </button>
                );
              })}

              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No sales orders found.</div>
              ) : null}
            </div>
          </aside>

          <main className="flex-1 p-6">
            {!active ? (
              <div className="text-sm text-muted-foreground">Select a sales order to view details.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold">{active.salesOrderNumber}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{(active as any).customerId?.displayName || "—"}</span>
                      <span>{formatDate(active.orderDate)}</span>
                      {active.reference ? <span>Ref {active.reference}</span> : null}
                      <Badge variant={statusVariant(active.status)}>{active.status}</Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/sales/orders/${active._id}/edit`)}>
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" onClick={handleConvertToInvoice} disabled={active.status === "INVOICED" || active.status === "PARTIALLY_INVOICED"}>
                      <FileText className="h-4 w-4 mr-1" />
                      Convert to Invoice
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon-sm" aria-label="More">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleDownloadPDF}>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-6">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                    <TabsList variant="line" className="w-full justify-start border-b rounded-none px-0">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
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
                              <CardTitle className="text-sm">Order Info</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div className="text-muted-foreground">Order Date</div>
                                <div>{formatDate(active.orderDate)}</div>

                                <div className="text-muted-foreground">Expected Shipment</div>
                                <div>{formatDate(active.expectedShipmentDate || null)}</div>

                                <div className="text-muted-foreground">Payment Terms</div>
                                <div>{(active as any).paymentTermsId?.name || "—"}</div>

                                <div className="text-muted-foreground">Delivery Method</div>
                                <div>{active.deliveryMethod || "—"}</div>

                                <div className="text-muted-foreground">Reference</div>
                                <div>{active.reference || "—"}</div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Summary</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 gap-6">
                                <div>
                                  <div className="text-xs text-muted-foreground">Sub Total</div>
                                  <div className="text-lg font-semibold tabular-nums">
                                    ₹{Number(active.subTotal || 0).toLocaleString("en-IN")}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground">Total</div>
                                  <div className="text-lg font-semibold tabular-nums">
                                    ₹{Number(active.total || 0).toLocaleString("en-IN")}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div className="text-muted-foreground">Shipping Charges</div>
                                <div>₹{Number(active.shippingCharges || 0).toLocaleString("en-IN")}</div>

                                <div className="text-muted-foreground">Adjustment</div>
                                <div>₹{Number(active.adjustment || 0).toLocaleString("en-IN")}</div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm">Items</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {(active as any).lineItems?.length ? (
                                <div className="space-y-3">
                                  {(active as any).lineItems.map((li: any, idx: number) => (
                                    <div key={idx} className="flex items-start justify-between gap-4">
                                      <div>
                                        <div className="text-sm font-medium">
                                          {li.itemId?.name || "Item"}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Qty {li.quantity} x ₹{Number(li.rate || 0).toLocaleString("en-IN")}
                                        </div>
                                      </div>
                                      <div className="text-sm tabular-nums">
                                        ₹{Number(li.amount || 0).toLocaleString("en-IN")}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">No line items found.</div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
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
