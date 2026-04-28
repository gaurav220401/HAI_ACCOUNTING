"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import { smtpApi } from "@/lib/api/smtp";

function getCustomerName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
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
  salesOrderNumber: string;
  orderDate: string;
  amountText: string;
  senderName: string;
  organizationName: string;
}) {
  return `
    <p>Dear ${escapeHtml(params.customerName || "Customer")},</p>
    <p>The sales order (<strong>${escapeHtml(params.salesOrderNumber)}</strong>) is attached with this email.</p>
    <p>An overview of the sales order is available below:</p>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:18px 0;" />
    <h2 style="font-size:22px;line-height:1.35;margin:0 0 14px 0;">
      Sales Order # : <strong>${escapeHtml(params.salesOrderNumber)}</strong>
    </h2>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0;" />
    <table style="border-collapse:collapse;font-size:18px;line-height:1.8;">
      <tr>
        <td style="padding-right:18px;"><strong>Order Date</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.orderDate)}</strong></td>
      </tr>
      <tr>
        <td style="padding-right:18px;"><strong>Amount</strong></td>
        <td style="padding-right:18px;">:</td>
        <td><strong>${escapeHtml(params.amountText)}</strong></td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px dashed #6b7280;margin:14px 0 20px;" />
    <p>Please go through it and confirm the order. We look forward to working with you again.</p>
    <br />
    <p>Regards,</p>
    <p>${escapeHtml(params.senderName)}<br/>${escapeHtml(params.organizationName)}</p>
  `;
}

export default function SendSalesOrderEmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
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
      if (!orderId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await salesOrderApi.getById(orderId);
        if (!mounted) return;

        const so = res.data;
        setOrder(so);

        const customerEmail =
          typeof so.customerId === "object" ? so.customerId?.email || "" : "";
        const customerName = getCustomerName(so.customerId);

        setTo(customerEmail);
        setSubject(
          `Sales Order from ${activeOrganization.name} (Sales Order #: ${so.salesOrderNumber})`,
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

        const senderName = senderEmail ? senderEmail.split("@")[0] : activeOrganization.name;
        setBody(
          buildDefaultBody({
            customerName: customerName || "Customer",
            salesOrderNumber: so.salesOrderNumber,
            orderDate: formatDate(so.orderDate),
            amountText: `₹${formatAmount(Number(so.total || 0))} (in INR)`,
            senderName,
            organizationName: activeOrganization.name,
          }),
        );
      } catch {
        toast.error("Failed to load sales order");
        router.push("/sales/orders");
      } finally {
        if (mounted) setFetching(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [orderId, firebaseUser, activeOrganization?._id, activeOrganization?.name, router]);

  useEffect(() => {
    async function loadPdfPreview() {
      if (!order?._id) {
        setPdfPreviewUrl(null);
        return;
      }

      setPdfPreviewLoading(true);
      try {
        const pdfBlob = await salesOrderApi.downloadPdf(order._id);
        const nextUrl = URL.createObjectURL(pdfBlob);
        if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = nextUrl;
        setPdfPreviewUrl(nextUrl);
      } catch {
        setPdfPreviewUrl(null);
      } finally {
        setPdfPreviewLoading(false);
      }
    }

    loadPdfPreview();

    return () => {
      if (pdfPreviewUrlRef.current) {
        URL.revokeObjectURL(pdfPreviewUrlRef.current);
        pdfPreviewUrlRef.current = null;
      }
    };
  }, [order?._id]);

  const title = useMemo(() => {
    if (!order) return "Send Sales Order Email";
    return `Send Email • ${order.salesOrderNumber}`;
  }, [order]);

  function parseRecipients(v: string) {
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function handleSend() {
    if (!order) return;

    const toList = parseRecipients(to);
    if (toList.length === 0) {
      toast.error("At least one recipient is required");
      return;
    }

    setSending(true);
    try {
      await salesOrderApi.sendEmail(order._id, {
        to: toList,
        cc: parseRecipients(cc),
        subject,
        body,
        attachPdf,
      });
      toast.success("Sales order email sent");
      router.push(`/sales/orders/${order._id}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to send sales order email");
    } finally {
      setSending(false);
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader breadcrumb={<span className="text-sm font-medium">{title}</span>} />

        {fetching ? (
          <div className="flex items-center justify-center h-[70vh]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="w-full p-3 md:p-4">
            <div className="border rounded bg-white overflow-hidden">
              <div className="px-4 py-3 border-b text-2xl font-medium">
                Email To {getCustomerName(order?.customerId) || "Customer"}.
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="p-4 border-r space-y-4">
                  <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                    <span className="text-sm text-muted-foreground">From</span>
                    <span className="text-sm">{fromEmail || (firebaseUser as any)?.email || ""}</span>
                  </div>

                  <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                    <Label className="text-sm text-muted-foreground font-normal">Send To</Label>
                    <Input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="customer@example.com"
                      className="h-8"
                    />
                  </div>

                  <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                    <Label className="text-sm text-muted-foreground font-normal">Cc</Label>
                    <Input
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="optional@example.com"
                      className="h-8"
                    />
                  </div>

                  <div className="grid grid-cols-[90px_1fr] items-center gap-2">
                    <Label className="text-sm text-muted-foreground font-normal">Subject</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-2 pt-2">
                    <RichTextEditor value={body} onChange={setBody} className="min-h-[260px]" />
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="attach-so-pdf"
                      checked={attachPdf}
                      onCheckedChange={(checked) => setAttachPdf(!!checked)}
                    />
                    <label htmlFor="attach-so-pdf" className="text-sm font-medium leading-none">
                      Attach Sales Order PDF
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/sales/orders/${order?._id || ""}`)}
                      disabled={sending}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSend} disabled={sending}>
                      {sending ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-muted/20 min-h-[620px]">
                  <div className="text-sm font-medium mb-3">Sales Order PDF Preview</div>
                  <div className="h-[580px] border rounded bg-white overflow-hidden">
                    {pdfPreviewLoading ? (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading preview...
                      </div>
                    ) : pdfPreviewUrl ? (
                      <iframe title="Sales Order PDF Preview" src={pdfPreviewUrl} className="w-full h-full" />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Preview unavailable
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
