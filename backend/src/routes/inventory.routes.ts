import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  createAdjustment,
  listAdjustments,
  overview,
  syncItemStock,

} from "../controllers/inventory.controller";

const router = Router();

router.use(authenticate);
router.get("/overview", overview);
router.get("/adjustments", listAdjustments);
router.post("/adjustments", createAdjustment);
router.post("/sync/:id", syncItemStock);


export default router;
