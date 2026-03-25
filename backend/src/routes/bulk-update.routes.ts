import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  searchTransactions,
  executeBulkUpdate,
  getHistory,
} from "../controllers/bulk-update.controller";

const router = Router();
router.use(authenticate);

router.get("/search", searchTransactions);
router.post("/execute", executeBulkUpdate);
router.get("/history", getHistory);

export default router;
