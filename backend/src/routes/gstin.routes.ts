import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import { lookupGstin } from "../controllers/gstin.controller";

const router = Router();

// GSTIN lookup is authenticated so only org users can fetch
router.use(authenticate);

/**
 * GET /api/gstin/:gstin
 * Returns business details for the given GSTIN from the GST portal.
 */
router.get("/:gstin", lookupGstin);

export default router;
