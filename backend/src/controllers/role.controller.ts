import { Response } from "express";
import Role from "../models/role.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";
import { NotFoundError, ConflictError } from "../utils/errors";

/**
 * GET /api/roles
 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const roles = await Role.find().sort({ name: 1 });
    res.json({ success: true, data: roles });
  },
);

/**
 * GET /api/roles/:id
 */
export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const role = await Role.findById(req.params.id);
    if (!role) {
      throw new NotFoundError("Role");
    }
    res.json({ success: true, data: role });
  },
);

/**
 * POST /api/roles
 */
export const create = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, permissions } = req.body;

    const existing = await Role.findOne({ name });
    if (existing) {
      throw new ConflictError(`Role "${name}" already exists`);
    }

    const role = await Role.create({
      name,
      description,
      permissions: permissions || [],
      isSystemRole: false,
    });

    res.status(201).json({ success: true, data: role });
  },
);

/**
 * PUT /api/roles/:id
 */
export const update = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const role = await Role.findById(req.params.id);
    if (!role) {
      throw new NotFoundError("Role");
    }

    if (role.isSystemRole) {
      // Only allow updating permissions on system roles, not name/description
      if (req.body.permissions) {
        role.permissions = req.body.permissions;
      }
    } else {
      if (req.body.name) role.name = req.body.name;
      if (req.body.description !== undefined)
        role.description = req.body.description;
      if (req.body.permissions) role.permissions = req.body.permissions;
    }

    await role.save();
    res.json({ success: true, data: role });
  },
);

/**
 * DELETE /api/roles/:id
 */
export const remove = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const role = await Role.findById(req.params.id);
    if (!role) {
      throw new NotFoundError("Role");
    }

    if (role.isSystemRole) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete system roles",
      });
    }

    await Role.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `Role "${role.name}" deleted` });
  },
);
