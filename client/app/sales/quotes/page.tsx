"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  RefreshCw,
  FileText,
  MoreHorizontal,
  ChevronDown,
  FileUp,
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
import { quoteApi, type Quote, type QuoteStatus } from "@/lib/api/quotes";

const STATUS_FILTERS: Array<QuoteStatus | "All"> = [
  "All",
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Invoiced",
  "Expired",
];

const statusColor: Record<QuoteStatus, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Accepted: "bg-green-50 text-green-700 border-green-300",
  Rejected: "bg-red-50 text-red-700 border-red-300",
  Invoiced: "bg-purple-50 text-purple-700 border-purple-300",
  Expired: "bg-yellow-50 text-yellow-700 border-yellow-300",
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

function getCustomerName(c: Quote["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

export default function QuotesPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading } = useOrganization();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fetching, setFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "All">("All");

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, statusFilter]);

  async function fetchQuotes() {
    setFetching(true);
    try {
      const res = await quoteApi.list({
        status: statusFilter,
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
      setQuotes(res.data ?? []);
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

  const filtered = quotes.filter(
    (q) =>
      !search ||
      q.quoteNumber.toLowerCase().includes(search.toLowerCase()) ||
      q.subject?.toLowerCase().includes(search.toLowerCase()) ||
      getCustomerName(q.customerId)
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
              <span className="font-medium text-foreground">Quotes</span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quotes..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchQuotes}
                disabled={fetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                />
              </Button>
              <Link href="/batch-import?section=sales&type=Quotes&back=/sales/quotes">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                  <FileUp className="h-3.5 w-3.5" /> Batch Import
                </Button>
              </Link>
              <Button
                size="sm"
                onClick={() => router.push("/sales/quotes/new")}
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
                      "All Quotes"
                    : `${statusFilter} Quotes`}
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {STATUS_FILTERS.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "All" ? "All Quotes" : s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {filtered.length} quote{filtered.length !== 1 && "s"}
              </span>
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
              <FileText className="h-16 w-16 opacity-30" />
              <div className="text-center max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Seal the deal.
                </h2>
                <p className="text-sm">
                  With quotes, give your customers an offer they can&apos;t
                  refuse!
                </p>

                {/* Lifecycle diagram */}
                <div className="mt-6 mb-2">
                  <p className="text-xs font-medium text-muted-foreground mb-4">
                    Life cycle of a Quote
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                    <span className="border rounded px-3 py-1.5 bg-blue-50 text-blue-700 border-blue-300 font-medium">
                      QUOTE
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="border rounded px-3 py-1.5 bg-blue-50 text-blue-700 border-blue-300 font-medium">
                      SENT TO CUSTOMER
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex flex-col items-start gap-1">
                      <span className="border rounded px-3 py-1.5 bg-green-50 text-green-700 border-green-300 font-medium">
                        ACCEPT → INVOICE
                      </span>
                      <span className="border rounded px-3 py-1.5 bg-red-50 text-red-700 border-red-300 font-medium">
                        REJECT
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Button onClick={() => router.push("/sales/quotes/new")}>
                <Plus className="h-4 w-4 mr-1" />
                CREATE NEW QUOTE
              </Button>
            </div>
          : <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Quote#</TableHead>
                    <TableHead>Reference#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((q) => (
                    <TableRow
                      key={q._id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/sales/quotes/${q._id}`)}
                    >
                      <TableCell className="text-sm">
                        {formatDate(q.quoteDate)}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-blue-600">
                        {q.quoteNumber}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {q.referenceNumber || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getCustomerName(q.customerId)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {q.subject || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColor[q.status]}
                        >
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {formatCurrency(q.total)}
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
                                router.push(`/sales/quotes/${q._id}/edit`);
                              }}
                            >
                              Edit
                            </DropdownMenuItem>
                            {q.status === "Draft" && (
                              <DropdownMenuItem
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await quoteApi.send(q._id);
                                  fetchQuotes();
                                }}
                              >
                                Mark as Sent
                              </DropdownMenuItem>
                            )}
                            {["Draft", "Sent"].includes(q.status) && (
                              <>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await quoteApi.accept(q._id);
                                    fetchQuotes();
                                  }}
                                >
                                  Accept
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await quoteApi.reject(q._id);
                                    fetchQuotes();
                                  }}
                                >
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    "Are you sure you want to delete this quote?",
                                  )
                                ) {
                                  await quoteApi.remove(q._id);
                                  fetchQuotes();
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
