"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { billApi, type Bill } from "@/lib/api/bills";
import {
  vendorCreditApi,
  type VendorCredit,
  type VendorCreditApplication,
} from "@/lib/api/vendor-credits";

function fmtDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(v?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(v || 0);
}

function getName(field: any): string {
  if (!field) return "";
  if (typeof field === "object") {
    return field.displayName || field.companyName || field.name || "";
  }
  return String(field);
}

function VendorCreditStandardPreview({
  credit,
  orgName,
  orgLogo,
  orgAddress,
}: {
  credit: VendorCredit;
  orgName: string;
  orgLogo: string;
  orgAddress: any;
}) {
  const vendorName = getName(credit.vendorId) || "Vendor";
  const vendorAddress =
    typeof credit.vendorId === "object" && credit.vendorId?.billingAddress
      ? credit.vendorId.billingAddress
      : null;

  return (
    <div className="statement-print-area w-full max-w-[980px] border rounded-sm overflow-hidden bg-white shadow-sm relative">
      <div className="absolute top-0 left-0 z-10">
        <div className="bg-blue-500 text-white text-xs px-8 py-2 transform -rotate-45 -translate-x-7 translate-y-4 shadow">
          {credit.status === "VOID" ? "Void" : "Open"}
        </div>
      </div>

      <div className="p-12">
        <div className="flex justify-between items-start mb-10">
          <div className="max-w-[45%]">
            {orgLogo ? (
              <img src={orgLogo} alt={orgName} className="h-28 object-contain mb-2" />
            ) : (
              <div className="text-xl font-bold">{orgName || "Organization"}</div>
            )}
            <div className="text-base font-semibold mt-2">{orgName || "Organization"}</div>
            <div className="text-sm mt-1 text-muted-foreground">{orgAddress?.street || ""}</div>
            <div className="text-sm text-muted-foreground">
              {[orgAddress?.city, orgAddress?.state, orgAddress?.zip].filter(Boolean).join(" ")}
            </div>
            <div className="text-sm text-muted-foreground">{orgAddress?.country || ""}</div>
            <div className="text-sm text-muted-foreground">{orgAddress?.phone || ""}</div>
            <div className="text-sm text-muted-foreground">{orgAddress?.email || ""}</div>
          </div>

          <div className="text-right">
            <div className="text-[48px] font-serif leading-none">VENDOR CREDITS</div>
            <div className="mt-3 text-lg">CreditNote# {credit.vendorCreditNumber}</div>
            <div className="mt-4 text-sm font-semibold">Credits Remaining</div>
            <div className="text-3xl font-bold">{fmtCurrency(credit.balanceAmount)}</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-base mb-1">Vendor Address</div>
          <div className="text-blue-600 font-semibold text-[17px]">{vendorName}</div>
          {vendorAddress ? (
            <>
              <div className="text-sm">{vendorAddress.street || ""}</div>
              <div className="text-sm">{[vendorAddress.city, vendorAddress.state].filter(Boolean).join(" ")}</div>
              <div className="text-sm">{vendorAddress.zip || ""}</div>
              <div className="text-sm">{vendorAddress.country || ""}</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Address not available</div>
          )}
        </div>

        <div className="grid grid-cols-2 mb-4 text-sm">
          <div />
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Date :</span>
              <span>{fmtDate(credit.vendorCreditDate)}</span>
            </div>
            <div className="flex justify-between">
              <span>Reference number :</span>
              <span>{credit.referenceBillId?.billNumber || credit.orderNumber || "-"}</span>
            </div>
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-800 text-white">
              <th className="px-3 py-2 text-left w-12">#</th>
              <th className="px-3 py-2 text-left">Item &amp; Description</th>
              <th className="px-3 py-2 text-right w-24">Qty</th>
              <th className="px-3 py-2 text-right w-28">Rate</th>
              <th className="px-3 py-2 text-right w-32">Amount</th>
            </tr>
          </thead>
          <tbody>
            {credit.lineItems.map((line, idx) => (
              <tr key={line._id || idx} className="border-b">
                <td className="px-3 py-3">{idx + 1}</td>
                <td className="px-3 py-3">{line.name || "Item"}</td>
                <td className="px-3 py-3 text-right">{Number(line.quantity || 0).toFixed(2)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(line.rate)}</td>
                <td className="px-3 py-3 text-right">{fmtCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <div className="w-[340px] text-sm space-y-2">
            <div className="flex justify-between"><span>Sub Total</span><span>{fmtCurrency(credit.subTotal)}</span></div>
            <div className="flex justify-between"><span>Total</span><span className="font-semibold">{fmtCurrency(credit.total)}</span></div>
            <div className="flex justify-between bg-zinc-100 px-3 py-2 font-semibold"><span>Credits Remaining</span><span>{fmtCurrency(credit.balanceAmount)}</span></div>
          </div>
        </div>

        <div className="mt-14 text-sm">
          <span>Authorized Signature</span>
          <span className="inline-block border-b border-zinc-700 w-56 align-middle ml-2" />
        </div>
      </div>
    </div>
  );
}

export default function VendorCreditsPage() {
  const router = useRouter();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [credits, setCredits] = useState<VendorCredit[]>([]);
  const [search, setSearch] = useState("");
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCredit, setSelectedCredit] = useState<VendorCredit | null>(null);
  const [applications, setApplications] = useState<VendorCreditApplication[]>([]);
  const [candidateBills, setCandidateBills] = useState<Bill[]>([]);
  const [applyBillId, setApplyBillId] = useState("");
  const [applyAmount, setApplyAmount] = useState(0);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [showPdf, setShowPdf] = useState(true);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);

  const orgName = activeOrganization?.name || "";
  const orgLogo = activeOrganization?.logo || "";
  const orgAddress = (activeOrganization?.address as any) || {};

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  async function loadCredits() {
    setFetching(true);
    try {
      const res = await vendorCreditApi.list({ page: 1, limit: 200 });
      setCredits(res.data || []);
    } catch {
      toast.error("Failed to load vendor credits");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (firebaseUser && !loading) void loadCredits();
  }, [firebaseUser, loading]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    try {
      const res = await vendorCreditApi.getOne(id);
      setSelectedCredit(res.data.credit);
      setApplications(res.data.applications || []);

      const vid =
        typeof res.data.credit.vendorId === "object"
          ? res.data.credit.vendorId._id
          : String(res.data.credit.vendorId || "");
      if (vid) {
        const bills = await billApi.list({ vendorId: vid, page: 1, limit: 200 });
        setCandidateBills((bills.data || []).filter((b) => !["Paid", "Void"].includes(b.status)));
      } else {
        setCandidateBills([]);
      }
      setApplyBillId("");
      setApplyAmount(0);
    } catch {
      toast.error("Failed to load vendor credit details");
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return credits;
    const q = search.toLowerCase();
    return credits.filter((c) => {
      return (
        (c.vendorCreditNumber || "").toLowerCase().includes(q) ||
        getName(c.vendorId).toLowerCase().includes(q) ||
        (c.orderNumber || "").toLowerCase().includes(q)
      );
    });
  }, [credits, search]);

  async function handleApply() {
    if (!selectedCredit?._id || !applyBillId || applyAmount <= 0) {
      toast.error("Select bill and amount");
      return;
    }
    try {
      await vendorCreditApi.applyToBill(selectedCredit._id, applyBillId, applyAmount);
      toast.success("Credit applied to bill");
      await loadDetail(selectedCredit._id);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply credit");
    }
  }

  async function handleVoid() {
    if (!selectedCredit?._id) return;
    try {
      await vendorCreditApi.void(selectedCredit._id, "Voided from vendor credit module");
      toast.success("Vendor credit voided");
      await loadDetail(selectedCredit._id);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to void vendor credit");
    }
  }

  async function handleDelete() {
    if (!selectedCredit?._id) return;
    try {
      await vendorCreditApi.remove(selectedCredit._id);
      toast.success("Vendor credit deleted");
      setSelectedId(null);
      setSelectedCredit(null);
      setApplications([]);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete vendor credit");
    }
  }

  async function handleClone() {
    if (!selectedCredit?._id) return;
    try {
      const res = await vendorCreditApi.clone(selectedCredit._id);
      toast.success("Vendor credit cloned");
      await loadCredits();
      await loadDetail(res.data._id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to clone vendor credit");
    }
  }

  async function handleRefund() {
    if (!selectedCredit?._id || refundAmount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    try {
      await vendorCreditApi.refund(selectedCredit._id, refundAmount);
      toast.success("Refund recorded");
      setShowRefundDialog(false);
      setRefundAmount(0);
      await loadDetail(selectedCredit._id);
      await loadCredits();
    } catch (err: any) {
      toast.error(err?.message || "Failed to record refund");
    }
  }

  async function handleAddComment() {
    if (!selectedCredit?._id || !commentText.trim()) {
      toast.error("Comment cannot be empty");
      return;
    }
    try {
      await vendorCreditApi.addComment(selectedCredit._id, commentText.trim());
      setCommentText("");
      toast.success("Comment added");
      await loadDetail(selectedCredit._id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add comment");
    }
  }

  function handlePrintPreview() {
    const el = document.querySelector("#vendor-credit-pdf-view .statement-print-area") as HTMLElement | null;
    if (!el) {
      toast.error("Please show the PDF View before printing.");
      return;
    }

    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) {
      window.print();
      return;
    }

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Vendor Credit - ${selectedCredit?.vendorCreditNumber || "Print"}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f3f4f6; font-family: Arial, sans-serif; }
        .statement-print-area {
          display: block !important;
          background: white;
          margin: 0 auto;
        }
        table { border-collapse: collapse; width: 100%; }
        img { max-width: 100%; display: block; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          body { background: white; }
          .statement-print-area { box-shadow: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      </style>
      </head><body>${el.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  async function handleDownloadPdf() {
    if (!selectedCredit?._id) return;
    try {
      const blob = await vendorCreditApi.downloadPdf(selectedCredit._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Vendor-Credit-${selectedCredit.vendorCreditNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  function handleExportTimeline() {
    if (!selectedCredit) return;
    const rows: string[] = ["Type,Date,Author,Details,Amount"];

    (selectedCredit.comments || []).forEach((c) => {
      rows.push([
        "Comment",
        fmtDate(c.time),
        (c.author || "").replace(/,/g, " "),
        (c.text || "").replace(/,/g, " "),
        "",
      ].join(","));
    });

    applications.forEach((ap) => {
      const billNo = typeof ap.billId === "object" ? ap.billId.billNumber : String(ap.billId || "");
      rows.push([
        "Applied",
        fmtDate(ap.appliedDate),
        "System",
        `Applied to ${billNo}`.replace(/,/g, " "),
        String(ap.amount || 0),
      ].join(","));
    });

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-credit-${selectedCredit.vendorCreditNumber}-timeline.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-gray-50/40">
        <PageHeader
          breadcrumb={<span className="text-sm font-semibold">All Vendor Credits</span>}
          actions={
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
              </div>
              <Button onClick={() => router.push("/purchases/vendor-credits/new")}>
                <Plus className="h-4 w-4 mr-1" /> New
              </Button>
            </div>
          }
        />

        {selectedId ? (
          <div className="h-[calc(100vh-120px)] border-t flex">
            <div className="w-[320px] border-r bg-white overflow-y-auto">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center justify-between">
                <span>{fetching ? "Loading..." : `${filtered.length} credits`}</span>
                <button type="button" onClick={() => setSelectedId(null)} className="hover:underline">Close</button>
              </div>
              <div className="divide-y">
                {filtered.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    className={`w-full text-left px-3 py-3 hover:bg-muted/40 ${selectedId === c._id ? "bg-blue-50" : ""}`}
                    onClick={() => loadDetail(c._id)}
                  >
                    <div className="font-medium text-sm truncate">{getName(c.vendorId) || "Vendor"}</div>
                    <div className="text-xs text-blue-600">{c.vendorCreditNumber}</div>
                    <div className="text-xs text-muted-foreground mt-1">{fmtDate(c.vendorCreditDate)}</div>
                    <div className="text-sm font-semibold mt-1">{fmtCurrency(c.total)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              {!selectedCredit ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a vendor credit</div>
              ) : (
                <div className="p-5 space-y-6">
                  <div className="flex items-center px-2 py-0.5 border rounded-md bg-white shrink-0 flex-wrap min-h-[48px] relative">
                    <div className="flex items-center pr-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/purchases/vendor-credits/${selectedCredit._id}/edit`)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    <div className="flex items-center px-2">
                      <DropdownMenu open={showPrintMenu} onOpenChange={setShowPrintMenu}>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium">
                            <Printer className="h-3.5 w-3.5" /> PDF/Print <ChevronDown className="h-3 w-3 opacity-50" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52 shadow-xl border-gray-200 mt-1">
                          <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handlePrintPreview}>
                            <Printer className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Print
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-xs py-2.5 cursor-pointer" onClick={handleDownloadPdf}>
                            <FileText className="h-3.5 w-3.5 mr-2.5 text-muted-foreground" /> Download PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    <div className="flex items-center px-2">
                      <button
                        type="button"
                        onClick={() => setShowApplyDialog(true)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-gray-600 hover:text-foreground transition-colors font-medium"
                      >
                        Apply to Bills
                      </button>
                    </div>

                    <div className="w-px h-6 bg-gray-200" />

                    <div className="flex items-center px-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-gray-600 hover:text-foreground transition-colors">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 shadow-xl border-gray-200 mt-1">
                          <DropdownMenuItem onClick={() => setShowRefundDialog(true)}>Refund</DropdownMenuItem>
                          <DropdownMenuItem onClick={handleVoid}>Void</DropdownMenuItem>
                          <DropdownMenuItem onClick={handleClone}>Clone</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => document.getElementById("vendor-credit-journal")?.scrollIntoView({ behavior: "smooth" })}>View Journal</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={handleDelete}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="ml-auto flex items-center relative gap-1">
                      <button
                        type="button"
                        className={`p-2 transition-colors relative hover:text-foreground rounded ${showAttachments ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
                        title="Attachments"
                        onClick={() => setShowAttachments((v) => !v)}
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        className="p-2 transition-colors relative hover:text-foreground rounded text-muted-foreground"
                        title="Comments & History"
                        onClick={() => document.getElementById("vendor-credit-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>

                      <div className="h-4 w-px bg-border mx-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(null);
                          setSelectedCredit(null);
                          setApplications([]);
                        }}
                        className="p-2 transition-colors text-muted-foreground hover:text-red-600 rounded"
                        title="Close"
                      >
                        <X className="h-5 w-5" />
                      </button>

                      {showAttachments && (
                        <div className="absolute top-full right-11 mt-2 w-[340px] bg-white rounded-md shadow-xl border z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
                          <div className="px-4 py-3 border-b flex items-center justify-between bg-white">
                            <h3 className="text-sm font-semibold">Attachments</h3>
                            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowAttachments(false)}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[300px] bg-white relative z-10">
                            {(selectedCredit.attachments || []).length === 0 && (
                              <p className="text-xs text-muted-foreground py-6 text-center border-b border-dashed">No Files Attached</p>
                            )}
                            {(selectedCredit.attachments || []).map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 border rounded-md px-3 py-2 text-xs text-primary hover:underline"
                              >
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate">{decodeURIComponent(url.split("/").pop() || "Attachment")}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <span className="text-sm text-muted-foreground mr-2">Show PDF View</span>
                    <button
                      type="button"
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showPdf ? "bg-primary" : "bg-muted-foreground/30"}`}
                      onClick={() => setShowPdf((v) => !v)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${showPdf ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {showPdf && (
                    <div id="vendor-credit-pdf-view" className="flex justify-center w-full">
                      <VendorCreditStandardPreview
                        credit={selectedCredit}
                        orgName={orgName}
                        orgLogo={orgLogo}
                        orgAddress={orgAddress}
                      />
                    </div>
                  )}

                  <div className="text-center text-xs text-muted-foreground">
                    PDF Template : &apos;Standard Template&apos; <button type="button" className="text-primary hover:underline ml-1">Change</button>
                  </div>

                  <div className="border rounded-lg p-4" id="vendor-credit-timeline">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold">Timeline & Comments</div>
                      <Button variant="outline" size="sm" onClick={handleExportTimeline}>Export Timeline</Button>
                    </div>
                    <div className="space-y-2 mb-3 max-h-40 overflow-y-auto text-sm">
                      {(selectedCredit.comments || []).map((c, idx) => (
                        <div key={idx} className="border rounded px-2 py-1">
                          <div className="text-xs text-muted-foreground">{c.author} • {fmtDate(c.time)}</div>
                          <div>{c.text}</div>
                        </div>
                      ))}
                      {applications.map((ap) => (
                        <div key={ap._id} className="border rounded px-2 py-1">
                          <div className="text-xs text-muted-foreground">Applied • {fmtDate(ap.appliedDate)}</div>
                          <div>
                            Applied {fmtCurrency(ap.amount)} to {typeof ap.billId === "object" ? ap.billId.billNumber : ap.billId}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment"
                        className="min-h-[66px]"
                      />
                      <Button onClick={handleAddComment}>Comment</Button>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4" id="vendor-credit-journal">
                    <div className="text-sm font-semibold mb-2">Journal</div>
                    <div className="text-xs text-muted-foreground mb-3">Amount is displayed in your base currency INR</div>
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left py-1">Account</th>
                          <th className="text-right py-1">Debit</th>
                          <th className="text-right py-1">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1">Accounts Payable</td>
                          <td className="text-right py-1">{fmtCurrency(selectedCredit.total)}</td>
                          <td className="text-right py-1">{fmtCurrency(0)}</td>
                        </tr>
                        <tr>
                          <td className="py-1">Vendor Credits</td>
                          <td className="text-right py-1">{fmtCurrency(0)}</td>
                          <td className="text-right py-1">{fmtCurrency(selectedCredit.total)}</td>
                        </tr>
                        {(selectedCredit.refundedAmount || 0) > 0 && (
                          <tr>
                            <td className="py-1">Refunds</td>
                            <td className="text-right py-1">{fmtCurrency(0)}</td>
                            <td className="text-right py-1">{fmtCurrency(selectedCredit.refundedAmount || 0)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {applications.length > 0 && (
                    <div className="border rounded-lg p-4">
                      <div className="text-sm font-semibold mb-2">Applied Bills</div>
                      <div className="space-y-2 text-sm">
                        {applications.map((ap) => (
                          <div key={ap._id} className="flex items-center justify-between border rounded p-2">
                            <span>{typeof ap.billId === "object" ? ap.billId.billNumber : ap.billId}</span>
                            <span className="font-medium">{fmtCurrency(ap.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-[calc(100vh-120px)] border-t bg-white overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>{fetching ? "Loading..." : `${filtered.length} vendor credits`}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-[1.1fr_1fr_1.5fr_1fr_1fr_1fr] px-4 py-2 text-xs uppercase text-muted-foreground bg-muted/30">
              <div>Date</div>
              <div>Credit Note#</div>
              <div>Vendor Name</div>
              <div>Status</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Balance</div>
            </div>
            <div className="divide-y">
              {filtered.map((credit) => (
                <button key={credit._id} type="button" className="w-full text-left px-4 py-3 hover:bg-muted/30" onClick={() => loadDetail(credit._id)}>
                  <div className="grid grid-cols-[1.1fr_1fr_1.5fr_1fr_1fr_1fr] items-center text-sm gap-2">
                    <div>{fmtDate(credit.vendorCreditDate)}</div>
                    <div className="text-blue-600">{credit.vendorCreditNumber}</div>
                    <div>{getName(credit.vendorId)}</div>
                    <div>{credit.status}</div>
                    <div className="text-right font-medium">{fmtCurrency(credit.total)}</div>
                    <div className="text-right">{fmtCurrency(credit.balanceAmount)}</div>
                  </div>
                </button>
              ))}
              {!fetching && filtered.length === 0 && (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No vendor credits yet. Create your first vendor credit.
                </div>
              )}
              {fetching && (
                <div className="py-16 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarInset>

      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply credits from {selectedCredit?.vendorCreditNumber}</DialogTitle>
            <DialogDescription>
              {candidateBills.length === 0
                ? "There are no bills in open status for this vendor. Hence, credits cannot be applied."
                : "Select a bill and amount to apply this credit."}
            </DialogDescription>
          </DialogHeader>
          {candidateBills.length > 0 && (
            <div className="space-y-3">
              <select
                className="border rounded-md h-9 px-2 text-sm w-full"
                value={applyBillId}
                onChange={(e) => setApplyBillId(e.target.value)}
              >
                <option value="">Select Bill</option>
                {candidateBills.map((bill) => (
                  <option key={bill._id} value={bill._id}>
                    {bill.billNumber} ({fmtCurrency(bill.balanceDue)})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                placeholder="Amount"
                value={applyAmount || ""}
                onChange={(e) => setApplyAmount(Number(e.target.value || 0))}
              />
            </div>
          )}
          <DialogFooter>
            {candidateBills.length > 0 ? <Button onClick={handleApply}>Apply</Button> : <Button onClick={() => setShowApplyDialog(false)}>OK</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Refund</DialogTitle>
            <DialogDescription>Record refunded amount for this vendor credit.</DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            placeholder="Refund amount"
            value={refundAmount || ""}
            onChange={(e) => setRefundAmount(Number(e.target.value || 0))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRefundDialog(false)}>Cancel</Button>
            <Button onClick={handleRefund}>Record Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
