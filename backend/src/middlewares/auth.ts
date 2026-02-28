import { Response, NextFunction } from "express";
import admin from "../config/firebase";
import User from "../models/user.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest, FirebaseDecodedToken } from "../types";
import { UnauthorizedError, ForbiddenError } from "../utils/errors";

/**
 * Middleware: Verify Firebase ID token from Authorization header.
 * Attaches decoded token + MongoDB user to req.
 */
export const authenticate = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const idToken = authHeader.split("Bearer ")[1];

    let decoded: FirebaseDecodedToken;
    try {
      decoded = (await admin
        .auth()
        .verifyIdToken(idToken)) as FirebaseDecodedToken;
    } catch (err: any) {
      console.error("Token verification failed:", err.message);
      throw new UnauthorizedError("Invalid token");
    }

    req.firebaseUser = decoded;

    // Attach MongoDB user if exists
    const dbUser = await User.findOne({ firebaseUid: decoded.uid });
    req.user = dbUser;

    next();
  },
);

/**
 * Middleware: Require profile to be complete before accessing a route.
 * Must come after authenticate.
 */
export const requireCompleteProfile = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    res.status(401).json({ message: "User not found in database" });
    return;
  }
  if (!req.user.profileComplete) {
    res.status(403).json({
      message: "Profile incomplete",
      code: "PROFILE_INCOMPLETE",
    });
    return;
  }
  next();
};

/**
 * Middleware: Check if user has a specific role.
 * Must come after authenticate.
 */
export const requireRole = (...roles: string[]) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      throw new UnauthorizedError("User not found");
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole && !userRoles.includes("Admin")) {
      throw new ForbiddenError(`Requires one of roles: ${roles.join(", ")}`);
    }

    next();
  };
};

/**
 * Middleware: Check module-level permission (Zoho Books style).
 * authorize(module, action) — e.g. authorize("invoices", "create")
 * Must come after authenticate.
 */
export const authorize = (module: string, action: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError("User not found");
    }

    // Admin bypasses all permission checks
    if (req.user.roles?.includes("Admin")) {
      return next();
    }

    const userRoles = req.user.roles || [];

    if (userRoles.length === 0) {
      throw new ForbiddenError(
        `No roles assigned. Cannot perform ${action} on ${module}`,
      );
    }

    // Import Role model dynamically to avoid circular deps
    const Role = (await import("../models/role.model")).default;

    // Use $elemMatch to properly filter on the permissions sub-array
    const permittedRoles = await Role.find({
      name: { $in: userRoles },
      permissions: {
        $elemMatch: {
          module,
          [action]: true,
        },
      },
    });

    if (permittedRoles.length === 0) {
      throw new ForbiddenError(
        `Permission denied: cannot ${action} on module '${module}'`,
      );
    }

    next();
  };
};
