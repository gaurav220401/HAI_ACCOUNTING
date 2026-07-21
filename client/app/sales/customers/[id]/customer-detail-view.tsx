"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";

import { useOrganization } from "@/contexts/organization-context";
import { apiFetch } from "@/lib/api/client";
import {
  contactApi,
  type ActivityEvent,
  type Contact,
  type ContactComment,
  type UpdateContactInput,
} from "@/lib/api/contacts";
import { invoiceApi, type Invoice } from "@/lib/api/invoices";
import {
  paymentReceivedApi,
  type PaymentReceived,
} from "@/lib/api/payments-received";
import { quoteApi, type Quote } from "@/lib/api/quotes";
import { salesOrderApi, type SalesOrder } from "@/lib/api/sales-orders";
import {
  deliveryChallanApi,
  type DeliveryChallan,
} from "@/lib/api/delivery-challans";
import {
  retainerInvoiceApi,
  type RetainerInvoice,
} from "@/lib/api/retainer-invoices";
import { smtpApi } from "@/lib/api/smtp";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DraggableText } from "@/components/ui/draggable-text";


type CustomerTab = "overview" | "comments" | "transactions" | "mails" | "statement";
type ChartPeriod = "6m" | "12m" | "fiscal" | "prev_fiscal";
type ChartBasis = "accrual" | "cash";
type StatementTypeFilter = "All" | "Invoices" | "Payments";

const CHART_PERIOD_LABELS: Record<ChartPeriod, string> = {
  "6m": "Last 6 Months",
  "12m": "Last 12 Months",
  fiscal: "This Fiscal Year",
  prev_fiscal: "Previous Fiscal Year",
};

interface StatementTemplateConfig {
  paperSize: "A4" | "A5" | "Letter";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
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
  showFooter: boolean;
  footerFontSize: number;
  footerFontColor: string;
  footerCustomContent: string;
  colorTheme: string;
  [key: string]: unknown;
}

const DEFAULT_STATEMENT_TEMPLATE_CONFIG: StatementTemplateConfig = {
  paperSize: "A4",
  margins: { top: 0.7, bottom: 0.7, left: 0.55, right: 0.4 },
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  backgroundColor: "#ffffff",
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
  showFooter: true,
  footerFontSize: 9,
  footerFontColor: "#666666",
  footerCustomContent: "This is a computer-generated statement.",
  colorTheme: "default",
};

const STATEMENT_COLOR_THEMES = [
  { id: "default", label: "Default", colors: ["#3c3d3a", "#ffffff"] },
  { id: "vibrant-blue", label: "Blue", colors: ["#1a56db", "#e1effe"] },
  { id: "vibrant-green", label: "Green", colors: ["#057a55", "#def7ec"] },
  { id: "vibrant-orange", label: "Orange", colors: ["#e3a008", "#fdf3cc"] },
  { id: "vibrant-red", label: "Red", colors: ["#e02424", "#fde8e8"] },
  { id: "vibrant-teal", label: "Teal", colors: ["#0694a2", "#d5f5f6"] },
  { id: "vibrant-purple", label: "Purple", colors: ["#7e3af2", "#edebfe"] },
];

const STATEMENT_TEMPLATE_STORAGE_KEY = (id: string) => `stmt-tmpl-config-${id}`;

interface StatementRow {
  date: string;
  type: "Invoice" | "Payment";
  ref: string;
  debit: number;
  credit: number;
  balance: number;
}

interface CustomerDetailViewProps {
  customer: Contact;
  initialTab?: string;
  onCustomerUpdate?: (customer: Contact) => void;
  onClose?: () => void;
}

function asId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return "";
}

function fmtCurrency(value?: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function currencyCodeWithName(currency = "INR"): string {
  const code = String(currency || "INR").toUpperCase();
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    const label = displayNames.of(code);
    return label ? `${code} - ${label}` : code;
  } catch {
    return code;
  }
}

function fmtDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function fmtDateTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fmtTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function addressLines(address?: Contact["billingAddress"]): string {
  if (!address) return "";
  return [
    address.attention,
    address.street,
    address.street2,
    address.city,
    address.state,
    address.zip,
    address.country,
  ]
    .map((row) => String(row || "").trim())
    .filter(Boolean)
    .join(", ");
}

function paymentCustomerId(payment: PaymentReceived): string {
  return typeof payment.customer_id === "string"
    ? payment.customer_id
    : payment.customer_id?._id || "";
}

function getMonthBuckets(period: ChartPeriod) {
  const now = new Date();
  let start: Date;
  let span: number;

  if (period === "6m") {
    span = 6;
    start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  } else if (period === "12m") {
    span = 12;
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (period === "fiscal") {
    span = 12;
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    start = new Date(fyStartYear, 3, 1);
  } else {
    span = 12;
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
    start = new Date(fyStartYear, 3, 1);
  }

  return Array.from({ length: span }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      label: date.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
    };
  });
}

function getMonthlyData(rows: Array<{ date?: string; amount: number }>, period: ChartPeriod) {
  return getMonthBuckets(period).map(({ year, month, label }) => {
    const total = rows
      .filter((row) => {
        if (!row.date) return false;
        const date = new Date(row.date);
        if (Number.isNaN(date.getTime())) return false;
        return date.getFullYear() === year && date.getMonth() === month;
      })
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { label, total };
  });
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeTab(tab?: string): CustomerTab {
  if (tab === "overview" || tab === "comments" || tab === "transactions" || tab === "mails" || tab === "statement") {
    return tab;
  }
  return "overview";
}

function placeOfSupplyLabel(value?: string): string {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return "-";
  const labels: Record<string, string> = {
    AN: "Andaman and Nicobar Islands",
    AD: "Andhra Pradesh",
    AR: "Arunachal Pradesh",
    AS: "Assam",
    BR: "Bihar",
    CH: "Chandigarh",
    CG: "Chhattisgarh",
    DN: "Dadra and Nagar Haveli and Daman and Diu",
    DD: "Daman and Diu",
    DL: "Delhi",
    FC: "Foreign Country",
    GA: "Goa",
    GJ: "Gujarat",
    HR: "Haryana",
    HP: "Himachal Pradesh",
    JK: "Jammu and Kashmir",
    JH: "Jharkhand",
    KA: "Karnataka",
    KL: "Kerala",
    LA: "Ladakh",
    LD: "Lakshadweep",
    MP: "Madhya Pradesh",
    MH: "Maharashtra",
    MN: "Manipur",
    ML: "Meghalaya",
    MZ: "Mizoram",
    NL: "Nagaland",
    OD: "Odisha",
    OT: "Other Territory",
    PY: "Puducherry",
    PB: "Punjab",
    RJ: "Rajasthan",
    SK: "Sikkim",
    TN: "Tamil Nadu",
    TS: "Telangana",
    TR: "Tripura",
    UP: "Uttar Pradesh",
    UK: "Uttarakhand",
    WB: "West Bengal",
  };
  if (labels[code]) return labels[code];
  return String(value || "-");
}

function SectionBlock({
  title,
  open,
  onToggle,
  right,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: (next: boolean) => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="border-t">
      <div className="flex items-center justify-between py-3">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-foreground">
          <span>{title}</span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </CollapsibleTrigger>
        {right}
      </div>
      <CollapsibleContent className="pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function TxSection({
  title,
  defaultOpen = true,
  onNew,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onNew?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between bg-muted/25 px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xlfont-medium">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          <span className="text-base font-semibold">{title}</span>
        </CollapsibleTrigger>
        {onNew ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-teal-600 hover:text-teal-700 hover:bg-teal-50/50" onClick={onNew}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
        ) : null}
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function CustomerDetailView({
  customer: initialCustomer,
  initialTab,
  onCustomerUpdate,
  onClose,
}: CustomerDetailViewProps) {
  const router = useRouter();
  const { activeOrganization } = useOrganization();
  const isSplitPanelView = Boolean(onClose);

  const [customer, setCustomer] = useState<Contact>(initialCustomer);
  const [activeTab, setActiveTab] = useState<CustomerTab>(normalizeTab(initialTab));

  const [comments, setComments] = useState<ContactComment[]>(initialCustomer.comments ?? []);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [deliveryChallans, setDeliveryChallans] = useState<DeliveryChallan[]>([]);
  const [retainerInvoices, setRetainerInvoices] = useState<RetainerInvoice[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("6m");
  const [chartBasis, setChartBasis] = useState<ChartBasis>("accrual");

  const [addressOpen, setAddressOpen] = useState(true);
  const [otherOpen, setOtherOpen] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [recordInfoOpen, setRecordInfoOpen] = useState(false);

  const [statementRange, setStatementRange] = useState<"thisMonth" | "last6Months">("thisMonth");
  const [statementTypeFilter, setStatementTypeFilter] = useState<StatementTypeFilter>("All");
  const [statementStart, setStatementStart] = useState(toIsoDate(monthStart(new Date())));
  const [statementEnd, setStatementEnd] = useState(toIsoDate(new Date()));
  const [templateConfig, setTemplateConfig] = useState<StatementTemplateConfig>(DEFAULT_STATEMENT_TEMPLATE_CONFIG);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [vendors, setVendors] = useState<Contact[]>([]);
  const [linkVendorId, setLinkVendorId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [customersForMerge, setCustomersForMerge] = useState<Contact[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSaving, setMergeSaving] = useState(false);

  const orgLogo = activeOrganization?.logo ?? "";
  const orgName = activeOrganization?.name ?? "";
  const orgAddress = activeOrganization?.address as
    | { street?: string; city?: string; state?: string; zip?: string; phone?: string }
    | undefined;

  useEffect(() => {
    setCustomer(initialCustomer);
    setComments(initialCustomer.comments ?? []);
  }, [initialCustomer]);

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (!isSplitPanelView || !customer._id || typeof window === "undefined") return;

    const query = new URLSearchParams(window.location.search);
    const currentSelectedId = query.get("selectedId") || "";
    const currentTab = normalizeTab(query.get("tab") || undefined);
    if (currentSelectedId === customer._id && currentTab === activeTab) return;

    query.set("selectedId", customer._id);
    query.set("tab", activeTab);
    router.replace(`/sales/customers?${query.toString()}`, { scroll: false });
  }, [activeTab, customer._id, isSplitPanelView, router]);

  useEffect(() => {
    if (!customer._id) return;

    let cancelled = false;
    setActivityLoading(true);

    contactApi
      .getActivity(customer._id)
      .then((res) => {
        if (!cancelled) setActivity(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customer._id]);

  async function refreshCustomerById(id: string) {
    const res = await contactApi.getById(id);
    const next = res.data;
    setCustomer(next);
    setComments(next.comments ?? []);
    onCustomerUpdate?.(next);
    return next;
  }

  async function loadTransactionsData(customerId: string) {
    setTransactionsLoading(true);
    try {
      const [invoiceRes, paymentRes, quoteRes, orderRes, challanRes, retainerRes] = await Promise.all([
        invoiceApi.list({ page: 1, limit: 200, status: "All", customerId }),
        paymentReceivedApi.list({ page: 1, limit: 200, status: "All", customerId }),
        quoteApi.list({ page: 1, limit: 200, status: "All", customerId }),
        salesOrderApi.list({ page: 1, limit: 200, customerId }),
        deliveryChallanApi.list({ page: 1, limit: 200, status: "All", customerId }),
        retainerInvoiceApi.list({ page: 1, limit: 200, status: "All", customerId }),
      ]);

      const inv = (invoiceRes.data || []).filter((row) => asId(row.customerId) === customerId);
      const pay = (paymentRes.data || []).filter((row) => paymentCustomerId(row) === customerId);
      const qts = (quoteRes.data || []).filter((row) => asId(row.customerId) === customerId);
      const ord = (orderRes.data || []).filter((row) => asId(row.customerId) === customerId);
      const chal = (challanRes.data || []).filter((row) => asId(row.customerId) === customerId);
      const ret = (retainerRes.data || []).filter((row) => asId(row.customer_id) === customerId);

      setInvoices(inv);
      setPayments(pay);
      setQuotes(qts);
      setSalesOrders(ord);
      setDeliveryChallans(chal);
      setRetainerInvoices(ret);
    } catch {
      setInvoices([]);
      setPayments([]);
      setQuotes([]);
      setSalesOrders([]);
      setDeliveryChallans([]);
      setRetainerInvoices([]);
    } finally {
      setTransactionsLoading(false);
    }
  }

  useEffect(() => {
    if (!customer._id) return;
    void loadTransactionsData(customer._id);
  }, [customer._id]);

  useEffect(() => {
    if (statementRange === "thisMonth") {
      setStatementStart(toIsoDate(monthStart(new Date())));
      setStatementEnd(toIsoDate(new Date()));
      return;
    }

    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    setStatementStart(toIsoDate(start));
    setStatementEnd(toIsoDate(end));
  }, [statementRange]);

  useEffect(() => {
    if (!customer._id) return;

    const fromCustomer =
      customer.statementTemplate && typeof customer.statementTemplate === "object"
        ? (customer.statementTemplate as Partial<StatementTemplateConfig>)
        : undefined;

    let fromStorage: Partial<StatementTemplateConfig> | undefined;
    try {
      const stored = localStorage.getItem(STATEMENT_TEMPLATE_STORAGE_KEY(customer._id));
      if (stored) {
        fromStorage = JSON.parse(stored) as Partial<StatementTemplateConfig>;
      }
    } catch {
      fromStorage = undefined;
    }

    const merged: StatementTemplateConfig = {
      ...DEFAULT_STATEMENT_TEMPLATE_CONFIG,
      ...(fromCustomer ?? {}),
      ...(fromStorage ?? {}),
      margins: {
        ...DEFAULT_STATEMENT_TEMPLATE_CONFIG.margins,
        ...(fromCustomer?.margins ?? {}),
        ...(fromStorage?.margins ?? {}),
      },
    };
    setTemplateConfig(merged);
  }, [customer._id, customer.statementTemplate]);

  useEffect(() => {
    if (activeTab !== "statement" || !customer._id) return;

    try {
      const stored = localStorage.getItem(STATEMENT_TEMPLATE_STORAGE_KEY(customer._id));
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<StatementTemplateConfig>;
      setTemplateConfig((prev) => ({
        ...prev,
        ...parsed,
        margins: { ...prev.margins, ...(parsed.margins ?? {}) },
      }));
    } catch {
      // Ignore malformed local cache and continue using server template.
    }
  }, [activeTab, customer._id]);

  const primaryContact = useMemo(() => {
    const fromPersons = customer.contactPersons?.find((row) => row.isPrimary) || customer.contactPersons?.[0];
    return {
      name: fromPersons?.name || customer.displayName,
      email: fromPersons?.email || customer.email || "",
      workPhone: fromPersons?.workPhone || customer.phone || "",
      mobile: fromPersons?.mobile || customer.mobile || "",
      photoUrl: fromPersons?.photoUrl || customer.contactPersons?.find((row) => row.photoUrl)?.photoUrl || "",
    };
  }, [customer]);

  const outstandingReceivables = useMemo(
    () => invoices.reduce((sum, row) => sum + (row.balanceDue || 0), 0) + Number(customer.openingBalance || 0),
    [invoices, customer.openingBalance],
  );

  const agingBuckets = useMemo(() => {
    let current = 0;
    let _1_15 = 0;
    let _16_30 = 0;
    let _31_45 = 0;
    let above_45 = 0;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Invoices
    for (const inv of invoices) {
      const due = Number(inv.balanceDue || 0);
      if (due <= 0) continue;
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!dueDate || dueDate.getTime() >= todayStart.getTime()) {
        current += due;
      } else {
        const daysOverdue = Math.floor((todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue <= 15) _1_15 += due;
        else if (daysOverdue <= 30) _16_30 += due;
        else if (daysOverdue <= 45) _31_45 += due;
        else above_45 += due;
      }
    }
    
    // Customer Opening Balance
    const obDate = customer.createdAt ? new Date(customer.createdAt) : null;
    const obDue = Number(customer.openingBalance || 0);
    if (obDue > 0) {
      if (!obDate || obDate.getTime() >= todayStart.getTime()) {
        current += obDue;
      } else {
        const daysOverdue = Math.floor((todayStart.getTime() - obDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue <= 15) _1_15 += obDue;
        else if (daysOverdue <= 30) _16_30 += obDue;
        else if (daysOverdue <= 45) _31_45 += obDue;
        else above_45 += obDue;
      }
    }
    
    return { current, "1-15": _1_15, "16-30": _16_30, "31-45": _31_45, "above-45": above_45 };
  }, [invoices, customer.openingBalance, customer.createdAt]);

  const invoiceAmount = useMemo(
    () => invoices.reduce((sum, row) => sum + (row.total || 0), 0),
    [invoices],
  );

  const amountReceived = useMemo(
    () => payments.reduce((sum, row) => sum + (row.amount_used_for_invoices || 0), 0),
    [payments],
  );

  const unusedCredits = useMemo(
    () => payments.reduce((sum, row) => sum + (row.amount_in_excess || 0), 0),
    [payments],
  );

  const chartData = useMemo(() => {
    if (chartBasis === "cash") {
      return getMonthlyData(
        payments.map((row) => ({
          date: row.payment_date,
          amount: Number(row.amount_used_for_invoices || row.total_amount_received || 0),
        })),
        chartPeriod,
      );
    }

    return getMonthlyData(
      invoices.map((row) => ({ date: row.invoiceDate, amount: Number(row.total || 0) })),
      chartPeriod,
    );
  }, [chartBasis, chartPeriod, invoices, payments]);

  const chartTotal = useMemo(
    () => chartData.reduce((sum, row) => sum + row.total, 0),
    [chartData],
  );

  const statementRows = useMemo(() => {
    const start = new Date(`${statementStart}T00:00:00`);
    const end = new Date(`${statementEnd}T23:59:59`);

    const entries: Array<Omit<StatementRow, "balance">> = [];

    invoices.forEach((invoice) => {
      const date = new Date(invoice.invoiceDate);
      if (date < start || date > end) return;
      entries.push({
        date: invoice.invoiceDate,
        type: "Invoice",
        ref: invoice.invoiceNumber,
        debit: Number(invoice.total || 0),
        credit: 0,
      });
    });

    payments.forEach((payment) => {
      const date = new Date(payment.payment_date);
      if (date < start || date > end) return;
      entries.push({
        date: payment.payment_date,
        type: "Payment",
        ref: payment.payment_number,
        debit: 0,
        credit: Number(payment.total_amount_received || 0),
      });
    });

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let running = Number(customer.openingBalance || 0);
    return entries.map((entry) => {
      running += entry.debit - entry.credit;
      return { ...entry, balance: running };
    });
  }, [customer.openingBalance, invoices, payments, statementStart, statementEnd]);

  const visibleStatementRows = useMemo(() => {
    if (statementTypeFilter === "All") return statementRows;
    const expected = statementTypeFilter === "Invoices" ? "Invoice" : "Payment";
    return statementRows.filter((row) => row.type === expected);
  }, [statementRows, statementTypeFilter]);

  const statementClosingBalance =
    visibleStatementRows.length > 0
      ? visibleStatementRows[visibleStatementRows.length - 1].balance
      : Number(customer.openingBalance || 0);

  const activityTimeline = useMemo(() => {
    const normalized = activity.map((event) => {
      if (event.type === "contact_created") {
        return {
          ...event,
          description: "Contact added",
        };
      }

      if (String(event.description || "").toLowerCase().startsWith("vendor ")) {
        return {
          ...event,
          description: String(event.description || "").replace(/^vendor\s+/i, "Contact "),
        };
      }

      return event;
    });

    const hasOpeningBalanceEvent = normalized.some((event) =>
      /opening\s+balance/i.test(String(event.description || "")),
    );

    const openingBalance = Number(customer.openingBalance || 0);
    if (!hasOpeningBalanceEvent && Math.abs(openingBalance) >= 0.01) {
      const actorName = normalized.find((event) => event.type === "contact_created")?.userName || "System";
      normalized.push({
        type: "opening_balance_created",
        timestamp: customer.createdAt || customer.updatedAt || new Date().toISOString(),
        description: `Opening Balance of amount ${fmtCurrency(openingBalance, customer.currency || "INR")} created.`,
        userName: actorName,
      });
    }

    return [...normalized].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activity, customer.createdAt, customer.currency, customer.openingBalance, customer.updatedAt]);

  async function addComment() {
    const text = commentText.trim();
    if (!text) return;

    setCommentSaving(true);
    try {
      const res = await contactApi.addComment(customer._id, text);
      setComments(res.data || []);
      setCommentText("");
      await refreshCustomerById(customer._id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add comment");
    } finally {
      setCommentSaving(false);
    }
  }

  async function patchCustomer(patch: UpdateContactInput) {
    const res = await contactApi.update(customer._id, patch);
    const next = res.data;
    setCustomer(next);
    onCustomerUpdate?.(next);
    return next;
  }

  async function togglePortal() {
    try {
      await patchCustomer({ portalEnabled: !customer.portalEnabled });
      toast.success(customer.portalEnabled ? "Portal disabled" : "Portal enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update portal status");
    }
  }

  async function toggleActive() {
    try {
      await patchCustomer({ isActive: !customer.isActive });
      toast.success(customer.isActive ? "Customer marked inactive" : "Customer marked active");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  }

  async function cloneCustomer() {
    try {
      const res = await contactApi.clone(customer._id);
      toast.success("Customer cloned");
      router.push(`/sales/customers?selectedId=${res.data._id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clone customer");
    }
  }

  async function deleteCustomer() {
    const ok = window.confirm(`Delete customer ${customer.displayName}? This cannot be undone.`);
    if (!ok) return;

    try {
      await contactApi.remove(customer._id);
      toast.success("Customer deleted");
      if (onClose) {
        onClose();
      } else {
        router.push("/sales/customers");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete customer");
    }
  }

  async function openLinkVendorDialog() {
    setLinkDialogOpen(true);
    if (vendors.length > 0) return;

    try {
      const res = await contactApi.list({ type: "Vendor", page: 1, limit: 200, includeInactive: false });
      setVendors((res.data || []).filter((row) => row._id !== customer._id));
    } catch {
      setVendors([]);
    }
  }

  async function saveLinkVendor() {
    if (!linkVendorId) {
      toast.error("Please select a vendor");
      return;
    }

    setLinkSaving(true);
    try {
      await patchCustomer({ linkedContactId: linkVendorId });
      toast.success("Customer linked to vendor");
      setLinkDialogOpen(false);
      setLinkVendorId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link vendor");
    } finally {
      setLinkSaving(false);
    }
  }

  async function openMergeDialog() {
    setMergeDialogOpen(true);
    if (customersForMerge.length > 0) return;

    try {
      const res = await contactApi.list({ type: "Customer", page: 1, limit: 200, includeInactive: true });
      setCustomersForMerge((res.data || []).filter((row) => row._id !== customer._id));
    } catch {
      setCustomersForMerge([]);
    }
  }

  async function mergeCustomer() {
    if (!mergeTargetId) {
      toast.error("Please select target customer");
      return;
    }

    setMergeSaving(true);
    try {
      await contactApi.mergeCustomers(customer._id, mergeTargetId);
      toast.success("Customers merged");
      setMergeDialogOpen(false);
      router.push(`/sales/customers?selectedId=${mergeTargetId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to merge customers");
    } finally {
      setMergeSaving(false);
    }
  }

  async function openEmailDialog() {
    const recipient = customer.email || primaryContact.email;
    setEmailTo(recipient || "");
    setEmailSubject(`Statement of Accounts - ${customer.displayName}`);
    setEmailBody(
      `Dear ${customer.displayName},\n\nPlease find your statement of accounts from ${fmtDate(statementStart)} to ${fmtDate(statementEnd)}.\n\nRegards,\n${activeOrganization?.name || "Accounts Team"}`,
    );
    setEmailDialogOpen(true);

    if (smtpConfigured === null && activeOrganization?._id) {
      try {
        const res = await smtpApi.get(activeOrganization._id);
        const settings = res.data;
        setSmtpConfigured(Boolean(settings?.host && settings?.user && settings?.pass));
      } catch {
        setSmtpConfigured(false);
      }
    }
  }

  async function sendEmail() {
    if (!emailTo.trim()) {
      toast.error("Recipient email is required");
      return;
    }
    if (!activeOrganization?._id) return;

    setEmailSending(true);
    try {
      await apiFetch(`/organizations/${activeOrganization._id}/send-email`, {
        method: "POST",
        body: JSON.stringify({
          to: emailTo,
          subject: emailSubject,
          body: emailBody,
          customerName: customer.displayName,
        }),
      });
      toast.success("Statement emailed successfully");
      setEmailDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  function openNewTransaction(path: string) {
    router.push(path);
  }

  function copyProfileLink() {
    const link = `${window.location.origin}/sales/customers?selectedId=${customer._id}`;
    navigator.clipboard
      .writeText(link)
      .then(() => toast.success("Customer link copied"))
      .catch(() => toast.error("Failed to copy link"));
  }

  function printStatement() {
    const area = document.querySelector(".statement-print-area") as HTMLElement | null;
    if (!area) {
      window.print();
      return;
    }

    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) {
      window.print();
      return;
    }

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Statement - ${customer.displayName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f3f4f6; font-family: ${templateConfig.fontFamily}; }
        .statement-print-area { display: flex !important; flex-direction: column !important; background: white; margin: 0 auto; }
        table { border-collapse: collapse; width: 100%; }
        img { max-width: 100%; display: block; }
        @page { size: A4 portrait; margin: 0; }
        @media print { body { background: white; } .statement-print-area { box-shadow: none !important; } }
      </style>
      </head><body>${area.outerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  function exportStatementPdf() {
    // Reuse the print rendering flow so users can choose "Save as PDF".
    printStatement();
  }

  function exportStatementXlsx() {
    const wsData: (string | number)[][] = [
      [templateConfig.accountSummaryLabel, "", "", "", "", ""],
      [templateConfig.openingBalanceLabel, Number(customer.openingBalance || 0), "", "", "", ""],
      [templateConfig.invoicedAmountLabel, invoiceAmount, "", "", "", ""],
      [templateConfig.amountPaidLabel, amountReceived, "", "", "", ""],
      [templateConfig.balanceDueLabel, statementClosingBalance, "", "", "", ""],
      [],
      [
        templateConfig.dateLabel,
        templateConfig.transactionTypeLabel,
        templateConfig.transactionDetailsLabel,
        templateConfig.amountLabel,
        templateConfig.paymentsLabel,
        templateConfig.balanceLabel,
      ],
      ...visibleStatementRows.map((row) => [
        fmtDate(row.date),
        row.type,
        row.ref,
        row.debit,
        row.credit,
        row.balance,
      ] as (string | number)[]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Statement");
    XLSX.writeFile(wb, `${customer.displayName}_statement.xlsx`);
  }

  const newTransactionBase = `customerId=${encodeURIComponent(customer._id)}`;
  const statementRangeLabel = `${fmtDate(statementStart)} To ${fmtDate(statementEnd)}`;
  const statementCustomerAddress =
    addressLines(customer.billingAddress) ||
    addressLines(customer.shippingAddress) ||
    placeOfSupplyLabel(customer.placeOfSupply);
  const statementPaperWidth =
    templateConfig.paperSize === "A5"
      ? "148mm"
      : templateConfig.paperSize === "Letter"
        ? "216mm"
        : "210mm";
  const statementPaperMinHeight =
    templateConfig.paperSize === "A5"
      ? "210mm"
      : templateConfig.paperSize === "Letter"
        ? "279mm"
        : "297mm";
  const statementActiveColumnCount = [
    templateConfig.colDate,
    templateConfig.colTransactionType,
    templateConfig.colTransactionDetails,
    templateConfig.colAmount,
    templateConfig.colPayments,
    templateConfig.colBalance,
  ].filter(Boolean).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0 max-w-xl">
          <h1 className="text-[34px] font-normal leading-none max-w-full overflow-hidden">
            <DraggableText className="text-[34px] font-normal leading-none py-0.5">{customer.displayName}</DraggableText>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground max-w-full overflow-hidden">
            {customer.isActive ? <span>Active</span> : <span className="text-orange-600">Inactive</span>}
            {customer.companyName && customer.companyName !== customer.displayName ? (
              <DraggableText className="max-w-[250px]">{customer.companyName}</DraggableText>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/sales/customers/${customer._id}/edit`)}
          >
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>

          <Button variant="outline" size="icon" onClick={copyProfileLink} aria-label="Copy customer link">
            <Link2 className="h-4 w-4" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold">
                New Transaction
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/invoices/new?${newTransactionBase}`)}>Invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/payments-received/new?${newTransactionBase}`)}>Customer Payment</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/quotes/new?${newTransactionBase}`)}>Quote</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/retainer-invoices/new?${newTransactionBase}`)}>Retainer Invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/orders/new?${newTransactionBase}`)}>Sales Order</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/delivery-challans/new?${newTransactionBase}`)}>Delivery Challan</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewTransaction(`/sales/recurring-invoices/new?${newTransactionBase}`)}>Recurring Invoice</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                More
                <MoreHorizontal className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push(`/sales/customers/${customer._id}/edit-template`)}>Associate Templates</DropdownMenuItem>
              <DropdownMenuItem onClick={togglePortal}>Configure Customer Portal</DropdownMenuItem>
              <DropdownMenuItem onClick={openLinkVendorDialog}>Link to Vendor</DropdownMenuItem>
              <DropdownMenuItem onClick={cloneCustomer}>Clone</DropdownMenuItem>
              <DropdownMenuItem onClick={openMergeDialog}>Merge Customers</DropdownMenuItem>
              <DropdownMenuItem onClick={toggleActive}>{customer.isActive ? "Mark as Inactive" : "Mark as Active"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={deleteCustomer}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {onClose ? (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(normalizeTab(value))}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="mails">Mails</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 flex min-h-0 flex-1 overflow-hidden">
          <div className="grid min-h-0 w-full grid-cols-1 lg:grid-cols-[340px_1fr]">
            <div className="min-h-0 overflow-y-auto border-r px-4 py-3">
              <div className="rounded-md border bg-muted/20 px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-muted">
                    {primaryContact.photoUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={primaryContact.photoUrl}
                          alt={primaryContact.name || customer.displayName}
                          className="h-full w-full object-cover"
                        />
                      </>
                    ) : (
                      <UserRound className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <DraggableText className="font-semibold text-foreground">{primaryContact.name || customer.displayName}</DraggableText>
                    <button
                      type="button"
                      className="mt-1 text-sm text-teal-600 hover:text-teal-700 hover:underline"
                      onClick={togglePortal}
                    >
                      {customer.portalEnabled ? "Disable Portal" : "Invite to Portal"}
                    </button>
                    {customer.linkedContactId ? (
                      <p className="mt-1 text-xs text-muted-foreground">Linked Vendor: {customer.linkedContactId}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <SectionBlock title="Address" open={addressOpen} onToggle={setAddressOpen}>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-medium">Billing Address</p>
                    <p className="text-muted-foreground">{addressLines(customer.billingAddress) || "No Billing Address"}</p>
                  </div>
                  <div>
                    <p className="font-medium">Shipping Address</p>
                    <p className="text-muted-foreground">{addressLines(customer.shippingAddress) || "No Shipping Address"}</p>
                  </div>
                </div>
              </SectionBlock>

              <SectionBlock title="Other Details" open={otherOpen} onToggle={setOtherOpen}>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div className="text-muted-foreground">Customer Type</div>
                  <div>{customer.companyName ? "Business" : "Individual"}</div>

                  <div className="text-muted-foreground">Default Currency</div>
                  <div>{customer.currency || "INR"}</div>

                  <div className="text-muted-foreground">GST Treatment</div>
                  <div>{customer.taxTreatment || "-"}</div>

                  <div className="text-muted-foreground">Place of Supply</div>
                  <div>{placeOfSupplyLabel(customer.placeOfSupply)}</div>

                  <div className="text-muted-foreground">Tax Preference</div>
                  <div>{customer.taxPreference || "-"}</div>

                  <div className="text-muted-foreground">Portal Status</div>
                  <div>{customer.portalEnabled ? "Enabled" : "Disabled"}</div>

                  <div className="text-muted-foreground">Customer Language</div>
                  <div>{customer.language || "en"}</div>
                </div>
              </SectionBlock>

              <SectionBlock
                title="Contact Persons"
                open={peopleOpen}
                onToggle={setPeopleOpen}
                right={
                  <button
                    type="button"
                    onClick={() => router.push(`/sales/customers/${customer._id}/edit`)}
                    className="text-teal-600 hover:text-teal-700"
                    aria-label="Edit customer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              >
                {customer.contactPersons && customer.contactPersons.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {customer.contactPersons.map((person, index) => (
                      <div key={`${person.name}-${index}`} className="rounded border px-2 py-1.5">
                        <p className="font-medium">{person.name}</p>
                        <p className="text-muted-foreground">{person.email || person.mobile || person.workPhone || "-"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No contact persons found.</p>
                )}
              </SectionBlock>

              <SectionBlock title="Record Info" open={recordInfoOpen} onToggle={setRecordInfoOpen}>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Created</span>
                    <span>{fmtDateTime(customer.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span>{fmtDateTime(customer.updatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Contact ID</span>
                    <span className="font-mono text-xs">{customer._id}</span>
                  </div>
                </div>
              </SectionBlock>
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-3">
              <p className="text-sm text-muted-foreground">
                You can request your contact to directly update the GSTIN by sending an email.
                <button
                  type="button"
                  className="ml-1 text-teal-600 hover:text-teal-700 hover:underline"
                  onClick={openEmailDialog}
                >
                  Send email
                </button>
              </p>

              <div className="mt-5 rounded-md border px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment due period</p>
                <p className="mt-1 text-sm font-medium">{customer.paymentTermsId ? "Custom Terms" : "Due on Receipt"}</p>
              </div>

              <div className="mt-5 rounded-md border">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                  <p className="text-[26px] font-normal">Receivables</p>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Opening Balance</p>
                    <p className="text-sm font-semibold text-foreground">{fmtCurrency(Number(customer.openingBalance || 0), customer.currency || "INR")}</p>
                  </div>
                </div>
                <div className="overflow-x-auto px-4 py-3">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-semibold">Currency</th>
                        <th className="px-2 py-2 font-semibold">Outstanding Receivables</th>
                        <th className="px-2 py-2 font-semibold">Unused Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-2">{currencyCodeWithName(customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold text-teal-750">{fmtCurrency(outstandingReceivables, customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold">{fmtCurrency(unusedCredits, customer.currency || "INR")}</td>
                      </tr>
                    </tbody>
                  </table>
                  <button
                    type="button"
                    className="mt-2 text-sm text-teal-600 hover:text-teal-700 hover:underline"
                    onClick={() => setActiveTab("statement")}
                  >
                    View Opening Balance
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-md border">
                <div className="border-b px-4 py-3">
                  <p className="text-[20px] font-normal">Aging Details</p>
                  <p className="text-sm text-muted-foreground">Aging buckets for outstanding receivables</p>
                </div>
                <div className="overflow-x-auto px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-right text-xs tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Current</th>
                        <th className="px-2 py-2 font-medium">1-15 Days</th>
                        <th className="px-2 py-2 font-medium">16-30 Days</th>
                        <th className="px-2 py-2 font-medium">31-45 Days</th>
                        <th className="px-2 py-2 font-medium">&gt; 45 Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-right">
                        <td className="px-2 py-2 font-semibold">{fmtCurrency(agingBuckets.current, customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold text-red-500">{fmtCurrency(agingBuckets["1-15"], customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold text-red-600">{fmtCurrency(agingBuckets["16-30"], customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold text-red-700">{fmtCurrency(agingBuckets["31-45"], customer.currency || "INR")}</td>
                        <td className="px-2 py-2 font-semibold text-red-800">{fmtCurrency(agingBuckets["above-45"], customer.currency || "INR")}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 rounded-md border px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[24px] font-normal">Income</p>
                    <p className="text-sm text-muted-foreground">This chart is displayed in the organization base currency.</p>
                    <p className="text-xs text-muted-foreground">Opening Balance: {fmtCurrency(Number(customer.openingBalance || 0), customer.currency || "INR")}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{fmtCurrency(chartTotal, customer.currency || "INR")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline">
                          {CHART_PERIOD_LABELS[chartPeriod]} <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {(Object.entries(CHART_PERIOD_LABELS) as Array<[ChartPeriod, string]>).map(([value, label]) => (
                          <DropdownMenuItem
                            key={value}
                            onClick={() => setChartPeriod(value)}
                            className={chartPeriod === value ? "bg-teal-50 text-teal-700 font-semibold" : ""}
                          >
                            {label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="text-muted-foreground">|</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 hover:underline">
                          {chartBasis === "accrual" ? "Accrual" : "Cash"} <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setChartBasis("accrual")}
                          className={chartBasis === "accrual" ? "bg-teal-50 text-teal-700" : ""}
                        >
                          Accrual
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setChartBasis("cash")}
                          className={chartBasis === "cash" ? "bg-teal-50 text-teal-700" : ""}
                        >
                          Cash
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={44} />
                      <Tooltip formatter={(value) => fmtCurrency(Number(value || 0), customer.currency || "INR")} />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#83bf4f" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 border-t pt-3 text-base font-semibold">
                  Total Income ({chartBasis === "accrual" ? "Accrual" : "Cash"}, {CHART_PERIOD_LABELS[chartPeriod]}) - {fmtCurrency(chartTotal, customer.currency || "INR")}
                </div>
              </div>

              <div className="mt-6 rounded-md border px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-base font-semibold">Recent Activity</p>
                  <Button variant="outline" size="sm" onClick={() => refreshCustomerById(customer._id)}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                  </Button>
                </div>

                {activityLoading ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading activity...
                  </div>
                ) : activityTimeline.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No activity found.</p>
                ) : (
                  <div className="space-y-3 py-2">
                    {activityTimeline.map((event, index) => (
                      <div key={`${event.timestamp}-${index}`} className="flex gap-3">
                        <div className="w-[92px] shrink-0 text-xs text-muted-foreground">
                          <div>{fmtDate(event.timestamp)}</div>
                          <div className="mt-1">{fmtTime(event.timestamp)}</div>
                        </div>
                        <div className="flex-1 rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">
                            {event.type === "opening_balance_created" ? "added" : event.description}
                          </p>
                          {event.type === "opening_balance_created" ? (
                            <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">{event.userName || "System"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="comments" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-md border">
              <Textarea
                className="min-h-[120px] border-0"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
              />
              <div className="flex items-center justify-end border-t px-3 py-2">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" disabled={commentSaving || !commentText.trim()} onClick={() => void addComment()}>
                  {commentSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Add Comment
                </Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All Comments</p>
              {comments.length === 0 ? (
                <p className="rounded-md border border-dashed py-5 text-center text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...comments].reverse().map((comment) => (
                    <div key={comment._id} className="rounded-md border px-3 py-2">
                      <p className="whitespace-pre-wrap text-sm">{comment.text}</p>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{comment.userName || "User"}</span>
                        <span>{fmtDateTime(comment.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {transactionsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions...
            </div>
          ) : (
            <div className="space-y-4">
              <TxSection title="Invoices" onNew={() => openNewTransaction(`/sales/invoices/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Invoice Number</th>
                        <th className="px-3 py-2 font-semibold">Order Number</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Balance Due</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-5 text-center text-sm text-muted-foreground">
                            There are no invoices - <button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => openNewTransaction(`/sales/invoices/new?${newTransactionBase}`)}>Add New</button>
                          </td>
                        </tr>
                      ) : (
                        invoices.map((invoice) => (
                          <tr key={invoice._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(invoice.invoiceDate)}</td>
                            <td className="px-3 py-2">
                              <button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/invoices/${invoice._id}`)}>
                                {invoice.invoiceNumber}
                              </button>
                            </td>
                            <td className="px-3 py-2">{invoice.orderNumber || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(invoice.total, customer.currency || "INR")}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(invoice.balanceDue, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{invoice.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>

              <TxSection title="Customer Payments" onNew={() => openNewTransaction(`/sales/payments-received/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Payment Number</th>
                        <th className="px-3 py-2 font-semibold">Reference Number</th>
                        <th className="px-3 py-2 font-semibold">Payment Mode</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Unused Amount</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-5 text-center text-sm text-muted-foreground">
                            No payments have been received or recorded yet - <button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => openNewTransaction(`/sales/payments-received/new?${newTransactionBase}`)}>Add New</button>
                          </td>
                        </tr>
                      ) : (
                        payments.map((payment) => (
                          <tr key={payment._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(payment.payment_date)}</td>
                            <td className="px-3 py-2">
                              <button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/payments-received/${payment._id}`)}>
                                {payment.payment_number}
                              </button>
                            </td>
                            <td className="px-3 py-2">{payment.reference_number || "-"}</td>
                            <td className="px-3 py-2">{payment.payment_mode || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(payment.total_amount_received, customer.currency || "INR")}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(payment.amount_in_excess, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{payment.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>

              <TxSection title="Quotes" defaultOpen={false} onNew={() => openNewTransaction(`/sales/quotes/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Quote Number</th>
                        <th className="px-3 py-2 font-semibold">Reference</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-5 text-center text-sm text-muted-foreground">No quotes yet.</td>
                        </tr>
                      ) : (
                        quotes.map((quote) => (
                          <tr key={quote._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(quote.quoteDate)}</td>
                            <td className="px-3 py-2"><button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/quotes/${quote._id}`)}>{quote.quoteNumber}</button></td>
                            <td className="px-3 py-2">{quote.referenceNumber || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(quote.total, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{quote.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>

              <TxSection title="Retainer Invoices" defaultOpen={false} onNew={() => openNewTransaction(`/sales/retainer-invoices/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Retainer Number</th>
                        <th className="px-3 py-2 font-semibold">Reference</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Unapplied</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retainerInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-5 text-center text-sm text-muted-foreground">No retainer invoices yet.</td>
                        </tr>
                      ) : (
                        retainerInvoices.map((retainer) => (
                          <tr key={retainer._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(retainer.retainer_date)}</td>
                            <td className="px-3 py-2"><button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/retainer-invoices/${retainer._id}`)}>{retainer.retainer_number}</button></td>
                            <td className="px-3 py-2">{retainer.reference_number || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(retainer.total_amount, customer.currency || "INR")}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(retainer.amount_unapplied, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{retainer.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>

              <TxSection title="Sales Orders" defaultOpen={false} onNew={() => openNewTransaction(`/sales/orders/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Order Number</th>
                        <th className="px-3 py-2 font-semibold">Reference</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-5 text-center text-sm text-muted-foreground">No sales orders yet.</td>
                        </tr>
                      ) : (
                        salesOrders.map((order) => (
                          <tr key={order._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(order.orderDate)}</td>
                            <td className="px-3 py-2"><button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/orders/${order._id}`)}>{order.salesOrderNumber}</button></td>
                            <td className="px-3 py-2">{order.reference || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(order.total, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{order.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>

              <TxSection title="Delivery Challans" defaultOpen={false} onNew={() => openNewTransaction(`/sales/delivery-challans/new?${newTransactionBase}`)}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Challan Number</th>
                        <th className="px-3 py-2 font-semibold">Reference</th>
                        <th className="px-3 py-2 font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryChallans.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-5 text-center text-sm text-muted-foreground">No delivery challans yet.</td>
                        </tr>
                      ) : (
                        deliveryChallans.map((challan) => (
                          <tr key={challan._id} className="border-b last:border-0">
                            <td className="px-3 py-2">{fmtDate(challan.challanDate)}</td>
                            <td className="px-3 py-2"><button type="button" className="text-teal-600 hover:text-teal-700 hover:underline" onClick={() => router.push(`/sales/delivery-challans/${challan._id}`)}>{challan.challanNumber}</button></td>
                            <td className="px-3 py-2">{challan.referenceNumber || "-"}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtCurrency(challan.total, customer.currency || "INR")}</td>
                            <td className="px-3 py-2">{challan.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TxSection>
            </div>
          )}
        </TabsContent>

        <TabsContent value="mails" className="mt-0 min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Mail className="h-4 w-4" />
            </div>
            <p className="font-medium text-foreground">System Mails</p>
            <p className="mt-1">No emails sent.</p>
          </div>
        </TabsContent>

        <TabsContent value="statement" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b bg-background px-5 py-3 print:hidden">
            <Select value={statementRange} onValueChange={(value) => setStatementRange(value as "thisMonth" | "last6Months") }>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="last6Months">Last 6 Months</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statementTypeFilter} onValueChange={(value) => setStatementTypeFilter(value as StatementTypeFilter)}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">Filter: All</SelectItem>
                <SelectItem value="Invoices">Invoices</SelectItem>
                <SelectItem value="Payments">Payments</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5 rounded border bg-muted/20 px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                className="w-28 bg-transparent text-xs outline-none"
                value={statementStart}
                onChange={(event) => setStatementStart(event.target.value)}
              />
              <span className="mx-1 text-muted-foreground">-</span>
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                className="w-28 bg-transparent text-xs outline-none"
                value={statementEnd}
                onChange={(event) => setStatementEnd(event.target.value)}
              />
            </div>

            <div className="flex-1" />

            <Select
              value={templateConfig.colorTheme}
              onValueChange={(value) => {
                const theme = STATEMENT_COLOR_THEMES.find((row) => row.id === value);
                setTemplateConfig((prev) => {
                  const next: StatementTemplateConfig = {
                    ...prev,
                    colorTheme: value,
                    tableHeaderBgColor: theme ? theme.colors[0] : prev.tableHeaderBgColor,
                  };
                  try {
                    localStorage.setItem(STATEMENT_TEMPLATE_STORAGE_KEY(customer._id), JSON.stringify(next));
                  } catch {
                    // Ignore local storage errors and keep runtime config.
                  }
                  return next;
                });
              }}
            >
              <SelectTrigger className="h-8 w-44 shrink-0 text-xs">
                <SelectValue placeholder="Select Color Theme" />
              </SelectTrigger>
              <SelectContent>
                {STATEMENT_COLOR_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {theme.colors.map((color, colorIndex) => (
                          <div key={colorIndex} className="h-3 w-3 rounded-sm border border-border" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <span>{theme.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={printStatement}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />Print
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportStatementPdf}>
              <Download className="mr-1.5 h-3.5 w-3.5" />PDF
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportStatementXlsx}>
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />XLS
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openEmailDialog}>
              <Send className="mr-1.5 h-3.5 w-3.5" />Email
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => router.push(`/sales/customers/${customer._id}/edit-template`)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />Customize
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gray-100 px-4 py-6 print:bg-white print:p-0 print:overflow-visible">
            <div
              className="statement-print-area customer-statement-print-area mx-auto flex flex-col bg-white shadow-sm print:shadow-none"
              style={{
                width: statementPaperWidth,
                minHeight: statementPaperMinHeight,
                fontFamily: templateConfig.fontFamily,
                fontSize: `${templateConfig.fontSize}pt`,
                backgroundColor: templateConfig.backgroundColor,
              }}
            >
              <div style={{ flex: 1, padding: `${templateConfig.margins.top}in ${templateConfig.margins.right}in 0 ${templateConfig.margins.left}in` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div style={{ maxWidth: "45%" }}>
                    {templateConfig.showOrgLogo && orgLogo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={orgLogo}
                        alt={orgName}
                        style={{ height: `${templateConfig.orgLogoSize}px`, width: "auto", objectFit: "contain", display: "block" }}
                      />
                    ) : null}
                  </div>

                  <div style={{ textAlign: "right", maxWidth: "50%" }}>
                    {templateConfig.showOrgName ? (
                      <p style={{ fontWeight: "700", color: templateConfig.orgNameColor, fontSize: `${templateConfig.orgNameFontSize}pt`, margin: 0, lineHeight: 1.3 }}>
                        {orgName || "Your Organization"}
                      </p>
                    ) : null}

                    {templateConfig.showOrgAddress && orgAddress ? (
                      <>
                        {(orgAddress.city || orgAddress.state) ? (
                          <p style={{ margin: "2px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>
                            {[orgAddress.city, orgAddress.state].filter(Boolean).join(", ")}
                          </p>
                        ) : null}
                        {orgAddress.zip ? <p style={{ margin: "1px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{orgAddress.zip}</p> : null}
                        {orgAddress.street ? <p style={{ margin: "1px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{orgAddress.street}</p> : null}
                        {orgAddress.phone ? <p style={{ margin: "1px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>Ph: {orgAddress.phone}</p> : null}
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                  <div style={{ maxWidth: "50%" }}>
                    {templateConfig.showBillTo ? (
                      <p style={{ fontSize: "8pt", fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>
                        {templateConfig.billToLabel}
                      </p>
                    ) : null}
                    <p style={{ fontWeight: "600", color: templateConfig.vendorNameFontColor, fontSize: `${templateConfig.vendorNameFontSize}pt`, margin: 0, lineHeight: 1.35 }}>
                      {customer.displayName}
                    </p>
                    {customer.companyName && customer.companyName !== customer.displayName ? (
                      <p style={{ margin: "2px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{customer.companyName}</p>
                    ) : null}
                    {statementCustomerAddress ? (
                      <p style={{ margin: "2px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{statementCustomerAddress}</p>
                    ) : null}
                    {primaryContact.email ? <p style={{ margin: "2px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{primaryContact.email}</p> : null}
                  </div>

                  <div style={{ textAlign: "right", maxWidth: "48%" }}>
                    {templateConfig.showDocTitle ? (
                      <h1 style={{ fontWeight: "700", color: templateConfig.docTitleFontColor, fontSize: `${templateConfig.docTitleFontSize}pt`, margin: 0, lineHeight: 1.2 }}>
                        {templateConfig.docTitle}
                      </h1>
                    ) : null}
                    <p style={{ margin: "4px 0 0", fontSize: "8.5pt", color: "#6b7280" }}>{statementRangeLabel}</p>
                  </div>
                </div>

                <div style={{ borderTop: `2px solid ${templateConfig.tableHeaderBgColor}`, marginBottom: "16px" }} />

                {templateConfig.showAccountSummary ? (
                  <div style={{ marginBottom: "18px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                      <thead>
                        <tr style={{ backgroundColor: templateConfig.tableHeaderBgColor, color: templateConfig.tableHeaderFontColor }}>
                          <th colSpan={2} style={{ padding: "6px 10px", textAlign: "left", fontWeight: "600", fontSize: `${templateConfig.tableHeaderFontSize}pt` }}>
                            {templateConfig.accountSummaryLabel}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {([
                          [templateConfig.showOpeningBalance, templateConfig.openingBalanceLabel, Number(customer.openingBalance || 0)],
                          [templateConfig.showInvoicedAmount, templateConfig.invoicedAmountLabel, invoiceAmount],
                          [templateConfig.showAmountPaid, templateConfig.amountPaidLabel, amountReceived],
                          [templateConfig.showBalanceDue, templateConfig.balanceDueLabel, statementClosingBalance],
                        ] as [boolean, string, number][])
                          .filter(([show]) => show)
                          .map(([, label, value], index) => (
                            <tr key={label} style={{ backgroundColor: index % 2 === 0 ? templateConfig.evenRowColor : templateConfig.oddRowColor }}>
                              <td style={{ width: "60%", padding: "5px 10px", color: "#4b5563" }}>{label}</td>
                              <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: "500" }}>{fmtCurrency(value, customer.currency || "INR")}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9pt" }}>
                    <thead>
                      <tr style={{ backgroundColor: templateConfig.tableHeaderBgColor, color: templateConfig.tableHeaderFontColor, fontSize: `${templateConfig.tableHeaderFontSize}pt` }}>
                        {templateConfig.colDate ? <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.dateLabel}</th> : null}
                        {templateConfig.colTransactionType ? <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.transactionTypeLabel}</th> : null}
                        {templateConfig.colTransactionDetails ? <th style={{ padding: "7px 10px", textAlign: "left", fontWeight: "600" }}>{templateConfig.transactionDetailsLabel}</th> : null}
                        {templateConfig.colAmount ? <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.amountLabel}</th> : null}
                        {templateConfig.colPayments ? <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.paymentsLabel}</th> : null}
                        {templateConfig.colBalance ? <th style={{ padding: "7px 10px", textAlign: "right", fontWeight: "600" }}>{templateConfig.balanceLabel}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStatementRows.length === 0 ? (
                        <tr>
                          <td colSpan={Math.max(statementActiveColumnCount, 1)} style={{ padding: "20px", textAlign: "center", color: "#9ca3af" }}>
                            No transactions in this period
                          </td>
                        </tr>
                      ) : (
                        visibleStatementRows.map((row, index) => (
                          <tr
                            key={`${row.ref}-${index}`}
                            style={{
                              backgroundColor: index % 2 === 0 ? templateConfig.evenRowColor : templateConfig.oddRowColor,
                            }}
                          >
                            {templateConfig.colDate ? <td style={{ padding: "5px 10px" }}>{fmtDate(row.date)}</td> : null}
                            {templateConfig.colTransactionType ? <td style={{ padding: "5px 10px" }}>{row.type}</td> : null}
                            {templateConfig.colTransactionDetails ? <td style={{ padding: "5px 10px", fontSize: "8.5pt" }}>{row.ref}</td> : null}
                            {templateConfig.colAmount ? <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.debit > 0 ? fmtCurrency(row.debit, customer.currency || "INR") : "-"}</td> : null}
                            {templateConfig.colPayments ? <td style={{ padding: "5px 10px", textAlign: "right" }}>{row.credit > 0 ? fmtCurrency(row.credit, customer.currency || "INR") : "-"}</td> : null}
                            {templateConfig.colBalance ? <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: "500" }}>{fmtCurrency(row.balance, customer.currency || "INR")}</td> : null}
                          </tr>
                        ))
                      )}
                    </tbody>
                    {templateConfig.colBalance ? (
                      <tfoot>
                        <tr style={{ fontWeight: "700", borderTop: `2px solid ${templateConfig.tableHeaderBgColor}` }}>
                          {statementActiveColumnCount > 1 ? (
                            <td colSpan={statementActiveColumnCount - 1} style={{ padding: "7px 10px", textAlign: "right" }}>
                              {templateConfig.balanceDueLabel}
                            </td>
                          ) : null}
                          <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtCurrency(statementClosingBalance, customer.currency || "INR")}</td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
              </div>

              <div style={{ padding: `8px ${templateConfig.margins.right}in ${templateConfig.margins.bottom}in ${templateConfig.margins.left}in` }}>
                {templateConfig.showFooter ? (
                  <>
                    <div style={{ borderTop: "1px solid #d1d5db", marginBottom: "6px" }} />
                    <p style={{ margin: 0, textAlign: "center", fontSize: `${templateConfig.footerFontSize}pt`, color: templateConfig.footerFontColor }}>
                      {templateConfig.footerCustomContent || "This is a computer-generated statement."}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={emailDialogOpen} onOpenChange={(open) => !emailSending && setEmailDialogOpen(open)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Email Statement</DialogTitle>
          </DialogHeader>

          {smtpConfigured === false ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Configure SMTP in Settings to send emails.
            </div>
          ) : null}

          <div className="space-y-3 py-2">
            <div>
              <Label>To</Label>
              <Input value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="customer@example.com" />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea className="min-h-[160px]" value={emailBody} onChange={(event) => setEmailBody(event.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={emailSending}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void sendEmail()} disabled={emailSending}>
              {emailSending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Customer to Vendor</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Link this customer to a vendor profile to track payables and receivables together.
            </div>
            <div>
              <Label>Select Vendor</Label>
              <Select value={linkVendorId || "__none"} onValueChange={(value) => setLinkVendorId(value === "__none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select vendor</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor._id} value={vendor._id}>{vendor.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)} disabled={linkSaving}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void saveLinkVendor()} disabled={linkSaving}>
              {linkSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Customers</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              This will transfer related transactions and mark source contact inactive.
            </div>
            <div>
              <Label>Target Customer</Label>
              <Select value={mergeTargetId || "__none"} onValueChange={(value) => setMergeTargetId(value === "__none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Select target customer</SelectItem>
                  {customersForMerge.map((entry) => (
                    <SelectItem key={entry._id} value={entry._id}>{entry.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)} disabled={mergeSaving}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white font-semibold" onClick={() => void mergeCustomer()} disabled={mergeSaving}>
              {mergeSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
