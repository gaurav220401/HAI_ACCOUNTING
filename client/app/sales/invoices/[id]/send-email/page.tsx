"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import { smtpApi } from "@/lib/api/smtp";

function getCustomerName(v?: Invoice["customerId"]) {
  if (!v) return "";
  if (typeof v === "object") {
    return (v as any).displayName || (v as any).companyName || (v as any).name || "";
  }
  return String(v);
}

function getCustomerEmail(v?: Invoice["customerId"]) {
  if (!v || typeof v === "string") return "";
  return v.email || "";
}

function escapeHtml(v: string): string {
  return v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAmount(v: number) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function buildDefaultBody(params: {
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountText: string;
  senderName: string;
  organizationName: string;
}) {
  return `
    <p>Dear ${escapeHtml(params.customerName || "Customer")},</p>
    <p>The invoice (<strong>${escapeHtml(params.invoiceNumber)}</strong>) is attached with this email.</p>
    <p>An overview of the invoice is available below:</p>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:18px 0;" />
    <h2 style="font-size:22px;line-height:1.35;margin:0 0 14px 0;">
      Invoice # : <strong>${escapeHtml(params.invoiceNumber)}</strong>
    </h2>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0;" />
    <table style="border-collapse:collapse;font-size:18px;line-height:1.8;">
      <tr>
        <td style="padding-right:18px;"><strong>Invoice Date</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.invoiceDate)}</strong></td>
      </tr>
      <tr>
        <td style="padding-right:18px;"><strong>Amount</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.amountText)}</strong></td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0 20px;" />
    <p>Please review and let us know if you have any questions.</p>
    <br />
    <p>Regards,</p>
    <p>${escapeHtml(params.senderName)}<br/>${escapeHtml(params.organizationName)}</p>
  `;
}

export default function SendInvoiceEmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;

  const { firebaseUser, loading } = useAuth();
  const {
    needsOrgSetup,
    loading: orgLoading,
    activeOrganization,
  } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [fromEmail, setFromEmail] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const pdfPreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) {
      router.push("/org-setup");
    }
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!invoiceId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await invoiceApi.getById(invoiceId);
        if (!mounted) return;
        const nextInvoice = res.data;
        setInvoice(nextInvoice);

        const customerName = getCustomerName(nextInvoice.customerId);
        const customerEmail = getCustomerEmail(nextInvoice.customerId);
        setTo(customerEmail);
        setSubject(
          `Invoice from ${activeOrganization.name} (Invoice #: ${nextInvoice.invoiceNumber})`,
        );

        let senderEmail = "";
        try {
          const smtpRes = await smtpApi.get(activeOrganization._id);
          const smtp = smtpRes.data;
          senderEmail = smtp?.fromEmail || smtp?.user || "";
        } catch {
          senderEmail = (firebaseUser as any)?.email || "";
        }
        setFromEmail(senderEmail);

        const senderName =
          senderEmail ? senderEmail.split("@")[0] : activeOrganization.name;
        setBody(
          buildDefaultBody({
            customerName: customerName || "Customer",
            invoiceNumber: nextInvoice.invoiceNumber,
            invoiceDate: formatDate(nextInvoice.invoiceDate),
            amountText: `INR ${formatAmount(Number(nextInvoice.total || 0))}`,
            senderName,
            organizationName: activeOrganization.name,
          }),
        );
      } catch {
        toast.error("Failed to load invoice");
        router.push("/sales/invoices");
      } finally {
        if (mounted) setFetching(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [
    invoiceId,
    firebaseUser,
    activeOrganization?._id,
    activeOrganization?.name,
    router,
  ]);

  useEffect(() => {
    async function loadPdfPreview() {
      if (!invoice?._id) {
        setPdfPreviewUrl(null);
        return;
      }
      setPdfPreviewLoading(true);
      try {
        const pdfBlob = await invoiceApi.downloadPdf(invoice._id);
        const nextUrl = URL.createObjectURL(pdfBlob);
        if (pdfPreviewUrlRef.current)
          URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = nextUrl;
        setPdfPreviewUrl(nextUrl);
      } catch {
        setPdfPreviewUrl(null);
      } finally {
        setPdfPreviewLoading(false);
      }
    }

    if (attachPdf) {
      loadPdfPreview();
    } else {
      setPdfPreviewUrl(null);
    }

    return () => {
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = null;
      }
    };
  }, [invoice?._id, attachPdf]);

  const title = useMemo(() => {
    if (!invoice) return "Send Invoice Email";
    return `Send Email - ${invoice.invoiceNumber}`;
  }, [invoice]);

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  async function handleSend() {
    if (!invoice) return;
    const toList = parseRecipients(to);
    if (toList.length === 0) {
      toast.error("At least one recipient is required");
      return;
    }

    setSending(true);
    try {
      await invoiceApi.sendEmail(invoice._id, {
        to: toList,
        cc: parseRecipients(cc),
        bcc: parseRecipients(bcc),
        subject,
        body,
        attachInvoicePdf: attachPdf,
      });
      toast.success("Invoice email sent");
      router.push(`/sales/invoices/${invoice._id}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send invoice email");
    } finally {
      setSending(false);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-white flex flex-col overflow-hidden h-svh">
        <PageHeader
          breadcrumb={
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-teal-700">Invoices</span>
              <span className="text-slate-400">/</span>
              <span className="font-semibold text-slate-700">{title}</span>
            </div>
          }
        />

        {fetching ?
          <div className="flex items-center justify-center h-[70vh] bg-white">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        : <div className="w-full p-4 overflow-y-auto flex-1 bg-slate-50/30">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                <div className="px-6 py-4 border-b border-slate-200 text-lg font-bold text-slate-800">
                  Email To {getCustomerName(invoice?.customerId) || "Customer"}
                </div>

                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-[90px_1fr] items-center px-6 py-3">
                    <span className="text-sm font-semibold text-slate-400">From</span>
                    <span className="text-sm font-medium text-slate-700">
                      {fromEmail || (firebaseUser as any)?.email || ""}
                    </span>
                  </div>

                  <div className="grid grid-cols-[90px_1fr] items-center px-6 py-3 gap-2">
                    <span className="text-sm font-semibold text-slate-400">Send To</span>
                    <div className="flex items-center gap-2">
                      <Input
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        placeholder="customer@example.com"
                        className="h-9 flex-1 border-slate-200 focus-visible:ring-teal-600"
                      />
                      {!showCc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-teal-700 hover:text-teal-800 hover:bg-slate-50 font-bold h-9"
                          onClick={() => setShowCc(true)}
                        >
                          Cc
                        </Button>
                      )}
                      {!showBcc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-teal-700 hover:text-teal-800 hover:bg-slate-50 font-bold h-9"
                          onClick={() => setShowBcc(true)}
                        >
                          Bcc
                        </Button>
                      )}
                    </div>
                  </div>

                  {showCc && (
                    <div className="grid grid-cols-[90px_1fr] items-center px-6 py-3 gap-2">
                      <span className="text-sm font-semibold text-slate-400">Cc</span>
                      <Input
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="cc@example.com"
                        className="h-9 border-slate-200 focus-visible:ring-teal-600"
                      />
                    </div>
                  )}

                  {showBcc && (
                    <div className="grid grid-cols-[90px_1fr] items-center px-6 py-3 gap-2">
                      <span className="text-sm font-semibold text-slate-400">Bcc</span>
                      <Input
                        value={bcc}
                        onChange={(e) => setBcc(e.target.value)}
                        placeholder="bcc@example.com"
                        className="h-9 border-slate-200 focus-visible:ring-teal-600"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-[90px_1fr] items-center px-6 py-3 gap-2">
                    <span className="text-sm font-semibold text-slate-400">Subject</span>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="h-9 border-slate-200 focus-visible:ring-teal-600"
                    />
                  </div>

                  <div className="px-6 py-4">
                    <RichTextEditor
                      value={body}
                      onChange={setBody}
                      minHeight="360px"
                      placeholder="Write your email body..."
                    />
                  </div>

                  <div className="px-6 py-4 bg-slate-50/50 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="attach-pdf"
                        checked={attachPdf}
                        onCheckedChange={(v) => setAttachPdf(!!v)}
                        className="accent-teal-600"
                      />
                      <Label
                        htmlFor="attach-pdf"
                        className="text-sm font-semibold text-slate-600 cursor-pointer"
                      >
                        Attach Invoice PDF
                      </Label>
                    </div>
                    <div className="ml-auto border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 bg-white flex items-center gap-2 shadow-2xs">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span>{invoice?.invoiceNumber || "INV"}.pdf</span>
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-slate-50/50 border-t border-slate-200 flex items-center gap-2">
                    <Checkbox
                      id="mark-as-sent"
                      checked={true}
                      disabled
                      className="accent-teal-600"
                    />
                    <Label
                      htmlFor="mark-as-sent"
                      className="text-xs font-semibold text-slate-400 cursor-not-allowed"
                    >
                      Mark as Sent (Automatically updated upon success)
                    </Label>
                  </div>

                  {attachPdf && (
                    <div className="px-6 py-6 bg-slate-50/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-700">PDF Preview</p>
                        {pdfPreviewUrl && (
                          <a
                            href={pdfPreviewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-teal-700 hover:text-teal-800 hover:underline"
                          >
                            Open full preview
                          </a>
                        )}
                      </div>

                      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm bg-white">
                        {pdfPreviewLoading ?
                          <div className="h-[500px] w-full flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                          </div>
                        : pdfPreviewUrl ?
                          <iframe
                            title="Invoice PDF Preview"
                            src={pdfPreviewUrl}
                            className="w-full h-[680px]"
                          />
                        : <div className="h-[500px] w-full flex items-center justify-center text-xs font-medium text-slate-400">
                            PDF preview could not be loaded.
                          </div>
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pb-8">
                <Button
                  onClick={handleSend}
                  disabled={sending}
                  className="min-w-[120px] bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-xs h-9"
                >
                  {sending ?
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Send className="h-4 w-4 mr-2" />}
                  Send Email
                </Button>
                <Button variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-50 h-9 rounded-md" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        }
      </SidebarInset>
    </SidebarProvider>
  );
}
