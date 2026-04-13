import { Response } from "express";
import { Types } from "mongoose";
import Organization from "../models/organization.model";
import User from "../models/user.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";
import { attachUser } from "../plugins/auditTrail.plugin";
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from "../utils/errors";
import { ensureDefaultChartOfAccounts } from "../services/chart-of-accounts.service";
import { upsertDefaultUnits } from "../utils/defaultUnits"; // auto-seed GST units on org creation

// â”€â”€ Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** Assert that the calling user is a member of the org, then return it. */
async function requireMembership(orgId: string, req: AuthenticatedRequest) {
  const userId = req.user?._id;
  if (!userId) throw new ForbiddenError("Not authenticated");
  const org = await Organization.findOne({ _id: orgId, members: userId });
  if (!org) throw new NotFoundError("Organization");
  return org;
}

function normalizeOrgName(name: unknown): string {
  return String(name ?? "").trim();
}

function isOrgNameDuplicateError(error: any): boolean {
  if (error?.code !== 11000) return false;
  const keyPattern = error?.keyPattern || {};
  const msg = String(error?.message || "");
  return Boolean(
    keyPattern?.owner ||
      keyPattern?.name ||
      msg.includes("owner_1_name_1") ||
      msg.includes("name_1"),
  );
}

/**
 * POST /api/organizations
 * Create a new organization (any authenticated user).
 */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");

    const {
      name,
      industry,
      baseCurrency,
      fiscalYearStart,
      country,
      timezone,
      dateFormat,
      numberFormat,
      language,
      taxId,
      logo,
      address,
    } = req.body;

    const normalizedName = normalizeOrgName(name);
    if (!normalizedName) {
      throw new ValidationError("Organization name is required");
    }

    // Organization name must be unique per owner (case-insensitive).
    const existing = await Organization.findOne({
      owner: req.user._id,
      name: normalizedName,
      isDeleted: { $ne: true },
    }).collation({ locale: "en", strength: 2 });
    if (existing) {
      throw new ValidationError(`Organization "${normalizedName}" already exists for your account`);
    }

    const organization = new Organization({
      name: normalizedName,
      industry,
      baseCurrency,
      fiscalYearStart,
      country,
      timezone,
      dateFormat,
      numberFormat,
      language,
      taxId,
      logo,
      address,
      owner: req.user._id,
      members: [req.user._id],   // creator is automatically the first member
    });

    attachUser(organization, req);
    try {
      await organization.save();
    } catch (error: any) {
      if (isOrgNameDuplicateError(error)) {
        throw new ValidationError(
          `Organization "${normalizedName}" already exists for your account`,
        );
      }
      throw error;
    }

    // Seed standard chart of accounts for every new organization.
    await ensureDefaultChartOfAccounts({
      organizationId: organization._id as Types.ObjectId,
      actor: req,
    });

    // Set as active org for the creating user if they don't have one yet
    if (!req.user.activeOrganization) {
      req.user.activeOrganization = organization._id;
      await req.user.save();
    }

    // Auto-seed the 13 GST-standard units for every new org — non-fatal
    upsertDefaultUnits(organization._id).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Organization "${normalizedName}" created successfully`,
      data: organization,
    });
  },
);

/**
 * GET /api/organizations
 * List ONLY the organizations the calling user is a member of.
 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");
    const organizations = await Organization.find({ members: req.user._id }).sort({ name: 1 });
    res.json({ success: true, data: organizations });
  },
);

/**
 * GET /api/organizations/:id
 * Only accessible if the calling user is a member.
 */
export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);
    res.json({ success: true, data: organization });
  },
);

/**
 * PUT /api/organizations/:id
 * Only members can update (owner / member â€“ you can tighten to owner only later).
 */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);

    if (req.body.name !== undefined) {
      const nextName = normalizeOrgName(req.body.name);
      if (!nextName) {
        throw new ValidationError("Organization name is required");
      }

      const ownerId = (organization as any).owner || req.user?._id;
      if (ownerId) {
        const duplicate = await Organization.findOne({
          _id: { $ne: (organization as any)._id },
          owner: ownerId,
          name: nextName,
          isDeleted: { $ne: true },
        }).collation({ locale: "en", strength: 2 });

        if (duplicate) {
          throw new ValidationError(
            `Organization "${nextName}" already exists for your account`,
          );
        }
      }

      (organization as any).name = nextName;
    }

    const allowedFields = [
      "industry",
      "baseCurrency",
      "fiscalYearStart",
      "country",
      "timezone",
      "dateFormat",
      "numberFormat",
      "language",
      "taxId",
      "logo",
      "address",
      "portalSettings",
      "reminderSettings",
      "openingBalanceSettings",
      "defaultAccounts",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (organization as any)[field] = req.body[field];
      }
    }

    attachUser(organization, req);
    try {
      await organization.save();
    } catch (error: any) {
      if (isOrgNameDuplicateError(error)) {
        throw new ValidationError(
          `Organization "${organization.name}" already exists for your account`,
        );
      }
      throw error;
    }

    res.json({
      success: true,
      message: `Organization "${organization.name}" updated`,
      data: organization,
    });
  },
);

/**
 * GET /api/organizations/:id/reminder-settings
 */
export const getReminderSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);
    const settings = (organization as any).reminderSettings || {
      enabled: false,
      sendInvoiceDueReminder: true,
      invoiceDueDaysBefore: 3,
      sendPaymentDueReminder: true,
      paymentDueFrequencyDays: 7,
    };

    res.json({ success: true, data: settings });
  },
);

/**
 * PUT /api/organizations/:id/reminder-settings
 */
export const updateReminderSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);

    const incoming = req.body || {};
    const invoiceDueDaysBefore = Number(incoming.invoiceDueDaysBefore ?? 3);
    const paymentDueFrequencyDays = Number(incoming.paymentDueFrequencyDays ?? 7);

    if (!Number.isFinite(invoiceDueDaysBefore) || invoiceDueDaysBefore < 0 || invoiceDueDaysBefore > 365) {
      throw new ValidationError("invoiceDueDaysBefore must be between 0 and 365");
    }
    if (!Number.isFinite(paymentDueFrequencyDays) || paymentDueFrequencyDays < 1 || paymentDueFrequencyDays > 365) {
      throw new ValidationError("paymentDueFrequencyDays must be between 1 and 365");
    }

    (organization as any).reminderSettings = {
      enabled: Boolean(incoming.enabled),
      sendInvoiceDueReminder: incoming.sendInvoiceDueReminder !== false,
      invoiceDueDaysBefore: Math.round(invoiceDueDaysBefore),
      sendPaymentDueReminder: incoming.sendPaymentDueReminder !== false,
      paymentDueFrequencyDays: Math.round(paymentDueFrequencyDays),
    };

    attachUser(organization, req);
    await organization.save();

    res.json({
      success: true,
      message: "Reminder settings updated",
      data: (organization as any).reminderSettings,
    });
  },
);

/**
 * GET /api/organizations/:id/portal-settings
 */
export const getPortalSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);
    res.json({
      success: true,
      data: (organization as any).portalSettings || { enabled: false, subdomain: "" },
    });
  },
);

/**
 * PUT /api/organizations/:id/portal-settings
 */
export const updatePortalSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await requireMembership(String(req.params.id), req);

    const enabled = Boolean(req.body?.enabled);
    const subdomain = String(req.body?.subdomain || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 40);

    (organization as any).portalSettings = { enabled, subdomain };

    attachUser(organization, req);
    await organization.save();

    res.json({
      success: true,
      message: "Customer portal settings updated",
      data: (organization as any).portalSettings,
    });
  },
);

/**
 * DELETE /api/organizations/:id (soft delete)
 * Only the owner (or Admin role) may delete.
 */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");

    const organization = await Organization.findById(String(req.params.id));
    if (!organization) throw new NotFoundError("Organization");

    const isOwner = organization.owner?.toString() === req.user._id.toString();
    const isAdmin = req.user.roles?.includes("Admin");
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Only the organization owner can delete it");
    }

    await (organization as any).softDelete(req.user._id.toString());

    res.json({
      success: true,
      message: `Organization "${organization.name}" deleted`,
    });
  },
);

/**
 * PUT /api/organizations/:id/set-active
 * Switch active org â€“ only if the calling user is already a member.
 */
export const setActive = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");

    // requireMembership ensures the user belongs to this org
    const organization = await requireMembership(String(req.params.id), req);

    req.user.activeOrganization = organization._id;
    await req.user.save();

    res.json({
      success: true,
      message: `Active organization set to "${organization.name}"`,
      data: {
        organizationId: organization._id,
        organizationName: organization.name,
      },
    });
  },
);

/**
 * GET /api/organizations/:id/smtp-settings
 * Get SMTP settings for an organization.
 */
export const getSmtpSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await Organization.findById(req.params.id).select(
      "smtpSettings",
    );
    if (!org) throw new NotFoundError("Organization");

    // Return settings but mask the password
    const smtp = org.smtpSettings as any;
    res.json({
      success: true,
      data:
        smtp ?
          {
            host: smtp.host || "",
            port: smtp.port ?? 587,
            secure: smtp.secure ?? false,
            user: smtp.user || "",
            pass: smtp.pass ? "••••••••" : "",
            fromName: smtp.fromName || "",
            fromEmail: smtp.fromEmail || "",
          }
        : null,
    });
  },
);

/**
 * PUT /api/organizations/:id/smtp-settings
 * Save SMTP settings for an organization.
 */
export const updateSmtpSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new NotFoundError("Organization");

    const { host, port, secure, user, pass, fromName, fromEmail } = req.body;

    (org as any).smtpSettings = {
      host: host ?? "",
      port: port ?? 587,
      secure: secure ?? false,
      user: user ?? "",
      // Only update password if a real value was provided (not the masked placeholder)
      pass:
        pass && pass !== "••••••••" ?
          pass
        : ((org as any).smtpSettings?.pass ?? ""),
      fromName: fromName ?? "",
      fromEmail: fromEmail ?? "",
    };

    attachUser(org, req);
    await org.save();

    res.json({ success: true, message: "SMTP settings saved" });
  },
);

/**
 * POST /api/organizations/:id/smtp-test
 * Send a test email using the configured SMTP settings.
 */
export const testSmtpSettings = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new NotFoundError("Organization");

    const smtp = (org as any).smtpSettings;
    if (!smtp?.host || !smtp?.user || !smtp?.pass) {
      throw new ValidationError(
        "SMTP settings are incomplete. Please configure host, user and password.",
      );
    }

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure ?? false,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const testTo = req.body.testEmail || smtp.fromEmail || smtp.user;
    try {
      await transporter.sendMail({
        from: `"${smtp.fromName || org.name}" <${smtp.fromEmail || smtp.user}>`,
        to: testTo,
        subject: "HAI Accounting \u2013 SMTP Test",
        html: "<p>This is a test email from <strong>HAI Accounting</strong>. Your SMTP settings are working correctly.</p>",
      });
    } catch (err: any) {
      // Translate to a friendly ValidationError so the client sees a 400 with a clear message
      const msg: string = err?.message || "";
      let friendly = msg;

      if (msg.includes("535") && msg.includes("BadCredentials")) {
        friendly =
          "Gmail rejected the password. You must use a Google App Password (not your regular account password). " +
          "Visit https://myaccount.google.com/apppasswords, generate an App Password for \u201cMail\u201d, and paste it here.";
      } else if (
        msg.includes("535") ||
        msg.includes("Invalid login") ||
        msg.includes("Authentication")
      ) {
        friendly =
          "SMTP authentication failed. Check your username and password. " +
          "For Gmail, use an App Password: https://myaccount.google.com/apppasswords";
      } else if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
        friendly = `Cannot connect to SMTP server. Check host and port. (${msg})`;
      } else if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
        friendly =
          "Connection timed out. Check host, port and firewall settings.";
      } else if (
        msg.includes("certificate") ||
        msg.includes("SSL") ||
        msg.includes("TLS")
      ) {
        friendly =
          'SSL/TLS error. Try toggling the "Use SSL/TLS" switch or changing the port (587 for STARTTLS, 465 for SSL).';
      }

      throw new ValidationError(friendly);
    }

    res.json({ success: true, message: `Test email sent to ${testTo}` });
  },
);

/**
 * POST /api/organizations/:id/send-email
 * Send a vendor statement email using the org's SMTP settings.
 */
export const sendEmail = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await Organization.findById(req.params.id);
    if (!org) throw new NotFoundError("Organization");

    const smtp = (org as any).smtpSettings;
    if (!smtp?.host || !smtp?.user || !smtp?.pass) {
      throw new ValidationError(
        "SMTP is not configured. Please set up your email settings in Settings → Email.",
      );
    }

    const { to, subject, body, vendorName, attachments } = req.body;
    if (!to) throw new ValidationError("Recipient email (to) is required");

    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure ?? false,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const bodyHtml = body ?? "";

    await transporter.sendMail({
      from: `"${smtp.fromName || org.name}" <${smtp.fromEmail || smtp.user}>`,
      to,
      subject: subject || `Statement of Accounts - ${vendorName || "Vendor"}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:13px;color:#333;">${bodyHtml}</div>`,
      attachments: attachments?.map((a: any) => ({
        filename: a.filename,
        path: a.path, // Supports URLs (Cloudinary)
        content: a.content, // Supports Buffer/String
      })),
    });

    res.json({ success: true, message: `Email sent to ${to}` });
  },
);

/**
 * POST /api/organizations/:id/members
 * Add a user (by email or userId) to an org's member list.
 */
export const addMember = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await requireMembership(req.params.id as string, req);
    const { userId } = req.body;
    if (!userId) throw new ValidationError("userId is required");

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError("User");

    const alreadyMember = org.members?.some(
      (m: any) => m.toString() === userId,
    );
    if (alreadyMember) {
      return res.json({ success: true, message: "Already a member" });
    }

    org.members = [...(org.members ?? []), user._id] as any;
    await org.save();
    res.json({ success: true, data: org });
  },
);

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove a member from an org (owner cannot be removed).
 */
export const removeMember = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const org = await requireMembership(req.params.id as string, req);
    const { userId } = req.params;

    if (org.owner?.toString() === userId) {
      throw new ForbiddenError("Cannot remove the owner of an organization");
    }

    org.members = (org.members ?? []).filter(
      (m: any) => m.toString() !== userId,
    ) as any;
    await org.save();
    res.json({ success: true, data: org });
  },
);
