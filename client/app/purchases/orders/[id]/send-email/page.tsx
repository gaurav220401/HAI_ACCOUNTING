"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { purchaseOrderApi, type PurchaseOrder } from "@/lib/api/purchase-orders";
import { smtpApi } from "@/lib/api/smtp";

function getName(v: any): string {
  if (!v) return "";
  if (typeof v === "object") return v.displayName || v.companyName || v.name || "";
  return String(v);
}

export default function SendPurchaseOrderEmailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = params.id;

  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachPdf, setAttachPdf] = useState(true);
  const [fromEmail, setFromEmail] = useState("");

  function fmt(v: number) {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  }

  function dateText(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!orderId || !firebaseUser || !activeOrganization?._id) return;
      setFetching(true);
      try {
        const res = await purchaseOrderApi.getOne(orderId);
        if (!mounted) return;
        const po = res.data;
        setOrder(po);
        const vendorName = getName(po.vendorId);
        const vendorEmail = (po.vendorId as any)?.email || "";
        setTo(vendorEmail);
        setSubject(`Purchase Order from ${activeOrganization.name} (Purchase Order #: ${po.purchaseOrderNumber})`);

        let senderEmail = "";
        try {
          const smtpRes = await smtpApi.get(activeOrganization._id);
          const smtp = smtpRes.data;
          senderEmail = smtp?.fromEmail || smtp?.user || "";
        } catch {
          senderEmail = (firebaseUser as any)?.email || "";
        }
        setFromEmail(senderEmail);

        setBody([
          `Dear ${vendorName || "Vendor"},`,
          "",
          `The purchase order (${po.purchaseOrderNumber}) is attached with this email.`,
          "",
          "An overview of the purchase order is available below:",
          "",
          "--------------------------------------------------------------",
          "",
          `Purchase Order # : ${po.purchaseOrderNumber}`,
          "",
          "--------------------------------------------------------------",
          `Order Date      : ${dateText(po.purchaseOrderDate)}`,
          `Amount          : ₹${fmt(po.total)}(in INR)`,
          "--------------------------------------------------------------",
          "",
          "Please go through it and confirm the order. We look forward to working with you again",
          "",
          "Regards,",
          senderEmail ? senderEmail.split("@")[0] : activeOrganization.name,
          activeOrganization.name,
        ].join("\n"));
      } catch {
        toast.error("Failed to load purchase order");
        router.push("/purchases/orders");
      } finally {
        if (mounted) setFetching(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [orderId, firebaseUser, activeOrganization?._id, activeOrganization?.name, router]);

  const title = useMemo(() => {
    if (!order) return "Send Purchase Order Email";
    return `Send Email • ${order.purchaseOrderNumber}`;
  }, [order]);

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  async function handleSend() {
    if (!order) return;
    const toList = parseRecipients(to);
    if (toList.length === 0) {
      toast.error("At least one recipient is required");
      return;
    }

    setSending(true);
    try {
      await purchaseOrderApi.sendEmail(order._id, {
        to: toList,
        cc: parseRecipients(cc),
        bcc: parseRecipients(bcc),
        subject,
        body,
        attachPurchaseOrderPdf: attachPdf,
      });
      toast.success("Purchase order email sent");
      router.push("/purchases/orders");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send purchase order email");
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
                Email To {getName(order?.vendorId) || "Vendor"}.
              </div>

              <div className="divide-y">
                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5">
                  <span className="text-sm text-muted-foreground">From</span>
                  <span className="text-sm">{fromEmail || (firebaseUser as any)?.email || ""}</span>
                </div>

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Send To</span>
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="vendor@example.com" className="h-8" />
                </div>

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Cc</span>
                  <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="accounts@example.com" className="h-8" />
                </div>

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Bcc</span>
                  <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="owner@example.com" className="h-8" />
                </div>

                <div className="grid grid-cols-[90px_1fr] items-center px-4 py-2.5 gap-2">
                  <span className="text-sm text-muted-foreground">Subject</span>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8" />
                </div>

                <div className="px-4 py-2 bg-muted/30 text-sm text-muted-foreground flex items-center gap-5">
                  <span className="font-bold">B</span>
                  <span className="italic">I</span>
                  <span className="underline">U</span>
                  <span>16px</span>
                  <span>Arial</span>
                </div>

                <div className="px-4 py-3">
                  <Textarea
                    className="min-h-[360px] w-full border-0 shadow-none focus-visible:ring-0 px-0 text-sm leading-relaxed"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>

                <div className="px-4 py-3 bg-muted/30 flex items-center gap-2">
                  <Checkbox id="attach-pdf" checked={attachPdf} onCheckedChange={(v) => setAttachPdf(!!v)} />
                  <Label htmlFor="attach-pdf" className="text-sm cursor-pointer">Attach Purchase Order PDF</Label>
                  <div className="ml-auto border rounded px-3 py-1 text-sm text-muted-foreground bg-white">
                    {order?.purchaseOrderNumber || "PO"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3">
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
              <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
