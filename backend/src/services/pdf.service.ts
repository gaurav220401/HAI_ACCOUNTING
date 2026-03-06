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
