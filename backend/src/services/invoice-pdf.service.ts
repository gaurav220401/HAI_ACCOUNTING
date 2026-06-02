import PDFDocument from "pdfkit";
import * as fs from "fs";
import { formatMoney } from "../utils/money";

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

  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  paymentTerms?: string;
  orderNumber?: string;
  salesPersonName?: string;
  subject?: string;
  placeOfSupply?: string;

  items: InvoiceItemRow[];

  subTotal: number;
  discountType?: string;
  discountValue?: number;
  discountAmount?: number;
  taxType?: string;
  taxAmount?: number; // Header/Extra tax like TDS/TCS
  adjustmentLabel?: string;
  adjustmentAmount?: number;
  total: number;
  balanceDue?: number;

  customerNotes?: string;
  termsAndConditions?: string;
  currencySymbol?: string;
  isIntraState?: boolean; 
}

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

function fmtNum(n: number): string {
  return formatMoney(n);
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

const DEFAULT_CONFIG = {
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

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const logoBuffer = await fetchImageBuffer(data.orgLogoUrl);
  const cfg = { ...DEFAULT_CONFIG, ...(data.templateConfig || {}) };

  const F_REG = _sysRegular ? "SysReg" : "Helvetica";
  const F_BOLD = _sysBold ? "SysBold" : "Helvetica-Bold";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: cfg.paperSize as any,
      layout: (cfg.orientation || "Portrait").toLowerCase() as any,
      bufferPages: true,
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (_sysRegular && _sysBold) {
      doc.registerFont("SysReg", _sysRegular);
      doc.registerFont("SysBold", _sysBold);
    }

    const tBorderColor = cfg.colorTheme === "vibrant-blue" ? "#1e3a8a" : "#000000";
    
    // We create a dummy page to compute heights
    doc.addPage();
    const x = 36, y = 36;
    const w = doc.page.width - 72;
    const midX = x + w / 2;
    
    // Height Computations
    let leftH = 4;
    const displayOrgName = cfg.orgNameOverride?.trim() || data.orgName || "COMPANY NAME";
    const orgAddrStr = typeof cfg.factoryValueOverride === "string" && cfg.factoryValueOverride.trim() !== "" 
      ? cfg.factoryValueOverride.trim() 
      : (data.orgAddress ? [data.orgAddress.street, data.orgAddress.city, data.orgAddress.state, data.orgAddress.zip].filter(Boolean).join(", ") : "");
    const gstin = cfg.gstinValueOverride?.trim() || data.orgTaxId;
    const contact = cfg.contactValueOverride?.trim() || data.orgPhone;
    const email = cfg.emailValueOverride?.trim() || data.orgEmail;

    if (cfg.showOrgLogo && logoBuffer) {
      leftH += Math.min(cfg.orgLogoSize || 60, 60) + 4;
    }
    if (cfg.showOrgName) {
      doc.font(F_BOLD).fontSize(cfg.orgNameFontSize);
      leftH += doc.heightOfString(displayOrgName, { width: midX - x - 8 }) + 2;
    }
    doc.font(F_REG).fontSize(cfg.fontSize);
    if (cfg.showOrgAddress && orgAddrStr) {
      leftH += doc.heightOfString(orgAddrStr, { width: midX - x - 8 }) + 2;
    }
    if (cfg.showGstin && gstin) leftH += 12;
    if (cfg.showContact && contact) leftH += 12;
    if (cfg.showEmail && email) leftH += 12;
    const block1H = Math.max(leftH, 7 * 24); // Right side has 7 rows of 24

    doc.font(F_REG).fontSize(8);
    const rightSideTextH = doc.heightOfString(cfg.termsOfDeliveryLabel, { width: midX - 8 });
    doc.fontSize(cfg.fontSize);
    const custAddrStr = data.customerAddress || "";
    const consigneeH = 12 + 14 + doc.heightOfString(custAddrStr, { width: midX - 8 }) + 8;
    const block2H = Math.max(consigneeH, rightSideTextH + 8, 40);
    const block3H = Math.max(consigneeH, 40); // Buyer block is similar

    const totalHeaderH = 24 + block1H + block2H + block3H + 20; // 24=Title, 20=TableHeader

    // HSN Computations
    const isIntra = data.isIntraState !== false;
    const taxTotal = data.items.reduce((s, i) => s + (i.taxAmount || 0), 0);
    const hsnGrouped = data.items.reduce((acc: any, item) => {
      const hsn = item.hsnSacCode || "";
      const taxable = (item.quantity * item.rate) - (item.discountAmount || 0);
      if (!acc[hsn]) acc[hsn] = { hsn, taxable: 0, cgstAmt: 0, sgstAmt: 0, igstAmt: 0, taxPct: item.taxPercent || 0, taxAmt: 0 };
      acc[hsn].taxable += taxable;
      acc[hsn].taxAmt += (item.taxAmount || 0);
      if (isIntra) {
        acc[hsn].cgstAmt += (item.taxAmount || 0) / 2;
        acc[hsn].sgstAmt += (item.taxAmount || 0) / 2;
      } else {
        acc[hsn].igstAmt += (item.taxAmount || 0);
      }
      return acc;
    }, {});
    const hsnList = Object.values(hsnGrouped) as any[];

    let summaryH = 0;
    if (taxTotal > 0) {
      summaryH += isIntra ? 32 : 16;
    }
    summaryH += 10; // pad space
    summaryH += 20; // total row
    summaryH += 36; // amount chargeable words
    summaryH += 24; // HSN header
    summaryH += hsnList.length * 16; // HSN rows
    summaryH += 16; // HSN total
    
    const footerH = 80; // Bottom Block (Words, Declaration, Signatures)
    
    const availableMidH = doc.page.height - 72 - totalHeaderH - footerH;
    const itemRowH = 20;
    
    // Pagination logic
    const pages: Array<{ items: any[], startIndex: number, isLast: boolean }> = [];
    let currentItems: InvoiceItemRow[] = [];
    let currentH = 0;
    let globalIndex = 0;
    
    for (let i = 0; i < data.items.length; i++) {
        const it = data.items[i];
        if (currentH + itemRowH > availableMidH) {
             pages.push({ items: currentItems, startIndex: globalIndex - currentItems.length, isLast: false });
             currentItems = [it];
             currentH = itemRowH;
        } else {
             currentItems.push(it);
             currentH += itemRowH;
        }
        globalIndex++;
    }
    
    // Check if the last page's items + summary fits
    if (currentH + summaryH > availableMidH) {
        pages.push({ items: currentItems, startIndex: globalIndex - currentItems.length, isLast: false });
        pages.push({ items: [], startIndex: globalIndex, isLast: true });
    } else {
        pages.push({ items: currentItems, startIndex: globalIndex - currentItems.length, isLast: true });
    }

    // Now remove the dummy page and start drawing real pages
    // Since PDFKit doesn't easily allow removing pages, we actually just don't output anything on dummy page if we can avoid it.
    // Wait, PDFKit auto adds a page when created unless autoFirstPage: false. We passed autoFirstPage: false.
    // So the dummy doc.addPage() we just did IS the first page! Let's clear it by just drawing over or replacing logic?
    // Actually, PDFKit's `addPage` just adds to the stream. 
    // It's cleaner to instantiate a fresh document for the final output.
    // Let's just create a new Promise and doc for the actual render.
    // But we already set up chunks. So we will draw on this doc, but the first page will have our stuff.
    // Since we only calculated things, nothing was drawn on the dummy page! We can just use it as Page 1.
    
    // Actually, let's just loop over pages and use doc for each.
    // First page is already added.
    let isFirstPage = true;

    pages.forEach((pageData, pageIdx) => {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;
      
      let cy = y;

      // Top border
      doc.lineWidth(1).strokeColor(tBorderColor);
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

      // TITLE
      doc.font(F_BOLD).fontSize(14).fillColor(tBorderColor);
      let pageTitle = "TAX INVOICE";
      if (pages.length > 1) {
        pageTitle += ` (Page ${pageIdx + 1} of ${pages.length})`;
      }
      doc.text(pageTitle, x, cy + 4, { width: w, align: "center" });
      cy += 24;
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

      // BLOCK 1: Org (Left) / Meta (Right)
      const block1Y = cy;
      let leftY = cy + 4;
      if (cfg.showOrgLogo && logoBuffer) {
        const logoH = Math.min(cfg.orgLogoSize || 60, 60);
        doc.image(logoBuffer, x + 4, leftY, { height: logoH });
        leftY += logoH + 4;
      }
      if (cfg.showOrgName) {
        doc.font(F_BOLD).fontSize(cfg.orgNameFontSize).fillColor(cfg.orgNameColor || "#000");
        doc.text(displayOrgName, x + 4, leftY, { width: midX - x - 8 });
        leftY += doc.heightOfString(displayOrgName, { width: midX - x - 8 }) + 2;
      }
      doc.font(F_REG).fontSize(cfg.fontSize).fillColor("#000");
      if (cfg.showOrgAddress && orgAddrStr) {
        doc.text(orgAddrStr, x + 4, leftY, { width: midX - x - 8 });
        leftY += doc.heightOfString(orgAddrStr, { width: midX - x - 8 }) + 2;
      }
      if (cfg.showGstin && gstin) {
        doc.font(F_BOLD).text(cfg.gstinLabel + ": ", x + 4, leftY, { continued: true }).font(F_REG).text(gstin);
        leftY += 12;
      }
      if (cfg.showContact && contact) {
        doc.font(F_BOLD).text(cfg.contactLabel + ": ", x + 4, leftY, { continued: true }).font(F_REG).text(contact);
        leftY += 12;
      }
      if (cfg.showEmail && email) {
        doc.font(F_BOLD).text(cfg.emailLabel + ": ", x + 4, leftY, { continued: true }).font(F_REG).text(email);
        leftY += 12;
      }

      const qW = (w / 2) / 2;
      const drawMetaCell = (cx: number, cy2: number, cw: number, h: number, label: string, value?: string, rightBorder = true, bottomBorder = true) => {
        if (rightBorder) doc.moveTo(cx + cw, cy2).lineTo(cx + cw, cy2 + h).stroke();
        if (bottomBorder) doc.moveTo(cx, cy2 + h).lineTo(cx + cw, cy2 + h).stroke();
        doc.font(F_REG).fontSize(8).text(label, cx + 4, cy2 + 2, { width: cw - 8 });
        if (value) {
          doc.font(F_BOLD).fontSize(9).text(value, cx + 4, cy2 + 12, { width: cw - 8 });
        }
      };

      const rowH = 24;
      let ry = block1Y;
      drawMetaCell(midX, ry, qW, rowH, cfg.invoiceNoLabel, data.invoiceNumber);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.datedLabel, fmtDate(data.invoiceDate), false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.deliveryNoteLabel);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.modeOfPaymentLabel, "", false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.referenceNoLabel);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.otherReferencesLabel, "", false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.buyersOrderNoLabel);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.datedLabel, "", false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.dispatchDocNoLabel);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.deliveryNoteDateLabel, "", false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.dispatchedThroughLabel);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.destinationLabel, "", false);
      ry += rowH;
      drawMetaCell(midX, ry, qW, rowH, cfg.billOfLadingLabel, "", true, false);
      drawMetaCell(midX + qW, ry, qW, rowH, cfg.motorVehicleNoLabel, "", false, false);
      ry += rowH;

      cy = Math.max(leftY, ry);
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();
      doc.moveTo(midX, block1Y).lineTo(midX, cy).stroke();

      // BLOCK 2: Consignee / Terms
      const block2Y = cy;
      doc.font(F_REG).fontSize(8).text(cfg.consigneeLabel, x + 4, block2Y + 4, { width: midX - 8 });
      doc.font(F_BOLD).fontSize(cfg.customerNameFontSize).fillColor(cfg.customerNameFontColor).text(data.customerName, x + 4, block2Y + 16, { width: midX - 8 });
      doc.font(F_REG).fontSize(cfg.fontSize).fillColor("#000").text(custAddrStr, x + 4, block2Y + 30, { width: midX - 8 });
      doc.font(F_REG).fontSize(8).text(cfg.termsOfDeliveryLabel, midX + 4, block2Y + 4, { width: midX - 8 });

      cy += block2H;
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();
      doc.moveTo(midX, block2Y).lineTo(midX, cy).stroke();

      // BLOCK 3: Buyer
      const block3Y = cy;
      doc.font(F_REG).fontSize(8).text(cfg.buyerLabel, x + 4, block3Y + 4, { width: midX - 8 });
      doc.font(F_BOLD).fontSize(cfg.customerNameFontSize).fillColor(cfg.customerNameFontColor).text(data.customerName, x + 4, block3Y + 16, { width: midX - 8 });
      doc.font(F_REG).fontSize(cfg.fontSize).fillColor("#000").text(custAddrStr, x + 4, block3Y + 30, { width: midX - 8 });

      cy += block3H;
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();
      doc.moveTo(midX, block3Y).lineTo(midX, cy).stroke();

      // ITEMS TABLE HEADER
      const activeCols: Array<{ id: string; w: number; label: string }> = [];
      if (cfg.colSlNo) activeCols.push({ id: "slno", w: 30, label: cfg.slNoLabel });
      if (cfg.colDescription) activeCols.push({ id: "desc", w: 0, label: cfg.descriptionLabel });
      if (cfg.colHsn) activeCols.push({ id: "hsn", w: 50, label: cfg.hsnLabel });
      if (cfg.colQty) activeCols.push({ id: "qty", w: 50, label: cfg.qtyLabel });
      if (cfg.colRate) activeCols.push({ id: "rate", w: 60, label: cfg.rateLabel });
      if (cfg.colPer) activeCols.push({ id: "per", w: 30, label: cfg.perLabel });
      if (cfg.colAmount) activeCols.push({ id: "amount", w: 80, label: cfg.amountLabel });

      const fixedW = activeCols.reduce((s, c) => s + c.w, 0);
      const descCol = activeCols.find(c => c.id === "desc");
      if (descCol) descCol.w = w - fixedW;

      doc.rect(x, cy, w, 20).fill(cfg.tableHeaderBgColor || "#fff");
      doc.rect(x, cy, w, 20).strokeColor(tBorderColor).stroke();
      
      let cx = x;
      doc.font(F_BOLD).fontSize(cfg.tableHeaderFontSize).fillColor(cfg.tableHeaderFontColor || "#000");
      activeCols.forEach((col, idx) => {
        if (idx > 0) doc.moveTo(cx, cy).lineTo(cx, cy + 20).stroke();
        doc.text(col.label, cx, cy + 5, { width: col.w, align: col.id === "desc" ? "left" : (col.id === "qty" || col.id === "rate" || col.id === "amount" ? "right" : "center") });
        cx += col.w;
      });
      cy += 20;

      // ITEMS
      let itemsY = cy;
      pageData.items.forEach((it, i) => {
        cx = x;
        doc.font(F_REG).fontSize(cfg.fontSize).fillColor("#000");
        
        activeCols.forEach((col) => {
          let txt = "";
          let align = "center" as any;
          if (col.id === "slno") txt = String(pageData.startIndex + i + 1);
          if (col.id === "desc") { txt = it.name; align = "left"; }
          if (col.id === "hsn") txt = it.hsnSacCode || "";
          if (col.id === "qty") { txt = String(it.quantity); align = "right"; }
          if (col.id === "rate") { txt = fmtNum(it.rate); align = "right"; }
          if (col.id === "per") txt = "Nos";
          if (col.id === "amount") { txt = fmtNum(it.amount); align = "right"; }

          if (col.id === "desc") doc.font(F_BOLD); else doc.font(F_REG);
          doc.text(txt, cx + 4, cy + 4, { width: col.w - 8, align });
          cx += col.w;
        });
        cy += 20;
      });

      // If last page, draw tax rows, total, HSN
      if (pageData.isLast) {
        if (taxTotal > 0) {
          if (isIntra) {
            cx = x;
            activeCols.forEach((col) => {
              if (col.id === "desc") {
                doc.font(F_BOLD).text("CGST", cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              } else if (col.id === "amount") {
                doc.font(F_REG).text(fmtNum(taxTotal / 2), cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              }
              cx += col.w;
            });
            cy += 16;
            cx = x;
            activeCols.forEach((col) => {
              if (col.id === "desc") {
                doc.font(F_BOLD).text("SGST", cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              } else if (col.id === "amount") {
                doc.font(F_REG).text(fmtNum(taxTotal / 2), cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              }
              cx += col.w;
            });
            cy += 16;
          } else {
            cx = x;
            activeCols.forEach((col) => {
              if (col.id === "desc") {
                doc.font(F_BOLD).text("IGST", cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              } else if (col.id === "amount") {
                doc.font(F_REG).text(fmtNum(taxTotal), cx + 4, cy + 4, { width: col.w - 8, align: "right" });
              }
              cx += col.w;
            });
            cy += 16;
          }
        }

        cy += 10; // pad space
        
        // Stretch table lines down
        cx = x;
        activeCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(cx, itemsY).lineTo(cx, cy).stroke();
          cx += col.w;
        });
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

        // TOTAL ROW
        cx = x;
        doc.font(F_BOLD).fontSize(cfg.fontSize);
        const totalQty = data.items.reduce((s, i) => s + (i.quantity || 0), 0);
        const finalTotal = data.total;
        activeCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(cx, cy).lineTo(cx, cy + 20).stroke();
          if (col.id === "desc") doc.text("Total", cx + 4, cy + 5, { width: col.w - 8, align: "right" });
          if (col.id === "qty") doc.text(String(totalQty), cx + 4, cy + 5, { width: col.w - 8, align: "right" });
          if (col.id === "amount") doc.text(fmtNum(finalTotal), cx + 4, cy + 5, { width: col.w - 8, align: "right" });
          cx += col.w;
        });
        cy += 20;
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

        // AMOUNT CHARGEABLE WORDS
        doc.font(F_REG).fontSize(8).text(cfg.amountChargeableWordsLabel, x + 4, cy + 4);
        doc.font(F_BOLD).fontSize(10).text(numberToWords(finalTotal), x + 4, cy + 16);
        cy += 36;
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

        // HSN TAX TABLE
        const hsnCols = [
          { id: "hsn", w: 80, label: "HSN/SAC" },
          { id: "taxable", w: 80, label: "Taxable Value" }
        ];
        if (isIntra) {
          hsnCols.push({ id: "cgst_rate", w: 40, label: "Rate" });
          hsnCols.push({ id: "cgst_amt", w: 60, label: "Amount" });
          hsnCols.push({ id: "sgst_rate", w: 40, label: "Rate" });
          hsnCols.push({ id: "sgst_amt", w: 60, label: "Amount" });
        } else {
          hsnCols.push({ id: "igst_rate", w: 60, label: "Rate" });
          hsnCols.push({ id: "igst_amt", w: 80, label: "Amount" });
        }
        const tTaxW = w - hsnCols.reduce((s, c) => s + c.w, 0);
        hsnCols.push({ id: "total", w: tTaxW, label: "Total Tax Amount" });

        doc.font(F_BOLD).fontSize(8);
        let hx = x;
        const hsnHeaderY = cy;
        hsnCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(hx, hsnHeaderY).lineTo(hx, hsnHeaderY + 24).stroke();
          if (col.id.includes("rate") || col.id.includes("amt")) {
            doc.text(col.label, hx, hsnHeaderY + 12, { width: col.w, align: "center" });
          } else {
            doc.text(col.label, hx, hsnHeaderY + 6, { width: col.w, align: "center" });
          }
          hx += col.w;
        });

        if (isIntra) {
          doc.moveTo(x + 160, hsnHeaderY + 12).lineTo(x + 360, hsnHeaderY + 12).stroke();
          doc.text("CGST", x + 160, hsnHeaderY + 2, { width: 100, align: "center" });
          doc.text("SGST", x + 260, hsnHeaderY + 2, { width: 100, align: "center" });
        } else {
          doc.moveTo(x + 160, hsnHeaderY + 12).lineTo(x + 300, hsnHeaderY + 12).stroke();
          doc.text("IGST", x + 160, hsnHeaderY + 2, { width: 140, align: "center" });
        }

        cy += 24;
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

        const hsnBodyY = cy;
        doc.font(F_REG);
        hsnList.forEach((h, i) => {
          hx = x;
          hsnCols.forEach((col) => {
            let txt = "";
            if (col.id === "hsn") txt = h.hsn;
            if (col.id === "taxable") txt = fmtNum(h.taxable);
            if (col.id === "cgst_rate") txt = h.taxPct ? `${h.taxPct/2}%` : "";
            if (col.id === "cgst_amt") txt = fmtNum(h.cgstAmt);
            if (col.id === "sgst_rate") txt = h.taxPct ? `${h.taxPct/2}%` : "";
            if (col.id === "sgst_amt") txt = fmtNum(h.sgstAmt);
            if (col.id === "igst_rate") txt = h.taxPct ? `${h.taxPct}%` : "";
            if (col.id === "igst_amt") txt = fmtNum(h.igstAmt);
            if (col.id === "total") txt = fmtNum(h.taxAmt);
            doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: col.id === "hsn" ? "left" : "right" });
            hx += col.w;
          });
          cy += 16;
        });

        hx = x;
        hsnCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(hx, hsnBodyY).lineTo(hx, cy).stroke();
          hx += col.w;
        });
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

        hx = x;
        doc.font(F_BOLD);
        hsnCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(hx, cy).lineTo(hx, cy + 16).stroke();
          let txt = "";
          if (col.id === "hsn") { txt = "Total"; doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          if (col.id === "taxable") { txt = fmtNum(hsnList.reduce((s,a)=>s+a.taxable,0)); doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          if (col.id === "cgst_amt") { txt = fmtNum(hsnList.reduce((s,a)=>s+a.cgstAmt,0)); doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          if (col.id === "sgst_amt") { txt = fmtNum(hsnList.reduce((s,a)=>s+a.sgstAmt,0)); doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          if (col.id === "igst_amt") { txt = fmtNum(hsnList.reduce((s,a)=>s+a.igstAmt,0)); doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          if (col.id === "total") { txt = fmtNum(hsnList.reduce((s,a)=>s+a.taxAmt,0)); doc.text(txt, hx + 4, cy + 4, { width: col.w - 8, align: "right" }); }
          hx += col.w;
        });
        cy += 16;
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

      } else {
        // Not the last page, just stretch table down to available space and say Continued
        const remainH = doc.page.height - 72 - footerH - cy;
        cy += remainH;
        cx = x;
        activeCols.forEach((col, idx) => {
          if (idx > 0) doc.moveTo(cx, itemsY).lineTo(cx, cy).stroke();
          cx += col.w;
        });
        doc.moveTo(x, cy).lineTo(x + w, cy).stroke();
      }

      // BOTTOM BLOCK: Words, Declaration & Signatures
      // On intermediate pages, we just draw empty box or repeated footer? The user asked "header footer ui remian same".
      // We will draw it at a fixed bottom position so it looks consistent.
      cy = doc.page.height - 36 - footerH;
      doc.moveTo(midX, cy).lineTo(midX, cy + footerH).stroke();
      
      // Left side: Words & Declaration
      if (pageData.isLast) {
        doc.font(F_REG).fontSize(8).text(cfg.taxAmountWordsLabel, x + 4, cy + 4, { width: midX - x - 8 });
        doc.font(F_BOLD).fontSize(9).text(numberToWords(taxTotal), x + 4, cy + 14, { width: midX - x - 8 });
      } else {
        doc.font(F_REG).fontSize(8).text("Continued to next page...", x + 4, cy + 4, { width: midX - x - 8 });
      }

      if (cfg.showDeclaration) {
        doc.font(F_BOLD).fontSize(8).text(cfg.declarationLabel, x + 4, cy + 32, { underline: true });
        doc.font(F_REG).text(cfg.declarationText, x + 4, cy + 44, { width: midX - x - 8 });
      }

      // Right side: Signatures
      if (cfg.showSignature) {
        const sx = midX;
        doc.font(F_BOLD).fontSize(10).text(`For ${displayOrgName}`, sx + 4, cy + 4, { width: midX - x - 8, align: "right" });
        doc.font(F_REG).fontSize(8).text(cfg.authSignatoryLabel, sx + 4, cy + footerH - 12, { width: midX - x - 8, align: "right" });
        
        doc.moveTo(sx + 10, cy + footerH - 16).lineTo(sx + 150, cy + footerH - 16).stroke();
        doc.text(cfg.customerSealLabel, sx + 10, cy + footerH - 12, { width: 140, align: "center" });
      }

      cy += footerH;
      doc.moveTo(x, cy).lineTo(x + w, cy).stroke();

      // Close borders
      doc.moveTo(x + w, 36).lineTo(x + w, cy).stroke();
      doc.moveTo(x, 36).lineTo(x, cy).stroke();
    });

    doc.end();
  });
}
