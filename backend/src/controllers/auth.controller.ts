import { Response } from "express";
import User from "../models/user.model";
import asyncHandler from "../utils/asyncHandler";
import { AuthenticatedRequest, IUser, IUserResponse } from "../types";

/**
 * POST /api/auth/register
 * Called after successful Firebase auth. Creates or returns MongoDB user.
 */
export const register = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const {
      uid,
      email,
      phone_number,
      picture,
      name: firebaseName,
    } = req.firebaseUser!;
    const { name, dob, gender } = req.body;

    // Determine provider from Firebase token
    const signInProvider =
      req.firebaseUser!.firebase?.sign_in_provider || "password";

    let provider: "email" | "phone" | "google" = "email";
    if (signInProvider === "google.com") provider = "google";
    else if (signInProvider === "phone") provider = "phone";

    // Check if user already exists
    let user = await User.findOne({ firebaseUid: uid });

    if (user) {
      // If profile incomplete and new data arrived, update it
      if (!user.profileComplete && (name || dob || gender)) {
        if (name) user.name = name.trim();
        if (dob) user.dob = new Date(dob);
        if (gender) user.gender = gender;
        user.profileComplete = !!(user.name && user.dob && user.gender);
        await user.save();
      }
      return res.json({
        success: true,
        user: formatUser(user),
        isNew: false,
      });
    }

    // Build new user object
    const userData: any = {
      firebaseUid: uid,
      provider,
      photoURL: picture || "",
    };

    if (email) userData.email = email;
    if (phone_number) userData.phone = phone_number;

    userData.name = name || firebaseName || "";

    if (dob) userData.dob = new Date(dob);
    if (gender) userData.gender = gender;

    if (provider === "google") {
      userData.name = name || firebaseName || "";
      userData.photoURL = picture || "";
    }

    userData.profileComplete = !!(userData.name && dob && gender);

    // First user gets System Manager role
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      userData.roles = ["System Manager"];
    }

    user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      { $setOnInsert: userData },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (!user) {
      user = await User.findOne({ firebaseUid: uid });
    }

    if (!user) {
      throw new Error("Failed to create or load user");
    }

    res.status(201).json({
      success: true,
      user: formatUser(user),
      isNew: true,
    });
  },
);

/**
 * GET /api/auth/me
 */
export const getProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(404).json({
        success: false,
        message: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    res.json({ success: true, user: formatUser(req.user) });
  },
);

/**
 * PUT /api/auth/complete-profile
 */
export const completeProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { uid } = req.firebaseUser!;
    const { name, dob, gender, phone } = req.body;

    if (!name || !dob || !gender) {
      return res.status(400).json({
        success: false,
        message: "name, dob and gender are required to complete profile",
      });
    }

    const updateData: any = {
      name: name.trim(),
      dob: new Date(dob),
      gender,
      profileComplete: true,
    };

    if (phone) updateData.phone = phone;

    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      const { email, phone_number, picture } = req.firebaseUser!;
      const signInProvider =
        req.firebaseUser!.firebase?.sign_in_provider || "password";

      let provider: "email" | "phone" | "google" = "email";
      if (signInProvider === "google.com") provider = "google";
      else if (signInProvider === "phone") provider = "phone";

      user = await User.create({
        firebaseUid: uid,
        email: email || undefined,
        phone: phone_number || phone || undefined,
        photoURL: picture || "",
        provider,
        ...updateData,
      });
    } else {
      Object.assign(user, updateData);
      await user.save();
    }

    res.json({ success: true, user: formatUser(user) });
  },
);

/**
 * PUT /api/auth/profile
 */
export const updateProfile = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const allowedFields = [
      "name",
      "dob",
      "gender",
      "phone",
      "photoURL",
    ] as const;
    const updates: any = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] =
          field === "dob" ? new Date(req.body[field]) : req.body[field];
      }
    }

    const willBeComplete = !!(
      (updates.name || req.user.name) &&
      (updates.dob || req.user.dob) &&
      (updates.gender || req.user.gender)
    );
    updates.profileComplete = willBeComplete;

    Object.assign(req.user, updates);
    await req.user.save();

    res.json({ success: true, user: formatUser(req.user) });
  },
);

// ─── Helpers ────────────────────────────────────────────────────────────

function formatUser(user: IUser): IUserResponse {
  return {
    id: user._id,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    dob: user.dob,
    gender: user.gender,
    photoURL: user.photoURL,
    provider: user.provider,
    profileComplete: user.profileComplete,
    roles: user.roles || [],
    activeOrganization: user.activeOrganization || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
