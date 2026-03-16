import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as billController from "../controllers/bill.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", billController.getNextNumber);
router.get("/open-purchase-orders", billController.listOpenPurchaseOrders);
router.get("/", billController.list);
router.get("/:id", billController.getOne);
router.post("/", billController.create);
router.patch("/:id", billController.update);
router.delete("/:id", billController.remove);

export default router;
