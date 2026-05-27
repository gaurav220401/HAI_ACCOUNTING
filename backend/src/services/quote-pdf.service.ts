import PDFDocument from "pdfkit";
import * as fs from "fs";

export interface QuoteItemRow {
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

export interface QuotePdfData {
  orgName: string;
  orgAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  orgEmail?: string;
  orgTaxId?: string; // GSTIN
  orgLogoUrl?: string; // Dynamic user logo
  orgPhone?: string;
  templateConfig?: Record<string, any>;

  customerName: string;
  customerAddress?: string;
  customerEmail?: string;

  quoteNumber: string;
  quoteDate: string;
  expiryDate?: string;
  salesPersonName?: string;
  subject?: string;
  placeOfSupply?: string;

  items: QuoteItemRow[];

  subTotal: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  taxType?: string;
  taxAmount?: number; // Header/Extra tax like TDS/TCS
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  total: number;

  customerNotes?: string;
  termsAndConditions?: string;
  currencySymbol?: string;
  isIntraState?: boolean; 
}

// ── System font discovery ────────────────
const FONT_CANDIDATES = {
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

function numberToWords(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", 
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen ",
  ];
  const b = ["", "", "Twenty ", "Thirty ", "Forty ", "Fifty ", "Sixty ", "Seventy ", "Eighty ", "Ninety "];

  function inWords(n: number) {
    const s = n.toString();
    if (s.length > 9) return "overflow";
    const match = ("000000000" + s).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
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

// ── Watermark helper ────────────────
function drawWatermark(doc: PDFKit.PDFDocument, F_BOLD: string, orgName?: string) {
  const text = (orgName || "").trim();
  if (!text) return;

  doc.save();
  doc.translate(595 / 2, 842 / 2);
  doc.opacity(0.035); // Light watermark exactly like image

  doc.font(F_BOLD).fontSize(26).fillColor("#0f172a");
  doc.text(text.toUpperCase(), -250, 40, { width: 500, align: "center" });
  doc.restore();
}

// ── Header helper ──────────────────
function drawHeader(
  doc: PDFKit.PDFDocument, 
  pageNum: number, 
  totalPages: number, 
  data: QuotePdfData, 
  F_REG: string, 
  F_BOLD: string,
  logoBuffer: Buffer | null,
  cfg: Record<string, any>
) {
  doc.save();

  const headerBgEnabled = cfg.headerBgColorEnabled === true;
  const headerBgColor = typeof cfg.headerBgColor === "string" && cfg.headerBgColor.trim() ? cfg.headerBgColor : "#ffffff";
  const headerTextColor = typeof cfg.headerTextColor === "string" && cfg.headerTextColor.trim() ? cfg.headerTextColor : "#1e293b";
  const headerFontSize = Math.max(6, Math.min(12, Number(cfg.headerFontSize) || 7.5));
  const headerDividerColor = typeof cfg.headerDividerColor === "string" && cfg.headerDividerColor.trim() ? cfg.headerDividerColor : "#f59e0b";
  const showHeaderDivider = cfg.showHeaderDivider !== false;
  if (headerBgEnabled) {
    doc.rect(45, 18, 505, 64).fill(headerBgColor);
  }
  
  // Resolve overrides
  const displayOrgName = typeof cfg.orgNameOverride === "string" && cfg.orgNameOverride.trim()
    ? cfg.orgNameOverride.trim()
    : (data.orgName || "");
    
  const displayGstin = typeof cfg.gstinValueOverride === "string" && cfg.gstinValueOverride.trim()
    ? cfg.gstinValueOverride.trim()
    : (data.orgTaxId || "");
    
  const displayContact = typeof cfg.contactValueOverride === "string" && cfg.contactValueOverride.trim()
    ? cfg.contactValueOverride.trim()
    : (data.orgPhone || "");
    
  const displayEmail = typeof cfg.emailValueOverride === "string" && cfg.emailValueOverride.trim()
    ? cfg.emailValueOverride.trim()
    : (data.orgEmail || "");
    
  let factory = "";
  if (typeof cfg.factoryValueOverride === "string" && cfg.factoryValueOverride.trim()) {
    factory = cfg.factoryValueOverride.trim();
  } else if (cfg.showOrgAddress !== false && data.orgAddress) {
    const addr = data.orgAddress;
    const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
    if (parts.length > 0) factory = parts.join(", ");
  }

  // Draw Logo (Left side)
  const logoX = 45;
  const logoY = 20;
  const showOrgLogo = cfg.showOrgLogo !== false;
  const showOrgName = cfg.showOrgName !== false;
  const orgNameColor = typeof cfg.orgNameColor === "string" && cfg.orgNameColor.trim() ? cfg.orgNameColor : "#1e293b";
  const orgNameFontSize = Math.max(7, Math.min(16, Number(cfg.orgNameFontSize) || 7.5));
  let logoRendered = false;
  if (logoBuffer) {
    try {
      const logoH = Math.max(30, Math.min(80, Number(cfg.orgLogoSize) || 40));
      const logoW = logoH * 1.9;
      if (showOrgLogo) {
        doc.image(logoBuffer, logoX, logoY, { fit: [logoW, logoH] });
        logoRendered = true;
      }
    } catch {
      logoRendered = false;
    }
  }

  if (showOrgName && displayOrgName) {
    const nameY = logoRendered ? logoY + 42 : logoY + 2;
    doc.font(F_BOLD).fontSize(orgNameFontSize).fillColor(orgNameColor);
    doc.text(displayOrgName.toUpperCase(), logoX, nameY, { width: 145, align: "left" });
  }
  
  // Right side corporate details
  const rightX = 300;
  const rightY = 20;
  const rightW = 250;
  const labelW = 55;
  
  doc.fontSize(headerFontSize).fillColor(headerTextColor);
  
  const drawHeaderLine = (label: string, value: string, isLink: boolean, ly: number) => {
    doc.font(F_BOLD).text(label, rightX, ly, { width: labelW, align: "left" });
    doc.font(F_REG);
    if (isLink) {
      doc.fillColor("#0284c7").text(value, rightX + labelW, ly, { underline: true }).fillColor(headerTextColor);
    } else {
      doc.text(value, rightX + labelW, ly, { width: rightW - labelW, align: "left" });
    }
  };

  const labelWithColon = (label: string, fallback: string) => {
    const raw = typeof label === "string" && label.trim() ? label.trim() : fallback;
    return raw.endsWith(":") ? `${raw} ` : `${raw}: `;
  };

  const headerLines: Array<{ label: string; value: string; isLink: boolean }> = [];
  if (cfg.showGstin !== false && displayGstin) {
    headerLines.push({ label: labelWithColon(cfg.gstinLabel, "GSTIN"), value: displayGstin, isLink: false });
  }
  if (cfg.showContact !== false && displayContact) {
    headerLines.push({ label: labelWithColon(cfg.contactLabel, "Contact"), value: displayContact, isLink: false });
  }
  if (cfg.showEmail !== false && displayEmail) {
    headerLines.push({ label: labelWithColon(cfg.emailLabel, "Email"), value: displayEmail, isLink: true });
  }
  if (cfg.showOrgAddress !== false && factory) {
    headerLines.push({ label: labelWithColon(cfg.factoryLabel, "Factory"), value: factory, isLink: false });
  }

  headerLines.forEach((line, idx) => {
    drawHeaderLine(line.label, line.value, line.isLink, rightY + idx * 10);
  });
  
  if (showHeaderDivider) {
    doc.moveTo(45, 78)
      .lineTo(550, 78)
      .strokeColor(headerDividerColor)
      .lineWidth(1)
      .stroke();
  }
   
  doc.restore();
}

// ── Footer helper ──────────────────
function drawFooter(
  doc: PDFKit.PDFDocument,
  pageNum: number,
  totalPages: number,
  F_REG: string,
  F_BOLD: string,
  cfg: Record<string, any>
) {
  doc.save();
  
  const footerStartY = 842 - 90;
  const footerFontSize = Math.max(7, Math.min(12, Number(cfg.footerFontSize) || 8.5));
  const footerFontColor = typeof cfg.footerFontColor === "string" && cfg.footerFontColor.trim() ? cfg.footerFontColor : "#1e293b";
  const footerBgEnabled = cfg.footerBgColorEnabled === true;
  const footerBgColor = typeof cfg.footerBgColor === "string" && cfg.footerBgColor.trim() ? cfg.footerBgColor : "#ffffff";
  const footerCustom = typeof cfg.footerCustomContent === "string" ? cfg.footerCustomContent.trim() : "";
  const footerDividerColor = typeof cfg.footerDividerColor === "string" && cfg.footerDividerColor.trim() ? cfg.footerDividerColor : "#f59e0b";
  const showFooterLines = cfg.showFooterLines !== false;

  if (footerBgEnabled) {
    doc.rect(0, footerStartY, 595, 90).fill(footerBgColor);
  }
  
  // Page number right above the line
  doc.font(F_REG).fontSize(footerFontSize).fillColor(footerFontColor);
  doc.text(`Page ${pageNum} of ${totalPages}`, 45, footerStartY + 15, { width: 505, align: "right" });
  
  // Divider Line
  doc.moveTo(45, footerStartY + 28)
     .lineTo(550, footerStartY + 28)
     .strokeColor(footerDividerColor)
     .lineWidth(1.2)
     .stroke();
     
  // Services footer line details
  let fy = footerStartY + 35;
  
  const drawFooterCenterLine = (text: string, yPos: number) => {
    doc.font(F_REG).fontSize(footerFontSize - 1).fillColor(footerFontColor);
    doc.text(text, 45, yPos, { width: 505, align: "center" });
  };
  
  if (showFooterLines) {
    const lines = [
      cfg.footerLine1,
      cfg.footerLine2,
      cfg.footerLine3,
      cfg.footerLine4,
      cfg.footerLine5,
    ].filter((l) => typeof l === "string" && l.trim() !== "");

    if (lines.length === 0) {
      drawFooterCenterLine("Solar Solutions : On grid & Off grid Power Plants | Water Heater | Street Lights | Home Lighting", fy);
      drawFooterCenterLine("LED Lighting Solution : Domestic | Commercial | Industrial | Customized industrial", fy + 11);
      drawFooterCenterLine("Industrial Automation: DRIVES | PLC | SCADA | HMI", fy + 22);
      fy += 33;
    } else {
      lines.forEach((line, index) => {
        drawFooterCenterLine(line, fy + index * 11);
      });
      fy += lines.length * 11;
    }
  }

  if (footerCustom) {
    doc.font(F_REG).fontSize(footerFontSize - 1).fillColor(footerFontColor);
    doc.text(footerCustom, 45, fy, { width: 505, align: "center" });
  }
  
  doc.restore();
}

export async function generateQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const logoBuffer = await fetchImageBuffer(data.orgLogoUrl);
  const cfg = data.templateConfig || {};
  const pickColor = (value: string | undefined, fallback: string) =>
    typeof value === "string" && value.trim() ? value : fallback;
  const showDocTitle = cfg.showDocTitle !== false;
  const showBillTo = cfg.showBillTo !== false;
  const showNotes = cfg.showNotes !== false;
  const showTerms = cfg.showTerms !== false;
  const showSignature = cfg.showSignature !== false;
  const showFooter = cfg.showFooter !== false;

  return new Promise((resolve, reject) => {
    // bottom margin set to 15 to completely prevent PDFKit from triggering auto-page-breaks.
    // This makes our manual checks the sole manager of page breaks, preventing random unwanted blank pages.
    const doc = new PDFDocument({ 
      size: "A4", 
      bufferPages: true, 
      margins: { top: 105, bottom: 15, left: 45, right: 45 } 
    });
    
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let F_REG = "Helvetica", F_BOLD = "Helvetica-Bold", F_BOLDIT = "Helvetica-BoldOblique";
    let canRenderRupee = false;
    if (_sysRegular && _sysBold) {
      doc.registerFont("SysReg", _sysRegular);
      doc.registerFont("SysBold", _sysBold);
      if (_sysBoldItalic) doc.registerFont("SysBoldIt", _sysBoldItalic);
      F_REG = "SysReg"; F_BOLD = "SysBold"; F_BOLDIT = _sysBoldItalic ? "SysBoldIt" : "SysBold";
      canRenderRupee = true;
    }
    const sym = canRenderRupee ? (data.currencySymbol ?? "₹") : "Rs.";

    const bgColor = pickColor(cfg.backgroundColor, "#ffffff");
    if (bgColor !== "#ffffff") {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgColor);
    }

    const displayOrgName = typeof cfg.orgNameOverride === "string" && cfg.orgNameOverride.trim()
      ? cfg.orgNameOverride.trim()
      : (data.orgName || "");

    const displayContact = typeof cfg.contactValueOverride === "string" && cfg.contactValueOverride.trim()
      ? cfg.contactValueOverride.trim()
      : (data.orgPhone || "");
      
    const displayEmail = typeof cfg.emailValueOverride === "string" && cfg.emailValueOverride.trim()
      ? cfg.emailValueOverride.trim()
      : (data.orgEmail || "");

    // Pre-draw watermark on first page background
    drawWatermark(doc, F_BOLD, displayOrgName);

    // Auto draw watermark on any newly added pages in background
    doc.on("pageAdded", () => {
      drawWatermark(doc, F_BOLD, displayOrgName);
    });

    let nextY = 105;

    // Header Title (techno commercial quotation)
    if (showDocTitle) {
      const title = typeof cfg.docTitle === "string" && cfg.docTitle.trim() ? cfg.docTitle : "TECHNO-COMMERCIAL QUOTATION";
      const titleFontSize = Math.max(8, Math.min(18, Number(cfg.docTitleFontSize) || 10.5));
      const titleColor = pickColor(cfg.docTitleFontColor, "#000000");
      doc.rect(45, nextY, doc.widthOfString(title) + 12, 16).fill("#e2e8f0");
      doc.fillColor(titleColor).font(F_BOLD).fontSize(titleFontSize).text(title, 51, nextY + 3);
      nextY += 20;
    }

    // Reference details
    doc.fontSize(9.5).fillColor("#000000");
    const refLabel = typeof cfg.quoteNumberLabel === "string" && cfg.quoteNumberLabel.trim() ? cfg.quoteNumberLabel : "Ref No.";
    doc.font(F_BOLD).text(`${refLabel}: `, 45, nextY, { continued: true }).font(F_REG).text(data.quoteNumber);
    nextY += 13;
    const dateLabel = typeof cfg.quoteDateLabel === "string" && cfg.quoteDateLabel.trim() ? cfg.quoteDateLabel : "Date";
    doc.font(F_BOLD).text(`${dateLabel}: `, 45, nextY, { continued: true }).font(F_REG).text(fmtDate(data.quoteDate));
    nextY += 16;

    // Recipient "To" details
    if (showBillTo) {
      const billTo = typeof cfg.billToLabel === "string" && cfg.billToLabel.trim() ? cfg.billToLabel : "To,";
      doc.font(F_BOLD).text(billTo, 45, nextY);
      nextY += 12;
    }
    doc.font(F_BOLD).text(data.customerName, 45, nextY);
    nextY += 13;

    if (data.customerAddress) {
      doc.font(F_REG).fontSize(9.5);
      const addressLines = data.customerAddress.split(",").map(line => line.trim());
      addressLines.forEach(line => {
        if (line) {
          doc.text(line, 45, nextY, { width: 505 });
          nextY += 12;
        }
      });
    }
    nextY += 4;

    // Subject
    if (data.subject) {
      doc.font(F_BOLD).fontSize(9.5).text(`Sub: ${data.subject}`, 45, nextY, { width: 505 });
      nextY += doc.heightOfString(`Sub: ${data.subject}`, { width: 505 }) + 4;
    }

    doc.font(F_REG).fontSize(9.5).text("Dear Sir,", 45, nextY);
    nextY += 10;

    const introText = "We thank you for the opportunity to submit our techno-commercial quotation for supply of panels as per specifications & GA drawings.";
    doc.text(introText, 45, nextY, { width: 505, align: "justify" });
    nextY += doc.heightOfString(introText, { width: 505 }) + 3;

    const complianceIntro = "We confirm full compliance to technical requirements, scope & standards mentioned in:";
    doc.text(complianceIntro, 45, nextY, { width: 505 });
    nextY += doc.heightOfString(complianceIntro, { width: 505 }) + 2;

    // Standard compliance bullets
    const drawBullet = (bulletText: string) => {
      doc.text("•", 55, nextY, { width: 10 });
      doc.text(bulletText, 67, nextY, { width: 483 });
      nextY += doc.heightOfString(bulletText, { width: 483 }) + 1;
    };

    drawBullet("TS for technical specifications & requirements");
    drawBullet("GA Drawings and scope of supply");
    nextY += 4;

    // Determine GST columns based on isIntraState flag
    const isIntra = data.isIntraState !== false;
    
    // Check if quote has non-zero tax to determine whether to render tax columns
    const hasTax = data.items.some(item => (item.taxPercent || 0) > 0);
    
    const cols = (hasTax) ? (
      isIntra ? [
        { id: "num", label: "#", x: 45, width: 20, align: "center" as const },
        { id: "item", label: "Item & Description", x: 65, width: 145, align: "left" as const },
        { id: "hsn", label: "HSN/SAC", x: 210, width: 45, align: "left" as const },
        { id: "qty", label: "Qty", x: 255, width: 25, align: "right" as const },
        { id: "rate", label: "Rate", x: 280, width: 65, align: "right" as const },
        { id: "cgst", label: "CGST", x: 345, width: 65, align: "center" as const },
        { id: "sgst", label: "SGST", x: 410, width: 65, align: "center" as const },
        { id: "amount", label: "Amount", x: 475, width: 75, align: "right" as const },
      ] : [
        { id: "num", label: "#", x: 45, width: 20, align: "center" as const },
        { id: "item", label: "Item & Description", x: 65, width: 190, align: "left" as const },
        { id: "hsn", label: "HSN/SAC", x: 255, width: 45, align: "left" as const },
        { id: "qty", label: "Qty", x: 300, width: 25, align: "right" as const },
        { id: "rate", label: "Rate", x: 325, width: 70, align: "right" as const },
        { id: "igst", label: "IGST", x: 395, width: 75, align: "center" as const },
        { id: "amount", label: "Amount", x: 470, width: 80, align: "right" as const },
      ]
    ) : [
      { id: "num", label: "#", x: 45, width: 20, align: "center" as const },
      { id: "item", label: "Item & Description", x: 65, width: 255, align: "left" as const },
      { id: "hsn", label: "HSN/SAC", x: 320, width: 55, align: "left" as const },
      { id: "qty", label: "Qty", x: 375, width: 30, align: "right" as const },
      { id: "rate", label: "Rate", x: 405, width: 75, align: "right" as const },
      { id: "amount", label: "Amount", x: 480, width: 70, align: "right" as const },
    ];

    const headerH = 26;
    const headerBg = pickColor(cfg.tableHeaderBgColor, "#ffffff");
    const headerFontColor = pickColor(cfg.tableHeaderFontColor, "#000000");
    const headerFontSize = Math.max(7, Math.min(12, Number(cfg.tableHeaderFontSize) || 8.5));
    const oddRowColor = pickColor(cfg.oddRowColor, "#ffffff");
    const evenRowColor = pickColor(cfg.evenRowColor, "#ffffff");

    const drawTableHeaderRow = (startY: number) => {
      if (headerBg !== "#ffffff") {
        doc.rect(45, startY, 505, headerH).fill(headerBg);
      }
      doc.rect(45, startY, 505, headerH).strokeColor("#000000").lineWidth(0.75).stroke();
      cols.forEach((col, idx) => {
        if (idx > 0) {
          doc.moveTo(col.x, startY).lineTo(col.x, startY + headerH).stroke();
        }
      });

      doc.fillColor(headerFontColor).fontSize(headerFontSize).font(F_BOLD);
      cols.forEach(col => {
        if (col.id === "cgst" || col.id === "sgst" || col.id === "igst") {
          doc.text(col.label, col.x, startY + 3, { width: col.width, align: "center" });
          doc.moveTo(col.x, startY + 13).lineTo(col.x + col.width, startY + 13).stroke();
          doc.moveTo(col.x + 18, startY + 13).lineTo(col.x + 18, startY + headerH).stroke();
          doc.fontSize(Math.max(6, headerFontSize - 1.5)).text("%", col.x, startY + 16, { width: 18, align: "center" });
          doc.text("Amt", col.x + 18, startY + 16, { width: col.width - 18, align: "center" });
          doc.fontSize(headerFontSize);
        } else {
          doc.text(col.label, col.x, startY + 8, { width: col.width, align: col.align });
        }
      });
    };

    // Draw initial header row
    drawTableHeaderRow(nextY);
    nextY += headerH;

    // Items rendering loop
    let totalTaxAmount = 0;
    data.items.forEach((item, idx) => {
      const itemColWidth = hasTax ? (isIntra ? 145 : 190) : 255;
      const nameH = doc.heightOfString(item.name, { width: itemColWidth - 10 });
      const descH = item.description ? doc.heightOfString(item.description, { width: itemColWidth - 10 }) : 0;
      const itemH = Math.max(20, nameH + descH + 4);

      // Page break check (prevents content row clipping across page borders)
      if (nextY + itemH > 842 - 95) {
        doc.addPage();
        nextY = 105;
        drawTableHeaderRow(nextY);
        nextY += headerH;
      }

      // Row background
      const rowBg = idx % 2 === 0 ? oddRowColor : evenRowColor;
      if (rowBg !== "#ffffff") {
        doc.rect(45, nextY, 505, itemH).fill(rowBg);
      }

      // Draw cell boxes
      doc.rect(45, nextY, 505, itemH).strokeColor("#000000").lineWidth(0.5).stroke();
      cols.forEach((col, idxCol) => {
        if (idxCol > 0) {
          doc.moveTo(col.x, nextY).lineTo(col.x, nextY + itemH).stroke();
        }
      });

      if (hasTax) {
        if (isIntra) {
          const cgstCol = cols.find(c => c.id === "cgst")!;
          const sgstCol = cols.find(c => c.id === "sgst")!;
          doc.moveTo(cgstCol.x + 18, nextY).lineTo(cgstCol.x + 18, nextY + itemH).stroke();
          doc.moveTo(sgstCol.x + 18, nextY).lineTo(sgstCol.x + 18, nextY + itemH).stroke();
        } else {
          const igstCol = cols.find(c => c.id === "igst")!;
          doc.moveTo(igstCol.x + 18, nextY).lineTo(igstCol.x + 18, nextY + itemH).stroke();
        }
      }

      // Text print
      doc.fillColor("#000000");

      // Index
      doc.font(F_REG).fontSize(8.5).text(String(idx + 1), 45, nextY + 4, { width: 20, align: "center" });

      // Name & description
      doc.font(F_BOLD).fontSize(8.5).text(item.name, 65, nextY + 4, { width: itemColWidth - 10 });
      if (item.description) {
        doc.font(F_REG).fontSize(7.5).fillColor("#475569").text(item.description, 65, nextY + 4 + nameH + 1, { width: itemColWidth - 10 });
      }

      doc.font(F_REG).fontSize(7.5).fillColor("#000000");

      // HSN
      const hsnCol = cols.find(c => c.id === "hsn")!;
      doc.text(item.hsnSacCode || "—", hsnCol.x + 4, nextY + 4, { width: hsnCol.width - 4, align: "left" });

      // Qty
      const qtyCol = cols.find(c => c.id === "qty")!;
      doc.text(fmtNum(item.quantity), qtyCol.x, nextY + 4, { width: qtyCol.width - 2, align: "right" });

      // Rate
      const rateCol = cols.find(c => c.id === "rate")!;
      doc.text(fmtNum(item.rate), rateCol.x, nextY + 4, { width: rateCol.width - 4, align: "right" });

      const taxPercent = item.taxPercent || 0;
      const taxAmount = item.taxAmount || 0;
      totalTaxAmount += taxAmount;

      if (hasTax) {
        if (isIntra) {
          const cgstCol = cols.find(c => c.id === "cgst")!;
          const sgstCol = cols.find(c => c.id === "sgst")!;
          const splitTaxP = taxPercent / 2;
          const splitTaxA = taxAmount / 2;

          doc.text(taxPercent > 0 ? `${splitTaxP}%` : "—", cgstCol.x, nextY + 4, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(splitTaxA) : "—", cgstCol.x + 18, nextY + 4, { width: 45, align: "right" });

          doc.text(taxPercent > 0 ? `${splitTaxP}%` : "—", sgstCol.x, nextY + 4, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(splitTaxA) : "—", sgstCol.x + 18, nextY + 4, { width: 45, align: "right" });
        } else {
          const igstCol = cols.find(c => c.id === "igst")!;
          doc.text(taxPercent > 0 ? `${taxPercent}%` : "—", igstCol.x, nextY + 4, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(taxAmount) : "—", igstCol.x + 18, nextY + 4, { width: 55, align: "right" });
        }
      }

      // Amount
      const amountCol = cols.find(c => c.id === "amount")!;
      doc.text(fmtNum(item.amount), amountCol.x, nextY + 4, { width: amountCol.width - 4, align: "right" });

      nextY += itemH;
    });

    const finalTotal = data.subTotal + totalTaxAmount + (data.adjustmentAmount || 0) - (data.discountAmount || 0);

    // Totals grid rows inline at the bottom of the table
    const addTotalGridRow = (label: string, value: string, isBold = false) => {
      const rowHeight = 15;
      if (nextY + rowHeight > 842 - 95) {
        doc.addPage();
        nextY = 105;
      }

      doc.rect(45, nextY, 505, rowHeight).strokeColor("#000000").lineWidth(0.5).stroke();
      
      const amtCol = cols.find(c => c.id === "amount")!;
      doc.moveTo(amtCol.x, nextY).lineTo(amtCol.x, nextY + rowHeight).stroke();

      doc.font(isBold ? F_BOLD : F_REG).fontSize(8.5).fillColor("#000000");
      doc.text(label, 50, nextY + 3, { width: amtCol.x - 55, align: "right" });
      doc.text(value, amtCol.x, nextY + 3, { width: amtCol.width - 4, align: "right" });

      nextY += rowHeight;
    };

    addTotalGridRow("Sub Total (In Rs)", fmtNum(data.subTotal));

    if (data.discountAmount) {
      addTotalGridRow(
        data.discountType === "percent" ? `Discount (${data.discountValue}%)` : "Discount",
        `- ${fmtNum(data.discountAmount)}`
      );
    }

    if (totalTaxAmount > 0) {
      if (isIntra) {
        const splitTax = totalTaxAmount / 2;
        addTotalGridRow("CGST (In Rs)", fmtNum(splitTax));
        addTotalGridRow("SGST (In Rs)", fmtNum(splitTax));
      } else {
        addTotalGridRow("IGST (In Rs)", fmtNum(totalTaxAmount));
      }
    }

    if (data.adjustmentAmount) {
      addTotalGridRow(data.adjustmentLabel || "Adjustment", fmtNum(data.adjustmentAmount));
    }

    addTotalGridRow("Total Amount (In Rs)", fmtNum(finalTotal), true);

    nextY += 5;

    // Total in words below table
    doc.font(F_BOLD).fontSize(8.5).fillColor("#000000");
    const totalWordsString = `Total Price (in Words) – ${numberToWords(finalTotal)}.`;
    doc.text(totalWordsString, 45, nextY, { width: 505 });
    nextY += doc.heightOfString(totalWordsString, { width: 505 }) + 6;

    // Bullet drawing/notes formatting helper
    const drawFormattedParagraph = (text: string) => {
      const lines = text.split("\n");
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const content = trimmed.substring(1).trim();
          doc.font(F_REG).fontSize(8).fillColor("#000000");
          doc.text("•", 55, nextY, { width: 10 });
          doc.text(content, 67, nextY, { width: 483 });
          nextY += doc.heightOfString(content, { width: 483 }) + 1;
        } else if (trimmed) {
          doc.font(F_REG).fontSize(8).fillColor("#000000");
          doc.text(trimmed, 45, nextY, { width: 505 });
          nextY += doc.heightOfString(trimmed, { width: 505 }) + 1;
        }
      });
    };

    const drawShadedHeading = (title: string) => {
      if (nextY + 22 > 842 - 95) {
        doc.addPage();
        nextY = 105;
      }
      doc.rect(45, nextY, doc.widthOfString(title) + 10, 13).fill("#e2e8f0");
      doc.fillColor("#000000").font(F_BOLD).fontSize(8.5).text(title, 50, nextY + 2);
      nextY += 15;
    };

    // Notes
    if (showNotes && data.customerNotes) {
      const notesLabel = typeof cfg.notesLabel === "string" && cfg.notesLabel.trim() ? cfg.notesLabel : "Notes";
      drawShadedHeading(`${notesLabel}:`);
      drawFormattedParagraph(data.customerNotes);
      nextY += 5;
    }

    // Terms
    if (showTerms && data.termsAndConditions) {
      const termsLabel = typeof cfg.termsLabel === "string" && cfg.termsLabel.trim() ? cfg.termsLabel : "Terms & conditions";
      drawShadedHeading(`${termsLabel}:`);
      drawFormattedParagraph(data.termsAndConditions);
      nextY += 5;
    }

    // Signature Area on the bottom right
    if (showSignature) {
      const sigHeight = 65;
      if (nextY + sigHeight > 842 - 90) {
        doc.addPage();
        nextY = 105;
      } else {
        // Position at the bottom of the page only if it's the first/only page, but leave some spacing.
        // If we are already near the bottom, don't force it to a specific point that is higher than current nextY.
        nextY = Math.max(nextY, 842 - 165);
      }

      const sigX = 350;
      const sigW = 200;
      doc.font(F_BOLD).fontSize(8.5).fillColor("#000000");
      if (displayOrgName) {
        doc.text(`For ${displayOrgName.toUpperCase()}`, sigX, nextY, { width: sigW, align: "right" });
        nextY += 10;
      }

      const signatureLabel = typeof cfg.signatureLabel === "string" && cfg.signatureLabel.trim()
        ? cfg.signatureLabel
        : "Authorized Signatory";
      doc.font(F_REG).fontSize(8);
      doc.text(signatureLabel, sigX, nextY, { width: sigW, align: "right" });
      nextY += 14;

      if (data.salesPersonName) {
        doc.font(F_BOLD).text(data.salesPersonName, sigX, nextY, { width: sigW, align: "right" });
        nextY += 10;
      }

      doc.font(F_REG).fontSize(7.5).fillColor("#475569");
      if (displayEmail) {
        doc.text(`Email: ${displayEmail}`, sigX, nextY, { width: sigW, align: "right" });
        nextY += 9;
      }
      if (displayContact) {
        doc.text(`Phone: ${displayContact}`, sigX, nextY, { width: sigW, align: "right" });
      }
    }

    // Second pass - switch pages to draw header and footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      drawHeader(doc, i + 1, range.count, data, F_REG, F_BOLD, logoBuffer, cfg);
      if (showFooter) {
        drawFooter(doc, i + 1, range.count, F_REG, F_BOLD, cfg);
      }
    }

    doc.end();
  });
}
