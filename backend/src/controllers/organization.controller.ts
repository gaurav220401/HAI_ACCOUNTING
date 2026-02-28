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

/**
 * POST /api/organizations
 * Create a new organization.
 */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
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

    // Check for duplicate name
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
    });

    attachUser(organization, req);
    await organization.save();

    // Set as active org for the creating user if they don't have one
    if (req.user && !req.user.activeOrganization) {
      req.user.activeOrganization = organization._id;
      await req.user.save();
    }

    res.status(201).json({
      success: true,
      message: `Organization "${name}" created successfully`,
      data: organization,
    });
  },
);

/**
 * GET /api/organizations
 * List all organizations (admin only in production; open during bootstrap).
 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organizations = await Organization.find().sort({ name: 1 });
    res.json({ success: true, data: organizations });
  },
);

/**
 * GET /api/organizations/:id
 */
export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      throw new NotFoundError("Organization");
    }
    res.json({ success: true, data: organization });
  },
);

/**
 * PUT /api/organizations/:id
 */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      throw new NotFoundError("Organization");
    }

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
 */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      throw new NotFoundError("Organization");
    }

    await (organization as any).softDelete(req.user?._id?.toString());

    res.json({
      success: true,
      message: `Organization "${organization.name}" deleted`,
    });
  },
);

/**
 * PUT /api/organizations/:id/set-active
 * Set this organization as the user's active organization.
 */
export const setActive = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const organization = await Organization.findById(req.params.id);
    if (!organization) {
      throw new NotFoundError("Organization");
    }

    if (!req.user) {
      throw new ForbiddenError("User not found");
    }

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
