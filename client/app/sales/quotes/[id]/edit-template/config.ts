export interface QuoteTemplateConfig {
  templateName: string;
  paperSize: "A4" | "A5" | "Letter";
  orientation: "Portrait" | "Landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;
  // Header
  headerBgColor: string;
  headerBgColorEnabled: boolean;
  headerTextColor: string;
  headerFontSize: number;
  headerDividerColor: string;
  showHeaderDivider: boolean;
  gstinLabel: string;
  contactLabel: string;
  emailLabel: string;
  factoryLabel: string;
  showContact: boolean;
  showEmail: boolean;
  // Footer
  showFooter: boolean;
  showFooterPageNumber: boolean;
  showFooterLines: boolean;
  footerFontSize: number;
  footerFontColor: string;
  footerDividerColor: string;
  footerLine1: string;
  footerLine2: string;
  footerLine3: string;
  footerLine4: string;
  footerLine5: string;
  footerBgColor: string;
  footerBgColorEnabled: boolean;
  footerCustomContent: string;
  // Org
  showOrgLogo: boolean;
  orgLogoSize: number;
  showOrgName: boolean;
  orgNameColor: string;
  orgNameFontSize: number;
  showOrgAddress: boolean;
  showGstin: boolean;
  // Override values (leave empty to use org defaults)
  orgNameOverride: string;
  gstinValueOverride: string;
  contactValueOverride: string;
  emailValueOverride: string;
  factoryValueOverride: string;
  // Customer
  customerNameFontColor: string;
  customerNameFontSize: number;
  showBillTo: boolean;
  billToLabel: string;
  // Document
  showDocTitle: boolean;
  docTitle: string;
  docTitleFontSize: number;
  docTitleFontColor: string;
  quoteNumberLabel: string;
  quoteDateLabel: string;
  expiryDateLabel: string;
  showSignature: boolean;
  signatureLabel: string;
  // Table columns
  colItem: boolean; itemLabel: string;
  colHsn: boolean; hsnLabel: string;
  colQty: boolean; qtyLabel: string;
  colRate: boolean; rateLabel: string;
  colDiscount: boolean; discountLabel: string;
  colTax: boolean; taxLabel: string;
  colAmount: boolean; amountLabel: string;
  // Table style
  tableHeaderFontSize: number;
  tableHeaderBgColor: string;
  tableHeaderFontColor: string;
  oddRowColor: string;
  evenRowColor: string;
  // Other
  showNotes: boolean;
  notesLabel: string;
  showTerms: boolean;
  termsLabel: string;
  // Theme
  colorTheme: string;
  primaryColor: string;
}

export const DEFAULT_CONFIG: QuoteTemplateConfig = {
  templateName: "Standard",
  paperSize: "A4",
  orientation: "Portrait",
  margins: { top: 0.7, bottom: 0.7, left: 0.55, right: 0.4 },
  fontFamily: "Inter, sans-serif",
  fontSize: 12,
  backgroundColor: "#ffffff",
  headerBgColor: "#ffffff",
  headerBgColorEnabled: false,
  headerTextColor: "#1e293b",
  headerFontSize: 7.5,
  headerDividerColor: "#f59e0b",
  showHeaderDivider: true,
  gstinLabel: "GSTIN",
  contactLabel: "Contact",
  emailLabel: "Email",
  factoryLabel: "Factory",
  showContact: true,
  showEmail: true,
  showFooter: true,
  showFooterPageNumber: true,
  showFooterLines: true,
  footerFontSize: 9,
  footerFontColor: "#666666",
  footerDividerColor: "#f59e0b",
  footerLine1: "Solar Solutions : On grid & Off grid Power Plants | Water Heater | Street Lights | Home Lighting",
  footerLine2: "LED Lighting Solution : Domestic | Commercial | Industrial | Customized industrial",
  footerLine3: "Industrial Automation: DRIVES | PLC | SCADA | HMI",
  footerLine4: "",
  footerLine5: "",
  footerBgColor: "#ffffff",
  footerBgColorEnabled: false,
  footerCustomContent: "This is a computer-generated quotation.",
  showOrgLogo: true,
  orgLogoSize: 60,
  showOrgName: true,
  orgNameColor: "#333333",
  orgNameFontSize: 10,
  showOrgAddress: true,
  showGstin: true,
  orgNameOverride: "",
  gstinValueOverride: "",
  contactValueOverride: "",
  emailValueOverride: "",
  factoryValueOverride: "",
  customerNameFontColor: "#333333",
  customerNameFontSize: 9,
  showBillTo: true,
  billToLabel: "To,",
  showDocTitle: true,
  docTitle: "TECHNO-COMMERCIAL QUOTATION",
  docTitleFontSize: 11,
  docTitleFontColor: "#000000",
  quoteNumberLabel: "Ref No.",
  quoteDateLabel: "Date",
  expiryDateLabel: "Expiry Date",
  showSignature: true,
  signatureLabel: "Authorized Signatory",
  colItem: true, itemLabel: "Item & Description",
  colHsn: true, hsnLabel: "HSN/SAC",
  colQty: true, qtyLabel: "Qty",
  colRate: true, rateLabel: "Rate",
  colDiscount: true, discountLabel: "Discount",
  colTax: true, taxLabel: "Tax",
  colAmount: true, amountLabel: "Amount",
  tableHeaderFontSize: 9,
  tableHeaderBgColor: "#ffffff",
  tableHeaderFontColor: "#000000",
  oddRowColor: "#ffffff",
  evenRowColor: "#ffffff",
  showNotes: true,
  notesLabel: "Notes",
  showTerms: true,
  termsLabel: "Terms & conditions",
  colorTheme: "default",
  primaryColor: "#1a1a1a",
};

export const COLOR_THEMES = [
  { id: "default",        label: "Default", colors: ["#3c3d3a", "#ffffff"] },
  { id: "vibrant-blue",   label: "Blue",    colors: ["#1a56db", "#e1effe"] },
  { id: "vibrant-green",  label: "Green",   colors: ["#057a55", "#def7ec"] },
  { id: "vibrant-orange", label: "Orange",  colors: ["#e3a008", "#fdf3cc"] },
  { id: "vibrant-red",    label: "Red",     colors: ["#e02424", "#fde8e8"] },
  { id: "vibrant-teal",   label: "Teal",    colors: ["#0694a2", "#d5f5f6"] },
  { id: "vibrant-purple", label: "Purple",  colors: ["#7e3af2", "#edebfe"] },
];

export type EditTemplateTab = "general" | "header_footer" | "quote_details" | "table" | "other";

export const STORAGE_KEY = (id: string) => `quote-tmpl-config-${id}`;

export const MOCK_ITEMS = [
  { name: "Web Development Service", description: "", hsn: "998314", qty: 1, rate: 45000, disc: 0, tax: 18, taxAmount: 8100, amount: 53100 },
  { name: "UI/UX Design Package", description: "", hsn: "998312", qty: 2, rate: 12000, disc: 5, tax: 18, taxAmount: 4128, amount: 26928 },
  { name: "Hosting (Annual)", description: "", hsn: "998315", qty: 1, rate: 5000, disc: 0, tax: 18, taxAmount: 900, amount: 5900 },
];

export const MOCK_QUOTE = {
  quoteNumber: "QT-000042",
  quoteDate: "27/05/2026",
  expiryDate: "26/06/2026",
  customerName: "Sample Customer Co.",
  customerAddress: "123 Business Park, Mumbai, Maharashtra 400001",
  customerEmail: "contact@sampleco.in",
  subTotal: 74000,
  discountAmount: 1200,
  taxAmount: 13104,
  total: 85928,
  notes: "Thanks for your business.",
  terms: "Payment is due within 30 days of the invoice date.",
};
