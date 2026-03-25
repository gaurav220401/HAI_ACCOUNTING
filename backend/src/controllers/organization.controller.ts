import { Response } from "express";
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

    // Each org name must be globally unique
    const existing = await Organization.findOne({ name });
    if (existing) {
      throw new ValidationError(`Organization "${name}" already exists`);
    }

    const organization = new Organization({
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
      owner: req.user._id,
      members: [req.user._id],   // creator is automatically the first member
    });

    attachUser(organization, req);
    await organization.save();

    // Set as active org for the creating user if they don't have one yet
    if (!req.user.activeOrganization) {
      req.user.activeOrganization = organization._id;
      await req.user.save();
    }

    // Auto-seed the 13 GST-standard units for every new org — non-fatal
    upsertDefaultUnits(organization._id).catch(() => {});

    res.status(201).json({
      success: true,
      message: `Organization "${name}" created successfully`,
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

    const allowedFields = [
      "name",
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
      "defaultAccounts",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (organization as any)[field] = req.body[field];
      }
    }

    attachUser(organization, req);
    await organization.save();

    res.json({
      success: true,
      message: `Organization "${organization.name}" updated`,
      data: organization,
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
