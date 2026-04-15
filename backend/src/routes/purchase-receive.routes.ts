import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import {
  create,
  getFromPurchaseOrder,
  getNextNumber,
  getOne,
  list,
} from "../controllers/purchase-receive.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", getNextNumber);
router.get("/", list);
router.get("/from-purchase-order", getFromPurchaseOrder);
router.get("/:id", getOne);
router.post("/", create);

export default router;
