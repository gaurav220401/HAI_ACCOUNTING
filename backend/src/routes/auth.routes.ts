import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  registerSchema,
  completeProfileSchema,
  updateProfileSchema,
} from "../validators";

const router = Router();

// All auth routes require a valid Firebase token
router.use(authenticate);

router.post("/register", validate(registerSchema), authController.register);
router.get("/me", authController.getProfile);
router.put(
  "/complete-profile",
  validate(completeProfileSchema),
  authController.completeProfile,
);
router.put(
  "/profile",
  validate(updateProfileSchema),
  authController.updateProfile,
);

export default router;
