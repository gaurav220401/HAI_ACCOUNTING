import PDFDocument from "pdfkit";
import * as fs from "fs";

export interface InvoiceItemRow {
  name: string;
  description?: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  amount: number;
}

export interface InvoicePdfData {
  // Organisation
  orgName: string;
  orgAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  orgEmail?: string;
  orgTaxId?: string; // GSTIN / PAN

  // Customer
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;

  // Invoice meta
  invoiceNumber: string;
  invoiceDate: string; // ISO or any Date string
  dueDate?: string;
  paymentTerms?: string;
  orderNumber?: string;
  subject?: string;

  // Line items
  items: InvoiceItemRow[];

  // Totals
  subTotal: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  taxType?: string;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  total: number;
  balanceDue?: number;

  // Footer text
  customerNotes?: string;
  termsAndConditions?: string;

  // Currency symbol
  currencySymbol?: string;
}

export interface PurchaseOrderItemRow {
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface PurchaseOrderPdfData {
  orgName: string;
  orgLogoUrl?: string;
  orgAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  orgTaxId?: string;

  vendorName: string;
  vendorAddress?: string;
  vendorEmail?: string;

  purchaseOrderNumber: string;
  purchaseOrderDate: string;
  deliveryDate?: string;
  referenceNumber?: string;

  items: PurchaseOrderItemRow[];

  subTotal: number;
  discountAmount?: number;
  taxLabel?: string;
  taxAmount?: number;
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  total: number;

  notes?: string;
  termsAndConditions?: string;
  currencySymbol?: string;
  templateConfig?: {
    paperSize?: "A4" | "A5" | "Letter";
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
    backgroundColor?: string;
    fontSize?: number;
    showOrgLogo?: boolean;
    orgLogoSize?: number;
    showOrgName?: boolean;
    showOrgAddress?: boolean;
    showDocTitle?: boolean;
    docTitle?: string;
    docTitleFontSize?: number;
    docTitleFontColor?: string;
    tableHeaderBgColor?: string;
    tableHeaderFontColor?: string;
    oddRowColor?: string;
    evenRowColor?: string;
  };
}

export interface VendorCreditItemRow {
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface VendorCreditPdfData {
  orgName: string;
  orgAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  orgTaxId?: string;

  vendorName: string;
  vendorAddress?: string;
  vendorEmail?: string;

  vendorCreditNumber: string;
  vendorCreditDate: string;
  referenceNumber?: string;

  items: VendorCreditItemRow[];

  subTotal: number;
  discountAmount?: number;
  taxAmount?: number;
  tdsAmount?: number;
  tcsAmount?: number;
  total: number;
  creditsRemaining: number;

  notes?: string;
  termsAndConditions?: string;
  currencySymbol?: string;
}

export interface CreditNoteItemRow {
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface CreditNotePdfData {
  orgName: string;
  orgAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  orgTaxId?: string;

  customerName: string;
  customerAddress?: string;
  customerEmail?: string;

  creditNoteNumber: string;
  creditNoteDate: string;
  referenceNumber?: string;

  items: CreditNoteItemRow[];

  subTotal: number;
  discountAmount?: number;
  taxAmount?: number;
  tdsAmount?: number;
  tcsAmount?: number;
  total: number;
  creditsRemaining: number;

  customerNotes?: string;
  termsAndConditions?: string;
  currencySymbol?: string;
}
// ── System font discovery (needed for ₹ symbol support) ────────────────
const FONT_CANDIDATES: {
  regular: string[];
  bold: string[];
  boldItalic: string[];
} = {
  regular: [
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  ],
  bold: [
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
  ],
  boldItalic: [
    "C:/Windows/Fonts/arialbi.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-BoldItalic.ttf",
  ],
};

function findFont(paths: string[]): string | null {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      continue;
    }
  }
  return null;
}

const _sysRegular = findFont(FONT_CANDIDATES.regular);
const _sysBold = findFont(FONT_CANDIDATES.bold);
const _sysBoldItalic = findFont(FONT_CANDIDATES.boldItalic);

function fmt(n: number, symbol = "₹"): string {
  return (
    symbol +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function fetchImageBuffer(url?: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

/** Convert a number to Indian Rupee words (e.g. 23 → "Indian Rupee Twenty-Three Only") */
function numberToWords(n: number): string {
  if (n === 0) return "Indian Rupee Zero Only";

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  function twoDigits(num: number): string {
    if (num < 20) return ones[num];
    const t = tens[Math.floor(num / 10)];
    const o = ones[num % 10];
    return o ? `${t}-${o}` : t;
  }

  function threeDigits(num: number): string {
    if (num === 0) return "";
    if (num < 100) return twoDigits(num);
    const h = ones[Math.floor(num / 100)] + " Hundred";
    const rest = num % 100;
    return rest ? `${h} ${twoDigits(rest)}` : h;
  }

  const abs = Math.abs(Math.floor(n));
  const paise = Math.round((Math.abs(n) - abs) * 100);

  // Indian numbering: crore, lakh, thousand, hundred
  const crore = Math.floor(abs / 10000000);
  const lakh = Math.floor((abs % 10000000) / 100000);
  const thousand = Math.floor((abs % 100000) / 1000);
  const remainder = abs % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (remainder) parts.push(threeDigits(remainder));

  let result = "Indian Rupee " + parts.join(" ");
  if (paise > 0) {
    result += ` and ${twoDigits(paise)} Paise`;
  }
  result += " Only";
  return result;
}

/**
 * Generate a Tax Invoice PDF and return it as a Buffer.
 */
export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Register system fonts for ₹ support ────────────────────
    let F_REG = "Helvetica";
    let F_BOLD = "Helvetica-Bold";
    let F_BOLDIT = "Helvetica-BoldOblique";
    let canRenderRupee = false;

    if (_sysRegular && _sysBold) {
      doc.registerFont("SysReg", _sysRegular);
      doc.registerFont("SysBold", _sysBold);
      if (_sysBoldItalic) doc.registerFont("SysBoldIt", _sysBoldItalic);
      F_REG = "SysReg";
      F_BOLD = "SysBold";
      F_BOLDIT = _sysBoldItalic ? "SysBoldIt" : "SysBold";
      canRenderRupee = true;
    }

    const sym =
      canRenderRupee ? (data.currencySymbol ?? "₹")
      : data.currencySymbol === "₹" || !data.currencySymbol ? "Rs."
      : data.currencySymbol;

    const pageW = doc.page.width - 100; // content width after margins
    const left = 50;
    const right = left + pageW;
    const pageH = doc.page.height;

    // ── Organisation info (top-left) ───────────────────────────
    let y = 45;
    doc
      .fillColor("#000000")
      .fontSize(14)
      .font(F_BOLD)
      .text(data.orgName, left, y);
    y += 18;

    const orgInfoLines = [
      data.orgAddress?.state,
      data.orgAddress?.country,
      data.orgEmail,
    ].filter(Boolean) as string[];

    doc.font(F_REG).fontSize(9).fillColor("#333333");
    orgInfoLines.forEach((line) => {
      doc.text(line, left, y);
      y += 12;
    });

    // ── "TAX INVOICE" title (top-right) ────────────────────────
    doc
      .fontSize(22)
      .font(F_BOLD)
      .fillColor("#000000")
      .text("TAX INVOICE", left, 50, { align: "right", width: pageW });

    y = Math.max(y, 100) + 10;

    // ── Invoice meta box (bordered) ────────────────────────────
    const metaBoxY = y;
    const metaRows: [string, string][] = [
      ["#", data.invoiceNumber],
      ["Invoice Date", fmtDate(data.invoiceDate)],
    ];
    if (data.paymentTerms) metaRows.push(["Terms", data.paymentTerms]);
    if (data.dueDate) metaRows.push(["Due Date", fmtDate(data.dueDate)]);
    if (data.orderNumber) metaRows.push(["Order No", data.orderNumber]);

    const metaRowH = 15;
    const metaBoxH = metaRows.length * metaRowH + 10;
    const metaBoxW = pageW * 0.55;

    doc
      .rect(left, metaBoxY, metaBoxW, metaBoxH)
      .strokeColor("#999999")
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(9).fillColor("#000000");
    metaRows.forEach(([label, value], i) => {
      const rowY = metaBoxY + 5 + i * metaRowH;
      doc.font(F_REG).text(label, left + 8, rowY, { width: 100 });
      doc
        .font(F_BOLD)
        .text(`: ${value}`, left + 100, rowY, { width: metaBoxW - 115 });
    });

    y = metaBoxY + metaBoxH + 16;

    // ── Bill To ────────────────────────────────────────────────
    doc.font(F_BOLD).fontSize(9).fillColor("#000000").text("Bill To", left, y);
    y += 13;

    // full-width underline
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke();
    y += 6;

    doc.font(F_BOLD).fontSize(10).fillColor("#000000");
    doc.text(data.customerName, left, y);
    y += 14;

    const custLines = [data.customerAddress, data.customerEmail].filter(
      Boolean,
    ) as string[];
    if (custLines.length) {
      doc.font(F_REG).fontSize(9).fillColor("#333333");
      custLines.forEach((line) => {
        doc.text(line, left, y, { width: pageW });
        y += 12;
      });
    }

    y += 10;

    // ── Items table ────────────────────────────────────────────
    const colNum = left;
    const colItem = left + 30;
    const colQty = left + pageW - 180;
    const colRate = left + pageW - 110;
    const colAmt = left + pageW - 50;
    const rowH = 18;

    // Header row with top & bottom border
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor("#000000")
      .lineWidth(0.5)
      .stroke();

    doc
      .fillColor("#000000")
      .font(F_BOLD)
      .fontSize(8.5)
      .text("#", colNum + 4, y + 5, { width: 25 })
      .text("Item & Description", colItem, y + 5, {
        width: colQty - colItem - 5,
      })
      .text("Qty", colQty, y + 5, { width: 60, align: "right" })
      .text("Rate", colRate, y + 5, { width: 55, align: "right" })
      .text("Amount", colAmt, y + 5, {
        width: pageW - (colAmt - left),
        align: "right",
      });

    y += rowH;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .strokeColor("#000000")
      .lineWidth(0.5)
      .stroke();

    // Data rows
    doc.font(F_REG).fontSize(9);
    data.items.forEach((item, idx) => {
      y += 4;
      const textY = y;
      doc
        .fillColor("#000000")
        .font(F_REG)
        .fontSize(9)
        .text(String(idx + 1), colNum + 4, textY, { width: 25 })
        .text(item.name, colItem, textY, { width: colQty - colItem - 5 });

      doc
        .text(fmtNum(item.quantity), colQty, textY, {
          width: 60,
          align: "right",
        })
        .text(fmtNum(item.rate), colRate, textY, {
          width: 55,
          align: "right",
        })
        .text(fmtNum(item.amount), colAmt, textY, {
          width: pageW - (colAmt - left),
          align: "right",
        });

      y += rowH;

      // row bottom border
      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .strokeColor("#e0e0e0")
        .lineWidth(0.3)
        .stroke();
    });

    y += 8;

    // ── Total In Words + Totals (side by side) ─────────────────
    const totalWords = numberToWords(data.total);
    const dividerX = left + pageW * 0.52;
    const totalsX = dividerX + 10;
    const totalsLabelW = 80;
    const totalsValueW = right - totalsX - totalsLabelW - 5;
    const wordsX = left;
    const wordsW = dividerX - left - 10;

    const sectionStartY = y;
    const lineItemDiscountAmount = data.items.reduce(
      (sum, item) => sum + (Number(item.discountAmount) || 0),
      0,
    );
    const lineItemTaxAmount = data.items.reduce(
      (sum, item) => sum + (Number(item.taxAmount) || 0),
      0,
    );

    // Total in words - left side
    doc
      .font(F_BOLD)
      .fontSize(8.5)
      .fillColor("#000000")
      .text("Total In Words", wordsX, y);
    y += 13;
    const wordsY = y;
    doc
      .font(F_BOLDIT)
      .fontSize(8.5)
      .fillColor("#000000")
      .text(totalWords, wordsX, y, { width: wordsW });
    const wordsH = doc.heightOfString(totalWords, { width: wordsW });

    // Totals - right side
    let totY = sectionStartY;

    const addTotalRow = (label: string, value: string, bold = false) => {
      doc
        .font(bold ? F_BOLD : F_REG)
        .fontSize(9)
        .fillColor("#000000");
      doc.text(label, totalsX, totY, { width: totalsLabelW, align: "right" });
      doc.text(value, totalsX + totalsLabelW + 5, totY, {
        width: totalsValueW,
        align: "right",
      });
      totY += 15;
    };

    addTotalRow("Sub Total", fmtNum(data.subTotal));
    if (lineItemDiscountAmount > 0) {
      addTotalRow("Line Item Discount", `- ${fmtNum(lineItemDiscountAmount)}`);
    }
    if (lineItemTaxAmount > 0) {
      addTotalRow("Line Item Tax", `+ ${fmtNum(lineItemTaxAmount)}`);
    }
    if (data.discountAmount && data.discountAmount !== 0) {
      const discLabel =
        data.discountType === "percent" ?
          `Discount (${data.discountValue}%)`
        : "Discount";
      addTotalRow(discLabel, `- ${fmtNum(data.discountAmount)}`);
    }
    if (data.taxAmount && data.taxAmount !== 0) {
      const taxLabel =
        data.taxType && data.taxType !== "none" ? data.taxType : "Tax";
      const prefix = data.taxType === "TDS" ? "- " : "+ ";
      addTotalRow(taxLabel, `${prefix}${fmtNum(data.taxAmount)}`);
    }
    if (data.adjustmentAmount && data.adjustmentAmount !== 0) {
      addTotalRow(
        data.adjustmentLabel || "Adjustment",
        fmtNum(data.adjustmentAmount),
      );
    }
    addTotalRow("Total", fmt(data.total, sym), true);
    addTotalRow("Balance Due", fmt(data.balanceDue ?? data.total, sym), true);

    const sectionEndY = Math.max(wordsY + wordsH + 5, totY);

    // Vertical divider between words and totals
    doc
      .moveTo(dividerX, sectionStartY)
      .lineTo(dividerX, sectionEndY)
      .strokeColor("#cccccc")
      .lineWidth(0.5)
      .stroke();

    y = sectionEndY + 16;

    // ── Notes ──────────────────────────────────────────────────
    if (data.customerNotes) {
      doc.font(F_BOLD).fontSize(9).fillColor("#000000").text("Notes", left, y);
      y += 13;
      doc
        .font(F_REG)
        .fontSize(9)
        .fillColor("#333333")
        .text(data.customerNotes, left, y, { width: pageW });
      y += doc.heightOfString(data.customerNotes, { width: pageW }) + 10;
    }

    if (data.termsAndConditions) {
      doc
        .font(F_BOLD)
        .fontSize(9)
        .fillColor("#000000")
        .text("Terms & Conditions", left, y);
      y += 13;
      doc
        .font(F_REG)
        .fontSize(9)
        .fillColor("#333333")
        .text(data.termsAndConditions, left, y, { width: pageW });
      y += doc.heightOfString(data.termsAndConditions, { width: pageW }) + 10;
    }

    // ── Authorized Signature (bottom-right) ────────────────────
    const sigY = Math.max(y + 40, pageH - 120);
    doc
      .moveTo(right - 160, sigY)
      .lineTo(right, sigY)
      .strokeColor("#000000")
      .lineWidth(0.5)
      .stroke();
    doc
      .font(F_REG)
      .fontSize(9)
      .fillColor("#000000")
      .text("Authorized Signature", right - 160, sigY + 5, {
        width: 160,
        align: "center",
      });

    doc.end();
  });
}

export function generatePurchaseOrderPdf(
  data: PurchaseOrderPdfData,
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const cfg = data.templateConfig || {};
      const paperSize =
        cfg.paperSize === "A5" ? "A5"
        : cfg.paperSize === "Letter" ? "LETTER"
        : "A4";
      const pt = 72;
      const marginTop = Math.max(28, Math.min(100, Math.round((cfg.margins?.top ?? 0.83) * pt)));
      const marginBottom = Math.max(28, Math.min(100, Math.round((cfg.margins?.bottom ?? 0.83) * pt)));
      const marginLeft = Math.max(28, Math.min(100, Math.round((cfg.margins?.left ?? 0.83) * pt)));
      const marginRight = Math.max(28, Math.min(100, Math.round((cfg.margins?.right ?? 0.83) * pt)));

      const doc = new PDFDocument({
        size: paperSize,
        margins: { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginRight },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const leftMargin = marginLeft;
      const topMargin = marginTop;
      const pageW = doc.page.width - marginLeft - marginRight;
      const sym = data.currencySymbol ?? "₹";
      const pickColor = (value: string | undefined, fallback: string) =>
        typeof value === "string" && value.trim() ? value : fallback;
      const titleColor = pickColor(cfg.docTitleFontColor, "#1e3a5f");
      const tableHeaderBgColor = pickColor(cfg.tableHeaderBgColor, "#3a3a3a");
      const tableHeaderFontColor = pickColor(cfg.tableHeaderFontColor, "#ffffff");
      const oddRowColor = pickColor(cfg.oddRowColor, "#ffffff");
      const evenRowColor = pickColor(cfg.evenRowColor, "#f6f5f5");

      const bgColor = pickColor(cfg.backgroundColor, "#ffffff");
      if (bgColor !== "#ffffff") {
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgColor);
      }

      const logoBuffer =
        cfg.showOrgLogo === false ? null : await fetchImageBuffer(data.orgLogoUrl);

    let orgAddressCity = "";
    if (data.orgAddress) {
      if (typeof data.orgAddress === "string") {
        orgAddressCity = data.orgAddress;
      } else if (data.orgAddress.city) {
        orgAddressCity = data.orgAddress.city;
      }
    }

    // Top block
    let orgTextX = leftMargin;
    if (logoBuffer) {
      const logoH = Math.max(36, Math.min(92, Number(cfg.orgLogoSize ?? 60)));
      const logoW = logoH * 1.9;
      try {
        doc.image(logoBuffer, leftMargin, topMargin - 2, { fit: [logoW, logoH] });
        orgTextX = leftMargin + logoW + 12;
      } catch {
        orgTextX = leftMargin;
      }
    }

    if (cfg.showOrgName !== false) {
      doc.font("Times-Bold").fontSize(13).fillColor("#000000").text(data.orgName, orgTextX, topMargin);
    }

    let yOrg = topMargin + 18;
    doc.font("Times-Roman").fontSize(10).fillColor("#4b5563");
    if (cfg.showOrgAddress !== false) {
      if (orgAddressCity) {
        doc.text(orgAddressCity, orgTextX, yOrg);
        yOrg += 14;
      }
      doc.text("India", orgTextX, yOrg);
      yOrg += 14;
    }
    // Add orgEmail / orgPhone if they exist but we only have standard data here

    // Title Block
    const titleText =
      cfg.showDocTitle === false
        ? "PURCHASE ORDER"
        : (cfg.docTitle && cfg.docTitle.trim() ? cfg.docTitle.toUpperCase() : "PURCHASE ORDER");
    const titleFontSize =
      typeof cfg.docTitleFontSize === "number"
        ? Math.max(16, Math.min(30, cfg.docTitleFontSize + 6))
        : 24;
    doc
      .font("Times-Bold")
      .fontSize(titleFontSize)
      .fillColor(titleColor)
      .text(titleText, leftMargin, topMargin, { width: pageW, align: "right" });
    doc
      .font("Times-Roman")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`# ${data.purchaseOrderNumber}`, leftMargin, topMargin + 25, {
        width: pageW,
        align: "right",
      });

    // Address Headings
    let yAddresses = Math.max(yOrg, topMargin + 50) + 30;

    doc.font("Times-Roman").fontSize(9).fillColor("#6b7280");
    doc.text("Vendor Address", leftMargin, yAddresses);
    doc.text("Deliver To", leftMargin + 240, yAddresses);
    yAddresses += 14;

    // Vendor and Deliver To info
    doc
      .font("Times-Bold")
      .fontSize(11)
      .fillColor("#2563eb")
      .text(data.vendorName, leftMargin, yAddresses, { width: 220 });

    let yVend =
      yAddresses + doc.heightOfString(data.vendorName, { width: 220 }) + 5;

    let yDeliv = yAddresses;
    doc.font("Times-Roman").fontSize(10).fillColor("#4b5563");
    doc.text(data.orgName, leftMargin + 240, yDeliv);
    yDeliv += 13;
    if (orgAddressCity) {
      doc.text(orgAddressCity, leftMargin + 240, yDeliv);
      yDeliv += 13;
    }
    doc.text("India", leftMargin + 240, yDeliv);
    yDeliv += 13;

    let yNext = Math.max(yVend, yDeliv) + 25;

    // Date & Meta
    doc
      .font("Times-Roman")
      .fontSize(10)
      .fillColor("#4b5563")
      .text(`Date : ${fmtDate(data.purchaseOrderDate)}`, leftMargin, yNext, {
        width: pageW,
        align: "right",
      });
    if (data.deliveryDate) {
      yNext += 13;
      doc.text(`Expected Delivery : ${fmtDate(data.deliveryDate)}`, leftMargin, yNext, {
        width: pageW,
        align: "right",
      });
    }
    yNext += 20;

    // Items table header
    doc.rect(leftMargin, yNext, pageW, 25).fill(tableHeaderBgColor);
    const colHash = leftMargin;
    const colItem = leftMargin + 40;
    const colQty = leftMargin + 280;
    const colRate = leftMargin + 330;
    const colAmt = leftMargin + 400;

    doc.fillColor(tableHeaderFontColor).font("Times-Bold").fontSize(10);
    const thY = yNext + 7;
    doc.text("#", colHash + 10, thY);
    doc.text("Item & Description", colItem, thY);
    doc.text("Qty", colQty, thY, { width: 45, align: "right" });
    doc.text("Rate", colRate, thY, { width: 60, align: "right" });
    // Adjust amount column to span accurately
    doc.text("Amount", colAmt, thY, {
      width: 60 + pageW - colAmt - 10,
      align: "right",
    });
    yNext += 25;

    // Items table rows
    data.items.forEach((item, idx) => {
      const lineH = item.description ? 35 : 22;
      const textY = yNext + 6;
      const rowColor = idx % 2 === 0 ? evenRowColor : oddRowColor;
      doc.rect(leftMargin, yNext, pageW, lineH).fill(rowColor);
      doc.fillColor("#111827");
      doc
        .font("Times-Roman")
        .fontSize(10)
        .text(String(idx + 1), colHash + 10, textY);
      doc.font("Times-Bold").text(item.name, colItem, textY, { width: 230 });
      if (item.description) {
        doc
          .font("Times-Roman")
          .fillColor("#6b7280")
          .fontSize(9)
          .text(item.description, colItem, textY + 14, { width: 230 });
      }
      doc.font("Times-Roman").fontSize(10).fillColor("#111827");
      doc.text(item.quantity.toFixed(2), colQty, textY, {
        width: 45,
        align: "right",
      });
      doc.text(item.rate.toFixed(2), colRate, textY, {
        width: 60,
        align: "right",
      });
      doc.text(item.amount.toFixed(2), colAmt, textY, {
        width: 60 + pageW - colAmt - 10,
        align: "right",
      });

      yNext += lineH;
      doc
        .moveTo(leftMargin, yNext)
        .lineTo(leftMargin + pageW, yNext)
        .lineWidth(0.5)
        .strokeColor("#e5e7eb")
        .stroke();
    });

    yNext += 20;

    // Totals
    const totLabelX = 350;
    const totValX = 450;
    const totValW = 60 + pageW - totValX - 10;

    const addTotal = (lbl: string, val: string, bold = false) => {
      doc
        .font(bold ? "Times-Bold" : "Times-Roman")
        .fontSize(10)
        .fillColor(bold ? "#111827" : "#4b5563");
      doc.text(lbl, totLabelX, yNext, { width: 90 });
      doc.text(val, totValX, yNext, { width: totValW, align: "right" });
      yNext += 16;
    };

    addTotal("Sub Total", data.subTotal.toFixed(2));
    if (data.discountAmount && data.discountAmount > 0) {
      addTotal("Discount", `-${data.discountAmount.toFixed(2)}`);
    }
    if (data.taxAmount && data.taxAmount > 0) {
      addTotal(data.taxLabel || "Tax", `${data.taxAmount.toFixed(2)}`);
    }
    if (data.adjustmentAmount && data.adjustmentAmount !== 0) {
      addTotal(
        data.adjustmentLabel || "Adjustment",
        `${data.adjustmentAmount.toFixed(2)}`,
      );
    }

    doc
      .moveTo(totLabelX, yNext - 4)
      .lineTo(leftMargin + pageW, yNext - 4)
      .lineWidth(0.5)
      .strokeColor("#e5e7eb")
      .stroke();
    yNext += 4;
    addTotal("Total", `${sym}${data.total.toFixed(2)}`, true);

    if (data.notes) {
      yNext += 20;
      doc
        .font("Times-Bold")
        .fontSize(10)
        .fillColor("#111827")
        .text("Notes", leftMargin, yNext);
      yNext += 15;
      doc
        .font("Times-Roman")
        .fontSize(10)
        .fillColor("#4b5563")
        .text(data.notes, leftMargin, yNext, { width: pageW });
      yNext += doc.heightOfString(data.notes, { width: pageW }) + 10;
    }

    yNext += 40;
    if (yNext > doc.page.height - 100) {
      doc.addPage();
      yNext = topMargin;
    }
    doc
      .font("Times-Roman")
      .fontSize(10)
      .fillColor("#4b5563")
      .text("Authorized Signature ____________________________", leftMargin, yNext);

    doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function generateVendorCreditPdf(
  data: VendorCreditPdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 36;
    const right = 36;
    const pageW = doc.page.width - left - right;
    const sym = data.currencySymbol ?? "₹";
    const orgLines = [
      data.orgAddress?.city && data.orgAddress?.state
        ? `${data.orgAddress.city}, ${data.orgAddress.state}`
        : data.orgAddress?.city || data.orgAddress?.state,
      data.orgAddress?.zip,
      data.orgAddress?.street,
      data.orgAddress?.country || "India",
    ].filter(Boolean) as string[];

    let yLeft = 56;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(data.orgName, left, yLeft);
    yLeft += 18;

    doc.font("Helvetica").fontSize(9.5).fillColor("#4b5563");
    orgLines.forEach((line) => {
      doc.text(line, left, yLeft, { width: pageW * 0.5 });
      yLeft += 14;
    });
    if (data.orgTaxId) {
      doc.text(`Tax ID: ${data.orgTaxId}`, left, yLeft, { width: pageW * 0.5 });
      yLeft += 14;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#1f4d7e")
      .text("VENDOR CREDITS", left, 56, { width: pageW, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`Credit Note#: ${data.vendorCreditNumber}`, left, 84, {
        width: pageW,
        align: "right",
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .fillColor("#111827")
      .text(`Credits Remaining  ${fmt(data.creditsRemaining, sym)}`, left, 102, {
        width: pageW,
        align: "right",
      });

    let y = Math.max(yLeft, 126) + 14;

    doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Vendor Address", left, y);
    y += 16;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#2563eb").text(data.vendorName, left, y, { width: pageW * 0.56 });
    y += 18;

    const vendorLines = (data.vendorAddress || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    doc.font("Helvetica").fontSize(10).fillColor("#4b5563");
    if (vendorLines.length > 0) {
      vendorLines.forEach((line) => {
        doc.text(line, left, y, { width: pageW * 0.56 });
        y += 14;
      });
    } else {
      doc.text("Address not available", left, y, { width: pageW * 0.56 });
      y += 14;
    }

    const yMeta = Math.max(y - 28, 180);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`Date: ${fmtDate(data.vendorCreditDate)}`, left, yMeta, { width: pageW, align: "right" })
      .text(`Reference: ${data.referenceNumber || "-"}`, left, yMeta + 22, { width: pageW, align: "right" });

    y = yMeta + 46;
    doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(1).strokeColor("#d1d5db").stroke();
    y += 10;

    const headerBg = "#3c3d3a";
    doc.rect(left, y, pageW, 22).fill(headerBg);

    const colHash = left + 8;
    const colItem = left + 36;
    const colQty = left + pageW * 0.56;
    const colRate = left + pageW * 0.69;
    const colAmt = left + pageW * 0.82;

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
    doc.text("#", colHash, y + 6, { width: 16 });
    doc.text("Item & Description", colItem, y + 6, { width: 220 });
    doc.text("Qty", colQty, y + 6, { width: 60, align: "right" });
    doc.text("Rate", colRate, y + 6, { width: 70, align: "right" });
    doc.text("Amount", colAmt, y + 6, { width: left + pageW - colAmt - 8, align: "right" });
    y += 22;

    doc.font("Helvetica").fontSize(10).fillColor("#111827");
    data.items.forEach((item, idx) => {
      const hasDesc = !!(item.description && item.description.trim());
      const rowH = hasDesc ? 32 : 20;
      const rowBg = idx % 2 === 0 ? "#f9fafb" : "#ffffff";

      doc.rect(left, y, pageW, rowH).fill(rowBg);
      doc.fillColor("#111827");
      doc.text(String(idx + 1), colHash, y + 6, { width: 16 });
      doc.font("Helvetica").text(item.name || "Item", colItem, y + 6, { width: 220 });
      if (hasDesc) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#6b7280")
          .text(item.description || "", colItem, y + 18, { width: 220 })
          .fontSize(10)
          .fillColor("#111827");
      }

      doc.text(item.quantity.toFixed(2), colQty, y + 6, { width: 60, align: "right" });
      doc.text(fmt(item.rate, sym), colRate, y + 6, { width: 70, align: "right" });
      doc.text(fmt(item.amount, sym), colAmt, y + 6, { width: left + pageW - colAmt - 8, align: "right" });

      y += rowH;
      doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
    });

    y += 14;
    const totalLabelX = left + pageW - 190;
    const totalValX = left + pageW - 90;
    const totalValW = 90;

    const addTotalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(11);
      doc.fillColor(bold ? "#111827" : "#4b5563").text(label, totalLabelX, y, { width: 96 });
      doc.fillColor("#111827").text(value, totalValX, y, { width: totalValW, align: "right" });
      y += 18;
    };

    addTotalRow("Sub Total", fmt(data.subTotal, sym));
    if ((data.discountAmount || 0) > 0) addTotalRow("Discount", `-${fmt(data.discountAmount || 0, sym)}`);
    if ((data.taxAmount || 0) > 0) addTotalRow("Tax", fmt(data.taxAmount || 0, sym));
    if ((data.tdsAmount || 0) > 0) addTotalRow("TDS", `-${fmt(data.tdsAmount || 0, sym)}`);
    if ((data.tcsAmount || 0) > 0) addTotalRow("TCS", fmt(data.tcsAmount || 0, sym));
    addTotalRow("Total", fmt(data.total, sym), true);
    addTotalRow("Credits Remaining", fmt(data.creditsRemaining, sym), true);

    const sigY = Math.max(y + 30, doc.page.height - 90);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text("Authorized Signature ____________________________", left, sigY);

    doc.end();
  });
}

export function generateCreditNotePdf(
  data: CreditNotePdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 36;
    const right = 36;
    const pageW = doc.page.width - left - right;
    const sym = data.currencySymbol ?? "₹";

    const orgLines = [
      data.orgAddress?.city && data.orgAddress?.state
        ? `${data.orgAddress.city}, ${data.orgAddress.state}`
        : data.orgAddress?.city || data.orgAddress?.state,
      data.orgAddress?.zip,
      data.orgAddress?.street,
      data.orgAddress?.country || "India",
    ].filter(Boolean) as string[];

    let yLeft = 56;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text(data.orgName, left, yLeft);
    yLeft += 18;

    doc.font("Helvetica").fontSize(9.5).fillColor("#4b5563");
    orgLines.forEach((line) => {
      doc.text(line, left, yLeft, { width: pageW * 0.5 });
      yLeft += 14;
    });
    if (data.orgTaxId) {
      doc.text(`Tax ID: ${data.orgTaxId}`, left, yLeft, { width: pageW * 0.5 });
      yLeft += 14;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#1f4d7e")
      .text("CREDIT NOTE", left, 56, { width: pageW, align: "right" });
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`Credit Note#: ${data.creditNoteNumber}`, left, 84, {
        width: pageW,
        align: "right",
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .fillColor("#111827")
      .text(`Credits Remaining  ${fmt(data.creditsRemaining, sym)}`, left, 102, {
        width: pageW,
        align: "right",
      });

    let y = Math.max(yLeft, 126) + 14;

    doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Customer", left, y);
    y += 16;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#2563eb").text(data.customerName, left, y, { width: pageW * 0.56 });
    y += 18;

    const customerLines = (data.customerAddress || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    doc.font("Helvetica").fontSize(10).fillColor("#4b5563");
    if (customerLines.length > 0) {
      customerLines.forEach((line) => {
        doc.text(line, left, y, { width: pageW * 0.56 });
        y += 14;
      });
    } else {
      doc.text("Address not available", left, y, { width: pageW * 0.56 });
      y += 14;
    }

    const yMeta = Math.max(y - 28, 180);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`Date: ${fmtDate(data.creditNoteDate)}`, left, yMeta, { width: pageW, align: "right" })
      .text(`Reference: ${data.referenceNumber || "-"}`, left, yMeta + 22, { width: pageW, align: "right" });

    y = yMeta + 46;
    doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(1).strokeColor("#d1d5db").stroke();
    y += 10;

    const headerBg = "#3c3d3a";
    doc.rect(left, y, pageW, 22).fill(headerBg);

    const colHash = left + 8;
    const colItem = left + 36;
    const colQty = left + pageW * 0.56;
    const colRate = left + pageW * 0.69;
    const colAmt = left + pageW * 0.82;

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(10);
    doc.text("#", colHash, y + 6, { width: 16 });
    doc.text("Item & Description", colItem, y + 6, { width: 220 });
    doc.text("Qty", colQty, y + 6, { width: 60, align: "right" });
    doc.text("Rate", colRate, y + 6, { width: 70, align: "right" });
    doc.text("Amount", colAmt, y + 6, { width: left + pageW - colAmt - 8, align: "right" });
    y += 22;

    doc.font("Helvetica").fontSize(10).fillColor("#111827");
    data.items.forEach((item, idx) => {
      const hasDesc = !!(item.description && item.description.trim());
      const rowH = hasDesc ? 32 : 20;
      const rowBg = idx % 2 === 0 ? "#f9fafb" : "#ffffff";

      doc.rect(left, y, pageW, rowH).fill(rowBg);
      doc.fillColor("#111827");
      doc.text(String(idx + 1), colHash, y + 6, { width: 16 });
      doc.font("Helvetica").text(item.name || "Item", colItem, y + 6, { width: 220 });
      if (hasDesc) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#6b7280")
          .text(item.description || "", colItem, y + 18, { width: 220 })
          .fontSize(10)
          .fillColor("#111827");
      }

      doc.text(item.quantity.toFixed(2), colQty, y + 6, { width: 60, align: "right" });
      doc.text(fmt(item.rate, sym), colRate, y + 6, { width: 70, align: "right" });
      doc.text(fmt(item.amount, sym), colAmt, y + 6, { width: left + pageW - colAmt - 8, align: "right" });

      y += rowH;
      doc.moveTo(left, y).lineTo(left + pageW, y).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
    });

    y += 14;
    const totalLabelX = left + pageW - 190;
    const totalValX = left + pageW - 90;
    const totalValW = 90;

    const addTotalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(11);
      doc.fillColor(bold ? "#111827" : "#4b5563").text(label, totalLabelX, y, { width: 96 });
      doc.fillColor("#111827").text(value, totalValX, y, { width: totalValW, align: "right" });
      y += 18;
    };

    addTotalRow("Sub Total", fmt(data.subTotal, sym));
    if ((data.discountAmount || 0) > 0) addTotalRow("Discount", `-${fmt(data.discountAmount || 0, sym)}`);
    if ((data.taxAmount || 0) > 0) addTotalRow("Tax", fmt(data.taxAmount || 0, sym));
    if ((data.tdsAmount || 0) > 0) addTotalRow("TDS", `-${fmt(data.tdsAmount || 0, sym)}`);
    if ((data.tcsAmount || 0) > 0) addTotalRow("TCS", fmt(data.tcsAmount || 0, sym));
    addTotalRow("Total", fmt(data.total, sym), true);
    addTotalRow("Credits Remaining", fmt(data.creditsRemaining, sym), true);

    if (data.customerNotes) {
      y += 10;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Customer Notes", left, y);
      y += 14;
      doc.font("Helvetica").fontSize(10).fillColor("#4b5563").text(data.customerNotes, left, y, { width: pageW });
      y += doc.heightOfString(data.customerNotes, { width: pageW }) + 10;
    }

    if (data.termsAndConditions) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text("Terms & Conditions", left, y);
      y += 14;
      doc.font("Helvetica").fontSize(10).fillColor("#4b5563").text(data.termsAndConditions, left, y, { width: pageW });
      y += doc.heightOfString(data.termsAndConditions, { width: pageW }) + 10;
    }

    const sigY = Math.max(y + 20, doc.page.height - 90);
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#4b5563")
      .text("Authorized Signature ____________________________", left, sigY);

    doc.end();
  });
}

/**
 * Generate a Sales Order PDF and return it as a Buffer.
 * Uses a simplified version of the invoice PDF layout.
 */
export function generateSalesOrderPdf(params: {
  order: any;
  organization: any;
}): Promise<Buffer> {
  const { order, organization } = params;

  const data: InvoicePdfData = {
    orgName: organization?.name || "HAI",
    orgAddress: organization?.address || {},
    orgEmail: organization?.email || "",
    orgTaxId: organization?.gstin || "",
    customerName:
      typeof order.customerId === "object"
        ? order.customerId?.displayName || order.customerId?.companyName || ""
        : "",
    invoiceNumber: order.salesOrderNumber || "",
    invoiceDate: order.orderDate
      ? new Date(order.orderDate).toISOString()
      : new Date().toISOString(),
    items: (order.lineItems || []).map((li: any) => {
      const itemRef = typeof li.itemId === "object" ? li.itemId : null;
      return {
        name: itemRef?.name || li.name || li.description || "Item",
        description: li.description || "",
        hsnSacCode: itemRef?.hsnSacCode || li.hsnSacCode || "",
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
        amount: Number(li.amount) || 0,
      };
    }),
    subTotal: Number(order.subTotal) || 0,
    adjustmentLabel: "Shipping & Adjustment",
    adjustmentAmount:
      (Number(order.shippingCharges) || 0) + (Number(order.adjustment) || 0),
    total: Number(order.total) || 0,
    balanceDue: Number(order.total) || 0,
    customerNotes: order.notes || "",
    termsAndConditions: order.terms || "",
  };

  // Reuse the invoice PDF generator with "SALES ORDER" title
  // For now, just generate with the existing invoice format
  return generateInvoicePdf(data);
}
