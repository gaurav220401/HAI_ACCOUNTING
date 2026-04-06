import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  createAdjustment,
  listAdjustments,
  overview,
} from "../controllers/inventory.controller";

const router = Router();

router.use(authenticate);
router.get("/overview", overview);
router.get("/adjustments", listAdjustments);
router.post("/adjustments", createAdjustment);

export default router;
