import nodemailer, { Transporter } from "nodemailer";
import Organization from "../models/organization.model";

/**
 * Translate raw nodemailer/SMTP errors into user-friendly messages.
 */
function translateSmtpError(err: any): string {
  const msg: string = err?.message || "Unknown SMTP error";

  // Gmail / Google Workspace — wrong password or 2FA with no App Password
  if (msg.includes("535") && msg.includes("BadCredentials")) {
    return (
      "Gmail rejected the password. " +
      "You must use a Google App Password (not your regular account password). " +
      "Go to https://myaccount.google.com/apppasswords, generate an App Password " +
      'for "Mail", and paste it into the SMTP Password field.'
    );
  }

  // Generic auth failure
  if (
    msg.includes("535") ||
    msg.includes("Invalid login") ||
    msg.includes("Authentication")
  ) {
    return (
      "SMTP authentication failed. Check your username and password. " +
      "If you use Gmail, you need an App Password — see https://myaccount.google.com/apppasswords"
    );
  }

  // Connection / host errors
  if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
    return `Cannot connect to the SMTP server. Check your host and port settings. (${msg})`;
  }

  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return "Connection to SMTP server timed out. Check your host, port and firewall settings.";
  }

  if (
    msg.includes("certificate") ||
    msg.includes("SSL") ||
    msg.includes("TLS")
  ) {
    return 'SSL/TLS error. Try toggling the "Use SSL/TLS" switch or changing the port (587 for STARTTLS, 465 for SSL).';
  }

  return msg;
}

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface SendInvoiceEmailOptions {
  organizationId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  invoiceNumber: string;
  invoiceTotal: number;
  invoiceDate: string;
  dueDate?: string;
  customerName: string;
  attachments?: EmailAttachment[];
}

export interface SendPurchaseOrderEmailOptions {
  organizationId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  purchaseOrderNumber: string;
  purchaseOrderTotal: number;
  purchaseOrderDate: string;
  vendorName: string;
  attachments?: EmailAttachment[];
  rawBody?: boolean;
}

export interface SendQuoteEmailOptions {
  organizationId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  quoteNumber: string;
  quoteTotal: number;
  quoteDate: string;
  expiryDate?: string;
  customerName: string;
  attachments?: EmailAttachment[];
}

function buildInvoiceHtml(opts: SendInvoiceEmailOptions): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const bodyHtml = opts.body
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">${opts.body.replace(/\n/g, "<br/>")}</p>`
    : `<p>Dear ${opts.customerName},</p>
       <p>Thank you for your business. Please find your invoice details below.</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${opts.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#2563eb;padding:24px 32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">Invoice #${opts.invoiceNumber}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
              <!-- Invoice summary -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:24px;border:1px solid #fde68a;border-radius:8px;background:#fefce8;overflow:hidden;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Invoice Amount</div>
                    <div style="font-size:28px;font-weight:800;color:#dc2626;margin:8px 0;">${fmt(opts.invoiceTotal)}</div>
                    <table width="240" cellpadding="4" cellspacing="0" align="center" style="font-size:12px;">
                      <tr>
                        <td style="color:#6b7280;">Invoice No</td>
                        <td align="right" style="font-weight:600;">${opts.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;">Invoice Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.invoiceDate)}</td>
                      </tr>
                      ${
                        opts.dueDate ?
                          `<tr>
                        <td style="color:#6b7280;">Due Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.dueDate)}</td>
                      </tr>`
                        : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
              This email was sent automatically by HAI Accounting.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildPurchaseOrderHtml(opts: SendPurchaseOrderEmailOptions & { rawBody?: boolean }): string {
  if (opts.rawBody) {
    return opts.body || "";
  }
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const bodyHtml = opts.body
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">${opts.body.replace(/\n/g, "<br/>")}</p>`
    : `<p>Dear ${opts.vendorName},</p>
       <p>Please find the purchase order details below.</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Purchase Order ${opts.purchaseOrderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#0f766e;padding:24px 32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">Purchase Order #${opts.purchaseOrderNumber}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:24px;border:1px solid #ccfbf1;border-radius:8px;background:#f0fdfa;overflow:hidden;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Purchase Order Amount</div>
                    <div style="font-size:28px;font-weight:800;color:#0f766e;margin:8px 0;">${fmt(opts.purchaseOrderTotal)}</div>
                    <table width="260" cellpadding="4" cellspacing="0" align="center" style="font-size:12px;">
                      <tr>
                        <td style="color:#6b7280;">PO Number</td>
                        <td align="right" style="font-weight:600;">${opts.purchaseOrderNumber}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;">PO Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.purchaseOrderDate)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
              This email was sent automatically by HAI Accounting.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendInvoiceEmail(
  opts: SendInvoiceEmailOptions,
): Promise<void> {
  const org = await Organization.findById(opts.organizationId).lean();
  if (!org) throw new Error("Organization not found");

  const smtp = org.smtpSettings;
  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    throw new Error(
      "SMTP is not configured. Please set up your email settings in Settings → Email.",
    );
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const fromName = smtp.fromName || org.name;
  const fromEmail = smtp.fromEmail || smtp.user;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to.join(", "),
      cc: opts.cc?.join(", "),
      bcc: opts.bcc?.join(", "),
      subject: opts.subject,
      html: buildInvoiceHtml(opts),
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        path: a.path,
        contentType: a.contentType,
      })),
    });
  } catch (err: any) {
    throw new Error(translateSmtpError(err));
  }
}

export async function sendPurchaseOrderEmail(
  opts: SendPurchaseOrderEmailOptions,
): Promise<void> {
  const org = await Organization.findById(opts.organizationId).lean();
  if (!org) throw new Error("Organization not found");

  const smtp = org.smtpSettings;
  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    throw new Error(
      "SMTP is not configured. Please set up your email settings in Settings -> Email.",
    );
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const fromName = smtp.fromName || org.name;
  const fromEmail = smtp.fromEmail || smtp.user;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to.join(", "),
      cc: opts.cc?.join(", "),
      bcc: opts.bcc?.join(", "),
      subject: opts.subject,
      html: buildPurchaseOrderHtml(opts),
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        path: a.path,
        contentType: a.contentType,
      })),
    });
  } catch (err: any) {
    throw new Error(translateSmtpError(err));
  }
}

// ─── Sales Order Email ────────────────────────────────────────────────

export interface SendSalesOrderEmailOptions {
  organizationId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  order: any;
  organization: any;
  pdfBuffer?: Buffer | null;
}

function buildSalesOrderHtml(opts: SendSalesOrderEmailOptions): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const taxMode = (line: any): "igst" | "gst" => {
    const tax = line?.taxId;
    if (tax && typeof tax === "object") {
      const name = String(tax.name || "").trim().toUpperCase();
      const authority = String(tax.taxAuthority || "").trim().toUpperCase();
      if (authority === "IGST" || name.startsWith("IGST")) return "igst";
    }
    return "gst";
  };

  const formatRate = (value: number) =>
    Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const taxRows = (() => {
    const rows = new Map<string, number>();
    const addRow = (label: string, amount: number) => {
      rows.set(label, (rows.get(label) || 0) + amount);
    };

    (opts.order?.lineItems || []).forEach((line: any) => {
      const taxAmt = Number(line?.taxAmount || 0);
      const taxPercent = Number(line?.taxPercent || 0);
      if (taxAmt <= 0) return;

      if (taxMode(line) === "igst") {
        addRow(taxPercent > 0 ? `IGST (${formatRate(taxPercent)}%)` : "IGST", taxAmt);
        return;
      }

      const halfPercent = taxPercent / 2;
      addRow(taxPercent > 0 ? `CGST (${formatRate(halfPercent)}%)` : "CGST", taxAmt / 2);
      addRow(taxPercent > 0 ? `SGST (${formatRate(halfPercent)}%)` : "SGST", taxAmt / 2);
    });

    return Array.from(rows.entries()).map(([label, amount]) => ({ label, amount }));
  })();

  const customerRef = opts.order?.customerId;
  const customerName =
    typeof customerRef === "object"
      ? customerRef?.displayName || customerRef?.companyName || ""
      : "";
  const orgName = opts.organization?.name || "HAI";

  const bodyTextHtml = opts.body
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">${opts.body.replace(/\n/g, "<br/>")}</p>`
    : `<p style="margin:0 0 16px;font-size:14px;color:#374151;">Dear ${customerName},</p>
       <p style="margin:0 0 16px;font-size:14px;color:#374151;">Thanks for your interest in our services. Please find our sales order attached with this mail.</p>
       <p style="margin:0 0 8px;font-size:14px;color:#374151;">An overview of the sales order is available below for your reference:</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sales Order ${opts.order?.salesOrderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#7c3aed;padding:24px 32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">Sales Order #${opts.order?.salesOrderNumber}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyTextHtml}
              
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:16px;border:1px solid #e9d5ff;border-radius:8px;background:#faf5ff;overflow:hidden;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Sales Order</div>
                    <div style="font-size:28px;font-weight:800;color:#7c3aed;margin:8px 0;">${fmt(opts.order?.total || 0)}</div>
                    <table width="260" cellpadding="4" cellspacing="0" align="center" style="font-size:12px;">
                      <tr>
                        <td style="color:#6b7280;">Sales Order #</td>
                        <td align="right" style="font-weight:600;">${opts.order?.salesOrderNumber}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;">Order Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.order?.orderDate)}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280; border-top: 1px solid #eee; padding-top: 8px;">Sub Total</td>
                        <td align="right" style="font-weight:600; border-top: 1px solid #eee; padding-top: 8px;">${fmt(opts.order?.subTotal || 0)}</td>
                      </tr>
                      ${taxRows.map((row) => `
                        <tr>
                          <td style="color:#6b7280;">${row.label}</td>
                          <td align="right" style="font-weight:600;">${fmt(row.amount)}</td>
                        </tr>
                      `).join("")}
                      ${
                        (Number(opts.order?.shippingCharges || 0) + Number(opts.order?.adjustment || 0)) !== 0 ?
                          `<tr>
                            <td style="color:#6b7280;">Shipping & Adj.</td>
                            <td align="right" style="font-weight:600;">${fmt(Number(opts.order?.shippingCharges || 0) + Number(opts.order?.adjustment || 0))}</td>
                          </tr>`
                        : ""
                      }
                      <tr>
                        <td style="color:#7c3aed; font-weight:700; border-top: 2px solid #7c3aed; padding-top: 8px;">Total Amount</td>
                        <td align="right" style="color:#7c3aed; font-weight:700; border-top: 2px solid #7c3aed; padding-top: 8px;">${fmt(opts.order?.total || 0)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin:24px 0 0;font-size:14px;color:#374151;">Assuring you of our best services at all times.</p>
              <br/>
              <p style="margin:0;font-size:14px;color:#374151;">Regards,<br/><strong>${orgName}</strong></p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
              This email was sent automatically by HAI Accounting.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendSalesOrderEmail(
  opts: SendSalesOrderEmailOptions,
): Promise<void> {
  const org = await Organization.findById(opts.organizationId).lean();
  if (!org) throw new Error("Organization not found");

  const smtp = org.smtpSettings;
  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    throw new Error(
      "SMTP is not configured. Please set up your email settings in Settings → Email.",
    );
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const fromName = smtp.fromName || org.name;
  const fromEmail = smtp.fromEmail || smtp.user;

  const attachments: any[] = [];
  if (opts.pdfBuffer) {
    attachments.push({
      filename: `${opts.order?.salesOrderNumber || "SalesOrder"}.pdf`,
      content: opts.pdfBuffer,
      contentType: "application/pdf",
    });
  }

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to.join(", "),
      cc: opts.cc?.join(", "),
      bcc: opts.bcc?.join(", "),
      subject: opts.subject,
      html: buildSalesOrderHtml(opts),
      attachments,
    });
  } catch (err: any) {
    throw new Error(translateSmtpError(err));
  }
}

// ─── Quote Email ─────────────────────────────────────────────────────

function buildQuoteHtml(opts: SendQuoteEmailOptions): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(n);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const bodyHtml = opts.body
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;">${opts.body.replace(/\n/g, "<br/>")}</p>`
    : `<p>Dear ${opts.customerName},</p>
       <p>Please find the quote details below.</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quote ${opts.quoteNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#4b5563;padding:24px 32px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:20px;">Quote #${opts.quoteNumber}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-top:24px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;overflow:hidden;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;">Quote Amount</div>
                    <div style="font-size:28px;font-weight:800;color:#111827;margin:8px 0;">${fmt(opts.quoteTotal)}</div>
                    <table width="240" cellpadding="4" cellspacing="0" align="center" style="font-size:12px;">
                      <tr>
                        <td style="color:#6b7280;">Quote #</td>
                        <td align="right" style="font-weight:600;">${opts.quoteNumber}</td>
                      </tr>
                      <tr>
                        <td style="color:#6b7280;">Quote Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.quoteDate)}</td>
                      </tr>
                      ${
                        opts.expiryDate ?
                          `<tr>
                        <td style="color:#6b7280;">Expiry Date</td>
                        <td align="right" style="font-weight:600;">${fmtDate(opts.expiryDate)}</td>
                      </tr>`
                        : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
              This email was sent automatically by HAI Accounting.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendQuoteEmail(
  opts: SendQuoteEmailOptions,
): Promise<void> {
  const org = await Organization.findById(opts.organizationId).lean();
  if (!org) throw new Error("Organization not found");

  const smtp = org.smtpSettings;
  if (!smtp?.host || !smtp?.user || !smtp?.pass) {
    throw new Error(
      "SMTP is not configured. Please set up your email settings in Settings → Email.",
    );
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port ?? 587,
    secure: smtp.secure ?? false,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const fromName = smtp.fromName || org.name;
  const fromEmail = smtp.fromEmail || smtp.user;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to.join(", "),
      cc: opts.cc?.join(", "),
      bcc: opts.bcc?.join(", "),
      subject: opts.subject,
      html: buildQuoteHtml(opts),
      attachments: opts.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        path: a.path,
        contentType: a.contentType,
      })),
    });
  } catch (err: any) {
    throw new Error(translateSmtpError(err));
  }
}
