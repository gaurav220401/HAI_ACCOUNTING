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
    if (data.discountAmount && data.discountAmount !== 0) {
      const discLabel =
        data.discountType === "percent" ?
          `Discount (${data.discountValue}%)`
        : "Discount";
      addTotalRow(discLabel, `- ${fmtNum(data.discountAmount)}`);
    }
    if (data.taxAmount && data.taxAmount !== 0) {
      addTotalRow("Tax", fmtNum(data.taxAmount));
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
