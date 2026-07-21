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

function StatusPill({ status }: { status: QuoteStatus }) {
  const configMap: Record<
    QuoteStatus,
    { bg: string; text: string; border: string; dot: string }
  > = {
    Draft: {
      bg: "bg-slate-100",
      text: "text-slate-500",
      border: "border-slate-200",
      dot: "bg-slate-400",
    },
    Sent: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-100",
      dot: "bg-amber-500",
    },
    Accepted: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-100",
      dot: "bg-emerald-500",
    },
    Rejected: {
      bg: "bg-rose-50",
      text: "text-rose-600",
      border: "border-rose-100",
      dot: "bg-rose-500",
    },
    Invoiced: {
      bg: "bg-purple-50",
      text: "text-purple-700",
      border: "border-purple-100",
      dot: "bg-purple-500",
    },
    Expired: {
      bg: "bg-slate-100",
      text: "text-slate-500",
      border: "border-slate-200",
      dot: "bg-slate-400",
    },
  };
  const config = configMap[status] || configMap.Draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100 animate-pulse border-t border-slate-100">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-6 py-4 gap-4"
        >
          <div className="h-3.5 w-20 bg-slate-100 rounded" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-3.5 w-32 bg-slate-100 rounded" />
          <div className="h-3.5 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-20 bg-slate-100 rounded-full" />
          <div className="h-3.5 w-16 bg-slate-100 rounded" />
          <div className="h-4 w-4 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  );
}

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
  const [showFilterDD, setShowFilterDD] = useState(false);

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
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
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
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <div className="flex flex-col h-screen overflow-hidden">
          <PageHeader
            breadcrumb={
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-teal-700 leading-none mb-0.5">
                  Sales
                </span>
                <DropdownMenu open={showFilterDD} onOpenChange={setShowFilterDD}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-teal-700"
                    >
                      {statusFilter === "All" ?
                        "All Quotes"
                      : `${statusFilter} Quotes`}{" "}
                      <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {STATUS_FILTERS.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => {
                          setStatusFilter(s);
                          setShowFilterDD(false);
                        }}
                      >
                        {s === "All" ? "All Quotes" : s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
            actions={
              <div className="flex items-center gap-1.5">
                <div className="relative w-56">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search quotes..."
                    className="pl-8 h-8 text-sm border-slate-200 focus-visible:ring-teal-600"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={fetchQuotes}
                  disabled={fetching}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
                  />
                </Button>
                <Link href="/batch-import?section=sales&type=Quotes&back=/sales/quotes">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 h-8 text-xs border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-md"
                  >
                    <FileUp className="h-3.5 w-3.5" /> Batch Import
                  </Button>
                </Link>
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md"
                  onClick={() => router.push("/sales/quotes/new")}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
            }
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            {fetching && quotes.length === 0 ?
              <TableSkeleton />
            : filtered.length === 0 ?
              <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground py-20">
                <FileText className="h-16 w-16 opacity-30 text-teal-600" />
                <div className="text-center max-w-md space-y-2">
                  <h2 className="text-xl font-semibold text-slate-800">
                    Seal the deal.
                  </h2>
                  <p className="text-sm text-slate-500">
                    With quotes, give your customers an offer they can&apos;t
                    refuse!
                  </p>

                  <div className="mt-6 mb-2">
                    <p className="text-xs font-semibold text-slate-500 mb-4">
                      Life cycle of a Quote
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
                      <span className="border rounded px-3 py-1.5 bg-teal-50 text-teal-700 border-teal-100 font-semibold">
                        QUOTE
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="border rounded px-3 py-1.5 bg-teal-50/60 text-teal-700 border-teal-100/50 font-semibold">
                        SENT TO CUSTOMER
                      </span>
                      <span className="text-slate-400">→</span>
                      <div className="flex flex-col items-start gap-1">
                        <span className="border rounded px-3 py-1.5 bg-emerald-50 text-emerald-700 border-emerald-100 font-semibold">
                          ACCEPT → INVOICE
                        </span>
                        <span className="border rounded px-3 py-1.5 bg-rose-50 text-rose-700 border-rose-100 font-semibold">
                          REJECT
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                  onClick={() => router.push("/sales/quotes/new")}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  CREATE NEW QUOTE
                </Button>
              </div>
            : <div className="flex-1 overflow-auto border-t border-slate-100">
                <Table>
                  <TableHeader className="bg-slate-50 border-b border-slate-200">
                    <TableRow>
                      <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Date
                      </TableHead>
                      <TableHead className="w-36 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Quote Number
                      </TableHead>
                      <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Reference Number
                      </TableHead>
                      <TableHead className="w-48 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Customer
                      </TableHead>
                      <TableHead className="w-44 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Subject
                      </TableHead>
                      <TableHead className="w-28 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5">
                        Status
                      </TableHead>
                      <TableHead className="w-32 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-4 py-2.5 text-right">
                        Amount
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((q) => (
                      <TableRow
                        key={q._id}
                        className="cursor-pointer hover:bg-teal-50/10"
                        onClick={() => router.push(`/sales/quotes/${q._id}`)}
                      >
                        <TableCell className="text-sm px-4 py-2.5">
                          {formatDate(q.quoteDate)}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-teal-700 hover:text-teal-800 px-4 py-2.5">
                          {q.quoteNumber}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 px-4 py-2.5">
                          {q.referenceNumber || "—"}
                        </TableCell>
                        <TableCell className="text-sm px-4 py-2.5">
                          {getCustomerName(q.customerId)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 px-4 py-2.5">
                          {q.subject || "—"}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <StatusPill status={q.status} />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums px-4 py-2.5">
                          {formatCurrency(q.total)}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-slate-600"
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
                                className="text-rose-600 hover:bg-rose-50"
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
