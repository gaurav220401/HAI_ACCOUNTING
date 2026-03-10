"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, RefreshCw } from "lucide-react";

import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { salesOrderApi, type SalesOrder, type SalesOrderStatus } from "@/lib/api/sales-orders";

function getCustomerName(customer: SalesOrder["customerId"] | null | undefined): string {
  if (!customer || typeof customer === "string") return "";
  return customer.displayName || customer.companyName || "";
}

function formatDate(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function statusBadgeVariant(status: SalesOrderStatus) {
  if (status === "DRAFT") return "secondary" as const;
  if (status === "APPROVED") return "outline" as const;
  if (status === "OVERDUE") return "destructive" as const;
  return "default" as const;
}

export default function SalesOrdersPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading]);

  async function fetchOrders() {
    setFetching(true);
    try {
      const res = await salesOrderApi.list({ page: 1, limit: 100, search: search || undefined });
      setOrders(res.data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setFetching(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter((o) => {
      const custName = getCustomerName(o.customerId).toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        (o.reference || "").toLowerCase().includes(q) ||
        custName.includes(q)
      );
    });
  }, [orders, search]);

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
              <span className="font-medium text-foreground">Sales Orders</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-72">
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

        <div className="flex flex-1 flex-col p-6 gap-4">
          <div>
            <h1 className="text-xl font-bold">All Sales Orders</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} sales orders</p>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Sales Order#</TableHead>
                  <TableHead>Reference#</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Invoiced</TableHead>
                  <TableHead className="text-center">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/sales/orders/${o._id}`)}
                  >
                    <TableCell className="text-sm">{formatDate(o.orderDate)}</TableCell>
                    <TableCell className="font-medium text-primary">{o.salesOrderNumber}</TableCell>
                    <TableCell className="text-sm">{o.reference || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {getCustomerName(o.customerId) || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(o.status)}>{o.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {o.total != null ? `₹${Number(o.total).toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          o.status === "INVOICED" || o.status === "CLOSED"
                            ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                            : o.status === "PARTIALLY_INVOICED"
                            ? "bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"
                            : "bg-muted-foreground/30"
                        }`}
                        title={o.status}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
                    </TableCell>
                  </TableRow>
                ))}

                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No sales orders found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
