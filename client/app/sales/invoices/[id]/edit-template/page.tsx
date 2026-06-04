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
import { InvoiceTemplateRenderer } from "@/components/invoice-template-renderer";

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
    if (!params?.id || !activeOrganization?._id) return;
    setSyncStatus("saving");
    localStorage.setItem(STORAGE_KEY(params.id), JSON.stringify(config));
    try {
      await Promise.all([
        invoiceApi.update(params.id, { templateConfig: config as any }),
        organizationApi.update(activeOrganization._id, { templateConfig: config }),
      ]);
      await refreshOrganizations();
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

  const previewInvoice = invoice ? {
    ...invoice,
    items: invoice.items?.length ? invoice.items : MOCK_ITEMS,
    subTotal: Number(invoice.subTotal ?? MOCK_INVOICE.subTotal),
    discountAmount: Number(invoice.discountAmount ?? MOCK_INVOICE.discountAmount),
    total: Number(invoice.total ?? MOCK_INVOICE.total),
  } as Invoice : {
    ...MOCK_INVOICE,
    items: MOCK_ITEMS,
  } as unknown as Invoice;

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
          <div key={previewKey}>
            <InvoiceTemplateRenderer
              invoice={previewInvoice}
              config={config}
              activeOrganization={activeOrganization}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
