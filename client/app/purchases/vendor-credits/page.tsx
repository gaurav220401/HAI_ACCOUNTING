"use client";
import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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
  X,  FileUp} from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/ui/rich-text-editor";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { billApi, type Bill } from "@/lib/api/bills";
import { uploadApi } from "@/lib/api/upload";
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

async function uploadImage(file: File, folder: string = "general"): Promise<string> {
  const res = await uploadApi.upload(file, folder);
  return res.url;
}

interface StatementTemplateConfig {
  templateId: string;
  templateName: string;
  paperSize: "A4" | "A5" | "Letter";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
  showFooter: boolean;
  footerFontSize: number;
  footerFontColor: string;
  footerCustomContent: string;
  showOrgLogo: boolean;
  orgLogoSize: number;
  showOrgName: boolean;
  orgNameColor: string;
  orgNameFontSize: number;
  showOrgAddress: boolean;
  vendorNameFontColor: string;
  vendorNameFontSize: number;
  showBillTo: boolean;
  billToLabel: string;
  showDocTitle: boolean;
  docTitle: string;
  docTitleFontSize: number;
  docTitleFontColor: string;
  tableHeaderFontSize: number;
  tableHeaderBgColor: string;
  tableHeaderFontColor: string;
  oddRowColor: string;
  evenRowColor: string;
}

const DEFAULT_TEMPLATE_CONFIG: StatementTemplateConfig = {
  templateId: "standard",
  templateName: "Standard",
  paperSize: "A4",
  margins: { top: 0.45, bottom: 0.45, left: 0.5, right: 0.5 },
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  backgroundColor: "#ffffff",
  showFooter: true,
  footerFontSize: 9,
  footerFontColor: "#666666",
  footerCustomContent: "This is a computer-generated statement.",
  showOrgLogo: true,
  orgLogoSize: 60,
  showOrgName: true,
  orgNameColor: "#333333",
  orgNameFontSize: 10,
  showOrgAddress: true,
  vendorNameFontColor: "#333333",
  vendorNameFontSize: 9,
  showBillTo: true,
  billToLabel: "To",
  showDocTitle: true,
  docTitle: "Vendor Credits",
  docTitleFontSize: 16,
  docTitleFontColor: "#000000",
  tableHeaderFontSize: 9,
  tableHeaderBgColor: "#3c3d3a",
  tableHeaderFontColor: "#ffffff",
  oddRowColor: "#ffffff",
  evenRowColor: "#f6f5f5",
};

const TEMPLATE_STORAGE_KEY = (vendorId: string) => `stmt-tmpl-config-${vendorId}`;

function getVendorId(credit?: VendorCredit | null): string {
  if (!credit?.vendorId) return "";
  return typeof credit.vendorId === "object" ? String(credit.vendorId._id || "") : String(credit.vendorId);
}

function VendorCreditStandardPreview({
  credit,
  orgName,
  orgLogo,
  orgAddress,
  templateConfig,
}: {
  credit: VendorCredit;
  orgName: string;
  orgLogo: string;
  orgAddress: any;
  templateConfig: StatementTemplateConfig;
}) {
  const vendorName = getName(credit.vendorId) || "Vendor";
  const previewTitle = "VENDOR CREDITS";
  const vendorAddress =
    typeof credit.vendorId === "object" && credit.vendorId?.billingAddress
      ? credit.vendorId.billingAddress
      : null;

  const paperW =
    templateConfig.paperSize === "A5"
      ? "148mm"
      : templateConfig.paperSize === "Letter"
        ? "216mm"
        : "210mm";
  const paperMinH =
    templateConfig.paperSize === "A5"
      ? "210mm"
      : templateConfig.paperSize === "Letter"
        ? "279mm"
        : "297mm";

  return (
    <div
      className="statement-print-area bg-white mx-auto shadow-sm print:shadow-none flex flex-col relative"
      style={{
        width: paperW,
        minHeight: paperMinH,
        fontFamily: templateConfig.fontFamily,
        fontSize: `${templateConfig.fontSize}pt`,
        backgroundColor: templateConfig.backgroundColor,
      }}
    >
      <div className="absolute top-0 left-0 z-10">
        <div className="no-print bg-blue-500 text-white text-xs px-8 py-2 transform -rotate-45 -translate-x-7 translate-y-4 shadow">
          {credit.status === "VOID" ? "Void" : "Open"}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: `${templateConfig.margins.top}in ${templateConfig.margins.right}in 0 ${templateConfig.margins.left}in`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <div style={{ maxWidth: "45%" }}>
            {templateConfig.showOrgLogo && orgLogo && (
              <img
                src={orgLogo}
                alt={orgName}
                crossOrigin="anonymous"
                style={{ maxHeight: `${templateConfig.orgLogoSize}px`, width: "auto", objectFit: "contain", display: "block" }}
              />
            )}

            {templateConfig.showOrgName && (
              <p style={{ fontWeight: "700", color: templateConfig.orgNameColor, fontSize: `${templateConfig.orgNameFontSize}pt`, margin: 0, lineHeight: 1.3 }}>
                {orgName || "Organization"}
              </p>
            )}

            {templateConfig.showOrgAddress && (
              <>
                {(orgAddress?.city || orgAddress?.state) && (
                  <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>
                    {[orgAddress?.city, orgAddress?.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {orgAddress?.zip && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.zip}</p>}
                {orgAddress?.street && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.street}</p>}
                {orgAddress?.phone && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>Ph: {orgAddress.phone}</p>}
              </>
            )}
          </div>

          <div style={{ textAlign: "right", maxWidth: "48%" }}>
            {templateConfig.showDocTitle && (
              <h1 style={{ fontWeight: "700", color: templateConfig.docTitleFontColor, fontSize: `${templateConfig.docTitleFontSize}pt`, margin: 0, lineHeight: 1.2 }}>
                {previewTitle}
              </h1>
            )}
            <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "3px 0 0" }}>Credit Note#: {credit.vendorCreditNumber}</p>
            <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>Credits Remaining: {fmtCurrency(credit.balanceAmount)}</p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
          <div style={{ maxWidth: "55%" }}>
            {templateConfig.showBillTo && (
              <p style={{ fontSize: "8pt", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>
                Vendor Details
              </p>
            )}
            <p style={{ fontWeight: "600", color: templateConfig.vendorNameFontColor, fontSize: `${templateConfig.vendorNameFontSize}pt`, margin: 0, lineHeight: 1.35 }}>
              {vendorName}
            </p>

          {vendorAddress ? (
            <>
              <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{vendorAddress.street || ""}</p>
              <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{[vendorAddress.city, vendorAddress.state].filter(Boolean).join(", ")}</p>
              <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{vendorAddress.zip || ""}</p>
              <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{vendorAddress.country || ""}</p>
            </>
          ) : (
            <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>Address not available</p>
          )}
          </div>

          <div style={{ textAlign: "right", maxWidth: "42%" }}>
            <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "4px 0 0" }}>Date: {fmtDate(credit.vendorCreditDate)}</p>
            <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "4px 0 0" }}>
              Reference: {credit.referenceBillId?.billNumber || credit.orderNumber || "-"}
            </p>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${templateConfig.tableHeaderBgColor}`, marginBottom: "10px" }} />

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
          <thead>
            <tr style={{ backgroundColor: templateConfig.tableHeaderBgColor, color: templateConfig.tableHeaderFontColor, fontSize: `${templateConfig.tableHeaderFontSize}pt` }}>
              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>#</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>Item & Description</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>Qty</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>Rate</th>
              <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {credit.lineItems.filter((line) => !line.isHeader).map((line, idx) => (
              <tr key={line._id || idx} style={{ backgroundColor: idx % 2 === 0 ? templateConfig.evenRowColor : templateConfig.oddRowColor }}>
                <td style={{ padding: "6px 10px" }}>{idx + 1}</td>
                <td style={{ padding: "6px 10px" }}>{line.name || "Item"}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{Number(line.quantity || 0).toFixed(2)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCurrency(line.rate)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>{fmtCurrency(line.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: `2px solid ${templateConfig.tableHeaderBgColor}` }}>
              <td colSpan={4} style={{ padding: "7px 10px", textAlign: "right" }}>Sub Total</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtCurrency(credit.subTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4} style={{ padding: "7px 10px", textAlign: "right" }}>Total</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtCurrency(credit.total)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4} style={{ padding: "7px 10px", textAlign: "right" }}>Credits Remaining</td>
              <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtCurrency(credit.balanceAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: "24px", fontSize: "9.5pt", color: "#4b5563" }}>
          Authorized Signature ____________________________
        </div>
      </div>

      <div style={{ padding: `8px ${templateConfig.margins.right}in ${templateConfig.margins.bottom}in ${templateConfig.margins.left}in` }}>
        {templateConfig.showFooter && (
          <>
            <div style={{ borderTop: "1px solid #d1d5db", marginBottom: "6px" }} />
            <p style={{ fontSize: `${templateConfig.footerFontSize}pt`, color: templateConfig.footerFontColor, textAlign: "center", margin: 0 }}>
              {templateConfig.footerCustomContent || "This is a computer-generated statement."}
            </p>
          </>
        )}
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
  const [showComments, setShowComments] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ url: string; publicId: string; name: string }>>([]);
  const [comments, setComments] = useState<Array<{ id: string; author: string; text: string; time: string; isSystem: boolean }>>([]);
  const [uploading, setUploading] = useState(false);
  const attachFileRef = useRef<HTMLInputElement>(null);
  const [templateConfig, setTemplateConfig] = useState<StatementTemplateConfig>(DEFAULT_TEMPLATE_CONFIG);

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

  useEffect(() => {
    if (!selectedCredit) {
      setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
      setAttachments([]);
      setComments([]);
      return;
    }

    const vendorId = getVendorId(selectedCredit);
    if (!vendorId) {
      setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
      return;
    }

    try {
      const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY(vendorId));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<StatementTemplateConfig>;
        setTemplateConfig((prev) => ({
          ...prev,
          ...parsed,
          margins: { ...prev.margins, ...(parsed.margins || {}) },
        }));
        return;
      }
    } catch {
      // ignore and use default
    }

    setTemplateConfig(DEFAULT_TEMPLATE_CONFIG);
  }, [selectedCredit]);

  useEffect(() => {
    if (!selectedCredit) return;
    setAttachments(
      (selectedCredit.attachments || []).map((url) => ({
        url,
        publicId: "",
        name: decodeURIComponent(url.split("/").pop() || "File"),
      })),
    );
    setComments(
      [...(selectedCredit.comments || [])].reverse().map((c, idx) => ({
        id: `c-${idx}`,
        author: c.author,
        text: c.text,
        time: new Date(c.time).toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        isSystem: !!c.isSystem,
      })),
    );
  }, [selectedCredit]);

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
        body { background: #f3f4f6; font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .statement-print-area {
          display: block !important;
          background: white;
          margin: 0 auto;
          width: 210mm !important;
          min-height: 297mm !important;
        }
        table { border-collapse: collapse; width: 100%; }
        img { max-width: 100%; display: block; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
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
    if (!selectedCredit?._id) {
      toast.error("Please select a vendor credit first.");
      return;
    }

    const el = document.querySelector("#vendor-credit-pdf-view .statement-print-area") as HTMLElement | null;
    if (!el) {
      toast.error("Please enable Show PDF View, then try downloading again.");
      return;
    }
    const safeNo = (selectedCredit.vendorCreditNumber || "vendor-credit").replace(/[^a-zA-Z0-9-_]/g, "-");
    const fileName = `Vendor-Credit-${safeNo}.pdf`;

    const downloadBlob = (blob: Blob, name: string) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    };

    try {
      // Build a sanitized off-screen clone to avoid unsupported CSS color functions
      // (e.g. lab/oklch from utility classes) during html2canvas parsing.
      const cloneWrap = document.createElement("div");
      cloneWrap.style.position = "fixed";
      cloneWrap.style.left = "-100000px";
      cloneWrap.style.top = "0";
      cloneWrap.style.width = "210mm";
      cloneWrap.style.background = "#ffffff";
      cloneWrap.style.pointerEvents = "none";

      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.boxShadow = "none";
      clone.style.background = "#ffffff";

      // Remove no-print markers and utility classes so renderer relies on inline styles only.
      clone.querySelectorAll(".no-print").forEach((n) => n.remove());
      clone.querySelectorAll("*").forEach((node) => {
        if (node instanceof HTMLElement) {
          node.removeAttribute("class");
        }
      });

      cloneWrap.appendChild(clone);
      document.body.appendChild(cloneWrap);

      try {
        const canvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        const imageData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        const pageW = 210;
        const pageH = 297;
        const imgW = pageW;
        const imgH = (canvas.height * imgW) / canvas.width;

        if (imgH <= pageH) {
          pdf.addImage(imageData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
        } else {
          let heightLeft = imgH;
          let y = 0;
          pdf.addImage(imageData, "PNG", 0, y, imgW, imgH, undefined, "FAST");
          heightLeft -= pageH;

          while (heightLeft > 0) {
            y = heightLeft - imgH;
            pdf.addPage();
            pdf.addImage(imageData, "PNG", 0, y, imgW, imgH, undefined, "FAST");
            heightLeft -= pageH;
          }
        }

        pdf.save(fileName);
        toast.success("PDF downloaded");
      } finally {
        cloneWrap.remove();
      }
    } catch {
      try {
        // Guaranteed download fallback.
        const blob = await vendorCreditApi.downloadPdf(selectedCredit._id);
        downloadBlob(blob, fileName);
        toast.success("PDF downloaded (server fallback)");
      } catch {
        toast.error("Failed to download PDF. Please try again.");
      }
    }
  }

  function handleEditTemplate() {
    if (!selectedCredit) return;
    const vendorId = getVendorId(selectedCredit);
    if (!vendorId) {
      toast.error("Vendor not found for template customization");
      return;
    }
    router.push(`/purchases/vendors/${vendorId}/edit-template`);
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
              <Link href="/batch-import?section=purchases&type=Vendor Credits&back=/purchases/vendor-credits">
                <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 text-xs border-slate-300 text-slate-700 hover:text-slate-900 bg-white">
                  <FileUp className="h-3.5 w-3.5" /> Batch Import
                </Button>
              </Link>
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
                        onClick={() => { setShowAttachments((v) => !v); setShowComments(false); }}
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        className={`p-2 transition-colors relative hover:text-foreground rounded ${showComments ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
                        title="Comments & History"
                        onClick={() => { setShowComments((v) => !v); setShowAttachments(false); }}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {comments.length > 0 && (
                          <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold">
                            {comments.length}
                          </span>
                        )}
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
                            {attachments.length === 0 && (
                              <p className="text-xs text-muted-foreground py-6 text-center border-b border-dashed">No Files Attached</p>
                            )}
                            {attachments.map((a, idx) => {
                              const isImg = ["jpg", "jpeg", "png", "gif", "webp"].some((e) => a.url.toLowerCase().includes(`.${e}`));
                              return (
                                <div key={idx} className="flex items-center gap-2 border rounded-md px-3 py-2 text-xs group">
                                  {isImg
                                    ? <img src={a.url} className="h-8 w-8 object-cover rounded shrink-0" alt={a.name} />
                                    : <span className="text-red-500 text-base shrink-0">📄</span>
                                  }
                                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate flex-1">
                                    {a.name}
                                  </a>
                                  {a.publicId && (
                                    <button
                                      type="button"
                                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                                      onClick={async () => {
                                        try {
                                          await uploadApi.remove(a.publicId);
                                          const next = attachments.filter((_, i) => i !== idx);
                                          setAttachments(next);
                                          if (selectedCredit?._id) {
                                            await vendorCreditApi.update(selectedCredit._id, { attachments: next.map((x) => x.url) });
                                          }
                                        } catch {
                                          toast.error("Failed to remove file");
                                        }
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                            <div className="pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 text-primary border-primary/20 text-xs w-full py-4 bg-blue-50/30 hover:bg-blue-50/50 border-dashed"
                                disabled={uploading || attachments.length >= 10}
                                onClick={() => attachFileRef.current?.click()}
                              >
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {uploading ? "Uploading..." : "Upload your Files"} <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              </Button>
                              <input
                                ref={attachFileRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                  const files = Array.from(e.target.files || []);
                                  if (!files.length || !selectedCredit?._id) return;
                                  setUploading(true);
                                  try {
                                    const results = await Promise.all(
                                      files.slice(0, 10 - attachments.length).map((f) => uploadApi.upload(f, "vendor-credits")),
                                    );
                                    const next = [
                                      ...attachments,
                                      ...results.map((r) => ({
                                        url: r.url,
                                        publicId: r.publicId,
                                        name: decodeURIComponent(r.url.split("/").pop() || "File"),
                                      })),
                                    ];
                                    setAttachments(next);
                                    await vendorCreditApi.update(selectedCredit._id, { attachments: next.map((x) => x.url) });
                                    toast.success("Files uploaded");
                                  } catch {
                                    toast.error("Upload failed");
                                  } finally {
                                    setUploading(false);
                                    e.target.value = "";
                                  }
                                }}
                              />
                              <p className="text-[10px] text-muted-foreground mt-2 text-center">You can upload a maximum of 10 files, 10MB each</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Sheet open={showComments} onOpenChange={setShowComments}>
                    <SheetContent side="right" className="p-0 sm:max-w-[400px] flex flex-col gap-0 border-l shadow-xl">
                      <SheetHeader className="px-5 py-4 border-b">
                        <SheetTitle className="text-base font-semibold">Comments &amp; History</SheetTitle>
                      </SheetHeader>
                      <div className="flex-1 flex flex-col overflow-hidden bg-white">
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                          <RichTextEditor
                            value={commentText}
                            onChange={setCommentText}
                            onImageUpload={(file) => uploadImage(file, "comments")}
                            placeholder="Type your comment here..."
                            minHeight="100px"
                            className="border-none"
                            toolbarClassName="bg-gray-50/80 border-b"
                          />
                          <div className="px-3 py-2.5 bg-gray-50/50 flex justify-start border-t">
                            <button
                              disabled={!commentText.replace(/<[^>]*>/g, "").trim()}
                              className="h-8 px-5 py-0 text-xs font-semibold border border-primary/20 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                              onClick={async () => {
                                if (!selectedCredit?._id) return;
                                const txt = commentText.trim();
                                if (!txt || !txt.replace(/<[^>]*>/g, "").trim()) return;
                                try {
                                  const res = await vendorCreditApi.addComment(selectedCredit._id, txt);
                                  setComments((prev) => [
                                    {
                                      id: Date.now().toString(),
                                      author: res.data.author || "User",
                                      text: res.data.text || txt,
                                      time: new Date(res.data.time || Date.now()).toLocaleString("en-IN", {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      }),
                                      isSystem: !!res.data.isSystem,
                                    },
                                    ...prev,
                                  ]);
                                  setCommentText("");
                                  await loadDetail(selectedCredit._id);
                                  toast.success("Comment added");
                                } catch {
                                  toast.error("Failed to add comment");
                                }
                              }}
                            >
                              Add Comment
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-6">
                          <div className="flex items-center justify-between mb-6">
                            <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/80">ALL COMMENTS</h4>
                            <span className="bg-primary/10 text-primary rounded-full text-[11px] px-2.5 py-0.5 font-bold">{comments.length}</span>
                          </div>

                          <div className="space-y-4 pb-10">
                            {comments.map((c) => (
                              <div key={c.id} className="border rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-sm text-gray-800">{c.author.split("@")[0]}</span>
                                  <span className="text-[11px] text-muted-foreground">• {c.time}</span>
                                </div>
                                <div className="text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: c.text }} />
                              </div>
                            ))}
                            {comments.length === 0 && (
                              <div className="text-center py-10">
                                <MessageSquare className="h-8 w-8 text-border mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">No comments yet</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>

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
                        templateConfig={templateConfig}
                      />
                    </div>
                  )}

                  <div className="text-center text-xs text-muted-foreground">
                    PDF Template : &apos;{templateConfig.templateName || "Standard"}&apos; <button type="button" className="text-primary hover:underline ml-1" onClick={handleEditTemplate}>Change</button>
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
