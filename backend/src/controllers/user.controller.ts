import { Response } from "express";
import User from "../models/user.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest } from "../types";
import { NotFoundError } from "../utils/errors";

/**
 * GET /api/users
 */
export const list = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { skip, limit, sort, search } = req.pagination || {
      skip: 0,
      limit: 20,
      sort: { createdAt: -1 as const },
    };

    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-firebaseUid")
        .sort(sort)
        .skip(skip || 0)
        .limit(limit || 20),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: req.pagination?.page || 1,
        limit: limit || 20,
        pages: Math.ceil(total / (limit || 20)),
      },
    });
  },
);

/**
 * GET /api/users/:id
 */
export const getById = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const user = await User.findById(req.params.id).select("-firebaseUid");
    if (!user) {
      throw new NotFoundError("User");
    }
    res.json({ success: true, data: user });
  },
);

/**
 * PUT /api/users/:id/roles
 * Assign roles to a user. Requires System Manager role.
 */
export const assignRoles = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { roles } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      throw new NotFoundError("User");
    }

    user.roles = roles;
    await user.save();

    res.json({
      success: true,
      message: `Roles updated for ${user.name || user.email}`,
      data: { id: user._id, roles: user.roles },
    });
  },
);
