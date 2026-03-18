import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as paymentMadeController from "../controllers/payment-made.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", paymentMadeController.getNextNumber);
router.get("/", paymentMadeController.list);
router.get("/:id", paymentMadeController.getOne);
router.post("/", paymentMadeController.create);
router.patch("/:id", paymentMadeController.update);
router.post("/:id/apply", paymentMadeController.applyToBill);
router.post("/:id/unapply", paymentMadeController.unapplyFromBill);
router.post("/:id/refund", paymentMadeController.recordRefund);
router.post("/:id/void", paymentMadeController.voidPayment);

export default router;
