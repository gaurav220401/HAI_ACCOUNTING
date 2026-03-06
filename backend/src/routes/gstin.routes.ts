import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { getCaptcha, lookupGstin } from "../controllers/gstin.controller";

const router = Router();

router.use(authenticate);

/**
 * GET /api/gstin/captcha
 * Returns a base64 CAPTCHA image + cookie from the GST portal.
 */
router.get("/captcha", getCaptcha);

/**
 * POST /api/gstin/lookup
 * Body: { gstin, captcha, captchaCookie }
 * Validates GSTIN checksum then hits the GST portal for business details.
 */
router.post("/lookup", lookupGstin);

export default router;
