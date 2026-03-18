import PDFDocument from "pdfkit";

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
  orgTaxId?: string; // GSTIN / PAN

  // Customer
  customerName: string;
  customerAddress?: string;
  customerEmail?: string;

  // Invoice meta
  invoiceNumber: string;
  invoiceDate: string; // ISO or any Date string
  dueDate?: string;
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

export interface PurchaseOrderItemRow {
  name: string;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface PurchaseOrderPdfData {
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

function fmt(n: number, symbol = "₹"): string {
  return (
    symbol +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Generate a clean invoice PDF and return it as a Buffer.
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

    const pageW = doc.page.width - 100; // content width after margins
    const sym = data.currencySymbol ?? "₹";

    // ── Header band ────────────────────────────────────────────
    doc
      .rect(50, 40, pageW, 70)
      .fill("#2563eb")
      .fillColor("#ffffff")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("INVOICE", 65, 58)
      .fontSize(10)
      .font("Helvetica")
      .text(`#${data.invoiceNumber}`, 65, 82);

    // Org name / address top-right
    const orgLines = [
      data.orgName,
      data.orgAddress?.street,
      [data.orgAddress?.city, data.orgAddress?.state, data.orgAddress?.zip]
        .filter(Boolean)
        .join(", "),
      data.orgAddress?.country,
      data.orgTaxId ? `GSTIN: ${data.orgTaxId}` : undefined,
    ].filter(Boolean) as string[];

    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(orgLines[0], 50, 50, { align: "right", width: pageW })
      .font("Helvetica");
    orgLines.slice(1).forEach((line, i) => {
      doc.text(line, 50, 62 + i * 11, { align: "right", width: pageW });
    });

    let y = 125;

    // ── Bill To / Invoice Details two-column ───────────────────
    doc.fillColor("#1e3a5f").fontSize(8).font("Helvetica-Bold");
    doc.text("BILL TO", 50, y);
    doc.text("INVOICE DETAILS", 310, y);

    y += 13;
    doc.fillColor("#111827").font("Helvetica").fontSize(9);

    // Left column: customer
    const billLines = [
      data.customerName,
      data.customerAddress,
      data.customerEmail,
    ].filter(Boolean) as string[];
    billLines.forEach((line, i) => {
      doc.text(line, 50, y + i * 13, { width: 230 });
    });

    // Right column: invoice meta
    const metaRows: [string, string][] = [
      ["Invoice No:", data.invoiceNumber],
      ["Invoice Date:", fmtDate(data.invoiceDate)],
    ];
    if (data.dueDate) metaRows.push(["Due Date:", fmtDate(data.dueDate)]);
    if (data.orderNumber) metaRows.push(["Order No:", data.orderNumber]);

    metaRows.forEach(([label, value], i) => {
      doc.font("Helvetica-Bold").text(label, 310, y + i * 13, { width: 100 });
      doc.font("Helvetica").text(value, 415, y + i * 13, { width: 145 });
    });

    y += Math.max(billLines.length, metaRows.length) * 13 + 20;

    // subject
    if (data.subject) {
      doc
        .fillColor("#374151")
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(data.subject, 50, y, { width: pageW });
      y += 18;
    }

    // ── Items table ────────────────────────────────────────────
    // Header row
    const colX = {
      item: 50,
      hsn: 250,
      qty: 300,
      rate: 350,
      disc: 400,
      amt: 450,
    };
    const rowH = 16;

    doc.rect(50, y, pageW, rowH).fill("#f3f4f6");
    doc
      .fillColor("#374151")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("ITEM", colX.item + 4, y + 4)
      .text("HSN/SAC", colX.hsn, y + 4, { width: 45 })
      .text("QTY", colX.qty, y + 4, { width: 45, align: "right" })
      .text("RATE", colX.rate, y + 4, { width: 45, align: "right" })
      .text("TAX%", colX.disc, y + 4, { width: 45, align: "right" })
      .text("AMOUNT", colX.amt, y + 4, { width: pageW - 400, align: "right" });
    y += rowH;

    // Data rows
    doc.font("Helvetica").fontSize(8.5);
    data.items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
      const lineH = item.description ? 26 : 16;
      doc.rect(50, y, pageW, lineH).fill(bg);
      doc.fillColor("#111827");
      doc
        .font("Helvetica-Bold")
        .text(item.name, colX.item + 4, y + 3, { width: 192 });
      if (item.description) {
        doc
          .font("Helvetica")
          .fillColor("#6b7280")
          .fontSize(7.5)
          .text(item.description, colX.item + 4, y + 14, { width: 192 });
      }
      doc
        .fillColor("#111827")
        .font("Helvetica")
        .fontSize(8.5)
        .text(item.hsnSacCode || "", colX.hsn, y + 3, { width: 45 })
        .text(String(item.quantity), colX.qty, y + 3, {
          width: 45,
          align: "right",
        })
        .text(fmt(item.rate, sym), colX.rate, y + 3, {
          width: 45,
          align: "right",
        })
        .text(item.taxPercent ? `${item.taxPercent}%` : "", colX.disc, y + 3, {
          width: 45,
          align: "right",
        })
        .text(fmt(item.amount, sym), colX.amt, y + 3, {
          width: pageW - 400,
          align: "right",
        });
      y += lineH;
    });

    // bottom border of table
    doc
      .moveTo(50, y)
      .lineTo(50 + pageW, y)
      .strokeColor("#e5e7eb")
      .stroke();
    y += 10;

    // ── Totals block (right-aligned) ───────────────────────────
    const totColLabel = 370;
    const totColValue = 470;
    const totW = 80;

    const addTotalRow = (
      label: string,
      value: string,
      bold = false,
      color = "#111827",
    ) => {
      if (bold) {
        doc.font("Helvetica-Bold");
      } else {
        doc.font("Helvetica");
      }
      doc
        .fillColor("#374151")
        .fontSize(8.5)
        .text(label, totColLabel, y, { width: 95 });
      doc
        .fillColor(color)
        .text(value, totColValue, y, { width: totW, align: "right" });
      y += 14;
    };

    addTotalRow("Sub Total", fmt(data.subTotal, sym));
    if (data.discountAmount && data.discountAmount !== 0) {
      const discLabel =
        data.discountType === "percent" ?
          `Discount (${data.discountValue}%)`
        : "Discount";
      addTotalRow(discLabel, `- ${fmt(data.discountAmount, sym)}`);
    }
    if (data.taxAmount && data.taxAmount !== 0) {
      addTotalRow("Tax", fmt(data.taxAmount, sym));
    }
    if (data.adjustmentAmount && data.adjustmentAmount !== 0) {
      addTotalRow(
        data.adjustmentLabel || "Adjustment",
        fmt(data.adjustmentAmount, sym),
      );
    }
    y += 2;
    doc
      .moveTo(totColLabel, y)
      .lineTo(totColLabel + 95 + totW, y)
      .strokeColor("#d1d5db")
      .stroke();
    y += 4;
    addTotalRow("TOTAL", fmt(data.total, sym), true, "#2563eb");
    if (data.balanceDue !== undefined && data.balanceDue !== data.total) {
      addTotalRow("Balance Due", fmt(data.balanceDue, sym), true, "#dc2626");
    }

    y += 16;

    // ── Notes / Terms ──────────────────────────────────────────
    if (data.customerNotes) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#374151")
        .text("Notes", 50, y);
      y += 13;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#4b5563")
        .text(data.customerNotes, 50, y, { width: pageW });
      y += doc.heightOfString(data.customerNotes, { width: pageW }) + 10;
    }

    if (data.termsAndConditions) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor("#374151")
        .text("Terms & Conditions", 50, y);
      y += 13;
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#4b5563")
        .text(data.termsAndConditions, 50, y, { width: pageW });
    }

    // ── Footer ─────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc
      .moveTo(50, footerY - 5)
      .lineTo(50 + pageW, footerY - 5)
      .strokeColor("#e5e7eb")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#9ca3af")
      .text("Generated by HAI Accounting", 50, footerY, {
        align: "center",
        width: pageW,
      });

    doc.end();
  });
}

export function generatePurchaseOrderPdf(
  data: PurchaseOrderPdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - 120;
    const sym = data.currencySymbol ?? "₹";

    let orgAddressCity = "";
    if (data.orgAddress) {
      if (typeof data.orgAddress === "string") {
        orgAddressCity = data.orgAddress;
      } else if (data.orgAddress.city) {
        orgAddressCity = data.orgAddress.city;
      }
    }

    // Top block
    doc.font("Times-Bold").fontSize(13).fillColor("#000000").text(data.orgName, 60, 60);

    let yOrg = 78;
    doc.font("Times-Roman").fontSize(10).fillColor("#4b5563");
    if (orgAddressCity) {
      doc.text(orgAddressCity, 60, yOrg);
      yOrg += 14;
    }
    doc.text("India", 60, yOrg);
    yOrg += 14;
    // Add orgEmail / orgPhone if they exist but we only have standard data here

    // Title Block
    doc
      .font("Times-Bold")
      .fontSize(24)
      .fillColor("#1e3a5f")
      .text("PURCHASE ORDER", 60, 60, { width: pageW, align: "right" });
    doc
      .font("Times-Roman")
      .fontSize(11)
      .fillColor("#4b5563")
      .text(`# ${data.purchaseOrderNumber}`, 60, 85, {
        width: pageW,
        align: "right",
      });

    // Address Headings
    let yAddresses = Math.max(yOrg, 110) + 30;

    doc.font("Times-Roman").fontSize(9).fillColor("#6b7280");
    doc.text("Vendor Address", 60, yAddresses);
    doc.text("Deliver To", 300, yAddresses);
    yAddresses += 14;

    // Vendor and Deliver To info
    doc
      .font("Times-Bold")
      .fontSize(11)
      .fillColor("#2563eb")
      .text(data.vendorName, 60, yAddresses, { width: 220 });

    let yVend =
      yAddresses + doc.heightOfString(data.vendorName, { width: 220 }) + 5;

    let yDeliv = yAddresses;
    doc.font("Times-Roman").fontSize(10).fillColor("#4b5563");
    doc.text(data.orgName, 300, yDeliv);
    yDeliv += 13;
    if (orgAddressCity) {
      doc.text(orgAddressCity, 300, yDeliv);
      yDeliv += 13;
    }
    doc.text("India", 300, yDeliv);
    yDeliv += 13;

    let yNext = Math.max(yVend, yDeliv) + 25;

    // Date & Meta
    doc
      .font("Times-Roman")
      .fontSize(10)
      .fillColor("#4b5563")
      .text(`Date : ${fmtDate(data.purchaseOrderDate)}`, 60, yNext, {
        width: pageW,
        align: "right",
      });
    if (data.deliveryDate) {
      yNext += 13;
      doc.text(`Expected Delivery : ${fmtDate(data.deliveryDate)}`, 60, yNext, {
        width: pageW,
        align: "right",
      });
    }
    yNext += 20;

    // Items table header
    doc.rect(60, yNext, pageW, 25).fill("#3a3a3a");
    const colHash = 60,
      colItem = 100,
      colQty = 340,
      colRate = 390,
      colAmt = 460;

    doc.fillColor("#ffffff").font("Times-Bold").fontSize(10);
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
        .moveTo(60, yNext)
        .lineTo(60 + pageW, yNext)
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
      .lineTo(60 + pageW, yNext - 4)
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
        .text("Notes", 60, yNext);
      yNext += 15;
      doc
        .font("Times-Roman")
        .fontSize(10)
        .fillColor("#4b5563")
        .text(data.notes, 60, yNext, { width: pageW });
      yNext += doc.heightOfString(data.notes, { width: pageW }) + 10;
    }

    yNext += 40;
    if (yNext > doc.page.height - 100) {
      doc.addPage();
      yNext = 60;
    }
    doc
      .font("Times-Roman")
      .fontSize(10)
      .fillColor("#4b5563")
      .text("Authorized Signature ____________________________", 60, yNext);

    doc.end();
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
