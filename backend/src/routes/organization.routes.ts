import { Router } from "express";
import * as organizationController from "../controllers/organization.controller";
import { authenticate, requireRole } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
} from "../validators";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  validate(createOrganizationSchema),
  organizationController.create,
);
router.get("/", organizationController.list);
router.get("/:id", organizationController.getById);
router.put(
  "/:id",
  validate(updateOrganizationSchema),
  organizationController.update,
);
router.delete("/:id", organizationController.remove);
router.put("/:id/set-active", organizationController.setActive);

// ── SMTP Settings ──
router.get("/:id/smtp-settings", organizationController.getSmtpSettings);
router.put("/:id/smtp-settings", organizationController.updateSmtpSettings);
router.post("/:id/smtp-test", organizationController.testSmtpSettings);

// ── Member management ────────────────────────────────────────────────
router.post("/:id/members", organizationController.addMember);
router.delete("/:id/members/:userId", organizationController.removeMember);

export default router;
