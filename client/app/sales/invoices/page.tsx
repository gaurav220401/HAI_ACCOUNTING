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
  invoiceApi,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/api/invoices";

const STATUS_FILTERS: Array<InvoiceStatus | "All"> = [
  "All",
  "Draft",
  "Sent",
  "Overdue",
  "Partially Paid",
  "Paid",
  "Void",
];

const statusColor: Record<InvoiceStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Viewed: "bg-indigo-50 text-indigo-700 border-indigo-300",
  Overdue: "bg-red-50 text-red-700 border-red-300",
  "Partially Paid": "bg-yellow-50 text-yellow-700 border-yellow-300",
  Paid: "bg-green-50 text-green-700 border-green-300",
  Void: "bg-gray-50 text-gray-400 border-gray-200",
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

function getCustomerName(c: Invoice["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function getDueStatus(invoice: Invoice) {
  if (invoice.status === "Paid" || invoice.status === "Void") return null;
  if (!invoice.dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(invoice.dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return `${Math.abs(diff)} day(s) overdue`;
  if (diff === 0) return "Due Today";
  return `Due in ${diff} day(s)`;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "All">(
    "All",
  );

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, statusFilter]);

  async function fetchInvoices() {
    setFetching(true);
    try {
      const res = await invoiceApi.list({
        status: statusFilter,
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setInvoices(res.data ?? []);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  if (loading || orgLoading || !firebaseUser) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const filtered = invoices.filter(
    (inv) =>
      !search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.subject?.toLowerCase().includes(search.toLowerCase()) ||
      getCustomerName(inv.customerId)
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
              <span className="font-medium text-foreground">Invoices</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchInvoices}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/sales/invoices/new")}
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
                      "All Invoices"
                    : `${statusFilter} Invoices`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "All" ? "All Invoices" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {filtered.length} invoice{filtered.length !== 1 && "s"}
              </span>
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
              <FileText className="h-16 w-16 opacity-30" />
              <div className="text-center max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Get paid faster.
                </h2>
                <p className="text-sm">
                  Create professional invoices and send them to your customers
                  to get paid on time!
                </p>

                {/* Lifecycle diagram */}
                <div className="mt-6 mb-2">
                  <p className="text-xs font-medium text-muted-foreground mb-4">
                    Life cycle of an Invoice
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <span className="border rounded px-3 py-1.5 bg-gray-50 text-gray-700 border-gray-300 font-medium">
                      DRAFT
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="border rounded px-3 py-1.5 bg-blue-50 text-blue-700 border-blue-300 font-medium">
                      SENT
                    </span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <div className="flex flex-col items-start gap-1">
                      <span className="border rounded px-3 py-1.5 bg-green-50 text-green-700 border-green-300 font-medium">
                        PAID
                      </span>
                      <span className="border rounded px-3 py-1.5 bg-red-50 text-red-700 border-red-300 font-medium">
                        OVERDUE
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Button onClick={() => router.push("/sales/invoices/new")}>
                <Plus className="h-4 w-4 mr-1" />
                CREATE NEW INVOICE
              </Button>
            </div>
          : <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice#</TableHead>
                    <TableHead>Order#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const dueStatus = getDueStatus(inv);
                    return (
                      <TableRow
                        key={inv._id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() =>
                          router.push(`/sales/invoices/${inv._id}`)
                        }
                      >
                        <TableCell className="text-sm">
                          {formatDate(inv.invoiceDate)}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-blue-600">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.orderNumber || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getCustomerName(inv.customerId)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusColor[inv.status]}
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {inv.dueDate ? formatDate(inv.dueDate) : "—"}
                          </div>
                          {dueStatus && (
                            <div
                              className={`text-xs ${dueStatus.includes("overdue") ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                            >
                              {dueStatus}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatCurrency(inv.balanceDue)}
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
                                    `/sales/invoices/${inv._id}/edit`,
                                  );
                                }}
                              >
                                Edit
                              </DropdownMenuItem>
                              {inv.status === "Draft" && (
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await invoiceApi.send(inv._id);
                                    fetchInvoices();
                                  }}
                                >
                                  Mark as Sent
                                </DropdownMenuItem>
                              )}
                              {inv.status !== "Paid" &&
                                inv.status !== "Void" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(
                                        `/sales/invoices/${inv._id}?action=payment`,
                                      );
                                    }}
                                  >
                                    Record Payment
                                  </DropdownMenuItem>
                                )}
                              {inv.status !== "Void" && (
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (
                                      confirm(
                                        "Are you sure you want to void this invoice?",
                                      )
                                    ) {
                                      await invoiceApi.voidInvoice(inv._id);
                                      fetchInvoices();
                                    }
                                  }}
                                >
                                  Void
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      "Are you sure you want to delete this invoice?",
                                    )
                                  ) {
                                    await invoiceApi.remove(inv._id);
                                    fetchInvoices();
                                  }
                                }}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          }
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
