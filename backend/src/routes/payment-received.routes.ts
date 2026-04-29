import { Router } from "express";
import { authenticate } from "../middlewares/auth";
import * as paymentReceivedController from "../controllers/payment-received.controller";

const router = Router();
router.use(authenticate);

router.get("/next-number", paymentReceivedController.getNextNumber);
router.get("/", paymentReceivedController.list);
router.get("/:id", paymentReceivedController.getOne);
router.post("/", paymentReceivedController.create);
router.patch("/:id", paymentReceivedController.update);
router.post("/:id/apply", paymentReceivedController.applyToInvoice);
router.post("/:id/unapply", paymentReceivedController.unapplyFromInvoice);
router.post("/:id/refund", paymentReceivedController.recordRefund);
router.post("/:id/void", paymentReceivedController.voidPayment);
router.delete("/:id", paymentReceivedController.deletePayment);

export default router;
