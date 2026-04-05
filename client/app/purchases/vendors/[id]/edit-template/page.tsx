"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Settings2, Layout, FileText, Grid, AlignLeft,
  Upload, ImagePlus, ChevronDown, RefreshCw, X,
  Cloud, CloudCheck, CloudOff, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/contexts/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { contactApi, type Contact } from "@/lib/api/contacts";

// ─── Types (mirrors vendor-detail-view.tsx) ───────────────────────────────────

interface TemplateConfig {
  templateId: string;
  templateName: string;
  paperSize: "A4" | "A5" | "Letter";
  orientation: "Portrait" | "Landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
  headerBgImage: string;
  headerBgPosition: string;
  headerBgColor: string;
  headerBgColorEnabled: boolean;
  headerApplyFirstPageOnly: boolean;
  headerCustomContent: string;
  showFooter: boolean;
  footerFontSize: number;
  footerFontColor: string;
  footerBgImage: string;
  footerBgPosition: string;
  footerBgColor: string;
  footerBgColorEnabled: boolean;
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
  docPhone: string;
  docFax: string;
  showRefField: boolean;
  refFieldLabel: string;
  showAccountSummary: boolean;
  accountSummaryLabel: string;
  showOpeningBalance: boolean;
  openingBalanceLabel: string;
  showInvoicedAmount: boolean;
  invoicedAmountLabel: string;
  showAmountPaid: boolean;
  amountPaidLabel: string;
  showBalanceDue: boolean;
  balanceDueLabel: string;
  colDate: boolean;
  dateLabel: string;
  colTransactionType: boolean;
  transactionTypeLabel: string;
  colTransactionDetails: boolean;
  transactionDetailsLabel: string;
  showNotes: boolean;
  colAmount: boolean;
  amountLabel: string;
  colPayments: boolean;
  paymentsLabel: string;
  colBalance: boolean;
  balanceLabel: string;
  tableHeaderFontSize: number;
  tableHeaderBgColor: string;
  tableHeaderFontColor: string;
  oddRowColor: string;
  evenRowColor: string;
  annexureContent: string;
  colorTheme: string;
  primaryColor: string;
  tableStyle: "striped" | "bordered" | "minimal";
}

const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  templateId: "standard",
  templateName: "Standard",
  paperSize: "A4",
  orientation: "Portrait",
  margins: { top: 0.7, bottom: 0.7, left: 0.55, right: 0.4 },
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  backgroundColor: "#ffffff",
  headerBgImage: "",
  headerBgPosition: "center center",
  headerBgColor: "#ffffff",
  headerBgColorEnabled: true,
  headerApplyFirstPageOnly: false,
  headerCustomContent: "",
  showFooter: true,
  footerFontSize: 9,
  footerFontColor: "#666666",
  footerBgImage: "",
  footerBgPosition: "center center",
  footerBgColor: "#ffffff",
  footerBgColorEnabled: false,
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
  docTitle: "Statement of Accounts",
  docTitleFontSize: 16,
  docTitleFontColor: "#000000",
  docPhone: "",
  docFax: "",
  showRefField: false,
  refFieldLabel: "Ref",
  showAccountSummary: true,
  accountSummaryLabel: "Account Summary",
  showOpeningBalance: true,
  openingBalanceLabel: "Opening Balance",
  showInvoicedAmount: true,
  invoicedAmountLabel: "Billed Amount",
  showAmountPaid: true,
  amountPaidLabel: "Amount Paid",
  showBalanceDue: true,
  balanceDueLabel: "Balance Due",
  colDate: true,
  dateLabel: "Date",
  colTransactionType: true,
  transactionTypeLabel: "Transactions",
  colTransactionDetails: true,
  transactionDetailsLabel: "Details",
  showNotes: false,
  colAmount: true,
  amountLabel: "Amount",
  colPayments: true,
  paymentsLabel: "Payments",
  colBalance: true,
  balanceLabel: "Balance",
  tableHeaderFontSize: 9,
  tableHeaderBgColor: "#3c3d3a",
  tableHeaderFontColor: "#ffffff",
  oddRowColor: "#ffffff",
  evenRowColor: "#f6f5f5",
  annexureContent: "",
  colorTheme: "default",
  primaryColor: "#1a1a1a",
  tableStyle: "striped",
};

type EditTemplateTab = "general" | "header_footer" | "transaction" | "table" | "other";

const TEMPLATE_STORAGE_KEY = (id: string) => `stmt-tmpl-config-${id}`;

const COLOR_THEMES = [
  { id: "default",        label: "Default", colors: ["#3c3d3a", "#ffffff"] },
  { id: "vibrant-blue",   label: "Blue",    colors: ["#1a56db", "#e1effe"] },
  { id: "vibrant-green",  label: "Green",   colors: ["#057a55", "#def7ec"] },
  { id: "vibrant-orange", label: "Orange",  colors: ["#e3a008", "#fdf3cc"] },
  { id: "vibrant-red",    label: "Red",     colors: ["#e02424", "#fde8e8"] },
  { id: "vibrant-teal",   label: "Teal",    colors: ["#0694a2", "#d5f5f6"] },
  { id: "vibrant-purple", label: "Purple",  colors: ["#7e3af2", "#edebfe"] },
];

const fmt = (v?: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v ?? 0);

const MOCK_STMT = {
  rows: [
    { date: "01/02/2026", type: "Opening Balance",  details: "",                              amount: 94.83,   payments: 0,      balance: 94.83   },
    { date: "03/02/2026", type: "Credits",           details: "Ref#000012 00008",              amount: 200.00,  payments: 200.00, balance: -105.17 },
    { date: "04/02/2026", type: "Bill",              details: "Ref#000034 000098 - Due 06/02", amount: 195.93,  payments: 0,      balance: 90.76   },
    { date: "06/02/2026", type: "Bill",              details: "Ref#000045 Bill-000099 - Due 11/02", amount: 1500.00, payments: 0, balance: 1590.76 },
  ],
  openingBalance: 94.83,
  totalBilled: 1485.88,
  totalPaid: 125.83,
  balanceDue: 1454.88,
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function EtCollapsible({
  title, defaultOpen = true, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition-colors text-left">
          {title}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 space-y-3 border-t bg-background">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="h-7 text-xs font-mono w-20"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="color"
        className="h-7 w-8 rounded border cursor-pointer p-0.5 shrink-0"
        value={value.startsWith("#") && value.length >= 7 ? value.slice(0, 7) : "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { firebaseUser, loading } = useAuth();
  const { needsOrgSetup, loading: orgLoading, activeOrganization } = useOrganization();

  const [vendor, setVendor] = useState<Contact | null>(null);
  const [fetching, setFetching] = useState(true);
  const [etTab, setEtTab] = useState<EditTemplateTab>("general");
  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const [tableSubTab, setTableSubTab] = useState<"labels" | "layout">("labels");
  const [previewKey, setPreviewKey] = useState(0);
  const [templateSyncStatus, setTemplateSyncStatus] = useState<"idle" | "saving" | "synced" | "error">("idle");
  const [isDirty, setIsDirty] = useState(false);
  const [initialConfig, setInitialConfig] = useState<TemplateConfig>(DEFAULT_TEMPLATE_CONFIG);
  const statusResetTimeout = useRef<NodeJS.Timeout | null>(null);
  const fileInputRefHeader = useRef<HTMLInputElement>(null);
  const fileInputRefFooter = useRef<HTMLInputElement>(null);

  const orgLogo = activeOrganization?.logo ?? "";
  const orgName = activeOrganization?.name ?? "";
  const orgAddress = activeOrganization?.address as Record<string, string> | undefined;

  useEffect(() => {
    if (!loading && !firebaseUser) router.push("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    if (!loading && !orgLoading && firebaseUser && needsOrgSetup) router.push("/org-setup");
  }, [loading, orgLoading, firebaseUser, needsOrgSetup, router]);

  useEffect(() => {
    if (!firebaseUser || loading) return;
    const id = params?.id;
    if (!id) { setFetching(false); return; }

    try {
      const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY(id));
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TemplateConfig>;
        const next = { ...DEFAULT_TEMPLATE_CONFIG, ...parsed, margins: { ...DEFAULT_TEMPLATE_CONFIG.margins, ...(parsed.margins ?? {}) } };
        setConfig(next);
        setInitialConfig(next);
        setIsDirty(false);
      }
    } catch { /* ignore */ }

    contactApi.getById(id)
      .then((res) => {
        const vendorData = (res as any).data ?? res;
        setVendor(vendorData);
        if (vendorData?.statementTemplate) {
          const merged = { ...DEFAULT_TEMPLATE_CONFIG, ...vendorData.statementTemplate, margins: { ...DEFAULT_TEMPLATE_CONFIG.margins, ...(vendorData.statementTemplate?.margins ?? {}) } };
          setConfig(merged);
          setInitialConfig(merged);
          setIsDirty(false);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [firebaseUser, loading, params]);

  useEffect(() => {
    return () => {
      if (statusResetTimeout.current) {
        clearTimeout(statusResetTimeout.current);
      }
    };
  }, []);

  const update = (patch: Partial<TemplateConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
    setTemplateSyncStatus("idle");
  };

  const updateMargin = (k: keyof TemplateConfig["margins"], v: number) => {
    setConfig((prev) => ({ ...prev, margins: { ...prev.margins, [k]: v } }));
    setIsDirty(true);
    setTemplateSyncStatus("idle");
  };

  async function handleSave() {
    if (!params?.id) return;

    setTemplateSyncStatus("saving");
    try {
      await contactApi.update(params.id, { statementTemplate: config });
      localStorage.setItem(TEMPLATE_STORAGE_KEY(params.id), JSON.stringify(config));
      setIsDirty(false);
      setTemplateSyncStatus("synced");
      if (statusResetTimeout.current) clearTimeout(statusResetTimeout.current);
      statusResetTimeout.current = setTimeout(() => setTemplateSyncStatus("idle"), 2500);
      toast.success("Template synced to cloud");
      router.push(`/purchases/vendors?selectedId=${params?.id}&tab=statement`);
    } catch (err) {
      setTemplateSyncStatus("error");
      toast.error("Failed to sync template. Please try again.");
    }
  }

  function handleClose() {
    router.push(`/purchases/vendors?selectedId=${params?.id}&tab=statement`);
  }

  if (loading || orgLoading || !firebaseUser || fetching) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const etTabs: { id: EditTemplateTab; label: string; icon: React.ReactNode }[] = [
    { id: "general",       label: "General",              icon: <Settings2 className="h-5 w-5" /> },
    { id: "header_footer", label: "Header &\nFooter",    icon: <Layout className="h-5 w-5" /> },
    { id: "transaction",   label: "Transaction\nDetails", icon: <FileText className="h-5 w-5" /> },
    { id: "table",         label: "Table",                icon: <Grid className="h-5 w-5" /> },
    { id: "other",         label: "Other\nDetails",       icon: <AlignLeft className="h-5 w-5" /> },
  ];

  const pvName    = vendor?.displayName ?? "Sample Vendor Co.";
  const pvCompany = (vendor?.companyName && vendor.companyName !== vendor.displayName) ? vendor.companyName : "";
  const pvEmail   = vendor?.email ?? "";
  const pvAddr    = (vendor as any)?.billingAddress
    ? [(vendor as any).billingAddress.street, (vendor as any).billingAddress.city,
       (vendor as any).billingAddress.state, (vendor as any).billingAddress.country]
        .filter(Boolean).join(", ")
    : "";

  const activeColCount = [
    config.colDate, config.colTransactionType, config.colTransactionDetails,
    config.colAmount, config.colPayments,
  ].filter(Boolean).length;

  const paperW   = config.paperSize === "A5" ? "148mm" : config.paperSize === "Letter" ? "216mm" : "210mm";
  const paperMin = config.paperSize === "A5" ? "210mm" : config.paperSize === "Letter" ? "279mm" : "297mm";

  return (
    <div className="flex flex-col h-svh bg-background overflow-hidden">

      {/* ── Top action bar ── */}
      <div className="flex items-center justify-between h-12 px-5 border-b bg-background shrink-0">
        <h2 className="text-sm font-semibold">Edit Template</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {templateSyncStatus === "saving" && (
              <span className="flex items-center gap-1 text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving
              </span>
            )}
            {templateSyncStatus === "synced" && (
              <span className="flex items-center gap-1 text-green-600">
                <CloudCheck className="h-3.5 w-3.5" />
                Synced
              </span>
            )}
            {templateSyncStatus === "error" && (
              <span className="flex items-center gap-1 text-rose-600">
                <CloudOff className="h-3.5 w-3.5" />
                Sync failed
              </span>
            )}
            {templateSyncStatus === "idle" && !isDirty && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Cloud className="h-3.5 w-3.5" />
                Saved
              </span>
            )}
            {templateSyncStatus === "idle" && isDirty && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Cloud className="h-3.5 w-3.5" />
                Unsaved changes
              </span>
            )}
          </div>
          <Select
            value={config.colorTheme}
            onValueChange={(v) => {
              const theme = COLOR_THEMES.find((t) => t.id === v);
              update({ colorTheme: v, tableHeaderBgColor: theme?.colors[0] ?? config.tableHeaderBgColor });
            }}
          >
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Select Color Theme" />
            </SelectTrigger>
            <SelectContent>
              {COLOR_THEMES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {t.colors.map((c, ci) => (
                        <div key={ci} className="w-3 h-3 rounded-sm border border-border" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <span>{t.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setPreviewKey((k) => k + 1)}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh Preview
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSave}>Save</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── 3-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Col 1: Icon nav ── */}
        <div className="w-[68px] border-r bg-muted/10 flex flex-col items-stretch py-2 gap-0.5 shrink-0 overflow-y-auto">
          {etTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setEtTab(tab.id)}
              title={tab.label.replace("\n", " ")}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1.5 text-center transition-colors rounded-md mx-1 ${
                etTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              }`}
            >
              {tab.icon}
              <span className="text-[9px] leading-tight font-medium whitespace-pre-line">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Col 2: Settings panel ── */}
        <div className="w-72 border-r overflow-y-auto shrink-0 bg-background">
          <div className="p-4 space-y-4">

            {/* ── GENERAL TAB ── */}
            {etTab === "general" && (
              <div className="space-y-5">
                <div>
                  <Label className="text-xs mb-1.5 block">
                    Template Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={config.templateName}
                    onChange={(e) => update({ templateName: e.target.value })}
                  />
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Paper Size</Label>
                  <div className="flex items-center gap-5">
                    {(["A5", "A4", "Letter"] as const).map((size) => (
                      <label key={size} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio" name="paperSize" value={size}
                          checked={config.paperSize === size}
                          onChange={() => update({ paperSize: size })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        {size}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Orientation</Label>
                  <div className="flex items-center gap-5">
                    {(["Portrait", "Landscape"] as const).map((orient) => (
                      <label key={orient} className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio" name="orientation" value={orient}
                          checked={config.orientation === orient}
                          onChange={() => update({ orientation: orient })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        {orient}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Margins (inches)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["top", "bottom", "left", "right"] as const).map((k) => (
                      <div key={k}>
                        <Label className="text-xs text-muted-foreground mb-1 block capitalize">{k}</Label>
                        <Input
                          type="number" step="0.05" min="0" max="3"
                          className="h-8 text-sm"
                          value={config.margins[k]}
                          onChange={(e) => updateMargin(k, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <EtCollapsible title="Font" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Font Family</Label>
                      <Select value={config.fontFamily} onValueChange={(v) => update({ fontFamily: v })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Inter, sans-serif">Inter</SelectItem>
                          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                          <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
                          <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                          <SelectItem value="Georgia, serif">Georgia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Font Size (pt)</Label>
                      <Select value={String(config.fontSize)} onValueChange={(v) => update({ fontSize: parseInt(v) })}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[8, 9, 10, 11, 12, 13, 14].map((s) => (
                            <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </EtCollapsible>

                <EtCollapsible title="Background" defaultOpen={false}>
                  <div>
                    <Label className="text-xs mb-1.5 block">Background Color</Label>
                    <ColorPicker value={config.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
                  </div>
                </EtCollapsible>
              </div>
            )}

            {/* ── HEADER & FOOTER TAB ── */}
            {etTab === "header_footer" && (
              <div className="space-y-3">
                <EtCollapsible title="Header" defaultOpen={true}>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Background Image</p>
                    <div
                      className="border-2 border-dashed border-blue-300 rounded-lg p-5 text-center bg-blue-50/30 cursor-pointer hover:bg-blue-50/60 transition-colors"
                      onClick={() => fileInputRefHeader.current?.click()}
                    >
                      <Upload className="h-6 w-6 text-blue-400 mx-auto mb-1.5" />
                      <p className="text-xs text-blue-600 font-medium">Drag and drop or Upload file</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Maximum size: 1 MB</p>
                      <p className="text-[10px] text-muted-foreground">Supported Formats: GIF, PNG, JPEG, JPG, BMP</p>
                      <Button variant="outline" size="sm" className="mt-2 h-6 text-xs pointer-events-none">
                        Choose from Gallery
                      </Button>
                    </div>
                    <input ref={fileInputRefHeader} type="file" accept="image/*" className="hidden" />
                  </div>

                  <div>
                    <Label className="text-xs mb-1 block">Image Position</Label>
                    <Select value={config.headerBgPosition} onValueChange={(v) => update({ headerBgPosition: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["center center", "top left", "top center", "top right", "bottom left", "bottom center", "bottom right"].map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                    <input
                      type="checkbox"
                      checked={config.headerBgColorEnabled}
                      onChange={(e) => update({ headerBgColorEnabled: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <span className="text-sm">Background Color</span>
                    <ColorPicker value={config.headerBgColor} onChange={(v) => update({ headerBgColor: v })} />
                  </label>

                  <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2">
                    <Settings2 className="h-3.5 w-3.5" />Customize your header content
                  </Button>

                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={config.headerApplyFirstPageOnly}
                      onChange={(e) => update({ headerApplyFirstPageOnly: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    Apply to first page only
                  </label>
                </EtCollapsible>

                <EtCollapsible title="Footer" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs mb-1 block">Font Size</Label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number" min="6" max="24"
                          className="h-7 text-xs w-16"
                          value={config.footerFontSize}
                          onChange={(e) => update({ footerFontSize: parseInt(e.target.value) || 9 })}
                        />
                        <span className="text-xs text-muted-foreground">pt</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Font Color</Label>
                      <ColorPicker value={config.footerFontColor} onChange={(v) => update({ footerFontColor: v })} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Background Image</p>
                    <div
                      className="border-2 border-dashed border-blue-300 rounded-lg p-4 text-center bg-blue-50/30 cursor-pointer hover:bg-blue-50/60 transition-colors"
                      onClick={() => fileInputRefFooter.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-xs text-blue-600 font-medium">Drag and drop or Upload file</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Maximum size: 1 MB · GIF, PNG, JPEG, JPG, BMP</p>
                      <Button variant="outline" size="sm" className="mt-1.5 h-6 text-xs pointer-events-none">Choose from Gallery</Button>
                    </div>
                    <input ref={fileInputRefFooter} type="file" accept="image/*" className="hidden" />
                  </div>

                  <div>
                    <Label className="text-xs mb-1 block">Image Position</Label>
                    <Select value={config.footerBgPosition} onValueChange={(v) => update({ footerBgPosition: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["center center", "top left", "top center", "top right", "bottom left", "bottom center", "bottom right"].map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer flex-wrap">
                    <input
                      type="checkbox"
                      checked={config.footerBgColorEnabled}
                      onChange={(e) => update({ footerBgColorEnabled: e.target.checked })}
                      className="h-4 w-4 rounded"
                    />
                    <span className="text-sm">Background Color</span>
                    <ColorPicker value={config.footerBgColor} onChange={(v) => update({ footerBgColor: v })} />
                  </label>

                  <div>
                    <Label className="text-xs mb-1 block">Footer Text</Label>
                    <Textarea
                      className="text-sm resize-none"
                      rows={2}
                      value={config.footerCustomContent}
                      onChange={(e) => update({ footerCustomContent: e.target.value })}
                      placeholder="e.g. This is a computer-generated statement"
                    />
                  </div>

                  <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start gap-2">
                    <Settings2 className="h-3.5 w-3.5" />Customize your footer content
                  </Button>
                </EtCollapsible>
              </div>
            )}

            {/* ── TRANSACTION DETAILS TAB ── */}
            {etTab === "transaction" && (
              <div className="space-y-3">
                <EtCollapsible title="Organization Details" defaultOpen={true}>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showOrgLogo}
                        onChange={(e) => update({ showOrgLogo: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm font-medium">Show Organization Logo</span>
                    </label>

                    {config.showOrgLogo && (
                      <div className="ml-6 space-y-2">
                        {/* Show actual logo if available, otherwise show upload placeholder */}
                        <div
                          className="border-2 border-dashed border-border rounded overflow-hidden bg-muted/10 flex items-center justify-center"
                          style={{ width: `${config.orgLogoSize}px`, height: `${Math.round(config.orgLogoSize * 0.75)}px`, minWidth: "60px", minHeight: "45px" }}
                        >
                          {orgLogo ? (
                            <img
                              src={orgLogo}
                              alt={orgName}
                              style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-center p-2">
                              <ImagePlus className="h-5 w-5 text-muted-foreground/40" />
                              <span className="text-[9px] text-muted-foreground/60 leading-tight">No logo set</span>
                            </div>
                          )}
                        </div>
                        {!orgLogo && (
                          <p className="text-[10px] text-orange-500 italic">
                            ℹ Set logo via Statement → Customize → Update Logo &amp; Address
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Resize Logo</span>
                          <input
                            type="range" min="30" max="120" step="5"
                            value={config.orgLogoSize}
                            onChange={(e) => update({ orgLogoSize: parseInt(e.target.value) })}
                            className="flex-1 accent-primary"
                          />
                          <span className="text-xs text-muted-foreground w-10 text-right">{config.orgLogoSize}px</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={config.showOrgName}
                          onChange={(e) => update({ showOrgName: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Show Organization Name</span>
                      </label>
                      {config.showOrgName && (
                        <div className="flex items-center gap-2 ml-auto">
                          <ColorPicker value={config.orgNameColor} onChange={(v) => update({ orgNameColor: v })} />
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="6" max="24"
                              className="h-7 text-xs w-12"
                              value={config.orgNameFontSize}
                              onChange={(e) => update({ orgNameFontSize: parseInt(e.target.value) || 10 })}
                            />
                            <span className="text-xs text-muted-foreground">pt</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showOrgAddress}
                        onChange={(e) => update({ showOrgAddress: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      <span className="text-sm">Show Organization Address</span>
                    </label>
                  </div>
                </EtCollapsible>

                <EtCollapsible title="Vendor Details" defaultOpen={false}>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs mb-1.5 block">Vendor Name</Label>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Font Color</span>
                          <ColorPicker value={config.vendorNameFontColor} onChange={(v) => update({ vendorNameFontColor: v })} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Font Size</span>
                          <Input
                            type="number" min="6" max="24"
                            className="h-7 text-xs w-12 ml-1"
                            value={config.vendorNameFontSize}
                            onChange={(e) => update({ vendorNameFontSize: parseInt(e.target.value) || 9 })}
                          />
                          <span className="text-xs text-muted-foreground">pt</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={config.showBillTo}
                          onChange={(e) => update({ showBillTo: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Bill To Label</span>
                      </label>
                      {config.showBillTo && (
                        <Input
                          className="h-7 text-xs flex-1"
                          value={config.billToLabel}
                          onChange={(e) => update({ billToLabel: e.target.value })}
                          placeholder="To"
                        />
                      )}
                    </div>
                  </div>
                </EtCollapsible>

                <EtCollapsible title="Document Details" defaultOpen={false}>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={config.showDocTitle}
                          onChange={(e) => update({ showDocTitle: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Show Document Title</span>
                      </label>
                      {config.showDocTitle && (
                        <Input
                          className="h-7 text-xs flex-1"
                          value={config.docTitle}
                          onChange={(e) => update({ docTitle: e.target.value })}
                        />
                      )}
                    </div>
                    {config.showDocTitle && (
                      <div className="flex items-center gap-4 ml-6 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Font Size</span>
                          <Input
                            type="number" min="8" max="40"
                            className="h-7 text-xs w-12 ml-1"
                            value={config.docTitleFontSize}
                            onChange={(e) => update({ docTitleFontSize: parseInt(e.target.value) || 16 })}
                          />
                          <span className="text-xs text-muted-foreground">pt</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Font Color</span>
                          <ColorPicker value={config.docTitleFontColor} onChange={(v) => update({ docTitleFontColor: v })} />
                        </div>
                      </div>
                    )}

                    <Separator />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1 block">Phone</Label>
                        <Input className="h-7 text-xs" placeholder="Phone" value={config.docPhone} onChange={(e) => update({ docPhone: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Fax Number</Label>
                        <Input className="h-7 text-xs" placeholder="Fax" value={config.docFax} onChange={(e) => update({ docFax: e.target.value })} />
                      </div>
                    </div>

                    <Separator />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Information</p>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={config.showRefField}
                          onChange={(e) => update({ showRefField: e.target.checked })}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm">Reference Field</span>
                      </label>
                      {config.showRefField && (
                        <Input className="h-7 text-xs flex-1" value={config.refFieldLabel} onChange={(e) => update({ refFieldLabel: e.target.value })} />
                      )}
                    </div>

                    <Separator />
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={config.showAccountSummary}
                            onChange={(e) => update({ showAccountSummary: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm font-semibold">Total Account Summary</span>
                        </label>
                        {config.showAccountSummary && (
                          <Input
                            className="h-7 text-xs flex-1"
                            value={config.accountSummaryLabel}
                            onChange={(e) => update({ accountSummaryLabel: e.target.value })}
                          />
                        )}
                      </div>
                      {config.showAccountSummary && (
                        <div className="ml-6 space-y-1.5">
                          {([
                            ["showOpeningBalance", "openingBalanceLabel", "Opening Balance"],
                            ["showInvoicedAmount", "invoicedAmountLabel", "Invoiced Amount"],
                            ["showAmountPaid", "amountPaidLabel", "Amount Paid"],
                            ["showBalanceDue", "balanceDueLabel", "Balance Due"],
                          ] as [keyof TemplateConfig, keyof TemplateConfig, string][]).map(([checkKey, labelKey, placeholder]) => (
                            <div key={String(checkKey)} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={config[checkKey] as boolean}
                                onChange={(e) => update({ [checkKey]: e.target.checked })}
                                className="h-4 w-4 rounded"
                              />
                              <Input
                                className="h-7 text-xs flex-1"
                                value={config[labelKey] as string}
                                onChange={(e) => update({ [labelKey]: e.target.value })}
                                placeholder={placeholder}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </EtCollapsible>
              </div>
            )}

            {/* ── TABLE TAB ── */}
            {etTab === "table" && (
              <div className="space-y-4">
                <p className="text-sm font-semibold">Statement Table</p>
                <div className="flex border-b gap-0">
                  {(["labels", "layout"] as const).map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setTableSubTab(sub)}
                      className={`px-5 py-2 text-sm capitalize transition-colors border-b-2 -mb-px ${
                        tableSubTab === sub
                          ? "border-primary text-primary font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {sub.charAt(0).toUpperCase() + sub.slice(1)}
                    </button>
                  ))}
                </div>

                {tableSubTab === "labels" && (
                  <div className="space-y-2">
                    {([
                      { checkKey: "colDate" as const, labelKey: "dateLabel" as const, label: "Date" },
                      { checkKey: "colTransactionType" as const, labelKey: "transactionTypeLabel" as const, label: "Transaction Type" },
                      { checkKey: "colTransactionDetails" as const, labelKey: "transactionDetailsLabel" as const, label: "Transaction Details" },
                      { checkKey: "colAmount" as const, labelKey: "amountLabel" as const, label: "Amount" },
                      { checkKey: "colPayments" as const, labelKey: "paymentsLabel" as const, label: "Payments" },
                      { checkKey: "colBalance" as const, labelKey: "balanceLabel" as const, label: "Balance" },
                    ]).map(({ checkKey, labelKey, label }) => (
                      <div key={checkKey} className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer w-44 shrink-0">
                          <input
                            type="checkbox"
                            checked={config[checkKey]}
                            onChange={(e) => update({ [checkKey]: e.target.checked })}
                            className="h-4 w-4 rounded"
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                        <Input
                          className="h-7 text-xs flex-1"
                          value={config[labelKey]}
                          onChange={(e) => update({ [labelKey]: e.target.value })}
                        />
                        {checkKey === "colTransactionDetails" && (
                          <label className="flex items-center gap-1.5 shrink-0 cursor-pointer text-xs text-muted-foreground whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={config.showNotes}
                              onChange={(e) => update({ showNotes: e.target.checked })}
                              className="h-3.5 w-3.5 rounded"
                            />
                            Show Notes
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tableSubTab === "layout" && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Table Header</p>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">Font Size</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="6" max="24"
                              className="h-7 text-xs w-14"
                              value={config.tableHeaderFontSize}
                              onChange={(e) => update({ tableHeaderFontSize: parseInt(e.target.value) || 9 })}
                            />
                            <span className="text-xs text-muted-foreground">pt</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">Background Color</span>
                          <ColorPicker value={config.tableHeaderBgColor} onChange={(v) => update({ tableHeaderBgColor: v })} />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">Font Color</span>
                          <ColorPicker value={config.tableHeaderFontColor} onChange={(v) => update({ tableHeaderFontColor: v })} />
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Statement Table Row</p>
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">Odd Row Color</span>
                          <ColorPicker value={config.oddRowColor} onChange={(v) => update({ oddRowColor: v })} />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-28 shrink-0">Even Row Color</span>
                          <ColorPicker value={config.evenRowColor} onChange={(v) => update({ evenRowColor: v })} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── OTHER DETAILS TAB ── */}
            {etTab === "other" && (
              <div className="space-y-3">
                <EtCollapsible title="Annexure" defaultOpen={true}>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Click{" "}
                    <span className="font-medium text-foreground">Add Annexure Content</span>{" "}
                    to enter additional information apart from your Terms &amp; Conditions.
                    It can include by-laws, clauses and other details pertaining to your organization.
                    This will be included on a separate page at the end of every{" "}
                    <span className="font-medium text-foreground">Vendor Statement</span>.
                  </p>
                  <Button
                    variant="outline" size="sm"
                    className="w-full h-8 text-xs justify-start gap-2"
                    onClick={() => update({ annexureContent: config.annexureContent || "\n" })}
                  >
                    <Settings2 className="h-3.5 w-3.5" />Add Annexure Content
                  </Button>
                  {config.annexureContent.trim() && (
                    <Textarea
                      className="text-sm resize-none mt-1"
                      rows={5}
                      value={config.annexureContent}
                      onChange={(e) => update({ annexureContent: e.target.value })}
                      placeholder="Enter annexure content..."
                    />
                  )}
                </EtCollapsible>
              </div>
            )}

          </div>
        </div>

        {/* ── Col 3: Live preview ── */}
        <div className="flex-1 overflow-auto bg-[#e8e8e8] py-8 px-8">
          <div
            key={previewKey}
            className="bg-white mx-auto shadow-lg flex flex-col"
            style={{
              width: paperW,
              minHeight: paperMin,
              fontFamily: config.fontFamily,
              fontSize: `${config.fontSize}pt`,
              backgroundColor: config.backgroundColor,
            }}
          >
            {/* Paper content */}
            <div style={{ flex: 1, padding: `${config.margins.top}in ${config.margins.right}in 0 ${config.margins.left}in` }}>

              {/* Row 1: Logo (left) | Org info (right) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div>
                  {orgLogo && config.showOrgLogo && (
                    <img src={orgLogo} alt={orgName}
                      style={{ height: `${config.orgLogoSize}px`, width: "auto", objectFit: "contain", display: "block" }} />
                  )}
                  {!orgLogo && config.showOrgLogo && (
                    <div style={{ width: `${config.orgLogoSize}px`, height: `${config.orgLogoSize}px`,
                      border: "2px dashed #d1d5db", borderRadius: "6px",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "8pt", color: "#9ca3af" }}>Logo</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", maxWidth: "50%" }}>
                  {config.showOrgName && (
                    <p style={{ fontWeight: "700", color: config.orgNameColor, fontSize: `${config.orgNameFontSize}pt`, margin: 0, lineHeight: 1.3 }}>
                      {orgName || "Your Company Name"}
                    </p>
                  )}
                  {config.showOrgAddress && orgAddress && (
                    <>
                      {orgAddress.street  && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.street}</p>}
                      {orgAddress.street2 && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.street2}</p>}
                      {(orgAddress.city || orgAddress.state) && (
                        <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>
                          {[orgAddress.city, orgAddress.state].filter(Boolean).join(" ")}
                          {orgAddress.zip ? ` ${orgAddress.zip}` : ""}
                        </p>
                      )}
                      {orgAddress.country && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.country}</p>}
                      {orgAddress.phone   && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "1px 0 0" }}>{orgAddress.phone}</p>}
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: Vendor (left) | Title + period (right) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                <div style={{ maxWidth: "50%" }}>
                  {config.showBillTo && (
                    <p style={{ fontSize: "8pt", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>
                      {config.billToLabel}
                    </p>
                  )}
                  <p style={{ fontWeight: "600", color: config.vendorNameFontColor, fontSize: `${config.vendorNameFontSize}pt`, margin: 0, lineHeight: 1.35 }}>
                    {pvName}
                  </p>
                  {pvCompany && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{pvCompany}</p>}
                  {pvAddr    && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{pvAddr}</p>}
                  {pvEmail   && <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "2px 0 0" }}>{pvEmail}</p>}
                </div>
                <div style={{ textAlign: "right", maxWidth: "48%" }}>
                  {config.showDocTitle && (
                    <h1 style={{ fontWeight: "700", color: config.docTitleFontColor, fontSize: `${config.docTitleFontSize}pt`, margin: 0, lineHeight: 1.2 }}>
                      {config.docTitle}
                    </h1>
                  )}
                  <p style={{ fontSize: "8.5pt", color: "#6b7280", margin: "4px 0 0" }}>01/02/2026 To 28/02/2026</p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1.5px solid ${config.tableHeaderBgColor}`, marginBottom: "16px" }} />

              {/* Account Summary */}
              {config.showAccountSummary && (
                <div style={{ marginBottom: "18px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor }}>
                        <th colSpan={2} style={{ padding: "6px 10px", textAlign: "left", fontWeight: "600", fontSize: `${config.tableHeaderFontSize}pt` }}>
                          {config.accountSummaryLabel}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        [config.showOpeningBalance, config.openingBalanceLabel, MOCK_STMT.openingBalance],
                        [config.showInvoicedAmount, config.invoicedAmountLabel,  MOCK_STMT.totalBilled],
                        [config.showAmountPaid,     config.amountPaidLabel,      MOCK_STMT.totalPaid],
                        [config.showBalanceDue,     config.balanceDueLabel,      MOCK_STMT.balanceDue],
                      ] as [boolean, string, number][]).filter(([show]) => show).map(([, label, value], i) => (
                        <tr key={String(label)} style={{ backgroundColor: i % 2 === 0 ? config.evenRowColor : config.oddRowColor }}>
                          <td style={{ padding: "5px 10px", color: "#4b5563", width: "65%", fontSize: "9pt" }}>{label as string}</td>
                          <td style={{ padding: "5px 10px", fontWeight: "500", textAlign: "right", fontSize: "9pt" }}>{fmt(value as number)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Transactions table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: config.tableHeaderBgColor, color: config.tableHeaderFontColor, fontSize: `${config.tableHeaderFontSize}pt` }}>
                    {config.colDate              && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{config.dateLabel}</th>}
                    {config.colTransactionType   && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{config.transactionTypeLabel}</th>}
                    {config.colTransactionDetails && <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{config.transactionDetailsLabel}</th>}
                    {config.colAmount            && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{config.amountLabel}</th>}
                    {config.colPayments          && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{config.paymentsLabel}</th>}
                    {config.colBalance           && <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{config.balanceLabel}</th>}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_STMT.rows.map((row, i) => (
                    <tr key={i} style={{
                      backgroundColor: i === 0 ? "transparent" : (i % 2 === 0 ? config.evenRowColor : config.oddRowColor),
                      fontStyle: i === 0 ? "italic" : "normal",
                      color: i === 0 ? "#6b7280" : "inherit",
                      fontSize: "9pt",
                    }}>
                      {config.colDate              && <td style={{ padding: "5px 10px" }}>{row.date}</td>}
                      {config.colTransactionType   && <td style={{ padding: "5px 10px" }}>{row.type}</td>}
                      {config.colTransactionDetails && <td style={{ padding: "5px 10px", fontSize: "8.5pt" }}>{row.details}</td>}
                      {config.colAmount            && <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.amount > 0 ? fmt(row.amount) : "—"}</td>}
                      {config.colPayments          && <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.payments > 0 ? fmt(row.payments) : "—"}</td>}
                      {config.colBalance           && <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: "500" }}>{fmt(row.balance)}</td>}
                    </tr>
                  ))}
                </tbody>
                {config.colBalance && (
                  <tfoot>
                    <tr style={{ fontWeight: "700", borderTop: `2px solid ${config.tableHeaderBgColor}`, fontSize: "9pt" }}>
                      {activeColCount > 0 && (
                        <td colSpan={activeColCount} style={{ padding: "7px 10px", textAlign: "right" }}>{config.balanceDueLabel}</td>
                      )}
                      <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmt(MOCK_STMT.balanceDue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Footer pinned to bottom */}
            <div style={{ padding: `8px ${config.margins.right}in ${config.margins.bottom}in ${config.margins.left}in` }}>
              {config.showFooter && (
                <>
                  <div style={{ borderTop: "1px solid #d1d5db", marginBottom: "6px" }} />
                  <p style={{ fontSize: `${config.footerFontSize}pt`, color: config.footerFontColor, textAlign: "center", margin: 0 }}>
                    {config.footerCustomContent || "This is a computer-generated statement."}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
