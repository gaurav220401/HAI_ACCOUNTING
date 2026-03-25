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
    let dbUser = await User.findOne({ firebaseUid: decoded.uid });
    if (!dbUser) {
      // If a user already exists with the same email/phone (common during dev
      // when firebaseUid changes), reuse that record instead of creating a
      // duplicate that violates unique indexes.
      if (decoded.email) {
        dbUser = await User.findOne({ email: decoded.email.toLowerCase() });
      }
      if (!dbUser && decoded.phone_number) {
        dbUser = await User.findOne({ phone: decoded.phone_number });
      }

      if (dbUser) {
        const signInProvider = decoded.firebase?.sign_in_provider || "password";

        let provider: "email" | "phone" | "google" = "email";
        if (signInProvider === "google.com") provider = "google";
        else if (signInProvider === "phone") provider = "phone";

        if (dbUser.firebaseUid !== decoded.uid) {
          dbUser.firebaseUid = decoded.uid;
          if (!(dbUser as any).provider) {
            (dbUser as any).provider = provider;
          }
          await dbUser.save();
        }
      } else {
      const signInProvider = decoded.firebase?.sign_in_provider || "password";

      let provider: "email" | "phone" | "google" = "email";
      if (signInProvider === "google.com") provider = "google";
      else if (signInProvider === "phone") provider = "phone";

      dbUser = await User.create({
        firebaseUid: decoded.uid,
        name: decoded.name || "",
        email: decoded.email || undefined,
        phone: decoded.phone_number || undefined,
        photoURL: decoded.picture || "",
        provider,
        profileComplete: false,
        roles: [],
        activeOrganization: null,
      });
      }
    }
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
