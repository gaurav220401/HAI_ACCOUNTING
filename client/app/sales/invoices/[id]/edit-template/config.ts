export interface InvoiceTemplateConfig extends Record<string, unknown> {
  templateName: string;
  paperSize: "A4" | "A5" | "Letter";
  orientation: "Portrait" | "Landscape";
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  fontSize: number;
  backgroundColor: string;

  // Organization Block
  showOrgLogo: boolean;
  orgLogoSize: number;
  showOrgName: boolean;
  orgNameColor: string;
  orgNameFontSize: number;
  orgNameOverride: string;
  showOrgAddress: boolean;
  factoryValueOverride: string;
  showGstin: boolean;
  gstinLabel: string;
  gstinValueOverride: string;
  showContact: boolean;
  contactLabel: string;
  contactValueOverride: string;
  showEmail: boolean;
  emailLabel: string;
  emailValueOverride: string;

  // Invoice Details Block (Right Side)
  invoiceNoLabel: string;
  datedLabel: string;
  deliveryNoteLabel: string;
  modeOfPaymentLabel: string;
  referenceNoLabel: string;
  otherReferencesLabel: string;
  buyersOrderNoLabel: string;
  dispatchDocNoLabel: string;
  deliveryNoteDateLabel: string;
  dispatchedThroughLabel: string;
  destinationLabel: string;
  billOfLadingLabel: string;
  motorVehicleNoLabel: string;
  termsOfDeliveryLabel: string;

  // Customer Blocks
  consigneeLabel: string;
  buyerLabel: string;
  customerNameFontColor: string;
  customerNameFontSize: number;

  // Items Table
  colSlNo: boolean; slNoLabel: string;
  colDescription: boolean; descriptionLabel: string;
  colHsn: boolean; hsnLabel: string;
  colQty: boolean; qtyLabel: string;
  colRate: boolean; rateLabel: string;
  colPer: boolean; perLabel: string;
  colAmount: boolean; amountLabel: string;

  // Table styling
  tableHeaderFontSize: number;
  tableHeaderBgColor: string;
  tableHeaderFontColor: string;
  oddRowColor: string;
  evenRowColor: string;

  // Tax & Totals Bottom Area
  amountChargeableWordsLabel: string;
  taxAmountWordsLabel: string;
  showDeclaration: boolean;
  declarationLabel: string;
  declarationText: string;

  showSignature: boolean;
  customerSealLabel: string;
  authSignatoryLabel: string;

  // Theme
  colorTheme: string;
  primaryColor: string;
}

export const DEFAULT_CONFIG: InvoiceTemplateConfig = {
  templateName: "Tally Style",
  paperSize: "A4",
  orientation: "Portrait",
  margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  fontFamily: "Inter, sans-serif",
  fontSize: 10,
  backgroundColor: "#ffffff",

  showOrgLogo: true,
  orgLogoSize: 60,
  showOrgName: true,
  orgNameColor: "#000000",
  orgNameFontSize: 11,
  orgNameOverride: "",
  showOrgAddress: true,
  factoryValueOverride: "",
  showGstin: true,
  gstinLabel: "GSTIN/UIN",
  gstinValueOverride: "",
  showContact: true,
  contactLabel: "Contact Details",
  contactValueOverride: "",
  showEmail: true,
  emailLabel: "e-Mail",
  emailValueOverride: "",

  invoiceNoLabel: "Invoice No.",
  datedLabel: "Dated",
  deliveryNoteLabel: "Delivery Note",
  modeOfPaymentLabel: "Mode/Terms of Payment",
  referenceNoLabel: "Reference No. & Date",
  otherReferencesLabel: "Other References",
  buyersOrderNoLabel: "Buyer's Order No.",
  dispatchDocNoLabel: "Dispatch Doc No.",
  deliveryNoteDateLabel: "Delivery Note Date",
  dispatchedThroughLabel: "Dispatched through",
  destinationLabel: "Destination",
  billOfLadingLabel: "Bill of Lading/LR-RR No.",
  motorVehicleNoLabel: "Motor Vehicle No.",
  termsOfDeliveryLabel: "Terms of Delivery",

  consigneeLabel: "Consignee (Ship to)",
  buyerLabel: "Buyer (Bill to)",
  customerNameFontColor: "#000000",
  customerNameFontSize: 10,

  colSlNo: true, slNoLabel: "Sl No.",
  colDescription: true, descriptionLabel: "Description of Goods",
  colHsn: true, hsnLabel: "HSN/SAC",
  colQty: true, qtyLabel: "Quantity",
  colRate: true, rateLabel: "Rate",
  colPer: true, perLabel: "per",
  colAmount: true, amountLabel: "Amount",

  tableHeaderFontSize: 9,
  tableHeaderBgColor: "#ffffff",
  tableHeaderFontColor: "#000000",
  oddRowColor: "#ffffff",
  evenRowColor: "#ffffff",

  amountChargeableWordsLabel: "Amount Chargeable (in words)",
  taxAmountWordsLabel: "Tax Amount (in words)",
  showDeclaration: true,
  declarationLabel: "Declaration",
  declarationText: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",

  showSignature: true,
  customerSealLabel: "Customer's Seal and Signature",
  authSignatoryLabel: "Authorised Signatory",

  colorTheme: "default",
  primaryColor: "#000000",
};

export const COLOR_THEMES = [
  { id: "default",        label: "Classic Print", colors: ["#000000", "#ffffff"] },
  { id: "vibrant-blue",   label: "Blue Header",   colors: ["#1e3a8a", "#eff6ff"] },
];

export type EditTemplateTab = "general" | "organization" | "invoice_meta" | "table" | "footer";

export const STORAGE_KEY = (id: string) => `invoice-tmpl-config-${id}`;

export const MOCK_ITEMS = [
  { name: "Web Development Service", description: "Frontend and Backend", hsn: "998314", qty: 1, rate: 45000, disc: 0, tax: 18, taxAmount: 8100, amount: 53100 },
  { name: "Hosting (Annual)", description: "AWS Cloud Services", hsn: "998315", qty: 1, rate: 5000, disc: 0, tax: 18, taxAmount: 900, amount: 5900 },
];

export const MOCK_INVOICE = {
  invoiceNumber: "INV-240001",
  invoiceDate: "27/05/2026",
  customerName: "Sample Customer Co.",
  customerAddress: "123 Business Park, Mumbai, Maharashtra 400001",
  customerEmail: "contact@sampleco.in",
  subTotal: 50000,
  discountAmount: 0,
  taxAmount: 9000,
  total: 59000,
  notes: "Thanks for your business.",
  terms: "Payment is due within 30 days of the invoice date.",
};
