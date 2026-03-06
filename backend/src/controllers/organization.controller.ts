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
 * POST /api/organizations/:id/members
 * Add a user (by email) as a member of the org.
 * Only existing members may invite others.
 */
export const addMember = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");

    const organization = await requireMembership(String(req.params.id), req);
    const { email } = req.body;
    if (!email) throw new ValidationError("email is required");

    const invitee = await User.findOne({ email: email.toLowerCase().trim() });
    if (!invitee) throw new NotFoundError("User with that email");

    const alreadyMember = organization.members.some(
      (m) => m.toString() === invitee._id.toString(),
    );
    if (alreadyMember) {
      return res.json({ success: true, message: "User is already a member" });
    }

    organization.members.push(invitee._id);
    await organization.save();

    res.json({
      success: true,
      message: `${invitee.name || invitee.email} added to organization`,
    });
  },
);

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove a member. Only the owner may do this (cannot remove themselves if owner).
 */
export const removeMember = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) throw new ForbiddenError("Not authenticated");

    const organization = await Organization.findById(String(req.params.id));
    if (!organization) throw new NotFoundError("Organization");

    const isOwner = organization.owner?.toString() === req.user._id.toString();
    const isAdmin = req.user.roles?.includes("Admin");
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError("Only the organization owner can remove members");
    }

    const targetId = String(req.params.userId);
    if (organization.owner?.toString() === targetId) {
      throw new ForbiddenError("Cannot remove the owner from the organization");
    }

    organization.members = organization.members.filter(
      (m) => m.toString() !== targetId,
    );
    await organization.save();

    res.json({ success: true, message: "Member removed" });
  },

);
