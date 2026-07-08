"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Settings2, Layout, FileText, Grid, AlignLeft, RefreshCw, X, Cloud, CloudCheck, CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { quoteApi, type Quote } from "@/lib/api/quotes";
import { organizationApi } from "@/lib/api/organizations";
import { apiFetch } from "@/lib/api/client";
import { type QuoteTemplateConfig, type EditTemplateTab, DEFAULT_CONFIG, COLOR_THEMES, STORAGE_KEY, MOCK_ITEMS, MOCK_QUOTE } from "./config";
import { SettingsPanel } from "./panels";

const fmtNum = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function fmtDateValue(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const TEXT_FALLBACK_KEYS: Array<keyof QuoteTemplateConfig> = [
  "templateName",
  "billToLabel",
  "docTitle",
  "quoteNumberLabel",
  "quoteDateLabel",
  "expiryDateLabel",
  "signatureLabel",
  "gstinLabel",
  "contactLabel",
  "emailLabel",
  "factoryLabel",
  "itemLabel",
  "hsnLabel",
  "qtyLabel",
  "rateLabel",
  "discountLabel",
  "taxLabel",
  "amountLabel",
  "notesLabel",
  "termsLabel",
  "footerLine1",
  "footerLine2",
  "footerLine3",
  "footerCustomContent",
];

function normalizeTaxLabel(value?: string): string {
  return (value || "").trim().toUpperCase();
}

function resolveTaxModeFromName(value?: string): "igst" | "cgst" | "sgst" | "gst" | "unknown" {
  const name = normalizeTaxLabel(value);
  if (!name) return "unknown";
  if (name.startsWith("IGST")) return "igst";
  if (name.startsWith("CGST")) return "cgst";
  if (name.startsWith("SGST")) return "sgst";
  if (name.startsWith("GST")) return "gst";
  return "unknown";
}

function normalizeConfig(raw?: Partial<QuoteTemplateConfig> | null): QuoteTemplateConfig {
  const merged: QuoteTemplateConfig = {
    ...DEFAULT_CONFIG,
    ...(raw || {}),
    margins: { ...DEFAULT_CONFIG.margins, ...(raw?.margins ?? {}) },
  };

  TEXT_FALLBACK_KEYS.forEach((key) => {
    const value = merged[key];
    if (typeof value === "string" && value.trim() === "") {
      (merged as any)[key] = DEFAULT_CONFIG[key];
    }
  });

  if (!COLOR_THEMES.some((t) => t.id === merged.colorTheme)) {
    merged.colorTheme = DEFAULT_CONFIG.colorTheme;
  }

  return merged;
}

function numberToWords(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", 
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen ",
  ];
  const b = ["", "", "Twenty ", "Thirty ", "Forty ", "Fifty ", "Sixty ", "Seventy ", "Eighty ", "Ninety "];

  function inWords(n: number): string {
    const s = n.toString();
    if (s.length > 9) return "overflow";
    const match = ("000000000" + s).slice(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!match) return "";
    let str = "";
    str += Number(match[1]) !== 0 ? (a[Number(match[1])] || b[Number(match[1][0])] + a[Number(match[1][1])]) + "Crore " : "";
    str += Number(match[2]) !== 0 ? (a[Number(match[2])] || b[Number(match[2][0])] + a[Number(match[2][1])]) + "Lakh " : "";
    str += Number(match[3]) !== 0 ? (a[Number(match[3])] || b[Number(match[3][0])] + a[Number(match[3][1])]) + "Thousand " : "";
    str += Number(match[4]) !== 0 ? (a[Number(match[4])] || b[Number(match[4][0])] + a[Number(match[4][1])]) + "Hundred " : "";
    str += Number(match[5]) !== 0 ? (str !== "" ? "and " : "") + (a[Number(match[5])] || b[Number(match[5][0])] + a[Number(match[5][1])]) : "";
    return str;
  }

  const integer = Math.floor(num);
  const decimal = Math.round((num - integer) * 100);

  let res = "Indian Rupee " + inWords(integer);
  if (decimal > 0) {
    res += "and " + inWords(decimal) + "Paise ";
  }
  return res + "Only";
}

export default function EditQuoteTemplatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization, refreshOrganizations } = useOrganization();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [fetching, setFetching] = useState(true);
  const [etTab, setEtTab] = useState<EditTemplateTab>("general");
  const [config, setConfig] = useState<QuoteTemplateConfig>(DEFAULT_CONFIG);
  const [previewKey, setPreviewKey] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle"|"saving"|"synced"|"error">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const resetRef = useRef<NodeJS.Timeout|null>(null);

  const org = activeOrganization as any;
  const orgLogo = org?.logo ?? "";
  const orgName = org?.name ?? "";
  const orgAddr = (org?.address || org?.billingAddress) as Record<string, string> | undefined;
  const orgTaxId = org?.taxId ?? "";
  const orgPhone = org?.phone || orgAddr?.phone || "";
  const orgEmail = org?.smtpSettings?.fromEmail || org?.smtpSettings?.user || org?.email || "";

  useEffect(() => { if (!loading && !firebaseUser) router.push("/login"); }, [loading, firebaseUser, router]);
  useEffect(() => { if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup"); }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading) return;
    const id = params?.id;
    if (!id) { setFetching(false); return; }
    let hasStored = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY(id));
      if (stored) {
        const p = JSON.parse(stored);
        setConfig(normalizeConfig(p));
        hasStored = true;
      } else {
        setConfig(normalizeConfig());
      }
    } catch {
      setConfig(normalizeConfig());
    }
    quoteApi.getById(id)
      .then((r) => {
        setQuote(r.data);
        const serverCfg = (r.data as any)?.templateConfig;
        if (!hasStored && serverCfg && Object.keys(serverCfg).length > 0) {
          const normalized = normalizeConfig(serverCfg);
          setConfig(normalized);
          localStorage.setItem(STORAGE_KEY(id), JSON.stringify(normalized));
        }
      })
      .catch(()=>{})
      .finally(()=>setFetching(false));
  }, [firebaseUser, loading, params]);

  useEffect(() => () => { if (resetRef.current) clearTimeout(resetRef.current); }, []);

  const update = (patch: Partial<QuoteTemplateConfig>) => { setConfig(p=>({...p,...patch})); setIsDirty(true); setSyncStatus("idle"); };
  const updateMargin = (k: keyof QuoteTemplateConfig["margins"], v: number) => { setConfig(p=>({...p,margins:{...p.margins,[k]:v}})); setIsDirty(true); setSyncStatus("idle"); };

  async function handleSave() {
    if (!params?.id) return;
    setSyncStatus("saving");
    localStorage.setItem(STORAGE_KEY(params.id), JSON.stringify(config));
    try {
      await quoteApi.update(params.id, { templateConfig: config as any });
      setIsDirty(false);
      setSyncStatus("synced");
      toast.success("Template saved");
    } catch {
      setSyncStatus("error");
      toast.error("Failed to save template");
    } finally {
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(()=>setSyncStatus("idle"), 2500);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!activeOrganization?._id) {
      toast.error("No active organization");
      return;
    }

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/bmp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPG, PNG, GIF, or BMP allowed");
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      toast.error("Image must be less than 1 MB");
      return;
    }

    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await apiFetch<{ data: { url: string } }>("/upload?folder=logos", {
        method: "POST",
        body: formData,
      });
      await organizationApi.update(activeOrganization._id, { logo: uploadRes.data.url });
      await refreshOrganizations();
      toast.success("Logo updated");
    } catch {
      toast.error("Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return <div className="flex min-h-svh items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" /></div>;
  }

  const tabs: { id: EditTemplateTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-5 w-5" /> },
    { id: "header_footer", label: "Header &\nFooter", icon: <Layout className="h-5 w-5" /> },
    { id: "quote_details", label: "Quote\nDetails", icon: <FileText className="h-5 w-5" /> },
    { id: "table", label: "Table", icon: <Grid className="h-5 w-5" /> },
    { id: "other", label: "Other\nDetails", icon: <AlignLeft className="h-5 w-5" /> },
  ];

  // Resolve dynamic quotation values
  const quoteNumber = quote?.quoteNumber ?? MOCK_QUOTE.quoteNumber;
  const quoteDate = quote?.quoteDate ? fmtDateValue(quote.quoteDate) : MOCK_QUOTE.quoteDate;
  const subject = quote?.subject ?? "supply of panels as per specifications";
  const customer = quote?.customerId as any;
  const customerName = (typeof customer === "object" && (customer?.displayName || customer?.companyName)) || MOCK_QUOTE.customerName;
  const customerAddress = quote ? [
    customer?.billingAddress?.street,
    customer?.billingAddress?.city,
    customer?.billingAddress?.state,
    customer?.billingAddress?.zip,
    customer?.billingAddress?.country,
  ].filter(Boolean).join(", ") : MOCK_QUOTE.customerAddress;

  const discountType = quote?.discountType ?? "percent";
  const discountValue = Number(quote?.discountValue ?? 0);
  const subTotal = Number(quote?.subTotal ?? MOCK_QUOTE.subTotal);
  const discountAmount = Number(quote?.discountAmount ?? MOCK_QUOTE.discountAmount);
  const adjustmentLabel = quote?.adjustmentLabel || "Adjustment";
  const adjustmentAmount = Number(quote?.adjustmentAmount ?? 0);
  const totalFallback = Number(quote?.total ?? MOCK_QUOTE.total);
  const customerNotes = quote?.customerNotes ?? MOCK_QUOTE.notes;
  const terms = quote?.termsAndConditions ?? MOCK_QUOTE.terms;
  const salesPersonName = typeof quote?.salesPersonId === "object" ? (quote?.salesPersonId as any)?.name : undefined;

  const placeOfSupply = quote?.placeOfSupply || customer?.billingAddress?.state || "";
  const orgState = orgAddr?.state || "";

  const itemsSource = quote?.items?.length ? quote.items : MOCK_ITEMS;
  const itemsList = itemsSource.map((item: any) => {
    const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
    const rate = Number(item.rate ?? 0) || 0;
    const discPct = Number(item.discountPercent ?? item.disc ?? 0) || 0;
    const discAmt = Number(item.discountAmount ?? (qty * rate * discPct) / 100) || 0;
    const taxable = qty * rate - discAmt;
    const taxPct = Number(item.taxPercent ?? item.tax ?? 0) || 0;
    const taxAmt = Number(item.taxAmount ?? (taxable * taxPct) / 100) || 0;
    const amount = Number(item.amount ?? (taxable + taxAmt)) || 0;
    const taxName =
      typeof item.taxId === "object" ? item.taxId?.name : item.taxName || "";
    return {
      name: item.name || item.itemId?.name || "Item",
      description: item.description || "",
      hsn: item.hsnSacCode ?? item.hsn ?? "",
      qty,
      rate,
      discountPercent: discPct,
      discountAmount: discAmt,
      taxPercent: taxPct,
      taxAmount: taxAmt,
      taxName,
      amount,
    };
  });

  const taxBreakdown = itemsList.reduce(
    (acc, item) => {
      const taxAmt = item.taxAmount || 0;
      if (!taxAmt) return acc;

      const mode = resolveTaxModeFromName(item.taxName);
      if (mode === "igst") {
        acc.igst += taxAmt;
      } else if (mode === "cgst") {
        acc.cgst += taxAmt;
      } else if (mode === "sgst") {
        acc.sgst += taxAmt;
      } else if (mode === "gst") {
        acc.cgst += taxAmt / 2;
        acc.sgst += taxAmt / 2;
      }

      return acc;
    },
    { cgst: 0, sgst: 0, igst: 0 },
  );
  const hasIgst = taxBreakdown.igst > 0;
  const hasSplit = taxBreakdown.cgst > 0 || taxBreakdown.sgst > 0;
  const isIntraBySupply =
    orgState && placeOfSupply ?
      orgState.toLowerCase() === placeOfSupply.toLowerCase()
    : true;
  const isIntra = hasSplit && !hasIgst ? true : hasIgst && !hasSplit ? false : isIntraBySupply;

  const totalTaxAmount = itemsList.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  const hasTax = itemsList.some((item) => (item.taxPercent || 0) > 0 || (item.taxAmount || 0) > 0);
  const showTax = config.colTax && hasTax;
  const computedTotal = subTotal + totalTaxAmount + adjustmentAmount - discountAmount;
  const finalTotal = Number.isFinite(computedTotal) ? computedTotal : totalFallback;
  const discountLabel = discountType === "percent" ? `Discount (${discountValue}%)` : "Discount";

  // Display values with override support
  const displayOrgName = config.orgNameOverride?.trim() || orgName || "PIKA G ENERGY PVT. LTD.";
  const displayGstin = config.gstinValueOverride?.trim() || orgTaxId;
  const displayContact = config.contactValueOverride?.trim() || orgPhone;
  const displayEmail = config.emailValueOverride?.trim() || orgEmail;
  const displayFactory = config.factoryValueOverride?.trim() || (orgAddr ? [orgAddr.street, orgAddr.city, orgAddr.state, orgAddr.zip].filter(Boolean).join(", ") : "");

  const baseW = config.paperSize === "A5" ? 148 : config.paperSize === "Letter" ? 216 : 210;
  const baseH = config.paperSize === "A5" ? 210 : config.paperSize === "Letter" ? 279 : 297;
  const paperW = `${config.orientation === "Landscape" ? baseH : baseW}mm`;
  const paperMin = `${config.orientation === "Landscape" ? baseW : baseH}mm`;

  const headerFontSize = Math.max(7, config.tableHeaderFontSize);
  const subHeaderFontSize = Math.max(6, headerFontSize - 1.5);

  // Build dynamic table column widths based on visibility toggles
  const dynWidths: number[] = [20]; // # column always visible
  if (config.colItem) dynWidths.push(showTax ? (isIntra ? 145 : 190) : 200);
  if (config.colHsn) dynWidths.push(45);
  if (config.colQty) dynWidths.push(showTax ? 25 : 30);
  if (config.colRate) dynWidths.push(showTax ? (isIntra ? 65 : 70) : 75);
  if (config.colDiscount) dynWidths.push(55);
  if (showTax) { dynWidths.push(18, 47); if (isIntra) dynWidths.push(18, 47); }
  if (config.colAmount) dynWidths.push(showTax ? 75 : 70);
  const totalColSpan = dynWidths.length - 1;
  const itemColWidth = showTax ? (isIntra ? 145 : 190) : 200;

  const totalRows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: "Sub Total (In Rs)", value: fmtNum(subTotal) },
  ];
  if (discountAmount) {
    totalRows.push({ label: discountLabel, value: `- ${fmtNum(discountAmount)}` });
  }
  if (totalTaxAmount > 0) {
    if (isIntra) {
      const splitFallback = totalTaxAmount / 2;
      const cgstValue = taxBreakdown.cgst > 0 ? taxBreakdown.cgst : splitFallback;
      const sgstValue = taxBreakdown.sgst > 0 ? taxBreakdown.sgst : splitFallback;
      totalRows.push({ label: "CGST (In Rs)", value: fmtNum(cgstValue) });
      totalRows.push({ label: "SGST (In Rs)", value: fmtNum(sgstValue) });
    } else {
      const igstValue = taxBreakdown.igst > 0 ? taxBreakdown.igst : totalTaxAmount;
      totalRows.push({ label: "IGST (In Rs)", value: fmtNum(igstValue) });
    }
  }
  if (adjustmentAmount) {
    totalRows.push({ label: adjustmentLabel || "Adjustment", value: fmtNum(adjustmentAmount) });
  }
  totalRows.push({ label: "Total Amount (In Rs)", value: fmtNum(finalTotal), bold: true });

  const labelWithColon = (label: string) => {
    const trimmed = label.trim();
    return trimmed.endsWith(":") ? trimmed : `${trimmed}:`;
  };

  const renderTextLines = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const isBullet = line.startsWith("-") || line.startsWith("*");
        const content = isBullet ? line.replace(/^[-*]\s*/, "") : line;
        return isBullet ? (
          <ul key={idx} style={{ margin: "2px 0 2px 16px", padding: 0 }}>
            <li style={{ margin: 0 }}>{content}</li>
          </ul>
        ) : (
          <div key={idx}>{content}</div>
        );
      });

  const headerCellBase = { border: "1px solid #000000", padding: "6px 6px", fontWeight: 600 };
  const bodyCellBase = { border: "1px solid #000000", padding: "4px 6px" };

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between h-12 px-5 border-b bg-background shrink-0">
        <h2 className="text-sm font-semibold">
          Edit Quote Template
          <span className="ml-2 text-xs text-muted-foreground">({config.templateName || DEFAULT_CONFIG.templateName})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {syncStatus==="saving" && <span className="flex items-center gap-1 text-teal-600"><Loader2 className="h-3 w-3 animate-spin" />Saving</span>}
            {syncStatus==="synced" && <span className="flex items-center gap-1 text-green-600"><CloudCheck className="h-3.5 w-3.5" />Saved</span>}
            {syncStatus==="error" && <span className="flex items-center gap-1 text-rose-600"><CloudOff className="h-3.5 w-3.5" />Failed</span>}
            {syncStatus==="idle" && !isDirty && <span className="flex items-center gap-1 text-muted-foreground"><Cloud className="h-3.5 w-3.5" />Saved</span>}
            {syncStatus==="idle" && isDirty && <span className="flex items-center gap-1 text-muted-foreground"><Cloud className="h-3.5 w-3.5" />Unsaved</span>}
          </div>
          <Select value={config.colorTheme} onValueChange={(v) => { const t = COLOR_THEMES.find(x=>x.id===v); update({ colorTheme: v, tableHeaderBgColor: t?.colors[0]??config.tableHeaderBgColor }); }}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Color Theme" /></SelectTrigger>
            <SelectContent>
              {COLOR_THEMES.map((t)=>(<SelectItem key={t.id} value={t.id}><div className="flex items-center gap-2"><div className="flex gap-0.5">{t.colors.map((c,i)=>(<div key={i} className="w-3 h-3 rounded-sm border border-border" style={{backgroundColor:c}} />))}</div><span>{t.label}</span></div></SelectItem>))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50" onClick={()=>setPreviewKey(k=>k+1)}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
          <Button size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={handleSave}>Save</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:bg-slate-100" onClick={()=>router.push(`/sales/quotes/${params?.id}`)}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Col 1: Icon nav */}
        <div className="w-[68px] border-r bg-slate-50/50 flex flex-col items-stretch py-2 gap-0.5 shrink-0 overflow-y-auto">
          {tabs.map((t)=>(
            <button key={t.id} onClick={()=>setEtTab(t.id)} title={t.label.replace("\n"," ")}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 text-center transition-colors rounded-md mx-1 ${etTab===t.id?"bg-teal-50 text-teal-700":"text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
              {t.icon}
              <span className="text-[9px] leading-tight font-medium whitespace-pre-line">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Col 2: Settings */}
        <div className="w-72 border-r overflow-y-auto shrink-0 bg-background">
          <SettingsPanel
            tab={etTab}
            config={config}
            update={update}
            updateMargin={updateMargin}
            orgLogo={orgLogo}
            orgName={orgName}
            onLogoUpload={handleLogoUpload}
            logoUploading={logoUploading}
            logoUploadDisabled={!activeOrganization?._id}
            orgTaxId={orgTaxId}
            orgPhone={orgPhone}
            orgEmail={orgEmail}
            orgAddressText={orgAddr ? [orgAddr.street, orgAddr.city, orgAddr.state, orgAddr.zip].filter(Boolean).join(", ") : ""}
          />
        </div>

        {/* Col 3: Live Preview */}
        <div className="flex-1 overflow-auto bg-[#e8e8e8] py-8 px-8">
          <div key={previewKey} className="bg-white mx-auto shadow-lg flex flex-col" style={{ width: paperW, minHeight: paperMin, fontFamily: config.fontFamily, fontSize: `${config.fontSize}pt`, backgroundColor: config.backgroundColor, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", opacity: 0.04 }}>
              <div style={{ fontWeight: 700, fontSize: "26pt", color: "#0f172a", transform: "rotate(-8deg)" }}>
                {displayOrgName.toUpperCase()}
              </div>
            </div>
            <div style={{ position: "relative", zIndex: 1, flex: 1, padding: `${config.margins.top}in ${config.margins.right}in ${config.margins.bottom}in ${config.margins.left}in`, display: "flex", flexDirection: "column" }}>

              {/* Header: Logo + Org Info */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", backgroundColor: config.headerBgColorEnabled ? config.headerBgColor : "transparent" }}>
                <div>
                  {orgLogo && config.showOrgLogo && <img src={orgLogo} alt={displayOrgName} style={{ height: `${config.orgLogoSize}px`, width: "auto", objectFit: "contain", display: "block" }} />}
                  {!orgLogo && config.showOrgLogo && <div style={{ width: `${config.orgLogoSize}px`, height: `${config.orgLogoSize}px`, border: "2px dashed #d1d5db", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: "8pt", color: "#9ca3af" }}>Logo</span></div>}
                  {config.showOrgName && <p style={{ fontWeight: "700", color: config.orgNameColor, fontSize: `${config.orgNameFontSize}pt`, marginTop: "6px", marginRight: 0, marginBottom: 0, marginLeft: 0, lineHeight: 1.3 }}>{displayOrgName}</p>}
                </div>
                <div style={{ textAlign: "right", maxWidth: "50%", fontSize: `${config.headerFontSize}pt`, color: config.headerTextColor }}>
                  {config.showGstin && displayGstin && (
                    <p style={{ margin: 0, lineHeight: 1.3 }}><strong>{labelWithColon(config.gstinLabel)} </strong>{displayGstin}</p>
                  )}
                  {config.showContact && displayContact && (
                    <p style={{ margin: "1px 0 0", lineHeight: 1.3 }}><strong>{labelWithColon(config.contactLabel)} </strong>{displayContact}</p>
                  )}
                  {config.showEmail && displayEmail && (
                    <p style={{ margin: "1px 0 0", lineHeight: 1.3 }}><strong>{labelWithColon(config.emailLabel)} </strong><span style={{ color: "#0284c7" }}>{displayEmail}</span></p>
                  )}
                  {config.showOrgAddress && displayFactory && (
                    <p style={{ margin: "1px 0 0", lineHeight: 1.3 }}>
                      <strong>{labelWithColon(config.factoryLabel)} </strong>
                      {displayFactory}
                    </p>
                  )}
                </div>
              </div>

              {/* Gold divider line below header */}
              {config.showHeaderDivider && (
                <div style={{ borderTop: `1.5px solid ${config.headerDividerColor}`, marginBottom: "16px" }} />
              )}

              {/* Document Title with light grey background */}
              {config.showDocTitle && (
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ backgroundColor: "#e2e8f0", padding: "3px 8px", display: "inline-block", fontWeight: "bold", fontSize: `${config.docTitleFontSize}pt`, color: config.docTitleFontColor }}>
                    {config.docTitle || "TECHNO-COMMERCIAL QUOTATION"}
                  </div>
                </div>
              )}

              {/* Row 2: Reference Details */}
              <div style={{ fontSize: "9.5pt", color: "#000000", marginBottom: "14px", lineHeight: 1.4 }}>
                <div><strong>{labelWithColon(config.quoteNumberLabel)} </strong>{quoteNumber}</div>
                <div><strong>{labelWithColon(config.quoteDateLabel)} </strong>{quoteDate}</div>
              </div>

              {/* Recipient Details */}
              <div style={{ fontSize: "9.5pt", color: "#000000", marginBottom: "14px", lineHeight: 1.4 }}>
                {config.showBillTo && <div style={{ fontWeight: "700" }}>{config.billToLabel}</div>}
                <div style={{ fontWeight: "bold", color: config.customerNameFontColor, fontSize: `${config.customerNameFontSize}pt` }}>{customerName}</div>
                {customerAddress && customerAddress.split(",").map((line, idx) => (
                  <div key={idx}>{line.trim()}</div>
                ))}
              </div>

              {/* Subject */}
              {subject && (
                <div style={{ fontWeight: "bold", fontSize: "9.5pt", color: "#000000", marginBottom: "12px" }}>
                  Sub: {subject}
                </div>
              )}

              {/* Intro Letter / Dear Sir */}
              <div style={{ fontSize: "9.5pt", color: "#000000", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "6px", lineHeight: 1.4 }}>
                <div>Dear Sir,</div>
                <div style={{ textAlign: "justify" }}>We thank you for the opportunity to submit our techno-commercial quotation for supply of panels as per specifications & GA drawings.</div>
                <div>We confirm full compliance to technical requirements, scope & standards mentioned in:</div>
                <ul style={{ listStyleType: "disc", marginLeft: "20px" }}>
                  <li>TS for technical specifications & requirements</li>
                  <li>GA Drawings and scope of supply</li>
                </ul>
              </div>

              {/* Items table */}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
                <colgroup>
                  {dynWidths.map((w, idx) => (
                    <col key={`col-${idx}`} style={{ width: `${w}px` }} />
                  ))}
                </colgroup>
                <thead>
                  {showTax ? (
                    <>
                      <tr style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor, fontSize: `${headerFontSize}pt` }}>
                        <th rowSpan={2} style={{ ...headerCellBase, textAlign: "center", verticalAlign: "middle" }}>#</th>
                        {config.colItem && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "left", verticalAlign: "middle" }}>{config.itemLabel}</th>}
                        {config.colHsn && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "left", verticalAlign: "middle" }}>{config.hsnLabel}</th>}
                        {config.colQty && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "right", verticalAlign: "middle" }}>{config.qtyLabel}</th>}
                        {config.colRate && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "right", verticalAlign: "middle" }}>{config.rateLabel}</th>}
                        {config.colDiscount && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "right", verticalAlign: "middle" }}>{config.discountLabel}</th>}
                        <th colSpan={2} style={{ ...headerCellBase, textAlign: "center" }}>{isIntra ? "CGST" : "IGST"}</th>
                        {isIntra && <th colSpan={2} style={{ ...headerCellBase, textAlign: "center" }}>SGST</th>}
                        {config.colAmount && <th rowSpan={2} style={{ ...headerCellBase, textAlign: "right", verticalAlign: "middle" }}>{config.amountLabel}</th>}
                      </tr>
                      <tr style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor, fontSize: `${subHeaderFontSize}pt` }}>
                        <th style={{ ...headerCellBase, textAlign: "center" }}>%</th>
                        <th style={{ ...headerCellBase, textAlign: "center" }}>Amt</th>
                        {isIntra && (
                          <>
                            <th style={{ ...headerCellBase, textAlign: "center" }}>%</th>
                            <th style={{ ...headerCellBase, textAlign: "center" }}>Amt</th>
                          </>
                        )}
                      </tr>
                    </>
                  ) : (
                    <tr style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor, fontSize: `${headerFontSize}pt` }}>
                      <th style={{ ...headerCellBase, textAlign: "center" }}>#</th>
                      {config.colItem && <th style={{ ...headerCellBase, textAlign: "left" }}>{config.itemLabel}</th>}
                      {config.colHsn && <th style={{ ...headerCellBase, textAlign: "left" }}>{config.hsnLabel}</th>}
                      {config.colQty && <th style={{ ...headerCellBase, textAlign: "right" }}>{config.qtyLabel}</th>}
                      {config.colRate && <th style={{ ...headerCellBase, textAlign: "right" }}>{config.rateLabel}</th>}
                      {config.colDiscount && <th style={{ ...headerCellBase, textAlign: "right" }}>{config.discountLabel}</th>}
                      {config.colAmount && <th style={{ ...headerCellBase, textAlign: "right" }}>{config.amountLabel}</th>}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {itemsList.map((item, i) => {
                    const splitPct = item.taxPercent ? item.taxPercent / 2 : 0;
                    const splitAmt = item.taxAmount ? item.taxAmount / 2 : 0;
                    return (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? config.oddRowColor : config.evenRowColor, fontSize: "8.5pt" }}>
                        <td style={{ ...bodyCellBase, textAlign: "center", color: "#6b7280" }}>{i + 1}</td>
                        {config.colItem && (
                          <td style={{ ...bodyCellBase, textAlign: "left", maxWidth: `${itemColWidth}px` }}>
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            {item.description && <div style={{ fontSize: "7.5pt", color: "#475569" }}>{item.description}</div>}
                          </td>
                        )}
                        {config.colHsn && <td style={{ ...bodyCellBase, textAlign: "left", color: "#6b7280" }}>{item.hsn || "—"}</td>}
                        {config.colQty && <td style={{ ...bodyCellBase, textAlign: "right" }}>{fmtNum(item.qty)}</td>}
                        {config.colRate && <td style={{ ...bodyCellBase, textAlign: "right" }}>{fmtNum(item.rate)}</td>}
                        {config.colDiscount && <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.discountPercent ? `${item.discountPercent}%` : "—"}</td>}
                        {showTax && (
                          isIntra ? (
                            <>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? `${splitPct}%` : "—"}</td>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? fmtNum(splitAmt) : "—"}</td>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? `${splitPct}%` : "—"}</td>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? fmtNum(splitAmt) : "—"}</td>
                            </>
                          ) : (
                            <>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? `${item.taxPercent}%` : "—"}</td>
                              <td style={{ ...bodyCellBase, textAlign: "right" }}>{item.taxPercent ? fmtNum(item.taxAmount) : "—"}</td>
                            </>
                          )
                        )}
                        {config.colAmount && <td style={{ ...bodyCellBase, textAlign: "right" }}>{fmtNum(item.amount)}</td>}
                      </tr>
                    );
                  })}
                  {totalRows.map((row, idx) => (
                    <tr key={`total-${idx}`} style={{ fontSize: "8.5pt" }}>
                      <td colSpan={totalColSpan} style={{ ...bodyCellBase, textAlign: "right", fontWeight: row.bold ? 700 : 600 }}>
                        {row.label}
                      </td>
                      <td style={{ ...bodyCellBase, textAlign: "right", fontWeight: row.bold ? 700 : 600 }}>
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Total Price in Words */}
              <div style={{ fontWeight: "bold", fontSize: "9.5pt", color: "#000000", marginBottom: "16px" }}>
                Total Price (in Words) — {numberToWords(finalTotal)}.
              </div>

              {/* Notes */}
              {config.showNotes && customerNotes && (
                <div style={{ marginBottom: "12px", fontSize: "8.5pt", color: "#000000" }}>
                  <div style={{ backgroundColor: "#e2e8f0", padding: "2px 6px", display: "inline-block", fontWeight: 600, marginBottom: "6px" }}>
                    {labelWithColon(config.notesLabel)}
                  </div>
                  <div style={{ fontSize: "8pt", color: "#333333", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {renderTextLines(customerNotes)}
                  </div>
                </div>
              )}

              {/* Terms */}
              {config.showTerms && terms && (
                <div style={{ marginBottom: "12px", fontSize: "8.5pt", color: "#000000" }}>
                  <div style={{ backgroundColor: "#e2e8f0", padding: "2px 6px", display: "inline-block", fontWeight: 600, marginBottom: "6px" }}>
                    {labelWithColon(config.termsLabel)}
                  </div>
                  <div style={{ fontSize: "8pt", color: "#333333", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {renderTextLines(terms)}
                  </div>
                </div>
              )}

              <div style={{ marginTop: "auto" }}>
                {/* Signature block */}
                {config.showSignature && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                    <div style={{ textAlign: "right", width: "220px", fontSize: "8.5pt", color: "#000000" }}>
                      <div style={{ fontWeight: 700 }}>{`For ${displayOrgName.toUpperCase()}`}</div>
                      <div style={{ marginTop: "6px", fontSize: "8pt" }}>{config.signatureLabel}</div>
                      <div style={{ marginTop: "8px", fontWeight: 700 }}>{salesPersonName || "Gautam Kumar Haldar"}</div>
                      {displayEmail && <div style={{ fontSize: "7.5pt", color: "#475569" }}>Email: {displayEmail}</div>}
                      <div style={{ fontSize: "7.5pt", color: "#475569" }}>Phone: {displayContact || "+91 97550 21473"}</div>
                    </div>
                  </div>
                )}

                {/* Footer */}
                {config.showFooter && (
                  <div style={{ marginTop: "12px", paddingTop: "14px", borderTop: `1.2px solid ${config.footerDividerColor}`, backgroundColor: config.footerBgColorEnabled ? config.footerBgColor : "transparent" }}>
                    {config.showFooterPageNumber && (
                      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "8.5pt", color: config.footerFontColor, marginBottom: "4px" }}>Page 1 of 1</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: `${config.footerFontSize}pt`, color: config.footerFontColor, textAlign: "center" }}>
                      {config.showFooterLines && (
                        <>
                          {config.footerLine1 && <div>{config.footerLine1}</div>}
                          {config.footerLine2 && <div>{config.footerLine2}</div>}
                          {config.footerLine3 && <div>{config.footerLine3}</div>}
                          {config.footerLine4 && <div>{config.footerLine4}</div>}
                          {config.footerLine5 && <div>{config.footerLine5}</div>}
                        </>
                      )}
                      {config.footerCustomContent && (
                        <div style={{ marginTop: "4px", fontStyle: "italic" }}>{config.footerCustomContent}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
