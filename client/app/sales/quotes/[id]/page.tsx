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
  Draft: "bg-gray-100 text-gray-700 border-gray-300",
  Sent: "bg-blue-50 text-blue-700 border-blue-300",
  Accepted: "bg-green-50 text-green-700 border-green-300",
  Rejected: "bg-red-50 text-red-700 border-red-300",
  Invoiced: "bg-purple-50 text-purple-700 border-purple-300",
  Expired: "bg-yellow-50 text-yellow-700 border-yellow-300",
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
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <span className="text-sm text-muted-foreground">
              Sales <span className="mx-1">/</span>
              <button
                className="hover:underline"
                onClick={() => router.push("/sales/quotes")}
              >
                Quotes
              </button>
              <span className="mx-1">/</span>
              <span className="font-medium text-foreground">
                {quote?.quoteNumber || "Quote Details"}
              </span>
            </span>
          }
          actions={
            <>
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in Quotes..."
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
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
                onClick={() => router.push("/sales/quotes/new")}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </>
          }
        />

        <div className="flex flex-1 min-h-[calc(100svh-3.5rem)]">
          {/* ─── Left Sidebar ─── */}
          <aside className="w-80 border-r bg-background">
            <div className="p-3 border-b">
              <div className="text-sm font-medium">All Quotations</div>
            </div>
            <div className="max-h-[calc(100svh-3.5rem-3rem)] overflow-auto">
              {filteredQuotes.map((q) => {
                const isActive = q._id === id;
                return (
                  <button
                    key={q._id}
                    type="button"
                    onClick={() => router.push(`/sales/quotes/${q._id}`)}
                    className={
                      "w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition-colors " +
                      (isActive ? "bg-muted shadow-inner" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold truncate">
                        {customerName(q.customerId)}
                      </div>
                      <div className="text-xs font-medium tabular-nums">
                        {fmt(q.total)}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{q.quoteNumber} • {fmtDate(q.quoteDate)}</span>
                      <span className={"uppercase " + (statusColor[q.status].split(" ")[1])}>
                        {q.status}
                      </span>
                    </div>
                  </button>
                );
              })}
              {filteredQuotes.length === 0 && !listLoading && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No quotes found.
                </div>
              )}
            </div>
          </aside>

          {/* ─── Right Content ─── */}
          <main className="flex-1 bg-muted/10 overflow-auto">
            {!quote && fetching ? (
               <div className="flex items-center justify-center h-64">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
               </div>
            ) : !quote ? (
               <div className="p-12 text-center">
                 <p className="text-muted-foreground">Select a quote to view details.</p>
               </div>
            ) : (
              <div className="flex flex-col min-h-full">
                {/* ═══ Header Actions ═══ */}
                <div className="bg-background border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/sales/quotes/${quote._id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
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

                    <Button variant="ghost" size="sm" onClick={() => toast.info("Share UI coming soon")}>
                      <Share2 className="h-3.5 w-3.5 mr-1" />
                      Share
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
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
                        <Button variant="ghost" size="sm">
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
                        <Button variant="ghost" size="sm">
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
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleAction("accept")}>
                          <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                          Mark as Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleAction("reject")}>
                          <XCircle className="h-4 w-4 mr-2 text-red-600" />
                          Mark as Rejected
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleAction("delete")}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Quote
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* ═══ What's Next ═══ */}
                  {["Draft", "Sent", "Accepted"].includes(quote.status) && (
                    <div className="bg-white border rounded-lg p-4 shadow-sm flex items-center justify-between">
                       <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center">
                            <Plus className="h-4 w-4 text-indigo-600" />
                         </div>
                         <div>
                           <div className="text-sm font-semibold">WHAT'S NEXT?</div>
                           <div className="text-xs text-muted-foreground">Convert this quote to an invoice or a sales order to proceed.</div>
                         </div>
                       </div>
                       <div className="flex gap-2">
                         <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleConvertToInvoice}>
                            Convert <ChevronDown className="ml-1 h-3 w-3" />
                         </Button>
                         <Button size="sm" variant="outline">
                            Create Project
                         </Button>
                       </div>
                    </div>
                  )}

                  <Tabs defaultValue="details" className="w-full" onValueChange={setTab}>
                    <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 mb-6">
                       <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent pb-2 pt-0 px-4 font-semibold text-sm">
                         Quote Details
                       </TabsTrigger>
                       <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent pb-2 pt-0 px-4 font-semibold text-sm text-muted-foreground">
                         Activity Logs
                       </TabsTrigger>
                    </TabsList>

                    <TabsContent value="details" className="mt-0">
                       <div className="bg-white border rounded-lg shadow-lg overflow-hidden min-h-[1000px] flex flex-col items-center p-8 bg-slate-50">
                          {pdfUrl ? (
                            <iframe 
                              src={`${pdfUrl}#toolbar=0`} 
                              className="w-full max-w-[800px] h-[1000px] border shadow-2xl rounded"
                              title="PDF Preview"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-24">
                               <Loader2 className="h-10 w-10 animate-spin text-blue-200 mb-4" />
                               <p className="text-muted-foreground italic">Rendering preview...</p>
                            </div>
                          )}
                       </div>
                    </TabsContent>

                    <TabsContent value="activity">
                       <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                          <div className="p-4 border-b bg-muted/30">
                             <h3 className="text-sm font-semibold">Timeline</h3>
                          </div>
                          <div className="divide-y max-h-[600px] overflow-auto">
                             {quote.activityLog && quote.activityLog.length > 0 ? (
                               [...quote.activityLog].reverse().map((log, i) => (
                                 <div key={i} className="p-4 hover:bg-muted/10 transition-colors">
                                   <div className="flex items-start justify-between gap-4">
                                     <div className="flex gap-3">
                                       <div className="mt-1 h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                                          {log.action === "created" ? <Plus className="h-4 w-4 text-blue-600" /> : <RefreshCw className="h-4 w-4 text-blue-600" />}
                                       </div>
                                       <div>
                                         <p className="text-sm font-medium">
                                           Quote {log.action}{" "}
                                           <span className="text-muted-foreground font-normal">by</span>{" "}
                                           {log.userId?.displayName || "System"}
                                         </p>
                                         <p className="text-[11px] text-muted-foreground mt-0.5">
                                           {new Date(log.timestamp).toLocaleString()}
                                         </p>
                                         
                                         {Object.keys(log.changes || {}).length > 0 && (
                                           <div className="mt-3 space-y-2">
                                              {Object.entries(log.changes).map(([field, delta]: [string, any]) => (
                                                <div key={field} className="text-[11px] border rounded p-1.5 bg-slate-50">
                                                   <span className="font-semibold capitalize text-slate-700">{field.replace(/([A-Z])/g, ' $1')}:</span>
                                                   <div className="flex items-center gap-2 mt-1">
                                                      <span className="line-through text-red-500">{JSON.stringify(delta.before)}</span>
                                                      <ArrowLeft className="h-2 w-2 rotate-180 text-muted-foreground" />
                                                      <span className="text-green-600 font-medium">{JSON.stringify(delta.after)}</span>
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
                               <div className="p-12 text-center text-sm text-muted-foreground italic">
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Update Logo & Address</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
          {/* Logo */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization Logo</p>
            <div className="flex items-start gap-4">
              <div
                className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/10 overflow-hidden shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp" className="hidden" onChange={handleFileChange} />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Logo
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Supported: JPG, JPEG, PNG, GIF, BMP · Max 1 MB</p>
                {logoPreview && (
                  <button onClick={() => { setLogoFile(null); setLogoPreview(""); setLogoUrl(""); }} className="text-xs text-destructive mt-1 hover:underline">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>
          <Separator />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organization Address</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Street 1</Label><Input className="h-8 text-sm" value={street} onChange={(e) => setStreet(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Street 2</Label><Input className="h-8 text-sm" value={street2} onChange={(e) => setStreet2(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs mb-1 block">City</Label><Input className="h-8 text-sm" value={city} onChange={(e) => setCity(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Pin Code</Label><Input className="h-8 text-sm" value={zip} onChange={(e) => setZip(e.target.value)} /></div>
              <div>
                <Label className="text-xs mb-1 block">State</Label>
                <Select value={addrState} onValueChange={setAddrState}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs mb-1 block">Phone</Label><Input className="h-8 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div><Label className="text-xs mb-1 block">Fax Number</Label><Input className="h-8 text-sm" value={fax} onChange={(e) => setFax(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs mb-1 block">Website URL</Label><Input className="h-8 text-sm" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} /></div>
            <div>
              <Label className="text-xs mb-1 block">Select Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
