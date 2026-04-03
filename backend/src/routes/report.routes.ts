import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  balanceSheet,
  controlReconciliation,
  profitAndLoss,
  trialBalance,
} from "../controllers/report.controller";

const router = Router();
router.use(authenticate);

router.get("/trial-balance", trialBalance);
router.get("/profit-loss", profitAndLoss);
router.get("/balance-sheet", balanceSheet);
router.get("/control-reconciliation", controlReconciliation);

export default router;
