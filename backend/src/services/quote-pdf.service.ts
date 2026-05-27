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
function drawWatermark(doc: PDFKit.PDFDocument, F_BOLD: string) {
  doc.save();
  doc.translate(595 / 2, 842 / 2);
  doc.opacity(0.035); // Light watermark exactly like image
  
  // Icon block
  doc.save();
  doc.translate(-50, -60);
  doc.scale(2.5);
  doc.lineWidth(2.5);
  doc.strokeColor("#2dd4bf");
  
  doc.moveTo(35, 12)
     .lineTo(15, 12)
     .bezierCurveTo(5, 12, 5, 28, 15, 28)
     .lineTo(35, 28)
     .bezierCurveTo(45, 28, 45, 12, 35, 12)
     .stroke();
     
  doc.moveTo(28, 20).lineTo(35, 20).stroke();
  
  doc.strokeColor("#84cc16");
  doc.lineWidth(2);
  doc.moveTo(35, 6).lineTo(35, 14).stroke();
  doc.moveTo(31, 10).lineTo(39, 10).stroke();
  doc.restore();
  
  // Text block
  doc.font(F_BOLD).fontSize(26).fillColor("#0f172a");
  doc.text("PIKA G ENERGY PVT. LTD.", -250, 40, { width: 500, align: "center" });
  
  doc.restore();
}

// ── Default vector logo drawing ─────
function drawDefaultVectorLogo(doc: PDFKit.PDFDocument, logoX: number, logoY: number, F_BOLD: string) {
  doc.save();
  doc.translate(logoX, logoY);
  doc.lineWidth(2.2);
  doc.strokeColor("#2dd4bf"); // Teal
  
  doc.moveTo(32, 11)
     .lineTo(14, 11)
     .bezierCurveTo(5, 11, 5, 25, 14, 25)
     .lineTo(32, 25)
     .bezierCurveTo(41, 25, 41, 11, 32, 11)
     .stroke();
  
  doc.moveTo(26, 18).lineTo(32, 18).stroke();
  
  doc.strokeColor("#84cc16"); // Lime green
  doc.lineWidth(1.8);
  doc.moveTo(32, 6).lineTo(32, 13).stroke();
  doc.moveTo(28, 9).lineTo(36, 9).stroke();
  doc.restore();
  
  // Text under logo
  doc.font(F_BOLD).fontSize(7.5).fillColor("#1e293b");
  doc.text("PIKA G ENERGY PVT. LTD.", logoX, logoY + 32, { width: 140, align: "left" });
}

// ── Header helper ──────────────────
function drawHeader(
  doc: PDFKit.PDFDocument, 
  pageNum: number, 
  totalPages: number, 
  data: QuotePdfData, 
  F_REG: string, 
  F_BOLD: string,
  logoBuffer: Buffer | null
) {
  doc.save();
  
  // Draw Logo (Left side)
  const logoX = 45;
  const logoY = 20;
  
  if (logoBuffer) {
    try {
      const logoH = 40;
      const logoW = logoH * 1.9;
      doc.image(logoBuffer, logoX, logoY, { fit: [logoW, logoH] });
      // Draw Organization name below the dynamic logo if it's not default PIKA G
      if (!data.orgName.toLowerCase().includes("pika")) {
        doc.font(F_BOLD).fontSize(7.5).fillColor("#1e293b");
        doc.text(data.orgName.toUpperCase(), logoX, logoY + 42, { width: 145, align: "left" });
      }
    } catch {
      drawDefaultVectorLogo(doc, logoX, logoY, F_BOLD);
    }
  } else {
    drawDefaultVectorLogo(doc, logoX, logoY, F_BOLD);
  }
  
  // Right side corporate details
  const rightX = 300;
  const rightY = 20;
  const rightW = 250;
  
  doc.fontSize(7.5).fillColor("#1e293b");
  
  const drawHeaderLine = (label: string, value: string, isLink = false, ly: number) => {
    doc.font(F_BOLD).text(label, rightX, ly, { width: 45, align: "left" });
    doc.font(F_REG);
    if (isLink) {
      doc.fillColor("#0284c7").text(value, rightX + 45, ly, { underline: true }).fillColor("#1e293b");
    } else {
      doc.text(value, rightX + 45, ly, { width: rightW - 45, align: "left" });
    }
  };
  
  const gstin = data.orgTaxId || "22AAJCP7742A1ZP";
  const contact = "+91- 8349873989";
  const email = data.orgEmail || "pikagenergy@gmail.com";
  
  let factory = "Plot No. 173 , Engineering Park , Hathkhoj , Bhilai , 490026";
  if (data.orgAddress) {
    const addr = data.orgAddress;
    const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
    if (parts.length > 0) factory = parts.join(", ");
  }
  
  drawHeaderLine("GSTIN : ", gstin, false, rightY);
  drawHeaderLine("Contact : ", contact, false, rightY + 10);
  drawHeaderLine("Email : ", email, true, rightY + 20);
  
  doc.font(F_BOLD).text("Factory : ", rightX, rightY + 30, { width: 45 });
  doc.font(F_REG).text(factory, rightX + 45, rightY + 30, { width: rightW - 45 });
  
  // Gold Divider Line
  doc.moveTo(45, 78)
     .lineTo(550, 78)
     .strokeColor("#f59e0b")
     .lineWidth(1)
     .stroke();
     
  doc.restore();
}

// ── Footer helper ──────────────────
function drawFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number, F_REG: string, F_BOLD: string) {
  doc.save();
  
  const footerStartY = 842 - 90;
  
  // Page number right above the line
  doc.font(F_REG).fontSize(8.5).fillColor("#1e293b");
  doc.text(`Page ${pageNum} of ${totalPages}`, 45, footerStartY + 15, { width: 505, align: "right" });
  
  // Gold Divider Line
  doc.moveTo(45, footerStartY + 28)
     .lineTo(550, footerStartY + 28)
     .strokeColor("#f59e0b")
     .lineWidth(1.2)
     .stroke();
     
  // Services footer line details
  let fy = footerStartY + 35;
  
  const drawFooterCenterLine = (label: string, val: string, yPos: number) => {
    doc.font(F_REG).fontSize(7.5).fillColor("#1e293b");
    doc.text(`${label}${val}`, 45, yPos, { width: 505, align: "center" });
  };
  
  drawFooterCenterLine("Solar Solutions : ", "On grid & Off grid Power Plants | Water Heater | Street Lights | Home Lighting", fy);
  drawFooterCenterLine("LED Lighting Solution : ", "Domestic | Commercial | Industrial | Customized industrial", fy + 11);
  drawFooterCenterLine("Industrial Automation: ", "DRIVES | PLC | SCADA | HMI", fy + 22);
  
  doc.restore();
}

export async function generateQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const logoBuffer = await fetchImageBuffer(data.orgLogoUrl);

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

    // Pre-draw watermark on first page background
    drawWatermark(doc, F_BOLD);

    // Auto draw watermark on any newly added pages in background
    doc.on('pageAdded', () => {
      drawWatermark(doc, F_BOLD);
    });

    let nextY = 105;

    // Header Title (techno commercial quotation)
    doc.rect(45, nextY, doc.widthOfString("TECHNO-COMMERCIAL QUOTATION") + 12, 16).fill("#e2e8f0");
    doc.fillColor("#000000").font(F_BOLD).fontSize(10.5).text("TECHNO-COMMERCIAL QUOTATION", 51, nextY + 3);
    nextY += 24;

    // Reference details
    doc.fontSize(9.5).fillColor("#000000");
    doc.font(F_BOLD).text("Ref No.: ", 45, nextY, { continued: true }).font(F_REG).text(data.quoteNumber);
    nextY += 13;
    doc.font(F_BOLD).text("Date: ", 45, nextY, { continued: true }).font(F_REG).text(fmtDate(data.quoteDate));
    nextY += 20;

    // Recipient "To" details
    doc.font(F_BOLD).text("To,", 45, nextY);
    nextY += 13;
    doc.font(F_BOLD).text(data.customerName, 45, nextY);
    nextY += 14;

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
    nextY += 8;

    // Subject
    if (data.subject) {
      doc.font(F_BOLD).fontSize(9.5).text(`Sub: ${data.subject}`, 45, nextY, { width: 505 });
      nextY += doc.heightOfString(`Sub: ${data.subject}`, { width: 505 }) + 10;
    }

    doc.font(F_REG).fontSize(9.5).text("Dear Sir,", 45, nextY);
    nextY += 15;

    const introText = "We thank you for the opportunity to submit our techno-commercial quotation for supply of panels as per specifications & GA drawings.";
    doc.text(introText, 45, nextY, { width: 505, align: "justify" });
    nextY += doc.heightOfString(introText, { width: 505 }) + 8;

    const complianceIntro = "We confirm full compliance to technical requirements, scope & standards mentioned in:";
    doc.text(complianceIntro, 45, nextY, { width: 505 });
    nextY += doc.heightOfString(complianceIntro, { width: 505 }) + 6;

    // Standard compliance bullets
    const drawBullet = (bulletText: string) => {
      doc.text("•", 55, nextY, { width: 10 });
      doc.text(bulletText, 67, nextY, { width: 483 });
      nextY += doc.heightOfString(bulletText, { width: 483 }) + 4;
    };

    drawBullet("TS for technical specifications & requirements");
    drawBullet("GA Drawings and scope of supply");
    nextY += 15;

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

    const drawTableHeaderRow = (startY: number) => {
      doc.rect(45, startY, 505, headerH).strokeColor("#000000").lineWidth(0.75).stroke();
      cols.forEach((col, idx) => {
        if (idx > 0) {
          doc.moveTo(col.x, startY).lineTo(col.x, startY + headerH).stroke();
        }
      });

      doc.fillColor("#000000").fontSize(8.5).font(F_BOLD);
      cols.forEach(col => {
        if (col.id === "cgst" || col.id === "sgst" || col.id === "igst") {
          doc.text(col.label, col.x, startY + 3, { width: col.width, align: "center" });
          doc.moveTo(col.x, startY + 13).lineTo(col.x + col.width, startY + 13).stroke();
          doc.moveTo(col.x + 18, startY + 13).lineTo(col.x + 18, startY + headerH).stroke();
          doc.fontSize(7).text("%", col.x, startY + 16, { width: 18, align: "center" });
          doc.text("Amt", col.x + 18, startY + 16, { width: col.width - 18, align: "center" });
          doc.fontSize(8.5);
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
      const itemH = Math.max(28, nameH + descH + 10);

      // Page break check (prevents content row clipping across page borders)
      if (nextY + itemH > 842 - 95) {
        doc.addPage();
        nextY = 105;
        drawTableHeaderRow(nextY);
        nextY += headerH;
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
      doc.font(F_REG).fontSize(8.5).text(String(idx + 1), 45, nextY + 5, { width: 20, align: "center" });

      // Name & description
      doc.font(F_BOLD).fontSize(8.5).text(item.name, 65, nextY + 5, { width: itemColWidth - 10 });
      if (item.description) {
        doc.font(F_REG).fontSize(7.5).fillColor("#475569").text(item.description, 65, nextY + 5 + nameH + 2, { width: itemColWidth - 10 });
      }

      doc.font(F_REG).fontSize(7.5).fillColor("#000000");

      // HSN
      const hsnCol = cols.find(c => c.id === "hsn")!;
      doc.text(item.hsnSacCode || "—", hsnCol.x + 4, nextY + 5, { width: hsnCol.width - 4, align: "left" });

      // Qty
      const qtyCol = cols.find(c => c.id === "qty")!;
      doc.text(fmtNum(item.quantity), qtyCol.x, nextY + 5, { width: qtyCol.width - 2, align: "right" });

      // Rate
      const rateCol = cols.find(c => c.id === "rate")!;
      doc.text(fmtNum(item.rate), rateCol.x, nextY + 5, { width: rateCol.width - 4, align: "right" });

      const taxPercent = item.taxPercent || 0;
      const taxAmount = item.taxAmount || 0;
      totalTaxAmount += taxAmount;

      if (hasTax) {
        if (isIntra) {
          const cgstCol = cols.find(c => c.id === "cgst")!;
          const sgstCol = cols.find(c => c.id === "sgst")!;
          const splitTaxP = taxPercent / 2;
          const splitTaxA = taxAmount / 2;

          doc.text(taxPercent > 0 ? `${splitTaxP}%` : "—", cgstCol.x, nextY + 5, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(splitTaxA) : "—", cgstCol.x + 18, nextY + 5, { width: 45, align: "right" });

          doc.text(taxPercent > 0 ? `${splitTaxP}%` : "—", sgstCol.x, nextY + 5, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(splitTaxA) : "—", sgstCol.x + 18, nextY + 5, { width: 45, align: "right" });
        } else {
          const igstCol = cols.find(c => c.id === "igst")!;
          doc.text(taxPercent > 0 ? `${taxPercent}%` : "—", igstCol.x, nextY + 5, { width: 18, align: "right" });
          doc.text(taxPercent > 0 ? fmtNum(taxAmount) : "—", igstCol.x + 18, nextY + 5, { width: 55, align: "right" });
        }
      }

      // Amount
      const amountCol = cols.find(c => c.id === "amount")!;
      doc.text(fmtNum(item.amount), amountCol.x, nextY + 5, { width: amountCol.width - 4, align: "right" });

      nextY += itemH;
    });

    const finalTotal = data.subTotal + totalTaxAmount + (data.adjustmentAmount || 0) - (data.discountAmount || 0);

    // Totals grid rows inline at the bottom of the table
    const addTotalGridRow = (label: string, value: string, isBold = false) => {
      const rowHeight = 18;
      if (nextY + rowHeight > 842 - 95) {
        doc.addPage();
        nextY = 105;
      }

      doc.rect(45, nextY, 505, rowHeight).strokeColor("#000000").lineWidth(0.5).stroke();
      
      const amtCol = cols.find(c => c.id === "amount")!;
      doc.moveTo(amtCol.x, nextY).lineTo(amtCol.x, nextY + rowHeight).stroke();

      doc.font(isBold ? F_BOLD : F_REG).fontSize(8.5).fillColor("#000000");
      doc.text(label, 50, nextY + 5, { width: amtCol.x - 55, align: "right" });
      doc.text(value, amtCol.x, nextY + 5, { width: amtCol.width - 4, align: "right" });

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

    nextY += 8;

    // Total in words below table
    doc.font(F_BOLD).fontSize(8.5).fillColor("#000000");
    const totalWordsString = `Total Price (in Words) – ${numberToWords(finalTotal)}.`;
    doc.text(totalWordsString, 45, nextY, { width: 505 });
    nextY += doc.heightOfString(totalWordsString, { width: 505 }) + 15;

    // Bullet drawing/notes formatting helper
    const drawFormattedParagraph = (text: string) => {
      const lines = text.split("\n");
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const content = trimmed.substring(1).trim();
          doc.font(F_REG).fontSize(8.5).fillColor("#000000");
          doc.text("•", 55, nextY, { width: 10 });
          doc.text(content, 67, nextY, { width: 483 });
          nextY += doc.heightOfString(content, { width: 483 }) + 4;
        } else if (trimmed) {
          doc.font(F_REG).fontSize(8.5).fillColor("#000000");
          doc.text(trimmed, 45, nextY, { width: 505 });
          nextY += doc.heightOfString(trimmed, { width: 505 }) + 4;
        }
      });
    };

    const drawShadedHeading = (title: string) => {
      if (nextY + 30 > 842 - 95) {
        doc.addPage();
        nextY = 105;
      }
      doc.rect(45, nextY, doc.widthOfString(title) + 12, 16).fill("#e2e8f0");
      doc.fillColor("#000000").font(F_BOLD).fontSize(9.5).text(title, 51, nextY + 3);
      nextY += 22;
    };

    // Notes
    if (data.customerNotes) {
      drawShadedHeading("Notes:");
      drawFormattedParagraph(data.customerNotes);
      nextY += 10;
    }

    // Terms
    if (data.termsAndConditions) {
      drawShadedHeading("Terms & conditions:");
      drawFormattedParagraph(data.termsAndConditions);
      nextY += 10;
    }

    // Signature Area on the bottom right
    const sigHeight = 70;
    if (nextY + sigHeight > 842 - 95) {
      doc.addPage();
      nextY = 105;
    } else {
      nextY = Math.max(nextY, 842 - 180);
    }

    const sigX = 350;
    const sigW = 200;
    doc.font(F_BOLD).fontSize(8.5).fillColor("#000000");
    const org = data.orgName || "PIKA G ENERGY PVT. LTD.";
    doc.text(`For ${org.toUpperCase()}`, sigX, nextY, { width: sigW, align: "right" });
    nextY += 12;

    doc.font(F_REG).fontSize(8.5);
    doc.text("Authorized Signatory", sigX, nextY, { width: sigW, align: "right" });
    nextY += 24;

    const contactPerson = data.salesPersonName || "Gautam Kumar Haldar";
    doc.font(F_BOLD).text(contactPerson, sigX, nextY, { width: sigW, align: "right" });
    nextY += 11;

    doc.font(F_REG).fontSize(8).fillColor("#475569");
    if (data.orgEmail) {
      doc.text(`Email: ${data.orgEmail}`, sigX, nextY, { width: sigW, align: "right" });
      nextY += 10;
    }
    doc.text("Phone: +91 97550 21473", sigX, nextY, { width: sigW, align: "right" });

    // Second pass - switch pages to draw header and footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      drawHeader(doc, i + 1, range.count, data, F_REG, F_BOLD, logoBuffer);
      drawFooter(doc, i + 1, range.count, F_REG, F_BOLD);
    }

    doc.end();
  });
}
