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

export function generateQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 30, bottom: 30, left: 40, right: 40 } });
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

    const left = 40, pageW = doc.page.width - 80, right = left + pageW;
    let y = 30;

    // Header
    doc.font(F_BOLD).fontSize(14).fillColor("#000000").text(data.orgName, left, y);
    y += 18;
    doc.font(F_REG).fontSize(9).fillColor("#333333");
    if (data.orgAddress?.city) doc.text(`${data.orgAddress.city}, ${data.orgAddress.state || ""}`, left, y);
    y += 12;
    doc.text("India", left, y);
    y += 12;
    if (data.orgTaxId) {
        doc.text(`GSTIN ${data.orgTaxId}`, left, y);
        y += 12;
    }
    if (data.orgEmail) {
        doc.text(data.orgEmail, left, y, { underline: true });
        y += 12;
    }

    doc.font(F_REG).fontSize(28).fillColor("#000000").text("QUOTE", left, 35, { align: "right", width: pageW });

    y = Math.max(y, 110);

    // Meta Section (Boxes)
    const boxH = 40;
    doc.rect(left, y, pageW * 0.48, boxH).strokeColor("#999999").lineWidth(0.5).stroke();
    doc.rect(left + pageW * 0.48, y, pageW * 0.52, boxH).stroke();

    doc.font(F_BOLD).fontSize(9).fillColor("#000000");
    doc.text("#", left + 8, y + 8);
    doc.text(": " + data.quoteNumber, left + 90, y + 8);
    doc.text(": " + fmtDate(data.quoteDate), left + 90, y + 22);

    doc.text("Place Of Supply", left + pageW * 0.48 + 8, y + 8);
    doc.text(": " + (data.placeOfSupply || "Not Specified"), left + pageW * 0.48 + 100, y + 8);

    y += boxH;

    // Bill To
    doc.rect(left, y, pageW, 18).fillColor("#f3f4f6").strokeColor("#999999").fillAndStroke();
    doc.font(F_BOLD).fontSize(9).fillColor("#000000").text("Bill To", left + 8, y + 5);
    y += 18;
    doc.rect(left, y, pageW, 40).stroke();
    doc.font(F_BOLD).fontSize(10).fillColor("#3b82f6").text(data.customerName, left + 8, y + 8);
    if (data.customerAddress) {
        doc.font(F_REG).fontSize(9).fillColor("#444444").text(data.customerAddress, left + 8, y + 22, { width: pageW - 16, height: 15, ellipsis: true });
    }
    y += 45 + 10; // Extra padding

    // Table Header
    const colNum = left, colItem = colNum + 20, colHsn = colItem + 150, colQty = colHsn + 50, colRate = colQty + 40;
    const colCgst = colRate + 60, colSgst = colCgst + 60, colAmt = colSgst + 60;
    
    const tableHeaderH = 35;
    doc.rect(left, y, pageW, tableHeaderH).strokeColor("#000000").stroke();
    doc.font(F_BOLD).fontSize(8.5).fillColor("#000000");
    
    const drawLine = (x: number) => doc.moveTo(x, y).lineTo(x, y + tableHeaderH).stroke();
    drawLine(colItem); drawLine(colHsn); drawLine(colQty); drawLine(colRate); drawLine(colCgst); drawLine(colSgst); drawLine(colAmt);

    doc.text("#", colNum, y + 12, { width: 20, align: "center" });
    doc.text("Item & Description", colItem + 5, y + 12);
    doc.text("HSN/SAC", colHsn + 5, y + 12);
    doc.text("Qty", colQty, y + 12, { width: 40, align: "center" });
    doc.text("Rate", colRate, y + 12, { width: 60, align: "center" });
    
    doc.text("CGST", colCgst, y + 4, { width: 60, align: "center" });
    doc.moveTo(colCgst, y + 16).lineTo(colSgst, y + 16).stroke();
    doc.text("%", colCgst, y + 20, { width: 30, align: "center" });
    doc.text("Amt", colCgst + 30, y + 20, { width: 30, align: "center" });
    doc.moveTo(colCgst + 30, y + 16).lineTo(colCgst + 30, y + tableHeaderH).stroke();

    doc.text("SGST", colSgst, y + 4, { width: 60, align: "center" });
    doc.moveTo(colSgst, y + 16).lineTo(colAmt, y + 16).stroke();
    doc.text("%", colSgst, y + 20, { width: 30, align: "center" });
    doc.text("Amt", colSgst + 30, y + 20, { width: 30, align: "center" });
    doc.moveTo(colSgst + 30, y + 16).lineTo(colSgst + 30, y + tableHeaderH).stroke();

    doc.text("Amount", colAmt, y + 12, { width: right - colAmt, align: "center" });

    y += tableHeaderH;

    // Items
    let totalTaxAmount = 0;
    data.items.forEach((item, idx) => {
        doc.fontSize(7.5);
        const descH = item.description ? doc.heightOfString(item.description, { width: 140 }) : 0;
        const itemH = Math.max(30, 15 + descH);
        
        if (y + itemH > doc.page.height - 120) { doc.addPage(); y = 40; }
        
        doc.rect(left, y, pageW, itemH).stroke();
        const drawItemLine = (x: number) => doc.moveTo(x, y).lineTo(x, y + itemH).stroke();
        drawItemLine(colItem); drawItemLine(colHsn); drawItemLine(colQty); drawItemLine(colRate); drawItemLine(colCgst); drawItemLine(colSgst); drawItemLine(colAmt);
        drawItemLine(colCgst + 30); drawItemLine(colSgst + 30);

        doc.font(F_REG).fontSize(8.5).fillColor("#000000");
        doc.text(String(idx + 1), colNum, y + 5, { width: 20, align: "center" });
        doc.font(F_BOLD).text(item.name, colItem + 5, y + 5).font(F_REG);
        if (item.description) doc.fontSize(7.5).fillColor("#666666").text(item.description, colItem + 5, y + 15, { width: 140 });
        
        doc.fontSize(8.5).fillColor("#000000");
        doc.text(item.hsnSacCode || "", colHsn + 5, y + 5);
        doc.text(fmtNum(item.quantity), colQty, y + 5, { width: 40, align: "center" });
        doc.text(fmtNum(item.rate), colRate, y + 5, { width: 60, align: "right" });
        
        const iTaxPercent = item.taxPercent || 0;
        const iTaxAmount = item.taxAmount || 0;
        totalTaxAmount += iTaxAmount;

        const splitTaxP = iTaxPercent / 2;
        const splitTaxA = iTaxAmount / 2;

        doc.text(`${splitTaxP}%`, colCgst, y + 5, { width: 30, align: "center" });
        doc.text(fmtNum(splitTaxA), colCgst + 30, y + 5, { width: 30, align: "center" });
        doc.text(`${splitTaxP}%`, colSgst, y + 5, { width: 30, align: "center" });
        doc.text(fmtNum(splitTaxA), colSgst + 30, y + 5, { width: 30, align: "center" });
        
        doc.text(fmtNum(item.amount), colAmt, y + 5, { width: right - colAmt - 5, align: "right" });

        y += itemH;
    });

    // Totals Calculation Fix
    const finalTotal = data.subTotal + totalTaxAmount + (data.adjustmentAmount || 0) - (data.discountAmount || 0);

    // Footer Boxes
    const totalsW = 200;
    const totalsH = 75;
    if (y + totalsH > doc.page.height - 60) { doc.addPage(); y = 40; }

    doc.rect(left, y, pageW - totalsW, totalsH).stroke();
    doc.font(F_BOLD).fontSize(8.5).text("Total In Words", left + 8, y + 8);
    doc.font(F_BOLDIT).fontSize(9).text(numberToWords(finalTotal), left + 8, y + 22, { width: pageW - totalsW - 16 });
    
    if (data.customerNotes) {
        doc.font(F_BOLD).fontSize(8).text("Notes", left + 8, y + 45);
        doc.font(F_REG).fontSize(8).fillColor("#333333").text(data.customerNotes, left + 8, y + 55, { width: pageW - totalsW - 16 });
    }

    // Totals Box
    const totalsBoxX = right - totalsW;
    doc.rect(totalsBoxX, y, totalsW, totalsH).stroke();
    
    let ty = y + 8;
    const addTotLine = (label: string, val: string, bold = false) => {
        doc.font(bold ? F_BOLD : F_REG).fontSize(8.5).fillColor("#000000");
        doc.text(label, totalsBoxX + 5, ty, { width: 100, align: "right" });
        doc.text(val, totalsBoxX + 110, ty, { width: 85, align: "right" });
        ty += 14;
    };
    
    addTotLine("Sub Total", fmtNum(data.subTotal));
    if (data.discountAmount) addTotLine("Discount", `- ${fmtNum(data.discountAmount)}`);
    
    const splitTotalTax = totalTaxAmount / 2;
    addTotLine("CGST9 (9%)", fmtNum(splitTotalTax));
    addTotLine("SGST9 (9%)", fmtNum(splitTotalTax));
    
    if (data.adjustmentAmount) addTotLine(data.adjustmentLabel || "Adjustment", fmtNum(data.adjustmentAmount));

    doc.moveTo(totalsBoxX, y + totalsH - 20).lineTo(right, y + totalsH - 20).stroke();
    doc.font(F_BOLD).fontSize(10).text("Total", totalsBoxX + 5, y + totalsH - 15, { width: 100, align: "right" });
    doc.text(fmt(finalTotal, sym), totalsBoxX + 110, y + totalsH - 15, { width: 85, align: "right" });

    // Signature
    y = Math.max(y + totalsH + 40, doc.page.height - 80);
    doc.font(F_REG).fontSize(8.5).text("Authorized Signature", right - 150, y, { width: 150, align: "center" });
    doc.moveTo(right - 150, y - 5).lineTo(right, y - 5).strokeColor("#000000").lineWidth(0.5).stroke();

    doc.end();
  });
}
