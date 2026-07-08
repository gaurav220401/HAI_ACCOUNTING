"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Download,
  Mail,
  Receipt,
  FileSearch,
  Search,
  MoreHorizontal,
  RefreshCw,
  Plus,
  Share2,
  Printer,
  ChevronDown,
  ImagePlus,
  Upload,
  Settings2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SendEmailModal } from "../_components/send-email-modal";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quoteApi, type Quote, type QuoteStatus } from "@/lib/api/quotes";
import { organizationApi } from "@/lib/api/organizations";
import { apiFetch } from "@/lib/api/client";

const statusColor: Record<QuoteStatus, string> = {
  Draft: "bg-slate-100 text-slate-700 border-slate-300",
  Sent: "bg-amber-50 text-amber-700 border-amber-300",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-300",
  Rejected: "bg-rose-50 text-rose-700 border-rose-300",
  Invoiced: "bg-purple-50 text-purple-700 border-purple-300",
  Expired: "bg-slate-100 text-slate-700 border-slate-300",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerName(c: Quote["customerId"]) {
  if (typeof c === "string") return c;
  return c?.displayName || "—";
}

function salesPersonName(sp: Quote["salesPersonId"]) {
  if (!sp) return "—";
  if (typeof sp === "string") return sp;
  return sp.name || "—";
}

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

function ListSkeleton() {
  return (
    <div className="divide-y divide-slate-100 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-4 py-3.5 space-y-2">
          <div className="flex justify-between">
            <div className="h-3.5 w-32 bg-slate-100 rounded" />
            <div className="h-3.5 w-16 bg-slate-100 rounded" />
          </div>
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-4 w-16 bg-slate-100 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export default function QuoteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization, refreshOrganizations } = useOrganization();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [fetching, setFetching] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [tab, setTab] = useState("details");
  const [logoAddressOpen, setLogoAddressOpen] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup)
      router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (firebaseUser && !loading) {
      fetchQuote();
      fetchQuotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, loading, id]);

  useEffect(() => {
    if (quote?._id) {
        loadPdfPreview();
    }
    return () => {
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [quote?._id]);

  async function loadPdfPreview() {
    if (!id) return;
    try {
      const blob = await quoteApi.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (e) {
      console.error("PDF preview error", e);
    }
  }

  async function fetchQuote() {
    if (!id) return;
    setFetching(true);
    try {
      const res = await quoteApi.getById(id);
      setQuote(res.data);
    } catch {
      // noop
    } finally {
      setFetching(false);
    }
  }

  async function fetchQuotes() {
    setListLoading(true);
    try {
      const res = await quoteApi.list({ limit: 100 });
      setQuotes(res.data || []);
    } catch {
      // noop
    } finally {
      setListLoading(false);
    }
  }

  async function handleAction(action: "send" | "accept" | "reject" | "delete") {
    if (!quote) return;
    if (action === "delete" && !confirm("Delete this quote?")) return;
    setActionLoading(true);
    try {
      if (action === "send") {
        setIsEmailModalOpen(true);
      } else if (action === "accept") {
        await quoteApi.accept(quote._id);
        toast.success("Quote accepted");
        fetchQuote();
      } else if (action === "reject") {
        await quoteApi.reject(quote._id);
        toast.success("Quote rejected");
        fetchQuote();
      } else if (action === "delete") {
        await quoteApi.remove(quote._id);
        toast.success("Quote deleted");
        router.push("/sales/quotes");
        return;
      }
    } catch (e: any) {
      toast.error(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!quote) return;
    try {
      const blob = await quoteApi.downloadPdf(quote._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote-${quote.quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF downloaded");
    } catch (error: any) {
      toast.error("Failed to download PDF");
    }
  }

  function handlePrint() {
    const iframe = document.querySelector('iframe[title="PDF Preview"]') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } else {
      window.print();
    }
  }

  async function handleConvertToInvoice() {
    if (!quote) return;
    if (!confirm("Convert this quote to a draft invoice?")) return;
    
    setActionLoading(true);
    try {
      const res = await quoteApi.convertToInvoice(quote._id);
      toast.success("Converted to Invoice");
      if (res.data?._id) {
        router.push(`/sales/invoices/${res.data._id}`);
      } else {
        fetchQuote();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to convert to invoice");
    } finally {
      setActionLoading(false);
    }
  }

  async function onSendEmail(data: any) {
    if (!quote) return;
    await quoteApi.sendEmailWithFiles(quote._id, data, data.files);
    fetchQuote();
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const filteredQuotes = quotes.filter((q) => {
    const qnum = q.quoteNumber.toLowerCase();
    const cname = customerName(q.customerId).toLowerCase();
    const s = search.toLowerCase();
    return qnum.includes(s) || cname.includes(s);
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-teal-700">Sales</span>
              <span className="text-slate-400">/</span>
              <button
                className="hover:underline text-slate-500 font-medium"
                onClick={() => router.push("/sales/quotes")}
              >
                Quotes
              </button>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">
                {quote?.quoteNumber || "Quote Details"}
              </span>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search in Quotes..."
                  className="pl-8 h-8 text-sm border-slate-200 focus-visible:ring-teal-600"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  fetchQuotes();
                  fetchQuote();
                }}
                disabled={fetching || listLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${(fetching || listLoading) ? "animate-spin" : ""}`}
                />
              </Button>
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

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ─── Left Sidebar ─── */}
          <aside className="w-80 border-r border-slate-100 bg-white flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">All Quotations</div>
            </div>
            <div className="flex-1 overflow-auto divide-y divide-slate-100">
              {listLoading ? (
                <ListSkeleton />
              ) : (
                filteredQuotes.map((q) => {
                  const isActive = q._id === id;
                  return (
                    <button
                      key={q._id}
                      type="button"
                      onClick={() => router.push(`/sales/quotes/${q._id}`)}
                      className={
                        "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors " +
                        (isActive ? "bg-teal-50/40 border-l-[3px] border-l-teal-600" : "")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-700 truncate">
                          {customerName(q.customerId)}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 tabular-nums">
                          {fmt(q.total)}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{q.quoteNumber} • {fmtDate(q.quoteDate)}</span>
                        <span className="font-medium">
                          <StatusPill status={q.status} />
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
              {filteredQuotes.length === 0 && !listLoading && (
                <div className="p-8 text-center text-sm text-slate-400">
                  No quotes found.
                </div>
              )}
            </div>
          </aside>

          {/* ─── Right Content ─── */}
          <main className="flex-1 bg-slate-50/30 overflow-auto flex flex-col">
            {!quote && fetching ? (
               <div className="flex items-center justify-center flex-1">
                 <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
               </div>
            ) : !quote ? (
               <div className="p-12 text-center flex-1 flex items-center justify-center">
                 <p className="text-slate-400">Select a quote to view details.</p>
               </div>
            ) : (
              <div className="flex flex-col min-h-full">
                {/* ═══ Header Actions ═══ */}
                <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => router.push(`/sales/quotes/${quote._id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Mail className="h-3.5 w-3.5 mr-1" />
                          Send
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleAction("send")}>
                          <Mail className="h-4 w-4 mr-2" />
                          Email Quote
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info("Link copied")}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share Link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      onClick={() => toast.info("Share UI coming soon")}
                    >
                      <Share2 className="h-3.5 w-3.5 mr-1" />
                      Share
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />
                          PDF/Print
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleDownloadPdf}>
                          <Download className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handlePrint}>
                          <Printer className="h-4 w-4 mr-2" />
                          Print
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Settings2 className="h-3.5 w-3.5 mr-1" />
                          Customize
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => router.push(`/sales/quotes/${quote._id}/edit-template`)}>
                          <Settings2 className="h-4 w-4 mr-2" />
                          Edit Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLogoAddressOpen(true)}>
                          <ImagePlus className="h-4 w-4 mr-2" />
                          Update Logo & Address
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Convert
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleConvertToInvoice}>
                          <Receipt className="h-4 w-4 mr-2" />
                          To Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info("Sales Order conversion coming soon")}>
                          <FileText className="h-4 w-4 mr-2" />
                          To Sales Order
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-slate-600"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAction("accept")}>
                          <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                          Mark as Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction("reject")}>
                          <XCircle className="h-4 w-4 mr-2 text-rose-600" />
                          Mark as Rejected
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => handleAction("delete")}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Quote
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="p-6 space-y-6 flex-1">
                  {/* ═══ What's Next ═══ */}
                  {["Draft", "Sent", "Accepted"].includes(quote.status) && (
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-2xs flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                             <Plus className="h-4 w-4 text-teal-600" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800 uppercase tracking-tight">WHAT&apos;S NEXT?</div>
                            <div className="text-[11px] text-slate-500">Convert this quote to an invoice or a sales order to proceed.</div>
                          </div>
                       </div>
                       <div className="flex gap-2">
                         <Button
                           size="sm"
                           className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold h-8 rounded-md"
                           onClick={handleConvertToInvoice}
                         >
                            Convert <ChevronDown className="ml-1 h-3 w-3" />
                         </Button>
                         <Button
                           size="sm"
                           variant="outline"
                           className="text-xs font-semibold h-8 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md"
                         >
                            Create Project
                         </Button>
                       </div>
                    </div>
                  )}

                  <Tabs defaultValue="details" className="w-full" onValueChange={setTab}>
                    <TabsList className="bg-transparent border-b border-slate-100 rounded-none w-full justify-start h-auto p-0 mb-6 gap-2">
                       <TabsTrigger
                         value="details"
                         className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:bg-transparent pb-2 pt-0 px-4 font-bold text-sm text-slate-500"
                       >
                         Quote Details
                       </TabsTrigger>
                       <TabsTrigger
                         value="activity"
                         className="rounded-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 data-[state=active]:bg-transparent pb-2 pt-0 px-4 font-bold text-sm text-slate-500"
                       >
                         Activity Logs
                       </TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="mt-0">
                       <div className="bg-slate-100/50 border border-slate-200/50 rounded-xl overflow-hidden min-h-[1000px] flex flex-col items-center p-8">
                          {pdfUrl ? (
                            <iframe 
                              src={`${pdfUrl}#toolbar=0`} 
                              className="w-full max-w-[800px] h-[1000px] border border-slate-200/50 shadow-md rounded-lg"
                              title="PDF Preview"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-24 flex-1">
                               <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
                               <p className="text-slate-400 text-xs italic">Rendering preview...</p>
                            </div>
                          )}
                       </div>
                    </TabsContent>

                    <TabsContent value="activity">
                       <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-2xs">
                          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                             <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wide">Timeline</h3>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-[600px] overflow-auto">
                             {quote.activityLog && quote.activityLog.length > 0 ? (
                               [...quote.activityLog].reverse().map((log, i) => (
                                 <div key={i} className="p-4 hover:bg-slate-50/30 transition-colors">
                                   <div className="flex items-start justify-between gap-4">
                                     <div className="flex gap-3">
                                       <div className="mt-1 h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100/50">
                                          {log.action === "created" ? <Plus className="h-4 w-4 text-teal-600" /> : <RefreshCw className="h-4 w-4 text-teal-600" />}
                                       </div>
                                       <div>
                                         <p className="text-sm font-semibold text-slate-700">
                                           Quote {log.action}{" "}
                                           <span className="text-slate-400 font-normal">by</span>{" "}
                                           {log.userId?.displayName || "System"}
                                         </p>
                                         <p className="text-[11px] text-slate-400 mt-0.5">
                                           {new Date(log.timestamp).toLocaleString()}
                                         </p>
                                         
                                         {Object.keys(log.changes || {}).length > 0 && (
                                           <div className="mt-3 space-y-2">
                                              {Object.entries(log.changes).map(([field, delta]: [string, any]) => (
                                                <div key={field} className="text-[11px] border border-slate-100 rounded-md p-2 bg-slate-50/50">
                                                   <span className="font-semibold capitalize text-slate-600">{field.replace(/([A-Z])/g, ' $1')}:</span>
                                                   <div className="flex items-center gap-2 mt-1">
                                                      <span className="line-through text-rose-500">{JSON.stringify(delta.before)}</span>
                                                      <ArrowLeft className="h-2 w-2 rotate-180 text-slate-400" />
                                                      <span className="text-emerald-600 font-semibold">{JSON.stringify(delta.after)}</span>
                                                   </div>
                                                </div>
                                              ))}
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               ))
                             ) : (
                               <div className="p-12 text-center text-xs text-slate-400 italic">
                                 No activity logs found for this quote.
                                </div>
                             )}
                          </div>
                       </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            )}
          </main>
        </div>

        {quote && (
          <SendEmailModal
            isOpen={isEmailModalOpen}
            onClose={() => setIsEmailModalOpen(false)}
            onSend={onSendEmail}
            quoteNumber={quote.quoteNumber}
            defaultRecipient={(quote.customerId as any)?.email}
          />
        )}

        {activeOrganization && (
          <LogoAddressDialog
            open={logoAddressOpen}
            onClose={() => setLogoAddressOpen(false)}
            orgId={activeOrganization._id}
            initial={{
              logo: activeOrganization.logo ?? "",
              address: activeOrganization.address ?? {},
              industry: activeOrganization.industry ?? "",
            }}
            onSaved={() => {
              refreshOrganizations();
              loadPdfPreview();
            }}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu & Kashmir", "Ladakh",
  "Puducherry", "Chandigarh", "Andaman & Nicobar Islands",
  "Dadra & Nagar Haveli and Daman & Diu", "Lakshadweep",
];

const INDUSTRIES = [
  "Agriculture", "Automotive", "Banking", "Construction", "Education",
  "Entertainment", "Food & Beverage", "Healthcare", "IT & Technology",
  "Legal", "Manufacturing", "Media", "Pharmaceuticals", "Real Estate",
  "Retail", "Services", "Telecommunications", "Transportation", "Other",
];

interface OrgLogoAddress {
  logo: string;
  address: { street?: string; street2?: string; city?: string; state?: string; zip?: string; phone?: string; fax?: string; website?: string };
  industry: string;
}

function LogoAddressDialog({
  open, onClose, orgId, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  initial: OrgLogoAddress;
  onSaved: (data: OrgLogoAddress) => void;
}) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState(initial.logo);
  const [logoUrl, setLogoUrl] = useState(initial.logo);
  const [street, setStreet] = useState(initial.address.street ?? "");
  const [street2, setStreet2] = useState(initial.address.street2 ?? "");
  const [city, setCity] = useState(initial.address.city ?? "");
  const [addrState, setAddrState] = useState(initial.address.state ?? "");
  const [zip, setZip] = useState(initial.address.zip ?? "");
  const [phone, setPhone] = useState(initial.address.phone ?? "");
  const [fax, setFax] = useState(initial.address.fax ?? "");
  const [website, setWebsite] = useState(initial.address.website ?? "");
  const [industry, setIndustry] = useState(initial.industry);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLogoPreview(initial.logo);
    setLogoUrl(initial.logo);
    setLogoFile(null);
    setStreet(initial.address.street ?? "");
    setStreet2(initial.address.street2 ?? "");
    setCity(initial.address.city ?? "");
    setAddrState(initial.address.state ?? "");
    setZip(initial.address.zip ?? "");
    setPhone(initial.address.phone ?? "");
    setFax(initial.address.fax ?? "");
    setWebsite(initial.address.website ?? "");
    setIndustry(initial.industry);
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp"];
    if (!allowed.includes(file.type)) { toast.error("Only JPG, PNG, GIF, or BMP allowed"); return; }
    if (file.size > 1 * 1024 * 1024) { toast.error("Image must be less than 1 MB"); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        const uploadRes = await apiFetch<{ data: { url: string } }>("/upload?folder=logos", {
          method: "POST",
          body: formData,
        });
        finalLogoUrl = uploadRes.data.url;
      }
      const address = { street, street2, city, state: addrState, zip, phone, fax, website };
      await organizationApi.update(orgId, { logo: finalLogoUrl, address: address as any, industry } as any);
      onSaved({ logo: finalLogoUrl, address, industry });
      toast.success("Organization details saved");
      onClose();
    } catch {
      toast.error("Failed to save organization details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-800">Update Logo & Address</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Logo */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Organization Logo</p>
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden shrink-0 cursor-pointer hover:border-teal-500/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp" className="hidden" onChange={handleFileChange} />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Logo
                </Button>
                <p className="text-xs text-slate-400 mt-2">Supported: JPG, JPEG, PNG, GIF, BMP · Max 1 MB</p>
                {logoPreview && (
                  <button onClick={() => { setLogoFile(null); setLogoPreview(""); setLogoUrl(""); }} className="text-xs text-rose-600 mt-1 hover:underline">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>
          <Separator className="bg-slate-100" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Organization Address</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-500 mb-1 block">Street 1</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={street} onChange={(e) => setStreet(e.target.value)} /></div>
              <div><Label className="text-xs text-slate-500 mb-1 block">Street 2</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={street2} onChange={(e) => setStreet2(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs text-slate-500 mb-1 block">City</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div><Label className="text-xs text-slate-500 mb-1 block">Pin Code</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={zip} onChange={(e) => setZip(e.target.value)} /></div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">State</Label>
                <Select value={addrState} onValueChange={setAddrState}>
                  <SelectTrigger className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-500 mb-1 block">Phone</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label className="text-xs text-slate-500 mb-1 block">Fax Number</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" value={fax} onChange={(e) => setFax(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label className="text-xs text-slate-500 mb-1 block">Website URL</Label><Input className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Select Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-8 text-sm border-slate-200 focus-visible:ring-teal-600"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3 border-slate-100">
          <Button variant="outline" size="sm" className="h-8 border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="h-8 bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
