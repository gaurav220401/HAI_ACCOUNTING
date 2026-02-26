import { Response } from "express";
import Company from "../models/company.model";
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
 * POST /api/companies
 * Create a new company.
 */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      name,
      abbr,
      defaultCurrency,
      country,
      chartOfAccounts,
      domain,
      fiscalYearStart,
      fiscalYearEnd,
    } = req.body;

    // Check for duplicate
    const existing = await Company.findOne({ name });
    if (existing) {
      throw new ValidationError(`Company "${name}" already exists`);
    }

    const company = new Company({
      name,
      abbr,
      defaultCurrency,
      country,
      chartOfAccounts,
      domain,
      fiscalYearStart: new Date(fiscalYearStart),
      fiscalYearEnd: new Date(fiscalYearEnd),
    });

    attachUser(company, req);
    await company.save();

    // Set this company as the user's active company if they don't have one
    if (req.user && !req.user.activeCompany) {
      req.user.activeCompany = company._id;
      await req.user.save();
    }

    res.status(201).json({
      success: true,
      message: `Company "${name}" created successfully`,
      data: company,
    });
  },
);

/**
 * GET /api/companies
 * List all companies.
 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const companies = await Company.find().sort({ name: 1 });
    res.json({ success: true, data: companies });
  },
);

/**
 * GET /api/companies/:id
 */
export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const company = await Company.findById(req.params.id);
    if (!company) {
      throw new NotFoundError("Company");
    }
    res.json({ success: true, data: company });
  },
);

/**
 * PUT /api/companies/:id
 */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const company = await Company.findById(req.params.id);
    if (!company) {
      throw new NotFoundError("Company");
    }

    const allowedFields = [
      "name",
      "abbr",
      "defaultCurrency",
      "country",
      "chartOfAccounts",
      "domain",
      "fiscalYearStart",
      "fiscalYearEnd",
      "defaultAccounts",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "fiscalYearStart" || field === "fiscalYearEnd") {
          (company as any)[field] = new Date(req.body[field]);
        } else {
          (company as any)[field] = req.body[field];
        }
      }
    }

    attachUser(company, req);
    await company.save();

    res.json({
      success: true,
      message: `Company "${company.name}" updated`,
      data: company,
    });
  },
);

/**
 * DELETE /api/companies/:id (soft delete)
 */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const company = await Company.findById(req.params.id);
    if (!company) {
      throw new NotFoundError("Company");
    }

    // Soft delete
    await (company as any).softDelete(req.user?._id?.toString());

    res.json({
      success: true,
      message: `Company "${company.name}" deleted`,
    });
  },
);

/**
 * PUT /api/companies/:id/set-active
 * Set this company as the user's active company.
 */
export const setActive = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const company = await Company.findById(req.params.id);
    if (!company) {
      throw new NotFoundError("Company");
    }

    if (!req.user) {
      throw new ForbiddenError("User not found");
    }

    req.user.activeCompany = company._id;
    await req.user.save();

    res.json({
      success: true,
      message: `Active company set to "${company.name}"`,
      data: { companyId: company._id, companyName: company.name },
    });
  },
);
