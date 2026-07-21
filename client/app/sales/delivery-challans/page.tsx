"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  RefreshCw,
  FileText,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deliveryChallanApi,
  type DeliveryChallan,
  type DeliveryChallanStatus,
} from "@/lib/api/delivery-challans";

const STATUS_FILTERS: Array<DeliveryChallanStatus | "All"> = [
  "All",
  "Draft",
  "Open",
  "Delivered",
  "Returned",
];

const statusColor: Record<DeliveryChallanStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Open: "bg-teal-50 text-teal-700 border-teal-200",
  Delivered: "bg-green-50 text-green-700 border-green-300",
  Returned: "bg-red-50 text-red-700 border-red-300",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getCustomerName(c: DeliveryChallan["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

export default function DeliveryChallansPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [challans, setChallans] = useState<DeliveryChallan[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    DeliveryChallanStatus | "All"
  >("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) fetchChallans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, statusFilter]);

  async function fetchChallans() {
    setFetching(true);
    try {
      const res = await deliveryChallanApi.list({
        status: statusFilter,
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setChallans(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const filtered = challans.filter(
    (dc) =>
      !search ||
      dc.challanNumber.toLowerCase().includes(search.toLowerCase()) ||
      (dc.salesOrderNumber || "").toLowerCase().includes(search.toLowerCase()) ||
      dc.referenceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      getCustomerName(dc.customerId)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                Delivery Challans
              </span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search challans..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchChallans}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                onClick={() => router.push("/sales/delivery-challans/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 flex-col p-6 gap-4">
          {/* Title + Status Filter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    {statusFilter === "All" ?
                      "All Delivery Challans"
                    : `${statusFilter} Challans`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "All" ? "All Delivery Challans" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {filtered.length} challan{filtered.length !== 1 && "s"}
              </span>
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
              <FileText className="h-16 w-16 opacity-30" />
              <div className="text-center max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Deliver Goods effectively!
                </h2>
                <p className="text-sm">
                  Create, customize and print professional Delivery Challans
                </p>

                {/* Lifecycle diagram */}
                <div className="mt-6 mb-2">
                  <p className="text-xs font-medium text-muted-foreground mb-4">
                    Life cycle of a Delivery Challan
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <span className="border rounded px-3 py-1.5 bg-gray-50 text-gray-700 border-gray-300 font-medium">
                      CREATE
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="border rounded px-3 py-1.5 bg-teal-50 text-teal-700 border-teal-200 font-medium">
                      OPEN
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <div className="flex flex-col items-start gap-1">
                      <span className="border rounded px-3 py-1.5 bg-green-50 text-green-700 border-green-300 font-medium">
                        DELIVERED
                      </span>
                      <span className="border rounded px-3 py-1.5 bg-red-50 text-red-700 border-red-300 font-medium">
                        RETURNED
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => router.push("/sales/delivery-challans/new")}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
              >
                <Plus className="h-4 w-4 mr-1" />
                CREATE DELIVERY CHALLAN
              </Button>
            </div>
          : <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-40">Delivery Challan#</TableHead>
                    <TableHead className="w-32">Sales Order#</TableHead>
                    <TableHead className="w-36">Reference Number</TableHead>
                    <TableHead className="w-48">Customer Name</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-32">Invoice Status</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((dc) => (
                    <TableRow
                      key={dc._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/sales/delivery-challans/${dc._id}`)
                      }
                    >
                      <TableCell className="text-sm">
                        {formatDate(dc.challanDate)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-teal-700 hover:text-teal-800 hover:underline">
                        {dc.challanNumber}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.salesOrderNumber || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.referenceNumber || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getCustomerName(dc.customerId)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColor[dc.status]}
                        >
                          {dc.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dc.invoiceStatus}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatCurrency(dc.total)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            asChild
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                  `/sales/delivery-challans/${dc._id}/edit`,
                                );
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            {dc.status === "Draft" && (
                              <DropdownMenuItem
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await deliveryChallanApi.convertToOpen(
                                    dc._id,
                                  );
                                  fetchChallans();
                                }}
                              >
                                Convert to Open
                              </DropdownMenuItem>
                            )}
                            {dc.status === "Open" && (
                              <>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await deliveryChallanApi.markAsDelivered(
                                      dc._id,
                                    );
                                    fetchChallans();
                                  }}
                                >
                                  Mark as Delivered
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await deliveryChallanApi.markAsReturned(
                                      dc._id,
                                    );
                                    fetchChallans();
                                  }}
                                >
                                  Mark as Returned
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    "Are you sure you want to delete this delivery challan?",
                                  )
                                ) {
                                  await deliveryChallanApi.remove(dc._id);
                                  fetchChallans();
                                }
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
