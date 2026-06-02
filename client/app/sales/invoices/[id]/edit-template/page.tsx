"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Settings2, Layout, FileText, Grid, AlignLeft, RefreshCw, X, Cloud, CloudCheck, CloudOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import { organizationApi } from "@/lib/api/organizations";
import { apiFetch } from "@/lib/api/client";
import { type InvoiceTemplateConfig, type EditTemplateTab, DEFAULT_CONFIG, COLOR_THEMES, STORAGE_KEY, MOCK_ITEMS, MOCK_INVOICE } from "./config";
import { SettingsPanel } from "./panels";

const fmtNum = (v: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function fmtDateValue(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function resolveTaxModeFromName(value?: string): "igst" | "cgst" | "sgst" | "gst" | "unknown" {
  const name = (value || "").trim().toUpperCase();
  if (!name) return "unknown";
  if (name.startsWith("IGST")) return "igst";
  if (name.startsWith("CGST")) return "cgst";
  if (name.startsWith("SGST")) return "sgst";
  if (name.startsWith("GST")) return "gst";
  return "unknown";
}

function normalizeConfig(raw?: Partial<InvoiceTemplateConfig> | null): InvoiceTemplateConfig {
  const merged: InvoiceTemplateConfig = {
    ...DEFAULT_CONFIG,
    ...(raw || {}),
    margins: { ...DEFAULT_CONFIG.margins, ...(raw?.margins ?? {}) },
  };

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

export default function EditInvoiceTemplatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization, refreshOrganizations } = useOrganization();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [fetching, setFetching] = useState(true);
  const [etTab, setEtTab] = useState<EditTemplateTab>("general");
  const [config, setConfig] = useState<InvoiceTemplateConfig>(DEFAULT_CONFIG);
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
    invoiceApi.getById(id)
      .then((r) => {
        setInvoice(r.data);
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

  const update = (patch: Partial<InvoiceTemplateConfig>) => { setConfig(p=>({...p,...patch})); setIsDirty(true); setSyncStatus("idle"); };
  const updateMargin = (k: keyof InvoiceTemplateConfig["margins"], v: number) => { setConfig(p=>({...p,margins:{...p.margins,[k]:v}})); setIsDirty(true); setSyncStatus("idle"); };

  async function handleSave() {
    if (!params?.id) return;
    setSyncStatus("saving");
    localStorage.setItem(STORAGE_KEY(params.id), JSON.stringify(config));
    try {
      await invoiceApi.update(params.id, { templateConfig: config as any });
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
      const uploadRes = await apiFetch<{ data: { url: string } }>("/upload?folder=logos", { method: "POST", body: formData });
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
    return <div className="flex min-h-svh items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  const tabs: { id: EditTemplateTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings2 className="h-5 w-5" /> },
    { id: "organization", label: "Org Info", icon: <Layout className="h-5 w-5" /> },
    { id: "invoice_meta", label: "Labels", icon: <FileText className="h-5 w-5" /> },
    { id: "table", label: "Table", icon: <Grid className="h-5 w-5" /> },
    { id: "footer", label: "Bottom Area", icon: <AlignLeft className="h-5 w-5" /> },
  ];

  const invoiceNumber = invoice?.invoiceNumber ?? MOCK_INVOICE.invoiceNumber;
  const invoiceDate = invoice?.invoiceDate ? fmtDateValue(invoice.invoiceDate) : MOCK_INVOICE.invoiceDate;
  const customer = invoice?.customerId as any;
  const customerName = (typeof customer === "object" && (customer?.displayName || customer?.companyName)) || MOCK_INVOICE.customerName;
  const customerAddress = invoice ? [
    customer?.billingAddress?.street,
    customer?.billingAddress?.city,
    customer?.billingAddress?.state,
    customer?.billingAddress?.zip,
    customer?.billingAddress?.country,
  ].filter(Boolean).join(", ") : MOCK_INVOICE.customerAddress;

  const subTotal = Number(invoice?.subTotal ?? MOCK_INVOICE.subTotal);
  const discountAmount = Number(invoice?.discountAmount ?? MOCK_INVOICE.discountAmount);
  const adjustmentAmount = Number(invoice?.adjustmentAmount ?? 0);
  const totalFallback = Number(invoice?.total ?? MOCK_INVOICE.total);
  const salesPersonName = typeof invoice?.salesPersonId === "object" ? (invoice?.salesPersonId as any)?.name : undefined;
  
  const displayOrgName = config.orgNameOverride?.trim() || orgName || "COMPANY NAME";
  const displayGstin = config.gstinValueOverride?.trim() || orgTaxId;
  const displayContact = config.contactValueOverride?.trim() || orgPhone;
  const displayEmail = config.emailValueOverride?.trim() || orgEmail;
  const displayFactory = config.factoryValueOverride?.trim() || (orgAddr ? [orgAddr.street, orgAddr.city, orgAddr.state, orgAddr.zip].filter(Boolean).join(", ") : "");

  const itemsSource = invoice?.items?.length ? invoice.items : MOCK_ITEMS;
  const itemsList = itemsSource.map((item: any) => {
    const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
    const rate = Number(item.rate ?? 0) || 0;
    const discPct = Number(item.discountPercent ?? item.disc ?? 0) || 0;
    const discAmt = Number(item.discountAmount ?? (qty * rate * discPct) / 100) || 0;
    const taxable = qty * rate - discAmt;
    const taxPct = Number(item.taxPercent ?? item.tax ?? 0) || 0;
    const taxAmt = Number(item.taxAmount ?? (taxable * taxPct) / 100) || 0;
    const amount = Number(item.amount ?? (taxable + taxAmt)) || 0;
    const taxName = typeof item.taxId === "object" ? item.taxId?.name : item.taxName || "";
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
      taxable,
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
  const placeOfSupply = customer?.billingAddress?.state || "";
  const orgState = orgAddr?.state || "";
  const isIntraBySupply = orgState && placeOfSupply ? orgState.toLowerCase() === placeOfSupply.toLowerCase() : true;
  const isIntra = hasSplit && !hasIgst ? true : hasIgst && !hasSplit ? false : isIntraBySupply;
  const totalTaxAmount = itemsList.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  const finalTotal = subTotal + totalTaxAmount + adjustmentAmount - discountAmount;

  // HSN Table Grouping
  const hsnGrouped = itemsList.reduce((acc: any, item) => {
    const hsn = item.hsn || "";
    if (!acc[hsn]) acc[hsn] = { hsn, taxable: 0, cgstAmt: 0, sgstAmt: 0, igstAmt: 0, taxPct: item.taxPercent, taxAmt: 0 };
    acc[hsn].taxable += item.taxable;
    acc[hsn].taxAmt += item.taxAmount;
    
    if (isIntra) {
      acc[hsn].cgstAmt += item.taxAmount / 2;
      acc[hsn].sgstAmt += item.taxAmount / 2;
    } else {
      acc[hsn].igstAmt += item.taxAmount;
    }
    return acc;
  }, {});
  const hsnList = Object.values(hsnGrouped) as any[];

  const baseW = config.paperSize === "A5" ? 148 : config.paperSize === "Letter" ? 216 : 210;
  const baseH = config.paperSize === "A5" ? 210 : config.paperSize === "Letter" ? 279 : 297;
  const paperW = `${config.orientation === "Landscape" ? baseH : baseW}mm`;
  const paperMin = `${config.orientation === "Landscape" ? baseW : baseH}mm`;

  // Inline styles for Tally format
  const tBorder = `1px solid ${config.colorTheme === "vibrant-blue" ? "#1e3a8a" : "#000"}`;
  const cellStyle = { borderRight: tBorder, borderBottom: tBorder, padding: "3px 4px", fontSize: `${config.fontSize}pt` };
  const hdrStyle = { ...cellStyle, borderBottom: "none" };

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">
      <div className="flex items-center justify-between h-12 px-5 border-b bg-background shrink-0">
        <h2 className="text-sm font-semibold">
          Edit Invoice Template
          <span className="ml-2 text-xs text-muted-foreground">({config.templateName || DEFAULT_CONFIG.templateName})</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {syncStatus==="saving" && <span className="flex items-center gap-1 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" />Saving</span>}
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
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={()=>setPreviewKey(k=>k+1)}><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>Save</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={()=>router.push(`/sales/invoices/${params?.id}`)}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[68px] border-r bg-muted/10 flex flex-col items-stretch py-2 gap-0.5 shrink-0 overflow-y-auto">
          {tabs.map((t)=>(
            <button key={t.id} onClick={()=>setEtTab(t.id)} title={t.label.replace("\n"," ")}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 text-center transition-colors rounded-md mx-1 ${etTab===t.id?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}>
              {t.icon}
              <span className="text-[9px] leading-tight font-medium whitespace-pre-line">{t.label}</span>
            </button>
          ))}
        </div>

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

        <div className="flex-1 overflow-auto bg-[#e8e8e8] py-8 px-8">
          <div key={previewKey} className="bg-white mx-auto shadow-lg flex flex-col" style={{ width: paperW, minHeight: paperMin, fontFamily: config.fontFamily, fontSize: `${config.fontSize}pt`, backgroundColor: config.backgroundColor, position: "relative" }}>
            <div style={{ position: "relative", zIndex: 1, flex: 1, padding: `${config.margins.top}in ${config.margins.right}in ${config.margins.bottom}in ${config.margins.left}in`, display: "flex", flexDirection: "column" }}>

              {/* Tally Invoice Wrapper */}
              <div style={{ borderTop: tBorder, borderLeft: tBorder, display: "flex", flexDirection: "column" }}>
                
                {/* Title */}
                <div style={{ textAlign: "center", borderBottom: tBorder, borderRight: tBorder, fontWeight: 700, fontSize: "14pt", padding: "4px" }}>
                  TAX INVOICE
                </div>

                {/* Top Block: Org (Left) / Meta (Right) */}
                <div style={{ display: "flex" }}>
                  {/* Left Column - Org Info */}
                  <div style={{ flex: 1, borderRight: tBorder, borderBottom: tBorder, display: "flex" }}>
                    {config.showOrgLogo && orgLogo && (
                       <div style={{ padding: "4px" }}>
                         <img src={orgLogo} alt="Logo" style={{ width: `${config.orgLogoSize}px`, objectFit: "contain" }} />
                       </div>
                    )}
                    <div style={{ padding: "6px 8px", fontSize: `${config.fontSize}pt`, flex: 1 }}>
                       {config.showOrgName && <div style={{ fontWeight: 700, fontSize: `${config.orgNameFontSize}pt`, color: config.orgNameColor }}>{displayOrgName}</div>}
                       {config.showOrgAddress && displayFactory && <div>{displayFactory}</div>}
                       {config.showGstin && displayGstin && <div style={{ marginTop: "4px" }}><b>{config.gstinLabel}:</b> {displayGstin}</div>}
                       {config.showContact && displayContact && <div style={{ marginTop: "2px" }}><b>{config.contactLabel}:</b> {displayContact}</div>}
                       {config.showEmail && displayEmail && <div style={{ marginTop: "2px" }}><b>{config.emailLabel}:</b> {displayEmail}</div>}
                    </div>
                  </div>
                  {/* Right Column - Meta Table */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.invoiceNoLabel}<br/><b>{invoiceNumber}</b></div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.datedLabel}<br/><b>{invoiceDate}</b></div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.deliveryNoteLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.modeOfPaymentLabel}</div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.referenceNoLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.otherReferencesLabel}</div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.buyersOrderNoLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.datedLabel}</div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.dispatchDocNoLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.deliveryNoteDateLabel}</div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.dispatchedThroughLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.destinationLabel}</div>
                    </div>
                    <div style={{ display: "flex", borderBottom: tBorder }}>
                       <div style={{ ...cellStyle, flex: 1 }}>{config.billOfLadingLabel}</div>
                       <div style={{ ...cellStyle, borderRight: "none", flex: 1 }}>{config.motorVehicleNoLabel}</div>
                    </div>
                  </div>
                </div>

                {/* Second Block: Consignee / Terms */}
                <div style={{ display: "flex", borderRight: tBorder, borderBottom: tBorder }}>
                  <div style={{ flex: 1, borderRight: tBorder, padding: "4px" }}>
                    <div style={{ fontSize: "8pt" }}>{config.consigneeLabel}</div>
                    <div style={{ fontWeight: 700, fontSize: `${config.customerNameFontSize}pt`, color: config.customerNameFontColor }}>{customerName}</div>
                    <div>{customerAddress}</div>
                  </div>
                  <div style={{ flex: 1, padding: "4px" }}>
                    <div style={{ fontSize: "8pt" }}>{config.termsOfDeliveryLabel}</div>
                  </div>
                </div>

                {/* Third Block: Buyer */}
                <div style={{ display: "flex", borderRight: tBorder, borderBottom: tBorder }}>
                  <div style={{ flex: 1, borderRight: tBorder, padding: "4px" }}>
                    <div style={{ fontSize: "8pt" }}>{config.buyerLabel}</div>
                    <div style={{ fontWeight: 700, fontSize: `${config.customerNameFontSize}pt`, color: config.customerNameFontColor }}>{customerName}</div>
                    <div>{customerAddress}</div>
                  </div>
                  <div style={{ flex: 1, padding: "4px" }}>
                    {/* Empty space matching terms of delivery block */}
                  </div>
                </div>

                {/* ITEMS TABLE */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor, fontSize: `${config.tableHeaderFontSize}pt` }}>
                    <tr>
                      {config.colSlNo && <th style={cellStyle}>{config.slNoLabel}</th>}
                      {config.colDescription && <th style={cellStyle}>{config.descriptionLabel}</th>}
                      {config.colHsn && <th style={cellStyle}>{config.hsnLabel}</th>}
                      {config.colQty && <th style={cellStyle}>{config.qtyLabel}</th>}
                      {config.colRate && <th style={cellStyle}>{config.rateLabel}</th>}
                      {config.colPer && <th style={cellStyle}>{config.perLabel}</th>}
                      {config.colAmount && <th style={{ ...cellStyle, borderRight: tBorder }}>{config.amountLabel}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {itemsList.map((it, idx) => (
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? config.oddRowColor : config.evenRowColor }}>
                        {config.colSlNo && <td style={hdrStyle} align="center">{idx + 1}</td>}
                        {config.colDescription && <td style={hdrStyle}><b>{it.name}</b></td>}
                        {config.colHsn && <td style={hdrStyle} align="center">{it.hsn}</td>}
                        {config.colQty && <td style={hdrStyle} align="right">{it.qty}</td>}
                        {config.colRate && <td style={hdrStyle} align="right">{fmtNum(it.rate)}</td>}
                        {config.colPer && <td style={hdrStyle} align="center">Nos</td>}
                        {config.colAmount && <td style={{ ...hdrStyle, borderRight: tBorder }} align="right">{fmtNum(it.amount)}</td>}
                      </tr>
                    ))}
                    {/* Empty padding row */}
                    <tr>
                      {config.colSlNo && <td style={{ borderRight: tBorder, height: "40px" }} />}
                      {config.colDescription && <td style={{ borderRight: tBorder }}>
                         <div style={{ textAlign: "right", paddingRight: "10px" }}>
                           {isIntra ? (
                             <>
                               <div>CGST</div>
                               <div>SGST</div>
                             </>
                           ) : (
                             <div>IGST</div>
                           )}
                         </div>
                      </td>}
                      {config.colHsn && <td style={{ borderRight: tBorder }} />}
                      {config.colQty && <td style={{ borderRight: tBorder }} />}
                      {config.colRate && <td style={{ borderRight: tBorder }} />}
                      {config.colPer && <td style={{ borderRight: tBorder }} />}
                      {config.colAmount && <td style={{ borderRight: tBorder, textAlign: "right", verticalAlign: "top" }}>
                         <div style={{ paddingRight: "4px" }}>
                           {isIntra ? (
                             <>
                               <div>{fmtNum(totalTaxAmount / 2)}</div>
                               <div>{fmtNum(totalTaxAmount / 2)}</div>
                             </>
                           ) : (
                             <div>{fmtNum(totalTaxAmount)}</div>
                           )}
                         </div>
                      </td>}
                    </tr>
                    {/* Total Row */}
                    <tr>
                      {config.colSlNo && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder }} />}
                      {config.colDescription && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder, textAlign: "right", paddingRight: "10px" }}><b>Total</b></td>}
                      {config.colHsn && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder }} />}
                      {config.colQty && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder }} align="right"><b>{itemsList.reduce((s,i)=>s+i.qty,0)}</b></td>}
                      {config.colRate && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder }} />}
                      {config.colPer && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder }} />}
                      {config.colAmount && <td style={{ borderRight: tBorder, borderTop: tBorder, borderBottom: tBorder, textAlign: "right", paddingRight: "4px" }}><b>{fmtNum(finalTotal)}</b></td>}
                    </tr>
                  </tbody>
                </table>

                {/* Amount Words */}
                <div style={{ borderRight: tBorder, borderBottom: tBorder, padding: "4px" }}>
                  <div style={{ fontSize: "8pt" }}>{config.amountChargeableWordsLabel}</div>
                  <div style={{ fontWeight: "bold" }}>{numberToWords(finalTotal)}</div>
                </div>

                {/* HSN Tax Breakdown Table */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ fontSize: "8pt" }}>
                    <tr>
                      <th rowSpan={2} style={cellStyle}>HSN/SAC</th>
                      <th rowSpan={2} style={cellStyle}>Taxable Value</th>
                      {isIntra ? (
                        <>
                          <th colSpan={2} style={{ ...cellStyle, textAlign: "center" }}>CGST</th>
                          <th colSpan={2} style={{ ...cellStyle, textAlign: "center" }}>SGST</th>
                        </>
                      ) : (
                        <th colSpan={2} style={{ ...cellStyle, textAlign: "center" }}>IGST</th>
                      )}
                      <th rowSpan={2} style={{ ...cellStyle, borderRight: tBorder }}>Total Tax Amount</th>
                    </tr>
                    <tr>
                      <th style={cellStyle}>Rate</th>
                      <th style={cellStyle}>Amount</th>
                      {isIntra && (
                        <>
                          <th style={cellStyle}>Rate</th>
                          <th style={cellStyle}>Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {hsnList.map((h, i) => (
                       <tr key={i} style={{ fontSize: "8pt" }}>
                         <td style={cellStyle}>{h.hsn}</td>
                         <td style={cellStyle} align="right">{fmtNum(h.taxable)}</td>
                         {isIntra ? (
                           <>
                             <td style={cellStyle} align="right">{h.taxPct ? `${h.taxPct/2}%` : ""}</td>
                             <td style={cellStyle} align="right">{fmtNum(h.cgstAmt)}</td>
                             <td style={cellStyle} align="right">{h.taxPct ? `${h.taxPct/2}%` : ""}</td>
                             <td style={cellStyle} align="right">{fmtNum(h.sgstAmt)}</td>
                           </>
                         ) : (
                           <>
                             <td style={cellStyle} align="right">{h.taxPct ? `${h.taxPct}%` : ""}</td>
                             <td style={cellStyle} align="right">{fmtNum(h.igstAmt)}</td>
                           </>
                         )}
                         <td style={{ ...cellStyle, borderRight: tBorder }} align="right">{fmtNum(h.taxAmt)}</td>
                       </tr>
                    ))}
                    <tr style={{ fontSize: "8pt", fontWeight: "bold" }}>
                      <td style={cellStyle} align="right">Total</td>
                      <td style={cellStyle} align="right">{fmtNum(hsnList.reduce((s,x)=>s+x.taxable,0))}</td>
                      {isIntra ? (
                        <>
                          <td style={cellStyle} align="right"></td>
                          <td style={cellStyle} align="right">{fmtNum(hsnList.reduce((s,x)=>s+x.cgstAmt,0))}</td>
                          <td style={cellStyle} align="right"></td>
                          <td style={cellStyle} align="right">{fmtNum(hsnList.reduce((s,x)=>s+x.sgstAmt,0))}</td>
                        </>
                      ) : (
                        <>
                          <td style={cellStyle} align="right"></td>
                          <td style={cellStyle} align="right">{fmtNum(hsnList.reduce((s,x)=>s+x.igstAmt,0))}</td>
                        </>
                      )}
                      <td style={{ ...cellStyle, borderRight: tBorder }} align="right">{fmtNum(hsnList.reduce((s,x)=>s+x.taxAmt,0))}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Tax Amount Words & Declaration */}
                <div style={{ display: "flex", borderBottom: tBorder, borderRight: tBorder }}>
                   <div style={{ flex: 1, padding: "4px" }}>
                     <div style={{ fontSize: "8pt" }}>{config.taxAmountWordsLabel}</div>
                     <div style={{ fontWeight: "bold", marginBottom: "8px" }}>{numberToWords(totalTaxAmount)}</div>
                     
                     {config.showDeclaration && (
                       <>
                         <div style={{ fontSize: "8pt", textDecoration: "underline", fontWeight: "bold" }}>{config.declarationLabel}</div>
                         <div style={{ fontSize: "8pt" }}>{config.declarationText}</div>
                       </>
                     )}
                   </div>
                   {/* Signatures */}
                   {config.showSignature && (
                     <div style={{ display: "flex", flex: 1 }}>
                       <div style={{ flex: 1, padding: "4px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                         <div style={{ fontSize: "8pt", textAlign: "center", borderTop: "1px solid #000", margin: "0 10px", paddingTop: "2px" }}>
                           {config.customerSealLabel}
                         </div>
                       </div>
                       <div style={{ flex: 1, padding: "4px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                         <div style={{ fontWeight: "bold", textAlign: "right" }}>For {displayOrgName}</div>
                         <div style={{ fontSize: "8pt", textAlign: "right", marginTop: "40px" }}>{config.authSignatoryLabel}</div>
                       </div>
                     </div>
                   )}
                </div>

              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
